# Design: Superadmin Email Template Management

## Context

The email infrastructure uses MJML (responsive email markup) + Handlebars (templating) to render emails. Templates are currently file-based in `apps/server/templates/email/`. This design introduces database-backed templates with version history while maintaining file-based templates as defaults.

## Goals

- Enable superadmins to edit email templates via UI without code deployment
- Provide preview capability with realistic sample data
- Maintain version history for audit and rollback
- Preserve file-based templates as fallback/seed data

## Non-Goals

- Template creation (only editing existing templates)
- User-facing template customization (superadmin only)
- Multi-tenant template variations (system-wide only)
- Template scheduling or A/B testing

## Database Schema

### `kb.email_templates`

Primary table storing the current active version of each template.

```sql
CREATE TABLE kb.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,           -- 'invitation', 'welcome', 'release-notification'
  description TEXT,                             -- Human-readable description
  subject_template VARCHAR(500) NOT NULL,       -- Handlebars template for subject line
  mjml_content TEXT NOT NULL,                   -- MJML + Handlebars template body
  variables JSONB NOT NULL DEFAULT '[]',        -- Array of {name, type, description, required}
  sample_data JSONB NOT NULL DEFAULT '{}',      -- Default sample data for preview
  current_version_id UUID,                      -- FK to email_template_versions
  is_customized BOOLEAN NOT NULL DEFAULT false, -- true if modified from file default
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES core.user_profiles(id) -- superadmin who last edited
);

CREATE INDEX idx_email_templates_name ON kb.email_templates(name);
```

### `kb.email_template_versions`

Version history for audit trail and rollback.

```sql
CREATE TABLE kb.email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES kb.email_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,              -- Auto-incremented per template
  subject_template VARCHAR(500) NOT NULL,
  mjml_content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  sample_data JSONB NOT NULL DEFAULT '{}',
  change_summary VARCHAR(500),                  -- Optional description of changes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES core.user_profiles(id),

  UNIQUE(template_id, version_number)
);

CREATE INDEX idx_email_template_versions_template ON kb.email_template_versions(template_id);
CREATE INDEX idx_email_template_versions_created ON kb.email_template_versions(created_at DESC);
```

## Template Variable Schema

Each template defines its expected variables:

```typescript
interface TemplateVariable {
  name: string; // e.g., 'inviterName'
  type: 'string' | 'url' | 'date' | 'object';
  description: string; // Human-readable description
  required: boolean;
  defaultValue?: any; // Optional default for preview
}
```

Example for invitation template:

```json
[
  {
    "name": "inviterName",
    "type": "string",
    "description": "Name of person sending invite",
    "required": true
  },
  {
    "name": "organizationName",
    "type": "string",
    "description": "Organization being invited to",
    "required": true
  },
  {
    "name": "projectName",
    "type": "string",
    "description": "Project being invited to (optional)",
    "required": false
  },
  {
    "name": "inviteUrl",
    "type": "url",
    "description": "URL to accept invitation",
    "required": true
  },
  {
    "name": "recipientName",
    "type": "string",
    "description": "Name of person being invited",
    "required": false
  }
]
```

## API Design

### List Templates

```
GET /superadmin/email-templates
Response: {
  templates: [{
    id: string,
    name: string,
    description: string,
    isCustomized: boolean,
    currentVersionNumber: number,
    updatedAt: string,
    updatedBy: { id: string, name: string } | null
  }]
}
```

### Get Template

```
GET /superadmin/email-templates/:id
Response: {
  id: string,
  name: string,
  description: string,
  subjectTemplate: string,
  mjmlContent: string,
  variables: TemplateVariable[],
  sampleData: Record<string, any>,
  isCustomized: boolean,
  currentVersion: {
    id: string,
    versionNumber: number,
    createdAt: string,
    createdBy: { id: string, name: string } | null
  }
}
```

### Update Template

```
PUT /superadmin/email-templates/:id
Body: {
  subjectTemplate: string,
  mjmlContent: string,
  sampleData?: Record<string, any>,
  changeSummary?: string
}
Response: {
  id: string,
  versionNumber: number,
  createdAt: string
}
```

Creates a new version and updates `current_version_id`.

### Preview Template

```
POST /superadmin/email-templates/:id/preview
Body: {
  data?: Record<string, any>  // Override sample data
}
Response: {
  html: string,               // Rendered HTML
  text: string | null,        // Plain text version
  subject: string             // Rendered subject line
}
```

### List Versions

```
GET /superadmin/email-templates/:id/versions
Query: { limit?: number, offset?: number }
Response: {
  versions: [{
    id: string,
    versionNumber: number,
    changeSummary: string | null,
    createdAt: string,
    createdBy: { id: string, name: string } | null
  }],
  total: number
}
```

### Rollback to Version

```
POST /superadmin/email-templates/:id/rollback
Body: {
  versionId: string
}
Response: {
  id: string,
  versionNumber: number  // New version number (rollback creates new version)
}
```

### Reset to Default

```
POST /superadmin/email-templates/:id/reset
Response: {
  id: string,
  versionNumber: number
}
```

Loads content from file-based template and creates a new version.

## Template Service Integration

Modified `EmailTemplateService`:

```typescript
class EmailTemplateService {
  // Existing method - now checks DB first
  render(
    templateName: string,
    context: TemplateContext,
    layoutName?: string
  ): TemplateRenderResult {
    // 1. Try to load from database
    const dbTemplate = await this.templateRepo.findOne({
      where: { name: templateName },
    });

    if (dbTemplate && dbTemplate.isCustomized) {
      // Use database template
      return this.renderFromContent(
        dbTemplate.mjmlContent,
        context,
        layoutName
      );
    }

    // 2. Fall back to file-based template
    return this.renderFromFile(templateName, context, layoutName);
  }
}
```

## Migration Strategy

### Seed Migration

On first run, seed `kb.email_templates` from existing file-based templates:

1. Read all `.mjml.hbs` files from `apps/server/templates/email/`
2. Create `email_templates` row for each (excluding layouts/partials)
3. Create initial version in `email_template_versions`
4. Set `is_customized = false`

```typescript
// Seed script pseudocode
for (const file of ['invitation', 'welcome', 'release-notification']) {
  const content = readFileSync(`templates/email/${file}.mjml.hbs`);
  const variables = extractVariables(file); // Hardcoded per template type
  const sampleData = getSampleData(file); // Hardcoded per template type

  await templateRepo.save({
    name: file,
    description: getDescription(file),
    subjectTemplate: getSubjectTemplate(file),
    mjmlContent: content,
    variables,
    sampleData,
    isCustomized: false,
  });
}
```

## Frontend Components

### Template List Page (`/admin/superadmin/email-templates`)

- Table showing all templates with name, description, customized status, last update
- Click row to navigate to editor
- Badge showing "Customized" vs "Default"

### Template Editor Page (`/admin/superadmin/email-templates/:id`)

- Split view: Editor (left) + Preview (right)
- Monaco Editor with MJML syntax highlighting
- Subject line input field
- Sample data JSON editor (collapsible)
- "Preview" button to render with current data
- "Save" button with optional change summary
- "Reset to Default" button (with confirmation)
- Version history sidebar (collapsible)

### Version History Component

- List of versions with timestamp, author, summary
- "View" to see diff from current
- "Rollback" to restore (with confirmation)

## Open Questions

1. **Should layouts/partials be editable?** Initial scope excludes them - only main templates. Layouts provide consistent branding and should be more carefully controlled.

2. **Template variable validation?** We could validate that all required variables are present before saving. Initial implementation: soft validation with warnings only.

3. **Preview in email client?** Could add "Send Test Email" to deliver to a specified address. Deferred to future enhancement.

## Risks & Mitigations

| Risk                              | Mitigation                                                              |
| --------------------------------- | ----------------------------------------------------------------------- |
| MJML syntax errors break emails   | Validate MJML before saving; show errors in editor                      |
| Handlebars injection              | Sanitize template content; run in sandboxed context                     |
| Lost customizations               | Version history enables rollback; "Reset to Default" is explicit action |
| Performance (DB lookup per email) | Cache active templates in memory with TTL                               |
