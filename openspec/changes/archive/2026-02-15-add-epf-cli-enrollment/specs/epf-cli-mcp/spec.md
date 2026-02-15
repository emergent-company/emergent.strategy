## MODIFIED Requirements

### Requirement: EPF Instance Initialization via MCP

AI agents SHALL be able to initialize new EPF instances programmatically via the `epf_init_instance` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `product_name`, `epf_version`, `structure_type`, `mode`
- Support a `dry_run` mode that returns what would be created without making changes
- Support `mode` parameter with values `integrated` (default) and `standalone`
- In `integrated` mode: create the standard `docs/EPF/_instances/{product}/` structure within an existing repo
- In `standalone` mode: create the instance structure directly at the specified path (no `docs/EPF/` wrapper), suitable for repos that ARE the instance
- Create the anchor file (`_epf.yaml`) with proper metadata in both modes
- Return the list of created files and the anchor file content

#### Scenario: Initialize new EPF instance (integrated mode)

- **WHEN** AI agent calls `epf_init_instance` with `path="/project/docs/epf"` and `product_name="My Product"`
- **THEN** the tool creates the EPF directory structure at `docs/EPF/_instances/My Product/`
- **AND** returns the created file paths and anchor content

#### Scenario: Dry run initialization

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the tool returns what would be created without making any changes
- **AND** the AI agent can present the plan to the user for confirmation

#### Scenario: Initialize standalone instance

- **WHEN** AI agent calls `epf_init_instance` with `path="/project"`, `product_name="My Product"`, and `mode="standalone"`
- **THEN** the tool creates `_epf.yaml`, `READY/`, `FIRE/`, `AIM/` directly at `/project/`
- **AND** does NOT create a `docs/EPF/_instances/` wrapper structure

## ADDED Requirements

### Requirement: Repository Enrollment in Shared EPF Instance

The EPF CLI SHALL provide an `epf enroll` command that connects a repository to a shared EPF strategy instance via git submodule.

The command SHALL:

- Accept a git URL as the primary argument
- Derive a default mount path from the URL (`docs/EPF/_instances/<name>/`)
- Support `--path` to override the mount path
- Support `--dry-run` to preview the enrollment without making changes
- Run `git submodule add` and `git submodule update --init`
- Create a `.epf.yaml` per-repo configuration file
- Print an `AGENTS.md` snippet for the user to add to their repo
- Be idempotent — re-running on an enrolled repo reports status without failing

#### Scenario: Enroll a repo in shared strategy

- **WHEN** a developer runs `epf enroll https://github.com/emergent-company/emergent-epf.git`
- **THEN** the CLI adds a git submodule at `docs/EPF/_instances/emergent-epf/`
- **AND** creates `.epf.yaml` with `instance_path` and `mode: submodule`
- **AND** prints an `AGENTS.md` snippet to add

#### Scenario: Enroll with custom path

- **WHEN** a developer runs `epf enroll <url> --path docs/EPF/_instances/emergent`
- **THEN** the submodule is mounted at the specified path instead of the derived default

#### Scenario: Dry run enrollment

- **WHEN** a developer runs `epf enroll <url> --dry-run`
- **THEN** the CLI prints what would be done without making any changes

#### Scenario: Already enrolled repo

- **WHEN** `epf enroll` is run on a repo that already has the submodule
- **THEN** the CLI reports the current enrollment status without making changes
- **AND** does not return an error

### Requirement: Per-Repo EPF Configuration

The EPF CLI SHALL support an optional `.epf.yaml` configuration file at the repository root. This file declares the repo's EPF setup (instance path, mode, schema source) so the CLI does not rely solely on auto-detection.

The configuration SHALL follow this precedence (highest to lowest):
1. Explicit CLI flags (`--instance-path`, `--schemas-dir`)
2. Per-repo `.epf.yaml` file
3. Global `~/.epf-cli.yaml` file
4. Auto-detection

#### Scenario: CLI reads per-repo config

- **WHEN** a repo has a `.epf.yaml` file with `instance_path: docs/EPF/_instances/emergent`
- **THEN** the CLI SHALL use that path for instance discovery
- **AND** SHALL NOT fall through to auto-detection

#### Scenario: CLI flag overrides per-repo config

- **WHEN** a repo has a `.epf.yaml` file with `instance_path: docs/EPF/_instances/emergent`
- **AND** the user passes `--instance-path /other/path` on the command line
- **THEN** the CLI SHALL use `/other/path`
- **AND** SHALL ignore the per-repo config

#### Scenario: No per-repo config (backward compatible)

- **WHEN** a repo does not have a `.epf.yaml` file
- **THEN** the CLI SHALL fall through to global config and auto-detection as before

### Requirement: Enrollment Status in Diagnostics

The EPF CLI SHALL report enrollment status in diagnostic commands to help developers understand their repo's EPF configuration.

#### Scenario: Health check shows enrollment info

- **WHEN** a developer runs `epf health` in an enrolled repo
- **THEN** the output SHALL include: enrollment status (enrolled/not enrolled), instance source (local/submodule), and config source (`.epf.yaml`/global/auto-detected/CLI flag)

#### Scenario: Config mismatch warning

- **WHEN** `.epf.yaml` declares `mode: submodule` but the instance directory is not a git submodule
- **THEN** `epf health` SHALL warn about the mismatch
