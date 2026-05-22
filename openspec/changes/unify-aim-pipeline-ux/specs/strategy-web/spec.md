## ADDED Requirements

### Requirement: AIM Pipeline View

The AIM landing page SHALL render a pipeline visualization showing the full
strategy loop lifecycle: Observe (signals/evidence) → Propose (cycle proposal) →
Execute (AIM cycle run) → Review (pending batches) → Result (published version).

Each stage SHALL show its current status (active/complete/waiting) and a count
of actionable items. Each stage SHALL link to the relevant detail sub-page.

#### Scenario: Idle state
- **WHEN** no cycle is running and no proposals are pending
- **THEN** the pipeline shows all stages as idle
- **AND** the Observe stage shows current signal counts

#### Scenario: Active cycle
- **WHEN** an AIM cycle run is in progress
- **THEN** the Execute stage shows the current step name and progress
- **AND** completed steps show check marks
- **AND** the Review stage shows any pending batches produced so far

#### Scenario: Pending review
- **WHEN** one or more batches are staged and awaiting human review
- **THEN** the Review stage shows a count badge and lists all pending batches
- **AND** each batch has inline Commit/Discard actions

### Requirement: Pending Reviews Inbox

The AIM pipeline view SHALL include a consolidated review inbox listing ALL
pending staged batches for the instance, regardless of which skill or workflow
produced them.

Each review item SHALL display the source skill name, affected artifact types,
mutation count, downstream effect hint, and Commit/Discard action buttons.

#### Scenario: Multiple pending batches
- **WHEN** adapt-strategy and adapt-foundations both have pending batches
- **THEN** both batches appear in the single inbox ordered by creation time
- **AND** each shows its source skill and downstream hint

#### Scenario: Inline commit
- **WHEN** the user clicks Commit on a batch in the inbox
- **THEN** the batch is committed and the inbox item is removed via HTMX swap
- **AND** if the commit triggers a downstream skill run, the pipeline updates

### Requirement: Cascade Timeline

The AIM pipeline view SHALL include a cascade timeline showing the causal chain
of events within the current or most recent strategy loop cycle.

Timeline events SHALL include: signal detection, proposal creation/approval,
cycle start, step completions (with token counts), batch staging, batch commit,
and version publication.

#### Scenario: Full cycle timeline
- **WHEN** a cycle has completed from proposal through version publication
- **THEN** the timeline shows each event in chronological order
- **AND** each event links to the relevant detail (signal, run step, batch, version)

### Requirement: Execution Dashboard Strategy Loop Widget

The Execution dashboard SHALL include a compact strategy loop status widget
showing: whether a cycle is running (and which step), how many batches are
pending review, and when the last version was published.

#### Scenario: Active cycle with pending review
- **WHEN** an AIM cycle is running and 2 batches are pending
- **THEN** the widget shows "Cycle running: Draft Calibration" and "2 pending reviews"

## MODIFIED Requirements

### Requirement: AIM Sub-Navigation

The AIM tab sub-navigation SHALL display only pages that serve as distinct
analytical views: AIM (pipeline landing), Coherence, Assumptions, Versions,
Proposals. Artifact detail pages (Calibration, Assessment Report, LRA) SHALL
remain accessible by direct URL but SHALL NOT appear in the sub-navigation bar.

#### Scenario: Sub-nav items
- **WHEN** the user views any AIM sub-page
- **THEN** the sub-nav shows: AIM | Coherence | Assumptions | Versions | Proposals
- **AND** Calibration, Assessment Report, and LRA are not in the sub-nav

#### Scenario: Direct URL access preserved
- **WHEN** the user navigates directly to /aim/calibration or /aim/lra
- **THEN** the page renders correctly with the AIM tab active
- **AND** the sub-nav highlights the AIM landing (closest parent)
