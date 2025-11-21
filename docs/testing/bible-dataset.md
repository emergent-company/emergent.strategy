# Bible Test Dataset

A comprehensive test dataset of 66 Bible books in markdown format for validating search, extraction, and graph capabilities.

## Purpose

The Bible provides an ideal test dataset because:

- **Rich interconnections:** People and places are mentioned across many books and chapters
- **Verifiable content:** Well-known text with clear ground truth for validation
- **Structured metadata:** Books, chapters, verses provide natural document hierarchy
- **Diverse entity types:** People, places, events, quotes, and relationships
- **Real-world complexity:** Mirrors knowledge management use cases with cross-references

## What's Included

### Test Data Files

- **Location:** `test-data/bible/books/`
- **Format:** 66 markdown files (one per Bible book)
- **Source:** [mdbible repository](https://github.com/lguenth/mdbible) (ESV translation)
- **Structure:**
  - Book titles as H1 headings (`# Genesis`)
  - Chapters as H2 headings (`## Chapter 1`)
  - Verses numbered sequentially (`1. In the beginning...`)

### Template Pack

A Bible-specific template pack with:

**Entity Types:**

- **Person:** Name, role, tribe, birth_location, death_location
- **Place:** Name, region, country, alternate_names
- **Event:** Name, date_description, location, participants
- **Book:** Name, testament, category, author
- **Quote:** Text, speaker, context, book_reference

**Relationship Types:**

- APPEARS_IN (Person/Place/Event → Book)
- LOCATED_IN (Place → Place)
- PARENT_OF / CHILD_OF (Person → Person)
- BORN_IN / DIED_IN (Person → Place)
- TRAVELS_TO (Person → Place)
- OCCURS_IN (Event → Place)
- PARTICIPATES_IN (Person → Event)

## Installation

### Step 1: Install Template Pack

First, create the Bible Knowledge Graph template pack:

```bash
npm run seed:bible-template
```

This creates a template pack that can be selected when configuring extraction jobs via the interface.

### Step 2: Upload Documents

Upload all 66 Bible books to a project:

```bash
npm run seed:bible -- --project-id=<your-project-uuid>
```

**Required Environment Variables:**

```bash
BIBLE_SEED_ACCESS_TOKEN=<your-super-admin-jwt-token>
```

**Optional Environment Variables:**

```bash
BIBLE_SEED_API_URL=http://localhost:3000  # Default: localhost:3000
BIBLE_SEED_RATE_LIMIT_MS=100             # Default: 100ms between uploads
```

**Command Options:**

- `--project-id=<uuid>` - Required: Target project for documents
- `--dry-run` - Validate configuration without uploading

### Step 3: Configure Extraction (Manual)

After documents are uploaded:

1. Navigate to the admin interface
2. Go to the Documents page for your project
3. Select one or more Bible documents
4. Click "Extract" and choose the "Bible Knowledge Graph" template pack
5. Wait for extraction to complete
6. Explore extracted entities and relationships in the Graph view

**Note:** Extraction is NOT triggered automatically. This allows you to:

- Inspect uploaded documents first
- Configure extraction settings
- Control when extraction runs
- Test different template packs

## Usage Examples

### Dry Run (Validate Before Uploading)

```bash
npm run seed:bible -- --project-id=abc123 --dry-run
```

This will:

- Check environment variables
- List all 66 files that would be uploaded
- Show total size
- Exit without uploading

### Upload to Specific Environment

```bash
# Local development
BIBLE_SEED_API_URL=http://localhost:3000 \
BIBLE_SEED_ACCESS_TOKEN=your-token \
npm run seed:bible -- --project-id=abc123

# Staging environment
BIBLE_SEED_API_URL=https://staging.example.com \
BIBLE_SEED_ACCESS_TOKEN=your-token \
npm run seed:bible -- --project-id=xyz789
```

### Custom Rate Limiting

```bash
# Faster uploads (no delay)
BIBLE_SEED_RATE_LIMIT_MS=0 npm run seed:bible -- --project-id=abc123

# Slower uploads (500ms delay)
BIBLE_SEED_RATE_LIMIT_MS=500 npm run seed:bible -- --project-id=abc123
```

## Verification

### Test Search Functionality

After upload and extraction, validate with these queries:

**Semantic Search:**

```
"Moses" - Should return Exodus, Deuteronomy, and other books where Moses appears
"Jerusalem" - Should return books mentioning Jerusalem
"faith" - Should return New Testament epistles with faith discussions
```

**Full-Text Search:**

```
"In the beginning" - Should return Genesis 1
"For God so loved the world" - Should return John 3
"Love is patient" - Should return 1 Corinthians 13
```

**Cross-Document Queries:**

```
"David" - Should return 1 Samuel, 2 Samuel, Psalms, and genealogy references
"Babylon" - Should return historical and prophetic books
```

### Validate Extraction Results

Check the Graph view for:

**Person Entities:**

- Abraham (role: patriarch, various locations)
- Moses (role: prophet/lawgiver, Egypt/Sinai references)
- Jesus (role: Messiah, Bethlehem/Jerusalem locations)
- Paul (role: apostle, multiple travel locations)

**Place Entities:**

- Jerusalem (region: Judea, many relationships)
- Egypt (country context, multiple events)
- Rome (New Testament context)

**Relationships:**

- Abraham PARENT_OF Isaac
- Jesus BORN_IN Bethlehem
- Paul TRAVELS_TO Rome
- Crucifixion OCCURS_IN Jerusalem

## Expected Results

### Upload Summary

```
=== Upload Summary ===

Total files: 66
Successful: 66
Failed: 0
Time elapsed: ~15-30s (depending on rate limit)

✓ All documents uploaded successfully!
```

### Document Statistics

- **Total documents:** 66 (Genesis through Revelation)
- **Approximate size:** 2-3 MB total
- **Expected chunks:** 500-1000 (varies by chunking configuration)
- **Testaments:** 39 Old Testament + 27 New Testament

### Extraction Statistics (After Manual Trigger)

Expected entities (approximate, depends on extraction configuration):

- **People:** 500+ (Adam, Noah, Abraham, Moses, David, Jesus, disciples, Paul, etc.)
- **Places:** 200+ (Jerusalem, Bethlehem, Egypt, Babylon, Rome, etc.)
- **Events:** 100+ (Creation, Exodus, Crucifixion, Pentecost, etc.)
- **Relationships:** 1000+ (family trees, journeys, events, appearances)

## Troubleshooting

### Error: Missing required argument: --project-id

**Solution:** Provide project ID as command-line argument:

```bash
npm run seed:bible -- --project-id=your-uuid-here
```

### Error: Missing required environment variable: BIBLE_SEED_ACCESS_TOKEN

**Solution:** Set your super admin JWT token:

```bash
export BIBLE_SEED_ACCESS_TOKEN=your-token-here
npm run seed:bible -- --project-id=abc123
```

Or create a `.env` file:

```bash
BIBLE_SEED_ACCESS_TOKEN=your-token-here
```

### Error: HTTP 401: Unauthorized

**Solution:** Your access token may be expired or invalid. Generate a new super admin token.

### Error: HTTP 404: Project not found

**Solution:** Verify the project ID exists and your token has access:

```bash
# List projects via API
curl -H "Authorization: Bearer $BIBLE_SEED_ACCESS_TOKEN" \
  http://localhost:3000/projects
```

### Error: Bible books directory not found

**Solution:** Ensure you're running from the project root:

```bash
cd /path/to/spec-server-2
npm run seed:bible -- --project-id=abc123
```

### Upload fails for some books

**Solution:** Check the failure summary and retry individual books if needed. Common causes:

- Network interruptions
- Server timeouts
- Rate limiting

You can re-run the script - it will attempt to upload all books again. The system may deduplicate based on content hash.

### Extraction jobs not appearing

**Reminder:** Extraction is manual. You must:

1. Go to Documents page in admin UI
2. Select documents
3. Click "Extract" button
4. Choose "Bible Knowledge Graph" template pack

### No entities extracted

**Possible causes:**

- Wrong template pack selected
- Extraction job still processing (check status)
- Template pack not properly installed (re-run `npm run seed:bible-template`)

## Advanced Usage

### Selective Upload (Manual)

If you want to upload specific books only:

1. Create a custom script or manually select files from `test-data/bible/books/`
2. Use the same upload logic from `scripts/seed-bible-documents.ts`
3. Adjust the file list as needed

### Custom Template Pack

To create a variant of the Bible template pack:

1. Copy `scripts/seed-bible-template-pack.ts`
2. Modify entity types and relationship types
3. Change `BIBLE_TEMPLATE_PACK_ID` to avoid conflicts
4. Run your custom script

### Integration with E2E Tests

To use Bible data in E2E tests:

```typescript
// In your test setup
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

beforeAll(async () => {
  // Upload Bible documents
  await execAsync(`npm run seed:bible -- --project-id=${testProjectId}`, {
    env: { ...process.env, BIBLE_SEED_ACCESS_TOKEN: testToken },
  });
});
```

## Attribution

The Bible markdown files are from the [mdbible repository](https://github.com/lguenth/mdbible.git) created by lguenth.

- **Source:** https://github.com/lguenth/mdbible
- **Version:** English Standard Version (ESV)
- **Format:** Markdown with verse numbers
- **License:** See original repository for licensing details

## See Also

- Main testing guide: `docs/testing/AI_AGENT_GUIDE.md`
- Test data directory: `test-data/bible/README.md`
- Upload script: `scripts/seed-bible-documents.ts`
- Template pack script: `scripts/seed-bible-template-pack.ts`
