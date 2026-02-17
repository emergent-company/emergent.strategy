# Change: Add Emergent AI Strategy Agent

## Why

Strategy teams using EPF maintain dozens of interconnected YAML artifacts — north stars, personas, feature definitions, roadmaps, value models — each validated against `epf-canonical` schemas and linked through EPF's relationship model (value model paths, `contributes_to`, KR references, persona links). Keeping these artifacts internally consistent, strategically aligned, and schema-valid as strategy evolves is a manual, error-prone process.

Emergent AI Strategy is a **framework-aware AI writing engine** that uses headless OpenCode to write, maintain, and validate EPF artifacts programmatically. The architecture is designed with a framework-agnostic engine layer so that additional structured frameworks (similar to EPF) can be plugged in later, but the first version is EPF-specific.

This builds on top of the EPF Cloud Strategy Server (see `add-epf-cloud-server` change), which provides the strategic context MCP server that the agent uses to understand existing strategy when writing artifacts.

## What Changes

- Add AI strategy engine at `apps/emergent-ai-strategy/` — headless OpenCode orchestration for EPF artifact operations
- Add framework-agnostic engine layer (session management, OpenCode orchestration, A2A protocol — formerly ACP, merged under Linux Foundation) with pluggable framework layer (EPF strategy server provides context + validation, `epf-canonical` provides schemas, `emergent` knowledge graph provides persistence + semantic search + graph analysis)
- Add EPF artifact workflows: writing new artifacts, updating artifacts when strategy changes, validating cross-artifact consistency, resolving relationship integrity
- Add subscription + overage billing model
- **Dependency**: Requires `add-epf-cloud-server` to be implemented first (provides the MCP server for strategic context)

## Impact

- Affected specs: `ai-strategy-engine` (new capability), `ai-strategy-platform` (new capability)
- New infrastructure: Vertex AI model access, per-session compute isolation, billing/metering
- New code: `apps/emergent-ai-strategy/`
- The EPF Cloud Strategy Server becomes the strategic context backend for the AI agent

## Relationship to Other Changes

This is the top of a three-part dependency chain:

```
add-aim-recalibration-engine (Phases 1-3 CLI)
  │ Delivers: AIM MCP tools (assess, calibrate, recalibrate, SRC, health, triggers)
  │ Status: Phases 1-2 shipped (v0.18.1), Phase 3 CLI next
  │
  └──► add-epf-cloud-server
        │ Delivers: MCP-over-HTTP, GitHub source, Cloud Run hosting
        │ Status: Not started
        │
        └──► add-emergent-ai-strategy (this change)
              Uses: Cloud server as MCP context provider
              Uses: AIM MCP tools for autonomous recalibration (Phase 4)
```

### AIM Integration (Phase 4 of `add-aim-recalibration-engine`)

The AI Strategy Agent is the **Synthesizer persona** for autonomous AIM operations. When this agent is operational, `add-aim-recalibration-engine` Phase 4 wires it up to:

- Collect track health signals and fill assessment reports using AIM MCP tools (`epf_aim_write_assessment`)
- Draft calibration memos with persevere/pivot/pull-the-plug recommendations (`epf_aim_write_calibration`)
- Generate and apply READY artifact changesets via `epf_aim_recalibrate`
- Monitor triggers and auto-invoke assessment when ROI thresholds are exceeded (`epf_aim_check_triggers`)

The AIM MCP tools are already built (shipped in v0.18.1). This change provides the autonomous agent that calls them. Phase 4 of the AIM change provides the glue: agent instruction sets, trigger-to-agent invocation, and human approval gates.

### What the AI agent needs from this repo at minimum

1. **EPF Cloud Strategy Server running** (from `add-epf-cloud-server`) — provides strategic context via MCP
2. **AIM MCP tools available** (from `add-aim-recalibration-engine`, already shipped) — provides write-back capabilities
3. **`epf-canonical` schemas** (already exists) — for validating generated artifacts

### What the AI agent gains from `emergent` (optional, additive)

4. **`emergent` knowledge graph** (from `emergent-company/emergent`) — persistent strategy storage, vector similarity search, graph traversal for alignment analysis, branch-based scenario modeling. Accessed via REST API, Go SDK, or MCP — not a hard dependency. Integration per `add-aim-recalibration-engine` Decision #11 (agent-native protocols, `emergent` as tool not dependency).
