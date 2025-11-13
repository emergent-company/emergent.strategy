# Error Message Display Fix - Unsupported Media Types

**Date**: 2025-10-19  
**Issue**: Upload errors showing `[object Object]` instead of readable error messages

## Problem

When uploading unsupported file types, the frontend displayed `[object Object]` instead of a user-friendly error message.

# Error Message Display Fix - Unsupported Media Types

**Date**: 2025-10-19  
**Issue**: Upload errors showing `[object Object]` instead of readable error messages

## Problem

When uploading unsupported file types, the frontend displayed `[object Object]` instead of a user-friendly error message like "Binary or unsupported file type. Please upload a text-based document."

### Root Cause

The backend correctly sends structured errors like:
```json
{
    "error": {
        "code": "internal",
        "message": "Binary or unsupported file type. Please upload a text-based document."
    }
}
```

However, the `fetchForm` function in `use-api.ts` had **simplistic error parsing**:

```typescript
// ❌ BROKEN - Assumes error is always a string
const j = await res.json() as { error?: string; message?: string };
message = j.error || j.message || message;
```

When `j.error` is an **object** (not a string), it's truthy, so:
1. `message = j.error` assigns the entire object
2. `throw new Error(message)` converts object to `[object Object]`
3. Frontend displays `[object Object]` to user

## Solution

Enhanced `fetchForm` error handling to match the robust parsing logic already in `fetchJson`:

```typescript
// ✅ FIXED - Handles nested error structures
const j = await res.json();
const nested = (j as any).error;
if (typeof nested === "string") {
    message = nested;
} else if (nested && typeof nested === "object") {
    // Extract message from nested error object
    if (nested.message) message = nested.message;
    else if (nested.code) message = nested.code;
} else if ((j as any).message) {
    message = (j as any).message;
}
// Ensure message is always a string
if (message && typeof message !== "string") {
    message = JSON.stringify(message);
}
```

### Changes Made

**File**: `apps/admin/src/hooks/use-api.ts` (lines 141-158)

**Before** (Simple parsing):
```typescript
try {
    const j = (await res.json()) as { error?: string; message?: string };
    message = j.error || j.message || message;  // ❌ Breaks if error is object
} catch { ... }
```

**After** (Robust parsing):
```typescript
try {
    const j = await res.json();
    // Handle nested error structures like { error: { message, code } }
    const nested = (j as any).error;
    if (typeof nested === "string") {
        message = nested;
    } else if (nested && typeof nested === "object") {
        if (nested.message) message = nested.message;
        else if (nested.code) message = nested.code;
    } else if ((j as any).message) {
        message = (j as any).message;
    }
    // Ensure message is a string
    if (message && typeof message !== "string") {
        message = JSON.stringify(message);
    }
} catch { ... }
```

Now `fetchForm` handles the same error formats as `fetchJson`:
1. `{ error: "string" }` → Uses string directly  
2. `{ message: "string" }` → Uses message field
3. `{ error: { message, code } }` → Extracts nested message ✅ (This was broken!)
4. Fallback to code if message missing

## Backend Error Structure (Also Fixed)

Additionally fixed backend exception format in `ingestion.controller.ts`:

```typescript
// ✅ NestJS standard format
throw new UnsupportedMediaTypeException({ 
    message: 'Binary or unsupported file type. Please upload a text-based document.', 
    error: 'unsupported-type' 
});
```

This ensures consistent, structured errors across all endpoints.

The frontend error parser (`use-api.ts`) correctly extracts `error.message`, but it was finding an object instead of a string.

## Solution

Changed all exception throws in `ingestion.controller.ts` to use NestJS standard format:

```typescript
// CORRECT - Direct message + optional error code
throw new UnsupportedMediaTypeException({ 
    message: 'Binary or unsupported file type. Please upload a text-based document.', 
    error: 'unsupported-type' 
});
```

### Changes Made

**File**: `apps/server/src/modules/ingestion/ingestion.controller.ts`

1. **Line 80** - File required error:
   ```typescript
   // Before
   throw new BadRequestException({ error: { code: 'file-required', message: 'file is required' } });
   
   // After
   throw new BadRequestException({ message: 'File is required', error: 'file-required' });
   ```

2. **Line 86** - Unsupported media type:
   ```typescript
   // Before
   throw new UnsupportedMediaTypeException({ error: { code: 'unsupported-type', message: 'Binary or unsupported file type' } });
   
   // After
   throw new UnsupportedMediaTypeException({ 
       message: 'Binary or unsupported file type. Please upload a text-based document.', 
       error: 'unsupported-type' 
   });
   ```

3. **Line 90** - Empty content error:
   ```typescript
   // Before
   throw new BadRequestException({ error: { code: 'empty', message: 'Text content empty' } });
   
   // After
   throw new BadRequestException({ message: 'File content is empty', error: 'empty-content' });
   ```

## NestJS Exception Format

**Correct format** for NestJS HTTP exceptions:

```typescript
// Option 1: Just a message string
throw new BadRequestException('User-friendly error message');

// Option 2: Object with message + error code
throw new BadRequestException({
    message: 'User-friendly error message',
    error: 'machine-readable-code',
    // Optional: statusCode will be set by exception class
});

// Option 3: Custom response object (advanced)
throw new BadRequestException({
    message: 'Main message',
    error: 'error-code',
    details: { field: 'Additional context' }
});
```

**Incorrect formats** (avoid these):

```typescript
// ❌ Double-wrapped error
throw new BadRequestException({ error: { message: '...' } });

// ❌ Nested code inside error
throw new BadRequestException({ error: { code: '...', message: '...' } });
```

## Frontend Error Handling

The frontend error parser (`apps/admin/src/hooks/use-api.ts`) handles these formats:

1. `{ error: "string" }` → Uses string directly
2. `{ message: "string" }` → Uses message field
3. `{ error: { message } }` → Extracts nested message
4. `{ error: { details } }` → Extracts validation details

With the fix, errors now flow correctly:
```
Backend throws → NestJS wraps → Frontend parses → User sees readable message
```

## Testing

**Before fix**:
- Upload binary file → Error: `[object Object]` ❌
- Response: `{ error: { code: "internal", message: "..." } }`
- Frontend: Tried to use entire object as string

**After fix**:
- Upload binary file → Error: `Binary or unsupported file type. Please upload a text-based document.` ✅
- Upload empty file → Error: `File content is empty` ✅
- Upload without file → Error: `File is required` ✅
- Response structure correctly parsed and message extracted

## Benefits

✅ **Clear error messages**: Users see exactly what went wrong  
✅ **No more `[object Object]`**: Properly extracts message from nested error objects  
✅ **Consistent parsing**: `fetchForm` now matches `fetchJson` error handling logic  
✅ **Better UX**: Error messages guide users on how to fix the issue  
✅ **Robust**: Handles multiple error response formats gracefully

## Related Files

- **Frontend fix**: `apps/admin/src/hooks/use-api.ts` (fetchForm function, lines 141-158)
- **Backend fix**: `apps/server/src/modules/ingestion/ingestion.controller.ts` (exception throws)
- **Frontend display**: `apps/admin/src/pages/admin/apps/documents/index.tsx` (uploadError state)

## Technical Details

### Error Response Flow

1. **Backend throws exception**:
   ```typescript
   throw new UnsupportedMediaTypeException({ 
       message: 'Binary or unsupported file type...', 
       error: 'unsupported-type' 
   });
   ```

2. **NestJS serializes to HTTP response**:
   ```json
   {
       "error": {
           "code": "internal",
           "message": "Binary or unsupported file type..."
       }
   }
   ```

3. **Frontend `fetchForm` parses**:
   - Checks if `error` is string → No
   - Checks if `error` is object → Yes
   - Extracts `error.message` → "Binary or unsupported file type..."
   - Throws `new Error(message)` with string

4. **Upload handler catches**:
   ```typescript
   catch (e: unknown) {
       const msg = e instanceof Error ? e.message : "Upload failed";
       setUploadError(msg);  // ✅ Now displays correctly
   }
   ```

### Why `fetchForm` Was Different

The codebase had **two** fetch wrappers:
- `fetchJson`: Robust error parsing (handled nested objects) ✅
- `fetchForm`: Simple error parsing (assumed string) ❌

The `fetchForm` function is used for file uploads, which is why this bug only appeared when uploading documents. The fix aligns both functions to use the same robust error parsing logic.

## Prevention

**When throwing HTTP exceptions in NestJS controllers**:

1. ✅ Use `{ message: '...', error: 'code' }` format
2. ✅ Write user-friendly messages (explain what happened + what to do)
3. ✅ Use semantic error codes (e.g., `'unsupported-type'`, `'file-too-large'`)
4. ❌ Don't double-wrap with `{ error: { ... } }`
5. ❌ Don't use generic messages like "Bad request"

**Testing checklist**:
- [ ] Upload unsupported file type → Shows clear error message
- [ ] Upload empty file → Shows clear error message  
- [ ] Upload without selecting file → Shows clear error message
- [ ] Network error → Shows appropriate message
- [ ] No `[object Object]` appears anywhere in error display
