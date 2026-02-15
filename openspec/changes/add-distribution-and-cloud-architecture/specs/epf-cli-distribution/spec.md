## ADDED Requirements

### Requirement: Automated Release Pipeline
The system SHALL produce cross-platform release binaries via CI/CD when a version tag is pushed.

#### Scenario: Tag triggers release
- **WHEN** a `v*` tag is pushed to `main`
- **THEN** GitHub Actions builds binaries for darwin/amd64, darwin/arm64, linux/amd64, linux/arm64, windows/amd64
- **AND** publishes them as a GitHub Release with SHA256 checksums

#### Scenario: CI runs on every push
- **WHEN** code is pushed or a PR is opened
- **THEN** the CI pipeline runs `go test ./...` and `go build`
- **AND** fails the PR if tests or build fail

### Requirement: Homebrew Distribution
The system SHALL be installable via Homebrew from a tap.

#### Scenario: Fresh install
- **WHEN** a user runs `brew install emergent-company/tap/epf-cli`
- **THEN** the latest release binary is downloaded and installed to the Homebrew prefix
- **AND** `epf-cli version` reports the correct version

#### Scenario: Upgrade
- **WHEN** a new version is released
- **AND** a user runs `brew upgrade epf-cli`
- **THEN** the binary is updated to the latest version

### Requirement: Update Notifications
The system SHALL notify users when a newer version is available.

#### Scenario: Newer version available
- **WHEN** a user runs any `epf-cli` command
- **AND** the installed version is older than the latest GitHub Release
- **AND** the last check was more than 24 hours ago
- **THEN** a notice is printed to stderr with the new version number and upgrade instructions

#### Scenario: Update check disabled
- **WHEN** `EPF_CLI_NO_UPDATE_CHECK=1` is set or `update_check: false` is in config
- **THEN** no update check is performed

#### Scenario: Self-update
- **WHEN** a user runs `epf-cli update`
- **THEN** the latest binary is downloaded from GitHub Releases and replaces the current binary
- **AND** if installed via Homebrew, the user is told to use `brew upgrade` instead

### Requirement: Remote Instance Loading
The system SHALL load EPF instances from GitHub repositories without requiring a local clone.

#### Scenario: Serve remote instance
- **WHEN** `epf-cli serve --remote owner/repo` is run
- **THEN** the EPF instance is fetched from the GitHub repository
- **AND** all MCP tools operate against the remote instance

#### Scenario: GitHub App authentication
- **WHEN** `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are configured
- **THEN** the system generates an Installation Access Token for the target repository
- **AND** uses the token to access private repository content

#### Scenario: Personal token fallback
- **WHEN** `--github-token` or `GITHUB_TOKEN` is provided
- **AND** no GitHub App credentials are configured
- **THEN** the system authenticates with the personal token

#### Scenario: Cached remote access
- **WHEN** a remote instance has been fetched within the cache TTL
- **THEN** the cached version is used without re-fetching
- **AND** the cache is refreshed in the background when stale

#### Scenario: Concurrent cache population
- **WHEN** multiple concurrent requests need the same uncached instance
- **THEN** only one GitHub API call is made (Singleflight)
- **AND** all callers receive the result when it completes

### Requirement: HTTP API Server
The system SHALL serve an HTTP REST API alongside the MCP server.

#### Scenario: HTTP API mode
- **WHEN** `epf-cli serve --http :8080` is run
- **THEN** REST endpoints are available that mirror MCP tool functionality
- **AND** responses are JSON-encoded

#### Scenario: Combined MCP and HTTP
- **WHEN** both `--http` and MCP transport are configured
- **THEN** both servers run concurrently sharing the same core logic

### Requirement: Docker Distribution
The system SHALL be available as a Docker image for cloud deployment.

#### Scenario: Pull and run
- **WHEN** a user runs `docker run ghcr.io/emergent-company/epf-cli serve --remote owner/repo --http :8080`
- **THEN** the container starts and serves the remote EPF instance over HTTP

#### Scenario: Image published on release
- **WHEN** a new version tag is pushed
- **THEN** a Docker image is built and pushed to ghcr.io/emergent-company/epf-cli

### Requirement: GCP Cloud Run Deployment
The system SHALL be deployable to GCP Cloud Run as the primary cloud hosting target.

#### Scenario: Cloud Run service start
- **WHEN** the container is deployed to Cloud Run
- **THEN** the service starts, fetches GitHub App credentials from Secret Manager
- **AND** begins serving MCP over SSE and HTTP API on the configured port

#### Scenario: Scale to zero
- **WHEN** no requests are received for the configured idle period
- **THEN** Cloud Run scales the service to zero instances
- **AND** the next request triggers a cold start that loads the instance from cache or GitHub

#### Scenario: Environment configuration
- **WHEN** `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `DEFAULT_REPO`, and `LOG_LEVEL` are set
- **THEN** the service uses these values for GitHub authentication, default instance, and logging

### Requirement: SaaS Agent Platform
The system SHALL support a multi-tenant agent-driven document engineering mode for SaaS deployment.

#### Scenario: Agent-driven EPF operations
- **WHEN** a client connects via ACP (Agent Client Protocol)
- **THEN** a headless agent (OpenCode or equivalent) is available to read, write, audit, and update EPF artifacts
- **AND** the agent operates within the client's tenant boundary

#### Scenario: Agent engine abstraction
- **WHEN** the platform is configured with a different agent engine
- **THEN** the ACP interface remains unchanged for clients
- **AND** the new engine handles EPF operations through the same protocol
