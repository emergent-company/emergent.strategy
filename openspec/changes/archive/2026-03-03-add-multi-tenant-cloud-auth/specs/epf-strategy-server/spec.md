## MODIFIED Requirements

### Requirement: Strategy Store Interface

The system SHALL provide a pluggable StrategyStore interface that abstracts how EPF artifacts are loaded and queried, enabling different data sources (filesystem, GitHub, etc.) without changing the query API.

The StrategyStore SHALL support a `Source` interface with the following implementations:

- `FileSystemSource` — reads from local disk (existing behavior)
- `GitHubSource` — reads from GitHub repositories via the Contents API
- `CachedSource` — wraps any Source with in-memory TTL cache and Singleflight deduplication

In multi-tenant mode, the StrategyStore SHALL support dynamic per-user source resolution:

- When an authenticated user requests an `instance_path` matching `owner/repo` or `owner/repo/subpath`, the store SHALL resolve this to a GitHubSource for that repository
- The store SHALL maintain a shared cache of loaded instances keyed by `owner/repo/path`, reusable across users
- Access control SHALL be enforced per-request — the store MUST verify the authenticated user has access to the requested repository before returning data

#### Scenario: Query strategy from local filesystem

- **WHEN** AI agent calls any strategy query MCP tool
- **AND** the strategy server is configured with FileSystemSource
- **THEN** the tool reads from the local EPF instance directory
- **AND** returns structured strategy data

#### Scenario: Query strategy from GitHub repository

- **WHEN** AI agent calls any strategy query MCP tool
- **AND** the strategy server is configured with GitHubSource
- **THEN** the tool fetches artifacts from the configured GitHub repository via the Contents API
- **AND** returns structured strategy data identical to filesystem mode

#### Scenario: Cached source deduplicates concurrent requests

- **WHEN** multiple MCP tool calls request the same EPF artifact simultaneously
- **AND** the source is wrapped with CachedSource
- **THEN** only one upstream request is made (via Singleflight)
- **AND** all callers receive the same result

#### Scenario: Cache expiry triggers background refresh

- **WHEN** a cached artifact's TTL expires
- **AND** a new request arrives for that artifact
- **THEN** the stale cached value is returned immediately
- **AND** a background goroutine refreshes the cache from the upstream source

#### Scenario: Strategy store reload on file change

- **WHEN** an EPF artifact file is modified in the watched directory
- **AND** the source is FileSystemSource with watch enabled
- **THEN** the strategy store detects the change within 500ms
- **AND** reloads the affected artifacts
- **AND** subsequent queries return updated data

#### Scenario: Dynamic instance resolution for authenticated user

- **WHEN** an authenticated user calls an MCP tool with `instance_path="emergent-company/emergent-epf"`
- **AND** the server is running in multi-tenant mode
- **THEN** the store resolves the path to a GitHubSource for that repository
- **AND** verifies the user has access to the repository
- **AND** returns strategy data from the resolved instance

#### Scenario: Shared cache across users for same instance

- **WHEN** user A requests `instance_path="org/repo"` and the instance is loaded into cache
- **AND** user B subsequently requests the same `instance_path="org/repo"`
- **AND** user B has access to the repository
- **THEN** the store returns data from the shared cache without a new GitHub API call

#### Scenario: Access denied for unauthorized repository

- **WHEN** an authenticated user calls an MCP tool with an `instance_path` referencing a repository they cannot access
- **THEN** the store returns an access denied error
- **AND** does not load or return any artifact data

### Requirement: Strategy Server CLI Commands

The system SHALL provide CLI commands for strategy server management supporting local, single-tenant cloud, and multi-tenant cloud modes.

The commands SHALL:

- `epf strategy serve` — Start the strategy server as a long-running MCP server
- `epf strategy serve --http --port 8080` — Start with HTTPS remote transport for remote clients (Streamable HTTP primary, SSE fallback)
- `epf strategy serve --http --oauth-client-id=ID --oauth-client-secret=SECRET` — Start in multi-tenant mode with GitHub OAuth user authentication
- `epf strategy status` — Show what's loaded in the strategy store (artifact counts, last reload)
- `epf strategy export` — Export combined strategy document in markdown format

The server SHALL auto-detect its mode based on configuration:

- If `EPF_OAUTH_CLIENT_ID` is set (or `--oauth-client-id` flag) → multi-tenant mode with OAuth
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

#### Scenario: Start strategy server with GitHub source

- **WHEN** user runs `epf strategy serve --source github --repo emergent-company/emergent-epf`
- **THEN** the strategy server loads EPF artifacts from the specified GitHub repository
- **AND** uses GitHub App authentication if configured
- **AND** caches artifacts in memory with configurable TTL

#### Scenario: Start strategy server in multi-tenant mode

- **WHEN** user runs `epf strategy serve --http --oauth-client-id=ID --oauth-client-secret=SECRET`
- **THEN** the strategy server starts in multi-tenant mode
- **AND** exposes `/auth/github/login` and `/auth/github/callback` endpoints
- **AND** requires bearer token authentication on all MCP endpoints
- **AND** dynamically resolves `instance_path` to user-authorized GitHub repositories

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

## ADDED Requirements

### Requirement: User Authentication via GitHub OAuth

The system SHALL support user authentication via GitHub OAuth 2.0, enabling users to log in with their GitHub account and obtain a session token for accessing the strategy server.

The authentication SHALL:

- Expose `/auth/github/login` to initiate the OAuth authorization flow
- Expose `/auth/github/callback` to handle the OAuth callback and issue a session token
- Exchange authorization codes for GitHub access tokens
- Issue signed JWT session tokens containing the user's GitHub ID and username
- Store GitHub OAuth access tokens server-side (in-memory session map), never exposing them to clients
- Support configurable session TTL (default 24 hours, via `EPF_SESSION_TTL`)
- Bound the session map to a configurable maximum size (default 10,000) with LRU eviction

#### Scenario: User initiates OAuth login

- **WHEN** a user visits `/auth/github/login`
- **THEN** the server redirects to GitHub's OAuth authorization URL
- **AND** includes the configured `client_id` and requested scopes (`repo`, `read:org`)

#### Scenario: OAuth callback issues session token

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

---

### Requirement: Workspace Discovery

The system SHALL provide workspace discovery, enabling authenticated users to find which of their accessible GitHub repositories contain EPF instances.

The discovery SHALL:

- Expose a `/workspaces` HTTP endpoint for listing user-accessible EPF workspaces
- Expose an `epf_list_workspaces` MCP tool for AI agent discovery
- List repositories the authenticated user can access that contain EPF instances (identified by `_epf.yaml` anchor files)
- Cache discovery results per-user with configurable TTL (default 10 minutes)
- Return workspace metadata including owner, repo name, instance path, and product name

#### Scenario: List user workspaces via HTTP

- **WHEN** an authenticated user sends GET to `/workspaces`
- **THEN** the server queries the GitHub API for repositories accessible to the user
- **AND** filters to repositories containing `_epf.yaml` anchor files
- **AND** returns a JSON array of workspace objects with owner, repo, instance_path, and product_name

#### Scenario: List user workspaces via MCP tool

- **WHEN** an authenticated AI agent calls the `epf_list_workspaces` MCP tool
- **THEN** the tool returns the same workspace list as the `/workspaces` HTTP endpoint
- **AND** each workspace includes sufficient information to set `instance_path` for subsequent tool calls

#### Scenario: Cached discovery results

- **WHEN** a user requests their workspaces
- **AND** a cached result exists from within the TTL window
- **THEN** the server returns the cached result without making GitHub API calls

#### Scenario: User with no EPF repositories

- **WHEN** an authenticated user requests their workspaces
- **AND** none of their accessible repositories contain EPF instances
- **THEN** the server returns an empty workspace list
- **AND** includes guidance on how to initialize an EPF instance

---

### Requirement: Dynamic Instance Routing

The system SHALL dynamically route MCP tool calls to the correct EPF instance based on the `instance_path` parameter and the authenticated user's permissions.

The routing SHALL:

- Resolve `instance_path` values matching `owner/repo` or `owner/repo/subpath` to GitHub repositories
- Verify the authenticated user has read access to the resolved repository
- Dynamically load and cache instances on first access
- Support concurrent access to multiple instances from different users
- Fall back to the server's default instance when `instance_path` is omitted (if configured)

#### Scenario: First access to a new instance

- **WHEN** an authenticated user requests an `instance_path` that has not been loaded
- **AND** the user has read access to the repository
- **THEN** the server creates a new GitHubSource for the repository
- **AND** wraps it with CachedSource
- **AND** loads the EPF instance artifacts
- **AND** returns the requested strategy data

#### Scenario: Subsequent access uses cached instance

- **WHEN** a user (or different user) requests an `instance_path` that is already cached
- **AND** the requesting user has read access to the repository
- **THEN** the server returns data from the cached instance
- **AND** does not create a new GitHubSource

#### Scenario: Instance path omitted falls back to default

- **WHEN** an authenticated user calls an MCP tool without specifying `instance_path`
- **AND** the server has a default instance configured
- **THEN** the tool uses the default instance
- **AND** access control is still enforced for the default instance

#### Scenario: Instance path omitted with no default

- **WHEN** an authenticated user calls an MCP tool without specifying `instance_path`
- **AND** no default instance is configured
- **THEN** the tool returns an error indicating that `instance_path` is required in multi-tenant mode
- **AND** suggests using `epf_list_workspaces` to discover available instances

---

### Requirement: Access Control

The system SHALL enforce access control ensuring users can only query EPF instances from repositories they have permission to access on GitHub.

The access control SHALL:

- Verify repository access using the user's GitHub OAuth token (or GitHub App token when available)
- Cache access check results per-user per-repository with configurable TTL (default 5 minutes)
- Deny access with a clear error message when the user lacks repository permissions
- Support both user-level and organization-level access (user is a collaborator, or user is a member of the owning org)

#### Scenario: User with repo access is granted

- **WHEN** an authenticated user requests an instance from a repository they have read access to
- **THEN** the access check passes
- **AND** the MCP tool returns strategy data normally

#### Scenario: User without repo access is denied

- **WHEN** an authenticated user requests an instance from a repository they cannot access
- **THEN** the server returns an access denied error
- **AND** does not reveal whether the repository exists

#### Scenario: Cached access check avoids repeated API calls

- **WHEN** a user's access to a repository was verified within the TTL window
- **AND** the user makes another request to the same repository
- **THEN** the server uses the cached access check result
- **AND** does not make a new GitHub API call

#### Scenario: Access revoked between cache refreshes

- **WHEN** a user's access to a repository is revoked on GitHub
- **AND** the cached access check has not yet expired
- **THEN** the user retains access until the cache entry expires (up to 5 minutes)
- **AND** after expiry, the next access check denies the request

---

### Requirement: Multi-Tenant Mode Backward Compatibility

The system SHALL maintain full backward compatibility with the existing single-tenant deployment mode when multi-tenant OAuth is not configured.

#### Scenario: Single-tenant mode with no OAuth configuration

- **WHEN** the server starts with `EPF_GITHUB_OWNER` and `EPF_GITHUB_REPO` set
- **AND** `EPF_OAUTH_CLIENT_ID` is not set
- **THEN** the server operates in single-tenant mode
- **AND** no OAuth endpoints are registered
- **AND** no bearer token authentication is required on MCP endpoints
- **AND** behavior is identical to Stage 1 cloud server

#### Scenario: Local mode with no cloud configuration

- **WHEN** the server starts without any GitHub or OAuth environment variables
- **THEN** the server operates in local mode with FileSystemSource
- **AND** uses stdio transport
- **AND** behavior is identical to the original local CLI
