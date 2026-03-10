## Context

The EPF strategy server's multi-tenant mode currently uses a GitHub OAuth App with `repo` scope. This grants the server a token with full read/write access to every repository the authenticating user can access. Users must trust the server operator not to abuse this access.

GitHub Apps offer a fundamentally different trust model: the **repo owner** installs the App and selects which repos it can access, with permissions declared in the App manifest (e.g., `contents: read`). A single GitHub App can be installed across many orgs and user accounts, making it suitable for multi-tenant SaaS.

### Stakeholders

- **Server operators** — deploy and configure the EPF server
- **Repo owners / org admins** — install the GitHub App and control which repos it can access
- **End users** — authenticate to prove identity, then access EPF instances in repos where the App is installed

## Goals / Non-Goals

### Goals

- Replace the `repo`-scoped OAuth token with installation-scoped tokens that can only access repos where the App is installed
- Support cross-org access from a single server (one App, many installations)
- Maintain the PAT-based escape hatch for users who prefer explicit token management
- Keep the user authentication flow lightweight (GitHub App user access tokens use no OAuth scopes)
- Support both OAuth App and GitHub App during a transition period
- Publish the GitHub App on the GitHub Marketplace

### Non-Goals

- Supporting user-created GitHub Apps (we publish one App; orgs install it)
- Replacing single-tenant mode (GitHub App config for single-tenant remains unchanged)
- Write access to repos (the App manifest requests `contents: read` only)
- Migrating existing sessions (in-memory sessions are lost on restart anyway)

## Decisions

### Decision 1: Two-token architecture (user access token + installation tokens)

**What:** Store a GitHub App user access token (`ghu_` prefix, no OAuth scopes) for identity and installation listing, and resolve installation tokens on demand per repo access.

**Why:** GitHub App user access tokens are fundamentally different from OAuth App tokens. Per GitHub's docs: "Unlike a traditional OAuth token, the user access token does not use scopes. Instead, it uses fine-grained permissions." The `scope` response field is always an empty string. This means:
- No `read:user`, `read:org`, or `repo` scopes are requested or needed
- The token's permissions are the intersection of the App's manifest permissions and the user's access
- `GET /user/installations` works because the token is issued for the specific App
- `GET /user` works because user identity is always available

Installation tokens are short-lived (1 hour) and scoped to specific repos. They are used for content access.

**Alternatives considered:**
- Store installation tokens in the session map per user — rejected because installation tokens are shared across users (same App installation for an org) and have their own lifecycle (1-hour expiry, auto-rotation)
- Use only installation tokens, no user identity — rejected because we need to know which installations a user has access to

### Decision 2: Shared `InstallationTokenManager`

**What:** A single `InstallationTokenManager` that caches installation tokens by installation ID, shared across all user sessions.

**Why:** Installation tokens are not user-specific — they represent the App's access to repos under a given installation. Multiple users from the same org should share the same installation token. The manager handles auto-rotation (refresh before expiry, same as existing `TokenProvider`).

**Structure:**
```go
type InstallationTokenManager struct {
    appID      int64
    privateKey *rsa.PrivateKey
    baseURL    string

    mu     sync.Mutex
    tokens map[int64]*installationToken // installationID -> cached token
}

func (m *InstallationTokenManager) Token(installationID int64) (string, error)
```

### Decision 3: Installation-based workspace discovery

**What:** Replace `GET /user/repos` with `GET /user/installations` (filtered to our App) followed by `GET /installation/repositories` per installation.

**Why:** The `GET /user/repos` endpoint uses the user's OAuth token and returns all repos the user can see — which is exactly the broad access we're trying to avoid. The installation-based endpoints return only repos where the App is installed, which is the correct scope.

**Flow:**
1. User authenticates → server gets lightweight OAuth token (scope: `read:user`)
2. Server calls `GET /user/installations` with user's token → returns installations of our App
3. For each installation, server calls `GET /installation/repositories` with the **installation token** → returns repos
4. Server checks each repo for `_epf.yaml` as before

### Decision 4: Session model changes

**What:** Change `sessionEntry` to store:
- `UserToken string` — lightweight OAuth token (`read:user` scope) for `GET /user/installations`
- Remove the single `AccessToken` field

**Why:** The session no longer needs to carry a powerful `repo`-scoped token. The user token is only used for listing installations. Repo content access goes through the `InstallationTokenManager`.

```go
type sessionEntry struct {
    UserID    int64
    Username  string
    UserToken string    // OAuth token with read:user scope only
    CreatedAt time.Time
    LastUsed  time.Time
}
```

### Decision 5: Token resolution for MCP tools

**What:** Replace `GetAccessToken(sessionID) → string` with a two-step resolution:
1. `GetUserToken(sessionID) → string` for identity-level API calls
2. `ResolveRepoToken(sessionID, owner, repo) → string` that finds the correct installation for the repo and returns an installation token

**Why:** MCP tools currently call `GetAccessToken` and pass the token to `GitHubSource`. With GitHub App auth, the token depends on which repo is being accessed. The `ResolveRepoToken` method encapsulates the lookup: user token → list installations → find installation covering this repo → get installation token.

**Caching:** The mapping of `(owner, repo) → installationID` is cached per-user with the same TTL as workspace discovery (10 minutes). The installation token itself is cached in `InstallationTokenManager`.

### Decision 6: PAT fallback remains unchanged

**What:** The `POST /auth/token` endpoint continues to accept GitHub PATs. When a PAT is used, the session stores it as `UserToken` and the system falls back to using it directly for all API calls (no installation token resolution).

**Why:** Fine-grained PATs are already scoped by the user. This path doesn't need installation tokens because the user has already made the scoping decision. This also covers the case where a user's org hasn't installed the GitHub App.

**Detection:** If `GET /user/installations` returns zero installations for our App, but the user authenticated via PAT, workspace discovery falls back to `GET /user/repos` using the PAT (existing behavior).

### Decision 7: No OAuth scopes needed for GitHub App flow

**What:** When operating via GitHub App, the OAuth flow uses the App's `client_id` and produces a user access token (`ghu_`) with **no OAuth scopes**. The `DefaultOAuthScopes` (`["read:user", "repo"]`) are only used for the legacy OAuth App path during transition.

**Why:** GitHub App user access tokens don't use scopes at all. Per GitHub docs, the `scope` response field is always an empty string. Permissions come from the App's manifest (e.g., `contents: read`). This is a stronger security model than reducing to `read:user` — there are literally no OAuth scopes to abuse.

For the transition period, the legacy OAuth App path retains `["read:user", "repo"]` scopes. Once the GitHub App path is fully adopted, the OAuth App path can be removed entirely.

## Risks / Trade-offs

- **GitHub App setup complexity** — Server operators must create and configure a GitHub App (app ID, private key, installation ID for single-tenant). Mitigated by documentation and a setup wizard.
- **Cross-org installation mapping** — Finding which installation covers a given repo requires listing all user installations and their repos. This is O(installations * repos) on cache miss. Mitigated by caching.
- **Installation token sharing** — If two orgs have different permission levels on their installations, the server must track this. In practice, all installations of the same App have the same permissions (defined in the manifest), so this is not an issue.
- **Users without App installation** — If a user authenticates but their org hasn't installed the App, they see zero workspaces. Mitigated by clear error messaging and the PAT fallback path.

## Migration Plan

1. Publish the EPF GitHub App on GitHub Marketplace with manifest requesting `contents: read` + `metadata: read`
2. Implement `InstallationTokenManager` (extends existing `TokenProvider` pattern)
3. Update `sessionEntry` to store `AuthMethod` field alongside token
4. Add `ResolveRepoToken` that selects GitHub App installation token or falls back to legacy OAuth/PAT token
5. Update workspace discovery to try installation-based API first, fall back to `GET /user/repos`
6. Update all 4 call sites of `GetAccessToken` in `mcp/cache.go` and `workspace/` to use `ResolveRepoToken`
7. Add mode detection: if GitHub App env vars present → GitHub App primary; otherwise → legacy OAuth
8. Update MCP OAuth flow to support GitHub App as OAuth backend
9. Add documentation for GitHub App setup and Marketplace installation
10. After adoption stabilizes, deprecate legacy OAuth App path in a future change

### Rollback

Since sessions are in-memory and lost on restart, rolling back is a binary swap — deploy the previous version. No data migration needed.

### Decision 8: Support both OAuth App and GitHub App during transition

**What:** The server supports both authentication paths simultaneously. If GitHub App env vars are configured, GitHub App auth is the primary path. If only OAuth App env vars are configured, the legacy OAuth App path is used. Both can be configured at once.

**Why:** Existing deployments use OAuth App auth. A hard switch would break them. During transition, operators can configure the GitHub App alongside the OAuth App, migrate users, and eventually remove the OAuth App config.

**Detection:** If `EPF_GITHUB_APP_ID` is set → GitHub App auth is available. If `EPF_OAUTH_CLIENT_ID` is set without App ID → legacy OAuth App only. If both are set → GitHub App is primary, OAuth App is fallback for users who haven't re-authenticated.

### Decision 9: Publish on GitHub Marketplace

**What:** The EPF GitHub App is published on the GitHub Marketplace as a free app.

**Why:** Marketplace visibility makes installation discoverable for org admins. It also provides a standard installation flow that users already understand. The alternative (distributing a manifest URL) requires manual setup and is less trustworthy from the user's perspective.

### Decision 10: Enable user access token expiry with refresh token rotation

**What:** Enable the "Expire user authorization tokens" option on the GitHub App. User access tokens (`ghu_`) expire after 8 hours. The server uses refresh tokens (`ghr_`, 6-month validity) to silently rotate tokens before expiry.

**Why:** GitHub recommends enabling expiry. A leaked user access token is only useful for 8 hours instead of indefinitely. The refresh token stays server-side (never sent to the client), so the exposure window is minimal.

**Implementation:**
- `sessionEntry` stores both `UserToken` (the `ghu_` access token) and `RefreshToken` (the `ghr_` refresh token)
- Before using the user token for `GET /user/installations` or identity calls, the session manager checks `ExpiresAt`
- If the token expires within 5 minutes, the session manager calls `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token` and the stored refresh token
- The response includes a new `ghu_` token, new expiry, and a new `ghr_` refresh token (rotation)
- Both are updated in the session entry atomically
- If the refresh token itself is expired (>6 months since last refresh), the user must re-authenticate

```go
type sessionEntry struct {
    UserID       int64
    Username     string
    UserToken    string    // ghu_ access token (8h expiry)
    RefreshToken string    // ghr_ refresh token (6mo expiry)
    TokenExpiry  time.Time // when UserToken expires
    AuthMethod   string    // "github_app", "oauth", "pat"
    CreatedAt    time.Time
    LastUsed     time.Time
}
```

**Edge case:** Legacy OAuth App tokens and PATs don't have refresh tokens. The `RefreshToken` field is empty for those sessions, and no refresh logic runs.

## Open Questions

- What's the minimum set of App manifest permissions needed? (`contents: read` + `metadata: read` seems sufficient, but verify against all API calls the server makes)
