# Tasks: Ripple-Driven Foundation Drafts

## Prerequisites
- [x] `adapt-strategy` chunked skill running end-to-end (done in add-continuous-strategy-loop)
- [x] `postCommitRippleAnalysis` wired in `commit_batch` handler (done)
- [x] `knownArtifactOutputKeys` supports `north_star` and `strategy_foundations` (done — they are in the map but no chunks write them yet)

## 1. Skill: adapt-foundations

- [x]  1.1 Create `internal/embedded/skills/adapt-foundations/skill.yaml`
      — `execution: prompt`, `phase: READY`, requires `strategy_formula`, `roadmap_recipe`,
      `north_star`, `strategy_foundations`, `insight_analyses`, `insight_opportunity`
- [x]  1.2 Create `output_schema.json` — envelope schema with one key per chunk output
      (`north_star`, `strategy_foundations`, `insight_analyses`, `insight_opportunity`)
- [x]  1.3 Create `prompt.md` — interactive fallback (brief, defers to chunks)
- [x]  1.4 Create `chunks/01_north_star.md` — receives updated formula + roadmap + prior LRA
      entry + triggering signals; distinguishes gated (tighten) vs escalated (reframe)
- [x]  1.5 Create `chunks/02_strategy_foundations.md` — receives north_star output as prior;
      updates personas/positioning only if formula bets changed the ICP
- [x]  1.6 Create `chunks/03_insight_analyses.md` — receives prior outputs; updates
      competitive + market trend analysis if pivot changed positioning
- [x]  1.7 Create `chunks/04_insight_opportunity.md` — receives all prior outputs;
      updates opportunity definition if directional change detected

## 2. Executor: adaptFoundationsChunks

- [x] 2.1 Add `adaptFoundationsChunks` var to `executor.go` — four `chunkDef` entries
      matching the skill's chunk files; `artifactType` set for each
- [x] 2.2 Ensure `knownArtifactOutputKeys` includes `insight_analyses` and `insight_opportunity`
      (north_star and strategy_foundations already present)
- [x] 2.3 `buildContextBundle` in `context.go` — verify all four foundation artifacts
      are loaded; add `insight_opportunity` if missing

## 3. Ripple post-commit trigger

- [x] 3.1 In `postCommitRippleAnalysis()` (`register_ripple_tools.go`): after signals
      are created and classified, scan for active gated/escalated signals whose
      `target_key` maps to a foundation artifact type
- [x] 3.2 If any such signals exist and a `SkillExecutor` is available in the service
      registry, enqueue an async goroutine that calls `RunChunked("adapt-foundations")`
      with the instance ID and the triggering signal IDs as context params
- [x] 3.3 Pass `triggered_signals` in the `ContextBundle.Params` so chunk prompts can
      render signal descriptions
- [x] 3.4 Set the batch description to include signal count, authority tier, and a
      plain-English summary: "Foundation alignment draft — triggered by N ripple signal(s)
      after strategy changes. Authority: [gated|escalated]."
- [x] 3.5 On `commit_batch` of the foundation draft, auto-resolve the linked signals
      (reuse `ResolveByTarget` — target keys match artifact keys)

## 4. Context bundle: signal injection

- [x] 4.1 Add `TriggeringSignals []map[string]any` to `ContextBundle` — populated by the
      caller (ripple trigger) or empty for manual `run_skill` calls
- [x] 4.2 Expose `{{triggeringSignals}}` as a template function in `renderPrompt` so
      chunk prompts can render the signal list
- [x] 4.3 Each chunk prompt includes a `## Why This Draft Was Requested` section that
      renders the triggering signals if present, or a generic note if called manually

## 5. Services wiring

- [x] 5.1 Add `SkillExecutor *skillexec.Executor` field to `mcpserver.Services` struct
- [x] 5.2 Wire the executor into `cmd_serve.go` `Services{}` construction (already
      constructed for AIM use — just needs to be exposed in Services)
- [x] 5.3 `postCommitRippleAnalysis` receives `svc Services` (already does) — use
      `svc.SkillExecutor` to call `RunChunked`

## 6. Tests

- [x] 6.1 Unit tests for `adaptFoundationsChunks` — mock LLM returns valid per-chunk
      JSON; verify 4 staged mutations sharing batch_id
- [x] 6.2 Unit test for ripple trigger logic — given signals with gated/escalated tier
      targeting `north_star`, verify `RunChunked` is called with correct params
- [x] 6.3 Verify `knownArtifactOutputKeys` covers all four foundation artifact types
- [x] 6.4 Run full test suite — no regressions

## 7. End-to-end verification

- [x] 7.1 Commit the adapt-strategy batch on Sequence instance
- [x] 7.2 Observe ripple signals created for stale foundation artifacts
- [x] 7.3 Confirm `adapt-foundations` batch appears in pending batches within ~4 minutes
      (manual run verified; `run_skill autonomous` now async — returns immediately)
- [x] 7.4 Review batch description — verify it references triggering signals and tier
- [x] 7.5 Commit foundation batch — verify signals are auto-resolved
      (batch 380fe1eb committed; equilibrium score 1.0; 0 active signals)
