## ADDED Requirements

### Requirement: Local-First Runtime Profile

strategy-server SHALL provide a `local` runtime profile (`STRATEGY_MODE=local`
or `--local`) that runs as a single self-contained binary with no external
service dependencies: no PostgreSQL, no Zitadel auth, no network, and no required
Memory server. The hosted profile (`STRATEGY_MODE=hosted`, the default) SHALL be
unchanged.

In `local` mode the server SHALL:
- use an embedded, zero-dependency datastore (no separate database process),
- run schema migrations automatically on first launch,
- operate as a single synthetic user with auth disabled,
- disable background heartbeat and GitHub-App jobs by default,
- degrade semantic features gracefully when Memory is not configured.

#### Scenario: Start with no external services

- **GIVEN** a machine with no PostgreSQL, no Zitadel, and no network access
- **WHEN** a user runs the strategy-server binary in `local` mode
- **THEN** the server starts successfully, creates and migrates an embedded
  datastore, and serves the MCP endpoint and web UI without error.

#### Scenario: Hosted mode is unaffected

- **GIVEN** the default (`hosted`) profile with PostgreSQL configured
- **WHEN** the server starts
- **THEN** it uses PostgreSQL, Zitadel auth, heartbeat, and GitHub jobs exactly
  as before, with no behavior change introduced by the local profile.

### Requirement: Dialect-Selectable Datastore

The persistence layer SHALL select its database dialect by configuration while
keeping all `domain/*` services dialect-agnostic. The hosted dialect SHALL be
PostgreSQL; the local dialect SHALL be a pure-Go embedded SQLite backend (no
cgo, no external process). The full Go test suite SHALL pass against both
dialects.

#### Scenario: Same domain logic on both backends

- **GIVEN** an identical sequence of authoring operations (stage, commit, derive
  index, publish version)
- **WHEN** executed against the PostgreSQL backend and against the embedded
  SQLite backend
- **THEN** the observable results (committed artifacts, derived index,
  versions) are equivalent, and no `domain/*` package contains dialect-specific
  branching.

#### Scenario: Embedded datastore is self-contained

- **GIVEN** `local` mode
- **WHEN** the server persists data
- **THEN** all state lives in a single embedded datastore file under the
  repo-local working directory, with no separate database server required.

### Requirement: Local Repo as Source of Truth

In `local` mode strategy-server SHALL treat a git-tracked EPF instance directory
(READY/FIRE/AIM YAML) as the canonical store, with the embedded datastore as a
derived cache (index, ripple signals, run ledger, versions). The system SHALL be
reconstructable: deleting the derived datastore and restarting SHALL rebuild it
from the repo without data loss of authored YAML.

The server SHALL import the instance directory on start, export affected
artifacts back to YAML after a batch commits, and provide a reconciliation path
(file-watch or an explicit command) to re-import hand-edited or pulled YAML.

#### Scenario: Edit YAML in the repo, see it in the platform

- **GIVEN** a local instance directory under git
- **WHEN** a user edits an artifact YAML file by hand and triggers reconciliation
- **THEN** the change is imported, the derived index/ripple update, and the web
  UI reflects the edited content.

#### Scenario: Commit through the platform, see it in git

- **GIVEN** a staged batch in `local` mode
- **WHEN** the user commits the batch
- **THEN** the affected artifacts are written back to the instance directory as
  YAML so that `git diff` shows the change and the repo remains the system of
  record.

#### Scenario: Rebuild derived state from the repo

- **GIVEN** a local instance with authored YAML and a derived datastore
- **WHEN** the user deletes the derived datastore and restarts the server
- **THEN** the datastore is rebuilt from the repo YAML with no loss of authored
  content.

### Requirement: Local Models End-to-End

strategy-server SHALL run every LLM-backed capability (READY drafting, the
orchestrated AIM cycle, adapt-strategy, analysis skills) in `local` mode against
a local, OpenAI-compatible model endpoint (e.g. Ollama) with no API key and no
external network calls beyond the local endpoint.

#### Scenario: Draft and run a cycle with a local model

- **GIVEN** `local` mode configured with a local OpenAI-compatible LLM endpoint
  and no API key
- **WHEN** the user runs a READY draft and an AIM cycle step that calls the LLM
- **THEN** the calls succeed against the local endpoint and the staged outputs
  are produced without any external network dependency.
