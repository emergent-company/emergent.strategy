# Design: Unified Skill Executor

## Context

The strategy-server already has all the pieces in place:

- `pack.Service.ResolveSkill` — priority-ordered skill resolution (installed → canonical)
- `internal/llm/` — `LLMClient` interface with `Complete` and `CompleteJSON`
- `domain/aim/service.go` — existing `stageMutationWithBatch` pattern for staging
- `pkg/orchestration/` — workflow engine with `StepFunc` / `HumanGate` model
- `internal/skillrunner/` — subprocess execution for script-mode skills

What's missing is the glue: a component that takes a resolved skill's `prompt.md`,
fills it with live artifact context, runs it through the LLM, and produces staged
mutations. This design documents that component and its integration points.

## Goals / Non-Goals

**Goals:**
- Unified execution path for any prompt-mode skill running autonomously
- Per-instance skill override without code changes (install a pack)
- Structured, schema-validated LLM output before staging anything
- No regression on interactive `run_skill` (prompt-delivery unchanged)
- AIM Adapt step produces a complete, human-reviewable strategy rewrite

**Non-Goals:**
- Autonomous execution of script-mode skills
- Real-time streaming of LLM output to the web UI
- Multi-turn LLM conversation within a single skill execution
- Skill chaining (one skill's output feeding another's input) — future concern

## Decisions

### Decision: New package `domain/skillexec/` not extending `domain/aim/`

The executor is domain-agnostic — it knows about skills and mutations but not about
AIM cycles, heartbeat, or ripple. Putting it in `domain/aim/` would create a
dependency inversion (aim importing pack importing embedded). A standalone package
with injected dependencies keeps the boundary clean.

```
domain/skillexec/
  executor.go       — SkillExecutor struct, Run method
  context.go        — ContextBundle builder (loads artifacts for prompt rendering)
  executor_test.go  — unit tests with mock LLM and mock pack service
```

### Decision: Prompt rendering via Go `text/template`, not Handlebars or Mustache

The prompt.md files already use a simple convention. We formalise it with Go's
`text/template`. Template variables available to every skill prompt:

```
{{.InstanceID}}          — instance UUID string
{{.Decision}}            — calibration decision (persevere/pivot/pull_the_plug)
{{.AssessmentSummary}}   — JSON-encoded assessment report summary
{{.Artifacts}}           — map[string]any of all current committed artifacts by type
{{.Params}}              — caller-supplied params map (from workflow step or MCP)
```

Skills that don't use a variable simply don't reference it — no error. Skills that
need decision-specific branching use `{{if eq .Decision "pivot"}}...{{end}}`.

### Decision: Output schema is Option A (full replacement payloads)

The LLM is instructed to output the complete replacement artifact payload, not a diff.
This is simpler to prompt, simpler to validate, and simpler for humans to review —
they see the full proposed state, not a patch set.

The output schema for `adapt-strategy` is:

```json
{
  "type": "object",
  "required": ["strategy_formula", "roadmap_recipe"],
  "properties": {
    "strategy_formula": { "$ref": "strategy_formula_schema.json" },
    "roadmap_recipe":   { "$ref": "roadmap_recipe_schema.json" }
  }
}
```

The executor validates this against the embedded canonical EPF schemas before staging.
If validation fails, the step fails with a descriptive error (not silently staged).

### Decision: `SkillExecutor` interface for testability

```go
// SkillExecutor runs a named skill autonomously for an instance.
type SkillExecutor interface {
    Run(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any) (*SkillResult, error)
}

// SkillResult is returned by a successful autonomous skill execution.
type SkillResult struct {
    BatchID           uuid.UUID
    ArtifactTypes     []string       // artifact types staged
    SkillName         string
    LLMUsed           bool
    ValidationPassed  bool
}
```

The concrete `executor` struct takes `pack.Service`, `LLMClient`,
`strategy.Service` (for staging mutations), and `schema.Service` (for validation).
In tests, each dependency is mocked.

### Decision: `mode=autonomous` on `run_skill` returns `batch_id`, not the document

When `mode=autonomous`, `run_skill` calls `SkillExecutor.Run` and returns:

```json
{
  "mode": "autonomous",
  "skill_name": "adapt-strategy",
  "batch_id": "...",
  "artifact_types": ["strategy_formula", "roadmap_recipe"],
  "llm_used": true,
  "validation_passed": true
}
```

The caller then uses `list_pending_batches` to see the staged content, and
`commit_batch` / `discard_batch` to accept or reject it. Same review flow as any
other staged batch — no new UI surface required.

### Decision: Skill prompt context includes full artifact payloads, not summaries

The LLM needs to see the complete `strategy_formula` and `roadmap_recipe` to produce
a valid replacement. Summaries would cause hallucination of missing fields.
Token budget: a full strategy instance is ~15–25K tokens of context; with the
prompt instructions this fits within 32K context (Gemini 2.5 Flash / GPT-4o).
If an instance exceeds the budget, the executor truncates feature lists first
(most verbose, least critical to the adapt rewrite) and logs a warning.

### Decision: Skeleton mode when LLM is nil

If `s.llm == nil`, `SkillExecutor.Run` stages a batch with the current artifact
payloads unchanged, plus a `_skeleton: true` marker. This preserves the HumanGate
pause so the human can manually edit the batch content before committing, even
without an LLM. This matches the existing behaviour in `DraftAssessment`.

### Decision: `adapt-strategy` skill is the only new embedded skill in this change

Other output-generation skills (investor memo, development brief, skattefunn
application) already exist as embedded skills in strategy-server. They gain
autonomous execution capability automatically via `run_skill` `mode=autonomous`
without any changes to their definitions.

## Package Dependencies

```
domain/skillexec/
  imports:
    domain/pack        (skill resolution)
    domain/strategy    (ListCurrentArtifacts, stageMutationWithBatch)
    domain/schema      (schema validation)
    internal/llm       (LLMClient)
    internal/embedded  (canonical schemas for output validation)
  imported by:
    domain/aim         (workflow step)
    internal/mcpserver (run_skill autonomous mode)
```

No circular imports. `domain/skillexec` sits between `domain/pack` and `domain/aim`
in the dependency chain.

## Migration Plan

1. Add `domain/skillexec/` with full tests (mock LLM returns hardcoded valid JSON)
2. Add `adapt-strategy` embedded skill files
3. Update `domain/aim/workflow.go` to use executor in step 3
4. Update `internal/mcpserver/register_pack_tools.go` for `mode=autonomous`
5. Update `internal/ui/phase_aim.templ` for Adapt step label
6. Run full test suite; verify no regression on existing interactive `run_skill` calls
7. Rebuild CSS; rebuild binary; smoke-test AIM cycle on Sequence instance

## Risks / Trade-offs

- **LLM output quality**: The adapt prompt must be carefully written. If the LLM
  produces invalid artifact payloads, schema validation will catch it and the step
  fails rather than staging garbage. The human sees the error and can retry or
  manually author the batch.
- **Token budget**: Large instances with many features may hit context limits.
  Mitigation: truncation strategy documented above; future work to add chunking.
- **Prompt coupling to schema**: If EPF schemas evolve, the adapt prompt must be
  kept in sync. Mitigation: the prompt instructs the LLM to "produce a payload
  conforming to the schema" and includes a compact schema summary; the output
  validator catches regressions before staging.

## Open Questions

- None blocking implementation. Skill chaining and multi-turn execution are deferred.
