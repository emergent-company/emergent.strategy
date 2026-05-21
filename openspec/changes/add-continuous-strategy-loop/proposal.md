# Change: Add Continuous Strategy Loop

## Why

The strategy-server has a well-engineered inner loop (ripple convergence after every
commit) and a well-designed outer loop (orchestrated AIM cycle), but they are
disconnected by a fundamental gap: nothing runs continuously. The convergence loop
is reactive (post-commit only). The AIM cycle is manual (human-initiated only).
External evidence has no ingestion path. The system is inert between user interactions.

The READY-FIRE-AIM loop is designed to be a living organism where execution evidence
continuously feeds back into strategic calibration. Today it operates as a series of
manual checkpoints. This change closes the gap incrementally, making the loop
continuous while keeping humans in control of consequential decisions.

## What Changes

### Stage 1: Background Heartbeat
- Add a periodic background process (`domain/heartbeat/`) that evaluates AIM triggers
  for all active instances on a configurable interval (default: 5 minutes)
- Surface fired triggers as heartbeat signals via existing SSE and a new MCP tool
- No auto-initiation of cycles -- detection and notification only

### Stage 2: Memory Integration Optimization
- Replace per-object Memory upserts in the ingest pipeline with bulk `CreateSubgraph()`
- Replace multi-hop Postgres relationship walks in ripple propagation with Memory's
  `Expand()` API
- Reduce both code and API round-trips while increasing Memory's role

### Stage 3: LLM Structured Output
- Add `response_format` (JSON mode) support to `internal/llm/client.go`
- Add `ModelSelector` interface for routing different tasks to different models
- Add token/cost tracking surfaced through convergence summaries

### Stage 4: Evidence Pipeline (Two-Door Lobby)
- **Door 1 (extend existing):** Complete the epf-cli's unfinished document evidence
  path — implement full content upload to Memory (the `EvidenceDocument.AbsPath`
  field was designed for this but never wired), add optional YAML front matter for
  richer metadata, extend `ReferenceDocument` with lifecycle tracking. This makes
  the existing `AIM/evidence/` library fully content-searchable and supports the
  bootstrap scenario where initial strategic documents are the primary evidence.
- **Door 2 (new):** Add structured evidence API for machine-ingested evidence.
  `evidence_item_schema.json` in canonical EPF, `domain/evidence/` package,
  MCP tools (`ingest_evidence`, `list_evidence`, `link_evidence`, etc.), stored
  as `strategy_artifacts` (type='evidence'). Freeform tags instead of type enums.
- **Shared pipeline:** Both doors converge in Memory. DraftAssessment queries for
  all unprocessed evidence (both `ReferenceDocument` and `evidence` types), groups
  by linked artifact, includes in LLM context. Assessment report extended with
  optional `evidence_summary`. Evidence threshold trigger with tag-based filtering.
- Supports three scenarios: Cycle 0 bootstrap (documents only), mid-flight mixed
  evidence (documents + structured), and existing behavior (no evidence)

### Stage 5: Auto-Initiation with Confirmation
- When heartbeat detects a fired trigger, auto-stage a "cycle proposal" explaining
  why a cycle should run (trigger reason, evidence count, signal count)
- User approves to start the cycle, or defers with a configurable snooze
- Not autonomous execution -- autonomous proposal of execution

### Stage 6: Activity Stream
- Add `domain/activity/` package with unified event log
- Capture all autonomous processing: convergence runs, auto-resolved signals,
  evidence ingestion, trigger evaluations, cycle proposals
- SSE endpoint for real-time streaming
- MCP tool: `list_activities` with cursor pagination

### Stage 7: Enriched Calibration Feedback
- Enhance `ApplyCalibration` to generate substantive READY artifact amendments using
  evidence data and structured LLM output
- Draft specific roadmap KR adjustments, LRA updates, new assumptions, feature
  priority changes
- All staged as a single batch for human review

## Impact

- Affected specs: `strategy-ripple`, `strategy-authoring`, `strategy-semantic`
- Canonical EPF schema changes (Stage 4):
  - New: `evidence_item_schema.json` (evidence intake pipeline)
  - Extended: `assessment_report_schema.json` (optional `evidence_summary` section)
  - Extended: `aim_trigger_config_schema.json` (`evidence_threshold` trigger)
  - New: `AIM/evidence_item.yaml` template
  - All changes backward-compatible (new optional fields only)
- Affected code:
  - New packages: `domain/heartbeat/`, `domain/evidence/`, `domain/activity/`
  - Modified: `domain/aim/service.go`, `domain/ripple/propagation.go`,
    `domain/ingest/service.go`, `internal/llm/client.go`, `internal/mcpserver/server.go`,
    `cmd_serve.go`
  - New migrations: activity log table, heartbeat signals table
  - Embedded schema sync after canonical EPF update
- No breaking changes to existing MCP tools or APIs
- Each stage is independently deployable and testable
