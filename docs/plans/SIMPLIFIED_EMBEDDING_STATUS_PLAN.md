# Simplified Embedding Policy + Auto-Accept Status Implementation Plan

**Date**: 2025-10-21  
**Objective**: Simplify embedding rules to status-only, add auto-accept threshold for extractions

## Current State Analysis

### ✅ What Already Exists

1. **Confidence Scoring System** (`confidence-scorer.service.ts`)
   - Multi-factor algorithm (LLM confidence, schema completeness, evidence quality, property quality)
   - Returns score 0.0-1.0
   - Currently used during extraction to decide quality tier

2. **Quality Thresholds** (in `config.service.ts`)
   - `EXTRACTION_CONFIDENCE_THRESHOLD_MIN` (default: 0.0) - Below this = reject
   - `EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW` (default: 0.7) - Below this = needs review
   - `EXTRACTION_CONFIDENCE_THRESHOLD_AUTO` (default: 0.85) - Above this = auto-create

3. **Status Field** in `kb.graph_objects`
   - Column: `status TEXT` (nullable)
   - Currently NOT set during extraction
   - Exists but unused in object lifecycle

4. **Vector Search** (`graph-vector-search.service.ts`)
   - `searchByVector(query, opts)` - Search by embedding vector
   - `searchSimilar(objectId, opts)` - Find neighbors of an object
   - Options: `limit`, `maxDistance`, `type`, `projectId`, `branchId`, `labels`
   - Returns: `{id, distance, org_id, project_id, branch_id}[]`

5. **Graph Relationships**
   - System for linking objects via relationships
   - Can retrieve neighbors via relationship queries

### ❌ What Needs to Change

## Required Changes

### 1. Simplify Embedding Policy ⚠️ BREAKING CHANGE

**Current**: Complex policy with multiple checks
- Enabled/disabled
- Property size limits
- Required labels
- Excluded labels
- Excluded statuses
- Relevant paths (field masking)

**New**: Status-only policy
- If `status != 'draft'` → embed
- If `status == 'draft'` OR `status IS NULL` → don't embed

**Rationale**: User wants simple rule: "Embed everything except drafts"

**Implementation**:
```typescript
// In graph.service.ts createObject()
if (this.isEmbeddingsEnabled() && (created as any).embedding == null) {
    const status = (created as any).status;
    
    // Simple rule: Only embed non-draft objects
    const shouldEmbed = status && status.toLowerCase() !== 'draft';
    
    if (shouldEmbed) {
        await this.embeddingJobs?.enqueue(created.id);
    }
}
```

**Removed**:
- ❌ `EmbeddingPolicyService` - No longer needed
- ❌ `kb.embedding_policies` table queries - Status check is hardcoded
- ❌ Complex `shouldEmbed()` evaluation logic

**Kept**:
- ✅ `kb.embedding_policies` table (for future use if needed)
- ✅ `EmbeddingWorkerService` (still generates embeddings from queue)
- ✅ `EmbeddingJobsService` (still manages job queue)

### 2. Add Status Setting During Extraction

**Current**: Objects created without `status` field (NULL)

**New**: Set status based on confidence threshold

```typescript
// In extraction-worker.service.ts (around line 800)

// Determine status based on confidence and auto-accept threshold
let status: string | null = null;
if (finalConfidence >= autoThreshold) {
    status = 'accepted';  // High confidence - auto-accept
} else {
    status = 'draft';     // Low confidence - needs review
}

// Create object with status
const graphObject = await this.graphService.createObject({
    org_id: job.org_id,
    project_id: job.project_id,
    type: entity.type_name,
    key: objectKey,
    status: status,  // NEW: Set status based on confidence
    properties: {
        name: entity.name,
        description: entity.description,
        ...entity.properties,
        _extraction_confidence: finalConfidence,
    },
    labels,
});
```

**Result**:
- Objects with confidence ≥ 0.85 (auto threshold) → `status = 'accepted'` → Will be embedded ✅
- Objects with confidence < 0.85 → `status = 'draft'` → Will NOT be embedded ❌

### 3. Chat Search with Neighbors

**Already Exists**: `GraphVectorSearchService.searchSimilar()`

**Current Usage** (probably in chat):
```typescript
// Search for similar objects
const results = await vectorSearch.searchSimilar(objectId, {
    limit: 10,
    projectId: currentProjectId,
    type: 'Document' // optional
});

// Results: [{id, distance}, ...]
```

**Enhancement Needed**: Add relationship expansion

**Implementation**:
```typescript
// New method in graph.service.ts
async searchObjectsWithNeighbors(
    queryText: string,
    opts: {
        limit?: number;
        includeNeighbors?: boolean;
        maxNeighbors?: number;
        maxDistance?: number;
        projectId?: string;
        types?: string[];
    }
): Promise<{
    primaryResults: GraphObjectDto[];
    neighbors: Record<string, GraphObjectDto[]>;  // Key: object ID, Value: its neighbors
}> {
    // 1. Vector search for primary results
    const embedding = await this.generateEmbedding(queryText);
    const searchResults = await this.vectorSearch.searchByVector(embedding, {
        limit: opts.limit || 10,
        projectId: opts.projectId,
        maxDistance: opts.maxDistance,
    });
    
    // 2. Fetch full objects
    const primaryObjects = await Promise.all(
        searchResults.map(r => this.getObject(r.id))
    );
    
    // 3. If neighbors requested, fetch for each object
    const neighbors: Record<string, GraphObjectDto[]> = {};
    if (opts.includeNeighbors) {
        for (const obj of primaryObjects) {
            // Get similar objects
            const similar = await this.vectorSearch.searchSimilar(obj.id, {
                limit: opts.maxNeighbors || 5,
                projectId: opts.projectId,
            });
            
            // Get directly connected objects
            const relationships = await this.getRelationshipsForObject(obj.id);
            const connectedIds = [
                ...relationships.outgoing.map(r => r.target_id),
                ...relationships.incoming.map(r => r.source_id)
            ];
            
            // Combine and deduplicate
            const neighborIds = [...new Set([
                ...similar.map(s => s.id),
                ...connectedIds
            ])].filter(id => id !== obj.id);
            
            // Fetch neighbor objects
            neighbors[obj.id] = await Promise.all(
                neighborIds.slice(0, opts.maxNeighbors || 5).map(id => this.getObject(id))
            );
        }
    }
    
    return {
        primaryResults: primaryObjects,
        neighbors
    };
}
```

## Migration Plan

### Step 1: Update Extraction Worker ✅ Priority 1

**File**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**Changes**:
1. Set `status` field when creating objects (line ~800)
2. Use `autoThreshold` to determine status
3. Add logging for status decisions

**Testing**:
- Run extraction job
- Verify objects with high confidence get `status='accepted'`
- Verify objects with low confidence get `status='draft'`
- Verify only 'accepted' objects are queued for embedding

### Step 2: Simplify Embedding Logic ✅ Priority 1

**File**: `apps/server/src/modules/graph/graph.service.ts`

**Changes**:
1. Remove `embeddingPolicy` dependency from `createObject()`
2. Replace policy evaluation with simple status check:
   ```typescript
   const shouldEmbed = status && status.toLowerCase() !== 'draft';
   ```
3. Remove `EmbeddingPolicyService` injection from constructor

**Testing**:
- Create object with `status='accepted'` → Embedding job queued ✅
- Create object with `status='draft'` → No embedding job ❌
- Create object with `status=null` → No embedding job ❌

### Step 3: Add Search with Neighbors ⏺️ Priority 2

**File**: `apps/server/src/modules/graph/graph.service.ts`

**Changes**:
1. Add `searchObjectsWithNeighbors()` method
2. Combine vector search + relationship traversal
3. Add to controller endpoint

**File**: `apps/server/src/modules/graph/graph.controller.ts`

**Changes**:
1. Add new endpoint: `POST /graph/search-with-neighbors`
2. Accept query text + options
3. Return primary results + neighbors

**Testing**:
- Search for "authentication"
- Verify primary results returned
- Verify neighbors included for each result
- Verify neighbors include both similar objects and related objects

### Step 4: Update Chat to Use New Search 🔜 Priority 3

**File**: `apps/server/src/modules/chat/...` (chat service)

**Changes**:
1. Replace current search with `searchObjectsWithNeighbors()`
2. Include neighbors in context for LLM
3. Format object-ref blocks for primary + key neighbors

## Configuration

### Environment Variables

**Keep Existing**:
```bash
EXTRACTION_CONFIDENCE_THRESHOLD_MIN=0.0    # Below this = reject completely
EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW=0.7  # Currently unused with new status logic
EXTRACTION_CONFIDENCE_THRESHOLD_AUTO=0.85   # Above this = status 'accepted'
```

**Interpretation**:
- Confidence < 0.0: Reject (shouldn't happen with 0-1 range)
- Confidence ≥ 0.0 AND < 0.85: Create as `status='draft'` (not embedded)
- Confidence ≥ 0.85: Create as `status='accepted'` (will be embedded)

## Database Impact

**No migrations needed** ✅
- `status` column already exists in `kb.graph_objects`
- `kb.embedding_policies` table can stay (unused but not breaking anything)
- `excluded_statuses` column exists but won't be queried

## API Changes

### Breaking Changes ⚠️

**Removed** (if exposed via API):
- `POST /graph/embedding-policies` - Policy management no longer needed
- `GET /graph/embedding-policies` 
- `PATCH /graph/embedding-policies/:id`
- `DELETE /graph/embedding-policies/:id`

**Note**: If these endpoints exist and are used, keep them but mark as deprecated. The policy checks just won't be executed.

### New Endpoints

**Added**:
```
POST /graph/search-with-neighbors
Body:
{
  "query": "authentication methods",
  "limit": 10,
  "includeNeighbors": true,
  "maxNeighbors": 5,
  "maxDistance": 0.3,
  "types": ["Document", "Decision"]
}

Response:
{
  "primaryResults": [
    {
      "id": "...",
      "type": "Document",
      "name": "OAuth 2.0 Implementation",
      ...
    }
  ],
  "neighbors": {
    "<object-id>": [
      { "id": "...", "type": "Decision", "name": "Use JWT tokens", ... },
      { "id": "...", "type": "Person", "name": "Security Lead", ... }
    ]
  }
}
```

## Testing Plan

### Unit Tests

1. **Extraction Worker** (`extraction-worker.service.spec.ts`)
   - Test status setting based on confidence
   - Test `finalConfidence >= 0.85` → `status='accepted'`
   - Test `finalConfidence < 0.85` → `status='draft'`

2. **Graph Service** (`graph.service.spec.ts`)
   - Test embedding queue for `status='accepted'`
   - Test NO embedding queue for `status='draft'`
   - Test NO embedding queue for `status=null`

3. **Search with Neighbors** (new test file)
   - Test primary results returned
   - Test neighbors fetched for each result
   - Test neighbor limit respected
   - Test deduplication (no duplicates, no self-references)

### Integration Tests

1. **End-to-End Extraction**
   - Upload document
   - Run extraction
   - Verify high-confidence entities have `status='accepted'`
   - Verify low-confidence entities have `status='draft'`
   - Query `kb.embedding_jobs` - verify only 'accepted' objects queued

2. **Search Flow**
   - Create accepted objects with embeddings
   - Create draft objects without embeddings
   - Search query
   - Verify only accepted objects in results
   - Verify draft objects NOT in results

## Rollback Plan

If issues arise:

1. **Revert embedding logic** to use `EmbeddingPolicyService`
2. **Keep status setting** (doesn't hurt)
3. **Remove search-with-neighbors endpoint** (not critical)

## Timeline

- ⏱️ **Step 1** (Status setting): 30 minutes
- ⏱️ **Step 2** (Simplify embedding): 20 minutes
- ⏱️ **Testing Steps 1+2**: 30 minutes
- ⏱️ **Step 3** (Search with neighbors): 1 hour
- ⏱️ **Step 4** (Chat integration): 30 minutes
- ⏱️ **End-to-end testing**: 30 minutes

**Total**: ~3.5 hours

## Questions to Confirm

1. ✅ **Status values**: Use `'accepted'` and `'draft'`? Or other values like `'reviewed'`, `'published'`?
2. ✅ **NULL status**: Should `NULL` status be treated as draft (not embedded)?
3. ❓ **Existing objects**: Should we backfill `status='accepted'` for existing objects?
4. ❓ **Status transitions**: Should changing `status` from `'draft'` to `'accepted'` automatically queue embedding?
5. ❓ **Neighbor types**: Should neighbor search include all relationship types or filter specific types?

## Summary

**Core Changes**:
1. Set `status` during extraction based on confidence threshold
2. Simplify embedding to status-only check (not draft → embed)
3. Add search endpoint that includes neighbors

**Benefits**:
- ✅ Simpler logic (no complex policy evaluation)
- ✅ Clear object lifecycle (draft → accepted)
- ✅ Better search context (primary results + neighbors)
- ✅ No breaking database changes

**Risks**:
- ⚠️ Existing objects with NULL status won't be embedded
- ⚠️ Need to communicate status field usage to team
- ⚠️ Embedding policy features become unused (but don't break)

---

Ready to proceed with implementation? Let me know if you want me to start with Step 1 (status setting) or if you have questions!
