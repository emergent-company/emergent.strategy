## MODIFIED Requirements

### Requirement: Workspace Configuration

The repository SHALL maintain consistent workspace configuration across all configuration files.

#### Scenario: Workspace definitions are synchronized

- **WHEN** examining workspace configuration files (package.json, pnpm-workspace.yaml, workspace.json)
- **THEN** all files reference the same set of valid project directories
- **AND** no references to non-existent directories exist

#### Scenario: Package naming follows conventions

- **WHEN** examining package.json files across the monorepo
- **THEN** all packages use the `@emergent/` namespace prefix consistently
- **AND** no legacy naming conventions (spec-server, @spec/) remain
