## ADDED Requirements

### Requirement: Strategy Context Is Navigable

The system SHALL let a client discover what an instance defines before reading
it, and read any section by name within a size budget, so that reading strategy
context does not require loading whole artifacts. Reading strategy context
SHALL report parts that are not defined as not defined, and SHALL NOT return
framework content as the instance's strategy.

#### Scenario: Reading context in steps

- **WHEN** a client wants to answer a question about the strategy
- **THEN** it can list what is defined, read the one section that answers the
  question, and cite it, without loading any whole artifact

#### Scenario: Silent part

- **WHEN** the question concerns a part the instance does not define
- **THEN** the client is told the part is not defined, with the reason
