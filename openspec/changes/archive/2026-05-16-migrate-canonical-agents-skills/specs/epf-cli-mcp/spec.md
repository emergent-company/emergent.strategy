## ADDED Requirements

### Requirement: Agent Import from External Formats

The system SHALL provide an `epf_import_agent` MCP tool and `epf-cli agents import` CLI command that imports agent definitions from external formats into EPF agent format. The import process SHALL auto-detect the source format, generate an `agent.yaml` manifest with best-effort field mapping, copy or transform the prompt content into `prompt.md`, and mark fields requiring human review with `# TODO: review` comments.

#### Scenario: Import from raw text file

- **WHEN** user calls `epf_import_agent` with `source="/path/to/my-agent-prompt.md"` and `instance_path="/project/docs/epf/my-product"`
- **THEN** the tool detects raw text format (no frontmatter, no structured YAML)
- **AND** creates `agents/my-agent-prompt/agent.yaml` with default fields and TODO markers
- **AND** copies the text content to `agents/my-agent-prompt/prompt.md`
- **AND** returns the created file paths and a list of fields that need review

#### Scenario: Import from CrewAI format

- **WHEN** user calls `epf_import_agent` with `source="/path/to/agent.yaml"` and `format="crewai"`
- **THEN** the tool reads the CrewAI agent definition (`role`, `goal`, `backstory` fields)
- **AND** maps `role` to `agent.yaml` display_name, `goal` to description, `backstory` to prompt.md
- **AND** infers agent type from the role description
- **AND** creates the EPF agent directory with generated manifest

#### Scenario: Import from OpenAI Assistants JSON

- **WHEN** user calls `epf_import_agent` with `source="/path/to/assistant.json"` and `format="openai"`
- **THEN** the tool reads the OpenAI Assistant definition (`instructions`, `tools[]`, `model`)
- **AND** maps `instructions` to prompt.md, `tools` to required tools in manifest
- **AND** infers capability class from the `model` field
- **AND** creates the EPF agent directory with generated manifest

#### Scenario: Auto-detect format

- **WHEN** user calls `epf_import_agent` with `source="/path/to/file"` without specifying `format`
- **THEN** the tool examines the file content to detect the format
- **AND** applies the appropriate import mapping
- **AND** if detection fails, falls back to raw text import

### Requirement: Skill Import from External Formats

The system SHALL provide an `epf_import_skill` MCP tool and `epf-cli skills import` CLI command that imports skill definitions from external formats into EPF skill format. The import process SHALL generate a `skill.yaml` manifest and `prompt.md` from the source content.

#### Scenario: Import from raw text file

- **WHEN** user calls `epf_import_skill` with `source="/path/to/my-workflow.md"` and `instance_path="/project/docs/epf/my-product"`
- **THEN** the tool creates `skills/my-workflow/skill.yaml` with default fields and TODO markers
- **AND** copies the text content to `skills/my-workflow/prompt.md`
- **AND** returns the created file paths

#### Scenario: Import from CrewAI task format

- **WHEN** user calls `epf_import_skill` with `source="/path/to/task.yaml"` and `format="crewai"`
- **THEN** the tool reads the CrewAI task definition (`description`, `expected_output`, `tools[]`)
- **AND** maps `description` to prompt.md, `expected_output` to output section in skill.yaml
- **AND** creates the EPF skill directory with generated manifest

#### Scenario: Import preserves existing files

- **WHEN** user calls `epf_import_skill` and the target skill directory already exists
- **THEN** the tool returns an error indicating the skill already exists
- **AND** suggests using `--force` to overwrite
