# Specification: OpenCode Logs Tool

## ADDED Requirements

### Requirement: Provide Log Retrieval via OpenCode Tool

The system SHALL provide a custom OpenCode tool named `logs` that retrieves recent log entries from application and dependency log files.

#### Scenario: AI assistant requests logs for all services

**Given** the workspace has running services with log files in `apps/logs/`  
**When** an AI assistant calls the `logs` tool with query "all"  
**Then** the tool SHALL return the last 50 lines from all log files:

- admin/out.log and admin/error.log
- server/out.log and server/error.log
- dependencies/postgres/out.log and dependencies/postgres/error.log
- dependencies/zitadel/out.log and dependencies/zitadel/error.log

**And** the output SHALL be formatted with clear service labels

#### Scenario: AI assistant requests logs for specific service

**Given** the workspace has running services with log files  
**When** an AI assistant calls the `logs` tool with query "server" or "api"  
**Then** the tool SHALL return the last 50 lines from:

- server/out.log
- server/error.log

**And** the output SHALL be labeled with the service name

#### Scenario: AI assistant requests logs for web frontend

**Given** the workspace has running services with log files  
**When** an AI assistant calls the `logs` tool with query "admin" or "web"  
**Then** the tool SHALL return the last 50 lines from:

- admin/out.log
- admin/error.log

#### Scenario: AI assistant requests database logs

**Given** the workspace has dependency log files  
**When** an AI assistant calls the `logs` tool with query "database" or "postgres"  
**Then** the tool SHALL return the last 50 lines from:

- dependencies/postgres/out.log
- dependencies/postgres/error.log

#### Scenario: AI assistant requests multiple specific services

**Given** the workspace has running services with log files  
**When** an AI assistant calls the `logs` tool with query "admin and server"  
**Then** the tool SHALL return the last 50 lines from both services:

- admin/out.log and admin/error.log
- server/out.log and server/error.log

#### Scenario: Log file does not exist

**Given** a service has no log file (file missing or not yet created)  
**When** an AI assistant calls the `logs` tool for that service  
**Then** the tool SHALL return a message indicating the log file is missing  
**And** the tool SHALL continue processing other requested log files

### Requirement: Query Pattern Parsing

The logs tool SHALL parse natural language queries to determine which services to retrieve logs from.

#### Scenario: Query pattern mapping

**Given** the user provides a query string  
**When** the tool parses the query  
**Then** the tool SHALL map query patterns as follows:

- "all" → all services (admin, server, postgres, zitadel)
- "admin" or "web" → admin service
- "server" or "api" → server service
- "database" or "postgres" or "db" → postgres dependency
- "zitadel" → zitadel dependency
- Multiple patterns separated by "and" or "," → combine services

#### Scenario: Case-insensitive query matching

**Given** the user provides a query with mixed case (e.g., "Admin", "SERVER")  
**When** the tool parses the query  
**Then** the tool SHALL match patterns case-insensitively

### Requirement: Configurable Line Limit

The logs tool SHALL support a configurable line limit for how many recent lines to retrieve from each log file.

#### Scenario: Default line limit

**Given** no line limit is specified  
**When** the tool retrieves log files  
**Then** the tool SHALL return the last 50 lines from each file

#### Scenario: Custom line limit

**Given** the user specifies a custom line limit (e.g., 100)  
**When** the tool retrieves log files  
**Then** the tool SHALL return the last N lines from each file as specified

### Requirement: Formatted Output

The logs tool SHALL return log data in a well-formatted structure that is easy for AI assistants to parse and present to users.

#### Scenario: Output formatting with service labels

**Given** the tool retrieves logs from multiple services  
**When** the tool formats the output  
**Then** the output SHALL include:

- Clear section headers for each service (e.g., "=== admin/out.log ===")
- Separator lines between different log files
- Service type identifier (application vs dependency)
- File type identifier (stdout vs stderr)

#### Scenario: Empty log file

**Given** a log file exists but is empty  
**When** the tool reads the file  
**Then** the tool SHALL return a message "(no log entries)" for that file

### Requirement: File System Integration

The logs tool SHALL read log files from the workspace log directory structure used by the workspace CLI.

#### Scenario: Log file path resolution

**Given** the workspace CLI stores logs in `apps/logs/`  
**When** the tool resolves log paths  
**Then** the tool SHALL use the following structure:

- Application logs: `apps/logs/<serviceId>/out.log` and `apps/logs/<serviceId>/error.log`
- Dependency logs: `apps/logs/dependencies/<dependencyId>/out.log` and `apps/logs/dependencies/<dependencyId>/error.log`

#### Scenario: Reading last N lines efficiently

**Given** a log file may be very large (several MB)  
**When** the tool reads the last N lines  
**Then** the tool SHALL read from the end of the file efficiently without loading the entire file into memory
