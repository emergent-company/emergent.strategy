# Self-Registration Flow Design for Zitadel

**Status:** Draft  
**Author:** AI Assistant  
**Date:** 2025-12-18  
**Related:** `docs/spec/18-authorization-model.md`, `docs/architecture/PHASE_4_INVITATION_FLOW_COMPLETE.md`

---

## Executive Summary

This document describes the design for enabling user self-registration in the Emergent system using Zitadel as the identity provider. The goal is to allow users to register themselves directly through Zitadel's hosted UI, with the Emergent backend automatically provisioning the necessary resources when they first authenticate.

## Current State

### How Authentication Works Today

1. **Invitation-Only Flow**: Users are currently onboarded via an invitation workflow:

   - Admin creates invitation with user email
   - Zitadel user is created via Management API
   - Password setup email is sent
   - User accepts invitation → roles are granted

2. **First Login Auto-Provisioning**: When a user authenticates for the first time:

   - `AuthService.validateToken()` calls `ensureUserProfile()`
   - A `core.user_profiles` record is created if it doesn't exist
   - No organization or project is automatically created

3. **Setup Flow**: After first login, `SetupGuard` checks if user has organizations/projects:
   - No orgs → redirects to `/setup/organization`
   - No projects → redirects to `/setup/project`
   - Both exist → shows main admin UI

### Key Files

| Component            | File Path                                                      |
| -------------------- | -------------------------------------------------------------- |
| Login Page           | `apps/admin/src/pages/auth/login/index.tsx`                    |
| OIDC Config          | `apps/admin/src/auth/oidc.ts`                                  |
| Auth Provider        | `apps/admin/src/contexts/auth.tsx`                             |
| Setup Guard          | `apps/admin/src/components/guards/SetupGuard.tsx`              |
| Org Setup            | `apps/admin/src/pages/setup/organization.tsx`                  |
| Project Setup        | `apps/admin/src/pages/setup/project.tsx`                       |
| Server Auth          | `apps/server/src/modules/auth/auth.service.ts`                 |
| User Profile Service | `apps/server/src/modules/user-profile/user-profile.service.ts` |

---

## Self-Registration Options

### Option 1: Zitadel Native Registration (Recommended)

**Description:** Enable self-registration in Zitadel's Login Behavior settings. Users register directly in Zitadel's hosted login UI, then Emergent provisions resources on first authenticated API call.

**Pros:**

- Minimal code changes required
- Leverages Zitadel's built-in registration UI
- Password policies, MFA, and email verification handled by Zitadel
- Consistent with existing first-login auto-provisioning

**Cons:**

- Less control over registration UI branding
- Cannot collect custom fields during registration

**Required Changes:**

1. **Zitadel Configuration:**

   - Enable "Register allowed" in Login Behavior settings
   - Configure Password Complexity policy
   - Set up SMTP for verification emails
   - Optionally enable email verification

2. **Admin App:**

   - Add "Register" button/link on login page pointing to Zitadel
   - Existing `/setup/organization` and `/setup/project` pages handle post-registration

3. **Server:**
   - Existing `ensureUserProfile()` already handles first-login provisioning
   - No changes required

### Option 2: Custom Registration Page

**Description:** Build a custom registration page in the Admin app that creates users via Zitadel Management API.

**Pros:**

- Full control over registration UI/UX
- Can collect additional profile fields
- Custom branding

**Cons:**

- More development effort
- Need to handle email verification manually
- Requires Zitadel service account permissions

**Required Changes:**

1. **Admin App:**

   - Implement full registration form at `/auth/register`
   - Call new server endpoint to create user

2. **Server:**
   - New endpoint `POST /auth/register`
   - Use `ZitadelService.createUser()` to provision user
   - Send verification email via Zitadel

---

## Recommended Approach: Option 1 + Setup Flow

The recommended approach combines **Zitadel Native Registration** with the existing **Setup Flow** to provide a complete self-service onboarding experience.

### User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SELF-REGISTRATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

1. User visits Emergent Admin App
   └─→ /auth/login page

2. User clicks "Create Account" / "Register"
   └─→ Redirects to Zitadel registration page

3. User fills registration form in Zitadel
   ├─→ Email, Password, First Name, Last Name
   ├─→ Zitadel validates password complexity
   └─→ Optional: Email verification required

4. Registration complete → Auto-login or redirect to login

5. User authenticates via OIDC
   └─→ Redirected to /auth/callback

6. Admin app fetches user's access tree
   └─→ Server: ensureUserProfile() creates core.user_profiles record

7. SetupGuard detects no organizations
   └─→ Redirects to /setup/organization

8. User creates their Organization
   └─→ POST /organizations → user becomes org_admin

9. SetupGuard detects no projects
   └─→ Redirects to /setup/project

10. User creates their first Project
    └─→ POST /projects → user becomes project_admin

11. Onboarding complete
    └─→ User can access /admin/apps/documents
```

### What Users Get After Self-Registration

| Resource                               | Auto-Created?              | User Action Required?                |
| -------------------------------------- | -------------------------- | ------------------------------------ |
| Zitadel User                           | Yes (by Zitadel)           | User fills registration form         |
| `core.user_profiles` record            | Yes (on first API call)    | None                                 |
| Organization                           | No                         | User creates via /setup/organization |
| `organization_memberships` (org_admin) | Yes (when org created)     | None                                 |
| Project                                | No                         | User creates via /setup/project      |
| `project_memberships` (project_admin)  | Yes (when project created) | None                                 |
| Zitadel Project Role Grant             | **TBD**                    | See below                            |

### Open Question: Zitadel Project Role Grants

Currently, the invitation flow grants Zitadel project roles via `grantProjectRole()`. For self-registered users:

**Option A:** Skip Zitadel role grants entirely

- Emergent database is source of truth for roles
- Simpler implementation
- Zitadel used only for authentication, not authorization

**Option B:** Grant default role on organization/project creation

- Call `grantProjectRole()` when user creates org/project
- Maintains parity with invitation flow
- Zitadel can be used for role-based access in other systems

**Recommendation:** Option A for MVP, since:

- Authorization is already database-driven (`organization_memberships`, `project_memberships`)
- `ScopesGuard` resolves permissions from database, not Zitadel claims
- Reduces coupling with Zitadel Management API

---

## Implementation Plan

### Phase 1: Enable Zitadel Self-Registration (Configuration Only)

**Effort:** 1-2 hours  
**Risk:** Low

1. Access Zitadel Console at `{ZITADEL_DOMAIN}/ui/console`
2. Navigate to Default Settings → Login Behavior and Access
3. Enable:
   - ✅ "Register allowed"
   - ✅ "Username Password allowed" (already enabled)
4. Configure Password Complexity (if not already set)
5. Ensure SMTP is configured for verification emails
6. Test: Visit Zitadel login page, verify "Register" option appears

### Phase 2: Update Admin App Login Page

**Effort:** 2-4 hours  
**Risk:** Low

1. Add "Register" link to `/auth/login` page
2. Two options for the register link:
   - **Option A:** Link directly to Zitadel registration URL
   - **Option B:** Navigate to placeholder `/auth/register` with redirect

**Implementation (Option A - Recommended):**

```tsx
// apps/admin/src/pages/auth/login/index.tsx
const LoginPage = () => {
  const { beginLogin } = useAuth();

  // Construct Zitadel registration URL
  const registrationUrl = `${
    import.meta.env.VITE_ZITADEL_ISSUER
  }/ui/login/register`;

  return (
    <div>
      <button onClick={() => beginLogin()}>Login</button>
      <a href={registrationUrl}>Create Account</a>
    </div>
  );
};
```

### Phase 3: Verify Existing Setup Flow Works

**Effort:** 1-2 hours  
**Risk:** Low

1. Create test user via Zitadel registration
2. Log in to Admin app
3. Verify:
   - User profile created in `core.user_profiles`
   - Redirected to `/setup/organization`
   - Can create organization (becomes org_admin)
   - Redirected to `/setup/project`
   - Can create project (becomes project_admin)
   - Can access main Admin features

### Phase 4: Optional Enhancements

**Effort:** Variable  
**Risk:** Medium

1. **Branded Registration:** Customize Zitadel login UI branding
2. **Email Verification:** Require email verification before access
3. **Welcome Email:** Send custom welcome email on first login
4. **Usage Analytics:** Track self-registration conversion

---

## Zitadel Configuration Details

### Required Settings

| Setting                   | Location              | Value      | Notes                                   |
| ------------------------- | --------------------- | ---------- | --------------------------------------- |
| Register allowed          | Login Behavior        | ✅ Enabled | Core setting for self-registration      |
| Username Password allowed | Login Behavior        | ✅ Enabled | Should already be enabled               |
| Password Complexity       | Password Complexity   | Configure  | Min length, uppercase, numbers, symbols |
| SMTP Provider             | Notification Settings | Configure  | Required for verification emails        |

### Optional Settings

| Setting              | Location        | Value     | Notes                                   |
| -------------------- | --------------- | --------- | --------------------------------------- |
| Email Verification   | Domain Settings | Optional  | Require email verification before login |
| External Login Check | Login Lifetimes | Configure | If using external IDPs                  |
| MFA                  | Login Behavior  | Optional  | Require MFA after registration          |
| Domain discovery     | Login Behavior  | Optional  | For federated login scenarios           |

### Accessing Zitadel Console

For local development:

```
URL: http://localhost:8085/ui/console
```

For production:

```
URL: https://{ZITADEL_DOMAIN}/ui/console
```

Login as instance admin (IAM_OWNER role) to modify default settings.

---

## Security Considerations

| Risk               | Mitigation                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Spam registrations | Enable CAPTCHA in Zitadel (if available), rate limiting, email verification |
| Weak passwords     | Configure Password Complexity policy                                        |
| Unverified emails  | Enable email verification requirement                                       |
| Abuse of resources | Consider quotas on organizations/projects per user                          |
| Data isolation     | Existing RLS policies ensure tenant isolation                               |

---

## Testing Plan

### Manual Testing Checklist

- [ ] Register new user via Zitadel
- [ ] Verify email (if enabled)
- [ ] Login to Admin app
- [ ] Confirm user profile created in database
- [ ] Create organization via setup flow
- [ ] Verify org_admin membership created
- [ ] Create project via setup flow
- [ ] Verify project_admin membership created
- [ ] Access Documents, Chat, Settings features
- [ ] Logout and re-login
- [ ] Verify access persists

### E2E Tests to Add

```typescript
// apps/admin/e2e/auth/self-registration.spec.ts

describe('Self-Registration Flow', () => {
  it('should allow user to register and complete setup', async () => {
    // 1. Navigate to registration
    // 2. Fill registration form in Zitadel
    // 3. Login with new credentials
    // 4. Complete organization setup
    // 5. Complete project setup
    // 6. Verify access to main features
  });
});
```

---

## Database Changes

**None required.** The existing schema supports self-registration:

- `core.user_profiles`: Auto-created via `ensureUserProfile()`
- `kb.organizations`: Created via existing `/organizations` API
- `kb.organization_memberships`: Auto-created when org is created
- `kb.projects`: Created via existing `/projects` API
- `kb.project_memberships`: Auto-created when project is created

---

## API Changes

**None required for MVP.** Existing endpoints support the flow:

- `GET /user/orgs-and-projects` - Used by SetupGuard
- `POST /organizations` - Creates org with creator as org_admin
- `POST /projects` - Creates project with creator as project_admin

---

## Future Enhancements

1. **Custom Registration Form:** If more profile fields needed
2. **Organization Templates:** Pre-configured org settings
3. **Project Templates:** Pre-configured project settings (extraction config, etc.)
4. **Onboarding Wizard:** Multi-step guided setup
5. **Team Invitations:** Allow new org admins to invite team members
6. **Social Login:** Google, GitHub, Microsoft registration
7. **SSO/SAML:** Enterprise identity provider integration

---

## Summary

Self-registration for Emergent can be enabled with minimal code changes by:

1. **Enabling "Register allowed" in Zitadel** (configuration only)
2. **Adding a "Register" link to the login page** (simple UI change)
3. **Leveraging existing setup flow** for org/project creation

This approach:

- Minimizes development effort
- Leverages Zitadel's built-in registration, password policies, and email verification
- Uses existing auto-provisioning (`ensureUserProfile`)
- Uses existing setup pages (`/setup/organization`, `/setup/project`)
- Maintains consistency with the authorization model

The recommended MVP implementation can be completed in **4-8 hours** of work.
