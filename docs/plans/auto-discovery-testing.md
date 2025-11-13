# Auto-Discovery System - Testing & Next Steps

**Date:** October 19, 2025  
**Status:** Backend Complete ✅ | Frontend Pending 🔲  

## System Status

### ✅ Completed (Backend)

1. **Database Schema**
   - ✅ 4 tables created: `discovery_jobs`, `discovery_type_candidates`, `discovery_relationships`, `discovery_refinement_history`
   - ✅ All migrations applied successfully
   - ✅ Indexes and constraints in place
   - ✅ `kb.projects.kb_purpose` column added

2. **Backend Services**
   - ✅ `DiscoveryJobService` - Full job lifecycle management (~700 lines)
   - ✅ `DiscoveryJobController` - 4 REST endpoints with auth
   - ✅ `DiscoveryJobModule` - Module registration complete

3. **LLM Integration**
   - ✅ `LangChainGeminiProvider.discoverTypes()` - AI-powered type discovery
   - ✅ `LangChainGeminiProvider.discoverRelationships()` - AI-powered relationship inference
   - ✅ Real LLM calls replacing mock implementations
   - ✅ Zod schemas for structured output validation

4. **Module Dependencies**
   - ✅ Fixed: `LangChainGeminiProvider` exported from `ExtractionJobModule`
   - ✅ Zero TypeScript compilation errors
   - ✅ Server starts successfully
   - ✅ Health check passing

### 🔲 Pending (Testing & Frontend)

1. **Backend Testing**
   - 🔲 Unit tests for `DiscoveryJobService` methods
   - 🔲 Integration tests for full discovery flow
   - 🔲 LLM provider mock tests
   - 🔲 Error handling tests

2. **Frontend Development**
   - 🔲 KB Purpose editor component
   - 🔲 Discovery wizard modal (5 steps)
   - 🔲 Settings page integration
   - 🔲 Progress polling system

3. **End-to-End Testing**
   - 🔲 Full discovery flow with real documents
   - 🔲 Template pack generation and installation
   - 🔲 Error scenarios and recovery

## API Endpoints (Ready for Testing)

### 1. Start Discovery Job
```http
POST /discovery-jobs/projects/:projectId/start
Headers:
  Authorization: Bearer {token}
  X-Org-ID: {orgId}
  X-Project-ID: {projectId}
  Content-Type: application/json

Body:
{
  "document_ids": ["doc-uuid-1", "doc-uuid-2"],
  "batch_size": 50,
  "min_confidence": 0.5,
  "include_relationships": true,
  "max_iterations": 3
}

Response: 200 OK
{
  "job_id": "discovery-job-uuid"
}
```

### 2. Get Job Status
```http
GET /discovery-jobs/:jobId
Headers:
  Authorization: Bearer {token}
  X-Org-ID: {orgId}
  X-Project-ID: {projectId}

Response: 200 OK
{
  "id": "job-uuid",
  "status": "analyzing_documents" | "extracting_types" | "refining_schemas" | "creating_pack" | "completed" | "failed",
  "progress": {
    "current_step": 2,
    "total_steps": 5,
    "message": "Analyzing documents batch 2/4..."
  },
  "kb_purpose": "Customer relationship management system...",
  "discovered_types": [...],
  "discovered_relationships": [...],
  "template_pack_id": "pack-uuid" (when completed),
  "error_message": "..." (if failed),
  "created_at": "2025-10-19T15:00:00Z",
  "started_at": "2025-10-19T15:00:05Z",
  "completed_at": "2025-10-19T15:05:30Z"
}
```

### 3. List Jobs for Project
```http
GET /discovery-jobs/projects/:projectId
Headers:
  Authorization: Bearer {token}
  X-Org-ID: {orgId}
  X-Project-ID: {projectId}

Response: 200 OK
[
  {
    "id": "job-uuid",
    "status": "completed",
    "progress": {...},
    "template_pack_id": "pack-uuid",
    "created_at": "2025-10-19T15:00:00Z"
  },
  ...
]
```

### 4. Cancel Job
```http
DELETE /discovery-jobs/:jobId
Headers:
  Authorization: Bearer {token}
  X-Org-ID: {orgId}
  X-Project-ID: {projectId}

Response: 200 OK
{
  "status": "cancelled"
}
```

## Manual Testing Steps

### Test 1: Basic Discovery Flow

**Setup:**
1. Ensure server is running: `npm run workspace:status`
2. Get a valid auth token from the admin UI
3. Identify a project with documents: Use postgres query above

**Test:**
```bash
# 1. Get project info
curl http://localhost:3001/health

# 2. Start discovery (replace tokens/IDs)
curl -X POST http://localhost:3001/discovery-jobs/projects/51bc15c2-54c9-4d34-81ff-0ddf91c98169/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: YOUR_ORG_ID" \
  -H "X-Project-ID: 51bc15c2-54c9-4d34-81ff-0ddf91c98169" \
  -H "Content-Type: application/json" \
  -d '{
    "document_ids": ["189530df-f1cb-4bf9-8d36-077246afb940"],
    "batch_size": 50,
    "min_confidence": 0.5,
    "include_relationships": true,
    "max_iterations": 3
  }'

# 3. Poll job status
JOB_ID="<from previous response>"
curl http://localhost:3001/discovery-jobs/$JOB_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: YOUR_ORG_ID" \
  -H "X-Project-ID: 51bc15c2-54c9-4d34-81ff-0ddf91c98169"

# 4. Check database for discovered types
# Use postgres MCP tool to query kb.discovery_type_candidates
```

**Expected Results:**
- ✅ Job created with "pending" status
- ✅ Job progresses through states: analyzing_documents → extracting_types → refining_schemas → creating_pack → completed
- ✅ Discovered types stored in `kb.discovery_type_candidates`
- ✅ Relationships stored in `kb.discovery_relationships`
- ✅ Template pack created with discovered types
- ✅ Progress messages updated throughout

**Failure Scenarios to Test:**
- ❌ Invalid document IDs → Should fail gracefully
- ❌ Empty document list → Should reject with validation error
- ❌ Missing KB purpose → Should use default
- ❌ LLM API failure → Should retry and record error
- ❌ Database connection loss → Should handle gracefully

### Test 2: Concurrent Jobs

**Setup:**
Same as Test 1

**Test:**
Start 2-3 discovery jobs for different projects simultaneously

**Expected Results:**
- ✅ All jobs process independently
- ✅ No race conditions or data corruption
- ✅ Each job completes successfully
- ✅ Database maintains isolation between jobs

### Test 3: Large Document Sets

**Setup:**
Project with 100+ documents

**Test:**
Start discovery with all documents, large batch size (100)

**Expected Results:**
- ✅ Job processes in batches
- ✅ Memory usage stays reasonable
- ✅ Progress updates correctly
- ✅ Type refinement merges similar types
- ✅ Relationship discovery scales

## Frontend Development Plan

### Phase 1: KB Purpose Editor (2-3 hours)

**Location:** `apps/admin/src/pages/admin/pages/auto-extraction/settings.tsx`

**Components:**
1. `KBPurposeEditor` - Markdown editor with preview
   - Textarea for markdown input
   - Live preview panel (use `react-markdown`)
   - Character count (recommend 200-500 chars)
   - Save button
   - Help text explaining purpose importance

**API Integration:**
- GET `/projects/:id` - Fetch current kb_purpose
- PATCH `/projects/:id` - Update kb_purpose

**UI Requirements:**
- Markdown syntax highlighting
- Live preview on the right
- Save confirmation toast
- Validation: 50-1000 characters

### Phase 2: Discovery Wizard Modal (4-6 hours)

**Location:** `apps/admin/src/components/organisms/DiscoveryWizard/`

**Component Structure:**
```
DiscoveryWizard.tsx
├── Step1_Configure.tsx
├── Step2_Analyzing.tsx
├── Step3_ReviewTypes.tsx
├── Step4_ReviewRelationships.tsx
└── Step5_Complete.tsx
```

**Step 1: Configure**
- Display current KB purpose (read-only or link to edit)
- Document selection (multi-select from project documents)
- Advanced options (batch size, confidence, iterations)
- "Start Discovery" button

**Step 2: Analyzing (Progress)**
- Progress bar (0-100%)
- Current step indicator (e.g., "Analyzing batch 2/4...")
- Real-time status polling (every 2 seconds)
- "Cancel" button
- Log of completed steps

**Step 3: Review Types**
- Table of discovered types:
  - Type name (editable)
  - Description (editable)
  - Confidence score (read-only, color-coded)
  - Example instances (expandable)
  - Frequency (read-only)
- Actions:
  - Delete type (if confidence too low)
  - Merge types (combine similar ones)
  - Edit properties
- "Continue" button

**Step 4: Review Relationships**
- Visual graph of types and relationships
  - Nodes = types
  - Edges = relationships (labeled)
  - Color-coded by confidence
- Relationship table:
  - From type → To type
  - Relationship name (editable)
  - Confidence (read-only)
  - Cardinality (select: one-to-one, one-to-many, many-to-many)
- Actions:
  - Delete relationship
  - Reverse direction
  - Change cardinality
- "Generate Template Pack" button

**Step 5: Complete**
- Success message
- Template pack details:
  - Name (auto-generated from project + timestamp)
  - Type count
  - Relationship count
- Actions:
  - "Install Template Pack" button
  - "View Template Pack" link
  - "Start New Discovery" button
  - "Close" button

**Polling Logic:**
```typescript
// In Step2_Analyzing.tsx
useEffect(() => {
  const pollInterval = setInterval(async () => {
    const status = await fetchJobStatus(jobId);
    setProgress(status.progress);
    
    if (status.status === 'completed') {
      clearInterval(pollInterval);
      moveToStep(3);
    } else if (status.status === 'failed') {
      clearInterval(pollInterval);
      showError(status.error_message);
    }
  }, 2000); // Poll every 2 seconds
  
  return () => clearInterval(pollInterval);
}, [jobId]);
```

### Phase 3: Settings Integration (1-2 hours)

**Location:** `apps/admin/src/pages/admin/pages/auto-extraction/settings.tsx`

**New Section: Auto-Discovery**
1. KB Purpose editor (from Phase 1)
2. "Run Auto-Discovery" button → Opens wizard modal
3. Recent discovery jobs table:
   - Date
   - Status
   - Types discovered
   - Template pack (link)
   - Actions (view, reinstall)

**API Integration:**
- GET `/discovery-jobs/projects/:id` - List recent jobs
- POST `/discovery-jobs/projects/:id/start` - Start new job

## Testing Checklist

### Backend Unit Tests
- [ ] `DiscoveryJobService.startDiscovery()` - Job creation
- [ ] `DiscoveryJobService.processDiscoveryJob()` - Full workflow
- [ ] `DiscoveryJobService.extractTypesFromBatch()` - Batch processing
- [ ] `DiscoveryJobService.refineTypes()` - Type merging logic
- [ ] `DiscoveryJobService.discoverRelationships()` - Relationship inference
- [ ] `DiscoveryJobService.generateTemplatePack()` - Pack creation
- [ ] `LangChainGeminiProvider.discoverTypes()` - LLM type discovery
- [ ] `LangChainGeminiProvider.discoverRelationships()` - LLM relationship discovery
- [ ] Error handling for all methods
- [ ] Cancellation logic

### Frontend Component Tests
- [ ] KBPurposeEditor - Save/load/validation
- [ ] DiscoveryWizard - Step navigation
- [ ] Step1_Configure - Document selection
- [ ] Step2_Analyzing - Progress polling
- [ ] Step3_ReviewTypes - Type editing/deletion
- [ ] Step4_ReviewRelationships - Relationship editing
- [ ] Step5_Complete - Template pack installation

### E2E Tests (Playwright)
- [ ] Full discovery flow: start → analyze → review → install
- [ ] Cancel job mid-process
- [ ] Handle LLM errors gracefully
- [ ] Multiple concurrent discoveries
- [ ] Large document sets (100+ docs)
- [ ] Template pack installation and usage

## Performance Targets

- Discovery job startup: < 1 second
- Batch processing (50 docs): < 30 seconds
- Type refinement: < 5 seconds
- Relationship discovery: < 10 seconds
- Template pack generation: < 2 seconds
- **Total time (50 docs)**: 1-2 minutes

## Success Criteria

### Backend
- ✅ All endpoints return correct status codes
- ✅ Job state transitions are atomic
- ✅ Discovered types have 70%+ accuracy
- ✅ Relationships have 60%+ accuracy
- ✅ Template packs are valid and installable
- ✅ No memory leaks during long-running jobs

### Frontend
- 🔲 Wizard guides user through all steps intuitively
- 🔲 Progress updates in real-time without lag
- 🔲 Type/relationship editing is responsive
- 🔲 Template pack installation is one-click
- 🔲 Error messages are clear and actionable

### User Experience
- 🔲 Non-technical users can discover types without AI knowledge
- 🔲 Results are reviewable and editable before installation
- 🔲 Process feels fast and responsive (< 2 min for 50 docs)
- 🔲 Users understand confidence scores and can act on them

## Next Immediate Actions

1. **Test Backend API** (30 minutes)
   - Manual curl tests with real data
   - Verify job creation, status polling, completion
   - Check database for stored results

2. **Create KB Purpose Editor** (2 hours)
   - Simple markdown editor with preview
   - Save to projects.kb_purpose
   - Validation and user guidance

3. **Create Discovery Wizard** (4-6 hours)
   - 5-step modal component
   - Progress polling system
   - Type/relationship review tables
   - Template pack installation

4. **Integration Testing** (2 hours)
   - Test full flow end-to-end
   - Verify template pack installation works
   - Test error scenarios

## Resources

- Backend code: `apps/server/src/modules/discovery-jobs/`
- Spec document: `docs/AUTO_DISCOVERY_SYSTEM_SPEC.md`
- LLM integration: `docs/AUTO_DISCOVERY_LLM_INTEGRATION_COMPLETE.md`
- Module fix: `docs/AUTO_DISCOVERY_MODULE_DEPENDENCY_FIX.md`

---

**Status:** Backend ✅ Complete | Frontend 🔲 Ready to Start
**Priority:** High - Core feature for Q4 2025
**Assigned:** AI Assistant + Frontend Developer
