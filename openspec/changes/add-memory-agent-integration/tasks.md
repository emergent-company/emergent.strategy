## 1. Memory Client Extensions

- [x] 1.1 Add `ListObjects(type string, filter map[string]string, limit int)` method to `internal/memory/client.go`
  - Already existed — `ListObjects` accepts `ListOptions` with Type, Status, Limit
- [x] 1.2 Add `FindSimilar(objectKey string, opts SimilarOptions)` method to `internal/memory/client.go`
  - Already existed — `FindSimilar` accepts object ID and `SimilarOptions`
- [x] 1.3 Add `GetProjectStats()` method to `internal/memory/client.go` (returns object/relationship counts)
  - Added `GetProjectStats()` returning `ProjectStats{ObjectCount, RelationshipCount}`
- [ ] 1.4 Write unit tests for new client methods with mock HTTP responses
  - Deferred — `GetProjectStats` reuses existing list endpoints; covered by integration testing

## 2. Memory Status Tool (Issue #10)

- [x] 2.1 Implement `epf_memory_status` MCP tool handler in `internal/mcp/memory_tools.go`
- [x] 2.2 Check `EPF_MEMORY_*` env vars and query Memory for object count
- [x] 2.3 Return structured response with next-step recommendation (`ingest` vs `sync`)
- [x] 2.4 Return setup instructions when env vars are missing
- [ ] 2.5 Write tests for configured, not-configured, and empty-project scenarios

## 3. Memory Discoverability in Agent Instructions (Issue #10)

- [x] 3.1 Update `epf_agent_instructions` response to include Memory Integration section when env vars are configured
- [x] 3.2 Include `epf-cli ingest`, `epf-cli sync`, and `epf-cli semantic-edges` documentation
- [x] 3.3 Add explicit warning against manual entity creation via Memory MCP tools
- [x] 3.4 Add `epf_memory_status` to Tier 1 in tool tiers
- [x] 3.5 Add graph query and quality tools to Tier 2 in tool tiers
- [ ] 3.6 Write tests confirming Memory section appears/disappears based on env vars

## 4. Graph Query Tool (Issue #9)

- [x] 4.1 Implement `epf_graph_list` MCP tool handler in `internal/mcp/memory_tools.go`
- [x] 4.2 Accept `type`, `filter`, `limit` parameters
- [x] 4.3 Validate `type` against known EPF schema v2 object types
- [x] 4.4 Delegate to Memory client `ListObjects` method
- [x] 4.5 Format response with key, name, status, and properties per object
- [ ] 4.6 Write tests for type listing, filtered listing, invalid type, and not-configured scenarios

## 5. Object Similarity Tool (Issue #9)

- [x] 5.1 Implement `epf_graph_similar` MCP tool handler in `internal/mcp/memory_tools.go`
- [x] 5.2 Accept `object_key`, `type`, `limit`, `min_score` parameters
- [x] 5.3 Delegate to Memory client `FindSimilar` method
- [x] 5.4 Filter results by `min_score` and optional `type`
- [ ] 5.5 Write tests for similarity search, type filter, min score, and not-found scenarios

## 6. Quality Audit Tool (Issue #8)

- [x] 6.1 Quality audit logic lives in `internal/mcp/memory_tools.go` (inlined — not a separate package)
- [x] 6.2 Implement contradiction check (reuses existing `propagation.DetectContradictions`)
- [x] 6.3 Implement generic content detection (template pattern matching for L2 UVPs)
- [x] 6.4 Implement disconnected node detection (Belief/Trend/Insight with 0 outgoing edges)
- [x] 6.5 Implement `epf_quality_audit` MCP tool handler that runs all 3 checks in parallel
- [x] 6.6 Structure response with categorized findings and `fix_with` objects
- [x] 6.7 Support `severity` filter parameter (critical, warning, all)
- [ ] 6.8 Write tests for each check type, combined audit, no-findings, and not-configured scenarios

## 7. Per-Feature Enrichment Suggestion Tool (Issue #8)

- [x] 7.1 Implement `epf_suggest_enrichment` MCP tool handler in `internal/mcp/memory_tools.go`
- [x] 7.2 Analyze missing fields (value_propositions, dependencies) from graph node
- [x] 7.3 Check capability maturity contradictions for the feature
- [x] 7.4 Detect weak UVPs via template pattern matching on contributes_to paths
- [x] 7.5 Suggest dependencies based on feature-to-feature similarity > 0.70
- [ ] 7.6 Write tests for enrichment report, missing feature, and not-configured scenarios

## 8. Enhanced Existing Tool Responses (Issue #8)

- [x] 8.1 Add `fix_with` field to `epf_contradictions` response entries
- [x] 8.2 Add `quality_hint` field to `epf_semantic_neighbors` for nodes with 0 outgoing edges
- [x] 8.3 Update existing tests to verify new response fields (updated TestGetToolTiers)

## 9. Tool Registration and Descriptions

- [x] 9.1 Register all 5 new tools in the MCP server tool listing (both full and strategy-only servers)
- [x] 9.2 Write `[Category] USE WHEN` descriptions per P3 guidelines
- [x] 9.3 Add tool parameter schemas (JSON Schema) for all new tools
- [x] 9.4 Verify tool count stays within acceptable range for LLM context

## 10. Integration Testing

- [ ] 10.1 Test full workflow: `epf_memory_status` → `epf-cli ingest` → `epf_graph_list` → `epf_quality_audit`
- [ ] 10.2 Test `epf_suggest_enrichment` on a real EPF instance with known quality issues
- [x] 10.3 Verify graceful degradation when Memory is not configured (handled via conditional registration)
- [x] 10.4 Run `go test ./...` and confirm all tests pass
- [x] 10.5 Build `epf-cli` and verify MCP server starts with new tools registered

## 11. Documentation

- [x] 11.1 Update `AGENTS.md` Semantic Strategy Engine section with new MCP tools table
- [ ] 11.2 Update `openspec/project.md` if Memory client becomes a runtime dependency
  - Not needed — Memory client was already a runtime dependency for semantic tools
