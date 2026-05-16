## ADDED Requirements

### Requirement: Strategy Canvas View

The web UI SHALL provide a canvas view that visualizes the strategy instance
as an interactive graph of concentric circles — North Star at center,
strategy foundations, roadmap, value models, and features in outer rings.
Active ripple signals SHALL be visible as indicators on affected nodes.

#### Scenario: Canvas displays strategy graph

- **WHEN** a user navigates to `/instances/:id/canvas`
- **THEN** the system renders an interactive graph showing all committed artifacts as nodes, relationships as edges, and four tracks as color-coded strands

#### Scenario: Canvas shows active signals

- **WHEN** the strategy instance has active ripple signals
- **THEN** affected nodes display visual indicators (glow, badge, or pulse) with severity coloring (red for critical, amber for warning, blue for info)

#### Scenario: Canvas node navigation

- **WHEN** a user clicks a node on the canvas
- **THEN** the system navigates to the artifact detail or edit screen for that node

### Requirement: Ripple Preview Panel

The web UI SHALL provide a ripple preview panel in artifact edit screens that
shows the blast radius of the current edit. The preview SHALL use SSE to
stream analysis results progressively.

#### Scenario: Preview triggered on edit pause

- **WHEN** a user edits an artifact and pauses typing for 500ms (or clicks "Preview Impact")
- **THEN** the system computes ripple analysis and streams results to the preview panel via SSE, showing structural signals immediately and semantic signals as they compute

#### Scenario: Preview classifies change magnitude

- **WHEN** ripple preview completes
- **THEN** the preview panel displays the semantic change classification (trivial, minor, significant, major) with a visual indicator and count of affected artifacts

#### Scenario: Preview with no downstream effects

- **WHEN** a user edits an artifact that has no downstream relationships
- **THEN** the preview panel displays "No downstream artifacts affected"

### Requirement: Signal Dashboard

The web UI SHALL provide a signal dashboard showing all active ripple signals
for an instance, grouped by severity and filterable by type, track, and
status.

#### Scenario: Dashboard lists active signals

- **WHEN** a user navigates to `/instances/:id/signals`
- **THEN** the system displays all active signals grouped by severity (critical first), with source artifact, target artifact, description, suggested action, and signal age

#### Scenario: Dashboard signal actions

- **WHEN** a user interacts with a signal on the dashboard
- **THEN** the user can acknowledge it (mark as seen), dismiss it (with reason), or address it (navigate to ripple resolution flow)

### Requirement: Ripple Resolution Flow

The web UI SHALL provide a ripple resolution flow that guides users through
addressing active signals — either one-by-one (guided mode) or as a batch
(batch mode). All changes SHALL be staged into a single ripple batch.

#### Scenario: Guided resolution mode

- **WHEN** a user enters ripple resolution in guided mode
- **THEN** the system walks through each affected artifact in severity order, showing current content alongside AI-suggested updates, with accept/edit/skip controls per artifact

#### Scenario: Batch resolution mode

- **WHEN** a user enters ripple resolution in batch mode
- **THEN** the system displays all affected artifacts as a checklist with diff previews, allowing the user to select which to include in the commit

#### Scenario: Ripple batch commit

- **WHEN** a user commits from the resolution flow
- **THEN** all selected changes are committed as a single ripple batch with root cause metadata, and resolved signals are auto-marked as resolved
