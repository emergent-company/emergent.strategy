## ADDED Requirements

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
