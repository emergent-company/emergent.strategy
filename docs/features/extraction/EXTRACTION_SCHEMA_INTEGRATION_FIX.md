# Extraction Schema Integration Fix

## Issue Identified

The extraction system is **NOT** loading or passing the object type schemas from template packs to the LLM during entity extraction.

### Current State

1. ✅ Template packs contain `object_type_schemas` with detailed JSON Schema definitions:
   ```json
   {
     "Person": {
       "type": "object",
       "required": ["full_name"],
       "properties": {
         "full_name": { "type": "string", "description": "The full name of the person." },
         "role": { "type": "string", "description": "The person's role in the project." },
         "organization": { "type": "string", "description": "The organization the person belongs to." }
       }
     },
     "Organization": {
       "type": "object",
       "required": ["name"],
       "properties": {
         "name": { "type": "string", "description": "Organization name" },
         "industry": { "type": "string", "description": "Primary industry or sector" },
         "headquarters": { "type": "string", "description": "Headquarters location" }
       }
     }
   }
   ```

2. ✅ Template packs contain `extraction_prompts` with human-readable instructions:
   ```json
   {
     "Person": {
       "system": "Extract all people mentioned in the text with their role, organization, and location when available.",
       "user": "Identify each person in the text. Return their name, title, company, and location if present."
     }
   }
   ```

3. ❌ **PROBLEM**: The extraction worker only loads and uses `extraction_prompts`, **NOT** the `object_type_schemas`

4. ❌ **RESULT**: The LLM receives vague instructions like:
   > "Extract all people mentioned in the text with their role, organization, and location when available."
   
   Instead of receiving the structured schema:
   > "Extract Person entities with the following schema:
   > - full_name (required): The full name of the person
   > - role: The person's role in the project
   > - organization: The organization the person belongs to"

### What Should Happen

The LLM should receive:
1. The extraction prompt text (user intent)
2. **The complete object type schemas** showing exactly what properties each entity type should have
3. Clear structure showing required vs optional fields
4. Property descriptions from the schemas

### Files Involved

1. **`apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`**
   - Method: `loadExtractionPrompt()` → Needs to become `loadExtractionConfig()`
   - Currently loads only `extraction_prompts` from template pack
   - **FIX**: Also load `object_type_schemas` and return both

2. **`apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`**
   - Method: `extractEntities()` → receives `extractionPrompt` string
   - Method: `buildPrompt()` → constructs final prompt for LLM
   - **FIX**: Accept object schemas as parameter and include them in prompt

3. **`apps/server/src/modules/extraction-jobs/llm/llm-provider.interface.ts`**
   - Interface: `extractEntities()` signature
   - **FIX**: Update to accept object schemas

## Required Changes

### Step 1: Update Worker Service

Change `loadExtractionPrompt()` to `loadExtractionConfig()`:

```typescript
private async loadExtractionConfig(job: ExtractionJobDto): Promise<{
    prompt: string | null;
    objectSchemas: Record<string, any>;
}> {
    const templatePackQuery = `SELECT 
            tp.extraction_prompts, 
            tp.object_type_schemas,  -- ADD THIS
            ptp.customizations->>'default_prompt_key' as default_prompt_key
        FROM kb.project_template_packs ptp
        JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
        WHERE ptp.project_id = $1 AND ptp.active = true
        LIMIT 1`;

    // ... existing code to load ...

    const extractionPrompts = result.rows[0].extraction_prompts || {};
    const objectSchemas = result.rows[0].object_type_schemas || {};  // ADD THIS

    // ... existing prompt selection logic ...

    return {
        prompt: finalPrompt,
        objectSchemas: objectSchemas  // RETURN BOTH
    };
}
```

### Step 2: Update Call Site in processJob()

Around line 389 in `extraction-worker.service.ts`:

```typescript
// BEFORE:
const extractionPrompt = await this.loadExtractionPrompt(job).catch((error) => {
    // ...
});

// AFTER:
const extractionConfig = await this.loadExtractionConfig(job).catch((error: Error) => {
    // ...
});

if (!extractionConfig.prompt) {
    const message = 'No extraction prompt configured for this project';
    promptStep('error', { message });
    throw new Error(message);
}

// Extract for convenience
const extractionPrompt = extractionConfig.prompt;
const objectSchemas = extractionConfig.objectSchemas;
```

### Step 3: Update LLM Provider Interface

In `apps/server/src/modules/extraction-jobs/llm/llm-provider.interface.ts`:

```typescript
export interface LlmProvider {
    extractEntities(
        documentContent: string,
        extractionPrompt: string,
        objectSchemas: Record<string, any>,  // ADD THIS PARAMETER
        allowedTypes?: string[]
    ): Promise<ExtractionResult>;
}
```

### Step 4: Update Vertex AI Provider

In `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`:

```typescript
async extractEntities(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,  // ADD THIS
    allowedTypes?: string[]
): Promise<ExtractionResult> {
    // ...

    // Build the prompt WITH SCHEMAS
    const fullPrompt = this.buildPrompt(
        documentContent,
        extractionPrompt,
        objectSchemas,  // PASS SCHEMAS
        allowedTypes
    );

    // ... rest of method ...
}

private buildPrompt(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,  // ADD THIS
    allowedTypes?: string[]
): string {
    let prompt = extractionPrompt + '\n\n';

    // ADD SCHEMA INFORMATION
    if (Object.keys(objectSchemas).length > 0) {
        prompt += '**Object Type Schemas:**\n';
        prompt += 'Extract entities matching these schema definitions:\n\n';
        
        const schemasToShow = allowedTypes && allowedTypes.length > 0
            ? allowedTypes.filter(type => objectSchemas[type])
            : Object.keys(objectSchemas);

        for (const typeName of schemasToShow) {
            const schema = objectSchemas[typeName];
            prompt += `**${typeName}:**\n`;
            
            if (schema.properties) {
                prompt += 'Properties:\n';
                for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
                    const required = schema.required?.includes(propName) ? ' (required)' : '';
                    const description = propDef.description || '';
                    prompt += `  - ${propName}${required}: ${description}\n`;
                }
            }
            prompt += '\n';
        }
    }

    if (allowedTypes && allowedTypes.length > 0) {
        prompt += `**Allowed Entity Types:**\n${allowedTypes.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    prompt += '**Document Content:**\n\n' + documentContent + '\n\n';
    
    // ... rest of existing prompt construction ...
    
    return prompt;
}
```

### Step 5: Update Worker Call to LLM

Around line 445 in `extraction-worker.service.ts`:

```typescript
// BEFORE:
const result = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    allowedTypes
);

// AFTER:
const result = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    objectSchemas,  // ADD THIS
    allowedTypes
);
```

### Step 6: Update Other LLM Providers (if exists)

If there's a Langchain Gemini provider or other providers, update them similarly.

## Expected Result

After the fix, the LLM will receive prompts like:

```
Extract all people mentioned in the text with their role, organization, and location when available.
Identify each person in the text. Return their name, title, company, and location if present.

**Object Type Schemas:**
Extract entities matching these schema definitions:

**Person:**
Properties:
  - full_name (required): The full name of the person.
  - role: The person's role in the project (e.g., Developer, Manager, CEO).
  - organization: The organization the person belongs to.

**Organization:**
Properties:
  - name (required): Organization name
  - industry: Primary industry or sector
  - headquarters: Headquarters location

**Document Content:**

[actual document text here]

**Instructions:**
Extract entities as a JSON array with the following structure:
...
```

This will drastically improve extraction quality because the LLM knows:
1. Exactly what properties to extract
2. Which properties are required
3. What each property represents
4. The expected structure for each entity type

## Testing

After implementing the fix:

1. Run an extraction job
2. Check the extraction logs for the "llm_call" step
3. Verify the `inputData.prompt` now includes the object schemas
4. Verify extracted entities have the correct properties from the schemas

## Database Query to Verify Template Pack Has Schemas

```sql
SELECT 
    name,
    version,
    jsonb_pretty(object_type_schemas) as schemas,
    jsonb_pretty(extraction_prompts) as prompts
FROM kb.graph_template_packs
WHERE name = 'Extraction Demo Pack';
```

This should show both the schemas and prompts are available in the database.
