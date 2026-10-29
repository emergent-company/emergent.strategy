## ADDED Requirements

### Requirement: Content Integrity Classification

The system SHALL classify each current artifact of an instance as authored or as
one of the framework-content classes `canonical_reference`,
`unmodified_template`, `packaged_default`, `template_values` or
`near_canonical`, and SHALL store the class and a reference to the canonical
item it matched on the artifact.

Classification SHALL compare normalised parsed content (parsed, round-tripped
through JSON, key-sorted, hashed) against a manifest of hashes for every
canonical release, so content from an older release is recognised. When the
manifest is unavailable the system SHALL fall back to the current embedded
canonical content and SHALL report that in the integrity summary.

Classification SHALL run on every path that writes artifacts: commits, CLI
import, GitHub import, the canonical definitions installer, scaffold, and
version restore. An artifact listed under `adopted_canonical` in the instance
anchor SHALL be treated as authored.

#### Scenario: Unmodified canonical definition is imported

- **WHEN** an instance is imported that contains `pd-031-recruiting-process.yaml`
  structurally identical to the canonical definition of any known release
- **THEN** the artifact's class is `canonical_reference`
- **AND** its reference names the canonical item and release

#### Scenario: Authored artifact is left alone

- **WHEN** an imported artifact differs from every canonical item
- **THEN** its class is empty, meaning authored or unknown

#### Scenario: Content from an older release

- **WHEN** an imported definition matches no current hash but matches a hash from
  an earlier release
- **THEN** its class is `canonical_reference`
- **AND WHEN** it matches no hash but shares its `id` and at least 90 percent of
  its leaf values with a canonical item
- **THEN** its class is `near_canonical`

#### Scenario: Adopted on purpose

- **WHEN** an unmodified canonical definition is listed under `adopted_canonical`
- **THEN** it is treated as authored and is served as the instance's own content

### Requirement: Content Integrity Findings

`check_content_readiness` SHALL scan all current artifacts, not only features,
and SHALL report framework content as findings in the shared verdict envelope
using the rule ids `integrity.canonical_reference`,
`integrity.unmodified_template`, `integrity.packaged_default`,
`integrity.template_values` and `integrity.near_canonical`.

Integrity findings SHALL be advisory: severity `warning` or `info`, never
`error`, so `ok` is unchanged by them. Canonical reference findings SHALL be
aggregated per track with a count and a capped key list, so 131 definitions
produce a handful of findings and not 131.

When an instance has no features, `check_content_readiness` SHALL NOT report a
readiness score. Its summary SHALL say that there were no features to score, and
`counts.checked` SHALL reflect the artifacts examined.

`health_check` SHALL include a `content_integrity` block with the count of
artifacts per class. `health_check` SHALL continue to return no verdict.

#### Scenario: Scaffolded instance with templates

- **WHEN** `check_content_readiness` runs on an instance holding the unmodified
  READY, AIM and product value-model templates
- **THEN** each produces an `integrity.unmodified_template` finding with severity
  `warning`
- **AND** `ok` remains `true`

#### Scenario: Canonical definitions are expected

- **WHEN** an instance holds 131 unmodified canonical definitions
- **THEN** the findings contain one `integrity.canonical_reference` finding per
  track, with severity `info`, a count and a capped list of keys

#### Scenario: Instance with no features

- **WHEN** `check_content_readiness` runs on an instance with no features
- **THEN** the summary states that no features were scored
- **AND** no "average readiness 0/100" figure is reported

### Requirement: Answer-Facing Reads Exclude Framework Content

The system SHALL NOT present `canonical_reference` or `unmodified_template`
artifacts as the instance's strategy in answer-facing reads.

Structured list reads SHALL exclude them by default and offer an option to
include them. Single-artifact reads SHALL return a structured not-defined result,
with the reason, in place of an unmodified template. Semantic search SHALL
exclude them by default. Export, versioning, ripple, watchdog and alignment SHALL
include them, so synchronisation to GitHub is unchanged.

`get_definition` and `list_definitions` SHALL keep serving canonical definitions
as framework content.

#### Scenario: Strategy context read

- **WHEN** a client calls `get_strategy_context` for an instance that holds 131
  unmodified definitions and six authored READY files
- **THEN** only the authored artifacts are returned
- **AND** the response states how many framework artifacts were left out

#### Scenario: Part of the strategy is a template

- **WHEN** a client reads the product value model and the instance holds only the
  placeholder
- **THEN** the response says the part is not defined, with the reason
- **AND** the template's layers and components are not returned

#### Scenario: Search

- **WHEN** a client searches for "recruiting process" in an instance whose only
  match is the unmodified canonical `pd-031`
- **THEN** that artifact is not among the results

#### Scenario: Export is unchanged

- **WHEN** an instance is exported for GitHub push
- **THEN** every artifact is included, flagged or not

### Requirement: Server Instructions State What Is Authoritative

The MCP `instructions` and the tool descriptions SHALL tell a client that:
structured reads are the authoritative source for an instance's strategy;
`search_strategy` is discovery over the instance's own content and its results
are to be confirmed with a structured read; `get_definition`, `list_definitions`
and `get_template` return framework content, not the company's strategy; where a
part is not defined or only a template exists the client says it is not defined
and does not fill it in; and each claim cites the artifact it came from.

#### Scenario: A client lists the instructions

- **WHEN** a client initialises a session
- **THEN** the instructions contain each of the rules above

#### Scenario: A client lists the tools

- **WHEN** a client lists `search_strategy` and `get_definition`
- **THEN** `search_strategy` describes itself as discovery and points to the
  structured tools
- **AND** `get_definition` describes itself as framework content
