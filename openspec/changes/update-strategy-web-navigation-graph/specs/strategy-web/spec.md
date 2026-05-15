## ADDED Requirements

### Requirement: Navigation Graph as Topology Source

The web UI topology SHALL be derived from the EPF navigation graph artifact (`FIRE/navigation_graph.yaml`). The navigation graph is the authoritative definition of interaction contexts, transitions, guards, and groups. The web UI implements this topology — it does not define it independently.

The flat markdown table previously in this spec is superseded by the navigation graph artifact.

Implementation-specific details (URL patterns, HTTP methods, template paths) SHALL be stored in context `properties` within the navigation graph, keeping the strategic topology and implementation mapping in one artifact.

#### Scenario: Navigation graph drives screen inventory

- **WHEN** a developer needs to know what screens the platform has
- **THEN** they consult `FIRE/navigation_graph.yaml` (26 contexts across 8 groups)
- **AND** each context's `properties.url` provides the URL pattern
- **AND** the graph's structural validation confirms the topology is sound

#### Scenario: New screen requires graph update

- **WHEN** a new screen is added to the web UI
- **THEN** a corresponding context MUST be added to the navigation graph
- **AND** transitions to/from the new context MUST be defined
- **AND** structural validation MUST pass after the addition

---

### Requirement: Persona-Based Reachability

The web UI SHALL enforce guard-aware navigation. Different personas reach different subsets of the interaction surface based on the navigation graph's guard model.

The platform defines three persona profiles:

| Persona | Guards Satisfied | Expected Reachable Contexts |
|---------|-----------------|---------------------------|
| Strategist | authenticated, instance-active, can-write, memory-connected | All 26 contexts (full access) |
| Operator | authenticated, instance-active, can-write | ~18 contexts (no semantic analysis or scenarios) |
| Observer | authenticated, instance-active | ~14 contexts (read-only strategy, no edits, no semantic tools) |

#### Scenario: Strategist has full access

- **WHEN** a strategist (all guards satisfied) navigates the platform
- **THEN** they can reach all interaction contexts including edit screens, semantic search, contradictions, scenarios, and staging review

#### Scenario: Observer is blocked from editing

- **WHEN** an observer (no can-write guard) views the vision screen
- **AND** attempts to navigate to edit-vision
- **THEN** the edit transition is unavailable (guard blocks)
- **AND** the UI does not render the edit action

#### Scenario: Semantic tools require memory connection

- **WHEN** a user without memory-connected guard views the instance dashboard
- **THEN** the Analysis group (semantic search, contradictions, quality audit) is hidden or disabled
- **AND** the Scenarios group is hidden or disabled

---

### Requirement: Guard-Aware Navigation Rendering

The web UI SHALL render navigation elements (sidebar, menus, action buttons) based on the current user's guard profile evaluated against the navigation graph.

- Transitions whose guards are not satisfied SHALL NOT be rendered as clickable links
- Groups whose visibility_guard is not satisfied SHALL NOT appear in the sidebar
- Menu items whose transition is guarded SHALL be hidden or rendered as disabled

#### Scenario: Sidebar reflects guard profile

- **WHEN** the sidebar renders for an observer (no can-write, no memory-connected)
- **THEN** the "Authoring" group is hidden (visibility_guard: can-write)
- **AND** the "Analysis" group is hidden (visibility_guard: memory-connected)
- **AND** the "Scenarios" group is hidden (visibility_guard: memory-connected)

#### Scenario: Action buttons respect guards

- **WHEN** the features list renders for an observer
- **THEN** the "Create new feature" button is hidden (guard: can-write)
- **AND** the feature list itself is fully visible (read access)

---

### Requirement: Journey Scenario Validation

All primary user journey scenarios defined in `strategy-scenarios/spec.md` SHALL be expressible as journey runs against the navigation graph and SHALL pass validation.

This ensures the topology consistently supports every documented user journey. Journey scenarios are verifiable properties of the graph — if a scenario fails, the graph or the scenario definition has a structural issue.

#### Scenario: Strategy scenarios pass as journey runs

- **WHEN** the 9 primary strategy scenarios are translated to journey runs (transition sequences + guard profiles)
- **AND** executed against `FIRE/navigation_graph.yaml` using the graph state machine runner
- **THEN** all passing scenarios succeed (correct final state)
- **AND** intentionally-blocked scenarios fail at the expected guard

#### Scenario: Graph change breaks scenario

- **WHEN** a navigation graph change removes a transition used by a documented journey scenario
- **AND** the scenario is re-executed against the updated graph
- **THEN** the scenario fails, identifying the broken step
- **AND** the developer must either restore the transition or update the scenario
