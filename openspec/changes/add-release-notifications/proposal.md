# Change: Add Release Notifications for Dev Environment

## Why

On the dev environment, deployments happen frequently through hot reload after commits. Users need visibility into what changed without manually checking commit logs. An LLM-generated changelog provides human-friendly release notes that can be delivered via both email and in-app notifications.

This enables:

1. Transparency about new features and fixes as they're deployed
2. Testing of the notification mechanism with a single user before broader rollout
3. Delivery tracking via Mailgun Events API to verify notifications were received
4. Public release notes page accessible without authentication
5. Future CI integration for automated release announcements

## What Changes

### Core Release Notification System

- **ADDED**: Release changelog generation service using LLM to summarize git commits
- **ADDED**: Release notification service to create in-app AND email notifications
- **ADDED**: New notification categories for releases (`release.deployed`, `release.features`)
- **ADDED**: CLI command to trigger release notifications manually (`nx run server:release-notify`)
- **ADDED**: User targeting mechanism (single user, project members, or all users)
- **ADDED**: Audience expansion (`--expand-audience`) to send same release to broader audience
- **ADDED**: Date-based release versioning (e.g., `v2024.12.19`)

### Database Tables

- **ADDED**: `kb.release_notification_state` - Tracks `last_notified_commit` for main branch
- **ADDED**: `kb.release_notifications` - Release records with changelog JSON
- **ADDED**: `kb.release_notification_recipients` - Per-user delivery tracking with `mailgun_message_id`

### Email Template System

- **ADDED**: New email partials: `section-header.mjml.hbs`, `list-item.mjml.hbs`, `divider.mjml.hbs`, `view-in-browser.mjml.hbs`
- **ADDED**: Release notification email template: `release-notification.mjml.hbs`
- **ADDED**: "View in browser" link pointing to public releases page

### Delivery Tracking

- **ADDED**: Mailgun Events API integration (`mg.events.get()`) for delivery status
- **ADDED**: CLI `--status` option to check delivery status of notifications
- **ADDED**: Tracking of `mailgun_message_id` per recipient for status lookup

### Public Releases Page

- **ADDED**: Public `/releases` page (no auth required)
- **ADDED**: Route added to `other` routes (like `/login`, `/forgot-password`)
- **ADDED**: Footer link from landing page to releases

## Impact

- **Affected specs**: New `release-notifications` capability
- **Affected code**:
  - `apps/server/src/modules/releases/` (new module)
  - `apps/server/src/modules/notifications/dto/create-notification.dto.ts` (new categories)
  - `apps/server/src/modules/email/mailgun.provider.ts` (events API)
  - `apps/server/templates/email/` (new partials and template)
  - `apps/admin/src/pages/releases/` (new public page)
  - `apps/admin/src/router/register.tsx` (route registration)
- **Dependencies**: Existing `NotificationsService`, `EmailService`, `EmailTemplateService`, Vertex AI/Gemini for LLM, Mailgun for email delivery and events
- **Database**: Three new tables in `kb` schema
- **Future Integration**: CI webhook endpoint for automated triggering post-deployment

## Scope Decisions

### In Scope (Phase 1)

- Manual triggering via CLI command (`nx run server:release-notify`)
- LLM-generated changelog from commits since last notification
- Main branch tracking only (no multi-branch support)
- Both in-app AND email notifications
- User targeting: single user, project members, or all users
- Audience expansion to re-send to broader audience
- Delivery status tracking via Mailgun Events API
- Status CLI (`--status latest`, `--status <release-id>`, `--status-count=N`)
- Public `/releases` page (no auth required)
- Email template using MJML + Handlebars component system
- Edge case handling (first run, no commits, history rewrite, etc.)

### Out of Scope (Future)

- CI/CD webhook integration (documented for future implementation)
- Multi-branch tracking (only main branch for now)
- User preferences for release notification frequency
- Changelog editing before sending
- Scheduled/automated sending (manual CLI trigger only)
