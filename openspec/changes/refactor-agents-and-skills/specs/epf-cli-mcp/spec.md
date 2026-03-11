## ADDED Requirements

### Requirement: Agent Discovery and Retrieval

The system SHALL provide MCP tools for discovering and retrieving EPF agent definitions. Agents are named AI personas with structured metadata (identity, personality, skills, routing rules) that replace the current wizard/agent_prompt concept. The `epf_list_agents` tool SHALL list available agents with filtering by type and phase. The `epf_get_agent` tool SHALL return the full agent manifest and prompt content. The `epf_get_agent_for_task` tool SHALL recommend the best agent for a user's task description using keyword matching and trigger phrase analysis.

#### Scenario: List agents by phase

- **WHEN** AI agent calls `epf_list_agents` with `phase="READY"`
- **THEN** the tool returns all agents associated with the READY phase
- **AND** each agent entry includes name, type, display_name, description, and skill count

#### Scenario: Get agent with manifest

- **WHEN** AI agent calls `epf_get_agent` with `name="pathfinder"`
- **THEN** the tool returns the agent manifest (from `agent.yaml`) and prompt content (from `prompt.md`)
- **AND** the response includes the list of required and optional skills
- **AND** the response includes routing metadata (trigger phrases, keywords)

#### Scenario: Legacy wizard format compatibility

- **WHEN** the agent loader encounters a `.agent_prompt.md` file without a corresponding `agent.yaml`
- **THEN** it SHALL parse metadata from the Markdown content using the legacy parser
- **AND** expose the wizard as an agent through the new MCP tools
- **AND** the agent response SHALL include a `legacy_format: true` flag

### Requirement: Skill Discovery and Retrieval

The system SHALL provide MCP tools for discovering and retrieving EPF skill definitions. Skills are bundled capabilities with prompts, prerequisites, validation, and templates that unify the current wizard (.wizard.md) and output generator concepts. The `epf_list_skills` tool SHALL list available skills with filtering by type (creation, generation, review, enrichment, analysis) and source (instance, framework, global). The `epf_get_skill` tool SHALL return the full skill manifest, prompt, and optionally the validation schema.

#### Scenario: List skills by type

- **WHEN** AI agent calls `epf_list_skills` with `type="generation"`
- **THEN** the tool returns all skills of type "generation" (document output skills)
- **AND** each skill entry includes name, type, description, required artifacts, and output format

#### Scenario: Get skill with prompt and schema

- **WHEN** AI agent calls `epf_get_skill` with `name="context-sheet-generation"` and `include_schema="true"`
- **THEN** the tool returns the skill manifest (from `skill.yaml`), prompt content (from `prompt.md`), and validation schema (from `schema.json`)

#### Scenario: Legacy generator format compatibility

- **WHEN** the skill loader encounters a `generator.yaml` file without a corresponding `skill.yaml`
- **THEN** it SHALL read the generator manifest and expose it as a skill through the new MCP tools
- **AND** the skill response SHALL include a `legacy_format: true` flag

#### Scenario: Legacy wizard format as creation skill

- **WHEN** the skill loader encounters a `.wizard.md` file without a corresponding `skill.yaml`
- **THEN** it SHALL parse the wizard content and expose it as a creation-type skill
- **AND** the skill response SHALL include a `legacy_format: true` flag

### Requirement: Skill Scaffolding

The system SHALL provide an `epf_scaffold_skill` MCP tool that creates a new skill with all required files from a template. It SHALL support all skill types (creation, generation, review, enrichment, analysis) and generate appropriate manifest, prompt, schema, and validator files based on the skill type.

#### Scenario: Scaffold a generation skill

- **WHEN** AI agent calls `epf_scaffold_skill` with `name="pitch-deck-generation"`, `type="generation"`, and `instance_path="/project/docs/epf/my-product"`
- **THEN** the tool creates a skill directory with `skill.yaml`, `prompt.md`, `schema.json`, and `validator.sh`
- **AND** the `skill.yaml` has `type: generation` with appropriate defaults

#### Scenario: Scaffold a creation skill

- **WHEN** AI agent calls `epf_scaffold_skill` with `name="custom-artifact-creation"` and `type="creation"`
- **THEN** the tool creates a skill directory with `skill.yaml` and `prompt.md`
- **AND** the `skill.yaml` has `type: creation` and includes `output.artifact_type` field

### Requirement: Agent Scaffolding

The system SHALL provide an `epf_scaffold_agent` MCP tool that creates a new agent definition with manifest and prompt files. Users SHALL be able to create custom agents in their EPF instance that are discovered alongside canonical agents.

#### Scenario: Scaffold a custom agent

- **WHEN** AI agent calls `epf_scaffold_agent` with `name="domain-expert"`, `type="specialist"`, and `instance_path="/project/docs/epf/my-product"`
- **THEN** the tool creates an agent directory with `agent.yaml` and `prompt.md`
- **AND** the `agent.yaml` has sensible defaults for a specialist agent
- **AND** the agent is immediately discoverable via `epf_list_agents`

### Requirement: Three-Tier Agent and Skill Discovery

The system SHALL discover agents and skills from three sources with instance-level taking highest priority, following the same pattern as the current generator discovery. Instance agents/skills override framework agents/skills with the same name. Framework agents/skills use embedded fallback when filesystem is unavailable. Global agents/skills have lowest priority.

#### Scenario: Instance skill overrides framework skill

- **WHEN** an EPF instance has `skills/context-sheet-generation/skill.yaml`
- **AND** the framework also has a `context-sheet-generation` skill
- **THEN** the instance skill takes priority and the framework version is hidden
- **AND** `epf_list_skills` shows the skill with `source: "instance"`

#### Scenario: Embedded fallback for agents

- **WHEN** the framework filesystem is not available (e.g., running from binary without canonical-epf checkout)
- **THEN** agents are loaded from the embedded filesystem compiled into the binary
- **AND** all canonical agents are available via `epf_list_agents`

### Requirement: Agent-Skill Relationship Querying

The system SHALL provide an `epf_list_agent_skills` MCP tool that returns the skills associated with a specific agent, based on the agent's manifest declaration.

#### Scenario: List skills for an agent

- **WHEN** AI agent calls `epf_list_agent_skills` with `agent="pathfinder"`
- **THEN** the tool returns all skills listed in the pathfinder agent's `skills.required` and `skills.optional` manifest fields
- **AND** each skill entry includes availability status (whether the skill exists in the current environment)

### Requirement: MCP Resources Exposure for Skills

The system SHALL expose skills as MCP Resources using the `strategy://skills/` URI namespace. The `list_resources()` MCP primitive SHALL return one entry per available skill with name and description only (lazy-loading). The `read_resource()` MCP primitive SHALL return the full skill prompt content when the host requests a specific skill URI. This enables progressive disclosure where hosts only pull skill content when a task matches.

#### Scenario: List skill resources at startup

- **WHEN** the MCP host calls `list_resources()`
- **THEN** the server returns one resource entry per available skill
- **AND** each entry includes `uri` (e.g., `strategy://skills/context-sheet-generation`), `name`, `description`, and `mimeType: "text/markdown"`
- **AND** the full prompt content is NOT included (lazy-loading)

#### Scenario: Read specific skill resource

- **WHEN** the MCP host calls `read_resource("strategy://skills/feature-definition-creation")`
- **THEN** the server returns the full `prompt.md` content for that skill
- **AND** the response includes the skill manifest metadata as YAML frontmatter

### Requirement: MCP Prompts Exposure for Agents

The system SHALL expose agents as MCP Prompts using the `list_prompts()` and `get_prompt()` MCP primitives. Each agent SHALL be available as a prompt template that the host can activate to switch the AI's persona. The `get_prompt()` response SHALL include the agent's system prompt with optional context injection from the EPF instance.

#### Scenario: List agent prompts

- **WHEN** the MCP host calls `list_prompts()`
- **THEN** the server returns one prompt entry per available agent
- **AND** each entry includes `name`, `description`, and `arguments` (e.g., `instance_path`)

#### Scenario: Activate agent prompt with context

- **WHEN** the MCP host calls `get_prompt("pathfinder", { "instance_path": "/project/docs/epf/my-product" })`
- **THEN** the server returns the agent's system prompt from `prompt.md`
- **AND** the prompt includes injected context about the EPF instance (product name, current phase, available artifacts)

### Requirement: Capability Class Metadata

The system SHALL support `capability` metadata on both agent and skill manifests. The `capability.class` field SHALL accept values `high-reasoning`, `balanced`, or `fast-exec` to hint at the computational complexity required. The `capability.context_budget` field SHALL accept values `small`, `medium`, or `large` to hint at the context window requirements. This metadata is advisory and SHALL be included in tool responses and resource listings.

#### Scenario: Capability class in agent listing

- **WHEN** AI agent calls `epf_list_agents`
- **THEN** each agent entry includes `capability.class` and `capability.context_budget` fields
- **AND** a host runtime can use these hints to select an appropriate model tier

#### Scenario: Capability class in skill resource

- **WHEN** the MCP host calls `list_resources()` for skills
- **THEN** each resource entry metadata includes the skill's `capability.class`

### Requirement: Agent Activation Metadata

The system SHALL include activation metadata in agent responses to enable orchestration plugins to activate agents programmatically. The `epf_get_agent` response SHALL include the full system prompt text, the list of required tools, and the skill scope declarations. This metadata is consumed by platform-specific plugins (opencode-epf, future cursor-epf, etc.) to inject system prompts, scope tool access, and set up validation hooks. The MCP server itself does NOT perform activation — it only serves the metadata.

#### Scenario: Agent response includes activation metadata

- **WHEN** a platform plugin calls `epf_get_agent` with `name="pathfinder"`
- **THEN** the response includes `activation.system_prompt` (the full prompt.md content suitable for system prompt injection)
- **AND** the response includes `activation.required_tools` (MCP tools the agent needs)
- **AND** the response includes `activation.skill_scopes` (aggregated scope declarations from all required skills)

#### Scenario: Skill response includes scope for tool scoping

- **WHEN** a platform plugin calls `epf_get_skill` with `name="feature-definition-creation"`
- **THEN** the response includes `scope.preferred_tools` and `scope.avoid_tools` if declared in the skill manifest
- **AND** orchestration plugins can use this to modify tool descriptions via their platform's tool scoping mechanism

### Requirement: Generator Format Backward Compatibility

The system SHALL permanently support the existing `generator.yaml` manifest format and `{instance}/generators/` directory structure as first-class inputs. Users who have created custom output generators SHALL NOT need to rename files, change directory structure, or modify their generator manifests for them to continue working. The skill loader SHALL discover generators from `{instance}/generators/` in addition to `{instance}/skills/`, with instance-level generators taking priority over framework skills with the same name. The loader SHALL read `generator.yaml` when no `skill.yaml` is present, mapping all existing fields to the skill manifest internally. The `wizard.instructions.md` prompt filename SHALL be a permanent alias for `prompt.md`.

#### Scenario: Existing generator in generators/ directory continues to work

- **WHEN** a user has a custom generator at `{instance}/generators/pitch-deck/generator.yaml`
- **AND** the generator.yaml contains standard fields (name, version, description, category, requires, output)
- **THEN** `epf_list_skills` includes the generator with `type: "generation"` and `source: "instance"`
- **AND** `epf_get_skill` with `name="pitch-deck"` returns the generator's content
- **AND** `epf_validate_skill_output` validates output against the generator's `schema.json`

#### Scenario: generator.yaml fields map to skill manifest

- **WHEN** the skill loader reads a `generator.yaml` that has no `type` field
- **THEN** the loader infers `type: generation`
- **AND** all existing fields (name, version, description, category, author, regions, requires, output, files) are preserved in the skill response
- **AND** the `wizard.instructions.md` file is loaded as the skill's prompt content

#### Scenario: Scaffold generator command creates in generators/ directory

- **WHEN** AI agent calls `epf_scaffold_generator` with `name="custom-report"` and `instance_path="/project/docs/epf/my-product"`
- **THEN** the tool creates the generator in `{instance}/generators/custom-report/`
- **AND** the created manifest file is named `generator.yaml` (not `skill.yaml`)
- **AND** the created prompt file is named `wizard.instructions.md` (not `prompt.md`)

#### Scenario: Generator export and import roundtrip

- **WHEN** a user exports a generator with `epf-cli generators export pitch-deck`
- **AND** then installs it in another instance with `epf-cli generators install pitch-deck.tar.gz`
- **THEN** the generator works in the new instance without modification
- **AND** the installed generator retains its `generator.yaml` manifest filename

### Requirement: MCP Tool Backward Compatibility

The system SHALL maintain backward compatibility by registering old wizard and generator MCP tool names as permanent aliases for the new agent and skill tools. The alias tools SHALL produce identical responses to the new tools. Generator aliases SHALL NOT include deprecation notices, as the generator format is a permanent supported input.

#### Scenario: Generator tool alias

- **WHEN** AI agent calls `epf_list_generators` with `category="compliance"`
- **THEN** the system routes the call to `epf_list_skills` with `type="generation"` and an internal category filter
- **AND** the response is identical to calling `epf_list_skills` directly

#### Scenario: Generator scaffold alias

- **WHEN** AI agent calls `epf_scaffold_generator` with `name="custom-report"`
- **THEN** the system creates the generator with `generator.yaml` and `wizard.instructions.md` filenames
- **AND** the result is identical to what the old scaffold command produced

#### Scenario: Wizard tool alias

- **WHEN** AI agent calls `epf_get_wizard` with `name="pathfinder"`
- **THEN** the system routes the call to `epf_get_agent`
- **AND** the response is identical to calling `epf_get_agent` directly

### Requirement: Orchestration Plugin Detection and Advisory

The `epf_agent_instructions` tool SHALL detect whether an orchestration plugin is active and include an `orchestration` section in its response. Detection SHALL use the `EPF_PLUGIN_ACTIVE` environment variable as the primary signal and MCP ClientInfo host name as a fallback. When no plugin is detected but one is available for the detected host, the response SHALL include the plugin name, installation instructions, and a summary of what the plugin provides. When no plugin is detected, the response SHALL include standalone mode protocols that the AI agent must follow manually.

#### Scenario: Plugin detected via environment variable

- **WHEN** the `EPF_PLUGIN_ACTIVE` environment variable is set to `opencode-epf@1.2.0`
- **AND** the AI agent calls `epf_agent_instructions`
- **THEN** the response includes `orchestration.plugin_detected: true`
- **AND** the response includes `orchestration.standalone_mode: false`
- **AND** the response includes `orchestration.active_guardrails` listing the plugin's capabilities

#### Scenario: Plugin not detected on known host

- **WHEN** the MCP ClientInfo identifies the host as `opencode`
- **AND** the `EPF_PLUGIN_ACTIVE` environment variable is not set
- **AND** the AI agent calls `epf_agent_instructions`
- **THEN** the response includes `orchestration.plugin_detected: false`
- **AND** the response includes `orchestration.host_name: "opencode"` and `orchestration.available_plugin: "opencode-epf"`
- **AND** the response includes `orchestration.install_hint` with platform-specific installation instructions
- **AND** the response includes `orchestration.what_you_gain` listing capabilities the user would gain
- **AND** the response includes `orchestration.standalone_mode: true` with mandatory standalone protocols

#### Scenario: Unknown host without plugin

- **WHEN** the MCP ClientInfo does not match any known host
- **AND** the `EPF_PLUGIN_ACTIVE` environment variable is not set
- **THEN** the response includes `orchestration.plugin_detected: false` and `orchestration.standalone_mode: true`
- **AND** the response includes standalone protocols for manual enforcement
- **AND** the response does NOT include a specific plugin recommendation

### Requirement: Standalone Mode Agent Prompt Adaptation

The `epf_get_agent` tool SHALL adapt its response based on whether an orchestration plugin is active. When operating in standalone mode (no plugin detected), the agent prompt response SHALL include additional self-enforcement protocols covering validation after writes, pre-commit health checks, and tool scope adherence. When the plugin is active, these protocols SHALL be omitted to save context window space since the plugin enforces them mechanically.

#### Scenario: Agent prompt in standalone mode includes enforcement protocols

- **WHEN** the MCP server is operating in standalone mode (no plugin detected)
- **AND** the AI agent calls `epf_get_agent` with `name="pathfinder"`
- **THEN** the response includes the agent's full prompt content from `prompt.md`
- **AND** the response includes a standalone protocols section with validation, pre-commit, and tool scope directives
- **AND** the standalone protocols reference the agent's required tools and skill scopes

#### Scenario: Agent prompt with plugin omits enforcement protocols

- **WHEN** the MCP server detects an active orchestration plugin
- **AND** the AI agent calls `epf_get_agent` with `name="pathfinder"`
- **THEN** the response includes the agent's full prompt content from `prompt.md`
- **AND** the response does NOT include standalone enforcement protocols
- **AND** the response includes a note that guardrails are handled by the plugin

### Requirement: Standalone Mode Skill Response Enhancement

The `epf_get_skill` tool SHALL include explicit tool scope guidance in its text response when operating in standalone mode. When the skill manifest declares `scope.preferred_tools` or `scope.avoid_tools`, the skill response SHALL include these as formatted text sections that the AI agent can follow, since no plugin is available to enforce tool scoping mechanically.

#### Scenario: Skill response in standalone mode includes tool scope text

- **WHEN** the MCP server is operating in standalone mode
- **AND** the AI agent calls `epf_get_skill` with `name="feature-definition-creation"`
- **AND** the skill manifest declares `scope.preferred_tools` and `scope.avoid_tools`
- **THEN** the response includes a "TOOL SCOPE" section listing preferred and avoided tools with explanations
- **AND** the response includes "You MUST prioritize the preferred tools and avoid the listed tools during this skill's execution"
