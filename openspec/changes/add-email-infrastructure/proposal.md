# Change: Add Email Infrastructure with Mailgun

## Why

The system needs a general-purpose email capability to:

1. Send user invitation emails when adding team members to organizations/projects
2. Support future notification-based emails (extraction completed, mentions, etc.)
3. Provide a consistent, branded email experience across all system communications

Currently, invitations rely on Zitadel's built-in password-set notification which lacks customization and doesn't include context about the specific organization/project being joined.

## What Changes

- **ADDED**: Email service module with Mailgun provider integration
- **ADDED**: Email template system with Handlebars templating
- **ADDED**: User invitation email template with organization/project context
- **ADDED**: Email queue with retry logic for reliability
- **ADDED**: Email configuration via environment variables
- **ADDED**: Email sending API for internal service use
- **MODIFIED**: InvitesService to send branded invitation emails via the new email service

## Impact

- **Affected specs**: New `email-service` capability
- **Affected code**:
  - `apps/server/src/modules/email/` (new module)
  - `apps/server/src/modules/invites/invites.service.ts` (integration)
  - Environment configuration (new Mailgun variables)
- **Dependencies**: Mailgun API (`mailgun.js` package)
- **Database**: New `kb.email_logs` table for tracking sent emails
