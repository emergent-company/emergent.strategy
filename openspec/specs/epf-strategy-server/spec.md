# epf-strategy-server Specification

## Purpose
TBD - created by archiving change add-epf-product-strategy-server. Update Purpose after archive.

## Requirements

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

### Requirement: Product Vision Query via MCP

AI agents SHALL be able to query high-level product direction via the `epf_get_product_vision` MCP tool.

The tool SHALL:

- Return the product's vision statement, mission, and purpose
- Include the North Star metrics and targets
- Return structured data suitable for AI consumption

#### Scenario: Get product vision

- **WHEN** AI agent calls `epf_get_product_vision`
- **THEN** the tool returns the vision, mission, and purpose from the EPF North Star artifact
- **AND** includes any defined North Star metrics

#### Scenario: Get vision from incomplete EPF instance

- **WHEN** AI agent calls `epf_get_product_vision`
- **AND** the EPF instance does not have a complete North Star artifact
- **THEN** the tool returns available fields with warnings about missing data

---

### Requirement: Persona Query via MCP

AI agents SHALL be able to query product personas via the `epf_get_personas` and `epf_get_persona_details` MCP tools.

The tools SHALL:

- `epf_get_personas`: Return a list of all personas with summaries (id, name, description, technical_proficiency)
- `epf_get_persona_details`: Accept `persona_id` parameter and return full persona including pain points, narratives, and related value propositions

#### Scenario: List all personas

- **WHEN** AI agent calls `epf_get_personas`
- **THEN** the tool returns a list of all personas defined in the EPF instance
- **AND** each persona includes id, name, description, and technical_proficiency

#### Scenario: Get persona details with pain points

- **WHEN** AI agent calls `epf_get_persona_details` with `persona_id="enterprise-admin"`
- **THEN** the tool returns the full persona definition
- **AND** includes the persona's pain points with severity and workarounds
- **AND** includes current_situation, transformation_moment, and emotional_resolution narratives

#### Scenario: Get persona with related value propositions

- **WHEN** AI agent calls `epf_get_persona_details` with `persona_id="enterprise-admin"` and `include_value_props=true`
- **THEN** the tool returns the persona with its pain points
- **AND** includes value propositions that address those pain points

---

### Requirement: Value Proposition Query via MCP

AI agents SHALL be able to query value propositions via the `epf_get_value_propositions` MCP tool.

The tool SHALL:

- Accept optional `persona_id` parameter to filter by persona relevance
- Return value propositions with their target pain points and differentiators
- Include competitive positioning when available

#### Scenario: Get all value propositions

- **WHEN** AI agent calls `epf_get_value_propositions`
- **THEN** the tool returns all value propositions from the Strategy Formula
- **AND** each value proposition includes description and target pain points

#### Scenario: Get value propositions for specific persona

- **WHEN** AI agent calls `epf_get_value_propositions` with `persona_id="enterprise-admin"`
- **THEN** the tool returns only value propositions relevant to that persona
- **AND** relevance is determined by pain point associations

---

### Requirement: Competitive Position Query via MCP

AI agents SHALL be able to query competitive positioning via the `epf_get_competitive_position` MCP tool.

The tool SHALL:

- Accept optional `competitor` parameter to focus on specific competitor
- Return competitive analysis including strengths, weaknesses, and differentiation
- Include market positioning context

#### Scenario: Get competitive landscape

- **WHEN** AI agent calls `epf_get_competitive_position`
- **THEN** the tool returns the competitive analysis from Strategy Foundations
- **AND** includes identified competitors with their positioning

#### Scenario: Get position against specific competitor

- **WHEN** AI agent calls `epf_get_competitive_position` with `competitor="Competitor A"`
- **THEN** the tool returns focused analysis of that competitor
- **AND** includes differentiation points and competitive advantages

---

### Requirement: Roadmap Query via MCP

AI agents SHALL be able to query roadmap information via the `epf_get_roadmap_summary` MCP tool.

The tool SHALL:

- Accept optional `track` parameter to filter by track (product, strategy, org_ops, commercial)
- Accept optional `cycle` parameter to filter by cycle
- Return OKRs and Key Results with their status and targets

#### Scenario: Get full roadmap summary

- **WHEN** AI agent calls `epf_get_roadmap_summary`
- **THEN** the tool returns an overview of all roadmap tracks
- **AND** includes OKR counts and high-level status per track

#### Scenario: Get roadmap for specific track

- **WHEN** AI agent calls `epf_get_roadmap_summary` with `track="product"`
- **THEN** the tool returns OKRs for the product track
- **AND** includes Key Results with targets and current status

#### Scenario: Get current cycle roadmap

- **WHEN** AI agent calls `epf_get_roadmap_summary` with `cycle="current"`
- **THEN** the tool returns only OKRs and KRs for the current cycle
- **AND** current cycle is determined from roadmap metadata

---

### Requirement: Strategy Search via MCP

AI agents SHALL be able to search across all strategy artifacts via the `epf_search_strategy` MCP tool.

The tool SHALL:

- Accept a `query` parameter for the search term
- Search across all strategy content (vision, personas, value props, roadmap, features)
- Return ranked results with artifact type, title, and relevant snippet

#### Scenario: Search for topic across strategy

- **WHEN** AI agent calls `epf_search_strategy` with `query="enterprise security"`
- **THEN** the tool returns matching artifacts across all strategy content
- **AND** results are ranked by relevance
- **AND** each result includes artifact_type, artifact_id, title, snippet, and score

#### Scenario: Search with no results

- **WHEN** AI agent calls `epf_search_strategy` with a query that matches no content
- **THEN** the tool returns an empty results array
- **AND** includes a message suggesting alternative searches or broader terms

---

### Requirement: Strategic Context Synthesis via MCP

AI agents SHALL be able to get synthesized strategic context for a topic via the `epf_get_strategic_context` MCP tool.

The tool SHALL:

- Accept a `topic` parameter describing what context is needed
- Synthesize relevant information from across EPF artifacts
- Return a structured context object suitable for grounding AI responses

#### Scenario: Get context for feature development

- **WHEN** AI agent calls `epf_get_strategic_context` with `topic="user authentication"`
- **THEN** the tool returns synthesized context including relevant personas, pain points, value propositions, and roadmap items
- **AND** context is organized to help AI agents understand strategic importance

#### Scenario: Get context for customer communication

- **WHEN** AI agent calls `epf_get_strategic_context` with `topic="pricing strategy"`
- **THEN** the tool returns competitive positioning, value propositions, and target personas
- **AND** highlights key differentiators and messaging points

---

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

### Requirement: Lazy Loading for CLI Performance

The system SHALL use lazy loading to ensure strategy server features do not impact existing CLI command performance.

#### Scenario: Validate command performance unchanged

- **WHEN** user runs `epf validate <file>`
- **THEN** the strategy store is NOT loaded
- **AND** command completes within existing performance bounds (~200-300ms)

#### Scenario: Strategy commands load strategy store

- **WHEN** user runs any `epf strategy *` command
- **THEN** the strategy store is loaded on first access
- **AND** subsequent strategy commands reuse the loaded store

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

### Requirement: MCP OAuth Authorization Server

The system SHALL implement the MCP Authorization Spec (2025-06-18) in multi-tenant mode, acting as both an OAuth 2.1 authorization server (to MCP clients) and an OAuth client (to GitHub), enabling cloud AI tools to connect natively via standards-based OAuth.

The MCP OAuth endpoints SHALL:

- Expose `GET /.well-known/oauth-protected-resource` returning Protected Resource Metadata (RFC 9728) with the server's `authorization_servers` list
- Expose `GET /.well-known/oauth-authorization-server` returning Authorization Server Metadata (RFC 8414) with endpoint locations, supported grant types, and PKCE methods
- Expose `POST /register` for Dynamic Client Registration (RFC 7591), storing client registrations in-memory with configurable TTL
- Expose `GET /authorize` as the OAuth authorization endpoint, validating `client_id`, `redirect_uri`, `code_challenge`, and `state`, then redirecting to GitHub OAuth
- Expose `GET /authorize/callback` as the internal OAuth callback, exchanging the GitHub authorization code for a GitHub token, creating a server session, generating a single-use authorization code, and redirecting to the MCP client's `redirect_uri`
- Expose `POST /token` as the OAuth token endpoint, validating the authorization code and `code_verifier` (PKCE), and returning an access token with `token_type` and `expires_in`
- Return HTTP 401 with a `WWW-Authenticate` header pointing to the protected resource metadata URL when unauthenticated requests hit `/mcp`
- Be available in multi-tenant mode only (return 404 in other modes)

#### Scenario: Claude Cowork connects via MCP OAuth

- **WHEN** a user adds the EPF server URL in Claude Cowork's Settings → Connectors
- **AND** Claude initiates the MCP OAuth discovery flow
- **THEN** Claude fetches `/.well-known/oauth-protected-resource` to discover the authorization server
- **AND** Claude fetches `/.well-known/oauth-authorization-server` for endpoint metadata
- **AND** Claude registers via `POST /register` (Dynamic Client Registration)
- **AND** Claude opens the browser to `/authorize` with PKCE parameters
- **AND** the server redirects to GitHub OAuth, the user authorizes, and the server redirects back to Claude's callback with an authorization code
- **AND** Claude exchanges the code for an access token via `POST /token`
- **AND** Claude uses the access token to call MCP tools

#### Scenario: OpenCode connects via MCP OAuth auto-discovery

- **WHEN** a user configures the EPF server as a remote MCP server in OpenCode
- **AND** OpenCode detects the 401 response and initiates OAuth
- **THEN** OpenCode discovers auth endpoints via metadata
- **AND** completes the OAuth flow in the user's browser
- **AND** stores the token for subsequent requests

#### Scenario: Dynamic Client Registration stores client

- **WHEN** an MCP client sends `POST /register` with `redirect_uris` and `client_name`
- **THEN** the server generates a `client_id` and stores the registration in-memory
- **AND** returns the `client_id` and registration metadata
- **AND** the registration expires after the configured TTL (default 24 hours)

#### Scenario: Authorization code is single-use

- **WHEN** an MCP client exchanges an authorization code via `POST /token`
- **AND** the code is valid and the PKCE verifier matches
- **THEN** the server returns an access token
- **AND** the authorization code is consumed and cannot be reused

#### Scenario: PKCE verification fails

- **WHEN** an MCP client sends `POST /token` with an incorrect `code_verifier`
- **THEN** the server returns HTTP 400 with an error indicating the PKCE challenge failed

#### Scenario: MCP OAuth not available in single-tenant mode

- **WHEN** a client requests any MCP OAuth endpoint in single-tenant mode
- **THEN** the server returns HTTP 404

### Requirement: Token Exchange Endpoint

The system SHALL provide a `POST /auth/token` endpoint that accepts a GitHub access token and returns a server session JWT, enabling CLI-based authentication flows where the client obtains the GitHub token directly (e.g., Device Flow, Personal Access Token).

The endpoint SHALL:

- Accept a JSON body with `{"github_token": "<token>"}`
- Validate the token by calling the GitHub API (`GET /user`) to retrieve the user's identity
- Create a server-side session (identical to the OAuth callback flow)
- Return a JSON response with `{"token": "<jwt>", "username": "<login>", "user_id": <id>}`
- Return HTTP 401 if the GitHub token is invalid or expired
- Be available in multi-tenant mode only (return 404 in other modes)

#### Scenario: Valid GitHub token exchanges for session JWT

- **WHEN** a client sends `POST /auth/token` with a valid GitHub access token
- **THEN** the server validates the token against the GitHub API
- **AND** creates a session with the authenticated user's identity
- **AND** returns a signed JWT and user metadata

#### Scenario: Invalid GitHub token is rejected

- **WHEN** a client sends `POST /auth/token` with an invalid or expired token
- **THEN** the server returns HTTP 401
- **AND** includes an error message indicating the token is invalid

#### Scenario: Token exchange not available in single-tenant mode

- **WHEN** a client sends `POST /auth/token` to a single-tenant server
- **THEN** the server returns HTTP 404

### Requirement: GitHub OAuth App Authorization Flow

The server SHALL implement a standard GitHub OAuth 2.0 authorization-code flow
that lets a user authorize the platform to read their GitHub repositories. The
resulting access token SHALL be stored server-side against the user's account.
The flow requests the scopes `repo`, `read:user` and `read:org`.

#### Scenario: Successful OAuth dance

- **WHEN** a user opens `GET /github/connect` with no stored GitHub token and the GitHub App is configured
- **THEN** the page shows a "Connect GitHub account" button linking to `/github/connect/authorize`
- **WHEN** the user follows the link
- **THEN** the server generates a CSRF state, stores it in an HMAC-signed, HttpOnly cookie that expires after 10 minutes, and redirects to GitHub's authorize URL
- **WHEN** GitHub redirects to `/github/connect/callback?code=XXX&state=YYY` and the state matches the cookie
- **THEN** the server exchanges the code for an access token, stores it against the user, clears the state cookie and redirects to `/github/connect`
- **AND** the page then loads the user's repositories (see "User-Scoped Repository Discovery")

#### Scenario: CSRF state rejected

- **WHEN** `/github/connect/callback` is called with a missing state cookie, an invalid cookie signature, an empty state parameter, or a state that does not match the cookie
- **THEN** the server returns HTTP 400
- **AND** no token is stored

#### Scenario: Authorization code missing

- **WHEN** `/github/connect/callback` is called with a valid state but without a `code`
- **THEN** the server returns HTTP 400
- **AND** no token is stored

#### Scenario: OAuth not configured

- **WHEN** `GITHUB_OAUTH_CLIENT_ID` is not set
- **AND** a user opens `/github/connect` with no stored token
- **THEN** the page explains that GitHub OAuth is not configured on this server and names the environment variables to set
- **AND** no "Connect" button is shown
- **AND** the page returns HTTP 200
- **WHEN** `/github/connect/authorize` or `/github/connect/callback` is called anyway
- **THEN** the server returns HTTP 503

### Requirement: GitHub Token Stored Per-User

The server SHALL store the user's GitHub OAuth access token in the `users`
table (`github_access_token`, nullable). The token belongs to the authenticated
platform user, not to a strategy instance, and is never serialised in API
responses.

#### Scenario: Token persists across sessions

- **WHEN** a user has completed the OAuth flow
- **AND** later opens `/github/connect` in a new browser session
- **THEN** the token is read from the database and the user is not asked to authorize again

#### Scenario: No token for a new user

- **WHEN** a user has never connected GitHub
- **THEN** the stored value is null and `/github/connect` shows the needs-authorization state

### Requirement: User-Scoped Repository Discovery

The connect page SHALL discover repositories with the user's own OAuth token
(the repositories that user can see on GitHub), not with the GitHub App's
credentials, and SHALL detect EPF content in them asynchronously. The page
renders at once with a loading state and fetches the result from
`GET /github/connect/repos` by HTMX polling.

#### Scenario: User sees the repositories their token can see

- **WHEN** a user with a stored token opens `/github/connect`
- **THEN** the page shows a loading state and polls `/github/connect/repos`
- **AND** the list shows repositories returned for that user's token, each flagged when the GitHub App is installed on its owner

#### Scenario: Results are cached per user

- **WHEN** the repository list was loaded for a token
- **THEN** it is cached under a key derived from that token, so one user's list is never served to another
- **AND** a failed scan is cached for 60 seconds only

#### Scenario: GitHub rate limit

- **WHEN** the scan fails because GitHub's rate limit is exhausted
- **THEN** the page shows a rate-limited state with the time to retry and retries on its own

#### Scenario: Scan failure

- **WHEN** the scan fails for any other reason
- **THEN** the page shows a generic scan-failed message

### Requirement: GitHub App Installation Listing

The server SHALL provide the MCP tool `list_github_installations`, which lists
the GitHub orgs and personal accounts where the GitHub App is installed. It
lists every installation of the App on this server; it is not scoped to the
calling user.

#### Scenario: List installations successfully

- **WHEN** a user calls `list_github_installations()` and the GitHub App is configured
- **THEN** the server returns `app_configured: true`, the installations (`owner_login`, `owner_type`, `html_url`, `id`), a `total`, and `app_install_url`

#### Scenario: App not configured

- **WHEN** `list_github_installations()` is called and the App cannot be reached or is not configured
- **THEN** the server returns `app_configured: false` with an explanatory message
- **AND** does not return an error

#### Scenario: No installations

- **WHEN** the App is configured but has no installations
- **THEN** the server returns an empty list
- **AND** `app_install_url` is the installation URL when `GITHUB_APP_SLUG` is set and an empty string otherwise

### Requirement: Repo Discovery with EPF Detection

The server SHALL discover the repositories of a GitHub owner and detect which
contain EPF content, in two passes. Pass 1 reads the root tree and finds a root
`READY/` directory. Pass 2 reads the recursive tree and finds `READY/`
directories in subdirectories, skipping ignored path segments and instances
nested inside another. The MCP tool `scan_github_repos(github_owner)` performs
the scan with the App's installation token. Results are cached for 30 minutes,
per owner for this tool; a failed scan is cached for 60 seconds.

#### Scenario: EPF at the repository root

- **WHEN** `scan_github_repos(github_owner="acme-company")` is called and the repository `acme-company/strategy` has a `READY/` directory at its root
- **THEN** the result for that repository has `has_epf: true` and `detected_instances: [{base_path: "", has_meta_file: <bool>}]`

#### Scenario: EPF in a subdirectory

- **WHEN** a repository has no EPF markers at its root and a recursive scan finds `docs/strategy/READY/` with YAML files
- **THEN** the result has `has_epf: true` and `detected_instances` holds an entry with `base_path: "docs/strategy"`

#### Scenario: Several EPF instances in one repository

- **WHEN** a repository contains both `strategy/product-a/READY/` and `strategy/product-b/READY/`
- **THEN** `detected_instances` has one entry for each base path
- **AND** an instance nested inside another is not listed

#### Scenario: No EPF found

- **WHEN** a repository has no `READY/` directory at its root or in any subdirectory
- **THEN** `has_epf` is false and no instance is detected

#### Scenario: App not installed on the owner

- **WHEN** `scan_github_repos(github_owner="unknown-org")` is called and the App is not installed on that owner
- **THEN** the tool returns `error` with a message that the GitHub App is not installed, `github_owner`, and `app_install_url`

#### Scenario: Cached results

- **WHEN** `scan_github_repos` is called again for the same owner within the cache lifetime
- **THEN** the cached result is returned without further GitHub API calls

#### Scenario: Truncated tree for a large repository

- **WHEN** GitHub reports the recursive tree as truncated
- **THEN** the server logs a warning and returns the partial result
- **AND** the repository carries `scan_truncated: true`

#### Scenario: Repositories that use EPF through a submodule

- **WHEN** a repository mounts an EPF instance as a git submodule (listed in `.gitmodules`)
- **THEN** the scan marks it as a submodule and records which repositories use it
- **AND** a repository that only subscribes to an instance through a submodule skips the recursive pass

### Requirement: Repo-to-Workspace Assignment via Connect Flow

The web UI SHALL provide a connect flow at `/github/connect` in which a user
picks a repository from the list of repositories their own token can see
(see "User-Scoped Repository Discovery"), chooses the workspace that will own
the resulting strategy instance, and either imports the artifacts or only links
the repository. The workspace is chosen explicitly; nothing is inferred from
the repository's owner.

#### Scenario: Import a repository into a workspace

- **WHEN** a user picks a repository with detected EPF content, picks a workspace in the dropdown and clicks Import
- **THEN** the server imports the artifacts using the user's OAuth token, so the App need not be installed on the owner
- **AND** the instance is created in the chosen workspace with `github_repo` and `github_base_path` set, and is activated
- **AND** the user is redirected to the new instance

#### Scenario: Link only

- **WHEN** the user picks a repository and a workspace and clicks "Link only"
- **THEN** the instance is created in that workspace with `github_repo` and `github_base_path` set
- **AND** no artifacts are imported and the instance is not activated

#### Scenario: Repository already connected

- **WHEN** an instance with the same `github_repo` already exists and the user picks a different workspace
- **THEN** the existing instance is moved to that workspace instead of a duplicate being created
- **AND** the list shows the connected instance, its workspace and when it last synced, with a re-import action

#### Scenario: Assign to a different organisation

- **WHEN** a user picks a repository owned by `agency-org` and assigns it to the workspace "Client A Corp", which belongs to another organisation
- **THEN** the instance is created in "Client A Corp" with `github_repo` set to `agency-org/<repository>`

#### Scenario: Personal repository

- **WHEN** a user picks a repository from their personal GitHub account
- **THEN** it can be assigned to any workspace in the dropdown and syncs to that repository

#### Scenario: New workspace on the fly

- **WHEN** the user chooses "new workspace" and enters a name
- **THEN** the server creates the organisation (or reuses it) and a workspace for the repository's owner, makes the user a member, and uses it for the import
- **AND** when no workspace exists yet, the page shows an inline name field instead of a dropdown

#### Scenario: Not connected

- **WHEN** `POST /github/connect/import` is called by a user with no stored GitHub token
- **THEN** the server returns HTTP 401

### Requirement: App Install URL Configuration

The server SHALL support `GITHUB_APP_SLUG` for building the GitHub App
installation URL `https://github.com/apps/{slug}/installations/new`.

#### Scenario: Slug configured

- **WHEN** `GITHUB_APP_SLUG` is set
- **THEN** the connect page shows an "Install GitHub App" link to that URL in its information card
- **AND** the MCP tools `list_github_installations` and `scan_github_repos` return it as `app_install_url`

#### Scenario: Slug not configured

- **WHEN** `GITHUB_APP_SLUG` is not set
- **THEN** no install link is shown and `app_install_url` is an empty string
- **AND** no error is raised
