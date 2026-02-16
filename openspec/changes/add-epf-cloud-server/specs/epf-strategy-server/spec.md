## MODIFIED Requirements

### Requirement: Strategy Store Interface

The system SHALL provide a pluggable StrategyStore interface that abstracts how EPF artifacts are loaded and queried, enabling different data sources (filesystem, GitHub, etc.) without changing the query API.

The StrategyStore SHALL support a `Source` interface with the following implementations:

- `FileSystemSource` — reads from local disk (existing behavior)
- `GitHubSource` — reads from GitHub repositories via the Contents API
- `CachedSource` — wraps any Source with in-memory TTL cache and Singleflight deduplication

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

### Requirement: Strategy Server CLI Commands

The system SHALL provide CLI commands for strategy server management supporting both local and cloud modes.

The commands SHALL:

- `epf strategy serve` — Start the strategy server as a long-running MCP server
- `epf strategy serve --http --port 8080` — Start with HTTP/SSE transport for remote clients
- `epf strategy status` — Show what's loaded in the strategy store (artifact counts, last reload)
- `epf strategy export` — Export combined strategy document in markdown format

#### Scenario: Start strategy server in stdio mode

- **WHEN** user runs `epf strategy serve`
- **THEN** the strategy server starts with FileSystemSource and stdio transport
- **AND** loads the EPF instance from the configured path
- **AND** begins serving MCP requests via stdio

#### Scenario: Start strategy server in HTTP/SSE mode

- **WHEN** user runs `epf strategy serve --http --port 8080`
- **THEN** the strategy server starts with HTTP/SSE transport
- **AND** listens on the specified port for MCP client connections
- **AND** serves the `/health` endpoint returning server status

#### Scenario: Start strategy server with GitHub source

- **WHEN** user runs `epf strategy serve --source github --repo emergent-company/emergent-epf`
- **THEN** the strategy server loads EPF artifacts from the specified GitHub repository
- **AND** uses GitHub App authentication if configured
- **AND** caches artifacts in memory with configurable TTL

#### Scenario: Check strategy server status

- **WHEN** user runs `epf strategy status`
- **THEN** the CLI shows loaded artifact counts (personas, features, value props, etc.)
- **AND** shows last reload timestamp
- **AND** shows the configured source type and cache statistics
- **AND** shows any warnings about missing or invalid artifacts

#### Scenario: Export strategy document

- **WHEN** user runs `epf strategy export`
- **THEN** the CLI outputs a combined markdown document
- **AND** includes all strategy artifacts in a readable format
- **AND** supports `--output` flag for writing to file

## ADDED Requirements

### Requirement: HTTP/SSE Transport for Remote MCP Clients

The system SHALL support an HTTP/SSE transport layer for serving MCP requests to remote clients, in addition to the existing stdio transport.

The transport SHALL:

- Listen on a configurable port (default 8080)
- Implement the MCP SSE protocol specification
- Support CORS with configurable allowed origins
- Provide a `/health` endpoint for load balancer health checks

#### Scenario: Remote MCP client connects via SSE

- **WHEN** a remote MCP client connects to the HTTP/SSE endpoint
- **THEN** the server establishes an SSE connection
- **AND** the client can send MCP requests and receive responses over the connection

#### Scenario: CORS allows configured origins

- **WHEN** a web-based MCP client sends a preflight request from an allowed origin
- **THEN** the server responds with appropriate CORS headers
- **AND** the client can establish the SSE connection

#### Scenario: Health check returns server status

- **WHEN** a load balancer sends a GET request to `/health`
- **THEN** the server responds with 200 OK
- **AND** includes the loaded instance name, artifact count, and uptime

### Requirement: GitHub App Authentication

The system SHALL authenticate with GitHub using a GitHub App for accessing private EPF repositories.

The authentication SHALL:

- Sign JWTs using the App's private key
- Exchange JWTs for installation access tokens scoped to specific repositories
- Auto-rotate installation tokens before expiry (tokens last 1 hour)
- Support private key loading from file path or GCP Secret Manager reference

#### Scenario: Authenticate and fetch from private repository

- **WHEN** the server starts with GitHub App credentials configured
- **AND** the App is installed on the target repository
- **THEN** the server generates a JWT and exchanges it for an installation token
- **AND** uses the token to fetch EPF artifacts from the repository

#### Scenario: Installation token auto-rotation

- **WHEN** the current installation token is within 5 minutes of expiry
- **AND** a new GitHub API request is needed
- **THEN** the server automatically generates a new installation token
- **AND** subsequent requests use the fresh token

#### Scenario: Private key from Secret Manager

- **WHEN** the server is configured with `GITHUB_PRIVATE_KEY=sm://projects/PROJECT/secrets/SECRET/versions/latest`
- **THEN** the server fetches the private key from GCP Secret Manager
- **AND** uses it for JWT signing
