# Fix: Chat Citations Persistence Test (Deterministic Token Mode Bug)

**Date**: 2024-11-19  
**Status**: ✅ Fixed  
**Severity**: Medium  
**Type**: Test Infrastructure Bug

## Summary

Fixed the `chat.citations-persistence.e2e.spec.ts` test failure by correcting token concatenation behavior in deterministic test mode to match production tokenization.

## Problem

### Test Failure
The test was consistently failing with:
```
AssertionError: expected false to be true
  expect(assistantMsg.content.startsWith('token-0 token-1')).toBe(true);
```

### Debug Output
```
[TEST DEBUG] Assistant message content: "token-0token-1token-2token-3token-4"
[TEST DEBUG] Content length: 35
[TEST DEBUG] First 50 chars: token-0token-1token-2token-3token-4
```

The assistant message content had **no spaces** between tokens, but the test expected spaces.

## Root Cause

**Token Concatenation Mismatch** between test mode and production mode:

### Production Mode (`chat-generation.service.ts:390-411`)
- Tokenizes by splitting on word boundaries **with whitespace preserved as separate tokens**
- Example: `["Hello", " ", "World"]`
- Joins tokens **without separator**: `tokens.join('')`
- Result: `"Hello World"` (spaces included in tokens)

### Deterministic Test Mode (Before Fix)
```typescript
const synthetic: string[] = [
  'token-0',
  'token-1',
  'token-2',
  'token-3',
  'token-4',
];
synthetic.forEach((t) => onToken(t));
return synthetic.join(' ');  // ← Returns with spaces
```

### Controller Persistence (`chat.controller.ts:815`)
```typescript
const content = tokens.join('');  // ← Joins without separator
```

**The Bug**: In deterministic mode, tokens were emitted as `["token-0", "token-1", ...]` (no spaces), then joined without separator → `"token-0token-1..."`. But the generating function returned `synthetic.join(' ')` with spaces, creating inconsistency.

## Solution

Fixed deterministic mode to **match production behavior** by including spaces as separate tokens:

### File: `apps/server/src/modules/chat/chat-generation.service.ts`

**Before:**
```typescript
if (process.env.CHAT_TEST_DETERMINISTIC === '1') {
  const synthetic: string[] = [
    'token-0',
    'token-1',
    'token-2',
    'token-3',
    'token-4',
  ];
  synthetic.forEach((t) => onToken(t));
  return synthetic.join(' ');
}
```

**After:**
```typescript
// Match production tokenization behavior: include spaces as separate tokens
if (process.env.CHAT_TEST_DETERMINISTIC === '1') {
  const tokens: string[] = [];
  for (let i = 0; i < 5; i++) {
    tokens.push(`token-${i}`);
    if (i < 4) tokens.push(' '); // Space between tokens (not after last one)
  }
  tokens.forEach((t) => onToken(t));
  return tokens.join(''); // Join without separator (spaces already included)
}
```

### File: `apps/server/src/modules/chat/chat.controller.ts`

Added debug logging to help diagnose persistence issues:

**Before:**
```typescript
} catch (e) {
  // Swallow persistence errors to avoid breaking the stream
}
```

**After:**
```typescript
} catch (e) {
  // Log persistence errors in debug mode but don't break the stream
  if (process.env.E2E_DEBUG_CHAT === '1') {
    this.logger.error(
      `[stream] Failed to persist assistant message for conversation ${id}: ${(e as Error).message}`,
      (e as Error).stack
    );
  }
}
```

## Test Results

### Before Fix
```
✗ tests/e2e/chat.citations-persistence.e2e.spec.ts (1 test) - FAILED
```

### After Fix
```
✓ tests/e2e/chat.citations-persistence.e2e.spec.ts (1 test) 1638ms - PASSED
```

### Full Suite Impact
- **Before**: 3 test files failing (chat.citations-persistence + 2 OpenAPI docs tests)
- **After**: 2 test files failing (only OpenAPI docs tests remain)
- **Improvement**: Fixed 1/3 failing E2E tests (**33% reduction** in failures)

## Verification

The fix was verified by:
1. Running the test individually - **PASSED**
2. Running the full E2E suite - **PASSED** (chat citations test)
3. Debug output shows correct token format:
   ```
   [stream] model full content preview: token-0 token-1 token-2 token-3 token-4
   ```

## Key Insights

1. **Test Parity**: Deterministic test mode must match production behavior exactly, including whitespace handling
2. **Token Semantics**: In this system, "tokens" include whitespace characters to preserve formatting
3. **Error Handling**: Silent error swallowing can hide bugs - added debug logging to improve visibility
4. **The test was NOT intermittent** - it was consistently failing due to this bug, but may have appeared intermittent in suite runs due to test execution order or timing

## Related Files

- `apps/server/src/modules/chat/chat-generation.service.ts:352-363`
- `apps/server/src/modules/chat/chat.controller.ts:810-820`
- `apps/server/tests/e2e/chat.citations-persistence.e2e.spec.ts`

## Follow-up

None required. The fix is complete and verified.
