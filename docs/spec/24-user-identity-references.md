# User Identity Reference Pattern

**Status**: Authoritative Pattern  
**Last Updated**: 2025-10-05  
**Related**: [User Profile System](./16-user-profile.md), [Authorization Model](./18-authorization-model.md)

## Overview

This document defines the **canonical pattern** for referencing users in the database. All tables that need to reference a user MUST follow this pattern to ensure referential integrity, auth provider independence, and architectural consistency.

## Core Principle

**The `subject_id` UUID is the canonical internal identifier for users.** External authentication provider IDs (e.g., Zitadel sub claims) are **never** stored permanently in business tables.

## Authentication Flow

### 1. JWT Processing

When a JWT arrives from the authentication provider:

```typescript
// apps/server/src/modules/auth/auth.service.ts
private mapClaims(payload: JWTPayload): AuthUser | null {
    if (!payload.sub) return null;
    const rawSub = String(payload.sub);
    
    // Check if already a UUID
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawSub);
    
    // Convert external ID to UUID deterministically
    const normalizedSub = isUuid ? rawSub : toUuid(rawSub);
    
    return { sub: normalizedSub, email: payload.email, scopes: payload.scopes };
}
```

**Example**: External Zitadel ID `"335517149097361411"` becomes UUID `"a28e2dc2-e8d5-5cbf-b4c5-7336ba10a1a7"` (SHA-1 hash-based UUID v5)

### 2. User Profile Ensuring

Before any operation, services ensure the user profile exists:

```typescript
// Auto-ensure pattern (idempotent)
await db.query(
    `INSERT INTO core.user_profiles(subject_id) 
     VALUES($1) 
     ON CONFLICT (subject_id) DO NOTHING`,
    [userId]  // userId is already the normalized UUID
);
```

### 3. Request Context

Throughout the application:
- `req.user.sub` contains the **normalized UUID**, not the external ID
- Controllers use `@CurrentUser()` decorator to access this UUID
- Services receive `subject_id` as UUID parameters

## Database Schema Pattern

### ✅ CORRECT Pattern

```sql
-- Example: Extraction jobs table
CREATE TABLE kb.object_extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    
    -- ✅ CORRECT: Use subject_id UUID with foreign key
    subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL,
    
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for query performance
CREATE INDEX idx_extraction_jobs_subject_id 
ON kb.object_extraction_jobs(subject_id) 
WHERE subject_id IS NOT NULL;
```

### ❌ WRONG Pattern

```sql
-- ❌ WRONG: Using TEXT without foreign key
CREATE TABLE kb.some_table (
    id UUID PRIMARY KEY,
    user_id TEXT,  -- ❌ No type safety, no referential integrity
    created_by TEXT  -- ❌ Coupled to external auth provider
);
```

## Naming Conventions

### Primary Pattern: `subject_id`

Use `subject_id` for the primary user reference:

```sql
subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE {ACTION}
```

### Semantic Variants

When the role is contextually specific, use semantic prefixes:

- `owner_subject_id` - For ownership (e.g., chat conversations)
- `creator_subject_id` - For creation tracking
- `assignee_subject_id` - For task assignment

**Never use**: `user_id`, `created_by`, `owner_id` (without `_subject_id` suffix)

## DELETE Actions

Choose the appropriate cascade action based on business logic:

| Action | Use Case | Example |
|--------|----------|---------|
| `ON DELETE CASCADE` | User departure should remove data | `organization_memberships`, `project_memberships` |
| `ON DELETE SET NULL` | Preserve record, remove user reference | `extraction_jobs`, `audit_log` (preserve for compliance) |
| `ON DELETE RESTRICT` | Prevent user deletion if referenced | Payment records, legal documents |

## Current System Audit (2025-10-05)

### ✅ Correctly Implemented

| Table | Column | FK Constraint | Status |
|-------|--------|---------------|--------|
| `core.user_profiles` | `subject_id` | PRIMARY KEY | ✅ Source of truth |
| `kb.organization_memberships` | `subject_id` | → `user_profiles(subject_id)` CASCADE | ✅ Correct |
| `kb.project_memberships` | `subject_id` | → `user_profiles(subject_id)` CASCADE | ✅ Correct |
| `kb.chat_conversations` | `owner_subject_id` | → `user_profiles(subject_id)` SET NULL | ✅ Correct |
| `kb.object_extraction_jobs` | `subject_id` | → `user_profiles(subject_id)` SET NULL | ✅ Fixed (Migration 007) |

### ⚠️ Needs Migration

| Table | Column | Current Type | Issue | Priority |
|-------|--------|--------------|-------|----------|
| `kb.notifications` | `user_id` | TEXT | No FK, stores external IDs | HIGH |
| `kb.user_notification_preferences` | `user_id` | TEXT | No FK, stores external IDs | HIGH |
| `kb.audit_log` | `user_id` | UUID | Missing FK (optional for audit) | LOW |

### Audit Log Exception

The `kb.audit_log.user_id` UUID currently has no FK constraint. This is **acceptable** for audit tables because:
1. Audit logs must be immutable for compliance
2. We want to preserve audit history even after user deletion
3. `user_email` is also stored for human readability

However, consider adding FK with `ON DELETE SET NULL` if you want referential integrity checking.

## Migration Guide

### Step 1: Add New Column

```sql
ALTER TABLE kb.{table_name}
ADD COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE {ACTION};
```

### Step 2: Data Migration Decision

**Option A**: Cannot migrate (recommended for most cases)
```sql
-- Set to NULL (historical data loses user reference)
UPDATE kb.{table_name} SET subject_id = NULL WHERE {old_column} IS NOT NULL;
```

**Option B**: Attempt migration (only if external IDs are still valid)
```sql
-- Only if you have a mapping table or can query auth provider
-- Usually not feasible
```

### Step 3: Drop Old Column

```sql
ALTER TABLE kb.{table_name} DROP COLUMN {old_column};
```

### Step 4: Add Index

```sql
CREATE INDEX idx_{table}_subject_id 
ON kb.{table_name}(subject_id) 
WHERE subject_id IS NOT NULL;
```

### Step 5: Update Application Code

**DTOs:**
```typescript
export class CreateRecordDto {
    // ❌ OLD
    // created_by?: string;
    
    // ✅ NEW
    @IsOptional()
    @IsUUID()
    subject_id?: string;
}
```

**Services:**
```typescript
// ✅ CORRECT: Use req.user.sub (already a UUID)
async createRecord(dto: CreateRecordDto, userId: string) {
    await this.db.query(
        `INSERT INTO kb.records (subject_id, ...) VALUES ($1, ...)`,
        [userId, ...]  // userId from @CurrentUser() is already UUID
    );
}
```

**Frontend:**
```typescript
// ✅ CORRECT: user?.sub is already the canonical UUID
await apiClient.createRecord({
    subject_id: user?.sub,  // Already normalized by auth system
    // ... other fields
});
```

## Benefits of This Pattern

### 1. Auth Provider Independence

```
❌ Problem: External IDs (Zitadel)
External ID: "335517149097361411" stored directly
→ Changing auth provider breaks all historical references

✅ Solution: Internal UUIDs
External ID: "335517149097361411" → UUID: "a28e2dc2-e8d5-..."
→ Auth provider can change, UUIDs remain stable
```

### 2. Referential Integrity

```sql
-- PostgreSQL enforces relationships
DELETE FROM core.user_profiles WHERE subject_id = '...';
-- Automatically cascades/sets null in related tables
```

### 3. Query Performance

```sql
-- Indexed foreign keys enable efficient joins
SELECT j.*, u.display_name, u.avatar_url
FROM kb.object_extraction_jobs j
LEFT JOIN core.user_profiles u ON j.subject_id = u.subject_id
WHERE j.project_id = $1;
```

### 4. Type Safety

```typescript
// UUID validation at DTO level
@IsUUID()
subject_id?: string;

// vs TEXT (any string accepted)
@IsString()
created_by?: string;  // ❌ No validation
```

## Code Examples

### Controller Pattern

```typescript
@Controller('admin/records')
export class RecordsController {
    @Post()
    async createRecord(
        @Body() dto: CreateRecordDto,
        @CurrentUser() user: AuthUser  // user.sub is UUID
    ): Promise<RecordDto> {
        // Pass the canonical UUID to service
        return this.service.createRecord({
            ...dto,
            subject_id: user.sub  // ✅ Already normalized
        });
    }
}
```

### Service Pattern

```typescript
@Injectable()
export class RecordsService {
    async createRecord(dto: CreateRecordDto): Promise<RecordDto> {
        // Ensure user profile exists (idempotent)
        if (dto.subject_id) {
            await this.db.query(
                `INSERT INTO core.user_profiles(subject_id) 
                 VALUES($1) ON CONFLICT DO NOTHING`,
                [dto.subject_id]
            );
        }
        
        // Create record with FK-validated subject_id
        const result = await this.db.query<RecordDto>(
            `INSERT INTO kb.records (subject_id, ...) 
             VALUES ($1, ...) RETURNING *`,
            [dto.subject_id || null, ...]
        );
        
        return result.rows[0];
    }
}
```

### Notification Pattern

```typescript
async notifyUser(params: {
    subject_id: string;  // ✅ Use canonical UUID
    title: string;
    message: string;
}) {
    await this.db.query(
        `INSERT INTO kb.notifications (
            subject_id,  -- ✅ FK to user_profiles
            title, 
            message
        ) VALUES ($1, $2, $3)`,
        [params.subject_id, params.title, params.message]
    );
}
```

## Testing Considerations

### Unit Tests

```typescript
const mockUserId = 'a28e2dc2-e8d5-5cbf-b4c5-7336ba10a1a7';  // UUID

it('should create record with user reference', async () => {
    const dto = {
        subject_id: mockUserId,  // ✅ Use UUID in tests
        // ... other fields
    };
    
    const result = await service.createRecord(dto);
    expect(result.subject_id).toBe(mockUserId);
});
```

### E2E Tests

```typescript
// Playwright tests use mock auth with UUID tokens
test.use({
    extraHTTPHeaders: {
        'Authorization': 'Bearer e2e-user-1'  // Maps to UUID internally
    }
});
```

## Migration Checklist for New Tables

When creating a new table that references users:

- [ ] Use `subject_id UUID` (not `user_id TEXT`, not `created_by TEXT`)
- [ ] Add foreign key: `REFERENCES core.user_profiles(subject_id)`
- [ ] Choose appropriate cascade action (CASCADE, SET NULL, RESTRICT)
- [ ] Create index: `CREATE INDEX ... ON table(subject_id)`
- [ ] Add comment: `COMMENT ON COLUMN ... IS 'Canonical internal user ID'`
- [ ] Update DTO with `@IsUUID()` validation
- [ ] Pass `user.sub` from controller (already normalized)
- [ ] Add auto-ensure pattern if needed
- [ ] Write unit tests with UUID mocks
- [ ] Update API documentation

## Future Migrations

Priority migration queue:

### High Priority
1. **`kb.notifications.user_id TEXT` → `subject_id UUID`**
   - Impact: Notification system breaks with auth provider change
   - Risk: High (active feature)
   - Effort: Medium (code + migration)

2. **`kb.user_notification_preferences.user_id TEXT` → `subject_id UUID`**
   - Impact: Preferences tied to external IDs
   - Risk: High (would lose all user preferences)
   - Effort: Low (less code surface)

### Low Priority
3. **`kb.audit_log.user_id UUID` - Add FK**
   - Impact: Better data integrity
   - Risk: Low (optional for audit logs)
   - Effort: Low (schema only)

## References

- [User Profile Spec](./16-user-profile.md) - User profile system design
- [Authorization Model](./18-authorization-model.md) - Permission system
- [Migration 007](../docs/migrations/007-extraction-jobs-foreign-key.md) - Extraction jobs fix
- [Auth Service](../apps/server/src/modules/auth/auth.service.ts) - JWT claim mapping

## Questions & Answers

**Q: Why not store external IDs for debugging?**  
A: You can store them temporarily in `user_profiles` or logs, but business tables should only reference `subject_id`.

**Q: What if I need to query by external ID?**  
A: Look up `subject_id` from `user_profiles` first, then query business tables.

**Q: Can I use `user_id` instead of `subject_id`?**  
A: No. Use `subject_id` for consistency. Only exception: `audit_log.user_id` (established convention).

**Q: Should I add FKs to audit tables?**  
A: Optional. Consider `ON DELETE SET NULL` if you want integrity checking without preventing user deletion.

**Q: What about performance with many JOINs?**  
A: Indexed FKs are highly efficient. Profile data is in a separate `core` schema; only JOIN when needed.
