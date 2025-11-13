# Strategic SQL Documentation Sprint 4

**Date**: November 13, 2025  
**Status**: ✅ Complete  
**Services Documented**: 1 service (ChatService)  
**Total Methods Documented**: 9 methods (4 strategic SQL + 4 TypeORM + 1 helper)

## Overview

This document provides comprehensive documentation for **ChatService**, which demonstrates a **hybrid approach**: Strategic SQL for complex filtering and search operations, TypeORM for simple CRUD, and offline fallback support.

---

## 1. ChatService (chat.service.ts)

**Location**: `apps/server/src/modules/chat/chat.service.ts`  
**Lines of Code**: ~584 lines  
**Strategic SQL Methods**: 4  
**TypeORM Methods**: 4  
**Helper Methods**: 1 (pure JavaScript, no DB)  
**Hybrid Status**: **44% Strategic SQL + 44% TypeORM + 12% Helper**

### Method Categorization

| Method                         | Type              | Lines   | Rationale                                     |
| ------------------------------ | ----------------- | ------- | --------------------------------------------- |
| `mapUserId()`                  | Helper            | 71-76   | Pure JavaScript, no DB access                 |
| `listConversations()`          | **Strategic SQL** | 78-185  | `IS NOT DISTINCT FROM` for optional filtering |
| `getConversation()`            | **Strategic SQL** | 187-264 | Multi-query with diagnostic logging           |
| `renameConversation()`         | TypeORM           | 266-297 | Simple UPDATE, no special features            |
| `deleteConversation()`         | TypeORM           | 299-326 | Simple DELETE, no special features            |
| `createConversationIfNeeded()` | **Strategic SQL** | 328-429 | Transaction with atomic multi-INSERT          |
| `persistUserMessage()`         | TypeORM           | 431-457 | Simple INSERT with timestamp update           |
| `retrieveCitations()`          | **Strategic SQL** | 459-539 | pgvector + full-text hybrid search (RRF)      |
| `persistAssistantMessage()`    | TypeORM           | 541-573 | Simple INSERT with JSON, no special features  |
| `hasConversation()`            | TypeORM           | 575-583 | Simple COUNT query                            |

---

### Strategic SQL Patterns Used

#### 1.1 IS NOT DISTINCT FROM for Optional Filtering

**Purpose**: Dynamic filtering where NULL and specific values are treated as distinct filter criteria.

**Method**: `listConversations()` - lines 78-185

**Query Pattern** (lines 107-112, 121-125):

```sql
-- Shared conversations (optional project filter)
SELECT id, title, created_at, updated_at, owner_user_id, is_private
FROM kb.chat_conversations
WHERE is_private = false
  AND project_id IS NOT DISTINCT FROM $1  -- Only if projectId provided
ORDER BY updated_at DESC

-- Private conversations (optional project filter)
SELECT id, title, created_at, updated_at, owner_user_id, is_private
FROM kb.chat_conversations
WHERE is_private = true
  AND owner_user_id = $1
  AND project_id IS NOT DISTINCT FROM $2  -- Only if projectId provided
ORDER BY updated_at DESC
```

**Why Strategic**:

- **`IS NOT DISTINCT FROM`**: PostgreSQL-specific operator for null-safe equality
- **Dynamic filtering**: Conditionally adds `project_id` filter when provided
- **NULL semantics**: Distinguishes between "no project filter" vs "project is NULL"
- **Multi-tenant compatibility**: Follows same pattern as documents/extraction jobs

**How IS NOT DISTINCT FROM Works**:

```sql
-- Standard = operator (NULL != NULL)
WHERE project_id = NULL     -- Always FALSE (even if project_id IS NULL)

-- IS NOT DISTINCT FROM operator (NULL-safe)
WHERE project_id IS NOT DISTINCT FROM NULL   -- TRUE if project_id IS NULL
WHERE project_id IS NOT DISTINCT FROM 'uuid' -- TRUE if project_id = 'uuid'
```

**Dynamic Filter Building** (lines 104-116):

```typescript
const sharedParams: any[] = [];
let sharedSQL = `SELECT id, title, created_at, updated_at, owner_user_id, is_private 
                 FROM kb.chat_conversations 
                 WHERE is_private = false`;

if (projectId) {
  sharedParams.push(projectId);
  sharedSQL += ` AND project_id IS NOT DISTINCT FROM $${sharedParams.length}`;
}
sharedSQL += ' ORDER BY updated_at DESC';
```

**Benefits**:

1. **Flexible filtering**: Supports org-level and project-level queries
2. **NULL-safe**: Correctly handles conversations with `project_id = NULL`
3. **Controller-enforced policies**: Service allows optional filter, controller enforces requirements
4. **Consistent pattern**: Same approach as documents listing (see Phase 6 pattern)

**TypeORM Migration Effort**: **Medium** - QueryBuilder doesn't support `IS NOT DISTINCT FROM`  
**Alternative in TypeORM**: Use `COALESCE()` or conditional WHERE clauses (more verbose)  
**Performance Impact**: **Low** - Indexed columns  
**Maintenance Risk**: **Low** - Standard PostgreSQL feature

---

#### 1.2 Diagnostic Logging with TypeORM (Mixed Approach)

**Purpose**: When primary query returns unexpected results, run diagnostic queries to help debug.

**Method**: `listConversations()` - lines 133-183, `getConversation()` - lines 217-234

**Diagnostic Pattern** (lines 135-146):

```typescript
if (priv.rows.length === 0 && userId) {
  // Diagnostic: Find all conversations for user (ignoring project filter)
  const diag = await this.conversationRepository.find({
    where: { ownerUserId: userId },
    select: [
      'id',
      'title',
      'createdAt',
      'updatedAt',
      'ownerUserId',
      'isPrivate',
      'projectId',
    ],
  });

  this.logger.log(
    `[listConversations] diag for owner yields ${diag.length} rows: ${diag
      .map((r) => r.id + ':' + (r.projectId || 'null'))
      .join(',')}`
  );
}
```

**Why Mixed Approach**:

- **Primary query = Raw SQL**: Uses `IS NOT DISTINCT FROM` for correct filtering
- **Diagnostic queries = TypeORM**: Simple reads, no special PostgreSQL features needed
- **Logging only**: Diagnostics run only when primary query is unexpectedly empty
- **No production impact**: Diagnostics help debug but don't affect business logic

**Additional Diagnostics** (lines 152-182):

```typescript
// Count-based diagnostics to isolate filter behavior
const cOwner = await this.conversationRepository.count({
  where: { ownerUserId: userId },
});
const cPrivate = await this.conversationRepository.count({
  where: { isPrivate: true },
});
const cBoth = await this.conversationRepository.count({
  where: { isPrivate: true, ownerUserId: userId },
});

// Sample recent rows regardless of owner
const recent = await this.conversationRepository.find({
  select: ['id', 'ownerUserId', 'isPrivate', 'createdAt'],
  order: { createdAt: 'DESC' },
  take: 5,
});
```

**Benefits**:

1. **Debugging aid**: Helps diagnose RLS policy issues, missing data, filter bugs
2. **No overhead when working**: Only runs when primary query is empty
3. **TypeORM simplicity**: No need for raw SQL for simple diagnostic queries
4. **Production-safe**: Logged info helps support team debug user issues

**Pattern**: Use TypeORM for debug/diagnostic queries, raw SQL for production paths

---

#### 1.3 Transaction with Atomic Multi-INSERT

**Purpose**: Atomically create conversation and initial user message in a single transaction.

**Method**: `createConversationIfNeeded()` - lines 328-429

**Transaction Pattern** (lines 397-426):

```typescript
const client = await this.db.getClient();
try {
  await client.query('BEGIN');

  // Step 1: Insert conversation
  const ins = await client.query<{ id: string }>(
    `INSERT INTO kb.chat_conversations (title, owner_user_id, is_private, project_id) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id`,
    [title, owner, isPrivate, projectId]
  );
  convId = ins.rows[0].id;

  // Step 2: Insert initial user message
  await client.query(
    `INSERT INTO kb.chat_messages (conversation_id, role, content) 
     VALUES ($1, 'user', $2)`,
    [convId, message]
  );

  // Step 3: Update conversation timestamp
  await client.query(
    `UPDATE kb.chat_conversations SET updated_at = now() WHERE id = $1`,
    [convId]
  );

  await client.query('COMMIT');
} catch (txErr: any) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  throw txErr;
} finally {
  client.release();
}
```

**Why Strategic**:

- **Atomicity**: Conversation + initial message created together or not at all
- **RETURNING clause**: Get generated UUID from INSERT
- **Manual transaction**: Explicit BEGIN/COMMIT for multi-step operation
- **Proper cleanup**: ROLLBACK on error, always release client

**Comparison with TypeORM**:

```typescript
// TypeORM approach (would work but less explicit)
await this.conversationRepository.manager.transaction(async (manager) => {
  const conversation = await manager.save(ChatConversation, {
    title,
    ownerUserId: owner,
    isPrivate,
    projectId,
  });

  await manager.save(ChatMessage, {
    conversationId: conversation.id,
    role: 'user',
    content: message,
  });

  await manager.update(ChatConversation, conversation.id, {
    updatedAt: new Date(),
  });
});
```

**Why Raw SQL Here**:

1. **Explicit control**: Clear BEGIN/COMMIT/ROLLBACK semantics
2. **Performance**: Three simple INSERTs/UPDATE without entity hydration
3. **RETURNING clause**: Direct access to generated ID
4. **Consistency**: Matches transaction patterns in other services

**Pre-Transaction Validation** (lines 368-384):

```typescript
if (convId) {
  // Check if conversation exists and user has access
  const check = await this.db.query<{
    id: string;
    is_private: boolean;
    owner_user_id: string | null;
  }>(
    `SELECT id, is_private, owner_user_id 
     FROM kb.chat_conversations 
     WHERE id = $1`,
    [convId]
  );

  if (check.rowCount === 0) convId = '';
  else {
    const c = check.rows[0];
    if (c.is_private && c.owner_user_id && c.owner_user_id !== userId)
      throw new Error('forbidden');
  }
}
```

**TypeORM Migration Effort**: **Low** - Transaction manager supports this pattern  
**Performance Impact**: **Medium** - Atomic creation is critical for data integrity  
**Maintenance Risk**: **Low** - Standard transaction pattern

---

#### 1.4 Reciprocal Rank Fusion (RRF) for Hybrid Search

**Purpose**: Combine vector similarity search (pgvector) and full-text search (PostgreSQL `ts_rank`) using Reciprocal Rank Fusion algorithm.

**Method**: `retrieveCitations()` - lines 459-539

**RRF Query Structure** (lines 486-528):

```sql
WITH params AS (
  SELECT $1::vector AS qvec,                      -- Embedding vector
         websearch_to_tsquery('simple', $6) AS qts, -- Full-text query
         $5::int AS topk                          -- Results limit
),
vec AS (
  -- Vector similarity search (pgvector)
  SELECT c.id,
         1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf,
         (c.embedding <=> (SELECT qvec FROM params)) AS distance
  FROM kb.chunks c
  JOIN kb.documents d ON d.id = c.document_id
  JOIN kb.projects p ON p.id = d.project_id
  WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
    AND (p.organization_id IS NOT DISTINCT FROM $3)
    AND (d.project_id IS NOT DISTINCT FROM $4)
  ORDER BY c.embedding <=> (SELECT qvec FROM params)
  LIMIT (SELECT topk FROM params)
),
lex AS (
  -- Full-text search (PostgreSQL tsvector)
  SELECT c.id,
         1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf,
         NULL::float AS distance
  FROM kb.chunks c
  JOIN kb.documents d ON d.id = c.document_id
  JOIN kb.projects p ON p.id = d.project_id
  WHERE c.tsv @@ (SELECT qts FROM params)
    AND ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
    AND (p.organization_id IS NOT DISTINCT FROM $3)
    AND (d.project_id IS NOT DISTINCT FROM $4)
  ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC
  LIMIT (SELECT topk FROM params)
),
fused AS (
  -- Reciprocal Rank Fusion: Combine scores
  SELECT id, SUM(rrf) AS score, MIN(distance) AS distance
  FROM (
    SELECT * FROM vec
    UNION ALL
    SELECT * FROM lex
  ) u
  GROUP BY id
)
SELECT c.id AS chunk_id, c.document_id, c.chunk_index, c.text,
       d.filename, d.source_url, f.distance
FROM fused f
JOIN kb.chunks c ON c.id = f.id
JOIN kb.documents d ON d.id = c.document_id
ORDER BY f.score DESC
LIMIT (SELECT topk FROM params)
```

**Why Strategic**:

- **pgvector extension**: `<=>` operator for cosine distance on embeddings
- **Full-text search**: `ts_rank()` for text relevance, `@@` for matching
- **RRF algorithm**: `1.0 / (rank + 60)` - industry-standard hybrid search
- **UNION ALL + GROUP BY**: Fuses results from two independent searches
- **websearch_to_tsquery()**: Parses user query into full-text search format

**RRF Formula Explained**:

```
RRF Score = Σ (1 / (rank + k))

Where:
- rank = position in ranking (1st, 2nd, 3rd, etc.)
- k = constant (60 is standard, prevents divide-by-zero)

Example:
- Document ranked #1 in vector search: 1/(1+60) = 0.0164
- Same document ranked #3 in text search: 1/(3+60) = 0.0159
- Combined RRF score: 0.0164 + 0.0159 = 0.0323

Higher score = appears high in both rankings
```

**Benefits of RRF Over Simple Averaging**:

| Approach       | Pros                                                                                                                       | Cons                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **RRF**        | ✅ Rank-based (no score normalization needed)<br>✅ Handles missing results<br>✅ Standard algorithm (Cormack et al. 2009) | ❌ Parameter tuning (k=60)                                      |
| Simple Average | ✅ Intuitive                                                                                                               | ❌ Requires score normalization<br>❌ Sensitive to score ranges |
| Weighted Sum   | ✅ Tunable weights                                                                                                         | ❌ Requires score normalization<br>❌ Hard to tune              |

**Multi-Tenant Filtering** (lines 495-497, 508-510):

```sql
WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
  AND (p.organization_id IS NOT DISTINCT FROM $3)
  AND (d.project_id IS NOT DISTINCT FROM $4)
```

- Optional `filterIds` for document-specific search
- `IS NOT DISTINCT FROM` for org/project filtering (consistent with conversations)
- Applies to both vector and full-text branches

**TypeORM Migration Effort**: **Impossible** - pgvector, full-text search, CTEs with UNION ALL  
**Alternative**: Separate vector search service + application-level fusion (much slower)  
**Performance Impact**: **High** - RRF is core feature, must be efficient  
**Maintenance Risk**: **Low** - pgvector and full-text search are stable PostgreSQL features

---

### Already Migrated to TypeORM

#### 2.1 Simple CRUD Operations (4 methods)

**Method**: `renameConversation()` - lines 266-297

```typescript
const conversation = await this.conversationRepository.findOne({
  where: { id },
  select: ['id', 'ownerUserId', 'isPrivate'],
});

if (!conversation) return 'not-found';
if (
  conversation.isPrivate &&
  conversation.ownerUserId &&
  conversation.ownerUserId !== userId
) {
  return 'forbidden';
}

await this.conversationRepository.update(id, { title });
return 'ok';
```

**Method**: `deleteConversation()` - lines 299-326

```typescript
const conversation = await this.conversationRepository.findOne({
  where: { id },
  select: ['id', 'ownerUserId', 'isPrivate'],
});

if (!conversation) return 'not-found';
if (
  conversation.isPrivate &&
  conversation.ownerUserId &&
  conversation.ownerUserId !== userId
) {
  return 'forbidden';
}

await this.conversationRepository.delete(id);
return 'ok';
```

**Method**: `persistUserMessage()` - lines 431-457

```typescript
const message = this.messageRepository.create({
  conversationId,
  role: 'user',
  content,
});
await this.messageRepository.save(message);

// Update conversation timestamp
await this.conversationRepository.update(conversationId, {
  updatedAt: new Date(),
});
```

**Method**: `persistAssistantMessage()` - lines 541-573

```typescript
const message = this.messageRepository.create({
  conversationId,
  role: 'assistant',
  content,
  citations: citations as any,
});
await this.messageRepository.save(message);

// Update conversation timestamp
await this.conversationRepository.update(conversationId, {
  updatedAt: new Date(),
});
```

**Method**: `hasConversation()` - lines 575-583

```typescript
const count = await this.conversationRepository.count({ where: { id } });
return count > 0;
```

**Why These Methods Use TypeORM**:

- ✅ Simple CRUD operations (SELECT, INSERT, UPDATE, DELETE, COUNT)
- ✅ No PostgreSQL-specific features needed
- ✅ Entity-based authorization checks (isPrivate, ownerUserId)
- ✅ JSON columns supported by TypeORM (`citations: jsonb`)
- ✅ Demonstrates hybrid approach is feasible

**Completion Status**: **4/9 methods use TypeORM (44%), 4/9 use strategic SQL (44%), 1/9 helper (12%)**

---

### Offline Mode Support (In-Memory Fallback)

**Pattern**: Every method includes offline fallback using in-memory `Map`

**Example** (lines 82-99):

```typescript
async listConversations(...) {
  if (!this.db.isOnline()) {
    const all = Array.from(this.offlineConvs.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    return {
      shared: all
        .filter((c) => !c.isPrivate)
        .map((c) => ({ ... })),
      private: [],
    };
  }

  // ... online PostgreSQL queries
}
```

**Why Offline Mode**:

- **Development experience**: Service works without database connection
- **Testing**: Unit tests don't require PostgreSQL
- **Resilience**: Graceful degradation if database unavailable
- **Consistent API**: Same interface for online and offline modes

**Offline Storage** (lines 43-60):

```typescript
private offlineConvs = new Map<
  string,
  {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    ownerUserId: string | null;
    isPrivate: boolean;
    messages: {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      citations?: any;
      createdAt: string;
    }[];
  }
>();
```

**Trade-offs**:

| Aspect          | Benefit                 | Cost                                |
| --------------- | ----------------------- | ----------------------------------- |
| Development     | ✅ Works without DB     | ❌ Not representative of production |
| Testing         | ✅ Fast unit tests      | ❌ Doesn't test SQL queries         |
| Resilience      | ✅ Graceful degradation | ❌ In-memory data lost on restart   |
| Code complexity | ❌ Duplicate logic      | ❌ Two code paths to maintain       |

**Recommendation**: Consider removing offline mode once test infrastructure is stable. E2E tests should use real database, unit tests should mock repositories.

---

### Migration Recommendation: **HYBRID APPROACH** ✅

**Rationale**:

1. **4 methods** use PostgreSQL-specific features (`IS NOT DISTINCT FROM`, RRF hybrid search, transactions)
2. **4 methods** already migrated to TypeORM (simple CRUD)
3. **1 helper** doesn't touch database
4. Demonstrates **optimal hybrid pattern**: Use right tool for each method
5. TypeORM migration of strategic SQL methods would require:
   - Custom QueryBuilder with raw expressions for `IS NOT DISTINCT FROM`
   - Loss of RRF hybrid search (would need separate service)
   - More verbose transaction syntax
   - Degraded maintainability

**Effective Completion**: **100%** (hybrid approach is the target state)

---

## Summary: Strategic SQL Justification

### Services Marked Complete (Sprint 4)

| Service     | Total Methods | Strategic SQL Methods | TypeORM Methods | Helper Methods | Completion %  |
| ----------- | ------------- | --------------------- | --------------- | -------------- | ------------- |
| ChatService | 9             | 4                     | 4               | 1              | 100% (hybrid) |

### PostgreSQL Features Used

| Feature               | Methods                                    | Migration Effort | Alternative                                 |
| --------------------- | ------------------------------------------ | ---------------- | ------------------------------------------- |
| IS NOT DISTINCT FROM  | `listConversations()`                      | Medium           | COALESCE or conditional WHERE (verbose)     |
| Manual Transactions   | `createConversationIfNeeded()`             | Low              | TypeORM transaction manager (works fine)    |
| pgvector + RRF Fusion | `retrieveCitations()`                      | Impossible       | Separate vector service + app-level fusion  |
| Full-text Search      | `retrieveCitations()`                      | Impossible       | External search engine (Elasticsearch)      |
| Multi-CTE Queries     | `retrieveCitations()`                      | High             | Multiple queries + app-level merge (slower) |
| Diagnostic Queries    | `listConversations()`, `getConversation()` | Low              | Already using TypeORM (optimal)             |

### Impact on Migration Tracking

**Previous Status (Sprint 3)**: 41/56 services complete (73.2%)

**New Status (Sprint 4)**: 42/56 services complete (75.0%)

- 38 services: 100% TypeORM
- 4 services: Strategic SQL (Sprints 1-2)
- 1 service: Strategic SQL + Hybrid (Sprint 3)
- 1 service: Hybrid Strategic SQL + TypeORM (Sprint 4)

**Effective Progress**: +1 service marked complete (+1.8%)

---

## Key Insights from Sprint 4

### 1. Hybrid Approach is Optimal

**ChatService demonstrates the correct balance**:

```typescript
// ✅ Use Strategic SQL for: Complex filtering, search algorithms, transactions
async listConversations() { /* IS NOT DISTINCT FROM */ }
async retrieveCitations() { /* RRF hybrid search */ }
async createConversationIfNeeded() { /* Transaction */ }

// ✅ Use TypeORM for: Simple CRUD, authorization checks, timestamps
async renameConversation() { /* findOne + update */ }
async persistUserMessage() { /* save */ }
async hasConversation() { /* count */ }
```

**Decision Matrix**:

| Use Case     | Choose Strategic SQL If...                       | Choose TypeORM If...                               |
| ------------ | ------------------------------------------------ | -------------------------------------------------- |
| Filtering    | Needs `IS NOT DISTINCT FROM`, complex conditions | Simple equality checks                             |
| Search       | Full-text, vector, hybrid algorithms             | N/A (use strategic SQL)                            |
| Transactions | Multiple entities, explicit control              | Single entity, implicit transaction                |
| CRUD         | N/A                                              | Create, Read, Update, Delete without special logic |
| Diagnostics  | N/A                                              | Simple counts, finds for debugging                 |

### 2. IS NOT DISTINCT FROM Pattern (Consistent Across Services)

**This is the third service using this pattern**:

1. **BranchService** (Sprint 1): Branch uniqueness with NULL lineage
2. **ExtractionJobService** (Sprint 3): Optional org/project filtering
3. **ChatService** (Sprint 4): Optional project filtering

**Pattern**:

```sql
-- Filter by dimension when provided, otherwise return all
WHERE dimension_column IS NOT DISTINCT FROM $1
```

**When to Use**:

- ✅ Optional filters where NULL is a valid value (not just "missing")
- ✅ Multi-tenant queries where org/project may be NULL
- ✅ Consistency with PostgreSQL NULL semantics

**Recommendation**: Standardize this pattern across all services with optional filtering.

### 3. Reciprocal Rank Fusion (RRF) is Best Practice

**Why RRF Over Other Hybrid Search Approaches**:

| Algorithm              | When to Use                   | Pros                                                         | Cons                        |
| ---------------------- | ----------------------------- | ------------------------------------------------------------ | --------------------------- |
| **RRF** (this service) | General-purpose hybrid search | ✅ Rank-based<br>✅ No normalization<br>✅ Industry standard | ❌ Parameter tuning         |
| CombSUM                | Score-based fusion            | ✅ Simple                                                    | ❌ Requires normalization   |
| Weighted Hybrid        | Tunable weights               | ✅ Flexible                                                  | ❌ Hard to tune weights     |
| Separate Searches      | Simple retrieval              | ✅ Easy to implement                                         | ❌ No fusion, worse results |

**RRF Formula**:

```
score(document) = Σ [1 / (rank_i + k)]

Where:
- rank_i = position in ranking i (vector, text, etc.)
- k = constant (typically 60)
- Σ = sum across all rankings
```

**Reference**: Cormack, Clarke, Büttcher (2009) - "Reciprocal Rank Fusion outperforms the best known automatic fusion technique"

**Recommendation**: Use RRF for hybrid search across knowledge base, documentation, and citation retrieval.

### 4. Offline Mode Trade-Offs

**Benefits**:

- ✅ Development without database
- ✅ Fast unit tests
- ✅ Graceful degradation

**Costs**:

- ❌ Duplicate logic (online + offline paths)
- ❌ Doesn't test actual SQL queries
- ❌ In-memory data lost on restart
- ❌ Two code paths to maintain

**Recommendation for Future**:

```typescript
// ❌ Current: Dual implementation
if (!this.db.isOnline()) {
  return this.offlineConvs.get(id);  // In-memory
}
return await this.db.query(...);      // PostgreSQL

// ✅ Better: Mock database in tests, remove offline mode
// Use real PostgreSQL for E2E tests
// Use mocked repository for unit tests
```

**Action Items**:

- [ ] Evaluate removing offline mode from ChatService
- [ ] Ensure test infrastructure supports database mocking
- [ ] Migrate offline fallback logic to test mocks

---

## Architectural Decision: Hybrid Strategic SQL + TypeORM

**Problem**: Should we force-migrate all methods to TypeORM for consistency?

**Solution**: Use hybrid approach - strategic SQL for complex operations, TypeORM for CRUD

**Pattern**:

```typescript
@Injectable()
export class ChatService {
  // ✅ Strategic SQL: Complex filtering, search, transactions
  async listConversations() {
    /* IS NOT DISTINCT FROM */
  }
  async retrieveCitations() {
    /* RRF hybrid search */
  }
  async createConversationIfNeeded() {
    /* Transaction */
  }

  // ✅ TypeORM: Simple CRUD
  async renameConversation() {
    /* Repository.update() */
  }
  async persistUserMessage() {
    /* Repository.save() */
  }

  // ✅ Helper: Pure logic
  mapUserId() {
    /* No DB */
  }
}
```

**Benefits**:

1. **Performance**: SQL optimized for complex operations
2. **Maintainability**: TypeORM for simple CRUD reduces boilerplate
3. **Flexibility**: Can use PostgreSQL features when needed
4. **Gradual migration**: Can migrate methods incrementally

**When to Choose Strategic SQL**:

- [ ] Uses PostgreSQL-specific features (pgvector, full-text, CTEs, etc.)
- [ ] Complex multi-step transactions
- [ ] Performance-critical operations
- [ ] Dynamic filtering with `IS NOT DISTINCT FROM`
- [ ] Hybrid search algorithms

**When to Choose TypeORM**:

- [ ] Simple CRUD (Create, Read, Update, Delete)
- [ ] Entity-based authorization checks
- [ ] Single-entity operations
- [ ] Diagnostic/logging queries
- [ ] Count, exists, basic filters

---

## Next Steps

1. ✅ Document ChatService (this file)
2. ⏳ Update MIGRATION_TRACKING.md with Sprint 4 metrics
3. ⏳ Analyze next service candidates:
   - DiscoveryJobService (24 queries) - Similar to ExtractionJobService
   - TypeRegistryService (7 queries) - Moderate complexity
   - Worker Services (batch of 4 services)
4. ⏳ Commit Sprint 4 documentation

**Estimated Time for Remaining Services**: 6-8 hours (3-4 services)

**Target Completion**: 80% (45/56 services)

---

## References

- [Strategic SQL Sprint 1](./STRATEGIC_SQL_DOCUMENTATION_SPRINT_1.md) - ProductVersionService, PathSummaryService, BranchService, EmbeddingJobsService
- [Strategic SQL Sprint 2](./STRATEGIC_SQL_DOCUMENTATION_SPRINT_2.md) - GraphService, SearchService, EncryptionService, TagService
- [Strategic SQL Sprint 3](./STRATEGIC_SQL_DOCUMENTATION_SPRINT_3.md) - ExtractionJobService
- [Migration Tracking](./MIGRATION_TRACKING.md) - Overall progress
- [TypeORM Migration Guide](./TYPEORM_MIGRATION_GUIDE.md) - Migration patterns
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) - RRF algorithm paper
