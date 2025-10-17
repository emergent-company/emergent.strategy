# Feature Specification: Unified Nx & PM2 Orchestration and Logging

**Feature Branch**: `[001-specify-scripts-bash]`  
**Created**: 2025-10-16  
**Status**: Draft  
**Input**: Combined user descriptions: "nx integration and pm2"; "i want nx to run all the setup and pm2 to be able to restart and manage logs..."; "for docker services like database or zitadel i want to also pm2 handle starts/restarts/status and log"

## Clarifications

### Session 2025-10-17

- Q: How should access to the orchestration commands be controlled? → A: Limit usage to local workspace CLI invocations by trusted team members.
- Q: How should orchestration status outputs be structured? → A: Human-readable table by default with optional `--json` flag.

### Terminology

- **Documented workflow**: A sequence of numbered steps published in `docs/orchestration/*.md` and mirrored in `quickstart.md` that references concrete Nx commands and expected outputs.
- **Actionable messaging**: Error output that includes the failing command, exit code, affected service, and at least one remediation step (e.g., `Run nx run workspace:status --profile staging to inspect current failures`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch application services via unified workspace commands (Priority: P1)

Development engineers need standardized workspace commands to set up, run, and test each application service so they can work consistently across the monorepo from a fresh environment.

**Why this priority**: Without a single entry point, teams duplicate bespoke scripts and onboarding stalls; centralizing commands delivers immediate productivity gains.

**Independent Test**: From a clean clone, execute the documented workspace run and test commands for a representative service and verify setup completes without manual intervention.

**Acceptance Scenarios**:

1. **Given** a developer pulls the latest repository, **When** they run `nx run admin:start --profile development` from the workspace root, **Then** dependencies install, configuration loads, and the admin service starts with the expected environment profile.
2. **Given** automated tests are required, **When** the developer invokes `nx run admin:test --profile development`, **Then** the tests execute using the standardized executor and report results without additional local setup.

---

### User Story 2 - Manage application lifecycle with supervised restarts (Priority: P1)

Release engineers need to start, restart, and stop application processes through supervised workflows so environments stay consistent and recover quickly from failures.

**Why this priority**: Supervised orchestration ensures resilient processes and controlled restarts, which is essential for stable deployments and daily development.

**Independent Test**: Use the documented lifecycle workflow to start a service on a staging host, simulate a failure, and verify supervised restart restores the process with accurate status reporting.

**Acceptance Scenarios**:

1. **Given** a staging server with the repository checked out, **When** the engineer runs `nx run server:start --profile staging`, **Then** the process manager starts the server service with the expected metadata and reports status as online.
2. **Given** the process throws an intentional crash, **When** the engineer invokes `nx run workspace:restart --profile staging -- --service=server`, **Then** the service reloads without downtime and retains environment variables defined for that profile.

---

### User Story 3 - Provision foundational docker dependencies through the same workflow (Priority: P1)

Operations engineers need a single command set to start or restart docker-backed dependencies (e.g., database, identity provider) so they can bring the workspace up reliably without juggling compose commands.

**Why this priority**: Deterministic startup of shared dependencies is required for onboarding and CI job recovery.

**Independent Test**: Run the dependency start command for a foundational service and confirm the container starts, required images are available, and the supervising process registers it.

**Acceptance Scenarios**:

1. **Given** a stopped database dependency, **When** an engineer runs `nx run postgres:start --profile development`, **Then** the container starts, health checks pass, and the supervising process tracks it with a success summary.
2. **Given** the same dependency is already running, **When** the engineer issues `nx run postgres:restart --profile development`, **Then** the dependency gracefully restarts and reports the new process identifier without manual docker commands.

---

### User Story 4 - Observe service health across applications and dependencies (Priority: P2)

Operations staff require consolidated status output that covers both application processes and foundational dependencies so they can detect issues quickly.

**Why this priority**: Shared visibility reduces time spent diagnosing failures and enables consistent CI health checks.

**Independent Test**: Execute the aggregated status command and confirm it surfaces process state (online/stopped), health indicators, uptime, and recent restart counts for every managed service.

**Acceptance Scenarios**:

1. **Given** multiple services are registered with the supervising workflow, **When** an analyst runs `nx run workspace:status --profile staging`, **Then** the output lists each service with current state, health indicator, uptime, and restart history without requiring direct access to docker or PM2.
2. **Given** a dependency fails to start due to a missing image, **When** status is requested with `nx run workspace:status --profile staging -- --format=json`, **Then** the output highlights the failed state and references the root cause message.

---

### User Story 5 - Access consolidated service logs (Priority: P2)

Developers and support staff need predictable access to recent and historical logs for both application processes and foundational dependencies so they can troubleshoot without chasing scattered files.

**Why this priority**: Consolidated logs lower mean time to resolution and support the supervised restart policies.

**Independent Test**: Launch two services via the workflow, generate log output, and retrieve logs for each service over a requested timeframe.

**Acceptance Scenarios**:

1. **Given** services launched through the shared workflow, **When** an engineer inspects `apps/logs/admin/` after running `nx run workspace:logs -- --service=admin --tail=100`, **Then** each service has separated log files for stdout and stderr with timestamps and retention applied.
2. **Given** archived logs exist after rotation, **When** a developer retrieves logs for a dependency via `nx run workspace:logs -- --service=postgres --since=48h`, **Then** historical entries remain accessible alongside the current file.

---

### Edge Cases

- Workspace command invoked for a service without a registered configuration—workflow fails fast with guidance to add the missing target.
- Ecosystem configuration references missing environment variables—deployment aborts with actionable messaging before starting the process.
- Dependency image is absent or outdated—startup step pulls or alerts before attempting to run, leaving the process in a failed state if unresolved.
- Required ports are already bound when starting a service—the workflow surfaces the collision and identifies the conflicting process.
- Multiple deployments targeting the same host—workflow prevents duplicate process names by refusing to launch conflicting PM2 entries, exits with `EXIT_CONFLICTING_PROCESS`, and directs operators to run `workspace:status` or `workspace:stop` before retrying.
- Host lacks required tooling (workspace CLI, PM2, docker) or has unsupported versions—pre-flight checks detect prerequisites, validate minimum versions, and direct operators to install or upgrade before proceeding.
- Dependency startup tolerates staggered availability by waiting up to 90 seconds for declared health checks, marking a dependency `degraded` if readiness fails, and emitting remediation guidance.
- Docker compose commands that fail or whose health checks time out produce structured error messages containing the compose exit code and the last failing health-check message, accompanied by rerun guidance.
- Log volume spikes beyond retention thresholds—rotation preserves recent output without exhausting disk space.
- Automated restarts exceed policy thresholds (crash loop)—workflow escalates via alerts or exit codes instead of looping indefinitely.

## Command Surface & Runner Catalog *(mandatory)*

The Nx workspace exposes a predictable naming pattern so teams can mix shared and project-specific commands without relying on an "orchestrator" prefix.

### Profile & Environment Mapping

- **Default profile**: Invoking a command without `--profile` resolves to the `development` configuration, which forwards `pm2 startOrReload --env development` and sources `config/env/development.env` through Nx target defaults.
- **Explicit profile**: `nx run admin:start --profile staging` selects the `staging` configuration, injects profile-specific environment files, and maps to `pm2 startOrReload --env staging` so PM2 applies the matching `env_staging` block.
- **Invalid profile handling**: When a profile is requested that lacks an Nx configuration, the workflow aborts with exit code `EXIT_PROFILE_UNDEFINED`, surfaces the missing profile name, and instructs the operator to register it in `tools/workspace-cli/src/config/env-profiles.ts`.
- **Propagation to restarts**: PM2 ecosystem definitions reuse the profile name (`env_<profile>`) so restarts inherit the same variable set without bespoke wrappers or environment mutation.

### Naming Strategy

- **Root family (`workspace:*`)** – cross-cutting commands that coordinate multiple services or dependencies from the repository root. The Nx project `workspace` is defined in `tools/workspace-cli/project.json` and delegates to a TypeScript CLI entry point.
- **Application families (`admin:*`, `server:*`)** – service-scoped targets that wrap setup/run/test flows for individual Nx projects (`apps/admin`, `apps/server-nest`). Each target pipes arguments into the same shared CLI helpers.
- **Dependency families (`postgres:*`, `zitadel:*`)** – docker-backed services controlled via PM2 and Compose wrappers. Aliases live under the `docker` project group but resolve to dependency-specific scripts.

### Planned Nx Targets

| Nx Target | Scope | Description | Backing Script |
| --- | --- | --- | --- |
| `workspace:verify` | Root | Lints CLI sources and runs dry-run checks before CI | `tools/workspace-cli/src/commands/verify.ts` |
| `workspace:start` | Root | Starts primary app stack with dependencies required for the default profile | `tools/workspace-cli/src/commands/start-service.ts` (workspace profile) |
| `workspace:start-all` | Root | Ensures every registered application and dependency is online | Composite invocation of `start` handlers |
| `workspace:stop` | Root | Gracefully stops the default service set | `tools/workspace-cli/src/commands/stop-service.ts` (workspace profile) |
| `workspace:stop-all` | Root | Stops all managed services and dependencies in dependency order | `stop-service.ts` with dependency teardown orchestration |
| `workspace:restart` | Root | Restarts a named service with supervision policies applied | `tools/workspace-cli/src/commands/restart-service.ts` |
| `workspace:status` | Root | Outputs consolidated table/JSON status for all managed entries | `tools/workspace-cli/src/status/{collect,render}.ts` |
| `workspace:logs` | Root | Streams or slices logs for a service/dependency | `tools/workspace-cli/src/logs/read.ts` |
| `workspace:deps:start` | Root | Boots docker-backed dependencies only | `tools/workspace-cli/src/commands/docker-runner.ts` |
| `workspace:deps:restart` | Root | Restarts docker dependencies with health verification | Same as above |
| `admin:setup` | Application | Installs dependencies, seeds env, prepares Vite dev server | `tools/workspace-cli/src/commands/setup-service.ts` (admin profile) |
| `admin:start` | Application | Launches admin dev server under PM2 supervision | `tools/workspace-cli/src/commands/start-service.ts` (admin profile) |
| `admin:test` | Application | Runs Vitest via Nx with orchestrated env preflight | Nx `test` target + CLI preflight adapter |
| `server:setup` | Application | Installs Nest API deps and applies migrations | `setup-service.ts` (server profile) + database hooks |
| `server:start` | Application | Launches Nest API under PM2 supervision | `start-service.ts` (server profile) |
| `server:test` | Application | Runs Jest specs with orchestrated env preflight | Nx `test` target + CLI preflight adapter |
| `postgres:start` | Dependency | Ensures Postgres docker service is up via PM2-managed compose script | `tools/workspace-cli/src/commands/docker-runner.ts` (postgres profile) |
| `postgres:restart` | Dependency | Restarts Postgres container with health gating | Same |
| `zitadel:start` | Dependency | Boots Zitadel dependency | `docker` profile within `docker-runner.ts` |
| `zitadel:restart` | Dependency | Restarts Zitadel dependency | Same |

> **Note**: Additional service families (e.g., future workers) must follow the same `<project>:<action>` pattern and register themselves in the Workspace Command Catalog before exposure.

## Requirements *(mandatory)*

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST define standardized workspace targets that encapsulate setup, run, test, and deploy commands for every application service, callable from the repository root.
- **FR-002**: Workspace targets MUST standardize environment initialization steps (dependency install, configuration loading) so new machines complete setup without manual scripts.
- **FR-003**: The platform MUST integrate supervised process definitions for each application service, exposing start, stop, reload, and status actions through the shared workflow.
- **FR-004**: Shared commands MUST provision foundational docker dependencies, including verification that required images exist and handling of pulls when missing.
- **FR-005**: All lifecycle commands MUST accept environment profiles (development, staging, production) via a documented flag (for example, `--profile <name>`) and apply consistent variable resolution whether run locally or via CI. The specification MUST document example invocations (e.g., `nx run server:start --profile production`) and state that `development` is the default profile when the flag is omitted.
- **FR-006**: The workflow MUST provide a consolidated status report covering application services and foundational dependencies with state, health indicators, uptime, and restart counts, rendering a human-readable table by default while supporting a `--json` flag for structured automation output.
- **FR-007**: Managed services MUST capture stdout and stderr into a shared log directory (`apps/logs/<service-name>/`) with consistent naming, rotation policies (daily rotation with gzip compression), and documented retrieval commands. Retention MUST keep 14 days of logs online and archive older files for offline storage, with retrieval supporting time-window filters.
- **FR-008**: Automatic restart policies MUST be configurable for each service, logging failure reasons and escalating when restart thresholds are exceeded or ports are unavailable by marking the service failed, emitting structured error output, and returning a non-zero exit code for automation consumers. Default policy MUST cap restarts at five attempts within ten minutes, apply exponential backoff (5 seconds initial delay up to 2 minutes), and emit a `RESTART_THRESHOLD_EXCEEDED` event when the limit is hit.
- **FR-009**: Legacy ad-hoc scripts MUST be either retired or wrapped by the standardized workflow to avoid competing entry points.
- **FR-010**: Documentation MUST describe how to onboard new services or dependencies into the workspace, logging, and supervision system.
- **FR-011**: Engineers MUST be able to retrieve historical logs for any managed service over a requested time window without direct docker or PM2 access.
- **FR-012**: Automated checks (CI or pre-commit) MUST validate that declared workspace targets and supervised configurations pass lint or dry-run steps before changes reach protected branches.

## Nx Executor & API Usage Clarification

- Nx targets use `@nx/workspace:run-commands` (or project-specific executors) to invoke TypeScript entry points inside `tools/workspace-cli`. No network daemon is required; the OpenAPI document in `contracts/` captures the command contract to keep the CLI implementation and future tooling aligned on payload shapes.
- Wherever possible, the workflow SHOULD lean on built-in Nx capabilities—`targetDefaults`, `configurations`, `envFile`, parallel `run-commands`, and implicit dependency graph metadata—to avoid bespoke command orchestration code. Profile selection MAY be mapped directly to Nx configurations that forward `--env` flags to PM2.
- CLI subcommands import the modules described by the `Workspace Command API` spec directly. In-process execution means commands run with local file-system, PM2, and Docker access; calling the same modules remotely would require an opt-in server wrapper not planned for this release.
- Package scripts (e.g., `pnpm workspace status`) can safely delegate to `nx run workspace:status` because all orchestration logic stays within the repository and respects the same environment profile handling.
- PM2 native features (ecosystem `env_*` blocks, `startOrReload`, `--only`, JSON status output, and the `pm2-logrotate` module) SHOULD be preferred over reimplementing equivalent functionality in custom handlers.

### Key Entities *(include if feature involves data)*

- **Workspace Command Catalog**: Registry of standardized targets for setup, run, test, deploy, and dependency control, including required prerequisites and environment inputs.
- **Environment Profile**: Mapping between environment labels (development, staging, production) and the variable sets, secrets references, and host overrides consumed by the workflow.
- **Application Process Profile**: Definition of each deployable service instance, capturing name, entry script, restart policy, resource constraints, and log destinations.
- **Docker Dependency Profile**: Representation of foundational services (database, identity provider) including compose references, health checks, and restart expectations.
- **Unified Health Snapshot**: Aggregated record of current state, health indicator, uptime, restart history, and recent failure reason for every managed service or dependency.
- **Shared Log Archive**: Centralized storage for service logs, tagging entries by service name, timestamp, severity, and retention status to support retrieval and auditing.

## Assumptions

- Existing services can adopt the standardized workspace governance (naming conventions, folder structure) without major refactors, and any exceptions will be documented.
- Development and operations hosts support installing the required tooling (workspace CLI, Node.js, PM2, docker) or can be updated before rollout.
- Docker-compose definitions for foundational dependencies expose health checks the workflow can rely on for status evaluations, with intervals ≤30 seconds so orchestration can classify readiness promptly.
- Secrets and environment variables remain managed through existing secure storage; this initiative references them but does not introduce a new secrets manager.
- Centralized logging initially targets development and staging environments, with production log aggregation handled by existing observability tooling.
- Orchestration commands are executed locally through Nx/PM2 CLI access by trusted repository contributors; no remote orchestration API is introduced.
- Legacy entry points (dev-manager scripts and ad-hoc shell helpers) will be retired or wrapped by the standardized commands before rollout, with transitions called out in quickstart and runbook updates.


## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of deployable services and foundational dependencies expose functioning standardized workflow commands for setup, run, test, and control verified on at least one staging environment.
- **SC-002**: Developers can provision and start any service or dependency from a clean environment in under 10 minutes using the documented workflow.
- **SC-003**: Operations teams can start or reload any managed service using the orchestration workflow within 2 minutes during staging drills.
- **SC-004**: Unexpected process exits are automatically recovered or escalated, with restart events logged and accessible within 5 minutes of occurrence.
- **SC-005**: Log retrieval for any managed service returns the requested timeframe within 3 seconds for 90% of queries covering the most recent 24 hours.
- **SC-006**: Status output for any profile accurately reflects PM2 and dependency health within 30 seconds of a state change, and JSON responses must match the human-readable table content.
- **SC-007**: Manual direct docker or bespoke script usage for starting or stopping core services decreases by 80% within one month of rollout, measured through developer and operator feedback surveys.

