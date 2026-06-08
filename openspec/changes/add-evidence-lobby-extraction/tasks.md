# Tasks: Add evidence lobby intake and AI extraction agents

## 1. Evidence lobby store (`domain/lobby/`)

- [ ] 1.1 Migration: `lobby_items` table (id, instance_id, org_id, door, content_type, payload, metadata jsonb, status, evidence_key, processed_by, processed_at, created_at)
- [ ] 1.2 Define `LobbyItem` model, `Door` enum (`upload`, `paste`, `webhook`, `connector`, `capture`, `interview`), `LobbyStatus` enum (`unprocessed`, `processed`, `archived`)
- [ ] 1.3 Implement `lobby.Service` with single `Intake(ctx, scope, IntakeParams)` entry point inserting `unprocessed` items
- [ ] 1.4 Implement `List`, `Get`, `CountUnprocessed`, `Archive`
- [ ] 1.5 Guard: lobby items are never written to the formal evidence store directly
- [ ] 1.6 Tests: intake via each door; list/count by status; double-promotion guard placeholder

## 2. Automatic intake channels

- [ ] 2.1 Web "drop material" UI on the Evidence page: file upload + paste → `Intake` (door `upload`/`paste`) with auto-suggested tags
- [ ] 2.2 Webhook intake endpoint `POST /strategies/:id/evidence/lobby/webhook` → `Intake` (door `webhook`)
- [ ] 2.3 MCP tool `intake_lobby_item` (door, content_type, document_text/base64) → `Intake`
- [ ] 2.4 Connector door scaffolding (enum + intake path in place; no live connector in v1)
- [ ] 2.5 Tests: upload and paste create unprocessed lobby items; webhook intake; MCP intake

## 3. Canonical schema (extraction contract)

- [ ] 3.1 Confirm `evidence_item_schema.json` in canonical EPF is sufficient as the extraction output contract; extend only if needed
- [ ] 3.2 Sync schemas to strategy-server (`make sync-embedded`)
- [ ] 3.3 Implement `Constraints()` rendering of the evidence schema for `{{schemaConstraints}}` prompt injection
- [ ] 3.4 Test: prompt constraints and validator derive from the same schema (drift test)

## 4. AI extraction router + executor (`domain/evidenceagent/`)

- [ ] 4.1 Deterministic keyword router: lobby item → extraction agent + skill + confidence (no LLM, no DB)
- [ ] 4.2 Extraction executor `Run(ctx, lobbyItem)`: route → render prompt with schema constraints → call LLM → produce candidate evidence item(s)
- [ ] 4.3 Fail-closed schema validation of candidates before staging
- [ ] 4.4 Skeleton mode (nil LLM) emits a schema-valid placeholder candidate
- [ ] 4.5 Optional semantic enrichment seam (Memory configured): suggest artifact links + dedupe; provider returns candidates only, never store of record; graceful degradation
- [ ] 4.6 Tests: router routing + confidence threshold; executor produces valid candidates; invalid candidate rejected (nothing staged); skeleton mode runs with no LLM

## 5. Human-gated promotion (`domain/evidence/`)

- [ ] 5.1 Stage extracted candidates as an evidence batch via the existing batch/review/commit gate
- [ ] 5.2 Implement `evidence.Promote(ctx, lobbyItemID, evidencePayload)`: atomically create formal `evidence` artifact + mark lobby item `processed` (double-promotion guard)
- [ ] 5.3 On reject: lobby item returns to `unprocessed`; on dismiss: `archived`
- [ ] 5.4 Promoted evidence flows through the existing formal pipeline unchanged (Memory ingest, skill context, AIM triggers)
- [ ] 5.5 Tests: commit promotes candidate to formal evidence + marks item processed; reject restores item; double-promotion blocked

## 6. Candidate review UI (`strategy-web`)

- [ ] 6.1 `phase_evidence.templ`: lobby list (unprocessed items) + per-item "Extract" action
- [ ] 6.2 Candidate review screen: raw material alongside proposed formal evidence (summary, tags, confidence, suggested links), editable before accept
- [ ] 6.3 Accept → commit promotion batch; Reject / Dismiss actions
- [ ] 6.4 Tests: lobby list renders; extract stages candidates; review screen shows raw + proposed; accept promotes

## 7. Heartbeat integration (`domain/heartbeat/`)

- [ ] 7.1 Add lobby-backlog trigger (unprocessed count >= threshold, default 5)
- [ ] 7.2 On fire: raise signal / proposal-style notification; optionally auto-run extraction for oldest item, staging candidates (never auto-commit)
- [ ] 7.3 Tests: trigger fires at threshold; auto-extract stages a candidate batch but does not commit

## 8. Observability (`domain/activity/`)

- [ ] 8.1 New event types: `lobby.intaken`, `evidence.extracted`, `evidence.promoted`, `evidence.extraction_failed`
- [ ] 8.2 Record extraction runs in the skill-run ledger if present
- [ ] 8.3 Tests: events emitted at each stage

## 9. MCP surface

- [ ] 9.1 Register `intake_lobby_item`, `list_lobby`, and extraction/promotion tools
- [ ] 9.2 Structured error responses (no raw Go errors)
- [ ] 9.3 Tests: lobby MCP tools intake/list; extraction tool stages candidates

## 10. Coordination & verification

- [ ] 10.1 Reconcile with `add-continuous-strategy-loop` Stage 4 open tasks (subsume, don't duplicate)
- [ ] 10.2 Confirm `add-strategy-bootstrap-flow` collection methods can route through lobby doors
- [ ] 10.3 Verify aegis parity of the structure (three stores, door enum, router, schema constraints, skeleton mode, promote/resolve bridge)
- [ ] 10.4 Lint clean (`task lint`)
- [ ] 10.5 Full test suite green (`go test ./...` with Postgres)
- [ ] 10.6 `openspec validate add-evidence-lobby-extraction --strict` passes
