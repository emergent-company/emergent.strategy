## ADDED Requirements

### Requirement: Agent Runtime Tools

The system SHALL expose MCP tools that enable autonomous background agents to operate
alongside the strategy-server: staging changes for human review, identifying themselves,
and polling for mutations committed by humans or other agents.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `list_pending_batches` | List all staged batches awaiting human review | instance_id | PendingBatch[] |
| `describe_batch` | Attach agent identity and description to a staged batch | batch_id, agent_id, description | OK |

The existing `list_mutations` tool SHALL support a `since_mutation_id` cursor parameter
so agents can efficiently poll for new committed mutations without re-scanning history.

#### Scenario: Agent stages and identifies itself
- **WHEN** an agent calls a write tool (e.g. `update_north_star`) and then calls `describe_batch`
- **THEN** the batch is tagged with the agent's `agent_id` and `description`
- **AND** `list_pending_batches` returns the batch with agent attribution visible to human reviewers

#### Scenario: Human reviews agent-staged changes
- **WHEN** a human calls `list_pending_batches` for an instance
- **THEN** all staged batches are returned including those staged by background agents
- **AND** each batch includes `agent_id`, `description`, `artifact_count`, and `staged_at`

#### Scenario: Agent polls for new committed mutations
- **WHEN** an agent calls `list_mutations` with `since_mutation_id` set to the last seen mutation ID
- **THEN** only mutations committed after that ID are returned
- **AND** an empty result indicates no new mutations since the last poll

#### Scenario: Agent cannot self-commit
- **WHEN** an agent calls `commit_batch` for a batch it staged
- **THEN** the commit proceeds normally (the staging pattern applies to all callers equally)
- **AND** the audit log records the commit with the agent's `source='mcp'` and `agent_id`

---

### Requirement: Embedded Knowledge Tools

The system SHALL expose MCP tools for querying embedded EPF protocol content (schemas,
templates, agents, skills, wizards, generators) synced from canonical-epf at build time.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `list_schemas` | List available EPF JSON schemas | — | SchemaEntry[] |
| `get_schema` | Get a specific JSON schema by name | schema_name | JSONSchema |
| `list_templates` | List EPF artifact templates | artifact_type? | TemplateEntry[] |
| `get_template` | Get a specific template by name | template_name | Template (JSON) |
| `list_agents` | List available EPF agents | — | AgentEntry[] |
| `get_agent` | Get agent definition with skills | agent_name | AgentDefinition |
| `list_skills` | List available skills | agent_name? | SkillEntry[] |
| `get_skill` | Get skill definition and prompt | skill_name | SkillDefinition |
| `execute_skill` | Run a computational skill | skill_name, input | ExecutionResult |
| `list_wizards` | List available wizards | type? | WizardEntry[] |
| `get_wizard` | Get wizard definition | wizard_name | WizardDefinition |
| `list_generators` | List available generators | — | GeneratorEntry[] |
| `get_generator` | Get generator definition | generator_name | GeneratorDefinition |
| `get_agent_for_task` | Route a task to the right agent or tool | task_description | Recommendation |
| `get_wizard_for_task` | Route a task to the right wizard | task_description | Recommendation |

#### Scenario: List schemas returns all embedded schemas
- **WHEN** a caller invokes `list_schemas`
- **THEN** all JSON schemas from the embedded canonical-epf content are returned
- **AND** each entry includes the schema name and a brief description

#### Scenario: Get template returns parsed JSON
- **WHEN** a caller invokes `get_template` with a valid template name
- **THEN** the template content is returned as parsed JSON (not raw YAML)

#### Scenario: Execute skill runs computational logic
- **WHEN** a caller invokes `execute_skill` with a computational skill name and input
- **THEN** the skill's inline or script handler executes and returns a structured `ExecutionResult`
- **AND** prompt-delivery skills return an error directing the caller to use `get_skill` instead

#### Scenario: Get agent for task returns routing recommendation
- **WHEN** a caller invokes `get_agent_for_task` with a task description
- **THEN** the system returns either a `direct_tool` recommendation or an `agent` recommendation
- **AND** direct tool recommendations include the tool name to call immediately

---

### Requirement: Expanded Write Tools

The system SHALL expose staged write tools for all EPF artifact types beyond north star
and features. All expanded write tools follow the same staged batch pattern as existing
write tools.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `create_persona` | Draft new persona | instance_id, payload | batch_id |
| `update_persona` | Draft persona update | instance_id, persona_key, payload | batch_id |
| `update_competitive_position` | Draft competitive position update | instance_id, payload | batch_id |
| `update_roadmap` | Draft roadmap update | instance_id, payload | batch_id |
| `update_okrs` | Draft OKR update | instance_id, payload | batch_id |
| `update_value_model` | Draft value model update | instance_id, value_model_key, payload | batch_id |
| `update_assumptions` | Draft assumptions update | instance_id, payload | batch_id |
| `update_brand_voice` | Draft brand voice update | instance_id, payload | batch_id |
| `update_design_principles` | Draft design principles update | instance_id, payload | batch_id |
| `create_user_journey` | Draft new user journey | instance_id, payload | batch_id |
| `update_user_journey` | Draft user journey update | instance_id, journey_key, payload | batch_id |
| `batch_create_artifacts` | Stage multiple artifacts in one batch | instance_id, artifacts[] | batch_id |

#### Scenario: Create persona follows staged batch pattern
- **WHEN** a caller invokes `create_persona` with a valid payload
- **THEN** a `strategy_mutation` row is created with `status='staged'`, `artifact_type='persona'`, `action='create'`
- **AND** a `batch_id` is returned
- **AND** the persona does not appear in read results until the batch is committed

#### Scenario: Batch create stages multiple artifacts atomically
- **WHEN** a caller invokes `batch_create_artifacts` with multiple artifact payloads
- **THEN** all artifacts are staged under a single `batch_id`
- **AND** committing the batch commits all artifacts atomically

#### Scenario: Expanded write tools validate against schema
- **WHEN** a caller submits a payload for any expanded write tool
- **THEN** the payload is validated against the corresponding EPF JSON schema before staging
- **AND** invalid payloads are rejected with HTTP 422 and error code 112004

---

### Requirement: Derived Read Tools

The system SHALL expose derived read tools that compute cross-artifact views from the
`strategy_artifacts` and `strategy_relationships` tables.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `get_persona_detail` | Single persona with pain points and feature connections | instance_id, persona_key | PersonaDetail |
| `get_value_propositions` | Cross-feature value proposition summary | instance_id | ValuePropSummary |
| `get_strategic_context_for_feature` | Feature-centric strategic view | instance_id, feature_key | FeatureContext |
| `explain_value_path` | Trace value chain from feature to north star | instance_id, feature_key | ValuePath |
| `get_coverage_analysis` | Persona x feature coverage matrix | instance_id | CoverageMatrix |
| `get_roadmap_detail` | Roadmap with OKR linkage | instance_id | RoadmapDetail |
| `get_okr_detail` | Single OKR with key results and linked features | instance_id, okr_key | OKRDetail |
| `get_assumptions` | Assumptions list with validation status | instance_id | Assumption[] |

#### Scenario: Persona detail includes feature connections
- **WHEN** a caller invokes `get_persona_detail` with a valid persona key
- **THEN** the response includes the persona definition, pain points, and all features that reference this persona
- **AND** feature connections are resolved via `strategy_relationships`

#### Scenario: Coverage analysis returns matrix
- **WHEN** a caller invokes `get_coverage_analysis`
- **THEN** the response includes a matrix of personas x features with coverage indicators
- **AND** personas with no linked features are flagged as uncovered

#### Scenario: Value path traces feature to north star
- **WHEN** a caller invokes `explain_value_path` with a valid feature key
- **THEN** the response traces the value chain: feature -> value model -> OKR -> north star
- **AND** any broken links in the chain are identified via `strategy_relationships`

---

### Requirement: Validation Tools

The system SHALL expose MCP tools for validating artifacts against EPF schemas and
checking cross-artifact integrity.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `validate_artifact` | Validate artifact payload against EPF schema | payload, artifact_type? | ValidationResult |
| `validate_instance` | Full instance health check | instance_id | InstanceHealth |
| `validate_relationships` | Cross-artifact reference integrity | instance_id | RelationshipReport |
| `check_content_readiness` | Content quality scoring | instance_id | ReadinessScore |

#### Scenario: Validate artifact auto-detects type
- **WHEN** a caller invokes `validate_artifact` without specifying `artifact_type`
- **THEN** the system auto-detects the artifact type from content structure
- **AND** validates against the corresponding JSON schema

#### Scenario: Validate instance reports all issues
- **WHEN** a caller invokes `validate_instance`
- **THEN** the response includes validation results for all artifacts in the instance
- **AND** cross-artifact reference issues are included

#### Scenario: Invalid artifact returns structured errors
- **WHEN** a caller invokes `validate_artifact` with an invalid payload
- **THEN** the response includes specific validation errors with field paths and descriptions
- **AND** the response includes the detected artifact type

---

### Requirement: Export Tools

The system SHALL expose MCP tools for exporting database-stored strategy artifacts back
to EPF YAML format.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `export_instance_yaml` | Export full instance as EPF YAML directory | instance_id | YAMLArchive |
| `export_feature_yaml` | Export single feature as YAML | instance_id, feature_key | YAMLContent |
| `export_report` | Generate formatted strategy report | instance_id, format? | ReportContent |

#### Scenario: Export instance produces valid EPF structure
- **WHEN** a caller invokes `export_instance_yaml`
- **THEN** the response includes YAML content organized in EPF directory structure (READY/, FIRE/, AIM/)
- **AND** the exported YAML passes `validate_instance` when re-imported

#### Scenario: Export feature produces standalone YAML
- **WHEN** a caller invokes `export_feature_yaml` with a valid feature key
- **THEN** the response includes the feature's complete YAML definition
- **AND** the YAML is valid against the feature JSON schema

---

### Requirement: AIM Lifecycle Tools

The system SHALL expose MCP tools for the AIM (Assess, Iterate, Measure) phase of the
EPF lifecycle, covering launch readiness assessments and post-launch reporting.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `create_lra` | Create launch readiness assessment | instance_id, feature_key, payload | batch_id |
| `update_lra` | Update LRA status and findings | instance_id, lra_id, payload | batch_id |
| `get_lra` | Read current LRA state | instance_id, lra_id | LRADetail |
| `create_aim_report` | Create post-launch assessment report | instance_id, payload | batch_id |
| `get_aim_summary` | AIM phase overview for instance | instance_id | AIMSummary |

#### Scenario: Create LRA follows staged batch pattern
- **WHEN** a caller invokes `create_lra` with a feature key and assessment payload
- **THEN** a `strategy_mutation` row is created with `artifact_type='lra'`, `action='create'`
- **AND** a `batch_id` is returned
- **AND** the LRA is not visible in `strategy_artifacts` until the batch is committed

#### Scenario: AIM summary aggregates lifecycle state
- **WHEN** a caller invokes `get_aim_summary`
- **THEN** the response includes all LRAs, AIM reports, and feature lifecycle states from `strategy_artifacts`
- **AND** features without LRAs are flagged as not yet assessed
