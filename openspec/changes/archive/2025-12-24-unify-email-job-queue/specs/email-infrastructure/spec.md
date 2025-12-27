## MODIFIED Requirements

### Requirement: Email Job Queue

The system SHALL route all outgoing emails through a centralized job queue (`kb.email_jobs`) regardless of the email type (invitation, welcome, release notification, etc.).

The email job queue SHALL:

- Store email metadata including template name, recipient, subject, and template data
- Track delivery status (pending, processing, sent, failed)
- Support automatic retry with exponential backoff
- Record source type and source ID for traceability

#### Scenario: Release notification email uses job queue

- **GIVEN** a release notification is being sent to users
- **WHEN** the notification service sends an email
- **THEN** an email job record is created in `kb.email_jobs`
- **AND** the job has `source_type = 'release-notification'`
- **AND** the email is processed by the email worker

#### Scenario: All email types visible in admin history

- **GIVEN** emails have been sent via the job queue
- **WHEN** a superadmin views the Email History page
- **THEN** all email types (invitations, welcome, release notifications) are listed
- **AND** each email shows its source type and delivery status

## ADDED Requirements

### Requirement: Release Notification Email Job Linking

The system SHALL link release notification recipients to their corresponding email jobs via a foreign key relationship.

The release notification recipient record SHALL:

- Store `email_job_id` referencing the `kb.email_jobs` record
- Delegate email delivery status tracking to the email job
- Maintain the user-to-release association for notification tracking

#### Scenario: Recipient linked to email job

- **GIVEN** a release notification is sent to a user
- **WHEN** the email job is created
- **THEN** the `release_notification_recipients` record stores the `email_job_id`
- **AND** the email job has `source_id` pointing back to the recipient ID

#### Scenario: Email status retrieved from job

- **GIVEN** a release notification recipient with an `email_job_id`
- **WHEN** querying the email delivery status
- **THEN** the status is retrieved from the linked `email_jobs` record
- **AND** deprecated status columns on the recipient are not updated

## REMOVED Requirements

### Requirement: Direct Mailgun Sending for Release Notifications

**Reason**: Release notification emails now use the centralized email job queue instead of direct Mailgun API calls.

**Migration**: Existing `mailgunMessageId`, `emailStatus`, `emailStatusUpdatedAt` columns on `release_notification_recipients` are preserved for historical data but no longer written to. New emails use the `email_job_id` foreign key.
