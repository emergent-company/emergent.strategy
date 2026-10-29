## ADDED Requirements

### Requirement: Keyword Search Over Authored Strategy

The system SHALL let `search_strategy` find text in an instance's authored
artifacts without Memory. `search_strategy` SHALL accept an optional `mode` of
`auto` (default), `semantic` or `keyword`.

In `auto`, the system SHALL run semantic search when Memory is configured, and
SHALL run keyword search instead when semantic search returns an error or leaves
no hit after framework and other-instance filtering. When Memory is not
configured, the system SHALL run keyword search.

Keyword search SHALL match query terms against the text of the instance's
current, authored artifacts. A term matches a token that equals it, or that
starts with it when the term has at least four characters. Matching SHALL ignore
case and diacritics.

Each hit SHALL name the section it came from as an artifact and a path that
`get_section` accepts, SHALL carry a snippet of at most 240 characters, and
SHALL carry `match` with the value `keyword` or `semantic`. A hit SHALL be the
smallest object whose own text contains the match, not the artifact.

#### Scenario: Memory is not configured

- **WHEN** a client calls `search_strategy` with the query "Acme 2027" on an
  instance, and Memory is not configured
- **THEN** the call returns hits and no error
- **AND** each hit has `match` set to `keyword`
- **AND** the hit for the Acme key result names its artifact and path, and
  `get_section` on that path returns the key result

#### Scenario: Memory is down

- **WHEN** semantic search returns an error in `auto` mode
- **THEN** the client receives keyword hits
- **AND** the server logs the semantic error at warn level

#### Scenario: Semantic search finds nothing of the instance's own

- **WHEN** every semantic hit is framework content or belongs to another instance
- **THEN** in `auto` mode the client receives keyword hits

#### Scenario: Semantic search is forced

- **WHEN** a client calls `search_strategy` with `mode` set to `semantic`, and
  Memory is not configured
- **THEN** the call returns the unavailable error, as before

#### Scenario: A year finds a date

- **WHEN** a key result states a date as `2027-05-31`
- **AND** a client searches for "2027"
- **THEN** the key result is among the hits

#### Scenario: A word stem

- **WHEN** a client searches for "kvalitet"
- **THEN** a unit containing "kvalitetssikring" is among the hits

#### Scenario: Nothing matches

- **WHEN** no authored text contains any query term
- **THEN** the response is an empty array and not an error
- **AND** the tool description says that an empty result does not mean the
  strategy is silent

### Requirement: Keyword Search Scope

Keyword search SHALL read only the current artifacts of the requested instance
whose integrity class is not a framework class. It SHALL NOT return unmodified
templates, canonical definitions or packaged defaults, and SHALL NOT return
content of another instance.

#### Scenario: Framework content is not searched

- **WHEN** an instance holds an unmodified template containing the word "persona"
  and an authored file that does not
- **AND** a client searches for "persona" with `mode` set to `keyword`
- **THEN** no hit comes from the template

#### Scenario: Another instance

- **WHEN** two instances in one workspace both contain the word "Acme"
- **AND** a client searches the first with `mode` set to `keyword`
- **THEN** every hit names an artifact of the first instance

### Requirement: Keyword Search Is Bounded

Keyword search SHALL return at most 25 hits, 10 by default, and SHALL rank a hit
by the share of distinct query terms it contains. A query with no usable term
after dropping one-character terms and stop words SHALL return an empty array.

#### Scenario: Limit

- **WHEN** a client asks for 100 hits
- **THEN** at most 25 are returned

#### Scenario: Only stop words

- **WHEN** a client searches for "what is the"
- **THEN** the response is an empty array
