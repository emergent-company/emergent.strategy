# Design: GitHub User OAuth

## Key Decision: OAuth App, Not GitHub App User Auth

GitHub offers two ways to get a user token:

1. **GitHub App user auth** (`/login/oauth/authorize?client_id=<App client ID>`) —
   produces `ghu_...` tokens tied to the App. Tokens expire after 8 hours and
   require refresh tokens. Requires the App to have "User authorization callback URL" set.

2. **OAuth App** (`/login/oauth/authorize?client_id=<OAuth App client ID>`) —
   produces classic `gho_...` tokens. These do NOT expire (until the user revokes
   them or the app is uninstalled). Simpler to manage.

**We use option 2 (OAuth App)** for v1. No token refresh logic needed.
The env vars are `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`.

## Scopes

`read:user` — needed to fetch `GET /user` (user ID, login).
No `repo` scope needed — we don't enumerate repos via the user token.
We use it only for `GET /user/installations`, which requires no extra scope
beyond having the App installed.

So the user sees a minimal consent screen: "Read your GitHub profile."

## CSRF: State Cookie

State is a 32-byte random hex string, stored in a short-lived signed cookie
(`github_oauth_state`, `MaxAge=600`). On callback, we verify the state param
matches the cookie. The cookie is `HttpOnly`, `SameSite=Lax`.

Signing: HMAC-SHA256 using a secret derived from `GITHUB_OAUTH_STATE_SECRET`
(or falls back to `EPF_SESSION_SECRET` if that's set, to avoid adding a new
required env var).

## Token Storage

`users.github_access_token TEXT` — nullable, set after OAuth dance.

Not encrypted at rest in v1. The token has narrow scope (`read:user`) and
grants no write access. Acceptable risk for a controlled deployment. Encryption
can be added in a follow-up without schema changes (just encrypt the value
before storing).

## Flow Detail

```
GET /github/connect
  ↓
loadUserGithubToken(userID) → token from users table
  if token present:
    call ListUserInstallations(token) → populate picker
    render connect page with installations
  else:
    render connect page in "needs auth" state
    show "Connect GitHub" button → links to /github/connect/authorize

GET /github/connect/authorize
  ↓
generate state (32 random bytes, hex-encoded)
set cookie github_oauth_state=HMAC(state)
redirect to https://github.com/login/oauth/authorize?client_id=...&state=...&scope=read:user

GET /github/connect/callback?code=XXX&state=YYY
  ↓
read + verify state cookie → reject if mismatch
POST https://github.com/login/oauth/access_token  (exchange code)
GET https://api.github.com/user  (fetch github user ID + login)
UPDATE users SET github_access_token=... WHERE id=...
clear state cookie
redirect to /github/connect

GET /github/connect  (now has token)
  ↓
GET /user/installations  (with ghu_... token)
render picker with user's installations
```

## New Client Method: ListUserInstallations

Added to `internal/github/client.go`:

```go
func (c *Client) ListUserInstallations(ctx context.Context, userToken string) ([]Installation, error)
```

Calls `GET /user/installations` with the user's OAuth token (not the App JWT).
Returns the same `Installation` struct as `ListInstallations`.

The `RepoReaderAdapter` gets a new method:

```go
func (a *RepoReaderAdapter) ListUserInstallations(ctx context.Context, userToken string) ([]InstallationInfo, error)
```

The connect page handler calls this instead of `ListInstallations` when a user
token is available.

## No Changes to Sync Domain

The sync service (`domain/sync/`) is NOT touched. It continues to use
App installation tokens (server-level). User OAuth tokens are purely a
web UI concern — the handler layer reads the user's token from the DB,
calls the GitHub client directly, and never passes user tokens into the
sync domain.

## Config

Two new env vars:
- `GITHUB_OAUTH_CLIENT_ID` (alias: `EPF_OAUTH_CLIENT_ID` for backward compat)
- `GITHUB_OAUTH_CLIENT_SECRET` (alias: `EPF_OAUTH_CLIENT_SECRET`)
- `GITHUB_OAUTH_STATE_SECRET` — HMAC key for state cookie signing (falls back
  to `EPF_SESSION_SECRET` if set)

The existing `GithubClientID` and `GithubClientSecret` fields in config.go
already bind to `EPF_OAUTH_CLIENT_ID` / `EPF_OAUTH_CLIENT_SECRET`. We add
new primary env var names and keep the old ones as fallback.

## Redirect URI Registration

The GitHub OAuth App must have this callback URL registered:
- Development: `http://localhost:8090/github/connect/callback`
- Production: `https://strategy.emergent.ai/github/connect/callback`

## Token Revocation

When a user disconnects their GitHub account (future feature), we:
1. `DELETE /applications/{client_id}/token` (revoke at GitHub)
2. `UPDATE users SET github_access_token = NULL WHERE id = ?`

Not in scope for this change.
