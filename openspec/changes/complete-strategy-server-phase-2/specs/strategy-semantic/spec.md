## MODIFIED Requirements

### Requirement: Strategy Graph Ingestion

The system SHALL ingest committed strategy mutations into a self-hosted
emergent.memory instance, keeping the semantic graph in sync with the PostgreSQL
ledger.

#### Scenario: Ingest on commit
- **WHEN** a batch is committed
- **THEN** the newly committed artifacts are asynchronously ingested into the co-located Memory instance
- **AND** ingestion failure does not roll back the commit
- **AND** ingestion errors are logged and retried with exponential backoff

#### Scenario: Full re-ingest
- **WHEN** an operator triggers a full re-ingest for an instance
- **THEN** all current committed mutations are ingested (upsert semantics)
- **AND** the graph reflects the current state of the PostgreSQL ledger after completion

#### Scenario: Memory unavailable
- **WHEN** the Memory server is unreachable during ingestion
- **THEN** the ingestion job is retried with exponential backoff
- **AND** the instance's `memory_sync_status` reflects the last successful sync point
- **AND** core CRUD operations continue to function without degradation

#### Scenario: Schema bootstrap
- **WHEN** the strategy-server starts
- **THEN** it verifies the Memory project has the required EPF schemas installed
- **AND** installs missing schemas automatically

---

## ADDED Requirements

### Requirement: Self-Hosted Memory Deployment

The system SHALL deploy emergent.memory as a co-located service alongside
strategy-server, under the operator's full control.

#### Scenario: Docker Compose deployment
- **WHEN** an operator runs `docker-compose up`
- **THEN** both strategy-server and Memory server start
- **AND** Memory connects to the configured Postgres instance
- **AND** strategy-server connects to Memory via localhost REST API

#### Scenario: Shared Postgres mode
- **WHEN** `STRATEGY_DB_MODE=shared`
- **THEN** strategy-server and Memory share a single Postgres instance
- **AND** strategy-server tables reside in the `strategy` schema
- **AND** Memory tables reside in `core` and `kb` schemas

#### Scenario: Standalone Postgres mode
- **WHEN** `STRATEGY_DB_MODE=standalone`
- **THEN** strategy-server uses its own Postgres instance
- **AND** Memory uses a separate Postgres connection
- **AND** no cross-schema reads occur

#### Scenario: Graceful degradation
- **WHEN** Memory is unavailable
- **THEN** semantic tools return `ErrSemanticUnavailable`
- **AND** all non-semantic MCP tools continue to function
- **AND** committed mutations are queued for ingestion when Memory recovers
