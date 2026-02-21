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
- Content readiness (existing, now canonical-aware) — with structured placeholder details: file, line, field, placeholder text
- Feature quality (existing, now canonical-aware) — with per-issue score-impact annotations
- Relationship integrity (existing, now canonical-aware)
- **Value model quality** (existing — scores, warnings, and check results from semantic analysis)
- **Canonical artifact status** (new — summary of embedded canonical artifacts and their integrity)

The content readiness sub-check SHALL return structured details for each placeholder found: `{file, line, field, placeholder_text}`, not just a count and grade.

The feature quality sub-check SHALL include score-impact annotations: each quality issue SHALL indicate how many points it costs and which actions would improve the score.

#### Scenario: Generate markdown health report

- **WHEN** AI agent calls `epf_generate_report` with `format="markdown"`
- **THEN** the tool returns a complete health report in markdown format
- **AND** includes all check results and recommendations
- **AND** includes value model quality section when value models exist
- **AND** labels canonical vs product track sections when both are present

#### Scenario: Content readiness shows placeholder locations

- **WHEN** AI agent calls `epf_generate_report` and the instance has placeholder content
- **THEN** the content readiness section lists each placeholder with file path, line number, field name, and placeholder text
- **AND** agents can fix placeholders without running separate grep operations

#### Scenario: Feature quality shows score impact

- **WHEN** AI agent calls `epf_generate_report` and the instance has feature quality issues
- **THEN** the feature quality section shows each issue with its estimated score impact
- **AND** agents can prioritize fixes by highest point improvement

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

The full detailed reference SHALL follow below the Quick Protocol section.

#### Scenario: Quick Protocol is within context window

- **WHEN** an AI agent reads the AGENTS.md file
- **AND** the agent's context window only processes the first 200 lines
- **THEN** the agent has received the wizard-first protocol, task decision tree, strategy tool guidance, and validation mandate

#### Scenario: Quick Protocol matches agent instructions output

- **WHEN** an AI agent reads the Quick Protocol section of AGENTS.md
- **AND** the agent also calls `epf_agent_instructions`
- **THEN** the mandatory protocols and workflow decision trees are consistent between both sources

---

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

