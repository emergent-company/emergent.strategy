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

### Requirement: Significant Edits Are Reviewed by a Coherence Council Before Staging

The authoring agent SHALL judge whether a proposed edit may affect artifacts other
than the one being changed, and SHALL route such edits through a panel of independent
expert reviewers before staging, rather than relying solely on similarity-score-based
detection.

This exists because similarity-score classification is provably insufficient for
meaning-level changes: a negated or otherwise meaning-inverted sentence shares nearly
all of its words with the original and cannot be distinguished from a trivial edit by
a text-similarity score.

#### Scenario: A meaning-inverting edit triggers council review

- **WHEN** the agent judges a proposed edit as potentially affecting other artifacts
- **THEN** the edit is reviewed by a panel of experts, each producing a verdict with
  reasoning grounded in the actual content of the artifacts it examined
- **AND** the edit is not staged until that review completes

#### Scenario: A trivial edit does not trigger council review

- **WHEN** the agent judges a proposed edit as unlikely to affect other artifacts
- **THEN** the edit is staged directly, without council review

#### Scenario: Council review produces one coordinated batch

- **WHEN** council review results in changes to more than one artifact
- **THEN** those changes are staged under a single batch for combined human review,
  not as separate unrelated batches

#### Scenario: Council verdicts are attributed, not merged

- **WHEN** a batch produced by council review is inspected
- **THEN** the reasoning is attributable to the specific expert that produced it, not
  presented as a single anonymous summary

#### Scenario: The council does not replace existing coherence detection

- **WHEN** a change is committed
- **THEN** the existing post-commit coherence analysis still runs
- **AND** the council's pre-commit review is additional, not a replacement for it

### Requirement: The Agent's Tool Surface Is Scoped, Not the Full Catalogue

The authoring agent SHALL be given a bounded, purpose-scoped set of tools rather than
the full tool catalogue by default.

#### Scenario: A fresh agent session has a bounded tool set

- **WHEN** a new authoring agent conversation begins
- **THEN** the tools available to it are limited to those relevant to authoring, not
  every tool the service exposes

### Requirement: Externally Retrieved Content Is Treated as Data, Not Instructions

Content retrieved by the agent from an external source SHALL be presented to the
model in a way that is distinguishable from instructions, and SHALL NOT be capable of
directly directing the agent's actions.

#### Scenario: Fetched content cannot redirect the agent

- **WHEN** externally retrieved content contains text formatted as an instruction
- **THEN** the agent does not treat it as an instruction to follow

#### Scenario: Research sources are attributed

- **WHEN** the agent uses externally retrieved content in its reasoning
- **THEN** the source is identifiable to the user as external research, distinct from
  the user's own strategy content
