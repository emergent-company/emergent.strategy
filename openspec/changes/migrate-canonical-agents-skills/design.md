## Context

Phase 1 built the agent/skill infrastructure with full backward compatibility for old formats. Phase 2 migrates the canonical content and updates the embedded pipeline. The key constraint is that user-facing behavior must be strictly additive — existing instances and workflows must not break.

## Goals / Non-Goals

**Goals:**
- Migrate all 13 agent prompts, 3 wizards, and 5 generators to new format with structured manifests
- Establish agent-skill composition (agents declaring which skills they require)
- Add capability classes and tool scoping metadata to all canonical content
- Update the embedded pipeline to sync from new directories
- Provide import tools for bringing in agents/skills from external frameworks

**Non-Goals:**
- Rewriting prompt content (prompts are migrated as-is; content improvements are separate work)
- Removing old directories from canonical-epf (old file names are permanent aliases)
- Breaking backward compatibility for any existing user workflow

## Decisions

### Decision 1: Content Classification

Based on the Phase 1 analysis of all wizard files, the migration classifies each file as follows:

#### Pure Agents (persona-driven orchestrators)

| Current File | New Agent | Type | Capability Class |
|---|---|---|---|
| `start_epf.agent_prompt.md` | `agents/start-epf/` | guide | balanced |
| `pathfinder.agent_prompt.md` | `agents/pathfinder/` | strategist | high-reasoning |
| `lean_start.agent_prompt.md` | `agents/lean-start/` | guide | balanced |
| `product_architect.agent_prompt.md` | `agents/product-architect/` | architect | high-reasoning |
| `synthesizer.agent_prompt.md` | `agents/synthesizer/` | specialist | high-reasoning |

#### Pure Skills (capability bundles)

| Current File | New Skill | Type | Capability Class |
|---|---|---|---|
| `feature_definition.wizard.md` | `skills/feature-definition/` | creation | balanced |
| `feature_enrichment.wizard.md` | `skills/feature-enrichment/` | enrichment | balanced |
| `roadmap_enrichment.wizard.md` | `skills/roadmap-enrichment/` | enrichment | balanced |
| `balance_checker.agent_prompt.md` | `skills/balance-checker/` | review | balanced |
| `value_model_review.agent_prompt.md` | `skills/value-model-review/` | review | balanced |
| `strategic_reality_check.agent_prompt.md` | `skills/strategic-reality-check/` | analysis | high-reasoning |
| `aim_trigger_assessment.agent_prompt.md` | `skills/aim-trigger-assessment/` | analysis | balanced |

#### Sub-wizard → Skill (pathfinder's required skills)

| Current File | New Skill | Type | Required By |
|---|---|---|---|
| `01_trend_scout.agent_prompt.md` | `skills/trend-scout/` | analysis | pathfinder |
| `02_market_mapper.agent_prompt.md` | `skills/market-mapper/` | analysis | pathfinder |
| `03_internal_mirror.agent_prompt.md` | `skills/internal-mirror/` | analysis | pathfinder |
| `04_problem_detective.agent_prompt.md` | `skills/problem-detective/` | analysis | pathfinder |

#### Generators → Generation Skills

| Current Directory | New Skill | Category |
|---|---|---|
| `outputs/context-sheet/` | `skills/context-sheet/` | internal |
| `outputs/investor-memo/` | `skills/investor-memo/` | investor |
| `outputs/skattefunn-application/` | `skills/skattefunn-application/` | compliance |
| `outputs/development-brief/` | `skills/development-brief/` | development |
| `outputs/value-model-preview/` | `skills/value-model-preview/` | internal |

#### Deprecated (remove)

| File | Reason |
|---|---|
| `context_sheet_generator.wizard.md` | Superseded by `outputs/context-sheet/` generator |
| `MOVED_context_sheet_generator.md` | Redirect notice, no longer needed |

### Decision 2: Agent-Skill Composition

Each agent declares its required skills. This enables:
- The MCP server to list an agent's skills via `epf_list_agent_skills`
- The plugin to preload skill scopes when activating an agent
- Users to understand what an agent can do

| Agent | Required Skills |
|---|---|
| `start-epf` | (none — pure onboarding guide) |
| `pathfinder` | `trend-scout`, `market-mapper`, `internal-mirror`, `problem-detective`, `balance-checker` |
| `lean-start` | `feature-definition` |
| `product-architect` | `feature-definition`, `feature-enrichment`, `value-model-review` |
| `synthesizer` | `aim-trigger-assessment`, `strategic-reality-check` |

### Decision 3: Capability Classes

The `capability.class` field indicates the minimum model quality needed:

| Class | When to Use | Model Examples |
|---|---|---|
| `high-reasoning` | Strategic analysis, multi-artifact synthesis, coherence evaluation | Claude Opus, GPT-4o, Gemini Ultra |
| `balanced` | Feature creation, enrichment, guided workflows | Claude Sonnet, GPT-4o-mini |
| `fast-exec` | Validation, simple transformations, template filling | Claude Haiku, GPT-4o-mini |

The host runtime can use this to select appropriate models. This is advisory — the agent/skill works with any model, just better with the recommended class.

### Decision 4: Tool Scoping Per Skill

Each skill declares preferred and avoided tools. Examples:

| Skill | Preferred Tools | Avoid Tools |
|---|---|---|
| `feature-definition` | `epf_get_template`, `epf_get_personas`, `epf_validate_file` | `epf_scaffold_generator` |
| `value-model-review` | `epf_explain_value_path`, `epf_validate_relationships`, `epf_analyze_coverage` | `epf_init_instance` |
| `context-sheet` | `epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary` | `epf_scaffold_agent` |

### Decision 5: Generator Migration Strategy

Generators keep their existing files (`wizard.instructions.md`, `schema.json`, `validator.sh`) with a new `skill.yaml` manifest added alongside. The loader reads both `skill.yaml` and `generator.yaml` (permanent alias), so the migration is purely additive.

```
skills/context-sheet/
├── skill.yaml              # NEW — structured manifest
├── wizard.instructions.md  # EXISTING — prompt (permanent alias for prompt.md)
├── schema.json             # EXISTING — output validation
├── validator.sh            # EXISTING — bash validator
└── README.md               # EXISTING — documentation
```

No `prompt.md` is created for generators — `wizard.instructions.md` is the permanent alias and creating a duplicate would be confusing.

### Decision 6: Import Format Support

The import tools support these external formats:

| Format | Detection | Mapping |
|---|---|---|
| Raw Markdown/text | No frontmatter, no YAML | Becomes `prompt.md`, user fills manifest interactively |
| CrewAI YAML | `role:` + `goal:` + `backstory:` keys | Maps to agent.yaml fields |
| OpenAI Assistants JSON | `instructions` + `tools[]` keys | Maps to agent.yaml + skill extraction |
| EPF archive (.tar.gz) | Existing `skills export` format | Direct install via existing `skills install` |

Import generates the manifest with best-effort field mapping and marks fields that need human review with `# TODO: review` comments.

## Risks / Trade-offs

- **Risk: Prompt content may need adaptation for system prompt injection** — In Phase 1, prompts were served as text blobs. Now they're injected into system prompts. Some prompts may have phrasing that works poorly as a system prompt (e.g., "You are now talking to the Pathfinder" vs "You are the Pathfinder").
  - Mitigation: Review each prompt during migration. Flag any that need rephrasing but defer content rewrites to a separate effort.

- **Risk: Embedded pipeline changes could break builds** — Changing `go:embed` directives requires the directories to exist at build time.
  - Mitigation: `sync-embedded.sh` runs before build. Add CI check that verifies embedded content is present.

## Open Questions

1. **Should agents declare optional skills in addition to required skills?** e.g., pathfinder requires the 4 sub-wizard skills but could optionally use `feature-definition` if the user wants to create features during the READY phase.

2. **Should the import tool support importing from OpenCode skill format?** OpenCode uses single-file Markdown with YAML frontmatter — mapping to EPF's multi-file format is straightforward but adds another import path to maintain.
