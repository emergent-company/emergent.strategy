## ADDED Requirements

### Requirement: Instance Discovery Without Local Schemas

The EPF CLI SHALL discover EPF instances in repos that do not have a local `docs/EPF/schemas/` directory. Instance discovery SHALL work based on anchor files (`_epf.yaml`) and phase markers (`READY/`, `FIRE/`, `AIM/`) without requiring a co-located schemas directory.

#### Scenario: Discovery in consumer repo with submodule instance

- **WHEN** a repo has an EPF instance at `docs/EPF/_instances/emergent/` (via git submodule) but no `docs/EPF/schemas/` directory
- **THEN** the CLI SHALL discover the instance
- **AND** schema validation SHALL use embedded schemas

#### Scenario: Discovery in integrated repo with schemas

- **WHEN** a repo has both `docs/EPF/_instances/` and `docs/EPF/schemas/` directories (legacy integrated mode)
- **THEN** the CLI SHALL discover the instance exactly as before (backward compatible)

### Requirement: Submodule Detection in Diagnostics

The EPF CLI SHALL detect whether an instance directory is a git submodule and report this in diagnostic commands (`epf locate`, `epf health`).

#### Scenario: Submodule instance detected

- **WHEN** an instance directory contains a `.git` file (not a `.git/` directory)
- **THEN** `epf locate` SHALL indicate the instance is a submodule
- **AND** `epf health` SHALL include the submodule status in its report

#### Scenario: Regular instance detected

- **WHEN** an instance directory does not contain a `.git` file or contains a `.git/` directory
- **THEN** the CLI SHALL report the instance as a regular (non-submodule) instance

#### Scenario: Uninitialized submodule warning

- **WHEN** an expected instance path exists as an empty directory
- **AND** the parent repository's `.gitmodules` file references that path
- **THEN** the CLI SHALL warn that the submodule appears uninitialized
- **AND** SHALL suggest running `git submodule update --init`
