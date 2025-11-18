# Skipped E2E Tests - Complete List

**Total:** 54 skipped tests  
**Date:** November 18, 2024  
**Archived:** 2 tests (moved to `archive/` directory)

## Summary by Category

- **Chat Tests:** 5 tests (2 files)
- **Console Error Tests:** 19 tests (1 file)
- **Debug/Template Tests:** 2 tests (2 files) - **ARCHIVED**
- **Extraction Tests:** 4 tests (2 files)
- **Integration Tests:** 7 tests (1 file)
- **Notification Tests:** 7 tests (1 file)
- **Onboarding Tests:** 1 test (1 file)
- **Organization Tests:** 1 test (1 file)
- **Performance Tests:** 4 tests (1 file)
- **Setup Guard Tests:** 2 tests (1 file)
- **Monitoring Tests:** 1 test (1 file)

---

## Detailed List

### 1. authenticated.example.spec.ts (1 test)

```
❌ Documents Page (authenticated) › loads without redirect and exposes nav + token
```

**Reason:** Test fails - /admin redirects to error page  
**Can enable:** No - needs investigation

---

### 2. chat.lifecycle.spec.ts (2 tests)

```
❌ Chat - lifecycle › auto-send via ?q query hydrates first user + assistant tokens
❌ Chat - lifecycle › manual send from empty state then rename + delete conversation
```

**Reason:** Chat functionality needs refactor  
**Can enable:** No - backend issues

---

### 3. chat.new-conversation.spec.ts (3 tests)

```
❌ Chat - new conversation flow › navigates to /admin/apps/chat/c/new without 404
❌ Chat - new conversation flow › sends first message via CTA composer + SSE stream
❌ Chat - new conversation flow › chat lifecycle (auto-send + delete) – covered in chat.lifecycle.spec.ts
```

**Reason:** API 401 errors in access-tree context  
**Can enable:** No - backend auth issues

---

### 4. console-errors.all-pages.spec.ts (19 tests)

```
⚠️ Console Errors - All Pages (Real API) › / - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /landing - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /auth/login - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /auth/callback - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /auth/register - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /auth/forgot-password - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /auth/reset-password - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/apps/documents - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/apps/chunks - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/apps/chat - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/apps/chat/c/new - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/objects - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/extraction-jobs - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/integrations - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/inbox - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/profile - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/settings/ai/prompts - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/settings/project/templates - should load without console errors
⚠️ Console Errors - All Pages (Real API) › /admin/settings/project/auto-extraction - should load without console errors
⚠️ Console Errors - All Pages (Real API) › Summary - All pages tested
```

**Reason:** Backend endpoints not ready (notifications, extraction)  
**Can enable:** Partially - will have expected failures on some pages

---

### 5. archive/debug-direct-admin.spec.ts (1 test) - ARCHIVED

```
🔧 Debug: Direct Admin Navigation › navigate directly to admin/apps/documents
```

**Reason:** Debug test, not for CI  
**Status:** Moved to `archive/` directory  
**Can enable:** No - debug only

---

### 6. extraction-jobs.monitoring.spec.ts (1 test)

```
❌ Extraction Jobs - Monitoring Endpoint › should authenticate via OIDC, load page correctly, and not return 500 errors
```

**Reason:** Manual OIDC flow, unreliable in CI  
**Can enable:** No - should be rewritten to use storage state

---

### 7. extraction.manual-flow.spec.ts (3 tests)

```
❌ Manual Extraction Flow - Complete E2E › completes full manual extraction journey
❌ Manual Extraction Flow - Complete E2E › modal can be cancelled without creating job
❌ Manual Extraction Flow - Complete E2E › displays validation message for no entity types selected
```

**Reason:** Requires extraction job mocking  
**Can enable:** No - needs mocks

---

### 8. integrations.clickup.spec.ts (7 tests)

```
❌ ClickUp Integration - Gallery › displays ClickUp integration card in gallery
❌ ClickUp Integration - Configuration › opens configuration modal and saves settings
❌ ClickUp Integration - Sync Modal › opens sync modal and loads workspace structure
❌ ClickUp Integration - Sync Modal › selects lists and proceeds through wizard
❌ ClickUp Integration - Sync Modal › validates list selection requirement
❌ ClickUp Integration - Sync Modal › uses Select All and Deselect All buttons
❌ ClickUp Integration - Error Handling › displays error when structure fails to load
```

**Reason:** Requires ClickUp API mocking  
**Can enable:** No - needs mocks

---

### 9. notifications-auto-extraction.spec.ts (7 tests)

```
❌ Auto-Extraction and Notifications Flow › navigates to project auto-extraction settings page
❌ Auto-Extraction and Notifications Flow › enables auto-extraction and configures settings
❌ Auto-Extraction and Notifications Flow › notification bell shows unread count badge
❌ Auto-Extraction and Notifications Flow › notification bell dropdown shows notifications list
❌ Auto-Extraction and Notifications Flow › dismissing a notification removes it from list
❌ Auto-Extraction and Notifications Flow › clicking notification action button navigates correctly
❌ Auto-Extraction and Notifications Flow › save button is disabled when no changes made
```

**Reason:** Requires extraction workflow and notification mocking  
**Can enable:** No - needs mocks

---

### 10. onboarding.first-login.spec.ts (1 test)

```
❌ Onboarding - first login organization & project creation › creates org then project and reveals app shell badges
```

**Reason:** Requires complex org/project creation mocking  
**Can enable:** No - needs mocks

---

### 11. org.switch.spec.ts (1 test)

```
❌ Organizations - switching active org › switches active org updates checkmark + toast
```

**Reason:** Requires multiple orgs in database  
**Can enable:** No - needs mocks

---

### 12. perf.spec.ts (4 tests)

```
⚠️ Performance smoke (timings only) › measure /
⚠️ Performance smoke (timings only) › measure /landing
⚠️ Performance smoke (timings only) › measure /auth/login
⚠️ Performance smoke (timings only) › measure /admin/apps/documents
```

**Reason:** Performance tests timing out (>10s)  
**Can enable:** Yes but will fail - performance issues need fixing

---

### 13. setup-guard.spec.ts (2 tests)

```
❌ SetupGuard - behavior verification › allows access when user has org and project
❌ SetupGuard - behavior verification › redirects to setup when user has no org/project
```

**Reason:** Uses cleanUser fixture with OIDC flow, unreliable in CI  
**Can enable:** No - complex fixture dependencies

---

### 14. archive/template.new-view.spec.ts (1 test) - ARCHIVED

```
🔧 New view route visit (template - skipped) › renders without console/page errors
```

**Reason:** Template file for creating new tests  
**Status:** Moved to `archive/` directory  
**Can enable:** No - template only

---

## Legend

- ❌ **Cannot enable** - Requires mocks or backend features not implemented
- ⚠️ **Could enable** - Works without mocks but will have expected failures
- 🔧 **Debug/Template** - Not meant for regular test runs

## Recommendations

### Keep Skipped (45 tests)

Tests requiring mocks or backend features that don't exist yet.

### Consider Enabling (9 tests)

- **console-errors.all-pages.spec.ts** (19 tests) - Could enable to catch errors on working pages
  - Will have expected failures on pages with unimplemented backends
  - Useful for regression detection

### Fix & Enable (4 tests)

- **perf.spec.ts** (4 tests) - No mocks, just slow
  - Need to investigate why pages take >10s to load
  - Once performance improved, can be enabled

### Archived (2 tests) ✅

- **archive/debug-direct-admin.spec.ts** - Debug test (moved to archive/)
- **archive/template.new-view.spec.ts** - Template file (moved to archive/)

## Summary

Out of 54 skipped tests:

- **45 tests** require mocks or unimplemented features (keep skipped)
- **4 tests** are slow but could work (fix performance first)
- **4 tests** have backend issues (fix API errors first)
- **1 test** uses complex fixture (needs refactor)
- **2 tests** are debug/template (delete or archive)
