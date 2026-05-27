## Context

The AIM cycle orchestrates four writing stages: Observe (LRA), Assess, Decide,
Adapt. Only Adapt runs through the unified skill executor with embedded skill
definitions sourced from canonical EPF. Assess and Decide use inline Go prompts
and direct LLM calls in `domain/aim/service.go`, bypassing the skill resolution
stack, schema validation, run tracking, and per-instance customisation.

Additionally, 10 skills were authored directly in the strategy-server
(`internal/embedded/skills/`) without corresponding definitions in
`epf-canonical`. These work but break the authority chain: canonical EPF owns
artifact schemas and semantics, so it should also own the writing instructions.

This design covers migrating all AIM writing stages to the canonical skill
pipeline and upstreaming native skills to `epf-canonical`.

## Goals

- All AIM writing stages route through `skillexec.Executor` with full run
  tracking, token accounting, schema validation, and correction retries
- All skill definitions originate from `epf-canonical` and arrive via
  `task sync-embedded`
- Deterministic calibration logic (decision computation) stays in Go
- The orchestration workflow remains structurally identical (same 5 steps,
  same human gates, same concurrency model)
- Zero breaking changes to MCP tools or web UI

## Non-Goals

- Rewriting the orchestration engine itself
- Changing the skill resolution priority order (installed > canonical > legacy)
- Making Assess or Decide chunked (single-shot is sufficient for both)
- Moving the deterministic functions out of `aim.Service`

## Decisions

### Decision 1: Assessment as a single-shot skill, not chunked

The current assessment calls the LLM once per OKR in parallel goroutines.
Converting this to a chunked skill (one chunk per OKR) would change it to
sequential execution, which is slower.

**Decision:** Use a single-shot skill (`prompt.md`, no `chunks/` directory)
that receives all OKRs and returns the complete assessment report in one call.
The prompt template iterates over OKRs using Go template `{{range}}`.

**Rationale:** Modern LLMs handle multi-OKR assessment in a single call
without quality degradation. The parallel-goroutine approach was an
optimisation for weaker models. A single call is simpler, produces a
consistent assessment voice across OKRs, and fits the standard skill executor
path without requiring a new parallel execution mode.

**Trade-off:** Slightly higher latency for instances with many OKRs (>8).
Acceptable because assessment drafting is not latency-critical (human reviews
the output regardless).

### Decision 2: Pre-computed context passed as skill parameters

The assessment skill needs data that is currently computed by Go methods:
`extractOKRSkeleton()`, `extractAssumptionValidations()`,
`extractStrategicInsights()`, `seedWithPriorActuals()`. The calibration skill
needs `calibrationDecision()` and `buildReasoningSummary()`.

**Decision:** These computations remain in Go. The orchestration step computes
them and passes the results as skill parameters (via `params map[string]any`).
The skill prompt template receives them as `{{.Params.okr_skeleton}}`,
`{{.Params.decision}}`, etc. The `ContextBundle` still loads committed
artifacts from the DB, but the derived/computed data arrives via params.

**Rationale:** These functions contain domain-critical logic (OKR hit rate
thresholds, assumption counting, signal filtering) that must not be replicated
in a prompt template. Keeping them in Go ensures they're tested, typed, and
version-controlled as code.

### Decision 3: Calibration skill produces only the narrative

The calibration memo has two parts:
1. **Decision** (`persevere`/`pivot`/`pull_the_plug`) -- pure computation
2. **Reasoning narrative** -- 2-3 sentences of strategic explanation

**Decision:** The `draft-calibration` skill receives the pre-computed decision,
hit rate, assumption data, and formula reasoning as parameters. Its only job is
to produce the reasoning narrative. The orchestration step assembles the
complete `calibration_memo` payload from the Go-computed decision plus the
skill-generated narrative.

**Rationale:** The decision logic is deterministic and auditable. It must not
be delegated to an LLM. The skill enriches, not decides.

### Decision 4: Chunk plan registry becomes data-driven

Currently `chunkPlanFor()` is a Go switch statement mapping skill names to
hardcoded `[]chunkDef` slices. Adding new chunked skills requires Go code
changes.

**Decision:** Keep the Go switch for now. New single-shot skills (assessment,
calibration) do not need chunk plans. The switch grows only if a new chunked
skill is added. A data-driven approach (reading chunk metadata from
`skill.yaml`) is a future optimisation, not required for this change.

### Decision 5: Native skills upstreamed via GitHub issues

The 10 strategy-server-native skills need to move to `epf-canonical`. The
canonical-epf team owns that repo and its release process.

**Decision:** File GitHub issues on `emergent-company/epf-canonical` with the
complete skill definitions (skill.yaml, prompt.md, chunks/, output_schema.json)
as issue content. The canonical-epf team reviews, adjusts for cross-platform
compatibility (epf-cli also syncs from canonical), and publishes a new version.
Once published, `task sync-embedded` in strategy-server picks up the canonical
versions, replacing the native ones.

**Migration sequence:**
1. File issues with skill definitions
2. Canonical team merges and cuts a release
3. Strategy-server runs `task sync-embedded`
4. Native skill files are replaced by canonical versions
5. MANIFEST.txt is updated to include the new skills

### Decision 6: aim.Service retains deterministic helpers

After migration, `aim.Service` loses its LLM client (`s.llm` field) and the
`enrichAssessmentWithLLM` / `enrichCalibrationWithLLM` methods. It retains:

- `EvaluateTriggers()` -- trigger evaluation (no LLM)
- `extractOKRSkeleton()` -- OKR structure extraction from roadmap
- `seedWithPriorActuals()` -- merge prior assessment data
- `extractAssumptionValidations()` -- relationship index queries
- `extractStrategicInsights()` -- ripple signal loading
- `calibrationDecision()` -- rule-based decision
- `buildReasoningSummary()` -- template-based fallback reasoning
- `computeOKRHitRate()`, `countInvalidatedAssumptions()` -- pure math
- `DraftAssessment()` -- now assembles params and calls executor
- `DraftCalibration()` -- now computes decision, assembles params, calls executor
- `SnapshotCycle()`, `ListCycles()` -- unchanged

The service becomes a coordinator: compute deterministic data, delegate
writing to the executor, and assemble the final output.

## Risks / Trade-offs

- **Canonical-epf dependency:** The strategy-server migration is blocked until
  canonical-epf publishes the skill definitions. Mitigation: file issues early;
  the current native skills work as-is until canonical versions are available.
  The migration can be done in phases -- Assess and Decide first (new skills),
  then upstream existing native skills later.

- **Single-call assessment quality:** Moving from per-OKR parallel calls to a
  single multi-OKR call changes the LLM interaction pattern. Mitigation: test
  with production-scale instances (8-12 OKRs) and compare assessment quality
  before removing the old path.

- **Prompt template complexity:** The assessment prompt template will be larger
  than the current inline format string because it includes `{{range}}` loops
  and conditional sections. Mitigation: use the same template patterns proven
  in `adapt-strategy` chunks.

## Open Questions

1. Should `draft-assessment` declare `output_schema.json` for strict JSON
   validation, or rely on the canonical EPF artifact schema alone?
   Recommendation: yes, include an output schema -- it enables the executor's
   correction-retry loop.

2. Should the per-OKR signal context loading (`extractStrategicInsights`) be
   expanded to per-OKR granularity in the skill parameter, or kept as a
   global list? Current implementation loads top-5 critical signals globally.
   Recommendation: keep global for now, expand later based on user feedback.
