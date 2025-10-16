# Automatic Object Extraction Flow

This document visualizes the complete flow from document upload to notification delivery.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS DOCUMENT                        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      INGESTION SERVICE                               │
│  POST /ingest/upload                                                │
│                                                                      │
│  1. Save document to kb.documents                                   │
│  2. Generate chunks → kb.chunks                                     │
│  3. Generate embeddings (if enabled)                                │
│  4. Check project.auto_extract_objects setting ────┐                │
└──────────────────────────────────────────────────┬─┘                │
                                                   │                  │
                          ┌────────────────────────┘                  │
                          │                                           │
                          │ IF auto_extract = true                    │
                          ▼                                           │
┌─────────────────────────────────────────────────────────────────────┐
│                   CREATE EXTRACTION JOB                             │
│  POST /extraction-jobs (automatic)                                  │
│                                                                      │
│  job = {                                                            │
│    source_type: "document",                                         │
│    source_id: documentId,                                           │
│    allowed_types: config.enabled_types,                             │
│    extraction_config: {                                             │
│      min_confidence: 0.7,                                           │
│      require_review: false                                          │
│    }                                                                │
│  }                                                                  │
│                                                                      │
│  Status: "pending"                                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   RETURN TO USER                                    │
│  {                                                                  │
│    "documentId": "abc-123",                                         │
│    "chunks": 42,                                                    │
│    "alreadyExists": false,                                          │
│    "extractionJobId": "job-xyz-789",      ← NEW                     │
│    "extractionJobStatus": "pending"       ← NEW                     │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘

         │
         │ Background Processing
         ▼
         
┌─────────────────────────────────────────────────────────────────────┐
│                   EXTRACTION WORKER (Background)                     │
│                                                                      │
│  Every 30 seconds:                                                  │
│    1. Poll for pending jobs                                         │
│    2. Process batch                                                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PROCESS EXTRACTION JOB                            │
│                                                                      │
│  1. Load document content from kb.documents                         │
│  2. Load project type registry                                      │
│  3. Get extraction prompts from template pack                       │
│  4. For each enabled object type:                                   │
│     a. Build prompt with type schema                                │
│     b. Call LLM (Gemini) to extract entities                        │
│     c. Parse and validate JSON response                             │
│  5. Entity Linking:                                                 │
│     - Check if similar objects exist                                │
│     - Merge or create new objects                                   │
│  6. Create relationships between objects                            │
│  7. Calculate quality metrics:                                      │
│     - Confidence scores                                             │
│     - Objects needing review                                        │
│     - Type breakdown                                                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   UPDATE JOB STATUS                                 │
│                                                                      │
│  job.status = "completed"                                           │
│  job.completed_at = now()                                           │
│  job.result_summary = {                                             │
│    objects_created: 15,                                             │
│    objects_updated: 3,                                              │
│    relationships_created: 8,                                        │
│    objects_by_type: {                                               │
│      "Requirement": 5,                                              │
│      "Decision": 3,                                                 │
│      "Risk": 2,                                                     │
│      "Person": 3,                                                   │
│      "Organization": 2                                              │
│    },                                                               │
│    average_confidence: 0.87,                                        │
│    objects_requiring_review: 2,                                     │
│    duration_seconds: 12.3                                           │
│  }                                                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CREATE NOTIFICATION                               │
│  INSERT INTO kb.notifications                                       │
│                                                                      │
│  notification = {                                                   │
│    user_id: job.created_by,                                         │
│    type: "extraction_complete",                                     │
│    title: "Object Extraction Complete",                             │
│    message: "Extracted 15 objects from 'requirements.pdf'...",      │
│    severity: "success",                                             │
│    details: {                                                       │
│      summary: job.result_summary,                                   │
│      document: { id, name }                                         │
│    },                                                               │
│    actions: [                                                       │
│      {                                                              │
│        label: "View Extracted Objects",                             │
│        url: "/admin/objects?extraction_job_id=job-xyz-789"          │
│      },                                                             │
│      {                                                              │
│        label: "Review 2 Objects",                                   │
│        url: "/admin/objects?needs_review=true&..."                  │
│      }                                                              │
│    ]                                                                │
│  }                                                                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ├─────────────┐
                                 │             │
                                 ▼             ▼
┌──────────────────────────────────┐  ┌───────────────────────────────┐
│     WEBSOCKET/SSE PUSH           │  │    STORE IN DATABASE          │
│  (Real-time to connected users)  │  │  (Persistent for later view)  │
│                                  │  │                               │
│  emit('notification', {          │  │  kb.notifications             │
│    id: "notif-123",              │  │  read: false                  │
│    type: "extraction_complete",  │  │  dismissed: false             │
│    ...                           │  │                               │
│  })                              │  │                               │
└────────────────┬─────────────────┘  └───────────────┬───────────────┘
                 │                                    │
                 └────────────────┬───────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      USER SEES NOTIFICATION                          │
│                                                                      │
│  [🔔 1]  ← Badge shows unread count                                 │
│                                                                      │
│  Dropdown shows:                                                    │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ ✅ Object Extraction Complete                        │          │
│  │ Extracted 15 objects from "requirements.pdf"         │          │
│  │                                                       │          │
│  │ Created: 15 | Updated: 3 | Relations: 8              │          │
│  │                                                       │          │
│  │ Types: 5 Requirements, 3 Decisions, 2 Risks...       │          │
│  │                                                       │          │
│  │ ⚠️ 2 objects need review                             │          │
│  │                                                       │          │
│  │ [View Extracted Objects] [Review 2 Objects]          │          │
│  │                                                       │          │
│  │ Completed in 12.3s                                   │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ User clicks "View Extracted Objects"
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      OBJECTS PAGE                                   │
│  /admin/objects?extraction_job_id=job-xyz-789                       │
│                                                                      │
│  Table shows:                                                       │
│  - 15 objects created by this extraction job                        │
│  - Filtered by extraction_job_id                                    │
│  - Badge indicates "Extracted" source                               │
│  - Objects with needs_review=true highlighted                       │
│  - User can edit, approve, reject objects                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

```
User            Ingestion       Extraction      Extraction     Notification    User
                Service         Job API         Worker         Service         UI
 │                │               │                │               │            │
 │──Upload Doc──>│               │                │               │            │
 │               │               │                │               │            │
 │               │─Save doc/chunks               │               │            │
 │               │               │                │               │            │
 │               │─Check auto_extract?           │               │            │
 │               │               │                │               │            │
 │               │─Create Job──>│                │               │            │
 │               │               │                │               │            │
 │<──Response────│               │                │               │            │
 │ (with jobId)  │               │                │               │            │
 │               │               │                │               │            │
 │               │               │                │               │            │
 │               │               │   [Background Worker Loop]     │            │
 │               │               │                │               │            │
 │               │               │   <─Poll Jobs──│               │            │
 │               │               │                │               │            │
 │               │               │   ─Process────>│               │            │
 │               │               │                │               │            │
 │               │               │                │  [Extract     │            │
 │               │               │                │   Objects]    │            │
 │               │               │                │               │            │
 │               │               │   <─Update──────│               │            │
 │               │               │     Status      │               │            │
 │               │               │     Complete    │               │            │
 │               │               │                │               │            │
 │               │               │                │──Create────>│            │
 │               │               │                │  Notification│            │
 │               │               │                │              │            │
 │               │               │                │              │─WebSocket─>│
 │               │               │                │              │   Push     │
 │               │               │                │              │            │
 │               │               │                │              │            │🔔 Bell
 │               │               │                │              │            │ Badge
 │               │               │                │              │            │ Updates
 │               │               │                │              │            │
 │────────────────────────View Notification─────────────────────────────────>│
 │               │               │                │              │            │
 │────────────────────────Click Action (View Objects)───────────────────────>│
 │               │               │                │              │            │
 │<──────────────────────Objects Page (filtered)─────────────────────────────│
```

---

## Error Flow

```
Document Upload
      │
      ├─> Extraction Job Created (status: pending)
      │
      ├─> Worker Picks Up Job
      │
      ├─> Processing...
      │
      ├─> ERROR! (LLM timeout, invalid response, etc.)
      │
      ├─> Update Job Status (status: failed, error_message: "...")
      │
      ├─> Create Error Notification
      │     type: "extraction_failed"
      │     severity: "error"
      │     message: "Failed to extract objects: LLM request timeout"
      │     actions: [
      │       { label: "View Job Details", url: "/admin/extraction-jobs/..." },
      │       { label: "Retry Extraction", action: "retry_extraction" }
      │     ]
      │
      └─> User Receives Notification
            ├─> Views error details
            └─> Can retry extraction job
```

---

## Configuration Flow

```
Project Settings Page
  /admin/settings/extraction
      │
      ├─> Toggle: "Automatically extract objects from uploaded documents"
      │     [x] Enabled
      │
      ├─> Select: "Enabled Object Types"
      │     [x] Requirement
      │     [x] Decision
      │     [x] Risk
      │     [ ] Person (optional)
      │
      ├─> Slider: "Minimum Confidence Threshold"
      │     0.7 (70%)
      │
      ├─> Checkbox: "Require manual review for all extracted objects"
      │     [ ] Disabled
      │
      ├─> Checkbox: "Send notification when extraction completes"
      │     [x] Enabled
      │
      └─> Save
            │
            └─> Updates kb.projects:
                  auto_extract_objects = true
                  auto_extract_config = {
                    enabled_types: ["Requirement", "Decision", "Risk"],
                    min_confidence: 0.7,
                    require_review: false,
                    notify_on_complete: true
                  }
```

---

## Key Benefits

1. **Zero Manual Trigger**: Users don't need to remember to create extraction jobs
2. **Immediate Feedback**: Notification appears as soon as extraction completes
3. **Detailed Summary**: See exactly what was extracted without navigating to objects page
4. **Quick Actions**: One-click navigation to view or review extracted objects
5. **Quality Transparency**: Know upfront if objects need review or have low confidence
6. **Type Breakdown**: Understand what types of objects were found
7. **Configurable**: Projects can enable/disable and customize behavior
8. **Error Visibility**: Failed extractions generate error notifications with retry option

---

## Implementation Checklist

### Backend
- [ ] Add `auto_extract_objects` and `auto_extract_config` columns to `kb.projects`
- [ ] Update `IngestionService` to check config and create extraction jobs
- [ ] Create `kb.notifications` table
- [ ] Implement `NotificationService` with CRUD operations
- [ ] Add notification creation in `ExtractionWorkerService.processJob()`
- [ ] Build notification REST API endpoints
- [ ] Implement WebSocket gateway for real-time push

### Frontend
- [ ] Create `NotificationBell` component with dropdown
- [ ] Build notification item components by type
- [ ] Add extraction summary display with stats
- [ ] Implement mark as read/dismiss actions
- [ ] Add project settings page for auto-extraction config
- [ ] Subscribe to WebSocket notifications for real-time updates
- [ ] Show extraction job status badge on documents page
- [ ] Filter objects by extraction_job_id

### Testing
- [ ] Unit tests for auto-extraction trigger logic
- [ ] Integration tests for end-to-end flow
- [ ] E2E tests with Playwright for UI interactions
- [ ] Load testing for notification delivery at scale
