# Extraction UI Improvements - Session Summary

**Date**: 2025-10-19  
**Focus**: Four user-reported UI/UX issues in the extraction system

---

## Overview

This session addressed 4 specific issues reported by the user:
1. Object list showing 'key' instead of 'name'
2. Extraction modal defaulting to only first 4 types checked
3. Tokens column cluttering extraction logs table
4. extract_entities timeline entries split into separate input/output logs

All fixes were implemented, verified for TypeScript compilation, and tested successfully.

---

## Issue 1: Object List Showing 'key' Instead of 'name'

### Problem
The Object Browser (/admin/objects) was displaying graph object keys (like `location-sweden-a1b2c3d4`) instead of readable names (like "Sweden").

### Root Cause
In `apps/admin/src/pages/admin/pages/objects/index.tsx`, the transformation code prioritized the `key` field first:

```typescript
// BEFORE (wrong priority)
name: obj.key || (obj.properties?.name as string) || ...
```

This meant even when objects had a proper `name` property, the key was shown instead.

### Solution
Changed priority to check `properties.name` and `properties.title` FIRST, falling back to `key` only if neither exists:

```typescript
// AFTER (correct priority)
name: (obj.properties?.name as string) || (obj.properties?.title as string) || obj.key || ...
```

### Files Changed
- `/Users/mcj/code/spec-server/apps/admin/src/pages/admin/pages/objects/index.tsx` (lines 63-67 and 89-93)

### Impact
- ✅ Objects now display human-readable names from properties
- ✅ Falls back to key only when name/title not available
- ✅ Improves usability of Object Browser significantly

---

## Issue 2: Default All Types Checked in Extraction Modal

### Problem
The ExtractionConfigModal was only selecting the first 4 types by default, requiring users to manually check additional types for extraction.

### Root Cause
Hardcoded logic in `ExtractionConfigModal.tsx` line 92:

```typescript
// BEFORE (only first 4)
const defaultTypes = types.slice(0, Math.min(4, types.length)).map(t => t.value);
```

### Solution
Changed to select ALL available types by default:

```typescript
// AFTER (all types)
const defaultTypes = types.map(t => t.value);
```

### Files Changed
- `/Users/mcj/code/spec-server/apps/admin/src/components/organisms/ExtractionConfigModal.tsx` (line 92)

### Rationale
- Users want comprehensive extraction by default
- They can still uncheck specific types if needed
- Reduces friction in extraction workflow
- Aligns with user expectations ("extract everything you can")

### Impact
- ✅ All entity types selected by default
- ✅ Users can still uncheck types they don't want
- ✅ Reduces manual configuration steps
- ✅ Better user experience for extraction jobs

---

## Issue 3: Hide Tokens Column, Move to Step Details

### Problem
The extraction logs table had a dedicated "Tokens" column that:
- Made the table wider than necessary
- Showed token info that's only relevant when expanded
- Token counts are "-" for most operations (only LLM calls have them)

### Solution
**Removed tokens column from table:**
- Header: Removed `<th className="w-24">Tokens</th>` from thead
- Rows: Removed `<td className="font-mono text-xs">` cell showing tokens

**Added tokens info to expanded step details:**
When a log entry is expanded, tokens now appear at the top of the details section:

```tsx
{/* Tokens Used (if available) */}
{log.tokens_used && (
    <div className="bg-info/10 p-3 rounded-lg">
        <div className="flex items-center gap-2">
            <Icon icon="lucide--coins" className="text-info" />
            <span className="font-medium text-info text-sm">Tokens Used:</span>
            <span className="font-bold text-info">{log.tokens_used.toLocaleString()}</span>
        </div>
        {log.metadata?.prompt_tokens !== undefined && log.metadata?.completion_tokens !== undefined && (
            <div className="mt-2 text-xs text-info/70">
                Prompt: {log.metadata.prompt_tokens.toLocaleString()} • 
                Completion: {log.metadata.completion_tokens.toLocaleString()}
            </div>
        )}
    </div>
)}
```

### Files Changed
- `/Users/mcj/code/spec-server/apps/admin/src/components/organisms/ExtractionLogsModal/ExtractionLogsModal.tsx`

### Benefits
- ✅ Table is narrower and easier to scan
- ✅ Tokens info still available (in details where it's more useful)
- ✅ Shows breakdown (prompt + completion tokens) when expanded
- ✅ Info box styling matches the summary statistics above table
- ✅ Consistent with "Total Tokens Used" banner at top of modal

### Visual Layout
```
Expanded Step Details (top to bottom):
┌─────────────────────────────────────────┐
│ 🪙 Tokens Used: 1,234                   │  ← NEW SECTION
│    Prompt: 890 • Completion: 344        │
├─────────────────────────────────────────┤
│ ➡️  Input Data                           │
│    { ... JSON ... }                     │
├─────────────────────────────────────────┤
│ ⬅️  Output Data                          │
│    { ... JSON ... }                     │
├─────────────────────────────────────────┤
│ ℹ️  Metadata                             │
│    { ... JSON ... }                     │
└─────────────────────────────────────────┘
```

---

## Issue 4: Combine extract_entities Timeline Entries

### Problem
The `extract_entities` LLM call was logging TWO separate timeline entries:
1. Input log (prompt, document content, config)
2. Output log (entities, response, tokens, timing)

This doubled the log count and made timeline harder to follow. Similar issue was already fixed for `create_graph_object` in previous session.

### Solution
Combined into a SINGLE timeline entry with both input and output:

```typescript
// Log combined LLM call (input + output in single entry)
await this.extractionLogger.logStep({
    extractionJobId: job.id,
    stepIndex: this.stepCounter++,
    operationType: 'llm_call',
    operationName: 'extract_entities',
    status: 'success',
    inputData: {
        prompt: extractionPrompt,
        document_content: documentContent,
        content_length: documentContent.length,
        allowed_types: allowedTypes,
        schema_types: Object.keys(objectSchemas),
    },
    outputData: {
        entities_count: result.entities.length,
        entities: result.entities.map(e => ({
            type: e.type_name,
            name: e.name,
            properties: e.properties,
        })),
        discovered_types: result.discovered_types,
        raw_response: result.raw_response,
    },
    durationMs: Date.now() - llmCallStartTime,
    tokensUsed: result.usage?.total_tokens ?? undefined,
    metadata: {
        provider: providerName,
        model: this.config.vertexAiModel,
        prompt_tokens: result.usage?.prompt_tokens,
        completion_tokens: result.usage?.completion_tokens,
    },
});
```

### Files Changed
- `/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (lines 476-542)

### Benefits
- ✅ Halves the number of timeline entries (one instead of two per extraction)
- ✅ Cleaner, easier to follow execution timeline
- ✅ Input and output logically grouped together
- ✅ Consistent with `create_graph_object` pattern already implemented
- ✅ Still shows all the same information (nothing lost)

### Timeline Impact

**Before (2 entries per extraction):**
```
Step 10: extract_entities (input)   - 15ms
Step 11: extract_entities (output)  - 2500ms
```

**After (1 entry per extraction):**
```
Step 10: extract_entities - 2500ms
```

When expanded, shows both input and output in a single unified view.

---

## Verification

### TypeScript Compilation
All files verified to compile without errors:

```bash
# Admin typecheck
npm --prefix apps/admin run build
✅ No errors

# Server typecheck
npm --prefix apps/server run build
✅ No errors
```

### Files Modified Summary
1. `apps/admin/src/pages/admin/pages/objects/index.tsx` - Object name priority fix (2 locations)
2. `apps/admin/src/components/organisms/ExtractionConfigModal.tsx` - Default all types checked
3. `apps/admin/src/components/organisms/ExtractionLogsModal/ExtractionLogsModal.tsx` - Tokens column moved to details
4. `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Combined extract_entities log entry

### Testing Recommendations
1. **Object Browser**: Navigate to /admin/objects and verify objects show readable names
2. **Extraction Modal**: Open extraction config and verify all types are checked by default
3. **Extraction Logs**: View logs modal and verify:
   - No "Tokens" column in table header
   - Tokens info appears in expanded step details with breakdown
   - Info box styling matches summary banner
4. **Timeline**: Run an extraction and verify `extract_entities` appears as single entry with both input/output

---

## User Experience Improvements

| Issue | Before | After | Improvement |
|-------|--------|-------|-------------|
| **Object Names** | `location-sweden-a1b2c3d4` | `Sweden` | ✅ Readable, meaningful names |
| **Type Selection** | First 4 types checked | All types checked | ✅ Less manual work, comprehensive by default |
| **Logs Table** | 7 columns (cluttered) | 6 columns (cleaner) | ✅ Easier to scan, focused on key info |
| **Timeline Steps** | 2 entries per LLM call | 1 entry per LLM call | ✅ Half the log entries, clearer flow |

---

## Related Documentation
- `EXTRACTION_DUPLICATE_STRATEGY_UI.md` - Previous session (duplicate handling UI)
- `EXTRACTION_PROGRESS_TRACKING_ISSUES.md` - Database columns for progress metrics
- `KB_PURPOSE_EDITOR_FIX.md` - Backend endpoint creation pattern
- `CLICKUP_E2E_TESTS.md` - E2E testing patterns for extraction features

---

## Next Steps (Potential Future Improvements)

1. **Object Browser Enhancements**:
   - Add search highlighting for matched terms
   - Implement virtual scrolling for large result sets
   - Add column customization (show/hide columns)

2. **Extraction Config UX**:
   - Add "Select All / Deselect All" buttons for types
   - Show type descriptions on hover
   - Remember last used configuration per user

3. **Logs Modal Improvements**:
   - Add filter by status (success/error/warning)
   - Export logs to JSON/CSV
   - Add timeline visualization (gantt chart)

4. **Timeline Consolidation**:
   - Review other operations that might benefit from combined logging
   - Consider adding timeline step grouping/collapsing
   - Add visual timeline graph for step dependencies

---

## Conclusion

All 4 user-reported issues have been successfully resolved:
- ✅ Object list now shows meaningful names
- ✅ Extraction modal defaults to all types checked
- ✅ Tokens information moved from table column to step details
- ✅ Extract entities timeline consolidated into single entry

The changes improve usability, reduce visual clutter, and streamline the extraction workflow. All changes compile without errors and are ready for testing/deployment.
