# Coding Agent Instructions

This document provides instructions for interacting with the workspace, including logging, process management, and running scripts.

## Domain-Specific Pattern Documentation

Before implementing new features, **always check** these domain-specific AGENT.md files to understand existing patterns and avoid recreating functionality:

| File                                 | Domain              | Key Topics                                                                          |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `apps/admin/src/components/AGENT.md` | Frontend Components | Atomic design (atoms/molecules/organisms), DaisyUI + Tailwind, available components |
| `apps/admin/src/hooks/AGENT.md`      | Frontend Hooks      | `useApi` (MUST use for all API calls), all 33+ hooks categorized                    |
| `apps/server/src/modules/AGENT.md`   | Backend NestJS      | Module/Controller/Service/Repository pattern, Guards, DTOs, RLS                     |
| `apps/server/src/entities/AGENT.md`  | TypeORM Entities    | Schema usage (kb/core), column types, relations, indexes                            |

**When to read these files:**

- Before creating new components → Read `components/AGENT.md`
- Before creating new hooks → Read `hooks/AGENT.md`
- Before creating new API endpoints → Read `modules/AGENT.md`
- Before creating new database entities → Read `entities/AGENT.md`

## Primary References

- **`AGENTS.md`** (root) - Quick reference for build, lint, test, and pattern links
- **`.opencode/instructions.md`** - Workspace operations (logging, process management, testing)
- **`docs/testing/AI_AGENT_GUIDE.md`** - Comprehensive testing guidance

## 1. Logging

All service logs are managed by the workspace CLI. The primary command for accessing logs is `nx run workspace-cli:workspace:logs`.

### Viewing Logs

- **Tail logs for default services (admin + server) and dependencies:**

  ```bash
  nx run workspace-cli:workspace:logs
  ```

- **Tail logs in real-time:**

  ```bash
  nx run workspace-cli:workspace:logs -- --follow
  ```

- **View logs for a specific service:**
  ```bash
  nx run workspace-cli:workspace:logs -- --service=<service-id>
  ```
  _(Replace `<service-id>` with the service you want to inspect, e.g., `server`)_

### Log File Locations

Log files are stored in the `apps/logs/` directory.

- **Service logs:** `apps/logs/<serviceId>/out.log` (stdout) and `apps/logs/<serviceId>/error.log` (stderr)
- **Dependency logs:** `apps/logs/dependencies/<id>/out.log` and `apps/logs/dependencies/<id>/error.log`

## 2. Process Management (PM2)

Services are managed as processes by PM2, but you should interact with them through the workspace CLI.

- **Start all services:**

  ```bash
  nx run workspace-cli:workspace:start
  ```

- **Stop all services:**

  ```bash
  nx run workspace-cli:workspace:stop
  ```

- **Restart all services:**
  ```bash
  nx run workspace-cli:workspace:restart
  ```

## 3. Running Scripts and Tests

All scripts and tests should be executed using `nx`. Note that commands for the `workspace-cli` project are prefixed with `workspace:`.

- **Run a specific script:**
  ```bash
  nx run <project>:<script>
  ```
  _(e.g., `nx run workspace-cli:workspace:logs`)_

### Testing

For comprehensive testing guidance, refer to **`docs/testing/AI_AGENT_GUIDE.md`** which provides:

- Test type decision trees (unit, integration, API e2e, browser e2e)
- Test templates and quick reference
- Directory structure and file naming conventions
- Import patterns and best practices

**Quick Test Commands:**

- **Run admin unit tests:**

  ```bash
  nx run admin:test
  ```

- **Run admin unit tests with coverage:**

  ```bash
  nx run admin:test-coverage
  ```

- **Run admin browser e2e tests:**

  ```bash
  nx run admin:e2e
  ```

- **Run admin e2e tests in UI mode:**

  ```bash
  nx run admin:e2e-ui
  ```

- **Run server unit tests:**

  ```bash
  nx run server:test
  ```

- **Run server integration tests:**

  ```bash
  nx run server:test -- --testPathPattern=tests/integration
  ```

- **Run server API e2e tests:**
  ```bash
  nx run server:test-e2e
  ```

## 4. EPF Working Directory

When working with the Emergent Product Framework (EPF), **all temporary working documents** (analysis, summaries, session notes, implementation docs) go in:

```
docs/EPF/.epf-work/
```

**Key Rules:**

- ✅ **DO** create subdirectories by session/topic: `docs/EPF/.epf-work/skattefunn-wizard-selection/`
- ✅ **DO** place ALL EPF-related working documents there (summaries, analysis, decisions, session notes)
- ❌ **DON'T** create `.epf-work/` at repository root
- ❌ **DON'T** create `.epf-work/` inside `_instances/`
- ❌ **DON'T** place working documents in canonical EPF directories (schemas, wizards, templates)

**Why one location?**

- Single source of truth for all EPF working documents
- Easy to find session notes and analysis
- Clear separation: `docs/EPF/` = canonical framework, `docs/EPF/.epf-work/` = temporary work
- Version-controlled with EPF for context preservation

See `docs/EPF/.github/copilot-instructions.md` for complete EPF contribution guidelines.
