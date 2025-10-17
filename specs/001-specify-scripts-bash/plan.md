# Implementation Plan: Unified Nx & PM2 Orchestration and Logging

**Branch**: `001-specify-scripts-bash` | **Date**: 2025-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-specify-scripts-bash/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Centralize developer and operator workflows around Nx-managed targets that orchestrate application processes and foundational Docker dependencies via PM2 supervision. The initiative standardizes setup/run/test commands, enforces restart policies, aggregates logs, and exposes consolidated status/log retrieval interfaces (with optional JSON) while leveraging Nx MCP for AI-aware tooling. Wherever possible, the plan leans on first-party Nx capabilities (target defaults, configurations, env files, implicit dependency graph) and PM2 native features (ecosystem environments, `startOrReload`, JSON status, logrotate) to minimize bespoke TypeScript glue.

## Technical Context

**Language/Version**: TypeScript 5.5 targeting Node.js 20 runtime (Nx + PM2 scripts)  
**Primary Dependencies**: Nx CLI, PM2, Docker Compose, pm2-logrotate, Nx MCP (configure-ai-agents)  
**Storage**: PostgreSQL, Zitadel (managed via docker compose; schemas unchanged)  
**Testing**: Nx test targets (Vitest for `apps/admin`, Jest for `apps/server-nest`), PM2 process checks, integration smoke scripts  
**Target Platform**: macOS/Linux developer machines and CI runners with Docker + Node.js  
**Project Type**: Monorepo with separate frontend (`apps/admin`), backend (`apps/server-nest`), scripts  
**Performance Goals**: Bootstrap services/dependencies <10 minutes; restart actions <2 minutes; status/log command latency <3 seconds for recent data  
**Constraints**: Trusted local CLI usage only; consistent log rotation (≥7 days); restart thresholds to avoid loops; human-readable + JSON status output  
**Scale/Scope**: 2 primary services + docker dependencies; supports future services by extending command catalog

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial and post-design reviews confirm the constitution file contains no enforceable principles, so no gates are triggered.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

ios/ or android/
### Source Code (repository root)
```
apps/
├── admin/             # React + Vite frontend consuming unified Nx targets
├── server-nest/       # NestJS backend services managed by PM2 profiles
└── logs/              # Aggregated log storage (stdout/stderr, rotated)

tools/
└── workspace-cli/
	├── src/           # TypeScript sources for workspace CLI + commands
	├── pm2/           # Ecosystem and logrotate configs used by PM2
	└── project.json   # Nx project configuration for workspace control targets

docker/
├── docker-compose.yml # Foundational dependencies (PostgreSQL, Zitadel, etc.)
└── init.sql           # Dependency bootstrap scripts

scripts/
├── ensure-e2e-deps.mjs    # Dependency readiness checks reused by Nx targets
└── collect-service-logs.mjs # Deprecated wrapper forwarding to the workspace CLI logs command

.specify/                 # Specification + planning assets
└── scripts/bash/         # Automation for spec/plan lifecycle

**AI Integration**: Enable Nx MCP via `npx nx configure-ai-agents`; Nx Console handles agent configuration without bespoke scripts.
```

**Structure Decision**: Maintain current monorepo layout of `apps/`, `docker/`, and `scripts/`, layering unified Nx + PM2 orchestration assets and AI integrations without relocating existing projects.

## Command Naming Strategy

- **Global `workspace:*` targets**: Defined in `tools/workspace-cli/project.json` (Nx project name `workspace`) and primarily invoke PM2/Docker commands through `@nx/workspace:run-commands`. Thin TypeScript helpers exist only when orchestration logic (e.g., cross-service coordination or structured output shaping) cannot be expressed directly.
- **Service-scoped targets**: Each application project (`admin`, `server`) exposes `admin:setup`, `admin:start`, `server:start`, etc., with environment profiles mapped to Nx `configurations` that inject profile-specific env files and forward the selected profile to PM2 via `--env`.
- **Dependency aliases**: Docker-backed services register as `postgres:start`, `zitadel:restart`, etc., using PM2 ecosystem entries whose `script` fields shell out to `docker compose` commands; restart behavior and health checks lean on PM2’s native `autorestart`, `max_restarts`, and `exp_backoff_restart_delay` settings.
- **Script execution**: All targets use local `@nx/workspace:run-commands` executors; the OpenAPI document under `contracts/` remains a contract for the light CLI layer but default orchestrations defer to Nx/PM2 functionality (`pm2 startOrReload`, `pm2 jlist --json`, `pm2 logs`, `pm2-logrotate` configuration).

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No constitution violations identified; tracking table intentionally left empty.

