## Design: Unify Email Job Queue

## Context

The email infrastructure currently has two parallel paths:

1. **Queue-based**: `EmailJobsService` → `EmailWorkerService` → `MailgunProvider`
2. **Direct**: `ReleaseNotificationsService` → `MailgunProvider`

This creates inconsistency in email tracking, retry handling, and admin visibility.

## Goals / Non-Goals

### Goals

- All email types flow through `kb.email_jobs` queue
- Release notification emails appear in superadmin Email History
- Single source of truth for email delivery status
- Maintain existing retry and webhook delivery tracking

### Non-Goals

- Changing the email template system
- Modifying Mailgun webhook handlers
- Breaking existing email job API contracts

## Decisions

### 1. Queue Integration Pattern

**Decision**: Release notification service will call `EmailJobsService.enqueue()` instead of `MailgunProvider.send()`.

**Rationale**: Reuses existing queue infrastructure, retry logic, and worker processing. No new patterns needed.

**Alternatives considered**:

- Create separate queue for release emails → Rejected: Increases complexity
- Keep direct sending but log to email_jobs → Rejected: Loses retry benefits

### 2. Relationship Between Tables

**Decision**: Add `email_job_id` FK to `release_notification_recipients` pointing to `kb.email_jobs`.

**Rationale**: Preserves release-specific tracking (which user received which release) while delegating email status to the canonical location.

**Schema change**:

```sql
ALTER TABLE kb.release_notification_recipients
ADD COLUMN email_job_id UUID REFERENCES kb.email_jobs(id);
```

### 3. Source Type Tracking

**Decision**: Use `source_type = 'release-notification'` and `source_id = recipient.id` in email jobs.

**Rationale**: Enables filtering release emails in queries and linking back to the recipient record.

### 4. Deprecated Column Handling

**Decision**: Keep existing `mailgun_message_id`, `email_status`, `email_status_updated_at` columns but stop writing to them. Mark as deprecated in entity.

**Rationale**:

- Preserves historical data
- Allows gradual migration
- No breaking changes for existing queries

## Risks / Trade-offs

| Risk                                   | Mitigation                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Email delays due to queue processing   | Queue processes every 30 seconds by default; acceptable for notifications          |
| Breaking existing release email flow   | Add integration test to verify end-to-end flow                                     |
| Webhook status updates need new lookup | Webhook handler already updates by `mailgun_message_id`; email_jobs has this field |

## Migration Plan

1. Add migration for `email_job_id` column (nullable initially)
2. Update `ReleaseNotificationsService` to create email jobs
3. Link recipient records to email jobs via `email_job_id`
4. Verify emails appear in superadmin Email History
5. Mark deprecated columns in entity with `@deprecated` JSDoc
6. (Future) Drop deprecated columns after data migration verification

## Open Questions

- Should we backfill `email_job_id` for historical release emails? **Proposed: No**, historical data stays in deprecated columns.
