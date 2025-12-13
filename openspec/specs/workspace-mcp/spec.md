# workspace-mcp Specification

## Purpose
TBD - created by archiving change add-workspace-mcp. Update Purpose after archive.
## Requirements
### Requirement: Service Status Tool

The workspace-mcp server SHALL provide a `get_status` tool that returns the current status of all services and dependencies as structured JSON.

#### Scenario: Get status of all services and dependencies

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `get_status` tool with default parameters
**Then** the tool SHALL return a JSON object containing:

- `services`: array of service objects with name, running state, PID, ports, and uptime
- `dependencies`: array of dependency objects with name, running state, type, and ports
- `summary`: counts of running vs total services and dependencies
- `remoteMode`: boolean indicating if SKIP_DOCKER_DEPS is enabled

#### Scenario: Get status of services only

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `get_status` tool with `includeDependencies: false`
**Then** the tool SHALL return only service status, with empty dependencies array

---

### Requirement: List Services Tool

The workspace-mcp server SHALL provide a `list_services` tool that returns configured services and dependencies without checking runtime status.

#### Scenario: List all configured services

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `list_services` tool
**Then** the tool SHALL return a JSON object containing:

- `services`: array of service configurations with id, description, ports, and healthCheckUrl
- `dependencies`: array of dependency configurations with id, description, ports, and type

---

### Requirement: Health Check Tool

The workspace-mcp server SHALL provide a `health_check` tool that runs a health check on a specific service.

#### Scenario: Health check on a running service

**Given** the workspace-mcp server is running
**And** the "server" service is running and healthy
**When** an AI assistant calls the `health_check` tool with `service: "server"`
**Then** the tool SHALL return a JSON object with:

- `service`: "server"
- `healthy`: true
- `statusCode`: 200
- `latencyMs`: response time in milliseconds
- `error`: null

#### Scenario: Health check on a stopped service

**Given** the workspace-mcp server is running
**And** the "server" service is stopped
**When** an AI assistant calls the `health_check` tool with `service: "server"`
**Then** the tool SHALL return a JSON object with:

- `service`: "server"
- `healthy`: false
- `error`: connection error message

---

### Requirement: Configuration Tool

The workspace-mcp server SHALL provide a `get_config` tool that returns the compiled environment configuration from `.env` and `.env.local` files with sensitive values masked by default.

#### Scenario: Get all configuration with masked secrets

**Given** the workspace-mcp server is running
**And** `.env` and `.env.local` files exist with configuration
**When** an AI assistant calls the `get_config` tool with default parameters
**Then** the tool SHALL return a JSON object with:

- `sources`: array of loaded env files
- `config`: categorized configuration (database, auth, server, ai)
- `validation`: validation results including missing vars and issues
- Sensitive values SHALL be masked (e.g., "\*\*\*\*")

#### Scenario: Get configuration for specific category

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `get_config` tool with `category: "database"`
**Then** the tool SHALL return only database-related configuration variables

#### Scenario: Get configuration with unmasked secrets

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `get_config` tool with `showSecrets: true`
**Then** the tool SHALL return configuration with full secret values visible

---

### Requirement: Start Service Tool

The workspace-mcp server SHALL provide a `start_service` tool that starts one or more services.

#### Scenario: Start a specific service

**Given** the workspace-mcp server is running
**And** the "server" service is stopped
**When** an AI assistant calls the `start_service` tool with `services: ["server"]`
**Then** the tool SHALL start the server service
**And** SHALL return a JSON object with:

- `started`: ["server"]
- `alreadyRunning`: []
- `failed`: []

#### Scenario: Start all services with dependencies

**Given** the workspace-mcp server is running
**When** an AI assistant calls the `start_service` tool with `includeDependencies: true`
**Then** the tool SHALL start dependencies first, then all services
**And** SHALL return a JSON object listing started, already running, and failed services

---

### Requirement: Stop Service Tool

The workspace-mcp server SHALL provide a `stop_service` tool that stops one or more services.

#### Scenario: Stop a specific service

**Given** the workspace-mcp server is running
**And** the "server" service is running
**When** an AI assistant calls the `stop_service` tool with `services: ["server"]`
**Then** the tool SHALL stop the server service
**And** SHALL return a JSON object with:

- `stopped`: ["server"]
- `alreadyStopped`: []
- `failed`: []

---

### Requirement: Restart Service Tool

The workspace-mcp server SHALL provide a `restart_service` tool that restarts one or more services.

#### Scenario: Restart a specific service

**Given** the workspace-mcp server is running
**And** the "server" service is running
**When** an AI assistant calls the `restart_service` tool with `services: ["server"]`
**Then** the tool SHALL stop and then start the server service
**And** SHALL return a JSON object with:

- `restarted`: ["server"]
- `failed`: []

---

### Requirement: MCP Server Configuration

The workspace-mcp server SHALL be configured in OpenCode and VS Code configuration files.

#### Scenario: OpenCode configuration

**Given** the `opencode.jsonc` file exists
**When** a user starts OpenCode
**Then** the workspace-mcp server SHALL be available as an MCP server
**And** tools SHALL be accessible with `workspace_` prefix

#### Scenario: VS Code configuration

**Given** the `.vscode/mcp.json` file exists
**When** a user opens the workspace in VS Code with MCP support
**Then** the workspace-mcp server SHALL be available

