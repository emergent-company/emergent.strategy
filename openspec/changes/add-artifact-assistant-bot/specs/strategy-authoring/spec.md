## ADDED Requirements

### Requirement: The Authoring Agent Cannot Commit

The authoring agent SHALL have no capability to commit a change to current state. Its
write tools SHALL stage changes and return a review reference, and applying them SHALL
require a separate human action.

This extends the estate-wide *AI proposes, human commits* invariant to a model-planned
agent, where the chain of tool calls is chosen by the model rather than by code and so
cannot be audited by reading the step list.

#### Scenario: A write tool stages rather than commits

- **WHEN** the agent uses a write tool
- **THEN** a batch is staged and a review reference is returned
- **AND** current state is unchanged until a human commits

#### Scenario: No commit capability is reachable

- **WHEN** the agent's available tools are enumerated at execution time
- **THEN** no tool that commits, discards, or otherwise applies a staged batch is
  present

#### Scenario: Write gating is enforced independently of tool advertisement

- **WHEN** a call is made to a tool that was not advertised to the model for this turn
- **THEN** the call is refused at execution time

#### Scenario: An unevaluable gate refuses the call

- **WHEN** a write tool's gate cannot be evaluated
- **THEN** the tool does not execute

### Requirement: Agent Write Tools Return References, Not Payloads

Tools that operate on artifacts SHALL return a reference and a summary rather than a
whole artifact payload, so that large objects do not enter the conversation record.

#### Scenario: A whole-payload result is not placed in the conversation

- **WHEN** a tool operates on an artifact whose payload is large
- **THEN** the conversation record carries a reference and a summary
- **AND** the payload remains retrievable through that reference

### Requirement: Delegated Changes Record Their Delegation Chain

A change staged as a result of one agent delegating to another SHALL record the acting
agent, the initiating principal, and the delegation chain, so that "which agent, acting
for whom, staged this" is answerable after the fact.

#### Scenario: A delegated staged change is attributable

- **WHEN** a batch is staged as a result of a delegated call
- **THEN** the acting agent, the initiating principal and the chain are recoverable
  from the batch

#### Scenario: Direct staging is unaffected

- **WHEN** a batch is staged without delegation
- **THEN** no delegation chain is recorded
- **AND** existing readers of the batch's creator field behave exactly as before

#### Scenario: A delegated change reaches the initiating human

- **WHEN** an agent delegates to another agent and that agent stages a change
- **THEN** the change surfaces for review by the human who initiated the original
  request, in the service that owns the data

#### Scenario: Refusal is an ordinary outcome

- **WHEN** a delegated call is refused
- **THEN** the refusal is recorded and the calling agent continues and reports it,
  rather than treating it as a failure or retrying under a different identity
