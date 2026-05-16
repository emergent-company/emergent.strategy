## ADDED Requirements

### Requirement: HTMX Web UI — Phase 3 Rendering Layer
The strategy-server SHALL provide a server-rendered HTMX web UI built with `a-h/templ` and
`emergent-company/go-daisy`. The web UI SHALL contain zero business logic — all operations
call the same domain services as the MCP tools. Every screen SHALL have both a full-page
render path and an HTMX partial render path.

#### Scenario: Full page vs HTMX partial
- **WHEN** a screen URL is accessed without the `HX-Request` header
- **THEN** the full page (shell + content) is returned
- **WHEN** the same URL is accessed with `HX-Request: true`
- **THEN** only the content partial is returned (no shell, no navigation)

#### Scenario: No business logic in handlers
- **WHEN** any web handler is read
- **THEN** it contains only: load request data, call domain service, render template
- **AND** no computation, validation, or domain rule enforcement occurs in the handler

### Requirement: Navigation Graph as Single Source of Truth
All screens SHALL be defined in `internal/navigation/graph.go` before any handler is written.
No screen SHALL be registered in `routes.go` unless it appears in the navigation graph.
The navigation graph SHALL include: URL pattern, HTTP method(s), screen name, parent screen,
sidebar group, tab group, company/workspace scope, and data hints.

#### Scenario: Route matches navigation graph
- **WHEN** `routes.go` registers a route
- **THEN** a corresponding entry exists in `navigation/graph.go`
- **AND** a test enforces this invariant

### Requirement: Mobile-Responsive from Day One
All templates SHALL follow the mobile-responsive rules from CONSTITUTION.md section 16.
No template SHALL use bare `<table>` without scroll wrapper, fixed column counts without
mobile fallback, or fixed-width inline styles. The Tailwind build SHALL scan `internal/ui/`
for all responsive classes.

#### Scenario: Table scroll wrapper enforced
- **WHEN** a table component is rendered
- **THEN** the HTML contains `<div class="overflow-x-auto rounded-box">` wrapping the `<table>` element

#### Scenario: Tailwind responsive classes are effective
- **WHEN** `curl /static/css/app.css | grep "md:hidden"` is run
- **THEN** the output contains a match (class is not tree-shaken)

### Requirement: Internationalisation from Day One
All user-facing strings in templates SHALL use `T(ctx, "key")` from `internal/langs`.
The `locale.toml` SHALL have at minimum English (`en`) and Norwegian (`nb`) sections for
all keys. No hardcoded English strings SHALL appear in template files.

#### Scenario: Template uses T(ctx, key)
- **WHEN** any templ file in `internal/ui/` is read
- **THEN** all user-visible strings use `T(ctx, "nav.dashboard")` style calls
- **AND** no Go string literals appear directly in visible text positions

#### Scenario: Language detected from Accept-Language
- **WHEN** a request is made with `Accept-Language: nb`
- **THEN** all UI strings are rendered in Norwegian

### Requirement: Post-Redirect-Get on Form Submission
Form submissions that succeed SHALL always redirect to the canonical GET URL.
Form submissions that fail SHALL re-render the form with all submitted values preserved
and error messages shown inline. No content SHALL be rendered directly on a POST response.

#### Scenario: Successful form submission redirects
- **WHEN** a valid feature update form is submitted via POST
- **THEN** the response is `303 See Other` to the feature detail URL
- **AND** a flash message confirms the action

#### Scenario: Failed form submission preserves values
- **WHEN** an invalid feature update form is submitted (e.g. empty required field)
- **THEN** the form is re-rendered with all submitted values intact
- **AND** an error message is shown next to the invalid field
- **AND** the response status is `422 Unprocessable Entity`

### Requirement: AI Chat Panel (Phase 4)
The web UI SHALL include a persistent collapsible chat panel available on all
workspace-scoped screens. The panel SHALL be context-aware (current screen, data hints),
restrict tools to the current screen's allowed set, and route write operations through
the staging/commit flow. Responses SHALL stream token-by-token.

#### Scenario: Chat panel available on workspace screens
- **WHEN** a workspace-scoped screen is loaded
- **THEN** the chat panel toggle is visible in the UI

#### Scenario: Write operation goes through staging
- **WHEN** the AI performs a write operation via the chat panel
- **THEN** a staging batch preview is shown in the chat panel
- **AND** no data is changed until the user clicks Confirm

#### Scenario: Response streams token-by-token
- **WHEN** the AI is generating a response
- **THEN** tokens appear progressively in the chat panel as they are generated
- **AND** the user is not blocked waiting for the full response
