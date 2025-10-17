# Feature Specification: Nx Development Orchestration & Logging

**Feature Branch**: `[002-specify-scripts-bash]`  
**Created**: 2025-10-16  
**Status**: Draft  
**Input**: User description: "i want nx to run all the setup and pm2 to be able to restart and manage logs, for now mainly during the development, logs should be gathered in one place from each service, i want to clean up scripts and as far as i know nx will be able tu run different service specific scripts from root folder"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run services from a single workspace entry point (Priority: P1)

Developers need to trigger setup tasks and service-specific scripts from the repository root so they can spin up any service without hunting for bespoke scripts.

**Why this priority**: Fragmented scripts slow down onboarding and daily development; centralizing commands yields immediate productivity gains.

**Independent Test**: From a clean clone, execute the documented workspace command for a representative service and verify setup and launch complete without manual steps.

**Acceptance Scenarios**:

1. **Given** a developer with a fresh environment, **When** they run the standardized workspace command to prepare a service, **Then** dependencies install and configuration steps finish without manual intervention.
2. **Given** an existing service, **When** a developer runs the service-specific task via the root workspace, **Then** the service starts using the canonical script defined for that project.

---

### User Story 2 - Manage development processes with centralized restarts (Priority: P1)

Developers need a single workflow to restart services and ensure they stay running during development, using PM2 as the process manager behind the workspace commands.

**Why this priority**: Reliable restarts eliminate manual terminal juggling and align with the user’s request to rely on PM2 for supervision.

**Independent Test**: Start a service using the documented workspace command, simulate a failure, and confirm the restart workflow restores the process and surfaces status information.

**Acceptance Scenarios**:

1. **Given** a service registered with the shared process manager, **When** a developer issues the workspace restart command, **Then** the process stops and restarts cleanly with confirmation output.
2. **Given** the process manager detects a crash, **When** the automatic recovery is triggered, **Then** the service returns to a running state and the restart is recorded in the shared status command output.

---

### User Story 3 - Review service logs in one location (Priority: P2)

Developers and support staff need a consolidated log directory per service so they can debug issues without chasing scattered files across scripts.

**Why this priority**: Central logs accelerate troubleshooting and are necessary for the PM2 management workflow the user described.

**Independent Test**: Run two services via the workspace commands and verify their output streams into the designated log location with separate files for stdout and stderr.

**Acceptance Scenarios**:

1. **Given** services launched through the workspace, **When** an engineer inspects the shared log directory, **Then** each service has predictable log files containing the latest output.
2. **Given** a log rotation event occurs, **When** a developer requests logs through the documented workflow, **Then** archived logs remain accessible alongside the current file.

---

### Edge Cases

- Workspace command invoked for a service without a defined configuration: the process should fail fast with guidance on how to register the service.
- A service writes excessive log volume: log rotation policies must prevent disk exhaustion while preserving recent output.
- PM2 cannot restart a service due to configuration errors: the workflow must surface actionable error messages and stop retrying to avoid flapping.
- Multiple developers run the same service concurrently: logs must remain separated per machine or namespace to avoid collisions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST define Nx workspace targets that encapsulate setup, start, and stop commands for every active service, callable from the repository root.
- **FR-002**: Workspace targets MUST standardize environment initialization steps (dependency install, configuration loading) so new machines complete setup without manual scripts.
- **FR-003**: The platform MUST integrate PM2 process definitions for each service, enabling start, restart, and status operations through workspace commands.
- **FR-004**: PM2-managed services MUST capture stdout and stderr into a shared log directory with consistent naming per service and rolling retention.
- **FR-005**: Logs MUST be accessible through a documented workflow (e.g., workspace command or path convention) that works for local development and remote development hosts.
- **FR-006**: Legacy ad-hoc shell scripts MUST be either retired or wrapped by workspace targets to avoid duplicate entry points.
- **FR-007**: The solution MUST include documentation describing how to add new services to the workspace and logging system.
- **FR-008**: Automated checks (CI or pre-commit) MUST verify that declared workspace targets and PM2 configurations are valid to prevent regressions.

### Key Entities *(include if feature involves data)*

- **Workspace Target Catalog**: Defines each service’s standardized tasks (setup, run, restart) along with dependencies and environment expectations.
- **Process Manager Profile**: Maps services to PM2 configurations including script entry points, restart policies, and log destinations.
- **Shared Log Archive**: Central location storing service log files, rotation metadata, and access controls for developers.

## Assumptions

- Development hosts already support installing PM2 and Node.js versions required by the workspace.
- Existing services can be adapted to the standardized workspace target structure without major refactors.
- Centralized logging will initially focus on development; production log aggregation strategies are out of scope.
- CI infrastructure can execute Nx workspace commands in the same manner as developers to perform validation checks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can provision and start any service from a clean environment in under 10 minutes using the standardized workspace commands.
- **SC-002**: Restarting a service through the shared process management workflow takes less than 30 seconds end-to-end during development drills.
- **SC-003**: 100% of development services write logs to the designated shared directory, with retention policies ensuring at least seven days of history.
- **SC-004**: At least 80% of surveyed developers report reduced reliance on bespoke scripts after adopting the centralized workspace workflow.
- **SC-005**: CI validation of workspace targets and process configurations passes on the first run for 95% of new service onboarding attempts.

