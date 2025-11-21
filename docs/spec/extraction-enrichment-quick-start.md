# Extraction Enrichment - Quick Start Guide

## The Quick Way (Works Today - No Code Changes Needed!)

### Scenario: You added new fields to Person schema

**Example:** Added `eye_color` and `hair_color` to Person entity in template pack v2.1

### Step 1: Update Schema

```typescript
// scripts/seed-bible-template-pack.ts
{
  type: 'Person',
  schema: {
    properties: {
      name: { type: 'string' },
      // ... existing fields ...

      // NEW FIELDS
      eye_color: {
        type: 'string',
        enum: ['brown', 'blue', 'green', 'hazel', 'gray', 'unknown'],
        description: 'Eye color if mentioned in biblical text'
      },
      hair_color: {
        type: 'string',
        description: 'Hair color if described in text'
      }
    }
  }
}
```

```bash
# Update template pack version to 2.1.0
npm run seed:bible-template
```

### Step 2: Re-Run Extraction with Merge Mode

**The system ALREADY supports this!**

Just re-run extraction on the same documents with these settings:

```typescript
POST /api/extraction-jobs
{
  "project_id": "<uuid>",
  "source_type": "document",
  "source_id": "<document-uuid>",
  "extraction_config": {
    "entity_types": ["Person"],           // Focus on one type
    "entity_linking_strategy": "key_match",  // Match by name/key
    "duplicate_strategy": "merge",        // Merge new info into existing
    "confidence_threshold": 0.7
  }
}
```

**What happens:**

1. LLM extracts Person entities (including new `eye_color`, `hair_color` fields)
2. Entity linking finds existing Person by name
3. System calculates property overlap
4. If overlap < 90%, merges new properties into existing entity
5. Creates new version with enriched data

**Result:**

```json
// Before (v2.0)
{
  "name": "Peter",
  "role": "apostle",
  "occupation": "fisherman",
  "_schema_version": "2.0.0"
}

// After enrichment (v2.1)
{
  "name": "Peter",
  "role": "apostle",
  "occupation": "fisherman",
  "eye_color": null,         // NEW - not mentioned in text
  "hair_color": null,        // NEW - not mentioned in text
  "_schema_version": "2.1.0",
  "_extraction_last_updated_at": "2025-11-21T..."
}
```

## Answers to Your Questions

### Q: What specific information should be provided during the rerun to leverage existing findings?

**A: The system automatically leverages existing findings through entity linking:**

1. **Entity matching**: Uses name/business_key to find existing entity
2. **Property overlap calculation**: Compares new vs existing properties
3. **Merge decision**: If < 90% overlap, merges new information
4. **Metadata tracking**: Records `_extraction_last_updated_by_job`

**You can enhance this by:**

- Sending existing entity as context in prompt (Strategy 3b)
- Using targeted extraction for only new fields (Strategy 2)

### Q: How will the process handle new fields during re-extraction?

**A: Two approaches available today:**

**Approach 1: Full Re-Extraction (Simple)**

```typescript
// LLM extracts everything (old + new fields)
extraction_config: {
  "entity_linking_strategy": "key_match",  // Find existing entities
  "duplicate_strategy": "merge"            // Merge all properties
}

// System automatically:
// 1. Extracts all fields (including new ones)
// 2. Finds existing entity by name
// 3. Merges: {...existing, ...new}
// 4. Creates new version
```

**Approach 2: Targeted Enrichment (Optimal - Needs Implementation)**

```typescript
// Only ask LLM for new fields
enrichment_config: {
  "mode": "enrichment",
  "new_fields": ["eye_color", "hair_color"],
  "include_existing_context": true  // Send existing data for context
}

// Custom prompt:
// "For entity Peter (apostle, fisherman), extract ONLY: eye_color, hair_color"
```

## Practical Examples

### Example 1: Enrich All Person Entities

```bash
# Get all documents that have Person entities
SELECT DISTINCT d.id, d.title
FROM kb.documents d
JOIN kb.object_extraction_jobs j ON j.source_id = d.id
JOIN kb.graph_objects o ON o.extraction_job_id = j.id
WHERE o.type = 'Person'
  AND o.project_id = '<project-uuid>'
  AND (o.properties->>'_schema_version' = '2.0.0'
       OR o.properties->>'_schema_version' IS NULL);

# For each document, create re-extraction job
POST /api/extraction-jobs
{
  "project_id": "<uuid>",
  "source_type": "document",
  "source_id": "<doc-id>",
  "extraction_config": {
    "entity_types": ["Person"],
    "entity_linking_strategy": "key_match",
    "duplicate_strategy": "merge",
    "confidence_threshold": 0.7
  }
}
```

### Example 2: Enrich Specific Entity

```bash
# Find entity's source document
SELECT extraction_job_id FROM kb.graph_objects WHERE id = '<entity-id>';
SELECT source_id FROM kb.object_extraction_jobs WHERE id = '<job-id>';

# Re-extract just that document
POST /api/extraction-jobs
{
  "source_id": "<document-id>",
  "extraction_config": {
    "entity_linking_strategy": "key_match",
    "duplicate_strategy": "merge"
  }
}
```

### Example 3: Bulk Enrichment Script

```bash
# Create script: scripts/enrich-bible-entities.ts
npx tsx scripts/enrich-bible-entities.ts \
  --project-id=<uuid> \
  --entity-type=Person \
  --from-version=2.0.0 \
  --to-version=2.1.0 \
  --new-fields=eye_color,hair_color
```

## Monitoring Enrichment

### Check Progress

```sql
-- Find entities still on old schema
SELECT type, COUNT(*) as count
FROM kb.graph_objects
WHERE project_id = '<uuid>'
  AND (properties->>'_schema_version' = '2.0.0'
       OR properties->>'_schema_version' IS NULL)
  AND deleted_at IS NULL
GROUP BY type;

-- Find recently enriched entities
SELECT type, COUNT(*) as count
FROM kb.graph_objects
WHERE project_id = '<uuid>'
  AND properties->>'_schema_version' = '2.1.0'
  AND properties->>'_enriched_at' IS NOT NULL
GROUP BY type;
```

### Verify Enrichment

```sql
-- Check if new fields are populated
SELECT
  id,
  key,
  properties->>'name' as name,
  properties->>'eye_color' as eye_color,
  properties->>'hair_color' as hair_color,
  properties->>'_schema_version' as schema_version,
  properties->>'_enriched_at' as enriched_at
FROM kb.graph_objects
WHERE type = 'Person'
  AND project_id = '<uuid>'
  AND properties->>'eye_color' IS NOT NULL
LIMIT 10;
```

## Best Practices

### 1. Test on Sample First

```bash
# Pick one document, one entity
# Run enrichment
# Verify results before bulk processing
```

### 2. Track Schema Versions

```typescript
// Always increment _schema_version when adding fields
_schema_version: "2.0.0" → "2.1.0"

// Track enrichment metadata
{
  _schema_version: "2.1.0",
  _enriched_at: "2025-11-21T...",
  _enriched_by_job: "job-uuid",
  _enriched_fields: ["eye_color", "hair_color"]
}
```

### 3. Use Batch Processing

```typescript
// Don't enrich all 5000 entities at once
// Process in batches of 50-100
// Monitor progress and errors
```

### 4. Validate Enrichment Quality

```sql
-- Check how many entities got new values
SELECT
  COUNT(*) FILTER (WHERE properties->>'eye_color' IS NOT NULL) as has_eye_color,
  COUNT(*) FILTER (WHERE properties->>'hair_color' IS NOT NULL) as has_hair_color,
  COUNT(*) as total
FROM kb.graph_objects
WHERE type = 'Person'
  AND properties->>'_schema_version' = '2.1.0';
```

## Next Steps

### Immediate (Use Strategy 1)

1. Update schema with new fields
2. Deploy template pack update
3. Re-run extraction with merge mode
4. Verify enrichment worked

### Short-term (Implement Strategy 2)

5. Build targeted enrichment script
6. Test token savings
7. Implement enrichment mode in extraction worker

### Long-term (Implement Strategy 3)

8. Build production enrichment system
9. Create enrichment queue/worker
10. Add monitoring dashboard
