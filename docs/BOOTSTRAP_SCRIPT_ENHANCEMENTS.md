# Bootstrap Script Enhancements

## Overview

The Zitadel bootstrap script (`scripts/bootstrap-zitadel-fully-automated.sh`) has been enhanced with comprehensive verification capabilities and improved idempotency.

## New Features

### 1. Four Operation Modes

The script now supports four modes:

```bash
# Full setup (creates org, project, service accounts, test user)
./scripts/bootstrap-zitadel-fully-automated.sh provision

# Check current configuration
./scripts/bootstrap-zitadel-fully-automated.sh status

# Regenerate JWT keys for existing service accounts
./scripts/bootstrap-zitadel-fully-automated.sh regenerate

# Comprehensive verification of all configuration and access
./scripts/bootstrap-zitadel-fully-automated.sh verify
```

### 2. Test User Creation

The provision mode now creates a test user with:
- Pre-verified email (no manual verification needed)
- Immediate active status
- Configurable email and password

**Environment Variables:**
```bash
TEST_USER_EMAIL="${TEST_USER_EMAIL:-test@example.com}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-TestPassword123!}"
```

**Implementation Details:**
- Uses `/management/v1/users/human/_import` endpoint for pre-verified users
- Sets `isEmailVerified: true` so user is immediately active
- Created with username matching email address

### 3. Improved Idempotency

The script now checks for existing resources before creating them:

**Steps with Existence Checks:**
- ✅ Organization (checks before creating)
- ✅ Project (checks before creating)
- ✅ CLIENT service account (NEW - checks before creating)
- ✅ API service account (NEW - checks before creating)

**Benefits:**
- Can be run multiple times safely
- Won't fail if resources already exist
- Regenerates keys even if accounts exist

### 4. Comprehensive Verify Mode

The new verify mode performs 8 checks:

#### [1/8] Local Configuration Files
- Bootstrap PAT file existence and size
- CLIENT service account key file validity
- API service account key file validity
- Extracts and verifies key IDs and user IDs

#### [2/8] Zitadel Connectivity
- Tests health endpoint (`/debug/healthz`)
- Verifies Zitadel is reachable

#### [3/8] Admin PAT Authentication
- Tests Admin API authentication
- Fetches organization and project IDs
- Verifies organization and project exist

#### [4/8] CLIENT Service Account JWT Authentication
- Tests JWT grant flow (optional)
- Attempts token acquisition
- Tests introspection endpoint
- Shows warning if OAuth not configured (not a failure)

#### [5/8] API Service Account JWT Authentication
- Tests JWT grant flow (optional)
- Attempts token acquisition
- Shows warning if OAuth not configured (not a failure)

#### [6/8] Test User Authentication
- Tests password grant flow (optional)
- Verifies test user exists and can authenticate
- Shows warning if password grant not enabled (not a failure)

#### [7/8] Management API Access
- Tests Management API access with API service account
- Verifies ORG_OWNER permissions
- Lists users to confirm access

#### [8/8] Service Account Verification
- Verifies service accounts exist in Zitadel
- Cross-checks user IDs between Zitadel and key files
- Detects mismatches

### 5. Intelligent Error Handling

The verify mode distinguishes between:

**Critical Failures** (will fail verification):
- Local files missing or invalid
- Zitadel unreachable
- Admin PAT authentication failed
- Organization or project not found
- Service accounts not found
- User ID mismatches

**Warnings** (won't fail verification):
- JWT authentication not configured (requires OAuth app setup)
- Password grant not enabled (requires OAuth app configuration)
- Test user not found (can be created with provision mode)
- Management API not accessible (requires valid tokens)

## Usage Examples

### Initial Setup
```bash
# Run provision mode to create everything
./scripts/bootstrap-zitadel-fully-automated.sh provision

# Output includes:
# - Organization and project IDs
# - Service account IDs
# - Test user credentials
# - Environment variable configuration
```

### Verify Configuration
```bash
# Run comprehensive verification
./scripts/bootstrap-zitadel-fully-automated.sh verify

# If issues found, see troubleshooting steps
# If all checks pass, ready to start server
```

### Check Status
```bash
# Quick status check
./scripts/bootstrap-zitadel-fully-automated.sh status

# Shows:
# - Local file status
# - Remote Zitadel resources (if PAT available)
# - Environment variable template
```

### Regenerate Keys
```bash
# Regenerate service account JWT keys
./scripts/bootstrap-zitadel-fully-automated.sh regenerate

# Immediately invalidates old keys
# Saves new keys to secrets/ directory
# Requires server restart
```

## Test User Details

**Default Credentials:**
- Email: `test@example.com`
- Password: `TestPassword123!`

**Customization:**
```bash
TEST_USER_EMAIL="admin@example.com" \
TEST_USER_PASSWORD="MySecurePass!" \
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

**User Properties:**
- Username: matches email
- First Name: "Test"
- Last Name: "User"
- Display Name: "Test User"
- Email: pre-verified (`isEmailVerified: true`)
- Status: immediately active

## Exit Codes

- `0` - Success (all checks passed in verify mode)
- `1` - Failure (critical error or verification failed)

## Integration with Spec Server

After running provision mode, add to `.env`:

```bash
ZITADEL_DOMAIN=localhost:8200
ZITADEL_ORG_ID=<from-provision-output>
ZITADEL_PROJECT_ID=<from-provision-output>
ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json
```

Start server and verify:
```bash
nx run workspace-cli:workspace:start

# Look for in logs:
# "Dual service account mode active"
# "CLIENT JWT loaded"
# "API JWT loaded"
```

## Production Usage

For production deployment:

```bash
# Run with production domain
ZITADEL_DOMAIN=spec-zitadel.kucharz.net \
./scripts/bootstrap-zitadel-fully-automated.sh provision

# Upload JSON files to production server
# Update production environment variables
# Deploy and verify
```

## Troubleshooting

If verify mode fails:

1. **Check failed tests** - Review the output for specific failures
2. **Run status mode** - `./scripts/bootstrap-zitadel-fully-automated.sh status`
3. **Re-provision** - `./scripts/bootstrap-zitadel-fully-automated.sh provision`
4. **Regenerate keys** - `./scripts/bootstrap-zitadel-fully-automated.sh regenerate`

Common issues:
- **JWT authentication fails**: Normal if OAuth app not configured (warning only)
- **Test user fails**: Run provision mode to create user
- **User ID mismatch**: Regenerate keys to sync IDs
- **Management API fails**: Verify API service account has ORG_OWNER role

## Architecture Benefits

1. **Zero Touch Automation**: Automatic PAT + provision = no manual steps
2. **Idempotent Execution**: Can run provision multiple times safely
3. **Comprehensive Verification**: 8-step check validates entire setup
4. **Flexible Key Management**: Easy key rotation without recreating accounts
5. **Test User Ready**: Pre-verified user for immediate testing
6. **Production Ready**: Same script for dev and production

## Next Steps

After successful verification:

1. ✅ Configuration files valid
2. ✅ Zitadel connectivity confirmed
3. ✅ Service accounts exist and accessible
4. ✅ Test user created and active
5. ⏭️ Update .env file
6. ⏭️ Start spec-server
7. ⏭️ Verify dual service account mode
8. ⏭️ Test introspection endpoint
9. ⏭️ Deploy to production
