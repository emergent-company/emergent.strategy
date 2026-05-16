# Change: Agent-Guided Navigation with Memory Integration

## Why

The navigation graph defines product topology (where users can go) and the Memory graph holds knowledge state (what exists, what's been done). Today these are separate — the runner evaluates guards as static booleans, and Memory queries don't consider navigation reachability.

Combining them creates an AI agent that reasons about *what to do* (Memory) and *how to get there* (navigation graph) simultaneously. The agent can resolve guards from live data, suggest next steps based on topology + context, record traversal patterns, and render the navigation graph as an interactive 3D visualization in the browser.

## What Changes

### 1. Memory-Bound Guard Resolution
Guards in the navigation graph (e.g., `share-classes`, `company-exists`) resolve against live Memory state instead of static profiles. The agent queries Memory to determine which guards pass for the current entity, producing a dynamic guard profile.

### 2. Agent Navigation Loop
An AI agent traverses the navigation graph on behalf of or alongside the user. It uses reachability analysis + Memory context to suggest paths, explain why something is blocked, and proactively guide the user to their goal.

### 3. Journey Recording to Memory
As the user navigates, traversal history is written to the Memory graph as journal entries. Over time this accumulates usage patterns — which paths each persona takes, where they get stuck, which features they never reach.

### 4. Interactive 3D Graph Visualization
The strategy-server web UI renders navigation graphs as interactive WebGL visualizations with:
- Spatial clustering by group (tab sections become 3D clusters)
- Live guard coloring (reachable/blocked based on current user state)
- Portal edges as visible bridges between service clusters
- Click-to-navigate (clicking a node triggers the actual navigation)
- Persona simulation (toggle guard profiles to see different user views)

### 5. Combined Semantic + Topological Queries
New MCP tools that join semantic search (Memory) with navigation reachability. "Show me everything related to compliance that this user can reach" returns both knowledge objects and the paths to act on them.

## Impact

- **Affected specs:** `strategy-web`, `strategy-semantic`, `strategy-mcp`
- **Affected code:** `apps/strategy-server/` (new `domain/journey/` service, web handlers for graph visualization, MCP tools)
- **Dependencies:** Requires Phase 2 (MCP tools) and Phase 3 (web UI) of strategy-server to be partially in place. Memory integration is optional with graceful degradation (falls back to static guard profiles when Memory is unavailable).
- **No changes to epf-cli** — all new code is in strategy-server. epf-cli's `navigation` and `workflow` packages are imported as libraries.
