# E2E Test User Setup Guide

## Overview

E2E tests use a dedicated test user account (`e2e-test@example.com`) with automatic cleanup before and after each test. This ensures tests are predictable and isolated.

**Note:** The E2E test user is now created automatically by the bootstrap script. Manual user creation is no longer required for local development.

## Automated Setup (Recommended)

### Step 1: Run Bootstrap Script

The E2E test user is created automatically when you run the bootstrap script:

```bash
./scripts/bootstrap-zitadel-fully-automated.sh
```

This will:

- Create the E2E test user (`e2e-test@example.com`) with verified email
- Set the password from `E2E_TEST_USER_PASSWORD` environment variable (default: `E2eTestPassword123!`)
- Skip creation if the user already exists (idempotent)

### Step 2: Get E2E Credentials

To view the E2E test user credentials, run:

```bash
./scripts/get-e2e-credentials.sh
```

This will display:

- E2E test user email and password
- Application URLs (admin, API, Zitadel)
- Instructions for manual testing with DevTools MCP

### Step 3: Configure Environment (Optional)

The bootstrap script uses these environment variables (with defaults):

```bash
# .env or apps/admin/.env.e2e
E2E_TEST_USER_EMAIL=e2e-test@example.com
E2E_TEST_USER_PASSWORD=E2eTestPassword123!
```

To customize, add these to your `.env` file before running the bootstrap script.

## Manual Setup (Legacy)

**Note:** This section is kept for reference only. Automated setup is recommended.

<details>
<summary>Click to expand manual setup instructions</summary>

### Step 1: Create Test User in Zitadel

1. **Start Zitadel** (if not running):

   ```bash
   npm run workspace:deps:start
   ```

2. **Open Zitadel Admin Console**:

   - URL: http://localhost:8200
   - Login with admin credentials (from `docker/zitadel.env`)

3. **Create Human User**:

   - Navigate to: **Users** → **Create New User**
   - User Type: **Human**
   - Email: `e2e-test@example.com`
   - First Name: `E2E`
   - Last Name: `Test User`
   - Password: Create a strong password
   - **Important**: Uncheck "User must change password" if present

4. **Store Credentials**:
   Create or update `apps/admin/.env.e2e`:

   ```bash
   E2E_TEST_USER_EMAIL=e2e-test@example.com
   E2E_TEST_USER_PASSWORD=YourStrongPassword123!
   ```

5. **Verify Login**:
   - Open: http://localhost:5176
   - Click "Sign In"
   - Login with: `e2e-test@example.com` / your password
   - Should redirect to setup (user has no orgs/projects initially)

</details>

### Step 2: Run E2E Tests

Once test user is created:

```bash
# Run setup guard tests
E2E_BASE_URL=http://localhost:5176 npx playwright test apps/admin/e2e/specs/setup-guard.spec.ts

# Run all E2E tests with cleanup
E2E_BASE_URL=http://localhost:5176 npx playwright test
```

## Test Data Management

### Automatic Cleanup Pattern

Tests using the `cleanUser` fixture automatically:

1. **Before test**: Delete all user data (orgs, projects, docs, etc.)
2. **During test**: Create fresh test data
3. **After test**: Delete all user data again

### Usage in Tests

```typescript
import { test, expect } from '../fixtures/cleanUser';
import { createTestOrg, createTestProject } from '../helpers/test-user';

test('my test', async ({ page, cleanupComplete }) => {
  // User is logged in and data is clean

  // Create test data
  const orgId = await createTestOrg(page, 'My Test Org');
  const projectId = await createTestProject(page, orgId, 'My Test Project');

  // Test logic
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin');

  // Cleanup happens automatically
});
```

### Manual Cleanup (if needed)

```bash
# Get auth token from browser localStorage after login
# Then call cleanup endpoint:
curl -X POST http://localhost:3002/user/test-cleanup \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Safety Features

The cleanup endpoints have multiple safety layers:

1. **Environment Check**: Only works in non-production (`NODE_ENV !== 'production'`)
2. **Email Validation**: Only deletes users matching test patterns:
   - `e2e-test@*`
   - `*@example.com`
   - `test+*@*`
   - `*+test@*`
3. **Authentication Required**: Must provide valid Bearer token
4. **Detailed Logging**: All deletions are logged with statistics

## Cleanup Scope

The cleanup deletes (in order):

1. ✅ Embeddings
2. ✅ Chunks
3. ✅ Extraction Jobs
4. ✅ Graph Objects (and relationships)
5. ✅ Documents
6. ✅ Projects
7. ✅ Integrations
8. ✅ Organizations

## Troubleshooting

### "No auth token found" Error

- Ensure user is logged in before cleanup
- Check localStorage contains `__oidc_user__` key
- Verify token hasn't expired

### "Cleanup failed (403)" Error

- Check `NODE_ENV` is not `production`
- Verify email matches test patterns
- Check server logs: `npm run workspace:logs -- --service=server`

### "Foreign key violation" Errors

- Should not happen - deletion order respects FK constraints
- If occurs, check database schema for new FK constraints
- Report as bug

### Test User Can't Login

- **Automated Setup:** Run bootstrap script again: `./scripts/bootstrap-zitadel-fully-automated.sh`
- **Check credentials:** Run `./scripts/get-e2e-credentials.sh` to confirm password
- Verify Zitadel is running: `curl http://localhost:8200`
- Check user exists in Zitadel admin console
- Check Zitadel logs: `npm run workspace:logs -- --service=zitadel`

## User Types

This project uses two separate test users:

1. **TEST_USER** (`test@example.com`)

   - Purpose: Manual testing and development
   - Created by: Bootstrap script (step 14/16)
   - Use for: Interactive browser testing, exploratory testing

2. **E2E_TEST_USER** (`e2e-test@example.com`)
   - Purpose: Automated E2E tests only
   - Created by: Bootstrap script (step 15/16)
   - Use for: Playwright E2E tests, CI/CD pipelines

Both users are created automatically by the bootstrap script and can coexist in the same Zitadel instance.

## Alternative: Automated User Creation

<details>
<summary>DEPRECATED - This is now implemented</summary>

If Zitadel supports API user creation, we can automate this. Check Zitadel Management API documentation for `/users` endpoint capabilities.

**Status:** ✅ Implemented in `scripts/bootstrap-zitadel-fully-automated.sh` (step 15/16)

</details>

## Related Files

- **Service**: `apps/server/src/modules/user/user-deletion.service.ts`
- **Controller**: `apps/server/src/modules/user/user-deletion.controller.ts`
- **Test Helpers**: `apps/admin/e2e/helpers/test-user.ts`
- **Clean User Fixture**: `apps/admin/e2e/fixtures/cleanUser.ts`
- **Example Test**: `apps/admin/e2e/specs/setup-guard.spec.ts`
