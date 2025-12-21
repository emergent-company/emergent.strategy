import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AppConfigService } from '../config/config.service';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DataSource, QueryRunner } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

// Re-export QueryRunner for consumers
export { QueryRunner };

export interface PgConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
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

/**
 * Adapter that wraps TypeORM QueryRunner to provide a pg PoolClient-compatible interface.
 * This allows existing code that expects PoolClient to work with QueryRunner seamlessly.
 */
class QueryRunnerAdapter {
  constructor(private readonly queryRunner: QueryRunner) {}

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const result = await this.queryRunner.query(text, params);

    // TypeORM's queryRunner.query() returns different formats based on query type:
    // - SELECT/INSERT...RETURNING: [{row1}, {row2}, ...]
    // - UPDATE...RETURNING: [[{row1}, {row2}], affectedCount]
    // - UPDATE/DELETE (no RETURNING): [[], affectedCount]

    let rows: T[];
    let rowCount: number;

    if (Array.isArray(result)) {
      // Detect UPDATE...RETURNING format: [[rows], count]
      if (
        result.length === 2 &&
        Array.isArray(result[0]) &&
        typeof result[1] === 'number'
      ) {
        rows = result[0];
        rowCount = result[1];
      } else {
        // SELECT/INSERT format: [rows]
        rows = result;
        rowCount = result.length;
      }
    } else {
      // Single row result
      rows = [result];
      rowCount = 1;
    }

    return {
      rows,
      rowCount,
      command: text.trim().split(/\s+/)[0].toUpperCase() as any,
      fields: [],
      oid: 0,
    } as QueryResult<T>;
  }

  async release(): Promise<void> {
    await this.queryRunner.release();
  }

  // Expose the underlying QueryRunner for cases where direct access is needed
  get underlying(): QueryRunner {
    return this.queryRunner;
  }
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private dataSource!: DataSource;
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

  // In-memory cache for project_id -> organization_id lookups
  // Shared globally across all users/requests (keyed by project_id only)
  // Invalidated on project updates/deletes (future enhancement)
  private readonly orgIdCache = new Map<string, string>();

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {
    // Temporary debug log to understand DI behavior in test harness.
    if (!config) {
      // eslint-disable-next-line no-console
      console.error(
        '[DatabaseService] Constructor received undefined AppConfigService'
      );
    }
  }

  /**
   * Get the raw DataSource for operations that need to bypass tenant RLS context.
   * Used by UserProfileService for authentication operations that happen before tenant context exists.
   * @deprecated Prefer using query() or getClient() for tenant-aware operations
   */
  getPool(): DataSource | null {
    return this.dataSource || null;
  }

  private resolveAppRlsPassword(): string {
    if (!this.config) {
      return 'app_rls_pw';
    }
    try {
      const raw = (this.config as unknown as { appRlsPassword?: unknown })
        .appRlsPassword;
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
      this.logger.error(
        'AppConfigService not injected into DatabaseService – operating in offline mode'
      );
      this.online = false;
      return;
    }
    if (this.config.skipDb) {
      this.logger.warn('SKIP_DB flag set - skipping database initialization');
      this.online = false;
      return;
    }
    try {
      // Import TypeORM DataSource configuration
      const typeormConfigModule = await import('../../typeorm.config');
      const baseDataSource = typeormConfigModule.default;

      // Override config with runtime env vars if provided (allows owner role for migrations)
      if (!baseDataSource.isInitialized) {
        // Apply config overrides before initialization - options are readonly so create new DataSource if needed
        const baseOptions = baseDataSource.options as PostgresConnectionOptions;
        const hasOverrides =
          (this.config.dbHost && this.config.dbHost !== baseOptions.host) ||
          (this.config.dbPort && this.config.dbPort !== baseOptions.port) ||
          (this.config.dbUser && this.config.dbUser !== baseOptions.username) ||
          (this.config.dbPassword &&
            this.config.dbPassword !== baseOptions.password) ||
          (this.config.dbName && this.config.dbName !== baseOptions.database);

        if (hasOverrides) {
          const newOptions = {
            ...baseOptions,
            host: this.config.dbHost || baseOptions.host,
            port: this.config.dbPort || baseOptions.port,
            username: this.config.dbUser || baseOptions.username,
            password: this.config.dbPassword || baseOptions.password,
            database: this.config.dbName || baseOptions.database,
          };
          this.dataSource = new DataSource(newOptions);
        } else {
          this.dataSource = baseDataSource;
        }

        await this.dataSource.initialize();
      } else {
        this.dataSource = baseDataSource;
      }

      // Wait for database to be ready with retries
      await this.waitForDatabase();

      // Run migrations automatically on startup
      if (process.env.SKIP_MIGRATIONS !== '1') {
        await this.runMigrations();
      } else {
        this.logger.log('Skipping migrations (SKIP_MIGRATIONS=1)');
      }

      // Setup RLS policies after migrations
      await this.setupRlsPolicies();

      // Post-schema: switch to non-bypass role (no-op if already non-bypass)
      try {
        await this.switchToRlsApplicationRole();
      } catch (e) {
        this.logger.warn(
          'switchToRlsApplicationRole failed (continuing with current role): ' +
            (e as Error).message
        );
      }
      this.online = true;
    } catch (err) {
      let details = '';
      if (err instanceof AggregateError) {
        const inner =
          err.errors?.map((e) =>
            e instanceof Error
              ? `${e.message}${e.stack ? `\n${e.stack}` : ''}`
              : String(e)
          ) ?? [];
        details = inner.length
          ? `\nInner errors:\n- ${inner.join('\n- ')}`
          : '';
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        'Database initialization failed: ' +
          message +
          (stack ? `\n${stack}` : '') +
          details
      );
      this.online = false;

      // Re-throw to prevent app from starting with broken database
      // The app should not start if database initialization fails
      throw err;
    }
  }

  async onModuleDestroy() {
    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        await this.dataSource.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Wait for database to be ready with exponential backoff.
   * Retries connection until successful or max attempts reached.
   */
  private async waitForDatabase(
    maxAttempts = 30,
    initialDelayMs = 1000
  ): Promise<void> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < maxAttempts) {
      try {
        attempt++;
        this.logger.log(
          `Attempting database connection (${attempt}/${maxAttempts})...`
        );
        await this.dataSource.query('SELECT 1');
        this.logger.log('✓ Database connection successful');
        return;
      } catch (error) {
        const isLastAttempt = attempt >= maxAttempts;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (isLastAttempt) {
          this.logger.error(
            `✗ Database connection failed after ${maxAttempts} attempts: ${errorMessage}`
          );
          throw new Error(
            `Database connection failed after ${maxAttempts} attempts: ${errorMessage}`
          );
        }

        this.logger.warn(
          `Database not ready (attempt ${attempt}/${maxAttempts}): ${errorMessage}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Exponential backoff with cap at 10 seconds
        delay = Math.min(delay * 1.5, 10000);
      }
    }
  }

  /**
   * Run database migrations programmatically using TypeORM DataSource.
   * This ensures consistency between manual migration runs and application startup.
   * Migrations are tracked in typeorm_migrations table.
   * Throws error if migrations fail - app will not start with incomplete schema.
   */
  async runMigrations(): Promise<void> {
    if (!this.dataSource) {
      this.logger.error(
        'Cannot run migrations - database DataSource not initialized'
      );
      throw new Error('Database DataSource not initialized');
    }

    const start = Date.now();
    this.logger.log('Running database migrations...');

    try {
      // Run pending migrations using the existing DataSource
      const migrations = await this.dataSource.runMigrations({
        transaction: 'all', // Run all migrations in a single transaction
      });

      const ms = Date.now() - start;
      if (migrations.length === 0) {
        this.logger.log(`✓ Database schema is up to date (checked in ${ms}ms)`);
      } else {
        this.logger.log(
          `✓ Applied ${migrations.length} migration(s) in ${ms}ms:`
        );
        migrations.forEach((migration: { name: string }) => {
          this.logger.log(`  - ${migration.name}`);
        });
      }
    } catch (error) {
      const ms = Date.now() - start;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `✗ Database migrations failed after ${ms}ms: ${errorMessage}`
      );
      this.logger.error(
        'Application cannot start with incomplete database schema.'
      );
      this.logger.error(
        'Fix: Review migration errors above and resolve schema conflicts.'
      );

      throw new Error(`Migration failed: ${errorMessage}`);
    }
  }

  /**
   * Setup Row-Level Security (RLS) policies for graph tables.
   * This method:
   * 1. Enables RLS on graph_objects and graph_relationships tables
   * 2. Creates canonical policies for SELECT, INSERT, UPDATE, DELETE operations
   * 3. Policies filter data based on app.current_project_id session variable
   */
  private async setupRlsPolicies(): Promise<void> {
    if (!this.dataSource) {
      this.logger.error(
        'Cannot setup RLS policies - DataSource not initialized'
      );
      return;
    }

    try {
      this.logger.log('Setting up RLS policies...');

      // Enable RLS on tables
      await this.dataSource.query(`
        DO $$ BEGIN
          ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;
          ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;
          BEGIN EXECUTE 'ALTER TABLE kb.graph_objects FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
          BEGIN EXECUTE 'ALTER TABLE kb.graph_relationships FORCE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN END;
        END $$;
      `);

      // Define the policy predicate for multi-tenant isolation
      // Graph tables only have project_id (not organization_id), so we filter by project context only
      // No context set = see all (for system operations/admin)
      // Project set = see only that project's objects
      const graphPolicyPredicate =
        "(COALESCE(current_setting('app.current_project_id', true),'') = '' OR project_id::text = current_setting('app.current_project_id', true))";

      // Create policies using the existing method
      await this.ensureCanonicalGraphPolicies(
        (sql: string) => this.dataSource!.query(sql),
        '[RLS Setup]',
        graphPolicyPredicate
      );

      // Verify policies were created
      const result = await this.dataSource.query<{ policyname: string }>(
        "SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')"
      );
      const policyCount = Array.isArray(result) ? result.length : 0;

      if (policyCount === 8) {
        this.logger.log(
          `✓ RLS policies setup complete (${policyCount} policies created)`
        );
      } else {
        this.logger.warn(
          `⚠ RLS policies incomplete: expected 8, got ${policyCount}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`✗ RLS policy setup failed: ${errorMessage}`);
      // Don't throw - allow application to start but log the error
      // Tests will catch this via health check
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    if (!this.dataSource) {
      await this.lazyInit();
    }
    if (!this.online) {
      return {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        fields: [],
        oid: 0,
      } as unknown as QueryResult<T>;
    }
    // If tenant context has been set, ensure the executing session has the
    // correct GUCs before running the user query. We cannot rely on a prior
    // set_config call because the connection pool may give us a different connection.
    const store = this.tenantContextStorage.getStore();
    const effectiveOrgRaw = store?.orgId ?? this.currentOrgId ?? null;
    const effectiveProjectRaw =
      store?.projectId ?? this.currentProjectId ?? null;
    const hasContext =
      store !== undefined ||
      this.currentOrgId !== undefined ||
      this.currentProjectId !== undefined;
    if (hasContext) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      // Start explicit transaction to ensure set_config and query execute in same transaction context
      // This is critical for RLS enforcement - transaction-local config only applies within the transaction
      await queryRunner.startTransaction();

      try {
        const effectiveOrg = effectiveOrgRaw ?? '';
        const effectiveProject = effectiveProjectRaw ?? '';
        const wildcard = effectiveOrg === '' && effectiveProject === '';
        if (process.env.DEBUG_TENANT === 'true') {
          // eslint-disable-next-line no-console
          console.log('[db.query][set_config]', {
            org: effectiveOrg,
            project: effectiveProject,
            rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)',
          });
        }
        // Use true for local (transaction-scoped) rather than false (session-scoped)
        // This prevents tenant context pollution across connection pool reuse
        // The explicit transaction above ensures this config applies to the subsequent query
        await queryRunner.query(
          'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
          [
            'app.current_organization_id',
            effectiveOrg,
            'app.current_project_id',
            effectiveProject,
            'row_security',
            'on',
          ]
        );
        if (process.env.DEBUG_TENANT === 'true') {
          // eslint-disable-next-line no-console
          console.log('[db.query][execute]', {
            text,
            org: effectiveOrg,
            project: effectiveProject,
            rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)',
          });
        }
        const result = await queryRunner.query(text, params);

        // Commit transaction - config is automatically discarded after commit (transaction-local)
        await queryRunner.commitTransaction();

        // Convert TypeORM result format to pg QueryResult format
        // TypeORM's behavior for different query types:
        // - SELECT/INSERT...RETURNING: returns array of rows directly: [{...}, {...}]
        // - UPDATE...RETURNING: returns [rows_array, affected_count]: [[{...}], 1]
        // - DELETE/UPDATE without RETURNING: returns [[], affected_count]

        let rows: T[];
        let rowCount: number;

        if (Array.isArray(result)) {
          // Check if this is the UPDATE...RETURNING format: [[rows], count]
          if (
            result.length === 2 &&
            Array.isArray(result[0]) &&
            typeof result[1] === 'number'
          ) {
            // UPDATE...RETURNING format: extract rows from nested array
            rows = result[0];
            rowCount = result[1]; // Use actual affected count from TypeORM
          } else {
            // SELECT/INSERT...RETURNING format: use array directly
            rows = result;
            rowCount = result.length;
          }
        } else {
          // Single object result (shouldn't happen, but handle it)
          rows = [result];
          rowCount = 1;
        }

        return {
          rows,
          rowCount,
          command: text.trim().split(/\s+/)[0].toUpperCase() as any,
          fields: [],
          oid: 0,
        } as unknown as QueryResult<T>;
      } finally {
        await queryRunner.release();
      }
    }
    const result = await this.dataSource.query(text, params);

    // Convert TypeORM result format to pg QueryResult format
    // TypeORM's behavior for different query types:
    // - SELECT/INSERT...RETURNING: returns array of rows directly: [{...}, {...}]
    // - UPDATE...RETURNING: returns [rows_array, affected_count]: [[{...}], 1]
    // - DELETE/UPDATE without RETURNING: returns [[], affected_count]

    let rows: T[];
    let rowCount: number;

    if (Array.isArray(result)) {
      // Check if this is the UPDATE...RETURNING format: [[rows], count]
      if (
        result.length === 2 &&
        Array.isArray(result[0]) &&
        typeof result[1] === 'number'
      ) {
        // UPDATE...RETURNING format: extract rows from nested array
        rows = result[0];
        rowCount = result[1]; // Use actual affected count from TypeORM
      } else {
        // SELECT/INSERT...RETURNING format: use array directly
        rows = result;
        rowCount = result.length;
      }
    } else {
      // Single object result (shouldn't happen, but handle it)
      rows = [result];
      rowCount = 1;
    }

    return {
      rows,
      rowCount,
      command: text.trim().split(/\s+/)[0].toUpperCase() as any,
      fields: [],
      oid: 0,
    } as unknown as QueryResult<T>;
  }

  /**
   * Execute a query and return exactly one row, or throw NotFoundException.
   *
   * Eliminates the common pattern of:
   * ```ts
   * const result = await this.db.query('SELECT...', [id]);
   * if (!result.rowCount) throw new NotFoundException(`Entity ${id} not found`);
   * return result.rows[0];
   * ```
   *
   * @param text - SQL query text
   * @param params - Query parameters
   * @param notFoundMessage - Error message or function that generates message from params
   * @returns The single row result
   * @throws NotFoundException if no rows returned
   *
   * @example
   * const job = await this.db.queryOneOrFail<Job>(
   *   'SELECT * FROM kb.jobs WHERE id = $1',
   *   [jobId],
   *   `Job ${jobId} not found`
   * );
   *
   * @example
   * // With dynamic message
   * const job = await this.db.queryOneOrFail<Job>(
   *   'SELECT * FROM kb.jobs WHERE id = $1',
   *   [jobId],
   *   (params) => `Job ${params[0]} not found`
   * );
   */
  async queryOneOrFail<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: any[],
    notFoundMessage: string | ((params: any[]) => string)
  ): Promise<T> {
    // Import NotFoundException here to avoid circular dependencies
    const { NotFoundException } = await import('@nestjs/common');

    const result = await this.query<T>(text, params);
    if (!result.rowCount || !result.rows[0]) {
      const message =
        typeof notFoundMessage === 'function'
          ? notFoundMessage(params)
          : notFoundMessage;
      throw new NotFoundException(message);
    }
    return result.rows[0];
  }

  /**
   * Execute a function within a database transaction with automatic rollback on error.
   *
   * Eliminates the common pattern of:
   * ```ts
   * const client = await this.db.getClient();
   * try {
   *   await client.query('BEGIN');
   *   // ... work ...
   *   await client.query('COMMIT');
   *   return result;
   * } catch (error) {
   *   await client.query('ROLLBACK');
   *   throw error;
   * } finally {
   *   client.release();
   * }
   * ```
   *
   * @param fn - Async function to execute within transaction. Receives the client for queries.
   * @returns The return value of the function
   * @throws Re-throws any error from the function after rollback
   *
   * @example
   * const result = await this.db.withTransaction(async (client) => {
   *   await client.query('INSERT INTO kb.objects ...', [...]);
   *   await client.query('INSERT INTO kb.relationships ...', [...]);
   *   return { success: true };
   * });
   */
  async withTransaction<T>(
    fn: (client: QueryRunnerAdapter) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.release();
    }
  }

  async getClient(): Promise<QueryRunnerAdapter> {
    if (!this.dataSource) {
      await this.lazyInit();
    }
    // After lazy init the dataSource may still be undefined when SKIP_DB was set at process start.
    // Previously this produced a TypeError (reading 'connect' of undefined) which masked the
    // underlying configuration issue and surfaced as opaque 500s across many endpoints.
    if (!this.dataSource) {
      throw new Error(
        'Database disabled (SKIP_DB set) – transactional operation not permitted. Unset SKIP_DB or run with DB_AUTOINIT=true for tests.'
      );
    }
    if (!this.online) {
      throw new Error(
        'Database offline – cannot acquire client. Check connectivity or initialization logs.'
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
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
          rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)',
        });
      }
      // Use true for local (transaction-scoped) rather than false (session-scoped)
      // This prevents tenant context pollution across connection pool reuse
      await queryRunner.query(
        'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
        [
          'app.current_organization_id',
          orgId,
          'app.current_project_id',
          projectId,
          'row_security',
          'on',
        ]
      );
    } catch (err) {
      await queryRunner.release();
      throw err;
    }
    return new QueryRunnerAdapter(queryRunner);
  }

  isOnline() {
    return this.online;
  }

  /**
   * Lazy initialization path invoked if consumers call getClient()/query before Nest calls onModuleInit.
   * This occurs in some test harnesses that instantiate providers manually. Keeps semantics idempotent.
   */
  private async lazyInit() {
    if (this.dataSource || this.initializing || this.config.skipDb) {
      if (!this.dataSource && this.config.skipDb) {
        // Explicitly skipped DB – leave dataSource undefined; callers should rely on offline guards.
        this.online = false;
      }
      if (this.initializing) await this.initializing; // wait existing attempt
      return;
    }
    this.initializing = (async () => {
      try {
        // Import TypeORM DataSource configuration
        const typeormConfigModule = await import('../../typeorm.config');
        const baseDataSource = typeormConfigModule.default;

        // Apply config overrides before initialization - options are readonly so create new DataSource if needed
        const baseOptions = baseDataSource.options as PostgresConnectionOptions;
        const hasOverrides =
          (this.config.dbHost && this.config.dbHost !== baseOptions.host) ||
          (this.config.dbPort && this.config.dbPort !== baseOptions.port) ||
          (this.config.dbUser && this.config.dbUser !== baseOptions.username) ||
          (this.config.dbPassword &&
            this.config.dbPassword !== baseOptions.password) ||
          (this.config.dbName && this.config.dbName !== baseOptions.database);

        if (hasOverrides) {
          const newOptions = {
            ...baseOptions,
            host: this.config.dbHost || baseOptions.host,
            port: this.config.dbPort || baseOptions.port,
            username: this.config.dbUser || baseOptions.username,
            password: this.config.dbPassword || baseOptions.password,
            database: this.config.dbName || baseOptions.database,
          };
          this.dataSource = new DataSource(newOptions);
        } else {
          this.dataSource = baseDataSource;
        }

        if (!this.dataSource.isInitialized) {
          await this.dataSource.initialize();
        }

        await this.dataSource.query('SELECT 1');
        // Schema is now managed entirely by migrations (no ensureSchema)
        try {
          await this.switchToRlsApplicationRole();
        } catch (e) {
          this.logger.warn(
            'switchToRlsApplicationRole (lazy) failed: ' + (e as Error).message
          );
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
  private async switchToRlsApplicationRole() {
    if (!this.dataSource) return;
    const res = await this.dataSource.query(
      `SELECT rolbypassrls as bypass, rolsuper as super, rolname as user FROM pg_roles WHERE rolname = current_user`
    );
    const row = res[0] as { bypass: boolean; super: boolean; user: string };
    // Treat superuser the same as bypass for RLS purposes (superuser always bypasses policies)
    if (row && !row.bypass && !row.super) {
      this.logger.log(
        `[DatabaseService] Using non-bypass role '${row.user}' (bypass=${row.bypass}, super=${row.super}) – no switch needed`
      );
      return; // already safe
    }
    this.logger.log(
      `[DatabaseService] Switching from bypass/superuser role '${row?.user}' (bypass=${row?.bypass}, super=${row?.super}) to dedicated 'app_rls' role for RLS enforcement`
    );
    // Create role if missing
    const appRlsPassword = this.resolveAppRlsPassword();
    const roleExists = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rls')`
    );
    const existsRow = roleExists[0] as { exists: boolean };
    if (!existsRow?.exists) {
      const escapedPasswordForCreate = appRlsPassword.replace(/'/g, "''");
      await this.dataSource.query(
        `CREATE ROLE app_rls LOGIN PASSWORD '${escapedPasswordForCreate}'`
      );
    }
    // Grant privileges (idempotent)
    await this.dataSource.query(`GRANT USAGE ON SCHEMA kb TO app_rls`);
    await this.dataSource.query(`GRANT CREATE ON SCHEMA kb TO app_rls`);
    await this.dataSource.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kb TO app_rls`
    );
    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA kb GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls`
    );
    // Grant access to core.user_profiles for user profile creation during authentication
    await this.dataSource.query(`GRANT USAGE ON SCHEMA core TO app_rls`);
    await this.dataSource.query(`GRANT CREATE ON SCHEMA core TO app_rls`);
    await this.dataSource.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON core.user_profiles TO app_rls`
    );
    await this.dataSource.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON core.user_emails TO app_rls`
    );
    // Rotate password each startup so updating APP_RLS_PASSWORD takes effect without manual intervention.
    try {
      // ALTER ROLE doesn't support parameterized queries, so we must use string literal
      // Escape single quotes in password by doubling them (SQL standard)
      const escapedPassword = appRlsPassword.replace(/'/g, "''");
      await this.dataSource.query(
        `ALTER ROLE app_rls PASSWORD '${escapedPassword}'`
      );
      this.logger.log('[DatabaseService] Rotated password for role app_rls');
    } catch (e) {
      this.logger.warn(
        '[DatabaseService] Failed to rotate password for app_rls: ' +
          (e as Error).message
      );
    }
    // Recreate DataSource with app_rls credentials
    await this.dataSource.destroy();
    const baseOptions = this.dataSource.options as PostgresConnectionOptions;
    const newOptions = {
      ...baseOptions,
      username: 'app_rls',
      password: appRlsPassword,
    };
    this.dataSource = new DataSource(newOptions);
    await this.dataSource.initialize();
    await this.dataSource.query('SELECT 1');
    // Log confirmation of new role status
    try {
      const verify = await this.dataSource.query(
        `SELECT current_user as user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) as bypass, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) as super`
      );
      const v = verify[0] as { user: string; bypass: boolean; super: boolean };
      this.logger.log(
        `[DatabaseService] Now running as role '${v.user}' (bypass=${v.bypass}, super=${v.super}) with graph_objects RLS enforced`
      );
    } catch (e) {
      this.logger.warn(
        '[DatabaseService] Failed to verify switched role: ' +
          (e as Error).message
      );
    }
  }

  /** Return shallow copy of internal metrics (primarily for tests / debug). */
  getMetrics() {
    return { ...this.metrics };
  }

  /** Lightweight status summary of current RLS policy set (used by health endpoint & ops). */
  async getRlsPolicyStatus(): Promise<{
    policies_ok: boolean;
    count: number;
    hash: string | null;
  }> {
    if (!this.dataSource || !this.online)
      return { policies_ok: false, count: 0, hash: null };
    try {
      const result = await this.dataSource.query<{ policyname: string }>(
        `SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')`
      );
      const rows = Array.isArray(result) ? result : [result];
      const names = rows.map((r: any) => r.policyname).sort();
      const expected = [
        'graph_objects_delete',
        'graph_objects_insert',
        'graph_objects_select',
        'graph_objects_update',
        'graph_relationships_delete',
        'graph_relationships_insert',
        'graph_relationships_select',
        'graph_relationships_update',
      ].sort();
      const ok =
        names.length === expected.length &&
        names.every((v: any, i: any) => v === expected[i]);
      // Simple hash (stable) without pulling crypto for lightweight status: join + length; crypto not required here.
      const hash =
        'policies:' +
        names.join(',').length +
        ':' +
        names
          .join(',')
          .split('')
          .reduce((a: any, c: any) => (a + c.charCodeAt(0)) % 65536, 0)
          .toString(16);
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
      existingStore.base = {
        orgId: normalizedOrg,
        projectId: normalizedProject,
      };
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

  private async applyTenantContext(
    orgId: string | null,
    projectId: string | null
  ) {
    this.currentOrgId = orgId;
    this.currentProjectId = projectId;
    if (!this.dataSource) {
      await this.lazyInit();
    }
    if (!this.dataSource) return; // DB disabled
    try {
      const orgSetting = orgId ?? '';
      const projectSetting = projectId ?? '';
      // Use true for local (transaction-scoped) rather than false (session-scoped)
      // This prevents tenant context pollution across connection pool reuse
      await this.dataSource.query(
        'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
        [
          'app.current_organization_id',
          orgSetting,
          'app.current_project_id',
          projectSetting,
          'row_security',
          'on',
        ]
      );
    } catch {
      /* ignore */
    }
  }

  private getCanonicalGraphPolicies(
    graphPolicyPredicate: string
  ): readonly GraphPolicyDefinition[] {
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

  private async ensureCanonicalGraphPolicies(
    executeSql: (sql: string) => Promise<unknown>,
    scopeLabel: string,
    graphPolicyPredicate: string
  ) {
    if (!this.dataSource) return;
    const canonical = this.getCanonicalGraphPolicies(graphPolicyPredicate);
    const canonicalKeys = new Set(canonical.map((p) => `${p.table}:${p.name}`));
    const normalizePredicate = (expr: string | null | undefined) => {
      const compact = (expr ?? '').replace(/\s+/g, '').toLowerCase();
      return compact === 'true' ? '' : compact;
    };
    const mapCommand = (
      value: string | null | undefined
    ): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | null => {
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
    const fetchPolicies = async () => {
      const result = await this.dataSource!.query<{
        policyname: string;
        tablename: string;
        command: string | null;
        qual: string | null;
        with_check: string | null;
      }>(
        "SELECT policyname, tablename, cmd AS command, qual, with_check FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships')"
      );
      const rows = Array.isArray(result) ? result : [result];
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT' as any,
        fields: [],
        oid: 0,
      };
    };

    // Drop any legacy policies that are no longer part of the canonical set
    const existingRes = await fetchPolicies();
    const existingMap = new Map(
      existingRes.rows.map((row: PgPolicyRow) => [
        `${row.tablename}:${row.policyname}`,
        row,
      ])
    );
    for (const row of existingRes.rows) {
      const key = `${row.tablename}:${row.policyname}`;
      if (!canonicalKeys.has(key)) {
        try {
          await executeSql(
            `DROP POLICY IF EXISTS ${row.policyname} ON kb.${row.tablename}`
          );
          existingMap.delete(key);
        } catch (dropErr) {
          this.logger.warn(
            `${scopeLabel} drop legacy policy '${row.policyname}' failed: ${
              (dropErr as Error).message
            }`
          );
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
          this.logger.error(
            `${scopeLabel} failed to create policy ${policy.name}: ${
              (createErr as Error).message
            }`
          );
          throw createErr;
        }
        continue;
      }
      const existingCommand = mapCommand(existing.command);
      if (existingCommand !== policy.command) {
        try {
          await executeSql(
            `DROP POLICY IF EXISTS ${policy.name} ON kb.${policy.table}`
          );
          await executeSql(policy.sql);
        } catch (recreateErr) {
          this.logger.error(
            `${scopeLabel} failed to recreate policy ${policy.name}: ${
              (recreateErr as Error).message
            }`
          );
          throw recreateErr;
        }
        continue;
      }
      const expectedUsing = normalizePredicate(policy.using);
      const expectedCheck = normalizePredicate(policy.withCheck);
      const actualUsing = normalizePredicate(existing.qual);
      const actualCheck = normalizePredicate(existing.with_check);
      const requiresDrop =
        (!policy.using && actualUsing) || (!policy.withCheck && actualCheck);
      if (requiresDrop) {
        try {
          await executeSql(
            `DROP POLICY IF EXISTS ${policy.name} ON kb.${policy.table}`
          );
          await executeSql(policy.sql);
        } catch (resetErr) {
          this.logger.error(
            `${scopeLabel} failed to reset policy ${policy.name}: ${
              (resetErr as Error).message
            }`
          );
          throw resetErr;
        }
        continue;
      }
      const needsUsingUpdate =
        policy.using !== null && actualUsing !== expectedUsing;
      const needsCheckUpdate =
        policy.withCheck !== null && actualCheck !== expectedCheck;
      if (needsUsingUpdate || needsCheckUpdate) {
        const clauses: string[] = [];
        if (policy.using !== null) {
          clauses.push(`USING (${policy.using})`);
        }
        if (policy.withCheck !== null) {
          clauses.push(`WITH CHECK (${policy.withCheck})`);
        }
        try {
          await executeSql(
            `ALTER POLICY ${policy.name} ON kb.${policy.table} ${clauses.join(
              ' '
            )}`
          );
        } catch (alterErr) {
          this.logger.error(
            `${scopeLabel} failed to alter policy ${policy.name}: ${
              (alterErr as Error).message
            }`
          );
          throw alterErr;
        }
      }
    }

    // Final verification pass to ensure canonical set is present
    const postEnsure = await fetchPolicies();
    const finalKeys = new Set(
      postEnsure.rows.map((r: PgPolicyRow) => `${r.tablename}:${r.policyname}`)
    );
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

  /**
   * Derive organization ID from project ID using database lookup with in-memory caching.
   * Returns null if project not found.
   *
   * @param projectId - The project UUID to lookup
   * @returns The organization UUID or null if not found
   */
  async getOrgIdFromProjectId(projectId: string): Promise<string | null> {
    // Check cache first
    const cached = this.orgIdCache.get(projectId);
    if (cached !== undefined) {
      return cached;
    }

    // Database lookup (bypass tenant context for lookup query)
    if (!this.dataSource || !this.online) {
      return null;
    }

    try {
      const result = await this.dataSource.query(
        'SELECT organization_id::text FROM kb.projects WHERE id = $1',
        [projectId]
      );

      if (result && result.length > 0 && result[0].organization_id) {
        const orgId = result[0].organization_id;
        // Cache the result
        this.orgIdCache.set(projectId, orgId);
        return orgId;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to lookup organization ID for project ${projectId}: ${
          (error as Error).message
        }`
      );
      return null;
    }
  }

  /**
   * Clear cached organization ID for a project.
   * Should be called when projects are updated or deleted.
   *
   * @param projectId - The project UUID to invalidate
   */
  clearOrgIdCache(projectId?: string): void {
    if (projectId) {
      this.orgIdCache.delete(projectId);
    } else {
      // Clear entire cache if no specific project provided
      this.orgIdCache.clear();
    }
  }

  async runWithTenantContext<T>(
    projectId: string | null | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    const normalizedProject = projectId ?? null;

    // Derive organization ID from project ID
    let normalizedOrg: string | null = null;
    if (normalizedProject) {
      normalizedOrg = await this.getOrgIdFromProjectId(normalizedProject);
      if (!normalizedOrg) {
        this.logger.warn(
          `Project ${normalizedProject} not found - proceeding with null org context`
        );
      }
    }

    const parentStore = this.tenantContextStorage.getStore();
    const parentFrames = parentStore?.frames ?? [];
    const originalOrg = this.currentOrgId;
    const originalProject = this.currentProjectId;
    const nextStore: TenantStore = {
      base: parentStore?.base ?? null,
      frames: [
        ...parentFrames,
        { orgId: normalizedOrg, projectId: normalizedProject },
      ],
      orgId: normalizedOrg,
      projectId: normalizedProject,
    };

    return this.tenantContextStorage.run(nextStore, async () => {
      await this.applyTenantContext(normalizedOrg, normalizedProject);
      try {
        return await fn();
      } finally {
        const fallbackOrg =
          parentStore?.orgId ??
          parentStore?.base?.orgId ??
          (originalOrg !== undefined ? originalOrg : null);
        const fallbackProject =
          parentStore?.projectId ??
          parentStore?.base?.projectId ??
          (originalProject !== undefined ? originalProject : null);
        if (
          this.currentOrgId !== fallbackOrg ||
          this.currentProjectId !== fallbackProject
        ) {
          await this.applyTenantContext(fallbackOrg, fallbackProject);
        }
      }
    });
  }
}
