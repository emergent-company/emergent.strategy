## ADDED Requirements

### Requirement: strategy-server Application
The `apps/strategy-server/` application SHALL exist as a constitution-compliant Go service
providing live strategy authoring, management, and serving via MCP, REST API, and HTMX web UI.
It SHALL use `alexflint/go-arg`, Echo v4, huma v2, PostgreSQL 16 via `uptrace/bun`, and
`pressly/goose` for migrations. It SHALL NOT use cobra.

#### Scenario: Binary compiles and starts
- **WHEN** `task build` is run in `apps/strategy-server/`
- **THEN** a binary is produced that starts without error and serves `GET /health`

#### Scenario: Database migrations run on startup
- **WHEN** the server starts with a valid `PGHOST`/`PGDATABASE` configuration
- **THEN** goose migrations run automatically with a PostgreSQL advisory lock
- **AND** the server only accepts requests after migrations succeed

#### Scenario: Config loaded from environment
- **WHEN** `PORT=9090` is set and the server starts
- **THEN** the server listens on port 9090 without any `os.Getenv` call outside `config/config.go`

### Requirement: Workspace Management
The system SHALL manage workspaces — GitHub owner/org accounts that contain strategy instances.
Workspaces are the top-level tenancy boundary. A user may have access to multiple workspaces.

#### Scenario: Create workspace
- **WHEN** `create_workspace` MCP tool is called with `github_owner: "acme-corp"`
- **THEN** a new workspace record is created in the database
- **AND** the workspace ID is returned

#### Scenario: List workspaces
- **WHEN** `list_workspaces` MCP tool is called by an authenticated user
- **THEN** only workspaces the user has access to are returned

### Requirement: Strategy Instance Lifecycle
The system SHALL manage strategy instances within workspaces. An instance represents one EPF
repository (a set of YAML artifacts). Instances have status: `draft | active | archived`.

#### Scenario: Import instance from GitHub
- **WHEN** `import_instance` MCP tool is called with `github_repo: "acme/strategy"` and `github_base_path: "docs/EPF"`
- **THEN** the EPF artifacts are loaded from GitHub
- **AND** the instance is registered in the database with status `active`
- **AND** the artifacts are validated against EPF schemas
- **AND** a health score is computed and stored

#### Scenario: Archive instance
- **WHEN** `archive_instance` MCP tool is called with a valid instance ID
- **THEN** the instance status becomes `archived`
- **AND** the instance is no longer returned in active listings

### Requirement: Append-Only Mutation Log
Every change to a strategy artifact SHALL be recorded as a new row in `strategy_mutations`.
Existing rows SHALL never be updated or deleted. Current state SHALL be derivable from the
mutation log.

#### Scenario: Mutation recorded on feature update
- **WHEN** a feature update is staged and committed
- **THEN** a new row appears in `strategy_mutations` with `artifact_type: "feature"`, `action: "update"`, and the full artifact payload
- **AND** the previous mutation row is unchanged

#### Scenario: Current state derived from mutation log
- **WHEN** `get_feature` is called for a feature that has been updated three times
- **THEN** the response reflects the most recent committed mutation
- **AND** `list_mutations` returns all three historical mutations in chronological order

### Requirement: Staging and Commit Pattern for Writes
All write operations SHALL create a staging record that must be explicitly committed before
any persistent change is made. The AI agent SHALL be able to propose changes, the user SHALL
review them, and only upon `commit_batch` SHALL the changes be applied.

#### Scenario: Stage and commit a feature update
- **WHEN** `update_feature` MCP tool is called with a draft change
- **THEN** a staging record is created and a `batch_id` is returned
- **AND** the feature in active state is unchanged
- **WHEN** `commit_batch` is called with the `batch_id`
- **THEN** the staged change becomes the active mutation
- **AND** the feature reflects the new state

#### Scenario: Discard a staged batch
- **WHEN** `discard_batch` is called with a `batch_id`
- **THEN** the staging records are deleted
- **AND** the feature state is unchanged

### Requirement: Constitution-Compliant Tooling
The project SHALL have `Taskfile.yml`, `.golangci.yaml`, `Dockerfile`, `docker-compose.yml`,
and `.air.toml` from day one. `task lint` SHALL pass with zero blocking findings. `task test`
SHALL require only `task docker-deps` as a prerequisite.

#### Scenario: Lint gate passes
- **WHEN** `task lint` is run on a clean checkout
- **THEN** `golangci-lint` exits 0 with no findings in `nilerr`, `errcheck`, `govet`, `gofmt`, `unused`, or `bodyclose`

#### Scenario: Tests require only Docker Postgres
- **WHEN** `task docker-deps` is run followed by `task test`
- **THEN** all tests pass without any external service dependency beyond Postgres
