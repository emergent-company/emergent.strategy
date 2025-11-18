# Implementation Tasks

## 1. Bootstrap Script Enhancement

- [ ] 1.1 Add E2E_TEST_USER_EMAIL environment variable with default `e2e-test@example.com`
- [ ] 1.2 Add E2E_TEST_USER_PASSWORD environment variable with default `E2eTestPassword123!`
- [ ] 1.3 Add E2E test user creation step after regular test user (new step 15/16)
- [ ] 1.4 Use Zitadel Management API `/users/human/_import` to create E2E user
- [ ] 1.5 Set firstName="E2E", lastName="Test", displayName="E2E Test User"
- [ ] 1.6 Verify email automatically (isEmailVerified: true)
- [ ] 1.7 Handle case where E2E user already exists (check for existing user, skip gracefully)
- [ ] 1.8 Store E2E_USER_ID in bootstrap output for reference
- [ ] 1.9 Update configuration summary output to include E2E test user credentials
- [ ] 1.10 Increment final step counter to 16/16

## 2. Credential Retrieval Script

- [ ] 2.1 Create `scripts/get-e2e-credentials.sh`
- [ ] 2.2 Add ANSI color code constants (RED, GREEN, YELLOW, BLUE, NC)
- [ ] 2.3 Load .env file and extract E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD
- [ ] 2.4 Provide default values if not set in .env
- [ ] 2.5 Output credentials in human-readable format with color formatting
- [ ] 2.6 Add usage instructions and examples
- [ ] 2.7 Make script executable: `chmod +x scripts/get-e2e-credentials.sh`
- [ ] 2.8 Test script outputs correct credentials

## 3. Environment Configuration

- [ ] 3.1 Add E2E_TEST_USER_EMAIL to .env.example with default value
- [ ] 3.2 Add E2E_TEST_USER_PASSWORD to .env.example with default value
- [ ] 3.3 Add comments explaining E2E user purpose (automated testing only)
- [ ] 3.4 Add section header "# E2E Test User (Automated Testing)"
- [ ] 3.5 Document distinction between TEST_USER (manual) and E2E_TEST_USER (automated)

## 4. E2E Test Configuration Updates

- [ ] 4.1 Verify `apps/admin/.env.e2e` uses E2E*TEST_USER*\* variables
- [ ] 4.2 Update E2E test helper to use credentials from environment
- [ ] 4.3 Test E2E tests still pass with new credential source
- [ ] 4.4 Optional: Update tests to call `get-e2e-credentials.sh` for dynamic retrieval

## 5. Documentation Updates

- [ ] 5.1 Update `docs/testing/e2e/E2E_TEST_USER_SETUP.md`
- [ ] 5.2 Replace "Manual Setup Required" section with "Automated Setup"
- [ ] 5.3 Document that E2E user is created automatically by bootstrap script
- [ ] 5.4 Add section on credential retrieval using `get-e2e-credentials.sh`
- [ ] 5.5 Update troubleshooting section to reference bootstrap script
- [ ] 5.6 Mark manual user creation steps as legacy/optional
- [ ] 5.7 Update `scripts/bootstrap-zitadel-fully-automated.sh` help text to mention E2E user
- [ ] 5.8 Add note about separation between manual test user and E2E test user

## 6. Testing & Validation

- [ ] 6.1 Test bootstrap script creates E2E user successfully
- [ ] 6.2 Verify E2E user has verified email and correct credentials
- [ ] 6.3 Test bootstrap script is idempotent (run twice, no errors)
- [ ] 6.4 Test E2E user credentials work with Zitadel login
- [ ] 6.5 Test `get-e2e-credentials.sh` outputs correct values
- [ ] 6.6 Run E2E test suite to verify tests pass with new user
- [ ] 6.7 Test cleanup endpoint works with E2E test user
- [ ] 6.8 Verify both TEST_USER and E2E_TEST_USER can coexist

## 7. CI/CD Integration (Optional)

- [ ] 7.1 Document CI/CD environment variable setup
- [ ] 7.2 Add example GitHub Actions workflow snippet
- [ ] 7.3 Document how to set secrets for E2E_TEST_USER_PASSWORD
- [ ] 7.4 Test E2E tests run in CI environment (if applicable)
