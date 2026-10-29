## ADDED Requirements

### Requirement: Strategy Outline Read

The system SHALL provide `get_outline` returning, for an instance, which
strategy artifacts are defined, and for each its top-level sections with their
size in characters, a one-line gist, and the tool and path that read the
section. With an artifact argument it SHALL descend one level.

An artifact that is not authored (an unmodified template or canonical content)
SHALL be reported as not defined, with the reason.

#### Scenario: Outline of an instance

- **WHEN** a client calls `get_outline` on an instance with six authored READY
  artifacts and 131 canonical definitions
- **THEN** the response lists the six artifacts with their sections and sizes
- **AND** the response is a few kilobytes
- **AND** the definitions are not listed as strategy

#### Scenario: A part is a template

- **WHEN** an artifact in the instance is an unmodified template
- **THEN** the outline reports it as not defined, with the reason

### Requirement: Bounded Section Read

The system SHALL provide `get_section` returning the subtree of an artifact at a
dot-separated path, with array items selectable by position, id or name. The
root wrapper key of an artifact SHALL be transparent.

The response SHALL be bounded by `max_chars`, default 12,000 and capped at
40,000. When the subtree is over budget, the response SHALL return the children
with sizes and gists for an object, or whole items that fit with a next index and
a remaining count for an array, and SHALL set `truncated`. The response SHALL NOT
cut an item and SHALL NOT truncate without saying so.

Every response SHALL carry `defined`, the source artifact and path, `size_chars`,
`truncated`, `cite_as` and `labels`. When the path is unknown, `defined` SHALL be
`false` with the nearest valid children, not an error and not a guess.

#### Scenario: Small section

- **WHEN** a client reads `mission.boundaries` of the north star
- **THEN** the subtree is returned whole
- **AND** `truncated` is `false` and `size_chars` is reported

#### Scenario: Item by id

- **WHEN** a client reads `tracks.commercial.okrs[id=okr-c-001]` of the roadmap
- **THEN** only that objective is returned

#### Scenario: Oversize section

- **WHEN** a client reads a section whose content exceeds the budget
- **THEN** the response lists its children with sizes and sets `truncated`
- **AND** no child is cut in the middle

#### Scenario: Unknown path

- **WHEN** a client reads a path that does not exist
- **THEN** `defined` is `false` and the nearest valid children are listed
- **AND** no content is invented

#### Scenario: Readable labels

- **WHEN** the returned content mentions key result and objective identifiers
  defined in the instance
- **THEN** `labels` maps each to its readable name
- **AND** identifiers with no source in the instance are not given a label

### Requirement: Question-Shaped Views

The system SHALL provide `get_view` for answers that span artifacts: positioning
against a named competitor, the objectives by track, one key result with its
objective, assumptions and dependencies, and the personas. A view SHALL list its
parts, each with its own `defined`, and SHALL apply the same budget and response
fields as `get_section`. A part that is not defined SHALL be reported, not
skipped.

Every path a view reads SHALL exist in the embedded schemas.

#### Scenario: Positioning against one competitor

- **WHEN** a client requests the `competitor` view for a named competitor
- **THEN** the response includes the formula's positioning for that competitor,
  the positioning statement and the landscape entry
- **AND** each part names its source

#### Scenario: Part is missing

- **WHEN** one source of a view is not defined in the instance
- **THEN** that part is returned with `defined: false` and a reason
- **AND** the other parts are returned

### Requirement: Existing Reads Return Bounded Defaults

`get_strategy_context`, `list_artifacts`, `get_roadmap` and
`get_product_vision` SHALL return an outline or a bounded section by default and
return more only when called with an explicit `full` argument, which remains
subject to the hard cap with explicit truncation.
`list_artifacts` SHALL paginate. `get_personas` SHALL return the personas of the
instance. `get_competitive_position` SHALL include the per-competitor
positioning. The descriptions of these tools SHALL state what they return and
name the section reads.

#### Scenario: Strategy context on a large instance

- **WHEN** a client calls `get_strategy_context` on an instance whose artifacts
  total more than 1 MB
- **THEN** the response is an outline within the budget
- **AND** it names the reads that return each section

#### Scenario: Personas

- **WHEN** a client calls `get_personas` on an instance whose personas are in the
  insights artifact
- **THEN** the personas are returned
- **AND** the response does not report that none exist

#### Scenario: A large north star

- **WHEN** a client calls `get_product_vision` on an instance whose north star is
  larger than the default budget
- **THEN** the response is within the budget
- **AND** it lists the sections with their sizes and says it was truncated

#### Scenario: Explicit full read

- **WHEN** a client passes `full` to `get_roadmap`
- **THEN** the roadmap payload is returned up to the hard cap
- **AND** any truncation is flagged

### Requirement: Search Results Point To Reads

Each `search_strategy` hit SHALL carry the artifact type, the path, the size of
the section and the read tool and arguments that return it, so a client can move
from discovery to an authoritative read in one call.

#### Scenario: From a hit to a read

- **WHEN** a client searches and receives a hit
- **THEN** the hit names the read that returns its section and the size of that
  section

### Requirement: Read Tools Are Visible Without A Filter Call

`get_outline`, `get_section` and `get_view` SHALL be in the always-visible core
category and SHALL be classified as read access. Sessions authenticated with a
read-only token SHALL NOT list write tools in `tools/list` by default. This SHALL
NOT be treated as an access control: every call remains checked by the access
gate.

`get_agent_for_task` SHALL route questions about what the strategy says to these
reads.

#### Scenario: First tool list

- **WHEN** a client initialises and lists tools without calling `set_tool_filter`
- **THEN** `get_outline`, `get_section` and `get_view` are listed

#### Scenario: Read-only session

- **WHEN** a session authenticated with a read-only token lists tools
- **THEN** write tools such as `commit_batch` are not listed
- **AND** calling one anyway is still refused by the access gate

### Requirement: Read Budgets Are Verified

The system SHALL be tested so that no read tool returns more than the hard cap
unless asked for a full payload, on an instance of more than 1 MB, and so that
every question location recorded in the question bank is reachable in at most two
calls, each within the default budget.

#### Scenario: Budget contract

- **WHEN** the contract test calls every read tool on a fixture larger than 1 MB
- **THEN** no response exceeds the cap without an explicit `full`
- **AND** every truncation is flagged

#### Scenario: Acceptance table

- **WHEN** the acceptance test walks the recorded question locations
- **THEN** each is reachable in two calls or fewer within the default budget
