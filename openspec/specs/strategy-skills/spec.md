# strategy-skills Specification

## Purpose
TBD - created by archiving change enrich-calibration-memo. Update Purpose after archive.
## Requirements
### Requirement: Calibration Memo Captures Learnings and Next-Cycle Focus

The canonical `draft-calibration` skill SHALL produce, in addition to the
deterministic decision and its narrative reasoning, the two substantive judgment
sections of the `calibration_memo` artifact: `learnings` and `next_cycle_focus`.
These SHALL be derived from the assessment evidence already supplied to the skill
(OKR/KR outcomes, `assumption_validations`, `strategic_insights`) and SHALL
conform to the canonical `calibration_memo_schema.json` shapes.

The skill SHALL:
- Populate `learnings.validated_assumptions` from assessment assumptions marked
  validated.
- Populate `learnings.invalidated_assumptions` from assessment assumptions marked
  invalidated.
- Populate `learnings.surprises` from strategic insights not anticipated by the
  cycle's OKRs.
- Populate `next_cycle_focus.continue_building` from areas with positive OKR/KR
  evidence.
- Populate `next_cycle_focus.stop_building` from areas tied to invalidated
  assumptions or missed key results.
- Populate `next_cycle_focus.start_exploring` from surprises or the direction
  implied by the decision reasoning.

The skill SHALL NOT choose or override the calibration decision. The
`decision`, `okr_hit_rate_pct`, and `invalidated_assumption_count` values remain
deterministically pre-computed in Go and copied verbatim into the output. The
skill's `output_schema.json` SHALL require `learnings` and `next_cycle_focus`
(in addition to the existing fields) so the executor validates and, on failure,
retries with correction prompts.

When assessment evidence is sparse, the skill SHALL emit empty arrays for the
affected `learnings` / `next_cycle_focus` sub-fields rather than fabricating
content.

#### Scenario: Enriched memo produced by an AIM cycle
- **WHEN** the skill executor runs `draft-calibration` for a cycle whose
  assessment has validated and invalidated assumptions
- **THEN** the staged `calibration_memo` contains a populated `learnings` object
  with `validated_assumptions`, `invalidated_assumptions`, and `surprises`
- **AND** a populated `next_cycle_focus` object with `continue_building`,
  `stop_building`, and `start_exploring`
- **AND** the `decision`, `okr_hit_rate_pct`, and `invalidated_assumption_count`
  match the deterministically computed values exactly

#### Scenario: Decision remains authoritative
- **WHEN** the assessment evidence might suggest a different course than the
  pre-computed decision
- **THEN** the produced memo's `decision` equals the pre-computed value
  unchanged, and the enriched sections are written to support that decision

#### Scenario: Sparse evidence yields empty sections, not fabrication
- **WHEN** the assessment contains no assumption validations and no strategic
  insights
- **THEN** the memo's `learnings` arrays and `next_cycle_focus` arrays are empty
  and the memo still validates against the canonical schema

### Requirement: Adapt Strategy Consumes Calibration Memo Judgment

The canonical `adapt-strategy` skill SHALL use the calibration memo's
`learnings` and `next_cycle_focus` sections — not only its `decision` — to drive
the strategy rewrite. The assessment report remains an input for raw KR-level
numbers, but the human-approved memo judgment SHALL be the primary driver of
which bets, OKRs, and roadmap items are added, preserved, or removed.

The skill SHALL:
- Use `next_cycle_focus.stop_building` and `learnings.invalidated_assumptions`
  to select bets and roadmap items to remove or deprioritise.
- Use `next_cycle_focus.continue_building` and `learnings.validated_assumptions`
  to select bets and OKRs to preserve or reinforce.
- Use `next_cycle_focus.start_exploring` and `learnings.surprises` to seed new
  bets, new roadmap items, and proposed `new_assumptions`.
- Treat the memo judgment fields as OPTIONAL context: when they are absent (a
  legacy thin memo or a manually drafted memo), the skill SHALL fall back to the
  prior assessment-driven behaviour without error.

#### Scenario: Pivot rewrite reflects memo stop/start guidance
- **WHEN** `adapt-strategy` runs for a `pivot` decision whose memo lists items in
  `stop_building` and `start_exploring`
- **THEN** the rewritten `strategy_formula` / `roadmap_recipe` remove or
  deprioritise bets/items aligned to `stop_building` and add bets/items aligned
  to `start_exploring`
- **AND** the proposed `new_assumptions` reflect the `start_exploring` /
  `surprises` direction

#### Scenario: Legacy thin memo falls back to assessment-driven rewrite
- **WHEN** `adapt-strategy` runs with a memo that has no `learnings` or
  `next_cycle_focus`
- **THEN** the skill produces a valid rewrite driven by the assessment report,
  exactly as before this change, with no error

