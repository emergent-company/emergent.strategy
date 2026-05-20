## 1. Memory-Bound Guard Resolution

- [ ] 1.1 Define `GuardResolver` interface in `domain/journey/`
- [ ] 1.2 Implement Memory-backed guard resolver (queries Memory for entity state)
- [ ] 1.3 Implement static fallback resolver (configurable default profile)
- [ ] 1.4 Implement resolver chain (try Memory, fall back to static)
- [ ] 1.5 Add guard-to-query mapping configuration (which guard maps to which Memory query)
- [ ] 1.6 Write unit tests for guard resolution with mocked Memory client
- [ ] 1.7 Write integration test with real Memory instance

## 2. Journey Recording

- [ ] 2.1 Define `navigation_traversal` journal entry type
- [ ] 2.2 Implement journal writer in `domain/journey/` that writes traversals to Memory
- [ ] 2.3 Add middleware or hook in web handlers to record navigation events
- [ ] 2.4 Implement batching (buffer traversals, flush on page leave or after N seconds)
- [ ] 2.5 Write unit tests for journal entry format
- [ ] 2.6 Write integration test verifying traversal entries appear in Memory journal

## 3. Agent Navigation MCP Tools

- [ ] 3.1 Implement `strategy_navigate_to` — shortest path with live guard explanation
- [ ] 3.2 Implement `strategy_suggest_next` — available transitions with Memory context
- [ ] 3.3 Implement `strategy_reachable_knowledge` — semantic search + reachability join
- [ ] 3.4 Implement `strategy_run_journey` — goal-directed multi-step guidance
- [ ] 3.5 Register tools in strategy-server MCP server
- [ ] 3.6 Write MCP tool tests with mocked Memory and navigation graph

## 4. Navigation Graph API

- [ ] 4.1 Implement `GET /api/workspaces/:id/instances/:id/navigation-graph` endpoint
- [ ] 4.2 Include reachability data (resolved from current user's guard profile)
- [ ] 4.3 Support `?persona=` query param for persona simulation
- [ ] 4.4 Support multi-service composition (merge imported sub-graphs in response)
- [ ] 4.5 Write API handler tests

## 5. 3D Graph Visualization

- [ ] 5.1 Add Three.js + 3d-force-graph to web UI dependencies
- [ ] 5.2 Create navigation graph page template (`/workspaces/:id/instances/:id/navigation`)
- [ ] 5.3 Implement graph renderer — nodes as spheres, edges as lines, groups as spatial clusters
- [ ] 5.4 Implement guard coloring — green (reachable), red (blocked), blue (entry)
- [ ] 5.5 Implement portal edge rendering — dashed curved arcs between service clusters
- [ ] 5.6 Implement click-to-navigate — click reachable node to navigate, blocked node to show guard info
- [ ] 5.7 Implement persona simulation sidebar — dropdown to switch guard profiles
- [ ] 5.8 Implement hover tooltips — context title, guard status, group, data requirements
- [ ] 5.9 Handle large graphs — level-of-detail culling for 500+ node graphs
- [ ] 5.10 Write browser test verifying graph renders with test data

## 6. Combined Queries

- [ ] 6.1 Implement semantic + topological join in `domain/journey/`
- [ ] 6.2 Map Memory object types to navigation contexts (which context is the "home" for each object type)
- [ ] 6.3 Write tests for combined query results

## 7. Documentation

- [ ] 7.1 Update strategy-web navigation graph screen table with new page
- [ ] 7.2 Document guard resolver configuration
- [ ] 7.3 Document MCP tool parameters and response formats
- [ ] 7.4 Add journey recording to AGENTS.md
