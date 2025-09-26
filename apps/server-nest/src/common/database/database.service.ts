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
    // Guard for lazy init path (when getClient/query used before Nest lifecycle onModuleInit fires in certain test harnesses)
    private initializing: Promise<void> | null = null;
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
        if (!this.pool) {
            await this.lazyInit();
        }
        if (!this.online) {
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as unknown as QueryResult<T>;
        }
        return this.pool.query<T>(text, params);
    }

    async getClient(): Promise<PoolClient> {
        if (!this.pool) {
            await this.lazyInit();
        }
        // After lazy init the pool may still be undefined when SKIP_DB was set at process start.
        // Previously this produced a TypeError (reading 'connect' of undefined) which masked the
        // underlying configuration issue and surfaced as opaque 500s across many endpoints.
        if (!this.pool) {
            throw new Error('Database disabled (SKIP_DB set) – transactional operation not permitted. Unset SKIP_DB or run with DB_AUTOINIT=true for tests.');
        }
        if (!this.online) {
            throw new Error('Database offline – cannot acquire client. Check connectivity or initialization logs.');
        }
        return this.pool.connect();
    }

    isOnline() { return this.online; }
    hasSchema() { return this.schemaEnsured; }

    /**
     * Lazy initialization path invoked if consumers call getClient()/query before Nest calls onModuleInit.
     * This occurs in some test harnesses that instantiate providers manually. Keeps semantics idempotent.
     */
    private async lazyInit() {
        if (this.pool || this.initializing || this.config.skipDb) {
            if (!this.pool && this.config.skipDb) {
                // Explicitly skipped DB – leave pool undefined; callers should rely on offline guards.
                this.online = false;
            }
            if (this.initializing) await this.initializing; // wait existing attempt
            return;
        }
        this.initializing = (async () => {
            try {
                this.pool = new Pool({
                    host: this.config.dbHost,
                    port: this.config.dbPort,
                    user: this.config.dbUser,
                    password: this.config.dbPassword,
                    database: this.config.dbName,
                });
                await this.pool.query('SELECT 1');
                if (this.config.autoInitDb) {
                    try {
                        await this.ensureSchema();
                    } catch (e) {
                        this.logger.warn(`lazy ensureSchema failed; DB offline: ${(e as Error).message}`);
                        this.online = false;
                        return;
                    }
                }
                this.online = true;
            } catch (err) {
                this.logger.warn(`Lazy DB init failed: ${(err as Error).message}`);
                this.online = false;
            } finally {
                this.initializing = null;
            }
        })();
        await this.initializing;
    }

    private async ensureSchema() {
        if (this.schemaEnsured) {
            if (process.env.E2E_MINIMAL_DB === 'true') {
                // Ensure newly added graph/schema registry tables exist in already-initialized minimal schema
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`UPDATE kb.graph_objects SET canonical_id = id WHERE canonical_id IS NULL`);
                    await this.pool.query(`UPDATE kb.graph_relationships SET canonical_id = id WHERE canonical_id IS NULL`);
                    await this.pool.query(`UPDATE kb.object_type_schemas SET canonical_id = id WHERE canonical_id IS NULL`);
                    await this.pool.query(`UPDATE kb.relationship_type_schemas SET canonical_id = id WHERE canonical_id IS NULL`);
                    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_head_identity ON kb.graph_objects(project_id, type, key) WHERE supersedes_id IS NULL AND deleted_at IS NULL AND key IS NOT NULL`);
                    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relationships_head_identity ON kb.graph_relationships(project_id, type, src_id, dst_id) WHERE supersedes_id IS NULL AND deleted_at IS NULL`);
                    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_object_type_schemas_head_identity ON kb.object_type_schemas(project_id, type) WHERE supersedes_id IS NULL`);
                    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas(project_id, type) WHERE supersedes_id IS NULL`);
                } catch (e) { this.logger.warn('[minimal re-upgrade] graph/schema ensure failed: ' + (e as Error).message); }
            }
            return; // already ensured
        }
        // ---------------- Minimal Path ----------------
        if (process.env.E2E_MINIMAL_DB === 'true') {
            const startMini = Date.now();
            this.logger.log('E2E_MINIMAL_DB enabled - creating minimal schema');
            this.metrics.minimalSchemaBoots++;
            const exec = async (sql: string) => { try { await this.pool.query(sql); } catch (e) { /* eslint-disable no-console */ console.error('[minimal schema] failed SQL:', sql, '\nError:', e); throw e; } };
            let locked = false;
            try { await exec('SELECT pg_advisory_lock(4815162342)'); locked = true; } catch (e) { this.logger.warn('Failed to acquire minimal schema advisory lock: ' + (e as Error).message); }
            try {
                const coreRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.projects') as exists");
                const coreExists = !!coreRes.rows[0].exists;
                const guardRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.schema_reset_guard') as exists");
                const guardExists = !!guardRes.rows[0].exists;
                const shouldDrop = !coreExists && !guardExists;
                if (!shouldDrop) {
                    // Previously we truncated core.user_emails and core.user_profiles on every minimal ensure.
                    // Under parallel e2e execution this caused (a) deadlocks (TRUNCATE takes AccessExclusiveLock)
                    // and (b) FK races for chat_conversations inserts referencing freshly inserted user_profiles.
                    // We now retain existing rows by default to provide eventual consistency across concurrently
                    // bootstrapped test apps. Set E2E_RESET_PROFILES=true to force legacy truncate behavior when
                    // an isolated clean slate is truly required.
                    if (process.env.E2E_RESET_PROFILES === 'true') {
                        try { await exec('TRUNCATE core.user_emails RESTART IDENTITY CASCADE'); } catch { }
                        try { await exec('TRUNCATE core.user_profiles RESTART IDENTITY CASCADE'); } catch { }
                    }
                    try { await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch { }
                    try { await exec('CREATE EXTENSION IF NOT EXISTS vector'); } catch { }
                }
                if (shouldDrop) {
                    await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto');
                    await exec('CREATE EXTENSION IF NOT EXISTS vector');
                    await exec('CREATE SCHEMA IF NOT EXISTS kb');
                    await exec('CREATE TABLE kb.orgs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE TABLE kb.projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
                    await exec('CREATE UNIQUE INDEX idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name))');
                    await exec('CREATE SCHEMA IF NOT EXISTS core');
                    await exec(`CREATE TABLE core.user_profiles (subject_id UUID PRIMARY KEY, first_name TEXT NULL, last_name TEXT NULL, display_name TEXT NULL, phone_e164 TEXT NULL, avatar_object_key TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE core.user_emails (subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, email TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(subject_id, email))`);
                    await exec('DROP TABLE IF EXISTS kb.organization_memberships CASCADE');
                    await exec('DROP TABLE IF EXISTS kb.project_memberships CASCADE');
                    await exec(`CREATE TABLE kb.organization_memberships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN (\'org_admin\')), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE kb.project_memberships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE, subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN (\'project_admin\',\'project_user\')), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec('CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships(project_id, subject_id)');
                    await exec(`CREATE TABLE kb.invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN (\'org_admin\',\'project_admin\',\'project_user\')), token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', expires_at TIMESTAMPTZ NULL, accepted_at TIMESTAMPTZ NULL, revoked_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec('CREATE INDEX idx_invites_token ON kb.invites(token)');
                    // Graph + schema registry base tables
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                }
                // Common minimal (post-create) idempotent ensures & indexes
                await exec(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS content_hash TEXT`);
                await exec(`CREATE TABLE IF NOT EXISTS kb.chat_conversations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL, is_private BOOLEAN NOT NULL DEFAULT true, org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                await exec(`CREATE TABLE IF NOT EXISTS kb.chat_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN (\'user\',\'assistant\',\'system\')), content TEXT NOT NULL, citations JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                // Graph & registry indexes
                await exec(`UPDATE kb.graph_objects SET canonical_id = id WHERE canonical_id IS NULL`);
                await exec(`UPDATE kb.graph_relationships SET canonical_id = id WHERE canonical_id IS NULL`);
                await exec(`UPDATE kb.object_type_schemas SET canonical_id = id WHERE canonical_id IS NULL`);
                await exec(`UPDATE kb.relationship_type_schemas SET canonical_id = id WHERE canonical_id IS NULL`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical ON kb.graph_objects(canonical_id)`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_objects_key ON kb.graph_objects(key) WHERE key IS NOT NULL`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_objects_not_deleted ON kb.graph_objects(project_id) WHERE deleted_at IS NULL`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical_version ON kb.graph_objects(canonical_id, version DESC)`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical ON kb.graph_relationships(canonical_id)`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_rel_not_deleted ON kb.graph_relationships(project_id) WHERE deleted_at IS NULL`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical_version ON kb.graph_relationships(canonical_id, version DESC)`);
                await exec(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_graph_rel_unique_latest' AND n.nspname='kb') THEN BEGIN EXECUTE 'DROP INDEX IF EXISTS kb.idx_graph_rel_unique_latest'; EXCEPTION WHEN others THEN END; END IF; END $$;`);
                await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_head_identity ON kb.graph_objects(project_id, type, key) WHERE supersedes_id IS NULL AND deleted_at IS NULL AND key IS NOT NULL`);
                await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relationships_head_identity ON kb.graph_relationships(project_id, type, src_id, dst_id) WHERE supersedes_id IS NULL AND deleted_at IS NULL`);
                await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_object_type_schemas_head_identity ON kb.object_type_schemas(project_id, type) WHERE supersedes_id IS NULL`);
                await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas(project_id, type) WHERE supersedes_id IS NULL`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_object_type_schemas_canonical_version ON kb.object_type_schemas(canonical_id, version DESC)`);
                await exec(`CREATE INDEX IF NOT EXISTS idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas(canonical_id, version DESC)`);
            } finally { if (locked) { try { await exec('SELECT pg_advisory_unlock(4815162342)'); } catch { } } }
            const msMini = Date.now() - startMini; this.logger.log(`Minimal schema ensured in ${msMini}ms`); this.schemaEnsured = true; return;
        }
        // ---------------- Full Path ----------------
        const start = Date.now();
        this.logger.log('Ensuring database schema (idempotent)...');
        await this.pool.query('SELECT pg_advisory_lock(4815162343)');
        let locked = true;
        try {
            this.metrics.fullSchemaEnsures++;
            await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
            await this.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
            await this.pool.query('CREATE SCHEMA IF NOT EXISTS kb');
            // orgs
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.orgs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_orgs_name ON kb.orgs(LOWER(name));`);
            // projects
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_lower_name ON kb.projects(org_id, LOWER(name));');
            // retrofit cascade
            await this.pool.query(`DO $$ BEGIN BEGIN ALTER TABLE kb.projects DROP CONSTRAINT IF EXISTS projects_org_id_fkey; ALTER TABLE kb.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN END; END $$;`);
            // documents
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, source_url TEXT, filename TEXT, mime_type TEXT, content TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS org_id UUID;`);
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS project_id UUID;`);
            await this.pool.query(`UPDATE kb.documents d SET project_id = p.id FROM (SELECT id FROM kb.projects LIMIT 1) p WHERE d.project_id IS NULL AND p.id IS NOT NULL;`);
            // chunks
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE, chunk_index INT NOT NULL, text TEXT NOT NULL, embedding vector(768), tsv tsvector, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS embedding vector(768);`);
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS tsv tsvector;`);
            await this.pool.query(`ALTER TABLE kb.chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON kb.chunks USING GIN (tsv);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON kb.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`);
            await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunkindex ON kb.chunks(document_id, chunk_index);`);
            // content hash & duplication cleanup
            await this.pool.query(`ALTER TABLE kb.documents ADD COLUMN IF NOT EXISTS content_hash TEXT;`);
            await this.pool.query(`UPDATE kb.documents SET content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex') WHERE content_hash IS NULL;`);
            await this.pool.query(`WITH ranked AS (SELECT id, content_hash, row_number() OVER (PARTITION BY content_hash ORDER BY created_at ASC, id ASC) AS rn FROM kb.documents WHERE content_hash IS NOT NULL) DELETE FROM kb.documents d USING ranked r WHERE d.id = r.id AND r.rn > 1;`);
            await this.pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_documents_content_hash' AND n.nspname = 'kb') THEN DROP INDEX IF EXISTS kb.idx_documents_content_hash; END IF; END $$;`);
            await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_hash ON kb.documents(project_id, content_hash);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_org ON kb.documents(org_id);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_project ON kb.documents(project_id);`);
            // auth / membership
            await this.pool.query('CREATE SCHEMA IF NOT EXISTS core');
            await this.pool.query(`CREATE TABLE IF NOT EXISTS core.user_profiles (subject_id UUID PRIMARY KEY, first_name TEXT NULL, last_name TEXT NULL, display_name TEXT NULL, phone_e164 TEXT NULL, avatar_object_key TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS core.user_emails (subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, email TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(subject_id, email))`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.organization_memberships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('org_admin')), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='kb' AND table_name='organization_memberships' AND column_name='subject_id') THEN DELETE FROM kb.organization_memberships a USING kb.organization_memberships b WHERE a.org_id=b.org_id AND a.subject_id=b.subject_id AND a.ctid>b.ctid; BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON kb.organization_memberships(org_id, subject_id); EXCEPTION WHEN others THEN END; END IF; END $$;`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.project_memberships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE, subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('project_admin','project_user')), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_membership_unique ON kb.project_memberships(project_id, subject_id);');
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('org_admin','project_admin','project_user')), token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', expires_at TIMESTAMPTZ NULL, accepted_at TIMESTAMPTZ NULL, revoked_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_invites_token ON kb.invites(token);');
            // cascading retrofit
            await this.pool.query(`DO $$ BEGIN BEGIN ALTER TABLE kb.documents DROP CONSTRAINT IF EXISTS documents_project_id_fkey; ALTER TABLE kb.documents ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN END; BEGIN ALTER TABLE kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_project_id_fkey; ALTER TABLE kb.chat_conversations ADD CONSTRAINT chat_conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN END; END $$;`);
            // triggers
            await this.pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='kb' AND p.proname='update_tsv' AND p.pronargs=0) THEN CREATE FUNCTION kb.update_tsv() RETURNS trigger LANGUAGE plpgsql AS $func$ BEGIN NEW.tsv := to_tsvector('simple', NEW.text); RETURN NEW; END $func$; END IF; END $$;`);
            await this.pool.query('DROP TRIGGER IF EXISTS trg_chunks_tsv ON kb.chunks;');
            await this.pool.query(`CREATE TRIGGER trg_chunks_tsv BEFORE INSERT OR UPDATE ON kb.chunks FOR EACH ROW EXECUTE FUNCTION kb.update_tsv();`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.chat_conversations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL, is_private BOOLEAN NOT NULL DEFAULT true, org_id UUID NULL REFERENCES kb.orgs(id) ON DELETE SET NULL, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.chat_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant','system')), content TEXT NOT NULL, citations JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON kb.chat_conversations(owner_subject_id, updated_at DESC);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_org_proj ON kb.chat_conversations(org_id, project_id, updated_at DESC);`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON kb.chat_messages(conversation_id, created_at ASC);`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.settings (key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_settings_key ON kb.settings(key);`);
            // Graph & schema registry (full path)
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('UPDATE kb.graph_objects SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('UPDATE kb.graph_relationships SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('UPDATE kb.object_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('UPDATE kb.relationship_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical ON kb.graph_objects(canonical_id);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_key ON kb.graph_objects(key) WHERE key IS NOT NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_not_deleted ON kb.graph_objects(project_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical_version ON kb.graph_objects(canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical ON kb.graph_relationships(canonical_id);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_not_deleted ON kb.graph_relationships(project_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical_version ON kb.graph_relationships(canonical_id, version DESC);');
            await this.pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_graph_rel_unique_latest' AND n.nspname='kb') THEN BEGIN EXECUTE 'DROP INDEX IF EXISTS kb.idx_graph_rel_unique_latest'; EXCEPTION WHEN others THEN END; END IF; END $$;`);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_head_identity ON kb.graph_objects(project_id, type, key) WHERE supersedes_id IS NULL AND deleted_at IS NULL AND key IS NOT NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relationships_head_identity ON kb.graph_relationships(project_id, type, src_id, dst_id) WHERE supersedes_id IS NULL AND deleted_at IS NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_object_type_schemas_head_identity ON kb.object_type_schemas(project_id, type) WHERE supersedes_id IS NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas(project_id, type) WHERE supersedes_id IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_object_type_schemas_canonical_version ON kb.object_type_schemas(canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas(canonical_id, version DESC);');
            const ms = Date.now() - start; this.logger.log(`Schema ensured in ${ms}ms (full path)`); this.schemaEnsured = true;
        } finally { if (locked) { try { await this.pool.query('SELECT pg_advisory_unlock(4815162343)'); } catch { } } }
    }

    /** Return shallow copy of internal metrics (primarily for tests / debug). */
    getMetrics() { return { ...this.metrics }; }
}
