## ADDED Requirements

### Requirement: Development Mode Fast Compilation

The build system SHALL support fast compilation mode for development that separates TypeScript compilation from type checking.

#### Scenario: Developer starts server in watch mode

- **WHEN** the developer runs `npm run start:dev` or `nx run server:serve`
- **THEN** the server SHALL compile using SWC without type checking
- **AND** the server SHALL be ready to accept requests within 8 seconds of a cold start
- **AND** code changes SHALL be reflected within 3 seconds of saving a file

#### Scenario: Developer runs type checking separately

- **WHEN** the developer runs `npm run typecheck` or `nx run server:typecheck`
- **THEN** TypeScript SHALL perform full type checking
- **AND** errors SHALL be reported to the console
- **AND** the process SHALL exit with code 1 if errors are found

#### Scenario: Production build includes type checking

- **WHEN** the developer runs `npm run build` for production
- **THEN** the build SHALL include full TypeScript type checking
- **AND** the build SHALL fail if type errors exist

### Requirement: Development Database Configuration

The server SHALL support optimized database configuration for development environments to reduce startup time.

#### Scenario: Development startup skips migrations by default

- **WHEN** the server starts with `NODE_ENV=development`
- **AND** `SKIP_MIGRATIONS` is not explicitly set to `0`
- **THEN** database migrations SHALL NOT run automatically
- **AND** a log message SHALL indicate migrations are skipped

#### Scenario: Development startup uses minimal connection pool

- **WHEN** the server starts with `NODE_ENV=development`
- **AND** `DB_POOL_MIN` is not explicitly configured
- **THEN** the database connection pool SHALL initialize with a minimum of 1 connection
- **AND** additional connections SHALL be created on demand

#### Scenario: Production maintains existing behavior

- **WHEN** the server starts with `NODE_ENV=production`
- **THEN** migrations SHALL run by default (unless explicitly skipped)
- **AND** the connection pool SHALL use the configured minimum (default 5)

### Requirement: Deferred Worker Initialization

Background worker services SHALL support deferred initialization in development mode to allow the HTTP server to become responsive faster.

#### Scenario: Workers defer startup in development

- **WHEN** a worker service initializes with `NODE_ENV=development`
- **AND** `DEFER_WORKERS` is not set to `false`
- **THEN** the worker SHALL delay its startup by `WORKER_DEFER_MS` milliseconds (default 2000)
- **AND** the HTTP server SHALL be fully responsive before workers start

#### Scenario: Workers start immediately in production

- **WHEN** a worker service initializes with `NODE_ENV=production`
- **THEN** the worker SHALL start immediately during module initialization
- **AND** background processing SHALL begin as soon as the server is ready

#### Scenario: Developers can disable worker deferral

- **WHEN** a worker service initializes with `DEFER_WORKERS=false`
- **THEN** the worker SHALL start immediately regardless of environment
- **AND** this SHALL allow testing worker functionality without delays

#### Scenario: Worker defer delay is configurable

- **WHEN** `WORKER_DEFER_MS` is set to a numeric value
- **THEN** workers SHALL defer their startup by that number of milliseconds
- **AND** invalid values SHALL fall back to the default of 2000ms
