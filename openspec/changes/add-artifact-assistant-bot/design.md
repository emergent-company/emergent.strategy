## Context

The strategy-server already has the substrate for both features but neither is wired:
- LLM client (`internal/llm`, OpenAI-compatible, JSON mode, token usage) — one-shot only.
- Skill execution context builder (`domain/skillexec`) — loads artifacts, evidence, signals.
- Whole-payload stage/commit/review flow (`domain/strategy`) — the single human gate.
- SSE activity fanout (`domain/activity`) — progress push to the web UI.
- Decompose layer (`epf-cli/pkg/decompose`) — splits payloads into named sub-objects
  for display and Memory ingestion (read-only today).

The 21st-captable product is a direct architectural precedent on the same stack
(Go + templ + HTMX): a bounded tool-use orchestrator, per-turn context injection, a
read-broad/write-narrow tool allowlist, and a "prepare-don't-commit" staging gate.

## Goals / Non-Goals

- Goals:
  - A sub-object editing primitive that re-stages a re-validated whole payload.
  - A manual edit UI and an AI assistant that both flow through the one staging gate.
  - Multi-tenant, persisted conversations (not in-memory like captable).
- Non-Goals:
  - Token-level streaming of assistant responses (progress events only in v1).
  - Changing the artifact persistence model (payload stays the unit of storage).
  - Letting the assistant commit changes.

## Decisions

- **Decision: Patches apply in memory; payload remains the persisted unit.**
  No schema/storage migration for artifacts. Patches are an authoring + diff layer
  recorded in `BatchMetadata`. Alternative considered: per-sub-object rows — rejected
  as a large migration that breaks the append-only mutation log and Memory ingestion.

- **Decision: JSON Pointer (RFC 6901) addressing, with identity-based resolution for
  known sub-object types.** Stable identities (belief id, KR id, component id, feature
  id) avoid index drift. Alternative: index-only — rejected as fragile under reorder.

- **Decision: Assistant has no commit tool; allowlist enforced twice.** Tool defs are
  filtered before being sent to the model and re-checked at execution time. Mirrors
  captable's defense-in-depth and is covered by an LLM-gated e2e harness test.

- **Decision: DB-backed, org+user-scoped conversations.** Captable's in-memory,
  company-keyed sessions are single-instance and not user-isolated; the strategy-server
  is multi-tenant, so conversations persist in Postgres.

- **Decision: One staging path for AI edits, manual edits, and bootstrap drafts.**
  The sub-object primitive is the shared mechanism; bootstrap's "Draft with AI" buttons
  and the assistant's `propose_patch` both stage through it.

## Risks / Trade-offs

- **Risk: patch application correctness on nested payloads.** → Comprehensive unit
  tests per op; fail-closed re-validation before staging; never persist an invalid payload.
- **Risk: assistant proposes destructive edits to canonical structure.** → Editability
  descriptor marks canonical-derived structure read-only; `propose_patch` rejects
  patches targeting read-only paths.
- **Risk: overlap with `add-operational-transparency` (run ledger/activity).** →
  Reuse those primitives when present; emit activity directly as a fallback.
- **Risk: no streaming feels slow on multi-round tool loops.** → Surface tool-call
  progress via SSE activity events; bound the loop; defer token streaming.

## Migration Plan

1. Ship the sub-object patch primitive + tests (no UI) behind the existing service API.
2. Add the manual edit UI for a first set of sub-object types (belief, KR, component).
3. Add the assistant package + persistence + drawer behind a feature flag; ship Mock
   first, enable LLM-backed once the allowlist e2e harness passes.
4. Add `patch_artifact` MCP tool. No rollback migration needed (additive tables only).

## Open Questions

- Which sub-object types are in scope for manual editing in v1 vs follow-up?
- Should the assistant be scoped per-artifact only, or also offer an instance-wide mode
  on phase dashboards?
- Do we adopt the operational-transparency run ledger now or after it merges?
