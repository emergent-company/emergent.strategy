# Graph Traversal Guide

## Overview

The graph traversal API provides sophisticated breadth-first search (BFS) capabilities for exploring connected graph structures. This guide covers the advanced features introduced in Phase 3 Priority #3.

## Table of Contents

- [Basic Traversal](#basic-traversal)
- [Phase 3 Features](#phase-3-features)
  - [Phased Traversal](#phased-traversal)
  - [Property Predicate Filtering](#property-predicate-filtering)
  - [Path Enumeration](#path-enumeration)
- [Combined Usage](#combined-usage)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)

## Basic Traversal

The fundamental traversal operation starts from one or more root nodes and explores connected nodes up to a specified depth.

### Simple Example

```http
POST /graph/traverse
Content-Type: application/json

{
  "root_ids": ["requirement-123"],
  "direction": "out",
  "max_depth": 2,
  "max_nodes": 100
}
```

**Parameters:**
- `root_ids`: Starting node IDs (depth 0)
- `direction`: Edge direction to follow (`out`, `in`, or `both`)
- `max_depth`: Maximum hops from roots
- `max_nodes`: Safety cap to prevent large result sets
- `max_edges`: Safety cap for edge count

## Phase 3 Features

### Phased Traversal

Phased traversal enables multi-step graph exploration where each phase has independent constraints. Phases execute sequentially, with each phase starting from nodes discovered by the previous phase.

#### When to Use

- **Dependency Analysis**: "Find all requirements, then their implementations, then their test cases"
- **Hierarchical Navigation**: "Traverse organizational hierarchy, then cross-references"
- **Type-Specific Paths**: Different relationship types at different stages

#### Example: Software Dependency Chain

```json
{
  "root_ids": ["requirement-001"],
  "edgePhases": [
    {
      "relationshipTypes": ["DEPENDS_ON"],
      "direction": "out",
      "maxDepth": 2,
      "objectTypes": ["Requirement", "Dependency"]
    },
    {
      "relationshipTypes": ["IMPLEMENTED_BY"],
      "direction": "in",
      "maxDepth": 1,
      "objectTypes": ["Implementation"]
    },
    {
      "relationshipTypes": ["TESTED_BY"],
      "direction": "in",
      "maxDepth": 1,
      "objectTypes": ["TestCase"],
      "labels": ["automated"]
    }
  ]
}
```

**Execution Flow:**
1. **Phase 0 (Roots)**: Start with requirement-001
2. **Phase 1**: Follow DEPENDS_ON outbound up to 2 hops, collecting Requirements and Dependencies
3. **Phase 2**: From Phase 1 results, follow IMPLEMENTED_BY inbound 1 hop, collecting Implementations
4. **Phase 3**: From Phase 2 results, follow TESTED_BY inbound 1 hop, collecting automated TestCases

#### Response Structure

Nodes include a `phaseIndex` field indicating which phase discovered them:

```json
{
  "nodes": [
    {
      "id": "requirement-001",
      "type": "Requirement",
      "depth": 0,
      "phaseIndex": 0
    },
    {
      "id": "dependency-042",
      "type": "Dependency",
      "depth": 1,
      "phaseIndex": 1
    },
    {
      "id": "impl-123",
      "type": "Implementation",
      "depth": 2,
      "phaseIndex": 2
    }
  ],
  "edges": [...],
  "truncated": false
}
```

#### Phase Configuration

Each phase supports:
- **relationshipTypes**: Filter by edge types
- **direction**: `out`, `in`, or `both`
- **maxDepth**: Hops within this phase (1-8)
- **objectTypes**: Filter discovered nodes by type
- **labels**: Filter discovered nodes by labels

**Constraints:**
- Maximum 8 phases per request
- Global `max_nodes` and `max_edges` apply across all phases
- Empty phase (no results) stops further phase execution

### Property Predicate Filtering

Filter nodes and edges based on their property values using JSON Pointer paths and comparison operators.

#### Supported Operators

| Operator | Description | Example Value |
|----------|-------------|---------------|
| `equals` | Exact match | `"active"` |
| `notEquals` | Not equal | `"draft"` |
| `greaterThan` | Numeric/string > | `100` |
| `lessThan` | Numeric/string < | `50` |
| `greaterThanOrEqual` | Numeric >= | `75` |
| `lessThanOrEqual` | Numeric <= | `25` |
| `contains` | String substring | `"Script"` |
| `in` | Value in array | `["tech", "science"]` |
| `notIn` | Value not in array | `["draft", "archived"]` |
| `matches` | Regular expression | `".*@example\\.com$"` |
| `exists` | Property exists | `true` |
| `notExists` | Property doesn't exist | `true` |

#### Node Filtering

Filter which nodes are included in results based on their properties:

```json
{
  "root_ids": ["task-001", "task-002", "task-003"],
  "nodeFilter": {
    "path": "/status",
    "operator": "equals",
    "value": "active"
  },
  "max_depth": 2
}
```

Only nodes with `properties.status === "active"` will be included.

#### Edge Filtering

Filter which edges are traversed based on their properties:

```json
{
  "root_ids": ["node-a"],
  "edgeFilter": {
    "path": "/confidence",
    "operator": "greaterThanOrEqual",
    "value": 0.8
  },
  "max_depth": 3
}
```

Only edges with `properties.confidence >= 0.8` will be followed.

#### JSON Pointer Paths

Predicates use JSON Pointer (RFC 6901) syntax to reference nested properties:

```json
{
  "nodeFilter": {
    "path": "/metadata/verified",
    "operator": "equals",
    "value": true
  }
}
```

**Path Examples:**
- `/status` → `properties.status`
- `/metadata/priority` → `properties.metadata.priority`
- `/tags/0` → `properties.tags[0]`

#### Complex Filtering Examples

**High-Priority Active Tasks:**
```json
{
  "root_ids": ["project-123"],
  "nodeFilter": {
    "path": "/priority",
    "operator": "greaterThanOrEqual",
    "value": 7
  },
  "edgeFilter": {
    "path": "/type",
    "operator": "in",
    "value": ["BLOCKS", "DEPENDS_ON"]
  }
}
```

**Verified Email Addresses (Regex):**
```json
{
  "nodeFilter": {
    "path": "/email",
    "operator": "matches",
    "value": ".*@(example|test)\\.(com|org)$"
  }
}
```

**Items with Optional Description:**
```json
{
  "nodeFilter": {
    "path": "/description",
    "operator": "exists",
    "value": true
  }
}
```

### Path Enumeration

Track and return the full paths (sequences of node IDs) from root nodes to each discovered node.

#### When to Use

- **Dependency Chain Analysis**: "How did we reach this node?"
- **Impact Analysis**: "What are all the routes to this critical component?"
- **Provenance Tracking**: "Show the lineage from source to derived"

#### Basic Path Example

```json
{
  "root_ids": ["A"],
  "returnPaths": true,
  "max_depth": 3
}
```

**Response:**
```json
{
  "nodes": [
    {
      "id": "A",
      "depth": 0,
      "paths": [["A"]]
    },
    {
      "id": "B",
      "depth": 1,
      "paths": [["A", "B"]]
    },
    {
      "id": "D",
      "depth": 2,
      "paths": [
        ["A", "B", "D"],
        ["A", "C", "D"]
      ]
    }
  ]
}
```

Node `D` is reachable via two different paths from root `A`.

#### Multiple Paths

When a node is reachable via different routes, all paths are tracked (up to `maxPathsPerNode` limit):

```json
{
  "root_ids": ["root"],
  "returnPaths": true,
  "maxPathsPerNode": 10,
  "max_depth": 4
}
```

**Constraints:**
- `maxPathsPerNode`: Default 10, Maximum 100
- Paths discovered in BFS traversal order
- Only computed when `returnPaths: true` (zero overhead otherwise)

#### Paths with Phased Traversal

Paths work seamlessly with phased traversal, showing the full sequence across phase boundaries:

```json
{
  "root_ids": ["req-1"],
  "returnPaths": true,
  "edgePhases": [
    { "relationshipTypes": ["DEPENDS"], "direction": "out", "maxDepth": 1 },
    { "relationshipTypes": ["IMPLEMENTS"], "direction": "out", "maxDepth": 1 }
  ]
}
```

**Result:**
```json
{
  "nodes": [
    {
      "id": "impl-5",
      "phaseIndex": 2,
      "paths": [["req-1", "dep-3", "impl-5"]]
    }
  ]
}
```

#### Paths with Filtering

When predicates filter nodes, paths only include nodes that passed the filter:

```json
{
  "root_ids": ["A"],
  "returnPaths": true,
  "nodeFilter": {
    "path": "/status",
    "operator": "equals",
    "value": "active"
  }
}
```

Nodes filtered out won't appear in paths, so path sequences may have "gaps" if intermediate nodes were excluded.

## Combined Usage

The three Phase 3 features work together seamlessly for complex queries.

### Example: Software Impact Analysis

**Scenario:** Find all high-priority requirements and their verified implementations, showing the full dependency paths.

```json
{
  "root_ids": ["epic-001"],
  "edgePhases": [
    {
      "relationshipTypes": ["CONTAINS"],
      "direction": "out",
      "maxDepth": 1,
      "objectTypes": ["Requirement"]
    },
    {
      "relationshipTypes": ["DEPENDS_ON"],
      "direction": "out",
      "maxDepth": 2
    },
    {
      "relationshipTypes": ["IMPLEMENTED_BY"],
      "direction": "in",
      "maxDepth": 1,
      "objectTypes": ["Implementation"]
    }
  ],
  "nodeFilter": {
    "path": "/priority",
    "operator": "greaterThanOrEqual",
    "value": 8
  },
  "edgeFilter": {
    "path": "/verified",
    "operator": "equals",
    "value": true
  },
  "returnPaths": true,
  "maxPathsPerNode": 5
}
```

This query:
1. **Phase 1**: Gets requirements from epic (high priority only)
2. **Phase 2**: Follows dependencies (high priority only, verified edges only)
3. **Phase 3**: Finds implementations (verified edges only)
4. **Returns**: Full paths showing epic → req → deps → impl chains

### Example: Knowledge Graph Exploration

**Scenario:** Explore related concepts, filtering by domain and relationship strength, with path tracking.

```json
{
  "root_ids": ["concept-ai", "concept-ml"],
  "nodeFilter": {
    "path": "/domain",
    "operator": "in",
    "value": ["technology", "science"]
  },
  "edgeFilter": {
    "path": "/strength",
    "operator": "greaterThan",
    "value": 0.6
  },
  "returnPaths": true,
  "maxPathsPerNode": 3,
  "max_depth": 3
}
```

This finds strongly-related concepts in tech/science domains with up to 3 paths per concept.

## Performance Considerations

### Safety Limits

- **max_nodes**: Default 200, Maximum 5000
- **max_edges**: Default 400, Maximum 10000
- **max_depth**: Maximum 8 per phase
- **edgePhases**: Maximum 8 phases
- **maxPathsPerNode**: Maximum 100 paths

When limits are hit, `truncated: true` is returned.

### Optimization Tips

1. **Use Targeted Phases**: Narrow each phase with specific relationship types and object filters
2. **Apply Filters Early**: Use nodeFilter/edgeFilter to reduce traversal scope
3. **Limit Depth**: Deeper traversals grow exponentially
4. **Path Overhead**: Only enable `returnPaths` when needed
5. **Pagination**: Use cursor-based pagination for large result sets

### Execution Characteristics

- **Phased Traversal**: Sequential execution, each phase waits for previous
- **Predicates**: Evaluated during traversal (not post-filtering)
- **Paths**: Tracked incrementally during BFS
- **Memory**: Path storage is O(nodes × paths_per_node × avg_path_length)

## Best Practices

### 1. Start Specific, Broaden as Needed

```json
// Good: Specific phase constraints
{
  "edgePhases": [
    { "relationshipTypes": ["DEPENDS_ON"], "maxDepth": 1 }
  ]
}

// Avoid: Overly broad initial query
{
  "max_depth": 5,
  "max_nodes": 5000
}
```

### 2. Use Predicates to Filter Early

```json
// Good: Filter during traversal
{
  "nodeFilter": { "path": "/active", "operator": "equals", "value": true },
  "max_depth": 4
}

// Avoid: Retrieve everything then filter client-side
{
  "max_depth": 4,
  "max_nodes": 5000
}
```

### 3. Combine Phases for Complex Queries

```json
// Good: Multi-stage exploration
{
  "edgePhases": [
    { "relationshipTypes": ["HIERARCHY"], "direction": "out", "maxDepth": 2 },
    { "relationshipTypes": ["REFERENCE"], "direction": "both", "maxDepth": 1 }
  ]
}
```

### 4. Use returnPaths Judiciously

```json
// Good: Enable only when analyzing paths
{
  "returnPaths": true,
  "maxPathsPerNode": 5,
  "max_nodes": 100
}

// Avoid: Always returning paths
{
  "returnPaths": true,
  "maxPathsPerNode": 100,
  "max_nodes": 5000
}
```

### 5. Handle Truncation Gracefully

```javascript
const result = await fetch('/graph/traverse', { ... });
const data = await result.json();

if (data.truncated) {
  // Add filters or reduce depth
  console.warn('Result set truncated. Consider refining query.');
}
```

### 6. Leverage Phase Ordering

```json
// Good: Narrow first, then broaden
{
  "edgePhases": [
    { "relationshipTypes": ["CRITICAL"], "maxDepth": 1 },  // Get critical deps first
    { "relationshipTypes": ["OPTIONAL"], "maxDepth": 1 }   // Then optional deps
  ]
}
```

### 7. Use Regex Carefully

```json
// Good: Anchored, specific pattern
{
  "operator": "matches",
  "value": "^user-[0-9]{4}$"
}

// Avoid: Unbounded, greedy patterns
{
  "operator": "matches",
  "value": ".*"
}
```

## Error Handling

### Common Issues

1. **Invalid JSON Pointer**: Path must start with `/`
   ```json
   { "path": "/status" }  // ✓
   { "path": "status" }   // ✗
   ```

2. **Type Mismatches**: Operator doesn't match value type
   ```json
   // ✗ greaterThan with string value
   { "operator": "greaterThan", "value": "high" }
   
   // ✓ greaterThan with numeric value
   { "operator": "greaterThan", "value": 100 }
   ```

3. **Phase Constraints**: Each phase needs direction and maxDepth
   ```json
   { "direction": "out", "maxDepth": 2 }  // ✓
   { "direction": "out" }                  // ✗
   ```

### Validation Errors

The API returns 400 with detailed validation messages:

```json
{
  "statusCode": 400,
  "message": [
    "path must match /^\\// regular expression"
  ],
  "error": "Bad Request"
}
```

## API Reference

See [OpenAPI documentation](/api-docs) for complete request/response schemas, including:
- `EdgePhaseDto` - Phase configuration
- `PredicateDto` - Property filter specification
- `GraphTraversalResult` - Response structure
- `TraversalNode` - Node with optional phaseIndex and paths

## Examples Repository

See `tests/e2e/graph.traversal-advanced.e2e.spec.ts` for comprehensive real-world examples.
