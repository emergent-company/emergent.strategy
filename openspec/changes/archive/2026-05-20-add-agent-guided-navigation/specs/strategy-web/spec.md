## ADDED Requirements

### Requirement: Interactive Navigation Graph Visualization
The system SHALL render navigation graphs as interactive 3D visualizations in the web UI using WebGL (Three.js + 3d-force-graph). Groups SHALL be rendered as spatial clusters. Guard state SHALL color nodes green (reachable), red (blocked), or blue (entry point). Portal edges SHALL render as dashed curved arcs between service clusters.

#### Scenario: User views navigation graph
- **WHEN** user navigates to `/workspaces/:id/instances/:id/navigation`
- **THEN** the system renders the navigation graph as a 3D force-directed graph
- **AND** groups appear as visually distinct clusters
- **AND** the entry context is highlighted in blue

#### Scenario: Live guard coloring
- **WHEN** the navigation graph renders with a guard profile resolved from Memory
- **THEN** reachable contexts appear green and blocked contexts appear red
- **AND** hovering a blocked node shows which guard is failing and why

#### Scenario: Persona simulation toggle
- **WHEN** user selects a different persona from the sidebar
- **THEN** the guard profile updates and node coloring changes in real time
- **AND** the reachability count updates (e.g., "Strategist: 25/26 reachable")

#### Scenario: Click-to-navigate
- **WHEN** user clicks a reachable node in the 3D graph
- **THEN** the browser navigates to that screen's URL
- **WHEN** user clicks a blocked node
- **THEN** the system shows a tooltip explaining which guard blocks access and what the user needs to do

#### Scenario: Multi-service composition
- **WHEN** the navigation graph has imports and portal edges
- **THEN** imported service sub-graphs render as separate spatial clusters
- **AND** portal edges render as dashed arcs crossing between clusters

### Requirement: Navigation Graph API Endpoint
The system SHALL expose a JSON API endpoint that returns the full navigation graph with reachability data for the current user.

#### Scenario: Fetch graph with reachability
- **WHEN** client sends `GET /api/workspaces/:id/instances/:id/navigation-graph`
- **THEN** the response includes contexts, transitions, guards, groups, portal edges
- **AND** each context has a `reachable` boolean based on the current user's guard profile

#### Scenario: Fetch graph with persona override
- **WHEN** client sends `GET /api/workspaces/:id/instances/:id/navigation-graph?persona=observer`
- **THEN** the reachability is computed for the specified persona's guard profile instead of the current user's

## MODIFIED Requirements

### Requirement: HTMX Partial Rendering
All strategy-web screens SHALL support both full-page and HTMX partial rendering. The navigation graph visualization page SHALL support full-page rendering only (WebGL canvas is not compatible with HTMX partial swaps). Navigation to/from the graph page SHALL use full-page loads.

#### Scenario: Full page load for graph
- **WHEN** user navigates to the navigation graph page
- **THEN** the server responds with a full HTML page including the WebGL canvas
- **AND** the response does not use `HX-Push-Url` or partial swap headers
