# AI Runtime Consolidation — canonical reference

**Status:** Active · **Owner:** (assign) · **Last updated:** 2026-08-13

This is the single source of truth for how we align the AI capabilities that
have grown up independently across the ecosystem (an AI *bot* framework and an AI
*runner* framework), and how we consolidate them over time — potentially onto a
third-party open-source runtime.

If you are about to build or change AI features in any collaborating repo, **read
the intake checklist at the bottom first.**

---

## 1. Who collaborates here (three GitHub orgs)

| Repo | Org | Role today |
|------|-----|-----------|
| `emergent-company/emergent.strategy` (strategy-server) | emergent-company | **Pilot** for ADK 2.0 + Provider seam. AI *runner* (AIM cycle workflow), now shipped on ADK v2.2.0. |
| `emergent-company/emergent` (apps/server) — emergent.memory | emergent-company | Runs **ADK Go v1.2.0** in production as a *chat-style* runtime. **The reference implementation for the bot side of Ring 3** — see §7. |
| `CouplerAgency/sequence` (sequence-core) | CouplerAgency | New AI consumer: `intelscanner` runner + greenfield `chatbot`. |
| `eyedea-io/21st-bot` | eyedea-io | Conversational **bot** hub (21st Assistant) + manifest network. |
| `eyedea-io/21st-captable` | eyedea-io | Conversational **bot** (fork lineage of 21st-bot). |

There is **no shared repo across these orgs**. Coordination happens via this doc
(the memory) + per-repo tracking issues (the reach).

---

## 2. The mental model — three rings

Every AI feature is a control loop around an LLM call:

- **Ring 1 — Provider:** one LLM call (wire format + auth). OpenAI vs Anthropic
  vs Bedrock; api-key vs Vertex ADC vs AWS SigV4. **Inessential differences →
  unify hard behind one interface.**
- **Ring 2 — Tools/Context:** what the model may see/do (MCP tools, prompts,
  knowledge). **Essential per-product differences → keep local.**
- **Ring 3 — Control loop:** who decides the next step.
  - **Conversational (bot):** model-driven loop, human-paced. (21st-bot,
    captable, sequence chatbot-to-be.)
  - **Workflow (runner):** code-driven ordered steps, resumable, human gates.
    (strategy-server AIM, sequence intelscanner.)
  - **One-shot (batch):** single structured call, no loop. (skillexec,
    intelscanner stages.)
  - **→ Unify onto one graph runtime that expresses all three.**

Bot and runner are **not two frameworks** — they are the same machinery with the
"who decides next" knob turned differently. That is why one graph runtime can
host both.

---

## 3. Decisions (locked 2026-08-13)

1. **Adopt ADK Go 2.0** (`google.golang.org/adk/v2`) as the shared agent+workflow
   runtime candidate. Rationale: its graph engine + first-class human-in-the-loop
   + agent modes (Chat/Task/SingleTurn) map 1:1 onto our bot and runner shapes;
   `emergent/apps/server` already runs ADK v1.2.0 with a custom provider, proving
   the runtime is extensible and the migration is bounded (not a rewrite).
2. **Pilot in `strategy-server` first** — its AIM cycle (workflow + human gates)
   is the cleanest 1:1 mapping, and it is emergent-company-owned (no cross-org
   friction).
3. **Introduce a pluggable LLM Provider seam now** (Ring 1), interface-first, so
   provider work (incl. Bedrock) is reusable and later becomes an ADK `model.LLM`
   registration — no throwaway work.
4. **Unblock the Bedrock/EU-residency need now** via a Bedrock/Anthropic-Messages
   provider behind that seam (AWS SDK SigV4 + refreshable instance-role creds).
5. **No cross-repo shared module yet.** We consolidate on *interfaces and
   conventions* first; extract a module only when adoption proves the interfaces.
6. **Keep the 3rd-party exit ramp open.** Callers depend on thin interfaces
   (`Provider`, ADK model/graph), so swapping implementations later is a seam
   change, not a rewrite.

**Deferred until the Sequence OpenSpec review:** any decision that binds
Sequence, 21st-bot, or 21st-captable; the shared-module question and its host.

---

## 4. Current work

- **OpenSpec change:** `emergent.strategy` →
  `openspec/changes/adopt-adk-runtime-and-provider-seam/` (proposal + design +
  tasks + specs). Two parts:
  - **Part A (ship first):** LLM Provider seam + Bedrock provider. Unblocks the
    EU-residency contributor. Behaviour-preserving for existing api-key/vertex.
  - **Part B:** migrate the AIM cycle onto ADK 2.0 graph + HITL; register
    providers as ADK models. Gated behind end-to-end parity + restart-resume
    tests.

---

## 5. Intake checklist — answer before building AI features

If your repo is building or changing AI features in this context, answer these so
we don't end up with several almost-identical implementations. **Sequence: please
answer these in your OpenSpec.**

1. **Agent home / language:** Go (ADK-able) or TypeScript (Vercel AI SDK /
   LangChain)? This decides whether ADK is relevant to you at all.
2. **Shape:** conversational bot, automated runner, one-shot batch, or a mix?
3. **Human-in-the-loop:** any steps that pause for human approval then resume?
4. **Multi-agent:** single agent, or coordinator + sub-agents / delegation?
5. **Providers & models:** Gemini only, or multi-provider (OpenAI / Anthropic /
   Bedrock)? Auth: api-key, Vertex ADC, or AWS SigV4 / instance role?
6. **Tools / MCP:** which tools does the agent need; expose an existing MCP
   surface?
7. **Streaming / latency:** is token streaming (SSE) required, or is
   request/response fine?
8. **Persistence / resume:** must runs survive restarts and resume?
9. **Discovery network:** join the manifest / `/.well-known/21st-app.json`
   network, or stay standalone?

---

## 6. Rollout — per-repo tracking issues

Awareness is pushed via one tracking issue per collaborating repo (each links
back here; bodies are self-contained):

| Repo | Issue |
|------|-------|
| `CouplerAgency/sequence` | https://github.com/CouplerAgency/sequence/issues/128 |
| `eyedea-io/21st-bot` | https://github.com/eyedea-io/21st-bot/issues/1 |
| `eyedea-io/21st-captable` | https://github.com/eyedea-io/21st-captable/issues/52 |
| `emergent-company/emergent` | https://github.com/emergent-company/emergent.memory/issues/315 |

## 7. Reference implementations — read these before building

Added 2026-09-04 after a code-level review of all five repos.

> **Architectural baseline: `docs/UNIFIED_AGENT_ARCHITECTURE.md`.** It extends
> this doc's three-ring model with: one agent type (knowledge-only and
> code-planned agents are degenerate cases of the same thing — this doc's
> "same machinery, different knob" made concrete); **three execution layers**
> (queue / durable execution / agent runtime) which resolve the River-vs-DBOS-vs-ADK
> confusion; **agent federation**, where the estate is independently building four
> agent-card mechanisms; and a **drift log** of reasoning errors to avoid.
>
> Supporting: `openspec/AGENT_RUNTIME_PATTERN.md` (session and cycle discipline,
> ten invariants), `docs/AIM_ARCHITECTURE_AND_CROSS_REPO_REUSE.md` (AIM
> implementation detail; cross-repo conclusions superseded by the baseline).

**Do not assume the pilot repo is the reference for everything.** The two rings
have different best-in-estate implementations:

| If you are building… | Read | Why |
|---|---|---|
| A **bot** (Ring 3 conversational) | `emergent.memory` `apps/server/domain/agents/` | Only ADK-in-production chat runtime. Has solved context compaction (`session_compressor.go`), park/wake that preserves history fidelity (`executor.go:898-995` injects a real `genai.FunctionResponse` keyed to the original `FunctionCallID`), and declarative per-tool approval (`ToolPolicy{Confirm,Disabled}`). |
| A **bot UX surface** | `21st-captable` `internal/agent/` | Chat drawer, progressive tool discovery across 321 tools, review-link enforcement, two-layer write allowlist. |
| A **runner** (Ring 3 workflow) | `strategy-server` `internal/adk/` + `internal/aimadk/` | ADK graph with human gates, bounded session, restart-resume proven under SIGKILL. |
| **Audit / durability** | `sequence` `domain/agentrun/` + `internal/durability/` | `agent_run`/`agent_step` with 64KB caps, DBOS 7-day parks, deterministic workflow IDs. |

Two corrections to earlier assumptions in this doc's orbit:

1. **`sequence` is not an ADK reference.** It ships ADK v2.0.0 but the adapter has
   **zero production consumers**, enforced by two build-failing tests. Everything
   shipping there is hand-rolled.
2. **Three ADK majors are live simultaneously** — v1.2.0 (emergent.memory, Go
   1.25.0), v2.0.0 (sequence, Go 1.25.7, explicitly pinned per ADR-055), v2.2.0
   (strategy-server, Go 1.26.5). This hardens decision 5: any shared Go module
   **must not import ADK**, or it forces a coordinated upgrade across three orgs.
   The provider seam (Ring 1) is unaffected — no implementation of it depends on
   ADK, which is what makes it the one extractable piece today.

**Cautionary read before building signal-driven long-running agents:**
`emergent.memory/docs/investigation-agent-queue-explosion-2026-03-18.md` — 29,369
pending jobs from cron ignoring queue depth + children re-enqueuing parents on
both success and failure + retries stacking. Its safety layer (queue-depth cap,
consecutive-failure auto-disable, minimum cron interval, two doom-loop detectors)
is remediation, not foresight.

---

## 8. How to raise input / changes

- Comment on your repo's tracking issue (linked from this doc's rollout), or
- Open a PR against this doc for decisions, or
- Raise it in the OpenSpec change in `emergent.strategy`.

Keep this doc the canonical copy; other repos should **link** here, not fork the
content.
