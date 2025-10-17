# Tasks: Unified Nx & PM2 Orchestration and Logging

**Input**: Design documents from `/specs/001-specify-scripts-bash/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce Nx as the unified workspace runner and prepare baseline configuration files.

- [x] T001 Add Nx workspace dependencies and CLI script in `package.json`.
- [x] T002 Create `nx.json` at repository root with `targetDefaults`, profile-aware `configurations`, and implicit dependency graph entries that drive workspace commands without bespoke orchestration.
- [x] T003 Define project registry in `workspace.json` for `apps/admin`, `apps/server-nest`, and `tools/workspace-cli`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish workspace CLI foundation, shared configuration types, and PM2 integration primitives.

- [x] T004 Scaffold `tools/workspace-cli/package.json` with TypeScript entry point, pm2, and pm2-logrotate dependencies.
- [x] T005 Create `tools/workspace-cli/tsconfig.json` and update root `tsconfig.json` includes to cover `tools/workspace-cli/src`.
- [x] T006 Implement shared data-model types in `tools/workspace-cli/src/config/types.ts`.
- [x] T007 Seed environment profile definitions in `tools/workspace-cli/src/config/env-profiles.ts`.
- [x] T008 Draft the workspace command catalog stub in `tools/workspace-cli/src/config/command-catalog.ts`.
- [x] T009 Add PM2 client utilities in `tools/workspace-cli/src/pm2/client.ts`.
- [x] T010 Create `tools/workspace-cli/project.json` with base Nx targets (`build`, `lint`) referencing the workspace CLI bundle.
- [x] T011 Add workspace verification target (lint/dry-run) in `tools/workspace-cli/project.json` with supporting script in `tools/workspace-cli/src/commands/verify.ts`.
- [x] T012 Configure CI workflow `.github/workflows/workspace-cli-verify.yml` to run Nx workspace CLI checks on pull requests.

---

## Phase 3: User Story 1 - Launch application services via unified workspace commands (Priority: P1) 🎯 MVP

**Goal**: Enable developers to set up and launch application services through standardized Nx commands backed by PM2.

**Independent Test**: From a clean clone, execute the documented workspace run and test commands for a representative service and verify setup completes without manual intervention.

- [x] T013 [US1] Add `apps/admin/project.json` with `setup`, `start`, and `test` targets that rely on `@nx/workspace:run-commands` to invoke `pm2 startOrReload`/`pm2 test` flows using the shared configurations.
- [x] T014 [P] [US1] Add `apps/server-nest/project.json` with `setup`, `start`, and `test` targets that rely on `@nx/workspace:run-commands` to invoke `pm2 startOrReload`/test flows using the shared configurations.
- [x] T015 [US1] Define application process profiles in `tools/workspace-cli/src/config/application-processes.ts`.
- [x] T016 [US1] Configure the application start command to call `pm2 startOrReload` with the ecosystem file, ensure the selected profile’s env config is applied, and refuse to launch when a conflicting PM2 process name already exists (light helper only if shell execution cannot cover it).
- [x] T017 [US1] Wire `setup` and `start` subcommands in `tools/workspace-cli/src/cli.ts` (or equivalent thin wrapper) to forward the `--profile` flag into the corresponding Nx target so that run-commands pass the value directly to `pm2`.
- [x] T018 [US1] Create PM2 ecosystem configuration for application services in `tools/workspace-cli/pm2/ecosystem.apps.cjs`, defining `env_*` blocks for profiles and using native restart/backoff settings.
- [x] T019 [US1] Extend `tools/workspace-cli/project.json` with `workspace` namespace run-command targets (`workspace:start`, `workspace:start-all`) that orchestrate `pm2` commands (and Docker scripts where required) primarily through `run-commands` definitions.
- [x] T020 [US1] Document service setup workflow in `docs/orchestration/workspace-commands.md`.

---

## Phase 4: User Story 2 - Manage application lifecycle with supervised restarts (Priority: P1)

**Goal**: Provide supervised start, restart, and stop flows with enforced restart policies for application services.

**Independent Test**: Use the documented lifecycle workflow to start a service on a staging host, simulate a failure, and verify supervised restart restores the process with accurate status reporting.

- [x] T021 [US2] Configure restart thresholds and env metadata in `tools/workspace-cli/pm2/ecosystem.apps.cjs`, including escalation rules that surface structured errors and non-zero exit codes when limits are exceeded.
- [x] T022 [US2] Add restart and stop handlers in `tools/workspace-cli/src/commands/restart-service.ts` and `tools/workspace-cli/src/commands/stop-service.ts`.
- [x] T023 [US2] Expose `restart` and `stop` subcommands in `tools/workspace-cli/src/cli.ts`.
- [x] T024 [US2] Update `tools/workspace-cli/project.json` with lifecycle targets (`workspace:restart`, `workspace:stop`).
- [x] T025 [US2] Refresh lifecycle documentation in `specs/001-specify-scripts-bash/quickstart.md` to reference supervised commands.

---

## Phase 5: User Story 3 - Provision foundational docker dependencies through the same workflow (Priority: P1)

**Goal**: Manage docker-backed dependencies (PostgreSQL, Zitadel) via workspace CLI commands and PM2 supervision.

**Independent Test**: Run the dependency start command for a foundational service and confirm the container starts, required images are available, and the supervising process registers it.

- [x] T026 [US3] Capture dependency profiles in `tools/workspace-cli/src/config/dependency-processes.ts` (or equivalent PM2 ecosystem definitions) so docker services can be launched via native PM2 scripts.
- [x] T027 [US3] Implement a minimal docker compose runner (or configure direct `run-commands`) that shells out to `docker compose up/down` so PM2 can supervise dependencies without complex helpers.
- [x] T028 [US3] Create PM2 ecosystem definitions for dependencies in `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`.
- [x] T029 [US3] Add `docker/project.json` with Nx targets for dependency `setup`, `start`, and `restart` flows.
- [x] T030 [US3] Extend workspace CLI (or provide Nx aliases) with dependency subcommands that simply forward to the configured `run-commands`/PM2 entries.
- [x] T031 [US3] Update `tools/workspace-cli/project.json` with dependency targets (`workspace:deps:start`, `workspace:deps:restart`).
- [x] T032 [US3] Document dependency orchestration in `docs/orchestration/dependencies.md`.

---

## Phase 6: User Story 4 - Observe service health across applications and dependencies (Priority: P2)

**Goal**: Deliver consolidated status output covering application processes and foundational dependencies with table-by-default output and JSON option.

**Independent Test**: Execute the aggregated status command and confirm it surfaces process state (online/stopped), health indicators, uptime, and recent restart counts for every managed service.

- [x] T033 [US4] Collect health data by wrapping `pm2 jlist --json` and docker compose status output, only adding glue necessary to normalize the results.
- [x] T034 [US4] Render table output with optional `--json` flag in `tools/workspace-cli/src/status/render.ts`, reusing PM2’s JSON payload as the primary data source and updating `tools/workspace-cli/src/cli.ts` accordingly.
- [x] T035 [US4] Add status target to `tools/workspace-cli/project.json` (`workspace:status`).
- [x] T036 [US4] Publish status command usage notes in `docs/orchestration/status.md`.

---

## Phase 7: User Story 5 - Access consolidated service logs (Priority: P2)

**Goal**: Provide predictable access to rotated logs for application processes and dependencies via workspace CLI commands.

**Independent Test**: Launch two services via the workflow, generate log output, and retrieve logs for each service over a requested timeframe.

- [x] T037 [US5] Configure pm2-logrotate settings using the official module (`pm2 install pm2-logrotate` + `pm2 set` calls) and document defaults in `tools/workspace-cli/pm2/logrotate.config.cjs` if needed.
- [x] T038 [US5] Register logrotate module hookup in `tools/workspace-cli/src/pm2/logrotate.ts` (wrapping `pm2 install/set` commands) and initialize it from `tools/workspace-cli/src/cli.ts`.
- [x] T039 [US5] Implement log retrieval utilities in `tools/workspace-cli/src/logs/read.ts`, incorporating functionality currently provided by `scripts/collect-service-logs.mjs` so the legacy helper can be retired.
- [x] T040 [US5] Add `workspace:logs` target to `tools/workspace-cli/project.json`.
- [x] T041 [US5] Document log retrieval workflow in `docs/orchestration/logs.md`.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Retire legacy scripts, align documentation, and ensure onboarding guidance references the new workspace command surface.

- [ ] T042 Remove legacy dev-manager scripts from `package.json`.
- [ ] T043 Delete superseded helpers in `scripts/dev-manager.mjs`, `scripts/run-e2e-with-logs.mjs`, and related dev-manager utilities.
- [ ] T044 Update `RUNBOOK.md` with workspace lifecycle guidance.
- [ ] T045 Revise `SETUP.md` and `QUICK_START_DEV.md` to reference Nx workspace workflows.
- [ ] T046 Implement pre-flight edge-case checks (tooling, ports, env vars, requested profile availability) in `tools/workspace-cli/src/preflight/checks.ts` and invoke from workspace CLI entry.
- [ ] T047 Document troubleshooting guidance for dependency images, restart thresholds, and port collisions in `docs/orchestration/troubleshooting.md`.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: Complete Nx initialization before creating workspace CLI sources.
- **Phase 2 → User Stories**: Foundational workspace CLI scaffolding must exist prior to any story work.
- **User Stories**: US1, US2, and US3 (all P1) should land sequentially so lifecycle flows build on setup; US4 and US5 (P2) depend on earlier stories but are independent of each other.
- **Polish**: Execute after all targeted user stories are complete to avoid removing scripts still in use.

## Parallel Opportunities

- T014 can run in parallel with T013 once the workspace CLI stub exists, because they touch different project files.
- Within US3, T026–T028 focus on config files while T029 prepares Nx bindings; different engineers can split these after dependency profiles are defined.
- Documentation tasks (T020, T032, T036, T041, T044, T045, T047) can proceed in parallel once their corresponding functionality is in place.

## Implementation Strategy

1. Finish Phases 1 and 2 to establish the workspace CLI scaffold.
2. Deliver **MVP** by completing User Story 1 (Phase 3) and validating service setup commands end-to-end.
3. Layer User Story 2 for supervised lifecycle and User Story 3 for dependency orchestration to round out P1 scope.
4. Add observability enhancements (User Stories 4 and 5) to satisfy P2 requirements.
5. Conclude with polish tasks to remove legacy tooling and refresh onboarding documentation.
