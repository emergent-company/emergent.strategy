# Local Zitadel Bootstrap Test

This guide walks through testing the complete dual service account setup using a local Zitadel instance.

## Quick Start (15 minutes)

### 1. Start Local Zitadel (2 min)

```bash
# Start Zitadel and PostgreSQL
docker-compose -f docker-compose.zitadel-local.yml up -d

# Wait for services to be healthy (30 seconds)
docker-compose -f docker-compose.zitadel-local.yml ps

# Check logs
docker logs zitadel-local -f
# Wait for: "ready to serve grpc at :8080"
```

### 2. Complete Zitadel Setup Wizard (3 min)

1. Open http://localhost:8200
2. First-time setup wizard will appear
3. Login with default admin:
   - Username: `admin`
   - Password: `Admin1234!`
4. You'll be prompted to change password (optional for local testing)

### 3. Create Admin Personal Access Token (2 min)

1. In Zitadel Console, click your profile (top right)
2. Go to **Personal Access Tokens**
3. Click **New**
4. Name: `Bootstrap Script`
5. Expiration: Select 1 year
6. Click **Save**
7. **IMPORTANT**: Copy the token immediately (it won't be shown again!)
   - Token format: `dEnN1EXAMPLEpRVL0BUDJVTmAEXAMPLE...`

### 4. Run Bootstrap Script (5 min)

```bash
cd /Users/mcj/code/spec-server-2

./scripts/bootstrap-zitadel.sh
```

**Prompts and Responses:**

```
Zitadel domain: localhost:8200
Admin Personal Access Token: [paste token from step 3]

Use existing organization? (y/n): n
New organization name: Test Organization

Project name: Test API Project
```

**Expected Output:**

```
✓ Connected to Zitadel successfully
✓ Created organization: Test Organization (ID: 123456789012345678)
✓ Created project: Test API Project (ID: 234567890123456789)
✓ Created CLIENT service account (User ID: 345678901234567890)
✓ CLIENT key saved to: secrets/zitadel-client-service-account.json
✓ CLIENT service account configured for introspection
✓ Created API service account (User ID: 456789012345678901)
✓ API key saved to: secrets/zitadel-api-service-account.json
✓ API service account configured with Management API permissions

  ✅ Bootstrap Complete!
```

### 5. Verify Generated Files (1 min)

```bash
# Check files were created
ls -lh secrets/

# Should see:
# -rw------- zitadel-client-service-account.json (< 5KB)
# -rw------- zitadel-api-service-account.json    (< 5KB)

# Verify JSON structure
cat secrets/zitadel-client-service-account.json | jq '.'

# Should have fields: type, keyId, key, userId
```

### 6. Update Environment for Local Testing (2 min)

Create `.env.zitadel-local`:

```bash
cat > .env.zitadel-local << 'EOF'
# Local Zitadel Test Configuration
ZITADEL_DOMAIN=localhost:8200
ZITADEL_ORG_ID=123456789012345678     # Replace with actual from bootstrap output
ZITADEL_PROJECT_ID=234567890123456789  # Replace with actual from bootstrap output
ZITADEL_CLIENT_JWT_PATH=/app/secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=/app/secrets/zitadel-api-service-account.json

# Rest of your existing env vars...
DATABASE_URL=postgresql://user:password@localhost:5432/specdb
# etc...
EOF
```

### 7. Test Server with Dual Service Accounts (3 min)

```bash
# Load local test env
export $(cat .env.zitadel-local | xargs)

# Start server
nx run workspace-cli:workspace:start

# Check logs
nx run workspace-cli:workspace:logs -- --follow

# Look for these messages:
# [Nest] INFO [ZitadelService] ✅ CLIENT service account loaded (keyId: ...)
# [Nest] INFO [ZitadelService] ✅ API service account loaded (keyId: ...)
# [Nest] INFO [ZitadelService] ✅ Dual service account mode active
```

## Verify Functionality

### Test Introspection (CLIENT account)

```bash
# Get a real user token from frontend or create test user
# Then test introspection endpoint

curl -X POST http://localhost:3001/auth/introspect \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json"

# Expected: 200 OK with user info (no 500 errors!)
```

### Test User Creation (API account)

```bash
# Create a test user via Management API

curl -X POST http://localhost:3001/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User"
  }'

# Expected: 201 Created with userId
```

## Troubleshooting

### Zitadel Not Starting

```bash
# Check logs
docker logs zitadel-local

# Common issues:
# - Port 8200 in use → Change in docker-compose.zitadel-local.yml
# - Database not ready → Wait 30 seconds for health check
```

### Bootstrap Script Fails

**Connection Error:**
```bash
# Verify Zitadel is accessible
curl http://localhost:8200/debug/ready
# Should return: "ok"
```

**401 Unauthorized:**
- PAT token expired or invalid
- Create new PAT in Zitadel Console

**400 Bad Request:**
- Organization or project already exists
- Use existing org/project option in script

### Server Won't Start with Dual Accounts

```bash
# Check file paths are correct
ls -l secrets/*.json

# Verify JSON structure
jq '.' secrets/zitadel-client-service-account.json

# Required fields: type, keyId, key, userId
```

### Introspection Still Returns 500

```bash
# Check which service account is being used
nx run workspace-cli:workspace:logs -- | grep -i "service account"

# Should see: "✅ CLIENT service account loaded"
# Should NOT see: "⚠️ Using legacy single-account mode"
```

## Cleanup

### Reset Everything

```bash
# Stop and remove Zitadel
docker-compose -f docker-compose.zitadel-local.yml down -v

# Remove generated secrets
rm -rf secrets/*.json

# Remove test env file
rm .env.zitadel-local
```

### Keep Zitadel, Reset Service Accounts

1. In Zitadel Console (http://localhost:8200)
2. Go to **Users** → Filter by "Service Account"
3. Delete `client-introspection-service` and `api-management-service`
4. Delete project
5. Run bootstrap script again

## Production Deployment

After verifying locally, deploy to production:

1. Run bootstrap script against production Zitadel:
   ```bash
   ./scripts/bootstrap-zitadel.sh
   # Domain: spec-zitadel.kucharz.net
   # Admin PAT: [production admin token]
   ```

2. Upload JSON files to production server:
   ```bash
   scp secrets/*.json user@server:/app/secrets/
   ssh user@server "chmod 600 /app/secrets/*.json"
   ```

3. Update Coolify environment variables (see main docs)

4. Deploy and monitor

## Useful Commands

```bash
# View all users in Zitadel
docker exec zitadel-local \
  zitadel users list

# View service accounts specifically  
docker exec zitadel-local \
  zitadel users list --type machine

# Restart Zitadel (keep data)
docker-compose -f docker-compose.zitadel-local.yml restart zitadel

# View database
docker exec -it zitadel-local-db \
  psql -U zitadel -d zitadel
```

## Success Criteria

- [x] Local Zitadel running (http://localhost:8200)
- [x] Bootstrap script completes without errors
- [x] Two JSON files created in `secrets/`
- [x] Server starts with "Dual service account mode active" log
- [x] Introspection endpoint returns 200 (no 500 errors)
- [x] User creation via Management API works
- [x] No authentication errors in logs

## Next Steps

1. Test with real frontend authentication flow
2. Verify token caching is working (check logs)
3. Monitor for 48 hours to confirm stability
4. Deploy to production following same process
5. Document learnings in team wiki
