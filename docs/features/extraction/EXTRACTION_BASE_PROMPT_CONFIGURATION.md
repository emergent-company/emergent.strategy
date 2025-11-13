# Entity Extraction Base Prompt Configuration

## Overview

The base extraction prompt is the foundation instruction given to the LLM when extracting entities from documents. This prompt is **schema-agnostic** - it provides general extraction guidelines without mentioning specific entity types. The actual entity schemas (with properties, examples, and descriptions) are automatically appended by the LLM provider based on installed template packs.

## Configuration Priority

The extraction base prompt is loaded in the following order of priority:

1. **Database Setting** (`kb.settings` table, key: `extraction.basePrompt`)
   - Configurable through Admin UI
   - Takes precedence over all other sources
   - Allows runtime changes without server restart

2. **Environment Variable** (`EXTRACTION_BASE_PROMPT`)
   - Set in `.env` file or deployment environment
   - Useful for deployment-specific defaults
   - Requires server restart to take effect

3. **Default Prompt** (hardcoded in `AppConfigService`)
   - Built-in fallback if no custom prompt configured
   - See below for the default text

## Default Prompt

```
You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.
```

## Configuring via Admin UI

### Location

Navigate to: **Admin → Settings → AI Prompts**

Or directly: `/admin/settings/ai/prompts`

### Steps

1. Scroll to the **Entity Extraction Base Prompt** card
2. Edit the prompt text in the textarea
3. Click **Save** to persist changes to the database
4. Click **Restore default** to revert to the built-in default

### UI Features

- **Real-time editing**: Changes are shown immediately in the textarea
- **Auto-save**: Saves to database when you click Save
- **Default restore**: One-click restoration of the default prompt
- **Guidance text**: Explains that the prompt should be schema-agnostic
- **Live updates**: Changes take effect for new extraction jobs without server restart

## Configuring via Environment Variable

### File: `apps/server/.env`

```bash
# Customizable base prompt for entity extraction (optional)
# If not set, uses default schema-agnostic prompt
# This should NOT mention specific entity types - those come from schemas
EXTRACTION_BASE_PROMPT="You are an expert entity extraction system..."
```

### Note

- Multi-line prompts should use `\n` for newlines
- Escape quotes if needed
- Requires server restart to take effect
- Database settings override this value

## Best Practices

### Do ✅

- Keep the prompt **schema-agnostic** (don't mention specific entity types like "Person" or "Location")
- Focus on **general extraction guidelines** (confidence scoring, property completeness, etc.)
- Use **clear, directive language** ("Extract entities that...", "Assign confidence scores...")
- Include **quality criteria** (thoroughness, precision, format compliance)
- Emphasize **JSON output format** requirements

### Don't ❌

- **Don't hardcode entity types** - schemas are appended automatically based on installed template packs
- **Don't include examples** - those belong in the object type schemas themselves
- **Don't add template-specific logic** - keep it generic to work with all template packs
- **Don't make it too long** - the LLM provider adds schemas, examples, and document content

## How It Works

### Prompt Assembly Flow

1. **Worker loads base prompt** from database/environment/default
2. **Worker loads object schemas** from installed template packs for the project
3. **LLM provider receives**:
   - Base prompt (schema-agnostic instructions)
   - Object schemas (type definitions with properties, examples, descriptions)
   - Document content (the actual text to extract from)

4. **LLM provider assembles final prompt**:
   ```
   {basePrompt}
   
   SCHEMA DEFINITIONS:
   {objectSchemas with properties, types, examples}
   
   DOCUMENT:
   {documentContent}
   ```

### Example Final Prompt

```
You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.

SCHEMA DEFINITIONS:

TYPE: Person
DESCRIPTION: A person mentioned in the document
PROPERTIES:
  - name (string, required): Full name of the person
  - role (string, optional): Their role or title
  - organization (string, optional): Organization they belong to
EXAMPLES:
  {
    "type_name": "Person",
    "name": "John Smith",
    "properties": {
      "role": "CEO",
      "organization": "Acme Corp"
    }
  }

TYPE: Organization
...

DOCUMENT:
John Smith, CEO of Acme Corp, announced...
```

## Testing Changes

### Via Admin UI

1. Update the prompt in Settings → AI Prompts
2. Save the changes
3. Create a new extraction job (upload a document)
4. Check extraction logs to verify the new prompt is used

### Via Logs

```bash
# Monitor extraction worker logs
npm run workspace:logs -- server

# Look for:
# "Using extraction base prompt from database settings"
# or
# "Using schema-based extraction with X object type(s)"
```

### Via Database

```sql
-- Check current setting
SELECT key, value FROM kb.settings WHERE key = 'extraction.basePrompt';

-- Manually update (testing only - use UI in production)
INSERT INTO kb.settings (key, value, updated_at)
VALUES ('extraction.basePrompt', '"Your custom prompt text"'::jsonb, now())
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

## Troubleshooting

### Changes not taking effect

**Symptom**: Updated prompt in UI but extraction still uses old prompt

**Solutions**:
1. Check extraction logs - verify "Using extraction base prompt from database settings" message
2. Verify database setting was saved: `SELECT * FROM kb.settings WHERE key = 'extraction.basePrompt'`
3. Create a NEW extraction job (existing jobs use the prompt from when they were created)

### Extraction quality decreased

**Symptom**: Entities are missing or confidence scores are low after changing prompt

**Solutions**:
1. Click "Restore default" to revert to the built-in prompt
2. Review your custom prompt - ensure it's not too restrictive
3. Check that you didn't accidentally remove quality criteria
4. Verify the prompt emphasizes completeness and thoroughness

### Database error when saving

**Symptom**: Error message when clicking Save in UI

**Solutions**:
1. Check server logs for detailed error
2. Verify database connection is active
3. Ensure `kb.settings` table exists (should be auto-created during DB init)
4. Check that the prompt text is valid (no special characters that break JSON)

## Related Files

### Backend
- `apps/server/src/common/config/config.service.ts` - Default prompt definition
- `apps/server/src/common/config/config.schema.ts` - Environment variable schema
- `apps/server/src/modules/settings/settings.controller.ts` - Settings API endpoints
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Prompt loading logic

### Frontend
- `apps/admin/src/pages/admin/pages/settings/ai-prompts.tsx` - Settings UI

### Database
- Schema: `kb.settings` table
- Key: `extraction.basePrompt`
- Value type: JSONB (stored as string)

## See Also

- [Template Pack Examples](./TEMPLATE_PACK_EXAMPLES.md) - How to add examples to object schemas
- [Auto Discovery System](./AUTO_DISCOVERY_SYSTEM_SPEC.md) - Template pack configuration
- [Extraction Worker](../apps/server/src/modules/extraction-jobs/README.md) - Worker architecture
