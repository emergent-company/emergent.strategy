## Context

The navigation graph engine (epf-cli `internal/navigation/`) provides topology data: contexts, transitions, guards, groups, composition, reachability, and pathfinding. The Memory platform provides semantic knowledge: objects, relationships, embeddings, and journal. Today they operate independently.

This change connects them so that an AI agent can use both simultaneously — reasoning about what the user should do (Memory knowledge) and how to get there (navigation topology).

The strategy-server is the integration point. It already imports epf-cli's navigation and Memory packages. The web UI (Phase 3) is where the visualization lives. The MCP server (Phase 2) is where agent tools live.

## Goals

- Agent can resolve navigation guards from live Memory state (dynamic profiles)
- Agent can suggest navigation paths based on user's current context + knowledge state
- User traversal is recorded in Memory journal for pattern analysis
- Web UI renders interactive graph visualization with live guard coloring
- Combined queries: semantic search + reachability in one operation

## Non-Goals

- Replacing the existing static guard profile system (it remains for offline/testing use)
- Building a full routing engine (the web UI's own routing handles that; the graph visualization is a strategic tool, not the primary navigation)
- Real-time multiplayer graph visualization (single-user view is sufficient)

## Decisions

### 1. Guard Resolution Architecture

**Decision:** Guard resolver is a strategy-server domain service that maps guard IDs to Memory queries.

**Alternatives considered:**
- Embedding Memory queries in epf-cli's navigation package — rejected because epf-cli is frozen and should not have Memory dependencies
- Configuration-based guard mapping (YAML) — too rigid, guards need arbitrary query logic

**Implementation:** `domain/journey/guard_resolver.go` implements a `GuardResolver` interface. Each guard ID maps to a function that queries Memory (or the database) and returns true/false. The resolver produces a `navigation.GuardProfile` that the existing runner consumes.

```go
type GuardResolver interface {
    ResolveProfile(ctx context.Context, entityID string) (*navigation.GuardProfile, error)
}
```

When Memory is unavailable, the resolver falls back to a static default profile (graceful degradation per project.md).

### 2. Journey Recording

**Decision:** Write traversal events to Memory journal, not to a separate database table.

**Alternatives considered:**
- PostgreSQL table with traversal history — simpler queries but duplicates Memory's journal capability
- Event stream (Kafka/NATS) — over-engineered for this use case

**Implementation:** Each navigation transition writes a journal entry with:
- `type: "navigation_traversal"`
- `from_context`, `to_context`, `transition_id`
- `user_id`, `entity_id` (which company/instance)
- `timestamp`, `guards_satisfied` (snapshot of active guards)

The Memory journal already supports custom entries. This adds traversal as a new entry type.

### 3. 3D Graph Visualization

**Decision:** Three.js with `3d-force-graph` library for WebGL rendering. Server sends JSON graph data, client renders.

**Alternatives considered:**
- D3.js force-directed (2D) — works but loses the spatial depth that makes multi-service composition legible
- Cytoscape.js — good for 2D, limited 3D support
- Custom WebGL — too much work for the visual quality needed

**Implementation:**
- New API endpoint: `GET /api/workspaces/:id/instances/:id/navigation-graph` returns the full graph as JSON (contexts, transitions, guards, groups, reachability for current user)
- Web page at `/workspaces/:id/instances/:id/navigation` embeds the 3D viewer
- Groups become spatial clusters (force-directed within cluster, repulsive between clusters)
- Guard state colors nodes: green (reachable), red (blocked), blue (entry point)
- Portal edges render as curved arcs between service clusters
- Click node → navigates to that screen (if reachable) or shows guard explanation (if blocked)
- Persona toggle sidebar: switch guard profiles to simulate different user views

### 4. Combined Semantic + Topological Queries

**Decision:** New MCP tools in strategy-server that call both Memory and navigation APIs.

**Implementation:**
- `strategy_navigate_to` — "how do I get to X?" Combines `ShortestPath` with Memory context to explain why each guard passes or fails
- `strategy_suggest_next` — "what should I do next?" Queries Memory for current entity state, then uses `Available()` transitions from current context to suggest next steps with strategic reasoning
- `strategy_reachable_knowledge` — "what can I reach that relates to X?" Combines `epf_semantic_search` results with `Reachable` to return only knowledge objects the user can act on

These are strategy-server MCP tools, not epf-cli tools.

## Risks / Trade-offs

- **Memory dependency:** If Memory is down, guard resolution falls back to static profiles. The 3D visualization still renders but without live guard coloring. Combined queries degrade to navigation-only or search-only.
- **Performance:** The 21st-captable graph has 115 contexts and 151 transitions. 3D rendering with force-directed layout should handle this fine. Graphs over 500 nodes may need level-of-detail culling.
- **Journal volume:** Recording every navigation click generates many journal entries. Consider batching (write on page leave, not every click) or sampling in high-traffic scenarios.

## Migration Plan

No migration needed — entirely additive. Existing navigation tools in epf-cli continue to work unchanged. Strategy-server adds new capabilities on top.

## Open Questions

1. Should the 3D visualization be a standalone page or embeddable in other pages (e.g., instance dashboard)?
2. Should journey recording be opt-in per user or always-on?
3. How should guard resolution handle guards that don't have a Memory mapping (e.g., `premium-tier` which is a billing state, not a strategy state)?
