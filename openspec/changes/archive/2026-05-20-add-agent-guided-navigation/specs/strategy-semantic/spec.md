## ADDED Requirements

### Requirement: Memory-Bound Guard Resolution
The system SHALL resolve navigation graph guards against live Memory state. A `GuardResolver` service SHALL map guard IDs to Memory queries and produce a `navigation.GuardProfile` dynamically. When Memory is unavailable, the system SHALL fall back to a configurable static default profile.

#### Scenario: Guard resolved from Memory
- **WHEN** the navigation graph has a guard `share-classes` on a transition
- **AND** Memory contains share class objects for the current company
- **THEN** the guard resolver returns `share-classes: true` in the profile

#### Scenario: Guard fails from Memory
- **WHEN** the navigation graph has a guard `shares-exist`
- **AND** Memory contains no share objects for the current company
- **THEN** the guard resolver returns `shares-exist: false` in the profile
- **AND** the guard's fallback context and message are available to the agent

#### Scenario: Memory unavailable fallback
- **WHEN** the Memory service is unreachable
- **THEN** the guard resolver returns a static default profile
- **AND** the system logs a warning but does not error

### Requirement: Journey Recording
The system SHALL record user navigation traversals as Memory journal entries. Each traversal SHALL include the source context, target context, transition ID, user ID, entity ID, and a snapshot of the active guard profile.

#### Scenario: Traversal recorded
- **WHEN** user navigates from `company-dashboard` to `cap-table` via transition `detail-captable`
- **THEN** a journal entry is written to Memory with type `navigation_traversal`
- **AND** the entry includes `from_context: company-dashboard`, `to_context: cap-table`, `transition_id: detail-captable`

#### Scenario: Traversal history queryable
- **WHEN** an agent queries Memory journal for `navigation_traversal` entries
- **THEN** the agent can see which paths the user has taken, how often, and when

### Requirement: Combined Semantic and Topological Queries
The system SHALL provide queries that combine Memory semantic search with navigation graph reachability analysis. Results SHALL include both the matched knowledge objects and the navigation paths to reach them.

#### Scenario: Reachable knowledge search
- **WHEN** agent calls `strategy_reachable_knowledge` with query `compliance` and a guard profile
- **THEN** the response includes Memory objects matching `compliance`
- **AND** each result includes the navigation context where the object is actionable
- **AND** each result includes whether that context is reachable under the current guard profile
- **AND** if reachable, the shortest path from the current context is included
