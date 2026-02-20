# epf-cli-mcp Specification

## Purpose
TBD - created by archiving change add-epf-cli-mcp-parity. Update Purpose after archive.
## Requirements
### Requirement: EPF Instance Initialization via MCP

AI agents SHALL be able to initialize new EPF instances programmatically via the `epf_init_instance` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `product_name`, `epf_version`, `structure_type`
- Support a `dry_run` mode that returns what would be created without making changes
- Create the standard EPF directory structure (READY/, FIRE/, AIM/)
- Create the anchor file (`_epf.yaml`) with proper metadata
- Return the list of created files and the anchor file content

#### Scenario: Initialize new EPF instance

- **WHEN** AI agent calls `epf_init_instance` with `path="/project/docs/epf"` and `product_name="My Product"`
- **THEN** the tool creates the EPF directory structure and anchor file
- **AND** returns the created file paths and anchor content

#### Scenario: Dry run initialization

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the tool returns what would be created without making any changes
- **AND** the AI agent can present the plan to the user for confirmation

---

### Requirement: File Fix Operations via MCP

AI agents SHALL be able to auto-fix common EPF file issues via the `epf_fix_file` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `fix_types[]` (optional), `dry_run` (optional)
- Support granular fix types: `whitespace`, `line_endings`, `tabs`, `newlines`, `versions`
- Apply all fix types when none specified
- Return a detailed change report showing file, line number, and before/after for each fix
- Support `dry_run` mode to preview changes

#### Scenario: Fix trailing whitespace

- **WHEN** AI agent calls `epf_fix_file` with `path="file.yaml"` and `fix_types=["whitespace"]`
- **THEN** trailing whitespace is removed from all lines
- **AND** a change report shows each line that was modified

#### Scenario: Preview fixes without applying

- **WHEN** AI agent calls `epf_fix_file` with `dry_run=true`
- **THEN** no changes are made to the file
- **AND** the tool returns what would be changed

---

### Requirement: AIM Bootstrap via MCP

AI agents SHALL be able to create Living Reality Assessments via the `epf_aim_bootstrap` MCP tool.

The tool SHALL:

- Accept all parameters from the CLI wizard (org_type, team_size, funding_stage, lifecycle_stage, adoption_level, track_baselines, etc.)
- Support partial parameters with sensible defaults based on adoption level
- Create the LRA file at `AIM/living_reality_assessment.yaml`
- Return the created LRA content for AI agent review

#### Scenario: Create LRA with full parameters

- **WHEN** AI agent calls `epf_aim_bootstrap` with complete organizational context
- **THEN** the LRA is created with provided values
- **AND** the tool returns the YAML content

#### Scenario: Create LRA with defaults

- **WHEN** AI agent calls `epf_aim_bootstrap` with only required parameters
- **THEN** the LRA is created with sensible defaults based on adoption level
- **AND** the tool indicates which fields used defaults

---

### Requirement: AIM Status via MCP

AI agents SHALL be able to query Living Reality Assessment status via the `epf_aim_status` MCP tool.

The tool SHALL:

- Accept parameter: `instance_path` (required)
- Return comprehensive LRA summary including:
  - Lifecycle stage (bootstrap/maturing/evolved)
  - Adoption level (0-3)
  - Organizational context (org type, team size, funding)
  - Track maturity baselines
  - Current focus and attention allocation
  - Warnings (low maturity, low runway, unbalanced attention)

#### Scenario: Get LRA status

- **WHEN** AI agent calls `epf_aim_status` with `instance_path`
- **THEN** the tool returns the complete LRA summary
- **AND** includes any warnings about the current state

---

### Requirement: AIM Assessment Generation via MCP

AI agents SHALL be able to generate assessment report templates via the `epf_aim_assess` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `roadmap_id` (optional)
- Load roadmap data and extract all OKRs and Key Results
- Generate assessment template YAML with TODO placeholders
- Return the YAML content (not write to file by default)

#### Scenario: Generate assessment template

- **WHEN** AI agent calls `epf_aim_assess` with `instance_path`
- **THEN** the tool returns assessment YAML with all OKRs from roadmap
- **AND** includes TODO placeholders for actuals, status, and evidence

---

### Requirement: Assumption Validation via MCP

AI agents SHALL be able to check assumption validation status via the `epf_aim_validate_assumptions` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `verbose` (optional)
- Cross-reference assumptions from roadmap with evidence from assessments
- Categorize assumptions as: validated, invalidated, inconclusive, pending
- Return summary counts and optional detailed evidence

#### Scenario: Check assumption validation

- **WHEN** AI agent calls `epf_aim_validate_assumptions` with `instance_path`
- **THEN** the tool returns categorized assumptions with counts
- **AND** verbose mode includes detailed evidence for each assumption

---

### Requirement: OKR Progress Calculation via MCP

AI agents SHALL be able to calculate OKR achievement rates via the `epf_aim_okr_progress` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle` (optional), `track` (optional), `all_cycles` (optional)
- Calculate KR achievement rates by status (exceeded/met/partially_met/missed)
- Support filtering by cycle and track
- Return achievement rates with strategic insights

#### Scenario: Calculate overall OKR progress

- **WHEN** AI agent calls `epf_aim_okr_progress` with `instance_path`
- **THEN** the tool returns overall achievement rate
- **AND** includes breakdown by status and track

---

### Requirement: Health Report Generation via MCP

AI agents SHALL be able to generate comprehensive health reports via the `epf_generate_report` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `format` (optional: markdown/html/json), `verbose` (optional)
- Run all health checks and compile results
- Return report content in requested format (not write to file)
- Include value model semantic quality scores when Product track value models exist
- Distinguish canonical track results from product track results in the report output

The report SHALL include the following sections when applicable:
- Structure validation (existing)
- Schema validation (existing)
- Content readiness (existing, now canonical-aware)
- Feature quality (existing, now canonical-aware)
- Relationship integrity (existing, now canonical-aware)
- **Value model quality** (existing — scores, warnings, and check results from semantic analysis)
- **Canonical artifact status** (new — summary of embedded canonical artifacts and their integrity)

#### Scenario: Generate markdown health report

- **WHEN** AI agent calls `epf_generate_report` with `format="markdown"`
- **THEN** the tool returns a complete health report in markdown format
- **AND** includes all check results and recommendations
- **AND** includes value model quality section when value models exist
- **AND** labels canonical vs product track sections when both are present

#### Scenario: Generate report with value model quality warnings

- **WHEN** AI agent calls `epf_generate_report` on an instance with product-catalog value models
- **THEN** the report includes a "Value Model Quality" section
- **AND** the section shows the quality score, check results, and specific warnings
- **AND** the report includes actionable recommendations referencing the structural anti-patterns guide

#### Scenario: Generate report with canonical artifact summary

- **WHEN** AI agent calls `epf_generate_report` on an instance with canonical track artifacts
- **THEN** the report includes a "Canonical Artifact Status" section
- **AND** the section lists which canonical definitions and value models are present
- **AND** canonical track scores are reported separately from product track scores

### Requirement: Artifact Comparison via MCP

AI agents SHALL be able to compare EPF artifacts via the `epf_diff_artifacts` MCP tool.

The tool SHALL:

- Accept parameters: `path1` (required), `path2` (required), `format` (optional), `verbose` (optional)
- Support file-to-file and directory-to-directory comparison
- Return structured diff showing additions, modifications, and removals
- Verbose mode shows actual old/new values

#### Scenario: Compare two artifact versions

- **WHEN** AI agent calls `epf_diff_artifacts` with two file paths
- **THEN** the tool returns structural differences
- **AND** identifies changed, added, and removed fields

---

### Requirement: Template Comparison via MCP

AI agents SHALL be able to compare files against canonical templates via the `epf_diff_template` MCP tool.

The tool SHALL:

- Accept parameters: `file_path` (required), `format` (optional), `verbose` (optional)
- Auto-detect artifact type from file path
- Compare against canonical template for that type
- Return structural differences with fix hints and priorities

#### Scenario: Compare file against template

- **WHEN** AI agent calls `epf_diff_template` with a feature definition file
- **THEN** the tool identifies missing fields, type mismatches, and extra fields
- **AND** provides fix hints with priority levels (critical/high/medium/low)

### Requirement: Value Model Semantic Quality Validation via MCP

AI agents SHALL be able to assess value model semantic quality via the `epf_health_check` MCP tool's value model quality section.

The system SHALL perform the following heuristic checks on Product track value models:

1. **Product-Name Collision Detection**: Cross-reference L1 layer names and L2 component names against product/brand names from `product_portfolio.yaml`. If >30% of L1 names or >40% of L2 names match (case-insensitive, partial match), emit a WARNING indicating possible product-catalog structure.

2. **One-to-One Mapping Detection**: Analyze `contributes_to` relationships between features and L2 components. If >70% of components have exactly 1 contributing feature AND >70% of features point to exactly 1 component, emit a WARNING indicating the model may lack many-to-many value relationships.

3. **Layer Name Heuristic Analysis**: Flag L1/L2 names containing proper nouns not found in standard vocabulary (likely brand/product names). Emit INFO-level messages for flagged names. Recognize positive signals: process/action words (Transformation, Processing, Delivery, Management) and functional class descriptions (Heat Exchange, Energy Storage).

4. **Multi-File Overlap Detection**: When multiple `product.*.value_model.yaml` files exist, check for overlapping L1 layer purposes or shared product references across files. If significant overlap is detected, emit a WARNING suggesting consolidation.

The system SHALL compute an overall quality score (0-100) as a weighted average:
- No product-name collisions: 30%
- Many-to-many relationship ratio: 20%
- Layer name quality heuristic: 20%
- L2 component diversity per L1: 15%
- L3 distribution evenness: 15%

Quality thresholds:
- 80+: Good (value-delivery-category organization)
- 60-79: Warning (possible structural issues)
- <60: Alert (likely product-catalog anti-pattern)

All checks SHALL emit WARNING or INFO level messages, never ERROR. Quality scores SHALL NOT cause health check failure.

All checks SHALL degrade gracefully when `product_portfolio.yaml` does not exist (skip product-name collision check with INFO message).

#### Scenario: Health check detects product-catalog anti-pattern

- **WHEN** AI agent calls `epf_health_check` on an instance with value model layers named after products
- **THEN** the response includes a "Value Model Quality" section
- **AND** the product-name collision check emits a WARNING with the matching names
- **AND** the overall quality score is below 60

#### Scenario: Health check reports good value model quality

- **WHEN** AI agent calls `epf_health_check` on an instance with properly structured value models
- **THEN** the response includes a "Value Model Quality" section with score 80+
- **AND** no WARNING messages are emitted for value model quality

#### Scenario: Health check with no product portfolio

- **WHEN** AI agent calls `epf_health_check` on an instance without `product_portfolio.yaml`
- **THEN** the product-name collision check is skipped
- **AND** an INFO message indicates the check was skipped due to missing portfolio
- **AND** other quality checks (mapping ratio, name heuristics, overlap) still run

#### Scenario: Health check with no value models

- **WHEN** AI agent calls `epf_health_check` on an instance with no value model files
- **THEN** the "Value Model Quality" section is omitted from the response

---

### Requirement: Canonical Artifact Awareness in Health Checks

The system SHALL distinguish between canonical (framework-provided) artifacts and user-authored artifacts when performing health checks and validation.

Canonical tracks are: strategy, org_ops, and commercial. The product track is user-authored.

The system SHALL provide canonical context helper functions that health check code can query to determine whether a given track, file, or artifact is canonical.

Health checks that produce scores (content readiness, coverage analysis, feature quality, relationship integrity) SHALL compute separate metrics for canonical and product tracks. The overall health score SHALL weight product track artifacts more heavily than canonical track artifacts.

Content readiness checks SHALL NOT produce TBD/TODO/placeholder warnings for canonical artifacts that ship with `active: false` or with intentionally minimal content.

Coverage analysis SHALL NOT penalize overall scores for canonical tracks having lower feature coverage than the product track.

AIM health diagnostics (LRA staleness, evidence gaps) SHALL apply appropriate thresholds for canonical tracks that may not have the same level of assessment activity as the product track.

All canonical-awareness logic SHALL be centralized in a reusable helper (not scattered across individual check files) to ensure consistency and ease of maintenance.

#### Scenario: Health check on instance with canonical and product artifacts

- **WHEN** AI agent calls `epf_health_check` on an instance containing both product track and canonical track (strategy, org_ops, commercial) artifacts
- **THEN** the response distinguishes canonical from product track results
- **AND** canonical track artifacts do not produce false positive warnings for expected minimal content
- **AND** the overall health score primarily reflects product track artifact quality

#### Scenario: Content readiness with canonical definitions

- **WHEN** AI agent calls `epf_health_check` on an instance where canonical definitions contain `active: false` or TBD placeholders
- **THEN** the content readiness section does not report warnings for those canonical artifacts
- **AND** the content readiness score reflects only user-authored artifact completeness

#### Scenario: Coverage analysis with canonical tracks

- **WHEN** AI agent calls `epf_health_check` on an instance where strategy/org_ops/commercial tracks have fewer features than the product track
- **THEN** the coverage analysis does not penalize the overall score for canonical track gaps
- **AND** canonical track coverage is reported separately from product track coverage

#### Scenario: Health check on product-only instance

- **WHEN** AI agent calls `epf_health_check` on an instance with only product track artifacts (no canonical tracks)
- **THEN** the health check behaves identically to current behavior
- **AND** no canonical-awareness logic changes the results

---

### Requirement: Canonical Definition Embedding and Init

The system SHALL embed canonical track definitions (strategy sd-*, org_ops pd-*, commercial cd-*) in the CLI binary alongside the already-embedded value model templates.

The `epf_init_instance` tool SHALL create canonical definitions when initializing new EPF instances, using the same 3-tier loading priority as value model templates: instance files > `canonical_path` config > embedded fallback.

The `scripts/sync-embedded.sh` script SHALL sync canonical definitions from the upstream `canonical-epf` repository into the embedded templates directory.

#### Scenario: Init creates canonical definitions

- **WHEN** AI agent calls `epf_init_instance` with `path` and `product_name`
- **THEN** the tool creates canonical definitions for strategy, org_ops, and commercial tracks in the READY directory
- **AND** the created definitions match the embedded canonical content
- **AND** value model templates continue to be created as before

#### Scenario: Init dry run includes canonical definitions

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the returned file list includes canonical definitions that would be created
- **AND** the preview shows the canonical definition content

#### Scenario: Init with canonical_path override

- **WHEN** AI agent calls `epf_init_instance` and the EPF config specifies a `canonical_path`
- **THEN** canonical definitions are loaded from that path instead of the embedded fallback
- **AND** this follows the same 3-tier priority used for value model templates

