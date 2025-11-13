# Automatic Object Extraction & Notifications

Status: **Implemented (Backend)**  
Created: 2025-10-04  
Updated: 2025-10-04 - Backend implementation complete  
Related: `05-ingestion-workflows.md`, `24-dynamic-type-discovery-and-ingestion.md`, `25-extraction-worker.md`

---

## 1. Overview

This spec defines automatic object extraction from uploaded documents and notification system to inform users about extraction completion.

### Implementation Status
- ✅ **Database Schema** - Migration 0005 applied
- ✅ **Automatic Extraction** - IngestionService triggers extraction jobs
- ✅ **Notification Service** - Extended with new fields and methods
- ✅ **Extraction Worker** - Creates notifications on job completion/failure
- ✅ **API Endpoints** - REST endpoints for notifications
- ⏳ **Frontend** - useNotifications hook, NotificationBell component (pending)
- ⏳ **E2E Tests** - Complete flow testing (pending)

### Goals
1. **Automatic Extraction** - Trigger object extraction jobs automatically when documents are uploaded ✅
2. **Real-time Notifications** - Notify users when extraction jobs complete ✅
3. **Extraction Summaries** - Provide detailed summary of extracted objects, relationships, and quality metrics ✅
4. **Configuration** - Allow project-level control over automatic extraction behavior ✅

---

## 2. Automatic Extraction Trigger

### 2.1 Ingestion Service Enhancement

When a document is uploaded via `/ingest/upload` or `/ingest/url`, the system should:

1. **Save document and chunks** (existing behavior)
2. **Check project settings** for automatic extraction
3. **Create extraction job** if enabled
4. **Return combined result** with document ID and extraction job ID

### 2.2 Configuration Model

```sql
-- Add automatic extraction settings to projects table
ALTER TABLE kb.projects
  ADD COLUMN auto_extract_objects BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN auto_extract_config JSONB DEFAULT '{
    "enabled_types": null,
    "min_confidence": 0.7,
    "require_review": false,
    "notify_on_complete": true
  }'::jsonb;

CREATE INDEX idx_projects_auto_extract ON kb.projects(id, auto_extract_objects) 
  WHERE auto_extract_objects = true;
```

### 2.3 Configuration Options

```typescript
interface AutoExtractionConfig {
  enabled_types: string[] | null;  // null = all enabled types from template pack
  min_confidence: number;            // 0.0-1.0, default 0.7
  require_review: boolean;           // Mark all objects as needs_review
  notify_on_complete: boolean;       // Send notification when job completes
  notification_channels: string[];   // ['email', 'inbox', 'webhook']
}
```

### 2.4 Updated Ingestion Flow

```typescript
// apps/server/src/modules/ingestion/ingestion.service.ts

interface IngestResult {
  documentId: string;
  chunks: number;
  alreadyExists: boolean;
  extractionJobId?: string;        // NEW: If extraction job was created
  extractionJobStatus?: string;    // NEW: 'pending' | 'queued'
}

async ingestText(...): Promise<IngestResult> {
  // ... existing document creation logic ...
  
  const result: IngestResult = { 
    documentId, 
    chunks: chunks.length, 
    alreadyExists: false 
  };
  
  // NEW: Check if auto-extraction is enabled for this project
  if (!alreadyExists) {
    const autoExtract = await this.shouldAutoExtract(projectId);
    
    if (autoExtract.enabled) {
      try {
        const extractionJob = await this.extractionJobService.create({
          org_id: derivedOrg,
          project_id: projectId,
          source_type: 'document',
          source_id: documentId,
          allowed_types: autoExtract.config.enabled_types,
          extraction_config: {
            min_confidence: autoExtract.config.min_confidence,
            require_review: autoExtract.config.require_review
          }
        });
        
        result.extractionJobId = extractionJob.job_id;
        result.extractionJobStatus = 'pending';
        
        this.logger.log(
          `Auto-extraction job ${extractionJob.job_id} created for document ${documentId}`
        );
      } catch (error) {
        // Don't fail ingestion if extraction job creation fails
        this.logger.warn(
          `Failed to create auto-extraction job for document ${documentId}: ${error.message}`
        );
      }
    }
  }
  
  return result;
}

private async shouldAutoExtract(projectId: string): Promise<{
  enabled: boolean;
  config: AutoExtractionConfig;
}> {
  const project = await this.db.query<{
    auto_extract_objects: boolean;
    auto_extract_config: AutoExtractionConfig;
  }>(
    'SELECT auto_extract_objects, auto_extract_config FROM kb.projects WHERE id = $1',
    [projectId]
  );
  
  if (!project.rowCount) {
    return { enabled: false, config: {} as AutoExtractionConfig };
  }
  
  return {
    enabled: project.rows[0].auto_extract_objects,
    config: project.rows[0].auto_extract_config || {
      enabled_types: null,
      min_confidence: 0.7,
      require_review: false,
      notify_on_complete: true,
      notification_channels: ['inbox']
    }
  };
}
```

---

## 3. Notification System

### 3.1 Notification Data Model

```sql
-- Notifications table for user messages
CREATE TABLE kb.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Notification metadata
  type TEXT NOT NULL, -- 'extraction_complete' | 'extraction_failed' | 'review_required' | etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- 'info' | 'success' | 'warning' | 'error'
  
  -- Related resources
  related_resource_type TEXT, -- 'extraction_job' | 'document' | 'object' | etc.
  related_resource_id UUID,
  
  -- Notification details/summary
  details JSONB DEFAULT '{}',
  
  -- State
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  
  -- Actions
  actions JSONB DEFAULT '[]', -- [{ label: 'Review Objects', url: '/admin/objects?job=...' }]
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ -- Optional auto-cleanup
);

CREATE INDEX idx_notifications_user_unread ON kb.notifications(user_id, read, created_at DESC) 
  WHERE read = false;
CREATE INDEX idx_notifications_project ON kb.notifications(project_id, created_at DESC);
CREATE INDEX idx_notifications_type ON kb.notifications(type);
CREATE INDEX idx_notifications_expires ON kb.notifications(expires_at) 
  WHERE expires_at IS NOT NULL;
```

### 3.2 Extraction Summary Schema

```typescript
interface ExtractionSummary {
  job_id: string;
  document_id: string;
  document_name: string;
  
  // Timing
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  
  // Results
  objects_created: number;
  objects_updated: number; // Via entity linking/merge
  relationships_created: number;
  
  // By type breakdown
  objects_by_type: Record<string, number>; // { "Requirement": 5, "Decision": 3 }
  
  // Quality metrics
  average_confidence: number;
  objects_requiring_review: number;
  rejected_objects: number;
  
  // Actions taken
  entity_linking_matches: number;
  entity_linking_merges: number;
  
  // Errors/warnings
  warnings: string[];
  partial_failures: number;
}
```

### 3.3 Notification Creation on Job Completion

```typescript
// apps/server/src/modules/extraction-jobs/extraction-worker.service.ts

private async processJob(job: ExtractionJobDto) {
  const startTime = Date.now();
  
  try {
    // ... existing extraction logic ...
    
    // Job completed successfully
    await this.jobService.markCompleted(job.id, {
      created_objects: createdObjectIds,
      updated_objects: updatedObjectIds,
      created_relationships: relationshipIds,
      summary: {
        objects_by_type,
        average_confidence,
        objects_requiring_review: reviewRequiredObjectIds.length,
        entity_linking_matches: linkingMatches,
        entity_linking_merges: mergeCounts
      }
    });
    
    // NEW: Send notification
    await this.sendCompletionNotification(job, {
      duration_seconds: (Date.now() - startTime) / 1000,
      objects_created: createdObjectIds.length,
      objects_updated: updatedObjectIds.length,
      relationships_created: relationshipIds.length,
      objects_by_type,
      average_confidence,
      objects_requiring_review: reviewRequiredObjectIds.length,
      rejected_objects: rejectedCount.value,
      entity_linking_matches: linkingMatches,
      entity_linking_merges: mergeCounts,
      warnings: []
    });
    
  } catch (error) {
    // Job failed
    await this.jobService.markFailed(job.id, error.message);
    
    // NEW: Send failure notification
    await this.sendFailureNotification(job, error);
  }
}

private async sendCompletionNotification(
  job: ExtractionJobDto, 
  summary: ExtractionSummary
) {
  // Check if notifications are enabled for this project
  const projectConfig = await this.getProjectAutoExtractConfig(job.project_id);
  
  if (!projectConfig?.notify_on_complete) {
    return;
  }
  
  const document = await this.loadDocumentMetadata(job.source_id);
  
  const notification = {
    tenant_id: job.tenant_id,
    organization_id: job.org_id,
    project_id: job.project_id,
    user_id: job.created_by, // Or get project members
    type: 'extraction_complete',
    title: 'Object Extraction Complete',
    message: this.buildSummaryMessage(summary, document),
    severity: summary.objects_requiring_review > 0 ? 'warning' : 'success',
    related_resource_type: 'extraction_job',
    related_resource_id: job.id,
    details: {
      summary,
      document: {
        id: document.id,
        name: document.name
      }
    },
    actions: [
      {
        label: 'View Extracted Objects',
        url: `/admin/objects?extraction_job_id=${job.id}`
      }
    ]
  };
  
  if (summary.objects_requiring_review > 0) {
    notification.actions.push({
      label: `Review ${summary.objects_requiring_review} Objects`,
      url: `/admin/objects?needs_review=true&extraction_job_id=${job.id}`
    });
  }
  
  await this.notificationService.create(notification);
}

private buildSummaryMessage(summary: ExtractionSummary, document: any): string {
  const parts = [
    `Extracted ${summary.objects_created} objects from "${document.name}"`,
  ];
  
  if (summary.objects_updated > 0) {
    parts.push(`Updated ${summary.objects_updated} existing objects`);
  }
  
  if (summary.relationships_created > 0) {
    parts.push(`Created ${summary.relationships_created} relationships`);
  }
  
  const typeBreakdown = Object.entries(summary.objects_by_type)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');
  
  if (typeBreakdown) {
    parts.push(`Types: ${typeBreakdown}`);
  }
  
  if (summary.objects_requiring_review > 0) {
    parts.push(`⚠️ ${summary.objects_requiring_review} objects need review`);
  }
  
  return parts.join('. ');
}

private async sendFailureNotification(job: ExtractionJobDto, error: Error) {
  const projectConfig = await this.getProjectAutoExtractConfig(job.project_id);
  
  if (!projectConfig?.notify_on_complete) {
    return;
  }
  
  await this.notificationService.create({
    tenant_id: job.tenant_id,
    organization_id: job.org_id,
    project_id: job.project_id,
    user_id: job.created_by,
    type: 'extraction_failed',
    title: 'Object Extraction Failed',
    message: `Failed to extract objects: ${error.message}`,
    severity: 'error',
    related_resource_type: 'extraction_job',
    related_resource_id: job.id,
    details: {
      error: error.message,
      stack: error.stack
    },
    actions: [
      {
        label: 'View Job Details',
        url: `/admin/extraction-jobs/${job.id}`
      },
      {
        label: 'Retry Extraction',
        action: 'retry_extraction',
        data: { job_id: job.id }
      }
    ]
  });
}
```

---

## 4. Notification API Endpoints

### 4.1 REST API

```typescript
// apps/server/src/modules/notifications/notifications.controller.ts

@Controller('notifications')
@UseGuards(AuthGuard, ScopesGuard)
@Scopes('notifications:read')
export class NotificationsController {
  
  @Get()
  async list(
    @Query('unread_only') unreadOnly?: boolean,
    @Query('type') type?: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0
  ): Promise<{ items: Notification[]; total: number }> {
    // Return user's notifications
  }
  
  @Get('/counts')
  async getCounts(): Promise<{
    unread: number;
    by_type: Record<string, number>;
  }> {
    // Return notification counts
  }
  
  @Patch('/:id/read')
  async markRead(@Param('id') id: string): Promise<void> {
    // Mark notification as read
  }
  
  @Post('/mark-all-read')
  async markAllRead(
    @Query('type') type?: string
  ): Promise<{ updated: number }> {
    // Mark all notifications as read
  }
  
  @Delete('/:id')
  async dismiss(@Param('id') id: string): Promise<void> {
    // Dismiss notification
  }
}
```

### 4.2 WebSocket/SSE for Real-time Updates

```typescript
// apps/server/src/modules/notifications/notifications.gateway.ts

@WebSocketGateway({ namespace: '/notifications' })
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;
  
  async sendToUser(userId: string, notification: Notification) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
  
  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.getUserIdFromToken(client);
    client.join(`user:${userId}`);
  }
}
```

---

## 5. Admin UI Integration

### 5.1 Notification Bell Component

```tsx
// apps/admin/src/components/NotificationBell.tsx

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  
  return (
    <div className="dropdown dropdown-end">
      <button className="btn btn-ghost btn-circle">
        <div className="indicator">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="badge badge-sm badge-primary indicator-item">
              {unreadCount}
            </span>
          )}
        </div>
      </button>
      
      <div className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-96">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button 
              className="btn btn-xs btn-ghost"
              onClick={() => markAllAsRead()}
            >
              Mark all as read
            </button>
          )}
        </div>
        
        <ul className="max-h-96 overflow-y-auto">
          {notifications.map(notification => (
            <NotificationItem 
              key={notification.id}
              notification={notification}
              onRead={() => markAsRead(notification.id)}
              onDismiss={() => dismiss(notification.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
```

### 5.2 Extraction Complete Notification

```tsx
// apps/admin/src/components/notifications/ExtractionCompleteNotification.tsx

export function ExtractionCompleteNotification({ 
  notification 
}: { 
  notification: Notification 
}) {
  const summary = notification.details.summary as ExtractionSummary;
  
  return (
    <div className={`alert alert-${notification.severity}`}>
      <div>
        <h4 className="font-semibold">{notification.title}</h4>
        <p className="text-sm">{notification.message}</p>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
          <div className="stat">
            <div className="stat-title">Created</div>
            <div className="stat-value text-sm">{summary.objects_created}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Updated</div>
            <div className="stat-value text-sm">{summary.objects_updated}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Relations</div>
            <div className="stat-value text-sm">{summary.relationships_created}</div>
          </div>
        </div>
        
        {/* Type Breakdown */}
        {Object.keys(summary.objects_by_type).length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold">By Type:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(summary.objects_by_type).map(([type, count]) => (
                <span key={type} className="badge badge-sm">
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {notification.actions?.map((action, idx) => (
            <Link
              key={idx}
              to={action.url}
              className="btn btn-xs btn-primary"
            >
              {action.label}
            </Link>
          ))}
        </div>
        
        {/* Duration */}
        <p className="text-xs text-base-content/60 mt-2">
          Completed in {summary.duration_seconds.toFixed(1)}s
        </p>
      </div>
    </div>
  );
}
```

### 5.3 Project Settings for Auto-Extraction

```tsx
// apps/admin/src/pages/admin/settings/extraction.tsx

export function ExtractionSettingsPage() {
  const { projectId } = useConfig();
  const [settings, setSettings] = useState<AutoExtractionConfig>();
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Automatic Extraction</h2>
      
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <label className="label cursor-pointer">
            <span className="label-text">
              Automatically extract objects from uploaded documents
            </span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={settings?.auto_extract_objects}
              onChange={(e) => updateAutoExtract(e.target.checked)}
            />
          </label>
          
          {settings?.auto_extract_objects && (
            <>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Enabled Object Types</span>
                </label>
                <select 
                  multiple 
                  className="select select-bordered"
                  value={settings.enabled_types || []}
                >
                  {availableTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <label className="label">
                  <span className="label-text-alt">
                    Leave empty to extract all enabled types from template pack
                  </span>
                </label>
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text">
                    Minimum Confidence: {settings.min_confidence}
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="range"
                  value={settings.min_confidence}
                />
              </div>
              
              <label className="label cursor-pointer">
                <span className="label-text">
                  Require manual review for all extracted objects
                </span>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.require_review}
                />
              </label>
              
              <label className="label cursor-pointer">
                <span className="label-text">
                  Send notification when extraction completes
                </span>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.notify_on_complete}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Implementation Plan

### Phase 1: Core Auto-Extraction (Week 1)
- [ ] Add `auto_extract_objects` and `auto_extract_config` columns to `kb.projects`
- [ ] Update `IngestionService.ingestText()` to check settings and create extraction jobs
- [ ] Update API response to include `extractionJobId` and `extractionJobStatus`
- [ ] Add project settings API endpoints for auto-extraction config
- [ ] Update Admin UI document upload to show extraction job status

### Phase 2: Notification System (Week 2)
- [ ] Create `kb.notifications` table
- [ ] Implement `NotificationService` with CRUD operations
- [ ] Add notification creation in `ExtractionWorkerService`
- [ ] Build notification REST API endpoints
- [ ] Implement notification count/unread queries

### Phase 3: Admin UI Notifications (Week 3)
- [ ] Build `NotificationBell` component with dropdown
- [ ] Create notification item components by type
- [ ] Add extraction summary display
- [ ] Implement mark as read/dismiss actions
- [ ] Add notification preferences page

### Phase 4: Real-time Updates (Week 4)
- [ ] Implement WebSocket gateway for notifications
- [ ] Add SSE endpoint for notification stream
- [ ] Update Admin UI to subscribe to real-time updates
- [ ] Add toast notifications for important events

### Phase 5: Enhanced Features (Week 5+)
- [ ] Email notifications (optional)
- [ ] Webhook notifications for external integrations
- [ ] Notification templates and customization
- [ ] Notification aggregation and digests
- [ ] Advanced filtering and search

---

## 7. Testing Strategy

### 7.1 Unit Tests
- Test auto-extraction trigger logic
- Test notification creation
- Test notification queries and filters
- Test configuration validation

### 7.2 Integration Tests
```typescript
describe('Automatic Extraction & Notifications', () => {
  it('should create extraction job on document upload', async () => {
    // Enable auto-extraction
    await setProjectAutoExtract(projectId, true);
    
    // Upload document
    const result = await uploadDocument(file);
    
    expect(result.extractionJobId).toBeDefined();
    expect(result.extractionJobStatus).toBe('pending');
  });
  
  it('should send notification on extraction complete', async () => {
    // Create extraction job
    const job = await createExtractionJob(...);
    
    // Process job
    await worker.processJob(job);
    
    // Check notification was created
    const notifications = await getNotifications(userId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('extraction_complete');
    expect(notifications[0].details.summary).toBeDefined();
  });
  
  it('should include summary in notification', async () => {
    // ... process extraction ...
    
    const notification = await getLatestNotification(userId);
    const summary = notification.details.summary;
    
    expect(summary.objects_created).toBeGreaterThan(0);
    expect(summary.objects_by_type).toBeDefined();
    expect(summary.duration_seconds).toBeGreaterThan(0);
  });
});
```

### 7.3 E2E Tests
- Upload document with auto-extraction enabled
- Verify extraction job appears in UI
- Wait for job completion
- Verify notification appears in notification bell
- Click notification action to view objects
- Verify extracted objects are displayed

---

## 8. Implementation Summary (Backend Complete)

### 8.1 Database Schema (Migration 0005)

**Projects Table Extensions:**
```sql
ALTER TABLE kb.projects
  ADD COLUMN auto_extract_objects BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN auto_extract_config JSONB DEFAULT '{
    "enabled_types": null,
    "min_confidence": 0.7,
    "require_review": false,
    "notify_on_complete": true,
    "notification_channels": ["inbox"]
  }'::jsonb;
```

**Notifications Table Extensions:**
```sql
ALTER TABLE kb.notifications
  ADD COLUMN type TEXT,
  ADD COLUMN severity TEXT DEFAULT 'info',
  ADD COLUMN related_resource_type TEXT,
  ADD COLUMN related_resource_id UUID,
  ADD COLUMN read BOOLEAN DEFAULT false,
  ADD COLUMN dismissed BOOLEAN DEFAULT false,
  ADD COLUMN dismissed_at TIMESTAMPTZ,
  ADD COLUMN actions JSONB DEFAULT '[]',
  ADD COLUMN expires_at TIMESTAMPTZ;
```

**Indexes Created:**
- `idx_projects_auto_extract` - Fast lookup for auto-extraction enabled projects
- `idx_notifications_type` - Filter by notification type
- `idx_notifications_expires` - Cleanup expired notifications
- `idx_notifications_related_resource` - Find notifications by resource
- `idx_notifications_read_new` - Efficient unread queries

**RLS Policies:**
- `notifications_select_own` - Users can read their own notifications
- `notifications_update_own` - Users can update their own notifications
- `notifications_insert_system` - System can create notifications
- `notifications_delete_own` - Users can delete their own notifications

### 8.2 Backend Services Implementation

**IngestionService (`apps/server/src/modules/ingestion/ingestion.service.ts`)**
- ✅ Extended `IngestResult` interface with `extractionJobId?: string`
- ✅ Added `shouldAutoExtract(projectId)` method
- ✅ Injected `ExtractionJobService`
- ✅ Creates extraction job automatically after document ingestion if `auto_extract_objects = true`
- ✅ Returns `extractionJobId` in response
- ✅ Graceful error handling (doesn't fail ingestion if job creation fails)

**NotificationsService (`apps/server/src/modules/notifications/notifications.service.ts`)**
- ✅ Extended `create()` to support new fields: type, severity, related_resource_type, related_resource_id, read, dismissed, actions, expires_at
- ✅ Added `dismiss(notificationId, userId)` method
- ✅ Added `getCounts(userId)` method returning {unread, dismissed, total}
- ✅ Enhanced `notifyExtractionCompleted()` with detailed summary:
  - Object counts and type breakdown
  - Average confidence scores
  - Duration metrics  
  - Action buttons with smart styling (View Objects, Review Objects, View Job Details)
- ✅ Added `notifyExtractionFailed()` for failure notifications with retry info

**ExtractionWorkerService (`apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`)**
- ✅ Injected `NotificationsService`
- ✅ Calls notification service after job completion (both success and requires_review)
- ✅ Calls notification service after job failure
- ✅ Helper methods:
  - `createCompletionNotification()` - Builds detailed success notification
  - `createFailureNotification()` - Builds failure notification with retry status
  - `countObjectsByType()` - Aggregates objects by type
  - `calculateAverageConfidence()` - Computes average confidence
  - `willRetryJob()` - Checks if job will auto-retry
  - `getJobRetryCount()` - Gets current retry count

**NotificationsController (`apps/server/src/modules/notifications/notifications.controller.ts`)**
- ✅ `GET /notifications` - List notifications with filters (tab, category, unread_only, search)
- ✅ `GET /notifications/counts` - Legacy unread counts by tab
- ✅ `GET /notifications/stats` - New counts (unread, dismissed, total)
- ✅ `POST /notifications/:id/read` - Mark as read
- ✅ `POST /notifications/:id/unread` - Mark as unread
- ✅ `POST /notifications/:id/dismiss` - Mark as dismissed
- ✅ `DELETE /notifications/:id` - Clear notification
- ✅ `POST /notifications/:id/snooze` - Snooze notification
- ✅ All endpoints protected with AuthGuard and ScopesGuard

### 8.3 Notification Structure (Actual Implementation)

**Success Notification Example:**
```json
{
  "id": "uuid",
  "type": "extraction_complete",
  "severity": "success",
  "title": "Object Extraction Complete",
  "message": "Extracted 15 objects from requirements.pdf (5 Requirements, 3 Decisions, 7 Features). 2 objects require review.",
  "details": {
    "summary": {
      "objects_created": 15,
      "objects_by_type": {
        "Requirement": 5,
        "Decision": 3,
        "Feature": 7
      },
      "average_confidence": 0.87,
      "duration_seconds": 12.3,
      "requires_review": 2,
      "low_confidence_count": 2
    },
    "document": {
      "id": "doc-uuid",
      "name": "requirements.pdf"
    },
    "job": {
      "id": "job-uuid"
    }
  },
  "related_resource_type": "extraction_job",
  "related_resource_id": "job-uuid",
  "actions": [
    {
      "label": "View Objects",
      "url": "/admin/objects?jobId=job-uuid",
      "style": "primary"
    },
    {
      "label": "Review Objects",
      "url": "/admin/objects?jobId=job-uuid&filter=requires_review",
      "style": "warning"
    },
    {
      "label": "View Job Details",
      "url": "/admin/extraction/jobs/job-uuid",
      "style": "secondary"
    }
  ],
  "read": false,
  "dismissed": false,
  "created_at": "2025-10-04T12:00:00Z"
}
```

**Failure Notification Example:**
```json
{
  "id": "uuid",
  "type": "extraction_failed",
  "severity": "error",
  "title": "Extraction Failed: requirements.pdf",
  "message": "Extraction failed but will retry automatically (attempt 2/3)",
  "details": {
    "document": {
      "id": "doc-uuid",
      "name": "requirements.pdf"
    },
    "job": {
      "id": "job-uuid"
    },
    "error": {
      "message": "LLM API rate limit exceeded",
      "retry_count": 1,
      "will_retry": true
    }
  },
  "related_resource_type": "extraction_job",
  "related_resource_id": "job-uuid",
  "actions": [
    {
      "label": "View Job Details",
      "url": "/admin/extraction/jobs/job-uuid",
      "style": "secondary"
    }
  ],
  "read": false,
  "dismissed": false
}
```

---

## 9. Success Criteria

- ✅ Documents uploaded with auto-extraction enabled automatically trigger extraction jobs
- ✅ Extraction jobs complete and create graph objects
- ✅ Notifications are created on job completion with detailed summary
- ✅ Notification includes breakdown by object type and quality metrics
- ✅ System handles failures gracefully with error notifications
- ⏳ Users can view notifications in Admin UI notification bell
- ⏳ Users can click through to view extracted objects
- ⏳ Projects can toggle auto-extraction via UI settings

---

## 10. Backend Testing Strategy

### 10.1 Unit Tests

**IngestionService Tests** (`apps/server/src/modules/ingestion/ingestion.service.spec.ts`)
- ✅ `shouldAutoExtract()` method:
  - Returns null when project doesn't exist
  - Returns null when `auto_extract_objects = false`
  - Returns config when `auto_extract_objects = true`
- ✅ `ingestText()` auto-extraction:
  - Creates extraction job when enabled
  - Skips job creation when disabled
  - Gracefully handles job creation failures
  - Includes extraction config in job creation
  - Returns `extractionJobId` in result

**NotificationsService Tests** (`apps/server/src/modules/notifications/notifications.service.spec.ts`)
- ✅ `create()` with new fields:
  - Accepts and stores all new fields (type, severity, actions, etc.)
  - Handles optional fields gracefully
  - Backward compatible with old code
- ✅ `dismiss()` method:
  - Marks notification as dismissed with timestamp
  - Throws NotFoundException when not found
- ✅ `getCounts()` method:
  - Returns correct unread/dismissed/total counts
  - Handles empty notification list
- ✅ `notifyExtractionCompleted()`:
  - Creates detailed success notification with summary
  - Sets correct severity based on review requirements
  - Includes action buttons with proper styling
  - Handles empty object extraction
- ✅ `notifyExtractionFailed()`:
  - Creates failure notification with retry info
  - Includes error message in details
  - Adds appropriate action buttons

**ExtractionWorkerService Tests** (`apps/server/src/modules/extraction-jobs/extraction-worker.service.spec.ts`)
- ✅ Helper methods:
  - `countObjectsByType()` - Aggregates correctly
  - `calculateAverageConfidence()` - Computes average
  - `willRetryJob()` - Returns correct retry eligibility
  - `getJobRetryCount()` - Queries database
- ✅ Notification integration:
  - Calls notification service on job completion (success)
  - Calls notification service on job completion (requires_review)
  - Calls notification service on job failure
  - Passes correct data to notification methods

### 10.2 Integration Tests

**Full Flow Test** (`apps/server/test/auto-extraction-flow.e2e-spec.ts`)
- ✅ Document upload → auto-extraction → notification flow:
  1. Create project with `auto_extract_objects = true`
  2. Upload document via ingestion endpoint
  3. Verify extraction job created and returned in response
  4. Wait for job to process (poll status)
  5. Verify objects created in graph
  6. Verify notification created with correct summary
  7. Verify notification includes action buttons
  8. Test notification dismiss endpoint
  9. Verify notification counts endpoint

**API Tests** (`apps/server/test/notifications-api.e2e-spec.ts`)
- ✅ NotificationsController endpoints:
  - `GET /notifications` - List with filters
  - `GET /notifications/stats` - Returns counts
  - `POST /notifications/:id/dismiss` - Dismisses notification
  - `POST /notifications/:id/read` - Marks as read
  - `GET /notifications/counts` - Legacy counts endpoint
- ✅ Authorization:
  - User can only access their own notifications
  - User cannot dismiss other users' notifications

### 10.3 Test Data Setup

**Seed Data for Tests:**
```typescript
// Test project with auto-extraction enabled
const testProject = {
  id: 'test-project-uuid',
  org_id: 'test-org-uuid',
  name: 'Test Project',
  auto_extract_objects: true,
  auto_extract_config: {
    enabled_types: null,
    min_confidence: 0.7,
    require_review: false,
    notify_on_complete: true,
    notification_channels: ['inbox']
  }
};

// Test extraction job
const testJob = {
  id: 'test-job-uuid',
  org_id: 'test-org-uuid',
  project_id: 'test-project-uuid',
  source_type: 'DOCUMENT',
  source_id: 'test-doc-uuid',
  status: 'completed',
  extraction_config: testProject.auto_extract_config
};

// Test notification
const testNotification = {
  id: 'test-notif-uuid',
  user_id: 'test-user-uuid',
  tenant_id: 'test-tenant-uuid',
  type: 'extraction_complete',
  severity: 'success',
  title: 'Object Extraction Complete',
  message: 'Extracted 10 objects from test.pdf',
  related_resource_type: 'extraction_job',
  related_resource_id: 'test-job-uuid',
  actions: [
    { label: 'View Objects', url: '/admin/objects?jobId=test-job-uuid', style: 'primary' }
  ],
  read: false,
  dismissed: false
};
```

### 10.4 Running Tests

```bash
# Run all unit tests
npm --prefix apps/server test

# Run specific test file
npm --prefix apps/server test -- ingestion.service.spec.ts

# Run with coverage
npm --prefix apps/server test:cov

# Run e2e tests
npm --prefix apps/server test:e2e

# Run specific e2e test
npm --prefix apps/server test:e2e -- auto-extraction-flow.e2e-spec.ts
```

---

## 11. Future Enhancements
Aggregate multiple extraction jobs into a single daily/weekly summary notification.

### 9.2 Smart Notification Timing
Only send notifications during user's active hours or based on preferences.

### 9.3 Notification Channels
- Email summaries
- Slack/Teams integration
- Mobile push notifications

### 9.4 Advanced Summaries
- Quality trends over time
- Comparison with previous extractions
- Suggestions for schema improvements

### 9.5 Interactive Notifications
- Approve/reject objects directly from notification
- Bulk actions on extracted objects
- Quick-edit object properties
