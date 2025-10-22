import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AppConfigService } from '../config/config.service';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface PgConfig {
    host?: string; port?: number; user?: string; password?: string; database?: string;
}

interface TenantContextFrame {
    orgId: string | null;
    projectId: string | null;
}

interface TenantStore extends TenantContextFrame {
    base: TenantContextFrame | null;
    frames: TenantContextFrame[];
}

type GraphPolicyDefinition = {
    table: 'graph_objects' | 'graph_relationships';
    name: string;
    command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    using: string | null;
    withCheck: string | null;
    sql: string;
};

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

    // Persist the last requested tenant context so that each query can reliably
    // apply the appropriate GUCs on the session actually executing the SQL.
    // Without this, calling set_config on one pooled connection and then
    // executing the next query on a different connection results in RLS GUCs
    // not being visible to policies (leading to test leakage across tenants).
    private currentOrgId: string | null | undefined;
    private currentProjectId: string | null | undefined;
    // Async-local tenant context to prevent concurrent tests from clobbering
    // the global fallback values. When set, this takes precedence over the
    // shared currentOrgId/currentProjectId pair.
    private readonly tenantContextStorage = new AsyncLocalStorage<TenantStore>();

    constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
        // Temporary debug log to understand DI behavior in test harness.
        if (!config) {
            // eslint-disable-next-line no-console
            console.error('[DatabaseService] Constructor received undefined AppConfigService');
        }
    }

    private resolveAppRlsPassword(): string {
        if (!this.config) {
            return 'app_rls_pw';
        }
        try {
            const raw = (this.config as unknown as { appRlsPassword?: unknown }).appRlsPassword;
            if (typeof raw === 'string' && raw.length > 0) {
                return raw;
            }
        } catch {
            /* ignore */
        }
        return 'app_rls_pw';
    }

    async onModuleInit() {
        if (!this.config) {
            // Defensive guard: DI misconfiguration; surface explicit log and mark offline so tests can proceed (will operate in offline mode returning empty query results)
            this.logger.error('AppConfigService not injected into DatabaseService – operating in offline mode');
            this.online = false;
            return;
        }
        if (this.config.skipDb) {
            this.logger.warn('SKIP_DB flag set - skipping database initialization');
            this.online = false;
            return;
        }
        try {
            // Establish initial pool using configured (likely owner / bypass) role
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
                    this.logger.warn(`ensureSchema failed; keeping DB offline: ${(e as Error).message}`);
                    throw e;
                }
            }
            // Post-schema: switch to non-bypass role (no-op if already non-bypass)
            try {
                await this.switchToRlsApplicationRole();
            } catch (e) {
                this.logger.warn('switchToRlsApplicationRole failed (continuing with current role): ' + (e as Error).message);
            }
            this.online = true;
        } catch (err) {
            let details = '';
            if (err instanceof AggregateError) {
                const inner = err.errors?.map(e => (e instanceof Error ? `${e.message}${e.stack ? `\n${e.stack}` : ''}` : String(e))) ?? [];
                details = inner.length ? `\nInner errors:\n- ${inner.join('\n- ')}` : '';
            }
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.logger.error('Database initialization failed: ' + message + (stack ? `\n${stack}` : '') + details);
            this.online = false;
        }
    }

    async onModuleDestroy() {
        if (this.pool) {
            try { await this.pool.end(); } catch { /* ignore */ }
        }
    }

    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>> {
        if (!this.pool) { await this.lazyInit(); }
        if (!this.online) {
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as unknown as QueryResult<T>;
        }
        // If tenant context has been set, ensure the executing session has the
        // correct GUCs before running the user query. We cannot rely on a prior
        // set_config call because the Pool may give us a different connection.
        const store = this.tenantContextStorage.getStore();
        const effectiveOrgRaw = store?.orgId ?? this.currentOrgId ?? null;
        const effectiveProjectRaw = store?.projectId ?? this.currentProjectId ?? null;
        const hasContext = store !== undefined || this.currentOrgId !== undefined || this.currentProjectId !== undefined;
        if (hasContext) {
            const client = await this.pool.connect();
            try {
                const effectiveOrg = effectiveOrgRaw ?? '';
                const effectiveProject = effectiveProjectRaw ?? '';
                const wildcard = effectiveOrg === '' && effectiveProject === '';
                if (process.env.DEBUG_TENANT === 'true') {
                    // eslint-disable-next-line no-console
                    console.log('[db.query][set_config]', {
                        org: effectiveOrg,
                        project: effectiveProject,
                        rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)'
                    });
                }
                await client.query(
                    'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
                    ['app.current_organization_id', effectiveOrg, 'app.current_project_id', effectiveProject, 'row_security', 'on']
                );
                if (process.env.DEBUG_TENANT === 'true') {
                    // eslint-disable-next-line no-console
                    console.log('[db.query][execute]', {
                        text,
                        org: effectiveOrg,
                        project: effectiveProject,
                        rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)'
                    });
                }
                return await client.query<T>(text, params);
            } finally {
                client.release();
            }
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
        const client = await this.pool.connect();
        try {
            const store = this.tenantContextStorage.getStore();
            const orgRaw = store?.orgId ?? this.currentOrgId ?? null;
            const projectRaw = store?.projectId ?? this.currentProjectId ?? null;
            const orgId = orgRaw ?? '';
            const projectId = projectRaw ?? '';
            const wildcard = orgId === '' && projectId === '';
            if (process.env.DEBUG_TENANT === 'true') {
                // eslint-disable-next-line no-console
                console.log('[db.getClient][set_config]', {
                    org: orgId,
                    project: projectId,
                    rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)'
                });
            }
            await client.query(
                'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
                ['app.current_organization_id', orgId, 'app.current_project_id', projectId, 'row_security', 'on']
            );
        } catch (err) {
            client.release();
            throw err;
        }
        return client;
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
                this.pool = new Pool({ host: this.config.dbHost, port: this.config.dbPort, user: this.config.dbUser, password: this.config.dbPassword, database: this.config.dbName });
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
                try { await this.switchToRlsApplicationRole(); } catch (e) { this.logger.warn('switchToRlsApplicationRole (lazy) failed: ' + (e as Error).message); }
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
        // If already ensured, run minimal re-upgrade additions (if minimal mode) then return
        if (this.schemaEnsured) {
            if (process.env.E2E_MINIMAL_DB === 'true') {
                // Minimal re-upgrade path: acquire the same advisory lock used for initial minimal creation
                // to avoid concurrent test processes racing on late-added artifacts (e.g., lineage/provenance tables)
                let reupgradeLocked = false;
                try { await this.pool.query('SELECT pg_advisory_lock(4815162342)'); reupgradeLocked = true; } catch (e) { this.logger.warn('[minimal re-upgrade] failed to acquire advisory lock: ' + (e as Error).message); }
                // Re-upgrade path for new graph/schema related artifacts added after initial minimal boot
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.branches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, name TEXT NOT NULL, parent_branch_id UUID NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(project_id, name))`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, fts tsvector NULL, embedding BYTEA NULL, embedding_updated_at TIMESTAMPTZ NULL, embedding_vec vector(${this.config.embeddingDimension}) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    // Branch lineage table (captures ancestor chain + depth for fast queries)
                    try {
                        await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.branch_lineage (branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, ancestor_branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, depth INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(branch_id, ancestor_branch_id))`);
                        await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_lineage_ancestor_depth ON kb.branch_lineage(ancestor_branch_id, depth)`);
                    } catch (e) { this.logger.warn('[minimal re-upgrade] branch_lineage ensure failed: ' + (e as Error).message); }
                    // Merge provenance table (records lineage of merged versions). Non-blocking if fails.
                    try {
                        await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.merge_provenance (
                                                    child_version_id UUID NOT NULL,
                                                    parent_version_id UUID NOT NULL,
                                                    role TEXT NOT NULL CHECK (role IN ('source','target','base')),
                                                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                                                    PRIMARY KEY(child_version_id, parent_version_id, role)
                                                )`);
                    } catch (e) { this.logger.warn('[minimal re-upgrade] merge_provenance ensure failed: ' + (e as Error).message); }
                    // Product version snapshot tables (release snapshots). Non-blocking if creation fails; added after provenance.
                    try {
                        await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.product_versions (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            org_id UUID NULL,
                            project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                            name TEXT NOT NULL,
                            description TEXT NULL,
                            base_product_version_id UUID NULL REFERENCES kb.product_versions(id) ON DELETE SET NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        )`);
                        await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_versions_project_name ON kb.product_versions(project_id, LOWER(name))');
                        await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.product_version_members (
                            product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
                            object_canonical_id UUID NOT NULL,
                            object_version_id UUID NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            PRIMARY KEY(product_version_id, object_canonical_id)
                        )`);
                        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_product_version_members_version ON kb.product_version_members(product_version_id, object_version_id)');
                    } catch (e) { this.logger.warn('[minimal re-upgrade] product_versions ensure failed: ' + (e as Error).message); }
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, multiplicity JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    // Embedding policies (Phase 3: selective embedding)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.embedding_policies (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        object_type TEXT NOT NULL,
                        enabled BOOLEAN NOT NULL DEFAULT true,
                        max_property_size INT DEFAULT 10000,
                        required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE(project_id, object_type)
                    )`);
                    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_embedding_policies_project ON kb.embedding_policies(project_id)`);
                } catch (e) { this.logger.warn('[minimal re-upgrade] graph/schema ensure failed: ' + (e as Error).message); }
                finally { if (reupgradeLocked) { try { await this.pool.query('SELECT pg_advisory_unlock(4815162342)'); } catch { /* ignore */ } } }
            }
            return;
        }

        // ---------------- Minimal Path ----------------
        if (process.env.E2E_MINIMAL_DB === 'true') {
            const startMini = Date.now();
            this.logger.log('E2E_MINIMAL_DB enabled - creating minimal schema');
            this.metrics.minimalSchemaBoots++;
            const exec = async (sql: string) => { try { await this.pool.query(sql); } catch (e) { console.error('[minimal schema] failed SQL:', sql, '\nError:', e); throw e; } };
            let locked = false;
            try { await exec('SELECT pg_advisory_lock(4815162342)'); locked = true; } catch (e) { this.logger.warn('Failed to acquire minimal schema advisory lock: ' + (e as Error).message); }
            try {
                const coreRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.projects') as exists");
                const coreExists = !!coreRes.rows[0].exists;
                const guardRes = await this.pool.query<{ exists: string | null }>("SELECT to_regclass('kb.schema_reset_guard') as exists");
                const guardExists = !!guardRes.rows[0].exists;
                const shouldDrop = !coreExists && !guardExists;
                if (!shouldDrop) {
                    if (process.env.E2E_RESET_PROFILES === 'true') {
                        try { await exec('TRUNCATE core.user_emails RESTART IDENTITY CASCADE'); } catch { }
                        try { await exec('TRUNCATE core.user_profiles RESTART IDENTITY CASCADE'); } catch { }
                    }
                    try { await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch { }
                    try { await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector'); } catch (e) { this.logger.warn('Vector extension not available, skipping'); }
                }
                if (shouldDrop) {
                    await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto');
                    try { await exec('CREATE EXTENSION IF NOT EXISTS vector'); } catch (e) { this.logger.warn('Vector extension not available, skipping'); }
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
                    // Audit log table (minimal schema)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), event_type TEXT NOT NULL, outcome TEXT NOT NULL, user_id UUID NULL, user_email TEXT NULL, resource_type TEXT NULL, resource_id UUID NULL, action TEXT NULL, endpoint TEXT NULL, http_method TEXT NULL, status_code INT NULL, error_code TEXT NULL, error_message TEXT NULL, ip_address TEXT NULL, user_agent TEXT NULL, request_id TEXT NULL, details JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON kb.audit_log(timestamp DESC)');
                    await exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON kb.audit_log(user_id, timestamp DESC)');
                    await exec('CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON kb.audit_log(resource_type, resource_id)');
                    // Documents & Chunks (minimal schema) - required by E2E context
                    await exec(`CREATE TABLE IF NOT EXISTS kb.documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, source_url TEXT, filename TEXT, mime_type TEXT, content TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE, chunk_index INT NOT NULL, text TEXT NOT NULL, tsv tsvector, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_chunks_doc ON kb.chunks(document_id)');
                    // Chat tables (minimal schema) - required by E2E context
                    await exec(`CREATE TABLE IF NOT EXISTS kb.chat_conversations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL REFERENCES kb.projects(id) ON DELETE CASCADE, owner_subject_id UUID NULL REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL, title TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.chat_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES kb.chat_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON kb.chat_messages(conversation_id)');
                    // Settings table (minimal schema)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    // Branches (minimal schema)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.branches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, name TEXT NOT NULL, parent_branch_id UUID NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(project_id, name))`);
                    // Graph objects (minimal schema - NO vector column since pgvector not installed in E2E)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, expires_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, fts tsvector NULL, embedding BYTEA NULL, embedding_updated_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL`);

                    // Phase 1 tables (minimal schema - needed for E2E tests, no RLS policies in E2E mode)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_template_packs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name TEXT NOT NULL,
                        version TEXT NOT NULL,
                        description TEXT,
                        author TEXT,
                        license TEXT,
                        repository_url TEXT,
                        documentation_url TEXT,
                        object_type_schemas JSONB NOT NULL DEFAULT '{}',
                        relationship_type_schemas JSONB NOT NULL DEFAULT '{}',
                        ui_configs JSONB NOT NULL DEFAULT '{}',
                        extraction_prompts JSONB NOT NULL DEFAULT '{}',
                        sql_views JSONB DEFAULT '[]',
                        signature TEXT,
                        checksum TEXT,
                        published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        deprecated_at TIMESTAMPTZ,
                        superseded_by UUID REFERENCES kb.graph_template_packs(id),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE (name, version)
                    )`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_template_packs_name ON kb.graph_template_packs(name)');

                    await exec(`CREATE TABLE IF NOT EXISTS kb.project_template_packs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL,
                        organization_id UUID NOT NULL,
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        template_pack_id UUID NOT NULL REFERENCES kb.graph_template_packs(id) ON DELETE RESTRICT,
                        installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        installed_by UUID NOT NULL,
                        active BOOLEAN NOT NULL DEFAULT true,
                        customizations JSONB DEFAULT '{}',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE (project_id, template_pack_id)
                    )`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_project_template_packs_project ON kb.project_template_packs(project_id, active)');

                    await exec(`CREATE TABLE IF NOT EXISTS kb.project_object_type_registry (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL,
                        organization_id UUID NOT NULL,
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        type TEXT NOT NULL,
                        source TEXT NOT NULL CHECK (source IN ('template', 'custom', 'discovered')),
                        template_pack_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE,
                        schema_version INT NOT NULL DEFAULT 1,
                        json_schema JSONB NOT NULL,
                        ui_config JSONB DEFAULT '{}',
                        extraction_config JSONB DEFAULT '{}',
                        enabled BOOLEAN NOT NULL DEFAULT true,
                        discovery_confidence REAL,
                        description TEXT,
                        created_by UUID,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE (project_id, type)
                    )`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_project_type_registry_project ON kb.project_object_type_registry(project_id, enabled)');

                    await exec(`CREATE TABLE IF NOT EXISTS kb.object_extraction_jobs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        org_id UUID NOT NULL,
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        source_type TEXT NOT NULL,
                        source_id TEXT,
                        source_metadata JSONB DEFAULT '{}',
                        extraction_config JSONB DEFAULT '{}',
                        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'processing', 'completed', 'requires_review', 'failed', 'cancelled')),
                        total_items INT DEFAULT 0,
                        processed_items INT DEFAULT 0,
                        successful_items INT DEFAULT 0,
                        failed_items INT DEFAULT 0,
                        discovered_types TEXT[] DEFAULT '{}',
                        created_objects UUID[] DEFAULT '{}',
                        error_message TEXT,
                        error_details JSONB,
                        started_at TIMESTAMPTZ,
                        completed_at TIMESTAMPTZ,
                        subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )`);
                    await exec('CREATE INDEX IF NOT EXISTS idx_extraction_jobs_project_status ON kb.object_extraction_jobs(project_id, status)');
                    await exec('CREATE INDEX IF NOT EXISTS idx_extraction_jobs_subject_id ON kb.object_extraction_jobs(subject_id) WHERE subject_id IS NOT NULL');

                    // Ensure the status constraint matches application enum even on existing databases
                    try {
                        await exec(`ALTER TABLE kb.object_extraction_jobs DROP CONSTRAINT IF EXISTS object_extraction_jobs_status_check`);
                        await exec(`ALTER TABLE kb.object_extraction_jobs ADD CONSTRAINT object_extraction_jobs_status_check CHECK (status IN ('pending','running','processing','completed','requires_review','failed','cancelled'))`);
                    } catch (e) {
                        this.logger.warn(`[minimal initial] object_extraction_jobs status constraint ensure failed: ${(e as Error).message}`);
                    }

                    // Introduced after original minimal path: lineage & merge provenance tables must exist BEFORE any branch creation logic that writes to them.
                    try {
                        await exec(`CREATE TABLE IF NOT EXISTS kb.branch_lineage (branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, ancestor_branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, depth INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(branch_id, ancestor_branch_id))`);
                        await exec(`CREATE INDEX IF NOT EXISTS idx_branch_lineage_ancestor_depth ON kb.branch_lineage(ancestor_branch_id, depth)`);
                    } catch (e) { this.logger.warn('[minimal initial] branch_lineage ensure failed: ' + (e as Error).message); }
                    try {
                        await exec(`CREATE TABLE IF NOT EXISTS kb.merge_provenance (
                            child_version_id UUID NOT NULL,
                            parent_version_id UUID NOT NULL,
                            role TEXT NOT NULL CHECK (role IN ('source','target','base')),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            PRIMARY KEY(child_version_id, parent_version_id, role)
                        )`);
                    } catch (e) { this.logger.warn('[minimal initial] merge_provenance ensure failed: ' + (e as Error).message); }
                    // Product version snapshot tables (minimal initial path)
                    try {
                        await exec(`CREATE TABLE IF NOT EXISTS kb.product_versions (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            org_id UUID NULL,
                            project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                            name TEXT NOT NULL,
                            description TEXT NULL,
                            base_product_version_id UUID NULL REFERENCES kb.product_versions(id) ON DELETE SET NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        )`);
                        await exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_versions_project_name ON kb.product_versions(project_id, LOWER(name))');
                        await exec(`CREATE TABLE IF NOT EXISTS kb.product_version_members (
                            product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
                            object_canonical_id UUID NOT NULL,
                            object_version_id UUID NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            PRIMARY KEY(product_version_id, object_canonical_id)
                        )`);
                        await exec('CREATE INDEX IF NOT EXISTS idx_product_version_members_version ON kb.product_version_members(product_version_id, object_version_id)');
                    } catch (e) { this.logger.warn('[minimal initial] product_versions ensure failed: ' + (e as Error).message); }
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, multiplicity JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`ALTER TABLE kb.relationship_type_schemas ADD COLUMN IF NOT EXISTS multiplicity JSONB NULL`);
                    await exec(`UPDATE kb.relationship_type_schemas SET multiplicity = jsonb_build_object('src','many','dst','many') WHERE multiplicity IS NULL`);
                    await exec(`CREATE TABLE IF NOT EXISTS kb.graph_embedding_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('pending','processing','failed','completed')), attempt_count INT NOT NULL DEFAULT 0, last_error TEXT NULL, priority INT NOT NULL DEFAULT 0, scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ NULL, completed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
                    await exec(`CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs(status, scheduled_at)`);
                    await exec(`CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs(object_id)`);
                    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs(object_id) WHERE status IN ('pending','processing')`);
                    // Embedding policies (Phase 3: selective embedding)
                    await exec(`CREATE TABLE IF NOT EXISTS kb.embedding_policies (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        object_type TEXT NOT NULL,
                        enabled BOOLEAN NOT NULL DEFAULT true,
                        max_property_size INT DEFAULT 10000,
                        required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE(project_id, object_type)
                    )`);
                    await exec(`CREATE INDEX IF NOT EXISTS idx_embedding_policies_project ON kb.embedding_policies(project_id)`);
                }
                // Existing minimal upgrade steps (subset) ... (retain essential graph/schema + indexes + policies)
                try { await exec('ALTER TABLE kb.relationship_type_schemas ADD COLUMN IF NOT EXISTS multiplicity JSONB NULL'); } catch { }
                try { await exec(`UPDATE kb.relationship_type_schemas SET multiplicity = jsonb_build_object('src','many','dst','many') WHERE multiplicity IS NULL`); } catch { }
                // Embedding policies upgrade (Phase 3: ensure table exists for existing databases)
                try {
                    await exec(`CREATE TABLE IF NOT EXISTS kb.embedding_policies (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                        object_type TEXT NOT NULL,
                        enabled BOOLEAN NOT NULL DEFAULT true,
                        max_property_size INT DEFAULT 10000,
                        required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                        relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE(project_id, object_type)
                    )`);
                    await exec(`CREATE INDEX IF NOT EXISTS idx_embedding_policies_project ON kb.embedding_policies(project_id)`);
                } catch (e) { this.logger.warn('[minimal upgrade] embedding_policies ensure failed: ' + (e as Error).message); }
                // RLS policies (tightened) for minimal path
                const skipRls = process.env.E2E_DISABLE_RLS === 'true';
                if (skipRls) {
                    this.logger.log('[RLS|minimal] Skipping RLS setup (E2E_DISABLE_RLS=true)');
                } else {
                    let rlsPolicyLocked = false;
                    try {
                        try {
                            await this.pool.query('SELECT pg_advisory_lock(4815162344)');
                            rlsPolicyLocked = true;
                        } catch (lockErr) {
                            this.logger.warn('[RLS|minimal] failed to acquire policy advisory lock: ' + (lockErr as Error).message);
                        }
                        await exec(`DO $$ BEGIN
                            ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;
                            ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;
                            BEGIN EXECUTE 'ALTER TABLE kb.graph_objects FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
                            BEGIN EXECUTE 'ALTER TABLE kb.graph_relationships FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
                        END $$;`);
                        const graphPolicyPredicate = "((COALESCE(current_setting('app.current_organization_id', true),'') = '' AND COALESCE(current_setting('app.current_project_id', true),'') = '') OR (COALESCE(current_setting('app.current_organization_id', true),'') <> '' AND org_id::text = current_setting('app.current_organization_id', true) AND (COALESCE(current_setting('app.current_project_id', true),'') = '' OR project_id::text = current_setting('app.current_project_id', true))) OR (COALESCE(current_setting('app.current_organization_id', true),'') = '' AND COALESCE(current_setting('app.current_project_id', true),'') <> '' AND project_id::text = current_setting('app.current_project_id', true)))";
                        await this.ensureCanonicalGraphPolicies(exec, '[RLS|minimal]', graphPolicyPredicate);
                        try {
                            const flags = await this.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='graph_objects' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='kb')`);
                            this.logger.log('[RLS|minimal] graph_objects RLS enabled (force=' + flags.rows[0].relforcerowsecurity + ')');
                        } catch (e2) { this.logger.warn('[RLS|minimal] flag/policy verification failed: ' + (e2 as Error).message); }
                        // Strict verification (minimal path) – enforce canonical policy set if enabled
                        try {
                            const expected = new Set([
                                'graph_objects_select', 'graph_objects_insert', 'graph_objects_update', 'graph_objects_delete',
                                'graph_relationships_select', 'graph_relationships_insert', 'graph_relationships_update', 'graph_relationships_delete'
                            ]);
                            const found = await this.pool.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')`);
                            const actual = new Set(found.rows.map(r => r.policyname));
                            let mismatch = actual.size !== expected.size;
                            if (!mismatch) {
                                for (const name of expected) { if (!actual.has(name)) { mismatch = true; break; } }
                                if (!mismatch) {
                                    for (const name of actual) { if (!expected.has(name)) { mismatch = true; break; } }
                                }
                            }
                            if (mismatch) {
                                const detail = `expected=[${[...expected].sort().join(',')}] actual=[${[...actual].sort().join(',')}]`;
                                this.logger.error('[RLS|minimal] STRICT verification mismatch: ' + detail);
                                if (this.config.rlsPolicyStrict) {
                                    throw new Error('RLS policy strict verification failed (minimal path): ' + detail);
                                }
                            } else if (this.config.rlsPolicyStrict) {
                                this.logger.log('[RLS|minimal] STRICT verification passed (8 canonical policies)');
                            }
                        } catch (strictErr) {
                            if (this.config.rlsPolicyStrict) {
                                throw strictErr;
                            } else {
                                this.logger.warn('[RLS|minimal] strict verification skipped/soft-failed: ' + (strictErr as Error).message);
                            }
                        }
                    } catch (e) { this.logger.warn('[RLS|minimal] setup skipped or partial: ' + (e as Error).message); }
                    finally {
                        if (rlsPolicyLocked) {
                            try { await this.pool.query('SELECT pg_advisory_unlock(4815162344)'); }
                            catch { /* ignore */ }
                        }
                    }
                }
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
            // Ensure content_hash is NOT NULL to prevent future duplication issues
            await this.pool.query(`ALTER TABLE kb.documents ALTER COLUMN content_hash SET NOT NULL;`);
            // Create trigger to automatically compute content_hash on insert/update
            await this.pool.query(`CREATE OR REPLACE FUNCTION kb.compute_document_content_hash() RETURNS TRIGGER AS $trig$ BEGIN NEW.content_hash := encode(digest(coalesce(NEW.content, ''), 'sha256'), 'hex'); RETURN NEW; END; $trig$ LANGUAGE plpgsql;`);
            await this.pool.query(`DROP TRIGGER IF EXISTS trg_documents_content_hash ON kb.documents;`);
            await this.pool.query(`CREATE TRIGGER trg_documents_content_hash BEFORE INSERT OR UPDATE OF content ON kb.documents FOR EACH ROW EXECUTE FUNCTION kb.compute_document_content_hash();`);
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
            // Audit log table (full schema)
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), event_type TEXT NOT NULL, outcome TEXT NOT NULL, user_id UUID NULL, user_email TEXT NULL, resource_type TEXT NULL, resource_id UUID NULL, action TEXT NULL, endpoint TEXT NULL, http_method TEXT NULL, status_code INT NULL, error_code TEXT NULL, error_message TEXT NULL, ip_address TEXT NULL, user_agent TEXT NULL, request_id TEXT NULL, details JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON kb.audit_log(timestamp DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON kb.audit_log(user_id, timestamp DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON kb.audit_log(resource_type, resource_id);');
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
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.branches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, name TEXT NOT NULL, parent_branch_id UUID NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(project_id, name))`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, key TEXT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, labels TEXT[] NOT NULL DEFAULT '{}', deleted_at TIMESTAMPTZ NULL, expires_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, fts tsvector NULL, embedding BYTEA NULL, embedding_updated_at TIMESTAMPTZ NULL, embedding_vec vector(${this.config.embeddingDimension}) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL`);
            // Branch lineage table (full path)
            try {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.branch_lineage (branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, ancestor_branch_id UUID NOT NULL REFERENCES kb.branches(id) ON DELETE CASCADE, depth INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(branch_id, ancestor_branch_id))`);
                await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_lineage_ancestor_depth ON kb.branch_lineage(ancestor_branch_id, depth)`);
            } catch (e) { this.logger.warn('[full ensure] branch_lineage ensure failed: ' + (e as Error).message); }
            try {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.merge_provenance (
                                    child_version_id UUID NOT NULL,
                                    parent_version_id UUID NOT NULL,
                                    role TEXT NOT NULL CHECK (role IN ('source','target','base')),
                                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                                    PRIMARY KEY(child_version_id, parent_version_id, role)
                                )`);
            } catch (e) { this.logger.warn('[full ensure] merge_provenance ensure failed: ' + (e as Error).message); }
            // Product version snapshot tables (full ensure path)
            try {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.product_versions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    org_id UUID NULL,
                    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT NULL,
                    base_product_version_id UUID NULL REFERENCES kb.product_versions(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
                await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_versions_project_name ON kb.product_versions(project_id, LOWER(name))');
                await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.product_version_members (
                    product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
                    object_canonical_id UUID NOT NULL,
                    object_version_id UUID NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY(product_version_id, object_canonical_id)
                )`);
                await this.pool.query('CREATE INDEX IF NOT EXISTS idx_product_version_members_version ON kb.product_version_members(product_version_id, object_version_id)');
            } catch (e) { this.logger.warn('[full ensure] product_versions ensure failed: ' + (e as Error).message); }
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_relationships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL, type TEXT NOT NULL, src_id UUID NOT NULL, dst_id UUID NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ NULL, change_summary JSONB NULL, content_hash BYTEA NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.object_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.relationship_type_schemas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, type TEXT NOT NULL, version INT NOT NULL DEFAULT 1, supersedes_id UUID NULL, canonical_id UUID NULL, json_schema JSONB NOT NULL, multiplicity JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            // Embedding jobs queue (full path)
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.graph_embedding_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('pending','processing','failed','completed')), attempt_count INT NOT NULL DEFAULT 0, last_error TEXT NULL, priority INT NOT NULL DEFAULT 0, scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ NULL, completed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
            await this.pool.query('UPDATE kb.graph_objects SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS fts tsvector NULL;');
            await this.pool.query('ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS embedding BYTEA NULL;');
            await this.pool.query('ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ NULL;');
            await this.pool.query(`ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS embedding_vec vector(${this.config.embeddingDimension}) NULL;`);
            await this.pool.query(`DO $$ BEGIN BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists=100)'; EXCEPTION WHEN others THEN END; END $$;`);
            // Full path upgrade safety: ensure branches table then add branch_id if missing
            await this.pool.query('CREATE TABLE IF NOT EXISTS kb.branches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NULL, project_id UUID NULL, name TEXT NOT NULL, parent_branch_id UUID NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(project_id, name));');
            await this.pool.query('ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL;');
            await this.pool.query('ALTER TABLE kb.graph_relationships ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES kb.branches(id) ON DELETE SET NULL;');
            await this.pool.query('UPDATE kb.graph_relationships SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('UPDATE kb.object_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query('UPDATE kb.relationship_type_schemas SET canonical_id = id WHERE canonical_id IS NULL;');
            await this.pool.query(`UPDATE kb.relationship_type_schemas SET multiplicity = jsonb_build_object('src','many','dst','many') WHERE multiplicity IS NULL;`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical ON kb.graph_objects(canonical_id);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_key ON kb.graph_objects(key) WHERE key IS NOT NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_not_deleted ON kb.graph_objects(project_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical_version ON kb.graph_objects(canonical_id, version DESC);');
            await this.pool.query(`DO $$ BEGIN BEGIN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists=100)'; EXCEPTION WHEN others THEN END; END $$;`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_graph_objects_fts ON kb.graph_objects USING GIN(fts)`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical ON kb.graph_relationships(canonical_id);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_not_deleted ON kb.graph_relationships(project_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_canonical_version ON kb.graph_relationships(canonical_id, version DESC);');
            await this.pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_graph_rel_unique_latest' AND n.nspname='kb') THEN BEGIN EXECUTE 'DROP INDEX IF EXISTS kb.idx_graph_rel_unique_latest'; EXCEPTION WHEN others THEN END; END IF; END $$;`);
            // Drop legacy pre-branch unique indexes and create branch-aware versions
            await this.pool.query(`DO $$ BEGIN
                BEGIN EXECUTE 'DROP INDEX IF EXISTS kb.idx_graph_objects_head_identity'; EXCEPTION WHEN others THEN END;
                BEGIN EXECUTE 'DROP INDEX IF EXISTS kb.idx_graph_relationships_head_identity'; EXCEPTION WHEN others THEN END;
            END $$;`);
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_objects_head_identity_branch ON kb.graph_objects(project_id, branch_id, type, key) WHERE supersedes_id IS NULL AND deleted_at IS NULL AND key IS NOT NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_relationships_head_identity_branch ON kb.graph_relationships(project_id, branch_id, type, src_id, dst_id) WHERE supersedes_id IS NULL AND deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_branch_canonical_version ON kb.graph_objects(branch_id, canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_branch_canonical_version ON kb.graph_relationships(branch_id, canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_objects_branch_not_deleted ON kb.graph_objects(project_id, branch_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_rel_branch_not_deleted ON kb.graph_relationships(project_id, branch_id) WHERE deleted_at IS NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_object_type_schemas_head_identity ON kb.object_type_schemas(project_id, type) WHERE supersedes_id IS NULL;');
            await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_type_schemas_head_identity ON kb.relationship_type_schemas(project_id, type) WHERE supersedes_id IS NULL;');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_object_type_schemas_canonical_version ON kb.object_type_schemas(canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_relationship_type_schemas_canonical_version ON kb.relationship_type_schemas(canonical_id, version DESC);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs(status, scheduled_at);');
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs(object_id);');
            await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs(object_id) WHERE status IN ('pending','processing')`);
            // Embedding policies (Phase 3: selective embedding) - full path
            await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.embedding_policies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
                object_type TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                max_property_size INT DEFAULT 10000,
                required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
                relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(project_id, object_type)
            )`);
            await this.pool.query('CREATE INDEX IF NOT EXISTS idx_embedding_policies_project ON kb.embedding_policies(project_id);');
            // RLS policies (tightened) full path
            let rlsPolicyLocked = false;
            try {
                try {
                    await this.pool.query('SELECT pg_advisory_lock(4815162344)');
                    rlsPolicyLocked = true;
                } catch (lockErr) {
                    this.logger.warn('[RLS|full] failed to acquire policy advisory lock: ' + (lockErr as Error).message);
                }
                // Enable & force RLS (idempotent) first
                await this.pool.query(`DO $$ BEGIN
                    ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;
                    BEGIN EXECUTE 'ALTER TABLE kb.graph_objects FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
                    BEGIN EXECUTE 'ALTER TABLE kb.graph_relationships FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
                END $$;`);
                const graphPolicyPredicate = "((COALESCE(current_setting('app.current_organization_id', true),'') = '' AND COALESCE(current_setting('app.current_project_id', true),'') = '') OR (COALESCE(current_setting('app.current_organization_id', true),'') <> '' AND org_id::text = current_setting('app.current_organization_id', true) AND (COALESCE(current_setting('app.current_project_id', true),'') = '' OR project_id::text = current_setting('app.current_project_id', true))) OR (COALESCE(current_setting('app.current_organization_id', true),'') = '' AND COALESCE(current_setting('app.current_project_id', true),'') <> '' AND project_id::text = current_setting('app.current_project_id', true)))";
                await this.ensureCanonicalGraphPolicies((sql: string) => this.pool!.query(sql), '[RLS|full]', graphPolicyPredicate);
                // Lightweight verification (will be trimmed in later cleanup task)
                try {
                    const flagsFull = await this.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='graph_objects' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='kb')`);
                    this.logger.log('[RLS|full] graph_objects RLS enabled (force=' + flagsFull.rows[0].relforcerowsecurity + ')');
                } catch { /* ignore */ }
                // Strict verification (full path)
                try {
                    const expected = new Set([
                        'graph_objects_select', 'graph_objects_insert', 'graph_objects_update', 'graph_objects_delete',
                        'graph_relationships_select', 'graph_relationships_insert', 'graph_relationships_update', 'graph_relationships_delete'
                    ]);
                    const found = await this.pool.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')`);
                    const actual = new Set(found.rows.map(r => r.policyname));
                    let mismatch = actual.size !== expected.size;
                    if (!mismatch) {
                        for (const name of expected) { if (!actual.has(name)) { mismatch = true; break; } }
                        if (!mismatch) {
                            for (const name of actual) { if (!expected.has(name)) { mismatch = true; break; } }
                        }
                    }
                    if (mismatch) {
                        const detail = `expected=[${[...expected].sort().join(',')}] actual=[${[...actual].sort().join(',')}]`;
                        this.logger.error('[RLS|full] STRICT verification mismatch: ' + detail);
                        if (this.config.rlsPolicyStrict) {
                            throw new Error('RLS policy strict verification failed (full path): ' + detail);
                        }
                    } else if (this.config.rlsPolicyStrict) {
                        this.logger.log('[RLS|full] STRICT verification passed (8 canonical policies)');
                    }
                } catch (strictErr) {
                    if (this.config.rlsPolicyStrict) {
                        throw strictErr;
                    } else {
                        this.logger.warn('[RLS|full] strict verification skipped/soft-failed: ' + (strictErr as Error).message);
                    }
                }
            } catch (e) {
                if (this.config.rlsPolicyStrict) {
                    throw e;
                } else {
                    this.logger.warn('[RLS] tightened setup skipped or partial: ' + (e as Error).message);
                }
            } finally {
                if (rlsPolicyLocked) {
                    try { await this.pool.query('SELECT pg_advisory_unlock(4815162344)'); }
                    catch { /* ignore */ }
                }
            }
            this.schemaEnsured = true;
            const ms = Date.now() - start; this.logger.log(`Schema ensured in ${ms}ms (full path)`);
        } finally { if (locked) { try { await this.pool.query('SELECT pg_advisory_unlock(4815162343)'); } catch { } } }
    }
    /**
     * If the connected role has rolbypassrls=true, create/login a dedicated
     * non-bypass role (app_rls) with CRUD privileges on kb schema tables and
     * swap pool to that role. Avoid ownership transfer to keep idempotent
     * ALTERs under the original owner; ensureSchema must always run BEFORE
     * this is invoked.
     */
    private async switchToRlsApplicationRole() {
        if (!this.pool) return;
        const res = await this.pool.query<{ bypass: boolean; super: boolean; user: string }>(`SELECT rolbypassrls as bypass, rolsuper as super, rolname as user FROM pg_roles WHERE rolname = current_user`);
        const row = res.rows[0];
        // Treat superuser the same as bypass for RLS purposes (superuser always bypasses policies)
        if (row && !row.bypass && !row.super) {
            this.logger.log(`[DatabaseService] Using non-bypass role '${row.user}' (bypass=${row.bypass}, super=${row.super}) – no switch needed`);
            return; // already safe
        }
        this.logger.log(`[DatabaseService] Switching from bypass/superuser role '${row?.user}' (bypass=${row?.bypass}, super=${row?.super}) to dedicated 'app_rls' role for RLS enforcement`);
        // Create role if missing
        const appRlsPassword = this.resolveAppRlsPassword();
        const roleExists = await this.pool.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rls')`);
        if (!roleExists.rows[0]?.exists) {
            const escapedPasswordForCreate = appRlsPassword.replace(/'/g, "''");
            await this.pool.query(`CREATE ROLE app_rls LOGIN PASSWORD '${escapedPasswordForCreate}'`);
        }
        // Grant privileges (idempotent)
        await this.pool.query(`GRANT USAGE ON SCHEMA kb TO app_rls`);
        await this.pool.query(`GRANT CREATE ON SCHEMA kb TO app_rls`);
        await this.pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kb TO app_rls`);
        await this.pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA kb GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls`);
        // Grant access to core.user_profiles for user profile creation during authentication
        await this.pool.query(`GRANT USAGE ON SCHEMA core TO app_rls`);
        await this.pool.query(`GRANT CREATE ON SCHEMA core TO app_rls`);
        await this.pool.query(`GRANT SELECT, INSERT ON core.user_profiles TO app_rls`);
        // Rotate password each startup so updating APP_RLS_PASSWORD takes effect without manual intervention.
        try {
            // ALTER ROLE doesn't support parameterized queries, so we must use string literal
            // Escape single quotes in password by doubling them (SQL standard)
            const escapedPassword = appRlsPassword.replace(/'/g, "''");
            await this.pool.query(`ALTER ROLE app_rls PASSWORD '${escapedPassword}'`);
            this.logger.log('[DatabaseService] Rotated password for role app_rls');
        } catch (e) {
            this.logger.warn('[DatabaseService] Failed to rotate password for app_rls: ' + (e as Error).message);
        }
        // Recreate pool with app_rls
        await this.pool.end();
        this.pool = new Pool({ host: this.config.dbHost, port: this.config.dbPort, user: 'app_rls', password: appRlsPassword, database: this.config.dbName });
        await this.pool.query('SELECT 1');
        // Log confirmation of new role status
        try {
            const verify = await this.pool.query<{ user: string; bypass: boolean; super: boolean }>(`SELECT current_user as user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) as bypass, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) as super`);
            const v = verify.rows[0];
            this.logger.log(`[DatabaseService] Now running as role '${v.user}' (bypass=${v.bypass}, super=${v.super}) with graph_objects RLS enforced`);
        } catch (e) {
            this.logger.warn('[DatabaseService] Failed to verify switched role: ' + (e as Error).message);
        }
    }

    /** Return shallow copy of internal metrics (primarily for tests / debug). */
    getMetrics() { return { ...this.metrics }; }

    /** Lightweight status summary of current RLS policy set (used by health endpoint & ops). */
    async getRlsPolicyStatus(): Promise<{ policies_ok: boolean; count: number; hash: string | null }> {
        if (!this.pool || !this.online) return { policies_ok: false, count: 0, hash: null };
        try {
            const res = await this.pool.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')`);
            const names = res.rows.map(r => r.policyname).sort();
            const expected = [
                'graph_objects_delete', 'graph_objects_insert', 'graph_objects_select', 'graph_objects_update',
                'graph_relationships_delete', 'graph_relationships_insert', 'graph_relationships_select', 'graph_relationships_update'
            ].sort();
            const ok = names.length === expected.length && names.every((v, i) => v === expected[i]);
            // Simple hash (stable) without pulling crypto for lightweight status: join + length; crypto not required here.
            const hash = 'policies:' + names.join(',').length + ':' + names.join(',').split('').reduce((a, c) => (a + c.charCodeAt(0)) % 65536, 0).toString(16);
            return { policies_ok: ok, count: names.length, hash };
        } catch {
            return { policies_ok: false, count: 0, hash: null };
        }
    }

    /**
     * Set per-session tenant context for RLS policies. Pass null/undefined to clear (wildcard access for bootstrap/testing).
     */
    async setTenantContext(orgId?: string | null, projectId?: string | null) {
        const normalizedOrg = orgId ?? null;
        const normalizedProject = projectId ?? null;
        const existingStore = this.tenantContextStorage.getStore();
        if (existingStore) {
            existingStore.base = { orgId: normalizedOrg, projectId: normalizedProject };
            existingStore.orgId = normalizedOrg;
            existingStore.projectId = normalizedProject;
            if (!existingStore.frames) {
                existingStore.frames = [];
            }
        } else {
            this.tenantContextStorage.enterWith({
                base: { orgId: normalizedOrg, projectId: normalizedProject },
                frames: [],
                orgId: normalizedOrg,
                projectId: normalizedProject,
            });
        }
        await this.applyTenantContext(normalizedOrg, normalizedProject);
    }

    private async applyTenantContext(orgId: string | null, projectId: string | null) {
        this.currentOrgId = orgId;
        this.currentProjectId = projectId;
        if (!this.pool) {
            await this.lazyInit();
        }
        if (!this.pool) return; // DB disabled
        try {
            const orgSetting = orgId ?? '';
            const projectSetting = projectId ?? '';
            await this.pool.query(
                'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
                ['app.current_organization_id', orgSetting, 'app.current_project_id', projectSetting, 'row_security', 'on']
            );
        } catch {
            /* ignore */
        }
    }

    private getCanonicalGraphPolicies(graphPolicyPredicate: string): readonly GraphPolicyDefinition[] {
        return [
            {
                table: 'graph_objects',
                name: 'graph_objects_select',
                command: 'SELECT',
                using: graphPolicyPredicate,
                withCheck: null,
                sql: `CREATE POLICY graph_objects_select ON kb.graph_objects FOR SELECT USING (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_objects',
                name: 'graph_objects_insert',
                command: 'INSERT',
                using: null,
                withCheck: graphPolicyPredicate,
                sql: `CREATE POLICY graph_objects_insert ON kb.graph_objects FOR INSERT WITH CHECK (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_objects',
                name: 'graph_objects_update',
                command: 'UPDATE',
                using: graphPolicyPredicate,
                withCheck: graphPolicyPredicate,
                sql: `CREATE POLICY graph_objects_update ON kb.graph_objects FOR UPDATE USING (${graphPolicyPredicate}) WITH CHECK (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_objects',
                name: 'graph_objects_delete',
                command: 'DELETE',
                using: graphPolicyPredicate,
                withCheck: null,
                sql: `CREATE POLICY graph_objects_delete ON kb.graph_objects FOR DELETE USING (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_relationships',
                name: 'graph_relationships_select',
                command: 'SELECT',
                using: graphPolicyPredicate,
                withCheck: null,
                sql: `CREATE POLICY graph_relationships_select ON kb.graph_relationships FOR SELECT USING (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_relationships',
                name: 'graph_relationships_insert',
                command: 'INSERT',
                using: null,
                withCheck: graphPolicyPredicate,
                sql: `CREATE POLICY graph_relationships_insert ON kb.graph_relationships FOR INSERT WITH CHECK (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_relationships',
                name: 'graph_relationships_update',
                command: 'UPDATE',
                using: graphPolicyPredicate,
                withCheck: graphPolicyPredicate,
                sql: `CREATE POLICY graph_relationships_update ON kb.graph_relationships FOR UPDATE USING (${graphPolicyPredicate}) WITH CHECK (${graphPolicyPredicate})`,
            },
            {
                table: 'graph_relationships',
                name: 'graph_relationships_delete',
                command: 'DELETE',
                using: graphPolicyPredicate,
                withCheck: null,
                sql: `CREATE POLICY graph_relationships_delete ON kb.graph_relationships FOR DELETE USING (${graphPolicyPredicate})`,
            },
        ] as const;
    }

    private async ensureCanonicalGraphPolicies(executeSql: (sql: string) => Promise<unknown>, scopeLabel: string, graphPolicyPredicate: string) {
        if (!this.pool) return;
        const canonical = this.getCanonicalGraphPolicies(graphPolicyPredicate);
        const canonicalKeys = new Set(canonical.map(p => `${p.table}:${p.name}`));
        const normalizePredicate = (expr: string | null | undefined) => {
            const compact = (expr ?? '').replace(/\s+/g, '').toLowerCase();
            return compact === 'true' ? '' : compact;
        };
        const mapCommand = (value: string | null | undefined): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | null => {
            if (!value) return null;
            switch (value.toLowerCase()) {
                case 'r':
                case 'select':
                    return 'SELECT';
                case 'a':
                case 'insert':
                    return 'INSERT';
                case 'w':
                case 'update':
                    return 'UPDATE';
                case 'd':
                case 'delete':
                    return 'DELETE';
                default:
                    return null;
            }
        };
        const fetchPolicies = async () => this.pool!.query<{
            policyname: string;
            tablename: string;
            command: string | null;
            qual: string | null;
            with_check: string | null;
        }>(
            "SELECT policyname, tablename, cmd AS command, qual, with_check FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')"
        );

        // Drop any legacy policies that are no longer part of the canonical set
        const existingRes = await fetchPolicies();
        const existingMap = new Map(existingRes.rows.map(row => [`${row.tablename}:${row.policyname}`, row]));
        for (const row of existingRes.rows) {
            const key = `${row.tablename}:${row.policyname}`;
            if (!canonicalKeys.has(key)) {
                try {
                    await executeSql(`DROP POLICY IF EXISTS ${row.policyname} ON kb.${row.tablename}`);
                    existingMap.delete(key);
                } catch (dropErr) {
                    this.logger.warn(`${scopeLabel} drop legacy policy '${row.policyname}' failed: ${(dropErr as Error).message}`);
                }
            }
        }

        // Ensure each canonical policy exists with expected definition
        for (const policy of canonical) {
            const key = `${policy.table}:${policy.name}`;
            const existing = existingMap.get(key);
            if (!existing) {
                try {
                    await executeSql(policy.sql);
                } catch (createErr) {
                    this.logger.error(`${scopeLabel} failed to create policy ${policy.name}: ${(createErr as Error).message}`);
                    throw createErr;
                }
                continue;
            }
            const existingCommand = mapCommand(existing.command);
            if (existingCommand !== policy.command) {
                try {
                    await executeSql(`DROP POLICY IF EXISTS ${policy.name} ON kb.${policy.table}`);
                    await executeSql(policy.sql);
                } catch (recreateErr) {
                    this.logger.error(`${scopeLabel} failed to recreate policy ${policy.name}: ${(recreateErr as Error).message}`);
                    throw recreateErr;
                }
                continue;
            }
            const expectedUsing = normalizePredicate(policy.using);
            const expectedCheck = normalizePredicate(policy.withCheck);
            const actualUsing = normalizePredicate(existing.qual);
            const actualCheck = normalizePredicate(existing.with_check);
            const requiresDrop = (!policy.using && actualUsing) || (!policy.withCheck && actualCheck);
            if (requiresDrop) {
                try {
                    await executeSql(`DROP POLICY IF EXISTS ${policy.name} ON kb.${policy.table}`);
                    await executeSql(policy.sql);
                } catch (resetErr) {
                    this.logger.error(`${scopeLabel} failed to reset policy ${policy.name}: ${(resetErr as Error).message}`);
                    throw resetErr;
                }
                continue;
            }
            const needsUsingUpdate = policy.using !== null && actualUsing !== expectedUsing;
            const needsCheckUpdate = policy.withCheck !== null && actualCheck !== expectedCheck;
            if (needsUsingUpdate || needsCheckUpdate) {
                const clauses: string[] = [];
                if (policy.using !== null) {
                    clauses.push(`USING (${policy.using})`);
                }
                if (policy.withCheck !== null) {
                    clauses.push(`WITH CHECK (${policy.withCheck})`);
                }
                try {
                    await executeSql(`ALTER POLICY ${policy.name} ON kb.${policy.table} ${clauses.join(' ')}`);
                } catch (alterErr) {
                    this.logger.error(`${scopeLabel} failed to alter policy ${policy.name}: ${(alterErr as Error).message}`);
                    throw alterErr;
                }
            }
        }

        // Final verification pass to ensure canonical set is present
        const postEnsure = await fetchPolicies();
        const finalKeys = new Set(postEnsure.rows.map(r => `${r.tablename}:${r.policyname}`));
        for (const policy of canonical) {
            const key = `${policy.table}:${policy.name}`;
            if (!finalKeys.has(key)) {
                const detail = `${policy.table}:${policy.name}`;
                const message = `${scopeLabel} canonical policy missing after ensure: ${detail}`;
                if (this.config?.rlsPolicyStrict) {
                    throw new Error(message);
                }
                this.logger.warn(message);
            }
        }
    }

    async runWithTenantContext<T>(orgId: string | null | undefined, projectId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
        const normalizedOrg = orgId ?? null;
        const normalizedProject = projectId ?? null;
        const parentStore = this.tenantContextStorage.getStore();
        const parentFrames = parentStore?.frames ?? [];
        const originalOrg = this.currentOrgId;
        const originalProject = this.currentProjectId;
        const nextStore: TenantStore = {
            base: parentStore?.base ?? null,
            frames: [...parentFrames, { orgId: normalizedOrg, projectId: normalizedProject }],
            orgId: normalizedOrg,
            projectId: normalizedProject,
        };

        return this.tenantContextStorage.run(nextStore, async () => {
            await this.applyTenantContext(normalizedOrg, normalizedProject);
            try {
                return await fn();
            } finally {
                const fallbackOrg = parentStore?.orgId ?? parentStore?.base?.orgId ?? (originalOrg !== undefined ? originalOrg : null);
                const fallbackProject = parentStore?.projectId ?? parentStore?.base?.projectId ?? (originalProject !== undefined ? originalProject : null);
                if (this.currentOrgId !== fallbackOrg || this.currentProjectId !== fallbackProject) {
                    await this.applyTenantContext(fallbackOrg, fallbackProject);
                }
            }
        });
    }
}
