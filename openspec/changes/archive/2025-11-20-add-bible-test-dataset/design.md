# Design: Bible Test Dataset Implementation

## Context

The system needs a comprehensive test dataset to validate search, extraction, and graph capabilities. We've chosen the Bible because it provides rich interconnected content with verifiable ground truth, making it ideal for testing semantic search, entity extraction, and relationship mapping.

The mdbible repository (https://github.com/lguenth/mdbible.git) provides the Bible in markdown format with one file per book (66 books total).

## Goals / Non-Goals

### Goals

- Create a reusable script that uploads Bible markdown files via the ingestion API
- Design a comprehensive Bible-specific template pack with entity types and relationships
- Support both automated seeding (for CI/E2E) and manual exploration (for developers)
- Provide verifiable test data for search and extraction features
- Enable testing of graph relationships across documents

### Non-Goals

- Direct database seeding (use ingestion API instead to test the full pipeline)
- Modifying the mdbible source files
- Creating a full theological ontology (keep it practical for testing)
- Real-time verse-level granularity (book-level documents are sufficient)

## Decisions

### Decision 1: Upload via Ingestion API (Not Direct DB Seeding)

**Choice:** Use POST /ingest/upload for each markdown file

**Rationale:**

- Tests the full ingestion pipeline (chunking, embedding, extraction)
- Validates API authentication and authorization
- Exercises the same code path as production uploads
- Provides realistic performance data for batch uploads

**Alternatives Considered:**

- Direct database INSERT statements: Bypasses important validation and processing logic
- Bulk import via custom endpoint: Adds unnecessary API surface area

### Decision 2: One Document Per Book (66 Documents)

**Choice:** Upload each Bible book as a separate document with metadata

**Rationale:**

- Manageable document size (~1-50 KB per book)
- Natural document boundaries matching source files
- Easier to verify extraction results per book
- Realistic document count for testing pagination and search

**Alternatives Considered:**

- Single combined document: Too large, difficult to debug
- One document per chapter: Too granular (1,189 documents), slower uploads

**Metadata per Document:**

- Filename: `{book_name}.md` (e.g., "Genesis.md", "Matthew.md")
- Custom metadata (in document content or future metadata field):
  - Testament: "Old Testament" or "New Testament"
  - Book order number (1-66)
  - Category: "Law", "History", "Wisdom", "Prophets", "Gospels", "Letters", "Apocalyptic"

### Decision 3: Bible-Specific Template Pack

**Choice:** Create a new template pack "Bible Knowledge Graph v1.0"

**Entity Types:**

1. **Person**

   - Properties: name (required), role, tribe, birth_location, death_location, occupation
   - Examples: "Abraham", "Moses", "Jesus", "Paul", "David"

2. **Place**

   - Properties: name (required), region, country, alternate_names
   - Examples: "Jerusalem", "Egypt", "Babylon", "Rome", "Bethlehem"

3. **Event**

   - Properties: name (required), date_description, location, participants
   - Examples: "Exodus from Egypt", "Crucifixion", "Pentecost", "Flood"

4. **Book**

   - Properties: name (required), testament, category, author
   - Examples: "Genesis", "Psalms", "Matthew", "Revelation"

5. **Quote**

   - Properties: text (required), speaker, context, book_reference
   - Examples: Notable verses, prophecies, commandments

6. **Group**

   - Properties: name (required), type, region, leader, members_count
   - Examples: "Pharisees", "Sadducees", "Twelve Apostles", "Tribe of Judah", "Romans"

7. **Object**

   - Properties: name (required), type, description, location, owner
   - Examples: "Ark of the Covenant", "Temple", "Golden Calf", "Stone Tablets"

8. **Covenant**

   - Properties: name (required), parties, terms, sign
   - Examples: "Abrahamic Covenant", "Mosaic Covenant", "New Covenant"

9. **Prophecy**

   - Properties: text (required), prophet, subject, fulfillment_reference
   - Examples: "Messiah prophecy", "Destruction of Jerusalem", "End times prophecy"

10. **Miracle**

    - Properties: name (required), type, performer, witnesses, location
    - Examples: "Parting of Red Sea", "Feeding 5000", "Resurrection of Lazarus"

11. **Angel**
    - Properties: name (required), rank, mission, appearances
    - Examples: "Gabriel", "Michael", "Cherubim", "Seraphim"

**Relationship Types:**

1. **APPEARS_IN** (Person/Place/Event/Group/Object/Angel → Book)
   - Tracks which entities appear in which books
2. **LOCATED_IN** (Place → Place)
   - Geographic hierarchy (e.g., "Bethlehem" LOCATED_IN "Judea")
3. **PARENT_OF** / **CHILD_OF** (Person → Person)
   - Family relationships
4. **BORN_IN** / **DIED_IN** (Person → Place)
   - Life events and locations
5. **TRAVELS_TO** (Person/Group → Place)
   - Journey tracking
6. **OCCURS_IN** (Event/Miracle → Place)
   - Event locations
7. **PARTICIPATES_IN** (Person/Group/Angel → Event)
   - Entities involved in events
8. **MEMBER_OF** (Person → Group)
   - Group membership (e.g., "Peter" MEMBER_OF "Twelve Apostles")
9. **LEADER_OF** (Person → Group)
   - Leadership relationships (e.g., "Moses" LEADER_OF "Israelites")
10. **FULFILLS** (Event/Person → Prophecy)
    - Prophecy fulfillment tracking
11. **MAKES_COVENANT** (Person/Group → Covenant)
    - Covenant parties
12. **PERFORMS_MIRACLE** (Person/Angel → Miracle)
    - Who performed the miracle
13. **WITNESSES** (Person/Group → Miracle/Event)
    - Who witnessed an event or miracle
14. **OWNS** (Person/Group → Object)
    - Ownership or possession of objects
15. **DESCENDED_FROM** (Person/Group → Person/Group)
    - Genealogical relationships and tribal lineage
16. **PROPHESIED_BY** (Prophecy → Person)
    - Who gave the prophecy
17. **SPEAKS** (Person/Angel → Quote)
    - Who said the quote

**Extraction Prompts:**

- System: "Extract biblical entities and their relationships from the text. Focus on people, places, events, groups, objects, covenants, prophecies, miracles, and angels. Identify connections between these entities."
- User: "Identify all persons, locations, events, groups, objects, covenants, prophecies, miracles, and angels mentioned. Capture relationships between entities when evident, including group membership, prophecy fulfillments, covenant parties, miracle performers and witnesses, and genealogical connections."

**Rationale:**

- Comprehensive coverage: Captures the full richness of biblical narratives
- Testable relationships: Clear connections to verify extraction accuracy
- Realistic ontology: Similar to knowledge management use cases (people, organizations, artifacts, agreements)
- Extensible: Foundation for more specialized entity types if needed

### Decision 4: Repository Files Committed to Project

**Choice:** Copy Bible markdown files from mdbible repository into `test-data/bible/books/` directory in the project

**Usage:**

```bash
# Upload Bible documents to a project
npm run seed:bible -- --project-id=<uuid>
```

**Rationale:**

- No runtime dependency on external repository
- Files versioned with the project for reproducibility
- Faster script execution (no git clone needed)
- Simplifies CI/CD and development workflow
- ~2-3MB total (acceptable for test data)

**Implementation:**

- 66 markdown files in `test-data/bible/books/`
- README.md with attribution and usage notes
- Script reads from local directory

### Decision 5: Progress Tracking and Error Handling

**Choice:** Implement progress logging, rate limiting, and error recovery

**Features:**

- Progress bar or counter showing upload progress (e.g., "Uploading 23/66 books...")
- Rate limiting: Optional delay between uploads to avoid overwhelming API
- Error handling: Continue on individual upload failures, report summary at end
- Dry-run mode: `--dry-run` flag to validate without uploading

**Rationale:**

- 66 uploads take time; users need feedback
- API rate limits may exist; respectful batch processing
- Partial failures shouldn't abort entire process
- Dry-run helps validate configuration before running

### Decision 6: Authentication and Configuration

**Choice:** Use super admin credentials with project ID as primary parameter

**Usage:**

```bash
# Required command-line argument
npm run seed:bible -- --project-id=<uuid>

# Environment variables for auth
BIBLE_SEED_API_URL=http://localhost:3000  # Optional, defaults to localhost:3000
BIBLE_SEED_ACCESS_TOKEN=<super-admin-jwt>  # Required

# Optional
BIBLE_SEED_RATE_LIMIT_MS=100  # Delay between uploads
BIBLE_SEED_SKIP_EXTRACTION=true  # Default: true (no auto extraction)
```

**Rationale:**

- Project ID as command-line arg (explicit, clear intent)
- Super admin credentials for unrestricted access
- Extraction disabled by default (manual trigger via interface)
- Flexible for different environments (local, CI, staging)

## Risks / Trade-offs

### Risk: Upload Time for 66 Documents

**Mitigation:**

- Implement progress tracking so users know it's working
- Add rate limiting option to avoid overwhelming server
- Consider parallel uploads in future iteration (keep simple for v1)

### Risk: Extraction Job Processing Time

**Mitigation:**

- Script completes after uploads, extraction jobs run async
- Document that extraction may take additional time
- Provide status check command to monitor extraction progress

### Risk: API Rate Limits or Timeouts

**Mitigation:**

- Built-in rate limiting with configurable delays
- Retry logic for transient failures (network errors, 503s)
- Continue on error to process remaining books

### Risk: Large Document Size Variations

**Trade-off:** Some books (Psalms, Isaiah) are much larger than others (Obadiah, Jude)

- Ingestion API already handles this (10MB limit)
- Chunking service will split large books appropriately
- Embeddings service processes chunks individually

## Migration Plan

No migration needed - this is a new dataset, not a schema change.

**Rollout:**

1. Create template pack seed script or add to existing seed script
2. Implement upload script with dry-run mode
3. Test with small subset (e.g., first 5 books)
4. Run full upload against local development environment
5. Document usage in `docs/testing/bible-dataset.md`
6. Add to E2E test fixtures (optional, on-demand seeding)

**Rollback:**

- Delete uploaded documents via DELETE /documents endpoint (bulk delete)
- Template pack remains but unused if not applied to extraction jobs

## Open Questions

1. **Should extraction jobs be triggered automatically or manually?**

   - ✅ **Decision:** Manual only. Script does not trigger extraction (BIBLE_SEED_SKIP_EXTRACTION defaults to true)
   - Extraction configured and triggered via the interface after upload

2. **Should the script wait for extraction jobs to complete?**

   - ✅ **Decision:** No. Script completes immediately after uploads since extraction is manual

3. **Should we include verse numbers in the markdown content?**

   - ✅ **Decision:** Yes. The mdbible repository already includes verse numbers in the format:
     - Book titles as H1 (`# Genesis`)
     - Chapters as H2 (`## Chapter 1`)
     - Verses numbered (`1. In the beginning...`, `2. The earth was...`)
   - This structure is preserved as-is for rich, structured content

4. **Should we create a separate org/project for Bible data?**
   - ✅ **Decision:** Project ID provided as command-line argument
   - Users choose their target project (can be dedicated Bible project or existing test project)
   - Flexible approach allows both isolated and shared configurations
