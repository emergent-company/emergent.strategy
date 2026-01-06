# MCP Settings Guide Specification

## ADDED Requirements

### Requirement: MCP Configuration Settings Page

The admin panel SHALL provide a settings page at `/admin/settings/project/mcp` that displays MCP configuration information for the current project.

#### Scenario: User views MCP endpoint information

- **WHEN** a user navigates to `/admin/settings/project/mcp`
- **THEN** the page displays the MCP endpoint URL formatted for the current environment (e.g., `https://api.dev.emergent-company.ai/mcp/rpc`)
- **AND** the page indicates the project context is automatically included via `X-Project-Id` header or `initialize` params

#### Scenario: User copies MCP endpoint URL

- **WHEN** a user clicks the copy button next to the MCP endpoint URL
- **THEN** the URL is copied to the clipboard
- **AND** a toast notification confirms the copy action

### Requirement: Agent Configuration Examples

The MCP settings page SHALL display configuration examples for popular AI agents with copy-to-clipboard functionality.

#### Scenario: User views Claude Desktop configuration

- **WHEN** a user views the Claude Desktop configuration section
- **THEN** the page displays a JSON configuration snippet for `claude_desktop_config.json`
- **AND** the snippet includes the MCP server URL, authentication header placeholder, and project ID header
- **AND** a copy button allows copying the entire configuration

#### Scenario: User views Cursor IDE configuration

- **WHEN** a user views the Cursor configuration section
- **THEN** the page displays a JSON configuration snippet for `.cursor/mcp.json`
- **AND** the snippet follows Cursor's MCP configuration format

#### Scenario: User views Cline/Continue VS Code configuration

- **WHEN** a user views the VS Code extensions configuration section
- **THEN** the page displays configuration snippets for Cline and Continue extensions
- **AND** the snippets include VS Code settings.json format

#### Scenario: User views OpenCode configuration

- **WHEN** a user views the OpenCode configuration section
- **THEN** the page displays a JSONC configuration snippet for `opencode.jsonc`
- **AND** the snippet follows OpenCode's MCP server configuration format

### Requirement: API Token Management

The system SHALL allow users to create, view, and revoke API tokens for programmatic MCP access.

#### Scenario: User generates a new API token

- **WHEN** a user clicks "Generate Token" on the MCP settings page
- **THEN** a modal appears prompting for a token name/description
- **AND** the user can select permissions (schema:read, data:read, data:write)
- **AND** upon confirmation, a new token is generated and displayed once
- **AND** the user is warned that the token will only be shown once

#### Scenario: User views existing API tokens

- **WHEN** a user views the API tokens section
- **THEN** a table displays all tokens for the current project
- **AND** each row shows: token name, created date, last used date, permissions, and a revoke button
- **AND** the actual token value is NOT displayed (only shown once at creation)

#### Scenario: User revokes an API token

- **WHEN** a user clicks "Revoke" on an existing token
- **THEN** a confirmation dialog appears
- **AND** upon confirmation, the token is immediately invalidated
- **AND** subsequent API calls with that token return 401 Unauthorized

### Requirement: API Token Backend Support

The backend SHALL provide endpoints for API token management and validate API tokens alongside JWT tokens.

#### Scenario: Create API token endpoint

- **WHEN** a `POST /api/projects/:projectId/tokens` request is made with valid JWT authentication
- **THEN** a new API token is created in the database
- **AND** the response includes the token value (only returned once) and token metadata
- **AND** the token is scoped to the specified project

#### Scenario: List API tokens endpoint

- **WHEN** a `GET /api/projects/:projectId/tokens` request is made
- **THEN** the response includes all tokens for the project
- **AND** token values are NOT included in the response (security)

#### Scenario: Revoke API token endpoint

- **WHEN** a `DELETE /api/projects/:projectId/tokens/:tokenId` request is made
- **THEN** the token is marked as revoked in the database
- **AND** subsequent authentication attempts with that token fail

#### Scenario: API token validation in MCP requests

- **WHEN** an MCP request is made with `Authorization: Bearer <api_token>`
- **THEN** the AuthService validates the token against the `api_tokens` table
- **AND** if valid, the request is processed with the token's associated user and project context
- **AND** if the token is revoked or invalid, a 401 Unauthorized response is returned

### Requirement: Settings Sidebar Integration

The MCP settings page SHALL be accessible from the project settings sidebar navigation.

#### Scenario: MCP settings appears in sidebar

- **WHEN** a user views the project settings sidebar
- **THEN** an "MCP Integration" item appears in an "Integrations" group
- **AND** clicking it navigates to `/admin/settings/project/mcp`
