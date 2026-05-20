## ADDED Requirements

### Requirement: Cycle Trigger Detection

The system SHALL evaluate configurable trigger conditions per strategy instance
to determine when a new AIM cycle assessment is due, and surface the trigger
state in the AIM landing page without requiring a background job.

Trigger conditions (all configurable, with defaults):
- **Time-based:** N days since the last committed `assessment_report` (default: 90)
- **Signal-based:** Active critical ripple signal count exceeds threshold (default: 3)
- **KR-staleness:** Active roadmap cycle has a non-null end date that has passed
  and no committed `assessment_report` exists for that cycle

Trigger configuration is stored as an `artifact_type = 'aim_trigger_config'`
artifact in `strategy_artifacts` (no new table). When no trigger config exists,
defaults apply.

#### Scenario: Time trigger fires

- **WHEN** the AIM landing page loads for an instance
- **AND** the last committed `assessment_report` was committed more than the
  configured `days_between_assessments` ago (or no assessment exists)
- **THEN** `TriggerState.Fired = true` with `Reason = "time"` and
  `RecommendedAction = "draft_aim_assessment"`

#### Scenario: Signal trigger fires

- **WHEN** the AIM landing page loads
- **AND** active critical ripple signals exceed the configured `critical_signal_threshold`
- **THEN** `TriggerState.Fired = true` with `Reason = "signals"` and a count
  of critical signals in the reason message

#### Scenario: No trigger fires

- **WHEN** all trigger conditions evaluate to false
- **THEN** `TriggerState.Fired = false` and no trigger banner is shown in the UI

#### Scenario: Trigger banner in UI

- **WHEN** `TriggerState.Fired = true`
- **THEN** the AIM landing page displays a prominently styled banner between
  the cycle stepper and the signal feed, with the trigger reason and a
  "Draft Assessment" action button

---

### Requirement: Draft Assessment Report

The system SHALL provide a `draft_aim_assessment` MCP tool and a corresponding
web action that reads live strategy data and produces a structurally complete
`assessment_report` payload staged as a batch for human review.

The draft MUST include:
- One `okr_assessments` entry per OKR in the active roadmap cycle, with KR
  targets populated from `roadmap_recipe`
- One `assumption_validations` entry per assumption ID found in
  `tests_assumption` or `validates_assumption` relationships, with `status`
  defaulting to `"pending"` and `evidence` populated from prior assessment
  history if available
- A `strategic_insights` list derived from active critical ripple signal
  descriptions (when any exist)

When an LLM is configured (`LLM_PROVIDER_URL`), the tool additionally
generates narrative `assessment` text per OKR and `evidence` text per assumption.
When no LLM is configured, narrative fields are empty strings — the structure
is valid and committable.

The draft MUST be validated against the embedded `assessment_report` schema
before staging. Invalid drafts are rejected with a structured error; they are
never staged.

#### Scenario: Draft in skeleton mode (no LLM)

- **WHEN** `draft_aim_assessment` is called and `LLM_PROVIDER_URL` is not set
- **THEN** a staged batch is created containing an `assessment_report` with
  all OKRs and assumptions pre-populated with targets/IDs but empty narrative fields
- **AND** the response includes `{ batch_id, draft_summary: { okr_count, assumption_count, llm_used: false } }`

#### Scenario: Draft with LLM

- **WHEN** `draft_aim_assessment` is called and `LLM_PROVIDER_URL` is set
- **THEN** the LLM is called once per OKR to generate assessment narrative
- **AND** the response includes `{ batch_id, draft_summary: { okr_count, assumption_count, llm_used: true } }`

#### Scenario: Schema validation failure

- **WHEN** the assembled draft payload fails schema validation
- **THEN** no batch is staged
- **AND** the tool returns a structured error listing the validation failures

#### Scenario: No active roadmap cycle

- **WHEN** the instance has no `roadmap_recipe` artifact
- **THEN** the tool returns an error: `"No roadmap found for instance"`

---

### Requirement: Draft Calibration Memo

The system SHALL provide a `draft_aim_calibration` MCP tool and corresponding
web action that reads a committed `assessment_report` and produces a structured
`calibration_memo` payload with a reasoned decision suggestion, staged as a
batch.

Decision logic (rule-based, no LLM required):
- **persevere** if OKR hit rate ≥ 60% AND no invalidated assumptions
- **pivot** if OKR hit rate < 60% OR any assumption is invalidated but the
  north_star vision is still valid
- **pull_the_plug** if OKR hit rate < 30% AND multiple assumptions invalidated

When an LLM is configured, the tool additionally generates a narrative
`reasoning` field explaining the decision. The `decision` field is always
tagged as AI-suggested in the batch description.

#### Scenario: Persevere decision

- **WHEN** `draft_aim_calibration` is called
- **AND** the assessment shows ≥ 60% OKR achievement and no invalidated assumptions
- **THEN** the staged memo has `decision = "persevere"` with supporting reasoning

#### Scenario: Pivot decision

- **WHEN** the assessment shows < 60% OKR achievement or invalidated assumptions
- **THEN** the staged memo has `decision = "pivot"` with affected OKRs listed

#### Scenario: No committed assessment

- **WHEN** `draft_aim_calibration` is called but no committed `assessment_report` exists
- **THEN** the tool returns an error: `"No committed assessment report found"`

---

### Requirement: Apply Calibration to READY Artifacts

The system SHALL provide an `apply_aim_calibration` MCP tool and corresponding
web action that reads a committed `calibration_memo` and generates a staged
batch of targeted READY artifact patches implied by the decision.

Patch rules by decision:
- **persevere:** No READY patches. Batch contains only a roadmap cycle status
  update (`cycle.status = "completed"`) if the active cycle has a non-null end
  date that has passed.
- **pivot:** Flags implicated `strategic_bets` in `strategy_formula` with
  `review_flag: true`. If an LLM is configured, uses the calibration reasoning
  to identify which bets are implicated. Otherwise flags all bets.
- **pull_the_plug:** Flags `north_star.vision` for revision by setting a
  `review_flag` field and adds a `calibration_note` with the pull_the_plug
  reasoning.

All patches are staged — never auto-committed. The batch description explicitly
labels content as "AI-suggested — requires human review before committing."

#### Scenario: Persevere — cycle completion patch

- **WHEN** `apply_aim_calibration` is called on a persevere memo
- **AND** the active roadmap cycle end date has passed
- **THEN** a batch is staged updating `roadmap_recipe` cycle status to "completed"
- **AND** the batch description reads "Mark cycle N complete — persevere decision"

#### Scenario: Pivot — strategy formula flags

- **WHEN** `apply_aim_calibration` is called on a pivot memo
- **THEN** a batch is staged updating implicated `strategic_bets` in
  `strategy_formula` with `review_flag: true`
- **AND** the response lists the affected bet IDs

#### Scenario: No committed calibration memo

- **WHEN** `apply_aim_calibration` is called but no committed `calibration_memo` exists
- **THEN** the tool returns an error: `"No committed calibration memo found"`

---

### Requirement: Cycle History

The system SHALL snapshot each completed AIM cycle as a named strategy version
and provide a `list_aim_cycles` MCP tool for querying cycle history.

A cycle snapshot is created automatically when a `calibration_memo` is committed.
The snapshot uses the existing `publish_version` mechanism with:
- `label = "Cycle N — <Decision>"` where N is auto-incremented
- `source = "aim_cycle"` in version metadata
- `calibration_decision` and `cycle_number` in version metadata JSONB

#### Scenario: Auto-snapshot on calibration commit

- **WHEN** a batch containing a `calibration_memo` artifact is committed
- **THEN** `publish_version` is called automatically with `source = "aim_cycle"`
- **AND** the Versions screen shows the new version with a calibration decision badge

#### Scenario: List cycle history

- **WHEN** `list_aim_cycles` is called for an instance
- **THEN** it returns all versions with `source = "aim_cycle"` ordered by
  `published_at` descending, with `cycle_number`, `decision`, `version_id`,
  and `published_at` per entry

---

### Requirement: Draft Review Screen

The system SHALL provide a web UI screen for reviewing and committing AI-generated
staged batches before they are applied to the strategy instance.

The screen renders the staged batch contents in human-readable form — showing
artifact type, key, and a summary of what will be created or updated. It
provides a "Commit" action (calls existing `commit_batch`) and a "Discard"
action (calls existing `discard_batch`). AI-generated content is labelled with
an "AI draft" badge so users know it requires review.

#### Scenario: Review draft assessment

- **WHEN** the "Draft with AI" button is clicked on the Assess step
- **AND** the server successfully calls `DraftAssessment`
- **THEN** the browser is redirected to the draft review screen for the new batchID
- **AND** the screen shows OKR count, assumption count, and a "Commit" button

#### Scenario: Commit draft

- **WHEN** the user clicks "Commit" on the draft review screen
- **THEN** `commit_batch` is called for the batchID
- **AND** the user is redirected to the relevant AIM sub-page (assessment, calibration)
- **AND** the AIM cycle stepper advances to show the next step as active

#### Scenario: Discard draft

- **WHEN** the user clicks "Discard" on the draft review screen
- **THEN** `discard_batch` is called and the user is returned to the AIM landing page
