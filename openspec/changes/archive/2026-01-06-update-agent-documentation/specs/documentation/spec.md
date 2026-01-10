## ADDED Requirements

### Requirement: AGENT.md Documentation Accuracy
The AGENT.md documentation files SHALL accurately reflect the current codebase state including all entities, modules, components, and hooks.

#### Scenario: Entity documentation completeness
- **WHEN** a developer reads apps/server/src/entities/AGENT.md
- **THEN** all entity files in the entities directory are documented with their schema, table name, purpose, and key columns

#### Scenario: Module documentation completeness
- **WHEN** a developer reads apps/server/src/modules/AGENT.md
- **THEN** all module directories are documented with their purpose, endpoints, and key services

#### Scenario: Component documentation completeness
- **WHEN** a developer reads apps/admin/src/components/AGENT.md
- **THEN** all component directories are documented following atomic design categories (atoms, molecules, organisms)

#### Scenario: Hook documentation completeness
- **WHEN** a developer reads apps/admin/src/hooks/AGENT.md
- **THEN** all hook files are documented with their purpose and usage patterns
