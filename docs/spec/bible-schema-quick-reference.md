# Bible Knowledge Graph - Quick Reference

## Entity Reference Pattern

### The `_ref` Suffix Rule

**Rule:** Properties ending in `_ref` reference other entities by **name** (not UUID).

```typescript
// ✅ CORRECT
birth_location_ref: 'Bethlehem'; // Entity name
speaker_ref: 'Jesus'; // Entity name

// ❌ WRONG
birth_location_ref: 'uuid-123...'; // Don't use UUIDs
```

## Common Reference Fields

| Field Name           | References | Example                  |
| -------------------- | ---------- | ------------------------ |
| `book_ref`           | Book       | `"Genesis"`, `"Matthew"` |
| `speaker_ref`        | Person     | `"Jesus"`, `"Moses"`     |
| `location_ref`       | Place      | `"Jerusalem"`            |
| `birth_location_ref` | Place      | `"Bethlehem"`            |
| `death_location_ref` | Place      | `"Golgotha"`             |
| `father_ref`         | Person     | `"Abraham"`              |
| `mother_ref`         | Person     | `"Sarah"`                |
| `tribe_ref`          | Group      | `"Tribe of Judah"`       |
| `leader_ref`         | Person     | `"David"`                |
| `region_ref`         | Place      | `"Galilee"`              |

## Entity Types at a Glance

### Text Structure

- **Book** - Biblical books (66 total)
- **Chapter** - Chapters within books
- **Verse** - Individual verses

### Core Entities

- **Person** - People in scripture
- **Place** - Locations and landmarks
- **Event** - Significant occurrences
- **Group** - Tribes, nations, sects
- **Quote** - Notable sayings

### Specialized (v1.0)

- **Miracle** - Supernatural events
- **Prophecy** - Prophetic messages
- **Covenant** - Divine agreements
- **Angel** - Spiritual beings
- **Object** - Significant artifacts

## Key Relationships

### Hierarchy

- Book `CONTAINS` Chapter
- Chapter `CONTAINS` Verse
- Chapter `PART_OF` Book

### Location

- Entity `MENTIONED_IN` Chapter/Verse/Book
- Entity `FIRST_MENTIONED_IN` Chapter/Verse
- Event `OCCURS_IN` Place/Chapter

### Family

- Person `PARENT_OF` Person
- Person `CHILD_OF` Person
- Person `MARRIED_TO` Person
- Person `SIBLING_OF` Person

### Spatial

- Person `BORN_IN` Place
- Person `DIED_IN` Place
- Person `LIVED_IN` Place
- Place `LOCATED_IN` Place

### Group

- Person `MEMBER_OF` Group
- Person `LEADER_OF` Group
- Group `FOUNDED_BY` Person

### Communication

- Person `SPEAKS` Quote
- Quote `ADDRESSED_TO` Person/Group
- Person `WROTE` Book

## Extraction Prompt Template

```typescript
extraction: {
  system: 'You are extracting [EntityType] entities from biblical text.',
  user: `Extract [EntityType] entities from the text.

CRITICAL REFERENCE INSTRUCTIONS:
1. name: Use the primary name as it appears
2. [ref_field]: Use ENTITY NAME (e.g., "Bethlehem"), NOT a UUID
3. [other_refs]: Use ENTITY NAMES for all _ref fields
4. source_references: List chapter references where mentioned

Example:
{
  "name": "Example Name",
  "ref_field": "Referenced Entity Name",
  "description": "Brief description"
}

Extract all [entity type] mentioned in the text.`
}
```

## Quick Examples

### Book

```json
{
  "name": "Genesis",
  "testament": "Old Testament",
  "category": "Law",
  "author_ref": "Moses",
  "chapter_count": 50
}
```

### Chapter

```json
{
  "book_ref": "Genesis",
  "number": 1,
  "reference": "Genesis 1",
  "summary": "God creates the world in six days"
}
```

### Person

```json
{
  "name": "Abraham",
  "aliases": ["Abram"],
  "role": "patriarch",
  "birth_location_ref": "Ur",
  "father_ref": "Terah"
}
```

### Place

```json
{
  "name": "Jerusalem",
  "alternate_names": ["Zion", "City of David"],
  "type": "city",
  "region_ref": "Judea"
}
```

### Event

```json
{
  "name": "Crossing of the Red Sea",
  "type": "miracle",
  "location_ref": "Red Sea",
  "participants": ["Moses", "Aaron"]
}
```

### Quote

```json
{
  "text": "Let there be light",
  "speaker_ref": "God",
  "source_reference": "Genesis 1:3",
  "type": "proclamation"
}
```

## Files & Commands

### Seed Enhanced Template Pack

```bash
npx tsx scripts/seed-bible-template-pack-enhanced.ts
```

### Seed Bible Documents

```bash
npm run seed:bible -- --project-id=<uuid>
```

### Key Files

- Template: `scripts/seed-bible-template-pack-enhanced.ts`
- Docs: `docs/spec/bible-entity-references.md`
- Summary: `docs/spec/bible-schema-enhancements-summary.md`
- Test Data: `test-data/bible/books/`

## Troubleshooting

### References Not Resolving?

- Ensure referenced entity exists
- Check exact name spelling
- Verify entity type matches
- Check project scope

### Relationships Not Created?

- Confirm `_ref` suffix used
- Validate entity names match
- Check relationship type configuration
- Review entity linking logs

### Extraction Issues?

- Review extraction prompts
- Check schema examples
- Validate JSON format
- Check LLM provider logs

## Version Comparison

| Feature                | v1.0       | v2.0 Enhanced         |
| ---------------------- | ---------- | --------------------- |
| Template ID            | `...0001`  | `...0002`             |
| Entity References      | ❌ Strings | ✅ `_ref` pattern     |
| Hierarchical Structure | ❌ No      | ✅ Book/Chapter/Verse |
| Examples               | ❌ None    | ✅ Comprehensive      |
| Enhanced Prompts       | ❌ Basic   | ✅ Detailed           |
| Click-through UI       | ❌ No      | ✅ Yes                |

## Next Steps

1. Install enhanced template pack (v2.0)
2. Upload Bible documents
3. Run extraction job
4. Explore entities with click-through navigation
5. Query relationships via graph API
6. Build custom views and reports
