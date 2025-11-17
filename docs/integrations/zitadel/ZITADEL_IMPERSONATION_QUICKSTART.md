# Quick Start: Enable Zitadel Impersonation

This guide provides the fastest path to enable user impersonation (delegation) in your spec-server-2 project, matching the working setup from huma-blueprint-ui.

## ⚡ 5-Minute Quick Setup

### Prerequisites

- Zitadel running on http://localhost:8080
- Admin access to Zitadel Console
- Your application already configured and working

### Step 1: Enable Token Exchange in Zitadel (2 minutes)

1. Open Zitadel Console: http://localhost:8080
2. Navigate to: **Projects** → **Your Project** → **Applications** → **Your App**
3. Click **Edit**
4. Find **Grant Types** section
5. ✅ Enable: **Token Exchange**
6. Click **Save**

### Step 2: Grant Delegation Permission (1 minute)

1. In Zitadel Console: **Users** → Find admin user
2. Go to **Grants** tab
3. Click **New Grant**
4. Select your project
5. Add role that includes delegation permission
6. Click **Save**

### Step 3: Test with curl (1 minute)

```bash
# Get your current token (from browser DevTools → Application → Local Storage)
TOKEN="your_token_here"
CLIENT_ID="your_client_id_here"

# Test token exchange
curl -X POST "http://localhost:8080/oauth/v2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=${TOKEN}" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "client_id=${CLIENT_ID}"
```

**Expected Success Response:**
```json
{
  "access_token": "ey...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**If you get an error**, go to the full setup guide: `docs/ZITADEL_IMPERSONATION_SETUP.md`

### Step 4: Implement Backend (1 minute)

Add to `apps/server/src/modules/auth/auth.module.ts`:

```typescript
import { TokenExchangeService } from './token-exchange.service';

@Module({
  // ... existing providers
  providers: [..., TokenExchangeService],
  exports: [..., TokenExchangeService],
})
export class AuthModule {}
```

Create the service (or copy from `docs/ZITADEL_IMPERSONATION_SETUP.md`):

```bash
# Copy the implementation from the full guide
# It's about 50 lines of code
```

### Step 5: Add Impersonation Button (Optional)

If you need UI to trigger impersonation:

```bash
# Create component from the guide
# Add to user management pages
```

## ✅ Verification

After setup, verify:

```bash
# 1. Check Zitadel supports token exchange
curl http://localhost:8080/.well-known/openid-configuration | jq '.grant_types_supported'
# Should include: "urn:ietf:params:oauth:grant-type:token-exchange"

# 2. Test token exchange with real token
# (Use curl command from Step 3 above)

# 3. Check no errors in Zitadel logs
docker logs spec-server-2-zitadel-1 --tail 50 | grep -i error
```

## 🎯 What You Get

After this setup:

- ✅ Backend can exchange tokens via Zitadel
- ✅ Admin users can act on behalf of other users
- ✅ No more "delegation not allowed" errors
- ✅ Matches huma-blueprint-ui functionality

## 🔄 What Still Needs Implementation

For full impersonation feature:

1. **Backend endpoint** to expose token exchange to frontend
2. **Frontend UI** to trigger impersonation
3. **Audit logging** for impersonation events
4. **Session management** to track impersonation state
5. **Exit impersonation** button in UI

See full implementation guide: `docs/ZITADEL_IMPERSONATION_SETUP.md`

## 🐛 Troubleshooting

### Error: "delegation not allowed"

**Cause:** Token exchange not enabled or user lacks permission

**Fix:**
1. Verify Step 1 was completed (Token Exchange enabled)
2. Verify Step 2 was completed (User has delegation permission)
3. Restart Zitadel: `docker restart spec-server-2-zitadel-1`

### Error: "invalid_client"

**Cause:** Client ID mismatch

**Fix:**
1. Check `CLIENT_ID` matches your Zitadel application
2. Verify application is enabled in Zitadel
3. Check no typos in client ID

### Success but backend doesn't work

**Cause:** Backend not using exchanged token

**Fix:**
1. Implement token exchange service (see Step 4)
2. Update frontend to use exchanged token
3. Add logging to track token usage

## 📚 Next Steps

After quick setup:

1. Read full guide: `docs/ZITADEL_IMPERSONATION_SETUP.md`
2. Compare with huma-blueprint-ui: `docs/ZITADEL_IMPERSONATION_COMPARISON.md`
3. Implement full impersonation UI
4. Add security features (audit logging, time limits)
5. Test in development thoroughly

## 🚀 Production Considerations

Before deploying to production:

- [ ] Add audit logging for all impersonation events
- [ ] Set short expiration on impersonated tokens (1 hour max)
- [ ] Limit which users can impersonate
- [ ] Add visual indicator when in impersonation mode
- [ ] Implement "exit impersonation" safely
- [ ] Test with real user scenarios
- [ ] Document for your team

## 📞 Support

If you're stuck:

1. Run diagnostic: `node test-zitadel-delegation-status.mjs`
2. Check Zitadel logs: `docker logs spec-server-2-zitadel-1 --tail 100`
3. Compare with huma-blueprint-ui Zitadel settings
4. Consult full implementation guide

---

**Estimated Total Time:** 5-10 minutes for basic setup, 1-2 hours for full implementation
