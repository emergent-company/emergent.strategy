## 1. Canonical-epf Branch Setup

- [x] 1.1 Create `refactor/agents-and-skills` branch in canonical-epf (emergent-epf) from main
- [x] 1.2 Create `agents/` and `skills/` directories in canonical-epf
- [x] 1.3 Remove deprecated files (`context_sheet_generator.wizard.md`, `MOVED_context_sheet_generator.md`)

## 2. Agent Migrations (canonical-epf)

For each agent: create directory, write `agent.yaml` manifest, copy prompt content to `prompt.md`, verify metadata (type, capability class, required skills, triggers, keywords).

- [x] 2.1 Migrate `start_epf` — guide agent, balanced, no required skills. Onboarding entry point.
- [x] 2.2 Migrate `pathfinder` — strategist agent, high-reasoning, requires: trend-scout, market-mapper, internal-mirror, problem-detective, balance-checker. READY phase orchestrator.
- [x] 2.3 Migrate `lean_start` — guide agent, balanced, requires: feature-definition. Solo founder fast-path.
- [x] 2.4 Migrate `product_architect` — architect agent, high-reasoning, requires: feature-definition, feature-enrichment, value-model-review. FIRE phase orchestrator.
- [x] 2.5 Migrate `synthesizer` — specialist agent, high-reasoning, requires: aim-trigger-assessment, strategic-reality-check. AIM phase analyst.

## 3. Skill Migrations — Creation & Enrichment Type (canonical-epf)

For each skill: create directory, write `skill.yaml` manifest, copy prompt content to `prompt.md`, add required_artifacts, output validation if applicable, tool scope.

- [x] 3.1 Migrate `feature_definition` — creation skill, balanced. Produces feature_definition YAML. Required artifacts: north_star, personas. Preferred tools: epf_get_template, epf_get_personas, epf_get_schema, epf_validate_file.
- [x] 3.2 Migrate `feature_enrichment` — enrichment skill, balanced. Upgrades existing features to v2.0 persona structure. Required artifacts: existing feature_definition.
- [x] 3.3 Migrate `roadmap_enrichment` — enrichment skill, balanced. Adds TRL fields to roadmap. Required artifacts: roadmap_recipe.

## 4. Skill Migrations — Review & Analysis Type (canonical-epf)

- [x] 4.1 Migrate `balance_checker` — review skill, balanced. Reviews roadmap balance across 4 tracks. Required artifacts: roadmap_recipe.
- [x] 4.2 Migrate `value_model_review` — review skill, balanced. Reviews value model quality. Required artifacts: value_model. Preferred tools: epf_explain_value_path, epf_validate_relationships, epf_analyze_coverage.
- [x] 4.3 Migrate `strategic_reality_check` — analysis skill, high-reasoning. Evaluates artifacts against reality. Required artifacts: north_star, strategy_formula, value_model.
- [x] 4.4 Migrate `aim_trigger_assessment` — analysis skill, balanced. Decides whether to run AIM now vs wait. Required artifacts: roadmap_recipe, living_reality_assessment.

## 5. Skill Migrations — Pathfinder Sub-Skills (canonical-epf)

These were `.agent_prompt.md` files but function as skills required by the pathfinder agent. Each produces a section of `01_insight_analyses.yaml`.

- [x] 5.1 Migrate `01_trend_scout` — analysis skill, balanced. Produces trend analysis section. Required artifacts: none (first step).
- [x] 5.2 Migrate `02_market_mapper` — analysis skill, balanced. Produces market analysis section. Required artifacts: none.
- [x] 5.3 Migrate `03_internal_mirror` — analysis skill, balanced. Produces internal analysis section. Required artifacts: none.
- [x] 5.4 Migrate `04_problem_detective` — analysis skill, balanced. Produces user/problem analysis section. Required artifacts: none.

## 6. Skill Migrations — Generation Type (canonical-epf)

For each generator: move directory to `skills/`, add `skill.yaml` manifest alongside existing files (`wizard.instructions.md`, `schema.json`, `validator.sh`). Do NOT rename existing files — they are permanent aliases.

- [x] 6.1 Migrate `context-sheet` — generation skill, balanced, category: internal. Add skill.yaml with output format, required artifacts (north_star, personas, strategy_formula), tool scope.
- [x] 6.2 Migrate `investor-memo` — generation skill, high-reasoning, category: investor. Complex multi-document output.
- [x] 6.3 Migrate `skattefunn-application` — generation skill, balanced, category: compliance. Region: NO. Has template.md.
- [x] 6.4 Migrate `development-brief` — generation skill, balanced, category: development. Engineering handover focus.
- [x] 6.5 Migrate `value-model-preview` — generation skill, fast-exec, category: internal. Has template.html and publish script.

## 7. Prompt Review

Review each migrated prompt.md for system prompt compatibility. Flag issues but defer rewrites to a separate effort.

- [x] 7.1 Review all 5 agent prompts — check for phrasing that works poorly when injected as system prompt (e.g., meta-references to "this prompt", instructions to "read the following")
- [x] 7.2 Review all 16 skill prompts — check for references to old wizard names, outdated tool names, or instructions that assume the old delivery mechanism
- [x] 7.3 Document any prompts that need content rewrites (separate backlog item, not this proposal)

## 8. Embedded Pipeline Updates (epf-cli)

- [x] 8.1 Update `scripts/sync-embedded.sh` — add syncing from `agents/` and `skills/` directories with fallback to `wizards/` and `outputs/`
- [x] 8.2 Update `internal/embedded/embedded.go` — add `//go:embed` directives for `agents/` directory alongside existing `wizards/` directive
- [x] 8.3 Update MANIFEST.txt generation for new directory structure
- [x] 8.4 Run sync script and verify all content is embedded correctly
- [x] 8.5 Build epf-cli and verify `epf-cli agents list` and `epf-cli skills list` show all migrated content
- [x] 8.6 Run full test suite and verify zero regressions

## 9. Import/Export Tools (epf-cli)

- [x] 9.1 Create `internal/agent/import.go` — import logic for raw text, CrewAI YAML, OpenAI JSON formats
- [x] 9.2 Create `internal/skill/import.go` — import logic for raw text, CrewAI YAML formats
- [x] 9.3 Add `import` subcommand to `cmd/agents.go` — `epf-cli agents import <source> [--format auto|crewai|openai|raw]`
- [x] 9.4 Add `import` subcommand to `cmd/skills.go` — `epf-cli skills import <source> [--format auto|crewai|raw]`
- [x] 9.5 Add `epf_import_agent` MCP tool handler in `internal/mcp/agent_tools.go`
- [x] 9.6 Add `epf_import_skill` MCP tool handler in `internal/mcp/skill_tools.go`
- [x] 9.7 Write tests for import format detection and field mapping
- [x] 9.8 Write tests for import CLI commands

## 10. Integration Testing & Merge

- [x] 10.1 Point emergent-strategy submodule at canonical-epf feature branch — SKIPPED (canonical-epf is not a submodule; sync done in Section 8)
- [x] 10.2 Run full test suite with new canonical content
- [x] 10.3 Test MCP tools: verify `epf_list_agents` returns 5 agents with structured metadata
- [x] 10.4 Test MCP tools: verify `epf_list_skills` returns 16 skills with structured metadata
- [x] 10.5 Test MCP tools: verify `epf_list_agent_skills("pathfinder")` returns 5 skills
- [ ] 10.6 Test plugin: verify `epf_activate_agent("pathfinder")` injects prompt and scopes tools
- [x] 10.7 Test backward compat: verify `epf_list_generators` still returns 5 generators
- [x] 10.8 Test backward compat: verify `epf_get_wizard("pathfinder")` returns same content as `epf_get_agent("pathfinder")`
- [ ] 10.9 Merge canonical-epf feature branch to main
- [x] 10.10 Point emergent-strategy submodule at canonical-epf main — N/A (canonical-epf is not a submodule)
- [ ] 10.11 Merge emergent-strategy branch to main
- [ ] 10.12 Tag release
