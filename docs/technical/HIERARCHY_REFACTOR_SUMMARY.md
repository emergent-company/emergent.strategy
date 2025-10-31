# Making Document Hierarchy Generic

## The Insight

The user pointed out: **"can this mechanism be very general not clickup only?"**

**Answer**: YES! And it already was at the database level - we just needed to make it explicit.

---

## What Changed

### Before: Appeared ClickUp-Specific

The implementation looked like it was built "for ClickUp":
- ClickUp-specific API client methods
- ClickUp-specific data mappers
- ClickUp-specific import logic
- Documentation focused on ClickUp use case

**But the foundation was already generic!**

### After: Explicitly Generic

Made it clear this is a **platform-level capability**:

1. **Extracted InternalDocument interface** to shared module
   - File: `src/modules/integrations/document-hierarchy.types.ts`
   - Generic interface that ANY integration can use
   - Documented with examples for multiple integrations

2. **Updated ClickUp mapper** to import generic type
   - Now explicitly uses shared `InternalDocument` interface
   - Demonstrates the pattern other integrations should follow

3. **Created comprehensive guide** 
   - File: `docs/GENERIC_DOCUMENT_HIERARCHY.md`
   - Shows how to use for GitHub, Confluence, Notion, etc.
   - Includes code examples for multiple integrations
   - Query patterns that work across all sources

---

## Database Schema (Already Generic!)

```sql
-- These columns work for ANY integration source:
parent_document_id UUID          -- Links to parent (GitHub dir, ClickUp doc, etc.)
integration_metadata JSONB        -- Can store ANY source-specific metadata
```

**Key Insight**: The schema doesn't care if it's storing:
- ClickUp docs/pages
- GitHub repos/files  
- Confluence spaces/pages
- Notion databases/blocks
- Google Drive folders/files

---

## Generic Interface (New)

```typescript
// src/modules/integrations/document-hierarchy.types.ts

export interface InternalDocument {
  external_id: string;           // Unique ID in source system
  external_type: string;          // Type (github_file, clickup_page, etc.)
  external_source: string;        // Source name (github, clickup, etc.)
  external_url?: string;          // Link to source
  external_parent_id?: string;    // Parent in source system
  external_updated_at?: Date;     // For incremental sync
  title: string;                  // Human-readable name
  content: string;                // Document content
  metadata: Record<string, any>;  // Source-specific metadata (JSONB)
}
```

**Examples of usage:**

### ClickUp (Current)
```typescript
{
  external_id: "4bj41-33735",
  external_type: "clickup_doc",
  external_source: "clickup",
  title: "Technical Glossary",
  metadata: {
    workspace_id: "4573313",
    creator_id: 56506196,
    avatar: "emoji::📃"
  }
}
```

### GitHub (Example)
```typescript
{
  external_id: "blob:abc123",
  external_type: "github_file",
  external_source: "github",
  title: "auth.service.ts",
  metadata: {
    repository: "eyedea-io/spec-server",
    file_path: "src/modules/auth/auth.service.ts",
    language: "typescript"
  }
}
```

### Confluence (Example)
```typescript
{
  external_id: "page:12345678",
  external_type: "confluence_page",
  external_source: "confluence",
  title: "API Documentation",
  metadata: {
    space_key: "TECH",
    version: 5,
    labels: ["documentation", "api"]
  }
}
```

---

## Integration Pattern (Reusable)

### Step 1: Create Data Mapper
```typescript
@Injectable()
export class YourIntegrationMapper {
  mapDocument(sourceData: any): InternalDocument {
    return {
      external_id: sourceData.id,
      external_type: 'your_source_document',
      external_source: 'your_source',
      external_url: sourceData.url,
      external_parent_id: sourceData.parent_id,
      title: sourceData.name,
      content: sourceData.content,
      metadata: {
        source: 'your_source',
        // Add source-specific fields here
      }
    };
  }
}
```

### Step 2: Import with Hierarchy Tracking
```typescript
const context: HierarchicalImportContext = {
  externalIdMap: new Map(),  // Maps external_id → internal UUID
  depth: 0,
  maxDepth: 10
};

// Store parent
const parentDoc = mapper.mapDocument(sourceParent);
const parentUuid = await storeDocument(parentDoc);
context.externalIdMap.set(parentDoc.external_id, parentUuid);

// Store children with parent reference
for (const child of sourceChildren) {
  const childDoc = mapper.mapDocument(child);
  await storeDocument(childDoc, parentUuid);  // Pass parent UUID
}
```

### Step 3: Query Hierarchy
```sql
-- Get all children
SELECT * FROM kb.documents 
WHERE parent_document_id = 'parent-uuid';

-- Get full tree
WITH RECURSIVE tree AS (
  SELECT *, 0 as level FROM kb.documents WHERE id = 'root-uuid'
  UNION ALL
  SELECT d.*, t.level + 1 
  FROM kb.documents d JOIN tree t ON d.parent_document_id = t.id
) SELECT * FROM tree;
```

---

## What's Integration-Specific?

Only these parts need to be implemented per-integration:

1. **API Client** - Each source has different endpoints
   - ClickUp: `GET /api/v3/workspaces/{id}/docs`
   - GitHub: `GET /repos/{owner}/{repo}/contents/{path}`
   - Confluence: `GET /wiki/rest/api/content/{id}/child/page`

2. **Data Mapper** - Each source has different data structures
   - ClickUp: `ClickUpDoc` → `InternalDocument`
   - GitHub: `GitHubFile` → `InternalDocument`
   - Confluence: `ConfluencePage` → `InternalDocument`

3. **Metadata Contents** - Stored in generic JSONB field
   - ClickUp: `workspace_id, avatar, cover`
   - GitHub: `repository, file_path, language`
   - Confluence: `space_key, version, labels`

---

## What's Generic?

These parts work for ALL integrations without changes:

✅ **Database Schema** - `parent_document_id`, `integration_metadata`  
✅ **DTO Fields** - `parentDocumentId`, `integrationMetadata`  
✅ **InternalDocument Interface** - Works for any source  
✅ **Query Patterns** - Hierarchy queries work for any source  
✅ **UI Components** - Can render any source's hierarchy  
✅ **Search & Extraction** - Source-agnostic  

---

## Benefits

### 1. Consistency
Every integration follows the same pattern:
```typescript
SourceData → InternalDocument → kb.documents
```

### 2. No Schema Changes
Adding a new integration requires **zero database migrations**!

### 3. Cross-Integration Queries
```sql
-- All hierarchical documents across ALL integrations
SELECT 
  integration_metadata->>'source' as source,
  COUNT(*) as count
FROM kb.documents
WHERE parent_document_id IS NOT NULL
GROUP BY integration_metadata->>'source';

-- Result:
-- clickup | 150
-- github  | 342
-- confluence | 89
```

### 4. Reusable Components
```tsx
<DocumentTree documents={allDocs} />  // Works for ANY source!
```

### 5. Future-Proof
New integrations can be added with ~200 lines of code:
- Data mapper: ~100 lines
- Import service: ~100 lines
- No DB changes needed!

---

## Files Created/Modified

### Created (Generic Foundation)
1. **document-hierarchy.types.ts** (NEW)
   - Generic `InternalDocument` interface
   - `DocumentStorageOptions` interface
   - `HierarchicalImportContext` interface
   - Comprehensive documentation with multi-source examples

2. **GENERIC_DOCUMENT_HIERARCHY.md** (NEW)
   - Complete guide for implementing hierarchy in ANY integration
   - Code examples for GitHub, Confluence, Notion
   - Query patterns, UI patterns
   - Integration checklist

### Modified (ClickUp as Example)
1. **clickup-data-mapper.service.ts**
   - Changed from local `interface InternalDocument`
   - To: `import { InternalDocument } from '../integrations/document-hierarchy.types'`
   - Now demonstrates the pattern others should follow

---

## Migration Path for Future Integrations

### GitHub Integration (Example)
1. Create `github-api.client.ts` with API methods
2. Create `github-data-mapper.service.ts`:
   ```typescript
   import { InternalDocument } from '../integrations/document-hierarchy.types';
   
   mapFile(file: GitHubFile): InternalDocument {
     return {
       external_id: `blob:${file.sha}`,
       external_type: 'github_file',
       external_source: 'github',
       // ... rest of mapping
     };
   }
   ```
3. Create `github-import.service.ts` with recursive import
4. Done! No database changes needed.

### Confluence Integration (Example)
Same pattern:
1. API client for Confluence REST API
2. Data mapper: `ConfluencePage` → `InternalDocument`
3. Import service with hierarchy traversal
4. Store with `parent_document_id` and `integration_metadata`

---

## Documentation Updates

### Original Docs
- `CLICKUP_DOCS_IMPLEMENTATION.md` - ClickUp-specific implementation guide

### New Generic Docs
- `GENERIC_DOCUMENT_HIERARCHY.md` - How ANY integration can use hierarchy
- `document-hierarchy.types.ts` - Comprehensive inline documentation

### Both Are Valuable
- **ClickUp docs**: Show real working example
- **Generic docs**: Show how to apply pattern to new integrations

---

## Summary

**Question**: "can this mechanism be very general not clickup only?"

**Answer**: **YES!** 

The database schema and DTO were already 100% generic. We extracted the interface to a shared module and created comprehensive documentation showing how ANY integration (GitHub, Confluence, Notion, etc.) can use the same pattern.

**Result**: 
- ✅ No database changes needed for new integrations
- ✅ Consistent pattern across all integrations  
- ✅ ~200 lines of code per new integration
- ✅ Cross-integration queries possible
- ✅ Reusable UI components
- ✅ Future-proof architecture

**Status**: ✅ Build passing, documentation complete, ready for new integrations!
