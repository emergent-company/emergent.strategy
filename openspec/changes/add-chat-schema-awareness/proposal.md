# Add Chat Schema Awareness

This proposal enhances the chat system with schema awareness and structured query capabilities, allowing it to understand the database structure and perform precise object lookups and filtering.

## Change ID

`add-chat-schema-awareness`

## Background

Currently, the chat system relies on `UnifiedSearchService` which performs hybrid (vector + lexical) search. While effective for natural language queries, it lacks the ability to:

1.  Understand the specific schema (properties) of objects in the database.
2.  Perform precise structured filtering (e.g., "find tasks where status is 'Done'").
3.  Explicitly target database fields for full-text search without vector/semantic fuzziness.

The user wants to bridge this gap by providing the chat with schema context and explicit tools for structured and full-text querying.

## Scope

1.  **Schema Tool**: A new tool to retrieve the list of object types and their JSON schemas.
2.  **Object Query Tool**: A new tool to perform structured searches with property filtering, full-text search, and pagination.
3.  **Backend Support**: Updates to `GraphService` to support property-based filtering in object queries.

## Capabilities

- `get_database_schema`: Allows the agent to discover available object types and their properties.
- `query_graph_objects`: Allows the agent to find objects by type, FTS query, and specific property values.
