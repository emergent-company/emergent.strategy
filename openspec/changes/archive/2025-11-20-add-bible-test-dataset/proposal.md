# Change: Add Bible Test Dataset with Template Pack

## Why

The system needs a comprehensive, verifiable test dataset to validate search, extraction, and graph capabilities. The current test data is limited and doesn't provide sufficient coverage for testing:

- **Semantic search** across interconnected entities (people, places, events)
- **Graph relationships** between entities mentioned across multiple documents
- **Extraction accuracy** with verifiable ground truth
- **Full-text search** with rich, structured content
- **Cross-document references** where entities appear in multiple contexts

The Bible provides an ideal test dataset because:

- **Rich interconnections:** People and places are mentioned across many books and chapters
- **Verifiable content:** Well-known text with clear ground truth for validation
- **Structured metadata:** Books, chapters, verses provide natural document hierarchy
- **Diverse entity types:** People, places, events, quotes, and relationships
- **Real-world complexity:** Mirrors knowledge management use cases with cross-references

## What Changes

- **Test data files:** 66 Bible book markdown files copied to `test-data/bible/books/` from mdbible repository
- **Upload script:** `scripts/seed-bible-documents.ts` that reads local files and uploads via the ingestion API (no automatic extraction)
- **Batch upload support:** Upload each book as a separate document with metadata (book name, testament, order)
- **Manual extraction:** Documents uploaded without triggering extraction jobs (extraction configured manually via interface)
- **Template pack:** "Bible Knowledge Graph" with entity types (Person, Place, Event, Quote, Book) and relationship types for manual extraction configuration

### Files to Create

- `test-data/bible/books/*.md` - 66 Bible book markdown files (already copied)
- `test-data/bible/README.md` - Attribution and usage documentation
- `scripts/seed-bible-documents.ts` - Upload script using ingestion API
- `scripts/seed-bible-template-pack.ts` - Template pack for manual extraction setup
- Documentation in `docs/testing/bible-dataset.md` - Usage guide

### Affected Systems

- Ingestion API (existing, no changes)
- Template pack system (new pack configuration, installed separately)
- Test infrastructure (new dataset in repository)

## Impact

- **Affected specs:** document-management (ADDED requirement for batch metadata support), test-fixtures (new capability)
- **Affected code:**
  - `scripts/` - new seed script
  - Template pack configuration - new Bible-specific pack
- **Database:** New template pack and documents (no schema changes)
- **Testing:** Provides rich dataset for validating search/extraction features
- **Performance:** ~66 documents, expect ~500-1000 chunks total (manageable size)

## Breaking Changes

None. This is purely additive.

## Dependencies

- mdbible repository: https://github.com/lguenth/mdbible.git (files already copied to `test-data/bible/`)
- Existing ingestion API endpoints
- Existing template pack system
- Super admin credentials for API authentication
