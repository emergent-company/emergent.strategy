# Tasks: Unify AIM Pipeline UX

## 1. Pipeline View — AIM Landing Page Redesign

- [x] 1.1 Design pipeline stage data model: `AimPipelineData` struct with Observe,
      Propose, Execute, Review, Result stages — each with status/count/detail fields
- [x] 1.2 Create `loadAimPipelineData()` handler query assembling all 5 stages from
      existing domain services (signals, proposals, orchestration, mutations, versions)
- [x] 1.3 Create `aim_pipeline.templ` — horizontal pipeline visualization with stage
      cards, status badges, and drill-down links
- [x] 1.4 Replace `AimPhaseContent` rendering in `handleAimOverview` with the new
      pipeline view (keep cycle stepper component as a sub-component within Execute)
- [x] 1.5 Preserve sub-nav: Coherence, Assumptions, Versions, Proposals remain as
      sub-pages for deep-dive detail

## 2. Pending Reviews Inbox

- [x] 2.1 Create `aimPipelineReviewInbox` + `pipelineReviewItem` templ components —
      lists all pending batches with source skill, affected artifacts, downstream
      hints, and Review/Discard CTAs
- [x] 2.2 Add `loadPipelineReviewItems()` query — enriched with affected artifact type
      list via `STRING_AGG(DISTINCT artifact_type)` from batch mutations
- [x] 2.3 Embed the review inbox in the pipeline view main content area, shown when
      pending batches exist
- [x] 2.4 Discard CTA uses existing POST `/aim/draft-review/:batchID/discard` handler;
      Review links to the existing draft-review detail page

## 3. Cascade Timeline

- [x] 3.1 Create `aimPipelineTimeline` + `pipelineTimelineEvent` templ components —
      vertical timeline with icon dots, timestamps, and drill-down links
- [x] 3.2 Add `loadPipelineTimeline()` query — combines active signals, proposals,
      orchestration runs, skill runs, and version publications into a unified list
- [x] 3.3 Embed the cascade timeline in the pipeline view, collapsible when > 8 events

## 4. Navigation Cleanup

- [x] 4.1 Set `SubNavHidden: true` on LRA, Assessment Report, Calibration in graph.go
      (keep as direct URL routes for artifact detail view, just not in the nav bar)
- [x] 4.2 Reorder AIM screens in graph.go: Coherence, Assumptions, Versions, Proposals
      first (visible in sub-nav), then hidden artifact-detail pages
- [x] 4.3 All existing URLs still work — no route patterns changed, only SubNavHidden
      and ordering within the graph definition

## 5. Execution Dashboard Widget

- [x] 5.1 Add `LoopCycleRunning`, `LoopCycleStep`, `LoopPendingCount`, `LoopLastVersion`
      fields to `ExecutionData` struct
- [x] 5.2 Create `strategyLoopWidget` templ component — compact clickable card showing
      cycle state, pending reviews count, last version timestamp
- [x] 5.3 Add `loadStrategyLoopWidget()` handler function wiring orchestration engine,
      staged mutation count, and latest version timestamp

## 6. Remove Redundant UI

- [x] 6.1 Remove overlay cascade tracker container from `InstanceChrome` (already done
      in prior `add-operational-transparency` work)
- [x] 6.2 Keep `PendingDraftBanner` on artifact detail view — it serves a different
      purpose (real-time SSE notification when a draft is staged for *this* artifact)
      vs the pipeline inbox (consolidated view of all pending batches)
- [x] 6.3 Keep `GeneratingBadge` on READY cards (still useful as a live indicator that
      a skill is currently drafting that artifact)
