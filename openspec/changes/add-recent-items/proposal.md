# Change: Add Recent Items Page

## Why

Users currently have no quick way to resume work on items they recently accessed. When switching between tasks or returning after a break, users must manually navigate through the Documents and Objects pages to find what they were working on. This friction reduces productivity and makes the system feel less responsive to user workflows.

## What Changes

### New Capability: User Activity Tracking

- **Backend:** New `user_recent_items` table in `kb` schema to persist recently accessed items per user
- **Backend:** API endpoints to record views/edits and retrieve recent items
- **Frontend:** New `/admin/recent` page with two dedicated tables:
  - **Recent Objects table** (first, top of page) - last 10 objects with columns similar to Objects page plus activity context
  - **Recent Documents table** (second, below) - last 10 documents with columns similar to Documents page plus activity context
- **Frontend:** Human-friendly relative timestamps ("2 hours ago", "yesterday", etc.)
- **UX:** Each table has type-specific columns matching existing pages, extended with "Last Accessed" column showing relative time and action type (viewed/edited)

### Activity Types Tracked

- **document_viewed** - User opened a document detail/preview
- **document_edited** - User modified a document (upload, metadata change)
- **object_viewed** - User opened an object detail modal
- **object_edited** - User modified an object (property changes, status updates)

### User-Specific Persistence

- Activity stored server-side (not localStorage) for cross-device consistency
- Scoped to user (zitadel_user_id) for privacy
- Optionally scoped to project for multi-project awareness

## Impact

### Affected Code

- **Backend:**

  - New entity: `src/entities/user-recent-item.entity.ts`
  - New service: `src/modules/user-activity/user-activity.service.ts`
  - New controller: `src/modules/user-activity/user-activity.controller.ts`
  - New migration: Create `kb.user_recent_items` table
  - Modify: Document and Graph controllers to record activity

- **Frontend:**
  - New page: `src/pages/admin/recent/index.tsx`
  - New API client: `src/api/user-activity.ts`
  - New utility: Relative time formatting function
  - Modify: Router to add `/admin/recent` route
  - Modify: Sidebar navigation to include Recent Items link

### New Dependencies

- None required (relative time formatting can be done with vanilla JS `Intl.RelativeTimeFormat`)

### Performance Considerations

- Activity recording must be lightweight (fire-and-forget, no blocking)
- Recent items query is per-user with LIMIT 10, no performance concerns
- Consider adding index on `(user_id, project_id, accessed_at DESC)`

### Breaking Changes

- None

## Open Questions

1. Should activity tracking be project-scoped or global across all projects?

   - **Proposed:** Project-scoped (show recent items from current project only)

2. Should we track conversations/chat sessions as well?

   - **Proposed:** Not in initial scope, can be added later

3. What is the retention policy for activity records?

   - **Proposed:** Keep last 100 items per user per project, auto-prune older entries

4. Should there be a "clear history" option for privacy?
   - **Proposed:** Not in initial scope, can be added later
