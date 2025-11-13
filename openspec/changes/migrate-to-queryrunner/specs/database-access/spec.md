# Database Access Specification

## ADDED Requirements

### Requirement: TypeORM-Based Database Access

The DatabaseService SHALL provide database access using TypeORM DataSource and QueryRunner instead of direct PostgreSQL driver (pg Pool/PoolClient).

#### Scenario: Execute raw SQL query

- **WHEN** a service calls `databaseService.query(sql, params)`
- **THEN** the query SHALL be executed via TypeORM DataSource.query()
- **AND** the result SHALL maintain the same QueryResult structure as before

#### Scenario: Acquire transactional client

- **WHEN** a service calls `databaseService.getClient()`
- **THEN** a TypeORM QueryRunner SHALL be returned
- **AND** the QueryRunner SHALL be connected and ready for use
- **AND** RLS tenant context SHALL be applied before returning

#### Scenario: Check database connectivity

- **WHEN** a service calls `databaseService.isOnline()`
- **THEN** the method SHALL return true if TypeORM DataSource is initialized and connected
- **AND** the method SHALL return false otherwise

### Requirement: RLS Tenant Context with QueryRunner

The DatabaseService SHALL apply Row Level Security tenant context using TypeORM QueryRunner connections.

#### Scenario: Set tenant context before query execution

- **WHEN** tenant context has been set via `setTenantContext(orgId, projectId)`
- **AND** a query is executed via `query()` or `getClient()`
- **THEN** the session variables `app.current_organization_id` and `app.current_project_id` SHALL be set via `set_config()`
- **AND** the session variable `row_security` SHALL be set to 'on'

#### Scenario: Query with temporary QueryRunner maintains tenant context

- **WHEN** `query()` is called with active tenant context
- **AND** no explicit transaction is active
- **THEN** a temporary QueryRunner SHALL be created
- **AND** tenant context SHALL be applied to that QueryRunner
- **AND** the query SHALL execute with correct RLS isolation
- **AND** the QueryRunner SHALL be released after query completion

#### Scenario: Reusable QueryRunner maintains tenant context

- **WHEN** `getClient()` is called to obtain a QueryRunner
- **THEN** tenant context SHALL be applied via `set_config()` before returning
- **AND** subsequent queries on that QueryRunner SHALL inherit the context
- **AND** the context SHALL persist until QueryRunner is released

### Requirement: Transaction Management with QueryRunner

Services SHALL use TypeORM QueryRunner for database transactions instead of PoolClient.

#### Scenario: Start transaction

- **WHEN** a service obtains a QueryRunner via `getClient()`
- **AND** calls `queryRunner.startTransaction()`
- **THEN** a database transaction SHALL begin
- **AND** subsequent queries on that QueryRunner SHALL be part of the transaction

#### Scenario: Commit transaction

- **WHEN** a transaction is active on a QueryRunner
- **AND** the service calls `queryRunner.commitTransaction()`
- **THEN** all changes SHALL be committed to the database
- **AND** the transaction SHALL end

#### Scenario: Rollback transaction

- **WHEN** a transaction is active on a QueryRunner
- **AND** the service calls `queryRunner.rollbackTransaction()`
- **THEN** all changes SHALL be rolled back
- **AND** the transaction SHALL end

#### Scenario: Release QueryRunner

- **WHEN** a service is done with a QueryRunner
- **AND** calls `queryRunner.release()`
- **THEN** the underlying connection SHALL be returned to the pool
- **AND** the QueryRunner SHALL no longer be usable

### Requirement: Database Service Lifecycle

The DatabaseService SHALL manage TypeORM DataSource lifecycle during application startup and shutdown.

#### Scenario: Initialize DataSource on module init

- **WHEN** NestJS calls `databaseService.onModuleInit()`
- **THEN** the TypeORM DataSource SHALL be initialized if not already initialized
- **AND** database connectivity SHALL be verified with retries
- **AND** migrations SHALL be run automatically (unless SKIP_MIGRATIONS=1)
- **AND** the service SHALL switch to RLS application role if using bypass role
- **AND** the service SHALL mark itself as online

#### Scenario: Handle initialization failure

- **WHEN** DataSource initialization fails during `onModuleInit()`
- **THEN** detailed error logging SHALL occur
- **AND** the service SHALL mark itself as offline
- **AND** an error SHALL be thrown to prevent application startup

#### Scenario: Cleanup on module destroy

- **WHEN** NestJS calls `databaseService.onModuleDestroy()`
- **AND** the TypeORM DataSource is initialized
- **THEN** the DataSource SHALL be destroyed gracefully
- **AND** all connections SHALL be closed

### Requirement: Backward Compatibility

The DatabaseService SHALL maintain API compatibility for existing consumers during migration.

#### Scenario: Maintain query method signature

- **WHEN** code calls `databaseService.query<T>(sql, params)`
- **THEN** the method signature SHALL remain unchanged
- **AND** the return type SHALL remain `Promise<QueryResult<T>>`
- **AND** the behavior SHALL be functionally equivalent to previous implementation

#### Scenario: Support wildcard tenant context

- **WHEN** `setTenantContext()` is called with null/undefined for both orgId and projectId
- **THEN** wildcard RLS context SHALL be enabled (empty string GUCs)
- **AND** queries SHALL have access to all data (subject to role permissions)

#### Scenario: Handle offline database gracefully

- **WHEN** the database is offline or SKIP_DB flag is set
- **AND** code calls `query()`
- **THEN** an empty result set SHALL be returned without throwing errors
- **AND** `isOnline()` SHALL return false

### Requirement: Test Infrastructure Support

Test utilities SHALL support TypeORM QueryRunner patterns for E2E and integration tests.

#### Scenario: E2E test setup with TypeORM

- **WHEN** E2E tests initialize database context
- **THEN** TypeORM DataSource SHALL be created with test database credentials
- **AND** the DataSource SHALL be available for test fixtures
- **AND** migrations SHALL run automatically during setup

#### Scenario: Cleanup between E2E tests

- **WHEN** an E2E test completes
- **THEN** QueryRunner instances SHALL be released
- **AND** test data SHALL be cleaned up via transactions or truncation
- **AND** tenant context SHALL be reset for the next test

#### Scenario: Mock DatabaseService in unit tests

- **WHEN** unit tests mock DatabaseService
- **THEN** `query()` SHALL be mockable and return test data
- **AND** `getClient()` SHALL be mockable and return a mock QueryRunner
- **AND** RLS context methods SHALL be mockable

### Requirement: Advisory Lock Support

The advisory lock utility SHALL work with TypeORM QueryRunner instead of PoolClient.

#### Scenario: Acquire advisory lock with QueryRunner

- **WHEN** code calls `withAdvisoryLock(queryRunner, lockId, fn)`
- **THEN** a PostgreSQL advisory lock SHALL be acquired via `pg_advisory_lock()`
- **AND** the function `fn` SHALL execute while lock is held
- **AND** the lock SHALL be released via `pg_advisory_unlock()` after completion

#### Scenario: Handle lock acquisition failure

- **WHEN** advisory lock acquisition times out
- **THEN** an error SHALL be thrown
- **AND** the QueryRunner SHALL remain in a usable state

## MODIFIED Requirements

_None - this is a new capability specification._

## REMOVED Requirements

_None - this change adds new patterns without removing old ones during migration._
