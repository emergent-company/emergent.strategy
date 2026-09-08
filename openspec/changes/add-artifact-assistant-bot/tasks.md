# Tasks: Context-aware artifact authoring agent

Record the test baseline before starting. As of 2026-09-08, from
`apps/strategy-server` with Postgres up, `go test ./...` passes: **40 packages with
tests, 0 failures**. `task lint` clean.

**Blocked on:** `add-artifact-patch-authoring` (write primitive) and
`decide-authoring-agent-runtime` (runtime + tool-calling seam). Sections 1–3 can
begin once the runtime decision is recorded, even before the seam is complete, using
the mock agent.

## 1. Agent skeleton and read-only tool set

- [ ] 1.1 Create the agent package on the runtime chosen by
      `decide-authoring-agent-runtime`. Do not re-litigate that decision here; if it
      looks wrong, reopen that change's `decision.md` against its stated reversal
      condition.
- [ ] 1.2 Implement the unit of work from design Decision 1 and what ends it. Write
      this down in code as a named concept, not as an implicit loop-exit condition.
- [ ] 1.3 Register read tools: get/search artifacts, list evidence, get signals,
      semantic search.
- [ ] 1.4 Enforce the turn bound from `decide-authoring-agent-runtime` §7.1 and test
      that it terminates a runaway chain.
- [ ] 1.5 Deterministic mock agent (keyword → tool) so the feature works and tests run
      with no LLM configured.
- [ ] 1.6 Tests: a read-only conversation completes; the bound terminates; the mock
      path needs no provider.

## 2. Context assembly

- [ ] 2.1 Assemble per-turn context: current artifact, sub-objects, related artifacts,
      linked evidence, open signals.
- [ ] 2.2 Enforce a top-k **and** a token ceiling at the boundary. Do not treat
      `skillexec`'s 112,000-byte constant as a model to copy — it drops feature
      definitions and truncates nothing else, and `capability.context_budget` is
      declared in 30 skills and read by no code.
- [ ] 2.3 Record what was dropped, per `agent-runtime`'s budget requirement.
- [ ] 2.4 Accept the current artifact key and optional selected sub-object path from
      the UI send payload — not parsed from a URL.
- [ ] 2.5 Test: context that exceeds the ceiling is reduced, and the reduction is
      recorded.

## 3. Conversation persistence

- [ ] 3.1 Persist conversations on the store selected by the runtime decision.
      **Do not create new tables without first establishing why
      `internal/adk.SessionStore` and the four `adk_*` tables retained by migration
      `039` are unsuitable.** If they are unsuitable, say so in this file.
- [ ] 3.2 Scope by org **and** user, and actually use the scoping — do not hardcode a
      single app/user the way `emergent.memory` does at every call site.
- [ ] 3.3 Test: a conversation survives a server restart and is visible only to the
      same user in the same org.
- [ ] 3.4 Test multi-tenant isolation explicitly — a second org's user cannot read the
      first's conversation.

## 4. Chat drawer UI

- [ ] 4.1 Assistant drawer templ component: toggle, server-rendered message list, send
      action. Nothing like this exists today — no templ file contains "chat".
- [ ] 4.2 Mount on artifact and phase pages via the `render.RenderTriple` pattern.
- [ ] 4.3 Progress streaming over the **existing** `/strategies/:id/activity/stream`
      fanout. Reuse `shell.templ`'s established client pattern — teardown on HTMX
      swap, visibility handling, error circuit breaker — rather than a second
      `EventSource` with its own lifecycle bugs.
- [ ] 4.4 Emit agent progress events. Per design Decision 7: if you use the
      `domain/activity` constants, make them load-bearing; do not add to the twelve
      that are declared and never recorded.
- [ ] 4.5 i18n: EN and NB keys in `internal/langs/langs.go`.
- [ ] 4.6 `task css` and rebuild — `app.css` is `go:embed`ed, and DaisyUI's `chat`
      classes are currently unreferenced so they will not be in the built stylesheet.
- [ ] 4.7 Test: drawer renders, sends, and displays a reply against the mock agent.

## 5. Write tools behind a declarative gate

- [ ] 5.1 Implement per-tool `{confirm, disabled}` policy as data (design Decision 4).
- [ ] 5.2 **Fail closed.** If the gate cannot be evaluated the tool does not run.
      Verify by mutation: force gate evaluation to error, confirm the tool is refused,
      revert. `emergent.memory` fails open here — do not inherit that.
- [ ] 5.3 Enforce the allowlist twice: when building tool definitions and at execution
      time.
- [ ] 5.4 `propose_patch` over `add-artifact-patch-authoring`'s `StagePatch`. First
      write tool, shipped alone.
- [ ] 5.5 `propose_evidence_link`.
- [ ] 5.6 `propose_skill_run` — call the existing executor, which already creates a
      `domain/skillrun` ledger row and emits `skill.*` events. Do not add a parallel
      progress mechanism.
- [ ] 5.7 Implement design Decision 3: every write tool returns `{ref, summary}`, never
      a whole payload.
- [ ] 5.8 Test: a tool returning a whole artifact payload does not put that payload
      into the conversation record.
- [ ] 5.9 **Verify by mutation that there is no path to commit.** Add a commit
      attempt to the agent's tool set in a test, confirm it is refused, remove it.
      This is `establish-agent-contract` task 6's second half.

## 6. Audit

- [ ] 6.1 Record agent turns with the same fidelity AIM records cycle steps, so an
      agent-originated change is as traceable as a cycle-originated one.
- [ ] 6.2 Byte-cap payloads and record truncation (invariant 6). `emergent.memory`
      caps nothing and amplifies ~5×; do not reproduce that.
- [ ] 6.3 Persist the resolved tool set and model on the run record before execution,
      so an old run can be reconstructed. This is one of the few things
      `emergent.memory` does unambiguously well.

## 7. Close the agent contract

- [ ] 7.1 Migration: `delegation_chain` (JSONB, nullable) on mutation rows, alongside
      the unchanged `CreatedBy`. Confirm every existing reader of `CreatedBy` still
      works.
- [ ] 7.2 Populate it on delegated staging; leave it null for direct staging.
- [ ] 7.3 Review-surface attribution: "prepared by the authoring agent, on your
      behalf".
- [ ] 7.4 **`establish-agent-contract` task 6 — the end-to-end proof.** Authoring agent
      → AIM: discovery via card, invocation via transport, a staged change, review by
      the initiating human.
- [ ] 7.5 **Answer design Open Question 1 as part of 7.4: does the initiating
      principal survive a DBOS park/wake?** `establish-agent-contract/design.md` §4.a
      assumed same-process/same-`context.Context`, which predates the DBOS cutover by
      a day. AIM now parks on `dbos.Recv` and can resume in another process after the
      inbound request's context is dead. If the principal does not survive, record it
      as a contract finding — do not swap in a pair that cannot fail.
- [ ] 7.6 Generate `agentcard.AuthoringBot()` from the agent's real registered tool set
      and gate configuration, the way `agentcard.AIM()` is generated (design
      Decision 5).
- [ ] 7.7 Flip `Status` planned → live, populate `URL`, bump `Version` off `0.0.0`.
- [ ] 7.8 Confirm `card_test.go`'s `TestAIMAndAuthoringBot_DifferOnlyInChainPlanningAndWriteSet`
      and `TestAuthoringBot_WriteSetIsNarrowerThanAIM` still pass against the generated
      card. If they break, that is a finding about the one-agent-type claim, not a test
      to adjust.
- [ ] 7.9 Add a drift check for the generated card, following
      `cmd/genselfmodel -check` and `task selfmodel:check`.
- [ ] 7.10 **`establish-agent-contract` task 7** — write the contract document, update
      `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 3–5, update
      `docs/AI_RUNTIME_CONSOLIDATION.md` §7, and flag `21st-bot`'s blocker 3.
- [ ] 7.11 Mark `establish-agent-contract` complete (24/24) and archive it.

## 8. Verify

- [ ] 8.1 `go test ./...` — compare against the 40-package baseline. No regressions.
- [ ] 8.2 `task lint` clean.
- [ ] 8.3 `task selfmodel:check` and the new card drift check both pass.
- [ ] 8.4 End to end by hand: ask the agent to tighten a UVP → it stages a patch →
      review shows the per-field diff and attributes it to the agent → commit → the
      post-commit pipeline runs.
- [ ] 8.5 With no LLM configured: the drawer degrades to the mock agent and manual
      sub-object editing still works.
- [ ] 8.6 Measure a realistic conversation's session growth against design Decision 1's
      claim that compaction is unnecessary. If the claim is false, say so and reopen
      `decide-authoring-agent-runtime` task 7.6 rather than quietly adding compaction.
