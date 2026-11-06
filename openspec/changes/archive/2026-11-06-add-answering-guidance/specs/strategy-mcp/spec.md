## ADDED Requirements

### Requirement: Answering Guidance In The Outline

The system SHALL carry guidance on how to answer in the whole-instance outline
returned by `get_outline`. The guidance SHALL have two parts:

- `how_to_answer`: the general rules for answering questions from a company's
  strategy, held in the server. They SHALL state at least: follow a read that
  came back over budget; run a keyword search before saying the strategy does
  not state something; collect across tracks for a question about a function;
  list the facts read and check the draft against them before sending it; keep
  exact dates, counts and names; say what is undecided, excluded or left to
  someone else; keep "My reading" apart from the strategy and never in place of
  a fact it states; keep internal codes out of the body and name the sources in
  one closing line.
- `company_rules`: the prompt of the skill named `answering-rules` installed in
  that instance, when there is one. It SHALL carry the skill name, the pack
  name, the text, its size in characters and whether it was cut. The text SHALL
  be cut at 8,000 characters and say so. The system SHALL NOT run the skill; the
  text is guidance for the reader.

The guidance SHALL NOT be carried in the outline of a single artifact. The
general rules SHALL NOT name any company, customer or competitor. Rules that
belong to one company (audience, vocabulary, format) SHALL live only in that
instance's pack.

The server instructions SHALL tell the client to follow the guidance in the
outline.

#### Scenario: An instance without the pack

- **WHEN** a client calls `get_outline` for an instance that has no skill named
  `answering-rules`
- **THEN** the response carries `how_to_answer` and no `company_rules`

#### Scenario: An instance with the pack

- **WHEN** a pack that contains a skill named `answering-rules` is installed in
  an instance and a client calls `get_outline` for it
- **THEN** the response carries `company_rules` with the skill's prompt, the
  pack name and the size, and `how_to_answer` is unchanged

#### Scenario: A skill with another name

- **WHEN** an instance has an installed skill that is not named
  `answering-rules`
- **THEN** the outline carries no `company_rules`

#### Scenario: Long company rules

- **WHEN** the skill's prompt is longer than 8,000 characters
- **THEN** `company_rules.text` holds the first 8,000 characters,
  `size_chars` holds the full length and `truncated` is true

#### Scenario: One artifact's outline

- **WHEN** a client calls `get_outline` with an `artifact`
- **THEN** the response carries no guidance

### Requirement: Reserved Skill Name Is Discoverable

`describe_pack_format` SHALL list the skill names the server gives a meaning to
(`reserved_skill_names`), each with what it does. It SHALL list `answering-rules`
and say that its prompt is returned by `get_outline` as `guidance.company_rules`,
cut at 8,000 characters, and never run.

#### Scenario: A pack author asks for the format

- **WHEN** a client calls `describe_pack_format`
- **THEN** the response lists `answering-rules` with its effect

### Requirement: Objectives View Returns The Whole Index

The `objectives` view SHALL use a default budget of 24,000 characters when the
caller gives no `max_chars`, so that one call returns every objective and key
result of a roadmap of the size measured in the pilot (about 15,000
characters). An explicit `max_chars` SHALL be honoured, and the cap of 40,000
SHALL stay.

#### Scenario: A roadmap over the general default

- **WHEN** a roadmap's objectives index is 15,000 characters and a client calls
  the `objectives` view without `max_chars`
- **THEN** the response carries every key result and is not truncated

#### Scenario: An explicit smaller budget

- **WHEN** the same call gives `max_chars` 5,000
- **THEN** the part is truncated and lists the tracks as children
