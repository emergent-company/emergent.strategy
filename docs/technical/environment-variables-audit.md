# Environment Variables Audit & Reorganization Plan

This document lists all environment variables detected in the codebase, their default values (where applicable), and their proposed location in the new environment variable organization structure.

## 1. Root `.env` (Workspace & Shared)

These variables are used by the workspace CLI, bootstrap scripts, or shared across multiple applications.

| Variable                 | Default | Description                                   | Used By               |
| ------------------------ | ------- | --------------------------------------------- | --------------------- |
| `NAMESPACE`              | -       | PM2 process namespace for workspace isolation | workspace-cli         |
| `ADMIN_PORT`             | -       | Frontend port (often same as VITE port)       | workspace-cli         |
| `SERVER_PORT`            | -       | Backend API port                              | workspace-cli         |
| `ZITADEL_DOMAIN`         | -       | Zitadel domain                                | workspace-cli, server |
| `ZITADEL_HTTP_PORT`      | -       | Zitadel HTTP port                             | workspace-cli         |
| `ZITADEL_LOGIN_PORT`     | -       | Zitadel Login port                            | workspace-cli         |
| `E2E_TEST_USER_EMAIL`    | -       | E2E test user email                           | tests                 |
| `E2E_TEST_USER_PASSWORD` | -       | E2E test user password                        | tests                 |
| `TEST_USER_EMAIL`        | -       | Manual test user email                        | tests                 |
| `TEST_USER_PASSWORD`     | -       | Manual test user password                     | tests                 |

## 2. `apps/server/.env` (Server Application)

These variables are used exclusively by the NestJS server application.

### Core Configuration

| Variable         | Default | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `PORT`           | `3002`  | Server listen port                          |
| `NODE_ENV`       | -       | Environment (development, production, test) |
| `DEBUG_ENV_LOAD` | -       | Debug flag for environment loading          |
| `CORS_ORIGIN`    | -       | Allowed CORS origin                         |

### Database (PostgreSQL)

| Variable            | Default     | Description                              |
| ------------------- | ----------- | ---------------------------------------- |
| `POSTGRES_HOST`     | `localhost` | Database host                            |
| `POSTGRES_PORT`     | `5432`      | Database port                            |
| `POSTGRES_USER`     | `spec`      | Database user                            |
| `POSTGRES_PASSWORD` | `spec`      | Database password                        |
| `POSTGRES_DB`       | `spec`      | Database name                            |
| `POSTGRES_DB_E2E`   | -           | E2E test database name                   |
| `DB_AUTOINIT`       | `false`     | Auto-initialize database schema          |
| `SKIP_DB`           | -           | Skip database connection (for build/gen) |
| `SKIP_MIGRATIONS`   | -           | Skip running migrations                  |
| `APP_RLS_PASSWORD`  | -           | Password for RLS bypass role             |
| `RLS_POLICY_STRICT` | `false`     | Strict RLS policy enforcement            |

### Authentication & Authorization (Zitadel)

| Variable                  | Default | Description                          |
| ------------------------- | ------- | ------------------------------------ |
| `ZITADEL_ISSUER`          | -       | OIDC Issuer URL                      |
| `ZITADEL_PROJECT_ID`      | -       | Zitadel Project ID                   |
| `ZITADEL_CLIENT_JWT`      | -       | Service account JWT content          |
| `ZITADEL_CLIENT_JWT_PATH` | -       | Path to service account JWT file     |
| `ZITADEL_API_JWT`         | -       | API service account JWT content      |
| `ZITADEL_API_JWT_PATH`    | -       | Path to API service account JWT file |
| `ZITADEL_MAIN_ORG_ID`     | -       | Main organization ID                 |
| `AUTH_ISSUER`             | -       | Auth issuer (if different)           |
| `AUTH_AUDIENCE`           | -       | Auth audience                        |
| `AUTH_JWKS_URI`           | -       | JWKS URI                             |
| `SCOPES_DISABLED`         | -       | Disable scope enforcement (dev only) |

### AI & Extraction (Vertex AI / Gemini)

| Variable                         | Default          | Description                                   |
| -------------------------------- | ---------------- | --------------------------------------------- |
| `GCP_PROJECT_ID`                 | -                | Google Cloud Project ID                       |
| `GOOGLE_APPLICATION_CREDENTIALS` | -                | Path to GCP credentials JSON                  |
| `GOOGLE_API_KEY`                 | -                | API Key for Google services                   |
| `VERTEX_AI_LOCATION`             | -                | Vertex AI region                              |
| `VERTEX_AI_MODEL`                | -                | Extraction model (e.g., gemini-1.5-flash-002) |
| `VERTEX_EMBEDDING_LOCATION`      | -                | Embedding model region                        |
| `VERTEX_EMBEDDING_MODEL`         | -                | Embedding model name                          |
| `VERTEX_EMBEDDING_PROJECT`       | `GCP_PROJECT_ID` | Project for embeddings                        |
| `EMBEDDING_PROVIDER`             | -                | Provider (vertex/google)                      |
| `EMBEDDINGS_NETWORK_DISABLED`    | `false`          | Disable embedding network calls               |
| `CHAT_MODEL_ENABLED`             | `false`          | Enable chat features                          |
| `CHAT_SYSTEM_PROMPT`             | -                | System prompt for chat                        |

### Extraction Worker

| Variable                                 | Default      | Description                   |
| ---------------------------------------- | ------------ | ----------------------------- |
| `EXTRACTION_WORKER_ENABLED`              | `false`      | Enable background worker      |
| `EXTRACTION_WORKER_POLL_INTERVAL_MS`     | `5000`       | Poll interval in ms           |
| `EXTRACTION_WORKER_BATCH_SIZE`           | `5`          | Items per batch               |
| `EXTRACTION_RATE_LIMIT_RPM`              | `60`         | Requests per minute           |
| `EXTRACTION_RATE_LIMIT_TPM`              | `30000`      | Tokens per minute             |
| `EXTRACTION_ENTITY_LINKING_STRATEGY`     | `always_new` | Strategy for linking entities |
| `EXTRACTION_CONFIDENCE_THRESHOLD_MIN`    | `0.0`        | Minimum confidence to accept  |
| `EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW` | `0.7`        | Threshold to flag for review  |
| `EXTRACTION_CONFIDENCE_THRESHOLD_AUTO`   | `0.85`       | Threshold to auto-approve     |
| `EXTRACTION_DEFAULT_TEMPLATE_PACK_ID`    | `...775`     | Default template pack UUID    |
| `EXTRACTION_CHUNK_SIZE`                  | `100000`     | Max characters per chunk      |
| `EXTRACTION_CHUNK_OVERLAP`               | `2000`       | Chunk overlap characters      |
| `EXTRACTION_BASE_PROMPT`                 | -            | Base prompt override          |

### LangSmith / LangChain (Tracing)

| Variable              | Default | Description               |
| --------------------- | ------- | ------------------------- |
| `LANGSMITH_TRACING`   | -       | Enable LangSmith tracing  |
| `LANGSMITH_ENDPOINT`  | -       | LangSmith API endpoint    |
| `LANGSMITH_API_KEY`   | -       | LangSmith API key         |
| `LANGSMITH_PROJECT`   | -       | LangSmith project name    |
| `LANGCHAIN_TRACING_V` | -       | LangChain tracing version |
| `LANGCHAIN_ENDPOINT`  | -       | LangChain endpoint        |
| `LANGCHAIN_API_KEY`   | -       | LangChain API key         |
| `LANGCHAIN_PROJECT`   | -       | LangChain project         |

### Miscellaneous / Debug

| Variable                    | Default | Description                    |
| --------------------------- | ------- | ------------------------------ |
| `LOG_DIR`                   | -       | Directory for log files        |
| `HTTP_LOG_PATH`             | -       | Path for HTTP access logs      |
| `ERROR_LOG_INCLUDE_STACK`   | -       | Include stack traces in errors |
| `AUDIT_INTERCEPTOR_ENABLED` | -       | Enable audit logging           |
| `AUDIT_CONSOLE_LOGGING`     | -       | Log audits to console          |
| `AUDIT_DATABASE_LOGGING`    | -       | Log audits to database         |
| `CACHE_CLEANUP_INTERVAL`    | -       | Interval for cache cleanup     |
| `DEBUG_AUTH_SCOPES`         | -       | Debug auth scopes              |
| `DEBUG_AUTH_CLAIMS`         | -       | Debug auth claims              |
| `DEBUG_TENANT`              | -       | Debug tenant resolution        |

## 3. `apps/admin/.env` (Admin Frontend)

These variables are used by the React/Vite frontend. Note that Vite exposes `VITE_*` variables to the client.

| Variable                                | Default | Description                |
| --------------------------------------- | ------- | -------------------------- |
| `ADMIN_PORT`                            | -       | Frontend dev server port   |
| `VITE_API_BASE`                         | -       | Backend API URL            |
| `VITE_ZITADEL_ISSUER`                   | -       | OIDC Issuer                |
| `VITE_ZITADEL_CLIENT_ID`                | -       | OIDC Client ID             |
| `VITE_ZITADEL_REDIRECT_URI`             | -       | OAuth redirect URI         |
| `VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI` | -       | Logout redirect URI        |
| `VITE_ZITADEL_SCOPES`                   | -       | OAuth scopes               |
| `VITE_ZITADEL_AUDIENCE`                 | -       | OAuth audience             |
| `VITE_ENV`                              | -       | Environment name (display) |
| `VITE_CLIENT_LOGGING`                   | -       | Enable client-side logging |

## 4. Unused / To Be Deprecated

These variables appear in the code but may be legacy or duplicates.

| Variable                     | Suggested Action                   |
| ---------------------------- | ---------------------------------- |
| `GOOGLE_REDIRECT_URL`        | Verify usage (likely legacy OAuth) |
| `INTEGRATION_ENCRYPTION_KEY` | Verify usage                       |
| `AUTH_TEST_STATIC_TOKENS`    | Test only?                         |
