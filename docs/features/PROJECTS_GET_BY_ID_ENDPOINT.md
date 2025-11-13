# Projects API Enhancement - Added GET by ID Endpoint

**Date**: 2025-10-18  
**Issue**: Auto-extraction settings page getting 404 when fetching project details

## Problem

The auto-extraction settings page (`/admin/settings/project/auto-extraction`) tries to fetch project details:

```typescript
const projectData = await fetchJson<Project>(
    `${apiBase}/api/projects/${config.activeProjectId}`
);
```

But the backend only had these endpoints:
- `GET /projects` - List all projects
- `POST /projects` - Create project
- `DELETE /projects/:id` - Delete project

**Missing**: `GET /projects/:id` - Get single project by ID

## Solution

### 1. Added Controller Endpoint

**File**: `apps/server/src/modules/projects/projects.controller.ts`

```typescript
@Get(':id')
@UseInterceptors(CachingInterceptor)
@ApiOkResponse({ description: 'Get project by ID', type: ProjectDto })
@ApiBadRequestResponse({ description: 'Invalid id', schema: { example: { error: { code: 'bad-request', message: 'Invalid id' } } } })
@ApiStandardErrors()
@Scopes('project:read')
async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const project = await this.projects.getById(id);
    if (!project) {
        throw new NotFoundException({ error: { code: 'not-found', message: 'Project not found' } });
    }
    return project;
}
```

### 2. Added Service Method

**File**: `apps/server/src/modules/projects/projects.service.ts`

```typescript
async getById(id: string): Promise<ProjectDto | null> {
    const res = await this.db.query<ProjectRow>(
        `SELECT id, name, org_id FROM kb.projects WHERE id = $1`,
        [id],
    );
    if (res.rows.length === 0) {
        return null;
    }
    const r = res.rows[0];
    return { id: r.id, name: r.name, orgId: r.org_id };
}
```

## Response Format

```json
{
  "id": "342b78f5-2904-4e1a-ae41-9c2d481a3a46",
  "name": "Test Project",
  "orgId": "ed2a354d-feac-4de5-8f4a-e419822ac2ab"
}
```

## Security

- **Authentication**: Required (AuthGuard)
- **Authorization**: Requires `project:read` scope (ScopesGuard)
- **Validation**: UUID validation via ParseUUIDPipe
- **Caching**: Enabled (CachingInterceptor)

## Testing

```bash
# With auth (from browser or with token)
curl http://localhost:5175/api/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 200 OK with project data
```

## Future Enhancements

The `kb.projects` table currently only has basic fields:
- `id`, `name`, `org_id`, `created_at`, `updated_at`

The auto-extraction settings page expects these additional fields (not yet in DB):
- `auto_extract_objects` (boolean) - Enable/disable auto-extraction
- `auto_extract_config` (jsonb) - Configuration object with:
  - `enabled_types` (string[]) - Which entity types to extract
  - `min_confidence` (number) - Minimum confidence threshold
  - `require_review` (boolean) - Flag entities for review
  - `notify_on_complete` (boolean) - Send notifications
  - `notification_channels` (string[]) - Which channels to notify

**Next Step**: Create migration to add auto-extraction fields to projects table.

For now, the page will use default values when these fields are missing.

## Related Files

- Controller: `apps/server/src/modules/projects/projects.controller.ts`
- Service: `apps/server/src/modules/projects/projects.service.ts`
- Frontend: `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`
- DTO: `apps/server/src/modules/projects/dto/project.dto.ts`
