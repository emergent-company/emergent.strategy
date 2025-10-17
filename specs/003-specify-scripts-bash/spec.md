# Feature Specification: PM2 Governance for Docker Services

**Feature Branch**: `003-specify-scripts-bash`  
**Created**: 2025-10-16  
**Status**: Draft  
**Input**: User description: "for docker services like database or zitadel i want to also pm2 handle starts/restarts/status and log"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Start core docker services through PM2 (Priority: P1)

Operations engineers need a single command to start or restart docker-backed foundation services (e.g., PostgreSQL database, Zitadel auth) through PM2 so they can bring the workspace up reliably without juggling compose commands.

**Why this priority**: Without deterministic startup, local onboarding and CI job recovery fail. This is the minimum slice that restores developer productivity.

**Independent Test**: Run the PM2-managed start command for a docker service and confirm the container starts, health checks pass, and the PM2 process is registered.

**Acceptance Scenarios**:

1. **Given** a stopped PostgreSQL docker service and PM2 orchestrator available, **When** an engineer runs the PM2-managed start command, **Then** the PostgreSQL container starts, is tracked by PM2, and the command exits with a success summary.
2. **Given** a running Zitadel service managed by PM2, **When** the engineer issues a PM2 restart for that profile, **Then** PM2 gracefully restarts the underlying container and reports the new process ID without manual docker commands.

---

### User Story 2 - Inspect docker service health from PM2 (Priority: P2)

Operations engineers want to check status for all PM2-managed docker services in one place so they can quickly confirm environments are healthy.

**Why this priority**: Shared status reduces time spent chasing failures and enables consistent CI health checks.

**Independent Test**: Execute the aggregated status command and confirm it surfaces PM2 state (online/stopped), container health, and last restart timestamp for each managed service.

**Acceptance Scenarios**:

1. **Given** multiple docker services managed by PM2, **When** an engineer requests consolidated status, **Then** the output lists each service with PM2 state, container health indicator, and restart count without needing docker CLI access.

---

### User Story 3 - Review service logs via PM2 aggregation (Priority: P3)

Operations engineers need access to historical logs for PM2-managed docker services from a centralized location so they can troubleshoot without tailing multiple containers.

**Why this priority**: Log aggregation lowers mean time to resolution by providing consistent retention and retrieval across services.

**Independent Test**: Trigger log generation in one managed service, run the PM2 log retrieval command, and confirm the relevant entries are available with timestamps and service labels.

**Acceptance Scenarios**:

1. **Given** PM2-managed services writing to the shared log directory, **When** an engineer requests the logs for Zitadel, **Then** the system returns timestamped entries scoped to that service for the requested period.

---

### Edge Cases

- Service container fails to start because the docker image is missing or outdated—PM2 must surface the error message and leave the process in a failed state without retry loops.
- Ports required by the docker service are already in use when PM2 attempts startup—engineer receives a collision alert with the conflicting process identified.
- Log directory reaches retention limits—system rotates or prunes logs without deleting active streams.
- PM2 restarts exceed policy thresholds (e.g., crash loop)—engineer receives notification and guidance to inspect root cause.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide PM2-managed profiles for each docker foundation service (e.g., database, Zitadel) enabling start, stop, and restart actions through standardized commands.
- **FR-002**: The system MUST ensure PM2 start commands validate that required docker images are present and pull or notify when they are missing before attempting startup.
- **FR-003**: Engineers MUST be able to retrieve a consolidated status report that includes PM2 process state, container health, uptime, and last restart timestamp for every managed service.
- **FR-004**: The system MUST capture docker service stdout/stderr into a shared log directory with service-specific labeling and configurable retention periods.
- **FR-005**: PM2 MUST automatically attempt a configurable number of restarts when a managed docker service exits unexpectedly and log the reason for the failure.
- **FR-006**: The system MUST emit a clear alert or exit code when a PM2-managed docker service cannot bind to its configured ports, including the conflicting process identifier.
- **FR-007**: Engineers MUST be able to request historical logs for a managed service over a specified time window without accessing docker directly.
- **FR-008**: The system MUST expose service management commands through Nx task runners so CI and developers can invoke a consistent interface.

### Key Entities *(include if feature involves data)*

- **Docker Service Profile**: Represents a foundational docker-based dependency (database, Zitadel) with attributes such as service name, docker compose reference, required environment variables, and PM2 restart policy.
- **Service Health Snapshot**: Captures the current PM2 state, container health indicator, uptime, last restart timestamp, and recent failure reason for a managed service.
- **Aggregated Log Stream**: Logical view of logs stored in the shared directory, tagged by service name, timestamp, and severity to support retrieval and retention policies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Engineers can start or restart any managed docker service in under 30 seconds using the standardized service control command, confirmed during onboarding dry runs.
- **SC-002**: Aggregated status checks report accurate service states with no more than a 5-second data lag in 95% of CI executions.
- **SC-003**: Log retrieval for a managed service returns the requested timeframe within 3 seconds for 90% of queries covering the most recent 24 hours.
- **SC-004**: Unexpected docker service outages in development or CI are resolved within 5 minutes in at least 90% of incidents due to automated restart policies and shared visibility.
- **SC-005**: Manual docker CLI usage for starting/stopping core services decreases by 80% within one month of rollout, measured through developer feedback surveys.

## Assumptions

- PM2 remains the orchestration layer for local and CI service management, and Nx command wrappers are already accepted as the execution interface for developers.
- Docker-compose definitions for foundation services are stable and expose health checks that PM2 can rely on for status evaluations.
- Log storage has sufficient disk space, and retention policies can be configured without introducing compliance risks.
- Engineers have permission to receive alerts or exit codes from PM2 processes within both local and CI environments.

