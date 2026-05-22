## ADDED Requirements

### Requirement: Artifact Generating Indicator

The web UI SHALL display a visual indicator on artifact cards and detail views when an
autonomous skill execution is actively generating a draft for that artifact.

#### Scenario: Generating indicator on READY overview
- **WHEN** an `adapt-foundations` skill run is in progress
- **THEN** the READY overview cards for north_star, strategy_foundations, insight_analyses,
  and insight_opportunity each show a pulsing sparkle icon with "AI draft in progress"
- **AND** the indicator includes elapsed time ("started 45s ago")

#### Scenario: Generating indicator on artifact detail
- **WHEN** a user views an artifact detail page while a skill run targets that artifact
- **THEN** the page header shows a "Draft in progress — started N seconds ago" banner
  with a pulsing animation
- **AND** the banner disappears automatically when the skill run completes or fails

#### Scenario: No indicator when no run active
- **WHEN** no skill run is in progress for the viewed artifact
- **THEN** no generating indicator is displayed

---

### Requirement: Pending Draft Banner

The web UI SHALL display a review banner on artifact pages when a staged batch exists
that modifies that artifact.

#### Scenario: Pending batch for viewed artifact
- **WHEN** a user views an artifact detail page and a staged (uncommitted) batch exists
  containing a mutation for that artifact type
- **THEN** an info banner is displayed below the header: "AI draft available for review"
  with a "Review draft" link to the draft-review page for that batch

#### Scenario: No pending batch
- **WHEN** no staged batch exists for the viewed artifact
- **THEN** no review banner is shown

#### Scenario: Multiple pending batches
- **WHEN** multiple staged batches contain mutations for the same artifact type
- **THEN** the most recent batch is shown in the banner with a count: "2 drafts pending"

---

### Requirement: Activity Stream Client Wiring

The web UI SHALL connect to the existing SSE activity stream endpoint to receive
real-time skill execution events and update artifact indicators without page reload.

#### Scenario: SSE connection established
- **WHEN** a user navigates to any instance page
- **THEN** an EventSource connection is opened to `/strategies/:id/activity/stream`
- **AND** the connection is closed when navigating away from the instance

#### Scenario: skill.started event
- **WHEN** a `skill.started` activity event is received
- **THEN** the generating indicator appears on all artifact cards that the skill
  will modify (inferred from skill name)

#### Scenario: skill.chunk_staged event
- **WHEN** a `skill.chunk_staged` activity event is received
- **THEN** the generating indicator updates to show progress
  (e.g., "2 of 4 chunks complete")

#### Scenario: skill.completed event
- **WHEN** a `skill.completed` activity event is received
- **THEN** the generating indicator is removed from affected artifact cards
- **AND** the pending draft banner appears with "Review draft" link

#### Scenario: skill.failed event
- **WHEN** a `skill.failed` activity event is received
- **THEN** the generating indicator is removed from affected artifact cards
- **AND** a brief error toast is shown: "AI draft failed: [error summary]"

---

### Requirement: Cascade Tracker

The web UI SHALL display an instance-level panel that shows the current state of the
autonomous strategy loop when any activity is in progress. The tracker makes the full
cascade — from AIM cycle through foundation alignment — visible as a coherent
multi-step process.

#### Scenario: Active AIM cycle shown
- **WHEN** an AIM orchestrated cycle is in progress for the instance
- **THEN** the cascade tracker shows the 4-step cycle with current step highlighted
- **AND** the awaiting_human step shows a "Review draft" link to the batch

#### Scenario: Active skill run shown
- **WHEN** an autonomous skill run (adapt-strategy or adapt-foundations) is in progress
- **THEN** the cascade tracker shows the skill name, chunk progress (e.g. "2 of 4"),
  elapsed time, and a pulsing animation

#### Scenario: Pending batches shown
- **WHEN** staged batches exist for the instance
- **THEN** the cascade tracker lists each batch with its source skill, artifact count,
  and a "Review draft" link to the draft-review page

#### Scenario: Downstream effects hinted
- **WHEN** a user is viewing or about to commit a batch containing execution-layer
  artifacts (strategy_formula, roadmap_recipe)
- **THEN** the cascade tracker shows a hint: "After committing, adapt-foundations will
  run automatically to align foundation artifacts"

#### Scenario: Context truncation warning
- **WHEN** a completed or in-progress skill run has chunks where features were dropped
  from the prompt context due to token budget limits
- **THEN** the cascade tracker shows an informational note: "N features dropped from
  context due to token budget"

#### Scenario: Token usage summary
- **WHEN** completed skill runs exist for the instance
- **THEN** the cascade tracker shows a summary: total input/output tokens, number of
  runs, and most recent run details

#### Scenario: No activity
- **WHEN** no AIM cycles, skill runs, or pending batches exist for the instance
- **THEN** the cascade tracker is not displayed (no empty state needed)

---

### Requirement: Pending Batch Dashboard Indicator

The web UI SHALL show a badge on the instance sidebar or dashboard when staged
batches exist, giving users visibility into pending review items.

#### Scenario: Batches pending review
- **WHEN** an instance has one or more staged (uncommitted) batches
- **THEN** the sidebar or dashboard shows a badge with the count
  (e.g., "2 drafts pending review")

#### Scenario: No batches pending
- **WHEN** no staged batches exist for the instance
- **THEN** no badge is shown
