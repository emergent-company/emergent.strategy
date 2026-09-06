# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 38 packages pass as of 2026-09-04).

**Sequencing note.** Tasks 1–2 are research and produce a document. Do not write
code until the contract shape is settled — the estate's problem is four
implementations, and a fifth written before the reconciliation would make it worse.

## 1. Reconcile the three live card shapes

- [x] Read and tabulate the three: ADK `agentregistry` (`Card`, `Skill`,
      `Interface`, `Protocol`, `MCPServer`, `Tool`), `emergent.memory`'s ACP agent
      card + `ACPConfig`, and `21st-bot`'s `AppManifest`/`ManifestBot`. Note every
      field each has that the others lack. — `research.md` §2's table.
      **Correction found while tabulating**: `agentregistry` is a client for a
      Google Cloud *hosted service* (`ProjectID`/`Location`/ADC-gated), not a
      local card type; the shape ADK's actual remote-invocation path
      (`remoteagent`, `agenttool`) consumes is `a2a.AgentCard`
      (`github.com/a2aproject/a2a-go`), confirmed by direct read of
      `agent/remoteagent/a2a_agent.go`'s imports. `research.md` §1.
- [x] Decide the reconciled shape. Default to ADK's unless a concrete need
      overrides it — adopting it makes `agenttool` and `remoteagent` work with no
      bespoke client, and it is the only shape maintained outside the estate.
      — **A2A's `AgentCard`**, not `agentregistry`'s wrapper types (see the
      correction above) — `research.md` §4. Two additive extensions on top:
      a write-capability flag (stages/commits/none) and ACP's live-quality
      block (`AvgRunTokens`/`AvgRunTimeSeconds`/`SuccessRate`), both via
      A2A's own `AgentExtension` mechanism so a generic A2A consumer stays
      compatible.
- [x] Verify by probe that ADK's `agenttool` + `remoteagent` actually compose the
      way the package layout suggests. Do not assume from names. —
      Confirmed: `agenttool.New(agent.Agent, *Config) tool.Tool` accepts any
      `agent.Agent`, and `remoteagent.NewA2A` returns exactly that interface
      — composes with no bespoke client. `research.md` §1.2.
- [x] Check whether `emergent.memory`'s ACP already satisfies the contract. If it
      does, the correct outcome is to adopt ACP and say so. — **No**, for a
      specific, checkable reason: confirmed by direct read of
      `acp_handler.go`'s `CreateRun` that ACP resolves only a project-scoped
      API token, never an initiating human — there is no field anywhere in
      ACP's types for "which human asked for this." `research.md` §3.2.

## 2. Design federated approval

The substantive part. Everything else is plumbing.

- [x] Write the identity-propagation model: how a delegated call carries the
      initiating principal, and how the receiving service authorises it. Address
      the concrete estate case — an anonymous caller must gain no authenticated
      capability by delegating. — `design.md` §1: same-trust-domain (forward
      the real, independently-verifiable token) vs. cross-trust-domain (treat
      as anonymous, full stop — no "reasonable best effort" against an
      unverifiable claim).
- [x] Write the staging model: whose queue a delegated batch lands in, how the
      delegation chain is recorded, and what the review UI must show. —
      `design.md` §2: same queue as local batches; adds `delegation_chain`
      (JSONB, nullable) alongside the existing `CreatedBy` on mutation rows,
      `CreatedBy`'s semantics unchanged.
- [x] Write the refusal model. Refusal is an ordinary outcome; specify what the
      calling agent does with it. — `design.md` §3: refusal is recordable data
      on both sides; the calling agent must continue, report, and must not
      retry as a different identity to force the call through.
- [x] Walk the model against two real cases: (a) authoring bot → AIM within
      strategy-server, (b) `21st-bot` (anonymous) → `21st-captable` (Auth0,
      company-scoped). Case (b) should fail, and the design must make *why* obvious.
      — `design.md` §4. Case (a) is same-process/same-trust-domain (deliberately
      trivial — proves staging/audit, not identity verification). Case (b)
      fails because `21st-bot` has no `initiating_principal` to propagate at
      all, confirmed against `21st-captable/internal/agent/session.go`'s
      real `CompanyID`-keyed sessions — not an unverifiable claim, literally
      none presented.
- [x] Note where this needs identity-provider work beyond strategy-server, and
      raise it in `docs/AI_RUNTIME_CONSOLIDATION.md` rather than solving it here.
      — Added to `docs/AI_RUNTIME_CONSOLIDATION.md` §7: no OIDC issuer-trust
      or token-exchange story exists across the three collaborating orgs;
      flagged as open and unowned, not solved here.

## 3. Publish strategy-server's self-model

- [x] Inventory what already exists and is unpublished: the MCP tool catalogue with
      its 14 categories, canonical EPF artifact schemas, the phase structure, the
      navigation graph. — Found and corrected a stale-docs finding along the
      way: `AGENTS.md` claimed 144 tools / 13 categories; the actual live
      count (verified by introspecting the real registration path, not by
      grepping) is **153 tools / 14 categories** — the `work` category (7
      tools, work packages) was entirely undocumented, and `admin` had grown
      from 24 to 26. Fixed in `AGENTS.md` (also corrected migration count
      40→41, stale for an unrelated reason).
- [x] Generate the self-model from those sources. Generated, never authored.
      — `internal/selfmodel/generate.go`'s `Generate()`. Critically, tools
      are read back from `internal/mcpserver.NewMCPServerForIntrospection()`
      — the *actual* tool registration path (`NewMCPServer`), not a
      second, hand-copied list — so catalogue drift is structurally
      impossible, not merely policed by review. Required extracting
      `NewMCPServer` out of `New` and exporting `ToolCategories`/
      `CategoryDescriptions`/`CategoryOrder`/`PhaseArtifacts` (previously
      unexported). **Real finding while building the introspection path**:
      a naively zero-value `Services{}` only registers 106 of 153 tools —
      several `register*` functions early-return on a nil optional field
      (Activity, AIM, Evidence, Heartbeat, Org, Orchestration, Ripple,
      SkillExecutor, SkillRun, Sync, Version). `NewMCPServerForIntrospection`
      gives every optional field an inert, never-invoked stand-in
      specifically to avoid silently under-reporting the catalogue —
      verified empirically (confirmed 106→153 before/after), not assumed
      safe from reading nil-check code alone.
- [x] Serve it, and add a CI drift check following `21st-bot`'s
      `tools/genmanifest -check` precedent. — Committed at
      `self-model.json`, served identically (same `Generate`+
      `MarshalIndent` call) at `GET /.well-known/strategy-server-selfmodel.json`
      (public, excluded from `web.AuthMiddleware` by the same mechanism as
      `/health`). `cmd/genselfmodel -out|-check` mirrors `genmanifest`;
      `task selfmodel:check` wired into `task check`. **Honest caveat**:
      strategy-server has **no GitHub Actions CI workflow at all** today
      (confirmed — `.github/workflows/` only runs epf-cli's tests), unlike
      21st-bot's `genmanifest -check`, which *is* enforced by a real CI job.
      This drift check is correct and runnable
      (`task selfmodel:check` / `go test ./internal/selfmodel/...`) but not
      yet wired into any actual CI pipeline — that gap is pre-existing and
      unrelated to this change; fixing it is a separate, larger decision
      (secrets, build matrix) intentionally left out of scope here.
- [x] Test: changing a tool category changes the published model; a stale committed
      copy fails CI. —
      `TestGenerate_ChangingACategoryChangesTheModel` (mutates
      `mcpserver.ToolCategories` at test time, `t.Cleanup`-restored, proves
      both the per-tool field and the aggregate count move) and
      `TestModel_CommittedFileMatchesGenerated` (the drift check itself) —
      verified by mutation: hand-corrupted the committed file, confirmed
      the test fails with the expected message, restored, confirmed it
      passes again.

## 4. Agent cards for AIM and the authoring bot

- [x] Publish a card for each. AIM declares that it stages and gates; the authoring
      bot declares the same with a narrower write set. —
      `internal/agentcard/` (vendored A2A `AgentCard` shape per
      `research.md` §4, not an import — zero dependency on ADK or a2a-go).
      `agentcard.AIM()` is generated from the real, live
      `domain/aim.CycleWorkflow.CycleSteps()` (six skills, four gated, two
      auto-commit), `WriteCapability.Writes = "stages"`. `agentcard.
      AuthoringBot()` is sourced from `add-artifact-assistant-bot`'s own
      committed write-tool list (`propose_patch`, `propose_evidence_link`,
      `propose_skill_run`, all gated) — explicitly marked
      `Status: "planned"` (added as a necessary extension beyond A2A's
      shape: that bot has not shipped, and publishing its card
      unmarked would be indistinguishable from advertising a callable
      agent that does not exist). Both served at
      `GET /.well-known/strategy-server-agents.json` (AIM reachable at
      `/mcp`; the bot's `url` is empty, consistent with its planned status).
- [x] Confirm the two differ only in who plans the chain and in their write set —
      nowhere else in the type system. If a third concept is needed to express one
      but not the other, the baseline's one-agent-type claim is wrong and the
      baseline must be corrected, not worked around. — Confirmed, not
      assumed: `TestAIMAndAuthoringBot_DifferOnlyInChainPlanningAndWriteSet`
      and `TestAuthoringBot_WriteSetIsNarrowerThanAIM`
      (`internal/agentcard/card_test.go`) check this structurally (same
      `Capabilities` shape, same `WriteCapability` field type, every one of
      the bot's skills gated vs. AIM's two auto-committing ones) rather
      than by inspection. Verified by mutation: flipping one of the bot's
      `HumanGate` flags to `false` makes
      `TestAuthoringBot_WriteSetIsNarrowerThanAIM` fail with the expected
      message; reverted. No third concept was needed — the one-agent-type
      claim holds for this pair.

## 5. Delegation transport

- [ ] Evaluate MCP-over-HTTP as the transport. strategy-server already serves MCP
      over streamable HTTP at `/mcp`, so the gap is authenticated remote invocation
      and tool scoping, not the protocol.
- [ ] Probe ADK's `mcptoolset` against that endpoint — does a remote agent's tool
      set genuinely appear as local tools?
- [ ] Decide auth for delegated MCP calls, consistent with task 2.

## 6. Prove it

- [ ] One end-to-end delegation, however trivially scoped, exercising: discovery
      via card, invocation via transport, a staged change, and review by the
      initiating human.
- [ ] Verify by mutation that the approval path cannot be bypassed — an agent that
      tries to commit is refused.

## 7. Publish the contract

- [ ] Write the contract document as the adoptable artifact, with a vendoring
      checklist following `21st-bot`'s `design.md:193-223`.
- [ ] Update `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 3, 4 and 5.
- [ ] Update `docs/AI_RUNTIME_CONSOLIDATION.md` §7 with the outcome and raise it on
      the per-repo tracking issues.
- [ ] Flag to `21st-bot` that its blocker 3 — `ProductFromManifest` discarding
      `Bot`, `AppURL`, `Navigation` and `Features` — is undocumented in their own
      change, and that wiring `proxyVerticalClient` alone will not be sufficient.

## Status (2026-09-06)

Sections 1–4 complete (research, design, self-model publication, agent
cards) — see `research.md`, `design.md`, `internal/selfmodel/`,
`internal/agentcard/`. Sections 5–7 (delegation transport, the end-to-end
proof, and publishing the contract document) remain — each depends on a
second, real endpoint to delegate to/from (transport needs something on
the other end to probe `mcptoolset` against; the proof needs a real
authoring-bot call to exercise, which does not exist yet since
`add-artifact-assistant-bot` is unstarted). Baseline
(`apps/strategy-server go test ./...`, 40 packages) green throughout;
`task lint` clean.
