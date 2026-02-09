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

#### Scenario: Generate markdown health report

- **WHEN** AI agent calls `epf_generate_report` with `format="markdown"`
- **THEN** the tool returns a complete health report in markdown format
- **AND** includes all check results and recommendations

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

#### Scenario: Compare file against template

- **WHEN** AI agent calls `epf_diff_template` with a feature definition file
- **THEN** the tool identifies missing fields, type mismatches, and extra fields
- **AND** provides fix hints with priority levels (critical/high/medium/low)

