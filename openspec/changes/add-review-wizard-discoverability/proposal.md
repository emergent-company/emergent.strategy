# Change: Add Review Wizard Discoverability for Evaluation Tasks

## Why

EPF includes three semantic review wizards (`strategic_coherence_review`, `feature_quality_review`, `value_model_review`) that encode the framework's own quality criteria. No AI agent discovers these during evaluation tasks. In observed sessions, agents asked to "evaluate the quality of our EPF strategy" run `epf_health_check`, see structural health is good, then invent their own rubric — missing the framework's purpose-built evaluation criteria entirely.

The root cause is a five-point discoverability failure:

1. **Wizard-first trigger is creation-only**: The mandatory trigger says "before creating any EPF artifact" — agents doing evaluation skip it.
2. **Health check dead-ends at structural results**: No mention of semantic review wizards in health check output, even when the instance is structurally healthy.
3. **No `evaluate_quality` task type**: The workflow decision tree maps `create`, `query`, `assess_health`, and `fix` — but not evaluation.
4. **`epf_get_wizard_for_task` description is creation-only**: Agents doing evaluation don't consider this tool relevant.
5. **Review wizards only discoverable via `epf_list_wizards`**: No other tool mentions them; no workflow triggers them.

The previous `improve-epf-agent-discoverability` change (44/44 done) addressed wizard-first for creation/modification. This change extends the same patterns to cover evaluation tasks.

## What Changes

### P0 — Critical path (3 items)
- Add `evaluate_quality` task type to the workflow decision tree in agent instructions
- Widen wizard-first trigger to include "evaluating" (agent instructions + `epf_get_wizard_for_task` tool description)
- Add always-present `semantic_review_recommendations` baseline to health check response (currently only fires conditionally via semantic triggers)

### P1 — Robust discovery (2 items)
- Update `epf_get_wizard_for_task` routing logic to match evaluation keywords and return review-type `agent_prompt` wizards
- Add `epf_recommend_reviews` MCP tool that returns applicable review wizards for an instance

### P2 — Belt-and-suspenders (2 items)
- Cross-reference review wizards in AIM tool responses (`epf_aim_health`, `epf_aim_status`)
- Surface review wizards as dedicated MCP tools (`epf_review_strategic_coherence`, etc.) so they appear in tool listings

## Impact
- Affected specs: `epf-cli-mcp`
- Affected code:
  - `cmd/agent.go` (workflow decision tree, wizard-first trigger wording)
  - `internal/mcp/server.go` (health check response, tool descriptions, new tools)
  - `internal/wizard/types.go` (keyword mappings for evaluation tasks)
  - Agent instruction files (AGENTS.md, copilot-instructions.md)

## Source
- Field feedback: `/Users/nikolaifasting/code/huma-strategy/ad-hoc-artifacts/2026-02-19_epf_agent_discoverability_gap.md`
- Predecessor: `improve-epf-agent-discoverability` (44/44 done, creation/modification path)
