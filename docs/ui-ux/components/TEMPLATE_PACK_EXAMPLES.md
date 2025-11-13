# Template Pack Examples Feature

## Overview

Template packs can now include example entities in their object type schemas. These examples are passed to the LLM during extraction to improve the quality and consistency of extracted entities.

## Schema Structure

Each object type in `object_type_schemas` can optionally include an `examples` array:

```json
{
  "object_type_schemas": {
    "Person": {
      "type": "object",
      "description": "A person mentioned in the document",
      "properties": {
        "name": {
          "type": "string",
          "description": "Full name of the person"
        },
        "role": {
          "type": "string",
          "description": "Professional role or title"
        },
        "company": {
          "type": "string",
          "description": "Organization they work for"
        }
      },
      "required": ["name"],
      "examples": [
        {
          "name": "John Smith",
          "role": "Senior Engineer",
          "company": "Acme Corp"
        },
        {
          "name": "Jane Doe",
          "role": "Product Manager",
          "company": "Tech Solutions Inc"
        }
      ]
    },
    "Product": {
      "type": "object",
      "description": "A product or service",
      "properties": {
        "name": {
          "type": "string",
          "description": "Product name"
        },
        "category": {
          "type": "string",
          "description": "Product category"
        },
        "price": {
          "type": "number",
          "description": "Product price"
        }
      },
      "required": ["name"],
      "examples": [
        {
          "name": "Widget Pro",
          "category": "Hardware",
          "price": 299.99
        }
      ]
    }
  }
}
```

## Benefits

1. **Improved Extraction Quality**: LLM sees concrete examples of what entities should look like
2. **Consistent Formatting**: Examples demonstrate the expected structure and field naming
3. **Better Attribute Coverage**: Examples show which optional fields to populate
4. **Type Guidance**: Examples clarify ambiguous property types (dates, enums, etc.)

## Implementation

### Backend Changes

1. **Storage**: Examples stored as part of object_type_schemas JSON in kb.graph_template_packs
2. **Loading**: ExtractionWorkerService loads schemas including examples
3. **Prompt Generation**: LLM providers format examples into extraction prompts

### LLM Provider Integration

Both Vertex AI and LangChain Gemini providers now include examples in prompts:

```
Extract entities of type "Person":
- name: Full name of the person (string, required)
- role: Professional role or title (string)
- company: Organization they work for (string)

Examples:
{
  "name": "John Smith",
  "role": "Senior Engineer",
  "company": "Acme Corp"
}

{
  "name": "Jane Doe",
  "role": "Product Manager",
  "company": "Tech Solutions Inc"
}
```

## Best Practices

### Example Quality

- **Representative**: Use realistic examples from your domain
- **Diverse**: Show variety in entity types and attributes
- **Complete**: Include all important optional fields in at least one example
- **Accurate**: Ensure examples match the schema definition

### Example Quantity

- **2-3 examples per type**: Enough to show variety without overwhelming the LLM
- **Balance**: Include simple and complex examples
- **Edge cases**: Show special formatting (dates, URLs, enums)

### Example Content

- **Clear**: Use obvious, unambiguous entity names
- **Domain-specific**: Reflect your industry/use case
- **Varied**: Different combinations of required and optional fields

## Migration Guide

### Adding Examples to Existing Template Packs

1. Load the template pack
2. For each object type, add an `examples` array
3. Create 2-3 representative examples
4. Update the template pack

Example SQL:

```sql
UPDATE kb.graph_template_packs
SET object_type_schemas = jsonb_set(
  object_type_schemas,
  '{Person,examples}',
  '[
    {"name": "John Smith", "role": "Senior Engineer"},
    {"name": "Jane Doe", "role": "Product Manager"}
  ]'::jsonb
)
WHERE name = 'Business Pack';
```

### Creating New Template Packs with Examples

Use CreateTemplatePackDto with examples in schemas:

```typescript
const pack = {
  name: "My Pack",
  version: "1.0.0",
  object_type_schemas: {
    Person: {
      type: "object",
      properties: { /* ... */ },
      examples: [
        { name: "Example Person", role: "Example Role" }
      ]
    }
  }
};
```

## Testing

### Verifying Examples are Used

1. Check extraction logs for "Examples:" section in prompts
2. Compare extraction quality before/after adding examples
3. Monitor entity completeness (filled vs empty optional fields)

### Example Validation

The system does NOT validate examples against schemas automatically. Ensure your examples match the schema definition to avoid confusing the LLM.

## Related Files

- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts` - Vertex AI prompt builder
- `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts` - LangChain prompt builder
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Schema loading
- `apps/server/src/modules/template-packs/dto/template-pack.dto.ts` - DTO definitions

## Future Enhancements

- Automatic example validation against schemas
- Example suggestions based on existing entities
- A/B testing of different example sets
- Dynamic example selection based on document context
