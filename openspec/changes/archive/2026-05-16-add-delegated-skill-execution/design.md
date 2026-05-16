## Context

The EPF CLI has a clean agent/skill architecture where skills are prompt packages delivered to the LLM via MCP tools. Some skills contain deterministic algorithms (template rendering, graph algorithms, arithmetic) that the LLM executes unreliably. We need to add code execution for these skills while maintaining the same distribution model: one `epf-cli` binary via Homebrew, available to all users.

### Stakeholders

- EPF CLI users (local and cloud)
- Strategy instance maintainers
- OpenCode plugin (tool scoping, validation hooks)

## Goals / Non-Goals

### Goals

- Add an `inline` execution mode where the Go binary runs computational skills directly
- Implement value-model-preview as pure Go template rendering (zero LLM involvement)
- Implement balance-checker scoring algorithms in Go (LLM handles only interactive input and narrative output)
- Maintain single-binary distribution via Homebrew -- no additional runtime dependencies
- Design a plugin system for external skill packs (Phase 2)
- Keep full backward compatibility with prompt-delivery skills

### Non-Goals

- Companion TypeScript MCP server (superseded -- distribution requirements killed this approach)
- Hard coupling with `sequence-agents` or any external agent framework
- Moving prompt-delivery skills out of epf-canonical
- Implementing Memory graph operation skills (deferred until Memory server matures)
- Building a general-purpose agent execution framework

## Decisions

### Decision 1: Four execution modes in skill.yaml

Add an `execution` field to `SkillManifest` with three active modes and one reserved:

```yaml
# Mode 1: Prompt-delivery (default, existing behavior)
execution: prompt-delivery

# Mode 2: Inline Go execution (core computational skills)
execution: inline
inline:
  handler: value-model-preview    # Maps to a registered Go function
  parameters:                     # Input parameter schema
    - name: instance_path
      type: string
      required: true
    - name: format
      type: string
      default: single
      enum: [single, portfolio, comparison]

# Mode 3: Script execution (user-authored computational skills)
execution: script
script:
  command: python3                # Any executable on PATH
  args: [scripts/vat_calculator.py]  # Arguments (relative to skill directory)
  input: json                     # stdin format (json)
  output: json                    # stdout format (json)
  timeout: 30                     # Execution timeout in seconds (default: 30)

# Mode 4: External plugin execution (Phase 2, reserved)
execution: plugin
plugin:
  pack: compliance                # Pack name (resolves to epf-pack-compliance binary)
  handler: skattefunn-budget      # Handler within the pack
```

**Why:** Four modes cover the full spectrum of skill authorship:
- `prompt-delivery`: LLM-driven reasoning (existing, anyone can author)
- `inline`: High-performance Go execution (EPF core team, compiled into binary)
- `script`: Any-language computation (instance users, no compilation needed)
- `plugin`: Distributable computation (pack authors, Phase 2)

The `script` mode is critical for extensibility. Users of the stock `epf-cli` binary or Docker image can write custom computational skills by placing a script alongside a skill manifest in their instance's `skills/` directory. No forking, no compilation, no plugin system needed.

**Alternatives considered:**
- Companion TypeScript MCP server (`delegated` mode): Rejected. Cannot be distributed via Homebrew without requiring Bun or shipping ~80MB compiled binaries. Users who install `epf-cli` via Homebrew would not have access to computational skills.
- Compiled Bun binaries shipped alongside `epf-cli`: Rejected. Triples binary size, adds CI complexity for 4 platform targets, and introduces a second runtime for marginal benefit.
- Inline-only (no script mode): Rejected. Forces users to fork the repo or wait for the plugin system to write custom computational skills. The script subprocess pattern is trivial to implement and covers the "light extension" use case immediately.

### Decision 2: Go-only computational skills

All computational skill implementations SHALL be written in Go inside `internal/compute/`. When external code snippets exist in other languages (Python, TypeScript), they should be reimplemented in Go. AI coding agents make this trivial for algorithmic code.

**Why:** One language, one binary, one test framework, one distribution. The Go standard library covers everything these skills need: `text/template` for HTML rendering, standard data structures for graph algorithms, `math` for scoring formulas.

**Escape hatch:** The plugin system (Phase 2) is language-agnostic. External skill packs can be written in any language that produces a binary with the `epf-pack-*` CLI contract. This handles genuinely hard-to-reimplement capabilities (ML models, complex numerical libraries) without polluting the core binary.

### Decision 3: New MCP tool `epf_execute_skill` for inline execution

Inline skills are executed via a new `epf_execute_skill` tool, separate from `epf_get_skill`:

```
epf_execute_skill({
  skill: "value-model-preview",
  instance_path: "docs/EPF/_instances/emergent",
  parameters: { format: "single", theme: "auto" }
})
```

Returns structured results directly -- no LLM interpretation needed for the computational parts.

**Why:** Clean separation. `epf_get_skill` returns prompt content for the LLM to follow. `epf_execute_skill` runs code and returns results. Mixing both into one tool would make the response format unpredictable.

When `epf_get_skill` is called for an inline skill, it returns instructions directing the LLM to call `epf_execute_skill` instead. The skill manifest's prompt content (if any) is still available for hybrid skills where the LLM handles non-computational parts.

### Decision 4: Compute package architecture

```
internal/compute/
├── registry.go              # Handler registration and lookup
├── types.go                 # ExecutionResult, ExecutionLog types
├── valuemodel/
│   ├── preview.go           # value-model-preview handler
│   └── preview_test.go
└── balance/
    ├── checker.go           # balance-checker handler
    ├── graph.go             # Cycle detection, critical path
    ├── scoring.go           # Capacity, balance, coherence, alignment scores
    └── checker_test.go
```

Each handler implements a simple interface:

```go
type SkillHandler interface {
    Execute(ctx context.Context, input json.RawMessage) (*ExecutionResult, error)
}
```

Handlers are registered at init time. The MCP tool looks up the handler by name from the skill manifest's `inline.handler` field.

**Why:** Isolated, testable packages. Each skill is independently unit-testable with real YAML input data. No dependency on MCP infrastructure for testing.

### Decision 5: Structured execution results

Inline skills return structured results with execution metadata:

```json
{
  "success": true,
  "output": {
    "format": "html",
    "content": "<html>...</html>",
    "filename": "value-model-Product.html"
  },
  "execution_log": {
    "skill": "value-model-preview",
    "duration_ms": 45,
    "steps": [
      { "name": "load_value_models", "status": "success", "duration_ms": 12 },
      { "name": "render_template", "status": "success", "duration_ms": 28 },
      { "name": "validate_output", "status": "success", "duration_ms": 5 }
    ]
  }
}
```

**Why:** The LLM receives both the output and metadata about how it was produced. This replaces the observability that prompt-delivery skills get implicitly from the conversation log.

### Decision 6: Script execution for user-authored computational skills

Instance users can create computational skills by placing a script alongside a skill manifest:

```
docs/EPF/_instances/my-product/skills/vat-calculator/
├── skill.yaml           # execution: script, specifies command
├── calculate_vat.py     # The script (any language)
└── schema.json          # Optional: output validation
```

When `epf_execute_skill` encounters a `script` skill, it:

1. Resolves the command relative to the skill directory
2. Builds a JSON input object with `instance_path`, `parameters`, and skill metadata
3. Spawns the subprocess with the JSON on stdin
4. Reads JSON from stdout (must conform to `ExecutionResult` format)
5. Enforces the timeout (default 30s, configurable in manifest)
6. Wraps the result and returns it

The script receives a JSON object on stdin:
```json
{
  "instance_path": "/path/to/instance",
  "parameters": { "year": 2025, "rate": 0.25 },
  "skill_dir": "/path/to/skill/directory"
}
```

The script writes a JSON object to stdout:
```json
{
  "success": true,
  "output": { "format": "json", "content": { "vat_amount": 12500 } }
}
```

**Why:** This is the lightest possible extension point. Users don't need to fork the repo, compile anything, or install a plugin system. They write a script, add a manifest, and it's immediately available via `epf_execute_skill`. The subprocess boundary provides natural isolation -- a buggy script can't crash `epf-cli`.

**Security considerations:** Script execution is limited to instance-local skills (not embedded or framework). The command must be on PATH or specified as a relative path within the skill directory. No shell expansion is performed -- the command is executed directly via `os/exec`. The timeout prevents runaway scripts.

**Alternatives considered:**
- Embedded scripting engine (Lua, Starlark): Rejected. Adds a runtime dependency to the Go binary and limits the language to one choice. Subprocess supports any language.
- WASM execution: Interesting but premature. The toolchain for compiling scripts to WASM is not mature enough for a "just write a script" developer experience.

### Decision 7: Plugin system for external skill packs (Phase 2)

External skill packs are standalone binaries with a CLI contract:

```bash
# Discovery
epf-pack-compliance list-skills          # Returns JSON array of SkillManifest
epf-pack-compliance get-manifest <name>  # Returns single SkillManifest as JSON

# Execution
epf-pack-compliance execute <name> --input '{"instance_path": "...", ...}'
# Returns ExecutionResult JSON on stdout
```

`epf-cli` discovers packs by scanning PATH for `epf-pack-*` binaries. Pack skills appear in `epf_list_skills` with `source: plugin` and can be executed via `epf_execute_skill`.

Distribution options:
- `brew install epf-pack-compliance`
- `epf-cli plugins install compliance` (downloads from GitHub releases)
- Manual: drop binary on PATH

**Why:** Subprocess + JSON is dumb and robust. No shared memory, no Go plugin versioning issues, no API compatibility constraints. Each pack is independently compiled, versioned, and distributed. Packs can be written in any language.

**Not implementing in Phase 1:** The core inline execution infrastructure must be proven first. Plugin discovery adds complexity that isn't needed until there are actual external packs.

## Risks / Trade-offs

### Increased binary size
**Risk:** Adding computational logic and templates increases the `epf-cli` binary size.
**Mitigation:** The value-model-preview template is 728 lines (~30KB). The balance-checker algorithms are ~500 lines of Go. Total binary size increase is negligible relative to the current 22MB binary. Embedded templates are already compressed by `go:embed`.

### Hybrid skill complexity
**Risk:** Skills that are partially computational and partially LLM-driven (like balance-checker) require coordination between inline execution and prompt delivery.
**Mitigation:** Clear two-phase pattern: `epf_execute_skill` runs the algorithms and returns structured data, then the LLM uses that data to generate narrative output. The skill manifest can include both an `inline.handler` and a `prompt.md` for hybrid execution.

### Script execution security
**Risk:** Users could create skills that execute arbitrary commands.
**Mitigation:** Script skills are instance-local only (never embedded or from canonical). They require explicit `execution: script` in the manifest -- accidental execution is not possible. Commands are executed via `os/exec` without shell expansion. Timeout enforcement prevents resource exhaustion. In cloud/Docker deployments, the container's security context limits what scripts can access.

### Script portability
**Risk:** Script skills depend on the user's runtime environment (Python version, installed packages).
**Mitigation:** This is acceptable because instance-local skills are inherently non-portable. They're specific to that product's instance. Portable/distributable computational skills should use the `plugin` mode (Phase 2) which ships as a self-contained binary.

### Testing requirements change
**Risk:** Prompt-delivery skills test by checking output quality. Inline skills need deterministic unit tests.
**Mitigation:** Go's testing infrastructure is mature. Each compute handler has its own test file with real YAML fixtures. Integration tests verify the MCP tool end-to-end.

## Open Questions

1. **Hybrid skill UX:** For balance-checker, the LLM needs to gather capacity constraints interactively before calling `epf_execute_skill`. Should the skill manifest describe this two-phase flow explicitly, or should the prompt instructions handle the sequencing?

2. **Plugin pack naming convention:** Should packs be `epf-pack-<category>` (e.g., `epf-pack-compliance`) or `epf-pack-<name>` (e.g., `epf-pack-skattefunn`)? Category grouping reduces binary count but couples unrelated skills.

3. **Template caching:** Should `epf_execute_skill` cache compiled Go templates between calls, or rebuild each time? For a tool called via MCP (long-running server process), caching makes sense but adds state.
