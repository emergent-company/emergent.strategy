# Zitadel Impersonation - Configuration Comparison Checklist

This checklist helps you compare your spec-server-2 configuration with the working huma-blueprint-ui setup to identify what needs to be configured for delegation/impersonation.

## 🔍 Diagnostic Steps

### Step 1: Compare Zitadel Application Settings

#### In huma-blueprint-ui Project:

1. Open Zitadel Console: `http://localhost:8080` (or your Zitadel URL)
2. Navigate to the project used by huma-blueprint-ui
3. Open the application settings
4. Document the following:

```
[ ] Application Name: _________________
[ ] Application Type: (Web/SPA/Native/API)
[ ] Client ID: _________________
[ ] Authentication Method: _________________
```

**Grant Types Enabled** (check all that apply):
```
[ ] Authorization Code
[ ] Refresh Token
[ ] Token Exchange  ← IMPORTANT: This is what enables delegation!
[ ] Client Credentials
[ ] Device Authorization
[ ] Implicit
```

**Redirect URIs:**
```
_________________
_________________
```

**Post Logout URIs:**
```
_________________
```

**Allowed Origins (CORS):**
```
_________________
```

#### In spec-server-2 Project:

Now check YOUR application settings and fill out the same information:

```
[ ] Application Name: _________________
[ ] Application Type: _________________
[ ] Client ID: _________________
[ ] Authentication Method: _________________
```

**Grant Types Enabled:**
```
[ ] Authorization Code
[ ] Refresh Token
[ ] Token Exchange  ← Check if this is enabled!
[ ] Client Credentials
[ ] Device Authorization
[ ] Implicit
```

**Key Difference to Look For:**
```
⚠️  If "Token Exchange" is enabled in huma-blueprint-ui but NOT in spec-server-2,
    that's the primary difference causing your system to not support impersonation.
```

### Step 2: Compare Backend Implementation

#### Check huma-blueprint-ui Backend:

Look for these patterns in the huma-blueprint-ui codebase:

```bash
# Search for token exchange implementation
cd ~/code/huma/huma-blueprint-ui
grep -r "token-exchange\|token_exchange\|urn:ietf:params:oauth:grant-type" . --include="*.ts" --include="*.tsx" --include="*.js"

# Search for impersonation features
grep -r "imperson\|delegation\|act.as" . --include="*.ts" --include="*.tsx" --include="*.js"

# Search for actor_token (used in token exchange)
grep -r "actor_token\|subject_token" . --include="*.ts" --include="*.tsx" --include="*.js"
```

Document your findings:

**Token Exchange Endpoint Found:**
```
File: _________________
Endpoint: _________________
Method: _________________
```

**Frontend Impersonation UI Found:**
```
Component: _________________
Location: _________________
Trigger: _________________
```

#### Check spec-server-2 Backend:

Now search YOUR codebase:

```bash
cd ~/code/spec-server-2
grep -r "token-exchange\|token_exchange\|urn:ietf:params:oauth:grant-type" . --include="*.ts" --include="*.tsx" --include="*.js"
```

**Result:**
```
[ ] Token exchange implementation found
[ ] Token exchange NOT found (needs to be implemented)
```

### Step 3: Compare Environment Variables

#### huma-blueprint-ui Environment:

Check their `.env` files:

```bash
cd ~/code/huma/huma-blueprint-ui
cat .env | grep -i zitadel
cat .env.local | grep -i zitadel 2>/dev/null || echo "No .env.local"
```

Document:
```env
ZITADEL_DOMAIN=_________________
ZITADEL_CLIENT_ID=_________________
ZITADEL_ISSUER=_________________
ZITADEL_ENABLE_TOKEN_EXCHANGE=_________________ (might be present)
# ... any other ZITADEL_ vars
```

#### spec-server-2 Environment:

Check YOUR `.env` files:

```bash
cd ~/code/spec-server-2
cat .env | grep -i zitadel
cat apps/admin/.env | grep -i zitadel
cat apps/server/.env | grep -i zitadel 2>/dev/null || echo "No server env"
```

Document:
```env
ZITADEL_DOMAIN=_________________
ZITADEL_CLIENT_ID=_________________
ZITADEL_ISSUER=_________________
# ... any other ZITADEL_ vars
```

**Differences Found:**
```
_______________________________________
_______________________________________
```

### Step 4: Compare User Permissions in Zitadel

#### huma-blueprint-ui Setup:

1. In Zitadel Console, go to **Users**
2. Find an admin user
3. Check their **Grants** or **Permissions** tab
4. Document any special permissions:

```
User: _________________
Role/Permission: _________________
Scope: _________________
Can Impersonate: [ ] Yes [ ] No
```

#### spec-server-2 Setup:

Do the same for YOUR users:

```
User: _________________
Role/Permission: _________________
Scope: _________________
Can Impersonate: [ ] Yes [ ] No
```

### Step 5: Test Token Exchange Manually

#### Get an Access Token (huma-blueprint-ui):

```bash
# Login to huma-blueprint-ui and get token from browser DevTools
# Application → Local Storage → look for auth token
HUMA_TOKEN="paste_token_here"

# Test if token exchange works
curl -X POST "http://localhost:8080/oauth/v2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=${HUMA_TOKEN}" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "client_id=YOUR_HUMA_CLIENT_ID"
```

**Result:**
```
[ ] Success (200) - Token exchange is working
[ ] Error (400/500) - Token exchange failed
Error message: _________________
```

#### Get an Access Token (spec-server-2):

```bash
# Login to spec-server-2 and get token
SPEC_TOKEN="paste_token_here"

# Test if token exchange works
curl -X POST "http://localhost:8080/oauth/v2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=${SPEC_TOKEN}" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "client_id=YOUR_SPEC_CLIENT_ID"
```

**Result:**
```
[ ] Success (200) - Token exchange is working
[ ] Error (400/500) - Token exchange not configured
Error message: _________________
```

## 🎯 Implementation Roadmap

Based on your findings above, follow this roadmap:

### If Token Exchange is NOT enabled in Zitadel:

1. **Enable in Zitadel Console:**
   - Projects → Your Project → Application
   - Edit application settings
   - Grant Types → Enable "Token Exchange"
   - Save changes

2. **Restart Zitadel** (if needed):
   ```bash
   docker restart spec-server-2-zitadel-1
   ```

3. **Verify it's enabled:**
   ```bash
   curl http://localhost:8080/.well-known/openid-configuration | jq '.grant_types_supported'
   ```
   Should include: `"urn:ietf:params:oauth:grant-type:token-exchange"`

### If Backend Implementation is Missing:

1. **Create Token Exchange Service:**
   - Follow: `docs/ZITADEL_IMPERSONATION_SETUP.md`
   - Implement: `apps/server/src/modules/auth/token-exchange.service.ts`

2. **Add Backend Endpoint:**
   - Add to: `apps/server/src/modules/auth/auth.controller.ts`
   - Endpoint: `POST /auth/impersonate`

3. **Add Frontend UI:**
   - Create: `apps/admin/src/components/ImpersonateUserButton.tsx`
   - Add to user management pages

### If Permissions are Missing:

1. **Grant Delegation Permission:**
   - Zitadel Console → Users → Select admin user
   - Permissions/Grants → Add permission
   - Grant: "Can impersonate users" or equivalent

2. **Create Custom Role** (if needed):
   - Projects → Your Project → Roles
   - Create role: `user_impersonator`
   - Assign to admin users

## 🔬 Advanced Debugging

### Check Zitadel Feature Flags:

```bash
docker exec -it spec-server-2-zitadel-1 /bin/sh -c "zitadel admin feature list 2>/dev/null || echo 'Command not available'"
```

### Check Zitadel Logs in Real-Time:

```bash
# Terminal 1: Watch logs
docker logs -f spec-server-2-zitadel-1 | grep -i "token\|exchange\|delegation"

# Terminal 2: Test token exchange
curl -X POST "http://localhost:8080/oauth/v2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=YOUR_TOKEN" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "client_id=YOUR_CLIENT_ID"
```

### Inspect JWT Tokens:

```bash
# Decode a JWT token to see its claims
echo "YOUR_TOKEN_HERE" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

Look for:
- `sub` - Subject (user ID)
- `act` - Actor claim (present if token was exchanged)
- `may_act` - Delegation permissions
- `azp` - Authorized party

## 📝 Documentation Links

- **RFC 8693 Token Exchange:** https://datatracker.ietf.org/doc/html/rfc8693
- **Zitadel Docs:** https://zitadel.com/docs
- **OIDC Token Exchange:** https://openid.net/specs/openid-connect-core-1_0.html

## ✅ Completion Checklist

After implementing, verify:

```
[ ] Token Exchange grant type enabled in Zitadel application
[ ] Backend service created: token-exchange.service.ts
[ ] Backend endpoint added: POST /auth/impersonate
[ ] Frontend UI component created for impersonation
[ ] Admin users have delegation permissions in Zitadel
[ ] Manual curl test succeeds (no delegation error)
[ ] Frontend can successfully impersonate users
[ ] Audit logging implemented for impersonation events
[ ] Visual indicator added when in impersonation mode
[ ] Exit impersonation functionality works
[ ] Tested in development environment
[ ] Security review completed
[ ] Documentation updated
```

## 🚨 Common Issues

### Issue: "delegation not allowed, issuer and sub must be identical"

**Cause:** Token exchange is disabled OR user lacks delegation permission

**Fix:**
1. Enable token exchange grant type in Zitadel application
2. Grant delegation permission to user in Zitadel
3. Verify with manual curl test

### Issue: Token exchange returns 400 "invalid_grant"

**Cause:** Client ID mismatch or wrong token format

**Fix:**
1. Verify client_id matches application in Zitadel
2. Ensure token is not expired
3. Check token is a valid JWT or opaque token from Zitadel

### Issue: Token exchange succeeds but backend doesn't work

**Cause:** Backend not using the exchanged token

**Fix:**
1. Ensure frontend stores exchanged token in auth context
2. Verify API calls use exchanged token, not original
3. Add logging to track which token is being used

## 🎓 Learning Resources

If you want to understand the differences in detail:

1. **Compare Zitadel configs side-by-side:**
   - Export huma-blueprint-ui application config
   - Export spec-server-2 application config
   - Use diff tool to compare

2. **Compare backend implementations:**
   - Look for `/auth/impersonate` or similar endpoints
   - Check how tokens are passed between frontend/backend

3. **Test both systems:**
   - Use browser DevTools Network tab
   - Watch actual OAuth/OIDC flows
   - Compare token exchange requests

## 📞 Need Help?

If you're stuck:

1. Share the results of your Step 1-5 findings
2. Include any error messages from Zitadel logs
3. Describe what you're trying to accomplish with impersonation
4. Reference the working huma-blueprint-ui behavior

---

**Next Step:** Start with Step 1 above and work through the checklist systematically.
