## ADDED Requirements

### Requirement: Memory Status Tool via MCP

AI agents SHALL be able to check Memory integration status via the `epf_memory_status` MCP tool.

The tool SHALL:

- Check whether `EPF_MEMORY_URL`, `EPF_MEMORY_PROJECT`, and `EPF_MEMORY_TOKEN` environment variables are configured
- If configured, query Memory for the current object count and report ingestion status
- Recommend `epf-cli ingest` when no objects exist, or `epf-cli sync` when objects already exist
- Return setup instructions when Memory is not configured

The tool description SHALL follow the `[Category] USE WHEN` format: `[Status] USE WHEN you need to check if Memory is configured and whether the instance has been ingested.`

#### Scenario: Memory configured and ingested

- **WHEN** AI agent calls `epf_memory_status`
- **AND** Memory env vars are configured
- **AND** the Memory project contains objects
- **THEN** the tool returns the object count, relationship count, and recommends `epf-cli sync` for incremental updates

#### Scenario: Memory configured but not ingested

- **WHEN** AI agent calls `epf_memory_status`
- **AND** Memory env vars are configured
- **AND** the Memory project contains zero objects
- **THEN** the tool recommends `epf-cli ingest <instance-path>` and explains what the decomposer produces

#### Scenario: Memory not configured

- **WHEN** AI agent calls `epf_memory_status`
- **AND** one or more Memory env vars are missing
- **THEN** the tool returns a structured response listing required env vars and setup steps

---

### Requirement: Structured Graph Query Tool via MCP

AI agents SHALL be able to run deterministic graph queries via the `epf_graph_list` MCP tool.

The tool SHALL:

- Accept parameters: `type` (required), `filter` (optional key=value), `limit` (optional, default 50)
- Query the Memory graph API for objects matching the type and filter criteria
- Return objects with their key, name, status, and relevant properties
- Not rely on embeddings or semantic search — results are deterministic

The tool description SHALL follow the `[Category] USE WHEN` format: `[Query] USE WHEN you need to list graph objects by type and optional property filter. Deterministic — no embeddings.`

#### Scenario: List all objects of a type

- **WHEN** AI agent calls `epf_graph_list` with `type=Feature`
- **THEN** the tool returns all Feature objects with key, name, status, and properties

#### Scenario: List objects with property filter

- **WHEN** AI agent calls `epf_graph_list` with `type=Feature` and `filter=status=delivered`
- **THEN** the tool returns only Feature objects where status equals "delivered"

#### Scenario: List objects with limit

- **WHEN** AI agent calls `epf_graph_list` with `type=Scenario` and `limit=10`
- **THEN** the tool returns at most 10 Scenario objects

#### Scenario: Invalid type

- **WHEN** AI agent calls `epf_graph_list` with a type that does not exist in the EPF schema
- **THEN** the tool returns an error listing valid EPF object types

#### Scenario: Memory not configured

- **WHEN** AI agent calls `epf_graph_list`
- **AND** Memory env vars are not set
- **THEN** the tool returns a structured error with setup instructions

---

### Requirement: Object Similarity Tool via MCP

AI agents SHALL be able to find semantically similar objects via the `epf_graph_similar` MCP tool.

The tool SHALL:

- Accept parameters: `object_key` (required), `type` (optional filter), `limit` (optional, default 10), `min_score` (optional, default 0.0)
- Query the Memory similarity endpoint using embedding vectors
- Return objects ranked by similarity score
- Complement (not replace) the existing `epf_semantic_neighbors` tool which returns structural edges

The tool description SHALL follow the `[Category] USE WHEN` format: `[Query] USE WHEN you need to find semantically similar objects by embedding distance. Different from semantic_neighbors which returns structural edges.`

#### Scenario: Find similar objects

- **WHEN** AI agent calls `epf_graph_similar` with `object_key=Feature:feature:fd-001`
- **THEN** the tool returns objects ranked by embedding similarity with scores

#### Scenario: Find similar objects with type filter

- **WHEN** AI agent calls `epf_graph_similar` with `object_key=Feature:feature:fd-001` and `type=Feature`
- **THEN** the tool returns only Feature objects ranked by similarity

#### Scenario: Find similar objects with minimum score threshold

- **WHEN** AI agent calls `epf_graph_similar` with `min_score=0.7`
- **THEN** the tool returns only objects with similarity score >= 0.7

#### Scenario: Object not found

- **WHEN** AI agent calls `epf_graph_similar` with an object key that does not exist
- **THEN** the tool returns a clear error and suggests checking the key format or running `epf-cli ingest`

---

### Requirement: Quality Audit Tool via MCP

AI agents SHALL be able to run a combined graph-based quality audit via the `epf_quality_audit` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `severity` (optional: `critical`, `warning`, `all`; default `all`)
- Run three checks in parallel: contradiction detection, generic content detection, disconnected node detection
- Return findings categorized by type with actionable `fix_with` instructions
- Each `fix_with` object SHALL contain `tool` (MCP tool name) and `params` (parameter values)

The tool description SHALL follow the `[Category] USE WHEN` format: `[Quality] USE WHEN you need graph-based quality signals. Combines contradiction, generic content, and disconnected node detection into one call with fix instructions.`

#### Scenario: Full quality audit with findings

- **WHEN** AI agent calls `epf_quality_audit` with an instance path
- **THEN** the tool runs contradiction, generic content, and disconnected node checks
- **AND** returns findings grouped by category: `contradictions`, `generic_content`, `disconnected_nodes`
- **AND** each finding includes a `fix_with` object

#### Scenario: Contradiction findings with fix instructions

- **WHEN** the audit finds a delivered feature with hypothetical capabilities
- **THEN** the finding includes `fix_with: {tool: "epf_update_capability_maturity", params: {feature_id: "fd-009", capability_id: "cap-001", maturity: "proven"}}`

#### Scenario: Generic content findings

- **WHEN** the audit finds L2 UVPs with cross-similarity > 0.80
- **THEN** the findings include the similar UVP pairs, their similarity scores, and a recommendation to rewrite

#### Scenario: Disconnected node findings

- **WHEN** the audit finds nodes (Beliefs, Trends) with zero outgoing edges
- **THEN** the findings include the disconnected nodes and a recommendation to add references

#### Scenario: No findings

- **WHEN** AI agent calls `epf_quality_audit`
- **AND** no quality issues are detected
- **THEN** the tool returns an empty findings list with a summary confirming no issues

#### Scenario: Memory not configured

- **WHEN** AI agent calls `epf_quality_audit`
- **AND** Memory env vars are not set
- **THEN** the tool returns a structured error with setup instructions

---

### Requirement: Per-Feature Enrichment Suggestion Tool via MCP

AI agents SHALL be able to get per-feature enrichment suggestions via the `epf_suggest_enrichment` MCP tool.

The tool SHALL:

- Accept parameters: `feature_id` (required), `instance_path` (required)
- Analyze the feature's graph node and its connections to identify improvement opportunities
- Return a structured report with missing fields, contradictions, weak UVPs, and suggested dependencies

The tool description SHALL follow the `[Category] USE WHEN` format: `[Quality] USE WHEN you need per-feature enrichment suggestions. Analyzes graph connections to find missing content, contradictions, and potential dependencies.`

#### Scenario: Feature enrichment report

- **WHEN** AI agent calls `epf_suggest_enrichment` with `feature_id=fd-009`
- **THEN** the tool returns a report covering:
  - Missing fields (e.g., value_propositions with 0 persona coverage, empty dependencies)
  - Capability contradictions (delivered feature with hypothetical capabilities)
  - Weak UVPs (contributes_to paths with cross-similarity > 0.80)
  - Suggested dependencies (features with similarity > 0.70)

#### Scenario: Suggested dependencies include similarity scores

- **WHEN** the tool finds features with similarity > 0.70
- **THEN** each suggested dependency includes the similar feature ID, name, similarity score, and whether it should be `requires` or `enables`

#### Scenario: Feature not found in graph

- **WHEN** AI agent calls `epf_suggest_enrichment` with a feature ID not in the graph
- **THEN** the tool returns a clear error suggesting `epf-cli ingest` if the graph may be stale

#### Scenario: Memory not configured

- **WHEN** AI agent calls `epf_suggest_enrichment`
- **AND** Memory env vars are not set
- **THEN** the tool returns a structured error with setup instructions

## MODIFIED Requirements

### Requirement: Tiered Tool Discovery in Agent Instructions Response

The `epf_agent_instructions` MCP tool response SHALL include a `tool_tiers` section that organizes all MCP tools into three discovery tiers. This reduces cognitive overload for agents scanning the tool listing and provides a clear "start here" signal.

The tiers SHALL be:

| Tier | Label | Tools | Purpose |
|------|-------|-------|---------|
| 1 | Essential | `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file`, `epf_memory_status` | Entry points — always start here |
| 2 | Guided | `epf_get_wizard`, `epf_get_template`, `epf_get_schema`, `epf_validate_with_plan`, strategy query tools (`epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary`, `epf_search_strategy`, `epf_get_competitive_position`, `epf_get_value_propositions`), graph query tools (`epf_graph_list`, `epf_graph_similar`), quality tools (`epf_quality_audit`, `epf_suggest_enrichment`) | Use after Tier 1 directs you or when querying strategy context |
| 3 | Specialized | All remaining MCP tools | Use for specific tasks as needed |

Each tool entry in the `mcp_tools` section of the agent instructions response SHALL include a `tier` field with value `"essential"`, `"guided"`, or `"specialized"`.

The response SHALL include a `tool_discovery_guidance` field containing explicit text that directs agents to:

1. Start with Tier 1 (Essential) tools
2. Follow tool response suggestions to reach Tier 2 tools
3. Never generate EPF content from pre-training heuristics — always use wizards
4. All tools remain available; tiers indicate recommended workflow, not access control

#### Scenario: Agent instructions include tool tiers

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `tool_tiers` section with three tiers
- **AND** Tier 1 contains `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file`, and `epf_memory_status`
- **AND** each tool in `mcp_tools` has a `tier` field

#### Scenario: Tool discovery guidance is present

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `tool_discovery_guidance` field
- **AND** the guidance explicitly states to start with Tier 1 tools
- **AND** the guidance warns against generating EPF content from pre-training

#### Scenario: Tiers do not restrict tool access

- **WHEN** AI agent reads the tiered tool listing
- **THEN** the tier descriptions explicitly state that all tools remain available
- **AND** tiers indicate recommended workflow order, not access control
