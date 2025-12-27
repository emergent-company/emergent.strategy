# Change: Unify Email Job Queue for All Email Types

## Why

Currently, the system has two separate paths for sending emails:

1. **Invitation/Welcome emails** use the unified `kb.email_jobs` queue via `EmailJobsService.enqueue()`, which provides retry logic, status tracking, and appears in the superadmin Email History page.

2. **Release notification emails** bypass the queue entirely, sending directly via `MailgunProvider.send()` in `release-notifications.service.ts` (lines 766-772). Email status is tracked in a separate table (`kb.release_notification_recipients`) with duplicated tracking columns.

This creates several problems:

- Release notification emails don't appear in superadmin Email History
- Duplicate email status tracking logic across tables
- No retry mechanism for release emails
- Inconsistent monitoring and debugging experience

## What Changes

- **MODIFIED**: `ReleaseNotificationsService.notifyUsers()` to create `email_jobs` records instead of direct Mailgun calls
- **MODIFIED**: `ReleaseNotificationRecipient` entity to reference `email_job_id` instead of storing email status directly
- **ADDED**: Migration to add `email_job_id` column to `kb.release_notification_recipients`
- **REMOVED**: Direct `mailgunProvider.send()` calls from release notifications (deprecated columns remain for data migration)
- **ADDED**: New source type `release-notification` for email jobs

## Impact

- **Affected specs**: `email-infrastructure` (modify existing capability)
- **Affected code**:
  - `apps/server/src/modules/releases/services/release-notifications.service.ts`
  - `apps/server/src/modules/releases/entities/release-notification-recipient.entity.ts`
  - `apps/server/src/modules/email/email-jobs.service.ts` (add sourceType support)
- **Database changes**:
  - Add `email_job_id` FK column to `kb.release_notification_recipients`
  - Deprecate (but keep) `mailgun_message_id`, `email_status`, `email_status_updated_at` columns
- **Benefits**:
  - All emails visible in superadmin Email History
  - Consistent retry logic for all email types
  - Single source of truth for email delivery status
  - Better observability and debugging
