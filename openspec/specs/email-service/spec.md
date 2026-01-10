# email-service Specification

## Purpose
TBD - created by archiving change add-email-infrastructure. Update Purpose after archive.
## Requirements
### Requirement: Email Service Configuration

The system SHALL support configuration of email sending via environment variables.

#### Scenario: Mailgun credentials configured

- **WHEN** `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` environment variables are set
- **THEN** the email service SHALL be enabled and ready to send emails

#### Scenario: Mailgun credentials missing

- **WHEN** `MAILGUN_API_KEY` or `MAILGUN_DOMAIN` environment variables are not set
- **THEN** the email service SHALL log a warning and disable email sending
- **AND** email send requests SHALL be logged but not sent

#### Scenario: Email feature disabled

- **WHEN** `EMAIL_ENABLED` is set to `false`
- **THEN** all email send requests SHALL be skipped silently

#### Scenario: EU region configuration

- **WHEN** `MAILGUN_API_URL` is set to `https://api.eu.mailgun.net`
- **THEN** the email service SHALL use the EU Mailgun endpoint

---

### Requirement: Email Queue Management

The system SHALL queue emails for reliable delivery with retry support.

#### Scenario: Email queued successfully

- **WHEN** `EmailService.send()` is called with valid parameters
- **THEN** an email job SHALL be created in `kb.email_jobs` with status `pending`
- **AND** the job ID SHALL be returned immediately

#### Scenario: Email worker processes pending jobs

- **WHEN** the email worker runs its polling cycle
- **THEN** it SHALL select jobs with status `pending` and `next_retry_at <= now()`
- **AND** process them in FIFO order by `created_at`

#### Scenario: Email sent successfully

- **WHEN** Mailgun API returns success
- **THEN** the job status SHALL be updated to `sent`
- **AND** `mailgun_message_id` SHALL be stored
- **AND** `processed_at` timestamp SHALL be set

#### Scenario: Email send fails with retryable error

- **WHEN** Mailgun API returns a 5xx error or network timeout
- **AND** `attempts < max_attempts`
- **THEN** the job status SHALL remain `pending`
- **AND** `attempts` SHALL be incremented
- **AND** `next_retry_at` SHALL be set with exponential backoff (5min, 15min, 45min)
- **AND** `last_error` SHALL store the error message

#### Scenario: Email send fails permanently

- **WHEN** Mailgun API returns a 4xx error (invalid recipient, bad request)
- **OR** `attempts >= max_attempts` after retries
- **THEN** the job status SHALL be updated to `failed`
- **AND** `last_error` SHALL store the error details

---

### Requirement: Email Template Rendering

The system SHALL render emails using Handlebars templates.

#### Scenario: Template found and rendered

- **WHEN** `TemplateService.render(templateName, data)` is called
- **AND** the template file exists at `templates/email/{templateName}.hbs`
- **THEN** the template SHALL be rendered with the provided data
- **AND** HTML and plain text versions SHALL be generated

#### Scenario: Template not found

- **WHEN** the specified template file does not exist
- **THEN** an error SHALL be thrown with message `Template not found: {templateName}`

#### Scenario: Template with layout

- **WHEN** a template specifies `{{!-- layout: default --}}` in its header
- **THEN** the template SHALL be wrapped in the specified layout from `templates/email/layouts/`

#### Scenario: Template data escaping

- **WHEN** template data contains HTML special characters
- **THEN** the characters SHALL be escaped in HTML output by default
- **AND** triple-brace syntax `{{{rawHtml}}}` SHALL allow unescaped output

---

### Requirement: Invitation Email

The system SHALL send branded invitation emails when users are invited.

#### Scenario: Invitation email sent for organization invite

- **WHEN** a user is invited to an organization
- **THEN** an email SHALL be queued using the `invitation` template
- **AND** the email SHALL include:
  - Recipient's name (if provided) or email address
  - Name of the person who sent the invitation
  - Organization name
  - Role being granted
  - Clear call-to-action button to accept invitation
  - Expiration notice (7 days)

#### Scenario: Invitation email sent for project invite

- **WHEN** a user is invited to a specific project
- **THEN** the email SHALL additionally include:
  - Project name
  - Organization name (parent context)

#### Scenario: Invitation email subject line

- **WHEN** an invitation email is sent
- **THEN** the subject SHALL be: `You've been invited to join {organizationName} on Emergent`

#### Scenario: Invitation email contains accept URL

- **WHEN** an invitation email is rendered
- **THEN** it SHALL include a URL to accept the invitation
- **AND** the URL SHALL include the invitation token

---

### Requirement: Email Logging

The system SHALL log all email activity for debugging and audit purposes.

#### Scenario: Email queued event logged

- **WHEN** an email job is created
- **THEN** an entry SHALL be added to `kb.email_logs` with `event_type = 'queued'`

#### Scenario: Email sent event logged

- **WHEN** Mailgun confirms email acceptance
- **THEN** an entry SHALL be added with `event_type = 'sent'`
- **AND** `mailgun_event_id` SHALL be recorded if available

#### Scenario: Email failed event logged

- **WHEN** email sending fails (temporarily or permanently)
- **THEN** an entry SHALL be added with `event_type = 'failed'`
- **AND** `details` SHALL contain error information

---

### Requirement: Email Service Public API

The system SHALL provide a clean API for other modules to send emails.

#### Scenario: Send templated email

- **WHEN** `EmailService.sendTemplatedEmail()` is called with:
  - `to`: recipient email address
  - `toName`: optional recipient name
  - `template`: template name (e.g., 'invitation')
  - `subject`: email subject line
  - `data`: template variables object
  - `sourceType`: optional source identifier (e.g., 'invite')
  - `sourceId`: optional source entity ID
- **THEN** the email SHALL be queued for sending

#### Scenario: Check if email is enabled

- **WHEN** `EmailService.isEnabled()` is called
- **THEN** it SHALL return `true` if Mailgun is configured and `EMAIL_ENABLED !== 'false'`
- **AND** it SHALL return `false` otherwise

#### Scenario: Get email job status

- **WHEN** `EmailService.getJobStatus(jobId)` is called
- **THEN** it SHALL return the current status of the email job
- **AND** include `status`, `attempts`, `last_error`, and `processed_at`

