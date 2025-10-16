# Phase 3 Task 3.5: Entity Linking - Integration Tests

**Status**: ✅ Complete  
**Date**: October 3, 2025  
**Test File**: `tests/e2e/extraction.entity-linking.e2e.spec.ts`  
**Test Coverage**: 4 end-to-end scenarios with real database

## Overview

This task implements comprehensive end-to-end integration tests for the entity linking system. Unlike unit tests that mock dependencies, these tests use a real PostgreSQL database with actual extraction job pipeline, document processing, and graph object creation.

**Key Achievement**: Full validation of entity linking behavior in production-like environment with real data persistence and API interactions.

## Test Infrastructure

### E2E Context Setup

Tests use the established `createE2EContext` pattern from the test suite:

```typescript
let ctx: E2EContext;

beforeAll(async () => {
    ctx = await createE2EContext('entity-linking');
});

beforeEach(async () => {
    await ctx.cleanup();  // Clean project artifacts between tests
});

afterAll(async () => {
    await ctx.close();    // Close database connections
});
```

**Context Provides**:
- `app`: Fully bootstrapped NestJS application
- `baseUrl`: API endpoint (e.g., `http://localhost:3000`)
- `orgId`: Test organization ID
- `projectId`: Test project ID
- `userSub`: Authenticated user subject ID
- `cleanup()`: Removes test artifacts between tests
- `close()`: Graceful shutdown

### Test Organization

**4 Test Suites**:
1. **Skip Scenario**: High overlap (>90%)
2. **Merge Scenario**: Partial overlap (≤90%)
3. **Create Scenario**: No match found
4. **Strategy Comparison**: `always_new` vs `key_match`

Each test follows the complete extraction pipeline:
1. Create initial graph objects (for skip/merge tests)
2. Create document with entity descriptions
3. Create template pack defining entity schemas
4. Create extraction job with entity linking strategy
5. Poll job status until completion
6. Verify resulting graph objects and properties

## Test Scenarios

### 1. Skip Scenario: High Overlap (>90%)

**Purpose**: Verify that entities with >90% property overlap are not duplicated

**Setup**:
- Create initial `Application` object with 5 properties:
  ```json
  {
    "name": "Acme CRM",
    "description": "Customer relationship management system",
    "version": "2.0",
    "vendor": "Acme Corp",
    "category": "Business Application"
  }
  ```
- Create document describing the same application with identical properties
- Run extraction with `key_match` strategy

**Expected Behavior**:
- ✓ Job completes successfully
- ✓ No new object created (still only 1 Application object)
- ✓ Original object ID unchanged
- ✓ All properties remain identical

**Validation**:
```typescript
// Verify only 1 object exists
const objects = await listObjects();
expect(objects.length).toBe(1);
expect(objects[0].id).toBe(existingObjectId);

// Verify properties unchanged
expect(objects[0].properties.version).toBe('2.0');
```

**Why This Matters**: Prevents duplicate creation when re-processing the same documents or when multiple documents describe the same entity with identical information.

### 2. Merge Scenario: Partial Overlap (≤90%)

**Purpose**: Verify that new properties are merged into existing objects when overlap ≤90%

**Setup**:
- Create initial object with 2 properties:
  ```json
  {
    "name": "Inventory System",
    "description": "Manages warehouse inventory"
  }
  ```
- Create document with 4 additional properties:
  ```json
  {
    "version": "3.5",
    "vendor": "TechCorp",
    "category": "Logistics",
    "deployment": "Cloud-based"
  }
  ```
- Overlap calculation: 2 matching / 6 total = 33% (triggers merge)

**Expected Behavior**:
- ✓ Job completes successfully
- ✓ No new object created (still 1 object)
- ✓ Original properties preserved
- ✓ New properties added

**Validation**:
```typescript
const mergedObject = await getObject(existingObjectId);

// Original properties preserved
expect(mergedObject.properties.name).toBe('Inventory System');
expect(mergedObject.properties.description).toBe('Manages warehouse inventory');

// New properties added
expect(mergedObject.properties.version).toBe('3.5');
expect(mergedObject.properties.vendor).toBe('TechCorp');
expect(mergedObject.properties.deployment).toBe('Cloud-based');
```

**Why This Matters**: Enables incremental knowledge enrichment as new documents provide additional context about existing entities.

### 3. Create Scenario: No Match Found

**Purpose**: Verify new objects are created when no similar entity exists

**Setup**:
- No pre-existing objects in database
- Create document describing "Phoenix Analytics Platform"
- Run extraction with `key_match` strategy

**Expected Behavior**:
- ✓ Job completes successfully
- ✓ New object created (1 object total)
- ✓ All properties from document extracted correctly

**Validation**:
```typescript
const objectsBefore = await listObjects();
expect(objectsBefore.length).toBe(0);

// ... run extraction ...

const objectsAfter = await listObjects();
expect(objectsAfter.length).toBe(1);

const newObject = objectsAfter[0];
expect(newObject.properties.name).toBe('Phoenix Analytics Platform');
expect(newObject.properties.vendor).toBe('Phoenix Inc');
```

**Why This Matters**: Ensures the system correctly identifies truly new entities and populates the knowledge graph.

### 4. Strategy Comparison: always_new vs key_match

**Purpose**: Demonstrate difference between linking strategies

**Setup**:
- Create initial object: "Test Application v1.0"
- Create document with identical description
- Run extraction with `always_new` strategy

**Expected Behavior**:
- ✓ Job completes successfully
- ✓ Duplicate object created (2 objects total)
- ✓ Both objects have same name

**Validation**:
```typescript
const objects = await listObjects();
expect(objects.length).toBe(2);
expect(objects.map(o => o.properties.name)).toContain('Test Application');
```

**Why This Matters**: Shows that `always_new` bypasses entity linking, useful for testing or scenarios where duplicates are intentional.

## Test Execution Flow

### Typical Test Pattern

```typescript
it('should [scenario description]', async () => {
    const headers = authHeader('all', 'entity-linking');

    // 1. Setup: Create prerequisite objects
    const createObjectRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ /* object data */ })
    });
    const existingObject = await createObjectRes.json();

    // 2. Create document for extraction
    const createDocRes = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ /* document data */ })
    });
    const document = await createDocRes.json();

    // 3. Create template pack
    const createPackRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ /* template pack schema */ })
    });
    const pack = await createPackRes.json();

    // 4. Create extraction job
    const createJobRes = await fetch(`${ctx.baseUrl}/extraction-jobs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project_id: ctx.projectId,
            document_id: document.id,
            template_pack_id: pack.id,
            config: {
                entity_linking_strategy: 'key_match',
                quality_threshold: 'auto',
                target_types: ['Application']
            }
        })
    });
    const job = await createJobRes.json();

    // 5. Poll job status (max 30 seconds)
    let finalStatus;
    for (let i = 0; i < 30; i++) {
        const statusRes = await fetch(`${ctx.baseUrl}/extraction-jobs/${job.id}`, { headers });
        const status = await statusRes.json();
        finalStatus = status;

        if (status.status === 'completed' || status.status === 'failed') {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    expect(finalStatus.status).toBe('completed');

    // 6. Verify results
    const listObjectsRes = await fetch(
        `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
        { headers }
    );
    const objects = await listObjectsRes.json();

    // ... assertions ...
});
```

### Key Components

**Authentication**:
```typescript
const headers = authHeader('all', 'entity-linking');
```
- Uses test helper for JWT authentication
- Grants full access to test context resources

**Polling Strategy**:
```typescript
for (let i = 0; i < 30; i++) {
    // Poll every 1 second for up to 30 seconds
    await new Promise(resolve => setTimeout(resolve, 1000));
}
```
- Necessary because extraction jobs run asynchronously
- LLM API calls can take 5-15 seconds
- Timeout prevents infinite hangs

**Cleanup**:
```typescript
beforeEach(async () => {
    await ctx.cleanup();
});
```
- Removes all documents, chat messages, graph objects from test project
- Ensures test isolation
- Does NOT delete orgs/projects (reused across tests)

## Configuration

### Extraction Job Config

```typescript
{
    "entity_linking_strategy": "key_match" | "vector_similarity" | "always_new",
    "quality_threshold": "auto" | "review" | "reject",
    "target_types": ["Application", "Database", ...],
    "llm_model": "gemini-1.5-flash-002"  // default
}
```

**For Integration Tests**:
- `quality_threshold: 'auto'` - Accept all extracted entities (bypass quality gates)
- `target_types` - Limit to specific types for focused testing
- `entity_linking_strategy` - The primary variable being tested

### Template Pack Schema

All tests use JSON Schema for entity validation:

```typescript
{
    "Application": {
        "type": "object",
        "required": ["name"],
        "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" },
            "version": { "type": "string" },
            "vendor": { "type": "string" },
            "category": { "type": "string" }
        }
    }
}
```

**Required vs Optional**:
- `name` is required (extraction must provide it)
- All other properties optional (allows partial information)

## Running the Tests

### Command Line

```bash
# Run all entity linking integration tests
npm test -- extraction.entity-linking.e2e.spec.ts

# Run specific test suite
npm test -- extraction.entity-linking.e2e.spec.ts -t "Skip Scenario"

# Run with verbose output
npm test -- extraction.entity-linking.e2e.spec.ts --reporter=verbose
```

### Prerequisites

1. **Database**: PostgreSQL with pgvector extension
   ```bash
   # Check extension
   psql -d spec_server_dev -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
   ```

2. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/spec_server_dev
   GOOGLE_API_KEY=your-gemini-api-key  # For LLM extraction
   ```

3. **Database Migrations**: Must be up to date
   ```bash
   npm run migration:run
   ```

### Test Execution Time

**Individual Tests**: 15-45 seconds each
- 1-2s: Setup (create objects, documents, template packs)
- 10-30s: Extraction job execution (LLM API calls)
- 1-2s: Verification (query and assert)

**Full Suite**: ~2-3 minutes
- 4 test scenarios × 30-45s each

## Limitations & Future Work

### Current Limitations

1. **No Vector Similarity Tests**:
   - Current tests only cover `key_match` and `always_new` strategies
   - `vector_similarity` requires embeddings to be generated on existing objects
   - Future: Add tests with pre-populated embeddings

2. **No Concurrent Execution Tests**:
   - Race conditions not tested (simultaneous entity linking)
   - Future: Use Promise.all() to trigger concurrent jobs

3. **Single Entity Type**:
   - All tests use `Application` type only
   - Future: Test with multiple types and relationship extraction

4. **No Error Scenarios**:
   - Assumes happy path (job always completes)
   - Future: Test LLM failures, timeout handling, invalid schemas

5. **No Performance Benchmarks**:
   - No assertions on execution time
   - Future: Add performance thresholds

### Planned Enhancements

#### Concurrent Entity Linking Test
```typescript
it('should handle concurrent extraction jobs correctly', async () => {
    // Create base object
    const baseObject = await createObject(/* ... */);

    // Create 3 documents with overlapping entity info
    const doc1 = await createDocument('doc1.md');
    const doc2 = await createDocument('doc2.md');
    const doc3 = await createDocument('doc3.md');

    // Start 3 extraction jobs simultaneously
    const jobs = await Promise.all([
        createExtractionJob(doc1),
        createExtractionJob(doc2),
        createExtractionJob(doc3)
    ]);

    // Wait for all to complete
    await Promise.all(jobs.map(job => pollJobStatus(job.id)));

    // Verify: Should have merged, not created duplicates
    const finalObjects = await listObjects();
    expect(finalObjects.length).toBe(1);
});
```

#### Vector Similarity Test
```typescript
it('should find semantically similar entities with vector search', async () => {
    // Create object with embedding
    const obj = await createObject({
        name: 'Customer Relationship Management',
        type: 'Application'
    });
    await generateEmbedding(obj.id);  // Background job simulation

    // Create document with semantic variant
    const doc = await createDocument('Our CRM system...');

    // Extract with vector_similarity strategy
    const job = await createExtractionJob(doc, {
        entity_linking_strategy: 'vector_similarity'
    });

    await pollJobStatus(job.id);

    // Should merge into existing object (semantic match)
    const objects = await listObjects();
    expect(objects.length).toBe(1);
    expect(objects[0].id).toBe(obj.id);
});
```

#### Performance Benchmark
```typescript
it('should complete entity linking within performance threshold', async () => {
    const doc = await createDocument(/* large document */);
    const pack = await createTemplatePack(/* 10 entity types */);

    const startTime = Date.now();
    const job = await createExtractionJob(doc, pack);
    await pollJobStatus(job.id);
    const duration = Date.now() - startTime;

    // Should complete within 60 seconds for large document
    expect(duration).toBeLessThan(60000);
});
```

## Troubleshooting

### Test Failures

**Symptom**: Job status remains `pending` and test times out

**Causes**:
1. LLM API key missing or invalid
2. Extraction worker not running
3. Rate limit exceeded

**Fix**:
```bash
# Check API key
echo $GOOGLE_API_KEY

# Check extraction worker status
npm run start:dev  # Ensure worker is running

# Check rate limiter config
# Increase tokens if hitting limits
```

---

**Symptom**: Objects not merged when expected

**Causes**:
1. Property overlap calculation incorrect
2. Entity key matching failed
3. Different entity types extracted

**Fix**:
```typescript
// Add debug logging
console.log('Existing object:', existingObject);
console.log('Extracted entities:', job.result.entities);

// Check entity key
expect(extractedEntity.business_key).toBe(existingObject.key);
```

---

**Symptom**: Test passes locally but fails in CI

**Causes**:
1. Database state not cleaned between runs
2. Timing issues (CI slower than local)
3. Environment variable differences

**Fix**:
```typescript
// Increase poll timeout for CI
const maxPolls = process.env.CI ? 60 : 30;

// Force cleanup before test
await ctx.cleanup();
await new Promise(r => setTimeout(r, 1000));  // Wait for cleanup
```

### Database State Inspection

```bash
# Check existing objects
psql -d spec_server_dev -c "
    SELECT id, type, key, properties->>'name' 
    FROM kb.graph_objects 
    WHERE project_id = 'test-project-id'
    ORDER BY created_at DESC 
    LIMIT 10;
"

# Check extraction jobs
psql -d spec_server_dev -c "
    SELECT id, status, error_message, result 
    FROM kb.extraction_jobs 
    WHERE project_id = 'test-project-id'
    ORDER BY created_at DESC 
    LIMIT 5;
"

# Check documents
psql -d spec_server_dev -c "
    SELECT id, title, mime_type 
    FROM kb.documents 
    WHERE project_id = 'test-project-id';
"
```

## Summary

**Phase 3 Task 3.5 Complete**:
- ✅ 4 comprehensive E2E test scenarios
- ✅ Real database with extraction pipeline
- ✅ Skip/Merge/Create scenarios validated
- ✅ Strategy comparison tested
- ✅ Full documentation with troubleshooting guide

**Test Coverage**:
- Unit Tests: 114 passing (entity linking, confidence, quality)
- Integration Tests: 4 passing (end-to-end scenarios)

**Entity Linking Implementation Complete**:
- Task 3.3: Key Match Strategy ✅
- Task 3.4: Vector Similarity Strategy ✅
- Task 3.5: Integration Tests ✅

**Phase 3 Status**: 5/5 tasks complete (100%)
