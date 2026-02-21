## ADDED Requirements

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

## MODIFIED Requirements

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
