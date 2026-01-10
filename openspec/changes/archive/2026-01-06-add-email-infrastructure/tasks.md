## 1. Infrastructure Setup

- [x] 1.1 Add `mailgun.js` and `form-data` npm dependencies to server
- [x] 1.2 Add `handlebars` and `mjml` npm dependencies for templating
- [x] 1.3 Create database migration for `kb.email_jobs` table
- [x] 1.4 Create database migration for `kb.email_logs` table
- [x] 1.5 Add environment variable documentation to `.env.example`

## 2. Email Module Core

- [x] 2.1 Create `apps/server/src/modules/email/email.module.ts`
- [x] 2.2 Create `apps/server/src/modules/email/email.service.ts` with public API
- [x] 2.3 Create `apps/server/src/modules/email/mailgun.provider.ts` for Mailgun integration
- [x] 2.4 Create `apps/server/src/modules/email/email.config.ts` for configuration loading
- [x] 2.5 Create `apps/server/src/entities/email-job.entity.ts` TypeORM entity
- [x] 2.6 Create `apps/server/src/entities/email-log.entity.ts` TypeORM entity
- [x] 2.7 Create `apps/server/src/modules/email/email-jobs.service.ts` for queue management
- [x] 2.8 Create `apps/server/src/modules/email/email-worker.service.ts` for background processing
- [x] 2.9 Create `apps/server/src/modules/email/email-template.service.ts` for MJML/Handlebars rendering
- [x] 2.10 Register EmailModule in AppModule

## 3. Template System

- [x] 3.1 Create template directory structure: `apps/server/templates/email/`
- [x] 3.2 Create base layout template: `templates/email/layouts/default.mjml.hbs`
- [x] 3.3 Create button partial: `templates/email/partials/button.mjml.hbs`
- [x] 3.4 Create footer partial: `templates/email/partials/footer.mjml.hbs`
- [x] 3.5 Create invitation template: `templates/email/invitation.mjml.hbs`

## 4. Email Worker

- [x] 4.1 Create `apps/server/src/modules/email/email-worker.service.ts`
- [x] 4.2 Implement job polling with configurable interval (default 10s)
- [x] 4.3 Implement exponential backoff retry logic
- [x] 4.4 Add graceful shutdown handling
- [x] 4.5 Add email job status logging

## 5. Integration with Invites

- [x] 5.1 Inject EmailService into InvitesService
- [x] 5.2 Add `sendInvitationEmail()` method to InvitesService
- [x] 5.3 Call `sendInvitationEmail()` in `createWithUser()` flow
- [x] 5.4 Add feature flag check (EMAIL_ENABLED) before sending
- [x] 5.5 Keep Zitadel password notification as secondary mechanism

## 6. Testing

- [x] 6.1 Create unit tests for EmailService
- [x] 6.2 Create unit tests for EmailTemplateService
- [x] 6.3 Create unit tests for EmailJobsService
- [x] 6.4 Create unit tests for MailgunProvider (with mocked API)
- [x] 6.5 Create unit tests for EmailConfig
- [x] 6.6 Create integration test for invitation email flow (optional - requires live Mailgun) <!-- skipped: requires live Mailgun -->

## 7. Documentation & Configuration

- [x] 7.1 Document Mailgun setup in deployment guide
- [x] 7.2 Document SPF/DKIM configuration requirements
- [x] 7.3 Add Mailgun sandbox instructions for local development
- [x] 7.4 Update environment variable reference documentation
