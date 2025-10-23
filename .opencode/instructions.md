---
description: 'Instructions for workspace management, including logging, process management, and running scripts.'
applyTo: '**'
---
# Coding Agent Instructions

This document provides instructions for interacting with the workspace, including logging, process management, and running scripts.

## 1. Logging

All service logs are managed by the workspace CLI. The primary command for accessing logs is `nx run workspace-cli:workspace:logs`.

### Viewing Logs

*   **Tail logs for default services (admin + server) and dependencies:**
    ```bash
    nx run workspace-cli:workspace:logs
    ```

*   **Tail logs in real-time:**
    ```bash
    nx run workspace-cli:workspace:logs -- --follow
    ```

*   **View logs for a specific service:**
    ```bash
    nx run workspace-cli:workspace:logs -- --service=<service-id>
    ```
    *(Replace `<service-id>` with the service you want to inspect, e.g., `server`)*

### Log File Locations

Log files are stored in the `apps/logs/` directory.

*   **Service logs:** `apps/logs/<serviceId>/out.log` (stdout) and `apps/logs/<serviceId>/error.log` (stderr)
*   **Dependency logs:** `apps/logs/dependencies/<id>/out.log` and `apps/logs/dependencies/<id>/error.log`

## 2. Process Management (PM2)

Services are managed as processes by PM2, but you should interact with them through the workspace CLI.

*   **Start all services:**
    ```bash
    nx run workspace-cli:workspace:start
    ```

*   **Stop all services:**
    ```bash
    nx run workspace-cli:workspace:stop
    ```

*   **Restart all services:**
    ```bash
    nx run workspace-cli:workspace:restart
    ```

## 3. Running Scripts and Tests

All scripts and tests should be executed using `nx`. Note that commands for the `workspace-cli` project are prefixed with `workspace:`.

*   **Run a specific script:**
    ```bash
    nx run <project>:<script>
    ```
    *(e.g., `nx run workspace-cli:workspace:logs`)*

*   **Run Playwright tests:**
    ```bash
    npx playwright test --project=chromium
    ```