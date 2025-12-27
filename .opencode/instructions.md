---
description: 'Instructions for workspace management, including logging, process management, and running scripts.'
applyTo: '**'
---

# Coding Agent Instructions

## Domain-Specific Pattern Documentation

Before implementing new features, **always check** these domain-specific AGENT.md files to understand existing patterns and avoid recreating functionality:

| File                                 | Domain              | Key Topics                                                                          |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `apps/admin/src/components/AGENT.md` | Frontend Components | Atomic design (atoms/molecules/organisms), DaisyUI + Tailwind, available components |
| `apps/admin/src/hooks/AGENT.md`      | Frontend Hooks      | `useApi` (MUST use for all API calls), all 33+ hooks categorized                    |
| `apps/server/src/modules/AGENT.md`   | Backend NestJS      | Module/Controller/Service/Repository pattern, Guards, DTOs, RLS                     |
| `apps/server/src/entities/AGENT.md`  | TypeORM Entities    | Schema usage (kb/core), column types, relations, indexes                            |

## Environment URLs

| Environment | Admin URL                               | Server URL                            |
| ----------- | --------------------------------------- | ------------------------------------- |
| Local       | `http://localhost:5176`                 | `http://localhost:3002`               |
| Dev         | `https://admin.dev.emergent-company.ai` | `https://api.dev.emergent-company.ai` |

## 1. Logging

Logs are browsed using the **logs MCP server**. Log files are stored in `logs/` (root directory):

```
logs/
├── server/
│   ├── server.log          # Main server log (INFO+)
│   ├── server.error.log    # Server errors only
│   ├── server.debug.log    # Debug output (dev only)
│   └── server.http.log     # HTTP request/response logs
├── admin/
│   ├── admin.out.log       # Vite stdout
│   ├── admin.error.log     # Vite stderr
│   └── admin.client.log    # Browser client logs
```

**Common log queries:** "Check server logs", "Are there any errors?", "Search logs for 'TypeError'"

## 2. Process Management

Services use PID-based process management via workspace CLI or **Workspace MCP server**.

### Hot Reload (Default)

**Both server (NestJS) and admin (Vite) have hot reload enabled.** Usually you do NOT need to restart:

- ✅ Editing TypeScript files, React components, styles
- ❌ **MUST restart:** New NestJS modules, `app.module.ts` changes, env var changes, after `npm/pnpm install`

### Commands

```bash
nx run workspace-cli:workspace:restart   # Restart all services
nx run workspace-cli:workspace:start     # Start all services
nx run workspace-cli:workspace:stop      # Stop all services
nx run workspace-cli:workspace:status    # Check status
```

**Common mistakes:**

| Wrong                                   | Right                                    |
| --------------------------------------- | ---------------------------------------- |
| `nx run server:build` then manually run | `nx run workspace-cli:workspace:restart` |
| Killing processes with `kill -9`        | `nx run workspace-cli:workspace:stop`    |

## 3. Testing

See **`docs/testing/AI_AGENT_GUIDE.md`** for comprehensive guidance.

**Quick commands:**

```bash
nx run admin:test              # Frontend unit tests
nx run admin:test-coverage     # With coverage
nx run admin:e2e               # Browser e2e tests
nx run server:test             # Backend unit tests
nx run server:test-e2e         # API e2e tests
```

## 4. Custom Tools

- **credentials** - Get test user credentials and application URLs
- **open-browser** - Launch isolated browser with test credentials (Chromium preferred)

## 5. Available MCP Servers

MCP tool documentation is available via tool introspection. Key servers:

- **Postgres** - Database queries (use schema-qualified names: `kb.documents`, `core.user_profiles`)
- **Chrome DevTools** - Browser debugging (start with `npm run chrome:debug` first)
- **logs** - Log file browsing
- **Workspace** - Health monitoring, Docker logs, config
- **Langfuse** - AI trace browsing
- **SigNoz** - Observability (traces, logs, metrics, alerts)

## 6. Database Queries

**Always consult `docs/database/schema-context.md` first.**

```sql
-- Use schema-qualified names
SELECT * FROM kb.documents;           -- NOT 'documents'
SELECT * FROM core.user_profiles;     -- NOT 'users'
SELECT * FROM kb.object_extraction_jobs;
```

**Schemas:** `kb` (knowledge base), `core` (users), `public` (extensions)

## 7. Bug Reports & Improvements

- **Bugs:** `docs/bugs/` — Use `docs/bugs/TEMPLATE.md`
- **Improvements:** `docs/improvements/` — Use `docs/improvements/TEMPLATE.md`
