# Tasks: Unify AIM Pipeline UX

## 1. Pipeline View — AIM Landing Page Redesign

- [ ] 1.1 Design pipeline stage data model: `AimPipelineData` struct with Observe,
      Propose, Execute, Review, Result stages — each with status/count/detail fields
- [ ] 1.2 Create `loadAimPipelineData()` handler query assembling all 5 stages from
      existing domain services (signals, proposals, orchestration, mutations, versions)
- [ ] 1.3 Create `aim_pipeline.templ` — horizontal pipeline visualization with stage
      cards, status badges, and drill-down links
- [ ] 1.4 Replace `AimPhaseContent` rendering in `handleAimOverview` with the new
      pipeline view (keep cycle stepper component as a sub-component within Execute)
- [ ] 1.5 Preserve sub-nav: Coherence, Assumptions, Versions, Proposals remain as
      sub-pages for deep-dive detail

## 2. Pending Reviews Inbox

- [ ] 2.1 Create `AimReviewInbox` templ component — lists all pending batches for
      the instance with source skill, affected artifacts, downstream hints, and
      inline Commit/Discard CTAs
- [ ] 2.2 Add `loadPendingReviews()` query — reuses `loadCascadePendingBatches` logic
      but enriched with affected artifact type list (derived from batch mutations)
- [ ] 2.3 Embed the review inbox in the pipeline view's "Review" stage card, expandable
      when there are pending batches
- [ ] 2.4 Add HTMX inline commit/discard handlers that return the updated inbox fragment
      (existing draft-review commit/discard logic, returning partial instead of redirect)

## 3. Cascade Timeline

- [ ] 3.1 Create `CascadeTimeline` templ component — vertical timeline of events within
      the current/most recent cycle, showing causal chain from signal → proposal →
      cycle start → step completions → batch staged → commit
- [ ] 3.2 Add `loadCascadeTimeline()` query — combines activity events, skill run chunks,
      orchestration steps, and version publications into a unified ordered list
- [ ] 3.3 Embed the cascade timeline in the pipeline view, collapsible, showing the
      latest 10-15 events

## 4. Navigation Cleanup

- [ ] 4.1 Remove Calibration, Assessment Report, LRA from AIM sub-nav (keep as direct
      URL routes for artifact detail view, just not in the navigation bar)
- [ ] 4.2 Update AIM sub-nav order: AIM (pipeline) | Coherence | Assumptions | Versions | Proposals
- [ ] 4.3 Verify all existing URLs still work (no broken links from bookmarks/MCP)

## 5. Execution Dashboard Widget

- [ ] 5.1 Create `StrategyLoopWidget` templ component — compact status card showing
      cycle state (running/idle), pending reviews count, last version timestamp
- [ ] 5.2 Add the widget to `ExecutionDashboardContent` header area
- [ ] 5.3 Wire the widget to existing data from `loadCascadeData` and `loadAimPhaseData`

## 6. Remove Redundant UI

- [ ] 6.1 Remove overlay cascade tracker container from `InstanceChrome` (already done)
- [ ] 6.2 Remove `PendingDraftBanner` from individual READY artifact cards (replaced by
      the centralized review inbox)
- [ ] 6.3 Keep `GeneratingBadge` on READY cards (still useful as a live indicator that
      a skill is currently drafting that artifact)
