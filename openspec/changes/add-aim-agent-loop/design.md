# Design: AI-Assisted AIM Agent Loop

## Context

Strategy-server is a constitution-compliant Go backend. All writes go through
the staged-batch authoring pattern: mutations are staged, presented for human
review, and committed explicitly. The ripple coherence engine already has a
pluggable `SignalResolver` interface and optional LLM provider integration
(via `LLM_PROVIDER_URL`). The AIM phase has all the read primitives: LRA,
assessment reports, calibration memos, roadmap OKRs, assumption relationships,
ripple signals, strategy versions.

The AI-assisted AIM loop is a **read-heavy drafting layer** on top of existing
infrastructure. It reads from multiple artifacts, synthesises a draft, and
returns a staged batch. It does not introduce new storage patterns, new auth
flows, or new background processes.

## Goals / Non-Goals

**Goals:**
- Draft assessment reports pre-populated with OKR targets and assumption IDs
- Draft calibration memos with a reasoned decision suggestion
- Apply calibration decisions as READY artifact update batches
- Detect when a new AIM cycle is due (cycle triggers) and surface in UI
- Snapshot completed cycles as named strategy versions
- Work without an LLM (skeleton-only mode: structure without narrative)

**Non-Goals:**
- Autonomous commits (all output requires explicit `commit_batch`)
- Background monitoring jobs or webhooks
- New LLM provider integration (reuse existing `LLM_PROVIDER_URL` / `SignalResolver`)
- Replacing the human decision on calibration (AI suggests, human confirms)
- Real-time streaming of AI output to the UI

## Decisions

### Decision 1: No new domain service — extend `domain/aim`

The AIM drafting logic lives in a new `domain/aim/` package, mirroring the
pattern of `domain/version/`, `domain/ripple/`, etc. It has one exported type:
`DraftService` with methods `DraftAssessment`, `DraftCalibration`,
`ApplyCalibration`, `ListCycles`. The service receives `*bun.DB` and an optional
`LLMClient` interface.

Alternative considered: Inline the drafting logic in handlers. Rejected because
the draft logic needs to be callable from both MCP tools and web handlers, and
keeping business logic out of handlers is a day-one constraint.

### Decision 2: LLM interaction is optional and isolated

`DraftService` accepts a `LLMClient` interface:

```go
type LLMClient interface {
    Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}
```

When nil (no `LLM_PROVIDER_URL`), drafts are skeleton-only: OKR structure with
KR targets copied from roadmap, assumption IDs with empty evidence, no narrative.
When configured, the client calls the existing OpenAI-compatible endpoint (same
as `domain/ripple`'s `SignalResolver`) and fills assessment text and calibration
reasoning.

This means the feature is fully usable without LLM access — you get structure
for free, narrative when configured.

### Decision 3: Trigger evaluation is lazy, not scheduled

Cycle triggers are evaluated at request time in the AIM landing page handler.
No cron job, no background goroutine, no new tables initially.

Trigger config is stored as a JSONB column on `strategy_instances`
(`aim_trigger_config`) or as a dedicated `strategy_artifacts` row with
`artifact_type = 'aim_trigger_config'`. The latter is preferred — it's
consistent with the existing artifact model and queryable by the same code paths.

Evaluation reads:
1. Latest `assessment_report` committed timestamp
2. Count of active `critical` ripple signals
3. Active roadmap cycle end date vs today

Returns a `TriggerState` struct with `Fired bool`, `Reason string`,
`RecommendedAction string`.

### Decision 4: Cycle snapshots use existing `publish_version`

When a calibration memo is committed, the AIM service optionally calls
`domain/version.Service.Publish()` with:
```json
{
  "label": "Cycle N — Persevere",
  "source": "aim_cycle",
  "metadata": { "cycle_number": 1, "calibration_decision": "persevere" }
}
```

No schema changes to `strategy_versions`. The existing `list_versions` MCP tool
already returns all versions; `list_aim_cycles` just filters by `source='aim_cycle'`.

### Decision 5: Draft review in UI is a read-only staging screen

The "Draft with AI" button in the web UI posts to a new endpoint
(`POST /strategies/:id/aim/draft-assessment`) which:
1. Calls `DraftService.DraftAssessment`
2. Stages the result as a batch
3. Redirects to a new `GET /strategies/:id/aim/draft-review/:batchID` screen

The draft review screen renders the staged batch content in a readable format
with a prominent "Commit" and "Discard" action — reusing the existing
`commit_batch` / `discard_batch` MCP tools via POST handlers.

This avoids building a full inline editor. The human can commit as-is (skeleton
mode) or edit the YAML directly (power users via MCP) before committing.

### Decision 6: `apply_aim_calibration` generates targeted patches, not full artifact rewrites

When applying a calibration decision to READY artifacts, the service generates
targeted field-level patches (e.g., add `review_flag: true` to a strategic bet)
rather than rewriting whole artifacts. This minimises blast radius and keeps
diffs readable.

For `pivot` decisions, the service identifies which strategic bets in the
formula are implicated by the calibration reasoning (via keyword matching or LLM
extraction) and flags only those. For `pull_the_plug`, it flags the north_star
`vision` field for human revision.

Patches are expressed as standard mutation payloads (the same format as
`update_feature`, `update_north_star`, etc.) and staged as a batch.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| LLM output quality varies | Skeleton mode always available; humans review before commit |
| Trigger fires too eagerly | Trigger config is per-instance and tunable; default thresholds are conservative |
| Draft produces structurally invalid payload | `validate_artifact` is called on every draft before staging; invalid drafts are rejected with a clear error |
| Cycle snapshot proliferation | Snapshots only created when calibration is committed, not on every draft |
| `apply_aim_calibration` patches wrong artifacts | Patches are staged for explicit review; human sees exactly what will change before committing |

## Migration Plan

No data migration. All new tables/columns are additive:
- `aim_trigger_config` stored as `artifact_type = 'aim_trigger_config'` — no
  schema change, handled by existing artifact CRUD
- `strategy_versions.metadata` already JSONB — `cycle_number` and
  `calibration_decision` fields are additive

## Open Questions

1. **LLM prompt quality:** The assessment draft prompt needs to extract
   meaningful `status` (on_track / at_risk / missed) from KR targets vs
   ripple signals. Is keyword matching sufficient or do we need the LLM even
   for status classification?
   → Start with rule-based status (no actuals = `pending`; critical signal on
   KR = `at_risk`). LLM adds narrative only.

2. **Trigger config UI:** Should trigger config be editable in the web UI, or
   only via MCP? The Settings page is the natural home but adds scope.
   → Defer to MCP-only for now; add to Settings in a follow-up.

3. **Multi-cycle instances:** Some instances will run multiple concurrent
   roadmap cycles (e.g., separate cycles per track). Does `draft_aim_assessment`
   target a specific cycle ID or always the "active" cycle?
   → Always the active cycle (roadmap_recipe has a single `cycle` field marking
   the current cycle). Multi-cycle support is a separate concern.
