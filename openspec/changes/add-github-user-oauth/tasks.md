## 1. DB Migration

- [ ] 1.1 `032_github_user_token.sql` — add `github_access_token TEXT` (nullable) to `users` table
- [ ] 1.2 Add `GithubAccessToken *string` field to `internal/domain/models.go` User struct

## 2. Config

- [ ] 2.1 Add `GithubOAuthClientID string` to `config/config.go` with env `GITHUB_OAUTH_CLIENT_ID`
      (keep existing `GithubClientID` / `EPF_OAUTH_CLIENT_ID` as fallback alias)
- [ ] 2.2 Add `GithubOAuthClientSecret string` with env `GITHUB_OAUTH_CLIENT_SECRET`
      (keep existing `GithubClientSecret` / `EPF_OAUTH_CLIENT_SECRET` as fallback)
- [ ] 2.3 Add `GithubOAuthStateSecret string` with env `GITHUB_OAUTH_STATE_SECRET`
      (falls back to `EPF_SESSION_SECRET` if set)
- [ ] 2.4 Add `GithubOAuthConfigured() bool` helper — returns true when client ID + secret set
- [ ] 2.5 Add `GithubOAuthRedirectURL(base string) string` helper — `{base}/github/connect/callback`

## 3. GitHub Client — ListUserInstallations

- [ ] 3.1 Add `ListUserInstallations(ctx context.Context, userToken string) ([]Installation, error)`
      to `internal/github/client.go`
      — calls `GET /user/installations` with Bearer userToken (not App JWT)
      — handles pagination (per_page=100)
- [ ] 3.2 Add `ListUserInstallations` to `RepoReader` interface in `domain/sync/import.go`
- [ ] 3.3 Implement on `RepoReaderAdapter` in `internal/github/adapter.go`
- [ ] 3.4 Add stub to `mockRepoReader` in `domain/sync/service_test.go`
- [ ] 3.5 Unit test for `ListUserInstallations` in `internal/github/client_test.go`

## 4. User Domain — Token Storage

- [ ] 4.1 Add `StoreGithubToken(ctx, userID uuid.UUID, token string) error` to `domain/user/service.go`
- [ ] 4.2 Add `GetGithubToken(ctx, userID uuid.UUID) (string, error)` to `domain/user/service.go`
- [ ] 4.3 Wire `userSvc` into the handler Server (it's already available in `cmd_serve.go`,
      need to pass it through to the web handler)

## 5. OAuth Handler

- [ ] 5.1 Add `internal/github/oauth.go` — OAuth flow helpers:
      - `OAuthConfig` struct (ClientID, ClientSecret, StateSecret, RedirectURL)
      - `AuthorizeURL(state string) string`
      - `ExchangeCode(ctx, code string) (accessToken string, err error)`
      - `FetchUser(ctx, accessToken string) (githubUserID int64, login string, err error)`
      - `GenerateState() (string, error)` — crypto random 32 bytes, hex-encoded
      - `SignState(state, secret string) string` — HMAC-SHA256
      - `VerifyState(state, signed, secret string) bool`
- [ ] 5.2 Add `WithGithubOAuth(cfg *github.OAuthConfig)` method to handler `Server`
- [ ] 5.3 Add `githubOAuth *github.OAuthConfig` field to handler `Server`
- [ ] 5.4 Wire in `cmd_serve.go` — build `OAuthConfig` when `cfg.GithubOAuthConfigured()`

## 6. Connect Flow Handlers — OAuth Integration

- [ ] 6.1 `GET /github/connect/authorize` — new route + handler:
      - Generate state, sign it, set cookie (`github_oauth_state`, MaxAge=600, HttpOnly, SameSite=Lax)
      - Redirect to GitHub authorize URL
- [ ] 6.2 `GET /github/connect/callback` — new route + handler:
      - Read + verify state cookie → 400 on mismatch
      - Exchange `code` for access token
      - Fetch GitHub user (ID + login)
      - Store token: `userSvc.StoreGithubToken(ctx, user.ID, token)`
      - Clear state cookie
      - Redirect to `/github/connect`
- [ ] 6.3 Update `handleGithubConnect` (GET `/github/connect`):
      - Load user's GitHub token from DB
      - If token present: call `client.ListUserInstallations(ctx, token)` instead of `syncSvc.ListInstallations(ctx)`
      - If no token + OAuth configured: render "Connect GitHub account" button (link to `/github/connect/authorize`)
      - If no token + OAuth NOT configured: render "No GitHub OAuth configured" message
- [ ] 6.4 Update `handleGithubConnectScan` (POST `/github/connect/scan`):
      - Load user's GitHub token; use `ListUserInstallations` to verify owner access
      - Pass user token to `GetInstallationToken` indirectly (still via App installation token for scan)
      - No change to scan logic — just the installation listing changes
- [ ] 6.5 Register new routes in `handler.go`:
      `GET /github/connect/authorize`, `GET /github/connect/callback`
- [ ] 6.6 Update `GithubConnectData` in `internal/ui/github_connect.templ`:
      - Add `NeedsGithubAuth bool`
      - Add `GithubUserLogin string` (show "Connected as @login" when authed)
      - Update `githubConnectInstallationPicker` to show auth button when `NeedsGithubAuth`
      - Add `githubConnectAuthButton` component
- [ ] 6.7 Run `~/go/bin/templ generate ./internal/ui/` after templ changes

## 7. Tests

- [ ] 7.1 Unit test `ListUserInstallations` (mock HTTP, pagination)
- [ ] 7.2 Unit test state generation, signing, verification
- [ ] 7.3 Run full test suite: `go test ./...`
- [ ] 7.4 Run lint: `task lint` — verify no new blocking findings

## 8. AGENTS.md Update

- [ ] 8.1 Update `apps/strategy-server/AGENTS.md` — document `github_access_token` column (migration 032)
- [ ] 8.2 Update knowledge base topic in `internal/agent/knowledge.go` — GitHub connect flow now user-scoped
