# Tasks: Enrich Calibration Memo and Wire It Into Adapt Strategy

## 1. Enrich `draft-calibration` skill (epf-canonical)

- [x] 1.1 In `epf-canonical/skills/draft-calibration/prompt.md`, add instructions
      to derive `learnings` (validated_assumptions, invalidated_assumptions,
      surprises) from the assessment data already passed in
      (`assumption_validations`, `strategic_insights`).
- [x] 1.2 Add instructions to derive `next_cycle_focus` (continue_building,
      stop_building, start_exploring) from OKR/KR outcomes + learnings.
- [x] 1.3 Preserve the existing rules verbatim: decision is authoritative and
      copied as-is; `okr_hit_rate_pct` and `invalidated_assumption_count` copied
      verbatim; no LLM override of the decision.
- [x] 1.4 Update the output JSON example in the prompt to include the new fields.
- [x] 1.5 Honour the canonical field shapes (item min/max lengths, array
      min/max counts) from `calibration_memo_schema.json` so derived content
      validates.

## 2. Widen output schema (epf-canonical)

- [x] 2.1 In `epf-canonical/skills/draft-calibration/output_schema.json`, add
      `learnings` and `next_cycle_focus` to `calibration_memo.properties` and
      `required`, mirroring `calibration_memo_schema.json` (including the nested
      `required` arrays).
- [x] 2.2 Keep `name, decision, reasoning, okr_hit_rate_pct,
      invalidated_assumption_count, metadata` required.
- [x] 2.3 Confirm `additionalProperties` posture matches the canonical memo
      schema so the executor validation accepts a conformant payload.

## 3. Consume memo judgment in `adapt-strategy` (epf-canonical)

- [x] 3.1 In `epf-canonical/skills/adapt-strategy/prompt.md`, add a section that
      reads `calibration_memo.learnings` and `calibration_memo.next_cycle_focus`.
- [x] 3.2 PIVOT block: use `stop_building` / `invalidated_assumptions` to choose
      removed/deprioritised bets + roadmap items; use `start_exploring` /
      `surprises` to seed new bets and `new_assumptions`.
- [x] 3.3 PERSEVERE block: use `continue_building` / `validated_assumptions` to
      choose preserved/reinforced bets and OKRs.
- [x] 3.4 PULL_THE_PLUG block: unchanged (no new bets); memo fields ignored.
- [x] 3.5 State that the assessment report remains the source of raw KR numbers,
      but the memo's judgment is the primary driver of the rewrite.
- [x] 3.6 Mark the new memo fields as optional context: if absent (legacy/manual
      memo) fall back to assessment-driven behaviour.

## 4. Validate canonical edits (epf-canonical)

- [x] 4.1 Validate `draft-calibration/output_schema.json` is valid JSON Schema.
- [x] 4.2 Validate an example enriched `calibration_memo` payload against both
      the skill output schema and the canonical `calibration_memo_schema.json`.
- [x] 4.3 Bump `epf-canonical/VERSION` (2.28.0 → next minor) and update any
      changelog the repo maintains.
- [x] 4.4 Tag/release per epf-canonical's release process.

## 5. Sync into strategy-server (strategy-server)

- [x] 5.1 Run `task sync-embedded` to pull the released canonical version.
- [x] 5.2 Verify `internal/embedded/skills/{draft-calibration,adapt-strategy}/`
      and `internal/embedded/VERSION` updated; do not hand-edit.
- [x] 5.3 `go test ./internal/embedded/... -run TestDecomposerFieldsMatchSchemas`.
- [x] 5.4 Rebuild the binary (`go build -o build/strategy-server .`).

## 6. Verify end-to-end (strategy-server)

- [x] 6.1 Run a live AIM cycle; confirm the staged `calibration_memo` now
      contains populated `learnings` + `next_cycle_focus` and still validates.
- [x] 6.2 Confirm `adapt-strategy` runs and its rewrite references the memo's
      stop/continue/start guidance (spot-check the produced strategy_formula /
      roadmap_recipe changes and new_assumptions). Verified live (batch
      `ea4a6265`): committed enriched memo → ran adapt-strategy → the per-chunk
      `change_summaries` map line-by-line to the memo's `next_cycle_focus`
      (paused OrgOps modules + micro-apps = stop_building; prioritized Norwegian
      cap table + group management = continue_building; codified migration
      playbooks + AdminControl outbound = start_exploring) and cite 0% hit rate
      + pivot. Outputs left staged, not committed.
- [x] 6.3 Confirm a legacy/thin memo (or manual draft) still drives
      adapt-strategy via the assessment fallback without error. Verified live
      (batch `f0bd5c4e`): committed thin memo (no `learnings`/`next_cycle_focus`)
      → adapt-strategy completed all 4 chunks with no error and derived
      stop/continue/start from the assessment report (cap table fd-020, postpone
      OrgOps, ECIT playbook), honoring the `pivot` decision.
- [x] 6.5 Fix latent bug surfaced during 6.2: `handleApplyCalibration` ran the
      adapt-strategy skill in the request context, so a client disconnect
      cancelled it mid-chunk and orphaned a partial staging batch. Detached with
      `context.WithoutCancel` (commit `0aef5e01`); verified the run now survives
      client disconnect.
- [x] 6.4 Full suite green: `go test ./...`; lint clean: `task lint`.
