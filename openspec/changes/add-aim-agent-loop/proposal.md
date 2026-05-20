# Change: Add AI-Assisted AIM Agent Loop

## Why

The AIM cycle (Observe → Assess → Decide → Adapt) is currently fully manual.
Users must hand-author assessment reports, calibration memos, and strategy
updates with no AI assistance and no enforcement of the cycle order. The cycle
stepper UI (shipped May 2026) makes the loop *visible*, but each step still
requires the user to know what to fill in, where the data lives, and how to
connect outcomes to decisions.

This is the wrong default. Strategy-server already has all the raw material:
OKR targets in roadmap_recipe, assumption IDs in relationships, ripple signals
from the coherence engine, feature statuses in artifacts, and the LRA as
baseline. An AI agent can read all of this and draft 80% of an assessment report
in seconds. The human's job should be to review, correct, and commit — not to
transcribe data from one artifact to another.

The archived `add-aim-recalibration-engine` proposal (2026-05-20) designed this
for epf-cli (now frozen). This change re-specifies it for strategy-server,
using the platform's existing staged-batch authoring pattern, ripple coherence
engine, and MCP tool surface. All AI outputs land in staged batches; no
autonomous commits without explicit human `commit_batch`.

## What Changes

### 1. Cycle Trigger Detection

A new `cycle_trigger` signal type surfaces in the AIM landing stepper when a
new assessment is due. Triggers are configurable per instance:
- **Time-based:** N days since last assessment report was committed
- **Signal-based:** Critical ripple signal count exceeds threshold
- **KR-staleness:** Key results in the active roadmap cycle have no reported
  actuals after N days past the cycle end date

Trigger state is evaluated lazily on page load (no background job required).
The AIM landing stepper shows a "Cycle due" badge and prompts action when any
trigger fires.

### 2. Draft Assessment Report (`draft_aim_assessment`)

New MCP tool. Reads the active roadmap cycle's OKRs (with KR targets), the
current assumption validation relationships, recent ripple signals, and feature
statuses. Produces a structurally complete `assessment_report` payload with:
- One `okr_assessments` entry per OKR in the active cycle, pre-filled with the
  KR targets from the roadmap and placeholder `actual` / `status` fields
- One `assumption_validations` entry per assumption referenced in
  `tests_assumption` or `validates_assumption` relationships, with evidence
  pulled from existing assessment history if available
- A `strategic_insights` list derived from critical ripple signals

Output is staged as a batch — not committed. The UI shows a "Review & edit
draft" flow before commit.

### 3. Draft Calibration Memo (`draft_aim_calibration`)

New MCP tool. Reads the committed assessment report and produces a structured
`calibration_memo` payload with:
- A suggested `decision` (persevere / pivot / pull_the_plug) with reasoning
  derived from OKR hit rate and assumption validation outcomes
- `learnings` populated from assessment `strategic_insights`
- `next_cycle_inputs` (opportunity_update, strategy_update, new_assumptions)
  derived from the assessment's `next_cycle_recommendations`

Output is staged as a batch. The decision field is explicitly marked as
AI-suggested; the human must confirm or override before commit.

### 4. Apply Calibration (`apply_aim_calibration`)

New MCP tool. Reads a committed calibration memo and generates a batch of READY
artifact updates implied by the decision:
- **persevere:** No READY changes. Optionally updates roadmap cycle status to
  `completed` and creates a new cycle scaffold.
- **pivot:** Flags the strategy formula's `strategic_bets` for review (adds a
  `review_flag` to affected bets). Optionally drafts a new roadmap cycle with
  adjusted OKRs.
- **pull_the_plug:** Flags the north star and formula for major revision.
  Creates a structured prompt for the human to provide new direction.

All output is staged — never auto-committed. The batch description clearly
labels everything as "AI-suggested, requires human review."

### 5. AIM Cycle History

Completed cycles (LRA + assessment + calibration) are snapshotted as a named
strategy version tagged `source='aim_cycle'` with `cycle_number` in metadata.
The Versions screen (already built) shows cycle snapshots with their
calibration decision badge. A new `list_aim_cycles` MCP tool returns cycle
history as structured data.

### 6. Web UI — Stepper Actions

The AIM cycle stepper gains action buttons on each active step:
- **Observe (active):** "Create LRA" → opens LRA placeholder with field hints
- **Assess (active):** "Draft with AI" button → calls `draft_aim_assessment`
  via HTMX POST, redirects to a review screen showing the staged batch
- **Decide (active):** "Draft with AI" button → calls `draft_aim_calibration`,
  redirects to calibration review screen
- **Adapt (active):** "Apply decision" button → calls `apply_aim_calibration`,
  redirects to READY artifact review screen

Buttons that call AI tools show a loading spinner during the request (HTMX
`hx-indicator`). Draft review screens show the AI-generated content inline with
edit capability before commit.

## What This Is NOT

- Not autonomous: every AI-generated output requires explicit `commit_batch`
- Not real-time: triggers are evaluated on page load, not via background jobs
- Not replacing human judgment: the calibration decision field always requires
  human confirmation; AI provides a suggestion with reasoning
- Not a new LLM integration: uses the existing `SignalResolver` / LLM provider
  pattern already specified in `strategy-ripple` — the same optional
  `LLM_PROVIDER_URL` config. Degrades gracefully when no LLM is configured
  (drafts are skeleton-only: structure + KR targets, no narrative)

## Relationship to Existing Work

| Existing capability | How this builds on it |
|---|---|
| `strategy-ripple` | Reads ripple signals as input to draft assessment; adds `cycle_trigger` signal type |
| `strategy-authoring` | All AI outputs use the existing staged-batch pattern (`create_feature`, `commit_batch`) |
| `strategy-web` (stepper) | Adds action buttons to the existing 4-step stepper |
| `domain/version` | Cycle snapshots use the existing `publish_version` with new metadata fields |
| Archived `add-aim-recalibration-engine` | Phase 3–4 intent re-specified for strategy-server; epf-cli phases 1–2 remain archived (epf-cli frozen) |

## Impact

- **New spec:** `strategy-aim-agent-loop` (new capability)
- **Modified specs:** `strategy-ripple` (cycle_trigger signal type), `strategy-web` (stepper actions)
- **New code:** `domain/aim/` service package, `internal/handler/handler_aim_draft.go`,
  `internal/ui/aim_draft_review.templ`, new DB migration for trigger config storage
- **New MCP tools:** `draft_aim_assessment`, `draft_aim_calibration`,
  `apply_aim_calibration`, `list_aim_cycles`
- **No breaking changes:** All new; existing MCP tools and UI unchanged
