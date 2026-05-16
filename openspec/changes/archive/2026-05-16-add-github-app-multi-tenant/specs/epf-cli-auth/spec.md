## ADDED Requirements

### Requirement: GitHub App Multi-Tenant Configuration

The system SHALL support configuring a GitHub App for multi-tenant mode via environment variables, enabling installation-scoped repo access instead of broad OAuth `repo` scope.

The configuration SHALL accept:

- `EPF_GITHUB_APP_ID` — the GitHub App's numeric ID
- `EPF_GITHUB_APP_PRIVATE_KEY` — the App's RSA private key (PEM-encoded, or path to PEM file)
- `EPF_OAUTH_CLIENT_ID` — the App's OAuth client ID (used for user authentication)
- `EPF_OAUTH_CLIENT_SECRET` — the App's OAuth client secret

When all GitHub App env vars are set alongside OAuth env vars, the server SHALL operate in multi-tenant mode with GitHub App authentication. The OAuth flow SHALL request only `read:user` scope.

#### Scenario: GitHub App configured for multi-tenant mode

- **WHEN** the server starts with `EPF_GITHUB_APP_ID`, `EPF_GITHUB_APP_PRIVATE_KEY`, `EPF_OAUTH_CLIENT_ID`, and `EPF_OAUTH_CLIENT_SECRET` set
- **THEN** the server creates an `InstallationTokenManager` with the App credentials
- **AND** configures OAuth to request only `read:user` scope
- **AND** operates in multi-tenant mode with installation-scoped access

#### Scenario: Missing GitHub App private key

- **WHEN** `EPF_GITHUB_APP_ID` is set but `EPF_GITHUB_APP_PRIVATE_KEY` is not
- **THEN** the server logs an error and exits
- **AND** the error message indicates the private key is required when App ID is set

## MODIFIED Requirements

### Requirement: Local Token Storage

The system SHALL store authentication credentials locally so that CLI commands can automatically authenticate with remote servers.

The token store SHALL:

- Store credentials in `~/.config/epf-cli/auth.json`
- Key entries by server URL
- Store the session JWT, username, user ID, selected instance path, authentication timestamp, and authentication method (oauth, pat, device-flow) per server
- Allow multiple server entries (one per server URL)
- Create the file with 0600 permissions (owner read/write only)

#### Scenario: Stored token is used by connect command

- **WHEN** user runs `epf-cli connect <server-url>`
- **AND** a valid token exists in the credential store for that server
- **THEN** the connect TUI skips the authentication screen

#### Scenario: Token file does not exist

- **WHEN** a CLI command needs credentials for a server
- **AND** no token file exists
- **THEN** the CLI indicates authentication is required

#### Scenario: Token file has restricted permissions

- **WHEN** the CLI writes the credential store
- **THEN** the file is created with 0600 permissions (owner read/write only)
