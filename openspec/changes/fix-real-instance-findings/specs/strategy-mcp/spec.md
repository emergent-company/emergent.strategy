## MODIFIED Requirements

### Requirement: validate_relationships produces actionable output

`validate_relationships` SHALL resolve feature targets by id prefix match
(e.g. `fd-014` matches artifact key `fd-014_business_directory`), not only by
exact artifact key.

`validate_relationships` SHALL resolve `key_result` and `assumption` targets
against the roadmap recipe payload, since these live inside the roadmap artifact,
not as standalone artifacts.

`validate_relationships` SHALL NOT check targets of type `track`, since tracks
are not stored as artifacts and every check is a false positive.

#### Scenario: Feature target resolved by id prefix
- **WHEN** a relationship references target `fd-014` with type `feature`
- **AND** the artifact store contains `fd-014_business_directory`
- **THEN** the relationship is reported as resolved, not broken

#### Scenario: Key Result target resolved against roadmap
- **WHEN** a relationship references target `kr-p-001` with type `key_result`
- **AND** the roadmap recipe payload contains `kr-p-001` under any `okrs` or `future_okrs_*` group
- **THEN** the relationship is reported as resolved

#### Scenario: Track targets are not checked
- **WHEN** a relationship references a target with type `track`
- **THEN** the relationship is skipped, not reported as broken

### Requirement: add_relationship persists to strategy_relationships

`add_relationship` mutations, when committed, SHALL create rows in
`strategy_relationships` so they are visible to `ListRelationships`,
`validate_relationships`, and all downstream consumers.

#### Scenario: Committed relationship is queryable
- **WHEN** an agent stages a `contributes_to` relationship via `add_relationship`
- **AND** commits the batch
- **THEN** `ListRelationships` for the source artifact returns the new edge

### Requirement: get_section reports truncation clearly

`get_section` SHALL NOT return `Content: nil` without an explanation. When
content exceeds `max_chars` and no children are available, the response SHALL
include `truncated: true`, `size_chars`, and `budget_chars` so the caller knows
the content was dropped and can raise the budget.

#### Scenario: Over-budget section with no children
- **WHEN** `get_section` is called with `max_chars=10000` for a section of 41,322 chars
- **AND** the section has no subsections to offer as children
- **THEN** the response includes `truncated: true`, `size_chars: 41322`, and `budget_chars: 10000`
- **AND** `Content` is not silently nil

### Requirement: commit_batch SHALL guard roadmap completeness

`commit_batch` SHALL refuse or require explicit confirmation for a roadmap
payload that fails `schema.required` on its `tracks` object, to prevent
accidental deletion of a track.

#### Scenario: Roadmap missing a required track
- **WHEN** a batch commits a roadmap payload missing `tracks.product`
- **AND** the existing roadmap has `tracks.product` with 41,322 chars of content
- **THEN** the commit fails or requires confirmation
- **AND** the error message names the missing track

## ADDED Requirements

### Requirement: GitHub sync status in health_check

`health_check` SHALL include a `github_sync` block reporting the state
(`enabled`, `disabled`, `degraded`) and the reason when not enabled.

#### Scenario: GitHub App not configured
- **WHEN** `GITHUB_APP_ID` is not set
- **THEN** `health_check` returns `github_sync: { status: "disabled", message: "GITHUB_APP_ID not configured" }`

#### Scenario: GitHub App key not found
- **WHEN** `GITHUB_APP_ID` is set but the private key path does not resolve
- **THEN** `health_check` returns `github_sync: { status: "degraded", message: "..." }` with the file error

### Requirement: get_instance reports sync availability

`get_instance` SHALL include `github_sync_available` and, when false, a
`github_sync_reason` field.

#### Scenario: Sync unavailable
- **WHEN** the GitHub App is not configured
- **THEN** `get_instance` returns `github_sync_available: false` and `github_sync_reason: "GITHUB_APP_ID not configured"`

### Requirement: import_instance describes available routes

The `import_instance` tool description SHALL state which import routes are
available (MCP `import_from_github` when GitHub App is configured, CLI `import`
always).

#### Scenario: Description reflects available routes
- **WHEN** an agent reads the `import_instance` tool description
- **THEN** it names both the CLI and MCP import paths and states when each is available

### Requirement: Sync stub when GitHub App is not configured

When the GitHub App is not configured and sync tools are not registered, a stub
read tool SHALL explain the state instead of letting agents discover it via
`Unknown tool` errors.

#### Scenario: Agent calls sync without GitHub App
- **WHEN** the GitHub App is not configured
- **AND** an agent calls `get_sync_state`
- **THEN** it receives a structured explanation instead of `Unknown tool`

### Requirement: KR-target fitness check

A tool or finding family SHALL check Key Result target fitness:
`kr.no_component_path`, `kr.path_not_in_value_model`,
`kr.reached_only_by_parent`, `feature.reaches_no_kr`. Severity SHALL vary by
feature status (`draft` → warning, `in-progress` → error).

#### Scenario: Feature with no KR reached
- **WHEN** a feature definition with `status: in-progress` reaches no Key Result
- **THEN** the fitness check reports `feature.reaches_no_kr` with severity `error`

#### Scenario: KR with no component path
- **WHEN** a Key Result has no `value_model_target` or `component_path`
- **THEN** the fitness check reports `kr.no_component_path` with severity `warning`

### Requirement: Sync writes only changed artifacts

`sync_to_github` SHALL write only artifacts whose content changed since the
last import or sync. Files not modified by the server SHALL be left untouched
in the repository, preserving comments and formatting.

#### Scenario: Import then sync with no edits
- **WHEN** an instance is imported from a repository
- **AND** no edits are made on the server
- **AND** `sync_to_github` is called
- **THEN** the resulting commit has an empty diff (no files changed)

#### Scenario: One edit produces a one-file diff
- **WHEN** one feature definition is edited on the server
- **AND** `sync_to_github` is called
- **THEN** only that feature's file is changed in the commit
- **AND** comments in all other files are preserved

### Requirement: Publish PR includes batch descriptions

The publish PR body created by `sync_to_github` SHALL list the changed artifacts
and include batch descriptions from `describe_batch`.

#### Scenario: PR body content
- **WHEN** `sync_to_github` creates a pull request
- **THEN** the PR body lists each changed artifact
- **AND** includes the batch description for each batch that changed them

### Requirement: Sync does not delete unknown files

`sync_to_github` SHALL NOT delete files under the instance base path that the
server has no artifact for (e.g. `_meta.yaml`).

#### Scenario: Extra file in repository
- **WHEN** the repository contains `_meta.yaml` under the instance path
- **AND** the server has no artifact for `_meta.yaml`
- **AND** `sync_to_github` runs
- **THEN** `_meta.yaml` is still present in the repository after sync

### Requirement: CLI import supports dry-run

The CLI `import` command SHALL support `--dry-run`, printing added, removed and
changed artifact keys without writing.

#### Scenario: Dry-run shows diff
- **WHEN** `import --dry-run` is run against a path with 3 new, 1 removed, and 2 changed artifacts
- **THEN** the output lists all 6 artifact keys with their status (added/removed/changed)
- **AND** no data is written to the database

### Requirement: Freshly imported instance is not server_ahead

`determineSyncState` SHALL exclude `source='import'` mutations from the
`committedAfterSync` count, so a freshly imported instance reads `in_sync` or
`github_ahead`, not `server_ahead`.

#### Scenario: Import then check sync state
- **WHEN** an instance is imported from the CLI
- **AND** linked to its source repository
- **AND** no edits are made
- **THEN** `get_sync_state` returns `in_sync` or `github_ahead`
- **AND** does not return `server_ahead`
