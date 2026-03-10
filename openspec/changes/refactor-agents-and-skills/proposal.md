# Change: Refactor Wizards and Generators into a Unified Agents & Skills Architecture

## Why

The epf-cli currently has two parallel systems for AI-guided workflows that serve overlapping purposes with different structures:

- **Wizards** (20 Markdown files): Conversational agents (`*.agent_prompt.md`) and step-by-step guides (`*.wizard.md`) that tell AI agents how to create EPF artifacts. They have no formal schema, metadata is parsed from Markdown content via regex, and they are served as raw text blobs through MCP tools. Types are distinguished purely by filename suffix conventions.

- **Output Generators** (5 multi-file bundles): Each generator is a directory with a manifest (`generator.yaml`), AI instructions (`wizard.instructions.md`), output validation schema (`schema.json`), a bash validator (`validator.sh`), and optional templates. They have a proper manifest schema, three-tier discovery (instance > framework > global), scaffolding, sharing (copy/export/install), and validation tooling.

The generator structure is already close to what a proper "AI skill" looks like: it has a prompt (wizard.instructions.md), tool configuration (manifest with required artifacts), validation (schema + bash), and extensibility (user-created generators in their repo). Meanwhile, wizards are essentially "agents without skills" -- they have instructions but no structured metadata, no validation, no extensibility story, and no way for users to create custom ones.

This refactoring proposes to unify both into a two-concept architecture: **Agents** (who orchestrate) and **Skills** (what they can do), with a clear three-layer delivery model: CLI (core logic) -> MCP Server (universal interface) -> Orchestration Plugins (platform-specific activation). This would:

1. **Eliminate the conceptual split** between wizards and generators, giving users one mental model
2. **Enable user-created agents and skills** using the same instance/framework/global discovery that generators already have
3. **Make EPF capabilities portable** across any AI agent runtime (MCP, OpenCode plugins, Claude Desktop, Cursor, etc.) by defining agents and skills in a standard, runtime-agnostic format
4. **Preserve backward compatibility** by mapping existing wizards to agents and existing generators to skills
5. **Enable true agent activation** in platforms that support it (OpenCode via system prompt injection, tool scoping, and proactive guardrails) while remaining useful as passive content delivery in simpler MCP hosts
6. **Define a standard activation protocol** that all platform-specific orchestration plugins follow, so building a Cursor or Claude Desktop plugin follows the same pattern as opencode-epf

## What Changes

- **NEW: Agent manifest format** (`agent.yaml`) — Structured metadata for what is currently a wizard/agent_prompt. Defines identity, personality, capability class, required skills and tools, phase associations, trigger phrases, and routing rules. Replaces regex-parsed Markdown metadata.
- **NEW: Skill manifest format** (`skill.yaml`) — Evolution of `generator.yaml` that also covers artifact creation skills (what wizards currently do). A skill bundles a prompt, prerequisites, validation, templates, capability class, and optional tool scope for a specific capability.
- **NEW: Agent & Skill loader** — Unified discovery with same three-tier priority (instance > framework > global) and embedded fallback. Lazy-loads manifests at startup, full prompt content on demand. Replaces separate `wizard.Loader` and `generator.Loader`.
- **NEW: MCP Resources exposure** — Skills are exposed via the MCP `list_resources()` / `read_resource()` primitives under `strategy://skills/` URIs, enabling lazy-loading and progressive disclosure for MCP hosts.
- **NEW: MCP Prompts exposure** — Agents are exposed via the MCP `list_prompts()` / `get_prompt()` primitives, enabling native persona switching in hosts that support MCP Prompts.
- **NEW: Capability Classes** — Both agents and skills declare a `capability.class` (high-reasoning, balanced, fast-exec) and `capability.context_budget` (small, medium, large) so host runtimes can select appropriate models and context allocation.
- **MODIFIED: MCP tools** — Evolve wizard tools (`epf_list_wizards`, `epf_get_wizard`, `epf_get_wizard_for_task`) and generator tools (`epf_list_generators`, `epf_get_generator`, etc.) to agent/skill tools. Old tool names remain as aliases during transition.
- **MODIFIED: Canonical embedding** — `sync-embedded.sh` updated to sync agents and skills from canonical-epf instead of separate wizards/ and outputs/ directories.
- **MODIFIED: CLI commands** — `epf-cli agents` and `epf-cli skills` replace `wizards` and `generators` commands. Old commands remain as aliases.
- **NEW: User-created agents** — Same extensibility pattern as generators: users can create custom agents in their EPF instance, share them, scaffold them.
- **NEW: Plugin detection and advisory** — The MCP server detects whether an orchestration plugin (opencode-epf) is active and adapts its responses accordingly. In standalone mode (no plugin), agent prompts include self-enforcement protocols for validation, pre-commit checks, and tool scoping. The `epf_agent_instructions` tool advises the AI about available plugins with installation hints.
- **NEW: Standalone mode prompt adaptation** — Agent and skill responses include additional guardrail text when no plugin is present, compensating for the missing automatic validation, commit guards, and tool scoping that the plugin provides.
- **NON-BREAKING: Existing formats permanently supported** — Existing `generator.yaml` manifests, `wizard.instructions.md` prompts, and `{instance}/generators/` directories continue to work indefinitely as first-class inputs. Existing `.agent_prompt.md` and `.wizard.md` files are read by the new loader. New `agent.yaml`/`skill.yaml` formats are additive — they unlock new capabilities (capability classes, tool scoping, MCP Resources/Prompts) but are never required.

## Impact

- Affected specs: `epf-cli-mcp` (wizard tools, generator tools, agent instructions), `epf-opencode-plugin` (agent activation, skill-aware validation, tool scoping)
- Affected code (epf-cli):
  - `internal/wizard/` — Replace with `internal/agent/`
  - `internal/generator/` — Replace with `internal/skill/`
  - `internal/embedded/embedded.go` — Update embed directives
  - `internal/mcp/wizard_tools.go` — Replace with `agent_tools.go`
  - `internal/mcp/generator_tools.go` — Replace with `skill_tools.go`
  - `internal/mcp/server.go` — Tool + Resources + Prompts registration
  - `cmd/wizards.go` — Replace with `cmd/agents.go`
  - `cmd/generators.go` — Replace with `cmd/skills.go`
  - `scripts/sync-embedded.sh` — Sync from new canonical structure
- Affected code (opencode-epf plugin):
  - `packages/opencode-epf/src/index.ts` — Agent activation hooks, skill-aware validation
  - `packages/opencode-epf/src/tools.ts` — New agent activation tool, updated dashboard
  - `packages/opencode-epf/src/cli.ts` — New CLI command wrappers for agents/skills
- Affected external: `canonical-epf` repository directory structure
- Migration required for: All existing wizard and generator files in canonical-epf
