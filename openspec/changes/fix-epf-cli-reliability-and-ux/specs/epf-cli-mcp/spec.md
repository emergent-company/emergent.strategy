## ADDED Requirements

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

## MODIFIED Requirements

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
