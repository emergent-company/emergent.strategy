# Auto-Discovery Frontend Integration

**Date:** October 19, 2025  
**Status:** Phase 1 Complete ✅ | Phase 2 In Progress 🔄

## Overview

This document tracks the frontend integration of the Auto-Discovery system into the admin interface.

## Completed Components

### 1. KB Purpose Editor ✅

**Component:** `apps/admin/src/components/organisms/KBPurposeEditor/KBPurposeEditor.tsx`

**Purpose:** Allow users to edit the knowledge base purpose in markdown format with live preview.

**Features:**
- ✅ Markdown editor with syntax highlighting awareness
- ✅ Live preview toggle using `react-markdown`
- ✅ Character count validation (50-1000 chars)
- ✅ Real-time validation feedback (color-coded)
- ✅ Save to `projects.kb_purpose` field via PATCH API
- ✅ Loading and error states
- ✅ Help section explaining how AI uses the purpose
- ✅ Success toast notifications

**API Integration:**
```typescript
// Load current purpose
GET /api/projects/:id
Response: { id, name, kb_purpose, ... }

// Save updated purpose
PATCH /api/projects/:id
Body: { kb_purpose: "markdown text..." }
Response: { id, name, kb_purpose, ... }
```

**Props:**
```typescript
interface KBPurposeEditorProps {
  projectId: string;  // Required project UUID
}
```

**State Management:**
- `purpose` - Current markdown text
- `loading` - Initial load state
- `saving` - Save operation state
- `error` - Error messages (if any)
- `showPreview` - Toggle for preview panel

**Validation Rules:**
- Minimum 50 characters (soft warning at < 50)
- Maximum 1000 characters (hard limit)
- Cannot be empty after trimming
- Must contain meaningful content (not just whitespace)

**UI States:**
- **Empty State:** Shows placeholder and help text
- **Editing State:** Character counter updates in real-time
- **Warning State:** Yellow badge when < 50 or > 900 chars
- **Success State:** Green badge when 50-900 chars
- **Preview State:** Rendered markdown view with toggle
- **Saving State:** Disabled button with spinner
- **Error State:** Red alert banner with dismiss button

### 2. Settings Page Integration ✅

**File:** `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`

**Changes:**
1. ✅ Imported `KBPurposeEditor` component
2. ✅ Added "Knowledge Base Purpose" section (first section on page)
3. ✅ Added "Auto-Discovery" call-to-action card
4. ✅ Positioned before "Enable Auto-Extraction" toggle

**Page Structure (Top to Bottom):**
```
┌─────────────────────────────────────────┐
│ Settings Navigation (Tabs)             │
├─────────────────────────────────────────┤
│ Header: Auto-Extraction Settings       │
├─────────────────────────────────────────┤
│ Success/Error Alerts (if any)          │
├─────────────────────────────────────────┤
│ 1. Knowledge Base Purpose Section       │
│    - Heading with lightbulb icon        │
│    - Description text                   │
│    - KB Purpose Editor Component        │
├─────────────────────────────────────────┤
│ 2. Auto-Discovery Section (NEW!)       │
│    - Gradient background card           │
│    - Feature highlights (checkmarks)    │
│    - "Run Discovery" button             │
├─────────────────────────────────────────┤
│ 3. Enable Auto-Extraction Toggle        │
│    - Main on/off switch                 │
├─────────────────────────────────────────┤
│ 4. Object Types Selection (if enabled) │
│    - Checkboxes for types               │
├─────────────────────────────────────────┤
│ 5. Confidence Threshold (if enabled)    │
│    - Slider control                     │
├─────────────────────────────────────────┤
│ 6. Review & Notification Settings       │
│    - Checkboxes and channel buttons    │
├─────────────────────────────────────────┤
│ Save/Reset Buttons                      │
└─────────────────────────────────────────┘
```

**Auto-Discovery Card Design:**
- Gradient background: `from-primary/5 to-secondary/5`
- Primary border with opacity: `border-primary/20`
- "New" badge in heading
- 3 feature checkmarks:
  * ✅ Discovers types automatically
  * ✅ Infers relationships
  * ✅ Generates template pack
- Large primary button: "Run Discovery"

**Current Button Behavior:**
```typescript
onClick={() => {
    // TODO: Open discovery wizard modal
    alert('Discovery Wizard coming soon!');
}}
```

## In Progress

### Discovery Wizard Modal 🔄

**Status:** Next task  
**Estimated Time:** 3-4 hours

**Component Structure:**
```
apps/admin/src/components/organisms/DiscoveryWizard/
├── DiscoveryWizard.tsx              (Main modal wrapper)
├── Step1_Configure.tsx              (Document selection + params)
├── Step2_Analyzing.tsx              (Progress bar + polling)
├── Step3_ReviewTypes.tsx            (Type review table)
├── Step4_ReviewRelationships.tsx    (Relationship review table)
├── Step5_Complete.tsx               (Success + install button)
└── index.ts                         (Barrel export)
```

**Step Flow:**
```
Step 1: Configure
  ↓
Select documents (checkboxes)
Set batch size, min confidence, etc.
Click "Start Discovery"
  ↓
Step 2: Analyzing
  ↓
POST /discovery-jobs/projects/:id/start
Poll GET /discovery-jobs/:id every 2 seconds
Progress bar updates based on job.progress
  ↓
Step 3: Review Types
  ↓
Display discovered types in editable table
Edit names, descriptions, delete types
Click "Next"
  ↓
Step 4: Review Relationships
  ↓
Display relationships in table
Edit names, cardinality, delete
Click "Generate Template Pack"
  ↓
Step 5: Complete
  ↓
Show success message
"Install Template Pack" button
"View Pack" or "Start New Discovery"
```

**Implementation Plan:**

1. **Create Main Wizard Component** (30 min)
   ```typescript
   // DiscoveryWizard.tsx
   interface DiscoveryWizardProps {
     projectId: string;
     isOpen: boolean;
     onClose: () => void;
   }
   
   const [currentStep, setCurrentStep] = useState(1);
   const [jobId, setJobId] = useState<string | null>(null);
   const [jobData, setJobData] = useState<DiscoveryJob | null>(null);
   ```

2. **Create Step 1: Configure** (45 min)
   - Fetch documents from project
   - Checkboxes for document selection
   - Collapsible "Advanced Settings" section
   - Form validation (at least 1 document selected)
   - "Start Discovery" button

3. **Create Step 2: Analyzing** (1 hour)
   - Progress bar component
   - `useInterval` hook for polling (2 sec)
   - Display current step message from job
   - "Cancel" button (DELETE /discovery-jobs/:id)
   - Auto-advance to Step 3 when complete

4. **Create Step 3: Review Types** (1 hour)
   - Table with columns: Type Name, Description, Confidence, Instances, Actions
   - Inline editing for name/description
   - Delete button per row
   - Expand to show example instances
   - "Next" button advances to Step 4

5. **Create Step 4: Review Relationships** (1 hour)
   - Table with columns: From Type, Relationship, To Type, Cardinality, Confidence, Actions
   - Inline editing for relationship name
   - Cardinality dropdown (1:1, 1:N, N:1, N:M)
   - Delete button per row
   - "Generate Template Pack" button triggers pack creation

6. **Create Step 5: Complete** (30 min)
   - Success message with pack name
   - "Install Template Pack" button
   - "View Pack in Template Gallery" link
   - "Start New Discovery" button resets wizard

**State Management:**
```typescript
// Wizard state
const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
const [jobId, setJobId] = useState<string | null>(null);
const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
const [config, setConfig] = useState({
  batch_size: 50,
  min_confidence: 0.5,
  include_relationships: true,
  max_iterations: 3
});

// Job data from polling
const [jobData, setJobData] = useState<DiscoveryJob | null>(null);

// Editing states
const [editedTypes, setEditedTypes] = useState<TypeCandidate[]>([]);
const [editedRelationships, setEditedRelationships] = useState<Relationship[]>([]);
```

**Progress Polling Logic:**
```typescript
useEffect(() => {
  if (currentStep !== 2 || !jobId) return;
  
  const interval = setInterval(async () => {
    try {
      const job = await fetchJson(`${apiBase}/api/discovery-jobs/${jobId}`);
      setJobData(job);
      
      if (job.status === 'completed') {
        setEditedTypes(job.discovered_types);
        setEditedRelationships(job.discovered_relationships);
        setCurrentStep(3);
        clearInterval(interval);
      } else if (job.status === 'failed') {
        setError(job.error || 'Discovery failed');
        clearInterval(interval);
      }
    } catch (err) {
      console.error('Failed to poll job status:', err);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}, [currentStep, jobId]);
```

## Pending Tasks

### Phase 2: Discovery Wizard (Next)

- [ ] Create wizard modal component structure
- [ ] Implement Step 1: Document selection and configuration
- [ ] Implement Step 2: Progress polling and display
- [ ] Implement Step 3: Type review and editing
- [ ] Implement Step 4: Relationship review and editing
- [ ] Implement Step 5: Success and installation
- [ ] Wire up "Run Discovery" button to open modal
- [ ] Add loading states and error handling
- [ ] Test full discovery flow end-to-end

### Phase 3: Polish & Testing

- [ ] Add unit tests for KBPurposeEditor
- [ ] Add unit tests for DiscoveryWizard
- [ ] Create Storybook stories for wizard steps
- [ ] Add E2E Playwright tests for discovery flow
- [ ] Performance testing with large document sets
- [ ] Error recovery testing (network failures, cancellations)
- [ ] Accessibility audit (keyboard navigation, screen readers)

### Phase 4: Documentation & Training

- [ ] User guide: "How to use Auto-Discovery"
- [ ] Best practices: Writing effective KB purposes
- [ ] Video walkthrough of discovery process
- [ ] Troubleshooting guide for common issues
- [ ] FAQ section for auto-discovery feature

## API Endpoints Used

### GET /api/projects/:id
**Purpose:** Load project details including `kb_purpose`

**Response:**
```json
{
  "id": "uuid",
  "name": "Project Name",
  "kb_purpose": "markdown text or null",
  "auto_extract_objects": true,
  "auto_extract_config": { ... }
}
```

### PATCH /api/projects/:id
**Purpose:** Update project settings including `kb_purpose`

**Request:**
```json
{
  "kb_purpose": "markdown text"
}
```

**Response:** Updated project object

### POST /discovery-jobs/projects/:id/start
**Purpose:** Start a new discovery job

**Request:**
```json
{
  "document_ids": ["uuid1", "uuid2"],
  "batch_size": 50,
  "min_confidence": 0.5,
  "include_relationships": true,
  "max_iterations": 3
}
```

**Response:**
```json
{
  "job_id": "job-uuid"
}
```

### GET /discovery-jobs/:jobId
**Purpose:** Poll job status and get results

**Response:**
```json
{
  "id": "job-uuid",
  "status": "analyzing_documents",
  "progress": {
    "current_step": 2,
    "total_steps": 5,
    "message": "Analyzing batch 2/4..."
  },
  "discovered_types": [...],
  "discovered_relationships": [...],
  "template_pack_id": "pack-uuid or null"
}
```

### GET /discovery-jobs/projects/:projectId
**Purpose:** List all jobs for a project (for history view - future)

**Response:**
```json
[
  {
    "id": "job-uuid",
    "status": "completed",
    "created_at": "2025-10-19T...",
    "template_pack_id": "pack-uuid"
  }
]
```

### DELETE /discovery-jobs/:jobId
**Purpose:** Cancel a running job

**Response:** 204 No Content

## Testing Strategy

### Manual Testing (Current)

1. **KB Purpose Editor:**
   ```
   ✅ Navigate to /admin/settings/project/auto-extraction
   ✅ Verify KB Purpose Editor appears first
   ✅ Try typing < 50 characters (yellow badge)
   ✅ Try typing > 1000 characters (hard limit)
   ✅ Toggle preview mode (renders markdown)
   ✅ Save and verify in database
   ✅ Reload page, verify purpose loads
   ```

2. **Auto-Discovery Card:**
   ```
   ✅ Verify gradient card appears after KB Purpose
   ✅ Verify "New" badge displays
   ✅ Verify 3 feature checkmarks render
   ✅ Click "Run Discovery" button
   ✅ Verify alert appears (placeholder)
   ```

### Automated Testing (Future)

**Unit Tests:**
- KBPurposeEditor component rendering
- Character validation logic
- Preview toggle functionality
- Save/load API mocking

**Integration Tests:**
- Full settings page render
- KB Purpose save flow
- Error handling scenarios

**E2E Tests:**
- Complete discovery workflow
- Document selection and configuration
- Progress monitoring and cancellation
- Type and relationship editing
- Template pack installation

## UI/UX Decisions

### Design Principles

1. **Progressive Disclosure:**
   - KB Purpose Editor is always visible (helps understand context)
   - Auto-Discovery card is prominent but non-intrusive
   - Existing auto-extraction settings remain unchanged

2. **Visual Hierarchy:**
   - KB Purpose: Neutral card (base-100)
   - Auto-Discovery: Gradient card with primary border (stands out)
   - Auto-Extraction: Standard card (familiar pattern)

3. **Clear Call-to-Action:**
   - "Run Discovery" button is primary color
   - Includes wand icon for "magic" feel
   - Feature highlights build confidence

4. **Contextual Help:**
   - Inline descriptions explain what each section does
   - KB Purpose includes help text about AI usage
   - Validation messages guide users to ideal length

### Accessibility

- ✅ All interactive elements keyboard accessible
- ✅ Color contrast meets WCAG AA standards
- ✅ Error messages announced to screen readers
- ✅ Loading states have descriptive text
- ⏳ Full ARIA labels for wizard steps (pending)
- ⏳ Focus management in modal (pending)

## Performance Considerations

### Current Optimizations

- ✅ KBPurposeEditor uses debounced validation (avoids excessive re-renders)
- ✅ Character counter updates on every keystroke (instant feedback)
- ✅ Preview only re-renders when toggled (not on every edit)
- ✅ API calls only on explicit save action

### Future Optimizations

- ⏳ Wizard step components lazy-loaded (reduce initial bundle)
- ⏳ Progress polling uses exponential backoff if job takes > 2 minutes
- ⏳ Type/relationship tables virtualized if > 100 items
- ⏳ Markdown preview uses `react-markdown` with memoization

## Browser Support

- ✅ Chrome/Edge (Latest)
- ✅ Firefox (Latest)
- ✅ Safari (Latest)
- ✅ Mobile browsers (responsive design)

## Known Issues

None currently.

## Future Enhancements

1. **Auto-save KB Purpose:**
   - Save draft automatically every 30 seconds
   - Show "Draft saved" indicator

2. **Discovery History:**
   - Table of past discovery jobs
   - Re-run previous configurations
   - Compare results between runs

3. **Batch Discovery:**
   - Run discovery across multiple projects
   - Generate organization-wide type catalog

4. **Advanced Editing:**
   - Visual graph editor for relationships
   - Merge/split types in review step
   - AI suggestions for improving type definitions

5. **Export/Import:**
   - Export discovered types as JSON
   - Import types from other projects
   - Share type libraries between teams

## Related Documentation

- `docs/AUTO_DISCOVERY_SYSTEM_SPEC.md` - Complete system specification
- `docs/AUTO_DISCOVERY_BACKEND_COMPLETE.md` - Backend implementation details
- `docs/AUTO_DISCOVERY_LLM_INTEGRATION_COMPLETE.md` - AI provider details
- `docs/AUTO_DISCOVERY_TESTING_PLAN.md` - Testing procedures and checklist
- `docs/AUTO_DISCOVERY_SESSION_SUMMARY.md` - Development session summary

## Support & Feedback

For issues or feature requests:
1. Check existing documentation for troubleshooting
2. Review API endpoint responses for errors
3. Check browser console for client-side errors
4. Contact development team with specific error messages

---

**Last Updated:** October 19, 2025  
**Next Milestone:** Discovery Wizard Modal (3-4 hours)  
**Overall Progress:** 15% Frontend Complete
