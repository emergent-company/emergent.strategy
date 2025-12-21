# Release Notifications Capability

## ADDED Requirements

### Requirement: Changelog Generation from Git Commits

The system SHALL generate human-friendly changelogs from git commit history using LLM processing.

#### Scenario: Generate changelog from commits since last notification

- **WHEN** new commits exist since `last_notified_commit`
- **THEN** the system SHALL fetch all commits from that point to HEAD
- **AND** send commit messages to LLM for summarization
- **AND** return a structured changelog with categories (Features, Fixes, Improvements)

#### Scenario: Generate changelog with explicit commit range

- **WHEN** `--from` and/or `--to` flags are provided
- **THEN** the system SHALL use the specified commit range instead of auto-detection

#### Scenario: Skip non-relevant commits

- **WHEN** generating a changelog
- **THEN** merge commits and CI-only changes (e.g., "chore: update deps") SHALL be excluded from the summary

#### Scenario: Handle empty commit range

- **WHEN** no commits exist since last notification
- **THEN** the system SHALL skip with message "No new commits since last notification"

#### Scenario: Handle first run (no previous state)

- **WHEN** no `last_notified_commit` exists in database
- **THEN** the system SHALL default to the last 20 commits or commits from the last 24 hours, whichever is smaller

#### Scenario: Truncate large commit ranges

- **WHEN** more than 50 commits exist in the range
- **THEN** the system SHALL process only the newest 50 commits
- **AND** include a note "and N more commits" in the changelog

#### Scenario: Handle LLM failure

- **WHEN** the LLM fails to generate a changelog
- **THEN** the system SHALL retry up to 3 times with exponential backoff
- **AND** if all retries fail, offer `--raw-commits` fallback option

#### Scenario: Raw commits fallback

- **WHEN** `--raw-commits` flag is provided
- **THEN** the system SHALL skip LLM processing
- **AND** use raw commit messages formatted as bullet points

### Requirement: Release Notification Delivery

The system SHALL deliver release notifications to targeted users via both email AND in-app notifications.

#### Scenario: Send notification to single user

- **WHEN** a release notification is triggered with `--user-id=<uuid>`
- **THEN** only that user SHALL receive both email and in-app notifications

#### Scenario: Send notification to all users

- **WHEN** a release notification is triggered with `--all-users` flag
- **THEN** all active users SHALL receive both email and in-app notifications

#### Scenario: Send notification to project members

- **WHEN** a release notification is triggered with `--project-id=<uuid>`
- **THEN** all members of that project SHALL receive the notifications

#### Scenario: Notification content format

- **WHEN** a release notification is created
- **THEN** it SHALL include:
  - Version: Date-based version (e.g., "v2024.12.19")
  - Title: "New Release: {version}"
  - Message: LLM-generated summary (max 500 characters)
  - Category: `release.deployed`
  - Details: Full changelog JSON with features, fixes, improvements arrays

#### Scenario: Email notification with template

- **WHEN** sending release notification emails
- **THEN** the system SHALL use the `release-notification.mjml.hbs` template
- **AND** include a "View in browser" link to `/releases/{version}`

### Requirement: Audience Expansion

The system SHALL support re-sending the same release to a broader audience.

#### Scenario: Block duplicate without expand flag

- **WHEN** attempting to send a release notification for the same commit range
- **AND** a notification for that range already exists
- **AND** `--expand-audience` flag is NOT provided
- **THEN** the system SHALL skip sending with message "Already sent to [audience]"

#### Scenario: Allow expansion with flag

- **WHEN** `--expand-audience` flag is provided
- **THEN** the system SHALL send to new recipients only
- **AND** skip users who already received the notification

### Requirement: Duplicate Prevention and State Tracking

The system SHALL track release notification state to prevent duplicates and enable incremental notifications.

#### Scenario: Track last notified commit

- **WHEN** a release notification is successfully sent
- **THEN** the system SHALL update `last_notified_commit` in `kb.release_notification_state`

#### Scenario: Detect history rewrite

- **WHEN** the stored `last_notified_commit` is not found in git history
- **THEN** the system SHALL detect this as a history rewrite
- **AND** require `--reset` or `--from` flag to proceed

#### Scenario: Reset state tracking

- **WHEN** `--reset` flag is provided
- **THEN** the system SHALL clear the `last_notified_commit` state
- **AND** proceed as if running for the first time

#### Scenario: Concurrent run protection

- **WHEN** multiple CLI instances attempt to run simultaneously
- **THEN** the system SHALL use row-level locking (`FOR UPDATE NOWAIT`)
- **AND** the second instance SHALL fail with "Another release notification is in progress"

#### Scenario: Rollback on partial failure

- **WHEN** notification sending fails for some recipients
- **THEN** the system SHALL NOT update `last_notified_commit`
- **AND** log which recipients failed

### Requirement: Notification Debouncing

The system SHALL enforce a minimum time gap between release notifications to prevent notification fatigue.

#### Scenario: Enforce minimum interval

- **WHEN** attempting to send a release notification
- **AND** a notification was sent within the last hour (configurable)
- **THEN** the system SHALL skip sending unless `--force` flag is used

#### Scenario: Force override debounce

- **WHEN** `--force` flag is provided
- **THEN** the debounce check SHALL be bypassed

### Requirement: Delivery Status Tracking

The system SHALL track email delivery status via Mailgun Events API.

#### Scenario: Store Mailgun message ID

- **WHEN** an email notification is sent
- **THEN** the system SHALL store the `mailgun_message_id` in `kb.release_notification_recipients`

#### Scenario: Query delivery status

- **WHEN** `--status` flag is provided with a release ID or "latest"
- **THEN** the system SHALL query Mailgun Events API for each recipient
- **AND** display aggregated status (delivered, opened, failed counts)

#### Scenario: Update status in database

- **WHEN** querying Mailgun Events API
- **THEN** the system SHALL update `email_status` in `kb.release_notification_recipients`
- **AND** record the last status update timestamp

#### Scenario: Status values

- **WHEN** tracking email delivery
- **THEN** the following status values SHALL be used:
  - `pending` - Email sent, no events yet
  - `delivered` - Mailgun confirmed delivery
  - `opened` - Recipient opened email
  - `failed` - Delivery failed (bounce, reject, etc.)

### Requirement: CLI Command for Release Notifications

The system SHALL provide a CLI command to trigger release notifications manually.

#### Scenario: Basic CLI invocation

- **WHEN** running `nx run server:release-notify --all-users`
- **THEN** the system SHALL generate a changelog from commits since last notification
- **AND** send notifications to all users

#### Scenario: CLI with commit range

- **WHEN** running `nx run server:release-notify --from=abc123 --to=def456`
- **THEN** the system SHALL use the specified commit range

#### Scenario: CLI dry-run mode

- **WHEN** running with `--dry-run` flag
- **THEN** the system SHALL show what would be sent without actually sending notifications
- **AND** display the generated changelog and target recipients

#### Scenario: CLI with user targeting

- **WHEN** running with `--user-id=<uuid>`, `--project-id=<uuid>`, or `--all-users`
- **THEN** the system SHALL target notifications accordingly

#### Scenario: CLI status check - latest

- **WHEN** running with `--status latest`
- **THEN** the system SHALL display delivery status for the most recent release

#### Scenario: CLI status check - specific release

- **WHEN** running with `--status v2024.12.19`
- **THEN** the system SHALL display delivery status for that specific release

#### Scenario: CLI status check - last N releases

- **WHEN** running with `--status-count=5`
- **THEN** the system SHALL display summary status for the last 5 releases

### Requirement: Release Notification Categories

The system SHALL support new notification categories for releases.

#### Scenario: Release deployed category

- **WHEN** a release notification is created
- **THEN** it SHALL use category `release.deployed`
- **AND** users SHALL be able to filter notifications by this category

#### Scenario: Release features category

- **WHEN** creating feature announcements (future use)
- **THEN** the `release.features` category SHALL be available

### Requirement: Date-Based Release Versioning

The system SHALL use date-based version identifiers for releases.

#### Scenario: Generate version from date

- **WHEN** creating a new release notification
- **THEN** the version SHALL be formatted as `v{YYYY}.{MM}.{DD}` (e.g., `v2024.12.19`)

#### Scenario: Handle multiple releases per day

- **WHEN** a release already exists for the current date
- **THEN** the version SHALL be suffixed with a counter (e.g., `v2024.12.19.2`, `v2024.12.19.3`)

### Requirement: Public Releases Page

The system SHALL provide a public page for viewing release history.

#### Scenario: Access releases list without authentication

- **WHEN** navigating to `/releases`
- **THEN** the page SHALL load without requiring authentication
- **AND** display a list of all releases with version, date, and changelog summary

#### Scenario: Access individual release without authentication

- **WHEN** navigating to `/releases/{version}`
- **THEN** the page SHALL load without requiring authentication
- **AND** display the full changelog for that release

#### Scenario: Link from landing page

- **WHEN** viewing the landing page footer
- **THEN** a link to the releases page SHALL be visible

#### Scenario: View in browser link from email

- **WHEN** receiving a release notification email
- **THEN** a "View in browser" link SHALL point to `/releases/{version}`

### Requirement: Email Template Component System

The system SHALL use reusable MJML + Handlebars partials for email templates.

#### Scenario: Section header partial

- **WHEN** rendering a section header (e.g., "Features")
- **THEN** the `section-header.mjml.hbs` partial SHALL be used

#### Scenario: List item partial

- **WHEN** rendering bullet point items in the changelog
- **THEN** the `list-item.mjml.hbs` partial SHALL be used

#### Scenario: Divider partial

- **WHEN** separating sections in the email
- **THEN** the `divider.mjml.hbs` partial SHALL be used

#### Scenario: View in browser partial

- **WHEN** adding a "View in browser" link
- **THEN** the `view-in-browser.mjml.hbs` partial SHALL be used
- **AND** the link SHALL point to the public releases page
