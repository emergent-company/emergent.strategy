## MODIFIED Requirements

### Requirement: EPF Instance Initialization via MCP

AI agents SHALL be able to initialize new EPF instances programmatically via the `epf_init_instance` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `product_name`, `epf_version`, `structure_type`
- Support a `dry_run` mode that returns what would be created without making changes
- Create the standard EPF directory structure (READY/, FIRE/, AIM/)
- Create `FIRE/definitions/product/`, `FIRE/definitions/strategy/`, `FIRE/definitions/org_ops/`, `FIRE/definitions/commercial/` subdirectories
- Create `FIRE/value_models/` and `FIRE/workflows/` subdirectories
- NOT create `FIRE/feature_definitions/` (retired directory)
- NOT create `READY/definitions/` (retired directory)
- Create the anchor file (`_epf.yaml`) with proper metadata
- Return the list of created files and the anchor file content

#### Scenario: Initialize new EPF instance

- **WHEN** AI agent calls `epf_init_instance` with `path="/project/docs/epf"` and `product_name="My Product"`
- **THEN** the tool creates READY/, FIRE/, AIM/ directories
- **AND** creates `FIRE/definitions/product/`, `FIRE/definitions/strategy/`, `FIRE/definitions/org_ops/`, `FIRE/definitions/commercial/` directories
- **AND** does NOT create `FIRE/feature_definitions/` or `READY/definitions/`
- **AND** returns the created file paths and anchor content

#### Scenario: Dry run initialization

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the tool returns what would be created without making any changes
- **AND** the AI agent can present the plan to the user for confirmation

---

### Requirement: Canonical Definitions Sync via MCP

AI agents SHALL be able to sync canonical EPF track definitions (strategy, org_ops, commercial) to an existing instance via the `epf_sync_canonical` MCP tool.

The tool SHALL:

- Sync canonical strategy definitions to `FIRE/definitions/strategy/`
- Sync canonical org_ops definitions to `FIRE/definitions/org_ops/`
- Sync canonical commercial definitions to `FIRE/definitions/commercial/`
- NOT write to `READY/definitions/` (retired location)
- Support `dry_run` mode and `force` flag for overwriting existing files
- Skip files that already exist unless `force=true`

#### Scenario: Sync canonical definitions to new instance

- **WHEN** AI agent calls `epf_sync_canonical` with a valid `instance_path`
- **THEN** canonical strategy/org_ops/commercial definitions are written to `FIRE/definitions/{track}/`
- **AND** no files are written to `READY/definitions/`

#### Scenario: Sync skips existing files by default

- **WHEN** `epf_sync_canonical` is called and definitions already exist in `FIRE/definitions/{track}/`
- **THEN** existing files are skipped
- **AND** the tool reports how many files were skipped vs written

---

## ADDED Requirements

### Requirement: Structural Definition Migration Tool

The EPF CLI SHALL provide a structural migration command and MCP tool (`epf_migrate_definitions`) that moves definition files from old locations to the new unified `FIRE/definitions/` structure.

The tool SHALL:

- Detect files in `FIRE/feature_definitions/` and move them to `FIRE/definitions/product/`
- Detect files in `READY/definitions/strategy/` and move them to `FIRE/definitions/strategy/`
- Detect files in `READY/definitions/org_ops/` and move them to `FIRE/definitions/org_ops/`
- Detect files in `READY/definitions/commercial/` and move them to `FIRE/definitions/commercial/`
- Support `dry_run=true` to preview all moves without applying them
- Remove empty source directories after successful migration
- Emit a migration report listing every file moved (old path → new path)
- Be idempotent: if files are already in the correct location, report success with no moves
- Accept `instance_path` parameter
- Detect whether the instance is a git submodule accessed from a consumer repo by running
  `git -C <instance_path> rev-parse --show-superproject-working-tree`
- When accessed from a consumer repo context: refuse to apply migration (only dry-run is allowed)
  and emit clear instructions to run the migration in the submodule source repo, including the
  remote URL and the exact commands to run

#### Scenario: Migrate product definitions (embedded instance)

- **WHEN** `epf_migrate_definitions` is called on an embedded instance with files in `FIRE/feature_definitions/`
- **THEN** all `.yaml` files are moved to `FIRE/definitions/product/`
- **AND** `FIRE/feature_definitions/` directory is removed
- **AND** migration report lists each moved file

#### Scenario: Migrate canonical definitions from READY (embedded instance)

- **WHEN** `epf_migrate_definitions` is called on an embedded instance with files in `READY/definitions/strategy/`
- **THEN** all `.yaml` files are moved to `FIRE/definitions/strategy/`
- **AND** `READY/definitions/` directory is removed if empty after migration
- **AND** migration report lists each moved file

#### Scenario: Dry run preview

- **WHEN** `epf_migrate_definitions` is called with `dry_run=true`
- **THEN** no files are moved
- **AND** the tool returns the complete list of moves that would be applied

#### Scenario: Idempotent on already-migrated instance

- **WHEN** `epf_migrate_definitions` is called on an instance where all definitions are already in `FIRE/definitions/`
- **THEN** no files are moved
- **AND** the tool reports zero moves with a success status

#### Scenario: Submodule consumer repo blocks migration

- **WHEN** `epf_migrate_definitions` is called with `dry_run=false` from a consumer repo where the instance is a git submodule
- **THEN** the tool refuses to apply any file moves
- **AND** emits a CRITICAL error with instructions to clone the submodule source repo and run the migration there
- **AND** includes the remote URL of the submodule source repo in the error message

#### Scenario: Submodule consumer repo allows dry-run

- **WHEN** `epf_migrate_definitions` is called with `dry_run=true` from a consumer repo where the instance is a git submodule
- **THEN** the tool shows the planned moves
- **AND** emits a warning that these moves cannot be applied from this context
- **AND** provides instructions for running the migration in the submodule source repo

---

### Requirement: Health Check Detects Old Definition Structure

The EPF health check SHALL detect the presence of the old definition directory structure and emit a CRITICAL error with deployment-mode-aware migration instructions.

The health check SHALL:

- Emit CRITICAL if `FIRE/feature_definitions/` directory exists in an instance
- Emit CRITICAL if `READY/definitions/` directory exists in an instance
- Detect whether the instance is a git submodule accessed from a consumer repo
- For embedded instances: include `epf migrate definitions <instance_path>` in the error message
- For submodule instances accessed from a consumer repo: include instructions to run the
  migration in the submodule source repo, with the remote URL
- Not proceed with feature definition validation when old structure is detected

#### Scenario: Old feature_definitions detected in embedded instance

- **WHEN** `epf_health_check` is run on an embedded instance containing `FIRE/feature_definitions/`
- **THEN** a CRITICAL error is emitted indicating old structure detected
- **AND** the error message includes `epf migrate definitions <instance_path>`

#### Scenario: Old READY/definitions detected in embedded instance

- **WHEN** `epf_health_check` is run on an embedded instance containing `READY/definitions/`
- **THEN** a CRITICAL error is emitted indicating old structure detected
- **AND** the error message includes `epf migrate definitions <instance_path>`

#### Scenario: Old structure detected via submodule consumer repo

- **WHEN** `epf_health_check` is run from a consumer repo on a submodule instance with old structure
- **THEN** a CRITICAL error is emitted indicating old structure detected
- **AND** the error message indicates migration must happen in the submodule source repo
- **AND** the submodule remote URL is included in the error message

---

### Requirement: Definitions Resolved from FIRE Phase

All EPF tooling that reads feature definitions or track definitions SHALL resolve files from `FIRE/definitions/{track}/` only.

The following tools SHALL read from the new locations:

- `epf_list_features` — reads from `FIRE/definitions/product/`
- `epf_list_definitions` — reads from `FIRE/definitions/{strategy,org_ops,commercial}/`
- `epf_get_strategic_context` — resolves feature files from `FIRE/definitions/product/`
- `epf_validate_relationships` — scans `FIRE/definitions/product/` for `contributes_to` paths
- `epf_analyze_coverage` — scans `FIRE/definitions/` for all track definitions
- `epf_check_feature_quality` — scans `FIRE/definitions/product/`
- `epf_add_implementation_reference` — writes to files in `FIRE/definitions/product/`
- `epf_update_capability_maturity` — writes to files in `FIRE/definitions/product/`

#### Scenario: Feature listing from new location

- **WHEN** AI agent calls `epf_list_features` on an instance with fd-*.yaml files in `FIRE/definitions/product/`
- **THEN** all feature definitions are returned
- **AND** no definitions are sought in `FIRE/feature_definitions/`

#### Scenario: Track definition listing from new location

- **WHEN** AI agent calls `epf_list_definitions` with `track="strategy"` on an instance
- **THEN** definitions are read from `FIRE/definitions/strategy/`
- **AND** no definitions are sought in `READY/definitions/strategy/`
