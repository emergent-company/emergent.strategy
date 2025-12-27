# Superadmin Guide

This guide covers the superadmin feature for platform operators who need system-wide access for support, debugging, and administration.

## Overview

Superadmins are trusted platform operators with elevated privileges that span across all organizations and projects. Unlike regular `org_admin` roles which are scoped to a single organization, superadmins have read access to the entire system.

**Use cases:**

- Investigating user-reported issues
- Debugging cross-tenant problems
- Monitoring system health and email delivery
- Supporting users by viewing the system as they see it

## Prerequisites

- **Database access**: The CLI requires direct database connectivity (for grant/revoke operations)
- **Authentication**: A valid user account in the system
- **Node.js environment**: For running CLI commands

## Granting Superadmin Access

Superadmin grants are managed via CLI only to ensure proper operational controls. Run commands from the `apps/server` directory.

### List Active Superadmins

```bash
cd apps/server
npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts --list
```

Example output:

```
============================================================
SUPERADMIN MANAGEMENT
============================================================

Found 2 active superadmin(s):

  • John Smith <john@example.com>
    User ID: 123e4567-e89b-12d3-a456-426614174000
    Granted: 2025-12-20T10:30:00.000Z
    Granted by: (system/CLI)
    Notes: Platform operator

  • Jane Doe <jane@example.com>
    User ID: 987fcdeb-51a2-3456-b789-012345678901
    Granted: 2025-12-15T14:20:00.000Z
    Granted by: John Smith <john@example.com>
```

### Grant Superadmin by Email

```bash
npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts \
  --grant \
  --email admin@example.com \
  --notes "Platform operator - approved by CTO"
```

### Grant Superadmin by User ID

```bash
npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts \
  --grant \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --notes "On-call support engineer"
```

### Preview Changes (Dry Run)

Before making changes, use `--dry-run` to preview:

```bash
npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts \
  --grant \
  --email admin@example.com \
  --dry-run
```

Output:

```
============================================================
SUPERADMIN MANAGEMENT
============================================================
Mode: DRY RUN (preview only)

Finding user by email: admin@example.com
Found user: Admin User <admin@example.com>
User ID: 123e4567-e89b-12d3-a456-426614174000

[DRY RUN] Would grant superadmin to: Admin User <admin@example.com>
```

### Revoke Superadmin Access

```bash
npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts \
  --revoke \
  --email admin@example.com \
  --notes "Role change - no longer requires elevated access"
```

## Using the Superadmin Panel

Once granted superadmin access, a "Superadmin" link appears in the main navigation.

### Users Page (`/admin/superadmin/users`)

View all users across the system:

- **Search**: Filter by name or email
- **Org Filter**: Show users belonging to a specific organization
- **Pagination**: Navigate through large user lists
- **Last Activity**: See when users were last active
- **View As**: Click to impersonate any user

### Organizations Page (`/admin/superadmin/organizations`)

Browse all organizations:

- Member count per organization
- Project count per organization
- Creation date
- Click to drill down into projects

### Projects Page (`/admin/superadmin/projects`)

View all projects across organizations:

- Filter by organization
- Document count per project
- Click to access project directly

### Email Jobs Page (`/admin/superadmin/emails`)

Monitor email delivery:

- **Status Filter**: pending, sent, failed
- **Recipient Search**: Find emails by recipient
- **Date Range**: Filter by sent date
- **Preview**: Click any email to see the rendered HTML

## View-As Impersonation

View-As lets you see the system exactly as a specific user sees it. This is invaluable for support and debugging.

### Starting Impersonation

1. Navigate to **Superadmin > Users**
2. Find the user you want to impersonate
3. Click the **"View As"** button in their row
4. A banner appears at the top: "Viewing as: User Name (user@email.com)"

### While Impersonating

- All pages show what that user would see
- You have their permissions (org/project access)
- Your actions are logged with BOTH your superadmin ID and the impersonated user ID
- The banner remains visible as a reminder

### Exiting Impersonation

Click **"Exit View As"** in the banner to return to your superadmin context.

### Important Notes

- Impersonation is for **viewing and debugging**, not for taking actions on behalf of users
- All actions during impersonation are fully audited
- The target user is NOT notified of impersonation
- Use responsibly and only when necessary for support

## Security Best Practices

### Access Control

- **Limit superadmin grants**: Only grant to operators who genuinely need it
- **Document grants**: Always use `--notes` to record why access was granted
- **Regular audits**: Periodically run `--list` to review active superadmins
- **Prompt revocation**: Revoke access when no longer needed

### Operational Security

- **Environment isolation**: Run CLI commands only from secured environments
- **Credential protection**: Database credentials should be properly secured
- **Audit logs**: Review audit logs for unusual superadmin activity
- **Session hygiene**: Log out when done; don't leave sessions open

### Compliance Considerations

- **Data access logging**: All superadmin API calls are logged
- **Impersonation audit trail**: View-As actions record both superadmin and target user
- **Grant/revoke history**: The `core.superadmins` table maintains full history
- **Notes for auditors**: Use descriptive notes on grants/revokes for compliance

## Troubleshooting

### "User not found" when granting

Ensure the email or user ID is correct. Check for typos or verify the user exists:

```bash
# Search the database directly if needed
psql -c "SELECT id, display_name FROM core.user_profiles WHERE deleted_at IS NULL"
```

### Superadmin menu not appearing

1. Verify your grant is active: `--list` command
2. Clear browser cache / hard refresh
3. Log out and log back in
4. Check browser console for API errors on `/superadmin/me`

### View-As not working

1. Ensure you have active superadmin status
2. Check that the target user exists and is not deleted
3. Verify the X-View-As-User-ID header is being sent (check Network tab)

### CLI connection errors

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

Ensure database is running and environment variables are set:

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=spec
export POSTGRES_PASSWORD=spec
export POSTGRES_DB=spec
```

## CLI Reference

```
Usage:
  npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts [options]

Commands:
  --grant              Grant superadmin status to a user
  --revoke             Revoke superadmin status from a user
  --list               List all active superadmins

User Selection (for --grant and --revoke):
  --user-id <uuid>     Target user by internal UUID
  --email <email>      Target user by email address

Options:
  --notes <text>       Notes for grant/revoke (optional but recommended)
  --dry-run            Preview without making changes
  --help               Show help message
```

## Related Documentation

- [Authorization Model Specification](../spec/18-authorization-model.md) - Section 19 covers superadmin technical details
- [Error Logging Quick Reference](./ERROR_LOGGING_QUICKREF.md) - For debugging issues
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Database and environment configuration
