## 1. Installation Token Management

- [ ] 1.1 Extend `InstallationTokenManager` in `auth/githubapp.go` to support multiple installation IDs (map of `int64 -> *installationToken` with per-entry mutex or sync.Map)
- [ ] 1.2 Add `Token(installationID int64) (string, error)` method that returns cached or refreshed token per installation
- [ ] 1.3 Add tests for concurrent token requests, cache hits, and auto-rotation across multiple installations

## 2. Session Model Changes

- [ ] 2.1 Rename `sessionEntry.AccessToken` to `UserToken` in `auth/session.go`
- [ ] 2.2 Add `RefreshToken string` and `TokenExpiry time.Time` fields to `sessionEntry`
- [ ] 2.3 Add `AuthMethod string` field to `sessionEntry` (values: `"github_app"`, `"oauth"`, `"pat"`)
- [ ] 2.4 Rename `GetAccessToken()` to `GetUserToken()` and update all call sites
- [ ] 2.5 Add `IsPATSession(sessionID string) bool` helper to distinguish PAT from OAuth/App sessions
- [ ] 2.6 Update `CreateSession` to accept auth method, optional refresh token, and token expiry

## 3. Repo Token Resolution

- [ ] 3.1 Create `auth/resolver.go` with `TokenResolver` struct that combines `InstallationTokenManager` + `SessionManager`
- [ ] 3.2 Implement `ResolveRepoToken(sessionID, owner, repo string) (string, error)` that: looks up user installations, finds installation covering the repo, returns installation token (or falls back to PAT)
- [ ] 3.3 Add per-user cache of `(owner, repo) -> installationID` mappings with configurable TTL
- [ ] 3.4 Add tests for cross-org resolution, PAT fallback, and cache behavior

## 4. Workspace Discovery

- [ ] 4.1 Add `discoverFromInstallations(userToken string, tokenMgr *InstallationTokenManager) ([]Workspace, error)` to `workspace/discovery.go`
- [ ] 4.2 Implement `GET /user/installations` call filtered to the EPF App ID
- [ ] 4.3 For each installation, call `GET /installation/repositories` using installation token
- [ ] 4.4 Add `InstallationID` field to `Workspace` struct
- [ ] 4.5 Update `Discover()` to try installation-based discovery first, fall back to `GET /user/repos` for PAT sessions
- [ ] 4.6 Update workspace handler and MCP workspace tool to pass `InstallationTokenManager` reference
- [ ] 4.7 Add tests for multi-org discovery, PAT fallback, and empty installations

## 5. User Access Token Refresh

- [ ] 5.1 Implement `refreshUserToken(sessionID string) error` in `auth/session.go` that calls `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token`
- [ ] 5.2 Update `GetUserToken()` to check `TokenExpiry` and auto-refresh if within 5 minutes of expiry
- [ ] 5.3 Handle refresh token rotation (GitHub returns new access token + new refresh token on each refresh)
- [ ] 5.4 Handle expired refresh token (>6 months): return error indicating re-authentication required
- [ ] 5.5 Skip refresh logic for legacy OAuth and PAT sessions (no refresh token stored)
- [ ] 5.6 Add tests for token refresh, rotation, and expiry edge cases

## 6. OAuth Scope Handling

- [ ] 6.1 Keep `DefaultOAuthScopes` (`["read:user", "repo"]`) for legacy OAuth App path
- [ ] 6.2 GitHub App path uses no scopes (user access tokens are scope-free)
- [ ] 6.3 Update MCP OAuth metadata to reflect auth method in use

## 7. Access Control Updates

- [ ] 7.1 Update `AccessChecker` to accept `TokenResolver` instead of raw OAuth token
- [ ] 7.2 Update `verifyRepoAccess` in `mcp/cache.go` to use `TokenResolver.ResolveRepoToken`
- [ ] 7.3 Update `buildTokenFunc` in `mcp/cache.go` to use `TokenResolver` with repo context
- [ ] 7.4 Add error messages suggesting GitHub App installation when access is denied due to missing installation

## 8. Server Wiring

- [ ] 8.1 Update `serve.go` mode detection to check for GitHub App env vars
- [ ] 8.2 Create `InstallationTokenManager` in `setupMultiTenantAuth` when App config is present
- [ ] 8.3 Create `TokenResolver` and pass to MCP server, workspace handler, and access checker
- [ ] 8.4 Support both OAuth App and GitHub App auth paths simultaneously

## 9. Documentation and Configuration

- [ ] 9.1 Document GitHub App setup (creating the App, generating private key, installing on repos)
- [ ] 9.2 Document environment variables for GitHub App multi-tenant mode
- [ ] 9.3 Document GitHub Marketplace installation flow for org admins
- [ ] 9.4 Update the Dockerfile/docker-compose to include new env vars
- [ ] 9.5 Add clear error messages when GitHub App is misconfigured

## 10. Testing

- [ ] 10.1 Integration test: multi-tenant auth flow with GitHub App (mock GitHub API)
- [ ] 10.2 Integration test: cross-org workspace discovery via installations
- [ ] 10.3 Integration test: PAT fallback when no App installation exists
- [ ] 10.4 Integration test: token resolution picks correct installation per repo
- [ ] 10.5 Integration test: user access token refresh and rotation
- [ ] 10.6 Integration test: expired refresh token forces re-authentication
- [ ] 10.7 Verify existing single-tenant and local mode tests still pass
- [ ] 10.8 Verify legacy OAuth App path still works when GitHub App is not configured
