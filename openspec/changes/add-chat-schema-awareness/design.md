# Design: Chat Schema Awareness

## Problem

The chat agent acts as a black box regarding the database schema. Users cannot rely on it to understand what kind of objects exist or to perform structured queries. `UnifiedSearch` is too broad and imprecise for specific data retrieval tasks.

## Solution

### 1. Schema Awareness (`get_database_schema`)

We will introduce a tool that leverages `TypeRegistryService.getProjectTypes` to expose the current schema to the LLM.

- **Input:** None (uses current project context).
- **Output:** List of object types, their descriptions, and simplified property schemas (to save context window).

### 2. Structured Querying (`query_graph_objects`)

We will introduce a tool that leverages `GraphService` to perform precise queries.

- **Input:**
  - `type` (optional): Filter by object type.
  - `query` (optional): Full-text search string (matches `fts` column).
  - `properties` (optional): Key-value pairs for matching. Supports a subset of MongoDB Query Language (MQL):
    - Exact match: `{"status": "Done"}`
    - Comparisons: `{"rating": {"$gt": 3}}` (Operators: `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`)
    - Logic: Implicit AND at top level.
  - `related_to_id` (optional): Filter objects that have a direct relationship with this ID.
  - `limit` (optional): Max results (default 20).
- **Output:** List of graph objects with their properties.

### 3. Backend Changes

`GraphService.searchObjects` needs to be updated (or a new method added) to support generic property filtering.

**SQL Approach for Property Filtering:**
We will implement a lightweight MQL-to-SQL transpiler in `GraphService` that converts JSON query operators into Postgres JSONB queries.

- **Equality:** `properties->>'key' = 'value'`
- **Comparison ($gt):** `(properties->>'key')::numeric > value` (requires safe casting)
- **In List ($in):** `properties->>'key' IN ('val1', 'val2')`
- **Relationships:** `EXISTS (SELECT 1 FROM kb.graph_relationships r WHERE (r.src_id = o.id AND r.dst_id = $relatedId) OR (r.dst_id = o.id AND r.src_id = $relatedId))`

## Integration

The tools will be added to `ChatSdkModule` (and accessible via `LangGraphService` or `ChatSdkService`).
We will use the existing `DynamicStructuredTool` pattern used in `chat-search.tool.ts`.
