# Tasks: Add AI-Assisted AIM Agent Loop

All tasks target `apps/strategy-server/`. epf-cli is frozen — no changes there.

## 1. Domain Service — `domain/aim`

- [x] 1.1 Create `domain/aim/` package with `Service` type receiving `*bun.DB`
      and optional `LLMClient` interface
- [x] 1.2 Implement `LLMClient` interface and nil-safe wrapper (skeleton mode
      when nil)
- [x] 1.3 Implement `EvaluateTriggers(ctx, instanceID) TriggerState` — reads
      last assessment timestamp, active critical signal count, active roadmap
      cycle end date; returns `Fired bool`, `Reason string`,
      `RecommendedAction string`
- [x] 1.4 Implement `DraftAssessment(ctx, instanceID) (batchID, error)` —
      reads roadmap OKRs + KR targets, assumption relationships, recent ripple
      signals; builds assessment_report payload; validates payload against
      embedded schema; stages as batch; returns batchID
- [x] 1.5 Implement `DraftCalibration(ctx, instanceID) (batchID, error)` —
      reads committed assessment_report; computes OKR hit rate and assumption
      validation rate; suggests decision with reasoning; stages calibration_memo
      as batch; returns batchID
- [x] 1.6 Implement `ApplyCalibration(ctx, instanceID) (batchID, error)` —
      reads committed calibration_memo; generates targeted READY artifact
      patches per decision type (persevere/pivot/pull_the_plug); stages as
      batch; returns batchID
- [x] 1.7 Implement `SnapshotCycle(ctx, instanceID, cycleNumber int,
      decision string) (versionID, error)` — calls `domain/version.Publish`
      with `source='aim_cycle'` metadata
- [x] 1.8 Implement `ListCycles(ctx, instanceID) ([]CycleSummary, error)` —
      filters `strategy_versions` by `metadata->>'source' = 'aim_cycle'`
- [x] 1.9 Wire LLM-backed client from `LLM_PROVIDER_URL` config — reuse same
      HTTP client pattern as `domain/ripple` SignalResolver
- [x] 1.10 Write unit tests for trigger evaluation (mock DB rows)
- [x] 1.11 Write unit tests for draft assembly logic (no LLM — skeleton mode)
- [x] 1.12 Write unit tests for calibration decision logic (persevere/pivot/stop)

## 2. MCP Tools

- [x] 2.1 Register `draft_aim_assessment` tool — calls `DraftAssessment`,
      returns `{ batch_id, draft_summary: { okr_count, assumption_count } }`
- [x] 2.2 Register `draft_aim_calibration` tool — calls `DraftCalibration`,
      returns `{ batch_id, suggested_decision, reasoning_summary }`
- [x] 2.3 Register `apply_aim_calibration` tool — calls `ApplyCalibration`,
      returns `{ batch_id, affected_artifacts: [] }`
- [x] 2.4 Register `list_aim_cycles` tool — calls `ListCycles`, returns array
      of `{ cycle_number, decision, version_id, published_at }`
- [x] 2.5 Add tools to `internal/mcpserver/` registration file (MCP tool count
      increases from 107 to 111)
- [x] 2.6 Update `internal/agent/` knowledge base with new tool descriptions
      so `get_agent_for_task` routes AIM drafting queries correctly
- [x] 2.7 Write integration tests for all 4 new MCP tools (mock LLM client)

## 3. Trigger Evaluation — AIM Landing

- [x] 3.1 Add `TriggerState` field to `ui.AimPhaseData` struct
- [x] 3.2 Call `aim.Service.EvaluateTriggers` in `loadAimPhaseData` handler
- [x] 3.3 Add `aimCycleDueBanner` templ component — renders when
      `TriggerState.Fired` is true; shows reason + recommended action button
- [x] 3.4 Insert banner between stepper and signal feed in `AimPhaseContent`

## 4. Web UI — Draft Action Buttons

- [x] 4.1 Add `POST /strategies/:id/aim/draft-assessment` handler —
      calls `DraftAssessment`, redirects to draft review screen
- [x] 4.2 Add `POST /strategies/:id/aim/draft-calibration` handler —
      calls `DraftCalibration`, redirects to draft review screen
- [x] 4.3 Add `POST /strategies/:id/aim/apply-calibration` handler —
      calls `ApplyCalibration`, redirects to draft review screen
- [x] 4.4 Add `GET /strategies/:id/aim/draft-review/:batchID` handler —
      loads staged batch content and renders review screen
- [x] 4.5 Build `aim_draft_review.templ` component — shows batch contents in
      readable form (artifact type, key, diff-like before/after if update),
      Commit and Discard buttons (POST to existing batch handlers)
- [x] 4.6 Add "Draft with AI" button to Assess step in `aimCycleStep` when
      step is active — HTMX POST with `hx-indicator` spinner
- [x] 4.7 Add "Draft with AI" button to Decide step when active
- [x] 4.8 Add "Apply decision" button to Adapt step when active
- [x] 4.9 Register new routes in `handler.go` `buildHandlerRegistry`
- [x] 4.10 Add routes to `navigation/graph.go` (AimDraftReview node)

## 5. Cycle Snapshot on Calibration Commit

- [x] 5.1 Hook into `commit_batch` post-commit path — detect when committed
      batch contains a `calibration_memo` artifact
- [x] 5.2 Call `aim.Service.SnapshotCycle` automatically after calibration commit
- [x] 5.3 Include `cycle_number` in snapshot (read from `calibration_memo.cycle`
      field or auto-increment from `ListCycles` count + 1)
- [x] 5.4 Update Versions screen to show `aim_cycle` source tag with
      calibration decision badge

## 6. Database

- [x] 6.1 No new migrations required — trigger config stored as
      `artifact_type = 'aim_trigger_config'` (existing artifact table)
- [x] 6.2 Verify `strategy_versions.metadata` JSONB column can store
      `cycle_number` and `calibration_decision` — it can (existing schema)
- [x] 6.3 Add index on `strategy_versions(instance_id, (metadata->>'source'))`
      for efficient cycle history queries — migration 021 applied

## 7. Validation & Tests

- [x] 7.1 Run `go test ./...` — all existing tests must pass
- [x] 7.2 Manual test: trigger draft on 21st instance (has assessment + roadmap)
- [x] 7.3 Manual test: trigger draft on Humatopia (has LRA + roadmap, no
      assessment yet — tests skeleton mode)
- [x] 7.4 Manual test: draft calibration after committing assessment draft
- [x] 7.5 Manual test: apply calibration, verify READY batch stages correctly
- [x] 7.6 Manual test: verify cycle snapshot appears in Versions screen with
      correct badge

## 8. Documentation

- [x] 8.1 Update `apps/strategy-server/AGENTS.md` with new MCP tools and
      `domain/aim/` package description
- [x] 8.2 Update `AGENTS.md` known pre-existing failures section if any
