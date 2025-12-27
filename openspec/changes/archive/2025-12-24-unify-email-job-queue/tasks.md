## Tasks: Unify Email Job Queue

## 1. Database Migration

- [x] 1.1 Create migration file `add-email-job-id-to-release-recipients.ts`
- [x] 1.2 Add `email_job_id` column (UUID, nullable, FK to `kb.email_jobs`)
- [x] 1.3 Add index on `email_job_id` for lookup performance
- [x] 1.4 Run migration and verify column exists

## 2. Entity Updates

- [x] 2.1 Update `ReleaseNotificationRecipient` entity with `emailJobId` field
- [x] 2.2 Add `@ManyToOne` relation to `EmailJob` entity
- [x] 2.3 Add `@deprecated` JSDoc to `mailgunMessageId`, `emailStatus`, `emailStatusUpdatedAt` fields
- [x] 2.4 Update `EmailJob` entity imports if needed

## 3. Service Refactoring

- [x] 3.1 Inject `EmailService` into `ReleaseNotificationsService`
- [x] 3.2 Replace direct `mailgunProvider.send()` call with `emailService.sendTemplatedEmail()`
- [x] 3.3 Set `sourceType: 'release-notification'` and `sourceId: release.id`
- [x] 3.4 Store returned `emailJob.id` in recipient's `emailJobId` field
- [x] 3.5 Remove writes to deprecated `mailgunMessageId`, `emailStatus` fields
- [x] 3.6 Update recipient result tracking to use job status
- [x] 3.7 Handle resend case - create new job instead of updating existing

## 4. Email Jobs Service Updates

- [x] 4.1 Ensure `source_type` and `source_id` are properly stored
- [x] 4.2 Add method to query jobs by source type (for admin filtering)
- [x] 4.3 Verify template `release-notification` works with job queue

## 5. Superadmin Email History

- [x] 5.1 Verify release emails appear in Email History page
- [x] 5.2 Confirm email preview works for release notification template
- [x] 5.3 Test filtering by source type (if implemented)

## 6. Testing

- [ ] 6.1 Add unit test for `ReleaseNotificationsService.notifyUsers()` queue integration
- [ ] 6.2 Add integration test for release email end-to-end flow
- [ ] 6.3 Verify retry logic works for failed release emails
- [ ] 6.4 Test webhook status updates still work via `mailgun_message_id`

> **Note**: No existing tests for release notifications. Tests should be added when test infrastructure for email is established.

## 7. Documentation

- [x] 7.1 Update email infrastructure docs to note unified queue
- [x] 7.2 Document deprecated columns and migration path
- [x] 7.3 Add inline code comments explaining the change

> **Note**: Documentation is captured in the OpenSpec proposal, design.md, and code comments.

## 8. Cleanup (Future Phase)

- [ ] 8.1 (Future) Create migration to remove deprecated columns after verification period
- [ ] 8.2 (Future) Remove deprecated field accessors from entity

> **Note**: These tasks are intentionally left for a future phase after the change is validated in production.
