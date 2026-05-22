# Change: Unify AIM Pipeline UX

## Why

The AIM cycle is a single coherent pipeline:

```
Evidence/Signals → Proposal → AIM Cycle → Draft Review → Commit → Updated Strategy
```

But the web UI fragments it across 7+ disconnected screens: Coherence (signals),
Proposals (approval gate), AIM Run Panel (orchestration steps), Draft Review
(batch diff), Activity (active runs), Versions (end results), and individual
READY artifact pages (generating badges/pending banners). The user has to
mentally reconstruct the pipeline by navigating between these pages.

The core problem: **the user thinks in terms of a lifecycle ("something happened,
the system noticed, it's suggesting changes, I need to review them"), but the UI
is organized by data type (signals, proposals, versions, batches).**

This creates three specific failures:

1. **No single place to see "what's happening now"** — active skill runs are on
   the Activity page, pending batches are on READY artifact cards, the AIM cycle
   is on the Run Panel. A user logging in after a weekend has no single view to
   understand the current state.

2. **No connection between cause and effect** — a ripple signal triggers
   adapt-foundations, which produces a batch, which when committed triggers
   adapt-strategy, which produces another batch, which when committed produces a
   version. These are 5 events across 5 screens with no visual thread connecting
   them.

3. **The human review gate is hidden** — the most critical user action (commit or
   discard a batch) is reached only via direct URL or a small banner on the READY
   overview. There is no prominent inbox of "things waiting for your decision."

## What Changes

### 1. Redesign AIM Landing Page as Pipeline View

Replace the current AIM overview (cycle stepper + signal feed + artifact checklist)
with a **pipeline view** that shows the full lifecycle on one page:

**Pipeline stages** (rendered as a horizontal timeline or vertical flow):

| Stage | What it shows | Status indicators |
|-------|--------------|-------------------|
| **Observe** | Active signals (count + severity), recent evidence | Signal count badge, "new since last cycle" |
| **Propose** | Current proposal (if any), or "no cycle due" | Pending/approved/deferred badge |
| **Execute** | Active AIM cycle run (if running), or last completed | Step progress, skill run status |
| **Review** | All pending batches across all skill runs | Count badge, list of batches with CTAs |
| **Result** | Latest version published by this pipeline | Version number, equilibrium score |

Each stage links to its detail page (Coherence, Proposals, Run Panel, Draft
Review, Versions) but the pipeline view gives the complete picture at a glance.

### 2. Pending Reviews Inbox

Create a **consolidated review inbox** as a first-class section on the AIM
pipeline view. It collects ALL pending batches for the instance — from
adapt-foundations, adapt-strategy, AIM cycle steps — into a single list:

- Batch description and source (which skill/agent produced it)
- Affected artifacts (which READY/FIRE artifacts will change)
- Downstream effect hint ("committing this will trigger adapt-foundations")
- Commit / Discard CTAs inline

This replaces the current scattered pattern where pending batches appear as
banners on individual READY artifact pages.

### 3. Cascade Timeline

Add a **cascade timeline** section showing the causal chain of events within the
current or most recent cycle:

```
Signal detected (3 critical)
  → Proposal created (2h ago)
    → Proposal approved (1h ago)
      → AIM cycle started
        → Step 1: Draft assessment ✓ (42K tokens, 38s)
        → Step 2: Draft calibration ✓ (28K tokens, 24s)
        → Step 3: Apply calibration → batch staged → AWAITING REVIEW
```

This makes the cause-effect chain visible. Each node in the timeline links to
the relevant detail (signal, proposal, run step, batch review).

### 4. Remove Redundant Sub-Pages

With the pipeline view as the primary AIM orientation:

- **Keep**: Coherence, Versions, Proposals, Assumptions as sub-pages for
  deep-dive detail
- **Remove from sub-nav**: Calibration, Assessment Report, LRA (these are
  artifacts viewable from the READY dashboard or the pipeline detail)
- **Relocate**: Draft Review stays at its URL but is surfaced primarily
  through the pipeline inbox, not as a standalone sub-nav item

### 5. Active State Indicators on Execution Dashboard

Add a compact "Strategy Loop" status widget to the Execution dashboard showing:

- Is a cycle running? Which step?
- Any pending reviews? How many?
- Last version published? When?

This gives the user a quick pulse without navigating to AIM.

## Impact

- **Affected specs**: `strategy-web`
- **Affected code**: `internal/handler/` (AIM handlers), `internal/ui/` (templ
  components), `internal/navigation/` (screen graph restructuring)
- **No backend changes**: All data already exists in the DB — this is purely a
  rendering/UX restructuring
- **No breaking changes**: MCP tools and domain services are unaffected
