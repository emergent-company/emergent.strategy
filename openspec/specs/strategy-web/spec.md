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
