<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AI Agent Instructions

## ⚠️ STOP — Check Existing Patterns First

**Before creating ANY new code, you MUST check if similar functionality already exists.**

| Creating...     | First read...                        | Contains...                                           |
| --------------- | ------------------------------------ | ----------------------------------------------------- |
| React component | `apps/admin/src/components/AGENT.md` | 50+ components, atomic design, DaisyUI patterns       |
| React hook      | `apps/admin/src/hooks/AGENT.md`      | 33+ hooks including `useApi` (REQUIRED for API calls) |
| API endpoint    | `apps/server/src/modules/AGENT.md`   | NestJS patterns, Guards, DTOs, RLS                    |
| Database entity | `apps/server/src/entities/AGENT.md`  | TypeORM patterns, schemas (kb/core), relations        |
| Backend tests   | `apps/server/tests/AGENT.md`         | Test patterns, FakeGraphDb, E2E context, auth helpers |

**Common mistakes to avoid:**

- ❌ Creating a new data fetching hook → Use `useApi` from hooks/AGENT.md
- ❌ Creating a new Button component → Use existing from components/AGENT.md
- ❌ Raw `fetch()` calls → Use `useApi` hook with proper error handling
- ❌ New modal component → Use existing `Modal` atom

## Quick Reference

### Build, Lint, Test

```bash
npm run build                    # Build all
nx run admin:lint               # Lint frontend
nx run admin:test               # Frontend unit tests
nx run server:test              # Backend unit tests
nx run server:test-e2e          # API e2e tests
```

### Code Style

- **Prettier**: `singleQuote: true` — Run `npx prettier --write .`
- **TypeScript**: Strict types, no `any`
- **Naming**: `camelCase` variables/functions, `PascalCase` classes/interfaces

### Nx Monorepo

- Always use `nx run <project>:<task>` for builds, tests, linting
- Use `nx_workspace` tool to understand project structure
- Use `nx_project_details` for specific project dependencies

### ⚠️ Hot Reload — DO NOT RESTART AFTER CODE CHANGES

**Both server and admin have hot reload.** Changes are picked up automatically in 1-2 seconds.

- ✅ **Just save the file** — hot reload handles TypeScript, React, DTOs, services, etc.
- ❌ **Only restart if** server is down (check with `pnpm run workspace:status`)
- ❌ **Restart required for:** new modules in `app.module.ts`, env var changes, after `npm install`

## Environment URLs

Local and Dev refer to the **same environment** accessible via two methods. Prefer domain URLs for consistency with production patterns.

| Access Method      | Admin URL                               | Server URL                            |
| ------------------ | --------------------------------------- | ------------------------------------- |
| Domain (preferred) | `https://admin.dev.emergent-company.ai` | `https://api.dev.emergent-company.ai` |
| Localhost          | `http://localhost:5176`                 | `http://localhost:3002`               |

## Detailed Documentation

- **Workspace operations**: `.opencode/instructions.md` (logging, process management, MCP tools)
- **Testing guide**: `docs/testing/AI_AGENT_GUIDE.md`
- **Database schema**: `docs/database/schema-context.md`
