# Design: Recent Items Page

## Context

Users need a centralized location to quickly access recently viewed or edited documents and objects. The current workflow requires manual navigation through paginated lists to find items they were working on.

**Stakeholders:**

- End users who work across multiple documents and objects
- Development team implementing the feature
- Product team defining UX requirements

**Constraints:**

- Must persist server-side (not localStorage) for cross-device access
- Must be user-specific (privacy)
- Must be performant with minimal overhead on existing operations
- Frontend uses React 19 with Tailwind CSS and DaisyUI
- Backend uses NestJS with TypeORM and PostgreSQL

## Goals / Non-Goals

### Goals

- Provide quick access to last 10 documents and 10 objects per user
- Show human-friendly relative timestamps ("2 hours ago", "yesterday")
- Indicate action type (viewed vs edited)
- Persist across sessions and devices
- Minimal impact on existing document/object operations

### Non-Goals

- Full audit logging (this is for quick access, not compliance)
- Activity analytics or dashboards
- Tracking chat conversations (future scope)
- "Clear history" functionality (future scope)
- Activity notifications

## Decisions

### Decision 1: Separate Activity Tracking Table

**What:** Create a dedicated `kb.user_recent_items` table rather than extending `user_profiles` with a JSONB column.

**Why:**

- Cleaner separation of concerns
- Easier to query, index, and paginate
- Supports future extension (activity types, metadata)
- Avoids bloating the user profile with potentially large activity arrays

**Alternatives considered:**

1. JSONB array on `user_profiles` - simpler but limits query flexibility and can grow unbounded
2. Event sourcing pattern - overkill for this use case
3. Redis cache - fast but requires additional infrastructure and persistence strategy

### Decision 2: Fire-and-Forget Activity Recording

**What:** Record activity asynchronously without blocking the main request.

**Why:**

- Activity tracking must not impact document/object operation latency
- Users should not perceive any slowdown when viewing/editing items

**Implementation:** Use `setImmediate` or a lightweight queue to defer the database write.

### Decision 3: Project-Scoped Activity

**What:** Activity is scoped to `(user_id, project_id)`, showing only items from the current project.

**Why:**

- Users work within project context
- Prevents confusion when switching projects
- Matches existing navigation patterns

**Alternative:** Global activity across all projects with project filter - deferred to future iteration.

### Decision 4: Unified Resource Type Column

**What:** Use a single `resource_type` enum column ('document', 'object') rather than separate tables.

**Why:**

- Simpler schema
- Single query to fetch recent items
- Easier to add new resource types (conversations, etc.)

### Decision 5: Native Relative Time Formatting

**What:** Use `Intl.RelativeTimeFormat` API for human-friendly timestamps.

**Why:**

- Zero additional dependencies
- Browser support is universal for our target audience
- Handles localization automatically

**Format rules:**

- < 1 minute: "just now"
- < 1 hour: "X minutes ago"
- < 24 hours: "X hours ago"
- < 48 hours: "yesterday"
- < 7 days: "X days ago"
- Otherwise: Formatted date (e.g., "Nov 25, 2024")

### Decision 6: Limited Retention with Auto-Pruning

**What:** Keep maximum 100 items per user per project, auto-prune oldest on insert.

**Why:**

- Prevents unbounded table growth
- Recent items beyond 100 have diminishing value
- Can be implemented with simple ON INSERT trigger or application logic

## Data Model

### Entity: UserRecentItem

```typescript
@Entity({ schema: 'kb', name: 'user_recent_items' })
@Index(['userId', 'projectId', 'accessedAt'])
@Index(['userId', 'projectId', 'resourceType', 'resourceId'], { unique: true })
export class UserRecentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string; // zitadel_user_id

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType: 'document' | 'object';

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ name: 'resource_name', type: 'text', nullable: true })
  resourceName: string | null; // Denormalized for display

  @Column({ name: 'resource_subtype', type: 'text', nullable: true })
  resourceSubtype: string | null; // e.g., object type like "Requirement"

  @Column({ name: 'action_type', type: 'varchar', length: 20 })
  actionType: 'viewed' | 'edited';

  @Column({ name: 'accessed_at', type: 'timestamptz' })
  accessedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
```

### API Endpoints

```
POST /user-activity/record
  Body: { resourceType, resourceId, actionType }
  Response: 204 No Content

GET /user-activity/recent?resourceType=document&limit=10
  Response: { items: UserRecentItem[] }

GET /user-activity/recent?limit=20
  Response: { items: UserRecentItem[] } (mixed documents and objects)
```

## Risks / Trade-offs

### Risk 1: Stale Resource Names

**Risk:** If a document filename or object name changes, the denormalized `resource_name` becomes stale.
**Mitigation:** Accept staleness for simplicity. The link (resource_id) is authoritative. Name is cosmetic and will be correct next time item is accessed.

### Risk 2: Orphaned Activity Records

**Risk:** If a document/object is deleted, activity records remain.
**Mitigation:**

- Records naturally expire via retention limit
- On 404 when clicking recent item, show graceful "Item no longer exists" message
- Optional: Add ON DELETE CASCADE to foreign key (requires careful migration)

### Risk 3: Performance Under Load

**Risk:** Frequent activity writes could impact database.
**Mitigation:**

- Use UPSERT to avoid duplicate records
- Write is fire-and-forget (async)
- Index on (user_id, project_id, accessed_at) for fast queries
- Consider batching writes in future if needed

## Frontend Components

### RecentItemsPage

- Location: `apps/admin/src/pages/admin/recent/index.tsx`
- Two separate DataTable instances with type-specific columns
- Fixed at 10 items per table (no pagination needed, no infinite scroll)
- Clicking row navigates to document detail or opens object modal

### Recent Objects Table (displayed first)

Columns mirror the existing Objects page (`/admin/objects`) with activity context:

| Column        | Description                                           |
| ------------- | ----------------------------------------------------- |
| Name          | Object name (from properties.name or key)             |
| Type          | Object type (e.g., "Requirement", "Decision")         |
| Status        | Object status badge (accepted, draft, etc.)           |
| Relationships | Count of relationships                                |
| Last Accessed | Relative time + action badge ("2 hours ago · edited") |

### Recent Documents Table (displayed second)

Columns mirror the existing Documents page (`/admin/apps/documents`) with activity context:

| Column        | Description                                         |
| ------------- | --------------------------------------------------- |
| Name          | Filename or source URL                              |
| Type          | MIME type or file extension                         |
| Chunks        | Number of chunks                                    |
| Extraction    | Extraction status (if applicable)                   |
| Last Accessed | Relative time + action badge ("yesterday · viewed") |

### "Last Accessed" Column Format

The Last Accessed column combines two pieces of information:

- **Relative time**: "2 hours ago", "yesterday", "Nov 25"
- **Action badge**: Small pill/badge showing "viewed" or "edited"

Example display: `2 hours ago` with a small `edited` badge next to it

### Relative Time Utility

- Location: `apps/admin/src/lib/format-relative-time.ts`
- Function: `formatRelativeTime(date: Date | string): string`
- Uses `Intl.RelativeTimeFormat` with fallback to absolute date

## Migration Plan

1. Create migration for `kb.user_recent_items` table
2. Deploy backend with new endpoints (no recording yet)
3. Deploy frontend page (empty state)
4. Add recording calls to document/object controllers
5. Monitor for performance issues

**Rollback:** If issues arise, simply stop recording. Table can be dropped without affecting core functionality.

## Open Questions

1. **Trigger points:** Should we track when user lands on the list page, or only when they open detail/modal?

   - **Proposed:** Only detail/modal opens (more intentional)

2. **Object status filter:** Should activity be tracked for all objects or only accepted ones?
   - **Proposed:** All objects initially, can add filter later
