# database-access Specification

## Purpose
TBD - created by archiving change migrate-to-queryrunner. Update Purpose after archive.
## Requirements
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

### Requirement: Hybrid Search Quality Tests

The test suite SHALL validate hybrid search quality with deterministic fixtures and quality metrics.

#### Scenario: Hybrid search outperforms single-mode search

- **GIVEN** test documents with both strong lexical signals (repeated terms) and semantic signals (embedded concepts)
- **WHEN** the same query is executed in lexical, vector, and hybrid modes
- **THEN** hybrid mode SHALL return the most relevant document first
- **AND** hybrid mode SHALL have higher average relevance than lexical-only
- **AND** hybrid mode SHALL have higher average relevance than vector-only

#### Scenario: Validate hybrid search response structure

- **GIVEN** a hybrid search query
- **WHEN** results are returned
- **THEN** each result SHALL include `id`, `snippet`, `score`, and `source` fields
- **AND** `mode` SHALL be "hybrid" (or "lexical" if embeddings disabled)
- **AND** scores SHALL be normalized between 0.0 and 1.0
- **AND** results SHALL be ordered by descending score

#### Scenario: Measure hybrid search performance

- **GIVEN** a test dataset of 50 documents
- **WHEN** hybrid search is executed with limit=10
- **THEN** query completion time SHALL be less than 500ms
- **AND** response SHALL include query_time_ms metadata
- **AND** performance SHALL be consistent across repeated queries

### Requirement: Graph Search with Relationships Tests

The test suite SHALL validate graph search returns objects with relationships correctly.

#### Scenario: Graph search returns relevant objects

- **GIVEN** a test graph with typed objects (Decision, Requirement, Issue)
- **AND** objects have properties matching search queries
- **WHEN** graph hybrid search is executed
- **THEN** matching objects SHALL be returned with correct types
- **AND** results SHALL include object properties in `fields`
- **AND** results SHALL be ranked by hybrid search score

#### Scenario: Traverse retrieves multi-hop relationships

- **GIVEN** a graph with object chain A → B → C (depends_on relationships)
- **WHEN** `/graph/traverse` is called with root_ids=[A] and max_depth=2
- **THEN** nodes SHALL include objects A, B, and C
- **AND** edges SHALL include both A→B and B→C relationships
- **AND** relationship metadata SHALL include type and direction

#### Scenario: Expand includes relationship properties

- **GIVEN** relationships with custom properties (weight, confidence)
- **WHEN** `/graph/expand` is called with `include_relationship_properties: true`
- **THEN** returned edges SHALL include relationship property objects
- **AND** properties SHALL match stored relationship metadata

#### Scenario: Search-with-neighbors combines search and expansion

- **GIVEN** graph objects with semantic similarity and direct relationships
- **WHEN** `/graph/search-with-neighbors` is called with `includeNeighbors: true`
- **THEN** `primaryResults` SHALL include objects matching search query
- **AND** `neighbors` map SHALL include related objects for each primary result
- **AND** neighbors SHALL be limited by `maxNeighbors` parameter

### Requirement: Context Quality Validation

Tests SHALL verify that search results provide adequate context for AI and human consumption.

#### Scenario: Validate snippet relevance

- **GIVEN** a search query with specific terms
- **WHEN** text search returns results
- **THEN** snippet SHALL contain query terms (for lexical/hybrid mode)
- **AND** snippet SHALL be 200-500 characters (human-readable length)
- **AND** snippet SHALL include surrounding context, not just isolated terms

#### Scenario: Verify graph object completeness

- **GIVEN** graph objects with multiple properties (title, description, status)
- **WHEN** graph search returns objects
- **THEN** `fields` SHALL include all non-null object properties
- **AND** properties SHALL match database values exactly
- **AND** no critical fields SHALL be omitted

#### Scenario: Validate relationship context

- **GIVEN** objects with relationships to other typed entities
- **WHEN** relationships are expanded
- **THEN** target objects SHALL include sufficient fields for display (at minimum: id, type, key/title)
- **AND** relationship type SHALL be human-readable (e.g., "depends_on" not "REL_001")

