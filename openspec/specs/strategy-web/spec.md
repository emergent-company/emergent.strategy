# Capability: strategy-web

## Purpose

HTMX web UI — a rendering layer on top of the Phase 2 validated backend. Phase 3 only.
No business logic in handlers. Mobile-responsive from the first template.

---

## Navigation Graph

All screens, URLs, methods, parent screens, and data hints.

| Screen | URL | Method | Parent | Data Hints |
|---|---|---|---|---|
| Home / Workspace List | `GET /` | GET | — | list_workspaces |
| Create Workspace | `GET /workspaces/new` | GET | Home | — |
| Create Workspace POST | `POST /workspaces` | POST | — | create_workspace |
| Workspace Detail | `GET /workspaces/:workspaceID` | GET | Home | get_workspace, list_instances |
| Import Instance | `GET /workspaces/:workspaceID/instances/new` | GET | Workspace Detail | — |
| Import Instance POST | `POST /workspaces/:workspaceID/instances` | POST | — | import_instance |
| Instance Detail | `GET /workspaces/:workspaceID/instances/:instanceID` | GET | Workspace Detail | get_instance, get_strategy_context |
| Strategy Vision | `GET /workspaces/:workspaceID/instances/:instanceID/vision` | GET | Instance Detail | get_product_vision |
| Edit Vision | `GET /workspaces/:workspaceID/instances/:instanceID/vision/edit` | GET | Vision | get_product_vision |
| Edit Vision POST | `POST /workspaces/:workspaceID/instances/:instanceID/vision` | POST | — | update_north_star |
| Personas | `GET /workspaces/:workspaceID/instances/:instanceID/personas` | GET | Instance Detail | get_personas |
| Roadmap | `GET /workspaces/:workspaceID/instances/:instanceID/roadmap` | GET | Instance Detail | get_roadmap |
| Features | `GET /workspaces/:workspaceID/instances/:instanceID/features` | GET | Instance Detail | list_features |
| Feature Detail | `GET /workspaces/:workspaceID/instances/:instanceID/features/:featureKey` | GET | Features | get_feature |
| New Feature | `GET /workspaces/:workspaceID/instances/:instanceID/features/new` | GET | Features | — |
| New Feature POST | `POST /workspaces/:workspaceID/instances/:instanceID/features` | POST | — | create_feature |
| Edit Feature | `GET /workspaces/:workspaceID/instances/:instanceID/features/:featureKey/edit` | GET | Feature Detail | get_feature |
| Edit Feature POST | `POST /workspaces/:workspaceID/instances/:instanceID/features/:featureKey` | POST | — | update_feature |
| Staging Review | `GET /workspaces/:workspaceID/instances/:instanceID/staging/:batchID` | GET | — | get_batch |
| Commit Batch POST | `POST /workspaces/:workspaceID/instances/:instanceID/staging/:batchID/commit` | POST | — | commit_batch |
| Discard Batch POST | `POST /workspaces/:workspaceID/instances/:instanceID/staging/:batchID/discard` | POST | — | discard_batch |
| Mutation History | `GET /workspaces/:workspaceID/instances/:instanceID/history` | GET | Instance Detail | list_mutations |
| Instance Health | `GET /workspaces/:workspaceID/instances/:instanceID/health` | GET | Instance Detail | health_check |
| Auth Login | `GET /auth/github/login` | GET | — | — |
| Auth Callback | `GET /auth/github/callback` | GET | — | — |

---

## Requirements

### Requirement: HTMX Partial Rendering

All screens SHALL support both full-page and HTMX partial rendering. The `render.RenderAuto`
helper detects the `HX-Request` header and returns the appropriate response.

#### Scenario: Full page request
- **WHEN** a browser navigates directly to a screen URL
- **THEN** the response includes the base layout (sidebar, header, flash messages)
- **AND** the page-specific content is rendered inside the layout

#### Scenario: HTMX partial request
- **WHEN** HTMX sends a request with the `HX-Request: true` header
- **THEN** only the page-specific partial is returned
- **AND** no layout wrapper is included

---

### Requirement: Form Error Preservation

All forms SHALL preserve user-entered values when a POST fails validation.

#### Scenario: Invalid form submission
- **WHEN** a user submits a form with invalid values
- **THEN** the form is re-rendered with the user's original values pre-filled
- **AND** validation error messages are displayed adjacent to the failing fields
- **AND** HTTP 422 is returned

---

### Requirement: Mobile Responsive

All screens SHALL be usable on mobile devices.

#### Scenario: Table scroll on small screens
- **WHEN** a list table renders on a small screen
- **THEN** the table is wrapped in a horizontal scroll container
- **AND** no content is clipped or hidden without user action

#### Scenario: Responsive navigation
- **WHEN** the sidebar renders on a small screen
- **THEN** the sidebar collapses to a hamburger menu
- **AND** the main content fills the full width

---

### Requirement: Post-Redirect-Get

All successful POST handlers SHALL redirect to a GET endpoint on success.

#### Scenario: Successful form submission
- **WHEN** a POST handler succeeds
- **THEN** the handler redirects with HTTP 303 to the appropriate GET screen
- **AND** a flash message is set in the session cookie
- **AND** the redirected GET renders the flash message and clears it

---

### Requirement: i18n in All Templates

All user-facing strings SHALL use `langs.T(ctx, key)`.

#### Scenario: No hard-coded strings
- **WHEN** reviewing any template file
- **THEN** all user-facing strings use `langs.T(ctx, "key")` calls
- **AND** no string literals in template files except layout structure (e.g., HTML attributes)

### Requirement: Deterministic Portfolio Alignment

The system SHALL provide a deterministic portfolio alignment operation that
activates value model components across all four tracks based on roadmap KR
`value_model_target` references. The operation MUST NOT use an LLM. The
operation MUST only modify `active` flags and `activation_notes` — all other
fields (structure, IDs, names, descriptions, UVPs, maturity data) MUST be
preserved. The operation MUST auto-commit its mutations (no human review gate).

#### Scenario: AIM cycle auto-alignment

- **WHEN** the AIM orchestrated cycle runs
- **AND** the `adapt_strategy` step has committed changes to the roadmap_recipe
- **THEN** the `align_portfolio` step runs automatically after `adapt_strategy`
- **AND** reads the newly committed roadmap KRs
- **AND** for each track with KR targets (including Product), sets `active: true` on L3 sub-components referenced by at least one KR
- **AND** sets `active: false` on L3 sub-components not referenced by any KR
- **AND** propagates activation upward (L2 active if any child L3 active; L1 active if any child L2 active)
- **AND** writes `activation_notes` on each activated L3 citing the KR ID and description
- **AND** preserves all non-activation fields (layers, components, IDs, names, descriptions, UVPs, maturity)
- **AND** auto-commits the value model mutations
- **AND** the cycle continues to `snapshot_cycle`

#### Scenario: No-op skipped

- **WHEN** the alignment operation computes activation state for a track
- **AND** the computed activation state is identical to the current committed state
- **THEN** no mutation is created for that track

#### Scenario: No KR targets populated

- **WHEN** the alignment operation runs
- **AND** no KRs in the roadmap have `value_model_target` fields
- **THEN** no mutations are created
- **AND** the operation completes without error

#### Scenario: Structural preservation

- **WHEN** the alignment operation processes any value model (including Product)
- **THEN** only the `active` flag on L1, L2, and L3 entries and `activation_notes` on L3 entries are modified
- **AND** all other fields (layer names, component IDs, descriptions, UVPs, maturity data, high_level_model, track_maturity) are preserved unchanged

#### Scenario: Unresolvable component path

- **WHEN** a KR has a `value_model_target.component_path` that does not match any L3 sub-component in the value model
- **THEN** the system logs a warning
- **AND** includes the unresolvable path in the alignment summary
- **AND** continues processing other KR targets

### Requirement: Periodic Instance Consistency Check

The system SHALL run a periodic consistency check for each strategy instance,
triggered by the heartbeat ticker. The check MUST be idempotent — running it
on a healthy instance produces no mutations. Each sub-check MUST be independent
so that a failure in one does not block others.

#### Scenario: Consistency check runs on heartbeat

- **WHEN** the heartbeat ticker evaluates instances
- **THEN** for each instance, the system runs the consistency check
- **AND** the check includes value model alignment, missing definition backfill, stale run cleanup, and orphaned batch detection
- **AND** results are recorded in the activity log

#### Scenario: Value model alignment drift detected

- **WHEN** the consistency check runs
- **AND** the value model `active` flags do not match current KR targets
- **THEN** the system runs `AlignPortfolio` to correct the drift
- **AND** auto-commits the corrective mutations

#### Scenario: Missing canonical definitions detected

- **WHEN** the consistency check runs
- **AND** one or more non-product tracks have zero canonical definitions installed
- **THEN** the system installs the missing definitions from embedded templates
- **AND** auto-commits the definition mutations

#### Scenario: Stale skill run detected

- **WHEN** the consistency check runs
- **AND** a skill run has been in `running` status for more than 10 minutes
- **THEN** the system marks the run as `failed` with error "stale run: exceeded 10 minute timeout"

#### Scenario: Orphaned staged mutation detected

- **WHEN** the consistency check runs
- **AND** a staged mutation batch has been pending for more than 24 hours
- **THEN** the system logs a warning with the batch ID and age
- **AND** does not auto-discard the batch (human decision required)

### Requirement: FIRE Dashboard Alignment Status

The FIRE dashboard SHALL display per-track alignment status showing how many
value model components are active and which KRs drive them. There SHALL be
no manual alignment button — alignment is automatic.

#### Scenario: Alignment status visible

- **WHEN** the user views the FIRE dashboard
- **THEN** each track shows the count of active L3 sub-components and total L3 sub-components

#### Scenario: Missing KR targets warning

- **WHEN** the user views the FIRE dashboard
- **AND** the roadmap has KRs without `value_model_target` fields
- **THEN** the dashboard shows a warning indicating the number of KRs lacking target references

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

### Requirement: Unified Evidence Collection

The system SHALL provide a web UI for collecting evidence through multiple
methods: text paste, guided interview, and reference to imported artifacts.
All methods SHALL produce evidence items in the same format, stored via the
evidence service.

#### Scenario: Text paste
- **WHEN** a user pastes text into the evidence collection interface
- **AND** selects a source_type and tags
- **THEN** an evidence item is created and stored
- **AND** the item appears in the evidence list
- **AND** the item is available to bootstrap skills as context

#### Scenario: Guided interview
- **WHEN** a user starts the guided interview
- **AND** answers questions about vision, market, competition, team
- **THEN** each answer is stored as an evidence item with source_type "interview"
- **AND** the interview skips questions where matching evidence already exists

#### Scenario: Mixed evidence sources
- **WHEN** a user has uploaded a pitch deck AND answered interview questions
- **THEN** both evidence types are available to bootstrap skills
- **AND** the skills use all available evidence for richer drafts

### Requirement: Evidence Sufficiency Assessment

The system SHALL assess whether sufficient evidence exists to draft each READY
artifact. The assessment SHALL be tag-based with deliberately low thresholds to
keep the first cycle lean.

#### Scenario: Sufficient evidence for North Star
- **WHEN** at least 1 evidence item exists tagged with vision, strategy, pitch, or purpose
- **THEN** the North Star is marked as "sufficient evidence"
- **AND** the draft button is enabled with "Draft from evidence" label

#### Scenario: Insufficient evidence
- **WHEN** no evidence items with relevant tags exist for an artifact
- **THEN** the artifact is marked as "insufficient evidence"
- **AND** the draft button is enabled but labeled "Draft with AI" (sparser result)
- **AND** a hint suggests what evidence to add for a better draft

### Requirement: Evidence-Aware Bootstrap Skills

The system SHALL provide bootstrap skills for each READY artifact that read
evidence items as primary context. Skills SHALL degrade gracefully when evidence
is sparse, producing a minimal but schema-valid first draft.

#### Scenario: Rich evidence draft
- **WHEN** multiple evidence items exist with relevant tags
- **AND** the user triggers a bootstrap skill
- **THEN** the skill extracts and structures content from evidence
- **AND** produces a substantive first draft

#### Scenario: Sparse evidence draft
- **WHEN** minimal or no evidence exists
- **AND** the user triggers a bootstrap skill
- **THEN** the skill produces a minimal schema-valid draft
- **AND** the draft contains guidance comments for sections needing human input

#### Scenario: Dependency chain
- **WHEN** draft-foundations is triggered
- **AND** no north_star artifact exists
- **THEN** the system returns an error indicating north_star is required first

### Requirement: Web UI Draft Actions on READY Dashboard

The READY dashboard SHALL display draft action buttons for missing artifacts.
Button state SHALL reflect evidence sufficiency and dependency prerequisites.

#### Scenario: Evidence available
- **WHEN** sufficient evidence exists for north_star AND north_star is missing
- **THEN** the North Star card shows "Draft from evidence" button

#### Scenario: Prerequisite missing
- **WHEN** north_star does not exist
- **THEN** the Foundations card shows a disabled button with "Requires North Star"

#### Scenario: Existing substantive artifact
- **WHEN** an artifact exists with substantive (non-placeholder) content
- **THEN** the draft button shows as "Redraft" with a confirmation warning

### Requirement: READY Phase Readiness Score

The system SHALL compute a readiness score (0-100) for the READY phase. The
score SHALL account for artifact presence, section completeness, placeholder
detection, and schema validation. The score SHALL surface on the READY
dashboard and in the health check response.

#### Scenario: Placeholder-filled instance
- **WHEN** all READY artifacts contain only template placeholder text
- **THEN** the readiness score reflects partial credit

#### Scenario: First version prompt
- **WHEN** readiness score >= 80 AND version count is 0
- **THEN** a "Publish first version" prompt appears on the READY dashboard

### Requirement: Inter-READY Structural Relationships

The system SHALL auto-derive structural relationships between READY artifacts
when both source and target exist. These edges SHALL encode the authoring
dependency chain and be visible to the ripple engine.

#### Scenario: Both artifacts exist
- **WHEN** both north_star and strategy_foundations are committed
- **THEN** a derived_from edge exists from strategy_foundations to north_star

### Requirement: Value Model Activation and Definition Alignment

The system SHALL provide an alignment skill that configures per-instance value
model component states and track definition tiers based on the current strategy
formula and roadmap OKRs. The skill SHALL read canonical templates as structural
input and produce per-instance state/tier updates as output. It SHALL NOT modify
canonical content.

#### Scenario: Bootstrap activation
- **WHEN** a roadmap_recipe has been drafted during bootstrap
- **AND** the user triggers the align-portfolio skill
- **THEN** the skill reads the roadmap OKRs and canonical value model templates
- **AND** sets component states (active, future, non_active) aligned with the roadmap
- **AND** selects relevant track definitions and sets their current_tier
- **AND** stages the updates for human review

#### Scenario: Post-AIM realignment
- **WHEN** the AIM cycle has adapted strategy_formula and roadmap_recipe
- **AND** the align-portfolio skill runs (manually or via cascade)
- **THEN** value model states are updated to reflect the new strategic priorities
- **AND** definition tiers are adjusted if roadmap maturity targets changed

#### Scenario: No roadmap exists
- **WHEN** the align-portfolio skill is triggered
- **AND** no roadmap_recipe artifact exists
- **THEN** the system indicates that a roadmap is required first

### Requirement: First Version Publication Prompt

The READY dashboard SHALL prompt the user to publish their first strategy
version when the readiness score is sufficient and no version exists.

#### Scenario: Ready for first version
- **WHEN** readiness score >= 80 AND version count is 0
- **THEN** a "Publish first version" banner with button appears

### Requirement: Strategy Completeness Watchdog

The system SHALL periodically evaluate all artifact types for staleness, orphan
status, and cross-phase coherence. The watchdog SHALL surface findings on the
AIM dashboard and in the health check response. No artifact type SHALL be
invisible to all automated evaluation systems.

#### Scenario: Stale artifact detected
- **WHEN** a READY artifact has not been updated for longer than its staleness threshold
- **THEN** the watchdog flags it as an informational signal
- **AND** the AIM dashboard shows the artifact in the "Strategy health" card

#### Scenario: Orphan artifact detected
- **WHEN** an artifact has zero inbound AND zero outbound relationship edges
- **THEN** the watchdog flags it as a warning
- **AND** suggests adding relationships or reviewing the artifact

#### Scenario: Cross-phase coherence gap
- **WHEN** a feature exists without a delivered_by_kr relationship
- **OR** a roadmap KR has no delivering features
- **OR** a value model component is active but has no contributes_to sources
- **THEN** the watchdog flags the specific gap with an actionable suggestion

#### Scenario: Watchdog frequency
- **WHEN** the heartbeat ticker runs
- **THEN** the watchdog evaluation runs at the configured interval (default: daily)
- **AND** results are cached until the next run
