# environment-configuration Specification

## Purpose
TBD - created by archiving change reorganize-environment-variables. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL organize environment variables by application scope

Variables SHALL be located in the appropriate configuration file based on their usage:

**Root `.env`** - Workspace and shared variables:

- `NAMESPACE` - PM2 process namespace for workspace isolation
- `ADMIN_PORT` - Admin frontend port for workspace-cli
- `SERVER_PORT` - Backend API port for workspace-cli
- `ZITADEL_DOMAIN` - Zitadel domain for bootstrap scripts
- `E2E_TEST_USER_EMAIL` - E2E test user email
- `E2E_TEST_USER_PASSWORD` - E2E test user password
- `TEST_USER_EMAIL` - Manual test user email
- `TEST_USER_PASSWORD` - Manual test user password

**Root `.env.local`** - User-specific workspace overrides (gitignored):

- Any workspace variable override for local development
- User-specific secrets that should not be committed

**`apps/server/.env`** - Server application variables:

- `PORT` - Server listen port (defaults to SERVER_PORT if not set)
- `POSTGRES_HOST` - Database host
- `POSTGRES_PORT` - Database port
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DB` - Database name
- `POSTGRES_DB_E2E` - E2E test database name
- `DB_AUTOINIT` - Auto-initialize database on startup
- `APP_RLS_PASSWORD` - RLS role password
- `RLS_POLICY_STRICT` - Strict RLS policy enforcement
- `SKIP_DB` - Skip database initialization
- `SCOPES_DISABLED` - Disable scope enforcement
- `ORGS_DEMO_SEED` - Seed demo organizations
- `GCP_PROJECT_ID` - Google Cloud project ID
- `GOOGLE_API_KEY` - Google Gemini API key
- `GOOGLE_APPLICATION_CREDENTIALS` - GCP credentials file path
- `VERTEX_AI_LOCATION` - Vertex AI region
- `VERTEX_AI_MODEL` - Vertex AI model for extraction
- `VERTEX_EMBEDDING_LOCATION` - Vertex AI embedding region
- `VERTEX_EMBEDDING_MODEL` - Vertex AI embedding model
- `VERTEX_EMBEDDING_PROJECT` - Vertex AI embedding project
- `EMBEDDING_PROVIDER` - Embedding provider (vertex/google)
- `EMBEDDING_DIMENSION` - Vector dimension for embeddings
- `EMBEDDINGS_NETWORK_DISABLED` - Disable network calls for embeddings
- `CHAT_MODEL_ENABLED` - Enable chat model features
- `CHAT_SYSTEM_PROMPT` - Custom system prompt for chat
- `EXTRACTION_WORKER_ENABLED` - Enable extraction worker
- `EXTRACTION_WORKER_POLL_INTERVAL_MS` - Worker poll interval
- `EXTRACTION_WORKER_BATCH_SIZE` - Batch size for extraction
- `EXTRACTION_RATE_LIMIT_RPM` - Rate limit requests per minute
- `EXTRACTION_RATE_LIMIT_TPM` - Rate limit tokens per minute
- `EXTRACTION_ENTITY_LINKING_STRATEGY` - Entity linking strategy
- `EXTRACTION_CONFIDENCE_THRESHOLD_MIN` - Minimum confidence threshold
- `EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW` - Review confidence threshold
- `EXTRACTION_CONFIDENCE_THRESHOLD_AUTO` - Auto-create confidence threshold
- `EXTRACTION_DEFAULT_TEMPLATE_PACK_ID` - Default template pack ID
- `EXTRACTION_CHUNK_SIZE` - Maximum chunk size
- `EXTRACTION_CHUNK_OVERLAP` - Chunk overlap size
- `EXTRACTION_BASE_PROMPT` - Base prompt for extraction
- `LANGSMITH_TRACING` - Enable LangSmith tracing
- `LANGSMITH_ENDPOINT` - LangSmith API endpoint
- `LANGSMITH_API_KEY` - LangSmith API key
- `LANGSMITH_PROJECT` - LangSmith project name
- `ZITADEL_ISSUER` - Zitadel OIDC issuer URL
- `ZITADEL_CLIENT_ID` - Backend service account client ID
- `ZITADEL_CLIENT_SECRET` - Backend service account secret
- `ZITADEL_MAIN_ORG_ID` - Main organization ID
- `ZITADEL_CLIENT_JWT` - Client service account JWT
- `ZITADEL_CLIENT_JWT_PATH` - Client service account JWT file path
- `ZITADEL_API_JWT` - API service account JWT
- `ZITADEL_API_JWT_PATH` - API service account JWT file path
- `CORS_ORIGIN` - CORS allowed origin
- `GOOGLE_REDIRECT_URL` - Google OAuth redirect URL
- `BIBLE_SEED_API_URL` - Bible test data API URL
- `BIBLE_SEED_ACCESS_TOKEN` - Bible test data access token
- `BIBLE_SEED_RATE_LIMIT_MS` - Bible test data rate limit

**`apps/server/.env.local`** - User-specific server overrides (gitignored):

- Any server variable override for local development
- User-specific API keys, credentials, or test configurations

**`apps/admin/.env`** - Admin frontend variables:

- `ADMIN_PORT` - Frontend dev server port (may duplicate root for Vite)
- `VITE_ZITADEL_ISSUER` - OIDC issuer for frontend
- `VITE_ZITADEL_CLIENT_ID` - Public PKCE client ID
- `VITE_ZITADEL_REDIRECT_URI` - OAuth redirect URI
- `VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI` - Post-logout redirect URI
- `VITE_ZITADEL_SCOPES` - OAuth scopes
- `VITE_ZITADEL_AUDIENCE` - OAuth audience
- `VITE_API_BASE` - Backend API base URL
- `VITE_ENV` - Environment name
- `VITE_CLIENT_LOGGING` - Enable client-side logging

**`apps/admin/.env.local`** - User-specific admin overrides (gitignored):

- Any admin variable override for local development
- User-specific VITE\_\* configurations for testing

#### Scenario: Developer sets up local development environment

**Given** a developer has cloned the repository  
**When** they copy `.env.example` files to `.env` files  
**Then** all workspace variables SHALL be in root `.env`  
**And** all server variables SHALL be in `apps/server/.env`  
**And** all admin variables SHALL be in `apps/admin/.env`  
**And** no variables SHALL be duplicated across files unless explicitly documented

#### Scenario: Server application loads configuration

**Given** the server application is starting  
**When** configuration is loaded via `config.module.ts`  
**Then** server SHALL load files in this order:

1. `apps/server/.env.local` (user overrides, highest priority)
2. `apps/server/.env` (app-specific config)
3. Root `.env.local` (workspace user overrides)
4. Root `.env` (workspace defaults, lowest priority)
   **And** later files SHALL NOT override values from earlier files  
   **And** all required server variables SHALL be validated before startup

#### Scenario: Admin application loads configuration

**Given** the admin application is starting with Vite  
**When** Vite loads environment variables  
**Then** admin SHALL load files in this order:

1. `apps/admin/.env.local` (user overrides, highest priority)
2. `apps/admin/.env` (app defaults, lowest priority)
   **And** all `VITE_*` prefixed variables SHALL be exposed to the frontend  
   **And** non-`VITE_*` variables SHALL NOT be exposed to the frontend

#### Scenario: Workspace CLI starts services

**Given** workspace-cli is starting services  
**When** PM2 processes are configured  
**Then** workspace-cli SHALL load root environment files in this order:

1. Root `.env.local` (user overrides, highest priority)
2. Root `.env` (workspace defaults, lowest priority)
   **And** workspace-cli SHALL read `NAMESPACE`, `ADMIN_PORT`, `SERVER_PORT` from loaded environment  
   **And** workspace-cli SHALL NOT load application-specific variables  
   **And** services SHALL inherit environment variables from their respective `.env` files

### Requirement: The system SHALL provide clear documentation for environment variable organization

Each `.env.example` file SHALL include:

- Clear comments explaining the purpose of each section
- Indication of which variables are required vs optional
- Cross-references to related configuration in other files
- Migration notes for existing deployments

#### Scenario: Developer consults documentation

**Given** a developer needs to understand environment configuration  
**When** they review `.env.example` files  
**Then** comments SHALL clearly explain the purpose of each variable  
**And** required vs optional status SHALL be indicated  
**And** cross-references to related files SHALL be provided

### Requirement: The system SHALL separate committed defaults from user-specific overrides

The system SHALL enforce separation between committed defaults and user-specific overrides:

**Committed files** (`.env`, tracked in git):

- SHALL contain safe default values suitable for development
- SHALL NOT contain secrets, API keys, or sensitive credentials
- SHALL be documented in corresponding `.env.example` files
- SHALL provide working defaults that can be overridden locally

**Gitignored files** (`.env.local`, not tracked):

- SHALL be listed in `.gitignore` to prevent accidental commits
- SHALL be used for user-specific overrides of default values
- SHALL be the only place for secrets, API keys, and sensitive credentials
- SHALL take precedence over `.env` files when both exist
- MAY be created by developers as needed (not required if defaults work)

#### Scenario: Secret protection check

**Given** the system starts up  
**When** environment files are loaded  
**Then** the system SHALL warn if secrets are found in committed `.env` files  
**And** `.env.local` files SHALL NOT be tracked in git  
**And** user-specific overrides SHALL take precedence over defaults

### Requirement: The system SHALL maintain backward compatibility during migration

During the migration period, the system SHALL:

- Server SHALL check both `apps/server/.env` and root `.env` for variables
- Clear deprecation warnings SHALL be logged for variables in incorrect locations
- Migration guide SHALL document step-by-step process for updating configurations

#### Scenario: Existing deployment upgrades to new structure

**Given** an existing deployment with variables in root `.env`  
**When** the system is updated to new version  
**Then** server SHALL still read variables from root `.env` as fallback  
**And** deprecation warnings SHALL be logged for misplaced variables  
**And** system SHALL continue to function correctly  
**And** migration guide SHALL provide clear instructions for moving variables

