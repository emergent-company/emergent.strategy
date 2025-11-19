# Template Pack Installation Fix - Test Guide

## Issue Fixed

Previously, the template pack installation endpoint required an `x-org-id` header even though the organization ID could be derived from the project ID. This caused "Organization context required" errors when trying to install packs with only the `x-project-id` header.

## Solution

Updated the following controller methods to automatically derive the organization ID from the project when the `x-org-id` header is missing:

- `assignTemplatePack()` - Install/assign a template pack to a project
- `updateTemplatePackAssignment()` - Update pack assignment settings
- `uninstallTemplatePack()` - Remove a pack from a project

The service method `getOrganizationIdFromProject()` was made public to support this functionality.

## Files Modified

1. `apps/server/src/modules/template-packs/template-pack.service.ts`
   - Made `getOrganizationIdFromProject()` method public
2. `apps/server/src/modules/template-packs/template-pack.controller.ts`
   - Updated `assignTemplatePack()` to auto-derive org ID
   - Updated `updateTemplatePackAssignment()` to auto-derive org ID
   - Updated `uninstallTemplatePack()` to auto-derive org ID

## Testing the Fix

### Prerequisites

1. Ensure the demo pack is seeded:

   ```bash
   npm run seed:meeting-pack
   ```

2. Ensure server is running:
   ```bash
   nx run workspace-cli:workspace:start
   ```

### Get a Test Token

1. Open browser with debugging:

   ```bash
   npm run chrome:debug
   ```

2. Navigate to http://localhost:5176

3. Login with test credentials:

   - Email: `test@example.com`
   - Password: `TestPassword123!`

4. Open browser DevTools console (F12)

5. Get your auth token:

   ```javascript
   localStorage.getItem('auth_token');
   ```

6. Copy the token (it will be a long JWT string)

### Run the Test

```bash
TOKEN="your-token-here" node test-template-pack-install.mjs
```

### Expected Output

```
🧪 Testing Template Pack Installation
   Fix verification: Organization ID should be auto-derived from project

✅ Using provided access token

1️⃣  Getting user projects...
✅ Found project: My Project (project-id-here)

2️⃣  Checking if demo pack exists...
✅ Found pack: Meeting & Decision Management v1.0.0

4️⃣  Installing template pack...
   ⚙️  Testing without x-org-id header (only x-project-id)
   ⚙️  Organization ID should be auto-derived from project

✅ Template pack installed successfully!
   Assignment ID: assignment-id-here
   Is Enabled: true
   Project ID: project-id-here
   Template Pack ID: 9f8d7e6c-5b4a-4c2d-8e0f-9a8b7c6d5e4f

5️⃣  Verifying installation...
✅ Installation verified - pack appears in project

🎉 ALL TESTS PASSED!
   The fix works correctly - organization ID is auto-derived from project.
```

### If the Fix Didn't Work

If you see this error:

```
❌ Installation failed: Organization context required
```

Then the controller changes weren't applied correctly. Check:

1. Server was restarted after code changes
2. TypeScript compiled without errors: `npm run build`
3. The controller methods have the auto-derivation logic

## What This Proves

✅ The endpoint no longer requires `x-org-id` header when `x-project-id` is provided  
✅ Organization ID is automatically derived from the project  
✅ The assignment is created successfully  
✅ The pack appears in the project's installed packs list
