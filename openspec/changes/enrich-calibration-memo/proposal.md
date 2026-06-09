# Change: Enrich Calibration Memo and Wire It Into Adapt Strategy

## Why

The AIM cycle's calibration memo is the cycle's learning-and-decision artifact.
The canonical `calibration_memo` schema (`calibration_memo_schema.json` v1.13.0)
defines a rich structure with eight required fields, including the substantive
judgment fields:

- `learnings` — `validated_assumptions`, `invalidated_assumptions`, `surprises`
- `next_cycle_focus` — `continue_building`, `stop_building`, `start_exploring`
- `next_ready_inputs` — `opportunity_update`, `strategy_update`, `new_assumptions`

In practice the orchestrated AIM cycle produces almost none of this. The
canonical `draft-calibration` skill is deliberately minimal: its prompt states
*"Your sole job is to write the `reasoning` field for a calibration decision that
has already been computed deterministically,"* and its `output_schema.json`
locks the output to five thin fields:

```
decision, reasoning, okr_hit_rate_pct, invalidated_assumption_count, metadata
```

So a memo produced by the cycle contains only a decision and a one-paragraph
justification — e.g. `decision: pivot` plus a single `reasoning` string — while
the schema implies a full Start/Stop/Continue + next-READY-inputs document.

This creates two real problems:

1. **The memo under-delivers versus its schema.** The calibration screen looks
   sparse and nearly redundant. The structured Start/Stop/Continue framing and
   the validated/invalidated/surprise learnings — the most valuable output of a
   cycle — are never captured.

2. **The memo does not inform Adapt Strategy.** `adapt-strategy` receives five
   inputs (`Decision`, the assessment summary, and the current
   `strategy_formula` / `roadmap_recipe` / `living_reality_assessment`). The
   calibration memo contributes only its `decision` value, which acts as a
   branch selector. Adapt Strategy re-derives everything else directly from the
   assessment report. The memo's `learnings` and `next_cycle_focus` — the
   human-approved judgment about what to change — are ignored even when present.

Both `draft-calibration` and `adapt-strategy` are owned by `epf-canonical`
(`emergent-company/epf-canonical`) and mirrored into the strategy-server binary
via `task sync-embedded`. The change therefore originates upstream in
epf-canonical, not in `internal/embedded/` (which is regenerated on every sync).

## What Changes

### 1. Enrich the `draft-calibration` skill (epf-canonical)

Extend the canonical `draft-calibration` skill so it produces the two
substantive memo sections in addition to the existing decision + reasoning,
**derived from data the skill already receives** (the assessment report's
`okr_assessments`, `assumption_validations`, and `strategic_insights`):

- `learnings.validated_assumptions` — from assessment assumptions marked
  validated
- `learnings.invalidated_assumptions` — from assessment assumptions marked
  invalidated
- `learnings.surprises` — from `strategic_insights` not anticipated by the OKRs
- `next_cycle_focus.continue_building` — areas with positive OKR/KR evidence
- `next_cycle_focus.stop_building` — areas tied to invalidated assumptions or
  missed KRs
- `next_cycle_focus.start_exploring` — directions implied by surprises or the
  pivot reasoning

The deterministic decision computation stays in Go (`calibrationDecision()`)
exactly as today — this change does **not** let the LLM choose or override the
decision. The skill still copies the pre-computed `decision`,
`okr_hit_rate_pct`, and `invalidated_assumption_count` verbatim. It only adds
LLM-derived narrative structure grounded in the assessment evidence.

`out-of-scope (this change):` `next_ready_inputs` and `next_steps` population,
and the `adapt-foundations` READY-phase handoff. These remain as-is and are
candidates for a follow-up.

### 2. Widen `draft-calibration/output_schema.json` (epf-canonical)

The skill's output schema currently forbids fields beyond the five thin ones.
Add `learnings` and `next_cycle_focus` to the allowed/required output, mirroring
the shapes in `calibration_memo_schema.json` (so the executor's validation +
correction-retry loop enforces them). Keep the existing five fields required.

### 3. Make `adapt-strategy` consume the memo's judgment (epf-canonical)

The `adapt-strategy` prompt currently reads the calibration memo only to extract
`Decision`. Update the prompt so the per-decision instruction blocks explicitly
reference `calibration_memo.learnings` and `calibration_memo.next_cycle_focus`:

- `stop_building` / `invalidated_assumptions` SHALL guide which bets and roadmap
  items are removed or deprioritised.
- `continue_building` / `validated_assumptions` SHALL guide which bets and OKRs
  are preserved/reinforced.
- `start_exploring` / `surprises` SHALL guide new bets, roadmap items, and the
  `new_assumptions` proposed by adapt-strategy.

The assessment report remains an input (it carries the raw KR-level numbers),
but the memo's human-approved judgment becomes the primary driver of the
rewrite rather than being re-derived from scratch.

### 4. Release canonical and sync (epf-canonical → strategy-server)

After the canonical edits are validated, bump the canonical `VERSION`
(2.28.0 → next), tag/release, then run `task sync-embedded` in strategy-server
and rebuild. No strategy-server Go code changes are required: `draft-calibration`
already runs through the skill executor (whose validation honours the widened
output schema), and `adapt-strategy` already receives the full
`calibration_memo` artifact in its context bundle (`skillexec/context.go`).

## Impact

- **Affected specs:** `strategy-skills` (MODIFIED)
- **Affected code (epf-canonical — source of truth):**
  - `skills/draft-calibration/prompt.md` — derive learnings + next_cycle_focus
  - `skills/draft-calibration/output_schema.json` — widen allowed/required output
  - `skills/adapt-strategy/prompt.md` — consume memo learnings + next_cycle_focus
- **Affected code (strategy-server — mirror only):**
  - `internal/embedded/skills/{draft-calibration,adapt-strategy}/` — replaced by
    `task sync-embedded` after canonical release; never hand-edited
  - `internal/embedded/VERSION` + `MANIFEST.txt` — updated by sync
- **External dependency:** `emergent-company/epf-canonical` — skill + schema
  edits, version bump, release. Tracked upstream as
  [epf-canonical#22](https://github.com/emergent-company/epf-canonical/issues/22).
  This downstream OpenSpec change stays in `proposed` state until that issue
  ships and `task sync-embedded` pulls the new canonical version.
- **Migration:** Backward compatible. Memos produced before this change keep
  their thin shape; new cycles produce enriched memos. `adapt-strategy` treats
  the new memo fields as optional context — if absent (legacy memo or manual
  draft) it falls back to assessment-driven behaviour, exactly as today.
- **Breaking changes:** None. The deterministic decision logic, the MCP tool
  interfaces, and the orchestration step wiring are unchanged.
- **Validation:** After sync, run
  `go test ./internal/embedded/... -run TestDecomposerFieldsMatchSchemas` and a
  live AIM cycle to confirm the enriched memo validates and adapt-strategy
  consumes it.
