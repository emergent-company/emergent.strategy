# Implementation Tasks

## 1. Test Data Setup (COMPLETED)

- [x] 1.1 Copy 66 Bible book markdown files to `test-data/bible/books/`
- [x] 1.2 Create `test-data/bible/README.md` with attribution and usage notes
- [x] 1.3 Verify all 66 files present with proper naming

## 2. Bible Template Pack Creation

- [ ] 2.1 Review existing template pack schemas in `scripts/seed-*-template.ts`
- [ ] 2.2 Create `scripts/seed-bible-template-pack.ts` with entity types:
  - [ ] Person (name, role, tribe, birth_location, death_location)
  - [ ] Place (name, region, country, alternate_names)
  - [ ] Event (name, date_description, location, participants)
  - [ ] Book (name, testament, category, author)
  - [ ] Quote (text, speaker, context, book_reference)
- [ ] 2.3 Define relationship types:
  - [ ] APPEARS_IN, LOCATED_IN, PARENT_OF, CHILD_OF
  - [ ] BORN_IN, DIED_IN, TRAVELS_TO, OCCURS_IN, PARTICIPATES_IN
- [ ] 2.4 Configure extraction prompts for biblical content
- [ ] 2.5 Add npm script `seed:bible-template` to package.json
- [ ] 2.6 Test template pack creation on local database

## 3. Bible Document Upload Script

- [ ] 3.1 Create `scripts/seed-bible-documents.ts` with:
  - [ ] Command-line argument parsing for --project-id (required)
  - [ ] Environment variable validation (API_URL optional, ACCESS_TOKEN required)
  - [ ] File discovery from `test-data/bible/books/` directory
- [ ] 3.2 Implement file reading:
  - [ ] Scan `test-data/bible/books/` for .md files
  - [ ] Extract book metadata from filenames (order, testament)
  - [ ] Order books by traditional sequence (01-66)
- [ ] 3.3 Implement upload logic:
  - [ ] HTTP POST to /ingest/upload using node:fetch
  - [ ] Bearer token authentication with super admin credentials
  - [ ] Rate limiting with configurable delay (BIBLE_SEED_RATE_LIMIT_MS)
  - [ ] Progress tracking (current/total)
  - [ ] Skip extraction job triggering (manual extraction only)
- [ ] 3.4 Implement error handling:
  - [ ] Continue on individual failures
  - [ ] Collect failed uploads for summary
  - [ ] Retry logic for transient errors (network, 5xx)
  - [ ] Exit with non-zero code if any uploads failed
- [ ] 3.5 Implement dry-run mode:
  - [ ] --dry-run flag
  - [ ] Validate configuration
  - [ ] List files without uploading
- [ ] 3.6 Add npm script `seed:bible` to package.json
- [ ] 3.7 Test upload script on local environment:
  - [ ] Test with valid project ID
  - [ ] Test with --dry-run
  - [ ] Test rate limiting
  - [ ] Test error handling
  - [ ] Verify no extraction jobs triggered

## 4. Documentation

- [ ] 4.1 Create `docs/testing/bible-dataset.md` with:
  - [ ] Purpose and benefits
  - [ ] Installation instructions (with --project-id argument)
  - [ ] Environment variable reference
  - [ ] Manual extraction setup steps (interface workflow)
  - [ ] Usage examples
  - [ ] Sample search queries
  - [ ] Expected extraction results
  - [ ] Troubleshooting section
- [ ] 4.2 Update `docs/testing/AI_AGENT_GUIDE.md`:
  - [ ] Add Bible dataset to test data options
  - [ ] Link to bible-dataset.md
- [ ] 4.3 Update root README.md:
  - [ ] Add Bible dataset seeding to setup instructions (optional section)

## 5. Environment Configuration

- [ ] 5.1 Update `.env.example` with Bible seed variables:
  - [ ] BIBLE_SEED_API_URL (optional, default localhost:3000)
  - [ ] BIBLE_SEED_ACCESS_TOKEN (required)
  - [ ] BIBLE_SEED_RATE_LIMIT_MS (optional, default 100)
- [ ] 5.2 Document in `.env.example` comments

## 6. Testing & Validation

- [ ] 6.1 Manual testing:
  - [ ] Run template pack seed script
  - [ ] Verify template pack in database
  - [ ] Create a test project for Bible data
  - [ ] Run document upload script with dry-run
  - [ ] Run full document upload with --project-id
  - [ ] Verify all 66 documents in database
  - [ ] Verify NO extraction jobs were created automatically
  - [ ] Manually trigger extraction via interface
  - [ ] Verify extraction jobs created after manual trigger
- [ ] 6.2 Verify search functionality:
  - [ ] Semantic search for "Moses"
  - [ ] Semantic search for "Jerusalem"
  - [ ] Full-text search across books
  - [ ] Cross-document entity references
- [ ] 6.3 Verify extraction results (after manual trigger):
  - [ ] Check Person entities extracted
  - [ ] Check Place entities extracted
  - [ ] Check relationships created
  - [ ] Validate entity properties
- [ ] 6.4 Test error scenarios:
  - [ ] Missing environment variables
  - [ ] Invalid access token
  - [ ] Missing --project-id argument
  - [ ] Network failure simulation
  - [ ] Invalid project ID

## 7. Optional: E2E Test Integration

- [ ] 7.1 Create E2E test helper for Bible dataset:
  - [ ] Function to seed Bible data before tests
  - [ ] Function to clean up Bible data after tests
  - [ ] Add to test fixtures
- [ ] 7.2 Create sample E2E test using Bible data:
  - [ ] Search test with verifiable queries
  - [ ] Extraction validation test
  - [ ] Graph relationship test

## 8. Final Verification

- [ ] 8.1 Run build: `npm run build`
- [ ] 8.2 Run lint: `nx run-many -t lint`
- [ ] 8.3 Verify no existing tests broken
- [ ] 8.4 Review all TODO items completed
- [ ] 8.5 Update tasks.md checklist with [x] for completed items
