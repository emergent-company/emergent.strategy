## ADDED Requirements

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

## MODIFIED Requirements

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
