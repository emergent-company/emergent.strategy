# 15. Passkey (WebAuthn) Authentication Specification

Status: Draft  
Owner: Auth / Platform  
Decision: Adopt **custom embedded** Passkey flow (not solely hosted ZITADEL screen) while still leveraging ZITADEL as the authoritative IdP + token issuer.

---

## 1. Goals

Provide a seamless, phishing‑resistant, passwordless authentication user experience using Passkeys (WebAuthn) integrated with ZITADEL, while:

* Reusing existing OIDC / token handling (`AuthProvider`, `oidc.ts`).
* Avoiding local storage of credential private key material (handled by platform authenticators + ZITADEL).
* Supporting both registration (bootstrap) and subsequent sign‑in with minimal friction.
* Maintaining graceful fallback to existing OIDC redirect or (dev) credentials mode if the platform does not support WebAuthn.

## 2. Non‑Goals

* Full self‑hosted WebAuthn credential lifecycle management (delegated to ZITADEL).
* BYO attestation trust management beyond defaults (we will accept platform attestation policy configured in ZITADEL).
* Implementing legacy password MFA; Passkeys supersede password as primary factor.

## 3. Terminology

| Term | Meaning |
| ---- | ------- |
| Passkey | User‑friendly name for FIDO2 / WebAuthn credential (synchronizable or device‑bound) |
| RP | Relying Party (our web origin + ZITADEL as credential authority) |
| Begin (Start) | Server round‑trip to obtain a WebAuthn **challenge** and options from ZITADEL |
| Finish (Verify) | Submitting the signed assertion / attestation back to ZITADEL to complete auth |

## 4. High‑Level Architecture

```
[Browser SPA]
  | (A) POST /api/auth/passkey/begin-(login|register)
  v
[Express Backend] -- (B) gRPC/REST -> ZITADEL Passwordless Begin API
  | (C) Return publicKey {challenge, rpId, user, allowCredentials,...}
  v
WebAuthn API (navigator.credentials.{create|get})
  | (D) Attestation / Assertion Response
  v
Browser POST /api/auth/passkey/finish-(login|register)
  | (E) Backend -> ZITADEL Passwordless Finish API
  | (F) (If auth code) Exchange -> Token Endpoint (PKCE)
  v
Return { access_token, id_token, expires_in }
  | (G) SPA persists via existing AuthProvider logic
```

## 5. User Flows

### 5.1 Registration (First Passkey)
1. User opens `/auth/login` and selects “Create Passkey”.
2. SPA calls `POST /api/auth/passkey/begin-register` (optionally with `login_hint` email / username).
3. Backend obtains WebAuthn creation options from ZITADEL (Begin Register) and stores a short‑lived transaction (challenge + transactionID) in an HttpOnly, SameSite=Lax cookie or server memory keyed by a random nonce.
4. SPA calls `navigator.credentials.create({ publicKey })`.
5. SPA POSTs credential result to `/api/auth/passkey/finish-register`.
6. Backend validates via ZITADEL Finish Register API.
7. On success ZITADEL returns an authorization code or direct tokens (depends on chosen flow). If code: backend exchanges with token endpoint (PKCE) and returns tokens to SPA.
8. SPA updates auth state.

### 5.2 Login (Subsequent Sign‑In)
1. User selects “Sign in with Passkey”.
2. SPA `POST /api/auth/passkey/begin-login` (optionally includes `userIdentifier` if we want resident vs discoverable hints).
3. Backend -> ZITADEL Begin Login -> returns assertion request (allowCredentials maybe empty → discoverable credential resident keys). Store challenge binding (cookie / memory).
4. SPA executes `navigator.credentials.get({ publicKey })`.
5. SPA sends result to `/api/auth/passkey/finish-login`.
6. Backend -> ZITADEL Finish Login -> obtains tokens (or code + exchange) → returns JSON to SPA.
7. SPA sets tokens; redirects to originally intended route.

### 5.3 Fallback
If WebAuthn unsupported or user cancels: show existing OIDC redirect button (Google / other IdPs) or dev credentials mode (when enabled).

## 6. Client Components & Modules

| File | Purpose |
| ---- | ------- |
| `apps/admin/src/auth/passkey.ts` | Low‑level helpers (serialization, begin/finish fetch) |
| `apps/admin/src/contexts/auth.tsx` | Extend context with `loginWithPasskey`, `registerPasskey` |
| `apps/admin/src/pages/auth/login/index.tsx` | Add Passkey buttons (conditionally rendered) |
| `apps/admin/src/components/auth/PasskeyButton.tsx` (new) | Encapsulated button UX + loading state |

### 6.1 New Auth Context Methods
```ts
// Pseudocode interface extension
interface AuthContextType {
  // ...existing
  loginWithPasskey: () => Promise<void>;
  registerPasskey: (hintEmail?: string) => Promise<void>;
}
```

Implementation responsibilities:
* Call begin endpoint.
* Perform WebAuthn call.
* Call finish endpoint.
* Normalize token response shape to existing `handleCallback` outcome (can reuse internal state setter).

## 7. Backend Endpoints (Express)

All paths under `/api/auth/passkey/*` and respond with JSON. Backend acts as a thin proxy + state binder.

| Endpoint | Method | Body | Response | Notes |
| -------- | ------ | ---- | -------- | ----- |
| `/api/auth/passkey/begin-register` | POST | `{ email?: string }` | `{ publicKey, txn }` | Returns `PublicKeyCredentialCreationOptions` (binary fields still ArrayBuffer‑like) with base64url encoded buffers. `txn` is an opaque transaction id. |
| `/api/auth/passkey/finish-register` | POST | `{ txn, credential: {...} }` | `{ access_token, id_token?, expires_in }` | Validates + exchanges tokens. |
| `/api/auth/passkey/begin-login` | POST | `{ email?: string }` | `{ publicKey, txn }` | Returns `PublicKeyCredentialRequestOptions`. |
| `/api/auth/passkey/finish-login` | POST | `{ txn, credential: {...} }` | `{ access_token, id_token?, expires_in }` | Completes assertion & returns tokens. |

### 7.1 Challenge / Transaction Binding
* Store mapping: `txn -> { challenge, createdAt, purpose }` (in‑memory map initially; migrate to Redis later for horizontal scale).
* Expire after 2 minutes.
* Validate that returned credential response challenge matches stored challenge before POST to ZITADEL Finish.

### 7.2 Interaction With ZITADEL
ZITADEL offers APIs (documented in their Passwordless / Management / Auth docs) to:
* Begin registration / login (returns challenge + RP params).
* Finish registration / login (validates signature, finalizes user auth flow).

Exact REST / gRPC method names must be confirmed in current ZITADEL version. Insert them into implementation once chosen; placeholders below:

| Phase | Placeholder Call | Expected Output |
| ----- | ---------------- | --------------- |
| Begin Register | `zitadel.passwordless.beginRegistration(userId?, loginHint?)` | Creation options + transaction handle |
| Finish Register | `zitadel.passwordless.finishRegistration(txn, clientDataJSON, attestationObject, ...)` | Auth code or tokens |
| Begin Login | `zitadel.passwordless.beginLogin(loginHint?)` | Request options + transaction handle |
| Finish Login | `zitadel.passwordless.finishLogin(txn, clientDataJSON, authenticatorData, signature, userHandle, ...)` | Auth code or tokens |

If an **authorization code** is returned, backend performs standard token exchange against OIDC token endpoint (`grant_type=authorization_code`, PKCE if required). If **tokens** are returned directly, forward normalized response.

### 7.3 Data Transformations
WebAuthn responses contain ArrayBuffers; must base64url encode before sending to backend and decode again for ZITADEL calls. Standard fields:
* Registration: `clientDataJSON`, `attestationObject`
* Assertion: `clientDataJSON`, `authenticatorData`, `signature`, `userHandle?`

## 8. Token Handling Strategy

SPA expects shape similar to current `TokenResponse`. Backend normalizes all flows to:
```json
{
  "access_token": "...",
  "id_token": "...optional...",
  "expires_in": 3600
}
```
SPA then calls an internal helper to set state (mirroring `handleCallback`). We **do not** expose refresh tokens to the browser initially; if later required, add secure rotation logic.

## 9. Environment & Config

| Variable | Purpose |
| -------- | ------- |
| `ZITADEL_ISSUER` | Base issuer URL (already present as `VITE_ZITADEL_ISSUER` for SPA) |
| `ZITADEL_CLIENT_ID` | OIDC client ID |
| `ZITADEL_PROJECT_ID` | (If needed for management/passwordless APIs) |
| `ZITADEL_SERVICE_KEY` | Service account token / key for backend passwordless API access |
| `PASSKEY_RP_ID` | Relying Party ID (should match domain; often derived from issuer / origin) |
| `PASSKEY_ALLOWED_ORIGINS` | Optional explicit allowlist for origin validation |

Ensure RP ID equals the effective domain (no port, no scheme). For local dev consider using a TLS‑terminated domain like `local.dev.test` mapped in `/etc/hosts` if platform requires consistent RP ID.

## 10. Security Considerations

| Concern | Mitigation |
| ------- | ---------- |
| CSRF / replay on finish endpoints | Bind txn to challenge + HttpOnly cookie / server map; reject mismatched or expired. |
| Origin spoofing | Validate `origin` inside decoded `clientDataJSON` against allowlist. |
| Duplicate credential registration | Rely on ZITADEL to enforce uniqueness; surface error gracefully. |
| Clock skew | Tokens already have expiry; store `expiresAt = now + expires_in - skew`. |
| Brute force / enumeration | Avoid returning whether a user exists in begin endpoints (for login without hint). |
| Downgrade (forcing password) | Only show fallback after explicit user action or feature detection failure. |
| Token leakage | Use `https` only; never log raw tokens. |
| Horizontal scaling | Externalize txn store (Redis) before >1 instance deployment. |

## 11. Error Model (Frontend)

| Code / Condition | UX Message |
| ---------------- | ---------- |
| `NotAllowedError` (user cancels) | "Passkey operation cancelled." |
| `NotSupportedError` | "Passkeys not supported on this device/browser." |
| Backend 400 (expired txn) | "Verification expired, try again." |
| Backend 422 (challenge mismatch) | "Security check failed, retry." |
| Backend 500 | "Unexpected error – please retry." |

## 12. Progressive Enhancement Logic

```ts
const supportsPasskey = typeof window !== 'undefined' &&
  'PublicKeyCredential' in window &&
  typeof (window as any).PublicKeyCredential === 'function';
```
Only render passkey buttons if `supportsPasskey` true.

## 13. Sequence (Assertion / Login) – Text Diagram

```
User -> SPA: Click "Sign in with Passkey"
SPA -> Backend: POST /begin-login
Backend -> ZITADEL: BeginLogin
ZITADEL -> Backend: { challenge, options, txn }
Backend -> SPA: { publicKey, txn }
SPA -> WebAuthn: navigator.credentials.get(publicKey)
WebAuthn -> SPA: assertion (buffers)
SPA -> Backend: POST /finish-login { txn, credential }
Backend -> ZITADEL: FinishLogin
ZITADEL -> Backend: { code | tokens }
Backend -> (if code) Token Endpoint: exchange
Token Endpoint -> Backend: { access_token, id_token, expires_in }
Backend -> SPA: tokens
SPA -> AuthState: store & redirect
```

## 14. Logging & Observability

* Log (INFO) each begin: `passkey.begin { purpose, txn, uaHash }` (hash UA to reduce PII).
* Log (INFO) each finish success: `passkey.finish { purpose, txn, durationMs }`.
* Log (WARN) mismatches / expiry / unsupported errors.
* DO NOT log credential IDs raw; hash with SHA256 first if needed for metrics.

## 15. Metrics (MVP)
* `passkey_begin_total{purpose=login|register}`
* `passkey_finish_success_total{purpose=...}`
* `passkey_finish_error_total{error=...}`
* Median / P95 duration from begin → finish.

## 16. Data Model

No new persistent DB tables required initially (ZITADEL authoritative). Optional future table `user_passkey_meta(user_id, last_used_at, platform_hint)` if we want UI listing.

## 17. Migration / Rollout Plan

| Phase | Actions |
| ----- | ------- |
| 0 | Enable passwordless in ZITADEL; verify hosted flow works (sanity). |
| 1 | Implement backend endpoints with in‑memory txn store; feature flag in SPA (env `VITE_FEATURE_PASSKEY=1`). |
| 2 | Add client buttons + context methods; QA across Chrome / Safari / Firefox. |
| 3 | Add analytics + logging; handle edge errors. |
| 4 | Add Redis txn store (if scaling) + resilience tests. |
| 5 | Optional: Passkey management UI page (list & revoke) once ZITADEL API integrated. |

## 18. Open Questions
1. Will we mandate passkey for all new users or allow alternative sign‑in? (Policy setting needed.)
2. Attestation policy: do we need to verify device type for compliance? (Likely no initially.)
3. Multi‑tenant considerations: do we scope ZITADEL project per tenant or share? (Impacts user discovery + hints.)
4. Refresh token strategy: needed for silent renew or rely on short sessions + re‑assertion?

## 19. Risks & Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Browser quirks (Safari older versions) | Users blocked | Feature detection + fallback OIDC button |
| Transaction store loss (server restart) | Flow failure | Graceful error; user retries begin |
| Incorrect RP ID config | Credential errors | Document RP ID; include automated startup check invoking `navigator.credentials` in dev console |
| Latency from remote ZITADEL region | Slower login | Optional edge caching for begin response (fast TLS) |

## 20. Acceptance Criteria
* A supported browser can register a passkey and immediately use it to sign in without page reloads (aside from WebAuthn native prompts).
* SPA shows meaningful error messages for cancellations and expired challenges.
* Tokens post-login populate existing `AuthProvider` state; protected routes load.
* Fallback OIDC login still works when passkey feature flag off.

## 21. Implementation Tasks (Engineering Checklist)

Backend:
1. Add env vars & validate on startup.
2. Implement in‑memory txn store module (`passkeyTxnStore.ts`).
3. Implement `/api/auth/passkey/*` endpoints.
4. Integrate with ZITADEL passwordless APIs (add client wrapper `zitadelPasswordlessClient.ts`).
5. Normalize token responses; reuse existing `OidcConfig` for exchange.
6. Add structured logs + metrics counters (future Prometheus exporter).

Frontend:
1. Add `auth/passkey.ts` with serialization helpers.
2. Extend `AuthContext` with `loginWithPasskey` & `registerPasskey`.
3. Add buttons + conditional rendering in `pages/auth/login`.
4. Handle error states + toasts.
5. E2E tests (Playwright) covering register + login + cancellation.

QA / Ops:
1. Test across Chrome (Mac/Win), Safari (macOS), iOS Safari, Android Chrome.
2. Verify metrics & logs appear.
3. Chaos: restart backend mid‑flow → user retry works.

## 22. E2E Test Outline (Playwright)
* `passkey-registration.spec.ts` – mocks WebAuthn (use Playwright webauthn API / or skip-ledgermock) to validate UI path.
* `passkey-login.spec.ts` – assertion path.
* `passkey-fallback.spec.ts` – simulate unsupported browser (`delete window.PublicKeyCredential`).

## 23. Future Enhancements
* Passkey management screen (list, revoke) using ZITADEL management API.
* Step‑up authentication (re‑assertion) for privileged actions.
* Silent token renewal strategy (if refresh tokens allowed) or automatic re‑prompt.
* Analytics dashboard showing adoption & success rate.

---

## 24. Appendix – Serialization Helpers (Reference)

```ts
function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function credentialToJSON(cred: PublicKeyCredential): any {
  const json: any = { id: cred.id, type: cred.type }; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (cred.rawId) json.rawId = b64url(cred.rawId);
  const resp: any = (cred as any).response; // eslint-disable-line @typescript-eslint/no-explicit-any
  json.response = {};
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    json.response[k] = v instanceof ArrayBuffer ? b64url(v) : v;
  }
  return json;
}
```

## 25. References
* ZITADEL Docs: Passwordless / Passkeys (consult latest official docs for precise API names)
* WebAuthn Level 3 Spec (W3C): https://www.w3.org/TR/webauthn-3/
* FIDO2 Client to Authenticator Protocol (CTAP2)

---

End of document.
