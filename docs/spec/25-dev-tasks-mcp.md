# Development Tasks MCP Server Specification

**Status**: Draft  
**Created**: 2025-10-05  
**Type**: Model Context Protocol Server

## Overview

A specialized MCP server for managing development tasks, service lifecycle, and project workflows in the spec-server monorepo. Eliminates ad-hoc terminal commands and provides context-aware task execution with proper error handling, dependency management, and state tracking.

---

## Problem Statement

### Current Pain Points

1. **Manual Service Management**:
   - Must manually kill processes before restarting: `lsof -ti:3001 | xargs kill -9`
   - No awareness of what's already running
   - Port conflicts require manual resolution

2. **Context Switching**:
   - Terminal commands executed in wrong directory
   - Must remember correct paths: `cd apps/server && npm run build`
   - No monorepo-aware navigation

3. **Task Discovery**:
   - Must open `package.json` to find available scripts
   - No unified view of all tasks across workspaces
   - Hidden dependencies between tasks (build before test)

4. **Error Handling**:
   - Silent failures (background processes)
   - No retry logic
   - No cleanup on failure

5. **State Management**:
   - No tracking of what's running where
   - Can't query "what services are active?"
   - No health monitoring

---

## Solution: Dev Tasks MCP Server

A stateful MCP server that:
- Manages service lifecycle (start/stop/restart/health)
- Executes tasks from package.json with context awareness
- Tracks running processes and ports
- Provides dependency resolution
- Handles cleanup and error recovery
- Integrates with monorepo structure

---

## Architecture

### Core Components

```
dev-tasks-mcp/
├── src/
│   ├── server.ts              # Main MCP server
│   ├── services/
│   │   ├── ServiceManager.ts  # Service lifecycle
│   │   ├── ProcessTracker.ts  # Track running processes
│   │   ├── PortManager.ts     # Port allocation & conflicts
│   │   └── HealthChecker.ts   # Health monitoring
│   ├── tasks/
│   │   ├── TaskRegistry.ts    # Discover & cache tasks
│   │   ├── TaskExecutor.ts    # Execute with context
│   │   └── TaskDependency.ts  # Dependency resolution
│   ├── workspace/
│   │   ├── MonorepoResolver.ts # Find workspaces
│   │   └── PackageJsonParser.ts # Parse scripts
│   └── tools/
│       ├── service-tools.ts   # MCP tools for services
│       ├── task-tools.ts      # MCP tools for tasks
│       └── workspace-tools.ts # MCP tools for workspace
├── config/
│   └── services.json          # Service definitions
└── package.json
```

---

## MCP Tools Specification

### 1. Service Management Tools

#### `list_services`
List all defined services with their current status.

**Parameters**: None

**Returns**:
```typescript
{
  services: Array<{
    name: string;              // "backend", "frontend", "db"
    workspace: string;         // "apps/server"
    status: "running" | "stopped" | "error";
    pid?: number;              // Process ID if running
    port?: number;             // Port if network service
    uptime?: number;           // Seconds since start
    health?: "healthy" | "unhealthy" | "unknown";
    lastHealthCheck?: string;  // ISO timestamp
  }>;
}
```

**Example**:
```json
{
  "services": [
    {
      "name": "backend",
      "workspace": "apps/server",
      "status": "running",
      "pid": 51399,
      "port": 3001,
      "uptime": 3245,
      "health": "healthy",
      "lastHealthCheck": "2025-10-05T09:30:00Z"
    },
    {
      "name": "frontend",
      "workspace": "apps/admin",
      "status": "stopped"
    }
  ]
}
```

---

#### `start_service`
Start a service with automatic port conflict resolution.

**Parameters**:
```typescript
{
  name: string;           // Service name: "backend" | "frontend" | "db"
  options?: {
    force?: boolean;      // Force restart if running
    env?: Record<string, string>; // Override env vars
    port?: number;        // Override default port
    waitForHealth?: boolean; // Wait for health check (default: true)
    healthTimeout?: number;  // Health check timeout in seconds (default: 30)
  };
}
```

**Returns**:
```typescript
{
  success: boolean;
  service: string;
  pid: number;
  port: number;
  message: string;
  healthStatus?: "healthy" | "unhealthy";
  logs?: string[];  // Recent startup logs
}
```

**Behavior**:
1. Check if service already running → stop if `force: true`, otherwise error
2. Check port availability → kill conflicting process or allocate new port
3. Navigate to correct workspace
4. Load environment variables
5. Execute start command
6. Monitor startup logs for errors
7. Perform health check if `waitForHealth: true`
8. Track PID and port in state

**Example**:
```json
{
  "name": "backend",
  "options": {
    "force": true,
    "waitForHealth": true
  }
}
```

---

#### `stop_service`
Stop a running service gracefully.

**Parameters**:
```typescript
{
  name: string;           // Service name
  options?: {
    graceful?: boolean;   // Try SIGTERM before SIGKILL (default: true)
    timeout?: number;     // Grace period in seconds (default: 10)
  };
}
```

**Returns**:
```typescript
{
  success: boolean;
  service: string;
  message: string;
  killedPid?: number;
  forcedKill: boolean;  // True if SIGKILL was needed
}
```

---

#### `restart_service`
Stop and start a service.

**Parameters**: Same as `start_service`

**Returns**: Same as `start_service`

**Behavior**: Equivalent to `stop_service` + `start_service`

---

#### `check_health`
Check health of one or all services.

**Parameters**:
```typescript
{
  name?: string;  // Specific service or all if omitted
}
```

**Returns**:
```typescript
{
  services: Array<{
    name: string;
    status: "running" | "stopped";
    health: "healthy" | "unhealthy" | "unknown";
    endpoint?: string;        // Health endpoint URL
    responseTime?: number;    // Health check latency in ms
    lastCheck: string;        // ISO timestamp
    error?: string;           // Error message if unhealthy
  }>;
}
```

---

### 2. Task Management Tools

#### `list_tasks`
Discover all available npm/yarn scripts across workspaces.

**Parameters**:
```typescript
{
  workspace?: string;  // Filter by workspace path
  search?: string;     // Filter by script name/description
}
```

**Returns**:
```typescript
{
  workspaces: Array<{
    path: string;              // "apps/server"
    name: string;              // "@spec-server/server"
    tasks: Array<{
      name: string;            // "build"
      command: string;         // "tsc -p tsconfig.json"
      description?: string;    // From package.json description
      dependencies?: string[]; // Tasks that must run first
      tags?: string[];         // ["build", "compile"]
    }>;
  }>;
  total: number;
}
```

**Example Response**:
```json
{
  "workspaces": [
    {
      "path": "apps/server",
      "name": "@spec-server/server",
      "tasks": [
        {
          "name": "build",
          "command": "npm run clean && tsc -p tsconfig.json",
          "dependencies": ["clean"],
          "tags": ["build", "compile"]
        },
        {
          "name": "test",
          "command": "jest",
          "dependencies": ["build"],
          "tags": ["test", "unit"]
        }
      ]
    }
  ],
  "total": 24
}
```

---

#### `run_task`
Execute a task from package.json with context awareness.

**Parameters**:
```typescript
{
  workspace: string;      // "apps/server" or "." for root
  task: string;           // "build", "test", "lint"
  options?: {
    background?: boolean; // Run in background (default: false)
    env?: Record<string, string>; // Environment overrides
    args?: string[];      // Additional arguments
    runDependencies?: boolean; // Auto-run dependencies (default: true)
    captureOutput?: boolean;   // Return stdout/stderr (default: true)
  };
}
```

**Returns**:
```typescript
{
  success: boolean;
  workspace: string;
  task: string;
  exitCode: number;
  duration: number;      // Execution time in ms
  output?: string;       // stdout + stderr if captured
  pid?: number;          // If background task
  ranDependencies?: string[]; // Dependencies that were executed
}
```

**Behavior**:
1. Resolve workspace path (support relative paths)
2. Check if task exists in package.json
3. Resolve and run dependencies if `runDependencies: true`
4. Navigate to workspace directory
5. Execute task with proper environment
6. Stream output if foreground
7. Track PID if background
8. Return results

**Example**:
```json
{
  "workspace": "apps/server",
  "task": "build",
  "options": {
    "runDependencies": true,
    "captureOutput": true
  }
}
```

---

#### `stop_task`
Stop a background task.

**Parameters**:
```typescript
{
  workspace: string;
  task: string;
  pid?: number;  // If multiple instances running
}
```

**Returns**:
```typescript
{
  success: boolean;
  killed: number;  // Number of processes killed
}
```

---

### 3. Workspace Tools

#### `list_workspaces`
List all workspaces in the monorepo.

**Parameters**: None

**Returns**:
```typescript
{
  root: {
    path: string;
    name: string;
    version: string;
  };
  workspaces: Array<{
    path: string;
    name: string;
    version: string;
    type: "app" | "package" | "tool";
    scripts: string[];  // Available task names
  }>;
}
```

---

#### `get_workspace_info`
Get detailed information about a workspace.

**Parameters**:
```typescript
{
  workspace: string;  // Path or package name
}
```

**Returns**:
```typescript
{
  path: string;
  name: string;
  version: string;
  description?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  ports?: number[];      // Known ports used by this workspace
  services?: string[];   // Services defined in this workspace
}
```

---

### 4. Development Workflow Tools

#### `dev_setup`
One-command development environment setup.

**Parameters**:
```typescript
{
  workspaces?: string[];  // Specific workspaces or all if omitted
  tasks?: string[];       // Tasks to run (default: ["install", "build"])
}
```

**Returns**:
```typescript
{
  success: boolean;
  workspaces: Array<{
    path: string;
    tasks: Array<{
      name: string;
      success: boolean;
      duration: number;
      error?: string;
    }>;
  }>;
  totalDuration: number;
}
```

**Behavior**:
1. Install dependencies in all workspaces
2. Build in dependency order
3. Run any setup scripts
4. Verify all services can start

---

#### `dev_start`
Start all development services.

**Parameters**:
```typescript
{
  services?: string[];  // Specific services or all if omitted
  wait?: boolean;       // Wait for all to be healthy (default: true)
}
```

**Returns**:
```typescript
{
  success: boolean;
  services: Array<{
    name: string;
    started: boolean;
    healthy: boolean;
    port: number;
    error?: string;
  }>;
}
```

**Behavior**: Start backend, frontend, database in correct order with health checks.

---

#### `dev_stop`
Stop all development services.

**Parameters**:
```typescript
{
  services?: string[];  // Specific services or all if omitted
}
```

**Returns**:
```typescript
{
  success: boolean;
  stopped: string[];
  errors?: string[];
}
```

---

#### `dev_restart`
Restart all or specific services.

**Parameters**: Same as `dev_start`

**Returns**: Same as `dev_start`

---

#### `run_tests`
Run tests across workspaces.

**Parameters**:
```typescript
{
  workspaces?: string[];   // Specific workspaces or all
  type?: "unit" | "e2e" | "integration" | "all";
  watch?: boolean;         // Watch mode
  coverage?: boolean;      // Collect coverage
  bail?: boolean;          // Stop on first failure
}
```

**Returns**:
```typescript
{
  success: boolean;
  workspaces: Array<{
    path: string;
    type: string;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    coverage?: {
      lines: number;
      branches: number;
      functions: number;
      statements: number;
    };
    failures?: Array<{
      test: string;
      error: string;
    }>;
  }>;
  totalPassed: number;
  totalFailed: number;
  totalDuration: number;
}
```

---

### 5. Logging & Debugging Tools

#### `get_logs`
Get logs from a running service or task with filtering.

**Parameters**:
```typescript
{
  service?: string;     // Service name ("backend", "frontend")
  pid?: number;         // Specific process ID
  logFile?: string;     // Path to log file (e.g., "/tmp/backend.log")
  lines?: number;       // Number of lines (default: 100)
  tail?: boolean;       // Get last N lines (default: true)
  follow?: boolean;     // Stream logs in real-time (default: false)
  grep?: string;        // Filter pattern (case-insensitive)
  grepOptions?: {
    caseSensitive?: boolean;  // Case-sensitive search (default: false)
    invert?: boolean;         // Invert match (exclude lines) (default: false)
    regex?: boolean;          // Use regex pattern (default: false)
    context?: number;         // Show N lines before/after match
  };
  since?: string;       // ISO timestamp - show logs after this time
  until?: string;       // ISO timestamp - show logs before this time
  level?: string;       // Filter by log level ("error", "warn", "info", "debug")
}
```

**Returns**:
```typescript
{
  logs: Array<{
    timestamp?: string;   // Parsed timestamp if available
    level?: string;       // Log level if detected
    message: string;      // Full log line
    line: number;         // Line number in file
  }>;
  source: string;         // Service name, PID, or file path
  totalLines: number;     // Total lines in log file
  matchedLines: number;   // Lines matching grep filter
  truncated: boolean;     // True if more logs exist
}
```

**Example**:
```typescript
// Get last 50 lines containing "error" from backend
await mcp.call("get_logs", {
  service: "backend",
  lines: 50,
  grep: "error",
  grepOptions: { caseSensitive: false }
});

// Follow logs in real-time with pattern
await mcp.call("get_logs", {
  service: "backend",
  follow: true,
  grep: "gemini|langchain",
  grepOptions: { regex: true }
});

// Get logs from specific file with context
await mcp.call("get_logs", {
  logFile: "/tmp/backend.log",
  grep: "Database connection failed",
  grepOptions: { context: 5 }  // Show 5 lines before/after
});
```

---

#### `search_logs`
Advanced log search across all services with aggregation.

**Parameters**:
```typescript
{
  query: string;              // Search term or regex
  services?: string[];        // Filter by services (default: all)
  timeRange?: {
    start: string;            // ISO timestamp
    end: string;              // ISO timestamp
  };
  level?: string[];           // Filter by levels ["error", "warn"]
  limit?: number;             // Max results (default: 100)
  groupBy?: "service" | "level" | "hour";  // Aggregate results
}
```

**Returns**:
```typescript
{
  results: Array<{
    service: string;
    timestamp: string;
    level: string;
    message: string;
    context: string[];  // Surrounding lines
  }>;
  summary: {
    totalMatches: number;
    byService: Record<string, number>;
    byLevel: Record<string, number>;
    byHour: Record<string, number>;
  };
}
```

---

#### `clear_logs`
Clear logs for a service or all services.

**Parameters**:
```typescript
{
  service?: string;      // Specific service or all if omitted
  backup?: boolean;      // Create backup before clearing (default: true)
  olderThan?: number;    // Only clear logs older than N days
}
```

**Returns**:
```typescript
{
  success: boolean;
  cleared: string[];     // List of cleared log files
  backupPaths?: string[]; // Backup file paths if created
  freedSpace: number;    // Bytes freed
}
```

---

#### `tail_logs`
Tail multiple log files simultaneously (like `tail -f`).

**Parameters**:
```typescript
{
  services: string[];    // Services to tail
  grep?: string;         // Filter pattern
  colorize?: boolean;    // Color-code by service (default: true)
}
```

**Returns**:
```typescript
{
  streamId: string;      // ID to stop stream later
  message: string;       // "Tailing logs from backend, frontend..."
}
```

---

### 6. Port & Process Management

#### `check_ports`
Check port availability and conflicts.

**Parameters**:
```typescript
{
  ports?: number[];      // Specific ports or all known ports
  includeSystem?: boolean; // Include system processes (default: false)
}
```

**Returns**:
```typescript
{
  ports: Array<{
    port: number;
    available: boolean;
    service?: string;    // Service name if managed by MCP
    pid?: number;        // Process ID
    command?: string;    // Full command line
    user?: string;       // Process owner
    protocol?: "tcp" | "udp";
  }>;
  conflicts: Array<{   // Ports needed by services but occupied
    port: number;
    neededBy: string;  // Service name
    occupiedBy: {
      pid: number;
      command: string;
    };
  }>;
}
```

---

#### `kill_port`
Kill process occupying a specific port.

**Parameters**:
```typescript
{
  port: number;
  force?: boolean;     // Use SIGKILL immediately (default: false)
}
```

**Returns**:
```typescript
{
  success: boolean;
  port: number;
  killedPid: number;
  message: string;
}
```

---

#### `list_processes`
List all processes managed by MCP or matching criteria.

**Parameters**:
```typescript
{
  managed?: boolean;   // Only MCP-managed processes (default: true)
  pattern?: string;    // Filter by command pattern
  ports?: number[];    // Filter by port usage
}
```

**Returns**:
```typescript
{
  processes: Array<{
    pid: number;
    command: string;
    service?: string;  // If managed by MCP
    workspace?: string;
    port?: number;
    cpu?: number;      // CPU usage percentage
    memory?: number;   // Memory in MB
    uptime: number;    // Seconds
    status: "running" | "sleeping" | "zombie";
  }>;
}
```

---

### 7. Database Tools

#### `db_status`
Check database connection and health.

**Parameters**: None

**Returns**:
```typescript
{
  connected: boolean;
  host: string;
  port: number;
  database: string;
  version: string;
  activeConnections: number;
  maxConnections: number;
  diskUsage: {
    total: number;     // GB
    used: number;      // GB
    available: number; // GB
  };
}
```

---

#### `db_query`
Execute read-only SQL query.

**Parameters**:
```typescript
{
  query: string;
  params?: any[];
  format?: "json" | "table" | "csv";
}
```

**Returns**:
```typescript
{
  rows: any[];
  rowCount: number;
  duration: number;    // Query time in ms
  formatted?: string;  // If format specified
}
```

---

#### `db_migrations`
Manage database migrations.

**Parameters**:
```typescript
{
  action: "status" | "up" | "down" | "create";
  steps?: number;      // For up/down
  name?: string;       // For create
}
```

**Returns**:
```typescript
{
  action: string;
  migrations: Array<{
    id: string;
    name: string;
    executedAt?: string;
    pending: boolean;
  }>;
  message: string;
}
```

---

### 8. Git & Version Control Tools

#### `git_status`
Get git status with smart insights.

**Parameters**:
```typescript
{
  workspace?: string;  // Specific workspace or root
}
```

**Returns**:
```typescript
{
  branch: string;
  ahead: number;       // Commits ahead of remote
  behind: number;      // Commits behind remote
  modified: string[];
  staged: string[];
  untracked: string[];
  conflicts: string[];
  stashed: number;
  clean: boolean;
  needsRebuild: boolean;  // True if package.json/lock files changed
  needsRestart: boolean;  // True if config files changed
}
```

---

#### `git_diff`
Get diff with smart filtering.

**Parameters**:
```typescript
{
  workspace?: string;
  files?: string[];
  staged?: boolean;
  filter?: "code" | "config" | "docs" | "tests";
}
```

**Returns**:
```typescript
{
  files: Array<{
    path: string;
    status: "modified" | "added" | "deleted";
    additions: number;
    deletions: number;
    diff: string;
  }>;
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
}
```

---

#### `git_sync`
Smart git pull with automatic conflict resolution suggestions.

**Parameters**:
```typescript
{
  workspace?: string;
  stash?: boolean;     // Stash changes before pull (default: true)
  rebuild?: boolean;   // Rebuild if needed (default: true)
  restart?: boolean;   // Restart services if needed (default: false)
}
```

**Returns**:
```typescript
{
  success: boolean;
  changes: {
    filesChanged: number;
    commits: number;
  };
  conflicts?: string[];
  rebuilt: boolean;
  restarted: boolean;
  message: string;
}
```

---

### 9. Dependency Management

#### `check_dependencies`
Check for outdated or vulnerable dependencies.

**Parameters**:
```typescript
{
  workspace?: string;
  outdated?: boolean;  // Check for updates (default: true)
  security?: boolean;  // Check for vulnerabilities (default: true)
}
```

**Returns**:
```typescript
{
  outdated: Array<{
    package: string;
    current: string;
    wanted: string;    // Respecting semver range
    latest: string;
    breaking: boolean; // Major version change
  }>;
  vulnerabilities: Array<{
    package: string;
    severity: "low" | "moderate" | "high" | "critical";
    title: string;
    url: string;
  }>;
  summary: {
    totalOutdated: number;
    totalVulnerabilities: number;
    criticalVulnerabilities: number;
  };
}
```

---

#### `update_dependencies`
Update dependencies safely.

**Parameters**:
```typescript
{
  workspace?: string;
  packages?: string[];  // Specific packages or all
  mode?: "patch" | "minor" | "major";
  test?: boolean;       // Run tests after update (default: true)
}
```

**Returns**:
```typescript
{
  success: boolean;
  updated: Array<{
    package: string;
    from: string;
    to: string;
  }>;
  failed: Array<{
    package: string;
    error: string;
  }>;
  testsPass: boolean;
}
```

---

### 10. Performance & Monitoring

#### `monitor_performance`
Monitor service performance metrics.

**Parameters**:
```typescript
{
  service: string;
  duration?: number;   // Monitoring duration in seconds (default: 60)
  interval?: number;   // Sample interval in seconds (default: 5)
}
```

**Returns**:
```typescript
{
  service: string;
  metrics: Array<{
    timestamp: string;
    cpu: number;       // Percentage
    memory: number;    // MB
    requests?: number; // If web service
    responseTime?: number; // Avg ms
  }>;
  summary: {
    avgCpu: number;
    maxCpu: number;
    avgMemory: number;
    maxMemory: number;
    avgResponseTime?: number;
  };
}
```

---

#### `profile_request`
Profile a specific API request.

**Parameters**:
```typescript
{
  service: string;
  endpoint: string;
  method?: string;
  samples?: number;    // Number of requests (default: 10)
}
```

**Returns**:
```typescript
{
  endpoint: string;
  samples: number;
  results: Array<{
    responseTime: number; // ms
    statusCode: number;
    dbQueries?: number;
    cacheHits?: number;
  }>;
  summary: {
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p95ResponseTime: number;
    successRate: number;
  };
}
```

---

### 11. Environment & Configuration

#### `get_env`
Get environment variables for a service.

**Parameters**:
```typescript
{
  service?: string;    // Specific service or all
  filter?: string;     // Filter by key pattern
  includeValues?: boolean; // Show values or just keys (default: false)
}
```

**Returns**:
```typescript
{
  services: Array<{
    name: string;
    env: Record<string, string | "[HIDDEN]">;
    missing?: string[];  // Required vars that are missing
  }>;
}
```

---

#### `set_env`
Set environment variable for a service.

**Parameters**:
```typescript
{
  service: string;
  key: string;
  value: string;
  restart?: boolean;   // Restart service to apply (default: true)
  persist?: boolean;   // Save to .env file (default: false)
}
```

**Returns**:
```typescript
{
  success: boolean;
  service: string;
  key: string;
  restarted: boolean;
  persisted: boolean;
}
```

---

#### `validate_config`
Validate configuration files.

**Parameters**:
```typescript
{
  workspace?: string;
  files?: string[];    // Specific files or all config files
}
```

**Returns**:
```typescript
{
  files: Array<{
    path: string;
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  }>;
  allValid: boolean;
}
```

---

## Service Definitions

Configuration file: `config/services.json`

```json
{
  "services": [
    {
      "name": "backend",
      "workspace": "apps/server",
      "port": 3001,
      "startCommand": "npm start",
      "healthCheck": {
        "endpoint": "http://localhost:3001/health",
        "interval": 5000,
        "timeout": 30000,
        "expectedStatus": 200,
        "expectedBody": { "ok": true }
      },
      "env": {
        "NODE_ENV": "development",
        "PORT": "3001"
      },
      "dependencies": ["db"],
      "logFile": "logs/backend.log"
    },
    {
      "name": "frontend",
      "workspace": "apps/admin",
      "port": 5175,
      "startCommand": "npm run dev",
      "healthCheck": {
        "endpoint": "http://localhost:5175",
        "interval": 5000,
        "timeout": 30000,
        "expectedStatus": 200
      },
      "dependencies": ["backend"]
    },
    {
      "name": "db",
      "type": "external",
      "port": 5432,
      "healthCheck": {
        "command": "pg_isready -h localhost -p 5432",
        "interval": 5000,
        "timeout": 10000
      }
    }
  ]
}
```

---

## State Management

The MCP server maintains state in memory:

```typescript
interface MCPState {
  services: Map<string, ServiceState>;
  processes: Map<number, ProcessInfo>;
  tasks: Map<string, TaskState>;
  ports: Map<number, PortInfo>;
  workspaces: WorkspaceCache;
}

interface ServiceState {
  name: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  pid?: number;
  port?: number;
  startedAt?: Date;
  health: HealthStatus;
  lastHealthCheck?: Date;
  restartCount: number;
  logs: string[];  // Recent logs (rolling buffer)
}

interface ProcessInfo {
  pid: number;
  command: string;
  workspace: string;
  service?: string;
  task?: string;
  startedAt: Date;
  port?: number;
}

interface TaskState {
  workspace: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  pid?: number;
  startedAt?: Date;
  completedAt?: Date;
  exitCode?: number;
}
```

---

## Error Handling

### Port Conflicts

```typescript
// When starting service and port is occupied:
{
  "error": {
    "code": "PORT_IN_USE",
    "message": "Port 3001 is already in use by PID 12345",
    "port": 3001,
    "pid": 12345,
    "command": "node dist/main.js",
    "suggestions": [
      "Stop the conflicting process: stop_service backend",
      "Use a different port: start_service backend --port 3002",
      "Force restart: start_service backend --force"
    ]
  }
}
```

### Service Failed to Start

```typescript
{
  "error": {
    "code": "SERVICE_START_FAILED",
    "message": "Backend service failed to start",
    "service": "backend",
    "exitCode": 1,
    "logs": [
      "Error: Cannot connect to database",
      "Connection refused at localhost:5432"
    ],
    "suggestions": [
      "Check if database is running: check_health db",
      "Start database first: start_service db",
      "Check database connection in .env file"
    ]
  }
}
```

### Task Not Found

```typescript
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task 'buld' not found in workspace 'apps/server'",
    "workspace": "apps/server",
    "task": "buld",
    "availableTasks": ["build", "test", "lint", "start", "dev"],
    "suggestions": [
      "Did you mean 'build'?",
      "List all tasks: list_tasks --workspace apps/server"
    ]
  }
}
```

---

## Usage Examples

### Example 1: Starting Development Environment

```typescript
// AI Assistant flow:

// 1. Check current state
const services = await mcp.call("list_services");
// -> backend: stopped, frontend: stopped, db: running

// 2. Start all services
const result = await mcp.call("dev_start", {
  wait: true
});

// Response:
{
  "success": true,
  "services": [
    {
      "name": "backend",
      "started": true,
      "healthy": true,
      "port": 3001
    },
    {
      "name": "frontend", 
      "started": true,
      "healthy": true,
      "port": 5175
    }
  ]
}
```

### Example 2: Running Tests After Build

```typescript
// AI detects code changes, needs to rebuild and test

// 1. Build backend
const build = await mcp.call("run_task", {
  workspace: "apps/server",
  task: "build",
  options: { runDependencies: true }
});

// 2. Run tests
const tests = await mcp.call("run_tests", {
  workspaces: ["apps/server"],
  type: "unit",
  bail: false
});

// Response:
{
  "success": true,
  "workspaces": [{
    "path": "apps/server",
    "passed": 145,
    "failed": 0,
    "duration": 12500
  }]
}
```

### Example 3: Debugging Port Conflict

```typescript
// User reports: "Can't start backend"

// 1. Check what's using the port
const ports = await mcp.call("check_ports", {
  ports: [3001]
});

// Response shows conflict:
{
  "ports": [{
    "port": 3001,
    "available": false,
    "pid": 51399,
    "command": "node dist/main.js"
  }]
}

// 2. Stop conflicting service
await mcp.call("stop_service", {
  name: "backend"
});

// 3. Start fresh
await mcp.call("start_service", {
  name: "backend",
  options: { waitForHealth: true }
});
```

### Example 4: Debugging with Log Search

```typescript
// User reports: "Backend is throwing errors"

// 1. Search for recent errors
const logs = await mcp.call("get_logs", {
  service: "backend",
  lines: 100,
  grep: "error",
  grepOptions: { caseSensitive: false }
});

// 2. If pattern unclear, search across services
const search = await mcp.call("search_logs", {
  query: "Database connection failed",
  services: ["backend"],
  timeRange: {
    start: "2025-10-05T08:00:00Z",
    end: "2025-10-05T10:00:00Z"
  }
});

// Response shows pattern:
{
  "results": [
    {
      "service": "backend",
      "timestamp": "2025-10-05T09:15:23Z",
      "level": "error",
      "message": "Database connection failed: Connection refused",
      "context": [
        "Attempting to connect to postgres://localhost:5432",
        "Retrying in 5 seconds...",
        "Database connection failed: Connection refused"
      ]
    }
  ],
  "summary": {
    "totalMatches": 15,
    "byLevel": { "error": 15 },
    "byHour": { "09": 15 }
  }
}

// 3. Check database status
await mcp.call("check_health", { name: "db" });
```

### Example 5: Investigating Performance Issue

```typescript
// User reports: "API is slow"

// 1. Check current service performance
const perf = await mcp.call("monitor_performance", {
  service: "backend",
  duration: 60,
  interval: 5
});

// Shows high CPU and memory
{
  "summary": {
    "avgCpu": 85,
    "maxCpu": 98,
    "avgMemory": 1024,
    "maxMemory": 1536
  }
}

// 2. Profile specific endpoint
const profile = await mcp.call("profile_request", {
  service: "backend",
  endpoint: "/api/extraction-jobs",
  samples: 10
});

// Shows slow queries
{
  "summary": {
    "avgResponseTime": 3500,
    "p95ResponseTime": 5200,
    "dbQueries": 25  // Too many queries!
  }
}

// 3. Check database connections
const db = await mcp.call("db_status");
// Shows: activeConnections: 95, maxConnections: 100

// 4. Look for slow queries in logs
const logs = await mcp.call("get_logs", {
  service: "backend",
  grep: "query executed",
  grepOptions: { context: 2 }
});
```

### Example 6: After Git Pull

```typescript
// User ran `git pull`, AI helps with post-pull tasks

// 1. Check what changed
const git = await mcp.call("git_status");

// Response shows package.json changed
{
  "branch": "master",
  "modified": ["package.json", "apps/server/package.json"],
  "needsRebuild": true,
  "needsRestart": true
}

// 2. Check for dependency changes
const deps = await mcp.call("check_dependencies", {
  outdated: false,
  security: true
});

// Shows new vulnerabilities
{
  "vulnerabilities": [
    {
      "package": "axios",
      "severity": "moderate",
      "title": "Axios SSRF vulnerability"
    }
  ]
}

// 3. Reinstall dependencies
await mcp.call("run_task", {
  workspace: ".",
  task: "install"
});

// 4. Rebuild affected workspaces
await mcp.call("run_task", {
  workspace: "apps/server",
  task: "build"
});

// 5. Restart services
await mcp.call("dev_restart", {
  services: ["backend"]
});

// 6. Run tests to verify
await mcp.call("run_tests", {
  workspaces: ["apps/server"],
  type: "unit"
});
```

### Example 7: Debugging Environment Issues

```typescript
// User reports: "Service won't start, says missing API key"

// 1. Check environment variables
const env = await mcp.call("get_env", {
  service: "backend",
  includeValues: false  // Don't expose secrets
});

// Shows missing vars
{
  "services": [{
    "name": "backend",
    "env": {
      "NODE_ENV": "[HIDDEN]",
      "PORT": "[HIDDEN]",
      "DATABASE_URL": "[HIDDEN]"
    },
    "missing": ["GOOGLE_API_KEY", "OPENAI_API_KEY"]
  }]
}

// 2. Validate config files
const config = await mcp.call("validate_config", {
  workspace: "apps/server"
});

// 3. Check .env file exists
const workspace = await mcp.call("get_workspace_info", {
  workspace: "apps/server"
});

// 4. Guide user to add missing env vars
// AI provides instructions with examples
```

### Example 8: Real-time Log Monitoring

```typescript
// User wants to watch logs while testing

// 1. Start tailing multiple services
const tail = await mcp.call("tail_logs", {
  services: ["backend", "frontend"],
  grep: "error|warn",
  colorize: true
});

// Returns stream ID: "tail-xyz-123"

// 2. User tests feature...

// 3. Stop tailing when done
await mcp.call("stop_stream", {
  streamId: "tail-xyz-123"
});
```

### Example 9: Database Migration

```typescript
// User needs to run pending migrations

// 1. Check migration status
const migrations = await mcp.call("db_migrations", {
  action: "status"
});

// Shows pending migrations
{
  "migrations": [
    {
      "id": "010",
      "name": "add-extraction-jobs-table",
      "pending": true
    }
  ]
}

// 2. Run migrations
await mcp.call("db_migrations", {
  action: "up"
});

// 3. Verify database health
await mcp.call("db_status");

// 4. Restart backend to use new schema
await mcp.call("restart_service", {
  name: "backend",
  options: { waitForHealth: true }
});
```

### Example 10: Pre-Commit Checks

```typescript
// User about to commit, AI runs pre-commit checks

// 1. Check git status
const git = await mcp.call("git_status");

// 2. Run linter on modified files
const lint = await mcp.call("run_task", {
  workspace: "apps/server",
  task: "lint",
  options: {
    args: ["--fix"]  // Auto-fix issues
  }
});

// 3. Run tests
const tests = await mcp.call("run_tests", {
  workspaces: ["apps/server"],
  type: "unit",
  bail: true  // Stop on first failure
});

// 4. Type check
const typecheck = await mcp.call("run_task", {
  workspace: "apps/admin",
  task: "build"  // Runs type check
});

// 5. All passed, safe to commit
if (tests.success && typecheck.success) {
  // AI: "All checks passed! Safe to commit."
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up MCP server boilerplate
- [ ] Implement ServiceManager (start/stop/health)
- [ ] Implement ProcessTracker (PID tracking)
- [ ] Implement PortManager (conflict detection)
- [ ] Create services.json config
- [ ] Test basic service lifecycle

### Phase 2: Task Management (Week 2)
- [ ] Implement TaskRegistry (discover npm scripts)
- [ ] Implement TaskExecutor (run with context)
- [ ] Add dependency resolution
- [ ] Support background tasks
- [ ] Test task execution

### Phase 3: Workspace Integration (Week 3)
- [ ] Implement MonorepoResolver
- [ ] Parse package.json across workspaces
- [ ] Add workspace navigation
- [ ] Test multi-workspace operations

### Phase 4: MCP Tools (Week 4)
- [ ] Implement all service management tools
- [ ] Implement all task management tools
- [ ] Implement workspace tools
- [ ] Implement workflow tools
- [ ] Add comprehensive error handling

### Phase 5: Testing & Documentation (Week 5)
- [ ] Unit tests for all components
- [ ] Integration tests for workflows
- [ ] Example scenarios
- [ ] User documentation
- [ ] AI assistant integration guide

---

## Benefits

### For AI Assistants
✅ **Context-Aware**: Knows workspace structure and current state  
✅ **Error Recovery**: Suggests fixes for common problems  
✅ **Idempotent**: Safe to call repeatedly (checks state first)  
✅ **Discoverable**: Can query available tasks and services  
✅ **Atomic Operations**: Each tool does one thing well  

### For Developers
✅ **No Manual Process Management**: Never manually kill -9 again  
✅ **Consistent**: Same commands work across all workspaces  
✅ **Fast**: No context switching or directory navigation  
✅ **Safe**: Graceful shutdowns, health checks, validation  
✅ **Debuggable**: Logs, health status, process tracking  

---

## Configuration

### Environment Variables

```bash
# MCP Server
MCP_SERVER_PORT=3100
MCP_LOG_LEVEL=info
MCP_STATE_FILE=.dev-tasks-state.json

# Service Defaults
DEFAULT_HEALTH_CHECK_TIMEOUT=30000
DEFAULT_HEALTH_CHECK_INTERVAL=5000
DEFAULT_GRACE_PERIOD=10000

# Workspace
MONOREPO_ROOT=/Users/mcj/code/spec-server
PACKAGE_MANAGER=npm  # or yarn, pnpm
```

---

## Security Considerations

1. **Process Isolation**: Only manage processes started by this MCP server
2. **Port Restrictions**: Validate ports are in allowed range (3000-9000)
3. **Command Validation**: Only run commands from package.json
4. **File System Access**: Restrict to monorepo directory
5. **Environment Variables**: Don't expose sensitive values in logs

---

## Future Enhancements

### Phase 6+
- [ ] Service auto-restart on crash
- [ ] Resource monitoring (CPU, memory)
- [ ] Log aggregation and search
- [ ] Task scheduling (cron-like)
- [ ] Docker container management
- [ ] Database migration tools
- [ ] Deployment workflows
- [ ] Performance profiling
- [ ] Cost tracking (API usage)

---

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Monorepo Tools Best Practices](https://monorepo.tools)

---

## Appendix: Common Workflows

### Morning Startup
```typescript
await mcp.call("dev_setup");      // Install, build if needed
await mcp.call("dev_start");       // Start all services
await mcp.call("check_health");    // Verify everything healthy
```

### After Git Pull
```typescript
await mcp.call("run_task", {
  workspace: ".",
  task: "install"  // Update dependencies
});
await mcp.call("dev_restart");  // Restart with new code
```

### Before Git Push
```typescript
await mcp.call("run_task", {
  workspace: "apps/server",
  task: "lint"
});
await mcp.call("run_tests", { type: "all" });
await mcp.call("run_task", {
  workspace: "apps/admin",
  task: "build"
});
```

### End of Day Cleanup
```typescript
await mcp.call("dev_stop");  // Stop all services
await mcp.call("get_logs", {
  lines: 500  // Save recent logs
});
```

---

## Frequently Used Commands Reference

### Quick Log Investigation Patterns

```typescript
// 1. Last 50 errors from backend
await mcp.call("get_logs", {
  service: "backend",
  lines: 50,
  grep: "error|exception|failed",
  grepOptions: { regex: true, caseSensitive: false }
});

// 2. Find all database connection errors with context
await mcp.call("get_logs", {
  service: "backend",
  grep: "database connection",
  grepOptions: { context: 5, caseSensitive: false }
});

// 3. Search for specific function calls
await mcp.call("get_logs", {
  service: "backend",
  grep: "ExtractionJobService",
  lines: 100
});

// 4. Recent warnings from all services
await mcp.call("search_logs", {
  query: "warn",
  level: ["warn"],
  timeRange: {
    start: new Date(Date.now() - 3600000).toISOString(), // Last hour
    end: new Date().toISOString()
  }
});

// 5. Live tail with filtering (like: tail -f | grep "error")
await mcp.call("tail_logs", {
  services: ["backend"],
  grep: "error|warn",
  colorize: true
});

// 6. Check logs from specific time period
await mcp.call("get_logs", {
  service: "backend",
  since: "2025-10-05T09:00:00Z",
  until: "2025-10-05T10:00:00Z",
  grep: "extraction"
});
```

### Port & Process Management Patterns

```typescript
// 1. Kill everything on port 3001 (equivalent to: lsof -ti:3001 | xargs kill -9)
await mcp.call("kill_port", { port: 3001, force: true });

// 2. Check all common development ports
await mcp.call("check_ports", {
  ports: [3000, 3001, 5173, 5174, 5175, 5432, 6379]
});

// 3. Find what's running and using resources
await mcp.call("list_processes", {
  managed: false,  // Show all processes, not just MCP-managed
  pattern: "node"
});

// 4. Clean restart when port is stuck
await mcp.call("stop_service", { name: "backend" });
await mcp.call("kill_port", { port: 3001, force: true });
await mcp.call("start_service", { 
  name: "backend",
  options: { waitForHealth: true }
});
```

### Database Quick Checks

```typescript
// 1. Is database up?
await mcp.call("db_status");

// 2. Quick query (read-only)
await mcp.call("db_query", {
  query: "SELECT COUNT(*) FROM kb.notifications WHERE created_at > NOW() - INTERVAL '1 hour'",
  format: "json"
});

// 3. Check pending migrations
await mcp.call("db_migrations", { action: "status" });

// 4. Connection pool status
await mcp.call("db_query", {
  query: "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active'",
  format: "table"
});
```

### Service Health Checks

```typescript
// 1. Quick health check all services
await mcp.call("check_health");

// 2. Detailed backend health with logs
const health = await mcp.call("check_health", { name: "backend" });
if (!health.services[0].healthy) {
  await mcp.call("get_logs", {
    service: "backend",
    lines: 50,
    grep: "error"
  });
}

// 3. Monitor service over time
await mcp.call("monitor_performance", {
  service: "backend",
  duration: 30,
  interval: 5
});
```

### Task Execution Patterns

```typescript
// 1. Build everything in dependency order
await mcp.call("run_task", {
  workspace: ".",
  task: "build",
  options: { runDependencies: true }
});

// 2. Run tests in watch mode
await mcp.call("run_task", {
  workspace: "apps/admin",
  task: "test",
  options: {
    args: ["--watch"],
    background: true
  }
});

// 3. Lint and auto-fix
await mcp.call("run_task", {
  workspace: "apps/server",
  task: "lint",
  options: {
    args: ["--fix"]
  }
});

// 4. Type check without building
await mcp.call("run_task", {
  workspace: "apps/admin",
  task: "type-check"
});
```

### Git Workflow Patterns

```typescript
// 1. Check if rebuild needed after pull
const status = await mcp.call("git_status");
if (status.needsRebuild) {
  await mcp.call("run_task", { workspace: ".", task: "install" });
}
if (status.needsRestart) {
  await mcp.call("dev_restart");
}

// 2. Pre-commit validation
await mcp.call("run_task", { workspace: ".", task: "lint" });
await mcp.call("run_tests", { type: "unit", bail: true });

// 3. Check for conflicts before push
const git = await mcp.call("git_status");
if (git.conflicts.length > 0) {
  // AI: Show conflict files and suggest resolution
}
```

### Environment & Configuration

```typescript
// 1. Verify all required env vars exist
await mcp.call("get_env", {
  service: "backend",
  includeValues: false
});

// 2. Validate all config files
await mcp.call("validate_config", {
  workspace: "apps/server"
});

// 3. Set env var and restart
await mcp.call("set_env", {
  service: "backend",
  key: "LOG_LEVEL",
  value: "debug",
  restart: true,
  persist: false  // Don't save to .env file
});
```

### Dependency Management

```typescript
// 1. Check for security vulnerabilities
await mcp.call("check_dependencies", {
  security: true,
  outdated: false
});

// 2. Update patch versions only (safe)
await mcp.call("update_dependencies", {
  mode: "patch",
  test: true
});

// 3. Check specific package version
await mcp.call("db_query", {
  query: "SELECT version FROM information_schema.tables WHERE table_name = 'migrations'",
  format: "table"
});
```

### Performance Debugging

```typescript
// 1. Profile slow endpoint
await mcp.call("profile_request", {
  service: "backend",
  endpoint: "/api/chat/conversations",
  method: "GET",
  samples: 20
});

// 2. Monitor resource usage
await mcp.call("monitor_performance", {
  service: "backend",
  duration: 60,
  interval: 5
});

// 3. Check for memory leaks
const before = await mcp.call("list_processes", { pattern: "node" });
// ... run test that might leak
await new Promise(resolve => setTimeout(resolve, 60000));
const after = await mcp.call("list_processes", { pattern: "node" });
// Compare memory usage
```

### Common Error Recovery Patterns

```typescript
// Pattern 1: "Port already in use"
await mcp.call("check_ports", { ports: [3001] });
await mcp.call("kill_port", { port: 3001, force: true });
await mcp.call("start_service", { name: "backend" });

// Pattern 2: "Service won't start"
await mcp.call("get_logs", { 
  service: "backend", 
  lines: 50,
  grep: "error|failed"
});
await mcp.call("check_health", { name: "db" });
await mcp.call("get_env", { service: "backend" });

// Pattern 3: "Database connection failed"
await mcp.call("db_status");
await mcp.call("check_ports", { ports: [5432] });
await mcp.call("check_health", { name: "db" });

// Pattern 4: "Build failed"
await mcp.call("get_logs", {
  service: "backend",
  grep: "error|failed",
  grepOptions: { context: 3 }
});
await mcp.call("check_dependencies", { workspace: "apps/server" });

// Pattern 5: "Tests failing"
await mcp.call("run_tests", {
  workspaces: ["apps/server"],
  type: "unit",
  bail: false  // Run all tests to see all failures
});
await mcp.call("get_env", { service: "backend" });
```

### Development Session Patterns

```typescript
// Start of day
async function startDay() {
  // Check git status
  const git = await mcp.call("git_status");
  
  // Pull latest if behind
  if (git.behind > 0) {
    await mcp.call("git_sync", { rebuild: true, restart: true });
  }
  
  // Start services
  await mcp.call("dev_start", { wait: true });
  
  // Verify health
  await mcp.call("check_health");
  
  // Check for security issues
  const deps = await mcp.call("check_dependencies", { security: true });
  if (deps.summary.criticalVulnerabilities > 0) {
    // AI: Alert about critical vulnerabilities
  }
}

// End of day
async function endDay() {
  // Save recent logs
  await mcp.call("get_logs", {
    service: "backend",
    lines: 1000,
    logFile: "/tmp/backend-backup.log"
  });
  
  // Stop all services
  await mcp.call("dev_stop");
  
  // Clear old logs (optional)
  await mcp.call("clear_logs", {
    olderThan: 7,  // Keep last 7 days
    backup: true
  });
}

// Quick restart (when something is broken)
async function quickRestart() {
  // Stop everything
  await mcp.call("dev_stop");
  
  // Kill any stuck processes
  await mcp.call("kill_port", { port: 3001, force: true });
  await mcp.call("kill_port", { port: 5175, force: true });
  
  // Start fresh
  await mcp.call("dev_start", { wait: true });
  
  // Tail logs to watch for errors
  await mcp.call("tail_logs", {
    services: ["backend", "frontend"],
    grep: "error|warn"
  });
}
```

---

**Status**: Ready for implementation  
**Priority**: High  
**Effort**: 5 weeks  
**Impact**: Eliminates 80% of manual terminal commands
