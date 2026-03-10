# Change: Add GitHub App authentication for multi-tenant mode

## Why

The current multi-tenant authentication uses GitHub OAuth with the `repo` scope, granting the server full read/write access to all of a user's public and private repositories. Security-conscious users and organizations are rightly skeptical of this broad permission model. GitHub Apps offer granular, repository-scoped permissions where the repo owner explicitly selects which repos the App can access and what permissions it has — shifting trust from the server operator to the repo owner.

## What Changes

- Multi-tenant mode adds GitHub App as the primary authentication model (OAuth App retained as fallback during transition)
- Session model changes from storing a single OAuth access token to storing a lightweight user identity token plus per-installation token resolution
- Workspace discovery changes from `GET /user/repos` (OAuth) to `GET /user/installations` + `GET /installation/repositories` (GitHub App)
- Access control changes from user-OAuth-token-based repo checks to installation-scoped token verification
- The `POST /auth/token` endpoint continues to accept fine-grained PATs as an alternative authentication method
- MCP OAuth flow updated: the GitHub App acts as the OAuth provider for user identity, while installation tokens handle repo access
- New `InstallationTokenProvider` manages a map of installation ID to cached token, with auto-rotation

## Impact

- Affected specs: `epf-cli-auth`, `epf-strategy-server`
- Affected code:
  - `apps/epf-cli/internal/auth/session.go` — session entry struct, token retrieval
  - `apps/epf-cli/internal/auth/githubapp.go` — extend from single-installation to multi-installation
  - `apps/epf-cli/internal/auth/handlers.go` — OAuth callback, token exchange
  - `apps/epf-cli/internal/auth/oauth.go` — scopes, exchange flow
  - `apps/epf-cli/internal/auth/middleware.go` — context enrichment
  - `apps/epf-cli/internal/workspace/discovery.go` — installation-based discovery
  - `apps/epf-cli/internal/workspace/handler.go` — token resolution
  - `apps/epf-cli/internal/mcp/cache.go` — buildTokenFunc, verifyRepoAccess
  - `apps/epf-cli/cmd/serve.go` — wiring and mode detection
