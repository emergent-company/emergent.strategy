# Notification Event Catalog

**Purpose:** Complete reference of all notification events produced by the spec-server system  
**Last Updated:** October 3, 2025  
**Related Specs:** 
- [docs/spec/35-admin-notification-inbox.md](spec/35-admin-notification-inbox.md)
- [docs/spec/34-clickup-integration-refined-design.md](spec/34-clickup-integration-refined-design.md)
- [docs/spec/25-extraction-worker.md](spec/25-extraction-worker.md)

---

## Overview

This document catalogs **every notification event** that the system produces, organized by subsystem. Each event includes:
- Category/type identifier
- When it's triggered
- What data is included
- Importance level (Important vs Other)
- Example notification

---

## 1. Document Import & Extraction Events

### 1.1. `extraction.completed`

**When:** Extraction job finishes successfully  
**Importance:** `other` (unless has items requiring review)  
**Triggered by:** ExtractionWorkerService after processing all chunks

**Notification Example:**
```typescript
{
  category: 'extraction.completed',
  importance: 'other',
  title: 'Extraction completed',
  message: 'Extracted 23 entities from "Q4 Requirements.pdf"',
  details: {
    document_id: 'doc_123',
    document_name: 'Q4 Requirements.pdf',
    entities_created: 18,      // New objects created
    entities_merged: 5,         // Merged with existing
    entities_skipped: 0,        // Duplicates skipped
    requires_review: 3,         // Flagged for review
    duration_ms: 12450,
    avg_confidence: 0.87
  },
  source_type: 'extraction_job',
  source_id: 'job_456',
  action_url: '/admin/extraction/jobs/job_456',
  action_label: 'View Results',
  group_key: 'extraction_job_456'
}
```

**User sees:**
- Title: "Extraction completed"
- Message: "Extracted 23 entities from 'Q4 Requirements.pdf'"
- Button: "View Results" → `/admin/extraction/jobs/job_456`
- Badge: None (goes to "Other" tab)

---

### 1.2. `extraction.failed`

**When:** Extraction job fails with errors  
**Importance:** `important`  
**Triggered by:** ExtractionWorkerService on critical failure

**Notification Example:**
```typescript
{
  category: 'extraction.failed',
  importance: 'important',
  title: 'Extraction failed',
  message: 'Failed to extract from "Architecture Spec.pdf": LLM rate limit exceeded',
  details: {
    document_id: 'doc_789',
    document_name: 'Architecture Spec.pdf',
    error_type: 'rate_limit',
    error_message: 'OpenAI rate limit: 429 Too Many Requests',
    chunks_processed: 12,
    chunks_total: 45,
    retry_count: 3
  },
  source_type: 'extraction_job',
  source_id: 'job_999',
  action_url: '/admin/extraction/jobs/job_999',
  action_label: 'View Error Details',
  group_key: 'extraction_job_999'
}
```

**User sees:**
- Title: "Extraction failed"
- Message: "Failed to extract from 'Architecture Spec.pdf': LLM rate limit exceeded"
- Button: "View Error Details"
- Badge: Red dot (Important tab)

---

### 1.3. `extraction.low_confidence`

**When:** Extraction produces entities below confidence threshold  
**Importance:** `important`  
**Triggered by:** ExtractionWorkerService when confidence < 0.85 (configurable)

**Notification Example:**
```typescript
{
  category: 'extraction.low_confidence',
  importance: 'important',
  title: 'Low confidence extractions',
  message: '3 entities extracted with confidence below 0.85 threshold',
  details: {
    document_id: 'doc_123',
    document_name: 'Requirements.pdf',
    low_confidence_count: 3,
    threshold: 0.85,
    entities: [
      { name: 'User Login System', confidence: 0.72, type: 'Feature' },
      { name: 'Payment Gateway', confidence: 0.68, type: 'Feature' },
      { name: 'Admin Dashboard', confidence: 0.79, type: 'Requirement' }
    ]
  },
  source_type: 'extraction_job',
  source_id: 'job_456',
  action_url: '/admin/extraction/jobs/job_456?tab=review',
  action_label: 'Review Items',
  group_key: 'extraction_job_456'
}
```

**User sees:**
- Title: "Low confidence extractions"
- Message: "3 entities extracted with confidence below 0.85 threshold"
- Button: "Review Items"
- Badge: Important (red dot)

---

### 1.4. `entity.requires_review`

**When:** Individual entity extracted needs human review  
**Importance:** `important`  
**Triggered by:** ExtractionWorkerService for ambiguous entities

**Notification Example:**
```typescript
{
  category: 'entity.requires_review',
  importance: 'important',
  title: 'Entity extraction needs review',
  message: 'Entity "Customer Portal API" extracted with 0.72 confidence',
  details: {
    confidence: 0.72,
    threshold: 0.85,
    entity_name: 'Customer Portal API',
    entity_type: 'Feature',
    suggested_type: 'Feature',
    alternative_types: ['Requirement', 'Capability'],
    document_id: 'doc_123',
    object_id: 'obj_789',  // Created but flagged
    context_snippet: '...will implement a customer portal API that allows customers to...'
  },
  source_type: 'graph_object',
  source_id: 'obj_789',
  action_url: '/admin/graph/objects/obj_789',
  action_label: 'Review Entity',
  group_key: 'extraction_job_456'
}
```

**User sees:**
- Title: "Entity extraction needs review"
- Message: "Entity 'Customer Portal API' extracted with 0.72 confidence"
- Button: "Review Entity" → Edit object page
- Badge: Important

---

## 2. Integration Import Events (ClickUp, Jira, etc.)

### 2.1. `import.completed`

**When:** Integration sync completes successfully (no review items)  
**Importance:** `other`  
**Triggered by:** IntegrationSyncService after full sync

**Notification Example:**
```typescript
{
  category: 'import.completed',
  importance: 'other',
  title: 'ClickUp import completed',
  message: 'Imported 45 tasks, updated 12 tasks',
  details: {
    integration_name: 'ClickUp Production',
    integration_type: 'clickup',
    sync_id: 'sync_123',
    imported: 45,         // New objects created
    updated: 12,          // Existing objects updated
    skipped: 3,           // Unchanged
    errors: 0,
    duration_ms: 8450
  },
  source_type: 'integration',
  source_id: 'integration_456',
  action_url: '/admin/integrations/integration_456/activity',
  action_label: 'View Activity',
  group_key: 'sync_123'
}
```

**User sees:**
- Title: "ClickUp import completed"
- Message: "Imported 45 tasks, updated 12 tasks"
- Button: "View Activity"
- Tab: Other

---

### 2.2. `import.requires_review`

**When:** Import completes but some items need manual review (ambiguous type mapping)  
**Importance:** `important`  
**Triggered by:** IntegrationSyncService when low confidence mappings exist

**Notification Example:**
```typescript
{
  category: 'import.requires_review',
  importance: 'important',
  title: 'ClickUp Import: 5 items need review',
  message: '5 tasks imported with low confidence type mapping',
  details: {
    integration_name: 'ClickUp Production',
    sync_id: 'sync_123',
    items_requiring_review: 5,
    total_imported: 45,
    review_reasons: [
      { count: 3, reason: 'Ambiguous type mapping' },
      { count: 2, reason: 'Missing required fields' }
    ],
    low_confidence_items: [
      { 
        clickup_task_id: 'task_1', 
        name: 'Implement login',
        suggested_type: 'Task',
        confidence: 0.65,
        alternatives: ['Feature', 'Requirement']
      }
    ]
  },
  source_type: 'integration',
  source_id: 'integration_456',
  action_url: '/admin/integrations/integration_456/activity?filter=requires_review',
  action_label: 'Review Items',
  group_key: 'sync_123'
}
```

**User sees:**
- Title: "ClickUp Import: 5 items need review"
- Message: "5 tasks imported with low confidence type mapping"
- Button: "Review Items" → Activity log filtered
- Badge: Important (red dot)

---

### 2.3. `import.failed`

**When:** Integration sync fails  
**Importance:** `important`  
**Triggered by:** IntegrationSyncService on unrecoverable error

**Notification Example:**
```typescript
{
  category: 'import.failed',
  importance: 'important',
  title: 'ClickUp import failed',
  message: 'Failed to sync tasks: API authentication error',
  details: {
    integration_name: 'ClickUp Production',
    sync_id: 'sync_789',
    error_type: 'auth_error',
    error_message: 'Invalid API token - 401 Unauthorized',
    items_processed: 23,
    items_total: 150,
    retry_count: 3
  },
  source_type: 'integration',
  source_id: 'integration_456',
  action_url: '/admin/integrations/integration_456/settings',
  action_label: 'Update Credentials',
  group_key: 'sync_789'
}
```

**User sees:**
- Title: "ClickUp import failed"
- Message: "Failed to sync tasks: API authentication error"
- Button: "Update Credentials"
- Badge: Important

---

### 2.4. `import.conflict`

**When:** Sync detects conflicting changes (modified locally AND remotely)  
**Importance:** `important`  
**Triggered by:** IntegrationSyncService during change detection

**Notification Example:**
```typescript
{
  category: 'import.conflict',
  importance: 'important',
  title: 'ClickUp sync conflict detected',
  message: 'Task "Login Feature" modified both locally and in ClickUp',
  details: {
    object_id: 'obj_999',
    object_name: 'Login Feature',
    object_type: 'Feature',
    conflicting_fields: ['status', 'assignee'],
    local_changes: { 
      status: 'in_progress',
      modified_at: '2025-10-03T09:30:00Z',
      modified_by: 'user_123'
    },
    remote_changes: { 
      status: 'done',
      modified_at: '2025-10-03T10:00:00Z',
      modified_by: 'clickup_user_456'
    },
    resolution: 'kept_remote',  // or 'kept_local', 'needs_manual'
    auto_resolved: true
  },
  source_type: 'integration',
  source_id: 'integration_456',
  action_url: '/admin/graph/objects/obj_999',
  action_label: 'View Object',
  group_key: 'clickup_update_obj_999'
}
```

**User sees:**
- Title: "ClickUp sync conflict detected"
- Message: "Task 'Login Feature' modified both locally and in ClickUp"
- Button: "View Object"
- Badge: Important

---

## 3. Graph Object Events

### 3.1. `graph.object_created`

**When:** New object created in the graph (manual or via import/extraction)  
**Importance:** `other`  
**Triggered by:** ObjectService on successful creation

**Notification Example:**
```typescript
{
  category: 'graph.object_created',
  importance: 'other',
  title: 'New object created',
  message: 'Feature "Multi-tenant Architecture" created',
  details: {
    object_id: 'obj_123',
    object_type: 'Feature',
    object_name: 'Multi-tenant Architecture',
    created_by: 'user_456',
    source: 'manual'  // or 'extraction', 'import'
  },
  source_type: 'graph_object',
  source_id: 'obj_123',
  action_url: '/admin/graph/objects/obj_123',
  action_label: 'View Object',
  group_key: null
}
```

**User sees:**
- Title: "New object created"
- Message: "Feature 'Multi-tenant Architecture' created"
- Tab: Other

---

### 3.2. `graph.object_updated`

**When:** Object properties updated  
**Importance:** `other` (unless user is @mentioned)  
**Triggered by:** ObjectService on update

---

### 3.3. `graph.object_deleted`

**When:** Object deleted from graph  
**Importance:** `other`  
**Triggered by:** ObjectService on deletion

---

### 3.4. `graph.relationship_created`

**When:** New relationship created between objects  
**Importance:** `other`  
**Triggered by:** RelationshipService

---

## 4. Collaboration Events

### 4.1. `collaboration.mention`

**When:** User @mentioned in a comment or note  
**Importance:** `important`  
**Triggered by:** CommentService when @username detected

**Notification Example:**
```typescript
{
  category: 'collaboration.mention',
  importance: 'important',
  title: 'Jane Cooper mentioned you',
  message: '"@john can you review this requirement?"',
  details: {
    comment_id: 'comment_123',
    commenter_id: 'user_456',
    commenter_name: 'Jane Cooper',
    object_id: 'obj_789',
    object_type: 'Requirement',
    object_name: 'User Authentication Flow',
    full_comment: '@john can you review this requirement? I think we need to add multi-factor auth support.',
    mention_context: '...can you review this requirement? I think...'
  },
  source_type: 'graph_object',
  source_id: 'obj_789',
  action_url: '/admin/graph/objects/obj_789#comment-comment_123',
  action_label: 'View Comment',
  group_key: 'object_obj_789_comments'
}
```

**User sees:**
- Title: "Jane Cooper mentioned you"
- Message: '"@john can you review this requirement?"'
- Button: "View Comment" → Scrolls to comment
- Badge: Important

---

### 4.2. `collaboration.comment`

**When:** New comment added to an object user is watching  
**Importance:** `other`  
**Triggered by:** CommentService on new comment

---

### 4.3. `collaboration.assigned`

**When:** User assigned to an object  
**Importance:** `important`  
**Triggered by:** ObjectService when assignee field updated

**Notification Example:**
```typescript
{
  category: 'collaboration.assigned',
  importance: 'important',
  title: 'New task assigned to you',
  message: 'Tom Wilson assigned "API Documentation Review" to you',
  details: {
    object_id: 'obj_999',
    object_type: 'Task',
    object_name: 'API Documentation Review',
    assigned_by: 'user_tom',
    assigned_by_name: 'Tom Wilson',
    due_date: '2025-10-10',
    priority: 'high'
  },
  source_type: 'graph_object',
  source_id: 'obj_999',
  action_url: '/admin/graph/objects/obj_999',
  action_label: 'View Task',
  group_key: null
}
```

**User sees:**
- Title: "New task assigned to you"
- Message: "Tom Wilson assigned 'API Documentation Review' to you"
- Badge: Important

---

### 4.4. `collaboration.review_request`

**When:** User requested to review an object or change  
**Importance:** `important`  
**Triggered by:** ReviewService

---

## 5. System Events

### 5.1. `system.error`

**When:** Critical system error occurs  
**Importance:** `important`  
**Triggered by:** Error monitoring service

**Notification Example:**
```typescript
{
  category: 'system.error',
  importance: 'important',
  title: 'System error detected',
  message: 'Database connection pool exhausted',
  details: {
    error_type: 'database_connection',
    error_message: 'Connection pool timeout after 30s',
    affected_service: 'GraphQueryService',
    timestamp: '2025-10-03T14:30:00Z',
    stack_trace: '...'
  },
  source_type: 'system',
  source_id: 'error_123',
  action_url: '/admin/system/errors',
  action_label: 'View Error Log',
  group_key: null
}
```

---

### 5.2. `system.warning`

**When:** Non-critical system warning  
**Importance:** `other`  
**Triggered by:** Monitoring service

---

### 5.3. `system.rate_limit`

**When:** API rate limit hit (OpenAI, ClickUp, etc.)  
**Importance:** `important`  
**Triggered by:** API client wrapper

---

### 5.4. `system.maintenance`

**When:** Scheduled maintenance planned  
**Importance:** `other`  
**Triggered by:** Admin manually

---

## Summary: What User Sees After Document Import

### Scenario 1: Successful Import with High Confidence

**Document:** "Q4 Requirements.pdf" (45 pages)  
**Result:** 18 entities extracted, all confidence > 0.85

**Notifications Received:**
1. **"Extraction completed"** (Other tab)
   - "Extracted 18 entities from 'Q4 Requirements.pdf'"
   - Shows stats: 18 created, 0 merged, 0 review needed
   - Button: "View Results"

---

### Scenario 2: Import with Low Confidence Items

**Document:** "Architecture Spec.pdf" (80 pages)  
**Result:** 45 entities extracted, 5 below threshold

**Notifications Received:**
1. **"Low confidence extractions"** (Important tab) ⚠️
   - "5 entities extracted with confidence below 0.85 threshold"
   - Button: "Review Items"
   
2. **"Extraction completed"** (Other tab)
   - "Extracted 45 entities from 'Architecture Spec.pdf'"
   - Details: 40 created, 5 requiring review

---

### Scenario 3: ClickUp Sync with Review Items

**Integration:** ClickUp Production  
**Result:** 45 tasks imported, 3 ambiguous type mappings

**Notifications Received:**
1. **"ClickUp Import: 3 items need review"** (Important tab) ⚠️
   - "3 tasks imported with low confidence type mapping"
   - Shows: "Ambiguous type mapping (3 items)"
   - Button: "Review Items"
   
2. **"ClickUp import completed"** (Other tab)
   - "Imported 45 tasks, updated 0 tasks"

---

### Scenario 4: Failed Extraction

**Document:** "Large Spec.pdf" (200 pages)  
**Result:** Failed after 50 pages due to rate limit

**Notifications Received:**
1. **"Extraction failed"** (Important tab) 🔴
   - "Failed to extract from 'Large Spec.pdf': LLM rate limit exceeded"
   - Shows: Processed 50/200 chunks
   - Button: "View Error Details"

---

## Notification Grouping Rules

1. **Same sync job** → Group by `group_key: sync_${syncLog.id}`
   - Example: If sync creates 5 review notifications, they appear as one expandable group

2. **Same extraction job** → Group by `group_key: extraction_job_${job.id}`

3. **Same object comments** → Group by `group_key: object_${object.id}_comments`

4. **Individual events** → No group_key (display as single notification)

---

## Implementation Checklist

When implementing a new feature that should produce notifications:

1. ✅ Import NotificationService into your service
2. ✅ Call `notificationService.create()` at appropriate event point
3. ✅ Choose correct `category` from NotificationCategory enum
4. ✅ Set `importance: 'important'` if requires user action, else `'other'`
5. ✅ Provide clear `title` (< 60 chars) and `message` (< 200 chars)
6. ✅ Include relevant `details` object with structured data
7. ✅ Set `action_url` and `action_label` if user can take action
8. ✅ Use `group_key` to group related notifications
9. ✅ Set `source_type` and `source_id` for traceability
10. ✅ Add notification creation to your integration tests

---

## Related Resources

- [docs/spec/35-admin-notification-inbox.md](spec/35-admin-notification-inbox.md) - Full notification system design
- [docs/spec/34-clickup-integration-refined-design.md](spec/34-clickup-integration-refined-design.md) - ClickUp integration notifications
- [docs/spec/25-extraction-worker.md](spec/25-extraction-worker.md) - Extraction worker notifications
