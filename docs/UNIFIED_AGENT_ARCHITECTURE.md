# Unified Agent Architecture

> **Status:** Baseline — the authoritative model for agent work across the estate
> **Established:** 2026-09-04, from a code-level review of five repositories
> **Applies to:** `strategy-server`, `emergent.memory`, `21st-bot`, `21st-captable`,
> `sequence`, `opencode-harness`
>
> **Read this before** `openspec/AGENT_RUNTIME_PATTERN.md` (invariants),
> `docs/AI_RUNTIME_CONSOLIDATION.md` (cross-org coordination), or
> `docs/AIM_ARCHITECTURE_AND_CROSS_REPO_REUSE.md` (AIM implementation detail).
> Where any of those conflict with this document, this document is the baseline
> and they are to be corrected.
>
> **Purpose:** this exists to stop architectural drift. §9 records the specific
> reasoning errors that produced earlier wrong conclusions, so they are not
> repeated. Parts of this baseline will be revised — but revisions should start
> from here, not from a fresh snapshot of whatever the code happens to look like
> that week.

---

## 1. The model: one agent type

**There is one kind of agent: a service-self-aware agent that can answer from the
service's own model of itself, execute any tool the service exposes, chain those
tools, and delegate to other agents.**

Everything else is a degenerate case of that:

| Apparent "type" | What it actually is |
|---|---|
| Knowledge agent (`21st-bot` today) | the same agent with an empty write set |
| Execution agent (`21st-captable`) | the same agent with the write set enabled |
| Stepped / workflow agent (AIM, sequence runners) | the same agent with a **code-planned** chain |
| Conversational agent (authoring bot, captable chat) | the same agent with a **model-planned** chain |

This is not a new idea in the estate — `AI_RUNTIME_CONSOLIDATION.md` already states
it: *"Bot and runner are not two frameworks — they are the same machinery with the
'who decides next' knob turned differently."* It is restated here because it was
subsequently argued past (see §9).

### 1.1 Two independent knobs, not one taxonomy

The most common modelling error is collapsing these into a single "kind of agent":

**Knob A — who plans the chain.** Code-planned (a fixed or computed step sequence)
through model-planned (the LLM decides each next step). A continuum, not a binary:
AIM is code-planned today but may become partly model-planned; a bot with a wizard
mode is partly code-planned already (`21st-captable`'s `SessionModeWizard`).

**Knob B — does the session accumulate raw content.** Whether prompts, completions
and tool results become session events. This is a **design choice**, governed by
`AGENT_RUNTIME_PATTERN.md` invariant 4 (tool results are not session history), not
a property of the product. AIM gets compact sessions because its step bodies do
their LLM work internally and return a summary. A conversational agent can have
the same property by putting large tool payloads in storage and carrying a URI.

The knobs are orthogonal. A model-planned agent can have compact sessions; a
code-planned graph can accumulate if its nodes are LLM agents.

### 1.2 What "service-self-aware" means

The agent does not carry the service's knowledge in its prompt. The **service
publishes a machine-readable model of itself** and the agent reads it.

`21st-captable` is the reference: a ~150-screen navigation graph carrying
`DataHints`, `ChatActions`, guards, and render modes
(`internal/navigation/graph.go`, 63KB); a feature knowledge base mapping features →
tools → law references (`internal/agent/knowledge.go`, 45KB); and 321 tools reached
through progressive discovery (`search_tools` / `get_tool_details` / `call_tool`,
`mcp.go:236-253`).

The consequence: **the self-model should be a published artifact, not an internal
detail.** It is what makes an agent portable across surfaces (chat, MCP, delegation)
and what a *remote* agent needs in order to use this service competently.

---

## 2. Three execution layers

Most confusion about River vs DBOS vs ADK comes from treating them as competitors.
They occupy different layers and compose.

| Layer | Answers | Options | Who has one |
|---|---|---|---|
| **1. Queue / trigger** | what work gets scheduled, retried, rate-limited, deduplicated | River, cron, hand-rolled job ledger | captable (River), emergent.memory (hand-rolled), strategy-server (bare ticker) |
| **2. Durable execution** | what survives a crash mid-work; step memoization; park/wake; durable timers | DBOS, Temporal, Restate, Hatchet | sequence (DBOS), emergent.memory (hand-rolled), strategy-server (**partial**, via ADK session) |
| **3. Agent runtime** | how a turn is structured — tools, RAG, sub-agents, delegation | ADK, hand-rolled loops | all five, differently |

`sequence`'s own matrix states the boundaries plainly
(`docs/strategy/agent-runtime/river-vs-dbos-job-class-matrix.md`):

> Do not put LLM-long or crash-resume work on River, and do not put short
> transactional writes on DBOS.

and classifies ADK as **"Not a durability engine."**

### 2.1 Consequences for this estate

- **strategy-server is using layer 3 to do layer 2's job.** AIM's resume relies on
  ADK session reconstruction. It works for park/wake but provides no step
  memoization — which is precisely why `ADKEngine.Retry` is unimplemented: a fresh
  invocation restarts from `workflow.Start` and would re-run every completed,
  expensive step. Step memoization is DBOS's core primitive.
- **emergent.memory built layer 2 on top of layer 1.** A job ledger plus a
  `suspend_context` JSONB blob is a bespoke workflow engine — the exact footgun
  sequence's bake-off names: *"Teams can accidentally build a bespoke workflow
  engine around it."* It produced a 29,369-job queue explosion
  (`docs/investigation-agent-queue-explosion-2026-03-18.md`).
- **River is correctly placed** in captable and is the right replacement for the
  *queue half* of emergent.memory's ledger. It is **not** a substitute for layer 2.
- **DBOS's status must not be overstated.** Sequence adopted it as a bounded spike
  with explicit kill criteria and Temporal Cloud as fallback. As of 2026-08-24, four
  items remain open including 21-day HITL park/wake and *"kill-criteria pass/fail
  recorded"*. Single replica; Conductor is proprietary and paid; the free license
  allows one executor per application.

---

## 3. Federation: agents using agents

The target state is that an agent in one service can use another service's agent as
a capability inside its own flow — not by embedding the other service's knowledge,
but by delegating to the agent that owns it.

### 3.1 The estate is inventing agent cards four times

| Mechanism | Where | State |
|---|---|---|
| **ACP agent cards** — `/acp/v1/agents/:name/runs` + `/resume`, `Visibility: external`, `ACPConfig`, 3 execution modes | `emergent.memory` | **shipped and working** (1,446-line handler) |
| `ManifestBot{endpoint, protocol: mcp\|http-chat, tools[]}` + `AppManifest` | `21st-bot` | discovery **shipped**; delegation **stubbed** |
| `agentregistry` (`Card`, `Skill`, `Interface`, `Protocol`) + `agent/remoteagent` + `tool/agenttool` + `tool/mcptoolset` | **ADK — both v1.2.0 and v2.2.0** | ships in the framework, **used by nobody** |
| "Agent Handoff Protocol" / `agent-interface` | `21st-captable` | archived spec, tasks marked done, **zero code** |

The third row is the important one. `agenttool.New(agent, cfg) tool.Tool` exposes
**any agent — local or remote — to a calling model as just another tool.** With
`remoteagent` and `agentregistry`'s Card/Skill model, that is the A2A shape, already
present in a dependency two repos have on disk.

The first row is the important *reference*: emergent.memory has a working agent-card
surface with remote run and resume. 21st is specifying the same thing without
knowing it exists.

### 3.2 The 21st federation design — what is real

`21st-bot/openspec/changes/add-platform-self-awareness/` is a well-reasoned design.
Its governing principle is the right one:

> Each app is the single source of truth for its own self-description, and
> discovery is automatic. Each app team is responsible for keeping their app
> self-aware — enforced by a check in their own CI, not by a central editor.

| Half | State |
|---|---|
| Discovery — `AppManifest`, `21st-app.json`, `/.well-known/`, `tools/genregistry`, CI drift check | **Shipped** (21st-bot only) |
| Routing — `RouteToVertical`, `VerticalClient` | written, tested, **dead code, no caller** |
| Delegation — `proxyVerticalClient` | **stub that always errors** |

Three blockers, the third of which is not written down anywhere:

1. captable has no manifest, no `AppManifest` type, and zero references to 21st-bot
2. No MCP over HTTP in either repo (stdio only; no MCP *client* anywhere)
3. **`ProductFromManifest` discards `Bot`, `AppURL`, `Navigation` and `Features`,**
   keeping only `HasAssistant bool`. The catalog pipeline throws away exactly the
   fields delegation needs. Wiring the proxy client is not sufficient.

Today 21st-bot's knowledge of the captable agent is one hardcoded boolean
(`sources.go:92`) plus a prompt instruction — the hand-maintained master list the
design set out to eliminate.

Also note: the follow-up change these docs reference three times,
`add-vertical-orchestration`, **does not exist**, and `21st-bot/openspec/specs/` is
empty, so no federation capability has ever been promoted beyond a delta.

### 3.3 The unsolved problem: federated approval

All five repos independently converged on **AI proposes, human commits**. None has
designed what happens across a delegation boundary:

**When agent A delegates to agent B, and B stages a batch — whose gate does it land
in, whose identity authorised it, and whose audit trail records it?**

The 21st design defers this explicitly (*"Auth/tenancy between bots… a later concern
tied to 21st-identity integration"*), and the mismatch is concrete: 21st-bot's
surface is **anonymous**; captable's chat is **company-scoped and Auth0-required**.

**Transport is a solved problem three times over. Federated approval is not designed
anywhere.** Since the staging spine is the one primitive all five repos already
agree on, this is the highest-value thing to design once and share.

---

## 4. What ADK already provides

Verified in the module cache, present in **both** v1.2.0 and v2.2.0:

| Package | Capability |
|---|---|
| `tool/functiontool` | tool calling |
| `tool/mcptoolset` | MCP servers as a native toolset |
| `tool/agenttool` | a sub-agent (local or remote) as a callable tool |
| `agent/remoteagent` | remote agent invocation |
| `agentregistry` | agent cards — `Card`, `Skill`, `Interface`, `Protocol`, `MCPServer`, `Tool` |
| `memory/` + `tool/loadmemorytool`, `preloadmemorytool` | RAG — `memory.Service` with inmemory + vertexai |
| `tool/toolconfirmation` | HITL tool approval as a wire protocol (`adk_request_confirmation`, `OriginalCallFrom`) |
| `tool/skilltoolset` | skills |
| `model/gemini`, `model/openaimodel`, `model/apigee` | providers |

**The estate is under-using ADK, not over-using it.** Currently rebuilt by hand
across repos: three `model.LLM` adapters, two bun-backed ADK session stores,
`ToolPolicy.Confirm` (where `toolconfirmation` ships the protocol), and 21st-bot's
tool loop twice over (Anthropic + Vertex, ~990 lines) plus its own registry and
schema helpers.

**What ADK does not give you:** an Anthropic model (write a `model.LLM` adapter —
done three times in-house already), a session store that fits the constitution (its
built-in is GORM-based and self-migrating; strategy-server and emergent.memory each
wrote a bun one), or any of layers 1–2.

### 4.1 The version constraint

Three ADK majors are live on three Go toolchains:

| Repo | Go | ADK |
|---|---|---|
| emergent.memory | 1.25.0 | v1.2.0 |
| sequence | 1.25.7 | v2.0.0 (pinned; ADR-055 explicitly rejected v2.2+) |
| strategy-server | 1.26.5 | v2.2.0 |

**Therefore: a shared Go module must not import ADK.** This is a constraint, not a
preference — it would force a coordinated upgrade across three GitHub orgs.

Note this constrains the *shared module*, **not** per-repo ADK adoption. Those are
different decisions and conflating them was a specific error (§9).

---

## 5. The one thing everyone already agrees on

Five independent implementations of *AI proposes, human commits*:

| Repo | Primitive |
|---|---|
| strategy-server | staged mutation batches → `commit_batch` / `discard_batch` |
| emergent.memory | `ToolPolicy{Confirm}` + `ask_user`, run status `input-required` |
| sequence | `proposal` + `proposal_evidence` |
| 21st-captable | `staging_batches` / `staging_items` → `commit_batch` in the UI |
| 21st-bot | in-memory batch → exported `PortableBatch`, executed elsewhere |

Shared invariants, honoured everywhere without coordination:
- the agent never commits
- the producing tool returns a review link
- the commit is one transaction
- the commit emits a subscribable event

**This is the spine.** It is the highest-confidence shared concept in the estate and
should be the anchor of any unification, ahead of any runtime choice.

For strategy-server specifically, it is also load-bearing operationally: an edit that
goes through the staging spine inherits the whole downstream chain for free —
`commit_batch` → post-commit pipeline → ripple analysis → heartbeat → `CycleProposal`
→ human approval → AIM cycle. A write path that bypasses staging would need all of
that rebuilt.

---

## 6. Where each repo actually stands

| | strategy-server | emergent.memory | sequence | 21st-captable | 21st-bot |
|---|---|---|---|---|---|
| **Agent runtime** | ADK v2.2.0, workflow graph | ADK v1.2.0, `LlmAgent` | hand-rolled (ADK shipped, **0 consumers**) | hand-rolled, 20 rounds | hand-rolled ×2, 10 rounds |
| **Chain planner** | code | model | code | model (+ wizard mode) | model |
| **Write set** | staged batches | `ToolPolicy`-gated | proposals | 321 tools, staged | **empty** (export only) |
| **Self-model published** | no | partially (ACP cards) | no | no (rich internally) | **yes** (`21st-app.json`) |
| **Federation** | none | **ACP, working** | none | none | manifest shipped, delegation stubbed |
| **Layer 1 (queue)** | ticker | hand-rolled ledger | none shipped | **River** | none |
| **Layer 2 (durable)** | partial via ADK session | hand-rolled | **DBOS** (spike, unproven) | none | none |
| **Compaction** | not needed (shape) | **built, two-phase** | spec'd, unexercised | none | none (100-msg cap) |
| **Audit** | `adk_run_metadata` | `agent_runs` + msgs + tool_calls | **`agent_run`/`agent_step`, 64KB cap** | `audit_log` | none |

Best-in-estate, by concern:

| Concern | Reference |
|---|---|
| Service self-model | `21st-captable` nav graph + feature KB |
| Published self-description + CI drift enforcement | `21st-bot` manifest |
| Chat runtime on ADK, compaction, park/wake fidelity | `emergent.memory` |
| Agent cards / remote invocation, working | `emergent.memory` ACP |
| Declarative write gating | `emergent.memory` `ToolPolicy` |
| Progressive tool discovery at scale | `21st-captable` |
| Audit rows, byte caps, durable park | `sequence` |
| Workflow graph with gates, restart-resume proof | `strategy-server` AIM |
| The staging spine | all five agree |

---

## 7. Direction

**strategy-server leads the unification.** It is emergent-company-owned, has the
cleanest workflow case, is under active development, and is the only repo whose
roadmap includes both a code-planned agent (AIM) and a model-planned agent
(the authoring bot) — so it must resolve the one-agent-type question in code rather
than in prose.

Sequencing:

1. **Harden AIM against the layer-2 gap.** The concrete deficiencies are
   step memoization (hence no `Retry`), durable timers, and a statically-built graph
   (`BuildAIMGraph` runs at `Register`; `followsGate` is decided at build time), which
   becomes a constraint if AIM becomes dynamic. Evaluate DBOS with kill criteria
   modelled on sequence's own bake-off. **Do not** evaluate on today's six steps.
2. **Build the authoring bot on the unified model** — same agent contract as AIM,
   model-planned instead of code-planned, writing only through the staging spine.
   Take the runtime patterns from `emergent.memory` and the UX from `21st-captable`.
3. **Publish strategy-server's self-model** and adopt the agent-card contract, so
   the authoring bot and AIM are both addressable as agents, locally and remotely.
4. **Carry it to `opencode-harness`** — it is a downstream consumer by design and has
   not started, so it can adopt the unified model rather than being retrofitted.
5. **Nudge `sequence`** toward the shared contract. Realistic scope: the agent card
   and the delegated-approval semantics, not the runtime. Its ADK pin and DBOS spike
   are deliberate, documented decisions; do not reopen them as a precondition.

Design constraints that hold throughout:

- Every write path — AI, human, inline bot, MCP agent, delegated agent — goes through
  one staging gate.
- The self-model is a published artifact.
- Shared modules do not import ADK.
- Evaluate on capability needed at trajectory, not on current shape.

---

## 8. Open questions

Numbered so they can be cited and closed individually.

1. **Does AIM adopt a layer-2 engine (DBOS or other), and on what kill criteria?**
   Blocking issue: `Retry` is unimplementable today. Do not evaluate against the
   current six fixed steps.
2. **Does AIM stay a statically-built graph?** If steps become dynamic or
   signal-driven, `BuildAIMGraph`-at-`Register` is a structural constraint.
3. **Which agent-card contract wins** — ACP (working), `ManifestBot` (specified), or
   ADK `agentregistry` (free, unused)? Reconcile to one shape.
4. **Delegation transport.** MCP-over-HTTP is the obvious candidate — everyone speaks
   MCP, and `mcptoolset` then makes a remote agent's tools appear locally for free.
   Nobody has an MCP client or an HTTP MCP server today.
5. **Federated approval and identity propagation.** §3.3. The genuinely unsolved one.
6. **Does the authoring bot use ADK's `LlmAgent` or a hand-rolled loop?** Now a real
   choice: `emergent.memory` proves the ADK path works for this shape, at the cost of
   a version pin.
7. **Compaction policy** — does `emergent.memory`'s tuning (80% trigger / 75% target /
   30% anti-thrash) generalise, or only the two-phase shape?
8. **Does `ToolPolicy` become the estate-wide write-gating primitive,** and is it
   re-hosted on ADK's `toolconfirmation` protocol?
9. **Reconciler or discrete cycles for AIM** (carried from
   `AGENT_RUNTIME_PATTERN.md`). The heartbeat + `CycleProposal` + active-run guard is
   arguably a reconciler in embryo.
10. **`adk_sessions` retention** — no cleanup policy exists; this is a live leak.

---

## 9. Drift log — reasoning errors to avoid

Recorded because these produced wrong conclusions that were then committed to docs
and cited as if they were evidence. The pattern to watch for is **treating a prior
conclusion as a fact rather than re-deriving it.**

| # | Error | Correction |
|---|---|---|
| 1 | **Reasoning from a snapshot.** Concluding AIM does not need durable execution because its current six steps with cheap gates cope. | Evaluate on capability needed at trajectory. None of these products is in an end state. |
| 2 | **Citing my own earlier write-up as support** for a later conclusion, compounding error 1. | Re-derive from code and docs. A prior conclusion is a hypothesis, not evidence. |
| 3 | **Fusing "no shared module may import ADK" with "ADK is not the relevant reuse layer per repo."** The first is true (three majors, three toolchains, three orgs). The second does not follow and is false. | Keep shared-module decisions separate from per-repo adoption decisions. |
| 4 | **Framing ADK as orchestration plumbing.** It is also tool calling, RAG, sub-agents, agent cards, remote agents and HITL confirmation — most of which the estate hand-rolls. | See §4. |
| 5 | **Treating "chat-style vs workflow graph" as a species distinction** between products, when it is two independent knobs, one of which (session accumulation) is a design choice. | See §1.1. |
| 6 | **Concluding "five different machines, don't share the engine."** The *planner* differs; the runtime need not. This also contradicted `AI_RUNTIME_CONSOLIDATION.md`, which already said so. | See §1. |
| 7 | **Overstating adoption as validation** — "sequence runs ADK v2 in production" (0 consumers) and "sequence has DBOS in production" (a spike whose kill criteria are not recorded as passed). | Check whether a thing is *called*, not just *present*. |
| 8 | **Missing service self-awareness entirely**, treating bots as prompt-plus-tools rather than as consumers of a published service self-model. | See §1.2. |
| 9 | **Reviewing four repos and treating that as the estate**, omitting `emergent.memory` — which turned out to hold the best answers for several concerns. | Enumerate participants from `AI_RUNTIME_CONSOLIDATION.md` §1, not from the immediate conversation. |

---

## 10. Sources

**Code reviewed:** `strategy-server` (`internal/adk`, `internal/aimadk`, `domain/aim`,
`domain/skillexec`, `internal/llm`, `internal/mcpserver`); `emergent.memory`
(`apps/server/domain/agents`, `pkg/adk`, `domain/mcp`, ACP handlers); `sequence`
(`internal/adkadapter`, `internal/durability`, `internal/llm`, `domain/agentrun`);
`21st-captable` (`internal/agent`, `internal/navigation`, staging); `21st-bot`
(`internal/agent`, `internal/platform`, `internal/navigation`, `tools/gen*`).

**Key documents:**
- `sequence/docs/strategy/agent-runtime/durable-execution-bake-off-2026-08-11.md` —
  five-engine evaluation; the River and DBOS characterisations in §2 come from here
- `sequence/docs/strategy/agent-runtime/river-vs-dbos-job-class-matrix.md` — the layer
  boundaries
- `sequence/docs/strategy/agent-runtime/dbos-adopted-2026-08-24.md` — open kill criteria
- `sequence/docs/decisions/ADR-055`, `ADR-057`
- `emergent.memory/docs/investigation-agent-queue-explosion-2026-03-18.md` — **required
  reading before building signal-driven long-running agents**
- `emergent.memory/docs/multi-agent-work-concept.md` — HITL philosophy
- `21st-bot/openspec/changes/add-platform-self-awareness/` — the federation design
- `21st-bot/docs/CROSS_REPO_REQUIREMENTS.md` — what the bot needs from siblings
- ADK module source, v1.2.0 and v2.2.0
