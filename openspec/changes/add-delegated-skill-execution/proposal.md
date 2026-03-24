# Change: Add Delegated Skill Execution to EPF CLI

## Why

The epf-cli skill system currently operates in a single mode: **prompt-delivery**. Skills are bundles of metadata + prompt text returned to the LLM, which follows the instructions manually. This works well for strategic reasoning tasks (writing feature definitions, generating investor memos, conducting trend analysis).

However, some EPF/strategy workflows need **deterministic code execution** rather than LLM prompt-following:

- **Memory graph operations** -- Ingesting, syncing, querying, and maintaining the strategy graph in emergent.memory requires precise API calls, retry logic, and structured data handling that LLMs handle unreliably.
- **Batch validation pipelines** -- Running comprehensive quality audits across an entire instance with structured output aggregation.
- **Data transformation pipelines** -- Converting EPF artifacts into formats for external systems (CRM sync, project management tools, reporting dashboards).
- **Automated assessment workflows** -- Collecting metrics, comparing against baselines, and producing assessment reports with deterministic calculations.

The prompt-delivery model cannot handle these reliably -- the LLM cannot manage retry loops, cannot guarantee API call sequences, and introduces non-determinism where determinism is required.

This proposal adds a `delegated` execution mode to skill manifests and introduces `packages/epf-agents/` -- a TypeScript MCP server in this repo that provides computational skill execution for EPF and strategy workloads.

## What Changes

- **ADDED: `execution` field on `SkillManifest`** -- Three modes: `prompt-delivery` (default, existing behavior), `delegated` (proxied to a companion MCP server), and `inline` (future: executed by the Go binary directly).
- **ADDED: `delegate` block on `SkillManifest`** -- For `delegated` skills, specifies the target MCP server name and tool name.
- **MODIFIED: `handleGetSkill` in MCP server** -- For `delegated` skills, returns delegation instructions (which MCP server + tool to call) instead of prompt content. The LLM acts as an orchestrator, not an executor.
- **ADDED: `packages/epf-agents/`** -- A TypeScript MCP server (Bun) providing computational agent/skill implementations for EPF and strategy workloads. Runs as a separate MCP server alongside `epf-cli serve`.
- **ADDED: Computational skill implementations** -- Initial set of skills focused on Memory graph operations (deterministic ingestion, graph maintenance, structured queries).
- **NON-BREAKING: Existing skills unchanged** -- The `execution` field defaults to `prompt-delivery`. All existing prompt-delivery skills continue to work identically. No migration required.

## Scope Clarification

- **In scope:** EPF and strategy computational skills (Memory operations, validation pipelines, assessment automation).
- **Out of scope:** Marketing/agency computational skills (those belong in `sequence-agents` in the CouplerAgency/sequence repo).
- **Out of scope:** Hard coupling with `sequence-agents`. The teams share learnings and best practices but the implementations are independent.
- **Prompt-delivery agents/skills** continue to live in `epf-canonical` (emergent-epf repo). Only computational skills that need code execution live in `packages/epf-agents/`.

## Impact

- Affected specs: `epf-cli-mcp` (skill execution, new tool behavior)
- Affected code (epf-cli):
  - `internal/skill/types.go` -- Add `Execution`, `DelegateSpec` fields to `SkillManifest`
  - `internal/mcp/skill_tools.go` -- `handleGetSkill` checks execution mode, returns delegation instructions for `delegated` skills
  - `internal/embedded/` -- Embed delegated skill manifests (YAML only, no TS code)
- New code:
  - `packages/epf-agents/` -- TypeScript MCP server with computational skill implementations
- No changes to:
  - Three-tier discovery (instance > framework > global > embedded)
  - Agent-to-skill relationships (`skills.required` in agent.yaml)
  - Recommender system (keyword matching works on manifests regardless of execution mode)
  - Plugin interaction (opencode-epf tool scoping, validation hooks)

## Related

- GitHub Issue #25: Proposal that inspired this (contains examples from bildebot/sequence context that are out of scope here)
- `refactor-agents-and-skills` change: Established the current agent/skill architecture (Phase 1 complete)
- `migrate-canonical-agents-skills` change: Phase 2 canonical content migration (in progress)
- CouplerAgency/sequence `sequence-agents`: Parallel effort using similar patterns for marketing execution (no hard coupling)
