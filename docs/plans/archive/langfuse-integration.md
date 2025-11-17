# LangFuse Integration Plan

This document outlines the plan to integrate LangFuse for LLM observability into the project. The integration will cover both self-hosted deployment via Docker and application-level integration with the NestJS server.

## Part 1: Docker Deployment for Self-Hosting

Based on the official LangFuse documentation for low-scale deployments, we will use Docker Compose to set up the necessary services.

### Task 1.1: Update `docker-compose.yml`

-   **File to modify:** `docker/docker-compose.yml`
-   **Objective:** Add the LangFuse services to the existing Docker Compose setup.

**Services to Add:**

1.  **`langfuse-db` (PostgreSQL):**
    *   A dedicated PostgreSQL container for LangFuse.
    *   Use the official `postgres:16` image.
    *   Configure environment variables for the database user, password, and name (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).
    *   Mount a volume for data persistence.

2.  **`clickhouse` (ClickHouse):**
    *   Required for storing traces, observations, and scores.
    *   Use the official `clickhouse/clickhouse-server` image.
    *   Configure environment variables for the database user, password, and name.
    *   Mount a volume for data persistence.

3.  **`redis` (Redis):**
    *   Used for caching and queuing.
    *   Use the official `redis:7` image.
    *   Mount a volume for data persistence.

4.  **`langfuse-server` (LangFuse Web/API):**
    *   The main web application and API server.
    *   Use the official `ghcr.io/langfuse/langfuse` image.
    *   Depends on `langfuse-db`, `clickhouse`, and `redis`.
    *   Configure environment variables for database connections, secrets, and host URL.
    *   Expose port `3000` for the web UI.

5.  **`langfuse-worker` (LangFuse Worker):**
    *   Asynchronously processes events.
    *   Use the official `ghcr.io/langfuse/langfuse` image with the `worker` command.
    *   Depends on `langfuse-db`, `clickhouse`, and `redis`.
    *   Configure the same environment variables as the server.

### Task 1.2: Create `.env.langfuse.example`

-   **File to create:** `docker/.env.langfuse.example`
-   **Objective:** Provide a template for the environment variables required by the LangFuse Docker services.

**Variables to include:**

-   `LANGFUSE_POSTGRES_USER`
-   `LANGFUSE_POSTGRES_PASSWORD`
-   `LANGFUSE_POSTGRES_DB`
-   `CLICKHOUSE_USER`
-   `CLICKHOUSE_PASSWORD`
-   `CLICKHOUSE_DB`
-   `DATABASE_URL` (for LangFuse server/worker)
-   `CLICKHOUSE_HOST`
-   `CLICKHOUSE_DATABASE`
-   `CLICKHOUSE_USERNAME`
-   `CLICKHOUSE_PASSWORD`
-   `REDIS_HOST`
-   `REDIS_PORT`
-   `NEXTAUTH_SECRET`
-   `SALT`
-   `NEXTAUTH_URL`
-   `LANGFUSE_SECRET_KEY`
-   `LANGFUSE_PUBLIC_KEY`

## Part 2: Application Integration

### Task 2.1: Install LangFuse SDK

-   **File to modify:** `package.json`
-   **Objective:** Add the `langfuse` package as a dependency.
-   **Command:** `npm install langfuse`

### Task 2.2: Configure LangFuse in the Application

-   **Files to modify:**
    *   `.env.example`
    *   `apps/server/src/common/config/config.service.ts`
-   **Objective:** Add the necessary configuration for the LangFuse SDK.

**Steps:**

1.  Add `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_HOST` to `.env.example`.
2.  Add corresponding properties to `AppConfigService` to access these values.

### Task 2.3: Initialize LangFuse Client

-   **File to create:** `apps/server/src/modules/langfuse/langfuse.service.ts`
-   **File to modify:** `apps/server/src/modules/app.module.ts`
-   **Objective:** Create a dedicated service to manage the LangFuse client and make it available throughout the application.

**Steps:**

1.  Create a `LangfuseModule` and a `LangfuseService`.
2.  In `LangfuseService`, initialize the Langfuse client using the configuration from `AppConfigService`.
3.  Provide `LangfuseService` in the `LangfuseModule`.
4.  Import `LangfuseModule` into the `AppModule` to make the service globally available.

### Task 2.4: Add Tracing to LLM Providers

-   **Files to modify:**
    *   `apps/server/src/modules/extraction-jobs/llm/llm-provider.factory.ts`
    *   `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
    *   `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`
    *   `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
-   **Objective:** Wrap LLM calls with LangFuse tracing.

**Steps:**

1.  Inject `LangfuseService` into `LLMProviderFactory` and pass it to the providers.
2.  For `LangChainGeminiProvider`, use the LangChain integration to automatically trace calls.
3.  For `VertexAIProvider`, manually create traces using `langfuse.trace()` to wrap the `extractEntities` method.
4.  In `ExtractionWorkerService`, create a parent trace for the entire extraction job to group all subsequent LLM calls.

### Task 2.5: Extend MonitoringLoggerService

-   **File to modify:** `apps/server/src/modules/monitoring/monitoring-logger.service.ts`
-   **Objective:** Send LLM call data to LangFuse in addition to the existing logging.

**Steps:**

1.  Inject `LangfuseService` into `MonitoringLoggerService`.
2.  In the `logStep` and `updateLogStep` methods, after logging to the database, use the `LangfuseService` to send the relevant data to LangFuse. This will likely involve creating or updating observations within the active trace.

## Part 3: Testing

### Task 3.1: Write Unit and Integration Tests

-   **Objective:** Ensure the LangFuse integration is working correctly and doesn't introduce regressions.

**Tests to write:**

1.  **Unit Tests for `LangfuseService`:**
    *   Verify that the service initializes the client correctly.
    *   Mock the Langfuse client and test the service's methods.
2.  **Integration Tests for LLM Providers:**
    *   Verify that LLM calls are traced correctly.
    *   Check that the correct metadata is being passed to LangFuse.
3.  **E2E Tests for `ExtractionWorkerService`:**
    *   Run a full extraction job and verify that a parent trace is created and that all LLM calls are correctly nested within it.
