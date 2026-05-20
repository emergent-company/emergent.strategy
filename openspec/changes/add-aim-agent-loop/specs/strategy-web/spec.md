## ADDED Requirements

### Requirement: AIM Cycle Stepper Actions

The AIM cycle stepper (4-step Observe → Assess → Decide → Adapt) SHALL display
contextual action buttons on each active step, enabling AI-assisted drafting
directly from the landing page.

Active step buttons:
- **Observe (active):** "Create LRA" link — navigates to the LRA placeholder page
- **Assess (active):** "Draft with AI" button — HTMX POST to
  `POST /strategies/:id/aim/draft-assessment`; shows loading spinner during
  request; redirects to draft review screen on success
- **Decide (active):** "Draft with AI" button — HTMX POST to
  `POST /strategies/:id/aim/draft-calibration`; same loading/redirect pattern
- **Adapt (active):** "Apply decision" button — HTMX POST to
  `POST /strategies/:id/aim/apply-calibration`; same pattern

Done steps retain their existing "View" links. Waiting steps show no action
button (they are dimmed and non-interactive).

#### Scenario: Draft assessment from stepper

- **WHEN** the Assess step is active (no committed assessment)
- **AND** the user clicks "Draft with AI"
- **THEN** a loading spinner replaces the button during the POST request
- **AND** on success the browser navigates to the draft review screen for the
  new batchID

#### Scenario: Step advances after commit

- **WHEN** a draft assessment batch is committed
- **AND** the AIM landing page is re-loaded or the stepper is re-rendered
- **THEN** the Assess step shows as done and the Decide step becomes active

---

### Requirement: Draft Review Screen

The system SHALL provide a dedicated screen at
`GET /strategies/:id/aim/draft-review/:batchID` for reviewing AI-generated
staged batches before committing them.

The screen renders inside the AIM tab (same sub-nav), shows:
- A prominent "AI Draft" banner explaining that content was generated and
  requires human review before committing
- For each mutation in the batch: artifact type, artifact key, and a readable
  summary of what will be created or changed
- A "Commit" button (POST to existing `commit_batch` handler)
- A "Discard" button (POST to existing `discard_batch` handler, with
  confirmation prompt)

After commit, the user is redirected to the relevant AIM sub-page for the
artifact type (assessment → `/aim/assessment`, calibration → `/aim/calibration`,
READY updates → `/aim/versions`).

#### Scenario: Review screen renders

- **WHEN** the user is redirected to the draft review screen after drafting
- **THEN** the page shows the number of mutations, the artifact types, and
  the AI Draft banner

#### Scenario: Commit redirects correctly

- **WHEN** the user commits a draft assessment batch
- **THEN** they are redirected to `/strategies/:id/aim/assessment`

#### Scenario: Discard returns to AIM landing

- **WHEN** the user discards any draft batch from the review screen
- **THEN** they are redirected to `/strategies/:id/aim`
- **AND** the batch is permanently discarded

---

### Requirement: Cycle Due Trigger Banner

The AIM landing page SHALL display a prominently styled banner when the trigger
evaluation determines a new assessment cycle is due.

The banner appears between the cycle stepper and the signal feed. It shows:
- The trigger reason in plain language (e.g., "90 days since last assessment",
  "3 critical signals require review")
- A "Draft Assessment" button that initiates the AI draft flow

#### Scenario: Banner shown when trigger fires

- **WHEN** the AIM landing page loads
- **AND** trigger evaluation returns `Fired = true`
- **THEN** the cycle due banner is displayed with the reason and a Draft action

#### Scenario: Banner absent when no trigger

- **WHEN** trigger evaluation returns `Fired = false`
- **THEN** no banner is shown and the layout is unchanged
