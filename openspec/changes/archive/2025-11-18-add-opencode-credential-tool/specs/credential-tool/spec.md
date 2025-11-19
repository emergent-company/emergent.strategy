# Specification: OpenCode Credential Tool

## ADDED Requirements

### Requirement: Provide Test User Credentials via OpenCode Tool

The system SHALL provide a custom OpenCode tool named `credentials` that retrieves test user credentials from environment variables.

#### Scenario: AI assistant requests test credentials during development

**Given** the developer has configured a `.env` file with test user credentials  
**When** an AI assistant calls the `credentials` tool  
**Then** the tool SHALL return structured JSON containing:

- Test user email and password (TEST_USER_EMAIL, TEST_USER_PASSWORD)
- E2E test user email and password (E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD)
- Application URLs (admin, server, Zitadel)
- Usage guidance for manual testing and DevTools MCP integration

#### Scenario: Environment file is missing

**Given** no `.env` file exists in the project root  
**When** an AI assistant calls the `credentials` tool  
**Then** the tool SHALL return an error message indicating the `.env` file is missing  
**And** the tool SHALL provide instructions to copy `.env.example` to `.env`

#### Scenario: Environment variables use default values

**Given** the `.env` file exists but TEST_USER_EMAIL is not defined  
**When** an AI assistant calls the `credentials` tool  
**Then** the tool SHALL use the default value `test@example.com` for TEST_USER_EMAIL  
**And** the tool SHALL use default values for any other missing variables matching the patterns in existing bash scripts

### Requirement: Environment Variable Loading

The credentials tool SHALL read environment variables from the `.env` file in the project root directory.

#### Scenario: Parse environment file with various formats

**Given** a `.env` file containing variables with different formats:

```
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD="TestPassword123!"
ADMIN_PORT=5176
```

**When** the credentials tool loads the environment  
**Then** the tool SHALL correctly parse quoted and unquoted values  
**And** the tool SHALL ignore comment lines starting with `#`  
**And** the tool SHALL ignore empty lines

### Requirement: Structured Output Format

The credentials tool SHALL return data in a structured JSON format that is easy for AI assistants to parse and use.

#### Scenario: Successful credential retrieval

**Given** all required environment variables are configured  
**When** the tool returns credentials  
**Then** the output SHALL include a JSON object with the following top-level keys:

- `testUser`: object with `email` and `password` fields
- `e2eUser`: object with `email` and `password` fields
- `urls`: object with `admin`, `server`, and `zitadel` fields
- `usage`: object with `purpose` and `devToolsWorkflow` fields

#### Scenario: Output includes contextual usage guidance

**Given** the tool successfully retrieves credentials  
**When** the JSON output is generated  
**Then** the `usage.purpose` field SHALL describe the difference between test users and E2E users  
**And** the `usage.devToolsWorkflow` field SHALL provide step-by-step instructions for manual testing with Chrome DevTools MCP

### Requirement: Integration with Existing Infrastructure

The credentials tool SHALL integrate seamlessly with existing test infrastructure and scripts.

#### Scenario: Default values match existing scripts

**Given** the default values defined in `get-test-user-credentials.sh` and `get-e2e-credentials.sh`  
**When** the credentials tool applies default values  
**Then** the defaults SHALL exactly match those in the bash scripts:

- TEST_USER_EMAIL: `test@example.com`
- TEST_USER_PASSWORD: `TestPassword123!`
- E2E_TEST_USER_EMAIL: `e2e-test@example.com`
- E2E_TEST_USER_PASSWORD: `E2eTestPassword123!`
- ADMIN_PORT: `5176`
- SERVER_PORT: `3002`
- ZITADEL_DOMAIN: `localhost:8200`
