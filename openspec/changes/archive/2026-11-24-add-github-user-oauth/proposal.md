# Change: GitHub User OAuth — Per-User Repo Access for Connect Flow

## Why

The current connect flow (`add-github-connect-flow`) calls `GET /app/installations`
using the App-level JWT. This returns only installations where an org admin has
explicitly installed the App — not the repos a given user can access across all
their orgs.

In a multi-tenant deployment, this is a hard blocker:

- User A (member of `emergent-company`) visits `/github/connect` and sees no
  installations, because `emergent-company` hasn't installed the App yet.
- The only way to make their repos appear is to manually install the App on
  every org they belong to — which requires org admin access and is a friction
  that kills onboarding.

The correct API is `GET /user/installations`, called with the **user's** GitHub
OAuth token. This returns every installation the user has access to, regardless
of whether the App is installed org-wide or just on specific repos. The user's
token is obtained through a standard GitHub OAuth dance.

## What We're Building

A minimal GitHub OAuth flow wired into the connect page:

1. User visits `/github/connect` — if they have no GitHub token in session,
   show a "Connect your GitHub account" button.
2. Click → redirect to GitHub OAuth authorize URL.
3. GitHub redirects back to `/github/connect/callback` with a `code`.
4. Server exchanges `code` for a `ghu_...` user access token.
5. Token stored server-side against the user (DB column on `users` table).
6. `GET /user/installations` called with the user token — returns orgs the
   user has App access to.
7. User sees their installations in the picker, scans repos, imports.

## Scope

This change is intentionally narrow:

- **GitHub OAuth only** — not 21st identity / Auth0. The user is already
  authenticated to the platform (dev user in dev mode, 21st identity in
  production). GitHub OAuth is a second, separate step to authorize GitHub
  repo access.
- **No session manager complexity** — the user's GitHub token is stored in
  the `users` table (a new nullable `github_access_token` column). No LRU
  cache, no JWT session map. The DB is the session store.
- **Token refresh deferred** — GitHub user tokens (`ghu_...`) from OAuth Apps
  don't expire (unlike GitHub App user tokens from fine-grained Apps). We store
  and reuse the token until the user revokes it.
- **No MCP tools** — the GitHub token is a web UI concern only.
- **No changes to existing sync tools** — `import_from_github`, `sync_to_github`
  etc. continue to use the App installation token (server-level), not user tokens.

## OAuth App vs GitHub App

We need a **GitHub OAuth App** (separate from the GitHub App used for sync).
The OAuth App is what grants the `read:user` scope and `GET /user/installations`
access. The GitHub App is what grants repo read/write access.

Two env vars needed:
- `GITHUB_OAUTH_CLIENT_ID` — OAuth App client ID
- `GITHUB_OAUTH_CLIENT_SECRET` — OAuth App client secret

These already exist in config as `GithubClientID` / `GithubClientSecret`
(kept from the epf-cli era with env vars `EPF_OAUTH_CLIENT_ID` /
`EPF_OAUTH_CLIENT_SECRET`). We'll reuse those fields with new env var names,
and keep the old names as aliases for backward compatibility.

## Database

One new column: `github_access_token TEXT` on the `users` table.
Nullable. Encrypted at rest is deferred — acceptable for v1 given tokens
have a narrow scope (`read:user` + read access to installations).

## CSRF Protection

State parameter: a random 32-byte hex string stored in a short-lived
signed cookie (`github_oauth_state`). Verified on callback. Standard
OAuth CSRF protection.

## User Experience

```
/github/connect (no token)
→ "Connect your GitHub account" button
→ /github/connect/authorize  (sets state cookie, redirects to GitHub)
→ GitHub consent page
→ /github/connect/callback?code=xxx&state=yyy
→ exchange code → store token → redirect to /github/connect
→ /github/connect (with token)
→ installation picker populated via GET /user/installations
```

If the user already has a stored token, skip the OAuth dance entirely.

## What Does NOT Change

- The `add-github-connect-flow` scan logic, EPF detection, and import form
  are all correct and unchanged.
- The sync service (`import_from_github`, `sync_to_github`) is unchanged.
- MCP tools are unchanged.
- Auth middleware is unchanged.
