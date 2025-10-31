# E2E Page Test IDs - Implementation Status

This document tracks the implementation of `data-testid` attributes on all pages tested in the E2E suite.

## Overview

**Goal**: Add unique `data-testid` to each page's root container so E2E tests can verify the correct page loaded before checking for errors.

**Pattern**: `data-testid="page-{descriptive-name}"`

**Status**: ✅ **COMPLETE** - All 17 pages have test IDs

## Pages

### Landing (2/2) ✅
- [x] `/` → `page-landing` - apps/admin/src/pages/landing/index.tsx
- [x] `/landing` → `page-landing` - apps/admin/src/pages/landing/index.tsx (same component)

### Auth (5/5) ✅
- [x] `/auth/login` → `page-auth-login` - apps/admin/src/pages/auth/login/index.tsx
- [x] `/auth/callback` → `page-auth-callback` - apps/admin/src/pages/auth/callback.tsx
- [x] `/auth/register` → `page-auth-register` - apps/admin/src/pages/auth/register/index.tsx
- [x] `/auth/forgot-password` → `page-auth-forgot-password` - apps/admin/src/pages/auth/forgot-password/index.tsx
- [x] `/auth/reset-password` → `page-auth-reset-password` - apps/admin/src/pages/auth/reset-password/index.tsx

### Apps (4/4) ✅
- [x] `/admin/apps/documents` → `page-documents` - apps/admin/src/pages/admin/apps/documents/index.tsx
- [x] `/admin/apps/chunks` → `page-chunks` - apps/admin/src/pages/admin/apps/chunks/index.tsx
- [x] `/admin/apps/chat` → `page-chat-home` - apps/admin/src/pages/admin/chat/home/index.tsx
- [x] `/admin/apps/chat/c/new` → `page-chat-conversation` - apps/admin/src/pages/admin/chat/conversation/index.tsx

### Pages (5/5) ✅
- [x] `/admin/objects` → `page-objects` - apps/admin/src/pages/admin/pages/objects/index.tsx
- [x] `/admin/extraction-jobs` → `page-extraction-jobs` - apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx
- [x] `/admin/integrations` → `page-integrations` - apps/admin/src/pages/admin/pages/integrations/index.tsx
- [x] `/admin/inbox` → `page-inbox` - apps/admin/src/pages/admin/inbox/index.tsx
- [x] `/admin/profile` → `page-profile` - apps/admin/src/pages/admin/profile/index.tsx

### Settings (3/3) ✅
- [x] `/admin/settings/ai/prompts` → `page-settings-ai-prompts` - apps/admin/src/pages/admin/pages/settings/ai-prompts.tsx
- [x] `/admin/settings/project/templates` → `page-settings-project-templates` - apps/admin/src/pages/admin/pages/settings/project/templates.tsx
- [x] `/admin/settings/project/auto-extraction` → `page-settings-auto-extraction` - apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx

## Test File Updates

- ✅ Updated test structure in `apps/admin/e2e/specs/console-errors.all-pages.spec.ts`
- ✅ Tests now wait for specific `data-testid` before checking for errors
- ✅ Tests will fail if wrong page loads (e.g., login redirect)

## Next Steps

1. ✅ All test IDs added
2. ⏭️ **Next**: Restart backend server cleanly  
3. ⏭️ **Next**: Run E2E tests to verify both notification fixes and page identity verification
4. ⏭️ **Next**: Confirm all tests pass

## Implementation Details

**Test Verification Pattern**:
```typescript
await test.step('Wait for correct page to load', async () => {
    const testId = route.testId;
    await page.waitForSelector(`[data-testid="${testId}"]`, { 
        state: 'visible', 
        timeout: 15_000 
    });
});
```

**Component Pattern**:
```tsx
export default function MyPage() {
    return (
        <div data-testid="page-my-page" className="...">
            {/* page content */}
        </div>
    );
}
```
