# Research Findings: Unified Nx & PM2 Orchestration and Logging

## Decision 1: Nx task topology
- **Decision**: Use Nx target wrappers (`run-commands` executor) to expose `setup`, `start`, `restart`, `status`, and `logs` commands for each service and dependency, delegating to PM2 or Docker-aware scripts.
- **Rationale**: Keeps orchestration declarative inside `project.json`, integrates with existing Nx caching/affected-graph, and allows CI to invoke the same workflows via `nx run`.
- **Alternatives considered**:
  - **Custom Nx plugin**: Rejected for initial rollout; higher maintenance without immediate benefit over `run-commands`.
  - **Standalone npm scripts per workspace**: Would fragment workflows outside Nx and lose affected-run integration.

## Decision 2: Supervising docker dependencies
- **Decision**: Model foundational dependencies as PM2 processes that execute deterministic shell scripts (e.g., `docker compose up <service>` and `docker compose stop <service>`), using `pm2 start` in `fork` mode with `interpreter: bash`.
- **Rationale**: Allows PM2 to track process lifecycle, restart policies, and centralized logs while still delegating actual container control to Docker Compose.
- **Alternatives considered**:
  - **Direct `docker compose` usage without PM2**: Violates requirement for single supervision surface.
  - **Using a dedicated container orchestrator (e.g., Tilt, Skaffold)**: Overkill for current scope and increases onboarding complexity.

## Decision 3: Central log aggregation
- **Decision**: Route PM2 `out_file` and `error_file` for every process to `apps/logs/<service>/` and install `pm2-logrotate` with 7-day retention enforced by configuration committed to the repo.
- **Rationale**: Leverages PM2-native log redirection and battle-tested rotation plugin; satisfies requirement for predictable retention and retrieval speed.
- **Alternatives considered**:
  - **Custom log harvester script**: Adds maintenance burden and duplicates PM2 capabilities.
  - **External logging stack (ELK/Loki)**: Exceeds scope for dev/CI workflows.

## Decision 4: Unified status command
- **Decision**: Implement a composite status script invoked via Nx that reads from `pm2 jlist` (JSON process list) and, for docker dependencies, augments output with `docker inspect --format '{{.State.Health.Status}}'` to surface container health.
- **Rationale**: Provides single command with rich context, keeps implementation scriptable (Node/TypeScript), and meets requirement for consolidated visibility.
- **Alternatives considered**:
  - **Separate PM2 and Docker status commands**: Fails consolidation goal and increases operator toil.
  - **Ad-hoc dashboards**: Higher effort without immediate need.

## Decision 5: Restart escalation policy
- **Decision**: Configure PM2 processes with `max_restarts` and `min_uptime` thresholds, emitting non-zero exit codes + actionable messaging when thresholds exceeded; integrate with Nx command to bubble up failures to CI.
- **Rationale**: Aligns with requirement to avoid infinite crash loops and ensures CI detects instability quickly.
- **Alternatives considered**:
  - **Rely on PM2 defaults**: Defaults allow indefinite restarts, conflicting with escalation requirement.
  - **External watchdog scripts**: Redundant when PM2 already supports restart limits.

## Decision 6: Nx MCP enablement
- **Decision**: Use `npx nx configure-ai-agents` to enable the Nx MCP server via Nx Console with no custom bootstrap scripts.
- **Rationale**: Aligns with official Nx guidance, keeps configuration updated automatically, and avoids duplicating tooling.
- **Alternatives considered**:
  - **Custom `nx-mcp` bootstrap script**: Adds maintenance overhead and risks divergence from Nx releases.
  - **Manual agent configuration per tool**: Error-prone and harder to keep in sync across editors.

## Decision 7: Status output format
- **Decision**: Default orchestration status command to a human-readable table while offering a `--json` flag for automation.
- **Rationale**: Meets developer ergonomics for CLI inspection and still supports CI/automation pipelines needing structured data.
- **Alternatives considered**:
  - **Text-only output**: Harder to integrate with tooling.
  - **JSON-only output**: Less readable for day-to-day operations.

## Decision 8: Command naming strategy
- **Decision**: Replace the legacy `orchestrator:*` prefix with a root `workspace:*` family plus project-specific aliases like `admin:start` and `server:status` so commands read naturally and align with Nx project naming.
- **Rationale**: Matches user expectations for root commands (`status`, `admin:status`) while keeping the CLI implementation centralized in `tools/workspace-cli`.
- **Alternatives considered**:
  - **Keep `orchestrator:*` namespace**: Rejected due to verbosity and mismatch with Nx conventions.
  - **Custom npm binaries per service**: Adds maintenance overhead and fragments workflows outside Nx.
