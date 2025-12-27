# Mailgun Developer Guide

This guide covers local development setup, DNS configuration for production, and debugging email issues.

## Local Development Setup

### Option 1: Mailgun Sandbox (Recommended)

Mailgun provides a sandbox domain for testing without DNS configuration.

1. **Get Sandbox Credentials**:

   - Log in to [Mailgun](https://app.mailgun.com/)
   - Navigate to **Sending** → **Domains**
   - Find the sandbox domain (e.g., `sandbox123abc.mailgun.org`)
   - Copy the API key

2. **Configure Environment**:

   ```bash
   # apps/server/.env
   EMAIL_ENABLED=true
   MAILGUN_API_KEY=key-your-sandbox-key
   MAILGUN_DOMAIN=sandbox123abc.mailgun.org
   MAILGUN_FROM_EMAIL=test@sandbox123abc.mailgun.org
   MAILGUN_FROM_NAME=Emergent Dev
   ```

3. **Add Authorized Recipients**:

   - Sandbox domains can only send to verified email addresses
   - Navigate to **Sending** → **Domains** → your sandbox
   - Click **Authorized Recipients**
   - Add your test email addresses

4. **Test Email Sending**:
   ```bash
   # Create an invite or trigger email-sending code
   # Check your authorized email inbox
   ```

### Option 2: Mailhog (Local SMTP Trap)

For completely offline development, use Mailhog to capture all outgoing emails.

> **Note**: This requires modifying the `MailgunProvider` to support SMTP, which is not implemented in the current version. The Mailgun REST API is the only supported method.

### Option 3: Disable Emails

For development that doesn't require testing emails:

```bash
# apps/server/.env
EMAIL_ENABLED=false
```

The email service will accept queue requests but won't send anything.

## Production DNS Configuration

### Overview

For production email delivery, you must configure DNS records to:

1. Verify domain ownership with Mailgun
2. Enable SPF (Sender Policy Framework) to authorize Mailgun
3. Enable DKIM (DomainKeys Identified Mail) for email signing

### Recommended Domain Setup

Use a subdomain dedicated to email (e.g., `mg.yourdomain.com`):

- **Benefits**: Protects main domain reputation, easier to manage
- **Pattern**: `mg.yourdomain.com` or `mail.yourdomain.com`

### DNS Records Required

When you add a domain in Mailgun, you'll receive specific DNS records. Below is a typical configuration:

#### 1. Domain Verification (TXT Record)

```
Type:  TXT
Host:  mg.yourdomain.com
Value: v=spf1 include:mailgun.org ~all
```

#### 2. SPF Record (TXT Record)

SPF tells receiving servers that Mailgun is authorized to send on your behalf:

```
Type:  TXT
Host:  mg.yourdomain.com
Value: v=spf1 include:mailgun.org ~all
```

**Note**: If you have an existing SPF record, merge the `include:mailgun.org` into it:

```
v=spf1 include:_spf.google.com include:mailgun.org ~all
```

#### 3. DKIM Records (TXT Records)

DKIM provides cryptographic signing. Mailgun will provide two DKIM records:

```
Type:  TXT
Host:  pic._domainkey.mg.yourdomain.com
Value: k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ... (long key)

Type:  TXT
Host:  k1._domainkey.mg.yourdomain.com
Value: k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ... (long key)
```

**Important**: The actual values will be provided by Mailgun when you add your domain. Copy them exactly.

#### 4. MX Record (For Receiving - Optional)

Only needed if you want to receive emails on this domain:

```
Type:  MX
Host:  mg.yourdomain.com
Value: mxa.mailgun.org
Priority: 10

Type:  MX
Host:  mg.yourdomain.com
Value: mxb.mailgun.org
Priority: 10
```

#### 5. CNAME Record (For Tracking - Optional)

For click/open tracking:

```
Type:  CNAME
Host:  email.mg.yourdomain.com
Value: mailgun.org
```

### Verifying DNS Configuration

1. **In Mailgun Dashboard**:

   - Navigate to **Sending** → **Domains**
   - Click your domain
   - Click **Verify DNS Settings**
   - Mailgun will check each record

2. **Using Command Line**:

   ```bash
   # Check SPF
   dig TXT mg.yourdomain.com +short

   # Check DKIM
   dig TXT pic._domainkey.mg.yourdomain.com +short
   dig TXT k1._domainkey.mg.yourdomain.com +short

   # Check MX (if configured)
   dig MX mg.yourdomain.com +short
   ```

3. **DNS Propagation**:
   - DNS changes can take up to 48 hours to propagate
   - Typically propagates within 1-4 hours
   - Use [DNS Checker](https://dnschecker.org/) to verify global propagation

### Common DNS Issues

| Issue                   | Solution                                          |
| ----------------------- | ------------------------------------------------- |
| SPF record too long     | Use `include:` directives instead of IP addresses |
| Multiple SPF records    | Merge into a single TXT record                    |
| DKIM verification fails | Ensure no extra whitespace in DNS values          |
| Slow verification       | Wait for DNS propagation (up to 48h)              |

## EU Region (GDPR Compliance)

For GDPR compliance, use Mailgun's EU data center:

1. **Select EU Region** when adding your domain in Mailgun
2. **Configure API URL**:

   ```bash
   MAILGUN_API_URL=https://api.eu.mailgun.net
   ```

3. **Benefits**:
   - Data stored in EU data centers
   - Compliant with EU data residency requirements

## Debugging Email Issues

### Check Email Queue

```sql
-- View recent email jobs
SELECT id, template_name, to_email, status, attempts, last_error, created_at
FROM kb.email_jobs
ORDER BY created_at DESC
LIMIT 20;

-- View failed jobs with errors
SELECT id, to_email, subject, last_error, attempts, max_attempts
FROM kb.email_jobs
WHERE status = 'failed'
ORDER BY created_at DESC;

-- View job timeline
SELECT
  j.id,
  j.to_email,
  j.status,
  l.event_type,
  l.details,
  l.created_at
FROM kb.email_jobs j
LEFT JOIN kb.email_logs l ON l.email_job_id = j.id
WHERE j.id = '<job-uuid>'
ORDER BY l.created_at;
```

### Check Server Logs

```bash
# Filter email-related logs
tail -f logs/server/server.log | grep -i -E "email|mailgun"

# Look for worker activity
grep "EmailWorker" logs/server/server.log | tail -50
```

### Common Error Messages

| Error                    | Cause                 | Solution                               |
| ------------------------ | --------------------- | -------------------------------------- |
| `Forbidden`              | Invalid API key       | Verify `MAILGUN_API_KEY`               |
| `Domain not found`       | Domain mismatch       | Check `MAILGUN_DOMAIN` matches Mailgun |
| `Unauthorized`           | Wrong API URL         | Use EU URL for EU domains              |
| `Template not found`     | Missing template file | Check `templates/email/` directory     |
| `MJML compilation error` | Invalid MJML syntax   | Validate template with MJML            |

### Test Email Manually

Use curl to test Mailgun API directly:

```bash
curl -s --user "api:$MAILGUN_API_KEY" \
  https://api.mailgun.net/v3/$MAILGUN_DOMAIN/messages \
  -F from="Test <test@$MAILGUN_DOMAIN>" \
  -F to="your-email@example.com" \
  -F subject="Test Email" \
  -F text="This is a test."
```

### Verify Template Rendering

The `EmailTemplateService` can be tested directly:

```typescript
// In a test or script
const templateService = app.get(EmailTemplateService);
const { html, text } = await templateService.render('invitation', {
  inviterName: 'John',
  organizationName: 'Test Org',
  acceptUrl: 'https://example.com/accept',
});
console.log(html);
```

## Email Template Development

### MJML Basics

Templates use [MJML](https://mjml.io/) for responsive email markup:

```handlebars
{{!-- templates/email/my-template.mjml.hbs --}}
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello {{name}}!</mj-text>
        {{> button url=actionUrl text="Click Here" }}
      </mj-column>
    </mj-section>
    {{> footer }}
  </mj-body>
</mjml>
```

### Testing Templates

1. **Use MJML Playground**: https://mjml.io/try-it-live
2. **Preview Locally**:
   ```bash
   # Render template to HTML
   npx mjml templates/email/invitation.mjml.hbs -o preview.html
   open preview.html
   ```

### Template Variables

Templates receive variables via `templateData`. Document expected variables in template comments:

```handlebars
{{!
  Template: invitation
  Variables:
    - inviterName (string): Name of person sending invite
    - organizationName (string): Organization name
    - acceptUrl (string): URL to accept invitation
    - roleName (string, optional): Role being assigned
}}
```

## Retry Behavior

The email worker uses exponential backoff:

| Attempt | Delay       |
| ------- | ----------- |
| 1       | 60 seconds  |
| 2       | 120 seconds |
| 3       | 240 seconds |

After `EMAIL_MAX_RETRIES` (default: 3) failures, the job is marked as `failed` and no more retries are attempted.

### Manual Retry

To retry a failed job:

```sql
-- Reset a specific job for retry
UPDATE kb.email_jobs
SET status = 'pending',
    attempts = 0,
    last_error = NULL,
    next_retry_at = NULL
WHERE id = '<job-uuid>';
```

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Queue Depth**: Number of pending jobs
2. **Failure Rate**: Jobs failing after max retries
3. **Processing Latency**: Time from queue to sent

### Example Queries

```sql
-- Queue depth by status
SELECT status, COUNT(*) as count
FROM kb.email_jobs
WHERE created_at > now() - interval '1 hour'
GROUP BY status;

-- Failure rate (last 24h)
SELECT
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 2) as failure_rate
FROM kb.email_jobs
WHERE created_at > now() - interval '24 hours';
```

## See Also

- [README.md](./README.md) - Overview and configuration
- [Mailgun API Docs](https://documentation.mailgun.com/en/latest/api-intro.html)
- [MJML Documentation](https://mjml.io/documentation/)
- [SPF Record Syntax](https://www.spfwizard.net/)
- [DKIM Explained](https://www.cloudflare.com/learning/dns/dns-records/dns-dkim-record/)
