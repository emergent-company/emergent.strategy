# Change: Improve EPF Agent Discoverability and Wizard Enforcement

## Why

AI agents using epf-cli consistently fall into the same failure patterns: they run `health_check`, then directly read/edit YAML artifacts without using wizards, templates, or validation tools. The dual MCP architecture (epf-cli + strategy server) is invisible to agents -- they don't understand why both exist or how to use strategy query tools. Wizards that encode correct EPF workflows are available but agents don't know they MUST use them, leading to broken artifact consistency. The `epf_agent_instructions` tool returns minimal guidance (8 tools, soft best-practices) that fails to enforce deterministic workflows.

**Root causes identified:**

1. **Dual MCP confusion**: `epf-cli serve` and `strategy serve` expose identical 65-tool sets. The `strategy serve` sets env vars that the server never consumes. Having both configured duplicates every tool in the agent's tool list.
2. **No wizard-first protocol**: Agent instructions suggest wizards as optional best-practice, not mandatory workflow gates. Nothing prevents agents from writing artifacts without wizard guidance.
3. **`epf_agent_instructions` too thin**: Returns only 8 highlighted tools and generic workflow steps. No task-to-tool decision tree, no mandatory protocols, no strategy tool awareness.
4. **Missing wizard mappings**: `strategic_reality_check` wizard absent from `PhaseForWizard` and `KeywordMappings`.
5. **Scattered, stale instruction files**: 8 instruction files with conflicting info (e.g., "30 tools" vs actual 65), 2400-line AGENTS.md exceeds agent context windows.

## What Changes

### 1. Mandatory Wizard-First Protocol (epf-cli-mcp)
- `epf_agent_instructions` SHALL return a mandatory wizard-first workflow: before creating/editing any EPF artifact, agents MUST call `epf_get_wizard_for_task` and follow the returned wizard
- The output SHALL include task-to-workflow decision trees, not just tool lists
- Strategy query tools SHALL be prominently featured in agent instructions output

### 2. Strategy Server Instance-Aware Tools (epf-strategy-server)
- `strategy serve` SHALL make the pre-configured instance path the default for all tools that accept `instance_path`, so agents don't need to pass it repeatedly
- The server SHALL expose instance metadata (product name, instance path) through a discovery mechanism so agents know they have a strategy context available

### 3. Enhanced Wizard Discoverability (epf-cli-mcp)
- Fix `strategic_reality_check` missing from `PhaseForWizard` and `KeywordMappings`
- `epf_agent_instructions` SHALL return categorized tool groups with workflow sequences, not flat lists
- Add mandatory workflow protocols to embedded agent instructions

### 4. Consolidated Agent Instructions (epf-cli-mcp)
- The embedded AGENTS.md SHALL include a concise "AI Agent Quick Protocol" section (<200 lines) at the top, with the detailed reference below
- All distributed AGENTS.md files SHALL include the wizard-first protocol and strategy tool awareness
- `docs/EPF/AGENTS.md` SHALL be updated to reflect actual tool counts and include wizard mandate

### 5. Semantic Quality Wizard Triggers (epf-cli-mcp)

Health checks today are purely mechanical -- they validate schema, field presence, cross-references, and placeholder content. They cannot evaluate whether a north star is strategically coherent, whether feature narratives follow JTBD patterns, or whether a value model's L2 components are well-decomposed. The `value_model_review` wizard already demonstrates the correct pattern: it consumes `epf_health_check` output, adds semantic litmus tests, and provides a quality score. This pattern must be replicated for uncovered areas.

- `epf_health_check` and `epf_generate_report` SHALL include a `semantic_review_recommendations` section that maps specific check results to companion wizards
- Two new semantic quality wizards SHALL be authored:
  - `feature_quality_review` -- semantic companion to `FeatureQuality` and `Coverage` checks (evaluates JTBD format, persona-feature fit, narrative quality, scenario completeness)
  - `strategic_coherence_review` -- semantic companion for north star / strategy formula / roadmap alignment (evaluates whether the strategy tells a coherent story across artifacts)
- `balance_checker` wizard SHALL be updated to consume health check output as input, following the `value_model_review` pattern
- `strategic_reality_check` wizard SHALL be wired into the recommendation system (triggered when AIM artifacts are stale or missing)
- The trigger mapping SHALL follow a declarative pattern: each health check category maps to zero or more companion wizards with trigger conditions

**Health check to wizard trigger mapping:**

| Health Check Result | Trigger Condition | Recommended Wizard |
|---|---|---|
| FeatureQuality warnings | Score < 80% or persona count < 4 | `feature_quality_review` |
| Coverage gaps | Any L2 component uncovered | `feature_quality_review` |
| ValueModelQuality issues | Quality score < 80 | `value_model_review` (existing) |
| Cross-ref or relationship errors | Any cross-ref validation failures | `strategic_coherence_review` |
| AIM staleness | LRA > 90 days stale or missing assessment | `strategic_reality_check` |
| Roadmap imbalance | Track coverage < 2 tracks | `balance_checker` |

## Impact
- Affected specs: `epf-cli-mcp`, `epf-strategy-server`
- Affected code:
  - `apps/epf-cli/cmd/agent.go` -- Enhanced agent output with workflow protocols
  - `apps/epf-cli/internal/mcp/server.go` -- Strategy instance default propagation
  - `apps/epf-cli/internal/wizard/types.go` -- Missing wizard mappings
  - `apps/epf-cli/internal/embedded/AGENTS.md` -- Wizard-first protocol section
  - `docs/EPF/AGENTS.md` -- Updated tool counts and wizard mandate
  - `AGENTS.md` (root) -- Strategy tool and wizard awareness
  - `apps/epf-cli/cmd/health.go` -- Semantic review recommendations in health output
  - `apps/epf-cli/internal/checks/` -- Trigger condition extraction for wizard mapping
  - `canonical-epf/wizards/` -- New wizard content files (synced via `sync-embedded.sh`)
