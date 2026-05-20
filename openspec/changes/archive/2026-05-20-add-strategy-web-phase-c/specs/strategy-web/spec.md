## ADDED Requirements

### Requirement: Coherence Signal Actions
Users SHALL be able to acknowledge, dismiss (with reason), or resolve each active coherence signal
directly from the Coherence screen without leaving the page. Each action SHALL update only the
affected signal card in-place via HTMX (no full page reload).

#### Scenario: Acknowledge a signal
- **WHEN** the user clicks "Acknowledge" on an active signal card
- **THEN** a POST is sent to `/strategies/:id/aim/coherence/signals/:signalID/acknowledge`
- **AND** the card is replaced with an acknowledged-state view showing the updated status chip

#### Scenario: Dismiss a signal with reason
- **WHEN** the user fills the inline reason input and clicks "Dismiss"
- **THEN** a POST is sent with the reason field
- **AND** the card is replaced with a dismissed-state view

#### Scenario: Resolve a signal
- **WHEN** the user clicks "Resolve" on an active signal card
- **THEN** a POST is sent to resolve the signal
- **AND** the card is replaced with a resolved-state view

### Requirement: Version Browser
Users SHALL be able to browse the full version history of a strategy instance at `/aim/versions`.
Each version SHALL display label, date, artifact count, source (manual or convergence), and a link
to a detail view showing the diff from the parent version.

#### Scenario: List versions
- **WHEN** the user navigates to the Versions screen
- **THEN** all published versions are shown in reverse-chronological order
- **AND** each row shows label, published date, artifact count, and source badge

#### Scenario: View version diff
- **WHEN** the user clicks a version row
- **THEN** a detail view shows the diff between this version and its parent
- **AND** added, modified, and removed artifacts are listed by key

#### Scenario: Restore a version
- **WHEN** the user clicks "Restore" on a version detail view and confirms
- **THEN** a POST to `/aim/versions/:versionID/restore` restores that version's state
- **AND** the user is redirected to the instance dashboard

### Requirement: GitHub Sync Trigger in Settings
Users SHALL be able to trigger a GitHub sync and see its result from the instance settings page.
When `github_repo` is not configured, the card SHALL show clear setup guidance instead of a button.

#### Scenario: Trigger sync
- **WHEN** the user clicks "Sync to GitHub" and github_repo is configured
- **THEN** a POST to `/settings/sync` triggers a draft sync
- **AND** the GitHub sync card updates in-place to show the PR number and URL

#### Scenario: Not configured
- **WHEN** the user views the settings page and github_repo is not set
- **THEN** the GitHub sync card shows setup guidance (no button)

#### Scenario: Sync failure
- **WHEN** a sync fails (e.g. GitHub App not installed)
- **THEN** the card shows the error message inline
