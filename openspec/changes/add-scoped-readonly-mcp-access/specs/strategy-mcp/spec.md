## ADDED Requirements

### Requirement: Read-Only Enforcement at the Tool Call Boundary

The system SHALL enforce read-only access at a single `tools/call` chokepoint,
so that a read-only principal cannot invoke any mutating tool regardless of
which tool categories are active or how the tool was discovered.

Tools SHALL be classified on what they mutate, not on their name. The
classification SHALL distinguish three kinds:

- `read` — returns data, mutates nothing.
- `session` — mutates only per-connection state that cannot outlive the session
  and touches no tenant data (for example `set_tool_filter`, which shapes the
  caller's own `tools/list` view).
- `write` — mutates persisted tenant data.

Enforcement SHALL be deny-by-default: a tool not explicitly classified SHALL be
treated as a `write`. Read-only principals SHALL be permitted `read` and
`session` tools and denied `write` tools.

#### Scenario: Read-only principal calls a write tool
- **WHEN** a principal with read-only scope calls `create_feature`
- **THEN** the call is denied with a forbidden error before the handler executes
- **AND** no mutation or staged batch is created

#### Scenario: Read-only principal calls a read tool
- **WHEN** a principal with read-only scope calls `get_product_vision` for a granted instance
- **THEN** the call succeeds

#### Scenario: Unclassified tools are denied
- **WHEN** a tool is registered but absent from the classification registry
- **AND** a read-only principal calls it
- **THEN** the call is denied

#### Scenario: Session-scoped tools remain available to read-only principals
- **WHEN** a read-only principal calls `set_tool_filter`, `list_tool_categories`, or `get_agent_for_task`
- **THEN** the call succeeds
- **AND** the classification is `session`, not `write`, because the tool mutates only the caller's own view and no tenant data

#### Scenario: Name prefix does not determine classification
- **WHEN** a tool's name begins with a mutating verb such as `set_` but it touches no tenant data
- **THEN** it is classified `session` and permitted
- **AND** classification is decided by what the tool mutates, never by its name

#### Scenario: Classification coverage is enforced at build time
- **WHEN** the test suite runs
- **THEN** a test asserts every registered tool name appears in the classification registry
- **AND** the test fails if a tool is registered without a classification

#### Scenario: Tool filter is not an authorisation boundary
- **WHEN** a read-only principal calls a write tool whose category is not active
- **THEN** the call is denied by the write gate
- **AND** the denial does not depend on the tool being hidden from `tools/list`

#### Scenario: Staged writes are gated
- **WHEN** a read-only principal calls `stage_artifact`, `commit_batch`, or `discard_batch`
- **THEN** the call is denied

#### Scenario: Full-access principals are unaffected
- **WHEN** a principal with write permission on the target instance calls a write tool
- **THEN** the call proceeds to the handler unchanged

#### Scenario: Denial is a protocol-level error result
- **WHEN** any call is denied by the write gate
- **THEN** the client receives a structured MCP error result, not a raw Go error
- **AND** the message names the required permission

---

### Requirement: Tenant Isolation on Instance-Scoped Tools

Every MCP tool accepting an `instance_id` argument SHALL verify the caller's
access to that instance before returning data or performing work. The argument
SHALL be treated as untrusted client input.

#### Scenario: Cross-tenant read denied
- **WHEN** an authenticated user calls `get_product_vision` with an instance UUID belonging to an org they do not belong to
- **THEN** the system returns a forbidden error
- **AND** no artifact content is returned

#### Scenario: Previously unchecked tools now verify access
- **WHEN** any tool in the version, work package, pack, or phase2c tool groups is called with an instance the caller cannot access
- **THEN** the system returns a forbidden error

#### Scenario: Semantic search is scoped
- **WHEN** a caller invokes `search_strategy` for an instance they cannot access
- **THEN** the system returns a forbidden error before issuing any query to the semantic backend

#### Scenario: Coverage is enforced by test
- **WHEN** the test suite runs
- **THEN** a test enumerates every registered tool declaring a required `instance_id` parameter
- **AND** fails for any such tool that does not perform an access check

#### Scenario: Error does not leak existence
- **WHEN** a caller requests an instance that does not exist, and one that exists but is inaccessible
- **THEN** both return the same forbidden error shape, so the response does not disclose which instances exist

## MODIFIED Requirements

### Requirement: Auth on MCP Endpoint

The system SHALL protect the MCP endpoint with the same auth middleware as the
REST API, accepting either a Zitadel session token or an access token.

#### Scenario: Unauthenticated MCP request rejected in prod
- **WHEN** `AUTH_ENABLED=true` and an MCP request arrives without a valid session
- **THEN** the server returns HTTP 401 before routing to any tool handler

#### Scenario: Access token authenticates an MCP request
- **WHEN** an MCP request presents a valid, unexpired, unrevoked access token
- **THEN** the request is authenticated
- **AND** the resulting Principal carries the token's grants and read-only flag

#### Scenario: Audit source set for MCP
- **WHEN** any MCP tool call creates a mutation
- **THEN** `source='mcp'` is recorded in the mutation and audit log

#### Scenario: Token-authenticated calls are distinguishable in the audit log
- **WHEN** an MCP call is authenticated by an access token
- **THEN** the audit entry records the token id alongside the acting user id
