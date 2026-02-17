# Change: Add AIM Recalibration Engine

## Why

The AIM phase is the least developed part of both the EPF framework tooling and the emergent instance. The existing CLI tools (`aim assess`, `aim validate-assumptions`, `aim okr-progress`) are read-only generators -- they produce templates and reports but cannot write assessment results back, propagate recalibration decisions to READY artifacts, or proactively detect when recalibration is needed.

The emergent instance has a single stale LRA from January 2025, no assessment reports, no calibration memos, no trigger config, and no cycle history -- despite significant product progress (Memory at v0.9.4, EPF CLI at v0.13.0, Diane shipped, 4 KRs completed). The AIM-to-READY feedback loop that makes EPF a closed-loop system is entirely manual and broken.

This change builds the AIM recalibration engine in four phases, progressing from write-back tooling through autonomous recalibration. It coordinates with `add-epf-cloud-server` (Phase 3 monitoring can run server-side) and `add-emergent-ai-strategy` (Phase 4 uses the AI Strategy Agent as the Synthesizer).

## What Changes

### Phase 1: AIM Foundation (standalone, no dependencies)

- Add CLI write-back commands: `aim update-lra`, `aim write-assessment`, `aim write-calibration`
- Add corresponding MCP tools for AI agent integration
- Add cycle archival: `aim archive-cycle` saves completed cycle artifacts to `cycles/cycle-N/`
- Fix emergent instance: rename LRA file, update stale content, instantiate trigger config
- Add `aim init-cycle` command to bootstrap a new cycle's AIM artifacts from template

### Phase 2: Recalibration Propagation (builds on Phase 1)

- Define recalibration protocol: maps calibration memo decisions to specific READY artifact fields
- Add `aim recalibrate` command that reads calibration memo and generates a diff/changeset for READY artifacts
- Add relationship drift detection: automated checks for stale LRA signals, overdue assessments, unfilled KR outcomes
- Add `aim health` subcommand for AIM-specific diagnostics (separate from instance health check)

### Phase 3: AIM Monitoring (coordinates with `add-epf-cloud-server`)

- Add `aim monitor` scheduled check that evaluates trigger config thresholds
- Add data ingestion: git commit velocity, external metric hooks
- Generate probe reports (weekly health snapshots matching the `aim_trigger_assessment` wizard spec)
- Surface proactive recalibration suggestions via MCP notifications
- If cloud server available: run monitoring server-side with webhook delivery

### Phase 4: Autonomous Recalibration (depends on `add-emergent-ai-strategy`)

- Wire AI Strategy Agent as the Synthesizer persona for automated AIM sessions
- Agent autonomously: collects track health signals, fills assessment reports, drafts calibration memos
- Agent proposes READY artifact updates and creates PRs
- Human approval gate before propagating changes
- Full closed-loop: FIRE changes -> data collection -> AIM assessment -> calibration -> READY updates

## Impact

- Affected specs: `epf-cli-mcp` (new AIM write-back tools), `epf-strategy-instance` (new AIM artifact requirements)
- Affected code: `apps/epf-cli/cmd/aim*.go`, `apps/epf-cli/internal/mcp/aim_tools.go`, new `internal/aim/` package
- Affected instance: `docs/EPF/_instances/emergent/AIM/` (LRA fix, new artifacts)
- Affected canonical repo: `emergent-company/epf-canonical` — Phases 2-4 will require schema, template, and wizard updates pushed upstream and synced into `epf-cli` via `sync-embedded.sh`
- Coordination: Phase 3 aligns with `add-epf-cloud-server` cloud deployment; Phase 4 depends on `add-emergent-ai-strategy` AI agent
