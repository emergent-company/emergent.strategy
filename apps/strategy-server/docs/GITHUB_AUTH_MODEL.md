# GitHub Auth Model — Strategy Server

This document is the canonical reference for how GitHub authentication works
in strategy-server. Read this before touching anything related to GitHub sync,
the connect flow, or production deployment.

---

## The Fundamental Rule

**Accessing private repos always requires a one-time admin action per org.**

There is no way to read or write private repos in a GitHub org without either:
- The GitHub App being installed on that org (by an org admin), OR
- The OAuth App being approved in that org's third-party access policy (by an org admin)

This is a GitHub security boundary. No amount of OAuth scopes or token types
bypasses it for private repos. Public repos work without any admin action.

---

## Two Separate GitHub Credentials

Strategy-server uses two different GitHub auth mechanisms that serve different
purposes.

### 1. GitHub App (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY_PATH`)

**What it is:** A server-level GitHub App. Authenticates using a JWT signed
with the App's private key, exchanged for short-lived installation tokens.

**What it can do:**
- Read and write repos in orgs where the App is installed
- Background operations without a user present

**Requires:** App installed on the target org by an org admin.

**Used for:**
- AIM auto-push (background PR creation after AIM cycles)
- `sync_to_github` MCP tool
- `import_from_github` MCP tool

**Required env vars:**
```
GITHUB_APP_ID=3879897
GITHUB_APP_PRIVATE_KEY_PATH=private-key.pem
GITHUB_APP_SLUG=emergent-strategy-server   # for the install link in UI
```

---

### 2. Classic GitHub OAuth App (`GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`)

**What it is:** A standard GitHub OAuth 2.0 App (NOT the GitHub App's own OAuth).
Must be a separate *classic* OAuth App. Produces `gho_` tokens.

**Why not the GitHub App's own OAuth (`ghu_` tokens)?**
GitHub App user tokens (`ghu_`) only see repos the GitHub App installation
has been explicitly granted access to. Even org owners get 404 on private
repos when using `ghu_` tokens if the App is not installed on that org.
Classic OAuth App tokens (`gho_`) with `repo` scope bypass this — they see
repos based on the user's personal access, not App installation grants.

**What it can do:**
- Read repos in orgs that have approved this OAuth App
- Read public repos in any org without approval
- Write to repos the user has push access to (if org has approved the OAuth App)

**Requires:** Org admin approves the OAuth App in the org's third-party
access policy for private repos. Public repos work without approval.

**Used for:**
- User connect flow (`/github/connect`) — repo discovery and import

**Required env vars:**
```
GITHUB_OAUTH_CLIENT_ID=<classic OAuth App client ID — starts with Ov23li...>
GITHUB_OAUTH_CLIENT_SECRET=<secret>
GITHUB_OAUTH_STATE_SECRET=<32-byte-hex>
SERVER_URL=https://strategy.emergent.ai
```

**Scopes requested:** `repo,read:user,read:org`

**Callback URL to register in GitHub:** `{SERVER_URL}/github/connect/callback`

---

## What Users Experience

### Public repos
Work immediately. No admin action needed.

### Private repos in an org
The user sees the repos listed ONLY IF one of these is true:
- The GitHub App is installed on that org, OR
- The OAuth App has been approved by an org admin

Until one of those is done, private org repos are invisible to the connect
flow — GitHub returns 404 as if they don't exist.

### The admin action required

**Option A — Install the GitHub App (recommended):**
Gives both read AND background write-back (AIM auto-push).
URL: `https://github.com/apps/{GITHUB_APP_SLUG}/installations/new`

**Option B — Approve the OAuth App:**
Gives read and manual push via the web UI. No background write-back.
URL: `https://github.com/organizations/{org}/settings/oauth_application_policy`

---

## Auth Decision Matrix

| Operation | Auth used | Admin action required |
|-----------|-----------|----------------------|
| Connect GitHub account | OAuth dance (browser) | None |
| Browse public repos | OAuth token (`gho_`) | None |
| Browse private org repos | OAuth token (`gho_`) | Org must approve OAuth App |
| Import from private org repo | OAuth token (`gho_`) | Org must approve OAuth App |
| Push to private org repo (manual) | OAuth token (`gho_`) | Org must approve OAuth App |
| AIM auto-push (background) | App installation token | Org must install GitHub App |
| `import_from_github` MCP tool | App installation token | Org must install GitHub App |
| `sync_to_github` MCP tool | App installation token | Org must install GitHub App |

---

## Production Deployment Checklist

### GitHub App (for background sync + MCP tools)
- [ ] GitHub App created at github.com/settings/apps
- [ ] `GITHUB_APP_ID` set
- [ ] Private key stored securely (secret manager — never commit to repo)
  - Cloud Run: inject as `GITHUB_APP_PRIVATE_KEY` env var (inline PEM)
  - Kubernetes: `kubectl create secret generic github-app-key`
- [ ] `GITHUB_APP_SLUG` set (for install link in UI)
- [ ] App permissions: `Contents: Read & write`, `Pull requests: Read & write`
- [ ] App installed on target orgs by org admins

### Classic OAuth App (for user connect flow)
- [ ] Separate classic OAuth App created at github.com/settings/developers
- [ ] `GITHUB_OAUTH_CLIENT_ID` set (starts with `Ov23li...`)
- [ ] `GITHUB_OAUTH_CLIENT_SECRET` stored securely
- [ ] `GITHUB_OAUTH_STATE_SECRET` set: `openssl rand -hex 32`
- [ ] `SERVER_URL` set to public base URL
- [ ] Callback URL registered: `{SERVER_URL}/github/connect/callback`
- [ ] OAuth App approved by org admins for orgs with private repos

### Environment variables (production)
```bash
PORT=8090
SERVER_URL=https://strategy.emergent.ai
AUTH_ENABLED=true

# Database
PGHOST=...  PGPORT=5432  PGUSER=strategy
PGPASSWORD=<secret>  PGDATABASE=strategy  PGSSLMODE=require

# GitHub App (background sync + MCP)
GITHUB_APP_ID=3879897
GITHUB_APP_PRIVATE_KEY=<inline PEM content>
GITHUB_APP_SLUG=emergent-strategy-server

# GitHub OAuth App (user connect flow)
GITHUB_OAUTH_CLIENT_ID=<Ov23li...>
GITHUB_OAUTH_CLIENT_SECRET=<secret>
GITHUB_OAUTH_STATE_SECRET=<32-byte-hex>
```

---

## Common Mistakes

**Using the GitHub App's own OAuth instead of a classic OAuth App:**
GitHub App user tokens (`ghu_`) only see repos the App installation can access.
Use a separate classic OAuth App to get `gho_` tokens that see all repos the
user has personal access to (subject to org approval).

**Expecting private repos to appear without an admin action:**
Private org repos require either the GitHub App to be installed OR the OAuth App
to be approved. There is no workaround. This is GitHub's security model.

**Storing the private key in the repo:**
`private-key.pem` is gitignored. Use a secret manager in production.

**`SERVER_URL` mismatch with registered callback:**
`{SERVER_URL}/github/connect/callback` must exactly match what's registered in
the OAuth App settings on GitHub.
