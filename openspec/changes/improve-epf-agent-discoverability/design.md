## Context

AI agents interacting with EPF through MCP tools exhibit three consistent anti-patterns:
1. Run `health_check` then directly edit YAML files, bypassing all guided workflows
2. Ignore wizard tools entirely, inventing ad-hoc approaches based on general strategic terminology
3. Never use strategy query tools (vision, personas, roadmap) even when they would ground decisions

The root cause is that the agent onboarding path (`epf_agent_instructions`) provides insufficient guidance and no mandatory protocols. The tool ecosystem (~65 tools) is overwhelming without a decision tree.

## Goals / Non-Goals

**Goals:**
- Make wizard usage mandatory and deterministic for all artifact creation/modification
- Make strategy query tools discoverable and actively used
- Reduce the dual-MCP confusion to a single coherent agent experience
- Provide task-to-workflow decision trees that agents can follow mechanically

**Non-Goals:**
- Changing the underlying MCP protocol or tool signatures
- Merging the two MCP servers into one binary mode (they serve different deployment scenarios)
- Adding runtime enforcement that blocks writes (epf-cli is a linter, not a gatekeeper)
- Rewriting all 17 wizard content files

## Decisions

### Decision 1: Wizard-first protocol via `epf_agent_instructions` output
The `epf_agent_instructions` tool output will include a new `mandatory_protocols` section with explicit workflow sequences. This is enforced by convention (agent instructions) not by runtime blocking.

**Rationale:** Runtime blocking would violate the "agent as writer, tool as linter" principle. Convention-based enforcement through comprehensive instructions is the EPF way -- the same approach used for schema validation.

**Alternatives considered:**
- Runtime gating (reject writes without wizard token) -- rejected: violates architecture principle
- Separate "workflow orchestrator" tool -- rejected: over-engineering, agents can follow instructions

### Decision 2: Strategy instance default via environment variable consumption
When `EPF_STRATEGY_INSTANCE` is set (by `strategy serve`), all tools that accept `instance_path` SHALL use it as the default when the parameter is not provided. This eliminates the need for agents to discover and pass the instance path on every call.

**Rationale:** The env var is already set by `strategy serve` but never consumed. This is a trivial change with high impact -- agents can immediately use strategy tools without discovery friction.

### Decision 3: Tiered agent instructions with Quick Protocol header
The embedded AGENTS.md will be restructured with a <200 line "Quick Protocol" at the top containing the mandatory workflows, followed by the full reference. This respects context window limits while keeping the full documentation available.

**Rationale:** Most agents will only process the first ~200 lines. Putting the mandatory protocols there ensures they're always in context.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Agents still ignore wizard-first protocol | Make protocol language extremely directive (MUST/SHALL), include in tool descriptions |
| Instance default breaks explicit instance_path usage | Only apply default when param is empty/missing; explicit values always win |
| Instruction changes don't reach distributed AGENTS.md | Include update in tasks; track with `epf-cli init` distribution |

### Decision 4: Health-check-to-wizard trigger system via declarative mapping

Health check output will include a new `semantic_review_recommendations` section. This section is populated by a declarative mapping table that maps check categories + trigger conditions to companion wizards. The mapping lives in a Go struct (not YAML config) alongside the health check orchestration in `cmd/health.go`.

**Rationale:** The `value_model_review` wizard already demonstrates the correct pattern -- it consumes health check output and adds semantic evaluation on top. Making this systematic (a mapping table rather than per-wizard ad-hoc integration) ensures all health checks can eventually have semantic companions. A Go struct is appropriate because the mapping is stable, small, and tightly coupled to the check implementation.

**Alternatives considered:**
- YAML configuration for trigger mappings -- rejected: adds indirection for a small, stable dataset; also would need to be embedded
- Wizard content files self-declaring their triggers -- rejected: creates circular dependency (health check needs to know about wizards, but wizards are separate content)
- Runtime auto-invocation of wizards -- rejected: violates "agent as writer, tool as linter"; recommendations are advisory

### Decision 5: New semantic quality wizards authored in canonical-epf

Two new wizard content files will be authored:
1. `feature_quality_review.agent_prompt.md` -- semantic evaluation of feature definitions (JTBD format, persona-feature alignment, narrative coherence, scenario completeness)
2. `strategic_coherence_review.agent_prompt.md` -- cross-artifact strategic alignment review (north star ↔ strategy formula ↔ roadmap ↔ features coherence)

These are `agent_prompt` type wizards (not interactive `wizard` type) because they're designed for AI agents to execute autonomously based on health check triggers. They follow the `value_model_review` pattern: consume tool output, apply semantic litmus tests, produce structured findings.

**Rationale:** Agent prompts are the right modality -- these reviews are triggered programmatically from health check recommendations, not from user-initiated interactive sessions. The `value_model_review` precedent proves this pattern works.

**Content authoring location:** New wizard files MUST be authored in `canonical-epf` repo's `wizards/` directory and synced to `apps/epf-cli/internal/embedded/wizards/` via `sync-embedded.sh`. The OpenSpec tasks specify the wizard content requirements; actual file authoring happens in canonical-epf.

### Decision 6: Balance checker updated to consume health check output

The existing `balance_checker` wizard will be updated to accept health check output as optional input (like `value_model_review` already does). This allows it to be triggered from health check recommendations with pre-computed data rather than re-reading all artifacts from scratch.

**Rationale:** Consistency with `value_model_review` pattern. The wizard already exists and works -- it just lacks health check integration.

## Risks / Trade-offs (Extended)

| Risk | Mitigation |
|------|------------|
| New wizards produce inconsistent semantic evaluations | Follow `value_model_review` as template; use structured scoring with explicit criteria |
| Trigger conditions are too aggressive (too many recommendations) | Start conservative: only trigger on clear failures (score < 80, missing artifacts), not warnings |
| Canonical-epf wizard content falls out of sync with trigger mapping | Trigger mapping references wizard names; validation can check that recommended wizards exist in embedded content |

## Open Questions

- Should `epf_agent_instructions` proactively call `epf_get_wizard_for_task` when it detects an instance context, returning pre-matched wizard recommendations? (Deferred to implementation)
- Should the strategy server expose a `epf_get_mcp_capabilities` meta-tool that returns what mode the server is running in? (Deferred -- may be unnecessary if env var default works)
- Should semantic review recommendations include a severity level (info/warning/critical) to help agents prioritize? (Likely yes, deferred to implementation)
- Should the `feature_quality_review` wizard be split into separate persona-review and narrative-review wizards, or remain unified? (Start unified, split if too long)
