# Agent Runtime Pattern: Bounded Cycles with a Memory Bridge

Cross-repo architectural pattern for long-running, partly autonomous agents.

**Applies to:** `strategy-server`, `opencode-harness`, `sequence`, `21st-bot`,
`emergent.memory`
**Status:** Proposed — derived from measurement and from prior art already
shipped in `sequence` and `emergent.memory`
**Supersedes (in intent):** the assumption in
`openspec/changes/adopt-adk-runtime-and-provider-seam/` that an ADK session can
span a full AIM cycle. Note this line predates the "Workflow graphs vs
chat-style agents" section below, which walks it back for AIM specifically:
the session *does* span the cycle's gates, and shipped that way.

---

## Why this document exists

All four repos are converging on agents that run longer, hold more context, and
increasingly operate as continuous loops over changing data rather than as
request/response. Two of them already ship agent code; two are being designed.
They should not each rediscover the same constraints.

This is a **pattern** document. Shared Go code is desirable where it is
practical, but the primary thing being reused is the shape below.

---

## The constraint that forces the pattern

Google ADK Go v2 reloads and rescans a session's **entire event history on
every turn**. This is inherent to the framework as shipped, not a
misconfiguration.

- `runner.getOrCreateSession` (runner/runner.go:155) issues an unbounded `Get`.
  It is unexported and has no hook, option or config to bound it.
- `session.GetRequest` exposes `NumRecentEvents` and `After`, but **no ADK code
  path sets them**. They are an affordance for external callers only.
- There is **no compaction anywhere in the module**. `session.Service` has five
  methods and none could express it.
- **But the affordance above is usable, and `emergent.memory` uses it.** Running
  ADK v1.2.0 in production as a chat-style runtime, it bounds the load itself:
  a token-aware sliding trim that re-fetches with `NumRecentEvents`, backed by
  LLM summarisation that deletes and recreates the session under the same ID
  (`apps/server/domain/agents/executor.go:1834-1984`,
  `session_compressor.go:75-286`). So the constraint is "ADK will not bound this
  for you", not "this cannot be bounded". Compaction is a thing you build on top
  — and per invariant 5 and `sequence`'s `agent-harness` spec, it must be
  **inspectable** when you do.
- The workflow layer walks the full list repeatedly. `ReconstructRunState`
  alone is three passes and runs whether or not the turn is a resume.
  `ContentsRequestProcessor` rebuilds history **per LLM step**, not per turn.
- `Branch` and `IsolationScope` are post-load filters. They bound visibility,
  not volume.

### Measured cost

Against the bun-backed session store, real Postgres
(`apps/strategy-server/internal/adk/perf_history_test.go`, run with
`ADK_PERF=1`):

| events (400B each) | load | resume turn | µs/event |
|---|---|---|---|
| 100 | 2.3ms | 4.2ms | 22.5 |
| 1,000 | 12.5ms | 14.4ms | 12.5 |
| 10,000 | 108ms | 112ms | 10.8 |

Linear per turn, converging to ~11µs/event. **The turn is almost entirely the
load** — turn minus load is a flat 2–4ms — so ADK's repeated scans are not the
bottleneck. The database read and JSON deserialisation are. Only bounding the
load helps.

Payload size is the dimension that actually bites, at a fixed 1,000 events:

| payload/event | total history | resume turn |
|---|---|---|
| 400B | 0.4MB | 17ms |
| 2KB | 2.0MB | 42ms |
| 8KB | 7.8MB | 122ms |
| 32KB | 31MB | **530ms** |

**Cost tracks total bytes of history, not event count.** Reasoning in "number
of turns" badly understates the risk for any agent whose events carry tool
output — file contents, diffs, command logs, transcripts.

### The consequence

For a loop that does not terminate, an ADK session cannot be the unit of work.
History grows with time, cost grows with history, and the agent asymptotically
spends all its effort re-reading its own past.

This bites specifically when a session's **events accumulate content with
usage** — a chat-style agent where every prompt, completion, and tool result
becomes a session event, so the event stream grows with every turn for as long
as the conversation runs. It does not automatically apply to a session scoped
to a fixed, bounded sequence of steps whose bodies do their own work and return
a compact result. See "Workflow graphs vs chat-style agents" below — the
distinction determines whether a session can safely span a whole unit of work,
including its human gates, or must end at each one.

---

## The pattern

**Bounded cycles, with Memory as the bridge between them.**

### Layering

| Layer | Owns | Must not |
|---|---|---|
| **Loop / scheduler (ours)** | signal intake, cycle scheduling, park & wake, standing state | be an ADK session |
| **Cycle execution (ADK)** | one bounded unit of work — task in, result out | outlive the cycle |
| **Memory** | cross-cycle continuity, recall, precedent, framing | be decision authority |
| **Domain tables** | authoritative state; checkpoints | be reconstructed by event replay |
| **Run/step audit** | what happened, cost, latency, provenance | be read back into a prompt |

### Cycle lifecycle

1. **Open.** Assemble context: a deterministic read of authoritative domain
   state, plus a *budgeted* retrieval from Memory. Create a fresh ADK session.
2. **Execute.** Run the bounded unit of work. Emit run/step audit as it goes.
3. **Close.** Write outcomes to domain tables. Distil what matters back into
   Memory. Discard or expire the ADK session.
4. **Bridge.** The next cycle reads Memory and domain state. It does **not**
   replay the previous cycle's events.

Per-cycle cost is then O(work in this cycle) and stays flat however long the
loop has been running.

### Human gates and long waits

Whether a human gate ends a cycle or safely pauses one depends on the
distinction below. A gate's *wait* never adds session events either way — only
the instant it opens and the instant it clears do — so a review that takes
days costs a session nothing while it is open. What matters is whether that
session was already accumulating content before the gate, and will keep doing
so after it.

Where a session is not safe to keep open across a gate (a chat-style loop, see
below), the gate ends the cycle: the staged proposal and the loop position live
in our tables, and approval opens a new cycle rather than resuming the old
session. Where a session's steps stay compact regardless of how many gates they
contain (a workflow graph, see below), the gate can pause the session using
ADK's own `RequestInput`/resume — this is the discrete-cycle case, and it is
what strategy-server's AIM cycle does.

### Workflow graphs vs chat-style agents

This is the distinction "Human gates and long waits" depends on, and the one
place this document's earlier drafts got AIM's own case wrong: a graph of
`FunctionNode`s whose bodies do their own LLM work and return a compact result
does not accumulate the way a chat agent does, and treating it as if it did
would import a chat-style constraint the workload never has.

| | Workflow graph (AIM) | Chat-style agent (a coding session, a conversation) |
|---|---|---|
| **What becomes a session event** | one compact result per node | every prompt, completion, tool call and result |
| **Event count over the unit's life** | fixed — one per step, known at design time | open-ended — grows with every turn |
| **A gate's cost to the session** | its open/close instants only; the wait is free | the same, but the session was already growing before it and keeps growing after |
| **Safe unit of work** | the whole graph run, gates included | a bounded slice of the conversation — a task, not the conversation |
| **What ends a unit** | the graph completing | a chosen boundary: a task done, a context budget reached, a human gate |

AIM confirms the left column empirically: a complete six-step cycle's session
would hold on the order of 10-20 events regardless of gate duration, because
`domain/aim` does its LLM work directly and hands the graph a result, not a
transcript (`openspec/changes/instrument-cycle-gates/proposal.md` measured the
equivalent legacy bookkeeping at 1.8KB per cycle). The 127K-230K LLM tokens per
step are real cost, but they are a side effect of the step body under either
engine, not session content ADK reloads.

`opencode-harness` is the right column: a coding agent's tool results are file
contents, diffs, and command output, large and unpredictable in count. Nothing
about AIM's graph case implies that workload is also safe to run on one
long-lived session — invariant 4 (tool results are not session history) is
precisely the discipline that keeps it from becoming the left column's problem
by accident, and it has to be enforced deliberately there in a way AIM gets for
free from its shape.

---

## Invariants

These are the rules that make the pattern work. Violating any one of them
reintroduces the problem the pattern exists to avoid.

### 1. Memory is advisory; domain tables are authority

Facts a decision **turns on** — obligations, thresholds, committed batches,
current roadmap state — are read deterministically at decision time. Memory
supplies recall and framing.

This matters because **replay and retrieval fail differently.** Replay is
exhaustive and slow; its failure mode is a latency wall you can measure.
Retrieval is fast and lossy; its failure mode is the agent not knowing what it
failed to retrieve — no error, no signal, a confident answer on a partial view.

For chat that is an annoyance. For governance, compliance, or a
persevere/pivot decision it is a correctness failure that looks like success.
Anything a cycle asserts must be traceable to a deterministic read.

### 2. Retrieval is budgeted

Bounded **retrieval** is the property that scales, not bounded storage. Cycles
get a top-k and a token ceiling enforced at the framework boundary, not
"everything relevant". Without this, Memory growth reproduces the same curve
one layer up.

### 3. Write-back is distillation, not logging

Memory does not compact by existing — **the write-back discipline is the
compaction.** Cycles write decisions, deltas, contradictions and resolved
state. They do not write transcripts, tool output or raw events. A Memory
filled with raw events is a slower event log with fuzzy reads.

### 4. Tool results are not session history by default

Tool results are the largest payloads in any agent system. Persisting them as
session events is what converts a 100KB session into a multi-MB one.

`21st-bot` is currently immune to the whole problem largely because it never
persists tool results (`internal/agent/session.go:20` declares `ToolCalls` on
`Message`; no call site populates it). A shared runtime that persists every
tool result as an event would **manufacture this problem in a codebase that
does not have it.**

Large payloads go to object storage; the step carries a URI reference. See
`sequence`'s `internal/adkadapter/artifacts.go:15`.

**Confirmed, not just argued.** This is exactly the invariant that makes a
workflow-graph session (AIM) cheap regardless of gate duration — its LLM
prompts and completions never become events in the first place. See "Workflow
graphs vs chat-style agents" above.

### 5. Audit is write-only from the model's perspective

Run/step records exist for operators, cost accounting and provenance. They are
never fed back into a prompt. `sequence` states this as
`ADR-055`: *"ADK session history is not the audit trail"*, and its
`agent-runtime` spec makes it a dual-history requirement.

### 6. Persisted content is byte-capped, with truncation recorded

`sequence` caps at 64KB per step and records `content_truncated` plus
`content_original_bytes` (`domain/agentrun/service.go:19`). Silent acceptance
of unbounded blobs is how audit tables become the bottleneck.

### 7. Cross-cycle checkpoints live in domain rows; within-cycle resume may use the session

Resume *the enclosing loop's position* — which cycle it's on, what a prior
cycle decided — by reading domain state, never by replaying an old session's
events. `sequence` resumes onboarding enrichment by inspecting `doc1_md` /
`doc2_md` (`domain/onboarding/enrichment.go:77`).

This does not forbid using ADK's own session reconstruction to resume *one
run's* paused position within a single cycle — a graph node waiting on
`RequestInput` is exactly what that machinery is for, and strategy-server's AIM
cycle uses it after a restart. The distinction is scope: one session's
reconstruction recovers that session's run; it must never be asked to answer a
question spanning runs, such as which run is active for an instance, or what a
previous run staged. Those are run-metadata questions — see
`openspec/changes/adopt-adk-runtime-and-provider-seam/specs/agent-runtime/spec.md`.

### 8. Cycles are idempotent, keyed deterministically

Retries and overlapping triggers must not double-apply effects. `sequence`
derives workflow IDs from domain identity
(`internal/durability/onboarding.go:41`) and makes retry a *distinct* ID rather
than a reuse.

### 9. The close rule sets a latency floor — choose it

Signals arriving mid-cycle are queued for the next cycle. That is the only
option that keeps cycles bounded, and it means worst-case signal latency is one
full cycle. This is the classic reconciler resync tradeoff. Abort-and-restart
sounds more responsive but can livelock under a steady signal stream. Pick the
number deliberately.

### 10. Memory availability must degrade, not block

Making Memory load-bearing for the loop means its availability gates the agent.
Define the degraded mode: authoritative reads still work, recall is reduced.

---

## Repo status

| | strategy-server | emergent.memory | opencode-harness | sequence | 21st-bot |
|---|---|---|---|---|---|
| **Agent runtime** | ADK v2.2.0 | **ADK v1.2.0** | ADK (planned) | ADK v2.0.0 **pinned** | hand-rolled |
| **Uses ADK Runner/SessionService** | yes — one session per AIM cycle | **yes — `LlmAgent` + Runner + custom Bun session store** | TBD | **no — refused by test** | n/a |
| **Session shape** | workflow graph, thin nodes | **chat-style, accumulating** | chat-style (likely) | n/a | chat-style, in-memory |
| **Compaction** | not needed (shape) | **built: token-aware trim + LLM summarise** | core to design | spec'd, unexercised | n/a (100-msg cap) |
| **Durable orchestration** | `EngineAPI` + ADK graph | Postgres job ledger, `FOR UPDATE SKIP LOCKED` | TBD | DBOS | none |
| **Audit store** | `adk_run_metadata` + `skill_runs` | `agent_runs` + `agent_run_messages` + `agent_run_tool_calls` | TBD | `agent_run`/`agent_step` | none |
| **Memory integration** | semantic engine (search, contradictions, impact) | **is** Memory | context compaction — core to design | ADR-054/060, dual-graph | optional derived index |
| **Cross-cycle continuity** | to build | graph + branches | Memory | domain rows | none (2h TTL) |
| **Longest human pause** | AIM review gates | **unbounded** (`input-required` + `suspend_context`) | TBD | **7 days** (DBOS park) | single request |
| **Go / toolchain** | 1.26.5 | 1.25.0 | TBD | 1.25.7 | 1.26.2 |
| **Trajectory** | continuous signal-driven loop | multi-agent orchestration + sandboxes | long-running swarms + skills | ambient agents + proposals | continuous governance loop |

Three ADK majors are live across the estate simultaneously (v1.2.0, v2.0.0,
v2.2.0) on three Go toolchains. This is the concrete reason a shared Go module
must not depend on ADK — see "Shared vs not shared" below.

### emergent.memory is the reference implementation for the chat-style case

It is the one codebase in the estate running **ADK as a chat-style agent
runtime in production** — precisely the shape this document warns about — and
it has built, rather than avoided, the missing pieces. Anything here that plans
a conversational agent (the strategy-server authoring bot, `opencode-harness`)
should read it before `sequence`.

What it solved, all in `apps/server/domain/agents/`:

- **Compaction** (`executor.go:1834-1984`, `session_compressor.go:75-286`) —
  see "The constraint that forces the pattern" above. Two-phase, with an
  anti-thrash guard that bails if the summary would exceed 30% of the window.
- **Park/wake with history fidelity.** `SuspendSignal` →
  `agent_runs.suspend_context` JSONB carrying `PendingToolCallID`. On wake,
  `injectToolResponse` (`executor.go:898-995`) appends a real
  `genai.FunctionResponse` keyed to the *original* `FunctionCallID`, so the
  model sees a normal tool result rather than a discontinuity. This is the
  highest-fidelity resume mechanism in the estate and directly satisfies
  invariant 7's "within-cycle resume may use the session".
- **Declarative HITL.** `ToolPolicy{Confirm, Message, Disabled}` per tool per
  agent definition (`entity.go:313-323`), enforced in ADK's `beforeToolCb`:
  `Confirm` creates an approval question and returns a synthetic result
  **without calling the tool**; `Disabled` hard-blocks. A data-driven
  generalisation of `21st-captable`'s hardcoded chat allowlist.
- **Agent-initiated questions.** `ask_user` with four interaction types,
  surfacing as a notification + SSE event. Run status `input-required` is
  unified with ACP (migration `00113`), making "waiting on a human" a protocol
  state rather than an internal flag.
- **Tool access enforced in Go, not by prompt.** `toolpool.go:296-297`: the ADK
  pipeline only ever receives resolved tools, so the model cannot call outside
  the whitelist. An empty whitelist means deny-all, not allow-all.

**The cautionary half.** `docs/investigation-agent-queue-explosion-2026-03-18.md`
records **29,369 pending jobs** produced by three compounding causes: cron
creating runs regardless of queue depth, children re-enqueuing parents on both
success *and* failure, and retries stacking on top. The safety layer that now
exists — kill switch, budget pre-flight, queue-depth cap, consecutive-failure
auto-disable, minimum cron interval, two doom-loop detectors, step cap 500,
spawn depth cap 6 — is the remediation, not foresight. **Any repo moving toward
signal-driven long-running agents should treat that post-mortem as a
prerequisite read**, because it is the exact failure mode a naive reconciler
produces, and it is what invariant 9 is defending against.

Known debt worth not copying: `flowType` is dead metadata across three
mutually-inconsistent vocabularies that the executor never reads; `runPipeline`
is a 1,255-line function; and the flagship `blueprints/multi-agent/` references
tools (`human_checkpoint`, `graph_query`, `agent_trigger`) that do not exist and
silently resolve to nothing.

### sequence is the reference implementation for refusing the runtime

`sequence` ships ADK v2 and **deliberately refuses the Runner and
SessionService**. ADK's entire footprint is five import lines in one package,
enforced by a build-failing import guard
(`internal/adkadapter/import_guard_test.go:47`). Every LLM call is one flat
`System`+`User` string; there is no `Messages` field in the Go codebase.

It handles 72KB transcripts, multi-page research documents, 90-minute jobs and
7-day human parks, and pays **zero** history-reload cost. It arrived at this by
architecture, not by having small workloads.

**Correction to an earlier reading of this repo:** "runs ADK v2 in production"
overstates it. The adapter compiles and is tested, but has **zero production
consumers** — a second build-failing test, `undesignated_agent_test.go`, blocks
any package from importing `internal/adkadapter` until an operator designates
it. Everything shipping in `sequence` is hand-rolled: a plain retry loop, DBOS
for durability, and an LLM gateway that writes its own `agent_step` rows. So
`sequence` is the reference for **audit, durability and refusing a runtime you
do not need** — not for running ADK. For ADK in production, read
`emergent.memory` above.

Its `agent-harness` spec already reserves the slot this pattern fills:

> "…and MAY summarize or compact older context when approaching context limits,
> **recording compaction as an `agent_step` control-flow decision**."

Unexercised. Note the requirement: compaction must be **inspectable**. A
runtime that compacts silently violates that codebase's central principle, and
would violate invariant 1 here for the same reason.

### 21st-bot is immune by product shape, not by design

100-message hard cap (`internal/agent/session.go:12`), 2-hour TTL, plain-text
payloads, no persistence at all. Total session history stays under ~100KB.

That immunity is incidental and will not survive its stated trajectory toward
continuous governance work over a changing data graph. Its **actual** gap is
the opposite of the one measured here: it has no persistent session store at
all and is stuck on a single instance
(`openspec/project.md:150`). A shared bounded, TTL'd, owner-bound,
multi-instance store would unblock its main deployment constraint.

---

## What is shared, and what is not

**Shared (all five):**

- LLM provider seam — one interface, multiple providers. Currently duplicated
  **four** ways: `strategy-server/internal/llm.Provider`,
  `sequence/internal/llm.Gateway`, `21st-bot/internal/agent.AgentOrchestrator`,
  and `emergent.memory/pkg/adk.ModelFactory`. The last is the only one with a
  credential hierarchy (project → org → env) and a usage-tracking wrapper; the
  first is the only one with a full error taxonomy and Bedrock. A merged seam
  wants both. Critically, the seam has **no ADK dependency** in any repo, so it
  is the one thing extractable across three ADK majors and three Go toolchains.
- Run/step audit with byte caps, cost and latency per step.
- Bounded session store: TTL, trim, owner binding, multi-instance.
- Proposal/approval primitive with evidence traceable to the producing step.
  Five independent implementations now: staged mutation batches
  (`strategy-server`), `proposal` (`sequence`), `staging_batches`
  (`21st-captable`), in-memory export batch (`21st-bot`), and
  `ToolPolicy.Confirm` + `ask_user` (`emergent.memory`) — the last being the
  only *declarative* one.
- **Compaction, once anyone else needs it.** `emergent.memory` has the only
  working implementation. It must be inspectable (invariant 5).
- This pattern: bounded cycles, Memory bridge, the ten invariants.

**Not shared — deliberately per-repo:**

- The orchestration engine. `sequence` needs 7-day durable parks; `21st-bot`
  needs single-turn with cross-request form resume; `strategy-server` needs
  gated cycles over a signal stream; `opencode-harness` needs swarms with
  reusable skills; `emergent.memory` needs recursive multi-agent spawn with
  sandboxes. Five different machines.
- **ADK itself.** Three majors are live (v1.2.0 / v2.0.0 / v2.2.0) on three Go
  toolchains, and `sequence` has explicitly rejected moving. Any shared module
  that imports ADK forces a coordinated upgrade across three orgs. Share the
  pattern, not the dependency.
- Whether an ADK **workflow graph is safe as the unit of work**. This is
  decided by "Workflow graphs vs chat-style agents" above, not by picking a
  side once for every repo. AIM's six steps and four gates fit inside one
  session because the steps are compact by construction — the graph is used as
  designed, spanning the whole cycle. A harness task doing many tool calls with
  real payloads does not get this for free; invariant 4 has to be enforced
  deliberately there, and whether a graph node or a gate should end a session
  is a harness-specific design decision, not something AIM's case answers for
  it.

---

## Toolchain

| Repo | Go | ADK |
|---|---|---|
| `sequence-core` | 1.25.7 | v2.0.0 (pinned) |
| `strategy-server` | 1.26.5 | v2.2.0 |

`sequence` ADR-055 explicitly **rejected** bumping to v2.2+ because it forces
Go 1.26. `strategy-server` has since taken that bump. This is tolerable while
reuse is pattern-level and reference-level, but any genuinely shared Go module
must compile on the older toolchain, or `sequence` must move first.

---

## Open questions

1. **Reconciler or discrete cycles for AIM?** Current direction is discrete
   cycles governed by a rule set, with Memory bridging — but the state model
   differs. A reconciler wants standing-state-per-instance plus a work queue,
   with runs demoted to history. `orchestration_runs` is shaped for the latter.
2. **Build park/wake, or adopt DBOS?** Now a three-way choice, not two.
   `sequence` runs DBOS with 7-day parks and deterministic IDs.
   `emergent.memory` hand-rolled it on Postgres (`FOR UPDATE SKIP LOCKED` job
   ledger + `suspend_context` JSONB + orphan recovery on boot + stale reaper)
   and has unbounded parks — but is also the codebase that produced a 29k-job
   queue explosion. Both are proven; they fail differently. Unevaluated for
   `strategy-server`.
3. **What closes a cycle?** All steps done, signal budget, time box,
   convergence, or human gate reached — and what opens the next one.
4. **Who owns the write-back curation policy?** It is the compaction, and it is
   domain-specific.
5. **Retention for ADK sessions.** One per AIM cycle is disposable once the
   cycle terminates; `adk_sessions` needs a cleanup policy now that the ADK
   engine is in active development, not deferred to a future reconciler.
6. **Does the compaction policy belong in the shared layer or per repo?**
   `emergent.memory` has the only implementation and it is tuned to its own
   thresholds (80% trigger, 75% target, 30% anti-thrash). Whether those numbers
   generalise, or only the two-phase *shape* does, is untested.
7. **Do we adopt `ToolPolicy` as the estate-wide write-gating primitive?**
   It subsumes `21st-captable`'s allowlist and would give the strategy-server
   authoring bot its gate for free, but it is currently ADK-callback-coupled in
   `emergent.memory`. The concept is portable; the implementation is not.

---

## References

**Measurement:** `apps/strategy-server/internal/adk/perf_history_test.go`
(`ADK_PERF=1 go test ./internal/adk/ -run TestPerf -v`)

**ADK constraint:**
`openspec/changes/adopt-adk-runtime-and-provider-seam/design.md`

**sequence:** `docs/decisions/ADR-055-adk-go-v2-harness.md` (session ≠ SoR),
`ADR-057` (DBOS), `ADR-054` / `ADR-060` (Memory boundary, dual-graph),
`openspec/changes/revise-agentic-runtime/`

**21st-bot:** `openspec/project.md:150` (single-instance constraint),
`internal/agent/session.go` (history cap), `openspec/changes/add-identity-domain-guardrails/`

**emergent.memory:** `apps/server/domain/agents/executor.go` (runtime,
callbacks, compaction, resilience), `session_compressor.go` (compaction),
`suspend_signal.go` + `executor.go:898-995` (park/wake),
`entity.go:313-323` (`ToolPolicy`), `ask_user_tool.go` (agent-initiated
questions), `toolpool.go` (tool resolution and filtering),
`pkg/adk/model.go` (provider seam),
`docs/investigation-agent-queue-explosion-2026-03-18.md` (**the cautionary
post-mortem**), `docs/multi-agent-work-concept.md` (HITL philosophy)

**opencode-harness:** `openspec/CROSS_REPO.md`,
`openspec/changes/memory-context-and-experts/`
