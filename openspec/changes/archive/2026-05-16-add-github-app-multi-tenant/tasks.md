## 1. Installation Token Management

- [x] 1.1 Extend `InstallationTokenManager` in `auth/githubapp.go` to support multiple installation IDs (map of `int64 -> *installationToken` with per-entry mutex or sync.Map)
- [x] 1.2 Add `Token(installationID int64) (string, error)` method that returns cached or refreshed token per installation
- [x] 1.3 Add tests for concurrent token requests, cache hits, and auto-rotation across multiple installations

## 2. Session Model Changes

- [x] 2.1 Keep `sessionEntry.AccessToken` field name (renaming would touch 38 call sites); `GetAccessToken()` delegates to `GetUserToken()`
- [x] 2.2 Add `RefreshToken string` and `TokenExpiry time.Time` fields to `sessionEntry`
- [x] 2.3 Add `AuthMethod string` field to `sessionEntry` (values: `"github_app"`, `"oauth"`, `"pat"`)
- [x] 2.4 Add `GetUserToken()` method; `GetAccessToken()` kept as deprecated alias
- [x] 2.5 Add `IsPATSession(sessionID string) bool` helper to distinguish PAT from OAuth/App sessions
- [x] 2.6 Add `CreateSessionWithOptions(user, token, opts)` accepting auth method, refresh token, and token expiry

## 3. Repo Token Resolution

- [x] 3.1 Create `auth/resolver.go` with `TokenResolver` struct that combines `InstallationTokenManager` + `SessionManager`
- [x] 3.2 Implement `ResolveRepoToken(sessionID, owner, repo string) (string, error)` that: looks up user installations, finds installation covering the repo, returns installation token (or falls back to PAT)
- [x] 3.3 Add per-user cache of `(owner, repo) -> installationID` mappings with configurable TTL
- [x] 3.4 Add tests for cross-org resolution, PAT fallback, and cache behavior

## 4. Workspace Discovery

- [x] 4.1 Add `discoverFromInstallations(userToken string, tokenMgr *InstallationTokenManager) ([]Workspace, error)` to `workspace/discovery.go`
- [x] 4.2 Implement `GET /user/installations` call filtered to the EPF App ID
- [x] 4.3 For each installation, call `GET /installation/repositories` using installation token
- [x] 4.4 Add `InstallationID` field to `Workspace` struct
- [x] 4.5 Update `Discover()` to try installation-based discovery first, fall back to `GET /user/repos` for PAT sessions
- [x] 4.6 Update workspace handler and MCP workspace tool to pass `InstallationTokenManager` reference
- [x] 4.7 Add tests for multi-org discovery, PAT fallback, and empty installations

## 5. User Access Token Refresh

- [x] 5.1 Implement `refreshUserToken(refreshToken string)` in `auth/session.go` that calls `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token`
- [x] 5.2 Update `GetUserToken()` to check `TokenExpiry` and auto-refresh if within 5 minutes of expiry
- [x] 5.3 Handle refresh token rotation (GitHub returns new access token + new refresh token on each refresh)
- [x] 5.4 Handle expired refresh token: refresh failure returns current token (graceful degradation)
- [x] 5.5 Skip refresh logic for legacy OAuth and PAT sessions (no refresh token stored)
- [x] 5.6 Add tests for token refresh, rotation, and expiry edge cases (8 new tests)

## 6. OAuth Scope Handling

- [x] 6.1 Keep `DefaultOAuthScopes` (`["read:user", "repo"]`) for legacy OAuth App path
- [x] 6.2 GitHub App path uses no scopes — OAuthTokenResponse extended with RefreshToken/ExpiresIn fields
- [x] 6.3 Updated handlers.go/mcpoauth.go to detect ghu_ tokens and use CreateSessionWithOptions with correct AuthMethod
- [x] 6.4 HandleTokenExchange (POST /auth/token) now detects PAT vs GitHub App vs OAuth tokens by prefix

## 7. Access Control Updates

- [x] 7.1 Add `tokenResolver *auth.TokenResolver` field to MCP Server struct + `SetTokenResolver` setter
- [x] 7.2 Update `verifyRepoAccess` in `mcp/cache.go` to try TokenResolver for GitHub App sessions, fall back to OAuth check
- [x] 7.3 Add `buildTokenFuncForRepo` in `mcp/cache.go` that resolves installation tokens per-repo for GitHub App sessions
- [x] 7.4 Update `createAndRegisterRemoteStore` to use `buildTokenFuncForRepo` instead of `buildTokenFunc`
- [x] 7.5 Add error message suggesting GitHub App installation when access denied with App configured
- [x] 7.6 Updated all `GetAccessToken` call sites to use `GetUserToken` in cache.go

## 8. Server Wiring

- [x] 8.1 Add `EPF_GITHUB_APP_CLIENT_ID` and `EPF_GITHUB_APP_CLIENT_SECRET` env vars for GitHub App OAuth flow
- [x] 8.2 Create `InstallationTokenManager` in multi-tenant setup when `MultiTenantConfigFromEnv()` returns config
- [x] 8.3 Create `TokenResolver` and wire to MCP server via `SetTokenResolver`, workspace handler via `HandlerWithConfig`
- [x] 8.4 Configure `RefreshConfig` on SessionManager when App client ID/secret available
- [x] 8.5 Support both OAuth App and GitHub App simultaneously — GitHub App components are additive to existing OAuth flow

## 9. Documentation and Configuration

- [x] 9.1 Updated epf-server-modes.md with GitHub App multi-tenant documentation
- [x] 9.2 Documented all env vars: EPF_GITHUB_APP_ID, EPF_GITHUB_APP_PRIVATE_KEY, EPF_GITHUB_APP_CLIENT_ID, EPF_GITHUB_APP_CLIENT_SECRET
- [ ] 9.3 Document GitHub Marketplace installation flow for org admins (deferred: requires live App)
- [ ] 9.4 Update the Dockerfile/docker-compose to include new env vars (deferred: no Dockerfile changes needed yet)
- [x] 9.5 Error messages: verifyRepoAccess suggests installing GitHub App when access denied with App configured

## 10. Testing

- [x] 10.1 Tests: HandleCallback detects ghu_ tokens and sets AuthMethodGitHubApp with refresh token
- [x] 10.2 Tests: HandleTokenExchange detects PAT (ghp_), OAuth (gho_), and GitHub App (ghu_) tokens
- [x] 10.3 Tests: GetUserToken auto-refreshes when token near expiry (8 new tests in session_test.go)
- [x] 10.4 Tests: refreshUserToken verifies grant_type, client_id, rotation of refresh token
- [x] 10.5 Tests: No refresh triggered for OAuth and PAT sessions
- [x] 10.6 Tests: Graceful fallback when refresh fails (returns current token)
- [x] 10.7 Verified: all 30 test packages pass (including existing single-tenant, local mode, integration tests)
- [x] 10.8 Verified: legacy OAuth App path works unchanged — GitHub App components are additive
