# Embedding Policies

## Overview

Embedding policies provide fine-grained control over which graph objects receive embeddings. This feature allows you to optimize your embedding budget, reduce processing overhead, and focus embedding resources on the most relevant content.

**Key Benefits:**
- **Cost Optimization**: Only embed objects that add value to semantic search
- **Performance**: Reduce embedding queue processing time
- **Flexibility**: Control embedding behavior per object type with granular filters
- **Field Masking**: Include only relevant properties in embeddings using JSON Pointer paths

## Architecture

Embedding policies are evaluated at **object creation time** in `GraphService.createObject()`. When a new object is created:

1. System checks if there are any policies for the object's type in the project
2. If no policies exist → **Permissive default**: object is queued for embedding
3. If policies exist → Policy evaluation determines if object should be embedded

Policies are project-scoped and type-specific. The unique constraint `(project_id, object_type)` ensures one policy per type per project.

## Policy Structure

```typescript
interface EmbeddingPolicy {
  id: string;                      // UUID
  projectId: string;                // UUID - links to kb.projects
  objectType: string;               // Graph object type (e.g., 'Document', 'Requirement')
  enabled: boolean;                 // Master switch for this object type
  maxPropertySize?: number;         // Max size in bytes for property values (default: 10000)
  requiredLabels: string[];         // Object must have ALL of these labels
  excludedLabels: string[];         // Object must have NONE of these labels
  relevantPaths: string[];          // JSON Pointer paths to include (empty = all)
  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
}
```

## Filter Types

Policies support five types of filters that are evaluated in sequence:

### 1. Enabled Flag
**Purpose**: Master switch to completely disable embeddings for an object type.

```typescript
{ 
  objectType: 'InternalNote',
  enabled: false  // No InternalNote objects will be embedded
}
```

### 2. Required Labels
**Purpose**: Object must have **ALL** specified labels to be embedded.

```typescript
{
  objectType: 'Requirement',
  enabled: true,
  requiredLabels: ['verified', 'customer-facing']
  // Only requirements with BOTH labels will be embedded
}
```

**Use Case**: Embed only high-quality, reviewed content.

### 3. Excluded Labels
**Purpose**: Object must have **NONE** of the specified labels to be embedded.

```typescript
{
  objectType: 'Document',
  enabled: true,
  excludedLabels: ['draft', 'archived', 'deprecated']
  // Documents with any of these labels will NOT be embedded
}
```

**Use Case**: Filter out temporary, obsolete, or work-in-progress content.

### 4. Property Size Limit
**Purpose**: Reject objects if any property exceeds the size threshold (in bytes).

```typescript
{
  objectType: 'CodeBlock',
  enabled: true,
  maxPropertySize: 50000  // 50KB limit
  // CodeBlocks with properties > 50KB will NOT be embedded
}
```

**How it works**:
- Serializes each property value to JSON
- Compares byte length against `maxPropertySize`
- Rejects if **any** property exceeds the limit

**Use Case**: Avoid embedding objects with massive data payloads (binary, large JSON structures).

### 5. Relevant Paths (Field Masking)
**Purpose**: Include only specified property fields in the embedding, excluding all others.

```typescript
{
  objectType: 'User',
  enabled: true,
  relevantPaths: ['/bio', '/skills', '/interests']
  // Only user.bio, user.skills, user.interests will be embedded
  // Fields like 'email', 'password', 'sessions' are excluded
}
```

**JSON Pointer Format**: RFC 6901 standard (`/field`, `/nested/field`, `/array/0`)

**Use Cases**:
- Privacy: Exclude PII or sensitive fields
- Relevance: Focus on descriptive/textual fields, ignore metadata
- Performance: Reduce embedding payload size

**How it works**:
- Evaluates each path against the object's properties
- Creates a filtered copy containing only matched fields
- Returns `filteredProperties` in evaluation result

## API Endpoints

All endpoints require authentication and project-scoped authorization.

### Create Policy

```http
POST /graph/embedding-policies
Content-Type: application/json
Authorization: Bearer <token>

{
  "projectId": "uuid",
  "objectType": "Document",
  "enabled": true,
  "maxPropertySize": 100000,
  "requiredLabels": ["reviewed"],
  "excludedLabels": ["draft"],
  "relevantPaths": ["/title", "/content", "/summary"]
}
```

**Response**: `201 Created`
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "objectType": "Document",
  "enabled": true,
  "maxPropertySize": 100000,
  "requiredLabels": ["reviewed"],
  "excludedLabels": ["draft"],
  "relevantPaths": ["/title", "/content", "/summary"],
  "createdAt": "2025-01-10T08:00:00Z",
  "updatedAt": "2025-01-10T08:00:00Z"
}
```

**Validation Rules**:
- `projectId` and `objectType` are required
- `maxPropertySize` must be positive (if provided)
- Duplicate `(projectId, objectType)` returns `500` (unique constraint violation)

### List Policies

```http
GET /graph/embedding-policies?project_id=<uuid>&object_type=<type>
Authorization: Bearer <token>
```

**Query Parameters**:
- `project_id` (required): Filter by project UUID
- `object_type` (optional): Filter by specific object type

**Response**: `200 OK`
```json
[
  {
    "id": "uuid",
    "projectId": "uuid",
    "objectType": "Document",
    "enabled": true,
    ...
  }
]
```

### Get Policy by ID

```http
GET /graph/embedding-policies/:id?project_id=<uuid>
Authorization: Bearer <token>
```

**Response**: `200 OK` (policy JSON) or `404 Not Found`

### Update Policy

```http
PATCH /graph/embedding-policies/:id?project_id=<uuid>
Content-Type: application/json
Authorization: Bearer <token>

{
  "enabled": false,
  "maxPropertySize": 50000,
  "requiredLabels": ["verified"]
}
```

**Response**: `200 OK` (updated policy) or `404 Not Found`

**Note**: Only provided fields are updated (partial update).

### Delete Policy

```http
DELETE /graph/embedding-policies/:id?project_id=<uuid>
Authorization: Bearer <token>
```

**Response**: `204 No Content` or `404 Not Found`

**Effect**: Reverts to permissive default (all objects of this type will be embedded).

## Policy Evaluation Logic

Located in `EmbeddingPolicyService.shouldEmbed()`:

```typescript
shouldEmbed(
  policies: EmbeddingPolicy[],
  objectType: string,
  labels: string[],
  properties: Record<string, any>
): { shouldEmbed: boolean; reason?: string; filteredProperties?: Record<string, any> }
```

**Evaluation Flow**:

1. **No Policies** → Return `{ shouldEmbed: true }` (permissive default)

2. **Find Matching Policy** by `objectType`
   - If no match → Return `{ shouldEmbed: true }` (no policy = allow)

3. **Check Enabled Flag**
   - If `!policy.enabled` → Return `{ shouldEmbed: false, reason: 'Policy disabled' }`

4. **Check Required Labels**
   - If any required label missing → Return `{ shouldEmbed: false, reason: 'Missing required labels' }`

5. **Check Excluded Labels**
   - If any excluded label present → Return `{ shouldEmbed: false, reason: 'Has excluded labels' }`

6. **Check Property Size Limit**
   - For each property: if `JSON.stringify(value).length > maxPropertySize`
   - If any exceeds → Return `{ shouldEmbed: false, reason: 'Property size exceeds limit' }`

7. **Apply Field Masking** (if `relevantPaths` specified)
   - Filter properties to only include paths in `relevantPaths`
   - Return `{ shouldEmbed: true, filteredProperties: <filtered> }`

8. **All Checks Pass** → Return `{ shouldEmbed: true }`

## Integration with Object Creation

In `GraphService.createObject()` (lines ~152-171):

```typescript
// After object is created and saved to database
if (this.embeddingPolicy && project_id) {
  const policies = await this.embeddingPolicy.findByProject(project_id);
  const evaluation = this.embeddingPolicy.shouldEmbed(
    policies,
    type,
    created.labels || [],
    created.properties || {}
  );

  if (evaluation.shouldEmbed) {
    // If filteredProperties exist, use those instead of full properties
    const embedProperties = evaluation.filteredProperties || created.properties;
    // Queue for embedding with potentially filtered properties
    await this.embeddingJobs?.enqueue(created.id);
  }
  // If !shouldEmbed, object is NOT queued (no embedding)
}
```

**Key Points**:
- Policy evaluation happens **after** database insert (object exists even if not embedded)
- Field masking affects only the embedding, not the stored object
- Embedding job receives the filtered properties if specified

## Use Case Examples

### Example 1: Embed Only Customer-Facing Documentation

```json
{
  "projectId": "uuid",
  "objectType": "Document",
  "enabled": true,
  "requiredLabels": ["customer-facing", "published"],
  "excludedLabels": ["internal", "deprecated"]
}
```

**Effect**: Only published, customer-facing documents without internal/deprecated labels are embedded.

### Example 2: Embed User Profiles Without PII

```json
{
  "projectId": "uuid",
  "objectType": "User",
  "enabled": true,
  "relevantPaths": ["/bio", "/skills", "/interests", "/publicProjects"]
}
```

**Effect**: User profiles are embedded, but sensitive fields (email, phone, address) are excluded.

### Example 3: Avoid Embedding Large Binary Objects

```json
{
  "projectId": "uuid",
  "objectType": "Attachment",
  "enabled": true,
  "maxPropertySize": 10000
}
```

**Effect**: Small text attachments are embedded; large binaries/files are skipped.

### Example 4: Temporarily Disable Embeddings for Testing

```json
{
  "projectId": "uuid",
  "objectType": "TestObject",
  "enabled": false
}
```

**Effect**: All TestObject instances are created but never queued for embedding.

## Testing

### Unit Tests
Located in `src/modules/graph/__tests__/embedding-policy.service.spec.ts`:
- **18 tests** covering all filter types and edge cases
- Focuses on `shouldEmbed()` evaluation logic
- 100% coverage of policy evaluation paths

**Run**: `npm test -- embedding-policy.service.spec.ts`

### E2E Tests
Located in `tests/e2e/graph.embedding-policies.e2e.spec.ts`:
- **27 tests** covering full API lifecycle
- Tests include:
  - CRUD operations (create, read, update, delete)
  - Policy enforcement during object creation
  - Policy updates affecting subsequent objects
  - Cross-project isolation
  - Edge cases and validation

**Run**: `npm run test:e2e -- graph.embedding-policies.e2e.spec.ts`

## Database Schema

```sql
CREATE TABLE kb.embedding_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    max_property_size INT DEFAULT 10000,
    required_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
    excluded_labels TEXT[] NOT NULL DEFAULT '{}'::text[],
    relevant_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, object_type)
);

CREATE INDEX idx_embedding_policies_project ON kb.embedding_policies(project_id);
```

**Constraints**:
- `project_id` FK to `kb.projects` with `ON DELETE CASCADE`
- `UNIQUE(project_id, object_type)` ensures one policy per type per project

## Migration Notes

- Table creation is **idempotent** (`CREATE TABLE IF NOT EXISTS`)
- Included in all schema paths:
  - Minimal initial path (first E2E bootstrap)
  - Minimal upgrade path (existing E2E databases)
  - Minimal re-upgrade path (schema version updates)
  - Full schema path (production deployments)
- E2E context waits for `kb.embedding_policies` table before running tests

## Performance Considerations

1. **Policy Lookup**: Single query per object creation: `SELECT * FROM kb.embedding_policies WHERE project_id = $1`
   - Indexed on `project_id` for fast lookup
   - Consider caching for high-throughput scenarios

2. **Filter Evaluation**: All filters run in-memory (no additional queries)
   - Property size checks serialize JSON (O(n) in property count)
   - Label checks are set operations (O(m) in label count)

3. **Field Masking**: Creates filtered copy of properties
   - Only applies if `relevantPaths` is non-empty
   - Does NOT modify stored object, only embedding payload

4. **Scaling**: Policies are project-scoped, not global
   - Each project has isolated policy set
   - No cross-project policy conflicts

## Security & Authorization

- **Project Scoping**: All API endpoints require `project_id` query parameter
- **RLS Integration**: Future enhancement to add Row-Level Security policies
- **Field Masking**: Prevents sensitive data from being embedded (but object still stored)

## Future Enhancements

1. **Global Default Policies**: Apply policies at org level for all projects
2. **Regex Object Type Matching**: `objectType: "Document.*"` to match multiple types
3. **Dynamic Property Size Limits**: Calculate size based on token count, not bytes
4. **Policy Audit Logs**: Track who changed policies and when
5. **Embedding Queue Integration**: Pass `filteredProperties` to embedding worker
6. **Policy Versioning**: Track historical policy changes
7. **Batch Policy Operations**: Update multiple policies in one request

## Troubleshooting

### Policies Not Taking Effect
- **Check**: Are policies created in the correct project?
- **Check**: Is `enabled: true`?
- **Check**: Run `GET /graph/embedding-policies?project_id=<uuid>` to list all policies

### Unexpected Objects Not Embedded
- **Check**: Does object have all `requiredLabels`?
- **Check**: Does object have any `excludedLabels`?
- **Check**: Are property sizes within `maxPropertySize`?
- **Debug**: Add logging to `GraphService.createObject()` to see evaluation results

### Duplicate Policy Error (500)
- **Cause**: Attempting to create a second policy for `(projectId, objectType)` pair
- **Solution**: Update existing policy using `PATCH /graph/embedding-policies/:id`

## Related Documentation

- [Graph Phase 3 Roadmap](../../docs/spec/GRAPH_PHASE3_ROADMAP.md) - Priority #2: Policy-Driven Selective Embedding
- [Embedding Jobs](./EMBEDDING_JOBS.md) - Queue system for processing embeddings
- [Graph Objects API](./GRAPH_OBJECTS.md) - Object creation and management

## References

- **RFC 6901**: JSON Pointer specification (https://tools.ietf.org/html/rfc6901)
- **NestJS Validation**: Class-validator decorators (https://docs.nestjs.com/techniques/validation)
