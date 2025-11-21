# Bible Knowledge Graph - Entity Reference Pattern

## Overview

The Enhanced Bible Knowledge Graph template pack (v2.0) implements a **reference pattern** that allows entities to reference other entities using **names** (business keys) instead of UUIDs. This enables:

1. **Click-through navigation** in the UI
2. **Automatic relationship creation** during extraction
3. **Entity linking** across documents
4. **Intuitive LLM prompts** (names instead of technical IDs)

## Reference Naming Convention

### The `_ref` Suffix Pattern

Properties ending in `_ref` indicate they reference another entity by name:

```typescript
// ✅ CORRECT: Using entity references
{
  type: 'Person',
  properties: {
    name: 'Peter',
    birth_location_ref: 'Bethsaida',  // References Place entity
    father_ref: 'John',                // References Person entity
    tribe_ref: 'Tribe of Benjamin'     // References Group entity
  }
}

// ❌ INCORRECT: Using UUIDs
{
  type: 'Person',
  properties: {
    name: 'Peter',
    birth_location_ref: '123e4567-e89b-12d3-a456-426614174000', // Wrong!
    father_ref: '987fcdeb-51a2-43c7-9d8f-123456789abc'          // Wrong!
  }
}
```

### Reference Types

| Property Suffix             | Target Entity Type | Example Value                |
| --------------------------- | ------------------ | ---------------------------- |
| `book_ref`                  | Book               | `"Genesis"`, `"Matthew"`     |
| `chapter_ref`               | Chapter            | `"Genesis 1"`                |
| `speaker_ref`               | Person             | `"Jesus"`, `"Moses"`         |
| `location_ref`              | Place              | `"Jerusalem"`, `"Red Sea"`   |
| `birth_location_ref`        | Place              | `"Bethlehem"`                |
| `father_ref` / `mother_ref` | Person             | `"Abraham"`, `"Sarah"`       |
| `tribe_ref`                 | Group              | `"Tribe of Judah"`           |
| `leader_ref`                | Person             | `"David"`                    |
| `region_ref`                | Place              | `"Judea"`, `"Galilee"`       |
| `audience_ref`              | Person or Group    | `"Pharisees"`, `"Disciples"` |

## How It Works

### 1. Extraction Phase

When the LLM extracts entities, it uses **names** in reference fields:

```json
{
  "entities": [
    {
      "name": "Jesus",
      "type": "Person",
      "role": "Messiah",
      "birth_location_ref": "Bethlehem",
      "mother_ref": "Mary"
    }
  ]
}
```

### 2. Entity Linking Phase

The system's **entity linking service** resolves references:

1. **Lookup**: Find entity with matching `name` or `business_key`
2. **Create Relationship**: Create a relationship between entities
3. **Fallback**: If target doesn't exist yet, mark for later resolution

```typescript
// Pseudo-code of entity linking process
const person = findEntity({ type: 'Person', name: 'Jesus' });
const place = findEntity({ type: 'Place', name: 'Bethlehem' });

if (person && place) {
  createRelationship({
    type: 'BORN_IN',
    from: person.id,
    to: place.id,
  });
}
```

### 3. UI Rendering

The UI resolves references to enable click-through navigation:

```tsx
// When displaying a Person entity
<PropertyView label="Birth Location">
  <Link to={`/objects/${resolvedPlaceId}`}>Bethlehem</Link>
</PropertyView>
```

## Schema Design Guidelines

### Designing Entity Types

When creating new entity types, follow these conventions:

#### ✅ DO: Use `_ref` for entity references

```typescript
{
  type: 'Event',
  properties: {
    name: { type: 'string' },
    location_ref: {  // References Place entity
      type: 'string',
      description: 'Where the event happened (reference to Place entity)'
    },
    participants: {  // Array of Person references
      type: 'array',
      items: { type: 'string' },
      description: 'People involved (references to Person entities)'
    }
  }
}
```

#### ✅ DO: Provide clear descriptions

```typescript
birth_location_ref: {
  type: 'string',
  description: 'Place of birth (reference to Place entity, e.g., "Bethlehem")'
}
```

#### ❌ DON'T: Use plain strings for data that should be entities

```typescript
// Bad: Plain string that should be a reference
location: {
  type: 'string',
  description: 'Where the event happened'
}

// Good: Reference to Place entity
location_ref: {
  type: 'string',
  description: 'Where the event happened (reference to Place entity)'
}
```

### Extraction Prompt Guidelines

#### ✅ DO: Instruct LLM to use entity names

```typescript
extraction: {
  user: `Extract Person entities from the text.

CRITICAL REFERENCE INSTRUCTIONS:
1. name: Use the person's primary name
2. birth_location_ref: Use PLACE NAME (e.g., "Bethlehem"), NOT a UUID
3. father_ref: Use PERSON NAME (e.g., "Abraham"), NOT a UUID
4. tribe_ref: Use GROUP NAME (e.g., "Tribe of Judah")

Example:
{
  "name": "Isaac",
  "father_ref": "Abraham",
  "mother_ref": "Sarah",
  "birth_location_ref": "Canaan"
}`;
}
```

#### ❌ DON'T: Leave references ambiguous

```typescript
// Bad: Unclear what format to use
extraction: {
  user: 'Extract people and their locations';
}
```

## Examples by Entity Type

### Person Entity

```json
{
  "name": "Paul",
  "aliases": ["Saul", "Saul of Tarsus"],
  "role": "apostle",
  "occupation": "tentmaker",
  "birth_location_ref": "Tarsus",
  "tribe_ref": "Tribe of Benjamin",
  "converted_by_ref": "Jesus",
  "source_references": ["Acts 9", "Acts 13", "Romans 1"]
}
```

**Generated Relationships:**

- `Paul` --[BORN_IN]--> `Tarsus`
- `Paul` --[MEMBER_OF]--> `Tribe of Benjamin`

### Event Entity

```json
{
  "name": "Sermon on the Mount",
  "type": "teaching",
  "location_ref": "Mountain near Capernaum",
  "participants": ["Jesus", "The Twelve Apostles"],
  "date_description": "early in Jesus' ministry",
  "source_reference": "Matthew 5-7"
}
```

**Generated Relationships:**

- `Sermon on the Mount` --[OCCURS_IN]--> `Mountain near Capernaum`
- `Jesus` --[PARTICIPATES_IN]--> `Sermon on the Mount`
- `The Twelve Apostles` --[WITNESSES]--> `Sermon on the Mount`

### Chapter Entity

```json
{
  "book_ref": "Genesis",
  "number": 1,
  "reference": "Genesis 1",
  "verse_count": 31,
  "summary": "God creates the heavens, earth, and all living things in six days.",
  "themes": ["Creation", "Divine Order", "Image of God"]
}
```

**Generated Relationships:**

- `Genesis 1` --[PART_OF]--> `Genesis`
- `Genesis` --[CONTAINS]--> `Genesis 1`

### Quote Entity

```json
{
  "text": "I am the way, the truth, and the life",
  "speaker_ref": "Jesus",
  "audience_ref": ["The Twelve Apostles"],
  "context": "Teaching his disciples about reaching the Father",
  "source_reference": "John 14:6",
  "type": "teaching"
}
```

**Generated Relationships:**

- `Jesus` --[SPEAKS]--> `"I am the way..."`
- `"I am the way..."` --[ADDRESSED_TO]--> `The Twelve Apostles`

## Benefits of This Pattern

### 1. Human-Readable Prompts

LLMs work better with names than UUIDs:

```
"birth_location_ref": "Bethlehem"  ✅ Clear and natural
"birth_location_id": "a1b2c3..."   ❌ Confusing and error-prone
```

### 2. Automatic Relationship Creation

The system automatically creates relationships from references:

```
Person.birth_location_ref = "Bethlehem"
→ Creates: Person --[BORN_IN]--> Bethlehem
```

### 3. Cross-Document Linking

Entities with the same name across different documents are automatically linked:

```
Document 1: "Jesus was born in Bethlehem"
Document 2: "Bethlehem was the city of David"
→ Both reference the same "Bethlehem" Place entity
```

### 4. UI Navigation

Click on "Bethlehem" in one entity, navigate to the Bethlehem Place entity and see all related entities.

## Implementation Notes

### Entity Resolution Algorithm

The entity linking service uses this priority order:

1. **Exact name match** in same project
2. **Business key match** (if specified)
3. **Alias match** (if entity has aliases)
4. **Fuzzy match** (for minor spelling variations)
5. **Create pending relationship** (resolve later when entity is created)

### Performance Considerations

- Entity lookups are indexed on `name` and `business_key`
- References are resolved in batches
- Circular references are detected and prevented
- Failed resolutions are logged for manual review

## Migration Guide

### Updating Existing Template Packs

To convert string properties to references:

```diff
{
  type: 'Person',
  properties: {
    name: { type: 'string' },
-   birth_location: {
-     type: 'string',
-     description: 'Place of birth'
-   }
+   birth_location_ref: {
+     type: 'string',
+     description: 'Place of birth (reference to Place entity)'
+   }
  }
}
```

Update extraction prompts:

```diff
- user: 'Extract people with their birth locations'
+ user: `Extract people with their birth locations.
+
+ IMPORTANT: For birth_location_ref, use the PLACE NAME
+ (e.g., "Bethlehem"), not a UUID.`
```

## See Also

- `/scripts/seed-bible-template-pack-enhanced.ts` - Enhanced template pack implementation
- `/apps/server/src/modules/extraction-jobs/entity-linking.service.ts` - Entity linking logic
- `/docs/spec/bible-schema-design.md` - Overall schema design
