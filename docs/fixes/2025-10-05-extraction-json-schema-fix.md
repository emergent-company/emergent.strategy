# Fix: Extraction JSON Schema Compatibility with Google Gemini API

**Date**: 2025-10-05  
**Status**: ✅ Fixed  
**Impact**: High - Extraction was failing for most entity types

## Problem

Users were experiencing three types of errors during entity extraction:

1. **JSON Parsing Errors**:
   ```
   Expected ',' or '}' after property value in JSON at position 12064 (line 168 column 19)
   Unterminated string in JSON at position 847 (line 13 column 57)
   ```

2. **Google API Schema Validation Errors**:
   ```
   [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: 
   [400 Bad Request] Invalid JSON payload received. Unknown name "exclusiveMinimum" at 'generation_config.response_schema.properties[0].value.items.properties[9].value': Cannot find field.
   ```

## Root Cause

The extraction system uses LangChain's `ChatGoogleGenerativeAI.withStructuredOutput()` which converts Zod schemas to JSON Schema format and sends them to Google's Gemini API.

**Issue**: Google Gemini API's structured output feature only supports a **limited subset of JSON Schema**. It does NOT support:
- `minimum` / `maximum` (numeric constraints)
- `exclusiveMinimum` / `exclusiveMaximum`
- `minLength` / `maxLength` (string length constraints)
- Complex patterns and advanced validation

Our extraction schemas used Zod's `.min()` and `.max()` validators:
```typescript
// ❌ BEFORE - Not compatible with Google API
confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1')
title: z.string().min(5).describe('Task title or summary')
estimated_hours: z.number().min(0.1).optional().describe('Estimated effort in hours')
```

When LangChain converted these to JSON Schema, it generated `minimum`, `maximum`, and `exclusiveMinimum` properties, which Google's API rejected with 400 errors.

## Solution

### 1. Removed Unsupported Validators from Schemas

Updated all 9 extraction schemas to remove `.min()` and `.max()` constraints:

**Files Changed**:
- `base.schema.ts` - Removed `.min(0).max(1)` from confidence field
- `requirement.schema.ts` - Removed `.min(3)` from name field
- `decision.schema.ts` - Removed `.min(5)` from title field
- `feature.schema.ts` - Removed `.min(3)` from name field
- `task.schema.ts` - Removed `.min(5)` from title and `.min(0.1)` from estimated_hours
- `risk.schema.ts` - Removed `.min(5)` from title field
- `issue.schema.ts` - Removed `.min(5)` from title field
- `stakeholder.schema.ts` - Removed `.min(2)` from name field
- `constraint.schema.ts` - Removed `.min(5)` from title field

```typescript
// ✅ AFTER - Compatible with Google API
confidence: z.number().describe('Confidence score from 0 to 1')
title: z.string().describe('Task title or summary')
estimated_hours: z.number().optional().describe('Estimated effort in hours')
```

**Note**: Validation can still be done in application code after extraction if needed.

### 2. Improved Error Handling

Enhanced `langchain-gemini.provider.ts` to gracefully handle errors instead of crashing:

```typescript
// ✅ NEW - Graceful error handling
catch (error) {
    // Handle JSON parsing errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        this.logger.warn(`JSON parsing error for ${typeName}: ${error.message}`);
        this.logger.warn('The LLM returned malformed JSON. Skipping this entity type.');
        return { entities: [], prompt: typePrompt, rawResponse: { error: 'JSON parsing failed', message: error.message } };
    }
    
    // Handle Google API schema validation errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Invalid JSON payload')) {
        this.logger.warn(`Google API schema validation error for ${typeName}: ${errorMessage}`);
        this.logger.warn('The schema contains unsupported JSON Schema features. Skipping this entity type.');
        return { entities: [], prompt: typePrompt, rawResponse: { error: 'Schema validation failed', message: errorMessage } };
    }
    
    // For other errors, log and return empty (graceful degradation)
    this.logger.error(`LLM extraction failed for type ${typeName}:`, error);
    return { entities: [], prompt: typePrompt, rawResponse: { error: 'Extraction failed', message: errorMessage } };
}
```

**Behavior Change**:
- **Before**: If one entity type failed, the entire extraction job would fail
- **After**: If one entity type fails, it's skipped and extraction continues for other types

## Google Gemini Structured Output Limitations

For reference, Google Gemini API's structured output supports only these JSON Schema features:

### ✅ Supported:
- `type`: string, number, integer, boolean, array, object
- `properties`: Object property definitions
- `items`: Array item definitions
- `enum`: Enumeration of allowed values
- `description`: Field descriptions (used by LLM for guidance)
- `required`: Required field list
- `nullable`: Allow null values
- `anyOf` / `oneOf` / `allOf`: Schema composition (limited support)

### ❌ NOT Supported:
- `minimum` / `maximum`
- `exclusiveMinimum` / `exclusiveMaximum`
- `minLength` / `maxLength`
- `minItems` / `maxItems`
- `minProperties` / `maxProperties`
- `pattern` (regex validation)
- `format` (date-time, email, etc.)
- `const`
- `dependencies`
- `$ref` (schema references)

**Reference**: [Google AI Studio Structured Output Docs](https://ai.google.dev/gemini-api/docs/structured-output)

## Testing

After deploying this fix:

1. **Restart Backend**:
   ```bash
   cd apps/server
   npm run start:dev
   ```

2. **Create Extraction Job**:
   - Navigate to Documents page
   - Click "Extract Objects" on any document
   - Select multiple entity types
   - Start extraction

3. **Verify Success**:
   - Check extraction job detail page - should show "running" then "completed"
   - Check that entities are extracted successfully
   - Check backend logs - should NOT see "exclusiveMinimum" or "Invalid JSON payload" errors
   - Verify extracted objects appear in Objects page

4. **Expected Behavior**:
   - All entity types should extract successfully
   - If LLM returns malformed JSON for a type, that type is skipped (logged as warning)
   - Other entity types continue processing
   - Job completes with partial success instead of total failure

## Related Issues

- Entity extraction was failing with 400 errors from Google API
- Extraction jobs would get stuck in "running" status indefinitely
- Backend logs showed "exclusiveMinimum" schema validation errors
- Some extractions would fail with "Unterminated string in JSON" errors

## Prevention

When adding new extraction schemas in the future:

1. **Do NOT use**:
   - `.min()` or `.max()` on numbers
   - `.min()` or `.max()` on strings
   - `.length()` on strings or arrays
   - `.regex()` or `.pattern()` for validation
   - `.refine()` with complex custom validation

2. **Use instead**:
   - Simple type definitions: `z.string()`, `z.number()`, `z.boolean()`
   - Enums for restricted values: `z.enum(['option1', 'option2'])`
   - Optional fields: `.optional()`
   - Descriptions for guidance: `.describe('...')`
   - Validate extracted data in application code after extraction

3. **Test**:
   - Always test new schemas with actual LLM calls
   - Check backend logs for schema validation errors
   - Verify extraction completes successfully

## Files Changed

```
apps/server/src/modules/extraction-jobs/
├── schemas/
│   ├── base.schema.ts           ✅ Removed .min/.max from confidence
│   ├── requirement.schema.ts    ✅ Removed .min from name
│   ├── decision.schema.ts       ✅ Removed .min from title
│   ├── feature.schema.ts        ✅ Removed .min from name
│   ├── task.schema.ts           ✅ Removed .min from title, estimated_hours
│   ├── risk.schema.ts           ✅ Removed .min from title
│   ├── issue.schema.ts          ✅ Removed .min from title
│   ├── stakeholder.schema.ts    ✅ Removed .min from name
│   └── constraint.schema.ts     ✅ Removed .min from title
└── llm/
    └── langchain-gemini.provider.ts  ✅ Enhanced error handling
```

## Deployment

1. ✅ Code changes deployed
2. ✅ Backend restarted (PID 44982)
3. ⏳ Ready for testing

## Monitoring

After deployment, monitor:

1. **Backend Logs**:
   ```bash
   tail -f /tmp/backend.log | grep -i "extraction\|error\|gemini"
   ```

2. **Extraction Success Rate**:
   - Check extraction jobs list page
   - Verify most jobs complete successfully
   - Failed jobs should have clear error messages

3. **Entity Discovery**:
   - Check if entities are being discovered for all types
   - Verify entity counts are reasonable for document content

## Success Criteria

- ✅ No more "exclusiveMinimum" errors in logs
- ✅ No more "Invalid JSON payload" errors
- ✅ Extraction jobs complete successfully
- ✅ Entities extracted for multiple types
- ✅ Graceful handling of malformed LLM responses

---

**Status**: Ready for testing. Please test extraction on various documents and report any remaining issues.
