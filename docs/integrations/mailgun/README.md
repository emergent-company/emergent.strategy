# Mailgun Email Integration

This integration provides transactional email sending capabilities using Mailgun as the email service provider.

## Architecture

The email system uses a queue-based architecture:

1. **EmailService**: Public API for queueing emails
2. **EmailJobsService**: Manages the job queue in PostgreSQL
3. **EmailWorkerService**: Background worker that processes queued emails
4. **MailgunProvider**: Sends emails via Mailgun REST API
5. **EmailTemplateService**: Renders MJML/Handlebars templates to HTML

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ EmailService │───▶│ EmailQueue   │───▶│ EmailWorker      │
│ (public API) │    │ (db table)   │    │ (processes jobs) │
└──────────────┘    └──────────────┘    └──────────────────┘
       │                                        │
       │                                        ▼
       │                               ┌──────────────────┐
       │                               │ MailgunProvider  │
       ▼                               │ (sends via API)  │
┌──────────────┐                       └──────────────────┘
│ TemplateService│                              │
│ (renders MJML) │                              ▼
└──────────────┘                       ┌──────────────────┐
                                       │ email_logs table │
                                       │ (audit trail)    │
                                       └──────────────────┘
```

## Configuration

Set the following environment variables in `apps/server/.env`:

```bash
# Enable email sending (default: false)
EMAIL_ENABLED=true

# Email worker configuration
EMAIL_WORKER_INTERVAL_MS=10000    # Poll interval (default: 10s)
EMAIL_WORKER_BATCH_SIZE=5         # Emails per batch (default: 5)
EMAIL_MAX_RETRIES=3               # Max retry attempts (default: 3)
EMAIL_RETRY_DELAY_SEC=60          # Retry delay (default: 60s)

# Mailgun API configuration
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
MAILGUN_FROM_NAME=Emergent

# Optional: EU region (default: US)
MAILGUN_API_URL=https://api.eu.mailgun.net
```

### Environment Variable Reference

| Variable                   | Required | Default                   | Description                                          |
| -------------------------- | -------- | ------------------------- | ---------------------------------------------------- |
| `EMAIL_ENABLED`            | No       | `false`                   | Feature flag to enable email sending                 |
| `EMAIL_WORKER_INTERVAL_MS` | No       | `10000`                   | Worker poll interval in milliseconds                 |
| `EMAIL_WORKER_BATCH_SIZE`  | No       | `5`                       | Number of emails to process per batch                |
| `EMAIL_MAX_RETRIES`        | No       | `3`                       | Maximum retry attempts for failed emails             |
| `EMAIL_RETRY_DELAY_SEC`    | No       | `60`                      | Base delay between retries (exponential backoff)     |
| `MAILGUN_API_KEY`          | Yes\*    | -                         | Mailgun API key (required when `EMAIL_ENABLED=true`) |
| `MAILGUN_DOMAIN`           | Yes\*    | -                         | Verified Mailgun sending domain                      |
| `MAILGUN_FROM_EMAIL`       | No       | `noreply@yourdomain.com`  | Default sender email address                         |
| `MAILGUN_FROM_NAME`        | No       | `Emergent`                | Default sender display name                          |
| `MAILGUN_API_URL`          | No       | `https://api.mailgun.net` | Mailgun API endpoint (use EU for GDPR)               |

\*Required only when `EMAIL_ENABLED=true`

## Mailgun Account Setup

### 1. Create a Mailgun Account

1. Go to [Mailgun](https://www.mailgun.com/) and sign up
2. Choose a plan (Free tier: 5,000 emails/month for 3 months)
3. Verify your email address

### 2. Add a Sending Domain

1. Navigate to **Sending** → **Domains**
2. Click **Add New Domain**
3. Use a subdomain (recommended): `mg.yourdomain.com`
   - Keeps main domain reputation separate
   - Easier DNS management
4. Select your region (US or EU)

### 3. Get API Credentials

1. Navigate to **Settings** → **API Keys**
2. Copy your **Private API Key** (starts with `key-`)
3. Store securely in environment variables

### 4. Configure DNS Records

See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for detailed SPF/DKIM configuration.

## Database Tables

The email system uses two database tables:

### `kb.email_jobs`

Stores queued and processed email jobs:

| Column               | Type         | Description                               |
| -------------------- | ------------ | ----------------------------------------- |
| `id`                 | UUID         | Primary key                               |
| `template_name`      | VARCHAR(100) | Template identifier                       |
| `to_email`           | VARCHAR(320) | Recipient email                           |
| `to_name`            | VARCHAR(255) | Recipient name                            |
| `subject`            | VARCHAR(500) | Email subject                             |
| `template_data`      | JSONB        | Template variables                        |
| `status`             | VARCHAR(20)  | `pending`, `processing`, `sent`, `failed` |
| `attempts`           | INT          | Number of send attempts                   |
| `max_attempts`       | INT          | Maximum retry attempts                    |
| `last_error`         | TEXT         | Last error message                        |
| `mailgun_message_id` | VARCHAR(255) | Mailgun message ID                        |
| `source_type`        | VARCHAR(50)  | Source: `invite`, `notification`, etc.    |
| `source_id`          | UUID         | Related entity ID                         |
| `created_at`         | TIMESTAMPTZ  | Job creation time                         |
| `processed_at`       | TIMESTAMPTZ  | Completion time                           |
| `next_retry_at`      | TIMESTAMPTZ  | Next retry time                           |

### `kb.email_logs`

Audit trail for email events:

| Column             | Type         | Description                                        |
| ------------------ | ------------ | -------------------------------------------------- |
| `id`               | UUID         | Primary key                                        |
| `email_job_id`     | UUID         | Reference to email_jobs                            |
| `event_type`       | VARCHAR(50)  | `queued`, `sent`, `delivered`, `failed`, `bounced` |
| `mailgun_event_id` | VARCHAR(255) | Mailgun event ID                                   |
| `details`          | JSONB        | Event details                                      |
| `created_at`       | TIMESTAMPTZ  | Event time                                         |

## Email Templates

Templates are stored in `apps/server/templates/email/`:

```
templates/email/
├── layouts/
│   └── default.mjml.hbs      # Base HTML layout
├── partials/
│   ├── button.mjml.hbs       # Reusable button component
│   ├── footer.mjml.hbs       # Email footer
│   ├── divider.mjml.hbs      # Section divider
│   ├── section-header.mjml.hbs
│   ├── list-item.mjml.hbs
│   └── view-in-browser.mjml.hbs
├── invitation.mjml.hbs       # User invitation email
├── welcome.mjml.hbs          # Welcome email
└── release-notification.mjml.hbs
```

Templates use:

- **MJML**: Responsive email markup language
- **Handlebars**: Template variables and logic

## Usage

### Sending Emails Programmatically

```typescript
import { EmailService } from '../email/email.service';

@Injectable()
export class MyService {
  constructor(private readonly emailService: EmailService) {}

  async sendNotification() {
    await this.emailService.queueEmail({
      templateName: 'invitation',
      to: {
        email: 'user@example.com',
        name: 'John Doe',
      },
      subject: 'You have been invited!',
      templateData: {
        inviterName: 'Jane Smith',
        organizationName: 'Acme Corp',
        acceptUrl: 'https://app.example.com/accept?token=abc123',
      },
      source: {
        type: 'invite',
        id: 'invite-uuid',
      },
    });
  }
}
```

### Monitoring Email Status

Query the email jobs table:

```sql
-- Recent email jobs
SELECT id, template_name, to_email, status, attempts, created_at
FROM kb.email_jobs
ORDER BY created_at DESC
LIMIT 20;

-- Failed emails
SELECT id, to_email, subject, last_error, attempts
FROM kb.email_jobs
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Email delivery timeline
SELECT j.id, j.to_email, l.event_type, l.created_at
FROM kb.email_jobs j
JOIN kb.email_logs l ON l.email_job_id = j.id
WHERE j.id = '<job-uuid>'
ORDER BY l.created_at;
```

## Graceful Degradation

If email sending is disabled or fails:

1. **Disabled (`EMAIL_ENABLED=false`)**:

   - `EmailService.queueEmail()` returns early without error
   - No jobs are created
   - Fallback mechanisms (e.g., Zitadel notifications) continue to work

2. **Mailgun Error**:

   - Job is marked as failed with error message
   - Retry scheduled with exponential backoff
   - After max retries, job remains in `failed` status
   - Internal logging continues unaffected

3. **Template Error**:
   - Job fails immediately with template error
   - No email sent
   - Error logged for debugging

## Troubleshooting

### Common Issues

**Emails not sending:**

1. Check `EMAIL_ENABLED=true`
2. Verify `MAILGUN_API_KEY` is set correctly
3. Check worker logs for errors

**Authentication errors:**

1. Verify API key format (should start with `key-`)
2. Ensure domain matches API key permissions
3. Check if using correct API URL (US vs EU)

**Deliverability issues:**

1. Verify DNS records (SPF, DKIM)
2. Check domain verification status in Mailgun
3. Review Mailgun logs for bounces/complaints

### Viewing Logs

```bash
# Check server logs for email worker activity
tail -f logs/server/server.log | grep -i email

# Query failed jobs
psql -c "SELECT * FROM kb.email_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;"
```

## See Also

- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Local development and DNS configuration
- [Mailgun Documentation](https://documentation.mailgun.com/)
- [MJML Documentation](https://mjml.io/documentation/)
