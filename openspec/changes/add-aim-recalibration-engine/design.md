## Context

The EPF AIM phase currently has read-only tooling and no closed-loop feedback. The existing CLI commands (`aim assess`, `aim okr-progress`, `aim validate-assumptions`) generate templates and reports but cannot write results back, and nothing propagates calibration decisions into READY artifacts. This design describes the architectural decisions for building a complete AIM recalibration engine across four phases.

### Stakeholders

- **EPF CLI users** — need write-back tools for AIM artifacts
- **AI Strategy Agent** (future) — needs MCP tools to autonomously run AIM sessions
- **EPF Cloud Server** (future) — needs monitoring integration for server-side trigger evaluation

## Goals / Non-Goals

### Goals

- Enable complete AIM cycle execution via CLI and MCP tools (write assessment, calibrate, propagate)
- Support cycle-over-cycle tracking with archived history
- Automate drift detection and trigger evaluation
- Prepare data contracts for autonomous AI recalibration
- Maintain backward compatibility with existing AIM commands

### Non-Goals

- Building a full data warehouse or analytics platform (metrics are lightweight YAML files)
- Real-time monitoring (weekly cadence is sufficient for Phase 3)
- Multi-tenant monitoring (single instance per server, multi-instance is a cloud server concern)
- UI/dashboard for AIM data (CLI and MCP are the interfaces)

## Decisions

### 1. AIM artifact write-back via structured input, not freeform YAML

**Decision:** Write-back commands accept structured parameters (field-level updates) rather than accepting raw YAML content to overwrite files.

**Rationale:** Structured input enables:
- Validation at write time (reject invalid states)
- Automatic evolution log entries (track what changed and why)
- Merge semantics (update specific fields without losing others)
- MCP tool compatibility (JSON parameters map cleanly)

**Alternative considered:** Accept raw YAML and validate after write. Rejected because it doesn't enable automatic evolution tracking and makes MCP tool design harder (large string parameters).

### 2. Cycle archival as directory snapshots

**Decision:** Completed cycles are archived as `cycles/cycle-N/` directories containing copies of the assessment report, calibration memo, track health signals, and a snapshot of the LRA at cycle end.

**Rationale:** Simple, git-friendly, enables cycle-over-cycle comparison. The LRA snapshot captures the baseline that was in effect during the cycle, while the current LRA evolves.

**Alternative considered:** Single timeline file with all cycles appended. Rejected because it becomes unwieldy and makes cycle-specific queries harder.

### 3. Recalibration as changeset, not direct write

**Decision:** `aim recalibrate` generates a changeset (structured diff) that can be previewed (`--dry-run`) before applying. Applied changes are logged in the LRA evolution log.

**Rationale:** Recalibration touches foundational READY artifacts (north star, strategy formula). These changes should be reviewable before applying. The changeset format also enables the AI agent to generate proposals as PRs.

### 4. Metrics as timestamped YAML in AIM/metrics/

**Decision:** Ingested metrics are stored as simple timestamped YAML files in `AIM/metrics/YYYY-MM-DD_<source>.yaml`. No database.

**Rationale:** Keeps the entire EPF instance as a git-trackable YAML tree. Metric files are small and infrequent (weekly). Schema validation applies. This is sufficient for the monitoring use case; production analytics should live in dedicated systems.

**Alternative considered:** SQLite database in AIM directory. Rejected because it breaks the "everything is YAML in git" principle and adds a binary file to the repo.

### 5. Monitoring as periodic check, not persistent daemon

**Decision:** `aim monitor` is a periodic evaluation command (invoke via cron, CI, or as a scheduled goroutine in the MCP server) rather than a standalone daemon process.

**Rationale:** A daemon adds operational complexity (process management, crash recovery, resource usage). Periodic evaluation is sufficient for weekly cadence. The MCP server already has a long-running process that can host scheduled checks if needed. Cloud Run's scheduled invocations provide the server-side equivalent.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Phase 4 depends on AI Strategy Agent which doesn't exist yet | Phases 1-3 are fully standalone; Phase 4 tasks define clear integration points |
| Recalibration changeset format may not cover all READY artifact variations | Start with the most common patterns (track focus changes, assumption updates, OKR adjustments); extend as needed |
| Metric YAML files could proliferate in git | Add retention policy to trigger config (keep N weeks of metrics, prune older ones) |
| Write-back commands change AIM artifacts, risking data loss | All writes append to evolution log; `aim archive-cycle` creates snapshots before modifications |

## Open Questions

- Should probe reports be a new canonical artifact type with their own schema, or are they ephemeral output (like the track health signals)?
- What is the minimum set of READY artifacts that `aim recalibrate` should support in Phase 2? (Start with roadmap_recipe + strategy_formula, or all 6?)
- Should the monitoring goroutine in the MCP server be opt-in via a config flag, or always-on when the server has a trigger config?
