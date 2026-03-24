## Context

The EPF CLI has a clean agent/skill architecture (established by `refactor-agents-and-skills`) where skills are prompt packages delivered to the LLM via MCP tools. The LLM is the execution engine. This works for reasoning tasks but fails for workflows requiring deterministic code execution, external API calls, or structured data pipelines.

We need to add computational execution without compromising the existing architecture's simplicity. The Go binary should stay pure Go. Computational work runs in a separate TypeScript process.

### Stakeholders

- EPF CLI users (agents, plugin)
- Strategy instance maintainers (Memory graph operations)
- OpenCode plugin (tool scoping, validation hooks)

## Goals / Non-Goals

### Goals

- Add a `delegated` execution mode to skill manifests that routes to companion MCP servers
- Create `packages/epf-agents/` as a TypeScript MCP server for EPF computational skills
- Keep the Go binary free of TypeScript/Node runtime dependencies
- Maintain full backward compatibility with existing prompt-delivery skills
- Enable deterministic Memory graph operations (ingest, sync, query, maintain)
- Provide structured logging/tracing for delegated execution (audit trail)

### Non-Goals

- Hard coupling with `sequence-agents` or any external agent framework
- Moving prompt-delivery skills out of epf-canonical
- Embedding the TS runtime into the Go binary
- Supporting arbitrary third-party computational skills (initially: only EPF-authored skills)
- Building a general-purpose agent execution framework

## Decisions

### Decision 1: Three execution modes in skill.yaml

Add an `execution` field to `SkillManifest` with three modes:

```yaml
# Mode 1: Prompt-delivery (default, existing behavior)
execution: prompt-delivery

# Mode 2: Delegated to companion MCP server
execution: delegated
delegate:
  server: epf-agents          # MCP server name from host config
  tool: memory_graph_sync     # Tool name on that server
  input_mapping: passthrough   # How skill inputs map to tool inputs

# Mode 3: Inline Go execution (future, not in this proposal)
execution: inline
```

**Why:** Additive field with backward-compatible default. No existing skill needs modification. The manifest remains the single source of truth for skill metadata regardless of how it's executed.

**Alternatives considered:**
- Separate manifest type for computational skills: Rejected because it fragments the discovery system and the agent-to-skill relationship model.
- Convention-based detection (e.g., presence of a `run.ts` file): Rejected because implicit behavior is harder to reason about and validate.

### Decision 2: epf-agents as a separate MCP server (process isolation)

The companion TypeScript server runs as a separate process, registered as its own MCP server in the host configuration:

```jsonc
{
  "mcp": {
    "epf-strategy": { "command": ["epf-cli", "serve"] },
    "epf-agents": { "command": ["bun", "run", "packages/epf-agents/serve.ts"] }
  }
}
```

**Why:** Process isolation means the Go binary has no TS runtime dependency. Each server can crash independently. The MCP protocol provides a clean interface boundary.

**Alternatives considered:**
- Embedding Bun/Deno in the Go binary via CGo: Rejected -- adds build complexity, cross-compilation issues, and couples runtimes.
- HTTP sidecar instead of MCP: Rejected -- MCP is already the protocol both sides speak; adding HTTP introduces protocol translation overhead.

### Decision 3: LLM as orchestrator for delegated skills

When `handleGetSkill` encounters a `delegated` skill, it returns instructions telling the LLM to call the specified tool on the specified MCP server. The LLM acts as a router, not an executor:

```
To execute this skill, call the tool `memory_graph_sync` on MCP server `epf-agents`
with the following parameters: { ... }
```

**Why:** This keeps the MCP server stateless (it never calls other MCP servers directly). The LLM already has access to all registered MCP servers and can call tools on any of them. No new transport or server-to-server communication needed.

**Alternatives considered:**
- Server-to-server MCP calls (epf-cli calling epf-agents directly): Rejected -- introduces coupling between servers and requires the Go binary to be an MCP client, which it currently is not.
- Plugin-mediated delegation (opencode-epf intercepts and routes): Rejected -- makes delegation platform-specific; standalone MCP hosts would not get delegation.

### Decision 4: Structured observability for delegated execution

Delegated skills MUST produce structured execution logs that the calling agent can include in the audit trail:

```yaml
# epf-agents tool response includes:
execution_log:
  skill: memory-graph-sync
  started_at: "2025-01-15T10:30:00Z"
  completed_at: "2025-01-15T10:30:45Z"
  steps:
    - name: load_artifacts
      status: success
      duration_ms: 120
    - name: sync_to_memory
      status: success
      duration_ms: 44800
      details: "Synced 47 objects, 23 relationships"
  result: success
```

**Why:** Prompt-delivery skills have implicit observability (the LLM's conversation log shows everything). Delegated execution is opaque by default. Without structured logs, debugging failures requires digging into the TS process logs separately.

### Decision 5: Bun as the TypeScript runtime (dependency, not compiled)

Use Bun for the `epf-agents` server. Bun is a runtime dependency -- users run from source via `bun run packages/epf-agents/serve.ts`. No compilation step.

**Why:** Fast startup, native TypeScript support, built-in test runner. The OpenCode plugin (`opencode-epf`) already uses Bun, so anyone working in this repo has it installed. Running from source means no build/release pipeline for the companion server and faster iteration during development.

**Alternatives considered:**
- Compiled standalone binary (`bun build --compile`): Premature. Adds CI complexity for multi-platform builds. Can be introduced later if distribution to non-developers becomes a need.
- Node.js + tsx: Slower startup, requires separate compilation step.
- Deno: Good option but the team already uses Bun for the plugin.

### Decision 6: TypeScript-only skill implementations

All computational skill implementations in `epf-agents` SHALL be written in TypeScript. When external code snippets exist in other languages (Python, Go, etc.), they should be reimplemented in TypeScript rather than shelled out to or wrapped.

**Why:** A single-language codebase means one test framework, one dependency tree, one set of conventions, and one deployment unit. Mixed runtimes inside `epf-agents` would import the dependency management burden of every runtime touched (e.g., `pyproject.toml`, virtual environments, version pinning for a single Python snippet).

**Escape hatch:** The delegation protocol is inherently polyglot at the MCP level. If a genuinely hard-to-reimplement capability emerges (ML models, complex numerical libraries), it can be registered as a separate MCP server in any language and skill manifests can point to it via `delegate.server`. This requires no changes to `epf-agents` -- the architecture already supports it. But this is the exception, not the pattern.

**Alternatives considered:**
- Subprocess shelling (TypeScript calls `python script.py`): Contained but messy. Creates implicit runtime dependencies that break silently on machines without the right Python version. Avoid as a pattern.
- Polyglot skills within `epf-agents`: Rejected. The operational complexity of multiple runtimes inside one server outweighs the convenience of avoiding a TypeScript rewrite.

## Risks / Trade-offs

### Two runtimes in the same system
**Risk:** Go + Bun increases operational complexity.
**Mitigation:** Process isolation via separate MCP servers. Each process is independently deployable and testable. The Go binary has zero TS dependencies.

### Scope creep in computational skills
**Risk:** Delegated skills can run arbitrary code, making it tempting to move logic that should stay in the Go binary.
**Mitigation:** Clear rule: if it's validation, schema, or artifact loading, it stays in Go. If it requires external API calls, binary data, or multi-step pipelines with retry logic, it goes to epf-agents.

### Observability gap
**Risk:** Delegated execution is opaque to the LLM's conversation log.
**Mitigation:** Structured execution logs (Decision 4) are returned as part of the tool response. The `epf_session_audit` tool already tracks MCP tool calls, so delegated calls appear in the audit trail.

### Testing divergence
**Risk:** Prompt-delivery skills test by checking output quality. Delegated skills need unit tests, integration tests, mocking.
**Mitigation:** Standard TypeScript testing (Bun test runner). Integration tests can use the MCP test harness.

## Open Questions

1. **Initial computational skills:** What are the first 2-3 concrete computational skills to build? Memory graph sync is the obvious candidate. What else? Automated assessment data collection? Instance health report generation?

2. **Skill input/output schema alignment:** Should delegated skills use the same Zod/JSON Schema validation as prompt-delivery skills, or do they need a different validation model since inputs come from tool call parameters rather than LLM-generated YAML?

3. ~~**Distribution:**~~ **Resolved.** Bun as a runtime dependency, run from source. Compiled binary deferred until distribution to non-developers becomes a need (see Decision 5).

4. **Plugin awareness:** Should `opencode-epf` have special handling for delegated skills (e.g., auto-connecting to epf-agents, health checking the companion server)?

5. **Agent manifest updates:** Should agents be able to declare that they require delegated skills? Currently `skills.required` lists skill names without distinguishing execution mode. The agent would discover delegation at skill-load time, but should it know upfront?
