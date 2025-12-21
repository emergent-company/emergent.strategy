# Tasks: Release Notifications

## 1. Database & Entity Setup

- [ ] 1.1 Create migration for `kb.release_notification_state` table
- [ ] 1.2 Create migration for `kb.release_notifications` table
- [ ] 1.3 Create migration for `kb.release_notification_recipients` table
- [ ] 1.4 Create `ReleaseNotificationState` TypeORM entity
- [ ] 1.5 Create `ReleaseNotification` TypeORM entity
- [ ] 1.6 Create `ReleaseNotificationRecipient` TypeORM entity
- [ ] 1.7 Add new notification categories to `NotificationCategory` enum (`release.deployed`, `release.features`)

## 2. Email Template System Enhancement

- [ ] 2.1 Create `section-header.mjml.hbs` partial (for "Features", "Fixes", etc.)
- [ ] 2.2 Create `list-item.mjml.hbs` partial (bullet point items)
- [ ] 2.3 Create `divider.mjml.hbs` partial (styled horizontal rule)
- [ ] 2.4 Create `view-in-browser.mjml.hbs` partial (link to public releases page)
- [ ] 2.5 Create `release-notification.mjml.hbs` template using partials
- [ ] 2.6 Test email template rendering with sample data

## 3. Core Services

### 3.1 Release Changelog Service

- [ ] 3.1.1 Create `ReleaseChangelogService` class
- [ ] 3.1.2 Implement `getCommitsSinceLastNotification()` - reads state from DB, runs git log
- [ ] 3.1.3 Implement `generateChangelog()` - sends commits to LLM, returns structured JSON
- [ ] 3.1.4 Implement commit filtering (skip merge commits, CI-only changes)
- [ ] 3.1.5 Implement commit truncation (max 50 commits with "and N more" note)
- [ ] 3.1.6 Add LLM retry logic (3 attempts with exponential backoff)
- [ ] 3.1.7 Add `--raw-commits` fallback option (skip LLM, use raw commit messages)

### 3.2 Release Notifications Service

- [ ] 3.2.1 Create `ReleaseNotificationsService` class
- [ ] 3.2.2 Implement `sendReleaseNotification()` - orchestrates full flow
- [ ] 3.2.3 Implement user targeting logic:
  - [ ] Single user (`--user-id`)
  - [ ] Project members (`--project-id`)
  - [ ] All users (`--all-users`)
- [ ] 3.2.4 Implement audience expansion (`--expand-audience`) - skip already-notified users
- [ ] 3.2.5 Implement in-app notification creation via `NotificationsService`
- [ ] 3.2.6 Implement email notification via `EmailService`
- [ ] 3.2.7 Store `mailgun_message_id` in recipients table
- [ ] 3.2.8 Implement debounce check (1 hour default, bypass with `--force`)
- [ ] 3.2.9 Implement version generation (date-based: `v2024.12.19`)
- [ ] 3.2.10 Handle multiple releases same day (`v2024.12.19.2`, etc.)

### 3.3 Release Status Service

- [ ] 3.3.1 Create `ReleaseStatusService` class
- [ ] 3.3.2 Extend `MailgunProvider` with `getMessageEvents()` method
- [ ] 3.3.3 Implement `getDeliveryStatus()` - queries Mailgun Events API
- [ ] 3.3.4 Implement status aggregation (count delivered, opened, failed)
- [ ] 3.3.5 Implement `updateRecipientStatus()` - updates DB from Mailgun events
- [ ] 3.3.6 Add caching to avoid excessive Mailgun API calls

## 4. Edge Case Handling

- [ ] 4.1 First run detection - default to last 20 commits or 24 hours
- [ ] 4.2 No new commits - skip with message
- [ ] 4.3 History rewrite detection - check if `last_notified_commit` exists in history
- [ ] 4.4 Require `--reset` flag when history rewrite detected
- [ ] 4.5 Concurrent run protection - row-level locking with `FOR UPDATE NOWAIT`
- [ ] 4.6 Partial send failure - rollback, don't update state, log failures
- [ ] 4.7 LLM failure handling - retry 3x, then offer `--raw-commits` fallback
- [ ] 4.8 Empty changelog after filtering - skip notification with message

## 5. Module Setup

- [ ] 5.1 Create `ReleasesModule` with service registrations
- [ ] 5.2 Register module in `AppModule`
- [ ] 5.3 Create DTOs:
  - [ ] `CreateReleaseNotificationDto`
  - [ ] `ReleaseStatusDto`
  - [ ] `ChangelogDto` (features, fixes, improvements arrays)
- [ ] 5.4 Export services for CLI usage

## 6. CLI Command

- [ ] 6.1 Create CLI entry point (`release-notify.cli.ts`)
- [ ] 6.2 Add `project.json` target for `nx run server:release-notify`
- [ ] 6.3 Implement argument parsing:
  - [ ] `--user-id=<uuid>` - single user target
  - [ ] `--project-id=<uuid>` - project members target
  - [ ] `--all-users` - all users target
  - [ ] `--from=<hash>` - override start commit
  - [ ] `--to=<hash>` - override end commit (default: HEAD)
  - [ ] `--dry-run` - preview without sending
  - [ ] `--force` - bypass debounce check
  - [ ] `--expand-audience` - allow re-send to broader audience
  - [ ] `--reset` - reset state tracking (after history rewrite)
  - [ ] `--raw-commits` - skip LLM, use raw commit messages
  - [ ] `--status [release-id|latest]` - check delivery status
  - [ ] `--status-count=N` - check last N releases
- [ ] 6.4 Implement interactive confirmation before sending
- [ ] 6.5 Add colored output for status (green=delivered, yellow=pending, red=failed)
- [ ] 6.6 Add progress indicators for long operations

## 7. Public Releases Page (Frontend)

- [ ] 7.1 Create `apps/admin/src/pages/releases/` directory
- [ ] 7.2 Create `ReleasesListPage` component - list all releases
- [ ] 7.3 Create `ReleaseDetailPage` component - single release view
- [ ] 7.4 Add routes to `apps/admin/src/router/register.tsx`:
  - [ ] `/releases` - list page
  - [ ] `/releases/:version` - detail page
- [ ] 7.5 Add to `other` routes (no auth required)
- [ ] 7.6 Create `ReleasesController` endpoint for fetching releases (public, no auth)
- [ ] 7.7 Add footer link from landing page to `/releases`
- [ ] 7.8 Style pages with daisyUI components

## 8. Testing

### 8.1 Unit Tests

- [ ] 8.1.1 `ReleaseChangelogService` - git commit parsing, LLM prompt generation
- [ ] 8.1.2 `ReleaseChangelogService` - commit filtering and truncation
- [ ] 8.1.3 `ReleaseNotificationsService` - user targeting logic
- [ ] 8.1.4 `ReleaseNotificationsService` - audience expansion logic
- [ ] 8.1.5 `ReleaseNotificationsService` - debounce logic
- [ ] 8.1.6 `ReleaseStatusService` - status aggregation
- [ ] 8.1.7 Version generation (date-based, handling multiple per day)

### 8.2 Integration Tests

- [ ] 8.2.1 End-to-end flow with mocked LLM
- [ ] 8.2.2 Database state tracking (create, update, concurrent access)
- [ ] 8.2.3 Email template rendering
- [ ] 8.2.4 Mailgun Events API integration (mocked)

### 8.3 E2E Tests

- [ ] 8.3.1 CLI command execution with various flags
- [ ] 8.3.2 Public releases page accessibility (no auth)
- [ ] 8.3.3 Release detail page rendering

## 9. Documentation

- [ ] 9.1 Document CLI usage in `AGENTS.md` (for AI assistants)
- [ ] 9.2 Add example workflow for dev environment releases
- [ ] 9.3 Document edge cases and how to handle them
- [ ] 9.4 Add troubleshooting section (common errors, solutions)

## Dependencies

Tasks that must be completed in order:

1. **Database first**: 1.1-1.7 must complete before services
2. **Email templates**: 2.1-2.5 must complete before email sending in 3.2.6
3. **Services before CLI**: 3.x must complete before 6.x
4. **Backend before frontend**: 7.6 (controller) should complete before 7.2-7.3
5. **Core before edge cases**: 3.x core logic before 4.x edge case handling

## Estimated Effort

| Section                 | Estimated Hours |
| ----------------------- | --------------- |
| 1. Database & Entities  | 2-3             |
| 2. Email Templates      | 2-3             |
| 3. Core Services        | 8-10            |
| 4. Edge Case Handling   | 3-4             |
| 5. Module Setup         | 1-2             |
| 6. CLI Command          | 3-4             |
| 7. Public Releases Page | 4-5             |
| 8. Testing              | 4-6             |
| 9. Documentation        | 1-2             |
| **Total**               | **28-39 hours** |
