## ADDED Requirements

### Requirement: Shared EPF Instance via Git Submodule

The EPF strategy instance SHALL be maintained in a dedicated repository (`emergent-company/emergent-epf`) and mounted as a git submodule at `docs/EPF/_instances/emergent/` in each consumer repository.

The submodule mount path SHALL match the EPF CLI's instance discovery convention so that no CLI code changes are required.

#### Scenario: Developer clones a consumer repo

- **WHEN** a developer clones a consumer repo and runs `git submodule update --init`
- **THEN** the EPF strategy instance files appear at `docs/EPF/_instances/emergent/`
- **AND** the directory contains `_epf.yaml`, `READY/`, `FIRE/`, `AIM/` subdirectories

#### Scenario: AI agent discovers strategy context

- **WHEN** an AI agent (OpenCode/OpenSpec) operates in a consumer repo with an initialized submodule
- **THEN** the agent SHALL be able to read EPF instance files at `docs/EPF/_instances/emergent/`
- **AND** EPF CLI MCP tools SHALL work with `instance_path` pointing to that directory

#### Scenario: Strategy instance is updated

- **WHEN** the EPF strategy instance is updated in `emergent-epf`
- **THEN** consumer repos SHALL update the submodule reference to pull the latest changes
- **AND** the update process SHALL be `git submodule update --remote docs/EPF/_instances/emergent`

### Requirement: Single Source of Truth for Strategy

The `emergent-company/emergent-epf` repository SHALL be the single canonical source for the EPF strategy instance. No other repository SHALL maintain a separate copy of the instance files.

#### Scenario: Removing duplicate instances

- **WHEN** the migration is complete
- **THEN** `emergent-strategy` SHALL NOT contain instance files outside the submodule
- **AND** `emergent-company/emergent` SHALL NOT contain instance files outside the submodule
- **AND** `emergent-company/emergent` SHALL NOT contain EPF framework files (schemas, definitions, templates, wizards)

### Requirement: New Repo Onboarding

Any new repository in `emergent-company` that requires EPF strategy context SHALL be able to add the submodule with a single command.

#### Scenario: Adding strategy context to a new repo

- **WHEN** a new repo needs EPF strategy context
- **THEN** the setup SHALL be: `git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent`
- **AND** the repo's `AGENTS.md` SHALL document the submodule and initialization instructions
