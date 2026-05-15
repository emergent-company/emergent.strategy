## 1. Schema Design

- [x] 1.1 Study the 21st-captable reference implementation (`internal/navigation/navigation.go` types, `graph.go` definitions)
- [x] 1.2 Study the existing EPF `workflow_schema.json` to understand the state-machine schema patterns
- [x] 1.3 Identify the common graph primitive shared by navigation graphs and workflow definitions (nodes, edges, guards)
- [x] 1.4 Design `navigation_graph_schema.json` — interaction contexts, transitions, guards, groups, modes, data requirements, properties escape hatch
- [x] 1.5 Add schema to `epf-canonical/schemas/` and sync to embedded
- [x] 1.6 Write test fixtures: minimal graph (3 contexts), full strategic graph (~15 contexts), invalid graphs (orphans, missing guards, duplicate IDs, circular parents)

## 2. Artifact Type Detection & Validation

- [x] 2.1 Add `ArtifactNavigationGraph` constant to `internal/schema/loader.go`
- [x] 2.2 Add filename patterns to `artifactMapping` (`FIRE/navigation_graph.yaml`, `FIRE/*_navigation.yaml`, `FIRE/navigation/*.yaml`)
- [x] 2.3 Add schema mapping to `schemaFileMapping`
- [x] 2.4 Add detection test cases to `loader_test.go` (8 cases)
- [x] 2.5 Implement structural validation (11 checks: unique IDs, entry context, transition integrity, guard consistency, circular parents, orphans, landing contexts, menu integrity, group references, guard fallbacks)
- [x] 2.6 Add structural validation tests (5 invalid-graph test cases)

## 3. Graph State Machine Runner

- [x] 3.1 Design the runner as a graph-type-agnostic engine: nodes, edges, guards, current state, guard profile, history
- [x] 3.2 Implement the core runner (`internal/navigation/`) — load graph, evaluate transitions, track state, record history
- [x] 3.3 Implement guard profile: a set of satisfied guard IDs and guard groups, togglable at runtime
- [x] 3.4 Implement navigation graph adapter: load `navigation_graph` YAML into the runner's graph model
- [x] 3.5 Implement workflow graph adapter: `internal/workflow/` with types, loader, validator, `ToNavigationGraph()` adapter (18 tests)
- [x] 3.6 Write runner unit tests: traversal, guard blocking, history tracking, reachability, pathfinding, scenarios (22 tests)

## 4. CLI Commands — DEFERRED

> epf-cli is frozen (bug fixes only). CLI commands will be part of strategy-server.

- [ ] ~~4.1 Add `journey` cobra command group~~
- [ ] ~~4.2 Implement `journey walk`~~
- [ ] ~~4.3 Implement `journey run`~~
- [ ] ~~4.4 Implement `journey validate`~~
- [ ] ~~4.5 Implement `journey list`~~
- [ ] ~~4.6 Design journey scenario file format~~
- [ ] ~~4.7 Write CLI integration tests~~

## 5. MCP Tools

- [x] 5.1 Implement `epf_journey_search` — keyword search over interaction contexts
- [x] 5.2 Implement `epf_journey_reachability` — guard-aware reachability with blocked context analysis
- [x] 5.3 Implement `epf_journey_path` — shortest path with guard diagnosis for blocked paths
- [x] 5.4 Implement `epf_journey_guards` — inbound transition guards + group visibility guards
- [x] 5.5 Implement `epf_journey_run` — execute a scripted journey scenario and return result
- [x] 5.6 Register tools in MCP server (`journey_tools.go`, registered in `server.go`)
- [x] 5.7 Write MCP tool tests (10 tests in `journey_tools_test.go`)

## 6. Semantic Engine Integration

- [x] 6.1 Add `InteractionContext` object type to decomposer schema (`decompose/schema.go`)
- [x] 6.2 Add `navigation_transition` and `guards` relationship types
- [x] 6.3 Add `NavigationGuard` object type
- [x] 6.4 Implement `decomposeNavigationGraph()` in decomposer (`decompose_navigation.go`)
- [x] 6.5 Add decompose test with navigation graph fixture (`TestDecomposeNavigationGraph`)
- [ ] 6.6 Verify ingestion round-trip with mock Memory server — DEFERRED: covered by existing reconcile tests

## 7. Multi-Service Composition

- [x] 7.1 Design portal edge schema extension (in `navigation_graph_schema.json`)
- [x] 7.2 Design graph import/merge semantics (in `navigation_graph_schema.json`)
- [x] 7.3 Implement composition validation — `ValidateComposition()` in `compose.go` (portal source/target resolution, guard refs, duplicate IDs)
- [x] 7.4 Write composition test with twentyfirst platform + captable sub-graph fixture (7 tests: load, compose, validate, broken portals, merge+traverse, cross-service reachability, cross-service shortest path)
- [x] 7.5 Document composition patterns in AGENTS.md (imports, portal edges, namespace, abstraction boundary)

## 8. Reference Migration

- [x] 8.1 Extract 21st-captable navigation graph to YAML — 115 contexts, 151 transitions, 8 guards, 9 groups, 2 menus (2005 lines)
- [x] 8.2 Validate extracted graph — all structural checks pass (unique IDs, entry context, transitions, guards, landing contexts)
- [x] 8.3 Run state machine runner — journey scenario, role-based reachability (full=109, minimal=5, member=85), shortest paths, guard blocking (5 tests)
- [x] 8.4 Document abstraction boundary in AGENTS.md — topology (graph) vs rendering (implementation) table
- [x] 8.5 Document migration guide in AGENTS.md — 7-step process from code-based graphs to YAML artifacts

## 9. Documentation & Release

- [x] 9.1 Update AGENTS.md with navigation graph artifact type, runner, and MCP tools
- [x] 9.2 Update CONSTITUTION.md directory layout with navigation package
- [x] 9.3 Add navigation graph authoring skill to canonical EPF (`skills/navigation-graph/` with skill.yaml + prompt.md)
- [x] 9.4 Run full test suite and lint — all tests pass
- [ ] 9.5 Release with updated epf-cli
