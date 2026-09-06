# Design: federated approval

> Output of tasks.md §2 — "the substantive part; everything else is
> plumbing." Builds on `research.md`'s reconciled card shape (A2A
> `AgentCard` + a write-capability extension). Grounded in strategy-server's
> actual auth code (`internal/web/middleware.go`, `internal/auth/`) and
> `domain/strategy`'s actual mutation model, not assumed shapes.

## 0. The concrete gap this closes

`internal/domain/models.go`'s mutation rows have a single `CreatedBy
*uuid.UUID` — one actor, no notion of "acting for." There is no field
anywhere in strategy-server today for "agent X staged this on behalf of
human Y, having been asked by agent Z." Every one of the five repos'
staging spines has the same shape: one actor column, not a chain. Federated
approval needs the chain to be a first-class, recorded thing — not because
today's single-service case needs it, but because the moment a batch can
originate from a delegated call, "who does this row belong to" stops having
a one-column answer.

## 1. Identity propagation

### 1.1 The one question that actually matters

> When agent A delegates to agent B, and B stages a batch, whose identity
> authorised it?

This has exactly two honest answers, and the design's job is to make which
one applies **mechanically checkable**, not asserted:

1. **Same trust domain** — A and B's services trust the same identity
   provider (e.g., both verify Zitadel-issued tokens for the same tenant,
   or — the degenerate case — A and B are the same service, different
   in-process components). The initiating principal's token can be
   forwarded and **independently verified** by B. B's authorization
   decision is real, not assumed.
2. **Cross trust domain** — B has no way to independently verify a claim
   about who initiated the call on A's side. **B must treat the call as
   unauthenticated with respect to that claim, full stop**, regardless of
   what A's request says. Trusting an unverifiable claim is not a smaller
   version of the contract; it is the exact failure mode invariant 1 (no
   confident answer on a partial view) and `agent-contract/spec.md`'s
   "unauthenticated caller gains no capability by delegating" scenario both
   exist to prevent.

There is no third option where B does a "reasonable best effort" against an
unverifiable claim. That is the concrete, checkable rule; everything below
is mechanism for expressing it.

### 1.2 The delegation envelope

A delegated call carries three things, not one:

```
DelegationContext {
  acting_agent:      the card identity of the agent making this specific
                      call (B's caller — could be A, or A relaying on
                      behalf of a chain longer than one hop)
  initiating_principal: a claim about the original human/service, in a
                      form the RECEIVING service can attempt to verify —
                      concretely, a bearer token issued by an identity
                      provider, not a free-text string
  chain:             an ordered list of {agent, timestamp} hops this call
                      has passed through, for audit — not itself a trust
                      mechanism, purely a record
}
```

The `chain` field matters independent of trust: even a refused call should
be recordable as "A asked B on behalf of H; B refused" (§3). Audit does not
require successful authorization.

### 1.3 What "attempt to verify" means concretely, same trust domain

Grounded in strategy-server's own code: `internal/web/middleware.go`'s
`AuthMiddleware` already authenticates every request to `/mcp` (confirmed
by direct read of `cmd_serve.go:346-362` — `web.AuthMiddleware` is mounted
before `/mcp`'s routes are registered, so it is not a web-only concern; MCP
calls go through the identical Zitadel-introspection path web UI requests
do). This means: **a delegated call arriving at strategy-server's `/mcp`
endpoint that forwards a genuine Zitadel-issued bearer token for a real
strategy-server user is not a new problem** — it is authenticated exactly
as if that user had called directly, because it *is* that user's own,
independently-verifiable token. `initiating_principal` in this case is
"the same bearer token a human would have used," forwarded, not re-encoded
into a bespoke claim format A invents and B has to trust blindly.

**This is the load-bearing design choice**: propagate the real,
independently-verifiable credential, not a description of one. A telling
you "this is user H" is a claim. Forwarding H's own token that B can
introspect against the same IdP is a proof. The contract requires the
latter wherever the trust domain allows it.

### 1.4 What happens when it doesn't verify, or can't be checked at all

If B cannot verify `initiating_principal` (wrong/foreign issuer, expired,
absent, or B has no relationship with A's IdP at all): B treats the call as
**anonymous**, and applies whatever authorization rules it already applies
to anonymous callers. For most of this estate today, that means refusal —
not because federation is broken, but because most of this estate's
data-mutating operations already require an authenticated principal for a
plain, unrelated reason (multi-tenant data ownership), and delegation
doesn't get to bypass that.

### 1.5 Cross-org identity federation is explicitly out of scope here

Making B able to verify a token minted by A's IdP when they are genuinely
different identity providers (e.g. a future eyedea-io service calling a
future emergent-company service on behalf of one of *its* users) is an
identity-federation problem — OIDC issuer trust configuration, or a
signed-assertion format both sides agree to honor (the shape RFC 8693 OAuth
Token Exchange or a JWT "on-behalf-of" claim solves in the wild). That is
real infrastructure work belonging to whichever services actually need
cross-org delegation, not a strategy-server design decision. Flagged in
`docs/AI_RUNTIME_CONSOLIDATION.md` (§6 below) rather than solved here, per
the task's own instruction.

## 2. Staging model

- **Whose queue.** A batch staged by a delegated agent lands in the review
  queue of **the service that owns the data**, exactly as a locally-staged
  batch does today — delegation changes who asked, not where the review
  happens or under what rules. Concretely for strategy-server: it lands in
  `domain/strategy`'s existing batch/review flow; there is no second queue.
- **Whose gate.** The gate is scoped to `initiating_principal`, once
  verified (§1.3) — the same human who could see and act on a
  locally-staged batch of their own sees the delegated one too, in the same
  place, with no separate "delegated batches" UI.
- **Recording the chain.** `internal/domain/models.go`'s mutation rows need
  a `delegation_chain` (JSONB, nullable — absent for the overwhelmingly
  common non-delegated case) alongside the existing `CreatedBy`.
  `CreatedBy` keeps meaning "the verified initiating principal" (§1.3) —
  unchanged semantics, so every existing reader of `CreatedBy` keeps
  working unmodified. `delegation_chain` is additive: who actually made the
  call, if it differs from `CreatedBy`.
- **What the review UI must show.** Per
  `agent-contract/spec.md`'s "delegation chain is auditable" scenario: the
  acting agent's identity, not just "AI" or a generic batch source. A human
  approving a batch that arrived via delegation should see "prepared by
  the authoring bot, on your behalf, via a request from [agent]" — the
  same honesty principle `internal/audit`'s existing `Source`/`ActorID`
  pattern already applies to local mutations, extended one hop.

## 3. Refusal model

Refusal is data, not an exception. Concretely:

- A refusal is itself a recordable event on **both** sides: the calling
  agent logs "asked B, refused, because X"; the receiving service logs "A
  asked on behalf of claim Y, refused, because Y did not verify" (or
  whatever the specific reason was — capacity, scope, policy — refusal
  is not always an auth failure).
- The calling agent's contract obligation on refusal: **continue with
  remaining capabilities and report the refusal**, per
  `agent-contract/spec.md`'s "An unreachable agent degrades" scenario
  (refusal is a special case of unreachable — the capability existed, its
  use was declined). It must not silently drop the user's request, and it
  must not retry as a different, unauthenticated identity to force the
  call through — that would itself be the "unauthenticated caller gains
  capability by delegating" failure via the back door.
- No distinction in the wire contract between "refused because
  unauthenticated" and "refused because the human declined this specific
  thing" — the receiving service's reason is its own to disclose or not;
  the calling agent's obligation is the same either way (report, don't
  retry-as-someone-else, don't silently degrade to a wrong answer).

## 4. Walked against two real cases

### 4.a Authoring bot → AIM, within strategy-server

Deliberately the trivial case (task 6 picks it as the end-to-end proof
vehicle precisely because it is cheap). Both agents live in the same
process, same DB, same request's already-authenticated `web.UserFromContext`
— there is no cross-service call at all today, and per the baseline's own
one-agent-type claim, there may never need to be one: "delegation" here can
be an in-process function call carrying the same `context.Context` the
inbound HTTP/MCP request already populated.

This proves the **staging and audit** half of the contract (does a batch
prepared by one agent, notionally "for" another agent's workflow, surface
correctly and get attributed correctly) without needing to exercise
cross-service identity verification at all, since there is no service
boundary to cross. This is exactly why it is the right thing to prove first
and the wrong thing to generalize from for §1's harder half — see the next
case.

### 4.b `21st-bot` (anonymous) → `21st-captable` (Auth0, company-scoped)

Confirmed by direct read of `21st-captable/internal/agent/session.go`:
every chat session is keyed by a real `CompanyID` (`uuid.UUID`), i.e. a
concrete authenticated tenant. `21st-bot`'s own design (per
`docs/UNIFIED_AGENT_ARCHITECTURE.md` §3, and confirmed by the "21st-bot's
surface is anonymous" framing already in the `establish-agent-contract`
proposal) has no per-user authenticated session at all in its current,
shipped form.

Walking §1's rule against this: `21st-bot` has no `initiating_principal` to
propagate in the first place — not "an unverifiable one," literally none.
21st-captable's authorization check (does this request belong to a
`CompanyID` it can find and check membership against) fails at the first
step, for the most legible possible reason: **there is nothing to check
membership for.** This is `agent-contract/spec.md`'s "unauthenticated
caller gains no capability by delegating" scenario exactly, and the reason
it fails is inspectable in one sentence, which is the design property task
2 explicitly asks for ("the design must make *why* obvious").

Nothing here is 21st-captable being unusually strict — it is doing what any
correctly-implemented receiving service must do per §1.4. The fix, if one
is ever wanted, belongs entirely to `21st-bot` (give it an authenticated
session to propagate) and is explicitly out of scope for this document.

## 5. What `agent-contract/spec.md`'s requirements map to, concretely

| Spec scenario | Satisfied by |
|---|---|
| "A delegated change reaches the initiating human" | §2's queue rule + `CreatedBy` semantics unchanged |
| "Delegation carries the initiating identity" | §1.3's forwarded-token rule |
| "An unauthenticated caller gains no capability by delegating" | §1.4 + case 4.b |
| "Refusal is a normal outcome" | §3 |
| "The delegation chain is auditable" | §2's `delegation_chain` column |

## 6. Raised, not solved: cross-org identity federation

Per task 2's own instruction, this is noted in
`docs/AI_RUNTIME_CONSOLIDATION.md` (§7, alongside the other reference
findings) rather than designed here: the estate has no OIDC issuer-trust or
token-exchange story across the `emergent-company` / `eyedea-io` /
`CouplerAgency` org boundary. Every case this document can actually
recommend an implementation for today is same-trust-domain (§1.3) or a
correct refusal (§1.4/§4.b). Cross-org delegation that should *succeed*
(a real, authenticated eyedea-io user's request reaching an
emergent-company service, verified rather than merely asserted) needs that
infrastructure first. This is not a strategy-server decision to make
unilaterally.

## 7. Open item carried to implementation (task 6)

Task 6 (`tasks.md` §6, out of scope for this research/design session) needs
one concrete decision this document deliberately leaves to it: whether
`delegation_chain` is added to `internal/domain/models.go`'s mutation rows
now (schema change, migration) or deferred until the first real delegated
call exists to populate it. Given `add-artifact-assistant-bot` (the
authoring bot) has not shipped yet, there is no producer for this field
today — recommend deferring the migration to whichever change first has a
real delegated call to prove it against, per this codebase's own
established discipline (`harden-aim-execution`'s Part A4: design the shape,
do not implement ahead of a concrete need).

## 8. Transport decision (task 5)

`internal/mcpserver/mcptoolset_probe_test.go` proves, by actually running
the code against strategy-server's real streamable-HTTP `/mcp` handler
(`google.golang.org/adk/v2/tool/mcptoolset`, already a resolved dependency
via `internal/adk`, not newly added for this probe):

1. `mcptoolset.New(Config{Endpoint: ...}).Tools(ctx)` genuinely converts the
   remote MCP catalogue into local ADK `tool.Tool` values, callable via
   `Run`, not merely listable — verified by actually calling
   `set_tool_filter` through a converted tool and observing the effect on a
   second `Tools()` call over the same session.
2. **A real, non-obvious finding**: the existing per-session tool-category
   filter (`tool_filter.go`, built for interactive LLM clients trimming
   context) applies to an `mcptoolset` caller exactly as it does to any
   other MCP client — a fresh session sees only the 13 `core` tools, not
   the full catalogue. A remote agent that needs a specific category (for
   example the authoring bot needing `authoring`-category write tools) must
   call `set_tool_filter` itself before the tool set it hands to its LLM
   is complete. This is a real interaction to design around when
   `add-artifact-assistant-bot` is built, not a hypothetical.
3. `mcptoolset.Config.Auth` (an `auth.CredentialProvider`) genuinely
   attaches a bearer token to every outgoing request — verified by
   inspecting the `Authorization` header the server actually received, not
   by reading `providers.go`.

**Decision, consistent with §1's same-trust-domain / cross-trust-domain
split:**

- **Same trust domain** (the only case anything can be recommended for
  today, per §6 above): the calling agent supplies a `CredentialProvider`
  that resolves to the *initiating principal's real token* — forwarded, not
  minted — read from the delegation envelope (§1.2) at call time, per
  request. `auth.StaticToken` is the wrong provider for this in production
  (it bakes in one fixed token for the toolset's lifetime); the real
  provider is a small `auth.ProviderFunc` that pulls the current
  `DelegationContext.initiating_principal`'s token out of the ADK
  invocation context per call. `strategy-server`'s existing
  `AuthMiddleware` (`internal/web/middleware.go`) already independently
  verifies whatever arrives via Zitadel introspection — forwarding the real
  token costs nothing extra to build on the receiving side.
- **Cross trust domain**: no `Config.Auth` is set (or it is deliberately
  set to something that resolves to nothing verifiable). The call reaches
  `/mcp` unauthenticated and `AuthMiddleware` rejects it in production
  (`AUTH_ENABLED=true`) — matching §1.1's "no reasonable best effort
  against an unverifiable claim." This is not new plumbing; it is today's
  auth middleware doing exactly what it already does to any other
  unauthenticated caller.

What this does **not** yet do: there is no `DelegationContext`-aware
`CredentialProvider` implementation anywhere in the codebase, because there
is no second real agent to delegate from yet. Building that provider against
`add-artifact-assistant-bot` (or whatever ships first) is task 6's job, not
this one's — consistent with the deferral in §7 above.
