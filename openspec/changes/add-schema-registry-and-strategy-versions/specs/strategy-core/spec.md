## ADDED Requirements

### Requirement: Schema Registry

The system SHALL maintain a database-backed schema registry that stores EPF JSON schemas
keyed by version, dialect, and schema name. Embedded schemas serve as the fallback when the
registry does not contain a matching entry.

#### Scenario: Schema lookup with DB hit
- **WHEN** a validation request arrives for an artifact with `schema_version=2.26.0` and `dialect=standard`
- **THEN** the system queries `schema_registry WHERE version='2.26.0' AND dialect='standard' AND schema_name=<detected>`
- **AND** uses the stored JSONB content for validation

#### Scenario: Schema lookup with embedded fallback
- **WHEN** the schema registry has no matching row for the requested version/dialect/name
- **THEN** the system falls back to the embedded filesystem schema
- **AND** validation proceeds using the embedded schema

#### Scenario: Auto-import on startup
- **WHEN** the server starts and the registry contains no schemas for the current embedded version
- **THEN** the server imports all embedded schemas into the registry with `dialect='standard'`
- **AND** logs the import result

#### Scenario: Import new schema version
- **WHEN** an operator imports a new set of schemas with a version string
- **THEN** all schemas are stored in the registry under that version
- **AND** existing schemas for other versions are not affected

---

### Requirement: Strategy Versions

The system SHALL support publishing named versions of a strategy instance. A version is an
atomic snapshot of all artifacts and relationships at a point in time. The working draft
(strategy_artifacts) remains the live editing surface; versions are immutable snapshots.

#### Scenario: Publish version
- **WHEN** a caller publishes a version with an optional label and description
- **THEN** the system snapshots all current artifacts and relationships as JSONB
- **AND** assigns the next sequential version number
- **AND** sets the version status to `published`
- **AND** sets any previously published version to `superseded`
- **AND** records `parent_version_id` pointing to the previous version

#### Scenario: List versions
- **WHEN** a caller lists versions for an instance
- **THEN** all versions are returned ordered by version number descending
- **AND** each entry includes version number, label, status, published_at, and artifact count

#### Scenario: Get version
- **WHEN** a caller requests a specific version
- **THEN** the full snapshot is returned including all artifact payloads and relationships

#### Scenario: Diff versions
- **WHEN** a caller requests a diff between two versions
- **THEN** the system compares the snapshots and returns a structured diff
- **AND** the diff lists added artifacts, removed artifacts, and changed artifacts (with before/after payloads)

#### Scenario: Restore version
- **WHEN** a caller restores a previous version
- **THEN** the system creates staged mutations that would bring the working draft to match the snapshot
- **AND** returns a batch_id for review and commit
- **AND** the original version is not modified

### Requirement: GitHub Sync (Write-Back)

The system SHALL support syncing mutated strategy artifacts back to their source GitHub
repository by creating a pull request. Sync uses a GitHub App for authentication and
targets the repository and base path recorded on the strategy instance.

#### Scenario: Sync current state to GitHub
- **WHEN** a caller invokes `sync_to_github` for an instance with a configured `github_repo`
- **THEN** the system exports all current artifacts as YAML files
- **AND** creates a feature branch named `strategy-sync/<instance>/<timestamp>`
- **AND** commits all files to the branch at the `github_base_path` prefix
- **AND** opens a pull request against the repository's default branch
- **AND** returns the PR URL and number
- **AND** records the sync in `github_sync_log`

#### Scenario: Sync published version to GitHub
- **WHEN** a caller invokes `sync_to_github` with a `version_id`
- **THEN** the system uses the version's snapshot (not the working draft) as the source
- **AND** creates a PR with the version label in the branch name and PR title

#### Scenario: GitHub App not configured
- **WHEN** a caller invokes `sync_to_github` and the GitHub App is not configured
- **THEN** the system returns a structured error indicating GitHub App configuration is required
- **AND** does not panic or return a raw Go error

#### Scenario: Instance has no github_repo
- **WHEN** a caller invokes `sync_to_github` for an instance without `github_repo` set
- **THEN** the system returns a structured error with an actionable message

#### Scenario: Get sync status
- **WHEN** a caller invokes `get_sync_status` for an instance
- **THEN** the system returns the last sync timestamp, status, and any open PR URL

---

## MODIFIED Requirements

### Requirement: Strategy Instance Lifecycle

The system SHALL manage strategy instances (versioned EPF instances) within a workspace.
An instance progresses through: `draft` -> `active` -> `archived`. Each instance tracks the
schema version and dialect used for artifact validation.

#### Scenario: Import instance from GitHub
- **WHEN** a caller provides a valid `github_repo` and optional `github_base_path`
- **THEN** the system parses the EPF YAML files from the repository
- **AND** creates a strategy instance record with `status=draft`
- **AND** sets `schema_version` to the current embedded EPF version
- **AND** sets `dialect` to `standard`
- **AND** stores the parsed artifact content as the initial committed mutations
- **AND** an audit log entry is written

#### Scenario: Activate instance
- **WHEN** a caller updates an instance status to `active`
- **THEN** the instance becomes the active strategy for the workspace
- **AND** a workspace can have at most one `active` instance at a time
- **AND** any previously active instance transitions to `draft`

#### Scenario: Archive instance
- **WHEN** a caller archives an instance
- **THEN** the instance status becomes `archived`
- **AND** the instance is excluded from default list views
- **AND** all staged (uncommitted) mutations for that instance are discarded

#### Scenario: Get instance with health
- **WHEN** a caller GETs a specific instance
- **THEN** the response includes the instance metadata, health summary, schema_version, and dialect
- **AND** the health summary covers: validation status, content readiness, completeness score
