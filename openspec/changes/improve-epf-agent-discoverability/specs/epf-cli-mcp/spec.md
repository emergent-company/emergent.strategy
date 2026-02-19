## ADDED Requirements

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
