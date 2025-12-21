## Context

The system needs to send transactional emails for user invitations and future notification scenarios. Currently, user invitations rely on Zitadel's built-in password-set notification, which is functional but:

- Lacks customization (generic password reset template)
- Doesn't provide context about the organization/project being joined
- Cannot be branded consistently with the application

The email infrastructure should be general-purpose to support future use cases like:

- Extraction completion notifications
- Mention notifications
- Weekly digest emails
- Password reset reminders
- System alerts for admins

## Goals / Non-Goals

**Goals:**

- Provide a reliable, queue-based email sending system
- Support Mailgun as the email provider
- Enable templated, branded emails with Handlebars
- Track email delivery status for debugging
- Support invitation emails as the first use case
- Design for extensibility to support future email types

**Non-Goals:**

- Marketing/bulk email capabilities (use dedicated services)
- Email tracking pixels or click tracking
- Multiple email provider support (start with Mailgun only)
- Email bounce/complaint handling automation (manual review)
- Internationalization (English-only initially)

## Decisions

### 1. Email Provider: Mailgun

**Decision:** Use Mailgun via `mailgun.js` SDK

**Rationale:**

- Battle-tested, reliable transactional email service
- Excellent deliverability and reputation
- Simple, well-documented API
- Good free tier for development (5,000 emails/month)
- Supports both REST API and SMTP (we'll use REST API)

**Alternatives considered:**

- SendGrid: More complex, overkill for our needs
- AWS SES: Requires more setup, region-specific
- Resend: Newer, less proven
- Postmark: Good but more expensive

### 2. Templating: Handlebars

**Decision:** Use Handlebars for email templates

**Rationale:**

- Simple, logic-less templates (security benefit)
- Well-established, stable library
- Good editor support and syntax highlighting
- Can be pre-compiled for performance
- Easy to migrate to if using inline templates initially

### 3. Queue Architecture: Database-backed

**Decision:** Use PostgreSQL-backed job queue (similar to extraction jobs)

**Rationale:**

- Consistent with existing patterns (extraction jobs use similar approach)
- No additional infrastructure (Redis/RabbitMQ not needed)
- Built-in persistence and recovery
- Simple retry logic with exponential backoff
- Enables email audit trail

**Alternatives considered:**

- BullMQ (Redis): Additional dependency, overkill for email volume
- In-memory queue: No persistence, lost on restart
- Direct send (no queue): No retry capability, blocking

### 4. Template Storage: Filesystem

**Decision:** Store templates as `.hbs` files in `apps/server/templates/email/`

**Rationale:**

- Version controlled with source code
- Easy to review changes in PRs
- No database overhead for template storage
- Pre-compiled at startup for performance
- Can migrate to database later if dynamic editing needed

### 5. Email Logging: Database Table

**Decision:** Log all sent emails to `kb.email_logs` table

**Rationale:**

- Debugging and audit trail
- Can correlate with notifications and invites
- Track delivery status updates from Mailgun webhooks (future)
- Enables admin visibility into email activity

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Email Module                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ EmailService │───▶│ EmailQueue   │───▶│ EmailWorker      │  │
│  │ (public API) │    │ (db table)   │    │ (processes jobs) │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                                        │              │
│         │                                        ▼              │
│         │                               ┌──────────────────┐   │
│         │                               │ MailgunProvider  │   │
│         ▼                               │ (sends via API)  │   │
│  ┌──────────────┐                       └──────────────────┘   │
│  │ TemplateService│                              │              │
│  │ (renders HBS)  │                              ▼              │
│  └──────────────┘                       ┌──────────────────┐   │
│                                          │ email_logs table │   │
│                                          │ (audit trail)    │   │
│                                          └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Consumer Modules:
┌──────────────┐  ┌────────────────────┐  ┌──────────────────┐
│ InvitesService│  │NotificationsService│  │ Future modules...│
└──────────────┘  └────────────────────┘  └──────────────────┘
```

## Database Schema

### New Table: `kb.email_jobs`

```sql
CREATE TABLE kb.email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL,
  to_email VARCHAR(320) NOT NULL,
  to_name VARCHAR(255),
  subject VARCHAR(500) NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, sent, failed
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  mailgun_message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- For correlation
  source_type VARCHAR(50),  -- 'invite', 'notification', etc.
  source_id UUID,

  -- Indexes
  CONSTRAINT email_jobs_status_check CHECK (status IN ('pending', 'processing', 'sent', 'failed'))
);

CREATE INDEX idx_email_jobs_status_next_retry ON kb.email_jobs(status, next_retry_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_email_jobs_source ON kb.email_jobs(source_type, source_id);
```

### New Table: `kb.email_logs` (for audit/debugging)

```sql
CREATE TABLE kb.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_job_id UUID REFERENCES kb.email_jobs(id),
  event_type VARCHAR(50) NOT NULL,  -- 'queued', 'sent', 'delivered', 'failed', 'bounced'
  mailgun_event_id VARCHAR(255),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_job ON kb.email_logs(email_job_id);
```

## Environment Configuration

```bash
# Mailgun Configuration
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
MAILGUN_FROM_NAME=Emergent

# Optional: For EU region
MAILGUN_API_URL=https://api.eu.mailgun.net  # Default: https://api.mailgun.net

# Feature flag (for gradual rollout)
EMAIL_ENABLED=true
```

## Email Templates

Templates stored in `apps/server/templates/email/`:

```
templates/email/
├── layouts/
│   └── default.hbs          # Base HTML layout with header/footer
├── partials/
│   └── button.hbs           # Reusable button component
├── invitation.hbs           # User invitation email
├── extraction-complete.hbs  # Future: extraction notification
└── mention.hbs              # Future: mention notification
```

### Invitation Email Template

Subject: `You've been invited to join {{organizationName}} on Emergent`

**Content guidance:**

- Clear, action-oriented headline
- Brief explanation of who invited them and to what
- Prominent CTA button to set password/accept
- Include context about the role they're being given
- Professional but friendly tone
- Mobile-responsive design
- Plain text fallback

## Risks / Trade-offs

| Risk                          | Mitigation                                               |
| ----------------------------- | -------------------------------------------------------- |
| Mailgun API rate limits       | Queue with controlled throughput, batch support later    |
| Email deliverability          | Use verified domain, proper SPF/DKIM, monitor reputation |
| Template changes break emails | Unit tests for template rendering, preview capability    |
| Queue backlog growth          | Alert on queue depth, auto-retry limits                  |
| Credential exposure           | Environment variables, never log API keys                |

## Migration Plan

1. **Phase 1: Infrastructure** (this change)

   - Add Mailgun package dependency
   - Create email module with service, queue, worker
   - Create database tables and migration
   - Implement template system
   - Create invitation email template

2. **Phase 2: Integration**

   - Modify InvitesService to use EmailService
   - Keep Zitadel password notification as fallback
   - Test end-to-end flow

3. **Phase 3: Rollout**

   - Enable for single org first (feature flag)
   - Monitor deliverability and queue health
   - Full rollout after validation

4. **Future phases:**
   - Add more email types (notifications, digests)
   - Mailgun webhook integration for delivery tracking
   - Admin UI for email logs

## Open Questions

1. **Domain verification**: Who will set up SPF/DKIM records for the sending domain?

   - Recommendation: Use subdomain (mg.emergent.sh) to avoid affecting main domain

2. **Unsubscribe handling**: Do we need unsubscribe links for transactional emails?

   - Recommendation: Not required for transactional, but good practice

3. **Email testing environment**: How to test emails in development?
   - Recommendation: Mailgun sandbox mode or mailhog for local dev
