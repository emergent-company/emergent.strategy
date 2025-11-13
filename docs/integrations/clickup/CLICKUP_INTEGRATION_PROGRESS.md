# ClickUp Integration - Implementation Progress

**Last Updated:** October 5, 2025

## Overview

This document tracks the implementation progress of the ClickUp integration feature, which allows users to connect their ClickUp workspace and sync tasks, lists, folders, and spaces into the knowledge base.

## Architecture

The integration follows a **plugin architecture** with:
- **Backend:** NestJS modules with abstract base classes
- **Frontend:** React + TypeScript UI components
- **Database:** PostgreSQL with source tracking metadata
- **API:** RESTful endpoints for CRUD and sync operations

## Implementation Status

### ✅ Completed (Tasks 1-3)

#### 1. Database Schema & Migrations

**Files Created:**
- `apps/server/migrations/0003_integrations_system.sql` - Integration tables
- `apps/server/migrations/0004_integration_source_tracking.sql` - Source tracking metadata

**Tables:**
- `kb.integrations` - Integration configuration and credentials (with pgcrypto encryption)
- `kb.clickup_sync_state` - ClickUp-specific sync state tracking
- `kb.graph_objects` enhanced with:
  - `external_source` - Integration name (e.g., "clickup")
  - `external_id` - Source system's unique ID
  - `external_url` - Direct link to source object
  - `external_parent_id` - Parent object's external ID
  - `synced_at` - Last sync timestamp
  - `external_updated_at` - Source modification time

**Benefits:**
- ✅ Deduplication via unique constraint on `(external_source, external_id)`
- ✅ Deep linking to ClickUp objects
- ✅ Bidirectional sync readiness
- ✅ Audit trail and traceability

**Documentation:** `docs/INTEGRATION_SOURCE_TRACKING.md`

---

#### 2. Backend Infrastructure

**Base Integration System:**

File: `apps/server/src/modules/integrations/`
- `integrations.module.ts` - Module registration
- `integrations.controller.ts` - REST API endpoints
- `integrations.service.ts` - Business logic
- `base-integration.ts` - Abstract base class with lifecycle methods
- `integration-registry.service.ts` - Plugin discovery and registration
- `encryption.service.ts` - Settings encryption/decryption

**API Endpoints:**
```typescript
GET    /api/v1/integrations/available      // List integration types
GET    /api/v1/integrations                // List configured instances
GET    /api/v1/integrations/:name          // Get specific integration
POST   /api/v1/integrations                // Create integration
PUT    /api/v1/integrations/:name          // Update integration
DELETE /api/v1/integrations/:name          // Delete integration
POST   /api/v1/integrations/:name/test     // Test connection
POST   /api/v1/integrations/:name/sync     // Trigger sync
```

**ClickUp Integration:**

File: `apps/server/src/modules/clickup/`
- `clickup.module.ts` - Module registration
- `clickup.integration.ts` - Integration implementation
- `clickup-api.client.ts` - ClickUp API v2 client with rate limiting
- `clickup-import.service.ts` - Import orchestration
- `clickup-data-mapper.service.ts` - Entity mapping to internal format
- `clickup.types.ts` - TypeScript type definitions

**Features:**
- ✅ Rate limiting (100 req/min per ClickUp API limits)
- ✅ Hierarchical import (Workspace → Spaces → Folders → Lists → Tasks)
- ✅ Source tracking metadata population
- ✅ URL construction for deep linking
- ✅ Webhook support (structure ready, handlers pending)
- ✅ Error handling and retry logic

**Tests:** 10/10 backend tests passing

---

#### 3. Frontend Integration Gallery UI

**Main Page:**

File: `apps/admin/src/pages/admin/pages/integrations/index.tsx`

Features:
- ✅ Grid layout displaying available integrations
- ✅ Load configured integrations for current project
- ✅ Show integration status (enabled/disabled, last sync)
- ✅ Error handling with dismissible alerts
- ✅ Loading states
- ✅ Empty state when no integrations available

**Integration Card Component:**

File: `apps/admin/src/pages/admin/pages/integrations/IntegrationCard.tsx`

Features:
- ✅ Integration icon and display name
- ✅ Status badge (Active/Disabled)
- ✅ Capability badges (Import, Webhooks, Bi-directional, Incremental)
- ✅ Last sync timestamp and status
- ✅ Error message display
- ✅ Actions: Connect/Configure, Enable/Disable, Delete

**Configuration Modal:**

File: `apps/admin/src/pages/admin/pages/integrations/ConfigureIntegrationModal.tsx`

Features:
- ✅ Dynamic form based on integration's required/optional settings
- ✅ Field type detection (text, password, number, boolean)
- ✅ Settings validation (required fields)
- ✅ Test connection button (for configured integrations)
- ✅ Save/Update functionality
- ✅ Loading and error states

**Navigation:**
- ✅ Added to sidebar under Settings section
- ✅ Route registered at `/admin/integrations`
- ✅ Icon: `lucide--plug`

**API Client:**

File: `apps/admin/src/api/integrations.ts`
- ✅ Fully typed TypeScript client
- ✅ All CRUD operations
- ✅ Test connection method
- ✅ Trigger sync method

---

### ⏳ In Progress / Next Tasks (Tasks 4-7)

#### 4. ClickUp Sync UI with List Selection (NOT STARTED)

**Goal:** Build user interface for triggering selective ClickUp imports

**Requirements from Spec (22-clickup-integration.md):**

1. **Sync Button**
   - Opens modal with hierarchical tree
   - Located in configured integration card/detail view

2. **List Selection Modal**
   - Tree structure: Workspace → Spaces → Folders → Lists
   - Expandable/collapsible spaces and folders
   - Checkboxes for each list (selectable)
   - Tri-state parent checkboxes (all/none/some children selected)
   - "Select All" and "Deselect All" buttons

3. **Import Configuration Form**
   - "Include completed tasks" checkbox
   - "Batch size" number input (10-1000, default 100)
   - "Run in background" toggle

4. **Progress Tracking**
   - Overall progress bar
   - Current item being processed
   - Items imported count
   - Estimated time remaining

**Implementation Plan:**
```tsx
// Component structure
<ClickUpSyncModal>
  <WorkspaceTree>           // Hierarchical tree component
    <SpaceNode>              // Expandable space
      <FolderNode>            // Expandable folder
        <ListCheckbox />      // Selectable list
      </FolderNode>
      <ListCheckbox />        // Folderless lists
    </SpaceNode>
  </WorkspaceTree>
  <ImportConfigForm>        // Configuration options
    <Checkbox> Include completed
    <NumberInput> Batch size
    <Toggle> Run in background
  </ImportConfigForm>
  <ProgressPanel>           // During sync
    <ProgressBar />
    <StatusText />
    <ImportCounts />
  </ProgressPanel>
</ClickUpSyncModal>
```

**Files to Create:**
- `apps/admin/src/pages/admin/pages/integrations/clickup/ClickUpSyncModal.tsx`
- `apps/admin/src/pages/admin/pages/integrations/clickup/WorkspaceTree.tsx`
- `apps/admin/src/pages/admin/pages/integrations/clickup/ImportProgress.tsx`

---

#### 5. Backend: Workspace Structure Endpoint (NOT STARTED)

**Goal:** Provide API endpoint to fetch ClickUp workspace structure

**Endpoint:**
```typescript
GET /api/v1/integrations/clickup/structure
Query params: org_id, project_id
Response: {
  workspace: {
    id: string;
    name: string;
    spaces: Array<{
      id: string;
      name: string;
      folders: Array<{
        id: string;
        name: string;
        lists: Array<{
          id: string;
          name: string;
          task_count: number;
        }>;
      }>;
      lists: Array<{        // Folderless lists
        id: string;
        name: string;
        task_count: number;
      }>;
    }>;
  };
}
```

**Implementation:**
1. Add endpoint to `clickup.integration.ts`
2. Implement in `clickup-import.service.ts`:
   - Fetch all spaces
   - For each space, fetch folders and lists
   - Aggregate into hierarchical structure
   - Cache result (optional, for performance)

**Files to Modify:**
- `apps/server/src/modules/clickup/clickup.integration.ts`
- `apps/server/src/modules/clickup/clickup-import.service.ts`
- `apps/admin/src/api/integrations.ts` (add client method)

---

#### 6. Backend: Selective Import (NOT STARTED)

**Goal:** Modify sync endpoint to accept list IDs for selective import

**Current Endpoint:**
```typescript
POST /api/v1/integrations/:name/sync
Body: ImportConfig {
  includeArchived?: boolean;
  batchSize?: number;
  background?: boolean;
  resourceTypes?: string[];
  dateRange?: { start?: Date; end?: Date };
}
```

**Enhanced Endpoint:**
```typescript
POST /api/v1/integrations/clickup/sync
Body: {
  list_ids: string[];              // NEW: Array of ClickUp list IDs
  include_completed: boolean;      // Import completed tasks
  batch_size: number;              // Tasks per batch (10-1000)
  background: boolean;             // Run as background job
}
Response: {
  job_id?: string;                 // If background=true
  success: boolean;
  message: string;
  total_lists: number;
  estimated_tasks: number;
}
```

**Implementation Changes:**
1. Update `ImportConfig` interface in `base-integration.ts`
2. Modify `ClickUpImportService.runFullImport()`:
   - Accept `list_ids` parameter
   - Skip space/folder traversal
   - Fetch only specified lists
   - Import tasks from selected lists only

**Files to Modify:**
- `apps/server/src/modules/integrations/base-integration.ts`
- `apps/server/src/modules/clickup/clickup-import.service.ts`
- `apps/server/src/modules/clickup/clickup.integration.ts`

---

#### 7. Testing & Documentation (NOT STARTED)

**E2E Tests (Playwright):**
- [ ] Integration gallery page loads
- [ ] Can configure ClickUp integration
- [ ] Settings validation works
- [ ] Can enable/disable integration
- [ ] Can delete integration
- [ ] Sync modal opens with tree structure
- [ ] Can select/deselect lists
- [ ] Sync triggers successfully

**Unit Tests (Vitest):**
- [ ] IntegrationsClient methods
- [ ] Integration card rendering
- [ ] Configuration modal validation
- [ ] Tree selection logic
- [ ] URL construction helpers

**API Documentation:**
- [ ] OpenAPI/Swagger specs for all endpoints
- [ ] Request/response examples
- [ ] Error codes and messages
- [ ] Rate limiting details

**User Documentation:**
- [ ] README update with ClickUp setup steps
- [ ] How to generate ClickUp API token
- [ ] Workspace ID location
- [ ] Webhook configuration guide
- [ ] Troubleshooting common issues

---

## Current State Summary

### What Works Now

✅ **Backend Infrastructure**
- Integration registry and plugin system
- ClickUp API client with rate limiting
- Full workspace import (all spaces/folders/lists/tasks)
- Source tracking metadata persisted
- Encryption for sensitive settings

✅ **Frontend UI**
- Integration gallery with grid layout
- Integration cards with status
- Configuration modal with dynamic forms
- Enable/disable/delete operations
- Sidebar navigation

✅ **Database**
- Integration tables with encryption
- Source tracking fields on graph objects
- Indexes for performance
- Helper functions for upsert

### What's Missing

⏳ **User-Initiated Sync**
- No UI button to trigger sync yet
- Need list selection modal
- Need progress tracking UI

⏳ **Selective Import**
- Currently imports entire workspace
- Need workspace structure endpoint
- Need list selection backend logic

⏳ **Testing**
- No E2E tests yet
- No unit tests for new components
- API docs incomplete

---

## File Inventory

### Backend Files

**Integrations Module:**
```
apps/server/src/modules/integrations/
├── integrations.module.ts              ✅ Complete
├── integrations.controller.ts          ✅ Complete (8 endpoints)
├── integrations.service.ts             ✅ Complete
├── base-integration.ts                 ✅ Complete (abstract class)
├── integration-registry.service.ts     ✅ Complete
├── encryption.service.ts               ✅ Complete (pgcrypto)
└── dto/
    ├── create-integration.dto.ts       ✅ Complete
    └── update-integration.dto.ts       ✅ Complete
```

**ClickUp Module:**
```
apps/server/src/modules/clickup/
├── clickup.module.ts                   ✅ Complete
├── clickup.integration.ts              ✅ Complete
├── clickup-api.client.ts               ✅ Complete
├── clickup-import.service.ts           ✅ Complete (needs selective import)
├── clickup-data-mapper.service.ts      ✅ Complete (with source tracking)
├── clickup-webhook.service.ts          ⏳ Structure only
├── clickup-rate-limiter.service.ts     ✅ Complete
└── clickup.types.ts                    ✅ Complete
```

**Migrations:**
```
apps/server/migrations/
├── 0003_integrations_system.sql        ✅ Applied
└── 0004_integration_source_tracking.sql ✅ Applied
```

**Graph Types:**
```
apps/server/src/modules/graph/
└── graph.types.ts                      ✅ Updated (source tracking fields)
```

---

### Frontend Files

**Integration Pages:**
```
apps/admin/src/pages/admin/pages/integrations/
├── index.tsx                           ✅ Complete (main page)
├── IntegrationCard.tsx                 ✅ Complete
├── ConfigureIntegrationModal.tsx      ✅ Complete
└── clickup/                            ⏳ To be created
    ├── ClickUpSyncModal.tsx            ⏳ Next
    ├── WorkspaceTree.tsx               ⏳ Next
    └── ImportProgress.tsx              ⏳ Next
```

**API Client:**
```
apps/admin/src/api/
└── integrations.ts                     ✅ Complete
```

**Layout:**
```
apps/admin/src/pages/admin/
└── layout.tsx                          ✅ Updated (sidebar menu item added)
```

**Router:**
```
apps/admin/src/router/
└── register.tsx                        ✅ Route registered
```

---

### Documentation Files

```
docs/
├── INTEGRATION_SOURCE_TRACKING.md      ✅ Complete (technical details)
└── CLICKUP_INTEGRATION_PROGRESS.md     ✅ This file
```

```
docs/spec/
└── 22-clickup-integration.md           ✅ Updated (sync UI spec, source tracking)
```

---

## Next Session Plan

**Priority Order:**

1. **Backend: Workspace Structure Endpoint** (30 minutes)
   - Add GET `/integrations/clickup/structure` endpoint
   - Implement structure fetching in import service
   - Add client method in frontend API

2. **Backend: Selective Import** (45 minutes)
   - Modify sync endpoint to accept `list_ids`
   - Update import service to skip full traversal
   - Test with specific list IDs

3. **Frontend: ClickUp Sync Modal** (2 hours)
   - Create modal component with tree structure
   - Implement list selection logic (tri-state checkboxes)
   - Add import configuration form
   - Connect to backend endpoints

4. **Frontend: Progress Tracking** (1 hour)
   - Add progress UI to sync modal
   - Poll for job status if background
   - Display import counts and duration

5. **Testing** (2 hours)
   - Write Playwright E2E tests
   - Add unit tests for components
   - Test full flow end-to-end

6. **Documentation** (1 hour)
   - Update README with setup guide
   - Add API documentation
   - Create troubleshooting guide

---

## Known Issues & Limitations

### Current Limitations

1. **Full Workspace Import Only**
   - Currently imports entire workspace
   - No way to select specific lists
   - Can be slow for large workspaces

2. **No Progress Feedback**
   - Sync runs without UI feedback
   - User doesn't know when it's done
   - No way to cancel running sync

3. **No Incremental Sync**
   - Always does full import
   - No change detection
   - Doesn't use `external_updated_at` yet

4. **No Webhook Handler**
   - Webhook structure exists
   - No actual event processing
   - No real-time updates

### Future Enhancements

- [ ] Incremental sync using `external_updated_at`
- [ ] Webhook processing for real-time updates
- [ ] Bidirectional sync (push changes back to ClickUp)
- [ ] Sync scheduling (cron jobs)
- [ ] Conflict resolution UI
- [ ] Bulk operations (delete all from source)
- [ ] Integration health monitoring
- [ ] Sync history and logs

---

## Testing Checklist

### Manual Testing (Current State)

- [ ] Navigate to `/admin/integrations`
- [ ] See ClickUp in integration gallery
- [ ] Click "Connect" button
- [ ] Fill in ClickUp API token and workspace ID
- [ ] Save integration
- [ ] See integration card change to "Configure" button
- [ ] See status badge change to "Active"
- [ ] Click "Disable" button
- [ ] See status change to "Disabled"
- [ ] Click "Enable" button
- [ ] See status change to "Active"
- [ ] Click "Test Connection" (if saved)
- [ ] See success/failure message
- [ ] Click delete (trash icon)
- [ ] Confirm deletion
- [ ] See integration card return to "Connect" state

### E2E Tests (To Be Written)

```typescript
// apps/admin/e2e/specs/integrations.spec.ts
test.describe('Integration Gallery', () => {
  test('displays available integrations', async ({ page }) => {
    // Navigate to integrations page
    // Verify grid layout
    // Check ClickUp card is visible
  });

  test('can configure ClickUp integration', async ({ page }) => {
    // Click Connect button
    // Fill form fields
    // Click Save
    // Verify success message
  });

  test('validates required fields', async ({ page }) => {
    // Click Connect
    // Leave fields empty
    // Click Save
    // Verify error message
  });
});
```

---

## Performance Considerations

### Current Performance

- ✅ Database indexes on source tracking fields
- ✅ Rate limiting for ClickUp API (100 req/min)
- ✅ Pagination for task fetching
- ✅ Unique constraints prevent duplicates

### Optimization Opportunities

- [ ] Cache workspace structure (Redis)
- [ ] Batch insert for tasks (current: 1 per task)
- [ ] Background job queue (Bull/BullMQ)
- [ ] Incremental sync (only changed items)
- [ ] Parallel space processing
- [ ] Connection pooling for database

---

## Security Considerations

### Current Security

- ✅ Settings encrypted with pgcrypto (if key set)
- ✅ Row-level security on integrations table
- ✅ API key stored as password field
- ✅ HTTPS for ClickUp API calls
- ✅ Input validation on all endpoints

### Additional Security (Future)

- [ ] OAuth 2.0 support (instead of API tokens)
- [ ] Webhook signature verification
- [ ] Rate limiting on sync endpoints
- [ ] Audit log for integration changes
- [ ] Permission checks for sensitive operations
- [ ] Token rotation/refresh

---

## Developer Notes

### Running Locally

1. **Start Backend:**
   ```bash
   cd apps/server
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   cd apps/admin
   npm run dev
   ```

3. **Apply Migrations:**
   ```bash
   psql -d spec -f apps/server/migrations/0003_integrations_system.sql
   psql -d spec -f apps/server/migrations/0004_integration_source_tracking.sql
   ```

### Environment Variables

```bash
# Optional: Encryption for integration settings
INTEGRATION_ENCRYPTION_KEY=your-32-char-secret-key

# PostgreSQL connection
DATABASE_URL=postgresql://user:pass@localhost:5432/spec
```

### ClickUp API Token

1. Go to ClickUp Settings → Apps
2. Click "Generate" under API Token
3. Copy token (starts with `pk_`)
4. Find workspace ID in URL: `app.clickup.com/WORKSPACE_ID/`

---

## Changelog

### October 5, 2025

**Completed:**
- ✅ Database migrations for integrations and source tracking
- ✅ Backend integration module with ClickUp implementation
- ✅ Full workspace import functionality
- ✅ Frontend integration gallery UI
- ✅ Configuration modal with dynamic forms
- ✅ Enable/disable/delete operations
- ✅ Sidebar navigation added
- ✅ Source tracking metadata for all ClickUp objects
- ✅ ClickUp URL construction for deep linking

**Next:**
- ⏳ Workspace structure endpoint
- ⏳ Selective import with list selection
- ⏳ Sync UI with progress tracking
- ⏳ E2E and unit tests
- ⏳ Documentation and guides

---

## Questions & Answers

**Q: Why store settings as encrypted JSONB instead of separate columns?**
A: Flexibility. Each integration has different required settings. JSONB allows us to add new integrations without schema changes. Encryption protects sensitive API tokens.

**Q: Why not use OAuth instead of API tokens?**
A: ClickUp supports both. API tokens are simpler for v1. OAuth adds complexity (token refresh, consent screens) but is planned for v2.

**Q: How do we prevent duplicate imports?**
A: Unique constraint on `(external_source, external_id)` in database. The `upsert_graph_object_from_external()` function checks for existing objects before inserting.

**Q: Can we sync multiple ClickUp workspaces?**
A: Yes! Create one integration per workspace. Each integration has its own settings (API token + workspace ID).

**Q: What happens if a ClickUp object is deleted?**
A: Currently: nothing (orphaned). Future: webhook event will soft-delete in our DB (`deleted_at`).

**Q: How do we handle ClickUp custom fields?**
A: Stored in `properties` JSONB on graph objects. The data mapper extracts them into a `custom_fields` object within metadata.

---

## Resources

### API Documentation
- [ClickUp API v2](https://clickup.com/api)
- [ClickUp Webhooks](https://clickup.com/api/developer-portal/webhooks/)
- [Rate Limits](https://clickup.com/api/developer-portal/rate-limits/)

### Internal Docs
- `docs/INTEGRATION_SOURCE_TRACKING.md` - Technical implementation details
- `docs/spec/22-clickup-integration.md` - Feature specification
- `docs/spec/23-integration-gallery.md` - Integration system architecture

### Related Files
- Backend: `apps/server/src/modules/clickup/`
- Frontend: `apps/admin/src/pages/admin/pages/integrations/`
- API Client: `apps/admin/src/api/integrations.ts`

---

## Contributors

- Implementation: GitHub Copilot
- Specification: Product team
- Review: Engineering team

---

## License

This integration is part of the Spec Server project. See root LICENSE file for details.
