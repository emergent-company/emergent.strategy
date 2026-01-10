# api-client-mcp Specification

## Purpose
TBD - created by archiving change add-api-client-mcp. Update Purpose after archive.
## Requirements
### Requirement: API Endpoint Discovery

The MCP server SHALL provide a `list_endpoints` tool that returns available API endpoints from the OpenAPI specification.

#### Scenario: List all endpoints

- **WHEN** the agent calls `list_endpoints` with no filter
- **THEN** the tool returns an array of all endpoints with method, path, operationId, summary, and description

#### Scenario: Filter endpoints by search term

- **WHEN** the agent calls `list_endpoints` with filter "documents"
- **THEN** the tool returns only endpoints whose path, summary, or operationId contains "documents"

#### Scenario: OpenAPI spec not found

- **WHEN** the `openapi.yaml` file does not exist at the expected location
- **THEN** the tool returns an error message indicating the spec file is missing

### Requirement: API Invocation

The MCP server SHALL provide a `call_api` tool that invokes API endpoints with automatic authentication.

#### Scenario: GET request

- **WHEN** the agent calls `call_api` with method "GET" and path "/api/documents"
- **THEN** the tool returns the response status, headers, and JSON body

#### Scenario: POST request with body

- **WHEN** the agent calls `call_api` with method "POST", path "/api/documents", and a JSON body
- **THEN** the tool sends the request with Content-Type application/json and returns the response

#### Scenario: Path parameter substitution

- **WHEN** the agent calls `call_api` with path "/api/documents/{id}" and pathParams `{ "id": "abc123" }`
- **THEN** the tool substitutes the path parameter and calls `/api/documents/abc123`

#### Scenario: Query parameters

- **WHEN** the agent calls `call_api` with queryParams `{ "limit": "10", "offset": "0" }`
- **THEN** the tool appends query string `?limit=10&offset=0` to the URL

#### Scenario: API error response

- **WHEN** the API returns a 4xx or 5xx status code
- **THEN** the tool returns the status code and error body without throwing an exception

### Requirement: Automatic Authentication

The MCP server SHALL automatically acquire and manage OAuth tokens using the password grant flow.

#### Scenario: First API call acquires token

- **WHEN** an agent makes the first `call_api` request
- **THEN** the server acquires an access token from Zitadel before making the API call

#### Scenario: Token cached for subsequent calls

- **WHEN** an agent makes multiple `call_api` requests within the token validity period
- **THEN** the server reuses the cached token without requesting a new one

#### Scenario: Token refresh on expiry

- **WHEN** the cached token is expired or about to expire (within 5 minutes)
- **THEN** the server acquires a new token before making the API call

#### Scenario: Authentication failure

- **WHEN** the credentials in environment variables are invalid
- **THEN** the tool returns an error message indicating authentication failed

### Requirement: Environment Configuration

The MCP server SHALL read configuration from environment variables.

#### Scenario: Required environment variables

- **WHEN** the MCP server starts
- **THEN** it reads `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `ZITADEL_CLIENT_ID`, `ZITADEL_ISSUER`, and `SERVER_URL` from the environment

#### Scenario: Missing required variable

- **WHEN** a required environment variable is not set
- **THEN** the server logs an error and exits with a non-zero status code

### Requirement: OpenCode Agent Integration

An OpenCode agent SHALL be configured to use the API client MCP tools.

#### Scenario: Agent uses API tools

- **WHEN** a user asks an AI agent to "test the documents API"
- **THEN** the agent can use `list_endpoints` and `call_api` tools to discover and invoke endpoints

#### Scenario: Agent registered in OpenCode

- **WHEN** OpenCode starts
- **THEN** the api-client MCP server is available and the api-client agent is selectable

