import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface PgConfig {
    host?: string; port?: number; user?: string; password?: string; database?: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    private online = false;
    private readonly logger = new Logger(DatabaseService.name);
    private schemaEnsured = false;
    // Lightweight in-memory metrics (reset each process) for observing fallback path usage during development.
    // Exposed via getter so tests can assert counts without coupling to internal shape.
    private readonly metrics = {
        minimalSchemaBoots: 0,
        fullSchemaEnsures: 0,
    };

    constructor(private readonly config: AppConfigService) { }

    async onModuleInit() {
        if (this.config.skipDb) {
            this.logger.warn('SKIP_DB flag set - skipping database initialization');
            this.online = false;
            return;
        }
        try {
            this.pool = new Pool({
                host: this.config.dbHost,
                port: this.config.dbPort,
                user: this.config.dbUser,
                password: this.config.dbPassword,
                database: this.config.dbName,
            });
            // Try a simple query to confirm connectivity
            await this.pool.query('SELECT 1');
            if (this.config.autoInitDb) {
                // Build schema before marking DB as online to prevent race with other services' onModuleInit hooks.
                try {
                    await this.ensureSchema();
                } catch (e) {
                    // If ensureSchema fails we keep online=false so callers treat DB as offline gracefully.
                    this.logger.warn(`ensureSchema failed; keeping DB offline: ${(e as Error).message}`);
                    throw e;
                }
            }
            this.online = true;
        } catch (err) {
            this.online = false;
            this.logger.warn(`Database offline (non-fatal for tests): ${(err as Error).message}`);
            // eslint-disable-next-line no-console
            console.error('[database.init] failure stack:', err);
        }
    }

    async onModuleDestroy() {
        if (this.pool) {
            try { await this.pool.end(); } catch { /* ignore */ }
        }
    }

    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>> {
        if (!this.online) {
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as unknown as QueryResult<T>;
        }
        return this.pool.query<T>(text, params);
    }

    async getClient(): Promise<PoolClient> { return this.pool.connect(); }

    isOnline() { return this.online; }

    private async ensureSchema() {
        if (this.schemaEnsured) return;
        if (process.env.E2E_MINIMAL_DB === 'true') {
            const startMini = Date.now();
            this.logger.log('E2E_MINIMAL_DB enabled - creating minimal schema');
            this.metrics.minimalSchemaBoots++;
            const exec = async (sql: string) => {
                try {
                    await this.pool.query(sql);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('[minimal schema] failed SQL:', sql, '\nError:', e);
                    throw e;
                }
            };
            // Use advisory lock to avoid race conditions when multiple test workers bootstrap simultaneously.
            // One worker will rebuild the schema if missing; others will skip destructive drop and only ensure seed data.
            let locked = false;
            try {
                await exec('SELECT pg_advisory_lock(4815162342)');
                locked = true;
            } catch (e) {
                this.logger.warn('Failed to acquire minimal schema advisory lock: ' + (e as Error).message);
            }
            try {
                // Determine if core tables already exist (created by a previous worker).
                const coreRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.projects') as exists");
                const coreExists = !!coreRes.rows[0].exists;
                // Guard table indicates a prior worker already performed a reset this test run.
                const guardRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.schema_reset_guard') as exists");
                const guardExists = !!guardRes.rows[0].exists;
                const shouldDrop = !coreExists && !guardExists; // only drop when truly absent
                if (shouldDrop) {
                    this.logger.log('Minimal schema core tables missing - performing fresh create');
                    await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto');
                    // Required for vector(768) column on kb.chunks when embeddings are enabled
                    await exec('CREATE EXTENSION IF NOT EXISTS vector');
                    await exec('CREATE SCHEMA IF NOT EXISTS kb');
                    await exec('CREATE TABLE kb.orgs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE TABLE kb.projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name))');
                    // Align minimal documents table columns with those selected in service queries (source_url, mime_type, etc.)
                    await exec(`CREATE TABLE kb.documents (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        org_id UUID NULL,
                        project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL,
                        source_url TEXT,
                        filename TEXT,
                        mime_type TEXT,
                        content TEXT,
                        content_hash TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec('CREATE UNIQUE INDEX idx_documents_project_hash ON kb.documents(project_id, content_hash)');
                    // Minimal chunks table – now includes optional columns used by search so that
                    // specs exercising lexical/vector/hybrid search can run without forcing full schema.
                    await exec(`CREATE TABLE kb.chunks (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
                        chunk_index INT NOT NULL,
                        text TEXT,
                        embedding vector(768),
                        tsv tsvector,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec('CREATE INDEX idx_chunks_doc ON kb.chunks(document_id)');
                    await exec('CREATE INDEX idx_chunks_tsv ON kb.chunks USING GIN (tsv)');
                    await exec('CREATE INDEX idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)');
                    await exec('CREATE UNIQUE INDEX idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index)');
                    // tsv trigger
                    await exec(`DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'kb' AND p.proname = 'update_tsv' AND p.pronargs = 0) THEN
                        CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $func$ BEGIN NEW.tsv := to_tsvector('simple', NEW.text); RETURN NEW; END $func$;
                    END IF; END $do$;`);
                    await exec('DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks');
                    await exec(`CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv()`);
                    // Minimal chat tables (subset of columns needed for basic conversation CRUD and listing)
                    await exec(`CREATE TABLE kb.chat_conversations (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        title TEXT NOT NULL,
                        owner_user_id UUID NULL,
                        is_private BOOLEAN NOT NULL DEFAULT true,
                        org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
                        project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec(`CREATE TABLE kb.chat_messages (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
                        role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
                        content TEXT NOT NULL,
                        citations JSONB NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    // Create guard table to signal reset completed for other workers.
                    await exec('CREATE TABLE IF NOT EXISTS kb.schema_reset_guard(id INT PRIMARY KEY DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                } else {
                    if (process.env.FORCE_E2E_SCHEMA_RESET === 'true') {
                        this.logger.warn('FORCE_E2E_SCHEMA_RESET ignored in parallel run (schema already present)');
                    }
                    this.logger.log('Minimal schema already present - skipping destructive rebuild');
                }
                // Ensure documents table has content_hash + index if minimal schema pre-dated this column
                await exec(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS content_hash TEXT`);
                await exec(`DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relname = 'idx_documents_project_hash' AND n.nspname = 'kb'
                    ) THEN
                        EXECUTE 'CREATE UNIQUE INDEX idx_documents_project_hash ON kb.documents(project_id, content_hash)';
                    END IF; END $$;`);
                // Always ensure chat tables exist (idempotent upgrade if minimal schema created before chat tables were added)
                await exec(`CREATE TABLE IF NOT EXISTS kb.chat_conversations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    title TEXT NOT NULL,
                    owner_user_id UUID NULL,
                    is_private BOOLEAN NOT NULL DEFAULT true,
                    org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
                    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                await exec(`CREATE TABLE IF NOT EXISTS kb.chat_messages (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
                    content TEXT NOT NULL,
                    citations JSONB NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                // Seed default org/project using upserts to avoid race conditions across parallel workers.
                await exec(`WITH ins AS (
    INSERT INTO kb.orgs(name) VALUES('Default Org')
    ON CONFLICT (name) DO NOTHING
    RETURNING id
)
SELECT id FROM ins UNION ALL SELECT id FROM kb.orgs WHERE name='Default Org' LIMIT 1;`);
                await exec(`WITH org AS (SELECT id FROM kb.orgs WHERE name='Default Org' LIMIT 1)
INSERT INTO kb.projects(org_id, name)
SELECT org.id, 'Default Project' FROM org
ON CONFLICT DO NOTHING;`);
            } finally {
                if (locked) {
                    try { await exec('SELECT pg_advisory_unlock(4815162342)'); } catch {/* ignore */ }
                }
            }
            const msMini = Date.now() - startMini;
            this.logger.log(`Minimal schema ensured in ${msMini}ms`);
            this.schemaEnsured = true;
            return; // Skip full schema
        }
        // Minimal schema needed for documents listing. (Ingestion pipeline will manage full schema elsewhere.)
        const start = Date.now();
        this.logger.log('Ensuring database schema (idempotent)...');
        // Serialize full schema ensure across workers (different lock id from minimal path)
        await this.pool.query('SELECT pg_advisory_lock(4815162343)');
        let locked = true;
        try {
            this.metrics.fullSchemaEnsures++;
            // Extensions & schema
            await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
            await this.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
            await this.pool.query('CREATE SCHEMA IF NOT EXISTS kb');

            // Organizations table (simple for now)
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.orgs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_orgs_name ON kb.orgs(LOWER(name));`);

            // Projects table (belongs to org)
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        `);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name));');
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_projects_org ON kb.projects(org_id);`);

            // Documents table (base)
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                -- Legacy org_id retained for backward compatibility (will be synced from project)
                org_id UUID NULL,
                project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL,
                source_url TEXT,
                filename TEXT,
                mime_type TEXT,
                content TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);

            // Backfill created_at/updated_at if missing (for legacy installs)
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS org_id UUID;`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS project_id UUID;`);
            // If project_id exists but is null and there is exactly one project, backfill it
            await this.pool.query(`
            UPDATE kb.documents d
            SET project_id = p.id
            FROM (SELECT id FROM kb.projects LIMIT 1) p
            WHERE d.project_id IS NULL AND p.id IS NOT NULL;`);

            // Chunks table (ensure base columns including tsv before indexes)
            await this.pool.query(`
                    CREATE TABLE IF NOT EXISTS kb.chunks (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
                        chunk_index INT NOT NULL,
                        text TEXT NOT NULL,
                        embedding vector(768),
                        tsv tsvector,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    );`);
            // Column backfills BEFORE index creation so GIN index on tsv never errors (42703) on legacy tables.
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS embedding vector(768);`);
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS tsv tsvector;`);
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);

            // Indexes (after ensuring columns)
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON kb.chunks USING GIN (tsv);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`);
            await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index);`);

            // Content hash for deduplication
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS content_hash TEXT;`);
            await this.pool.query(`UPDATE kb.documents SET content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex') WHERE content_hash IS NULL;`);
            await this.pool.query(`
                    WITH ranked AS (
                        SELECT id, content_hash,
                                     row_number() OVER (PARTITION BY content_hash ORDER BY created_at ASC, id ASC) AS rn
                        FROM kb.documents
                        WHERE content_hash IS NOT NULL
                    )
                    DELETE FROM kb.documents d
                    USING ranked r
                    WHERE d.id = r.id AND r.rn > 1;`);
            // Replace global unique content_hash with project-scoped uniqueness allowing identical documents in different projects
            await this.pool.query(`DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = 'idx_documents_content_hash' AND n.nspname = 'kb'
            ) THEN
                DROP INDEX IF EXISTS kb.idx_documents_content_hash;
            END IF;
        END $$;`);
            await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_hash ON kb.documents(project_id, content_hash);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_org ON kb.documents(org_id);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_project ON kb.documents(project_id);`);

            // Sync org_id from project_id before insert/update to keep backward compatibility
            await this.pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_sync_org'
                ) THEN
                    CREATE OR REPLACE FUNCTION kb.sync_document_org() RETURNS trigger LANGUAGE plpgsql AS $func$
                    BEGIN
                        IF NEW.project_id IS NOT NULL THEN
                            NEW.org_id := (SELECT org_id FROM kb.projects WHERE id = NEW.project_id);
                        END IF;
                        RETURN NEW;
                    END
                    $func$;
                    CREATE TRIGGER trg_documents_sync_org BEFORE INSERT OR UPDATE ON kb.documents
                        FOR EACH ROW EXECUTE FUNCTION kb.sync_document_org();
                END IF;
            END $$;`);

            // If all documents have project_id populated, enforce NOT NULL (safe idempotent)
            await this.pool.query(`
            DO $$
            BEGIN
                IF (SELECT COUNT(*) FROM kb.documents WHERE project_id IS NULL) = 0 THEN
                    BEGIN
                        ALTER TABLE kb.documents ALTER COLUMN project_id SET NOT NULL;
                    EXCEPTION WHEN others THEN
                        -- ignore
                    END;
                END IF;
            END $$;`);

            // updated_at trigger
            await this.pool.query(`
                    CREATE OR REPLACE FUNCTION kb.touch_updated_at()
                    RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN
                        NEW.updated_at := now();
                        RETURN NEW;
                    END$$;`);
            await this.pool.query(`DROP TRIGGER IF EXISTS trg_documents_touch ON kb.documents;`);
            await this.pool.query(`
                    CREATE TRIGGER trg_documents_touch BEFORE UPDATE ON kb.documents
                    FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();`);

            // update_tsv trigger function (only create if missing)
            await this.pool.query(`
                    DO $do$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_proc p
                            JOIN pg_namespace n ON n.oid = p.pronamespace
                            WHERE n.nspname = 'kb' AND p.proname = 'update_tsv' AND p.pronargs = 0
                        ) THEN
                            CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $func$
                            BEGIN
                                NEW.tsv := to_tsvector('simple', NEW.text);
                                RETURN NEW;
                            END
                            $func$;
                        END IF;
                    END
                    $do$;`);
            await this.pool.query(`DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks;`);
            await this.pool.query(`
                    CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks
                    FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();`);

            // Chat schema (conversations + messages) and settings table (used for chat prompts)
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.chat_conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title TEXT NOT NULL,
                owner_user_id UUID NULL,
                is_private BOOLEAN NOT NULL DEFAULT true,
                org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
                project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
                content TEXT NOT NULL,
                citations JSONB NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON kb.chat_conversations(owner_user_id, updated_at DESC);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_org_proj ON kb.chat_conversations(org_id, project_id, updated_at DESC);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON kb.chat_messages(conversation_id, created_at ASC);`);

            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.settings (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_settings_key ON kb.settings(key);`);
            await this.pool.query(`DROP TRIGGER IF EXISTS trg_settings_touch ON kb.settings;`);
            await this.pool.query(`
            CREATE TRIGGER trg_settings_touch BEFORE UPDATE ON kb.settings
            FOR EACH ROW EXECUTE FUNCTION kb.touch_updated_at();`);

            // Seed default org/project via upsert (race-safe)
            await this.pool.query(`WITH ins AS (
  INSERT INTO kb.orgs(name) VALUES('Default Org')
  ON CONFLICT (name) DO NOTHING
  RETURNING id
)
SELECT id FROM ins UNION ALL SELECT id FROM kb.orgs WHERE name='Default Org' LIMIT 1;`);
            await this.pool.query(`WITH org AS (SELECT id FROM kb.orgs WHERE name='Default Org' LIMIT 1)
INSERT INTO kb.projects(org_id, name)
SELECT org.id, 'Default Project' FROM org
ON CONFLICT DO NOTHING;`);

            const ms = Date.now() - start;
            this.logger.log(`Schema ensured in ${ms}ms (orgs/projects/documents updated)`);
            this.schemaEnsured = true;
        } finally {
            if (locked) {
                try { await this.pool.query('SELECT pg_advisory_unlock(4815162343)'); } catch {/* ignore */ }
            }
        }
    }

    /** Return shallow copy of internal metrics (primarily for tests / debug). */
    getMetrics() { return { ...this.metrics }; }
}
