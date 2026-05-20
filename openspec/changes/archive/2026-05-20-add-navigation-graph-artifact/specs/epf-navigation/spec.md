## ADDED Requirements

### Requirement: Navigation Graph Schema

The system SHALL define a `navigation_graph` artifact type in the FIRE phase with a JSON Schema (`navigation_graph_schema.json`) that captures user journey topology at the strategic level.

The navigation graph models the **topology of interaction contexts** — the meaningful places a user can be and how they move between them. It is medium-agnostic: an interaction context could manifest as a web page, a CLI view, a mobile screen, a modal dialog, a notification landing, or a physical interface. The graph defines the strategic structure; implementations map contexts to their medium.

The schema SHALL support the following top-level sections:

**Contexts** — Named nodes representing meaningful places a user can be:

- `id` (required): Stable string identifier, unique within the graph
- `title` (required): Human-readable name for the context
- `description`: What the user accomplishes in this context
- `parent`: Parent context ID for hierarchical structure (breadcrumb chains, back-navigation, section nesting)
- `group`: Reference to a group ID (logical section assignment)
- `category`: Semantic domain classification (e.g., "operations", "reporting", "governance", "setup")
- `mode`: Presentation mode — the structural role this context plays. Values: `default`, `landing`, `detail`, `modal`, `embedded`
- `scoped`: Boolean — whether this context operates within a parent entity (e.g., a company-scoped context vs a global context)
- `data_requirements`: List of data this context needs, each with `type` (what data category) and `qualifier` (refinement, e.g., "current", "all", "active")
- `implementation_hints`: Strategic guidance for implementation — not prescriptive technology choices, but characteristics and considerations that inform implementation direction (e.g., "high-data-density with real-time updates", "requires offline capability", "privacy-sensitive — must support data residency", "computation-heavy — consider server-side rendering"). These are strategic signals, not architecture decisions.
- `properties`: Open map for product-specific metadata that implementations may need (medium-specific fields like URL patterns, icons, HTTP methods belong here, not in the core schema)

**Transitions** — Directed edges between contexts:

- `id` (required): Unique transition identifier
- `from` (required): Source context ID
- `to` (required): Target context ID
- `label`: Human-readable description of the path
- `guard`: Guard ID reference (empty = always allowed)
- `category`: Transition intent classification (e.g., "navigation", "action", "drill-down")

**Guards** — Named preconditions that govern transition access:

- `id` (required): Unique guard identifier
- `description` (required): What this guard checks, in strategic terms
- `type`: Guard classification (e.g., "entity-state", "role", "tier", "domain-rule")
- `fallback`: Context ID to redirect to when guard fails
- `message`: Explanation shown when guard blocks access
- `guard_group`: Optional grouping for guards that collectively define a domain mode (e.g., guards that together mean "requires shareholder registry")

**Groups** — Logical groupings of contexts:

- `id` (required): Unique group identifier
- `title` (required): Display title
- `order`: Display order (integer)
- `visibility_guard`: Guard ID — group is only relevant when this guard passes

**Menus** — Context-specific action sets:

- `context`: Context ID where actions are available
- `title`: Menu title
- `items`: List of available actions, each with `transition_id` (reference), `label`, and `description`

#### Scenario: Strategic navigation graph passes validation

- **WHEN** a navigation graph YAML defines contexts, transitions, guards, and groups at the strategic level
- **AND** no medium-specific implementation details are required
- **THEN** schema validation passes with zero errors

#### Scenario: Implementation-rich graph passes validation

- **WHEN** a navigation graph YAML includes product-specific `properties` on contexts (e.g., URL patterns, icons, HTTP methods)
- **THEN** schema validation passes — the `properties` map accepts arbitrary implementation metadata

#### Scenario: Missing required fields are caught

- **WHEN** a navigation graph file omits required fields (e.g., context without ID or title)
- **THEN** validation reports the missing fields with actionable fix hints

---

### Requirement: Artifact Type Detection for Navigation Graphs

The system SHALL detect `navigation_graph` as an artifact type from file path patterns matching `FIRE/navigation_graph.yaml`, `FIRE/*_navigation.yaml`, or `FIRE/navigation/*.yaml`.

The system SHALL map the detected type to `navigation_graph_schema.json` for validation.

#### Scenario: Navigation graph file is auto-detected

- **WHEN** a user runs `epf-cli validate FIRE/navigation_graph.yaml`
- **THEN** the CLI detects the artifact type as `navigation_graph`
- **AND** validates against `navigation_graph_schema.json`

---

### Requirement: Graph Structural Validation

The system SHALL validate the structural integrity of navigation graphs beyond schema conformance.

Structural validations SHALL include:

- **Reachability:** Every context MUST be reachable from at least one designated entry point via transitions and parent chains
- **No orphan contexts:** Every context MUST participate in at least one transition (as source or target) or have a parent reference
- **Unique IDs:** All context IDs, transition IDs, guard IDs, and group IDs MUST be unique within the graph
- **Guard consistency:** Every guard referenced in a transition or group visibility MUST be defined in the guards section
- **Landing contexts:** Every group MUST have exactly one context with mode `landing`
- **Transition integrity:** Every transition source and target MUST reference a defined context ID
- **No circular parent chains:** Following the parent chain from any context MUST NOT loop back to itself
- **Scoped context ancestry:** Every scoped context MUST have a scoped ancestor in its parent chain
- **Menu integrity:** Every menu item's `transition_id` MUST reference a defined transition

#### Scenario: Orphan context detected

- **WHEN** a navigation graph contains a context with no transitions and no parent
- **THEN** validation reports an error identifying the orphan context

#### Scenario: Undefined guard reference detected

- **WHEN** a transition references a guard ID that is not defined in the guards section
- **THEN** validation reports an error with the undefined guard ID and the transition that references it

#### Scenario: Circular parent chain detected

- **WHEN** a context's parent chain forms a cycle (A -> B -> C -> A)
- **THEN** validation reports an error listing the cycle

#### Scenario: Duplicate landing in a group

- **WHEN** a group has two contexts with mode `landing`
- **THEN** validation reports an error requiring exactly one landing per group

---

### Requirement: Navigation Graph MCP Tools

The system SHALL expose MCP tools for querying and analyzing navigation graphs.

The following tools SHALL be provided:

- **`epf_journey_search`:** Search interaction contexts by keyword, title, category, or group. Returns matching contexts with their group, mode, and available transitions.
- **`epf_journey_reachability`:** Given a source context and optional guard profile (which guards or guard groups pass), return all reachable contexts and the paths to reach them, respecting guard constraints.
- **`epf_journey_path`:** Compute the shortest path between two contexts, listing each step, the transition taken, and any guards that must be satisfied.
- **`epf_journey_guards`:** Given a context, explain which guards affect access — both inbound transition guards and group visibility guards — and what conditions would need to change.
- **`epf_journey_run`:** Execute a scripted journey scenario (a sequence of transitions with a guard profile) and return the result — pass, fail (with blocking guard and step), or unreachable.

#### Scenario: AI agent finds a context by keyword

- **WHEN** an AI agent calls `epf_journey_search` with query "waterfall"
- **THEN** the tool returns matching contexts with group, mode, and available outbound transitions

#### Scenario: AI agent computes reachable contexts for a domain mode

- **WHEN** an AI agent calls `epf_journey_reachability` with source "Dashboard" and guard profile `{guard_groups: ["shareholder-registry"]}`
- **THEN** the tool returns all contexts reachable under those constraints
- **AND** annotates blocked paths with the guard that prevents access

---

### Requirement: Graph State Machine Runner

The system SHALL provide a general-purpose state machine runner that can load and execute any EPF graph artifact — including navigation graphs and workflow definitions — as a live, traversable state machine.

The runner executes the **strategic specification**, not the implementation. Its purpose is to verify that the defined customer journey topology is internally sound, that intended journeys are possible, and that guard models produce the expected access patterns — all within EPF tooling, independent of any implementation.

The runner SHALL maintain:

- **Current state:** The active context (node) in the graph
- **Guard profile:** A set of guards and guard groups that are satisfied, representing a simulated user type or entity state
- **Traversal history:** An ordered log of states visited and transitions taken, with timestamps
- **Available transitions:** The set of outbound transitions from the current state, each annotated with whether its guard passes under the active profile

The runner SHALL support two execution modes:

- **Interactive mode** (`epf-cli journey walk`): A TUI where the strategy author explores the defined journey topology step by step — choosing transitions, toggling guards in the profile, and observing how the reachable surface changes. This verifies that the specification consistently describes a coherent desired end state.
- **Scripted mode** (`epf-cli journey run`): Execute a predefined customer journey scenario (a sequence of transitions + guard profile + expected outcome) against the graph and report the result — pass, fail (guard blocked at step N), or unreachable. Journey scenarios are verifiable properties of the specification — assertions about what the desired end state should allow.

The runner SHALL be graph-type agnostic. It operates on nodes, edges, and guards — the same engine runs navigation graphs (interaction contexts + journey transitions) and workflow graphs (entity states + lifecycle transitions). The graph artifact provides the topology; the runner provides the execution.

#### Scenario: Interactive exploration of a navigation graph

- **WHEN** a user runs `epf-cli journey walk ./instance`
- **THEN** the runner loads the navigation graph and starts at the entry context
- **AND** displays the current context, available transitions, and guard status
- **AND** the user chooses transitions to traverse the graph interactively

#### Scenario: Guard blocks a transition during walk

- **WHEN** the user attempts a transition whose guard is not in the active profile
- **THEN** the runner explains which guard blocked it, its description, and the fallback context if defined
- **AND** the user can toggle the guard in their profile and retry

#### Scenario: Scripted customer journey test passes

- **WHEN** a journey scenario defines: start at "Dashboard", follow "navigate-to-captable", follow "issue-shares"
- **AND** the guard profile includes `["company-exists", "shares-allowed", "share-classes"]`
- **THEN** the runner executes all transitions successfully and reports pass

#### Scenario: Scripted customer journey test fails on guard

- **WHEN** a journey scenario defines a path that requires "premium-tier"
- **AND** the guard profile does not include "premium-tier"
- **THEN** the runner reports failure at the blocked transition, identifying the guard and the step number

#### Scenario: Runner executes a workflow graph

- **WHEN** an EPF workflow artifact (entity lifecycle) is loaded into the runner
- **AND** a scenario defines: start at "draft", follow "submit", follow "approve"
- **THEN** the runner traverses the workflow states and reports the result using the same engine as navigation graphs

---

### Requirement: Multi-Service Graph Composition

The system SHALL support composing multiple navigation sub-graphs into a product-wide topology.

Composition SHALL support:

- **Portal edges:** Transitions that cross service boundaries, declared in either or both sub-graphs. Portal targets use `service:context-id` notation.
- **Shared groups:** Groups that span services (e.g., a top-level section containing contexts from multiple services)
- **Graph imports:** A product-level graph declares imports referencing service sub-graph files
- **Validation across boundaries:** Portal edge targets MUST resolve to a context defined in the target service's sub-graph

#### Scenario: Two service graphs compose into a product graph

- **WHEN** a product EPF instance declares a navigation graph that imports sub-graphs from two services
- **AND** portal edges connect contexts across the sub-graphs
- **THEN** the composed graph validates as a single connected topology
- **AND** reachability analysis works across service boundaries

---

### Requirement: Semantic Engine Integration

The system SHALL decompose navigation graph artifacts into graph objects in emergent.memory when the semantic engine is configured.

Decomposition SHALL produce:

- **InteractionContext** objects with properties: title, description, group, category, mode, scoped
- **NavigationTransition** relationships between InteractionContext objects with properties: label, guard, category
- **NavigationGuard** objects with properties: description, type, guard group

This enables semantic search ("find contexts related to reporting"), impact analysis ("if we remove this guard, which paths open up?"), and journey-aware AI agents.

#### Scenario: Navigation graph ingested into semantic graph

- **WHEN** `epf-cli ingest` processes an instance with a navigation graph
- **THEN** each interaction context becomes an InteractionContext graph object
- **AND** each transition becomes a NavigationTransition relationship
- **AND** semantic search for "cap table" returns the relevant interaction context
