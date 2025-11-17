# Bootstrap Script: API Application Key Generation

## Overview

This enhancement adds JWT key generation for the API application created by the bootstrap script. Previously, the API app was created with `API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT` authentication but had no keys, making it non-functional.

## What Was Changed

### New Step Added

**Step 7/14: Generate API Application Key**

Added between API application creation (step 6) and CLIENT service account creation (now step 8):

```bash
[7/14] Generating API application key...
✓ API app key saved to secrets/zitadel-api-app-key.json
```

### API Endpoint

```bash
POST /management/v1/projects/${PROJECT_ID}/apps/${API_APP_ID}/keys
```

**Request Body:**
```json
{
  "type": "KEY_TYPE_JSON",
  "expirationDate": "2030-01-01T00:00:00Z"
}
```

**Response:**
- `id`: Key ID
- `keyDetails`: Base64-encoded JWT key details

### File Output

**Location:** `secrets/zitadel-api-app-key.json`

**Structure:**
```json
{
  "type": "application",
  "keyId": "345530517640183811",
  "key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  "appId": "345528630287269891",
  "clientId": "345528630287335427",
  "projectId": "345519855350317059"
}
```

### Updated Step Count

The provision mode now has **14 steps** (previously 13):

1. Load PAT
2. Test authentication
3. Check/create organization
4. Check/create project
5. Check/create OAuth OIDC application
6. Check/create API application
7. **Generate API application key** ✨ NEW
8. Check/create CLIENT service account (was step 7)
9. Generate CLIENT JWT key (was step 8)
10. Check/create API service account (was step 9)
11. Grant ORG_OWNER role (was step 10)
12. Generate API JWT key (was step 11)
13. Create test user (was step 12)
14. Output configuration (was step 13)

### Enhanced Configuration Output

Added to final `.env` output:

```bash
# API Application
ZITADEL_API_CLIENT_ID=345528630287335427
ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json  # ← NEW
```

## Three JWT Key Files

The bootstrap script now generates **three JWT key files**:

| File | Purpose | Authentication Type | Permissions |
|------|---------|-------------------|-------------|
| `zitadel-client-service-account.json` | Token introspection | Service account | Minimal (CLIENT role) |
| `zitadel-api-service-account.json` | Management API operations | Service account | Elevated (ORG_OWNER) |
| `zitadel-api-app-key.json` | API application authentication | Application key | App-level |

## Testing

### Verify Key Generation

```bash
# Run provision
./scripts/bootstrap-zitadel-fully-automated.sh provision

# Check for step 7 output
[7/14] Generating API application key...
✓ API app key saved to secrets/zitadel-api-app-key.json

# Verify file exists
ls -lh secrets/zitadel-api-app-key.json

# Check key structure
cat secrets/zitadel-api-app-key.json | jq '{type, keyId, appId, clientId, projectId}'
```

### Expected Output

```json
{
  "type": "application",
  "keyId": "345530517640183811",
  "appId": "345528630287269891",
  "clientId": "345528630287335427",
  "projectId": "345519855350317059"
}
```

### Verify Configuration Output

```bash
# Run provision and check final output
./scripts/bootstrap-zitadel-fully-automated.sh provision 2>&1 | tail -40
```

Should include:
```bash
# API Application
ZITADEL_API_CLIENT_ID=345528630287335427
ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json
```

## Benefits

1. **Complete API App Configuration**: API application is now fully functional with authentication keys
2. **Consistent Pattern**: Follows same key generation pattern as service accounts
3. **Idempotent**: Key generation works on both fresh installs and existing setups
4. **Clear Documentation**: Final output explicitly shows API app key path

## Related Resources

- **API Application Created**: Step 6/14
- **API App Authentication**: `API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT`
- **Key Expiration**: 2030-01-01 (5+ years)
- **Key Type**: JSON format with RSA private key

## Implementation Date

November 6, 2024 - Added as part of OAuth/API application enhancement
