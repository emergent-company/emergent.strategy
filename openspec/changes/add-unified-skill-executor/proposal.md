# Change: Add Unified Skill Executor

## Why

Skills and agents in the strategy-server today have a split personality:

- **Interactive path** (`run_skill` MCP tool): resolves the skill, returns its `prompt.md`
  to the calling agent, which then authors content itself. The server is passive.
- **Automated path** (`domain/aim/ApplyCalibration`): hardcoded Go logic that flags
  strategic bets with `review_flag: true` — not driven by any skill at all. The LLM
  is called directly from domain code with a bespoke prompt embedded in source.

The consequence: the AIM Adapt step is theatrical. It produces metadata flags, not
real strategy changes. And there is no way to swap in a custom authoring prompt
per-instance, per-product, or per-workflow step.

Meanwhile the epf-cli has an established skill model (prompt-delivery, script-mode,
inline) that already handles document generation (skattefunn application, investor
memo, context sheet). The strategy-server has the same resolution stack but uses it
only in the passive interactive path.

The gap is a `SkillExecutor` — a component that can take any resolved skill, render
its prompt with live artifact context, call the server's internal LLM, parse the
structured output, and stage concrete mutations — all within a workflow step or any
other server-side call site.

This change introduces the `SkillExecutor` as the unified authoring engine, extends
the skill model with an `output.schema` field for structured output validation,
adds the `adapt-strategy` embedded skill for AIM Adapt, and wires everything into
the AIM cycle workflow so the Adapt step produces real strategy rewrites. The same
executor is exposed as an `autonomous` mode on `run_skill` for MCP callers who want
server-side execution.

## What Changes

### 1. New package: `domain/skillexec/`

A `SkillExecutor` that handles the autonomous execution path:

- Resolves a skill via `pack.Service.ResolveSkill` (installed → canonical fallback)
- Builds a context bundle from the instance's committed artifacts
- Renders the skill's `prompt.md` with the context bundle (template substitution for
  `{{.Artifacts}}`, `{{.CalibrationDecision}}`, `{{.AssessmentSummary}}`, etc.)
- Calls `LLMClient.CompleteJSON` with the rendered prompt and the skill's output schema
- Validates the LLM response against the skill's `output.schema` (JSON Schema)
- Returns a typed `SkillResult` containing either staged mutations or a document output
- Falls back to skeleton/no-op mode when no LLM is configured (preserves existing
  degraded-mode behaviour)

### 2. Extended skill model: `output.schema` field

Skills that target autonomous execution declare an `output.schema` field in `skill.yaml`
pointing to a JSON Schema file co-located with the skill. The executor validates LLM
output against this schema before staging anything. Prompt-delivery skills (interactive
`run_skill`) continue to work identically — the schema field is ignored in that path.

Three execution contexts, one skill definition:

| Context | Trigger | Who runs the prompt |
|---|---|---|
| Interactive | `run_skill` (default) | External agent (returns prompt) |
| Autonomous | `run_skill` with `mode=autonomous` | Internal `LLMClient` |
| Workflow step | `SkillExecutor.Run(ctx, instanceID, skillName, params)` | Internal `LLMClient` |

### 3. New embedded skill: `adapt-strategy`

A canonical embedded skill at
`internal/embedded/skills/adapt-strategy/` with:

- `skill.yaml` — type=generation, phase=AIM, execution=prompt,
  requires: calibration_memo, assessment_report, strategy_formula, roadmap_recipe
- `prompt.md` — decision-aware LLM instructions: given the calibration decision +
  full assessment evidence + current artifact payloads, produce a complete replacement
  for `strategy_formula` (revised bets, revised OKRs) and `roadmap_recipe` (updated
  phases and priorities). Output is Option A (full replacement payloads, not diffs).
- `output_schema.json` — JSON Schema describing the expected LLM output: an object
  with `strategy_formula` and `roadmap_recipe` keys, each containing the full
  replacement artifact payload. Validated by the executor before staging.

The skill is per-instance overridable: install a custom `adapt-strategy` skill via
`install_pack` to replace the prompt for a specific product or workflow.

### 4. AIM cycle workflow: replace `apply_calibration` step with `adapt_strategy`

`domain/aim/workflow.go` step 3 changes from the hardcoded `stepApplyCalibration`
to `stepAdaptStrategy`, which calls `SkillExecutor.Run(ctx, instanceID, "adapt-strategy", params)`.

The step stages a single batch containing full replacement payloads for
`strategy_formula` and `roadmap_recipe`. The human reviews the complete proposed
strategy rewrite in the draft-review UI, then commits or discards.

On commit, `snapshot_cycle` (step 4) publishes the version. The prior committed
state is preserved in version history — the "old strategy" remains accessible via
the versions page.

The step rename is reflected in the AIM stepper UI: "Adapt" shows "Generate strategy
rewrite" as the draft action label.

### 5. `run_skill` MCP tool: optional `mode=autonomous` parameter

When `mode=autonomous` is passed and the server has an LLM configured, `run_skill`
calls `SkillExecutor.Run` instead of returning the prompt. The response contains the
staged `batch_id` and a summary of what was staged. This gives MCP clients (external
agents, the web UI) access to the same autonomous execution path.

When `mode=autonomous` is passed but no LLM is configured, the tool returns an error
rather than silently falling back to prompt-delivery mode.

The default (`mode` absent or `mode=interactive`) continues to return the prompt —
no breaking change.

### 6. Skill `output` block formalised in spec

The `strategy-skills` capability spec (new) documents the full skill model:
execution modes, output block, schema validation contract, and the three-context
execution model. The `epf-cli-mcp` spec is referenced as the origin of the
prompt-delivery model; this spec extends it for autonomous server-side execution.

## Impact

- **Affected specs:**
  - `strategy-authoring` — MODIFIED: batch staging now includes skill-executor-staged
    batches; autonomous skill execution produces committed mutations via the same path
  - `strategy-serving` — no changes required (reads are unchanged)
  - `strategy-skills` (NEW) — documents the unified skill model for strategy-server
- **Affected code:**
  - New package: `domain/skillexec/executor.go` + `executor_test.go`
  - New embedded skill: `internal/embedded/skills/adapt-strategy/` (3 files)
  - Modified: `domain/aim/workflow.go` — step 3 replace
  - Modified: `domain/aim/service.go` — `ApplyCalibration` delegates to executor
  - Modified: `internal/mcpserver/register_pack_tools.go` — `run_skill` autonomous mode
  - Modified: `internal/ui/phase_aim.templ` — Adapt step label
  - New migration: none (no schema changes)
- **No breaking changes** to existing MCP tools, APIs, or the interactive `run_skill` path
- **epf-cli is frozen** — the skill model in epf-cli is the reference; this change
  extends it server-side without touching epf-cli code

## Non-Goals

- Replacing the interactive `run_skill` path (prompt-delivery remains the default)
- Autonomous execution of script-mode skills (script execution is subprocess-based;
  autonomous LLM execution is a separate concern)
- Skill versioning / upgrade notifications (handled by existing pack infrastructure)
- Per-feature archival automation (human action after reviewing the adapt batch)
- `pull_the_plug` full automation (same executor pattern, lower priority — add later)
