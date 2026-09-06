# Research: reconciling the three live agent-card shapes

> Output of tasks.md §1. Every claim below is sourced from reading the actual
> code, not from the baseline's summary of it — the baseline itself was a
> desk review and its "ADK agentregistry" framing turns out to need a
> correction (see §1.1).

## 1. Correction to the baseline's framing: "ADK's shape" is two different things

`docs/UNIFIED_AGENT_ARCHITECTURE.md` §3 names ADK's card mechanism as
`agentregistry` (`Card`, `Skill`, `Interface`, `Protocol`, `MCPServer`,
`Tool`) and recommends defaulting to "ADK's shape... because it is the only
shape maintained outside the estate." Reading `google.golang.org/adk/v2`
directly (not its docs) shows this conflates two unrelated things:

### 1.1 `agentregistry` is a client for a Google Cloud *hosted service*

`google.golang.org/adk/v2@v2.2.0/agentregistry/registry.go`'s `New(ctx,
Config)` requires `ProjectID` + `Location`, authenticates via Application
Default Credentials, and talks to `agentregistry.googleapis.com` (or its
mTLS variant). This is a **client for Google Cloud's Agent Registry
product** — a paid, region-scoped, ADC-gated service — not an in-process
type registry. Adopting "ADK's shape" in the sense of *using this package*
would mean taking a hard dependency on a specific GCP product for
strategy-server's self-hosted, multi-tenant card publication. That is not
an appropriate reconciled shape regardless of what its types look like.

Its `types.go` (`Card`, `Agent`, `Skill`, `Protocol`, `Interface`,
`MCPServer`, `Tool`, `Annotations`) *is* a plain, dependency-free set of
JSON-tagged structs — importable without pulling in the GCP client at all.
But `Card` itself is telling: `{Type string; Content json.RawMessage}` — a
raw-JSON envelope for "an embedded agent card... e.g. an A2A AgentCard."
**`agentregistry.Card` does not define a card shape; it wraps one.** The
shape it wraps is A2A's.

### 1.2 The card ADK's actual remote-invocation path uses is `a2a.AgentCard`

`agent/remoteagent/a2a_agent.go`'s `NewA2A(cfg A2AConfig)` — what actually
constructs a callable remote `agent.Agent` — takes an `*a2a.AgentCard`
(`github.com/a2aproject/a2a-go`, the Linux Foundation A2A protocol's Go
implementation), not an `agentregistry.Agent`. Confirmed by direct read:
`agentregistry` is never imported by `remoteagent` or `agenttool` at all.

**Verified by probe** (task 1's "verify by probe that agenttool + remoteagent
actually compose" item): `agenttool.New(agent.Agent, *Config) tool.Tool`
(`tool/agenttool/agent_tool.go`) accepts any `agent.Agent`, and
`remoteagent.NewA2A` returns exactly that interface. So `agenttool.New(mustA2A(remoteagent.NewA2A(cfg)), nil)`
genuinely turns a remote A2A agent into a normal tool the calling LLM sees
with no bespoke client — the composition the package layout suggests holds.
This is real, load-bearing evidence for adopting A2A's card shape: it is not
just "a schema ADK also understands," it is **the specific shape that makes
delegation free** in ADK, today, with no adapter code.

**Conclusion:** the reconciled shape should target **A2A's `AgentCard`**
(`github.com/a2aproject/a2a-go/a2a`), not `agentregistry`'s wrapper types.
This sharpens rather than reverses the baseline's instinct — "ADK's shape"
was the right family, but the specific package it named is the wrong layer.

## 2. The three (four) shapes, tabulated

| Field / concept | A2A `AgentCard` | ACP `ACPAgentManifest` | 21st `AppManifest`/`ManifestBot` | `agentregistry.Agent` (for reference only — not the target) |
|---|---|---|---|---|
| Identity (name, description, version) | `Name`, `Description`, `Version` | `Name` (slug), `Description`, `Version` (hardcoded `"0.2.0"`, not per-agent) | `Key`, `Name`, `Summary`, `Description` | `Name`, `DisplayName`, `Description`, `Version` |
| Provider/org | `AgentProvider{Org, URL}` | `ACPProvider{Organization, URL}` — hardcoded `"Emergent"` today | none | none |
| Reachability | `URL` + `PreferredTransport` + `AdditionalInterfaces []{Transport, URL}`; `TransportProtocol` is **documented as non-enum** — custom values (e.g. `"MCP"`) are explicitly permitted | implicit: fixed `/acp/v1/agents/:name/...` route pattern, no card-level URL field | `Bot{Endpoint, Protocol: "mcp"\|"http-chat", Tools []string}` — closed two-value enum, no interface list | `Protocol{Type string, ProtocolVersion, Interfaces}` — `Type` is a free string |
| Capabilities | `AgentCapabilities{Extensions, PushNotifications, StateTransitionHistory, Streaming}` | `ACPCapabilities{Streaming, HumanInTheLoop, SessionSupport}` — fixed struct, always all three keys | none (bot presence is itself the only capability signal) | none at the `Agent` level (tool-level `Annotations` only) |
| Skills / what it can do | `[]AgentSkill{ID, Name, Description, Tags, Examples, InputModes, OutputModes, Security}` — per-skill security and modality overrides | none — manifest is agent-level only, no skill breakdown | `[]ManifestFeature{Feature, Description, Screens, Keywords}` — feature-level, not skill-level; references nav screens by id | `[]Skill{ID, Name, Description, Tags, Examples}` — same shape as A2A's, minus modality/security |
| Security schemes | `SecuritySchemes NamedSecuritySchemes` + `Security []SecurityRequirements` (OpenAPI-3.0-shaped, OR-of-ANDs) | none — auth is out-of-band (Bearer API token, see §3) | none | none |
| Signatures | `[]AgentCardSignature` (RFC 7515 JWS) | none | none | none |
| Live quality signal | none | **`AgentStatusMetrics{AvgRunTokens, AvgRunTimeSeconds, SuccessRate}`** — genuinely novel, nothing else has this | none | none |
| Extra discovery metadata | `IconURL`, `DocumentationURL` | `Tags`, `Domains`, `RecommendedModels`, `Framework` — genuinely novel, routing/search-oriented | `RelatesTo []string`, `Keywords` (EN+NO) — routing-oriented, same spirit as ACP's `Domains`/`Tags` | none |
| Generation discipline | none prescribed by the protocol itself | none enforced in code today (see §3.4) | **Formal, enforced**: `go:generate`, committed `21st-app.json` + served `/.well-known/21st-app.json` from the *same* exporter, `genmanifest -check` in CI (`tools/genmanifest/main.go`) | none |
| Nav/screen projection | none | none | `[]ManifestNav{ID, Title, URL, CompanyScoped, Description, Keywords}` — genuinely novel, lets a remote agent route users to a specific screen | none |

## 3. Is each shape sufficient, and does ACP already satisfy the contract?

### 3.1 A2A `AgentCard` — richest, and the one that makes delegation free

Confirmed sufficient for discovery + reachability + skills + security
declaration. Two real gaps relative to what strategy-server needs:

- No live-quality signal (ACP's `AgentStatusMetrics` has no A2A equivalent).
- No first-class "does this agent stage or commit" flag — closest is the
  generic `Security`/`Capabilities` blocks, neither of which is shaped for
  it. This is the write-capability declaration
  `agent-contract/spec.md`'s "Write capability is declared" scenario
  requires — A2A does not provide it out of the box and the reconciled
  shape must add it as an extension.

### 3.2 ACP `ACPAgentManifest` — a real, working, but reduced subset

**Does ACP already satisfy the contract? No — for a specific, checkable
reason, not a vague one.** ACP's *invocation* protocol (create/resume run,
sessions, SSE events — `acp_routes.go`) is genuinely shipped and working, a
reasonable analog to A2A's own message/task API. But two things disqualify
it as-is from satisfying `agent-contract/spec.md`'s requirements:

1. **Card shape gap**: no skills breakdown, no security-scheme declaration,
   no transport negotiation, no write-capability flag. `HumanInTheLoop` and
   `SessionSupport` are real, useful booleans A2A lacks as explicit fields
   — worth carrying forward as an extension, not as the base shape.
2. **Identity-propagation gap (the disqualifying one)**: confirmed by
   direct read of `acp_handler.go`'s `CreateRun` — it resolves only a
   `projectID` (`acpProjectID(c)`) from the API-token-scoped auth
   middleware (`pkg/auth/middleware.go`'s `AuthUser.APITokenProjectID`).
   **There is no field, anywhere in the ACP request/response types or the
   handler, for "which human initiated this."** `agent-contract/spec.md`'s
   central requirement — "Delegated changes are staged in the owning
   service and reviewed by the initiating human" — cannot be satisfied by
   ACP as it stands today, because ACP has nothing to carry the initiating
   human's identity across the call. This is not a hypothetical gap raised
   for symmetry with the other four repos; it is the same gap the baseline
   named as unsolved everywhere, confirmed concretely in the one
   implementation closest to solving it.

**Conclusion, per the proposal's own instruction ("if ACP already satisfies
the contract, the right outcome is to say so and adopt it"):** it does not,
specifically on identity propagation. ACP's invocation lifecycle is a good
reference for the *run/session* half of a future strategy-server delegation
surface, but the *card* should be A2A-shaped, and the *identity* problem is
still open — which is exactly what task 2 (`design.md`) exists to solve,
not inherit from ACP.

### 3.3 `AppManifest`/`ManifestBot` — least expressive, most disciplined

No skills, no security, no capabilities. But it has two things neither A2A
nor ACP has: a **nav-graph projection** (route a remote agent's user to a
specific screen) and a **formal, CI-enforced generation discipline**
(`genmanifest -check`, the committed-file-plus-well-known-route pattern).
strategy-server already has richer raw material for both (13 MCP tool
categories, a navigation graph in `internal/navigation/`) than 21st-bot
does, so this is a "adopt the discipline, not the type" case — echoed in
task 3.

## 4. Reconciled shape — decision

**Adopt A2A's `AgentCard`** (`github.com/a2aproject/a2a-go/a2a`) as the
base shape for strategy-server's published agent cards, vendored per
`21st-bot`'s own precedent (`add-platform-self-awareness/design.md`'s
adoption checklist, §193-223: "vendor the manifest contract... do not
invent a different shape... or import a shared module once one exists").
Vendoring here means copying the type shape into strategy-server's own
package (e.g. `internal/agentcard`), not importing
`github.com/a2aproject/a2a-go` itself as a dependency — that keeps the
three-ADK-majors constraint (`docs/AI_RUNTIME_CONSOLIDATION.md` §7) fully
irrelevant to this decision, since A2A the protocol is versioned
independently of any particular ADK release.

Two additions on top of the base A2A shape, both additive (extra optional
fields, not schema changes):

1. **A write-capability declaration**, filling the gap §3.1 identifies.
   Shape: an optional `Emergent` (or similarly namespaced) extension block
   — following A2A's own `AgentExtension{URI, Params, Required}` mechanism
   rather than inventing a top-level field, so the card stays valid to any
   generic A2A consumer that ignores unknown extensions. Concretely:
   `{"writes": "stages" | "commits" | "none"}`. Per
   `agent-contract/spec.md`'s scenario, "commits" should not appear for any
   agent in this estate today (every implementation is *stage-only* — this
   field exists to make that fact machine-checkable, not to open a door to
   a committing agent).
2. **ACP's live-quality block** (`AvgRunTokens`, `AvgRunTimeSeconds`,
   `SuccessRate`), same extension mechanism, same reasoning: genuinely
   useful for a delegating agent deciding whether to bother calling a given
   remote agent, and nothing else has it.

**Transport**: declare `"MCP"` as an `AgentInterface.Transport` value.
Confirmed permissible, not a gap needing a workaround — A2A's own doc
comment states `TransportProtocol`"... MUST NOT be treated as an enum."

**Not adopted, with reasons:**

- `agentregistry`'s wrapper types — §1.1, wrong layer, hard GCP dependency.
- ACP's manifest as the base shape — §3.2, real but reduced subset; its
  identity gap disqualifies it from being the target even though several
  of its extra fields are worth carrying forward as extensions.
- `ManifestBot`'s two-value `Protocol` enum — superseded by A2A's open
  `AdditionalInterfaces` list, which expresses the same "mcp vs http-chat"
  distinction plus room for more without a schema change.

## 5. What this does not settle (carried into `design.md`)

This document reconciles the **card** shape only. It says nothing about how
a delegated call's *identity* propagates, whose *queue* a staged batch lands
in, or what *refusal* looks like — that is `design.md` (task 2), the
substantive part per the proposal's own framing.
