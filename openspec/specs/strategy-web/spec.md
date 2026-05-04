# Capability: strategy-web

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
