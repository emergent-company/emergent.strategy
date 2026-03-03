## ADDED Requirements

### Requirement: Interactive Connect TUI

The system SHALL provide an `epf-cli connect <server-url>` command that launches an interactive TUI guiding the user through connecting to a remote EPF server, authenticating, discovering workspaces, and selecting an instance.

The connect TUI SHALL progress through the following screens:

1. **Connect** — check server health, display server info (mode, version, name)
2. **Authenticate** — if not already authenticated, present authentication method selection and execute the chosen flow
3. **Workspaces** — list accessible EPF workspaces with arrow-key navigation
4. **Selected** — display instance details (feature count, OKR count) and a ready-to-paste MCP config snippet

The authenticate screen SHALL offer the following methods:

- **Login with GitHub** — GitHub Device Flow (recommended, zero-config)
- **Paste a GitHub Personal Access Token** — for users who already have a PAT or prefer not to use Device Flow
- **Paste an existing server token** — for users who authenticated via the browser OAuth flow and have a JWT from the callback response

All three methods SHALL result in a valid server session JWT stored in the local credential store.

The connect TUI SHALL:

- Skip authentication if a valid token already exists for the server URL
- Skip workspace selection if only one workspace is available
- Store the selected instance path alongside the token in the local credential store
- Display clear error messages when the server is unreachable, authentication fails, or no workspaces are found
- Exit cleanly on `q` or Ctrl+C at any point

#### Scenario: First-time connection via Device Flow

- **WHEN** user runs `epf-cli connect https://epf.emergent.so`
- **AND** no stored credentials exist for that server
- **THEN** the TUI checks server health and displays server info
- **AND** presents the authentication method selection
- **AND** when the user selects "Login with GitHub", initiates Device Flow authentication
- **AND** after authentication, lists the user's accessible workspaces
- **AND** after workspace selection, displays instance details and MCP config snippet

#### Scenario: Authentication via Personal Access Token

- **WHEN** user selects "Paste a GitHub Personal Access Token" on the authenticate screen
- **AND** enters a valid GitHub PAT
- **THEN** the TUI exchanges the PAT with the server via `POST /auth/token`
- **AND** stores the resulting session JWT
- **AND** proceeds to the workspaces screen

#### Scenario: Authentication via existing server token

- **WHEN** user selects "Paste an existing server token" on the authenticate screen
- **AND** enters a valid JWT
- **THEN** the TUI validates the JWT by calling the server's health or workspaces endpoint
- **AND** stores the JWT
- **AND** proceeds to the workspaces screen

#### Scenario: Reconnect with existing credentials

- **WHEN** user runs `epf-cli connect https://epf.emergent.so`
- **AND** a valid token and instance path exist in the credential store
- **THEN** the TUI skips authentication
- **AND** displays the previously selected workspace with an option to switch

#### Scenario: Server is unreachable

- **WHEN** user runs `epf-cli connect https://unreachable.example.com`
- **AND** the server does not respond to the health check
- **THEN** the TUI displays an error with the connection failure details
- **AND** exits with a non-zero status code

#### Scenario: Single workspace auto-selected

- **WHEN** the user has exactly one accessible EPF workspace
- **THEN** the TUI skips the workspace selection screen
- **AND** proceeds directly to displaying instance details

#### Scenario: No workspaces found

- **WHEN** the user authenticates but has no accessible EPF repositories
- **THEN** the TUI displays a message explaining that no EPF instances were found
- **AND** suggests initializing one with `epf-cli init`

### Requirement: GitHub Device Flow Login

The system SHALL provide an `epf-cli login` command that authenticates the user with a remote EPF server using GitHub's Device Flow, requiring no OAuth App registration by the user.

The login command SHALL:

- Ship a built-in GitHub OAuth App client ID in the binary (Device Flow does not require a client secret)
- Initiate the Device Flow by requesting a user code from GitHub
- Display the user code and verification URL to stderr
- Poll GitHub for authorization completion at the interval specified by GitHub
- On successful authorization, exchange the GitHub token with the target server via `POST /auth/token`
- Store the resulting session JWT, server URL, and user metadata in the local credential store
- Support `--server URL` flag to specify the target server
- Support `--device-client-id` flag to override the built-in OAuth App client ID

#### Scenario: Headless authentication via login command

- **WHEN** user runs `epf-cli login --server https://epf.emergent.so`
- **THEN** the CLI requests a device code from GitHub
- **AND** displays the verification URL and user code to stderr
- **AND** polls GitHub until the user authorizes in their browser
- **AND** exchanges the GitHub token with the server via `POST /auth/token`
- **AND** stores the session JWT in the local credential store
- **AND** prints "Authenticated as <username>" to stderr

#### Scenario: Login canceled by user

- **WHEN** user runs `epf-cli login` and presses Ctrl+C before authorizing
- **THEN** the CLI exits cleanly without storing any credentials

#### Scenario: Device Flow authorization times out

- **WHEN** user runs `epf-cli login` but does not authorize within GitHub's expiry window
- **THEN** the CLI displays an error indicating the code has expired
- **AND** exits with a non-zero status code

#### Scenario: Server rejects the GitHub token

- **WHEN** the CLI successfully completes the Device Flow
- **AND** the server's `POST /auth/token` returns an error
- **THEN** the CLI displays the server's error message
- **AND** does not store any credentials

### Requirement: Local Token Storage

The system SHALL store authentication credentials locally so that CLI commands can automatically authenticate with remote servers.

The token store SHALL:

- Store credentials in `~/.config/epf-cli/auth.json`
- Key entries by server URL
- Store the session JWT, username, user ID, selected instance path, and authentication timestamp per server
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
