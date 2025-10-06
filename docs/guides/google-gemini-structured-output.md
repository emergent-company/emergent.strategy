# Google Gemini Structured Output - Schema Compatibility Guide

**Last Updated**: 2025-10-05  
**Applies To**: Extraction system using `ChatGoogleGenerativeAI.withStructuredOutput()`

## Overview

Google Gemini API's structured output feature (used via LangChain) converts Zod schemas to JSON Schema and sends them to the API. However, **Google only supports a limited subset of JSON Schema**. This document outlines what works and what doesn't.

## TL;DR - Quick Rules

✅ **DO**:
- Use simple types: `z.string()`, `z.number()`, `z.boolean()`, `z.array()`, `z.object()`
- Use enums: `z.enum(['option1', 'option2'])`
- Use optional: `.optional()`
- Use descriptions: `.describe('...')` (these guide the LLM)
- Nest objects and arrays freely

❌ **DON'T**:
- Use `.min()` or `.max()` on numbers or strings
- Use `.length()` on strings or arrays
- Use `.regex()` or `.pattern()` for validation
- Use `.refine()` with complex custom validation
- Use `.transform()` (won't be honored by API)

## Supported JSON Schema Features

### ✅ Type Definitions

```typescript
// ✅ GOOD
z.string()           // "type": "string"
z.number()           // "type": "number"
z.boolean()          // "type": "boolean"
z.array(z.string())  // "type": "array", "items": {"type": "string"}
z.object({...})      // "type": "object", "properties": {...}
```

### ✅ Enumerations

```typescript
// ✅ GOOD
z.enum(['todo', 'in-progress', 'done'])
// Becomes: "enum": ["todo", "in-progress", "done"]

// ✅ GOOD - Multiple enums in same schema
status: z.enum(['open', 'closed']),
priority: z.enum(['low', 'high']),
```

### ✅ Optional Fields

```typescript
// ✅ GOOD
description: z.string().optional()
// The field can be omitted from the response

// ✅ GOOD - Optional with default in code
count: z.number().optional().default(0)
// Note: .default() is handled in code, not sent to API
```

### ✅ Nested Objects

```typescript
// ✅ GOOD
z.object({
    user: z.object({
        name: z.string(),
        email: z.string(),
    }),
    metadata: z.object({
        tags: z.array(z.string()),
    }),
})
```

### ✅ Arrays of Objects

```typescript
// ✅ GOOD
z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['A', 'B', 'C']),
}))
```

### ✅ Descriptions (LLM Guidance)

```typescript
// ✅ GOOD - Descriptions are VERY important
z.string().describe('Full name of the person (first and last)')
z.number().describe('Confidence score from 0 to 1')
z.enum(['high', 'medium', 'low']).describe('Priority level for the task')

// These descriptions guide the LLM on what to extract!
```

## Unsupported Features (Will Cause 400 Errors)

### ❌ Numeric Constraints

```typescript
// ❌ BAD - Causes "exclusiveMinimum" error
z.number().min(0)           // "minimum": 0 (not supported)
z.number().max(100)         // "maximum": 100 (not supported)
z.number().positive()       // "exclusiveMinimum": 0 (not supported)
z.number().nonnegative()    // "minimum": 0 (not supported)
z.number().int()            // "type": "integer" (sometimes works, unreliable)

// ✅ INSTEAD - Just use z.number() and validate in code
confidence: z.number().describe('Value between 0 and 1')
// Then validate: if (confidence < 0 || confidence > 1) { ... }
```

### ❌ String Length Constraints

```typescript
// ❌ BAD - Causes "minLength" error
z.string().min(3)           // "minLength": 3 (not supported)
z.string().max(100)         // "maxLength": 100 (not supported)
z.string().length(10)       // exact length (not supported)

// ✅ INSTEAD - Just use z.string() and validate in code
name: z.string().describe('Short identifier (3-20 characters)')
// Then validate: if (name.length < 3 || name.length > 20) { ... }
```

### ❌ String Patterns / Regex

```typescript
// ❌ BAD - Regex not supported
z.string().regex(/^[A-Z]{3}-\d{3}$/)  // "pattern": "^[A-Z]{3}-\\d{3}$" (not supported)
z.string().email()                     // "format": "email" (not supported)
z.string().url()                       // "format": "uri" (not supported)
z.string().uuid()                      // "format": "uuid" (not supported)

// ✅ INSTEAD - Use description to guide LLM, validate in code
code: z.string().describe('Format: XXX-123 (three letters, dash, three digits)')
email: z.string().describe('Valid email address')
// Then validate with regex in code after extraction
```

### ❌ Array Length Constraints

```typescript
// ❌ BAD
z.array(z.string()).min(1)       // "minItems": 1 (not supported)
z.array(z.string()).max(10)      // "maxItems": 10 (not supported)
z.array(z.string()).length(5)    // exact length (not supported)

// ✅ INSTEAD
tags: z.array(z.string()).describe('List of tags (at least 1, max 10)')
// Then validate: if (tags.length < 1 || tags.length > 10) { ... }
```

### ❌ Custom Refinements

```typescript
// ❌ BAD - .refine() not supported
z.string().refine((s) => s.startsWith('PREFIX_'))
z.number().refine((n) => n % 2 === 0)
z.object({
    start: z.date(),
    end: z.date(),
}).refine((data) => data.end > data.start)

// ✅ INSTEAD - Validate in code after extraction
```

### ❌ Transformations

```typescript
// ❌ BAD - .transform() not honored by API
z.string().transform((s) => s.toLowerCase())
z.string().transform((s) => parseInt(s))

// The API will ignore transforms; do them in code instead
```

### ❌ Union Types (Limited Support)

```typescript
// ⚠️ UNRELIABLE - May or may not work
z.union([z.string(), z.number()])
z.discriminatedUnion('type', [
    z.object({ type: z.literal('A'), value: z.string() }),
    z.object({ type: z.literal('B'), value: z.number() }),
])

// ✅ INSTEAD - Use single type or enum where possible
value: z.string().describe('Can be text or numeric (as string)')
// Then parse: const num = parseFloat(value);
```

## Best Practices for Extraction Schemas

### 1. Keep Schemas Simple

```typescript
// ✅ GOOD - Simple, flat structure
export const TaskSchema = z.object({
    title: z.string().describe('Task title'),
    status: z.enum(['todo', 'done']).optional().describe('Current status'),
    priority: z.enum(['low', 'high']).optional().describe('Priority level'),
    confidence: z.number().describe('Extraction confidence 0-1'),
});
```

### 2. Use Descriptions as "Soft Constraints"

```typescript
// ✅ GOOD - Guide the LLM with descriptions
z.string().describe('ISO 8601 date format (e.g., 2025-10-05)')
z.number().describe('Percentage value between 0 and 100')
z.array(z.string()).describe('List of 3-5 relevant tags')

// The LLM will try to follow these guidelines!
```

### 3. Make Fields Optional When Unsure

```typescript
// ✅ GOOD - Don't require fields that might not exist
export const PersonSchema = z.object({
    name: z.string().describe('Full name'),                    // Required
    email: z.string().optional().describe('Email if mentioned'), // Optional
    role: z.string().optional().describe('Job role if mentioned'),
});
```

### 4. Validate After Extraction

```typescript
// In your service/provider code:
async extractEntities(...) {
    const result = await structuredModel.invoke(prompt);
    
    // ✅ NOW validate the extracted data
    const validatedEntities = result.entities.filter(entity => {
        // Check confidence range
        if (entity.confidence < 0 || entity.confidence > 1) {
            this.logger.warn(`Invalid confidence: ${entity.confidence}`);
            return false;
        }
        
        // Check string lengths
        if (entity.title && entity.title.length < 3) {
            this.logger.warn(`Title too short: ${entity.title}`);
            return false;
        }
        
        return true;
    });
    
    return validatedEntities;
}
```

### 5. Use Enums for Controlled Vocabularies

```typescript
// ✅ GOOD - Enum ensures valid values
status: z.enum([
    'draft',
    'in-review',
    'approved',
    'rejected',
]).optional().describe('Document status'),

// ❌ BAD - Freeform string can be anything
status: z.string().optional().describe('Document status'),
```

## Example: Before and After

### ❌ Before (Incompatible)

```typescript
export const TaskSchema = z.object({
    title: z.string().min(5).max(100),
    description: z.string().optional(),
    confidence: z.number().min(0).max(1),
    estimated_hours: z.number().positive().optional(),
    priority: z.enum(['low', 'medium', 'high']),
    tags: z.array(z.string()).min(1).max(5),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
```

**Problems**:
- `.min(5).max(100)` → `minLength`/`maxLength` not supported
- `.min(0).max(1)` → `minimum`/`maximum` not supported
- `.positive()` → `exclusiveMinimum` not supported
- `.min(1).max(5)` → `minItems`/`maxItems` not supported
- `.regex()` → `pattern` not supported

### ✅ After (Compatible)

```typescript
export const TaskSchema = z.object({
    title: z.string().describe('Task title (5-100 characters)'),
    description: z.string().optional().describe('Detailed description'),
    confidence: z.number().describe('Confidence score from 0 to 1'),
    estimated_hours: z.number().optional().describe('Estimated effort in hours (positive number)'),
    priority: z.enum(['low', 'medium', 'high']).describe('Task priority level'),
    tags: z.array(z.string()).optional().describe('List of 1-5 relevant tags'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
});

// Then validate in code:
function validateTask(task: ExtractedTask): boolean {
    if (task.title.length < 5 || task.title.length > 100) return false;
    if (task.confidence < 0 || task.confidence > 1) return false;
    if (task.estimated_hours && task.estimated_hours <= 0) return false;
    if (task.tags && (task.tags.length < 1 || task.tags.length > 5)) return false;
    if (task.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) return false;
    return true;
}
```

## Error Messages to Watch For

If you see these in logs, your schema has incompatible features:

```
❌ "Invalid JSON payload received. Unknown name 'exclusiveMinimum'"
   → Remove .min()/.max() from z.number()

❌ "Invalid JSON payload received. Unknown name 'minimum'"
   → Remove .min()/.max() from z.number()

❌ "Invalid JSON payload received. Unknown name 'minLength'"
   → Remove .min()/.max() from z.string()

❌ "Invalid JSON payload received. Unknown name 'pattern'"
   → Remove .regex() from z.string()

❌ "Invalid JSON payload received. Unknown name 'minItems'"
   → Remove .min()/.max() from z.array()

❌ "Invalid JSON payload received. Unknown name 'format'"
   → Remove .email()/.url()/.uuid() from z.string()
```

## Testing New Schemas

When adding a new extraction schema:

1. **Remove all constraints**:
   ```typescript
   // Start simple
   z.string() instead of z.string().min(3).max(20)
   z.number() instead of z.number().min(0).max(1)
   ```

2. **Test with real LLM**:
   - Create test extraction job
   - Check backend logs for errors
   - Verify entities are extracted

3. **Add validation in code**:
   - After confirming extraction works
   - Add validation logic in provider/service

4. **Iterate**:
   - If you get 400 errors, simplify the schema further
   - Use descriptions to guide the LLM instead of constraints

## References

- [Google AI Studio - Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [JSON Schema Specification](https://json-schema.org/draft/2020-12/json-schema-core.html)
- [LangChain Structured Output](https://js.langchain.com/docs/modules/model_io/output_parsers/structured)
- [Zod Documentation](https://zod.dev/)

## Related Fixes

- [2025-10-05: Extraction JSON Schema Fix](../fixes/2025-10-05-extraction-json-schema-fix.md)

---

**Remember**: When in doubt, keep schemas simple and validate in code! The LLM will do its best to follow your descriptions even without strict schema constraints.
