## ADDED Requirements

### Requirement: Value Model Semantic Quality Validation via MCP

AI agents SHALL be able to assess value model semantic quality via the `epf_health_check` MCP tool's value model quality section.

The system SHALL perform the following heuristic checks on Product track value models:

1. **Product-Name Collision Detection**: Cross-reference L1 layer names and L2 component names against product/brand names from `product_portfolio.yaml`. If >30% of L1 names or >40% of L2 names match (case-insensitive, partial match), emit a WARNING indicating possible product-catalog structure.

2. **One-to-One Mapping Detection**: Analyze `contributes_to` relationships between features and L2 components. If >70% of components have exactly 1 contributing feature AND >70% of features point to exactly 1 component, emit a WARNING indicating the model may lack many-to-many value relationships.

3. **Layer Name Heuristic Analysis**: Flag L1/L2 names containing proper nouns not found in standard vocabulary (likely brand/product names). Emit INFO-level messages for flagged names. Recognize positive signals: process/action words (Transformation, Processing, Delivery, Management) and functional class descriptions (Heat Exchange, Energy Storage).

4. **Multi-File Overlap Detection**: When multiple `product.*.value_model.yaml` files exist, check for overlapping L1 layer purposes or shared product references across files. If significant overlap is detected, emit a WARNING suggesting consolidation.

The system SHALL compute an overall quality score (0-100) as a weighted average:
- No product-name collisions: 30%
- Many-to-many relationship ratio: 20%
- Layer name quality heuristic: 20%
- L2 component diversity per L1: 15%
- L3 distribution evenness: 15%

Quality thresholds:
- 80+: Good (value-delivery-category organization)
- 60-79: Warning (possible structural issues)
- <60: Alert (likely product-catalog anti-pattern)

All checks SHALL emit WARNING or INFO level messages, never ERROR. Quality scores SHALL NOT cause health check failure.

All checks SHALL degrade gracefully when `product_portfolio.yaml` does not exist (skip product-name collision check with INFO message).

#### Scenario: Health check detects product-catalog anti-pattern

- **WHEN** AI agent calls `epf_health_check` on an instance with value model layers named after products
- **THEN** the response includes a "Value Model Quality" section
- **AND** the product-name collision check emits a WARNING with the matching names
- **AND** the overall quality score is below 60

#### Scenario: Health check reports good value model quality

- **WHEN** AI agent calls `epf_health_check` on an instance with properly structured value models
- **THEN** the response includes a "Value Model Quality" section with score 80+
- **AND** no WARNING messages are emitted for value model quality

#### Scenario: Health check with no product portfolio

- **WHEN** AI agent calls `epf_health_check` on an instance without `product_portfolio.yaml`
- **THEN** the product-name collision check is skipped
- **AND** an INFO message indicates the check was skipped due to missing portfolio
- **AND** other quality checks (mapping ratio, name heuristics, overlap) still run

#### Scenario: Health check with no value models

- **WHEN** AI agent calls `epf_health_check` on an instance with no value model files
- **THEN** the "Value Model Quality" section is omitted from the response

---

## MODIFIED Requirements

### Requirement: Health Report Generation via MCP

AI agents SHALL be able to generate comprehensive health reports via the `epf_generate_report` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `format` (optional: markdown/html/json), `verbose` (optional)
- Run all health checks and compile results
- Return report content in requested format (not write to file)
- Include value model semantic quality scores when Product track value models exist

The report SHALL include the following sections when applicable:
- Structure validation (existing)
- Schema validation (existing)
- Content readiness (existing)
- Feature quality (existing)
- Relationship integrity (existing)
- **Value model quality** (new — scores, warnings, and check results from semantic analysis)

#### Scenario: Generate markdown health report

- **WHEN** AI agent calls `epf_generate_report` with `format="markdown"`
- **THEN** the tool returns a complete health report in markdown format
- **AND** includes all check results and recommendations
- **AND** includes value model quality section when value models exist

#### Scenario: Generate report with value model quality warnings

- **WHEN** AI agent calls `epf_generate_report` on an instance with product-catalog value models
- **THEN** the report includes a "Value Model Quality" section
- **AND** the section shows the quality score, check results, and specific warnings
- **AND** the report includes actionable recommendations referencing the structural anti-patterns guide
