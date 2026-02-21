## MODIFIED Requirements

### Requirement: Wizard-First Protocol in Agent Instructions

The `epf_agent_instructions` MCP tool SHALL return a `mandatory_protocols` section that prescribes deterministic workflows agents MUST follow. The wizard-first protocol SHALL state that agents MUST call `epf_get_wizard_for_task` before creating, modifying, or **evaluating** any EPF artifact or instance, and MUST follow the returned wizard's guidance if one exists.

The tool SHALL also return a `workflow_decision_tree` section that maps common tasks to specific tool sequences:

| Task | Mandatory Sequence |
|------|-------------------|
| Create artifact | `epf_get_wizard_for_task` -> `epf_get_template` -> write content -> `epf_validate_file` |
| Modify artifact | `epf_get_wizard_for_task` -> read current -> modify -> `epf_validate_file` |
| **Evaluate quality** | `epf_health_check` -> `epf_list_wizards(type=agent_prompt)` -> `epf_get_wizard` for review wizards -> execute against instance |
| Query strategy | `epf_get_product_vision` / `epf_get_personas` / `epf_search_strategy` |
| Assess health | `epf_health_check` -> fix issues -> re-check |
| Run AIM cycle | `epf_get_wizard_for_task` -> follow AIM wizard |

The `epf_get_wizard_for_task` tool description SHALL include evaluation in its trigger: "This is the MANDATORY first step before **creating, modifying, or evaluating** any EPF artifact or instance."

The `epf_get_wizard_for_task` routing logic SHALL handle evaluation keywords ("evaluate", "review", "assess quality", "check quality", "strategic coherence") and return review-type `agent_prompt` wizards (`strategic_coherence_review`, `feature_quality_review`, `value_model_review`).

#### Scenario: Agent asked to evaluate strategy quality

- **WHEN** an agent is asked to "evaluate the quality of our EPF strategy"
- **THEN** the agent recognizes this as an `evaluate_quality` task type from the workflow decision tree
- **AND** calls `epf_get_wizard_for_task` with the evaluation task description
- **AND** receives `strategic_coherence_review` as the recommended wizard

#### Scenario: Wizard routing returns review wizards for evaluation queries

- **WHEN** `epf_get_wizard_for_task` is called with task "review feature definitions"
- **THEN** the tool returns `feature_quality_review` as the primary recommendation
- **AND** includes `strategic_coherence_review` and `value_model_review` as alternatives

## ADDED Requirements

### Requirement: Semantic Review Recommendations in Health Check

The `epf_health_check` MCP tool and CLI health command SHALL always include a `semantic_review_recommendations` section in their response, regardless of the instance's structural health status.

The section SHALL contain:

1. **Always-present baseline**: All three review wizards listed with their purpose and invocation syntax:
   - `strategic_coherence_review` — evaluates vision-to-KR strategic alignment
   - `feature_quality_review` — evaluates JTBD, persona, scenario quality
   - `value_model_review` — detects product-catalog anti-patterns via litmus tests

2. **Conditional triggers** (existing behavior from `evaluateMCPSemanticTriggers`): additional context-specific recommendations when quality scores fall below thresholds or invalid paths are detected.

The baseline SHALL appear even when the instance scores 100% on all structural checks, because structural health does not imply semantic quality.

#### Scenario: Healthy instance still shows review wizard recommendations

- **WHEN** `epf_health_check` is called on an instance with Critical 100, Schema 100, Quality 100
- **THEN** the response includes `semantic_review_recommendations` with all 3 review wizards
- **AND** the message indicates "Structural health is good. For semantic quality evaluation, use these review wizards:"

#### Scenario: Unhealthy instance shows both conditional triggers and baseline

- **WHEN** `epf_health_check` is called on an instance with Quality below 80
- **THEN** the response includes `semantic_review_recommendations` with conditional trigger warnings (e.g., "Feature quality score below threshold")
- **AND** also includes the always-present baseline of all 3 review wizards

### Requirement: Review Wizard Recommendation MCP Tool

The system SHALL provide an `epf_recommend_reviews` MCP tool that returns applicable semantic review wizards for an EPF instance.

The tool SHALL:
- Accept parameter: `instance_path` (optional, uses default)
- Return all 3 review wizards with: name, type, purpose, and `epf_get_wizard` invocation syntax
- Include brief instance context when available (e.g., number of VM files, feature count)
- Have a tool description that clearly positions it as an evaluation/review tool

#### Scenario: Get review recommendations for an instance

- **WHEN** an agent calls `epf_recommend_reviews` with an instance path
- **THEN** the tool returns all 3 review wizards with their purpose and invocation syntax
- **AND** includes instance context such as "Instance has 4 value model files and 18 feature definitions"

### Requirement: Review Wizard Cross-References in AIM Tools

The `epf_aim_health` and `epf_aim_status` MCP tools SHALL include informational references to semantic review wizards in their responses when the instance has strategy artifacts (features, value models, roadmap).

These references SHALL be informational suggestions, not mandatory steps, and SHALL appear as a "Related Reviews" or "Next Steps" section in the response.

#### Scenario: AIM health mentions review wizards

- **WHEN** `epf_aim_health` is called on an instance with feature definitions and value models
- **THEN** the response includes a section mentioning available review wizards
- **AND** the section is clearly labeled as optional next steps
