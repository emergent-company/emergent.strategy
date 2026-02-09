## ADDED Requirements

### Requirement: Strategy Store Interface

The system SHALL provide a pluggable StrategyStore interface that abstracts how EPF artifacts are loaded and queried, enabling different data sources (filesystem, GitHub, etc.) without changing the query API.

#### Scenario: Query strategy from local filesystem

- **WHEN** AI agent calls any strategy query MCP tool
- **AND** the strategy server is configured with FileSystemSource
- **THEN** the tool reads from the local EPF instance directory
- **AND** returns structured strategy data

#### Scenario: Strategy store reload on file change

- **WHEN** an EPF artifact file is modified in the watched directory
- **THEN** the strategy store detects the change within 500ms
- **AND** reloads the affected artifacts
- **AND** subsequent queries return updated data

---

### Requirement: Product Vision Query via MCP

AI agents SHALL be able to query high-level product direction via the `epf_get_product_vision` MCP tool.

The tool SHALL:

- Return the product's vision statement, mission, and purpose
- Include the North Star metrics and targets
- Return structured data suitable for AI consumption

#### Scenario: Get product vision

- **WHEN** AI agent calls `epf_get_product_vision`
- **THEN** the tool returns the vision, mission, and purpose from the EPF North Star artifact
- **AND** includes any defined North Star metrics

#### Scenario: Get vision from incomplete EPF instance

- **WHEN** AI agent calls `epf_get_product_vision`
- **AND** the EPF instance does not have a complete North Star artifact
- **THEN** the tool returns available fields with warnings about missing data

---

### Requirement: Persona Query via MCP

AI agents SHALL be able to query product personas via the `epf_get_personas` and `epf_get_persona_details` MCP tools.

The tools SHALL:

- `epf_get_personas`: Return a list of all personas with summaries (id, name, description, technical_proficiency)
- `epf_get_persona_details`: Accept `persona_id` parameter and return full persona including pain points, narratives, and related value propositions

#### Scenario: List all personas

- **WHEN** AI agent calls `epf_get_personas`
- **THEN** the tool returns a list of all personas defined in the EPF instance
- **AND** each persona includes id, name, description, and technical_proficiency

#### Scenario: Get persona details with pain points

- **WHEN** AI agent calls `epf_get_persona_details` with `persona_id="enterprise-admin"`
- **THEN** the tool returns the full persona definition
- **AND** includes the persona's pain points with severity and workarounds
- **AND** includes current_situation, transformation_moment, and emotional_resolution narratives

#### Scenario: Get persona with related value propositions

- **WHEN** AI agent calls `epf_get_persona_details` with `persona_id="enterprise-admin"` and `include_value_props=true`
- **THEN** the tool returns the persona with its pain points
- **AND** includes value propositions that address those pain points

---

### Requirement: Value Proposition Query via MCP

AI agents SHALL be able to query value propositions via the `epf_get_value_propositions` MCP tool.

The tool SHALL:

- Accept optional `persona_id` parameter to filter by persona relevance
- Return value propositions with their target pain points and differentiators
- Include competitive positioning when available

#### Scenario: Get all value propositions

- **WHEN** AI agent calls `epf_get_value_propositions`
- **THEN** the tool returns all value propositions from the Strategy Formula
- **AND** each value proposition includes description and target pain points

#### Scenario: Get value propositions for specific persona

- **WHEN** AI agent calls `epf_get_value_propositions` with `persona_id="enterprise-admin"`
- **THEN** the tool returns only value propositions relevant to that persona
- **AND** relevance is determined by pain point associations

---

### Requirement: Competitive Position Query via MCP

AI agents SHALL be able to query competitive positioning via the `epf_get_competitive_position` MCP tool.

The tool SHALL:

- Accept optional `competitor` parameter to focus on specific competitor
- Return competitive analysis including strengths, weaknesses, and differentiation
- Include market positioning context

#### Scenario: Get competitive landscape

- **WHEN** AI agent calls `epf_get_competitive_position`
- **THEN** the tool returns the competitive analysis from Strategy Foundations
- **AND** includes identified competitors with their positioning

#### Scenario: Get position against specific competitor

- **WHEN** AI agent calls `epf_get_competitive_position` with `competitor="Competitor A"`
- **THEN** the tool returns focused analysis of that competitor
- **AND** includes differentiation points and competitive advantages

---

### Requirement: Roadmap Query via MCP

AI agents SHALL be able to query roadmap information via the `epf_get_roadmap_summary` MCP tool.

The tool SHALL:

- Accept optional `track` parameter to filter by track (product, strategy, org_ops, commercial)
- Accept optional `cycle` parameter to filter by cycle
- Return OKRs and Key Results with their status and targets

#### Scenario: Get full roadmap summary

- **WHEN** AI agent calls `epf_get_roadmap_summary`
- **THEN** the tool returns an overview of all roadmap tracks
- **AND** includes OKR counts and high-level status per track

#### Scenario: Get roadmap for specific track

- **WHEN** AI agent calls `epf_get_roadmap_summary` with `track="product"`
- **THEN** the tool returns OKRs for the product track
- **AND** includes Key Results with targets and current status

#### Scenario: Get current cycle roadmap

- **WHEN** AI agent calls `epf_get_roadmap_summary` with `cycle="current"`
- **THEN** the tool returns only OKRs and KRs for the current cycle
- **AND** current cycle is determined from roadmap metadata

---

### Requirement: Strategy Search via MCP

AI agents SHALL be able to search across all strategy artifacts via the `epf_search_strategy` MCP tool.

The tool SHALL:

- Accept a `query` parameter for the search term
- Search across all strategy content (vision, personas, value props, roadmap, features)
- Return ranked results with artifact type, title, and relevant snippet

#### Scenario: Search for topic across strategy

- **WHEN** AI agent calls `epf_search_strategy` with `query="enterprise security"`
- **THEN** the tool returns matching artifacts across all strategy content
- **AND** results are ranked by relevance
- **AND** each result includes artifact_type, artifact_id, title, snippet, and score

#### Scenario: Search with no results

- **WHEN** AI agent calls `epf_search_strategy` with a query that matches no content
- **THEN** the tool returns an empty results array
- **AND** includes a message suggesting alternative searches or broader terms

---

### Requirement: Strategic Context Synthesis via MCP

AI agents SHALL be able to get synthesized strategic context for a topic via the `epf_get_strategic_context` MCP tool.

The tool SHALL:

- Accept a `topic` parameter describing what context is needed
- Synthesize relevant information from across EPF artifacts
- Return a structured context object suitable for grounding AI responses

#### Scenario: Get context for feature development

- **WHEN** AI agent calls `epf_get_strategic_context` with `topic="user authentication"`
- **THEN** the tool returns synthesized context including relevant personas, pain points, value propositions, and roadmap items
- **AND** context is organized to help AI agents understand strategic importance

#### Scenario: Get context for customer communication

- **WHEN** AI agent calls `epf_get_strategic_context` with `topic="pricing strategy"`
- **THEN** the tool returns competitive positioning, value propositions, and target personas
- **AND** highlights key differentiators and messaging points

---

### Requirement: Strategy Server CLI Commands

The system SHALL provide minimal CLI commands for strategy server management (not query duplication).

The commands SHALL:

- `epf strategy serve` - Start the strategy server as a long-running MCP server
- `epf strategy status` - Show what's loaded in the strategy store (artifact counts, last reload)
- `epf strategy export` - Export combined strategy document in markdown format

#### Scenario: Start strategy server

- **WHEN** user runs `epf strategy serve`
- **THEN** the strategy server starts and loads the EPF instance
- **AND** begins serving MCP requests via stdio
- **AND** watches for file changes if `--watch` flag is provided

#### Scenario: Check strategy server status

- **WHEN** user runs `epf strategy status`
- **THEN** the CLI shows loaded artifact counts (personas, features, value props, etc.)
- **AND** shows last reload timestamp
- **AND** shows any warnings about missing or invalid artifacts

#### Scenario: Export strategy document

- **WHEN** user runs `epf strategy export`
- **THEN** the CLI outputs a combined markdown document
- **AND** includes all strategy artifacts in a readable format
- **AND** supports `--output` flag for writing to file

---

### Requirement: Lazy Loading for CLI Performance

The system SHALL use lazy loading to ensure strategy server features do not impact existing CLI command performance.

#### Scenario: Validate command performance unchanged

- **WHEN** user runs `epf validate <file>`
- **THEN** the strategy store is NOT loaded
- **AND** command completes within existing performance bounds (~200-300ms)

#### Scenario: Strategy commands load strategy store

- **WHEN** user runs any `epf strategy *` command
- **THEN** the strategy store is loaded on first access
- **AND** subsequent strategy commands reuse the loaded store
