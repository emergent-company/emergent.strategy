# Scope Enforcement Disabled Mode

## Overview

The backend has scope enforcement **disabled** via the `SCOPES_DISABLED=1` environment variable. This means:

- ✅ Any authenticated user can access any endpoint
- ✅ No need to configure scopes in Zitadel
- ✅ No need to grant specific permissions to users
- ⚠️ **All authorization is bypassed** (only authentication is checked)

This is similar to how blueprint-ui works - authentication-only, no fine-grained authorization.

## How It Works

### ScopesGuard Behavior

The `ScopesGuard` in `apps/server/src/modules/auth/scopes.guard.ts` checks the environment variable:

```typescript
const scopesDisabled = process.env.SCOPES_DISABLED === '1';
if (scopesDisabled) return true; // Bypass all scope checks
```

When `SCOPES_DISABLED=1`:

1. User must still be authenticated (valid token from Zitadel)
2. The `@Scopes()` decorators on endpoints are **ignored**
3. All authenticated users have full access

### Files Updated

**Production** (`.env`):

```bash
SCOPES_DISABLED=1
```

**Local Development** (`.env`):

```bash
SCOPES_DISABLED=1
```

**Example File** (`.env.example`):

```bash
# Authorization - Disable scope enforcement (useful for development/migration)
# Set to 1 to bypass @Scopes() decorators on endpoints
SCOPES_DISABLED=0
```

## Testing

After deploying with `SCOPES_DISABLED=1`, your authentication should work:

```bash
# Test with any valid token (access_token or id_token)
curl -X GET https://spec-server.kucharz.net/api/orgs \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return org list (200 OK), not unauthorized error
```

## Security Implications

### ⚠️ What This Means

- **Any authenticated user** can perform **any action**
- No role-based access control (RBAC)
- No permission differentiation (admin vs. regular user)

### ✅ When This Is Acceptable

- **Development/staging environments**
- **Small teams** where all users are trusted
- **MVP/prototype** phases before implementing authorization
- **Single-tenant** applications where all users should have full access

### ❌ When You Need Scopes

You should re-enable scopes (`SCOPES_DISABLED=0`) when:

- You need different user roles (admin, editor, viewer)
- You want to restrict sensitive operations (delete, admin actions)
- You're handling multi-tenant scenarios with different permissions per org
- Compliance requirements mandate fine-grained access control

## Re-enabling Scopes (Future)

To re-enable scope enforcement:

1. **Set environment variable**:

   ```bash
   SCOPES_DISABLED=0
   ```

2. **Configure Zitadel scopes** (follow `docs/AUTH_SCOPES_FIX.md`)

3. **Update frontend scope request**:

   ```bash
   VITE_ZITADEL_SCOPES="openid profile email org:read project:read documents:read documents:write..."
   ```

4. **Grant scopes to users** in Zitadel (via Project Roles)

5. **Redeploy and force re-authentication**

## Comparison with blueprint-ui

Like blueprint-ui, this configuration:

- ✅ Uses Zitadel only for **authentication** (who are you?)
- ✅ Bypasses **authorization** checks (what can you do?)
- ✅ Simplifies user management (no complex role setup)
- ✅ Faster development (no scope configuration needed)

Unlike full scope enforcement:

- ❌ No granular permissions
- ❌ No audit trail of authorization decisions
- ❌ All users have equal access

## Monitoring

Even with scopes disabled, the system still logs:

- Authentication attempts (who logged in)
- API endpoint access (what actions were performed)
- Request metadata (IP, user agent, timestamps)

What's NOT logged when scopes are disabled:

- Authorization denials (there are none)
- Missing scope violations (all checks pass)

## Environment Variables Reference

| Variable            | Value    | Behavior                                     |
| ------------------- | -------- | -------------------------------------------- |
| `SCOPES_DISABLED=1` | Enabled  | Bypass all scope checks, authentication-only |
| `SCOPES_DISABLED=0` | Disabled | Enforce @Scopes() decorators (default)       |
| (unset)             | Disabled | Same as `0`, enforce scopes                  |

## Deployment Checklist

For production with disabled scopes:

- [x] Set `SCOPES_DISABLED=1` in production environment
- [x] Deploy backend with new environment variable
- [ ] Test authentication with existing tokens
- [ ] Verify all endpoints are accessible
- [ ] Document that authorization is disabled for your team

## Related Documentation

- `docs/AUTH_SCOPES_FIX.md` - How to configure scopes (when re-enabling)
- `apps/server/src/modules/auth/scopes.guard.ts` - Implementation
- `apps/server/src/modules/auth/scopes.decorator.ts` - @Scopes() decorator
- `SECURITY_SCOPES.md` - Full scope system documentation

---

**Created**: 2025-11-03  
**Status**: Active (scopes disabled in production)  
**Mode**: Authentication-only (like blueprint-ui)
