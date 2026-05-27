# Change: Unify AIM Skill Execution via Canonical EPF Skills

## Why

The AIM cycle has four writing stages (Observe, Assess, Decide, Adapt) but only the
last one -- Adapt -- runs through the skill executor with proper embedded skills. The
other three stages use ad-hoc code paths:

| Stage | Current engine | Prompts | Run tracking | Schema validation |
|-------|---------------|---------|-------------|-------------------|
| Observe (LRA) | Skill executor single-shot | Embedded `prompt.md` | No | Yes |
| Assess | `aim.Service.DraftAssessment` | Inline Go strings | No | No |
| Decide | `aim.Service.DraftCalibration` | Inline Go strings | No | No |
| Adapt | Skill executor chunked | Embedded chunk `.md` | **Yes** | **Yes** |

This creates three problems:

1. **No observability.** Assess and Decide have no run tracking, no token usage
   reporting, no chunk progress, no activity events. When something goes wrong
   the operator has no visibility into what happened.

2. **Prompts bypass canonical authority.** The inline Go prompts in
   `domain/aim/service.go` were hand-written without reference to canonical EPF
   schemas. They cannot use `{{schemaConstraints}}` to derive field requirements
   from the authoritative JSON schemas. When canonical schemas evolve, these
   prompts silently diverge.

3. **No per-instance customisation.** The skill resolution stack
   (installed pack > canonical embedded > legacy generator) enables per-instance
   prompt overrides. Inline Go prompts are global and immutable at runtime.

The same problem applies to the 10 "native" skills authored directly in
`internal/embedded/skills/` (draft-lra, draft-formula, draft-foundations, etc.).
These were created in the strategy-server without corresponding definitions in
`epf-canonical`. They work, but they break the authority chain: canonical EPF
owns the schemas and artifact semantics, so it should also own the writing
instructions that produce those artifacts.

## What Changes

### 1. Upstream skills to canonical EPF (external dependency)

Submit GitHub issues to `emergent-company/epf-canonical` requesting the
canonical-epf team create the following skill definitions:

- **`draft-assessment`** -- AIM assessment report generation. Chunked or
  single-shot, receives OKR skeleton + prior actuals + LRA context + ripple
  signals, produces `assessment_report` artifact.
- **`draft-calibration`** -- AIM calibration narrative. Single-shot, receives
  pre-computed decision + assessment data + formula reasoning, produces the
  narrative `reasoning` field of `calibration_memo`.
- **`draft-lra`** -- Living Reality Assessment creation (already exists in
  strategy-server, needs upstreaming).
- **`draft-north-star`**, **`draft-formula`**, **`draft-foundations`**,
  **`draft-insights`**, **`draft-opportunity`**, **`draft-roadmap`** -- READY
  phase bootstrap skills (already exist in strategy-server, need upstreaming).
- **`adapt-strategy`**, **`adapt-foundations`** -- AIM Adapt skills (already
  exist in strategy-server, need upstreaming).
- **`align-portfolio`** -- FIRE phase portfolio alignment (already exists in
  strategy-server, needs upstreaming).

Each canonical skill definition includes `skill.yaml`, `prompt.md` (or
`chunks/*.md`), and `output_schema.json` where applicable. The prompts use
`{{schemaConstraints}}` to derive field requirements from the canonical JSON
schemas that live in the same repo.

### 2. Route Assess and Decide through skill executor

Replace the direct `aim.Service.DraftAssessment()` and
`aim.Service.DraftCalibration()` calls with `skillexec.Executor.RunChunked()`
using the new `draft-assessment` and `draft-calibration` skills. This gives
both stages:

- Run tracking in `skill_runs` table
- Per-chunk token tracking
- Activity events (`skill.started`, `skill.completed`, etc.)
- Schema validation with correction retries
- Context budget management (112KB auto-truncation)
- Per-instance skill overrides via the pack resolution stack

### 3. Preserve deterministic calibration logic

The calibration decision (`persevere` / `pivot` / `pull_the_plug`) is computed
by pure Go functions (`calibrationDecision()`, `buildReasoningSummary()`) using
rule-based thresholds. This computation MUST remain in Go -- it is not an LLM
task. The `draft-calibration` skill only handles the narrative enrichment: given
the pre-computed decision and evidence, write 2-3 sentences of strategic
reasoning.

The pre-computed decision and formula reasoning are passed to the skill as
parameters, alongside the assessment data. The skill prompt template receives
them and can reference them but cannot override the decision.

### 4. Update orchestration steps

The `CycleWorkflow` steps `stepDraftAssessment` and `stepDraftCalibration`
currently call `w.svc.DraftAssessment()` and `w.svc.DraftCalibration()`. These
change to call `w.executor.RunChunked()` with the appropriate skill names,
matching how `stepAdaptStrategy` already works.

### 5. Sync pipeline alignment

After canonical-epf publishes the new skills, run `task sync-embedded` to pull
them into `internal/embedded/skills/`. The native skills currently in the
strategy-server are replaced by the canonical versions. The MANIFEST.txt is
updated to reflect the new canonical source.

### 6. Remove inline LLM calls from aim.Service

Once the skill executor handles all four writing stages, the following methods
become dead code and are removed:

- `enrichAssessmentWithLLM()` (service.go ~L576-695)
- `enrichCalibrationWithLLM()` (service.go ~L1084-1110)
- The direct `s.llm` field on `aim.Service` (the service no longer needs its
  own LLM client)

The deterministic functions (`calibrationDecision()`,
`buildReasoningSummary()`, `computeOKRHitRate()`,
`countInvalidatedAssumptions()`) remain in the service -- they are pure
computation, not LLM calls.

## Impact

- **Affected specs:** `strategy-authoring` (MODIFIED), `strategy-skills` (MODIFIED)
- **Affected code:**
  - `domain/aim/service.go` -- remove inline LLM methods, keep deterministic logic
  - `domain/aim/workflow.go` -- steps 1-2 route through executor
  - `domain/skillexec/executor.go` -- new chunk plans for assessment/calibration skills
  - `internal/embedded/skills/` -- replaced by canonical versions after sync
  - `internal/handler/handler_aim_agent.go` -- parameter assembly for new skills
  - `cmd_serve.go` -- `aim.Service` no longer needs `LLMClient`
- **External dependency:** `emergent-company/epf-canonical` -- 13 skill definitions
  to create/upstream (GitHub issues)
- **Migration:** Zero-downtime. The skill executor already has skeleton-mode fallback.
  Steps can be migrated one at a time: Assess first, then Decide, then verify, then
  remove dead code.
- **Breaking changes:** None. The MCP tools (`draft_aim_assessment`, etc.) keep the
  same interface. Only the internal execution path changes.
