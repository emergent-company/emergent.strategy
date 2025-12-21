## Design: Release Notifications

## Context

The dev environment has frequent deployments via hot reload. Users currently have no visibility into what changed without checking commit logs manually. This design enables automated, LLM-generated release notes delivered through both email and in-app notifications, with delivery tracking via Mailgun Events API.

**Stakeholders:**

- Developers (need to know what changed)
- Product owner (needs to communicate changes)
- Users (want to see release history on public page)
- Future: CI/CD system (automated triggering)

**Constraints:**

- Must leverage existing `NotificationsService` and `EmailService`
- Must use existing MJML + Handlebars email template system
- Must work with current Vertex AI/Gemini LLM integration
- Initial implementation should be manually triggered (CLI)
- Must support targeting single user for testing before broader rollout
- Must track main branch only (no multi-branch support)

## Goals / Non-Goals

**Goals:**

- Generate human-friendly changelogs from git commits using LLM
- Deliver release notifications via both email AND in-app notifications
- Support targeting: single user ID, project members, or all users
- Allow audience expansion to re-send same release to broader audience
- Track delivery status via Mailgun Events API
- Provide CLI command with `--status` option to check delivery
- Prevent duplicate notifications using database state tracking
- Provide public `/releases` page for release history (no auth required)
- Use date-based versioning (e.g., `v2024.12.19`)

**Non-Goals:**

- CI/CD integration (documented for future)
- Multi-branch tracking (main branch only)
- Changelog editing before sending
- Scheduled/automated sending
- User preferences for notification frequency

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Release Notifications Flow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌────────────────────────────────────┐                │
│  │ CLI Command  │────▶│ ReleaseService                     │                │
│  │ (manual)     │     │                                    │                │
│  └──────────────┘     │ - detectNewCommits()               │                │
│                       │ - generateChangelog()              │                │
│  ┌──────────────┐     │ - sendNotifications()              │                │
│  │ CI Webhook   │────▶│ - getDeliveryStatus()              │                │
│  │ (future)     │     └───────────────┬────────────────────┘                │
│  └──────────────┘                     │                                     │
│                                       │                                     │
│                    ┌──────────────────┼──────────────────┐                  │
│                    │                  │                  │                  │
│                    ▼                  ▼                  ▼                  │
│           ┌────────────────┐  ┌─────────────┐  ┌─────────────────┐          │
│           │ GitService     │  │ LLMService  │  │ NotificationSvc │          │
│           │ (commits)      │  │ (generate)  │  │ (in-app)        │          │
│           └────────────────┘  └─────────────┘  └─────────────────┘          │
│                    │                                     │                  │
│                    ▼                                     ▼                  │
│           ┌────────────────┐                   ┌─────────────────┐          │
│           │ DB State       │                   │ EmailService    │          │
│           │ (tracking)     │                   │ (+ Mailgun API) │          │
│           └────────────────┘                   └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Decisions

### Decision 1: Module Structure

Create a new `releases` module under `apps/server/src/modules/releases/`:

```
releases/
├── releases.module.ts              # NestJS module definition
├── release-changelog.service.ts    # Git commit fetching and LLM changelog generation
├── release-notifications.service.ts # Notification delivery logic
├── release-status.service.ts       # Mailgun Events API integration
├── release-notify.cli.ts           # CLI command entry point
├── dto/
│   ├── release-notification.dto.ts
│   └── release-status.dto.ts
└── entities/
    ├── release-notification.entity.ts
    ├── release-notification-state.entity.ts
    └── release-notification-recipient.entity.ts
```

**Rationale:** Keeps release-related logic isolated while leveraging existing services.

### Decision 2: Branch Tracking (Main Branch Only)

Track commits on the **main branch only**. Store `last_notified_commit` in database to detect new commits.

**Commit Detection Logic:**

1. Read `last_notified_commit` from `kb.release_notification_state`
2. Run `git log last_notified_commit..HEAD --format=...` on main branch
3. If new commits found, generate changelog and send notifications
4. Update `last_notified_commit` to current HEAD after successful send

**CLI Override Options:**

- `--from=<hash>` - Override starting commit
- `--to=<hash>` - Override ending commit (default: HEAD)
- `--reset` - Reset tracking state (required after history rewrite)

**Rationale:** Simplifies implementation. Multi-branch tracking adds complexity without clear use case.

### Decision 3: LLM Changelog Generation

Use existing `LlmService` (Gemini/Vertex) with a dedicated prompt:

- Input: Array of commit messages with metadata (author, date, hash)
- Output: Structured summary with categories (Features, Fixes, Improvements)
- Limit: Process max 50 commits per request to manage token costs
- Truncation: If >50 commits, include newest 50 with "and N more commits" note

**Prompt Template:**

```
Summarize the following git commits into a brief, user-friendly changelog.
Group changes into: Features, Fixes, Improvements (if applicable).
Keep each item to one sentence. Skip merge commits and CI-only changes.
Output format: JSON with { features: [], fixes: [], improvements: [] }

Commits:
{commits}
```

**Rationale:** Existing LLM integration, structured output for consistent formatting.

### Decision 4: User Targeting with Audience Expansion

Three targeting modes:

1. **Single user:** `--user-id=<uuid>` - For testing
2. **Project members:** `--project-id=<uuid>` - All members of a project
3. **All users:** `--all-users` - Broadcast to everyone

**Audience Expansion:**

When re-running the CLI for the same commit range with a broader audience:

- Without `--expand-audience`: Skip with message "Already sent to [audience]"
- With `--expand-audience`: Send to new recipients only (skip already-notified users)

Example workflow:

```bash
# Test with single user first
nx run server:release-notify --user-id=abc123

# Expand to all users (same commits)
nx run server:release-notify --all-users --expand-audience
```

**Rationale:** Progressive rollout from single tester to full audience without spam.

### Decision 5: Database Schema

**Table: `kb.release_notification_state`**

Tracks the last notified commit for the main branch.

```sql
CREATE TABLE kb.release_notification_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch VARCHAR(255) NOT NULL DEFAULT 'main',
  last_notified_commit VARCHAR(40) NOT NULL,
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch)
);
```

**Table: `kb.release_notifications`**

Release records with changelog content.

```sql
CREATE TABLE kb.release_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL,              -- e.g., 'v2024.12.19'
  from_commit VARCHAR(40) NOT NULL,
  to_commit VARCHAR(40) NOT NULL,
  commit_count INT NOT NULL,
  changelog_json JSONB NOT NULL,             -- { features: [], fixes: [], improvements: [] }
  target_mode VARCHAR(20) NOT NULL,          -- 'single', 'project', 'all'
  target_id UUID,                            -- user_id or project_id (null for 'all')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES core.user_profiles(id)
);

CREATE INDEX idx_release_notifications_version ON kb.release_notifications(version);
CREATE INDEX idx_release_notifications_created_at ON kb.release_notifications(created_at DESC);
```

**Table: `kb.release_notification_recipients`**

Per-user delivery tracking.

```sql
CREATE TABLE kb.release_notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_notification_id UUID NOT NULL REFERENCES kb.release_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.user_profiles(id),
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  mailgun_message_id VARCHAR(255),
  email_status VARCHAR(50),                  -- 'pending', 'delivered', 'opened', 'failed'
  email_status_updated_at TIMESTAMPTZ,
  in_app_notification_id UUID REFERENCES kb.notifications(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(release_notification_id, user_id)
);

CREATE INDEX idx_release_recipients_user ON kb.release_notification_recipients(user_id);
CREATE INDEX idx_release_recipients_mailgun ON kb.release_notification_recipients(mailgun_message_id);
```

**Rationale:** Normalized schema allows flexible querying of delivery status per user.

### Decision 6: Notification Categories

Add to `NotificationCategory` enum:

- `RELEASE_DEPLOYED = 'release.deployed'` - A new release is available
- `RELEASE_FEATURES = 'release.features'` - New features announcement (future use)

**Rationale:** Distinct categories allow users to filter/disable release notifications.

### Decision 7: Email Notifications with MJML + Handlebars

Use existing email template system with new reusable partials.

**New Partials:**

```
templates/email/partials/
├── section-header.mjml.hbs   # Section titles (e.g., "✨ Features")
├── list-item.mjml.hbs        # Bullet point items
├── divider.mjml.hbs          # Styled dividers
└── view-in-browser.mjml.hbs  # "View in browser" link
```

**Release Notification Template:**

```
templates/email/
└── release-notification.mjml.hbs
```

Template uses partials for consistent styling. Includes "View in browser" link pointing to `/releases/{version}`.

**Rationale:** Reusable components reduce duplication and ensure consistent email styling.

### Decision 8: Mailgun Events API for Delivery Tracking

Extend `MailgunProvider` to support Events API:

```typescript
// mailgun.provider.ts
async getMessageEvents(messageId: string): Promise<MailgunEvent[]> {
  return this.mg.events.get(this.domain, {
    'message-id': messageId,
  });
}
```

**Status Values:**

- `pending` - Email sent, no events yet
- `delivered` - Mailgun confirmed delivery
- `opened` - Recipient opened email
- `failed` - Delivery failed (bounce, reject, etc.)

**CLI Status Command:**

```bash
# Check latest release status
nx run server:release-notify --status latest

# Check specific release
nx run server:release-notify --status v2024.12.19

# Check last N releases
nx run server:release-notify --status-count=5
```

**Rationale:** Provides visibility into email delivery without external dashboard.

### Decision 9: Date-Based Versioning

Use date-based version format: `v{YYYY}.{MM}.{DD}`

- Example: `v2024.12.19`
- Multiple releases same day: `v2024.12.19.2`, `v2024.12.19.3`
- Auto-generated from current date at send time

**Rationale:** Simple, chronological, no manual version management needed.

### Decision 10: Public Releases Page

Create a public `/releases` page accessible without authentication.

**Route Registration:**

Add to `other` routes in `apps/admin/src/router/register.tsx` (alongside `/login`, `/forgot-password`).

**Page Features:**

- List of all releases with version, date, and changelog
- Individual release view at `/releases/{version}`
- No authentication required
- Link from landing page footer

**Rationale:** Transparency for all users, including non-logged-in visitors.

### Decision 11: Concurrent Run Protection

Use database row-level locking to prevent concurrent CLI runs from sending duplicate notifications.

```sql
-- Acquire lock on state row
SELECT * FROM kb.release_notification_state
WHERE branch = 'main'
FOR UPDATE NOWAIT;
```

If lock cannot be acquired, CLI exits with message: "Another release notification is in progress."

**Rationale:** Prevents race conditions when CLI is run multiple times quickly.

## Edge Cases

| Case                                | Behavior                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **First run ever**                  | No `last_notified_commit` in DB. Default to last 20 commits or commits from last 24 hours, whichever is smaller. |
| **No new commits**                  | Skip with message: "No new commits since last notification."                                                     |
| **History rewritten**               | Detect when `last_notified_commit` is not in history. Require `--reset` or `--from` override.                    |
| **Large commit range (>50)**        | Truncate to newest 50 commits with note: "and N more commits."                                                   |
| **Concurrent runs**                 | DB transaction with row locking. Second run fails with: "Another release notification is in progress."           |
| **Partial send failure**            | Rollback transaction, don't update `last_notified_commit`. Log which recipients failed.                          |
| **LLM failure**                     | Retry 3 times with exponential backoff. Option for raw commit fallback with `--raw-commits`.                     |
| **Empty changelog after filtering** | If LLM returns empty arrays after filtering merge commits, skip notification with message.                       |

## Risks / Trade-offs

| Risk                                    | Impact                | Mitigation                                            |
| --------------------------------------- | --------------------- | ----------------------------------------------------- |
| LLM generates poor summaries            | User confusion        | Review prompt, add examples, `--raw-commits` fallback |
| Too many commits overwhelms LLM         | Truncated/poor output | Limit to 50 commits, show count of truncated          |
| Hot reload sends too many notifications | User fatigue          | Debounce: min 1 hour between notifications            |
| Mailgun Events API rate limits          | Status checks fail    | Cache status, batch queries, respect rate limits      |
| Email template rendering fails          | No email sent         | Fallback to plain text, log error                     |
| Public releases page SEO issues         | N/A for dev env       | Add noindex meta tag if needed                        |

## Migration Plan

1. **Phase 1 (This Change):**

   - Create database tables via migration
   - Create `releases` module with all services
   - Add email template partials and release template
   - Implement CLI with all options
   - Create public `/releases` page

2. **Phase 2 (Future):**
   - Add webhook endpoint for CI integration
   - Add user notification preferences
   - Add changelog editing capability

**Rollback:** Module is opt-in via CLI. Drop tables and remove module if issues arise.

## Open Questions

All questions resolved:

1. ~~Should we store changelog history for UI viewing?~~ **Yes: Public `/releases` page**
2. ~~Email notification format?~~ **MJML + Handlebars with reusable partials**
3. ~~Minimum time between release notifications?~~ **1 hour default, bypass with `--force`**
4. ~~How to handle history rewrites?~~ **Detect and require `--reset` flag**
5. ~~How to track delivery status?~~ **Mailgun Events API with `--status` CLI option**
