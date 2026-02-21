## MODIFIED Requirements

### Requirement: Health Check Engine
The health check engine SHALL run comprehensive diagnostics including structural, schema, feature quality, value model quality, content readiness, AIM health, and semantic review recommendations. The engine SHALL correctly resolve multi-file value model paths, detect brand/product names in VM layers via portfolio cross-referencing, validate mappings.yaml paths, check LRA factual consistency, detect stale metadata, and surface per-track coverage breakdowns. The product_name_collision check SHALL locate product_portfolio.yaml at the instance root regardless of nesting depth.

#### Scenario: Multi-VM path resolution
- **WHEN** a health check runs on an instance with 4+ value model files
- **THEN** all contributes_to paths are validated against ALL VM files, not just one

#### Scenario: Portfolio file discovery
- **WHEN** product_portfolio.yaml exists at instance root
- **THEN** the product_name_collision check loads and processes it (not "not found")

#### Scenario: Brand name detection in VM layers
- **WHEN** a VM L1 or L2 layer name matches a product name from product_portfolio.yaml
- **THEN** a warning is reported flagging the brand name in the value-delivery layer

#### Scenario: Stale metadata detection
- **WHEN** a READY artifact has metadata.instance that differs from _epf.yaml product name
- **THEN** a warning is reported about instance name mismatch

#### Scenario: Per-track coverage in health summary
- **WHEN** a health check completes
- **THEN** coverage is broken down per track (e.g. "Product: 50%, Strategy: 0%")

### Requirement: Relationship Validation
The relationship validator SHALL validate all contributes_to paths in feature definitions, all KR target paths in roadmaps, AND all sub_component_id paths in mappings.yaml against the complete set of value model files. Invalid paths SHALL include "did you mean" suggestions.

#### Scenario: Mappings.yaml phantom path detection
- **WHEN** mappings.yaml contains sub_component_id paths that don't exist in any VM file
- **THEN** they are reported as errors with "did you mean" suggestions

#### Scenario: Multi-file VM resolution for relationship validation
- **WHEN** contributes_to paths span multiple VM files
- **THEN** all paths are resolved correctly across all files

### Requirement: Feature Quality Assessment
The feature quality checker SHALL assess scenarios (in implementation.scenarios, definition.scenarios, or top-level), contexts (in implementation.contexts, definition.context, or top-level), persona narratives (paragraph count, character count, concrete metrics, prose format), and contributes_to cardinality. Features without scenarios SHALL score below 80. Features without contexts SHALL receive a score penalty of ~10 points.

#### Scenario: Missing scenarios penalty
- **WHEN** a feature definition has no scenarios in any location
- **THEN** the quality score is below 80

#### Scenario: Contributes_to cardinality nudge
- **WHEN** a feature contributes to only 1 VM path
- **THEN** an informational suggestion is shown (no score penalty)

#### Scenario: Persona narrative quality
- **WHEN** persona narratives use bullet points instead of prose
- **THEN** a warning is reported

### Requirement: Value Model Quality Assessment
The VM quality checker SHALL include heuristic approximations of the wizard litmus tests, including the Product Removal Test (cross-reference L1/L2 names against portfolio product names). Brand-name components SHALL reduce the quality score.

#### Scenario: Product Removal Test heuristic
- **WHEN** an L1 or L2 layer name contains a product name from the portfolio
- **THEN** the VM quality score is reduced and a warning is reported

### Requirement: AIM Phase Tools
The AIM tools SHALL correctly extract assumption statements from roadmap data (non-empty), validate LRA factual claims against actual instance state (file counts), and support both canonical and cycle-tagged assessment report filenames.

#### Scenario: Assumption statement extraction
- **WHEN** epf_aim_validate_assumptions runs on an instance with roadmap assumptions
- **THEN** each assumption has a non-empty statement field

#### Scenario: LRA factual consistency
- **WHEN** the LRA claims "N value models" but the instance has a different count
- **THEN** a warning is reported about the discrepancy

#### Scenario: Cycle-tagged assessment reports
- **WHEN** an assessment report uses the pattern assessment_report_c1.yaml
- **THEN** AIM tools find and process it without error

## ADDED Requirements

### Requirement: Migration Status Semver Comparison
The migration status check SHALL use proper semantic version comparison (not string comparison) when comparing current and target EPF versions. Version 2.12.0 SHALL be recognized as newer than 2.1.0.

#### Scenario: Correct semver ordering
- **WHEN** current_version is 2.12.0 and target schemas are at 2.1.0
- **THEN** no migration is suggested (current is newer)

#### Scenario: Multi-digit minor version
- **WHEN** comparing versions like 2.2.0 vs 2.10.0
- **THEN** 2.10.0 is correctly identified as newer

### Requirement: Definition Loading
The epf_list_definitions MCP tool SHALL load and return definitions for all tracks (product, strategy, org_ops, commercial) from embedded content. The tool SHALL NOT return "Definitions not loaded" when definitions exist in the embedded framework.

#### Scenario: List definitions returns content
- **WHEN** epf_list_definitions is called for any track
- **THEN** definitions are returned (not "Definitions not loaded")

### Requirement: Multi-File VM Overlap Accuracy
The multi-file VM overlap check SHALL only report overlaps between layers that actually exist in multiple VM files. The check SHALL correctly associate each L1 layer with its source file and only flag genuine cross-file duplicates.

#### Scenario: No false positive overlaps
- **WHEN** two VM files have completely different L1 layers
- **THEN** no overlap is reported between them
