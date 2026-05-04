# Capability: strategy-serving

Read-only access to strategy content. These operations derive current state from the committed
mutation ledger and expose it to AI agents, web clients, and MCP consumers.

---

## Requirements

### Requirement: Strategy Context Aggregation

The system SHALL provide aggregated strategy context combining multiple artifact types into
coherent response objects suitable for AI agent consumption.

#### Scenario: Full strategic context
- **WHEN** a caller requests strategic context for an instance
- **THEN** the system returns a combined object containing: vision, mission, product position, top personas, and roadmap summary
- **AND** all fields are derived from the latest committed mutations

#### Scenario: Competitive position
- **WHEN** a caller requests competitive positioning
- **THEN** the system returns the competitive analysis from the strategy_foundations artifact
- **AND** returns HTTP 404 if no strategy_foundations mutation exists

#### Scenario: Strategy health summary
- **WHEN** a caller requests instance health
- **THEN** the system runs EPF health checks (via epf-cli internal packages) against the current committed state
- **AND** returns: validation errors, content readiness issues, completeness score
- **AND** this is a read-only operation — no state is modified

---

### Requirement: Mutation History

The system SHALL expose the mutation history for an instance, enabling change auditing
and rollback analysis.

#### Scenario: List mutations for instance
- **WHEN** a caller lists mutations for an instance
- **THEN** the system returns committed mutations in reverse chronological order
- **AND** staged and discarded mutations are excluded by default
- **AND** cursor-based pagination is used

#### Scenario: Filter mutations by artifact type
- **WHEN** a caller lists mutations filtered by `artifact_type=feature`
- **THEN** only feature mutations are returned

#### Scenario: Get mutation detail
- **WHEN** a caller requests a specific mutation by ID
- **THEN** the full mutation payload (artifact snapshot) is returned
- **AND** this enables point-in-time state reconstruction

---

### Requirement: Semantic Search

The system SHALL expose semantic search over the strategy graph backed by emergent.memory.

#### Scenario: Search strategy content
- **WHEN** a caller queries with a natural-language string
- **THEN** the system proxies the query to the emergent.memory semantic search
- **AND** returns ranked results with artifact type, key, snippet, and relevance score

#### Scenario: Memory unavailable graceful degradation
- **WHEN** the emergent.memory service is unreachable
- **THEN** the system returns HTTP 503 with error code 113001
- **AND** all non-semantic read operations continue to function normally
