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

## Status (2026-09-06)

Sections 1 and 2 (research + design) complete — see `research.md` and
`design.md`. Per the sequencing note at the top of this file ("do not write
code until the contract shape is settled"), sections 3–7 (self-model
publication, agent cards, transport, the end-to-end proof, and publishing
the contract) are deliberately **not started** in this session — scoped
that way on request, to allow review of the reconciled shape and the
federated-approval design before any strategy-server code depends on them.

## 3. Publish strategy-server's self-model

- [ ] Inventory what already exists and is unpublished: the MCP tool catalogue with
      its 14 categories, canonical EPF artifact schemas, the phase structure, the
      navigation graph.
- [ ] Generate the self-model from those sources. Generated, never authored.
- [ ] Serve it, and add a CI drift check following `21st-bot`'s
      `tools/genmanifest -check` precedent.
- [ ] Test: changing a tool category changes the published model; a stale committed
      copy fails CI.

## 4. Agent cards for AIM and the authoring bot

- [ ] Publish a card for each. AIM declares that it stages and gates; the authoring
      bot declares the same with a narrower write set.
- [ ] Confirm the two differ only in who plans the chain and in their write set —
      nowhere else in the type system. If a third concept is needed to express one
      but not the other, the baseline's one-agent-type claim is wrong and the
      baseline must be corrected, not worked around.

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
