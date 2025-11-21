# Chat Schema Awareness Spec

## ADDED Requirements

### Requirement: Database Schema Tool

The system MUST provide a `get_database_schema` tool to the Chat Agent.

- **Input:** None (context derived).
- **Output:** A JSON list of object types available in the current project, including their description and simplified property schema.

#### Scenario: Agent discovers available types

- **Given** the user asks "What kind of data is stored here?"
- **When** the agent calls `get_database_schema`
- **Then** it receives a list of types like `Task`, `Decision`, `Person` with their schemas
- **And** the agent can explain the data model to the user.

### Requirement: Structured Object Query Tool

The system MUST provide a `query_graph_objects` tool to the Chat Agent.

- **Input:**
  - `type` (optional string): Filter by object type.
  - `query` (optional string): Full-text search query.
  - `properties` (optional object): Property filters supporting a subset of MongoDB Query Language (MQL).
    - Direct values for equality: `{"status": "Done"}`
    - Operator objects: `{"priority": {"$gt": 5}}` (Supported: `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`).
  - `related_to_id` (optional string): Filter objects directly connected to this ID (in either direction).
  - `limit` (optional number): Max results (default 20).
- **Output:** A JSON list of matching graph objects with their properties.

#### Scenario: Agent finds specific objects

- **Given** the user asks "Find all Tasks with status 'Done'"
- **When** the agent calls `query_graph_objects` with `type="Task"` and `properties={"status": "Done"}`
- **Then** the system returns only Task objects where `properties->>'status' == 'Done'`.

#### Scenario: Agent filters by comparison

- **Given** the user asks "Find items with priority greater than 5"
- **When** the agent calls `query_graph_objects` with `properties={"priority": {"$gt": 5}}`
- **Then** the system returns objects where `properties->>'priority'` cast to number is > 5.

#### Scenario: Agent filters by list membership

- **Given** the user asks "Find items with status 'Open' or 'In Progress'"
- **When** the agent calls `query_graph_objects` with `properties={"status": {"$in": ["Open", "In Progress"]}}`
- **Then** the system returns objects where `properties->>'status'` is either 'Open' or 'In Progress'.

#### Scenario: Agent filters by relationship

- **Given** the user asks "Find all documents related to project X (id: 123)"
- **When** the agent calls `query_graph_objects` with `type="Document"` and `related_to_id="123"`
- **Then** the system returns Document objects that have an edge to/from ID "123".

### Requirement: Property Filtering in Graph Service

The `GraphService.searchObjects` method MUST support filtering by specific property values and relationships using MQL-subset logic.

- It MUST support equality checks for JSON properties.
- It MUST support comparison operators (`$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`) for JSON properties.
- It MUST attempt numeric casting for inequality operators ($gt, $lt, etc) when the value is a number.
- It MUST support filtering by `related_to_id` by checking `graph_relationships`.

#### Scenario: Service filters by comparison

- **Given** a search request with `properties: { "score": { "$gte": 0.9 } }`
- **When** `searchObjects` is executed
- **Then** the SQL query filters where `(properties->>'score')::numeric >= 0.9`.

#### Scenario: Service filters by relationship

- **Given** a search request with `related_to_id: "abc-123"`
- **When** `searchObjects` is executed
- **Then** the SQL query joins/checks `graph_relationships` to ensure returned objects are connected to "abc-123".
