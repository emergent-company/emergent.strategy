## ADDED Requirements

### Requirement: Agent Navigation Tools
The strategy-server MCP server SHALL expose navigation-aware tools that combine navigation graph topology with Memory context for AI agent guidance.

#### Scenario: Navigate-to with guard explanation
- **WHEN** agent calls `strategy_navigate_to` with target `rf1086` and current context `company-dashboard`
- **THEN** the response includes the shortest path (if reachable)
- **AND** for each transition in the path, the guard status is included (pass/fail with reason from Memory)
- **AND** if the target is unreachable, the response explains which guard blocks access and what the user needs to do

#### Scenario: Suggest next steps
- **WHEN** agent calls `strategy_suggest_next` with current context `cap-table` and entity ID
- **THEN** the response includes all available transitions from `cap-table`
- **AND** each transition is annotated with guard status (resolved from Memory)
- **AND** the agent receives strategic context from Memory about what the user has done and what remains

#### Scenario: Reachable knowledge search
- **WHEN** agent calls `strategy_reachable_knowledge` with query `tax reporting` and current context
- **THEN** the response combines Memory search results with navigation reachability
- **AND** each result includes the context where it's actionable and whether it's currently reachable

### Requirement: Agent Journey Orchestration
The strategy-server MCP server SHALL expose a tool for the AI agent to execute and record multi-step navigation journeys on behalf of the user.

#### Scenario: Agent-guided journey
- **WHEN** agent calls `strategy_run_journey` with a goal description (e.g., "file RF-1086 tax report")
- **THEN** the system resolves the target context from the goal
- **AND** computes the path from the current context with live guard resolution
- **AND** returns step-by-step guidance including what data needs to be prepared at each step

#### Scenario: Journey recording
- **WHEN** a journey completes (all steps traversed successfully)
- **THEN** the full journey is recorded as a Memory journal entry
- **AND** the entry includes the goal, steps taken, guards evaluated, and outcome
