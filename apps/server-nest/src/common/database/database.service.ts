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
                if (!shouldDrop) {
                    // Re-run of minimal schema within same process: soft reset mutable tables for deterministic tests.
                    try {
                        await exec('TRUNCATE core.user_emails RESTART IDENTITY CASCADE');
                    } catch {/* ignore if table missing */ }
                    try {
                        await exec('TRUNCATE core.user_profiles RESTART IDENTITY CASCADE');
                    } catch {/* ignore */ }
                }
                if (shouldDrop) {
                    this.logger.log('Minimal schema core tables missing - performing fresh create');
                    await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto');
                    // Required for vector(768) column on kb.chunks when embeddings are enabled
                    await exec('CREATE EXTENSION IF NOT EXISTS vector');
                    await exec('CREATE SCHEMA IF NOT EXISTS kb');
                    await exec('CREATE TABLE kb.orgs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE TABLE kb.projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name))');
                    // Ensure core schema exists
                    await exec('CREATE SCHEMA IF NOT EXISTS core');
                    // Core user profile table (internal canonical user id = subject_id)
                    await exec(`CREATE TABLE core.user_profiles (
                        subject_id UUID PRIMARY KEY,
                        first_name TEXT NULL,
                        last_name TEXT NULL,
                        display_name TEXT NULL,
                        phone_e164 TEXT NULL,
                        avatar_object_key TEXT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    // Alternative / secondary email addresses per user (unique per subject)
                    await exec(`CREATE TABLE core.user_emails (
                        subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                        email TEXT NOT NULL,
                        verified BOOLEAN NOT NULL DEFAULT false,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        PRIMARY KEY(subject_id, email)
                    )`);
                    // Force-drop any pre-existing legacy membership tables (could be left from failed prior run) to guarantee fresh schema with subject_id
                    await exec('DROP TABLE IF EXISTS kb.organization_memberships CASCADE');
                    await exec('DROP TABLE IF EXISTS kb.project_memberships CASCADE');
                    // Memberships reference subject_id (UUID)
                    await exec(`CREATE TABLE kb.organization_memberships (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                        subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                        role TEXT NOT NULL CHECK (role IN ('org_admin')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    // Debug: log columns right after creation (should include subject_id)
                    try {
                        const colDebug = await this.pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='kb' AND table_name='organization_memberships' ORDER BY ordinal_position");
                        this.logger.log('[debug] org_memberships (fresh create) columns: ' + colDebug.rows.map(r => r.column_name).join(','));
                    } catch {/* ignore */ }
                    // Defer index creation until after full minimal path build; avoid early 42703 race.
                    // We'll create the unique index later in the upgrade/idempotent section once the table is unquestionably present.
                    await exec(`CREATE TABLE kb.project_memberships (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                        role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec('CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships(project_id, subject_id)');
                    // Invites table (minimal fields for lifecycle tests)
                    await exec(`CREATE TABLE kb.invites (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                        project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        email TEXT NOT NULL,
                        role TEXT NOT NULL CHECK (role IN ('org_admin','project_admin','project_user')),
                        token TEXT NOT NULL UNIQUE,
                        status TEXT NOT NULL DEFAULT 'pending',
                        expires_at TIMESTAMPTZ NULL,
                        accepted_at TIMESTAMPTZ NULL,
                        revoked_at TIMESTAMPTZ NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec('CREATE INDEX idx_invites_token ON kb.invites(token)');
                    // Retrofit / enforce ON DELETE CASCADE for projects.org_id (older schemas may differ)
                    await exec(`DO $$ BEGIN
                    BEGIN
                        ALTER TABLE kb.projects DROP CONSTRAINT IF EXISTS projects_org_id_fkey;
                        ALTER TABLE kb.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;
                    EXCEPTION WHEN others THEN END;
                    END $$;`);
                    // Align minimal documents table columns with those selected in service queries (source_url, mime_type, etc.)
                    await exec(`CREATE TABLE kb.documents (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        org_id UUID NULL,
                        project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
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
                        owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
                        is_private BOOLEAN NOT NULL DEFAULT true,
                        org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
                        project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
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
                    owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
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
                // Ensure membership & invites tables exist in case minimal schema was created before auth model migration
                // Ensure core schema namespace exists and user_profiles table
                await exec('CREATE SCHEMA IF NOT EXISTS core');
                await exec(`CREATE TABLE IF NOT EXISTS core.user_profiles (
                    subject_id UUID PRIMARY KEY,
                    first_name TEXT NULL,
                    last_name TEXT NULL,
                    display_name TEXT NULL,
                    phone_e164 TEXT NULL,
                    avatar_object_key TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                await exec(`CREATE TABLE IF NOT EXISTS core.user_emails (
                    subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                    email TEXT NOT NULL,
                    verified BOOLEAN NOT NULL DEFAULT false,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY(subject_id, email)
                )`);
                // Hard reset membership tables to guarantee presence of subject_id column (safe under advisory lock and minimal test data)
                await exec('DROP TABLE IF EXISTS kb.organization_memberships CASCADE');
                await exec('DROP TABLE IF EXISTS kb.project_memberships CASCADE');
                // Legacy upgrade: drop old membership tables using user_id and rename chat column if still present
                await exec(`DO $$ BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='organization_memberships' AND column_name='user_id'
                    ) THEN
                        BEGIN
                            DROP TABLE kb.organization_memberships CASCADE;
                        EXCEPTION WHEN others THEN END;
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='project_memberships' AND column_name='user_id'
                    ) THEN
                        BEGIN
                            DROP TABLE kb.project_memberships CASCADE;
                        EXCEPTION WHEN others THEN END;
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='chat_conversations' AND column_name='owner_user_id'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='chat_conversations' AND column_name='owner_subject_id'
                    ) THEN
                        BEGIN
                            ALTER TABLE kb.chat_conversations RENAME COLUMN owner_user_id TO owner_subject_id;
                        EXCEPTION WHEN others THEN END;
                    END IF;
                END $$;`);
                // Secondary safety net: if subject_id still missing (drop may have failed silently), force drop now (raise errors visibly)
                await exec(`DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='organization_memberships' AND column_name='subject_id'
                    ) AND EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema='kb' AND table_name='organization_memberships'
                    ) THEN
                        EXECUTE 'DROP TABLE kb.organization_memberships CASCADE';
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='project_memberships' AND column_name='subject_id'
                    ) AND EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema='kb' AND table_name='project_memberships'
                    ) THEN
                        EXECUTE 'DROP TABLE kb.project_memberships CASCADE';
                    END IF;
                END $$;`);
                await exec(`CREATE TABLE IF NOT EXISTS kb.organization_memberships (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                    subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('org_admin')),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                // Fallback for legacy table missing subject_id (add column + FK instead of relying solely on drop path)
                await exec(`ALTER TABLE kb.organization_memberships ADD COLUMN IF NOT EXISTS subject_id UUID`);
                await exec(`DO $$ BEGIN
                    BEGIN
                        ALTER TABLE kb.organization_memberships ADD CONSTRAINT organization_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;
                    EXCEPTION WHEN others THEN END;
                END $$;`);
                // Removed org membership unique index creation in minimal schema to avoid failing when subject_id column isn't yet visible.
                await exec(`CREATE TABLE IF NOT EXISTS kb.project_memberships (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                    subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                await exec('ALTER TABLE kb.project_memberships ADD COLUMN IF NOT EXISTS subject_id UUID');
                await exec(`DO $$ BEGIN
                    BEGIN
                        ALTER TABLE kb.project_memberships ADD CONSTRAINT project_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;
                    EXCEPTION WHEN others THEN END;
                END $$;`);
                await exec(`DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='project_memberships' AND column_name='subject_id'
                    ) THEN
                        BEGIN
                            DROP TABLE IF EXISTS kb.project_memberships CASCADE;
                            CREATE TABLE kb.project_memberships (
                                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                                subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                                role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
                                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                            );
                        EXCEPTION WHEN others THEN END;
                    END IF;
                    BEGIN
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_project_membership_unique ON kb.project_memberships(project_id, subject_id);
                    EXCEPTION WHEN others THEN END;
                END $$;`);
                await exec(`CREATE TABLE IF NOT EXISTS kb.invites (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                    project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                    email TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('org_admin','project_admin','project_user')),
                    token TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL DEFAULT 'pending',
                    expires_at TIMESTAMPTZ NULL,
                    accepted_at TIMESTAMPTZ NULL,
                    revoked_at TIMESTAMPTZ NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                await exec('CREATE INDEX IF NOT EXISTS idx_invites_token ON kb.invites(token)');
                /* demo seed removed */
                // Reintroduce unique index for organization memberships so ON CONFLICT(org_id,subject_id) in service code works.
                // Clean up any accidental duplicates first (keep lowest ctid / oldest row) then create index idempotently.
                await exec(`DO $$ BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='kb' AND table_name='organization_memberships' AND column_name='subject_id'
                    ) THEN
                        -- Remove duplicates prior to unique index creation
                        DELETE FROM kb.organization_memberships a
                        USING kb.organization_memberships b
                        WHERE a.org_id = b.org_id AND a.subject_id = b.subject_id AND a.ctid > b.ctid;
                        BEGIN
                            CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON kb.organization_memberships(org_id, subject_id);
                        EXCEPTION WHEN others THEN END;
                    END IF;
                END $$;`);
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
            // Ensure org -> projects FK uses ON DELETE CASCADE (retrofit legacy installs)
            await this.pool.query(`DO $$ BEGIN
            BEGIN
                ALTER TABLE kb.projects DROP CONSTRAINT IF EXISTS projects_org_id_fkey;
                ALTER TABLE kb.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;
            EXCEPTION WHEN others THEN END;
            END $$;`);

            // Documents table (base)
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS kb.documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                -- Legacy org_id retained for backward compatibility (will be synced from project)
                org_id UUID NULL,
                project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
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
            // Authorization tables (idempotent for repeated migrations)
            // Core user profiles (idempotent). Full schema path.
            await this.pool.query('CREATE SCHEMA IF NOT EXISTS core');
            await this.pool.query(`CREATE TABLE IF NOT EXISTS core.user_profiles (
                subject_id UUID PRIMARY KEY,
                first_name TEXT NULL,
                last_name TEXT NULL,
                display_name TEXT NULL,
                phone_e164 TEXT NULL,
                avatar_object_key TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS core.user_emails (
                subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                verified BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY(subject_id, email)
            );`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.organization_memberships (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('org_admin')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            // Ensure uniqueness on (org_id, subject_id) so service layer ON CONFLICT clause functions.
            await this.pool.query(`DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema='kb' AND table_name='organization_memberships' AND column_name='subject_id'
                ) THEN
                    -- Remove duplicates prior to unique index creation (keep earliest)
                    DELETE FROM kb.organization_memberships a
                    USING kb.organization_memberships b
                    WHERE a.org_id = b.org_id AND a.subject_id = b.subject_id AND a.ctid > b.ctid;
                    BEGIN
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON kb.organization_memberships(org_id, subject_id);
                    EXCEPTION WHEN others THEN END;
                END IF;
            END $$;`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.project_memberships (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_membership_unique ON kb.project_memberships(project_id, subject_id);');
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.invites (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
                project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('org_admin','project_admin','project_user')),
                token TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                expires_at TIMESTAMPTZ NULL,
                accepted_at TIMESTAMPTZ NULL,
                revoked_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_invites_token ON kb.invites(token);');

            // Ensure project_id FKs on documents & chat_conversations use ON DELETE CASCADE (legacy installs may have SET NULL)
            await this.pool.query(`DO $$ BEGIN
            -- Documents FK
            BEGIN
                ALTER TABLE kb.documents DROP CONSTRAINT IF EXISTS documents_project_id_fkey;
                ALTER TABLE kb.documents ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;
            EXCEPTION WHEN others THEN END;
            -- Chat conversations FK
            BEGIN
                ALTER TABLE kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_project_id_fkey;
                ALTER TABLE kb.chat_conversations ADD CONSTRAINT chat_conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;
            EXCEPTION WHEN others THEN END;
            END $$;`);

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
                owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
                is_private BOOLEAN NOT NULL DEFAULT true,
                org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL,
                project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
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
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON kb.chat_conversations(owner_subject_id, updated_at DESC);`);
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

            /* demo seed removed */

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
