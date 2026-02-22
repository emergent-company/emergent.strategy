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
- Extract and return the full assumption statement text from the roadmap (SHALL NOT return empty `statement: ""` fields)

The tool SHALL parse assumption statements from all roadmap YAML structures, including nested assumption objects with `id`, `statement`, and `validation_approach` fields, as well as flat string lists.

#### Scenario: Check assumption validation

- **WHEN** AI agent calls `epf_aim_validate_assumptions` with `instance_path`
- **THEN** the tool returns categorized assumptions with counts
- **AND** verbose mode includes detailed evidence for each assumption

#### Scenario: Assumption statements are populated

- **WHEN** AI agent calls `epf_aim_validate_assumptions` on an instance with assumptions in the roadmap
- **THEN** every returned assumption includes its full `statement` text from the roadmap
- **AND** no assumption has an empty `statement` field

---

### Requirement: OKR Progress Calculation via MCP

AI agents SHALL be able to calculate OKR achievement rates via the `epf_aim_okr_progress` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle` (optional), `track` (optional), `all_cycles` (optional)
- Calculate KR achievement rates by status (exceeded/met/partially_met/missed)
- Support filtering by cycle and track
- Return achievement rates with strategic insights
- When no assessment reports exist, fall back to showing KR definitions and status from the roadmap itself with a note that no assessment data is available

#### Scenario: Calculate overall OKR progress

- **WHEN** AI agent calls `epf_aim_okr_progress` with `instance_path`
- **THEN** the tool returns overall achievement rate
- **AND** includes breakdown by status and track

#### Scenario: No assessment reports available

- **WHEN** AI agent calls `epf_aim_okr_progress` on an instance with no assessment reports
- **THEN** the tool returns KR definitions and targets from the roadmap
- **AND** includes a note explaining that no assessment data exists yet
- **AND** does not return an empty or error response

---

### Requirement: Health Report Generation via MCP

AI agents SHALL be able to generate comprehensive health reports via the `epf_generate_report` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `format` (optional: markdown/html/json), `verbose` (optional), `detail_level` (optional: summary/warnings_only/full)
- Run all health checks and compile results
- Return report content in requested format (not write to file)
- Include value model semantic quality scores when Product track value models exist
- Distinguish canonical track results from product track results in the report output
- Default to `warnings_only` detail level for instances with more than 20 files to prevent output truncation

The `detail_level` parameter SHALL control output verbosity:
- `summary`: Only overall scores and pass/fail per section (suitable for quick checks)
- `warnings_only`: Scores plus WARNING and ERROR level issues (default for large instances)
- `full`: All issues including INFO level (current behavior, default for small instances)

The `epf_health_check` tool SHALL also accept the `detail_level` parameter with the same behavior.

The report SHALL include the following sections when applicable:
- Structure validation (existing)
- Schema validation (existing)
- Content readiness (existing, now canonical-aware)
- Feature quality (existing, now canonical-aware, aggregated info messages)
- Relationship integrity (existing, now canonical-aware)
- **Value model quality** (existing — scores, warnings, and check results from semantic analysis)
- **Canonical artifact status** (new — summary of embedded canonical artifacts and their integrity)

Feature quality checks SHALL aggregate repeated identical info-level messages into counts. For example, instead of listing "Feature fd-001 has single-paragraph persona narrative" 17 times, the output SHALL show "17 features have single-paragraph persona narratives" once.

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

#### Scenario: Large instance with default detail level

- **WHEN** AI agent calls `epf_health_check` on an instance with more than 20 files and no explicit `detail_level`
- **THEN** the tool defaults to `warnings_only` detail level
- **AND** repeated info-level feature quality messages are aggregated into counts
- **AND** the response does not exceed reasonable output limits

#### Scenario: Full detail requested

- **WHEN** AI agent calls `epf_health_check` with `detail_level="full"`
- **THEN** the tool returns all issues including INFO level
- **AND** each individual issue is listed separately (no aggregation)

---

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
- Support `feature_definition` as an artifact type (SHALL NOT return "No template available" for feature definitions)

The `epf_get_section_example` tool SHALL also support `feature_definition` as an artifact type.

#### Scenario: Compare file against template

- **WHEN** AI agent calls `epf_diff_template` with a feature definition file
- **THEN** the tool identifies missing fields, type mismatches, and extra fields
- **AND** provides fix hints with priority levels (critical/high/medium/low)

#### Scenario: Feature definition template available

- **WHEN** AI agent calls `epf_diff_template` with a `feature_definition` file path
- **THEN** the tool returns a valid template comparison
- **AND** does not return "No template available"

#### Scenario: Section example for feature definition

- **WHEN** AI agent calls `epf_get_section_example` with `artifact_type="feature_definition"` and a section path
- **THEN** the tool returns the expected section structure from the feature definition template

---

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

Missing canonical definition warnings SHALL be reported at INFO severity (not WARNING) unless the instance has explicitly opted into canonical definition tracking. A count of 131 missing definitions SHALL NOT dominate the health check output.

Instance structure checks (`epf_check_instance`) SHALL list the actual matched filenames for each required file category, not just the count. Example: `"All 5 required READY files present: north_star.yaml, personas.yaml, strategy_formula.yaml, value_model.yaml, roadmap.yaml"`.

Coverage analysis (`epf_analyze_coverage`) SHALL include feature names alongside feature IDs in `most_contributed` and similar output fields.

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

#### Scenario: Missing canonical definitions at INFO severity

- **WHEN** AI agent calls `epf_health_check` on an instance where 131 canonical definitions are missing
- **THEN** the gap is reported at INFO severity, not WARNING
- **AND** the output shows a single summary line (e.g., "131 canonical definitions not synced (info)")
- **AND** the issue does not dominate the health check output or affect the health score

#### Scenario: Instance structure shows matched filenames

- **WHEN** AI agent calls `epf_check_instance`
- **THEN** the output lists the actual matched filenames for each required file category
- **AND** the message format is: "All N required READY files present: file1.yaml, file2.yaml, ..."

#### Scenario: Coverage analysis shows feature names

- **WHEN** AI agent calls `epf_analyze_coverage`
- **THEN** the `most_contributed` output includes feature names alongside feature IDs
- **AND** the format is: "fd-001 (Knowledge Exploration)" rather than just "fd-001"

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

### Requirement: Instance Data Cache with Automatic Invalidation

The MCP server SHALL maintain an in-memory cache of parsed instance data (YAML files, value models, feature definitions, roadmaps, mappings) keyed by file path and filesystem mtime.

The cache SHALL:

- Re-read a file from disk when its mtime has changed since the cached version
- Automatically invalidate all cached data for an instance after any write MCP tool completes (`epf_update_capability_maturity`, `epf_fix_file`, `epf_aim_bootstrap`, `epf_aim_write_assessment`, `epf_aim_write_calibration`, `epf_aim_write_src`, `epf_update_kr`, `epf_add_value_model_component`, `epf_add_value_model_sub`, `epf_rename_value_path`)
- Never serve data from a file whose mtime is older than the file's current mtime on disk

The `epf_reload_instance` MCP tool SHALL force-clear all cached data for a given instance path, accepting parameter `instance_path` (required). This provides a manual escape hatch for agents when files are modified by external processes.

#### Scenario: File edited on disk, subsequent query returns fresh data

- **WHEN** an agent modifies `mappings.yaml` on disk via the Edit tool
- **AND** then calls `epf_validate_relationships`
- **THEN** the tool reads the current file from disk (not a stale cache)
- **AND** returns validation results based on the current file content

#### Scenario: Write tool auto-invalidates cache

- **WHEN** an agent calls `epf_update_capability_maturity` which modifies a feature file
- **AND** then calls `epf_check_feature_quality`
- **THEN** the quality check reflects the updated capability maturity

#### Scenario: Manual cache reload

- **WHEN** an agent calls `epf_reload_instance` with `instance_path`
- **THEN** all cached data for that instance is cleared
- **AND** the next tool call for that instance reads fresh data from disk

---

### Requirement: Content-Based Artifact Discovery

All MCP tools that locate specific artifact files within an EPF instance SHALL use content-based discovery (reading the `meta.artifact_type` YAML field or inferring artifact type from YAML structure) rather than relying solely on filename conventions.

This SHALL apply to at minimum: `epf_get_value_propositions`, `epf_get_competitive_position`, `epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary`, and `epf_search_strategy`.

The discovery logic SHALL:

- Scan all `.yaml` files in the READY/ and FIRE/ directories
- Read the `meta.artifact_type` field to identify artifact type
- Fall back to filename pattern matching only when `meta.artifact_type` is absent
- Support numbered-prefix naming conventions (e.g., `04_strategy_formula.yaml`, `01_north_star.yaml`)

#### Scenario: Strategy formula with numbered prefix

- **WHEN** an instance has a strategy formula file named `04_strategy_formula.yaml`
- **AND** the file contains `meta.artifact_type: strategy_formula`
- **AND** an agent calls `epf_get_value_propositions`
- **THEN** the tool discovers and reads the strategy formula file
- **AND** returns the value propositions from it

#### Scenario: Fallback to filename matching

- **WHEN** an instance has a file named `strategy_formula.yaml` without a `meta.artifact_type` field
- **AND** an agent calls `epf_get_competitive_position`
- **THEN** the tool falls back to filename pattern matching
- **AND** successfully discovers the file

---

### Requirement: Feature Listing Tool

AI agents SHALL be able to get a summary overview of all features in an instance via the `epf_list_features` MCP tool.

The tool SHALL accept parameters: `instance_path` (required), `include_quality` (optional, default true).

The tool SHALL return for each feature definition:

- Feature ID and slug
- Feature name and status
- Persona count
- Scenario count
- `contributes_to` paths
- Missing optional sections (scenarios, implementation.contexts, problem_statement, success_metrics baselines)
- Quality score (when `include_quality=true`)

#### Scenario: List all features with quality scores

- **WHEN** an agent calls `epf_list_features` with `instance_path`
- **THEN** the tool returns a summary table of all feature definitions
- **AND** each entry includes the feature ID, name, persona count, scenario count, and quality score
- **AND** missing optional sections are listed per feature

#### Scenario: List features without quality scores

- **WHEN** an agent calls `epf_list_features` with `include_quality=false`
- **THEN** the tool returns the summary without computing quality scores
- **AND** the response is faster since quality analysis is skipped

---

### Requirement: Cross-File Value Path Rename

AI agents SHALL be able to rename value model paths across all referencing artifacts via the `epf_rename_value_path` MCP tool.

The tool SHALL accept parameters: `instance_path` (required), `old_path` (required), `new_path` (required), `dry_run` (optional, default false).

The tool SHALL update references in:

- Feature definition `contributes_to` arrays
- `mappings.yaml` `sub_component_id` fields
- Roadmap KR `value_model_target.component_path` fields

The tool SHALL validate that `new_path` exists in the instance's value models before applying changes.

In `dry_run` mode, the tool SHALL return a list of all files and fields that would be updated without modifying any files.

#### Scenario: Rename value path across files

- **WHEN** an agent calls `epf_rename_value_path` with `old_path="Product.Explore.ValueProposition"` and `new_path="Product.ExploreAndOnboard.ExploreOrganizations"`
- **THEN** the tool updates all feature `contributes_to` references, mapping entries, and KR targets that reference the old path
- **AND** returns a report of all files and fields that were updated

#### Scenario: Dry run rename

- **WHEN** an agent calls `epf_rename_value_path` with `dry_run=true`
- **THEN** the tool returns all files and fields that would be updated
- **AND** no files are modified on disk

#### Scenario: Invalid new path

- **WHEN** an agent calls `epf_rename_value_path` with a `new_path` that doesn't exist in any value model
- **THEN** the tool returns an error indicating the path is invalid
- **AND** suggests similar valid paths using fuzzy matching

---

### Requirement: Structured KR Updates

AI agents SHALL be able to update Key Result fields via the `epf_update_kr` MCP tool.

The tool SHALL accept parameters: `instance_path` (required), `kr_id` (required), `fields` (required — object with updatable KR fields), `dry_run` (optional).

Updatable fields SHALL include: `value_model_target` (with `track`, `component_path`, `target_maturity`, `maturity_rationale`), `experiment_design`, `status`, `actual`.

When `value_model_target.component_path` is provided, the tool SHALL validate that the path exists in the instance's value models for the specified track.

#### Scenario: Add value model target to a KR

- **WHEN** an agent calls `epf_update_kr` with `kr_id="kr-p-2025-q1-003"` and `fields.value_model_target.component_path="Product.Manage.ManageMeetings"`
- **THEN** the tool validates the path exists in the product value model
- **AND** updates the KR with the `value_model_target` block
- **AND** returns the updated KR content

#### Scenario: Invalid component path

- **WHEN** an agent calls `epf_update_kr` with a `component_path` that doesn't exist in the value model
- **THEN** the tool returns an error with the invalid path
- **AND** suggests similar valid paths

---

### Requirement: Value Model Component Management

AI agents SHALL be able to add components to value models via the `epf_add_value_model_component` and `epf_add_value_model_sub` MCP tools.

`epf_add_value_model_component` SHALL accept: `instance_path` (required), `track` (required), `l1_id` (required), `component_id` (required), `name` (required), `active` (optional, default true).

`epf_add_value_model_sub` SHALL accept: `instance_path` (required), `track` (required), `l1_id` (required), `l2_id` (required), `sub_id` (required), `name` (required), `active` (optional, default true).

Both tools SHALL auto-apply the correct field structure based on track:

- Product track: `sub_components` array with `id`, `name`, `maturity`, `active`
- Non-product tracks (strategy, org_ops, commercial): `subs` array with `id`, `name`, `active`, `uvp`

Both tools SHALL support `dry_run` mode.

#### Scenario: Add L2 component to product value model

- **WHEN** an agent calls `epf_add_value_model_component` with `track="product"`, `l1_id="Manage"`, `component_id="ManageMeetings"`, `name="Manage Meetings"`
- **THEN** the tool adds the component under the Manage L1 layer using product track field structure (`sub_components`)
- **AND** returns the updated value model section

#### Scenario: Add L3 sub to strategy value model

- **WHEN** an agent calls `epf_add_value_model_sub` with `track="strategy"`, `l1_id="Growth"`, `l2_id="MarketExpansion"`, `sub_id="geo-expansion"`, `name="Geographic Expansion"`
- **THEN** the tool adds the sub-component using strategy track field structure (`subs` with `id/name/active/uvp`)

---

### Requirement: Batch Feature Validation

AI agents SHALL be able to validate all feature definitions in an instance via the `epf_batch_validate` MCP tool.

The tool SHALL accept parameters: `instance_path` (required), `artifact_type` (optional, default "feature_definition").

The tool SHALL return a summary table with:

- Total files validated
- Per-file: filename, error count by severity, pass/fail status
- Overall pass/fail status
- Aggregate error count

#### Scenario: Validate all features in one call

- **WHEN** an agent calls `epf_batch_validate` with `instance_path`
- **THEN** the tool validates all feature definition files in FIRE/features/
- **AND** returns a summary table showing each file's validation result
- **AND** includes the aggregate error count and overall pass/fail

---

### Requirement: Wizard-First Protocol in Agent Instructions

The `epf_agent_instructions` MCP tool SHALL return a `mandatory_protocols` section that prescribes deterministic workflows agents MUST follow. The wizard-first protocol SHALL state that agents MUST call `epf_get_wizard_for_task` before creating or substantively modifying any EPF artifact, and MUST follow the returned wizard's guidance if one exists.

The tool SHALL also return a `workflow_decision_tree` section that maps common tasks to specific tool sequences:

| Task | Mandatory Sequence |
|------|-------------------|
| Create artifact | `epf_get_wizard_for_task` -> `epf_get_template` -> write content -> `epf_validate_file` |
| Modify artifact | `epf_get_wizard_for_task` -> read current -> modify -> `epf_validate_file` |
| Query strategy | `epf_get_product_vision` / `epf_get_personas` / `epf_search_strategy` |
| Assess health | `epf_health_check` -> fix issues -> re-check |
| Run AIM cycle | `epf_get_wizard_for_task("assessment")` -> follow synthesizer wizard |

#### Scenario: Agent receives wizard-first protocol

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `mandatory_protocols` section
- **AND** the first protocol states: "Before creating or substantively editing any EPF artifact, you MUST call epf_get_wizard_for_task with a description of your task"
- **AND** the response includes a `workflow_decision_tree` mapping tasks to tool sequences

#### Scenario: Agent instructions include strategy tools

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the `mcp_tools` section includes strategy query tools (`epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary`, `epf_search_strategy`)
- **AND** each strategy tool has a directive "when" description (e.g., "MUST be called before feature work to understand strategic context")

---

### Requirement: Strategy Instance Path Default

When the MCP server is started with a pre-configured instance path (via `EPF_STRATEGY_INSTANCE` environment variable or `strategy serve` command), all MCP tools that accept an `instance_path` parameter SHALL use the pre-configured path as default when the parameter is not explicitly provided.

Explicit `instance_path` parameters SHALL always take precedence over the default.

When a default instance path is active, the `epf_agent_instructions` tool SHALL include a `strategy_context` section with the instance path and product name, informing the agent that strategy query tools are available without explicit instance path parameters.

#### Scenario: Tools use default instance path

- **WHEN** the MCP server is started with `EPF_STRATEGY_INSTANCE=/path/to/instance`
- **AND** an AI agent calls `epf_health_check` without providing `instance_path`
- **THEN** the tool uses `/path/to/instance` as the instance path
- **AND** returns the health check result for that instance

#### Scenario: Explicit instance path overrides default

- **WHEN** the MCP server has a default instance path configured
- **AND** an AI agent calls `epf_health_check` with `instance_path="/other/instance"`
- **THEN** the tool uses `/other/instance`, not the default
- **AND** returns the health check result for the explicit instance

#### Scenario: Agent instructions show strategy context

- **WHEN** the MCP server has a default instance path configured
- **AND** an AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `strategy_context` section
- **AND** the section contains the product name and instance path
- **AND** the section states that strategy tools can be called without explicit `instance_path`

---

### Requirement: Complete Wizard Phase and Keyword Mappings

All embedded wizards SHALL be registered in the `PhaseForWizard` mapping with their correct EPF phase. All wizards SHALL have at least one entry in `KeywordMappings` that enables task-based discovery via `epf_get_wizard_for_task`.

#### Scenario: Strategic reality check wizard is discoverable

- **WHEN** AI agent calls `epf_get_wizard_for_task` with task "run a strategic reality check"
- **THEN** the tool recommends `strategic_reality_check` wizard
- **AND** the wizard is assigned to the AIM phase

#### Scenario: All wizards have phase assignments

- **WHEN** AI agent calls `epf_list_wizards`
- **THEN** every wizard is listed under its correct phase (READY, FIRE, AIM, or Onboarding)
- **AND** no wizard appears under an incorrect or missing phase

---

### Requirement: Directive MCP Tool Descriptions

MCP tool descriptions for wizard and strategy tools SHALL use directive language that guides agent behavior. Tool descriptions SHALL explicitly state when the tool MUST be called (not merely when it "can" be called).

The `epf_get_wizard_for_task` tool description SHALL state: "MUST be called before creating or modifying any EPF artifact. Returns the recommended wizard with instructions to follow."

Strategy query tool descriptions SHALL state when they MUST be used (e.g., `epf_get_product_vision`: "Call before any feature design or strategic decision to ground work in product vision.").

#### Scenario: Wizard tool description is directive

- **WHEN** AI agent discovers the `epf_get_wizard_for_task` tool via MCP tool listing
- **THEN** the tool description contains the word "MUST" and explicitly states it should be called before artifact creation

#### Scenario: Strategy tool description is directive

- **WHEN** AI agent discovers the `epf_get_product_vision` tool via MCP tool listing
- **THEN** the tool description explicitly states when to call it (before feature design, before strategic decisions)

---

### Requirement: Tiered Agent Instructions with Quick Protocol

The embedded AGENTS.md file distributed to product repositories SHALL include a "Quick Protocol" section within the first 200 lines. This section SHALL contain:

1. The wizard-first mandatory protocol
2. The task-to-workflow decision tree
3. Strategy tool awareness (when to query strategy context)
4. The validation mandate (always validate after writes)
5. Tiered tool discovery guidance matching the `tool_tiers` from `epf_agent_instructions` response: Essential (Tier 1) tools listed first with "start here" framing, followed by Guided (Tier 2) and Specialized (Tier 3) categories

The full detailed reference SHALL follow below the Quick Protocol section.

The Quick Protocol SHALL include a prominent warning against generating EPF artifact content from pre-training heuristics, directing agents to always consult wizards for structural decisions.

#### Scenario: Quick Protocol is within context window

- **WHEN** an AI agent reads the AGENTS.md file
- **AND** the agent's context window only processes the first 200 lines
- **THEN** the agent has received the wizard-first protocol, task decision tree, strategy tool guidance, validation mandate, and tiered tool discovery guidance

#### Scenario: Quick Protocol matches agent instructions output

- **WHEN** an AI agent reads the Quick Protocol section of AGENTS.md
- **AND** the agent also calls `epf_agent_instructions`
- **THEN** the mandatory protocols, workflow decision trees, and tool tier assignments are consistent between both sources

#### Scenario: Quick Protocol warns against heuristic override

- **WHEN** an AI agent reads the Quick Protocol section of AGENTS.md
- **THEN** the agent encounters an explicit warning not to generate EPF content from pre-training knowledge
- **AND** the warning directs the agent to use `epf_get_wizard_for_task` before creating or modifying any EPF artifact

### Requirement: Semantic Review Recommendations in Health Check Output

The `epf_health_check` and `epf_generate_report` tools SHALL include a `semantic_review_recommendations` section in their output. This section SHALL contain a list of recommended semantic quality review wizards based on the health check results.

Each recommendation SHALL include:
- The wizard name to invoke
- The reason for the recommendation (which check triggered it and why)
- A severity level (info, warning, critical)
- The triggering check category

The recommendations SHALL be generated from a declarative trigger mapping that maps health check categories and trigger conditions to companion wizards. The mapping SHALL include at minimum:

| Check Category | Trigger Condition | Recommended Wizard |
|---|---|---|
| FeatureQuality | Score < 80% or persona count issues | `feature_quality_review` |
| Coverage | Any L2 value model component uncovered | `feature_quality_review` |
| ValueModelQuality | Quality score < 80 | `value_model_review` |
| CrossRefs/Relationships | Any cross-reference validation failures | `strategic_coherence_review` |
| AIM staleness | LRA > 90 days stale or missing assessment | `strategic_reality_check` |
| Roadmap coverage | Fewer than 2 tracks with OKRs | `balance_checker` |

When all checks pass cleanly, the `semantic_review_recommendations` section SHALL be an empty list.

#### Scenario: Health check recommends feature quality review

- **WHEN** AI agent calls `epf_health_check` on an instance
- **AND** the FeatureQuality check reports a score below 80%
- **THEN** the `semantic_review_recommendations` section includes a recommendation for the `feature_quality_review` wizard
- **AND** the recommendation includes the reason (e.g., "Feature quality score 65% is below the 80% threshold")
- **AND** the recommendation includes severity "warning"

#### Scenario: Health check recommends strategic coherence review

- **WHEN** AI agent calls `epf_health_check` on an instance
- **AND** the cross-reference or relationship validation reports errors
- **THEN** the `semantic_review_recommendations` section includes a recommendation for the `strategic_coherence_review` wizard
- **AND** the recommendation includes the specific cross-reference failures that triggered it

#### Scenario: Clean health check has no semantic recommendations

- **WHEN** AI agent calls `epf_health_check` on an instance
- **AND** all checks pass with scores above thresholds
- **THEN** the `semantic_review_recommendations` section is an empty list

#### Scenario: Health report includes semantic recommendations

- **WHEN** AI agent calls `epf_generate_report` on an instance with quality issues
- **THEN** the generated report includes a "Recommended Semantic Reviews" section
- **AND** each recommendation includes the wizard name and instructions for how to invoke it

---

### Requirement: Feature Quality Review Wizard

The system SHALL include a `feature_quality_review` agent prompt wizard that performs semantic quality evaluation of feature definitions. The wizard SHALL:

1. Consume `epf_health_check` output and individual feature definition files
2. Evaluate JTBD (Jobs To Be Done) format compliance in feature narratives
3. Evaluate persona-feature alignment quality (whether the right personas are assigned to each feature)
4. Evaluate scenario completeness and edge case coverage
5. Produce structured findings with per-feature quality scores

The wizard SHALL be registered in `PhaseForWizard` under the READY phase and SHALL be discoverable via `epf_get_wizard_for_task` for queries about feature quality, feature review, and JTBD compliance.

#### Scenario: Feature quality review wizard is discoverable

- **WHEN** AI agent calls `epf_get_wizard_for_task` with task "review feature quality"
- **THEN** the tool recommends the `feature_quality_review` wizard
- **AND** the wizard is assigned to the READY phase

#### Scenario: Feature quality review wizard produces structured output

- **WHEN** AI agent follows the `feature_quality_review` wizard
- **THEN** the wizard guides the agent to evaluate each feature definition
- **AND** produce findings including: JTBD compliance score, persona alignment score, scenario completeness score, and specific improvement recommendations per feature

---

### Requirement: Strategic Coherence Review Wizard

The system SHALL include a `strategic_coherence_review` agent prompt wizard that evaluates cross-artifact strategic alignment. The wizard SHALL:

1. Consume north star, strategy formula, roadmap, and value model artifacts
2. Evaluate whether vision → mission → strategy → OKRs tell a coherent story
3. Check that roadmap KRs align with strategy formula priorities
4. Check that feature `contributes_to` paths connect to strategic objectives
5. Produce structured findings with a coherence score

The wizard SHALL be registered in `PhaseForWizard` under the READY phase and SHALL be discoverable via `epf_get_wizard_for_task` for queries about strategic alignment, coherence review, and strategy consistency.

#### Scenario: Strategic coherence review wizard is discoverable

- **WHEN** AI agent calls `epf_get_wizard_for_task` with task "check strategic alignment"
- **THEN** the tool recommends the `strategic_coherence_review` wizard
- **AND** the wizard is assigned to the READY phase

#### Scenario: Strategic coherence review evaluates story coherence

- **WHEN** AI agent follows the `strategic_coherence_review` wizard
- **THEN** the wizard guides the agent to trace the strategic narrative from vision through OKRs
- **AND** identify gaps where roadmap priorities don't connect to strategy formula objectives
- **AND** produce a coherence score with specific misalignment findings

### Requirement: Natural Language Action Directives in Diagnostic Responses

Diagnostic MCP tools that populate `required_next_tool_calls` SHALL also include an `action_required` string field containing the same guidance as imperative natural-language text.

The `action_required` field SHALL:

- Be present whenever `required_next_tool_calls` is non-empty
- Contain explicit tool names, parameter values, and reasons in plain English
- Use imperative language ("You MUST call...", "Do NOT attempt...")
- Reference specific values from the diagnostic context (scores, file paths, error counts)

The `action_required` text SHALL be generated from the same mapping function as `required_next_tool_calls` to ensure consistency.

When `required_next_tool_calls` is empty, the `action_required` field SHALL be omitted or set to null.

#### Scenario: Health check with issues includes action directive

- **WHEN** AI agent calls `epf_health_check` and issues are found
- **THEN** the response includes both `required_next_tool_calls` (structured JSON) and `action_required` (natural language text)
- **AND** the `action_required` text references the same tools and parameters as `required_next_tool_calls`

#### Scenario: Validation with structural errors includes action directive

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` and structural issues are detected
- **THEN** the response includes `action_required` text directing the agent to call the wizard
- **AND** the text includes the specific file path and error counts

#### Scenario: Clean health check has no action directive

- **WHEN** AI agent calls `epf_health_check` and all checks pass
- **THEN** the response does not include an `action_required` field
- **AND** `required_next_tool_calls` is an empty array

---

### Requirement: Workflow Completion Signals in Diagnostic Responses

Diagnostic MCP tools SHALL include `workflow_status` and `remaining_steps` fields to signal whether the agent's current workflow is complete.

The `workflow_status` field SHALL be one of:

- `"complete"` — No further action needed; the agent may proceed to other work
- `"incomplete"` — The agent MUST perform additional steps before the workflow is done

The `remaining_steps` field SHALL be an array of strings, each describing one step the agent must take. Steps SHALL be ordered by priority. The field SHALL be an empty array when `workflow_status` is `"complete"`.

The following tools SHALL include workflow completion signals:

| Tool | Complete When | Incomplete When |
|------|---------------|-----------------|
| `epf_health_check` | `required_next_tool_calls` is empty | Any issues found |
| `epf_validate_file` | `valid` is true and no structural issues | Errors exist or structural issues found |

#### Scenario: Incomplete workflow with remaining steps

- **WHEN** AI agent calls `epf_health_check` and issues are found
- **THEN** the response includes `workflow_status: "incomplete"`
- **AND** `remaining_steps` lists each required action as a human-readable string
- **AND** the steps are ordered by priority (urgent first)

#### Scenario: Complete workflow

- **WHEN** AI agent calls `epf_health_check` and all checks pass
- **THEN** the response includes `workflow_status: "complete"`
- **AND** `remaining_steps` is an empty array

#### Scenario: Validation incomplete with errors

- **WHEN** AI agent calls `epf_validate_file` and errors are found
- **THEN** the response includes `workflow_status: "incomplete"`
- **AND** `remaining_steps` includes "Fix the errors listed above" and "Re-validate with epf_validate_file"

---

### Requirement: Combined Wizard Lookup with Content Preview

The `epf_get_wizard_for_task` tool SHALL optionally include wizard content inline when the recommended wizard has high confidence.

The tool SHALL accept an optional `include_wizard_content` parameter (string, default: `"true"`).

When `include_wizard_content` is not `"false"` AND the recommended wizard's confidence is `"high"`, the response SHALL include a `wizard_content_preview` string field containing the full wizard content.

When the confidence is not `"high"` or `include_wizard_content` is `"false"`, the `wizard_content_preview` field SHALL be omitted.

#### Scenario: High-confidence match includes wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with a task that matches a wizard with high confidence
- **THEN** the response includes `wizard_content_preview` with the full wizard content
- **AND** the agent can follow the wizard instructions without a separate `epf_get_wizard` call

#### Scenario: Low-confidence match excludes wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with an ambiguous task
- **AND** the recommended wizard has medium or low confidence
- **THEN** the response does not include `wizard_content_preview`
- **AND** the agent must call `epf_get_wizard` explicitly to get the wizard content

#### Scenario: Opt-out of wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with `include_wizard_content="false"`
- **THEN** the response does not include `wizard_content_preview` regardless of confidence level

---

### Requirement: Post-Condition Directives in Tool Descriptions

MCP tool descriptions for diagnostic and guided-workflow tools SHALL include a `POST-CONDITION:` section that explicitly states what the agent MUST do after receiving the tool's response.

The following tools SHALL have post-condition directives:

| Tool | Post-Condition |
|------|---------------|
| `epf_health_check` | "Follow the action_required field and required_next_tool_calls before proceeding to other work." |
| `epf_validate_file` | "If structural_issue is true, call the recommended_tool. After writing any EPF file, always re-validate." |
| `epf_get_wizard_for_task` | "Call epf_get_wizard with the recommended wizard name, or use wizard_content_preview if included." |
| `epf_get_wizard` | "After following wizard guidance to produce content, validate with epf_validate_file." |
| `epf_get_template` | "Fill template per wizard guidance, then validate with epf_validate_file." |

Post-condition text SHALL be appended to the existing tool description, separated by a space.

#### Scenario: Health check tool description includes post-condition

- **WHEN** AI agent discovers the `epf_health_check` tool via MCP tool listing
- **THEN** the tool description ends with "POST-CONDITION: Follow the action_required field and required_next_tool_calls before proceeding to other work."

#### Scenario: Validate tool description includes post-condition

- **WHEN** AI agent discovers the `epf_validate_file` tool via MCP tool listing
- **THEN** the tool description includes "POST-CONDITION:" text about following recommended_tool for structural issues

---

### Requirement: Anti-Loop Detection in MCP Server

The MCP server SHALL track per-session tool call frequency and inject warnings when the same tool is called repeatedly with identical parameters.

The server SHALL maintain a counter keyed by tool name and a hash of the call parameters. The counter SHALL increment on each tool call.

When a tool+params combination is called more than 2 times in the same session, the response SHALL include a `call_count_warning` object with:

- `message` (string): A natural-language warning telling the agent to stop repeating the call
- `call_count` (integer): How many times this exact call has been made
- `suggested_next_tool` (string): The tool the agent should call instead, based on the current tool's context

When the call count is 2 or fewer, the `call_count_warning` field SHALL be omitted.

The counter SHALL reset when the MCP connection is reset or a new session begins. No persistent storage SHALL be required.

#### Scenario: First two calls are clean

- **WHEN** AI agent calls `epf_health_check` with the same instance_path twice
- **THEN** neither response includes a `call_count_warning` field

#### Scenario: Third call triggers warning

- **WHEN** AI agent calls `epf_health_check` with the same instance_path a third time
- **THEN** the response includes `call_count_warning` with the call count and a suggestion to proceed to the next workflow step
- **AND** the `message` explicitly tells the agent "The result has not changed. Stop calling this tool."

#### Scenario: Different params reset counter

- **WHEN** AI agent calls `epf_health_check` with `instance_path="path-A"` twice
- **AND** then calls `epf_health_check` with `instance_path="path-B"`
- **THEN** the third call does not trigger a warning because the params differ

---

### Requirement: Response Processing Protocol in Agent Instructions

The `epf_agent_instructions` MCP tool SHALL include a `response_processing_protocol` section in its response JSON.

The protocol SHALL instruct agents to check the following fields after every diagnostic tool call, in order:

1. `call_count_warning` — If present, stop repeating the current tool and follow the suggested next tool
2. `action_required` — If present, follow the natural-language directive before doing anything else
3. `workflow_status` — If "incomplete", complete all items in `remaining_steps` before reporting to the user
4. `required_next_tool_calls` — If present, call the suggested tools in priority order

The embedded AGENTS.md Quick Protocol section SHALL include this response processing protocol within the first 200 lines.

#### Scenario: Agent instructions include response processing protocol

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `response_processing_protocol` section
- **AND** the section lists the 4 fields to check in priority order
- **AND** each field has a description of what action to take

#### Scenario: AGENTS.md includes response processing

- **WHEN** an AI agent reads the AGENTS.md file
- **AND** the agent's context window only processes the first 200 lines
- **THEN** the agent has received the response processing protocol alongside the wizard-first protocol and tiered discovery guidance

### Requirement: MCP Tool Error Message Standards

All MCP tools SHALL provide actionable error messages that explain what was searched, where it was searched, and what the caller can do to resolve the issue. Generic error messages such as "not found" or empty results without context are prohibited.

The system SHALL follow these error reporting standards:

1. **File-exists-but-section-missing**: When a tool finds the expected file but cannot locate a required section within it, the error message SHALL name the file found and the specific section/key that was expected but missing. Example: `"Strategy formula found at READY/strategy_formula.yaml but section 'competitive_landscape' is missing. Available top-level sections: vision, value_propositions, strategic_positioning."`
2. **Empty results with explanation**: When a tool returns zero results, the response SHALL include which files were searched and what fields/keys were checked. Example: `"Searched strategy_formula.yaml for 'value_propositions' key. File found but key is empty. Expected a list of value proposition objects."`
3. **Path resolution failures**: When a tool cannot find definitions, templates, or other resources, the error SHALL list the directories searched in priority order. Example: `"Searched for definitions in: (1) READY/definitions/ (0 files), (2) framework canonical path (not configured). Use epf_sync_canonical to populate instance definitions."`

#### Scenario: Strategy formula section missing

- **WHEN** AI agent calls `epf_get_competitive_position` and the strategy formula file exists but lacks a competitive section
- **THEN** the response names the file path found and the specific section expected
- **AND** lists the available sections in the file as alternatives

#### Scenario: Empty value propositions

- **WHEN** AI agent calls `epf_get_value_propositions` and the result is empty
- **THEN** the response explains which files were searched and which keys were checked
- **AND** suggests corrective action if the file structure is unexpected

#### Scenario: Definitions not found

- **WHEN** AI agent calls `epf_list_definitions` and no definitions are found
- **THEN** the response lists the directories searched in priority order
- **AND** suggests using `epf_sync_canonical` if the instance directory is empty

---

### Requirement: LRA Schema Validation Correctness

The `epf_validate_file` tool SHALL correctly validate `living_reality_assessment.yaml` files without crashing or producing internal type errors.

The JSON Schema generator SHALL NOT leak Go-internal types (such as `time.Time`) into generated schemas. All date/time fields SHALL be represented as `type: string` with `format: date-time` (ISO 8601) in the JSON Schema.

#### Scenario: Validate LRA file

- **WHEN** AI agent calls `epf_validate_file` on a `living_reality_assessment.yaml` file
- **THEN** the tool returns validation results (pass or structured errors)
- **AND** does not crash with `jsonschema: invalid jsonType: time.Time`

---

### Requirement: Semantic Version Comparison in Migration

The `epf_check_migration_status` tool SHALL use proper semantic versioning comparison (major.minor.patch) when determining migration direction and necessity.

String-based comparison (where "2.12.0" < "2.1.0" alphabetically) is prohibited. The tool SHALL parse version components as integers for comparison.

The tool SHALL clearly label version fields: `oldest_file_version` (lowest version found across instance files), `newest_file_version` (highest version found), and `target_schema_version` (the version the CLI would migrate to).

#### Scenario: Version comparison with multi-digit minor

- **WHEN** AI agent calls `epf_check_migration_status` on an instance with files at version `2.12.0`
- **AND** the target schema version is `2.13.0`
- **THEN** the tool correctly reports that migration is needed (upward)
- **AND** does not report a downgrade from `2.12.0` to `2.1.0`

#### Scenario: Version field clarity

- **WHEN** AI agent calls `epf_check_migration_status`
- **THEN** the response uses labels `oldest_file_version`, `newest_file_version`, and `target_schema_version`
- **AND** each label clearly indicates what it represents

---

### Requirement: Rename Value Path Without Pre-existing Destination

The `epf_rename_value_path` tool SHALL allow renaming to a value model path that does not yet exist in the value model file.

When the destination path does not exist in any value model file, the tool SHALL either:
- Automatically create the destination component in the appropriate value model file, OR
- Return a clear guidance message explaining the two-step workflow: first add the component via `epf_add_value_model_component`/`epf_add_value_model_sub`, then run the rename

The tool SHALL NOT reject the rename solely because the destination path is absent from the value model.

#### Scenario: Rename to non-existent path

- **WHEN** AI agent calls `epf_rename_value_path` with a destination path not in any value model file
- **THEN** the tool either creates the destination component and performs the rename, or returns actionable guidance for the two-step workflow
- **AND** does not return a generic "path not found" error

---

### Requirement: Cycle-Tagged Assessment Report Naming

AIM health diagnostics SHALL recognize cycle-tagged assessment report filenames (e.g., `assessment_report_c1.yaml`, `assessment_report_c2.yaml`) as valid assessment reports alongside the canonical `assessment_report.yaml` naming.

The system SHALL NOT flag cycle-tagged reports as non-canonical or missing when they follow the `assessment_report_c{N}.yaml` pattern.

#### Scenario: Cycle-tagged assessment recognized

- **WHEN** AI agent calls `epf_aim_health` on an instance with `assessment_report_c1.yaml`
- **THEN** the health check recognizes it as a valid assessment report
- **AND** does not warn about missing assessment reports

---

### Requirement: SRC Generation Dry Run

The `epf_aim_generate_src` tool SHALL support a `dry_run` parameter that returns the generated Strategic Reality Check YAML content without writing it to disk.

This is consistent with other write-adjacent tools (`epf_aim_bootstrap`, `epf_init_instance`, `epf_fix_file`, `epf_rename_value_path`, etc.) that all support dry run.

#### Scenario: Dry run SRC generation

- **WHEN** AI agent calls `epf_aim_generate_src` with `dry_run=true`
- **THEN** the tool returns the SRC YAML content
- **AND** does not write `AIM/strategic_reality_check.yaml` to disk

### Requirement: Tool Call Suggestions in Diagnostic Tool Responses

Diagnostic MCP tools that identify fixable issues SHALL include a `required_next_tool_calls` array in their JSON response payloads. This array SHALL contain structured suggestions for the tool(s) the agent should call next to resolve the identified issues.

Each entry in the `required_next_tool_calls` array SHALL contain:

- `tool` (string): The MCP tool name to call (e.g., `epf_get_wizard_for_task`)
- `params` (object): Pre-filled parameters for the tool call, populated from the diagnostic context
- `reason` (string): A human-readable explanation of why this tool should be called
- `priority` (string): One of `urgent`, `recommended`, or `optional`

The following diagnostic tools SHALL populate `required_next_tool_calls` when issues are found:

| Tool | Trigger Condition | Suggested Tool | Example Params |
|------|-------------------|----------------|----------------|
| `epf_health_check` | Value Model Quality < 80 | `epf_get_wizard_for_task` | `{task: "fix value model quality issues"}` |
| `epf_health_check` | Feature Quality < 80% | `epf_get_wizard_for_task` | `{task: "review feature quality"}` |
| `epf_health_check` | Schema validation errors | `epf_validate_with_plan` | `{path: "<failing_file>"}` |
| `epf_health_check` | Content readiness issues | `epf_get_wizard_for_task` | `{task: "complete EPF artifacts"}` |
| `epf_health_check` | Relationship errors | `epf_validate_relationships` | `{instance_path: "<path>"}` |
| `epf_health_check` | Missing LRA | `epf_aim_bootstrap` | `{instance_path: "<path>"}` |
| `epf_validate_file` | Structural errors (ai_friendly mode) | `epf_get_wizard_for_task` | `{task: "<artifact_type> structure"}` |
| `epf_validate_with_plan` | Chunks with structural issues | `epf_get_wizard_for_task` | `{task: "<artifact_type> structure"}` |

When no issues are found, the `required_next_tool_calls` array SHALL be empty.

The `required_next_tool_calls` field SHALL be added at the root level of the JSON response, not nested inside metadata or sub-objects. This maximizes the likelihood that LLM agents parse and act on the suggestions regardless of model.

The suggestion mapping logic SHALL be centralized in a single function to ensure consistency across tools and simplify maintenance when tool signatures change.

#### Scenario: Health check suggests wizard for low value model quality

- **WHEN** AI agent calls `epf_health_check` on an instance with Value Model Quality score below 80
- **THEN** the response includes a `required_next_tool_calls` array
- **AND** the array contains an entry with `tool: "epf_get_wizard_for_task"`, `params: {task: "fix value model quality issues"}`, and `priority: "urgent"`
- **AND** the `reason` field explains that the value model quality score is below threshold

#### Scenario: Health check suggests multiple tools for multiple issues

- **WHEN** AI agent calls `epf_health_check` on an instance with both schema validation errors and low feature quality
- **THEN** the `required_next_tool_calls` array contains entries for both issues
- **AND** entries are ordered by priority (urgent before recommended before optional)

#### Scenario: Clean health check has empty suggestions

- **WHEN** AI agent calls `epf_health_check` on a healthy instance with all scores above thresholds
- **THEN** the `required_next_tool_calls` array is empty

#### Scenario: Validation suggests wizard for structural errors

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` on a file with structural validation errors
- **THEN** the response includes a `required_next_tool_calls` array with an entry pointing to `epf_get_wizard_for_task`
- **AND** the params include the artifact type context so the wizard can provide relevant guidance

#### Scenario: Backward compatibility preserved

- **WHEN** an existing consumer parses a health check or validation response
- **THEN** all previously existing fields remain present and unchanged
- **AND** the `required_next_tool_calls` field is additive only

---

### Requirement: Structural vs Surface Error Classification in Validation

The `epf_validate_file` tool (when called with `ai_friendly=true`) and the `epf_validate_with_plan` tool SHALL classify validation errors into two categories: **structural** and **surface**.

**Structural errors** indicate the agent misunderstands EPF architecture and MUST consult a wizard before attempting fixes. Structural classification SHALL be triggered by any of:

- Type mismatches on top-level YAML sections (e.g., a map where a list is expected at L1/L2 level)
- More than 30% of validated fields failing validation in a single file
- Anti-pattern indicators detected by heuristic analysis (e.g., product names used as value model layer names, one-to-one feature-component mapping patterns)
- Completely missing required top-level sections that define artifact identity

**Surface errors** indicate the agent understands the structure but made localized mistakes. Surface errors can be fixed directly without wizard consultation. Surface classification applies to:

- Individual missing required fields within an otherwise correct structure
- Enum value violations on specific fields
- Format/pattern violations (e.g., wrong date format, invalid ID pattern)
- Trailing whitespace, line ending, or encoding issues

The AI-friendly validation output SHALL include:

- `structural_issue` (boolean): `true` when any structural error is detected in the file
- `recommended_tool` (object, optional): A `ToolCallSuggestion` entry populated when `structural_issue` is `true`, pointing the agent to the relevant wizard

The `epf_validate_with_plan` tool SHALL include a `structural_issue` flag and optional `recommended_tool` in chunk metadata when a chunk contains structural errors. This signals to agents that they should stop brute-forcing fixes on that chunk and consult the wizard first.

#### Scenario: Structural errors redirect to wizard

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` on a value model file where L1 layer names match product names
- **THEN** the response has `structural_issue: true`
- **AND** `recommended_tool` contains `{tool: "epf_get_wizard_for_task", params: {task: "fix value model structure"}, reason: "Anti-pattern detected: product names used as layer names", priority: "urgent"}`

#### Scenario: Surface errors do not trigger wizard redirect

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` on a feature definition file missing only the `success_metrics.baseline` field
- **THEN** the response has `structural_issue: false`
- **AND** `recommended_tool` is absent or null

#### Scenario: High error rate triggers structural classification

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` on a file where more than 30% of fields fail validation
- **THEN** the response has `structural_issue: true`
- **AND** the `recommended_tool` reason references the high error rate as evidence of fundamental misunderstanding

#### Scenario: Fix plan chunks flag structural issues

- **WHEN** AI agent calls `epf_validate_with_plan` on a file with structural issues
- **THEN** chunks containing structural errors include `structural_issue: true` in their metadata
- **AND** those chunks include a `recommended_tool` suggestion

---

### Requirement: Tiered Tool Discovery in Agent Instructions Response

The `epf_agent_instructions` MCP tool response SHALL include a `tool_tiers` section that organizes all MCP tools into three discovery tiers. This reduces cognitive overload for agents scanning the tool listing and provides a clear "start here" signal.

The tiers SHALL be:

| Tier | Label | Tools | Purpose |
|------|-------|-------|---------|
| 1 | Essential | `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file` | Entry points — always start here |
| 2 | Guided | `epf_get_wizard`, `epf_get_template`, `epf_get_schema`, `epf_validate_with_plan`, strategy query tools (`epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary`, `epf_search_strategy`, `epf_get_competitive_position`, `epf_get_value_propositions`) | Use after Tier 1 directs you or when querying strategy context |
| 3 | Specialized | All remaining MCP tools | Use for specific tasks as needed |

Each tool entry in the `mcp_tools` section of the agent instructions response SHALL include a `tier` field with value `"essential"`, `"guided"`, or `"specialized"`.

The response SHALL include a `tool_discovery_guidance` field containing explicit text that directs agents to:

1. Start with Tier 1 (Essential) tools
2. Follow tool response suggestions to reach Tier 2 tools
3. Never generate EPF content from pre-training heuristics — always use wizards
4. All tools remain available; tiers indicate recommended workflow, not access control

#### Scenario: Agent instructions include tool tiers

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `tool_tiers` section with three tiers
- **AND** Tier 1 contains exactly `epf_health_check`, `epf_get_wizard_for_task`, and `epf_validate_file`
- **AND** each tool in `mcp_tools` has a `tier` field

#### Scenario: Tool discovery guidance is present

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `tool_discovery_guidance` field
- **AND** the guidance explicitly states to start with Tier 1 tools
- **AND** the guidance warns against generating EPF content from pre-training

#### Scenario: Tiers do not restrict tool access

- **WHEN** AI agent reads the tiered tool listing
- **THEN** the tier descriptions explicitly state that all tools remain available
- **AND** tiers indicate recommended workflow order, not access control

