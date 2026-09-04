# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 38 packages pass as of 2026-09-04).

**Sequencing note.** Tasks 1–2 are research and produce a document. Do not write
code until the contract shape is settled — the estate's problem is four
implementations, and a fifth written before the reconciliation would make it worse.

## 1. Reconcile the three live card shapes

- [ ] Read and tabulate the three: ADK `agentregistry` (`Card`, `Skill`,
      `Interface`, `Protocol`, `MCPServer`, `Tool`), `emergent.memory`'s ACP agent
      card + `ACPConfig`, and `21st-bot`'s `AppManifest`/`ManifestBot`. Note every
      field each has that the others lack.
- [ ] Decide the reconciled shape. Default to ADK's unless a concrete need
      overrides it — adopting it makes `agenttool` and `remoteagent` work with no
      bespoke client, and it is the only shape maintained outside the estate.
- [ ] Verify by probe that ADK's `agenttool` + `remoteagent` actually compose the
      way the package layout suggests. Do not assume from names.
- [ ] Check whether `emergent.memory`'s ACP already satisfies the contract. If it
      does, the correct outcome is to adopt ACP and say so.

## 2. Design federated approval

The substantive part. Everything else is plumbing.

- [ ] Write the identity-propagation model: how a delegated call carries the
      initiating principal, and how the receiving service authorises it. Address
      the concrete estate case — an anonymous caller must gain no authenticated
      capability by delegating.
- [ ] Write the staging model: whose queue a delegated batch lands in, how the
      delegation chain is recorded, and what the review UI must show.
- [ ] Write the refusal model. Refusal is an ordinary outcome; specify what the
      calling agent does with it.
- [ ] Walk the model against two real cases: (a) authoring bot → AIM within
      strategy-server, (b) `21st-bot` (anonymous) → `21st-captable` (Auth0,
      company-scoped). Case (b) should fail, and the design must make *why* obvious.
- [ ] Note where this needs identity-provider work beyond strategy-server, and
      raise it in `docs/AI_RUNTIME_CONSOLIDATION.md` rather than solving it here.

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
