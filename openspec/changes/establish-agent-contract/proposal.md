# Change: Establish the cross-repo agent contract

> **Baseline:** `docs/UNIFIED_AGENT_ARCHITECTURE.md` §3 (federation) and open
> questions 3, 4 and 5.
>
> **Cross-repo.** strategy-server implements first and proves the contract; the
> artifact is intended for `opencode-harness`, `21st-bot`/`21st-captable`,
> `emergent.memory` and `sequence`. Per `docs/AI_RUNTIME_CONSOLIDATION.md`
> decision 5, this consolidates on **interfaces and conventions**, not a shared
> module.

## Why

Four agent-card mechanisms are being built independently across the estate:

| Mechanism | Where | State |
|---|---|---|
| ACP agent cards — `/acp/v1/agents/:name/runs` + `/resume`, `Visibility: external` | `emergent.memory` | **shipped and working** |
| `ManifestBot{endpoint, protocol, tools[]}` + `AppManifest` | `21st-bot` | discovery shipped, delegation stubbed |
| `agentregistry` (`Card`, `Skill`, `Interface`, `Protocol`) + `remoteagent` + `agenttool` + `mcptoolset` | **ADK, v1.2.0 and v2.2.0** | ships in a dependency two repos already have; **used by nobody** |
| "Agent Handoff Protocol" / `agent-interface` | `21st-captable` | archived spec, tasks marked done, **zero code** |

None knows about the others. `21st-bot` is specifying what `emergent.memory` has
already built, while both have ADK's version on disk unused.

**The problem this must solve is not transport.** Transport is solved three times
over. It is **federated approval**:

> When agent A delegates to agent B, and B stages a batch — whose gate does it land
> in, whose identity authorised it, and whose audit trail records it?

All five repos independently converged on *AI proposes, human commits*. None has
designed what that means across a delegation boundary. The mismatch is concrete
today: `21st-bot`'s surface is anonymous; `21st-captable`'s chat is company-scoped
and Auth0-required. The 21st design defers this explicitly (*"Auth/tenancy between
bots… a later concern"*).

Because the staging spine is the one primitive everyone already agrees on, this is
the highest-value thing to design once.

### Why strategy-server implements it first

It is the only repo whose near-term roadmap contains both a code-planned agent (AIM)
and a model-planned agent (the authoring bot). If the one-agent-type claim in the
baseline is wrong, it fails here first and cheapest — which is the point of leading.

## What Changes

### 1. The agent card

- **ADD** a self-description for each agent this server exposes: identity, what it
  can do, how to reach it, and what it may do without human approval.
- **RECONCILE** rather than invent. The shape must be expressible in all three live
  mechanisms — ADK `agentregistry.Card`/`Skill`, ACP's agent card, and
  `ManifestBot`. Where they disagree, prefer ADK's, because adopting it makes
  `agenttool` and `remoteagent` work for free and because it is the only one already
  written by someone outside the estate.
- **ADD** generation from the service's own model, never hand-authoring. This is
  `21st-bot`'s rule and it is the right one: *"Each app is the single source of
  truth for its own self-description… enforced by a check in their own CI, not by a
  central editor."* Hand-authored cards rot; `21st-bot`'s `sources.go` curated
  fallbacks are already the master list its own design set out to avoid.
- **ADD** a CI drift check, following `tools/genmanifest -check`.

### 2. The service self-model as a published artifact

- **ADD** publication of strategy-server's own self-model — the navigation graph,
  artifact types and their schemas, the tool catalogue with categories — as a
  machine-readable artifact rather than an internal detail.
- `21st-captable` is the reference for richness (nav graph with `DataHints`,
  `ChatActions`, guards; feature KB mapping features → tools). strategy-server has
  the raw material — the MCP tool catalogue with 14 categories, the canonical EPF
  schemas, the phase structure — but publishes none of it.
- This is what makes an agent *service-self-aware* rather than prompt-stuffed, and
  it is what a remote agent needs in order to use this service competently.

### 3. Delegation transport

- **ADD** MCP-over-HTTP as the delegation transport, if evaluation confirms it.
  Rationale: everyone already speaks MCP; strategy-server already serves it over
  streamable HTTP at `/mcp`; and ADK's `mcptoolset` then makes a remote agent's
  tools appear as local tools with no bespoke client.
- **Note the gap this closes for 21st:** neither 21st repo has MCP over HTTP (stdio
  only) or any MCP client, which is blocker 2 of their three.

### 4. Federated approval (the substantive part)

- **ADD** semantics for a delegated staged batch:
  - **Whose gate.** A batch staged by a delegated agent surfaces in the *initiating*
    user's review queue, in the service that owns the data.
  - **Whose identity.** The delegated call carries the initiating principal; the
    receiving service authorises against its own rules and may refuse. An anonymous
    caller cannot obtain authenticated capability by delegation.
  - **Whose audit.** Both sides record the turn; the batch records the delegation
    chain, so "which agent, acting for whom, staged this" is answerable.
  - **Refusal is normal.** B may decline to stage, and A must handle that as an
    ordinary outcome rather than an error.
- **ADD** the degenerate case explicitly: an agent with an empty write set can be
  delegated to safely by anyone, which is why knowledge-only agents federate before
  execution agents do. This is the sequencing key for 21st.

### 5. Reference implementation

- **ADD** AIM and the authoring bot as two agents under one contract, with cards,
  exercising the claim that they differ only in who plans the chain.
- **ADD** one end-to-end delegation, even if trivially scoped, so the contract is
  proven by use and not only by document.

## Impact

- **Affected specs:** new `agent-contract` capability; touches `strategy-mcp`
  (HTTP delegation surface) and `strategy-serving` (self-model publication).
- **Affected code:** new `internal/agentcard` or equivalent; MCP server for the
  remote-tool surface; a generator plus CI drift check.
- **Cross-repo:** the artifact is the contract document. Adoption elsewhere is out
  of scope here and belongs to each repo, per the distributed-ownership rule.

## Non-goals

- A shared Go module. Baseline §4.1: three ADK majors on three Go toolchains means a
  shared module **must not import ADK**. Vendor the contract types, as `21st-bot`'s
  adoption checklist already instructs.
- Migrating any other repo. This produces something adoptable, and proves it once.
- Replacing `emergent.memory`'s ACP. If ACP already satisfies the contract, the
  right outcome is to say so and adopt it — that is a success, not a loss.
- Solving `21st-bot`'s blocker 3 (its catalog pipeline discards the `bot` block).
  That is theirs to fix; this change should make it obvious what to keep.
