## ADDED Requirements

### Requirement: GitHub App Installation Token Management

The system SHALL provide an `InstallationTokenManager` that caches and auto-rotates GitHub App installation tokens, shared across all user sessions.

The `InstallationTokenManager` SHALL:

- Accept the GitHub App's ID and RSA private key at construction time
- Cache installation tokens by installation ID in an in-memory map
- Return a valid installation token for a given installation ID, refreshing if expired or about to expire (5-minute margin)
- Sign JWTs with RS256 using the App's private key (10-minute TTL) for token exchange with GitHub
- Exchange App JWTs for installation tokens via `POST /app/installations/{id}/access_tokens`
- Be safe for concurrent access from multiple goroutines

#### Scenario: First request for an installation token

- **WHEN** a request requires an installation token for installation ID 12345
- **AND** no cached token exists for that installation
- **THEN** the manager signs an App JWT and exchanges it for an installation token
- **AND** caches the token keyed by installation ID
- **AND** returns the token

#### Scenario: Cached token returned when still valid

- **WHEN** a request requires an installation token for installation ID 12345
- **AND** a cached token exists that expires more than 5 minutes from now
- **THEN** the manager returns the cached token without making any API calls

#### Scenario: Token auto-rotated before expiry

- **WHEN** a request requires an installation token for installation ID 12345
- **AND** the cached token expires within 5 minutes
- **THEN** the manager refreshes the token via GitHub API
- **AND** updates the cache with the new token
- **AND** returns the new token

### Requirement: Installation-Based Workspace Discovery

The system SHALL discover user workspaces by querying GitHub App installations rather than listing all user repositories.

The discovery SHALL:

- Call `GET /user/installations` with the user's OAuth token to list installations of the EPF GitHub App
- For each installation, call `GET /installation/repositories` with the installation token to list accessible repos
- Check each repo for `_epf.yaml` anchor files (same content detection as current behavior)
- Return workspace metadata including owner, repo name, instance path, product name, and installation ID
- Cache discovery results per-user with configurable TTL (default 10 minutes)
- Fall back to `GET /user/repos` with the user's token when no App installations are found and the user authenticated via PAT

#### Scenario: User with App installations across two orgs

- **WHEN** an authenticated user requests their workspaces
- **AND** the GitHub App is installed in Org A (repos 1, 2) and Org B (repo 3)
- **AND** repos 1 and 3 contain EPF instances
- **THEN** the discovery returns workspaces for repos 1 and 3
- **AND** each workspace includes the correct installation ID for subsequent token resolution

#### Scenario: User with no App installations falls back to PAT discovery

- **WHEN** an authenticated user requests their workspaces
- **AND** `GET /user/installations` returns zero installations for the EPF App
- **AND** the user authenticated via `POST /auth/token` with a fine-grained PAT
- **THEN** the discovery falls back to `GET /user/repos` using the PAT
- **AND** returns workspaces found via the PAT-scoped repos

#### Scenario: User with no App installations and no PAT

- **WHEN** an authenticated user requests their workspaces
- **AND** `GET /user/installations` returns zero installations for the EPF App
- **AND** the user authenticated via OAuth (not PAT)
- **THEN** the discovery returns an empty workspace list
- **AND** includes guidance explaining that the GitHub App must be installed on their repositories

### Requirement: Installation-Scoped Repo Token Resolution

The system SHALL resolve the correct GitHub App installation token for a given repository, enabling MCP tools to access repo contents with installation-scoped permissions.

The resolution SHALL:

- Accept a session ID and repo coordinates (owner, repo)
- Look up which installation covers the requested repo by checking cached installation-to-repo mappings
- Return an installation token from the `InstallationTokenManager` for the resolved installation ID
- Cache the mapping of `(owner, repo) -> installationID` per-user with configurable TTL (default 10 minutes)
- Fall back to the user's PAT when no installation covers the repo and the user authenticated via PAT
- Return an error when no installation covers the repo and no PAT fallback is available

#### Scenario: MCP tool accesses repo covered by App installation

- **WHEN** an MCP tool requests a token for `org-a/strategy-repo`
- **AND** the GitHub App is installed on Org A covering that repo
- **THEN** the resolver returns an installation token for Org A's installation
- **AND** the token has `contents: read` permission on that repo

#### Scenario: MCP tool accesses repo not covered by any installation

- **WHEN** an MCP tool requests a token for `personal/my-repo`
- **AND** no GitHub App installation covers that repo
- **AND** the user did not authenticate via PAT
- **THEN** the resolver returns an error indicating the repo is not accessible
- **AND** suggests installing the GitHub App on the repository

#### Scenario: PAT fallback for uncovered repo

- **WHEN** an MCP tool requests a token for `personal/my-repo`
- **AND** no GitHub App installation covers that repo
- **AND** the user authenticated via PAT with access to that repo
- **THEN** the resolver returns the user's PAT for that request

### Requirement: User Access Token Refresh

The system SHALL automatically refresh GitHub App user access tokens before they expire, using the refresh token provided by GitHub during the initial authentication.

The refresh logic SHALL:

- Store both the user access token (`ghu_`) and refresh token (`ghr_`) in the session entry
- Track the token expiry timestamp per session
- Before using the user token for API calls, check if it expires within 5 minutes
- If expiring soon, call `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token`, the App's `client_id`, `client_secret`, and the stored refresh token
- Update the session entry with the new access token, new refresh token (rotation), and new expiry
- If the refresh token itself is expired (>6 months), return an error requiring re-authentication
- Skip refresh logic for legacy OAuth App and PAT sessions (which have no refresh token)

#### Scenario: Token silently refreshed before expiry

- **WHEN** an API call requires the user access token
- **AND** the token expires within 5 minutes
- **AND** the refresh token is still valid
- **THEN** the session manager refreshes the token via GitHub's token endpoint
- **AND** stores the new access token, refresh token, and expiry
- **AND** the API call proceeds with the new token

#### Scenario: Refresh token expired forces re-authentication

- **WHEN** an API call requires the user access token
- **AND** the token has expired
- **AND** the refresh token is also expired (>6 months old)
- **THEN** the session manager returns an error indicating re-authentication is required
- **AND** the client receives HTTP 401 with a message directing to `/auth/github/login`

#### Scenario: Legacy OAuth session skips refresh

- **WHEN** an API call requires the user token
- **AND** the session was created via the legacy OAuth App path (no refresh token stored)
- **THEN** the session manager returns the stored token without attempting refresh

## MODIFIED Requirements

### Requirement: User Authentication via GitHub OAuth

The system SHALL support user authentication via GitHub OAuth 2.0, enabling users to log in with their GitHub account and obtain a session token for accessing the strategy server. In multi-tenant mode with a GitHub App configured, authentication SHALL use GitHub App user access tokens (which use fine-grained permissions instead of OAuth scopes). The GitHub App SHALL have token expiry enabled, and the server SHALL store refresh tokens for automatic renewal.

The authentication SHALL:

- Expose `/auth/github/login` to initiate the OAuth authorization flow
- Expose `/auth/github/callback` to handle the OAuth callback and issue a session token
- Exchange authorization codes for GitHub access tokens
- Issue signed JWT session tokens containing the user's GitHub ID and username
- Store GitHub OAuth access tokens server-side (in-memory session map), never exposing them to clients
- Support configurable session TTL (default 24 hours, via `EPF_SESSION_TTL`)
- Bound the session map to a configurable maximum size (default 10,000) with LRU eviction
- When GitHub App is configured: use the App's `client_id` for the OAuth flow, producing a user access token (`ghu_`) with no OAuth scopes (permissions come from the App manifest)
- When GitHub App is configured: store the refresh token (`ghr_`) alongside the user access token and track token expiry
- When legacy OAuth App is used: request `read:user` and `repo` scopes (existing behavior, retained during transition)

#### Scenario: User initiates OAuth login with GitHub App configured

- **WHEN** a user visits `/auth/github/login`
- **AND** the server has a GitHub App configured for multi-tenant mode
- **THEN** the server redirects to GitHub's OAuth authorization URL using the App's `client_id`
- **AND** no OAuth scopes are requested (GitHub App user tokens are scope-free)

#### Scenario: OAuth callback issues session token with refresh token

- **WHEN** GitHub redirects to `/auth/github/callback` with a valid authorization code
- **AND** the server is using GitHub App authentication
- **THEN** the server exchanges the code for a user access token (`ghu_`) and refresh token (`ghr_`)
- **AND** stores both tokens and the token expiry in the session entry
- **AND** returns a signed JWT session token to the client

#### Scenario: Legacy OAuth callback issues session token

- **WHEN** GitHub redirects to `/auth/github/callback` with a valid authorization code
- **THEN** the server exchanges the code for a GitHub access token
- **AND** fetches the user's GitHub profile (ID, username, avatar)
- **AND** stores the access token server-side in the session map
- **AND** returns a signed JWT session token to the client

#### Scenario: Session token validation on MCP requests

- **WHEN** an MCP client sends a request with `Authorization: Bearer <jwt>`
- **AND** the JWT signature is valid and not expired
- **THEN** the server resolves the session and injects the authenticated user context
- **AND** the MCP tool handler can access the user's identity and permissions

#### Scenario: Expired or invalid session token

- **WHEN** an MCP client sends a request with an expired or invalid JWT
- **THEN** the server responds with HTTP 401 Unauthorized
- **AND** includes a message directing the client to re-authenticate via `/auth/github/login`

#### Scenario: Session eviction under memory pressure

- **WHEN** the session map reaches its maximum size (default 10,000 entries)
- **AND** a new user authenticates
- **THEN** the least recently used session is evicted
- **AND** the evicted user must re-authenticate on their next request

### Requirement: Access Control

The system SHALL enforce access control ensuring users can only query EPF instances from repositories they have permission to access. When a GitHub App is configured, access control SHALL be based on whether the App installation covers the requested repository.

The access control SHALL:

- When a GitHub App is configured: verify repo access by checking whether an installation of the App covers the requested repository
- When no GitHub App is configured (PAT mode): verify repository access using the user's token (existing behavior)
- Cache access check results per-user per-repository with configurable TTL (default 5 minutes)
- Deny access with a clear error message when the user lacks repository permissions
- Support both user-level and organization-level access

#### Scenario: User with App installation accesses covered repo

- **WHEN** an authenticated user requests an instance from a repository covered by a GitHub App installation
- **THEN** the access check passes via installation token resolution
- **AND** the MCP tool returns strategy data normally

#### Scenario: User without App installation on repo is denied

- **WHEN** an authenticated user requests an instance from a repository not covered by any GitHub App installation
- **AND** no PAT fallback is available
- **THEN** the server returns an access denied error
- **AND** suggests installing the GitHub App on the repository

#### Scenario: PAT user accesses repo directly

- **WHEN** a user who authenticated via PAT requests an instance from a repository
- **THEN** the access check uses the user's PAT to verify repo access (existing behavior)

#### Scenario: Cached access check avoids repeated API calls

- **WHEN** a user's access to a repository was verified within the TTL window
- **AND** the user makes another request to the same repository
- **THEN** the server uses the cached access check result
- **AND** does not make a new API call

### Requirement: Workspace Discovery

The system SHALL provide workspace discovery, enabling authenticated users to find which of their accessible GitHub repositories contain EPF instances. When a GitHub App is configured, discovery SHALL use installation-based repo listing instead of user-scoped repo listing.

The discovery SHALL:

- Expose a `/workspaces` HTTP endpoint for listing user-accessible EPF workspaces
- Expose an `epf_list_workspaces` MCP tool for AI agent discovery
- When a GitHub App is configured: list repositories via App installations (`GET /user/installations` + `GET /installation/repositories`)
- When no GitHub App is configured: list repositories the authenticated user can access that contain EPF instances (existing `GET /user/repos` behavior)
- Cache discovery results per-user with configurable TTL (default 10 minutes)
- Return workspace metadata including owner, repo name, instance path, product name, and installation ID (when applicable)

#### Scenario: List workspaces via App installations

- **WHEN** an authenticated user sends GET to `/workspaces`
- **AND** the server has a GitHub App configured
- **THEN** the server queries `GET /user/installations` filtered to the EPF App
- **AND** for each installation, queries `GET /installation/repositories` with the installation token
- **AND** filters to repositories containing `_epf.yaml` anchor files
- **AND** returns a JSON array of workspace objects with owner, repo, instance_path, product_name, and installation_id

#### Scenario: List workspaces via user token (no App)

- **WHEN** an authenticated user sends GET to `/workspaces`
- **AND** no GitHub App is configured (PAT mode)
- **THEN** the server falls back to `GET /user/repos` using the user's token (existing behavior)

#### Scenario: Cached discovery results

- **WHEN** a user requests their workspaces
- **AND** a cached result exists from within the TTL window
- **THEN** the server returns the cached result without making GitHub API calls

#### Scenario: User with no EPF repositories

- **WHEN** an authenticated user requests their workspaces
- **AND** none of their accessible repositories contain EPF instances
- **THEN** the server returns an empty workspace list
- **AND** includes guidance on how to initialize an EPF instance

### Requirement: Strategy Server CLI Commands

The system SHALL provide CLI commands for strategy server management supporting local, single-tenant cloud, and multi-tenant cloud modes.

The commands SHALL:

- `epf strategy serve` — Start the strategy server as a long-running MCP server
- `epf strategy serve --http --port 8080` — Start with HTTPS remote transport for remote clients (Streamable HTTP primary, SSE fallback)
- `epf strategy serve --http` — Start in multi-tenant mode when GitHub App env vars are configured (`EPF_GITHUB_APP_ID`, `EPF_GITHUB_APP_PRIVATE_KEY`)
- `epf strategy status` — Show what's loaded in the strategy store (artifact counts, last reload)
- `epf strategy export` — Export combined strategy document in markdown format

The server SHALL auto-detect its mode based on configuration:

- If `EPF_GITHUB_APP_ID` + `EPF_GITHUB_APP_PRIVATE_KEY` + `EPF_OAUTH_CLIENT_ID` are set → multi-tenant mode with GitHub App
- If only `EPF_GITHUB_OWNER` + `EPF_GITHUB_REPO` are set → single-tenant cloud mode
- If neither → local mode (filesystem source, stdio transport)

#### Scenario: Start strategy server in stdio mode

- **WHEN** user runs `epf strategy serve`
- **THEN** the strategy server starts with FileSystemSource and stdio transport
- **AND** loads the EPF instance from the configured path
- **AND** begins serving MCP requests via stdio

#### Scenario: Start strategy server in HTTPS remote mode

- **WHEN** user runs `epf strategy serve --http --port 8080`
- **THEN** the strategy server starts with HTTPS remote transport (Streamable HTTP primary, SSE fallback)
- **AND** listens on the specified port for MCP client connections
- **AND** serves the `/health` endpoint returning server status

#### Scenario: Start strategy server with GitHub App multi-tenant

- **WHEN** user runs `epf strategy serve --http`
- **AND** `EPF_GITHUB_APP_ID`, `EPF_GITHUB_APP_PRIVATE_KEY`, and `EPF_OAUTH_CLIENT_ID` are set
- **THEN** the strategy server starts in multi-tenant mode with GitHub App authentication
- **AND** creates an `InstallationTokenManager` for the configured App
- **AND** configures workspace discovery to use installation-based listing
- **AND** requires bearer token authentication on all MCP endpoints

#### Scenario: Check strategy server status

- **WHEN** user runs `epf strategy status`
- **THEN** the CLI shows loaded artifact counts (personas, features, value props, etc.)
- **AND** shows last reload timestamp
- **AND** shows the configured source type, mode (local/single-tenant/multi-tenant), and cache statistics
- **AND** shows any warnings about missing or invalid artifacts

#### Scenario: Export strategy document

- **WHEN** user runs `epf strategy export`
- **THEN** the CLI outputs a combined markdown document
- **AND** includes all strategy artifacts in a readable format
- **AND** supports `--output` flag for writing to file
