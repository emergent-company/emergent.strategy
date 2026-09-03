# AIM AI Architecture and Cross-Repo Reuse

> **Status:** Review — analysis of shipped code as of 2026-09-04
> **Applies to:** `strategy-server`, `sequence`, `21st-bot`, `21st-captable`, `opencode-harness`
> **Companions:**
> - `openspec/AGENT_RUNTIME_PATTERN.md` — the bounded-cycle pattern and its ten invariants (normative)
> - `docs/AI_RUNTIME_CONSOLIDATION.md` — cross-org coordination record and locked decisions (normative)
> - `openspec/changes/adopt-adk-runtime-and-provider-seam/` — the change that produced the AIM runtime
>
> This document is **descriptive**, not normative. It records how the AIM AI tooling
> actually works after the ADK cutover, what is genuinely reusable across the estate,
> and what is not. Where it touches decisions, they are surfaced as open questions
> rather than settled — the normative homes are the two companions above.

---

## 0. The reframe

**The reusable asset is the staging/gate/commit spine, not ADK.**

All four codebases in the estate independently invented the same primitive — *AI prepares,
human commits*. ADK is an implementation detail of one shape of one product's control loop.
Optimising reuse around ADK would share the least valuable and most version-fragile layer,
while leaving the actually-convergent concept unshared.

A second finding that matters for planning: **`sequence` is not an ADK reference implementation.**
Its ADK adapter has zero production consumers, enforced by a build-failing test. Its real
production pattern is DBOS + a gateway that writes its own audit steps. Cite `sequence` for
durability and audit, not for ADK.

---

## 1. How the AIM AI tooling works

Five layers, deliberately decoupled. The load-bearing structural fact: **`domain/aim` imports
no engine package at all** — not even `pkg/orchestration` (`domain/aim/workflow.go:33-40`).

```
domain/aim          six step closures, engine-neutral      no ADK, no orchestration import
      ^ adapted by
internal/aimadk     ADKEngine + RunStore                   the ONLY place ADK and AIM meet
      | builds
internal/adk        graph + session store                  no domain import
      | calls into
domain/skillexec    the actual LLM work (1,952 lines)
      | via
internal/llm        Provider seam (OpenAI-compat | Bedrock)
```

`pkg/orchestration` survives only as an engine-agnostic contract (`EngineAPI`, `Run`, `StepLog`,
gate helpers). Its concrete engine and Postgres backend were deleted in the B5 cutover
(commit `9955c533`); `orchestration_runs` was dropped by migration `036`.

### 1.1 The cycle

Six steps, four human gates (`domain/aim/workflow.go:103-113`):

| # | Step | Gate | What it does |
|---|------|------|--------------|
| 1 | `draft_assessment` | yes | `draft-assessment` skill produces a staged batch |
| 2 | `draft_calibration` | yes | `draft-calibration` skill suggests persevere/pivot |
| 3 | `adapt_strategy` | yes | chunked skill run over strategy_formula, roadmap, LRA, assumptions |
| 4 | `adapt_foundations` | yes | chunked over north_star, foundations, insights; auto-advances if nothing staged |
| 5 | `align_portfolio` | no | deterministic value-model activation walk; auto-commits |
| 6 | `snapshot_cycle` | no | publishes a strategy version |

Two interfaces exist purely to break import cycles: `PortfolioAligner` (`workflow.go:18-20`)
and `SkillRunner` (`domain/aim/service.go:91-93`), with adapters in `cmd_serve.go:787-829`.

### 1.2 The critical inversion

**ADK orchestrates; it does not do the AI.**

Every graph node is a plain `FunctionNode`. LLM prompts and completions are never recorded as
ADK session content — the node body calls `domain/aim`, which does the LLM work directly and
returns a compact `AIMStepResult`. A complete six-step cycle's session holds on the order of
10–20 events; the equivalent legacy step log measured **1.8KB per cycle**.

This is why one ADK session can safely span an entire multi-day, four-gate cycle. It is also
why `internal/adk/provider_model.go` — a fully built and tested ADK `model.LLM` adapter —
**has zero production callers**. It exists for a future in which a node is an LLM agent rather
than a function.

### 1.3 Execution path, end to end

**Trigger.** The heartbeat ticker (default 300s) evaluates triggers. If one fires *and* no
orchestration run is active for the instance *and* no pending proposal exists, it creates a
`CycleProposal` in `pending` (`domain/heartbeat/proposals.go:1-10`). A human approves, defers
(7-day snooze default), dismisses, or lets it expire. Approval calls `StartRun`.

**Start.** `RunStore.Create` inserts the run-metadata row. A **partial unique index**
(`035_adk_run_metadata.sql:34-36`) enforces one-active-run-per-instance in the database:

```sql
UNIQUE (workflow_name, concurrency_key)
  WHERE status IN ('pending','running','awaiting_human')
```

This closed a real TOCTOU race that the legacy engine's check-then-insert had. The ADK session
is then created with seeded state (`instance_id`, `run_id`, `params`) and a goroutine runs
`drive()`. `AutoCreateSession: false` is deliberate — an auto-created session would have no
seeded state and the first step would fail.

**Work node.** Calls the `domain/aim` closure, which calls `skillexec`. See §1.5.

**Gate node.** Emits `RequestInput` carrying a **fresh interrupt UUID** per pause
(`gate + "-" + uuid.NewString()`, `aim_graph.go:234`) and the structured `AIMStepResult` as
payload, then returns `ErrNodeInterrupted`. The driving goroutine **exits**. Nothing is held in
memory. A gate open for 60 days costs the session nothing — only the instants it opens and
clears add events.

**Resume.** A human commits the batch in the UI, or an agent calls `commit_batch`. That handler
commits the batch first, then finds the run by batch ID and calls `Resume(runID, committed)`.
Committing is deliberately the *caller's* job, done before resume: it keeps `internal/adk` free
of any mutation-store dependency and leaves exactly one writer for staged batches
(`aim_graph.go:251-255`). A `false` verdict yields `ErrCycleDiscarded`, a normal outcome rather
than a fault.

**Projection.** `drive()` translates the ADK event stream into `StepLog` entries by parsing
`NodeInfo.Path` (last segment minus the `@n` suffix). `Event.Author` is useless — it is always
the workflow's own name. Step logs are persisted on every transition; the UI reads those.

### 1.4 The division of labour

| Question | Answered by |
|----------|-------------|
| "Where is *this run* paused?" | ADK session replay |
| "Which run is active for this instance?" | `adk_run_metadata` |
| "Which run staged this batch?" | `adk_run_metadata` |
| "How many runs has this instance had?" | `adk_run_metadata` |

Stated explicitly at `internal/aimadk/engine.go:68-71`. Cross-run questions are **never**
answered by inspecting ADK session events. This is `AGENT_RUNTIME_PATTERN.md` invariant 7.

### 1.5 The skill execution layer

`domain/skillexec` (1,952 lines) is where LLM work actually happens. Steps 1–4 funnel here.

- **Resolution.** `packSvc.ResolveSkill` checks the DB (`installed_skills`) first, then embedded
  canonical EPF. 28 skills ship embedded; only `adapt-strategy` and `adapt-foundations` have
  `chunks/`.
- **Context.** `ContextBundle` is built from the Postgres `strategy_artifacts` table — **not**
  from the graph or from files. Evidence capped at 50 items.
- **Prompt.** Go `text/template`, with a `schemaConstraints` function that derives a Markdown
  constraint appendix live from the embedded canonical JSON schema. Token budget 112,000 bytes;
  on overflow, feature definitions are dropped one at a time and re-rendered.
- **Repair-and-validate loop.** Up to 3 attempts. Per attempt: strip markdown fences, remove
  trailing commas, auto-wrap flat output into the expected envelope, apply single-wrap fixes,
  inject metadata defaults (only where the schema allows the property), shallow-merge the
  existing committed artifact underneath to restore dropped structural fields, validate against
  canonical schemas, and trim `maxItems` violations parsed out of the error strings. Only then
  does it burn a retry with a correction prompt. Non-retryable LLM errors abort immediately
  rather than consuming attempts.
- **Staging.** Mutations inserted as `staging`, promoted atomically to `staged` by
  `finalizeBatch` — which runs on both success *and* every failure path, so a partial batch
  stays reviewable.
- **Skeleton mode.** With no LLM configured, stages the current committed payloads tagged
  `_skeleton: true` so a human can edit them in the draft-review UI.

This repair layer is where output reliability actually lives. Bedrock's instruction-based JSON
mode explicitly depends on it, since the Anthropic Messages API has no native `response_format`.

---

## 2. Four decisions that were not obvious

These are the ones that will bite anyone copying this architecture.

**1. A gated step is two nodes, not one.**
ADK's ergonomic HITL pattern (`NodeConfig.RerunOnResume`) re-runs the node body after the human
answers. AIM steps call an LLM and stage a batch *before* pausing, so that pattern would repeat
the LLM call and stage a **second batch on every approval**. The two-node work/gate split is
mandatory, not stylistic (`internal/adk/aim_graph.go:110-116`).

**2. `State.Set` silently discards writes.**
Inside a workflow node, `agent.Context.Actions()` is `nil` and `State.Set` reports success while
writing nothing. The only channel that survives a pause is emitting an event carrying
`Actions.StateDelta` (`aim_graph.go:169-175`). Verified by direct probe, not assumed. The failure
mode is a cycle that keeps running and snapshots the wrong decision, with nothing in the logs.

**3. Persistence must use `context.WithoutCancel`.**
`Abort` cancels the drive context. Persisting the resulting status through that same context
fails exactly when it matters, leaving the run stuck `running` forever (`engine.go:479-487`).

**4. Clearing a gate must flip the step's status, not just its timestamps.**
Found by manual multi-gate testing and invisible to every automated test, because all fixtures
had at most one gate. Without `run.Steps[idx].Status = "done"`, `openGateIndex` keeps resolving
to the already-cleared first gate, so every later resume submits a stale interrupt ID and ADK
rejects it with `ErrNothingToResume` (`engine.go:499-507`). Pinned by
`TestADKEngine_TwoSequentialGates_EachResumesCorrectly` and by a widened e2e fixture.

**Known fragility:** `nodeNameFromPath` (`engine.go:660-673`) depends on an undocumented,
empirically-confirmed ADK path format. An ADK upgrade that changes `NodeInfo.Path` breaks
step-log projection with no compile error.

---

## 3. The inline authoring bot is a different shape

### 3.1 Why AIM's success does not transfer

`AGENT_RUNTIME_PATTERN.md` draws the distinction:

| | Workflow graph (AIM) | Chat-style agent (authoring bot) |
|---|---|---|
| What becomes a session event | one compact result per node | every prompt, completion, tool call, result |
| Event count over the unit's life | fixed, known at design time | open-ended, grows per turn |
| A gate's cost to the session | its open/close instants only | same, but the session was already growing |
| Safe unit of work | the whole graph run, gates included | a bounded slice — a task, not the conversation |

ADK reloads and rescans a session's entire event history every turn, with **no compaction
anywhere in the module**. Measured (`internal/adk/perf_history_test.go`, `ADK_PERF=1`):
1,000 events at 8KB each costs ~122ms per turn; at 32KB each, ~530ms. **Cost tracks total bytes
of history, not event count.**

An authoring bot that shows users artifact payloads and diffs will carry exactly those payloads
in tool results. It must **not** run on one long-lived ADK session. AIM earns its safety entirely
from its node shape, and that property is not inherited.

### 3.2 The reference implementation is `21st-captable`

It has shipped this exact pattern in production:

- Bounded tool loop, max 20 rounds — `internal/agent/orchestrator.go:337-469`
- **Progressive tool discovery** (`search_tools` / `get_tool_details` / `call_tool`) so 321 tools
  do not blow the context window — `mcp.go:236-253`
- **Two-layer write gating**: `webChatAllowlist` excludes ledger writes, destructive ops and
  `commit_batch` from the chat surface, enforced *again* at execution time as defence in depth —
  `orchestrator.go:198-270`, `:418-434`
- The orchestrator **deterministically appends the review link** if the model forgets to —
  `orchestrator.go:32-76`
- `present_form` / `present_info` UI tools that terminate the tool loop and return a renderable
  descriptor for the client
- `resolve_date` so the model never emits relative dates into tool arguments

Two things not to copy: sessions are in-memory and single-instance (`SessionStore.Cleanup()` is
defined but **never called** outside tests, so sessions accumulate for the process lifetime),
and they are company-keyed rather than user-isolated.

### 3.3 Status of the existing proposal

`openspec/changes/add-artifact-assistant-bot/` (31 May) already models itself on captable and
gets the principles right — *one staging path*, *prepare don't commit*, *payload is the unit of
storage, patches are the unit of authoring*, *structure is sacred where canonical*, *graceful
degradation*. It correctly plans DB-backed, user-scoped conversations rather than captable's
in-memory sessions.

**It predates `AGENT_RUNTIME_PATTERN.md` by three months** and addresses none of: session-history
growth, retrieval budgets, or invariant 4 (tool results are not session history). It also
predates the ADK adoption and plans a hand-rolled bounded tool loop — which is the *right* call
given §3.1, but for reasons the proposal does not state. **That reconciliation is unwritten.**

### 3.4 The loop closes for free — if the bot writes through the spine

The trigger path from a strategy edit back into AIM already exists and is wired:

```
bot stages patch -> human commits (same gate as every other write)
   -> commit_batch handler
   -> PostCommitPipeline (ripple coherence analysis)
   -> heartbeat detects trigger
   -> CycleProposal (pending)
   -> human approves -> AIM cycle starts
```

With an active-run guard so an in-flight cycle is not double-started (`cmd_serve.go:215`).
The heartbeat is the pull-based safety-net reconciler; journal events are the push side —
the same push/pull pairing `add-work-package-contract` design principle 6 describes.

**This is the strongest architectural argument for making the bot write only through staged
batches.** It is not merely governance hygiene: it is the difference between the bot being a
feature and the bot being part of the organism. A bot with its own write path would need every
one of those integrations rebuilt.

---

## 4. Estate inventory — what is actually duplicated

| Concern | strategy-server | sequence | 21st-captable | 21st-bot |
|---------|-----------------|----------|---------------|----------|
| **LLM access** | `Provider` seam, 2 impls, error taxonomy, `Ping` | `Gateway`, genai SDK, writes audit steps itself | hand-rolled if/else | hand-rolled if/else (fork of captable) |
| **Agent shape** | ADK workflow graph | hand-rolled loop | chat loop, 20 rounds | chat loop, 10 rounds |
| **HITL primitive** | staged mutation batch | `proposal` + `proposal_evidence` | `staging_batches` / `staging_items` | in-memory batch, exported doc |
| **Durability** | ADK session + gate sweep | **DBOS, 7-day parks** | **River** | none |
| **Audit** | `adk_run_metadata` + `skill_runs` | **`agent_run`/`agent_step`, 64KB cap** | `audit_log` | none |
| **Session store** | ADK sessions (Postgres) | n/a | in-memory, leaks | in-memory, 2h TTL |
| **Go / ADK** | 1.26.5 / v2.2.0 | 1.25.7 / v2.0.0 pinned | 1.26.2 / none | 1.26.2 / none |

Four Go modules across three GitHub orgs, **zero shared code**. Concretely: three independent
hand-rolled Anthropic clients, three independent Vertex OpenAI-compat clients, four staging
implementations. `21st-bot/internal/agent/mcp.go:1-5` states outright that it mirrors captable's
agent package minus the DB coupling; the two `identity_guard.go` regexes are character-identical.

### 4.1 Correction to a likely assumption

`sequence` runs ADK v2.0.0 in production **but its adapter has no production consumers**. Two
build-failing tests enforce this: `import_guard_test.go` (nobody outside `internal/adkadapter`
may import ADK) and `undesignated_agent_test.go` (nobody may import the adapter at all until an
operator adds a designation). Everything shipping there is hand-rolled. ADR-055 also explicitly
**rejected** bumping past v2.0.0 because it forces Go 1.26.

---

## 5. What to share, ranked

### Tier 1 — share as actual code

**The LLM provider seam.** Four implementations exist, one is clearly best, and critically it
has **no ADK dependency**, so it compiles on Go 1.25.7 and sidesteps the toolchain fork entirely.
It is the only genuinely extractable module today.

- Include: `Chat` / `ChatWithFormat` / `Ping` / `Model`; the `ErrorKind` taxonomy with
  `Retryable` and the operator-facing `Action` string; both provider implementations; the
  typed-nil trap handling (`llm.New` returning a nil `*Client` assigned to a `Provider`
  interface defeats every `!= nil` check).
- Exclude: `ModelSelector` — it defines four task types but the only implementation returns the
  same config for all of them. Aspirational, not load-bearing.

Payoff: Bedrock/EU-residency, retry classification, and boot preflight land in all four repos at
once. Consistent with `AI_RUNTIME_CONSOLIDATION.md` decision 3 (provider seam, interface-first)
and does not violate decision 5 (no cross-repo module *yet*) if introduced as a vendored
interface first and extracted only once adoption proves it.

### Tier 2 — share as schema and contract, copied per repo

**The staging/gate/commit spine.** Converge the *shape*, not the code:

```
batch:  id, scope_id, status(open|staged|committed|discarded),
        created_by, source(ai|human), metadata(skill, patches, summary)
item:   id, batch_id, op, target, payload_json, order, status
```

With the invariants all four already honour independently:
- AI never commits.
- The producing tool returns a review link.
- The commit is one transaction.
- The commit emits a subscribable event.

**The run/step audit shape.** Take `sequence`'s — it is the most mature: `agent_run` /
`agent_step`, tree via `parent_step_id`, `UNIQUE(run_id, ordinal)`, 64KB content cap recording
`content_truncated` and `content_original_bytes`, cost/tokens/latency per step, and audit
write-only from the model's perspective (invariant 5).

**The bounded session store contract.** TTL, message cap, byte cap, owner binding,
multi-instance-safe. Both 21st repos need this; both are single-instance today.

### Tier 3 — share as written pattern only

`AGENT_RUNTIME_PATTERN.md`'s ten invariants, especially **invariant 4**: tool results are not
session events; large payloads go to object storage and the step carries a URI reference.

`21st-bot` is currently immune to the history problem *by accident* — it never persists tool
results at all. A shared runtime that persisted them as events would **manufacture this problem
in a codebase that does not have it**.

---

## 6. What not to share

- **The orchestration engine.** Four different machines for four genuinely different shapes:
  AIM is a fixed six-step graph; captable is provisioning jobs on River; sequence is DBOS
  workflows with 7-day parks; 21st-bot is a single request. Forcing one engine fights every grain.
- **ADK itself, across repos.** `sequence` pinned v2.0.0 and rejected v2.2+ because it forces
  Go 1.26; strategy-server is on 1.26.5 / v2.2.0. Any shared module touching ADK requires
  `sequence` to move first. The value is in the pattern, not the dependency.
- **Tools and domain knowledge (Ring 2).** Correctly per-product. Already decided in
  `AI_RUNTIME_CONSOLIDATION.md`.

---

## 7. Open decisions

These are surfaced, not settled. Items 1–4 restate `AGENT_RUNTIME_PATTERN.md`'s open questions
with what the code now shows; item 5 is new to this review.

**1. Reconciler or discrete cycles for AIM?**
The requirement of signals arriving continuously from other systems and from humans pushes
toward a reconciler: standing-state-per-instance plus a work queue, with runs demoted to
history. Current tables are shaped for discrete cycles. Observation from this review: the
heartbeat + `CycleProposal` + active-run-guard already in place **is a reconciler in embryo**.
Formalising that is likely cheaper than rebuilding. If taken, invariant 9's latency floor
(signals arriving mid-cycle wait one full cycle) must be chosen as an explicit number.

**2. Build park/wake, or adopt DBOS?**
AIM's current durability is that a parked gate holds nothing in memory — elegant, and sufficient
for AIM's shape. It does **not** generalise to signal-driven work with timeouts, retries and
scheduled wakes. `sequence` has DBOS in production with 7-day parks and deterministic
idempotency keys. Unevaluated for strategy-server. This is the clearest candidate to adopt
wholesale rather than build.

**3. What closes a cycle, and what opens the next one?**
All steps done, signal budget, time box, convergence, or human gate reached.

**4. Who owns write-back curation policy?**
It *is* the compaction (invariant 3), and it is domain-specific.

**5. `adk_sessions` retention.**
One session per AIM cycle is disposable once the cycle terminates, and there is currently **no
cleanup policy**. This is a slow leak in production today, not a future concern.

**6. The authoring bot's session boundary.**
What ends a unit of work — task complete, context budget reached, or human gate? This determines
whether compaction is needed at all, and should be decided before implementation rather than
discovered.

---

## 8. Recommended sequencing

1. **Extract the provider seam.** Highest value, lowest risk, no ADK dependency, unblocks
   Bedrock everywhere.
2. **Build the authoring bot on the captable pattern** — bounded tool loop, DB-backed
   user-scoped sessions, progressive tool discovery, allowlist enforced twice, writes only via
   `propose_patch` into a staged batch. Explicitly *not* an ADK session.
3. **Update `add-artifact-assistant-bot`** to reconcile with `AGENT_RUNTIME_PATTERN.md`.
4. **Converge the staging schema shape** opportunistically, as each repo touches it.

The constraint to protect above all others: **every write path — AI, human, inline bot, MCP
agent — goes through one staging gate.** That single constraint is what makes AIM triggering,
ripple analysis, the audit trail, and the prepare-don't-commit safety property fall out for
free instead of needing to be rebuilt per surface.

---

## 9. Documentation drift found during this review

Recorded so it can be fixed; none of it affects behaviour.

| Location | Issue |
|----------|-------|
| `internal/adk/aim_graph.go:36-40` | Says the graph is "not yet referenced by cmd_serve.go" and awaits an `ADK_ENGINE` flag. Both false since the B5 cutover. |
| `internal/mcpserver/register_aim_orchestrator_tools.go:32` | `aim_start_cycle` doc says "Runs all four steps"; the cycle has six. |
| `cmd_serve.go:205` | Comment references `orchestration_runs`, dropped by migration `036`. |
| `apps/strategy-server/AGENTS.md` | Claims 96/141/144 MCP tools and 31/32 migrations. Actual: 153 `AddTool` calls, 36 migrations. |
| `openspec/AGENT_RUNTIME_PATTERN.md` header | "Supersedes (in intent)" line is stale relative to its own body after the workflow-graph correction. |
| `.../adopt-adk-runtime-and-provider-seam/CROSS_REPO.md` closing | "whether an ADK session should span an AIM cycle's human gates (it should not)" is a leftover from the withdrawal period and contradicts the rest of the file, `proposal.md`, and the shipped code. |
| `apps/strategy-server/go.mod` | ADK v2.2.0, genai, and the AWS Bedrock SDK are marked `// indirect` despite being directly imported. Stale bookkeeping only. |
