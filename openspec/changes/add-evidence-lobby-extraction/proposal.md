# Change: Add evidence lobby intake and AI extraction agents

## Why

The strategy-server already has a solid **formal** evidence layer (`domain/evidence/`:
CRUD, link, process, Memory ingest, MCP tools, web ingest + guided interview, feeds
skill context, drives a heartbeat trigger). What it lacks is the *front of the pipeline*:

1. **No automatic intake of potential material.** Every evidence item today is created
   by a deliberate human action (manual ingest form, interview answer, MCP call). There
   is no low-friction "drop raw material here" lobby and no channel-based intake for
   automatically captured material (uploads, connectors, webhooks, captured notes).

2. **No AI review/extraction step.** Raw material becomes formal evidence only if a
   human (or external agent) hand-writes the structured `evidence` item. There are no
   specialized AI agents that read raw material, extract candidate evidence, and submit
   formal evidence for human approval.

This is exactly the pipeline 21st-aegis implements — and aegis's own AGENTS.md states
its runtime patterns were *mirrored from emergent-strategy*. Coordinating the two means
adopting aegis's proven three-store separation and human-gated extraction loop here, so
both products share one mental model: **raw lobby → AI extraction → formal evidence
(human-gated) → existing formal evidence pipeline**.

The result: potential evidence flows in continuously and cheaply; specialized AI agents
do the tedious review/extraction; humans only approve. This feeds the existing AIM cycle
(assessment, calibration) with far richer, lower-effort evidence.

## What Changes

### 1. Evidence lobby (raw intake store)

- **ADD** a `domain/lobby/` package with a `LobbyItem` store (new `lobby_items` table)
  holding raw incoming material: `payload` (bytes/text), `content_type`, `metadata`
  (jsonb), `door` (intake channel), and a lifecycle status `unprocessed → processed →
  archived`. On promotion, the item records the `evidence_key` it produced.
- **ADD** a single canonical `Intake(scope, IntakeParams)` entry point with a `Door`
  enum for channels: `upload`, `paste`, `webhook`, `connector`, `capture`, `interview`.
  In v1 the doors share one persistence path (labels), with connector/webhook
  implementations added incrementally — same staged approach aegis took.
- Lobby items are NEVER written to the formal evidence store directly; they must be
  promoted via the extraction step.

### 2. Automatic intake channels

- **ADD** a web "drop material" UI on the Evidence/AIM page: file upload + paste,
  each creating an unprocessed lobby item with auto-suggested tags. This is lower
  friction than the existing structured ingest form (which stays for power users).
- **ADD** a webhook intake endpoint (`POST .../evidence/lobby/webhook`) and an MCP
  `intake_lobby_item` tool so external systems and agents can push potential material.
- **ADD** (design only in v1, implementation incremental) connector doors for pulling
  material from external sources; the door enum and intake path are in place so
  connectors slot in without changing persistence.

### 3. AI extraction agents (raw → candidate evidence)

- **ADD** a deterministic, LLM-free **router** (`domain/evidenceagent/router.go`)
  that maps a lobby item (content type + metadata + keywords) to an extraction agent
  and skill, with a confidence score — mirroring aegis's keyword router.
- **ADD** an **extraction executor** (`domain/evidenceagent/executor.go`) that:
  1. Reads a lobby item.
  2. Selects an extraction skill via the router.
  3. Runs the skill through the existing `internal/llm` client with a
     `{{schemaConstraints}}`-injected prompt derived from the canonical evidence item
     schema (prompt and validator cannot drift).
  4. Produces one or more **candidate evidence items** (structured, schema-valid),
     each with extracted summary, tags, confidence, and links to suggested artifacts.
  5. **Fail-closed validation** before anything is staged.
  6. **Skeleton mode** when no LLM is configured (emits a schema-valid placeholder so
     the whole pipeline runs and tests pass with no model).
- **ADD** an optional semantic enrichment seam: when Memory is configured, candidate
  extraction may use semantic search/neighbors to suggest artifact links and detect
  duplicate evidence. The semantic provider is never the store of record — it only
  returns candidates.

### 4. Human-gated promotion to formal evidence

- **ADD** a staged-promotion step: extracted candidates are staged as an evidence batch
  for human review (reusing the existing batch/review/commit gate). On commit, the
  service `Promote`s — atomically creating the formal `evidence` artifact(s) and marking
  the source lobby item `processed` (guarded against double-promotion). On reject, the
  lobby item returns to `unprocessed` (or `archived` if dismissed).
- **ADD** a review UI for extracted candidates: show the raw material alongside the
  proposed formal evidence (summary, tags, confidence, suggested links), allowing the
  reviewer to edit before accepting.
- The promoted evidence then flows through the **existing** formal evidence pipeline
  unchanged (Memory ingest, skill context, AIM triggers).

### 5. Heartbeat-driven processing

- **EXTEND** the existing heartbeat ticker to evaluate a lobby-backlog trigger: when
  unprocessed lobby items for an instance cross a threshold (default 5), fire a signal
  / cycle-proposal-style notification and (optionally) auto-run extraction for the
  oldest unprocessed item, staging candidates for review. Extraction never auto-commits.

### 6. Observability

- **ADD** lobby + extraction events to the activity stream (`lobby.intaken`,
  `evidence.extracted`, `evidence.promoted`, `evidence.extraction_failed`) and record
  extraction runs in the skill-run ledger if present.

## Impact

- Affected specs: `strategy-authoring` (lobby intake + extraction + promotion domain
  operations), `strategy-web` (drop-material UI, candidate review UI),
  `strategy-mcp` (`intake_lobby_item`, `list_lobby`, lobby/extraction tools),
  `strategy-semantic` (optional candidate enrichment seam)
- Canonical EPF schema: reuse/extend `evidence_item_schema.json` (the extraction output
  contract); add an `extraction_candidate` shape only if the formal schema is
  insufficient (prefer reuse). Sync to `internal/embedded/schemas/`.
- Affected code:
  - New: `domain/lobby/`, `domain/evidenceagent/` (router, executor, schema-constraints)
  - Modified: `domain/evidence/service.go` (add `Promote` from lobby item),
    `domain/heartbeat/` (lobby-backlog trigger + optional auto-extract),
    `domain/activity/` (new event types), `domain/ingest/` (semantic enrichment seam)
  - Modified: `internal/handler/handler_evidence.go` (drop-material + candidate review),
    `internal/handler/handler.go` (routes), new lobby/webhook handler
  - Modified: `internal/ui/phase_evidence.templ` (lobby + candidate review)
  - Modified: `internal/mcpserver/` (register lobby tools)
  - New migration: `lobby_items` table
- No breaking changes to existing evidence MCP tools, the formal evidence store, or APIs

## Coordination with 21st-aegis and in-flight changes

- **21st-aegis parity.** Adopt aegis's structure so the two products converge:
  three-store separation (`lobby_items` → `evidence` → staged batch → committed),
  `Door` enum on a single intake function, deterministic keyword router + skill
  registry, `{{schemaConstraints}}` schema-as-single-source, skeleton mode, and the
  human-gated `Promote`/resolve-batch bridge. Differences: aegis promotes to immutable
  ledger transactions; here promotion produces `strategy_artifacts` of type `evidence`.
- **`add-continuous-strategy-loop` (Stage 4 "Two-Door Lobby").** That change's "Door 1"
  (epf-cli document content upload) and "Door 2" (structured evidence API) are already
  partly built. This change adds the **third element they describe but do not implement**:
  automatic raw intake + AI extraction agents in front of the formal store. Where Stage 4
  tasks remain open, they are subsumed or reconciled here rather than duplicated.
- **`add-strategy-bootstrap-flow` (§1 unified evidence collection).** Bootstrap's
  paste/interview/import collection methods become lobby doors; the bootstrap "enough
  evidence" gate reads the formal evidence store fed by this pipeline.

## Design Principles

1. **Three stores, never collapsed.** Raw lobby ≠ formal evidence ≠ staged proposal.
   Each has its own lifecycle. The formal evidence store is the source of record.
2. **AI extracts, humans accept.** Everything up to staging candidates is automatic;
   nothing becomes formal evidence without a human commit.
3. **Schema is the single source of truth.** Extraction prompt constraints and the
   validator both derive from the canonical evidence schema — they cannot drift.
4. **Skeleton mode preserves the pipeline without an LLM.** The control flow and human
   gate work with no model configured.
5. **AI is never the store of record.** Semantic providers return candidates; the core
   keeps judgment and persists the authoritative evidence.
6. **One door, many channels.** A single `Intake` function with a `Door` enum; new
   connectors added without touching persistence.
