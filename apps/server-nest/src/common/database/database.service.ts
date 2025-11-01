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

interface PgPolicyRow {
    policyname: string;
    tablename: string;
    command: string | null;
    qual: string | null;
    with_check: string | null;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    private online = false;
    private readonly logger = new Logger(DatabaseService.name);
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
            // Schema is now managed entirely by migrations (no ensureSchema)
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

    /**
     * Run database migrations from the migrations directory.
     * Uses advisory locks to prevent concurrent migration runs.
     * Idempotent - safe to run multiple times.
     */
    async runMigrations(): Promise<void> {
        if (!this.pool || !this.online) {
            this.logger.warn('Cannot run migrations - database is offline');
            return;
        }

        const start = Date.now();
        this.logger.log('Running database migrations...');

        // Use PostgreSQL advisory lock to prevent concurrent migrations
        await this.pool.query('SELECT pg_advisory_lock(4815162342)');
        let locked = true;

        try {
            const fs = await import('node:fs');
            const path = await import('node:path');
            
            const migrationsDir = path.join(process.cwd(), 'src', 'common', 'database', 'migrations');

            if (!fs.existsSync(migrationsDir)) {
                this.logger.warn(`Migrations directory not found: ${migrationsDir}`);
                return;
            }

            const migrationFiles = fs
                .readdirSync(migrationsDir)
                .filter((f) => f.endsWith('.sql'))
                .sort();

            if (migrationFiles.length === 0) {
                this.logger.log('No migration files found');
                return;
            }

            for (const file of migrationFiles) {
                const filePath = path.join(migrationsDir, file);
                const sql = fs.readFileSync(filePath, 'utf-8');

                this.logger.log(`Running migration: ${file}`);

                try {
                    await this.pool.query(sql);
                    this.logger.log(`✓ Migration ${file} completed`);
                } catch (e) {
                    this.logger.warn(`✗ Migration ${file} failed (skipping): ${(e as Error).message}`);
                    // Don't throw - migrations may have already been applied manually
                }
            }

            const ms = Date.now() - start;
            this.logger.log(`All migrations completed in ${ms}ms`);
        } finally {
            if (locked) {
                try {
                    await this.pool.query('SELECT pg_advisory_unlock(4815162342)');
                } catch { /* ignore */ }
            }
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
                // Schema is now managed entirely by migrations (no ensureSchema)
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
        await this.pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON core.user_profiles TO app_rls`);
        await this.pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON core.user_emails TO app_rls`);
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
            const names = res.rows.map((r: any) => r.policyname).sort();
            const expected = [
                'graph_objects_delete', 'graph_objects_insert', 'graph_objects_select', 'graph_objects_update',
                'graph_relationships_delete', 'graph_relationships_insert', 'graph_relationships_select', 'graph_relationships_update'
            ].sort();
            const ok = names.length === expected.length && names.every((v: any, i: any) => v === expected[i]);
            // Simple hash (stable) without pulling crypto for lightweight status: join + length; crypto not required here.
            const hash = 'policies:' + names.join(',').length + ':' + names.join(',').split('').reduce((a: any, c: any) => (a + c.charCodeAt(0)) % 65536, 0).toString(16);
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
        const existingMap = new Map(existingRes.rows.map((row: PgPolicyRow) => [`${row.tablename}:${row.policyname}`, row]));
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
        const finalKeys = new Set(postEnsure.rows.map((r: PgPolicyRow) => `${r.tablename}:${r.policyname}`));
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
