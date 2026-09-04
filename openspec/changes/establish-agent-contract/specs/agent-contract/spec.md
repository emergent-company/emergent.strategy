# agent-contract

> The cross-repo contract for describing an agent, reaching it, and delegating to
> it safely. Engine-neutral and transport-neutral by construction: it must be
> satisfiable by ADK `agentregistry`, ACP, and `ManifestBot` alike, because all
> three already exist in the estate.

## ADDED Requirements

### Requirement: Every agent publishes a self-description

A service exposing an agent SHALL publish a machine-readable description of it,
generated from the service's own model rather than hand-authored.

Hand-authored descriptions rot, and a central list of other services' capabilities
rots fastest. The description SHALL declare identity, capabilities, how to reach the
agent, and what it may do without human approval.

#### Scenario: The description is generated, not authored

- **GIVEN** a service exposing an agent
- **WHEN** the service's capabilities change
- **AND** its self-description is regenerated
- **THEN** the description reflects the change with no manual editing

#### Scenario: Drift fails the build

- **GIVEN** a service whose committed self-description is stale
- **WHEN** its CI runs
- **THEN** the drift is reported as a failure

#### Scenario: Write capability is declared

- **GIVEN** an agent that can stage changes
- **WHEN** its self-description is read
- **THEN** it declares that it stages rather than commits
- **AND** an agent with no write capability is distinguishable from one that has it

### Requirement: An agent is reachable as a capability of another agent

A published agent SHALL be invocable by another agent such that the calling model
sees it as an available capability rather than as a separate system.

#### Scenario: A remote agent appears as a tool

- **GIVEN** a remote agent declared in a self-description
- **WHEN** a calling agent loads its available capabilities
- **THEN** the remote agent's capabilities are available to the calling model
- **AND** the calling model requires no knowledge of the transport

#### Scenario: An unreachable agent degrades

- **GIVEN** a declared remote agent that cannot be reached
- **WHEN** a calling agent attempts to use it
- **THEN** the caller continues with its remaining capabilities
- **AND** the failure is reported rather than silently producing a partial answer

The second clause matters more than it appears: a delegation that silently returns
nothing is invariant 1's failure mode — a confident answer on a partial view.

### Requirement: Delegated changes are staged in the owning service and reviewed by the initiating human

A change prepared by a delegated agent SHALL be staged in the service that owns the
data, SHALL surface to the human who initiated the originating request, and SHALL
NOT be committed by any agent.

This extends the estate-wide *AI proposes, human commits* invariant across a
delegation boundary, which is the case none of the five implementations currently
covers.

#### Scenario: A delegated change reaches the initiating human

- **GIVEN** a human working with agent A
- **AND** agent A delegates to agent B in another service
- **WHEN** agent B prepares a change
- **THEN** the change is staged in B's service
- **AND** it appears in the initiating human's review queue
- **AND** neither agent commits it

#### Scenario: Delegation carries the initiating identity

- **GIVEN** a delegated call
- **WHEN** the receiving service authorises it
- **THEN** it authorises against the initiating principal, not the calling service
- **AND** it applies its own authorisation rules

#### Scenario: An unauthenticated caller gains no capability by delegating

- **GIVEN** an agent serving an anonymous session
- **WHEN** it delegates to an agent requiring an authenticated principal
- **THEN** the delegated call is refused
- **AND** the refusal is reported as an ordinary outcome, not an error

#### Scenario: Refusal is a normal outcome

- **GIVEN** a delegated request the receiving agent declines
- **WHEN** the calling agent receives the refusal
- **THEN** it continues and reports the refusal
- **AND** the refusal is recorded on both sides

#### Scenario: The delegation chain is auditable

- **GIVEN** a staged change produced through delegation
- **WHEN** an operator inspects it
- **THEN** the acting agent, the initiating principal, and the delegation chain are
  recoverable

### Requirement: A service publishes its own model for agents to consume

A service SHALL publish a machine-readable model of what it contains and what can be
done with it, sufficient for an agent that did not ship with the service to use it
competently.

The alternative is embedding one service's knowledge in another service's prompt,
which is the master-list-that-rots failure this contract exists to prevent.

#### Scenario: A remote agent can act without embedded knowledge

- **GIVEN** an agent from another service
- **WHEN** it reads the published self-model
- **THEN** it can determine what operations exist and what they require
- **AND** it needs no hardcoded knowledge of that service

#### Scenario: The self-model tracks the service

- **GIVEN** a service whose capabilities change
- **WHEN** the self-model is regenerated
- **THEN** it reflects the change
- **AND** stale published models are detectable
