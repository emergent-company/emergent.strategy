# Change: Add E2E Test User to Zitadel Bootstrap

## Why

E2E tests currently require manual user creation in Zitadel before tests can run. The bootstrap script already creates an admin user and a test user, but the E2E test suite uses a separate user (`e2e-test@example.com`) that must be created manually through the Zitadel UI. This manual step:

- Blocks automated E2E test execution in CI/CD pipelines
- Requires developers to follow a multi-step manual process (documented in `docs/testing/e2e/E2E_TEST_USER_SETUP.md`)
- Creates inconsistency between environments (different passwords, user IDs)
- Delays onboarding of new developers

The bootstrap script already has the infrastructure to create users programmatically. We should extend it to create a dedicated E2E test user automatically.

## What Changes

- Extend `scripts/bootstrap-zitadel-fully-automated.sh` to create a second test user specifically for E2E tests
- Add environment variables for E2E test user credentials:
  - `E2E_TEST_USER_EMAIL` (default: `e2e-test@example.com`)
  - `E2E_TEST_USER_PASSWORD` (default: `E2eTestPassword123!`)
- Create a helper script `scripts/get-e2e-credentials.sh` to retrieve E2E test user credentials dynamically
- Update E2E test configuration to use the helper script instead of hardcoded environment variables
- Update documentation to reflect automated E2E user creation

## Impact

- **Affected specs:**
  - `zitadel-bootstrap` (new requirement for E2E test user creation)
  - `e2e-testing` (modified requirement for credential management)
- **Affected code:**
  - `scripts/bootstrap-zitadel-fully-automated.sh` - Add E2E user creation step
  - `scripts/get-e2e-credentials.sh` - New script to output E2E credentials
  - `apps/admin/.env.e2e` - Update to reference credentials script or maintain static values
  - `docs/testing/e2e/E2E_TEST_USER_SETUP.md` - Update to reflect automated creation
  - `.env.example` - Add E2E*TEST_USER*\* variables
- **Dependencies:**
  - None (uses existing Zitadel Management API)
- **Breaking changes:** None (backwards compatible - existing manual setup still works)

## How It Works

### Bootstrap Flow

1. **During Provision Mode:**

   - After creating the regular test user (step 14/15)
   - Create E2E test user with credentials from environment variables
   - Use Zitadel Management API `/users/human/_import` endpoint
   - Store user ID for future reference

2. **Credential Retrieval:**

   - New script `scripts/get-e2e-credentials.sh` reads from `.env`
   - Outputs credentials in a simple format (JSON or key=value)
   - Can be called by E2E tests or CI/CD pipelines

3. **E2E Test Integration:**
   - Tests continue to read `E2E_TEST_USER_EMAIL` and `E2E_TEST_USER_PASSWORD` from environment
   - Values now come from bootstrap configuration (via `.env`) instead of manual setup
   - Alternatively, tests can invoke `get-e2e-credentials.sh` directly for dynamic retrieval

### User Management

- **Regular test user** (`test@example.com`): For manual testing, development, demos
- **E2E test user** (`e2e-test@example.com`): Dedicated for automated E2E tests only
- Both users created automatically during bootstrap
- Both users have verified emails and no forced password change

### Environment Variables

```bash
# Regular test user (existing)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPassword123!

# E2E test user (new)
E2E_TEST_USER_EMAIL=e2e-test@example.com
E2E_TEST_USER_PASSWORD=E2eTestPassword123!
```

## Alternatives Considered

### Alternative 1: Use Same User for Manual and E2E Tests

**Rejected:** E2E tests perform aggressive cleanup that could interfere with manual testing sessions.

### Alternative 2: Dynamic User Creation in E2E Setup

**Rejected:** Would require E2E tests to have admin credentials and make API calls before every test run, adding complexity and latency.

### Alternative 3: Script-based Credential Passing

**Selected:** Create `get-e2e-credentials.sh` helper script to centralize credential management and support dynamic retrieval patterns.

## Migration Path

1. **Existing Environments (Manual E2E User):**

   - Bootstrap script checks if E2E user already exists (by email)
   - If exists, skips creation and logs info message
   - No disruption to existing workflows

2. **New Environments:**

   - Run bootstrap script with E2E user environment variables
   - E2E user created automatically
   - Tests work immediately without manual steps

3. **CI/CD Pipelines:**
   - Set `E2E_TEST_USER_EMAIL` and `E2E_TEST_USER_PASSWORD` in pipeline secrets
   - Bootstrap script creates user automatically
   - Tests run without manual intervention

## Success Criteria

- [ ] Bootstrap script creates E2E test user automatically in provision mode
- [ ] E2E test user has verified email and no forced password change
- [ ] `get-e2e-credentials.sh` script outputs E2E credentials correctly
- [ ] Existing E2E tests pass without code changes (credentials loaded from environment)
- [ ] Bootstrap script gracefully handles existing E2E user (idempotent)
- [ ] Documentation updated to reflect automated setup
- [ ] CI/CD pipeline can run E2E tests without manual user creation
