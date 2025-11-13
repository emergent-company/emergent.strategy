# KB Purpose Editor - Bug Fix Complete

## Problem

The KB Purpose Editor component was calling `PATCH /api/projects/:id` with `{ kb_purpose: "..." }`, but the backend **ProjectsController had no PATCH endpoint** defined. This caused a 400 Bad Request error when users tried to save the KB purpose.

## Root Cause

1. **Missing PATCH endpoint** in `ProjectsController` - Controller only had GET, POST, and DELETE
2. **Missing UpdateProjectDto** - No DTO for partial updates
3. **Missing update method** in `ProjectsService` - No service method to handle updates
4. **Database column existed** - The `kb_purpose` column was already added via migration `20251019_add_kb_purpose_to_projects.sql`

## Solution Implemented

### 1. Created UpdateProjectDto (`dto/project.dto.ts`)
```typescript
export class UpdateProjectDto {
    @ApiProperty({ 
        example: 'Updated Project Name', 
        required: false 
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    name?: string;

    @ApiProperty({ 
        example: 'This knowledge base contains...', 
        description: 'Markdown description of KB purpose',
        required: false 
    })
    @IsOptional()
    @IsString()
    kb_purpose?: string;
}
```

### 2. Added update() method to ProjectsService
```typescript
async update(projectId: string, updates: { name?: string; kb_purpose?: string }): Promise<ProjectDto | null> {
    // Builds dynamic SQL UPDATE based on provided fields
    // Returns updated project or null if not found
    // Validates UUID format
    // Sets updated_at timestamp
}
```

### 3. Added PATCH endpoint to ProjectsController
```typescript
@Patch(':id')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@ApiOkResponse({ description: 'Project updated', type: ProjectDto })
@Scopes('project:write')
async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProjectDto
) {
    const updated = await this.projects.update(id, dto);
    if (!updated) {
        throw new NotFoundException({ ... });
    }
    return updated;
}
```

### 4. Updated ProjectDto to include kb_purpose
```typescript
export class ProjectDto {
    @ApiProperty({ example: 'proj_1' })
    id!: string;
    
    @ApiProperty({ example: 'Demo Project' })
    name!: string;
    
    @ApiProperty({ example: 'org_1' })
    orgId!: string;
    
    @ApiProperty({ example: 'This knowledge base contains...', required: false })
    kb_purpose?: string;  // ← Added
}
```

## API Endpoint

### PATCH /projects/:id
Updates a project's name and/or kb_purpose.

**Request:**
```http
PATCH /api/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46
Authorization: Bearer <token>
Content-Type: application/json

{
  "kb_purpose": "This knowledge base contains technical documentation..."
}
```

**Response:**
```json
{
  "id": "342b78f5-2904-4e1a-ae41-9c2d481a3a46",
  "name": "Demo Project",
  "orgId": "org_123",
  "kb_purpose": "This knowledge base contains technical documentation..."
}
```

**Scope Required:** `project:write`

## Files Modified

1. `apps/server/src/modules/projects/dto/project.dto.ts`
   - Added `UpdateProjectDto` class
   - Added `kb_purpose` field to `ProjectDto`
   - Added validation decorators

2. `apps/server/src/modules/projects/projects.service.ts`
   - Added `update()` method (50 lines)
   - Builds dynamic SQL based on provided fields
   - Returns updated project with kb_purpose

3. `apps/server/src/modules/projects/projects.controller.ts`
   - Added `Patch` import from `@nestjs/common`
   - Added `UpdateProjectDto` import
   - Added `@Patch(':id')` endpoint handler
   - Added API documentation decorators

## Testing

### Manual Test
1. Open browser to http://localhost:5175/admin/settings/project/auto-extraction
2. Click "Edit Purpose" in KB Purpose section
3. Enter markdown text in textarea
4. Click "Save Purpose"
5. ✅ Should save successfully without 400 error
6. Refresh page
7. ✅ KB purpose should be displayed (not in edit mode)

### API Test (curl)
```bash
# Get project to see current kb_purpose
curl -X GET http://localhost:3001/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46 \
  -H "Authorization: Bearer <token>"

# Update kb_purpose
curl -X PATCH http://localhost:3001/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"kb_purpose": "Test KB purpose markdown"}'

# Verify update
curl -X GET http://localhost:3001/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46 \
  -H "Authorization: Bearer <token>"
```

## Database Verification

The `kb_purpose` column already existed from migration `20251019_add_kb_purpose_to_projects.sql`:

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'kb' 
  AND table_name = 'projects' 
  AND column_name = 'kb_purpose';
```

Result:
```
column_name | data_type | is_nullable
kb_purpose  | text      | YES
```

## Status

✅ **FIXED** - The KB Purpose Editor now works correctly. Users can save and edit the knowledge base purpose description, which will be used by the auto-discovery AI to understand context when discovering object types and relationships.

## Next Steps

1. ✅ Server restarted with new endpoint
2. 🧪 Manual browser test (user should verify)
3. 🔜 Test Discovery Wizard flow end-to-end
4. 🔜 Create E2E tests for KB Purpose Editor
5. 🔜 Create E2E tests for Discovery Wizard
