# Change: Add Emergent AI Strategy Agent

## Why

Strategy teams using EPF maintain dozens of interconnected YAML artifacts — north stars, personas, feature definitions, roadmaps, value models — each validated against `epf-canonical` schemas and linked through EPF's relationship model (value model paths, `contributes_to`, KR references, persona links). Keeping these artifacts internally consistent, strategically aligned, and schema-valid as strategy evolves is a manual, error-prone process.

Emergent AI Strategy is a **framework-aware AI writing engine** that uses headless OpenCode to write, maintain, and validate EPF artifacts programmatically. The architecture is designed with a framework-agnostic engine layer so that additional structured frameworks (similar to EPF) can be plugged in later, but the first version is EPF-specific.

This builds on top of the EPF Cloud Strategy Server (see `add-epf-cloud-server` change), which provides the strategic context MCP server that the agent uses to understand existing strategy when writing artifacts.

## What Changes

- Add AI strategy engine at `apps/emergent-ai-strategy/` — headless OpenCode orchestration for EPF artifact operations
- Add framework-agnostic engine layer (session management, OpenCode orchestration, ACP protocol) with pluggable framework layer (EPF strategy server provides context + validation, `epf-canonical` provides schemas)
- Add EPF artifact workflows: writing new artifacts, updating artifacts when strategy changes, validating cross-artifact consistency, resolving relationship integrity
- Add subscription + overage billing model
- **Dependency**: Requires `add-epf-cloud-server` to be implemented first (provides the MCP server for strategic context)

## Impact

- Affected specs: `ai-strategy-engine` (new capability), `ai-strategy-platform` (new capability)
- New infrastructure: Vertex AI model access, per-session compute isolation, billing/metering
- New code: `apps/emergent-ai-strategy/`
- The EPF Cloud Strategy Server becomes the strategic context backend for the AI agent
