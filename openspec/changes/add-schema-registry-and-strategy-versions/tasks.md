## 1. Schema Registry

### 1.1 Database

- [x] 1.1.1 Write migration `011_schema_registry.sql` — `schema_registry` table (version, dialect, schema_name, content JSONB)
- [x] 1.1.2 Add `schema_version TEXT` column to `strategy_instances`
- [x] 1.1.3 Add `dialect TEXT DEFAULT 'standard'` column to `strategy_instances`

### 1.2 Registry Service

- [x] 1.2.1 Create `domain/schema/service.go` — `SchemaService` with `GetSchema(version, dialect, name)`, `ImportSchemas(version, dialect, schemas)`, `ListVersions()`
- [x] 1.2.2 Implement DB lookup with embedded fallback in `GetSchema`
- [x] 1.2.3 Implement `ImportFromEmbedded(version)` — bulk-inserts all embedded schemas into the registry
- [x] 1.2.4 Implement `LatestVersion()` — returns the highest registered version
- [x] 1.2.5 Write unit tests for registry service (DB + fallback scenarios)

### 1.3 Validation Wiring

- [x] 1.3.1 Update `internal/embedded/validator.go` to accept a schema source interface (DB or embedded)
- [x] 1.3.2 Wire `ValidateArtifact` to query the registry first, then embedded fallback
- [x] 1.3.3 Ensure `$ref` cross-references resolve correctly when schemas come from DB
- [x] 1.3.4 Write integration test: validate artifact against DB-stored schema

### 1.4 Auto-Import on Startup

- [x] 1.4.1 On server startup, check if current embedded version exists in registry
- [x] 1.4.2 If not, call `ImportFromEmbedded()` to bootstrap the registry
- [x] 1.4.3 Log the import result (schema count, version)

### 1.5 Instance Schema Tracking

- [x] 1.5.1 Set `schema_version` on instance creation/import (from embedded VERSION)
- [x] 1.5.2 Include `schema_version` and `dialect` in instance GET responses
- [x] 1.5.3 Add `schema_version` to health check report

---

## 2. Strategy Versions

### 2.1 Database

- [x] 2.1.1 Write migration `012_strategy_versions.sql` — `strategy_versions` table (version int, label, description, status, parent_version_id, snapshot JSONB, published_at)

### 2.2 Version Service

- [x] 2.2.1 Create `domain/version/service.go` — `VersionService`
- [x] 2.2.2 Implement `Publish(instanceID, label, description)` — snapshot all current artifacts + relationships into JSONB, assign next version number, set status to 'published', supersede previous version
- [x] 2.2.3 Implement `List(instanceID)` — return version history
- [x] 2.2.4 Implement `Get(instanceID, versionID)` — return full snapshot
- [x] 2.2.5 Implement `Diff(instanceID, fromVersionID, toVersionID)` — structured diff (added/removed/changed artifacts)
- [x] 2.2.6 Implement `Restore(instanceID, versionID)` — create mutations from snapshot to restore to that state
- [x] 2.2.7 Write unit tests for version service

### 2.3 MCP Tools

- [x] 2.3.1 `publish_version` — snapshot and publish current state
- [x] 2.3.2 `list_versions` — show version history for an instance
- [x] 2.3.3 `get_version` — read a specific version's artifacts
- [x] 2.3.4 `diff_versions` — compare two versions
- [x] 2.3.5 `restore_version` — create mutations to revert to a previous state
- [x] 2.3.6 Register tools in `internal/mcpserver/`

### 2.4 MCP Tool Tests

- [ ] 2.4.1 E2E test: create artifacts → commit → publish → verify snapshot
- [ ] 2.4.2 E2E test: publish v1 → modify → publish v2 → diff → verify changes
- [ ] 2.4.3 E2E test: publish → restore → verify artifacts match previous state
- [ ] 2.4.4 E2E test: list_versions returns correct chain

---

## 3. GitHub Sync (Write-Back)

### 3.1 Database

- [x] 3.1.1 Write migration `013_github_sync_log.sql` — `github_sync_log` table (instance_id, version_id, github_repo, branch_name, pr_number, pr_url, status, artifact_count, error_message)

### 3.2 GitHub App Client

- [x] 3.2.1 Add `google/go-github/v68` to `go.mod`
- [x] 3.2.2 Add GitHub App config fields to `config/config.go` (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`)
- [x] 3.2.3 Create `internal/github/client.go` — GitHub App JWT generation, installation token exchange
- [x] 3.2.4 Implement `GetInstallationToken(owner)` — look up installation by org, generate short-lived token
- [x] 3.2.5 Implement `CreateBranch(repo, baseBranch, newBranch)` — create a feature branch
- [x] 3.2.6 Implement `CommitFiles(repo, branch, files, message)` — create a Git tree + commit with all artifact files
- [x] 3.2.7 Implement `CreatePullRequest(repo, head, base, title, body)` — open PR
- [ ] 3.2.8 Write unit tests with GitHub API mocks (httptest)

### 3.3 Sync Service

- [x] 3.3.1 Create `domain/sync/service.go` — `SyncService` with `RepoWriter` interface (domain-pure; `internal/github/` implements the interface)
- [x] 3.3.2 Implement `SyncToGithub(instanceID, versionID)` — export artifacts, create branch, commit files, open PR, log result
- [x] 3.3.3 Handle draft sync (no version — exports current working state)
- [x] 3.3.4 Handle version sync (exports a specific published version's snapshot)
- [x] 3.3.5 Generate PR body with structured summary (added/modified/archived artifacts, version label, instance link)
- [x] 3.3.6 Generate branch name: `strategy-sync/<instance-name>/<version-or-timestamp>`
- [x] 3.3.7 Record sync attempt in `github_sync_log`
- [x] 3.3.8 Write integration tests for sync service

### 3.4 MCP Tools

- [x] 3.4.1 `sync_to_github` — export current or versioned state and create a PR
- [x] 3.4.2 `get_sync_status` — show last sync status, open PRs, sync history for an instance
- [x] 3.4.3 Register tools in `internal/mcpserver/`
- [ ] 3.4.4 Write MCP tool tests

### 3.5 Graceful Degradation

- [x] 3.5.1 If GitHub App is not configured, sync tools return a clear error (not panic)
- [x] 3.5.2 If `github_repo` is not set on the instance, return actionable error message
- [x] 3.5.3 If the GitHub App is not installed on the target org, return clear error with install link

---

## 4. Decomposer Reconciliation Check

### 4.1 Field Manifest

- [ ] 4.1.1 Create `pkg/decompose/field_manifest.go` — declarative list of all field paths extracted per artifact type
- [ ] 4.1.2 Cover all extraction functions: decomposeFeature, decomposeNorthStar, decomposeFoundations, etc.
- [ ] 4.1.3 Include nested paths (e.g., `capabilities[].name`, `personas[].pain_points[]`)

### 4.2 Reconciliation Test

- [ ] 4.2.1 Create `pkg/decompose/schema_reconcile_test.go`
- [ ] 4.2.2 Load all embedded JSON schemas from `internal/embedded/schemas/`
- [ ] 4.2.3 For each manifest entry, resolve the JSON path against the schema's properties tree
- [ ] 4.2.4 Fail with clear message if a path is missing: "decomposer reads 'capabilities[].name' from feature_definition but schema does not define it"
- [ ] 4.2.5 Fail if manifest is incomplete (field count check against decomposer source)
- [ ] 4.2.6 Run as part of `go test ./pkg/decompose/...`

### 4.3 CI Integration

- [ ] 4.3.1 Ensure the reconciliation test runs in the standard test suite
- [ ] 4.3.2 Document in AGENTS.md: "after syncing schemas from canonical-epf, run decomposer tests to verify field compatibility"

---

## 5. Documentation

- [ ] 5.1 Update AGENTS.md — schema registry, version workflow, GitHub sync, reconciliation check
- [ ] 5.2 Update MCP tool inventory (7 new tools: 5 version + 2 sync)
- [ ] 5.3 Document schema import workflow (how to push new schemas to the registry)
- [ ] 5.4 Document GitHub App setup (how to create and install the App for an org)
- [ ] 5.5 Document sync workflow (mutate → publish → sync → review PR → merge)
