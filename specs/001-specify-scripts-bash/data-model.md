# Data Model: Unified Nx & PM2 Orchestration and Logging

## Workspace Command Catalog
- **Primary Key**: `commandId`
- **Fields**:
  - `commandId` (string) – unique Nx target identifier (e.g., `workspace:start`, `admin:start`)
  - `project` (string) – Nx project name (`admin`, `server-nest`, `docker-postgres`)
  - `action` (enum) – `setup | start | stop | restart | status | logs`
  - `executor` (string) – Nx executor reference (`@nx/workspace:run-commands`, `nx:run-script`)
  - `script` (string) – underlying CLI module path (e.g., `tools/workspace-cli/src/commands/start-service.ts`)
  - `envProfile` (string) – references Environment Profile key (`dev`, `staging`, `prod`)
  - `dependsOn` (array<string>) – prerequisite commands (e.g., `docker-postgres.start`)
  - `requiresDocker` (boolean) – indicates docker tooling needed
  - `description` (string) – human-readable purpose
- **Relationships**:
  - `envProfile` → **Environment Profile** (`profileId`)
  - `dependsOn` entries → other **Workspace Command Catalog** records

## Environment Profile
- **Primary Key**: `profileId`
- **Fields**:
  - `profileId` (string) – e.g., `dev`, `staging`, `prod`
  - `variables` (map<string, string>) – resolved environment variables for Nx executor
  - `secretsRefs` (array<string>) – references to external secret stores (e.g., Doppler keys)
  - `hostRequirements` (array<string>) – tooling prerequisites (docker, pm2)
  - `logRetentionDays` (number) – override for log retention, default 7
- **Relationships**:
  - Referenced by **Workspace Command Catalog**, **Application Process Profile**, **Docker Dependency Profile**

## Application Process Profile
- **Primary Key**: `processId`
- **Fields**:
  - `processId` (string) – stable PM2 process name (`admin-app`, `nest-api`)
  - `entryPoint` (string) – script executed by PM2 (`npm`, `node`, `pnpm` command)
  - `cwd` (string) – working directory for the process
  - `envProfile` (string) – Environment Profile reference
  - `restartPolicy` (object)
    - `maxRestarts` (number)
    - `minUptimeSec` (number)
    - `sleepBetweenMs` (number)
  - `logs` (object)
    - `outFile` (string) – path to stdout log
    - `errorFile` (string) – path to stderr log
  - `healthCheck` (object)
    - `url` (string | null) – optional HTTP endpoint for health verification
    - `timeoutMs` (number)
  - `dependencies` (array<string>) – Docker Dependency Profile identifiers required before start
- **Relationships**:
  - `envProfile` → **Environment Profile**
  - `dependencies` → **Docker Dependency Profile**
  - Reports status into **Unified Health Snapshot**

## Docker Dependency Profile
- **Primary Key**: `dependencyId`
- **Fields**:
  - `dependencyId` (string) – e.g., `postgres`, `zitadel`
  - `composeService` (string) – docker-compose service name
  - `startScript` (string) – script executed via PM2 to run compose commands
  - `stopScript` (string)
  - `envProfile` (string) – Environment Profile reference
  - `healthCheck` (object)
    - `type` (enum) – `docker-healthcheck | custom`
    - `command` (string) – optional custom command for health evaluation
    - `timeoutSec` (number)
  - `logs` (object)
    - `outFile` (string)
    - `errorFile` (string)
  - `restartPolicy` (object) – same structure as application profile but tuned for dependencies
- **Relationships**:
  - Associated Nx targets in **Workspace Command Catalog**
  - Contributes to **Unified Health Snapshot**

## Unified Health Snapshot
- **Primary Key**: composite of `timestamp` + `serviceId`
- **Fields**:
  - `timestamp` (ISO datetime)
  - `serviceId` (string) – references Application Process Profile or Docker Dependency Profile
  - `type` (enum) – `application | dependency`
  - `status` (enum) – `online | stopped | starting | failing | degraded`
  - `uptimeSec` (number)
  - `restartCount` (number)
  - `lastExitCode` (number | null)
  - `healthDetail` (string) – message from PM2 or docker health inspection
- **Relationships**:
  - `serviceId` links to Application Process Profile or Docker Dependency Profile

## Shared Log Archive
- **Primary Key**: `serviceId`
- **Fields**:
  - `serviceId` (string)
  - `stdoutPath` (string) – current stdout log file
  - `stderrPath` (string) – current stderr log file
  - `rotationPolicy` (object)
    - `retentionDays` (number)
    - `maxSizeMb` (number)
    - `compress` (boolean)
  - `archivePaths` (array<string>) – rotated log file paths
- **Relationships**:
  - `serviceId` → Application Process Profile or Docker Dependency Profile
- **Notes**:
  - Rotation managed via pm2-logrotate; metadata persisted in JSON alongside logs for tooling to consume.
