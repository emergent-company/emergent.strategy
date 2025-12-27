# Change: Add Superadmin Email Template Management

## Why

Platform operators need to customize email templates without deploying new code. Currently, email templates (invitation, welcome, release-notification) are stored as file-based MJML+Handlebars templates that require a code deployment to modify. This creates friction when operators need to:

1. Update branding (logos, colors, footer text)
2. Fix typos or improve copy
3. Add new template variants for different use cases
4. Preview template changes before sending to real users

The superadmin panel already has email job history viewing (`/admin/superadmin/emails`) but no capability to manage the templates themselves.

## What Changes

### Database-Backed Template Storage

- **ADDED**: `kb.email_templates` table to store template content with versioning
- **ADDED**: `kb.email_template_versions` table for version history and rollback
- **MODIFIED**: `EmailTemplateService` to prefer database templates over file-based templates
- File-based templates remain as fallback defaults and seed data

### Template Management UI

- **ADDED**: New route `/admin/superadmin/email-templates` for template listing
- **ADDED**: Template editor page with MJML syntax highlighting
- **ADDED**: Live preview with sample data injection
- **ADDED**: Version history view with diff and rollback capability
- **ADDED**: "Reset to Default" action to restore file-based template

### Superadmin API Endpoints

- `GET /superadmin/email-templates` - List all templates with metadata
- `GET /superadmin/email-templates/:id` - Get template content and variables
- `PUT /superadmin/email-templates/:id` - Update template content (creates new version)
- `POST /superadmin/email-templates/:id/preview` - Render template with sample data
- `GET /superadmin/email-templates/:id/versions` - List version history
- `POST /superadmin/email-templates/:id/rollback` - Rollback to specific version
- `POST /superadmin/email-templates/:id/reset` - Reset to file-based default

### Sample Data Management

- **ADDED**: Sample data definitions per template type for preview
- Invitation template: sample org/project names, inviter name, CTA URL
- Welcome template: sample user name, login URL
- Release notification: sample version, changelog, release notes

## Impact

- **Affected specs**:
  - `email-template-management` (new capability)
- **Affected code**:
  - `apps/server/src/modules/email/email-template.service.ts` - Add DB lookup
  - `apps/server/src/modules/superadmin/` - New template endpoints
  - `apps/server/src/entities/` - New template entities
  - `apps/admin/src/pages/admin/superadmin/` - New template management pages
  - Database migrations for new tables
- **Dependencies**: None (uses existing MJML, Handlebars, Monaco Editor)
- **Database**: Two new tables in `kb` schema

## Security Considerations

- Template editing restricted to superadmins only
- MJML content sanitized before storage (no arbitrary HTML injection)
- Template rendering in sandboxed context
- All edits logged with superadmin user ID and timestamp
- Version history preserved for audit trail
