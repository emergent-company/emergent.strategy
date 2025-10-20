# Extraction Schema System Explained

## Summary

**YES, the full schemas ARE being passed to the LLM.** The confusion comes from different logging levels showing different information.

## What You're Seeing vs What's Actually Happening

### What You See in Logs (Metadata)
```json
{
  "schema_types": [
    "Person",
    "Feature", 
    "Product",
    "Location",
    "Organization",
    "Meeting",
    "Decision",
    "Question",
    "ActionItem",
    "MeetingSeries"
  ]
}
```

This is just **metadata** logged by `extraction-worker.service.ts` line 492 for tracking purposes. It's a summary of type names only.

### What's Actually Sent to the LLM (Full Schemas)

The `buildPrompt` method in `vertex-ai.provider.ts` (lines 167-208) constructs a detailed prompt like this:

```markdown
**Object Type Schemas:**
Extract entities matching these schema definitions:

**Person:**
The full name of the person.

Properties:
  - full_name (required) [string]: The full name of the person.
  - role [string]: The person's role in the project (e.g., Developer, Manager, CEO).
  - organization [string]: The organization the person belongs to.

**Feature:**
A descriptive name for the feature or work package.

Properties:
  - name (required) [string]: A descriptive name for the feature or work package.
  - status (required) [string] (options: prioritized, in_progress, dev, production, future_package): The current development status of the feature.
  - priority [string] (options: high, medium, low): The priority level of the feature.
  - associated_product [string]: The product this feature belongs to.

**Meeting:**
A structured discussion with participants and agenda.

Properties:
  - name (required) [string]: Meeting title or subject
  - date [string]: Date of the meeting
  - participants [array]: List of participants
  - agenda [string]: Meeting agenda or topics

... (all 10 types with full property definitions)

**Document Content:**

[Your document text here]

**Instructions:**
Extract entities as a JSON array with the following structure:
...
```

## Code Flow

### 1. Load Schemas from Database (`extraction-worker.service.ts`)

```typescript
// Lines 1137-1300: loadExtractionConfig method
const templatePackQuery = `
  SELECT tp.id, tp.name, tp.extraction_prompts, 
         tp.object_type_schemas, ptp.customizations->>'default_prompt_key' 
  FROM kb.project_template_packs ptp
  JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
  WHERE ptp.project_id = $1 AND ptp.active = true
  ORDER BY tp.name
`;

// Merge schemas from all active template packs
const mergedObjectSchemas: Record<string, any> = {};
for (const row of result.rows) {
    const objectSchemas = row.object_type_schemas || {};
    for (const [typeName, schema] of Object.entries(objectSchemas)) {
        if (!mergedObjectSchemas[typeName]) {
            mergedObjectSchemas[typeName] = schema;
        }
    }
}

return { prompt: basePrompt, objectSchemas: mergedObjectSchemas };
```

### 2. Pass Full Schemas to LLM Provider (`extraction-worker.service.ts`)

```typescript
// Line 496-500
const result = await llmProvider.extractEntities(
    documentContent,      // The document text
    extractionPrompt,     // Base extraction instructions
    objectSchemas,        // ← FULL SCHEMA OBJECTS with properties, types, descriptions
    allowedTypes          // Optional filter of which types to extract
);
```

### 3. Build Detailed Prompt (`vertex-ai.provider.ts`)

```typescript
// Lines 167-208: buildPrompt method
private buildPrompt(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,  // ← Full schemas received
    allowedTypes?: string[]
): string {
    let prompt = extractionPrompt + '\n\n';

    if (Object.keys(objectSchemas).length > 0) {
        prompt += '**Object Type Schemas:**\n';
        prompt += 'Extract entities matching these schema definitions:\n\n';

        for (const typeName of schemasToShow) {
            const schema = objectSchemas[typeName];
            prompt += `**${typeName}:**\n`;

            // Add description
            if (schema.description) {
                prompt += `${schema.description}\n\n`;
            }

            // Add properties with types, requirements, enums
            if (schema.properties) {
                prompt += 'Properties:\n';
                for (const [propName, propDef] of Object.entries(schema.properties)) {
                    const required = schema.required?.includes(propName) ? ' (required)' : '';
                    const typeInfo = propDef.type ? ` [${propDef.type}]` : '';
                    const enumInfo = propDef.enum ? ` (options: ${propDef.enum.join(', ')})` : '';
                    prompt += `  - ${propName}${required}${typeInfo}${enumInfo}: ${propDef.description}\n`;
                }
            }

            // Add examples if available
            if (schema.examples && Array.isArray(schema.examples)) {
                prompt += '\nExamples:\n';
                for (const example of schema.examples) {
                    prompt += '```json\n' + JSON.stringify(example, null, 2) + '\n```\n';
                }
            }

            prompt += '\n';
        }
    }

    return prompt;
}
```

## Database Schema Structure

Your template packs store schemas as JSON objects with full JSON Schema format:

```json
{
  "Person": {
    "type": "object",
    "required": ["full_name"],
    "properties": {
      "full_name": {
        "type": "string",
        "description": "The full name of the person."
      },
      "role": {
        "type": "string",
        "description": "The person's role in the project (e.g., Developer, Manager, CEO)."
      },
      "organization": {
        "type": "string",
        "description": "The organization the person belongs to."
      }
    }
  },
  "Feature": {
    "type": "object",
    "required": ["name", "status"],
    "properties": {
      "name": {
        "type": "string",
        "description": "A descriptive name for the feature or work package."
      },
      "status": {
        "type": "string",
        "enum": ["prioritized", "in_progress", "dev", "production", "future_package"],
        "description": "The current development status of the feature."
      }
    }
  }
}
```

## Enhanced Debug Logging

After the recent update, the logs now show:

1. **Schemas included**: List of type names (quick overview)
2. **Prompt preview**: First 5000 characters of the actual prompt sent to LLM
3. **Object schemas detail**: First 3000 characters of the schema JSON

This allows you to verify that:
- All 10 types are loaded
- Each type has full property definitions
- Properties have types, descriptions, enums, required flags

## Verification Steps

To see the full schemas in action:

1. **Check server logs** after running extraction:
   ```bash
   npm run workspace:logs -- --lines 100 | grep -A 50 "Prompt preview"
   ```

2. **Look for the detailed prompt** showing:
   - `**Object Type Schemas:**`
   - Each type with `Properties:` section
   - Full property definitions with `[type]` and descriptions

3. **Verify schema detail log** shows the actual JSON schemas with all properties

## Expected Log Output

```
[DEBUG] [VertexAIProvider] Full prompt length: 12847 characters
[DEBUG] [VertexAIProvider] Schemas included: ActionItem, Decision, Feature, Location, Meeting, MeetingSeries, Organization, Person, Product, Question
[DEBUG] [VertexAIProvider] Prompt preview:
You are an expert at extracting structured information from documents...

**Object Type Schemas:**
Extract entities matching these schema definitions:

**ActionItem:**
Properties:
  - description (required) [string]: What needs to be done
  - owner [string]: Person responsible for the action
  - due_date [string]: When the action should be completed
  - status [string] (options: pending, in_progress, completed, cancelled): Current status

**Person:**
Properties:
  - full_name (required) [string]: The full name of the person.
  - role [string]: The person's role in the project (e.g., Developer, Manager, CEO).
  - organization [string]: The organization the person belongs to.

... (continues with all 10 types)

**Document Content:**

[Your document here]
```

## Conclusion

✅ **Full schemas ARE being sent to the LLM**
✅ **Properties with types, descriptions, enums ARE included**
✅ **Required fields ARE marked**
✅ **All 10 types from both template packs ARE loaded**

The `schema_types` array you see in logs is just metadata for tracking. The actual prompt includes the complete schema definitions with all properties, which is what guides the LLM's extraction.

## Next Steps

Run an extraction job and check the logs for:
1. `[loadExtractionConfig] Merged 10 object type(s)` 
2. `[VertexAIProvider] Schemas included: [all 10 types]`
3. `[VertexAIProvider] Prompt preview:` showing the detailed property definitions
4. `[VertexAIProvider] Object schemas detail:` showing the JSON schema structure
