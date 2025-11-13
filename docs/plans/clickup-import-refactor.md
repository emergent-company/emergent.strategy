# ClickUp Import Refactor Plan

**Date:** October 21, 2025  
**Status:** 🔵 PLANNED - Ready for Implementation

## Problem Statement

### Issue 1: Too Many Documents Created
Currently, ClickUp sync creates **one document per page**, resulting in hundreds of fragmented documents:
- Each ClickUp Doc gets 1 document
- Each Page inside the Doc gets its own separate document
- For a Doc with 50 pages = 51 documents in our system

**Example:**
- ClickUp Doc: "Project Requirements" (has 10 pages)
- Current behavior: Creates 11 documents (1 doc + 10 pages)
- Desired behavior: Create 1 document containing full content

### Issue 2: Automatic Extraction Creation
After importing documents, the system automatically creates extraction jobs, which:
- Happens without user review
- Creates jobs with empty `extraction_config: {}`
- Wastes LLM API calls on unreviewed content
- Clutters extraction jobs list

**User Workflow Issue:**
- User imports 100 ClickUp pages
- System creates 100 extraction jobs automatically
- User must manually cancel unwanted jobs
- No chance to review documents first

### Issue 3: Missing Bulk Cancel Action
Users have no way to cancel multiple extraction jobs at once:
- Must click into each job individually
- Time-consuming for hundreds of jobs
- "New Extraction" button exists but is not implemented
- Action menu would be more useful for bulk operations

## Solution Overview

### 1. Combine Pages into Single Document (Priority 1)
**Change:** Store ClickUp Doc + all its Pages as **one document** with combined content

**Benefits:**
- Reduces document count by 90%+
- Easier to navigate and review
- Matches user mental model (Doc = Document)
- Single extraction job per Doc instead of per Page

### 2. Remove Auto-Extraction (Priority 1)
**Change:** Do NOT create extraction jobs after import

**Benefits:**
- Matches file upload behavior (also doesn't auto-extract)
- User reviews documents first
- User manually triggers extraction when ready
- No wasted API calls on unwanted content

### 3. Replace "New Extraction" with Actions Menu (Priority 2)
**Change:** Add dropdown action menu with bulk operations

**Features:**
- Bulk cancel selected jobs
- Bulk delete cancelled/failed jobs
- Bulk retry failed jobs
- Select all / deselect all checkboxes

## Implementation Plan

### Phase 1: Stop Creating Extraction Jobs (CRITICAL - Do First)

#### 1.1. Locate Auto-Extraction Code

**File:** `apps/server/src/modules/clickup/clickup-import.service.ts`

**Current code** (in `storeDocument` method, lines ~975-1000):
```typescript
const extractionJob = await this.extractionJobService.createJob({
    organization_id: orgId,
    project_id: projectId,
    source_type: ExtractionSourceType.DOCUMENT,
    source_id: documentId,
    source_metadata: { /* ... */ },
    extraction_config: {}, // ← This is also empty!
});
```

#### 1.2. Remove Extraction Job Creation

**Action:** Comment out or delete the extraction job creation entirely

**Reason:**
1. Matches file upload behavior (no auto-extraction)
2. Prevents empty config bug
3. User can manually trigger extraction later

**Modified code:**
```typescript
// DO NOT create extraction job automatically
// User will manually trigger extraction after reviewing documents
// This matches file upload behavior

// REMOVED: await this.extractionJobService.createJob({ ... });
```

#### 1.3. Update Progress Messages

**File:** `apps/server/src/modules/clickup/clickup-import.service.ts`

**Remove references to:**
- "Creating extraction job..."
- "Extraction job created"

**Keep:**
- "Document stored successfully"
- Import counts and progress

### Phase 2: Combine Pages into Single Document

#### 2.1. Understand Current Structure

**Current behavior:**
```
importDocs()
  ├─ storeDocument(doc) → creates document #1
  └─ importPages()
      └─ storeDocument(page1) → creates document #2
      └─ storeDocument(page2) → creates document #3
      └─ ...
```

**Files involved:**
- `clickup-import.service.ts` (lines 625-750: importDocs)
- `clickup-import.service.ts` (lines 789-890: importDocsWithProgress)
- `clickup-import.service.ts` (lines 894-935: importPages)
- `clickup-import.service.ts` (lines 954-1020: storeDocument)
- `clickup-data-mapper.service.ts` (mapDoc, mapPage methods)

#### 2.2. New Approach: Aggregate Content

**Strategy:**
1. Fetch Doc metadata
2. Fetch all Pages recursively
3. **Combine content** before storing
4. Store as **one document** with full content

**New flow:**
```
importDocs()
  └─ For each doc:
      1. Fetch doc metadata
      2. Fetch all pages recursively
      3. Combine: doc.content + page1.content + page2.content + ...
      4. storeDocument(combinedDoc) → creates ONE document
```

#### 2.3. Content Combination Strategy

**Markdown structure:**
```markdown
# [Doc Title]

[Doc content]

## [Page 1 Title]

[Page 1 content]

### [Sub-page 1.1 Title]

[Sub-page 1.1 content]

## [Page 2 Title]

[Page 2 content]
```

**Benefits:**
- Maintains hierarchy with heading levels
- Searchable as single document
- Preserves structure
- Natural reading flow

#### 2.4. Implementation Steps

**Step 1:** Create helper method to recursively collect all pages
```typescript
private async collectAllPages(
    workspaceId: string,
    docId: string,
    parentPages: any[] = []
): Promise<{ title: string; content: string; level: number }[]> {
    const allPages: { title: string; content: string; level: number }[] = [];
    
    for (const page of parentPages) {
        // Add this page
        allPages.push({
            title: page.name,
            content: page.content?.markdown || '',
            level: page.level || 1
        });
        
        // Recursively collect child pages
        if (page.pages && page.pages.length > 0) {
            const childPages = await this.collectAllPages(
                workspaceId,
                docId,
                page.pages
            );
            allPages.push(...childPages);
        }
    }
    
    return allPages;
}
```

**Step 2:** Create content combiner
```typescript
private combineDocContent(
    docTitle: string,
    docContent: string,
    pages: { title: string; content: string; level: number }[]
): string {
    let combined = `# ${docTitle}\n\n${docContent}\n\n`;
    
    for (const page of pages) {
        const headingLevel = '#'.repeat(page.level + 1); // +1 because doc is h1
        combined += `${headingLevel} ${page.title}\n\n${page.content}\n\n`;
    }
    
    return combined;
}
```

**Step 3:** Modify `importDocs` to use new approach
```typescript
private async importDocs(
    workspaceId: string,
    selectedSpaceIds: string[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>
): Promise<void> {
    // ... existing pagination logic ...
    
    for (const doc of filteredDocs) {
        try {
            // 1. Map doc metadata
            const docData = this.dataMapper.mapDoc(doc);
            
            // 2. Fetch all pages
            const pagesResponse = await this.apiClient.getDocPages(workspaceId, doc.id);
            
            // 3. Collect all pages recursively
            const allPages = await this.collectAllPages(
                workspaceId,
                doc.id,
                pagesResponse
            );
            
            // 4. Combine content
            const combinedContent = this.combineDocContent(
                doc.name,
                doc.content?.markdown || '',
                allPages
            );
            
            // 5. Update docData with combined content
            docData.content = combinedContent;
            
            // 6. Store as ONE document
            await this.storeDocument(projectId, orgId, integrationId, docData);
            
            breakdown['docs'].imported++;
            // NO extraction job created!
            
        } catch (error) {
            this.logger.error(`Failed to import doc ${doc.id}: ${error.message}`);
            breakdown['docs'].failed++;
        }
    }
}
```

**Step 4:** Remove `importPages` method entirely
- No longer needed since pages are combined into doc
- Simplifies code by ~100 lines

**Step 5:** Update progress messages
```typescript
onProgress({ 
    step: 'importing_docs', 
    message: `Imported ${breakdown['docs'].imported} documents (including all pages)` 
});
```

#### 2.5. Metadata Preservation

**Store page metadata in document metadata:**
```json
{
    "clickup_page_count": 15,
    "clickup_page_ids": ["page1_id", "page2_id", ...],
    "clickup_doc_hierarchy": {
        "doc_id": "...",
        "pages": [
            { "page_id": "...", "name": "...", "level": 1 },
            { "page_id": "...", "name": "...", "level": 2 }
        ]
    }
}
```

**Benefits:**
- Can reconstruct page structure if needed
- Useful for debugging
- Enables future features (e.g., "show original page")

### Phase 3: Add Bulk Actions Menu (UI Enhancement)

#### 3.1. Replace "New Extraction" Button

**Current UI** (line 170 in `apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx`):
```tsx
<button className="btn btn-primary">
    <Icon icon="lucide--plus" />
    New Extraction
</button>
```

**New UI:**
```tsx
<div className="flex gap-2">
    {/* Bulk Actions Dropdown */}
    <div className="dropdown dropdown-end">
        <label tabIndex={0} className="btn btn-ghost">
            <Icon icon="lucide--more-vertical" />
            Actions
        </label>
        <ul tabIndex={0} className="menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
            <li>
                <button onClick={handleBulkCancel} disabled={selectedJobs.length === 0}>
                    <Icon icon="lucide--x-circle" />
                    Cancel Selected ({selectedJobs.length})
                </button>
            </li>
            <li>
                <button onClick={handleBulkDelete} disabled={selectedJobs.length === 0}>
                    <Icon icon="lucide--trash-2" />
                    Delete Selected ({selectedJobs.length})
                </button>
            </li>
            <li>
                <button onClick={handleBulkRetry} disabled={selectedJobs.length === 0}>
                    <Icon icon="lucide--rotate-cw" />
                    Retry Failed ({failedCount})
                </button>
            </li>
            <li className="divider"></li>
            <li>
                <button onClick={handleSelectAll}>
                    <Icon icon="lucide--check-square" />
                    Select All
                </button>
            </li>
            <li>
                <button onClick={handleDeselectAll}>
                    <Icon icon="lucide--square" />
                    Deselect All
                </button>
            </li>
        </ul>
    </div>
</div>
```

#### 3.2. Add Job Selection State

**Add to ExtractionJobsPage component:**
```tsx
// Selection state
const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

const handleToggleJob = (jobId: string) => {
    setSelectedJobs(prev => {
        const next = new Set(prev);
        if (next.has(jobId)) {
            next.delete(jobId);
        } else {
            next.add(jobId);
        }
        return next;
    });
};

const handleSelectAll = () => {
    setSelectedJobs(new Set(displayedJobs.map(j => j.id)));
};

const handleDeselectAll = () => {
    setSelectedJobs(new Set());
};
```

#### 3.3. Add Bulk Action Handlers

```tsx
const handleBulkCancel = async () => {
    if (selectedJobs.size === 0) return;
    
    const confirmed = window.confirm(
        `Cancel ${selectedJobs.size} extraction jobs? This cannot be undone.`
    );
    if (!confirmed) return;
    
    try {
        const client = createExtractionJobsClient(apiBase, fetchJson);
        
        // Cancel each job
        await Promise.all(
            Array.from(selectedJobs).map(jobId => 
                client.cancelJob(jobId).catch(err => {
                    console.error(`Failed to cancel job ${jobId}:`, err);
                })
            )
        );
        
        // Refresh job list
        setSelectedJobs(new Set());
        // Trigger refetch (add refetch logic)
        
    } catch (error) {
        console.error('Bulk cancel failed:', error);
        alert('Some jobs failed to cancel. Check console for details.');
    }
};

const handleBulkDelete = async () => {
    if (selectedJobs.size === 0) return;
    
    const confirmed = window.confirm(
        `Delete ${selectedJobs.size} extraction jobs permanently? This cannot be undone.`
    );
    if (!confirmed) return;
    
    try {
        const client = createExtractionJobsClient(apiBase, fetchJson);
        
        // Delete each job
        await Promise.all(
            Array.from(selectedJobs).map(jobId => 
                client.deleteJob(jobId).catch(err => {
                    console.error(`Failed to delete job ${jobId}:`, err);
                })
            )
        );
        
        // Refresh job list
        setSelectedJobs(new Set());
        // Trigger refetch
        
    } catch (error) {
        console.error('Bulk delete failed:', error);
        alert('Some jobs failed to delete. Check console for details.');
    }
};
```

#### 3.4. Add Checkboxes to Job Cards

**Modify ExtractionJobCard component:**
```tsx
export interface ExtractionJobCardProps {
    // ... existing props
    isSelected?: boolean;
    onToggleSelect?: (jobId: string) => void;
}

export function ExtractionJobCard({
    id,
    // ... existing props
    isSelected,
    onToggleSelect,
}: ExtractionJobCardProps) {
    // ... existing code
    
    const cardContent = (
        <div className="card-border card hover:shadow-lg transition-shadow">
            <div className="card-body">
                <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    {onToggleSelect && (
                        <input
                            type="checkbox"
                            className="checkbox checkbox-primary mt-1"
                            checked={isSelected}
                            onChange={() => onToggleSelect(id)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                    
                    {/* Rest of card content */}
                    <div className="flex-1">
                        {/* ... existing content */}
                    </div>
                </div>
            </div>
        </div>
    );
    
    // ... rest of component
}
```

#### 3.5. Backend: Add Bulk Cancel Endpoint (Optional)

**More efficient than N individual requests:**

**File:** `apps/server/src/modules/extraction-jobs/extraction-job.controller.ts`

```typescript
@Post('bulk-cancel')
@ApiOperation({ summary: 'Cancel multiple extraction jobs' })
@Scopes('extraction:write')
async bulkCancelJobs(
    @Body() dto: { job_ids: string[] },
    @Req() req: Request
): Promise<{ cancelled: number; failed: string[] }> {
    const projectId = req.headers['x-project-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    
    const results = {
        cancelled: 0,
        failed: [] as string[]
    };
    
    for (const jobId of dto.job_ids) {
        try {
            await this.jobService.cancelJob(jobId, projectId, orgId);
            results.cancelled++;
        } catch (error) {
            results.failed.push(jobId);
        }
    }
    
    return results;
}
```

## Migration Strategy

### For Existing Fragmented Documents

**Option 1: Leave as-is**
- Old imports stay fragmented
- New imports use combined approach
- Users can manually re-import if needed

**Option 2: Background migration**
- Script to find related pages (same parent_document_id)
- Combine into single document
- Update references
- Delete duplicate documents
- **Complexity: HIGH** - requires careful testing

**Recommendation:** Option 1 (simpler, less risk)

## Testing Plan

### Unit Tests

**Test 1: Content combination**
```typescript
describe('ClickUpImportService', () => {
    it('should combine doc and pages into single document', () => {
        const doc = { name: 'Doc', content: 'Doc content' };
        const pages = [
            { title: 'Page 1', content: 'Page 1 content', level: 1 },
            { title: 'Page 1.1', content: 'Sub-page content', level: 2 }
        ];
        
        const combined = service.combineDocContent(doc.name, doc.content, pages);
        
        expect(combined).toContain('# Doc');
        expect(combined).toContain('## Page 1');
        expect(combined).toContain('### Page 1.1');
    });
});
```

**Test 2: No extraction job created**
```typescript
it('should NOT create extraction job after storing document', async () => {
    const spy = jest.spyOn(extractionJobService, 'createJob');
    
    await service.storeDocument(projectId, orgId, integrationId, docData);
    
    expect(spy).not.toHaveBeenCalled();
});
```

### Integration Tests

**Test 1: End-to-end import**
```typescript
it('should import ClickUp doc with 5 pages as 1 document', async () => {
    // Mock API responses
    mockClickUpAPI.getDocPages.mockResolvedValue([/* 5 pages */]);
    
    // Run import
    await service.runFullImport(integrationId, projectId, orgId, workspaceId, config);
    
    // Verify: 1 document created, not 6
    const docs = await db.query('SELECT * FROM kb.documents WHERE external_id = ?', [docId]);
    expect(docs.length).toBe(1);
    expect(docs[0].content).toContain('## Page 1'); // Contains pages
});
```

### Manual Testing

**Scenario 1: Small import**
1. Connect ClickUp with test workspace
2. Select 1 space with 2 docs (each has 3 pages)
3. Run sync
4. Verify:
   - Only 2 documents created (not 8)
   - Each document contains all pages
   - No extraction jobs created
   - Documents table shows correct count

**Scenario 2: Bulk actions**
1. Create 10 test extraction jobs
2. Select 5 jobs using checkboxes
3. Click "Actions" → "Cancel Selected"
4. Verify:
   - Confirmation dialog appears
   - 5 jobs cancelled
   - Selection cleared
   - Job list refreshes

## Rollout Plan

### Phase 1: Critical Fixes (Week 1)
- ✅ Stop auto-creating extraction jobs
- ✅ Combine pages into single document
- ✅ Test with small workspace (< 10 docs)

### Phase 2: UI Improvements (Week 2)
- ✅ Add bulk actions menu
- ✅ Add job selection checkboxes
- ✅ Test bulk cancel/delete

### Phase 3: Polish (Week 3)
- ✅ Add bulk cancel backend endpoint
- ✅ Add progress indicators for bulk operations
- ✅ Update documentation

## Success Metrics

**Before:**
- 500 ClickUp pages → 500 documents
- 500 extraction jobs auto-created (all with empty config)
- Users must manually cancel unwanted jobs

**After:**
- 500 ClickUp pages → ~50 documents (10 pages per doc average)
- 0 extraction jobs auto-created
- Users trigger extraction only for reviewed documents
- Bulk cancel available for cleanup

## Related Documents

- `docs/CLICKUP_EXTRACTION_CONFIG_BUG_FIX.md` - Empty config emergency fix
- `docs/CLICKUP_INTEGRATION_COMPLETE.md` - Original integration docs
- `docs/spec/22-clickup-integration.md` - ClickUp integration spec
- `docs/AUTO_DISCOVERY_SYSTEM_SPEC.md` - Manual extraction workflow

## Next Steps

1. **Review this plan** with team/user
2. **Implement Phase 1** (stop auto-extraction, combine pages)
3. **Test with real ClickUp workspace** (user's account)
4. **Implement Phase 2** (bulk actions UI)
5. **Deploy and monitor** document counts, extraction job counts
6. **Gather feedback** on combined document approach
7. **Iterate** based on usage patterns

---

**Questions to Answer:**
- Should we preserve page structure in metadata?
- What heading level for nested pages (h2, h3, h4...)?
- Should combined content be editable?
- How to handle very large docs (100+ pages)?
