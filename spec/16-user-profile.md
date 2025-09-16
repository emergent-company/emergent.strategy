# User Profile & Preferences — Feature Specification

Last updated: 2025-09-15  
Owner: Identity / Accounts  
Status: Draft

## Summary
Introduce a first‑class User Profile subsystem layered on top of the existing OIDC (Zitadel) identity. The IdP supplies the canonical authentication subject (`sub`) and primary email. Our system stores *mutable, user‑managed* profile attributes (name fields, optional phone, alternative verified emails, avatar) plus (future) notification preferences and external service connections (e.g., Google Drive). All write operations are strictly self‑service (user can only mutate their own profile) unless an Admin capability is explicitly added later.

## Goals
- Persist user‑editable profile attributes separate from IdP (avoids drift & rate limits).  
- Support multiple alternative (verified) email addresses for notifications & routing (non‑primary).  
- Provide secure avatar upload + processing flow (size + type validated).  
- Expose typed REST (and OpenAPI) endpoints for CRUD / verification flows.  
- Prepare extendable schema for notification preferences & external connections (OAuth).  
- Enforce strong validation + audit trails (timestamps, verification events).  

## Non‑Goals (v1)
- Full contact directory / user search.  
- Role / authorization management (handled separately).  
- Phone number verification (placeholder; may be added).  
- Rich profile bios, social links, address details.  
- Bulk admin update tooling.  

## Terminology
| Term | Meaning |
|------|---------|
| Subject / `subject_id` | Stable user identifier from IdP (`sub`). |
| Primary Email | Email asserted by IdP (immutable here; drift handled by periodic sync). |
| Alternative Email | Additional user‑added email requiring verification. |
| Avatar Object Key | Internal storage key (NOT public URL). |
| Notification Preference | (Future) Channel/category switch set per user. |
| External Connection | OAuth / API credential binding (e.g., Google Drive). |

## Data Model (Relational Draft)
Schema namespace suggestion: `core` (avoid coupling with `kb`).

```sql
CREATE TABLE core.user_profiles (
	subject_id UUID PRIMARY KEY,                 -- same type used for auth mapping
	first_name TEXT,                             -- nullable; if absent fall back to IdP claim
	last_name  TEXT,                             -- nullable
	phone_e164 TEXT,                             -- nullable; MUST match ^\+[1-9]\d{1,14}$ if not null
	avatar_object_key TEXT,                      -- nullable; original upload key (immutable reference)
	display_name TEXT,                           -- optional user override; else derived (first + last or primary email local-part)
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alternative (non-primary) emails
CREATE TYPE core.email_status AS ENUM ('pending', 'verified', 'disabled');
CREATE TABLE core.user_emails (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
	email CITEXT NOT NULL,                        -- lower-cased unique constraint below
	status core.email_status NOT NULL DEFAULT 'pending',
	verification_token_hash TEXT,                 -- hashed (e.g., SHA256) secret token (null after verify)
	last_verification_sent_at TIMESTAMPTZ,
	verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE(subject_id, email),
	UNIQUE(email)                                 -- optional; decide if alternative emails may belong to ≥1 user
);

-- Future: Notification preferences (sparse, categorical & channel toggles)
CREATE TYPE core.channel AS ENUM ('email','sms','in_app');
CREATE TABLE core.user_notification_preferences (
	subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
	category TEXT NOT NULL,            -- e.g. 'system.alerts', 'digests.daily'
	channel core.channel NOT NULL,
	enabled BOOLEAN NOT NULL DEFAULT true,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY(subject_id, category, channel)
);

-- Future: External service connections (OAuth)
CREATE TYPE core.connection_status AS ENUM ('active','revoked','expired','error');
CREATE TABLE core.user_connections (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
	provider TEXT NOT NULL,                        -- e.g. 'google_drive'
	provider_user_id TEXT NOT NULL,                -- remote account id/email
	scopes TEXT[] NOT NULL,
	status core.connection_status NOT NULL DEFAULT 'active',
	access_token_encrypted TEXT,                   -- short-lived (optional store)
	refresh_token_encrypted TEXT,                  -- required for refresh
	expires_at TIMESTAMPTZ,
	last_sync_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE(subject_id, provider)
);
```

### Derived / Computed Fields
- `display_name`: precedence = explicit override > `first_name + ' ' + last_name` (trim) > IdP `given_name` + `family_name` claims > primary email local part.  
- Primary email is *not duplicated* in `user_emails`; alternative set excludes it.

## TypeScript Interfaces (Frontend & OpenAPI Alignment)
```ts
export interface UserProfile {
	subjectId: string;          // UUID
	primaryEmail: string;       // from IdP (read-only)
	firstName?: string | null;
	lastName?: string | null;
	displayName: string;        // resolved (never empty)
	phoneE164?: string | null;  // +E.164 or null
	avatarUrl?: string | null;  // resolved (signed/CDN) URL, not raw object key
	updatedAt: string;          // ISO
	createdAt: string;          // ISO
	alternativeEmails: AlternativeEmail[]; // convenience bundling
}

export type EmailStatus = 'pending' | 'verified' | 'disabled';
export interface AlternativeEmail {
	id: string;         // UUID
	email: string;
	status: EmailStatus;
	createdAt: string;
	updatedAt: string;
	verifiedAt?: string | null;
}

// Future (notification prefs)
export interface NotificationPreference {
	category: string;   // dot namespaced
	channel: 'email' | 'sms' | 'in_app';
	enabled: boolean;
	updatedAt: string;
}

export interface ExternalConnection {
	id: string;
	provider: string;               // 'google_drive'
	status: 'active' | 'revoked' | 'expired' | 'error';
	scopes: string[];
	expiresAt?: string | null;
	lastSyncAt?: string | null;
	createdAt: string;
	updatedAt: string;
}
```

## Validation Rules
| Field | Constraint |
|-------|------------|
| firstName / lastName | 1–100 chars; Unicode letters, spaces, hyphen, apostrophe. Reject leading/trailing spaces (trim). |
| phoneE164 | Regex: `^\+[1-9]\d{1,14}$` (E.164). Optional. |
| alternative email | RFC 5322 subset; lowercase; max length 254; cannot match primary email. Max 5 per user (configurable). |
| avatar | MIME: image/png, image/jpeg, image/webp. Max size 5 MB. Min dimensions 64×64. Optional square crop accepted. |
| displayName override | 1–100 chars (strip control chars). |

Conflict Handling: adding an alternative email already in `pending` state for same user returns 200 with existing resource (idempotent); adding one belonging to another user returns 409 `conflict`.

## API Contract (Draft)
All endpoints require `Authorization: Bearer <JWT>`; act on *current user* unless explicitly admin.

### GET /users/me/profile
Returns `UserProfile` (with `alternativeEmails`).

### PATCH /users/me/profile
Body (partial): `{ firstName?, lastName?, phoneE164?, displayName? }`  
Validation errors -> 422 `validation-failed` with details.  
Phone removal: send `phoneE164: null`.

### GET /users/me/emails
Returns: `{ emails: AlternativeEmail[] }` (excludes primary).

### POST /users/me/emails
Body: `{ email: string }`  
Creates pending alternative email, sends verification email.  
Response 201: `{ email: AlternativeEmail }` (status `pending`).  
Rate limit: max 3 verification sends / 10 minutes per user.

### POST /users/me/emails/:id/resend
Resends verification if still `pending` (rate limits). 200: `{ ok: true }`.

### POST /users/emails/verify (public, no auth)
Body: `{ token: string }`  
On success sets status `verified`, clears token hash.  
Redirect alternative (GET + query) may be added for email links.

### DELETE /users/me/emails/:id
Soft-delete (`status = disabled`) unless already `disabled`. 200 `{ ok: true }`.

### Avatar Upload Options
Two phased approach (preferred for CDN/object store):
1. `POST /users/me/avatar/upload-init` → `{ uploadUrl, objectKey, maxBytes, expiresAt }` (signed PUT).  
2. Client PUT binary to `uploadUrl`.  
3. `POST /users/me/avatar/commit` `{ objectKey, crop?: { x:number;y:number;w:number;h:number } }` → 200 returns `{ avatarUrl }`.  
Validation: server inspects object (HEAD) verifying size, content-type. Generates derived sizes (e.g., 64, 128, 256) asynchronously.  

Simpler fallback (MVP): `PUT /users/me/avatar` (multipart form-data `file`) → 200 `{ avatarUrl }`.

### DELETE /users/me/avatar
Removes avatar (sets `avatar_object_key = NULL`). 200 `{ ok: true }`.

### Future (Notification Preferences)
`GET /users/me/notifications/preferences` → `{ preferences: NotificationPreference[] }` (omits defaults not explicitly stored).  
`PUT /users/me/notifications/preferences` → full replace list (validate uniqueness).  
Server merges with defaults at read time; absent record == default enabled.

### Future (External Connections)
OAuth initiation: `POST /users/me/connections/:provider/init` → `{ authUrl }`.  
Callback (public) handles code exchange, persists connection, returns 302 to frontend success route.  
List: `GET /users/me/connections` → `{ connections: ExternalConnection[] }`.  
Disconnect: `DELETE /users/me/connections/:id` (marks `status = revoked`, scrubs tokens).  
Refresh (internal job) rotates tokens prior to `expires_at`.

### Error Envelope
Consistent with global spec (see AI Chat spec):
```
{
	"error": { "code":"validation-failed", "message":"Invalid phone", "details": { "phoneE164":"invalid-format" } }
}
```

### OpenAPI Schema Components (Additions)
- `UserProfile`, `AlternativeEmail`, `NotificationPreference`, `ExternalConnection`, `EmailStatus` enum.  
- Avatar upload endpoints documented with `multipart/form-data` (fallback) and JSON for init/commit.

## Security & Privacy
- Authorization: Only owner can mutate own profile / emails / avatar.  
- Alternative email verification tokens hashed at rest; token TTL (e.g., 24h).  
- Enforce rate limiting on email operations to mitigate abuse.  
- Avatar scanning (future) for malware/NSFW (out of scope v1).  
- No PII replication beyond required attributes; phone optional & removable.  
- External connection tokens encrypted (KMS envelope) & least-scope; access tokens not logged.  

## Caching & Performance
- Profile reads are frequent: enable 60s in-memory cache keyed by `subject_id` (invalidate on update).  
- Support conditional GET with `ETag` (hash of updated_at).  
- Alternative emails list small; retrieve with profile (single JOIN) for UI simplicity.  

## Frontend Integration (Admin App)
Proposed route: `/admin/settings/profile`  
File: `apps/admin/src/pages/admin/settings/ProfilePage.tsx`  
Add route registration per router guidelines.  
UI Components (daisyUI only):
| Element | Component Classes |
|---------|-------------------|
| Name fields | `input input-md` |
| Phone | `input input-md` (helper text for E.164) |
| Alternative emails list | `table table-sm` or `list` + `badge` for status |
| Add email | `form` + `input` + `btn btn-primary btn-sm` |
| Resend / Delete actions | `btn btn-ghost btn-xs` with icons (`lucide--mail`, `lucide--repeat`, `lucide--trash`) |
| Avatar preview | `avatar mask-squircle w-24 h-24` |
| Upload button | `btn btn-outline btn-sm` |
| Save profile | `btn btn-primary` (disabled while untouched / invalid) |
| Notification prefs (future) | `checkbox` list per category/channel |
| External connections (future) | `card card-border` with provider icon + status `badge` |

Accessibility: all inputs labeled (`label` + `aria-describedby`). Avatar upload announces status updates.

## Lifecycle Flows
### Alternative Email Verification
1. User submits new email → `pending`, token generated & hashed.  
2. Email delivered: link `GET /verify-email?token=...` (frontend) or direct POST route.  
3. Client posts token; server: validate token hash, mark `verified`, null token, set `verified_at`.  
4. Duplicate verify attempts after success → 200 idempotent with current state.  
5. Expired token → 410 `gone` (or 422) with hint to resend.

### Avatar Upload (Init/Commit)
1. User clicks Upload → init endpoint returns signed URL & key.  
2. Client PUTs image; shows progress.  
3. Commit with optional crop; server validates object; sets `avatar_object_key`; publishes derived sizes (async).  
4. `GET /users/me/profile` returns resolved CDN URL(s).  
5. Delete resets to placeholder avatar (client falls back to initials).  

## Edge Cases & Error Handling
| Case | Behavior |
|------|----------|
| Add email exceeding limit | 422 `validation-failed` (code: `alt-emails-limit`) |
| Verify with invalid token | 404 `not-found` |
| Resend too frequently | 429 `rate-limited` |
| Delete verified email (only alt) | Allowed → status `disabled`; historical references keep ID |
| Re-adding previously disabled email | Reactivates existing row (status -> `pending`, new token) |
| Avatar too large | 413 `payload-too-large` (or 422 with code `avatar-size`) |
| Avatar wrong MIME | 415 `unsupported-media-type` |
| Phone invalid | 422 with field detail |

## Auditing / Observability
Emit structured events (optional):
```json
{ "event":"user.profile.updated","subjectId":"...","fields":["first_name","phone_e164"],"ts":"..." }
{ "event":"user.email.added","emailId":"...","subjectId":"..." }
{ "event":"user.email.verified","emailId":"...","subjectId":"...","latencyMs":12345 }
{ "event":"user.avatar.updated","subjectId":"...","objectKey":"..." }
```

Metrics: counts of pending verifications, verification success latency histogram, avatar upload failures.

## Acceptance Criteria (v1)
1. User can view profile with derived `displayName` and primary email.  
2. User can update first/last name, phone, display name; updates reflected on refresh.  
3. Adding alternative email returns `pending` and sends verification (mock in dev).  
4. Verifying email transitions status to `verified`; idempotent repeat verify.  
5. Resend enforces rate limits and updates `last_verification_sent_at`.  
6. Avatar upload (multipart MVP) stores & returns new `avatarUrl`; invalid MIME rejected.  
7. Deleting avatar reverts to placeholder (client fallback).  
8. All mutation endpoints reject unauthorized subject modifications (cannot target others).  
9. OpenAPI spec includes all profile schemas & endpoints; `GET /openapi/openapi.yaml` lists them.  
10. Frontend page `ProfilePage.tsx` uses only Tailwind+daisyUI utilities (no custom CSS).  

## Future Extensions (Outline)
| Feature | Notes |
|---------|-------|
| Notification categories taxonomy | Provide centrally (server constant) to UI for toggle rendering. |
| Digest scheduling | Add `frequency` field (`immediate`, `daily`, `weekly`). |
| Phone verification | Add `phone_verification_status` + token table. |
| Webhooks per user | External callback URLs with HMAC signing. |
| External provider scopes upgrade | UI flow to request incremental OAuth scopes when needed. |

## Implementation Order (Recommended)
1. DB migration: `user_profiles`, `user_emails` (exclude future tables).  
2. NestJS DTOs + controller: profile + emails (add, list, verify, delete).  
3. Multipart avatar endpoint (defer presigned variant).  
4. OpenAPI update & tests (unit for validation, e2e for flows).  
5. Admin UI page + hooks (`useUserProfile`).  
6. Rate limiting + email service integration.  
7. (Later) notification prefs tables + endpoints.  
8. (Later) external connections with OAuth provider scaffolding.  

## Open Questions
1. Should alternative emails be globally unique or only per user? (Current: globally unique.)  
2. Do we sync IdP name changes back into empty local fields (one-way refresh job)?  
3. Avatar storage backend (S3 compatible vs local) & CDN strategy?  
4. Are admins allowed to impersonate profile edits for support?  
5. Phone verification priority & provider (Twilio, etc.)?  
6. Need for soft deletion vs hard deletion of disabled emails?  

## Rationale & Tradeoffs
- Separate profile storage keeps minimal local PII while allowing user personalization not guaranteed by IdP.  
- Two-step avatar upload defers until volume justifies complexity; MVP keeps velocity high.  
- Alternative email verification tokens hashed to mitigate token database leakage risk.  
- Notification & external connections schema stubbed now to avoid backward-incompatible migrations later.

---
End of specification.

