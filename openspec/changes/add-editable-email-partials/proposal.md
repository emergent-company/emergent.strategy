# Change: Add Editable Email Template Partials

## Why

Email templates share common components (headers, footers, legal text) via Handlebars partials. Currently, these partials are file-based (`apps/server/templates/email/partials/*.mjml.hbs`) and require code deployments to modify. Platform operators need to customize these shared components (branding, footer links, legal disclaimers) without deploying new code, while maintaining consistency across all email templates.

## What Changes

### Database-Backed Partial Storage

- **ADDED**: `kb.email_template_partials` table to store partial content
- **ADDED**: `kb.email_template_partial_versions` table for version history
- **MODIFIED**: `EmailTemplateService.registerPartials()` to load from DB when customized
- File-based partials remain as fallback defaults

### Partial Management UI

- **ADDED**: New route `/admin/superadmin/email-partials` for partial listing
- **ADDED**: Partial editor page with MJML syntax highlighting
- **ADDED**: Live preview showing partial in context of a sample template
- **ADDED**: Version history with rollback capability
- **ADDED**: "Reset to Default" action to restore file-based partial

### Superadmin API Endpoints

- `GET /superadmin/email-partials` - List all partials with metadata
- `GET /superadmin/email-partials/:name` - Get partial content
- `PUT /superadmin/email-partials/:name` - Update partial content (creates new version)
- `POST /superadmin/email-partials/:name/preview` - Preview partial in template context
- `GET /superadmin/email-partials/:name/versions` - List version history
- `POST /superadmin/email-partials/:name/rollback` - Rollback to specific version
- `POST /superadmin/email-partials/:name/reset` - Reset to file-based default

## Impact

- **Affected specs**:
  - `email-template-management` (MODIFIED - add partial management requirements)
- **Affected code**:
  - `apps/server/src/modules/email/email-template.service.ts` - Load partials from DB
  - `apps/server/src/modules/superadmin/email-partials.controller.ts` - New controller
  - `apps/server/src/entities/email-template-partial.entity.ts` - New entity
  - `apps/admin/src/pages/admin/superadmin/email-partials.tsx` - New list page
  - `apps/admin/src/pages/admin/superadmin/email-partial-editor.tsx` - New editor
  - Database migrations for new tables
- **Dependencies**: Extends `add-superadmin-email-templates` (must complete first)
- **Database**: Two new tables in `kb` schema
