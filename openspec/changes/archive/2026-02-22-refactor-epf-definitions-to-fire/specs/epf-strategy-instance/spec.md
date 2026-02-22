## MODIFIED Requirements

### Requirement: Strategy-Reality Alignment

The EPF strategy instance SHALL accurately reflect the current state of all products and capabilities across the organization. Value model components, definitions (all tracks), and roadmap KRs MUST correspond to actual shipped or planned capabilities.

All four track definitions (product `fd-*`, strategy `sd-*`, org_ops `pd-*`, commercial `cd-*`) SHALL reside in `FIRE/definitions/{track}/`. No definition files SHALL exist in `FIRE/feature_definitions/` or `READY/definitions/`.

#### Scenario: Value model reflects shipped architecture

- **WHEN** a product has shipped capabilities (e.g., Go server with 19 domains, 609 E2E tests)
- **THEN** the corresponding value model MUST contain components representing those shipped capabilities with accurate maturity and active status

#### Scenario: Abandoned architecture removed from value model

- **WHEN** a planned architecture has been superseded by a different approach
- **THEN** the value model layers describing the abandoned architecture MUST be rewritten to reflect the actual implementation path

#### Scenario: New products tracked in portfolio

- **WHEN** a new product has shipped
- **THEN** it MUST be added to the product portfolio with at least a value model entry and one feature definition in `FIRE/definitions/product/`

#### Scenario: Definitions in correct location

- **WHEN** `epf_health_check` is run on the emergent instance after migration
- **THEN** all fd-*.yaml files are found in `FIRE/definitions/product/`
- **AND** no files exist in `FIRE/feature_definitions/` or `READY/definitions/`
- **AND** health check reports no CRITICAL errors about old structure

---

### Requirement: Cross-Artifact Referential Integrity

All relationship references across EPF artifacts SHALL resolve to valid targets. Feature definition `contributes_to` paths MUST reference existing value model components. Roadmap KR `target_value_paths` MUST reference existing value model components.

#### Scenario: contributes_to paths valid after definition relocation

- **WHEN** all fd-*.yaml files are migrated from `FIRE/feature_definitions/` to `FIRE/definitions/product/`
- **THEN** all `contributes_to` value model paths remain valid (paths reference value model content, not file locations)
- **AND** `epf validate` passes with zero relationship errors on each migrated file

#### Scenario: contributes_to paths valid after value model change

- **WHEN** a value model is restructured (components renamed, added, or removed)
- **THEN** all feature definitions referencing those components via `contributes_to` MUST be updated to use the new component paths
- **AND** `epf-cli validate` MUST pass with zero relationship errors

#### Scenario: KR targets valid after value model change

- **WHEN** value model component paths change
- **THEN** all roadmap KRs with `target_value_paths` referencing old paths MUST be updated
- **AND** `epf-cli health` MUST report no relationship validation errors

---

### Requirement: Schema Compliance After Bulk Updates

After any bulk update to the EPF instance, all modified artifacts SHALL pass `epf-cli validate` and the full instance SHALL pass `epf-cli health` with no errors.

#### Scenario: Full instance health after definition migration

- **WHEN** `epf migrate definitions` is run on the emergent instance
- **THEN** `epf-cli health` on the full instance MUST report a passing status
- **AND** every individual fd-*.yaml file MUST pass `epf-cli validate`
- **AND** `epf_list_features` MUST return all 19 feature definitions

#### Scenario: Full instance health after sync

- **WHEN** a strategy sync operation modifies 15+ files across value models, definitions, portfolio, and roadmap
- **THEN** `epf-cli health` on the full instance MUST report a passing status
- **AND** every individual file MUST pass `epf-cli validate`
