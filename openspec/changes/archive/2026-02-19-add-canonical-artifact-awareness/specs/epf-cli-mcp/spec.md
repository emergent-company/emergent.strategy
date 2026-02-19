## ADDED Requirements

### Requirement: Canonical Artifact Awareness in Health Checks

The system SHALL distinguish between canonical (framework-provided) artifacts and user-authored artifacts when performing health checks and validation.

Canonical tracks are: strategy, org_ops, and commercial. The product track is user-authored.

The system SHALL provide canonical context helper functions that health check code can query to determine whether a given track, file, or artifact is canonical.

Health checks that produce scores (content readiness, coverage analysis, feature quality, relationship integrity) SHALL compute separate metrics for canonical and product tracks. The overall health score SHALL weight product track artifacts more heavily than canonical track artifacts.

Content readiness checks SHALL NOT produce TBD/TODO/placeholder warnings for canonical artifacts that ship with `active: false` or with intentionally minimal content.

Coverage analysis SHALL NOT penalize overall scores for canonical tracks having lower feature coverage than the product track.

AIM health diagnostics (LRA staleness, evidence gaps) SHALL apply appropriate thresholds for canonical tracks that may not have the same level of assessment activity as the product track.

All canonical-awareness logic SHALL be centralized in a reusable helper (not scattered across individual check files) to ensure consistency and ease of maintenance.

#### Scenario: Health check on instance with canonical and product artifacts

- **WHEN** AI agent calls `epf_health_check` on an instance containing both product track and canonical track (strategy, org_ops, commercial) artifacts
- **THEN** the response distinguishes canonical from product track results
- **AND** canonical track artifacts do not produce false positive warnings for expected minimal content
- **AND** the overall health score primarily reflects product track artifact quality

#### Scenario: Content readiness with canonical definitions

- **WHEN** AI agent calls `epf_health_check` on an instance where canonical definitions contain `active: false` or TBD placeholders
- **THEN** the content readiness section does not report warnings for those canonical artifacts
- **AND** the content readiness score reflects only user-authored artifact completeness

#### Scenario: Coverage analysis with canonical tracks

- **WHEN** AI agent calls `epf_health_check` on an instance where strategy/org_ops/commercial tracks have fewer features than the product track
- **THEN** the coverage analysis does not penalize the overall score for canonical track gaps
- **AND** canonical track coverage is reported separately from product track coverage

#### Scenario: Health check on product-only instance

- **WHEN** AI agent calls `epf_health_check` on an instance with only product track artifacts (no canonical tracks)
- **THEN** the health check behaves identically to current behavior
- **AND** no canonical-awareness logic changes the results

---

### Requirement: Canonical Definition Embedding and Init

The system SHALL embed canonical track definitions (strategy sd-*, org_ops pd-*, commercial cd-*) in the CLI binary alongside the already-embedded value model templates.

The `epf_init_instance` tool SHALL create canonical definitions when initializing new EPF instances, using the same 3-tier loading priority as value model templates: instance files > `canonical_path` config > embedded fallback.

The `scripts/sync-embedded.sh` script SHALL sync canonical definitions from the upstream `canonical-epf` repository into the embedded templates directory.

#### Scenario: Init creates canonical definitions

- **WHEN** AI agent calls `epf_init_instance` with `path` and `product_name`
- **THEN** the tool creates canonical definitions for strategy, org_ops, and commercial tracks in the READY directory
- **AND** the created definitions match the embedded canonical content
- **AND** value model templates continue to be created as before

#### Scenario: Init dry run includes canonical definitions

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the returned file list includes canonical definitions that would be created
- **AND** the preview shows the canonical definition content

#### Scenario: Init with canonical_path override

- **WHEN** AI agent calls `epf_init_instance` and the EPF config specifies a `canonical_path`
- **THEN** canonical definitions are loaded from that path instead of the embedded fallback
- **AND** this follows the same 3-tier priority used for value model templates

## MODIFIED Requirements

### Requirement: Health Report Generation via MCP

AI agents SHALL be able to generate comprehensive health reports via the `epf_generate_report` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `format` (optional: markdown/html/json), `verbose` (optional)
- Run all health checks and compile results
- Return report content in requested format (not write to file)
- Include value model semantic quality scores when Product track value models exist
- Distinguish canonical track results from product track results in the report output

The report SHALL include the following sections when applicable:
- Structure validation (existing)
- Schema validation (existing)
- Content readiness (existing, now canonical-aware)
- Feature quality (existing, now canonical-aware)
- Relationship integrity (existing, now canonical-aware)
- **Value model quality** (existing — scores, warnings, and check results from semantic analysis)
- **Canonical artifact status** (new — summary of embedded canonical artifacts and their integrity)

#### Scenario: Generate markdown health report

- **WHEN** AI agent calls `epf_generate_report` with `format="markdown"`
- **THEN** the tool returns a complete health report in markdown format
- **AND** includes all check results and recommendations
- **AND** includes value model quality section when value models exist
- **AND** labels canonical vs product track sections when both are present

#### Scenario: Generate report with value model quality warnings

- **WHEN** AI agent calls `epf_generate_report` on an instance with product-catalog value models
- **THEN** the report includes a "Value Model Quality" section
- **AND** the section shows the quality score, check results, and specific warnings
- **AND** the report includes actionable recommendations referencing the structural anti-patterns guide

#### Scenario: Generate report with canonical artifact summary

- **WHEN** AI agent calls `epf_generate_report` on an instance with canonical track artifacts
- **THEN** the report includes a "Canonical Artifact Status" section
- **AND** the section lists which canonical definitions and value models are present
- **AND** canonical track scores are reported separately from product track scores
