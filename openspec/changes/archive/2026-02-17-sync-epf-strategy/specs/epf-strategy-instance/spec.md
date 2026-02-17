## ADDED Requirements

### Requirement: Strategy-Reality Alignment
The EPF strategy instance SHALL accurately reflect the current state of all products and capabilities across the organization. Value model components, feature definitions, and roadmap KRs MUST correspond to actual shipped or planned capabilities — not aspirational architectures that have been superseded.

#### Scenario: Value model reflects shipped architecture
- **WHEN** a product has shipped capabilities (e.g., Go server with 19 domains, 609 E2E tests)
- **THEN** the corresponding value model MUST contain components representing those shipped capabilities with accurate maturity and active status

#### Scenario: Abandoned architecture removed from value model
- **WHEN** a planned architecture (e.g., Temporal-based workflow engine) has been superseded by a different approach (e.g., MCP-based cloud server)
- **THEN** the value model layers describing the abandoned architecture MUST be rewritten to reflect the actual implementation path

#### Scenario: New products tracked in portfolio
- **WHEN** a new product has shipped (e.g., Diane v1.1.0 with 69+ MCP tools)
- **THEN** it MUST be added to the product portfolio with at least a value model entry and one feature definition

### Requirement: Cross-Artifact Referential Integrity
All relationship references across EPF artifacts SHALL resolve to valid targets. Feature definition `contributes_to` paths MUST reference existing value model components. Roadmap KR `target_value_paths` MUST reference existing value model components.

#### Scenario: contributes_to paths valid after value model change
- **WHEN** a value model is restructured (components renamed, added, or removed)
- **THEN** all feature definitions referencing those components via `contributes_to` MUST be updated to use the new component paths
- **AND** `epf-cli validate` MUST pass with zero relationship errors

#### Scenario: KR targets valid after value model change
- **WHEN** value model component paths change
- **THEN** all roadmap KRs with `target_value_paths` referencing old paths MUST be updated
- **AND** `epf-cli health` MUST report no relationship validation errors

### Requirement: Schema Compliance After Bulk Updates
After any bulk update to the EPF instance, all modified artifacts SHALL pass `epf-cli validate` and the full instance SHALL pass `epf-cli health` with no errors.

#### Scenario: Full instance health after sync
- **WHEN** a strategy sync operation modifies 15+ files across value models, feature definitions, portfolio, and roadmap
- **THEN** `epf-cli health` on the full instance MUST report a passing status
- **AND** every individual file MUST pass `epf-cli validate`
