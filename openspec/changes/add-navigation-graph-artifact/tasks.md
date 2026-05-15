## 1. Schema Design

- [ ] 1.1 Study the 21st-captable reference implementation (`internal/navigation/navigation.go` types, `graph.go` definitions)
- [ ] 1.2 Study the existing EPF `workflow_schema.json` to understand the state-machine schema patterns
- [ ] 1.3 Identify the common graph primitive shared by navigation graphs and workflow definitions (nodes, edges, guards)
- [ ] 1.4 Design `navigation_graph_schema.json` — interaction contexts, transitions, guards, groups, modes, data requirements, properties escape hatch
- [ ] 1.5 Add schema to `epf-canonical/schemas/` and sync to embedded
- [ ] 1.6 Write test fixtures: minimal graph (3 contexts), full strategic graph (~30 contexts), invalid graph (orphans, missing guards, duplicate IDs, circular parents)

## 2. Artifact Type Detection & Validation

- [ ] 2.1 Add `ArtifactNavigationGraph` constant to `internal/schema/loader.go`
- [ ] 2.2 Add filename pattern to `artifactMapping` (e.g., `FIRE/navigation_graph.yaml`, `FIRE/navigation/*.yaml`)
- [ ] 2.3 Add schema mapping to `schemaFileMapping`
- [ ] 2.4 Add detection test cases to `loader_test.go`
- [ ] 2.5 Implement structural validation (reachability, orphans, unique IDs, guard consistency, landing contexts, circular parents, scoped ancestry, menu integrity)
- [ ] 2.6 Add structural validation tests

## 3. Graph State Machine Runner

- [ ] 3.1 Design the runner as a graph-type-agnostic engine: nodes, edges, guards, current state, guard profile, history
- [ ] 3.2 Implement the core runner (`internal/runner/`) — load graph, evaluate transitions, track state, record history
- [ ] 3.3 Implement guard profile: a set of satisfied guard IDs and guard groups, togglable at runtime
- [ ] 3.4 Implement navigation graph adapter: load `navigation_graph` YAML into the runner's generic graph model
- [ ] 3.5 Implement workflow graph adapter: load `workflow` YAML into the same runner (same engine, different graph type)
- [ ] 3.6 Write runner unit tests: traversal, guard blocking, history tracking, unreachable detection

## 4. CLI Commands

- [ ] 4.1 Add `journey` cobra command group
- [ ] 4.2 Implement `journey walk` — interactive TUI mode using the state machine runner (toggle guards, choose transitions, see breadcrumbs)
- [ ] 4.3 Implement `journey run` — scripted mode: execute a journey scenario (YAML file with steps + guard profile) and report pass/fail
- [ ] 4.4 Implement `journey validate` — run structural validation from CLI
- [ ] 4.5 Implement `journey list` — list contexts, groups, guards summary
- [ ] 4.6 Design journey scenario file format (sequence of transition IDs + guard profile + expected outcome)
- [ ] 4.7 Write CLI integration tests

## 5. MCP Tools

- [ ] 5.1 Implement `epf_journey_search` — keyword search over interaction contexts
- [ ] 5.2 Implement `epf_journey_reachability` — guard-aware reachability from a source context using the runner
- [ ] 5.3 Implement `epf_journey_path` — shortest path computation between contexts
- [ ] 5.4 Implement `epf_journey_guards` — guard diagnosis for a context
- [ ] 5.5 Implement `epf_journey_run` — execute a scripted journey scenario and return result
- [ ] 5.6 Register tools in MCP server
- [ ] 5.7 Write MCP tool tests

## 6. Semantic Engine Integration

- [ ] 6.1 Add `InteractionContext` object type to decomposer schema (`decompose/schema.go`)
- [ ] 6.2 Add `NavigationTransition` relationship type
- [ ] 6.3 Add `NavigationGuard` object type
- [ ] 6.4 Implement `decomposeNavigationGraph()` in decomposer
- [ ] 6.5 Add decompose test with navigation graph fixture
- [ ] 6.6 Verify ingestion round-trip with mock Memory server

## 7. Multi-Service Composition

- [ ] 7.1 Design portal edge schema extension (cross-service transition references)
- [ ] 7.2 Design graph import/merge semantics (how a product graph references service sub-graphs)
- [ ] 7.3 Implement composition validation (portal targets resolve across sub-graphs)
- [ ] 7.4 Write composition test with two sub-graphs and portal edges
- [ ] 7.5 Document composition patterns in EPF framework docs

## 8. Reference Migration

- [ ] 8.1 Extract a strategic navigation graph YAML from the 21st-captable reference implementation (contexts, transitions, guards, groups — without medium-specific fields)
- [ ] 8.2 Validate the extracted graph against the new schema
- [ ] 8.3 Run the state machine runner against the extracted graph — verify interactive walk and scripted scenarios
- [ ] 8.4 Document the abstraction boundary: what lives in EPF (topology) vs what lives in the implementation (rendering)
- [ ] 8.5 Document migration guide: from code-based graph to YAML artifact + implementation config

## 9. Documentation & Release

- [ ] 9.1 Update AGENTS.md with navigation graph artifact type, runner, and MCP tools
- [ ] 9.2 Update CONSTITUTION.md artifact type detection section
- [ ] 9.3 Add navigation graph wizard/skill to canonical EPF
- [ ] 9.4 Run full test suite and lint
- [ ] 9.5 Release with updated epf-cli
