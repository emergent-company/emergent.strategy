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

### Phase 1B: AIM Canonical Alignment (prerequisite for Phase 2)

Phase 1 built the write-back plumbing (CLI commands, MCP tools, shared types). A post-implementation audit revealed that the **canonical AIM definitions** — schemas, templates, and wizards in `epf-canonical` — are internally inconsistent: templates produce YAML that fails their own schemas, schemas use different enum values than the bootstrap tools, and wizards don't reference the new write-back tools. Phase 2 (READY propagation) depends on AIM artifacts being valid, so these gaps must be closed first.

- Fix AIM schemas in canonical-epf: add `cycle_transition` trigger, fix assumption ID pattern (`asmp-` → `asm-`), add optional `meta` to assessment/calibration schemas
- Fix AIM templates: rewrite assessment report template from track-nested to flat arrays (matching schema), fix LRA template `adoption_context` fields (wrong field names, invalid enum values), remove non-schema fields from calibration memo template `next_ready_inputs`
- Fix AIM bootstrap tool enum misalignment: `organization_type`, `ai_capability_level`, `primary_bottleneck` values don't match LRA schema
- Update Synthesizer wizard with write-back tool references
- Sync canonical → embedded, rebuild, validate emergent instance

### Phase 1C: Strategic Reality Check Artifact (builds on Phase 1B)

A deep audit of all 14 EPF schemas revealed that AIM currently only evaluates the Roadmap Recipe — the Assessment Report tracks OKR outcomes and assumption validations, but neither it nor the Calibration Memo has structured data to evaluate whether the other 6 READY artifacts or any FIRE artifacts are still valid. Phase 1C closes this gap by introducing a new AIM artifact type: the **Strategic Reality Check (SRC)**.

The SRC is organized by **detection type** (not by artifact), covering five categories:

1. **Belief validity** — challenges North Star beliefs, Strategy Formula risks, Roadmap assumptions against current evidence
2. **Market currency** — evaluates freshness of Insight Analyses, competitive landscape, and opportunity confidence
3. **Strategic alignment** — checks cross-reference integrity (value model paths, KR links, feature dependencies) and maturity vocabulary consistency
4. **Execution reality** — assesses feature maturity progression, implementation staleness, and Product Portfolio status accuracy
5. **Recalibration plan** — the primary output: prioritized list of READY/FIRE artifacts needing update, with specific sections and effort estimates

Each finding links to a specific artifact file and field path, making the SRC actionable input for the Calibration Memo and (in Phase 2) the `aim recalibrate` command.

- Create SRC schema, template, and wizard in canonical-epf
- Add `aim generate-src` CLI command — auto-populates mechanical checks (freshness, cross-references, maturity mismatches), leaves subjective sections (belief validity, confidence drift) as TODOs for AI/human input
- Add `aim write-src` CLI command — writes/updates SRC from structured input (for AI agent to fill in subjective assessments)
- Add corresponding MCP tools (`epf_aim_generate_src`, `epf_aim_write_src`)
- Register SRC in epf-cli artifact discovery (schema registry, template registry)
- Sync canonical → embedded, rebuild, validate

### Phase 2: Recalibration Propagation (builds on Phase 1B + 1C)

- Define recalibration protocol: maps calibration memo decisions **and SRC recalibration_plan** to specific READY/FIRE artifact fields
- Add `aim recalibrate` command that reads calibration memo (and optionally SRC) and generates a diff/changeset for READY artifacts
- Add relationship drift detection: automated checks for stale LRA signals, overdue assessments, unfilled KR outcomes (overlaps with SRC `strategic_alignment` section — SRC generates the findings, `aim health` surfaces them as diagnostics)
- Add `aim health` subcommand for AIM-specific diagnostics (separate from instance health check)

### Phase 3: AIM Monitoring (CLI-native + server-deferred)

Phase 3 is split between CLI-native work and server-side features, reflecting the architectural boundary established in Design Decision #9. The CLI remains a stateless analysis engine; stateful concerns (persistent metric storage, continuous monitoring, webhook receivers) are deferred to the `emergent` backend server.

**CLI-native (this change):**
- Add trigger evaluation engine: `aim check-triggers` evaluates `aim_trigger_config.yaml` thresholds against current data (ROI waste signals, assumption invalidation, calendar triggers)
- Add script-based data collection: `aim collect` orchestrates user-provided collector scripts that call external systems and output metric YAML (Design Decision #10). One built-in collector: `git_velocity` (commits/week, files changed — runs locally)
- Add `aim_data_sources.yaml` config artifact with `data_sources`, `kr_mappings` (derive KR status from raw metrics), and `trigger_feeds` sections
- Add `aim probe` command — generates probe report from collected metrics + trigger evaluation
- Add metric and probe report schemas to canonical-epf

**Server-deferred (integration via protocols, not shared code — see Design Decision #11):**
- Persistent metric storage via `emergent` knowledge graph API (graph objects for metrics, relationships for KR mappings) or dedicated database — decision deferred
- Continuous monitoring with webhook delivery for trigger alerts
- Dashboard/API for AIM health visualization
- Webhook receivers for external system integration (ClickUp, GitHub, CI/CD)
- Cross-agent coordination via A2A protocol (agent discovery, task delegation between EPF and emergent agents)

### Phase 4: Autonomous Recalibration (depends on `add-emergent-ai-strategy`)

- Wire AI Strategy Agent as the Synthesizer persona for automated AIM sessions
- Agent autonomously: collects track health signals, fills assessment reports, drafts calibration memos
- Agent proposes READY artifact updates and creates PRs
- Human approval gate before propagating changes
- Full closed-loop: FIRE changes -> data collection -> AIM assessment -> calibration -> READY updates

## Impact

- Affected specs: `epf-cli-mcp` (new AIM write-back tools), `epf-strategy-instance` (new AIM artifact requirements)
- Affected code: `apps/epf-cli/cmd/aim*.go`, `apps/epf-cli/internal/mcp/aim_tools.go`, new `internal/aim/` package
- Affected instance: `docs/EPF/_instances/emergent/AIM/` (LRA fix, new artifacts, SRC artifact)
- Affected canonical repo: `emergent-company/epf-canonical` — Phase 1B fixes schema/template/wizard inconsistencies; Phase 1C adds SRC schema/template/wizard (new artifact type); Phases 2-4 will require further schema, template, and wizard updates pushed upstream and synced into `epf-cli` via `sync-embedded.sh`

## Relationship to Other Changes

This is the foundation of a three-part dependency chain:

```
add-aim-recalibration-engine (this change)
  │
  ├── Phases 1-2 ✅ shipped (v0.18.1) — standalone, no dependencies
  │   Delivers: AIM MCP tools, write-back commands, SRC, recalibration, health
  │
  ├── Phase 3 CLI ⬜ next — standalone, no dependencies
  │   Delivers: trigger evaluation, script-based data collection, probe reports
  │
  ├── Phase 3S (server-deferred) ──► needs: add-epf-cloud-server
  │   Delivers: persistent metric storage, continuous monitoring, dashboard API
  │   Deferred to server component (per Decision #9: CLI stays stateless)
  │
  └── Phase 4 ──► needs: add-emergent-ai-strategy ──► needs: add-epf-cloud-server
      Delivers: autonomous recalibration via AI Strategy Agent
      Uses: AIM MCP tools (already shipped) as the agent's write-back interface
```

### What this change provides to downstream changes

| Downstream change | What it gets from here |
|---|---|
| `add-epf-cloud-server` | All 49+ MCP tools to expose over HTTP/SSE (AIM tools are a significant addition) |
| `add-emergent-ai-strategy` | AIM MCP tools for autonomous strategy operations (assess, calibrate, recalibrate, SRC, health, triggers) |

### Coordination points

- **Phase 3S ↔ cloud server:** When `add-epf-cloud-server` is built, Phase 3S tasks move there. Integration is via MCP tools and REST API (per Decision #11), not shared Go packages. For persistent storage, the server can use `emergent`'s knowledge graph API or a dedicated database — decision deferred.
- **Phase 4 ↔ AI strategy:** Phase 4 provides AIM-specific agent instruction sets and trigger-to-agent invocation. The AI strategy change provides the headless agent engine. Agent coordination uses A2A protocol; tool access uses MCP.
