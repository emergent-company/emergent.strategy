## Stage 1: Background Heartbeat

- [x] 1.1 Create `domain/heartbeat/` package with `Service` struct
- [x] 1.2 Implement `EvaluateAll(ctx) []TriggerResult` — queries all active instances,
      calls `aim.EvaluateTriggers()` for each, returns fired triggers
- [x] 1.3 Batch the trigger queries — single SQL with `GROUP BY instance_id` for
      critical signal counts instead of N individual queries
- [x] 1.4 Add `heartbeat_signals` table (migration 023) — stores fired trigger events
      with instance_id, reason, message, created_at, acknowledged_at
- [x] 1.5 Wire ticker goroutine in `cmd_serve.go` — configurable interval via
      `HEARTBEAT_INTERVAL` env var (default 5m=300s), graceful shutdown via context
- [x] 1.6 Add MCP tool `list_heartbeat_signals` — returns unacknowledged signals
- [x] 1.7 Add MCP tool `acknowledge_heartbeat` — marks a signal as seen
- [ ] 1.8 Surface heartbeat signals in existing SSE fanout for web UI
      NOTE: deferred to Stage 6 (Activity Stream) — requires per-instance SSE channel
- [x] 1.9 Write tests for heartbeat service (use `database.TestDB(t)`) — 9 tests all pass
- [x] 1.10 Verify: heartbeat runs on startup, fires for instances with overdue
      triggers, does not fire for healthy instances

## Stage 2: Memory Integration Optimization

- [x] 2.1 Replace per-object upserts in `domain/ingest/service.go` with bulk
      `memory.Client.CreateSubgraph()` for batch ingestion
- [x] 2.2 Replace multi-hop SQL queries in `domain/ripple/propagation.go:193-258`
      with `memory.Client.Expand(maxDepth:2)` call
- [x] 2.3 Add fallback: if Memory is unavailable, fall back to existing SQL queries
      (the current code becomes the fallback path)
- [x] 2.4 Update ingest sync count tracking for bulk operations
- [x] 2.5 Write tests comparing SQL path vs Memory path results for consistency
- [x] 2.6 Verify: convergence loop still reaches equilibrium with Memory-backed
      traversal, ingest pipeline handles bulk failures gracefully

## Stage 3: LLM Structured Output

- [x] 3.1 Add `ResponseFormat` field to `chatRequest` in `internal/llm/client.go`
      supporting `json_object` and `json_schema` modes
- [x] 3.2 Add `ChatWithFormat(ctx, messages, temperature, format)` method that sets
      response_format in the request
- [x] 3.3 Define `ModelSelector` interface in `internal/llm/selector.go`:
      `SelectModel(task TaskType) Config` with task types for signal_classification,
      assessment_enrichment, calibration_reasoning, signal_resolution
- [x] 3.4 Implement `DefaultModelSelector` — returns the configured model for all
      tasks (existing behavior, zero change)
- [x] 3.5 Update `llm_resolver.go` to use structured output instead of parsing JSON
      from freeform text
- [x] 3.6 Update `aim/service.go` calibration enrichment to use structured output
      (`CompleteJSON` → `{"reasoning":"..."}` response; OKR narrative stays plain text)
- [x] 3.7 Propagate token usage from `ChatResult` through convergence summaries
      (`LLMInputTokens`/`LLMOutputTokens` on `ConvergenceSummary`) and `ResolveResult`
- [x] 3.8 Write tests for structured output parsing (mock HTTP server for `ChatWithFormat`,
      mock `LLMClient` for calibration enrichment fallback paths)
- [x] 3.9 Verify: LLM resolver uses json_object mode, calibration enrichment uses
      structured JSON + falls back gracefully, token usage appears in convergence summaries

## Stage 4: Evidence Pipeline (Two-Door Lobby)

### 4a. Door 1 — Complete Existing Document Evidence Path

- [ ] 4.1 Implement full content upload in epf-cli ingest pipeline — use the
      existing `EvidenceDocument.AbsPath` field (designed but unimplemented) to
      upload document content to Memory for vectorization. For .md: upload raw
      text. For .pdf/.docx: extract text first. This is the highest-value change
      — makes the existing evidence library fully searchable.
- [ ] 4.2 Add optional YAML front matter parsing to `decomposeEvidence()` — when
      a .md file has `---` front matter, extract `source`, `collected_at`, `tags`,
      `linked_artifacts`, `summary`. When absent, use defaults (category as tag,
      mtime as date). Preserve "just drop a file" experience.
- [ ] 4.3 Extend `ReferenceDocument` type properties in decomposer schema — add
      `processing_status` (unprocessed/processed/archived), `processed_by`,
      `processed_at`, `tags` (string array), `collected_at`, `source_type`.
      All optional, backward-compatible.
- [ ] 4.4 Update `evidence_README.md` template — document front matter format,
      processing lifecycle, and relationship to structured evidence.
- [ ] 4.5 Verify content upload: search for a phrase that appears mid-document
      (not first line) and confirm it returns the `ReferenceDocument` hit.

### 4b. Door 2 — Structured Evidence API

- [ ] 4.6 Create `evidence_item_schema.json` in canonical EPF — required fields:
      `source` (object: `name` string, `type` freeform string, optional `url`/
      `confidence`), `collected_at` (ISO datetime), `content` (freeform object).
      Optional fields: `tags` (string array), `summary` (string),
      `linked_artifacts` (array of artifact key strings). NO type enum.
- [ ] 4.7 Create `AIM/evidence_item.yaml` template in canonical EPF templates
- [ ] 4.8 Ship suggested tag vocabulary as examples in the schema: `competitive`,
      `partner`, `technical`, `market`, `narrative`, `product-specs`, `internal`,
      `metric`, `user-feedback`, `sales`, `support`, `engineering` (derived from
      existing AIM/evidence categories plus common structured sources)
- [ ] 4.9 Sync updated schemas to strategy-server via `make sync-embedded`
- [ ] 4.10 Run decomposer field reconciliation test:
      `go test ./internal/embedded/... -run TestDecomposerFieldsMatchSchemas`
- [x] 4.11 Create `domain/evidence/` package with `Service` struct
- [x] 4.12 Implement `Ingest(ctx, instanceID, evidence)` — validates against
      `evidence_item_schema.json`, stores as `strategy_artifact` with
      `artifact_type='evidence'`, enqueues Memory ingestion. No new table.
- [x] 4.13 Implement `List(ctx, instanceID, filters)` — filters: tags (any match),
      source name, processing status, date range, linked artifact key
- [x] 4.14 Implement `Link(ctx, evidenceKey, targetKey, relationship)` — creates
      `strategy_relationship` edge
- [x] 4.15 Implement `MarkProcessed(ctx, evidenceKeys, assessmentKey)` — sets
      artifact status to `processed`, records which assessment consumed it
- [x] 4.16 Add MCP tools: `ingest_evidence`, `list_evidence`, `get_evidence`,
      `link_evidence`, `update_evidence`
- [x] 4.17 Push evidence objects to Memory graph with evidence-specific properties
      (tags, source, collected_at)

### 4c. Shared Pipeline — Assessment Consumption

- [x] 4.18 Extend `assessment_report_schema.json` — add optional `evidence_summary`
      section. Each entry: `artifact_key`, `source_name`, `tags`, `summary`,
      `linked_to`. Backward-compatible.
- [x] 4.19 Extend `aim_trigger_config_schema.json` — add `evidence_threshold`
      trigger config with `enabled`, `unprocessed_count_threshold`, and optional
      `tag_filter` array
- [x] 4.20 Wire unified evidence query into `aim/service.go DraftAssessment` —
      query Memory for both `ReferenceDocument` (Door 1) and `evidence` (Door 2)
      objects with `processing_status=unprocessed`. Group by linked artifact.
      Include linked evidence in per-OKR context. Include unlinked evidence as
      general strategic context.
- [x] 4.21 Add `evidence_threshold` trigger to `aim/service.go EvaluateTriggers`
      — count unprocessed evidence (both types), with optional tag filter
- [x] 4.22 Mark consumed evidence as processed on assessment batch commit — update
      both `strategy_artifacts` status and Memory object `processing_status`
- [x] 4.23 Write tests: structured evidence lifecycle, trigger evaluation with tags,
      assessment consumption and processing (AssessmentEvidenceKeys)
- [x] 4.24 Write tests: backward compatibility — assessment works identically when
      no evidence exists (neither door)
- [ ] 4.25 Verify end-to-end: the bootstrap scenario (Cycle 0 with only documents),
      the mid-flight scenario (mixed documents and structured evidence),
      and the no-evidence scenario (existing behavior preserved)

## Stage 5: Auto-Initiation with Confirmation

- [x] 5.1 Define `CycleProposal` model — trigger reason, evidence summary, signal
      summary, time since last assessment, recommended action
- [x] 5.2 Add `cycle_proposals` table (migration) — stores proposals with status
      (pending/approved/deferred/expired), snooze_until
- [x] 5.3 Implement proposal generation in heartbeat service — when trigger fires
      AND no active cycle AND no pending proposal, create a proposal
- [x] 5.4 Add MCP tool `list_cycle_proposals` — returns pending proposals
- [x] 5.5 Add MCP tool `approve_cycle_proposal` — approves and auto-starts AIM cycle
- [x] 5.6 Add MCP tool `defer_cycle_proposal` — sets snooze period (default 7 days)
- [ ] 5.7 Surface proposals in SSE stream for web UI notification (deferred to Stage 6)
- [x] 5.8 Handle proposal expiry — proposals older than snooze period auto-expire,
      heartbeat can create new ones
- [x] 5.9 Write tests for proposal lifecycle (create, approve → cycle starts, defer,
      expire, re-propose)
- [x] 5.10 Verify: proposals surface automatically, approval starts the cycle,
       deferral snoozes correctly, no duplicate proposals for same trigger

## Stage 6: Activity Stream

- [ ] 6.1 Create `domain/activity/` package with `Service` struct
- [ ] 6.2 Define activity types: convergence_run, signal_created, signal_auto_resolved,
      evidence_ingested, trigger_evaluated, trigger_fired, cycle_proposed,
      cycle_started, cycle_step_completed, heartbeat_run
- [ ] 6.3 Create migration for `strategy_activities` table — instance_id, activity_type,
      payload (JSONB), created_at, with index on (instance_id, created_at)
- [ ] 6.4 Add `Record(ctx, instanceID, activityType, payload)` — synchronous write,
      also publishes to SSE fanout
- [ ] 6.5 Wire activity recording into existing code:
      - Convergence loop: record run start/end with summary
      - Ripple service: record signal creation and auto-resolution
      - Heartbeat: record each evaluation run
      - AIM workflow: record step completions
      - Evidence service: record ingestion events
- [ ] 6.6 Add SSE endpoint for activity streaming (per-instance)
- [ ] 6.7 Add MCP tool `list_activities` with cursor pagination and type filter
- [ ] 6.8 Write tests for activity recording and retrieval
- [ ] 6.9 Verify: all autonomous actions produce activity entries, SSE stream
      delivers events in real time, MCP tool returns correct results

## Stage 7: Enriched Calibration Feedback

- [ ] 7.1 Enhance `ApplyCalibration` to generate evidence-backed roadmap KR
      adjustments — read evidence linked to KRs, propose specific target changes
- [ ] 7.2 Add LRA update generation — draft evolution_log entries from cycle findings
- [ ] 7.3 Add new assumption generation — from invalidated assumptions, propose
      replacement hypotheses
- [ ] 7.4 Add feature priority suggestions — based on value path coverage shifts
      detected during assessment
- [ ] 7.5 All amendments staged in a single batch for human review
- [ ] 7.6 Use structured LLM output (Stage 3) for generating amendments
- [ ] 7.7 Wire evidence data (Stage 4) into amendment generation context
- [ ] 7.8 Write tests for enriched calibration (mock LLM, verify patch structure)
- [ ] 7.9 Verify: calibration produces concrete amendments that pass schema validation,
      amendments propagate through convergence loop correctly
