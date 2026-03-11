## Context

The epf-cli currently provides two mechanisms for AI-guided workflows:

1. **Wizards** — 20 Markdown files with three subtypes (agent_prompt, wizard, ready_sub_wizard) distinguished by filename suffix. Metadata (purpose, triggers, duration, related resources) is extracted at runtime via regex patterns from the Markdown body. No formal schema, no user extensibility, no validation beyond "does it parse."

2. **Output Generators** — 5 multi-file bundles, each a directory containing `generator.yaml` (manifest), `wizard.instructions.md` (AI instructions), `schema.json` (output validation), `validator.sh` (bash checks), and optional templates. Has three-tier discovery (instance > framework > global), scaffolding, sharing (copy/export/install), and structured validation.

**Key insight:** Generators are already "skills with prompts and tools." Wizards are "agents without structure." The refactoring makes both concepts first-class and composable.

**Stakeholders:** Solo developers and small teams using EPF with AI agents (Cursor, OpenCode, Claude Desktop). The canonical-epf framework maintainers. Any future AI agent runtime that integrates via MCP.

**Constraints:**
- epf-cli is a standalone Go binary with no runtime dependencies
- Canonical content is embedded via `go:embed` at compile time
- Users must be able to create custom agents/skills in their repos
- MCP is the primary integration protocol for AI agents
- The existing "Agent as Writer, Tool as Linter" principle remains: epf-cli never writes EPF content directly

## Goals / Non-Goals

### Goals

1. **Unified mental model:** One concept for "AI persona that orchestrates" (Agent) and one for "bundled capability with prompt, validation, and tools" (Skill). Users learn two concepts instead of three (wizard types) + one (generator).

2. **Standard skill format:** Skills should be portable and runtime-agnostic. Any AI agent system that can read a prompt file and call MCP tools should be able to use an EPF skill. The format should be close to emerging industry patterns (prompt + tools + validation).

3. **User extensibility for agents:** Users can already create custom generators. They should also be able to create custom agents (e.g., a "Domain Expert" agent for their industry that knows how to use EPF skills in their specific context).

4. **Three-tier discovery for both:** Instance > Framework > Global priority for both agents and skills, matching the existing generator discovery pattern.

5. **Backward compatibility:** Existing MCP tool names work as aliases. Existing wizard/generator content can be auto-migrated. The transition should not break AI agent configurations.

6. **Composability:** Agents declare which skills they can use. Skills declare what tools they need. This creates a clear dependency graph.

### Non-Goals

- **Building an agent runtime:** epf-cli is not becoming an agent framework. It serves agent/skill definitions to AI runtimes (via MCP); it doesn't execute agents itself.
- **Multi-agent orchestration:** No agent-to-agent delegation within epf-cli. If an AI runtime supports multi-agent, it can use the agent definitions.
- **Breaking MCP compatibility:** All changes maintain MCP tool API compatibility with aliases.
- **Changing the EPF methodology:** The READY/FIRE/AIM lifecycle, value models, feature definitions, etc. remain unchanged. Only the delivery mechanism for AI guidance changes.

## Key Concepts

### Agent

An **Agent** is a named AI persona with a defined purpose, personality, and set of skills. It replaces the wizard/agent_prompt concept.

**Current state (wizard):**
```
wizards/pathfinder.agent_prompt.md  # Single markdown file
                                     # Metadata extracted via regex
                                     # ~500 lines of instructions
                                     # No formal structure
```

**Proposed state (agent):**
```
agents/pathfinder/
  agent.yaml          # Structured metadata (identity, skills, routing)
  prompt.md           # AI instructions (same content, cleaner separation)
  README.md           # Optional human documentation
```

### Skill

A **Skill** is a bundled capability that an agent (or any AI runtime) can invoke. It replaces both the wizard (.wizard.md) creation guides and the output generator concept.

**Current state (generator):**
```
outputs/context-sheet/
  generator.yaml              # Manifest
  wizard.instructions.md      # AI instructions
  schema.json                 # Output validation
  validator.sh                # Bash checks
```

**Proposed state (skill):**
```
skills/context-sheet-generation/
  skill.yaml                  # Manifest (evolved from generator.yaml)
  prompt.md                   # AI instructions (renamed from wizard.instructions.md)
  schema.json                 # Output validation (unchanged)
  validator.sh                # Bash checks (unchanged)
  template.md                 # Optional template (unchanged)
```

**New skill type — artifact creation (replaces wizards):**
```
skills/feature-definition-creation/
  skill.yaml                  # Manifest with required_tools, prerequisites
  prompt.md                   # AI instructions (content from feature_definition.wizard.md)
  schema.json                 # Optional: validation schema for the created artifact
```

### Skill Categories

Skills have a `type` field that distinguishes their purpose:

| Type | Replaces | Purpose | Example |
|------|----------|---------|---------|
| `creation` | Wizard (.wizard.md) | Create EPF artifacts | feature-definition-creation |
| `generation` | Generator | Generate output documents | context-sheet-generation |
| `review` | Review wizard | Evaluate artifact quality | strategic-coherence-review |
| `enrichment` | Enrichment wizard | Enhance existing artifacts | feature-enrichment |
| `analysis` | Agent prompt (analysis) | Analyze and report | market-analysis |

### Agent Categories

Agents have a `type` field:

| Type | Replaces | Purpose | Example |
|------|----------|---------|---------|
| `guide` | start_epf, lean_start | Onboarding and navigation | start-epf |
| `strategist` | pathfinder, synthesizer | Strategic planning | pathfinder |
| `specialist` | sub-wizards (01_trend_scout, etc.) | Domain expertise | trend-scout |
| `architect` | product_architect | Design and structure | product-architect |
| `reviewer` | balance_checker, value_model_review | Quality assurance | strategic-coherence |

## Decisions

### Decision 1: `agent.yaml` manifest format

**What:** A YAML manifest that replaces regex-parsed Markdown metadata.

```yaml
# agent.yaml
name: pathfinder
version: "1.0.0"
type: strategist
phase: READY

identity:
  display_name: "Pathfinder"
  description: "Strategic AI that guides teams through the READY phase"
  personality:
    - "Expert and confident but not condescending"
    - "Synthesizes complex information into actionable steps"
    - "Adapts approach based on team size and maturity"

capability:
  class: high-reasoning   # high-reasoning | balanced | fast-exec
  context_budget: large    # small | medium | large

routing:
  trigger_phrases:
    - "plan my strategy"
    - "start ready phase"
    - "help me with insights"
  keywords: ["strategy", "ready", "insights", "roadmap planning"]

skills:
  required:
    - trend-analysis
    - market-mapping
    - strategy-formulation
    - roadmap-planning
  optional:
    - feature-enrichment

tools:
  required:
    - epf_get_product_vision
    - epf_get_personas
    - epf_get_roadmap_summary
    - epf_validate_file

related_agents:
  - lean-start        # Alternative for smaller teams
  - product-architect  # Handoff after READY phase

prerequisites:
  instance_required: true
  lra_required: false    # Can bootstrap without LRA
```

**Alternatives considered:**
- Keep metadata in Markdown (status quo): Fragile regex parsing, no validation, no extensibility.
- JSON manifest: Less readable for humans who edit these files.
- TOML manifest: Less ecosystem support in the Go toolchain.

**Rationale:** YAML is consistent with all other EPF artifacts, has excellent Go library support, and is familiar to EPF users.

### Decision 2: `skill.yaml` manifest format

**What:** Evolution of `generator.yaml` that also covers creation/review skills.

```yaml
# skill.yaml
name: feature-definition-creation
version: "1.0.0"
type: creation
phase: FIRE

description: "Step-by-step guidance for creating EPF-compliant feature definitions"

requires:
  artifacts:
    - north_star
    - strategy_formula
  optional:
    - insight_analyses
    - value_model
  tools:
    - epf_get_schema
    - epf_get_template
    - epf_validate_file
    - epf_get_personas

output:
  format: yaml
  artifact_type: feature_definition   # For creation skills
  schema: schema.json                  # Optional validation schema
  validator: validator.sh              # Optional bash validator

files:
  prompt: prompt.md
  schema: schema.json
  validator: validator.sh
  template: template.yaml
```

**Key evolution from generator.yaml:**
- Added `type` field (creation/generation/review/enrichment/analysis)
- Added `requires.tools` (which MCP tools the skill needs)
- Added `output.artifact_type` (for creation skills, what EPF artifact is produced)
- Renamed `wizard.instructions.md` to `prompt.md` for clarity

**Alternatives considered:**
- Separate formats for creation vs generation skills: More cognitive load, harder to compose.
- No manifest for creation skills (keep them as bare Markdown): Loses the structured metadata that makes generators useful.

**Rationale:** One manifest format for all skill types. The `type` field distinguishes behavior. The format is a superset of `generator.yaml`, making migration straightforward.

### Decision 3: Discovery and loading architecture

**What:** A unified loader that discovers both agents and skills from three tiers.

```
Tier 1 (highest priority): Instance
  {instance}/agents/     → Custom agents
  {instance}/skills/     → Custom skills (replaces {instance}/generators/)

Tier 2: Framework
  {epfRoot}/agents/      → Canonical agents (replaces {epfRoot}/wizards/)
  {epfRoot}/skills/      → Canonical skills (replaces {epfRoot}/outputs/)
  Fallback: embedded via go:embed

Tier 3 (lowest priority): Global
  ~/.epf-cli/agents/     → User's shared agents
  ~/.epf-cli/skills/     → User's shared skills (replaces ~/.epf-cli/generators/)
```

**Alternatives considered:**
- Single unified directory (agents + skills mixed): Harder to browse, unclear what's what.
- Keep separate wizard/generator directories: Preserves confusion, doesn't solve the problem.

**Rationale:** Separate directories for agents and skills mirrors the conceptual separation while sharing the same loader infrastructure.

### Decision 4: MCP tool evolution

**What:** New tool names with old names as aliases.

| Old Tool | New Tool | Notes |
|----------|----------|-------|
| `epf_list_wizards` | `epf_list_agents` | Alias maintained |
| `epf_get_wizard` | `epf_get_agent` | Alias maintained |
| `epf_get_wizard_for_task` | `epf_get_agent_for_task` | Alias maintained |
| `epf_list_generators` | `epf_list_skills` | Alias maintained |
| `epf_get_generator` | `epf_get_skill` | Alias maintained |
| `epf_scaffold_generator` | `epf_scaffold_skill` | Alias maintained |
| `epf_check_generator_prereqs` | `epf_check_skill_prereqs` | Alias maintained |
| `epf_validate_generator_output` | `epf_validate_skill_output` | Alias maintained |
| N/A (new) | `epf_scaffold_agent` | Create custom agents |
| N/A (new) | `epf_list_agent_skills` | Show skills for an agent |

**Alternatives considered:**
- Break old tool names immediately: Disrupts existing AI agent configurations.
- Only add new names, keep old as-is forever: Maintains backward compatibility but doubles the documented surface area.

**Rationale:** Generator tool aliases are permanent (the format is a permanent input). Wizard tool aliases may eventually emit soft deprecation hints in documentation (not in responses), since wizards are being restructured. In both cases, the old tool names continue to work indefinitely. AGENTS.md and tool descriptions will reference new names as primary, with old names documented as aliases.

### Decision 5: Canonical directory restructure

**What:** Restructure canonical-epf from `wizards/` + `outputs/` to `agents/` + `skills/`.

```
canonical-epf/
  agents/
    start-epf/
      agent.yaml
      prompt.md
    pathfinder/
      agent.yaml
      prompt.md
    ...
  skills/
    feature-definition-creation/
      skill.yaml
      prompt.md
    context-sheet-generation/
      skill.yaml
      prompt.md
      schema.json
      validator.sh
    ...
```

**Migration from current structure:**
- `wizards/start_epf.agent_prompt.md` → `agents/start-epf/agent.yaml` + `agents/start-epf/prompt.md`
- `wizards/feature_definition.wizard.md` → `skills/feature-definition-creation/skill.yaml` + `skills/feature-definition-creation/prompt.md`
- `outputs/context-sheet/` → `skills/context-sheet-generation/` (manifest rename only)

### Decision 6: Full backward compatibility for user-created generators

**What:** Existing `generator.yaml` manifests and the `{instance}/generators/` directory structure continue to work indefinitely. The skill loader treats generators as a first-class input format, not a deprecated legacy.

**The user's contract today:**

Users have created custom generators in `{instance}/generators/{name}/` with this file structure:

```
my-product/generators/pitch-deck/
  generator.yaml              # manifest (name, version, description, category, requires, output)
  wizard.instructions.md      # AI instructions
  schema.json                 # output validation schema
  validator.sh                # bash validator (executable)
  template.md                 # output template (optional)
  README.md                   # documentation (optional)
```

And a `generator.yaml` with this format:

```yaml
name: pitch-deck
version: 1.0.0
description: Generate a pitch deck from EPF strategy data
category: investor
author: My Team
regions:
  - NO

requires:
  artifacts:
    - north_star
    - strategy_formula
  optional:
    - roadmap_recipe

output:
  format: markdown
  schema: schema.json
  validator: validator.sh

files:
  schema: schema.json
  wizard: wizard.instructions.md
  validator: validator.sh
  template: template.md
```

They also use these tools and commands:
- `epf_scaffold_generator` / `epf-cli generators scaffold` — to create new generators
- `epf_list_generators` / `epf-cli generators list` — to discover generators
- `epf_get_generator` / `epf-cli generators show` — to get generator details
- `epf_check_generator_prereqs` / `epf-cli generators check` — to check prerequisites
- `epf_validate_generator_output` / `epf-cli generators validate` — to validate output
- `epf-cli generators copy/export/install` — to share generators

**Backward compatibility guarantees:**

1. **Directory unchanged:** `{instance}/generators/` continues to be scanned. Users do NOT need to rename it to `skills/`. The skill loader reads from BOTH `{instance}/generators/` and `{instance}/skills/`.

2. **`generator.yaml` is a permanent alias for `skill.yaml`:** If a directory contains `generator.yaml` but no `skill.yaml`, the skill loader reads `generator.yaml` and maps its fields to the skill manifest internally. No file rename required.

3. **`wizard.instructions.md` is a permanent alias for `prompt.md`:** The skill loader checks for `prompt.md` first, falls back to `wizard.instructions.md`. Users' existing prompt files continue to work.

4. **All existing fields preserved:** Every field in `generator.yaml` maps directly to `skill.yaml`:
   - `name` → `name`
   - `version` → `version`
   - `description` → `description`
   - `category` → `category` (kept as-is; skills add `type` as a new orthogonal field)
   - `author` → `author`
   - `regions` → `regions`
   - `requires.artifacts` → `requires.artifacts`
   - `requires.optional` → `requires.optional`
   - `output.format` → `output.format`
   - `output.schema` → `output.schema`
   - `output.validator` → `output.validator`
   - `files.*` → `files.*`

5. **`type` is inferred when absent:** If `generator.yaml` lacks a `type` field (which it always will, since it's new), the loader infers `type: generation`. Users never need to add a `type` field to their existing generators.

6. **All MCP tool aliases maintained permanently:**

   | Old tool (permanent alias) | New tool | Behavior |
   |---|---|---|
   | `epf_scaffold_generator` | `epf_scaffold_skill` | Creates in `{instance}/generators/` by default (not `skills/`) |
   | `epf_list_generators` | `epf_list_skills` | Filters to `type: generation` + `category` filter |
   | `epf_get_generator` | `epf_get_skill` | Returns content with generator-compatible field names |
   | `epf_check_generator_prereqs` | `epf_check_skill_prereqs` | Identical behavior |
   | `epf_validate_generator_output` | `epf_validate_skill_output` | Identical behavior |

7. **All CLI command aliases maintained permanently:**

   | Old command (permanent alias) | New command |
   |---|---|
   | `epf-cli generators list` | `epf-cli skills list` |
   | `epf-cli generators show` | `epf-cli skills show` |
   | `epf-cli generators scaffold` | `epf-cli skills scaffold` |
   | `epf-cli generators check` | `epf-cli skills check` |
   | `epf-cli generators validate` | `epf-cli skills validate` |
   | `epf-cli generators copy` | `epf-cli skills copy` |
   | `epf-cli generators export` | `epf-cli skills export` |
   | `epf-cli generators install` | `epf-cli skills install` |

8. **Scaffold default location unchanged:** `epf_scaffold_generator` continues to create generators in `{instance}/generators/` (not `{instance}/skills/`). Only `epf_scaffold_skill` uses `{instance}/skills/` as default. Users' muscle memory is preserved.

9. **Export/import interoperability:** Generators exported as `.tar.gz` with the old format can be installed and work without modification. The installer detects `generator.yaml` vs `skill.yaml` and handles both.

**What's new for generators (additive only):**

Users who want to opt into new skill features can add these optional fields to their existing `generator.yaml`:
- `type: generation` (explicit, but auto-inferred if absent)
- `requires.tools: [...]` (declare needed MCP tools)
- `capability.class: balanced` (model tier hint)
- `scope.preferred_tools: [...]` (tool scoping hint)

These fields are purely additive. Existing `generator.yaml` files without them continue to work exactly as before.

**Alternatives considered:**
- Require migration to `skill.yaml`: Breaks existing users, no benefit since the formats are compatible.
- Deprecate `generator.yaml` on a timeline: Adds pressure without adding value. The formats are a superset.
- Support `generator.yaml` as read-only (no scaffold/share): Inconsistent UX. Users should be able to scaffold, share, and manage generators the same way they always have.

**Rationale:** The generator format is a strict subset of the skill format. There is zero technical reason to break it. Users who have invested in building custom generators should see the refactoring as additive (they gain new capabilities) rather than disruptive (they must change files). The "permanent alias" approach costs almost nothing in code complexity — it's just an extra filename check in the loader.

### Decision 6b: Transition strategy

**What:** Two-phase rollout with permanent backward compatibility.

**Phase 1 (this proposal):** Build the new loader, manifests, and MCP tools alongside the existing system. The new skill loader reads both `skill.yaml` and `generator.yaml`. The new agent loader reads both `agent.yaml` and `.agent_prompt.md`. Old MCP tool names and CLI commands become permanent aliases. The `{instance}/generators/` directory is scanned alongside `{instance}/skills/`. No breaking changes whatsoever.

**Phase 2 (separate proposal):** Migrate all canonical content to new format. Update AGENTS.md to reference new concepts primarily. Old tool names and the `generators/` directory continue to work.

**What is NOT in any phase:** Removal of `generator.yaml` support, removal of the `generators/` directory path, removal of old MCP tool names, or removal of old CLI command names. These are permanent aliases.

**Rationale:** De-risks the change. Users see only additive improvements. The cost of maintaining aliases is trivial compared to the cost of breaking user workflows.

## Risks / Trade-offs

- **Risk: Scope creep** — "Agents and skills" is a broad concept that could grow unbounded.
  - Mitigation: The non-goals are clear. This is a restructuring of existing content delivery, not a new agent framework.

- **Risk: User confusion during transition** — Two naming systems in parallel.
  - Mitigation: Phase 1 maintains full backward compatibility. Phase 2 only starts after Phase 1 is validated.

- **Risk: canonical-epf coordination** — Restructuring requires changes in a separate repository.
  - Mitigation: Phase 1 doesn't require canonical-epf changes (new loader reads old formats). Phase 2 coordinates the canonical migration.

- **Trade-off: More files per agent/skill** — Agents go from 1 file to 2-3 files. Skills (creation type) go from 1 file to 2-3 files.
  - Benefit: Structured metadata enables programmatic discovery, validation, and tooling.

## Migration Plan

### Phase 1: Dual-format support (this proposal)

1. Create `internal/agent/` package with `AgentManifest`, `AgentInfo`, `Loader`
2. Create `internal/skill/` package with `SkillManifest`, `SkillInfo`, `Loader`
3. Both loaders support legacy formats (read `.agent_prompt.md` as agent, read `generator.yaml` as skill)
4. Register new MCP tools alongside old ones (aliases)
5. Add `epf-cli agents` and `epf-cli skills` CLI commands (aliases for old commands)
6. Update `sync-embedded.sh` to support both directory structures

### Phase 2: Canonical migration (separate proposal)

1. Convert all wizard files in canonical-epf to `agents/{name}/agent.yaml + prompt.md`
2. Add `skill.yaml` alongside `generator.yaml` in canonical generators (canonical generators get both files; the `generator.yaml` remains for reference)
3. Create new wizard-type skills (feature-definition-creation, etc.)
4. Update `sync-embedded.sh` to prefer new structure but maintain fallback to old
5. Update AGENTS.md to reference agents/skills terminology as primary (old names as documented aliases)

**What is NOT in any phase:** Removal of `generator.yaml` support, removal of the `generators/` directory path, removal of generator MCP tool names, or removal of generator CLI commands. These are permanent.

### Rollback

Phase 1 is fully additive. Rollback = remove new packages and tool registrations.
Phase 2 rollback requires reverting canonical-epf changes.

### Decision 7: MCP Resources and Prompts exposure

**What:** Use MCP's native Resources and Prompts primitives alongside Tools, not just Tools.

MCP 2.0 defines three primitive types:
- **Tools** — Functions the AI can call (what we use today for all 50+ tools)
- **Resources** — Read-only content the AI can browse and pull (like `strategy://skills/feature-definition-creation`)
- **Prompts** — Pre-configured system prompt templates the AI can activate (like agent persona definitions)

The current epf-cli MCP server only uses Tools. The external research blueprint identifies a key optimization: **Skills should also be exposed as MCP Resources** and **Agents should also be exposed as MCP Prompts**.

```
MCP Server exposes:
  Tools:     epf_list_skills, epf_get_skill, ...     (programmatic access)
  Resources: strategy://skills/{name}                 (lazy-loaded content)
  Prompts:   strategy://agents/{name}                 (persona templates)
```

**Why this matters:**
- **Resources enable lazy-loading:** The host reads the skill name/description at startup (`list_resources`). Full skill content (the prompt, schema, etc.) is only pulled when the task matches (`read_resource`). This prevents stuffing 20 skill prompts into context at session start.
- **Prompts enable native persona switching:** Hosts that support MCP Prompts (like Claude Desktop) can natively switch to an EPF agent persona without the AI having to "pretend" — the system prompt is replaced.
- **Progressive disclosure:** Tool descriptions remain concise. The full skill/agent content lives behind a Resource/Prompt pull.

**Implementation:**
- `list_resources()` returns one entry per skill: `{ uri: "strategy://skills/{name}", name, description, mimeType: "text/markdown" }`
- `read_resource("strategy://skills/{name}")` returns the full prompt.md content
- `list_prompts()` returns one entry per agent: `{ name: "{agent-name}", description, arguments: [{name: "instance_path", ...}] }`
- `get_prompt("{agent-name}", { instance_path: "..." })` returns the agent's system prompt with context injected

**Alternatives considered:**
- Tools-only (status quo): Works but wastes context by requiring explicit tool calls to discover and fetch content. No lazy-loading.
- Resources-only (drop Tools): Loses programmatic access, filtering, scaffolding, and validation.

**Rationale:** Use all three MCP primitives for their intended purpose. Tools for actions, Resources for browsable content, Prompts for persona activation. This is the "MCP-native" way and ensures maximum compatibility with any MCP 2.0 host.

### Decision 8: Capability Classes on agents

**What:** Agents and skills declare a `capability_class` hint so the host can select an appropriate model.

```yaml
# In agent.yaml
capability:
  class: high-reasoning    # high-reasoning | balanced | fast-exec
  context_budget: large     # small (<8K) | medium (8-32K) | large (32K+)
```

```yaml
# In skill.yaml
capability:
  class: balanced
  context_budget: medium
```

**Capability class semantics:**

| Class | Intent | Example tasks |
|-------|--------|---------------|
| `high-reasoning` | Complex strategy, architecture, multi-step analysis | Pathfinder strategic planning, strategic coherence review |
| `balanced` | General creation, enrichment, moderate complexity | Feature definition creation, roadmap enrichment |
| `fast-exec` | Simple validation, documentation, formatting | Content readiness check, template generation |

**Context budget semantics:**

| Budget | Intent | Rationale |
|--------|--------|-----------|
| `small` | Skill prompt + output fit in <8K tokens | Simple validation or formatting skills |
| `medium` | Skill needs to read a few EPF files | Most creation and generation skills |
| `large` | Skill needs to synthesize across many files | Strategic review, full READY phase |

**Why this matters:** The host AI runtime can use these hints to:
- Select the right model tier (expensive vs cheap)
- Decide whether to spawn a sub-agent or handle inline
- Budget context window allocation

**Alternatives considered:**
- Specify model names directly (e.g., "claude-opus-4"): Brittle, runtime-specific, ages poorly.
- No hint at all: Host has to guess, leading to either over-spending (always use best model) or under-performing (wrong model for complex task).

**Rationale:** Capability classes are abstract enough to be portable across runtimes while concrete enough to guide model selection. The host maps classes to its available models.

### Decision 9: Progressive disclosure / lazy-loading

**What:** Skill and agent content is loaded lazily, not eagerly.

**Current behavior:** When the MCP server starts, `wizardLoader.Load()` reads ALL wizard files into memory. `generatorLoader.Load()` reads ALL generator manifests. Full content is available immediately.

**Proposed behavior:**
1. At startup, load only manifests (agent.yaml / skill.yaml) — lightweight metadata
2. Full prompt content (prompt.md) is loaded on-demand when `epf_get_agent` / `epf_get_skill` or `read_resource()` is called
3. MCP `list_resources()` / `list_prompts()` return only name + description (from manifest), not full content

**Why this matters:**
- Reduces startup time and memory for the MCP server
- Prevents context window pollution — host AI only pulls content it needs
- Matches the "progressive disclosure" pattern from the external research blueprint

**Implementation detail:** The `AgentInfo` and `SkillInfo` structs keep a `contentLoaded bool` flag. The `Content` / `Prompt` fields are empty until explicitly requested. The `Loader` loads manifests on `Load()` and content on `GetContent(name)`.

### Decision 10: Enforcement scope on skills

**What:** Skills can optionally declare a `scope` that hints which tools should be preferred during skill execution.

```yaml
# In skill.yaml
scope:
  preferred_tools:
    - epf_get_schema
    - epf_get_template
    - epf_validate_file
    - epf_get_personas
  avoid_tools:
    - epf_health_check     # Don't run full health check mid-skill
  filesystem_access: read_only   # read_only | read_write | none
```

**Why this matters:** The external research blueprint proposes an "Enforcement Layer" where the CLI's tools become the *only* valid path during certain operations, preventing "Agent Drift" (where the AI wanders off-task using generic tools). While we can't enforce this at the MCP level (the host controls tool access), we can declare intent.

**Non-goal:** We do NOT implement actual tool restriction in the MCP server. That's the host's responsibility. We provide the metadata; the host (OpenCode, Cursor, etc.) decides whether to honor it.

**Alternatives considered:**
- Actual tool gating in the MCP server: Over-engineered, breaks MCP protocol expectations, not our responsibility.
- No scope declaration at all: Misses an opportunity to guide the host.

**Rationale:** Declare scope as advisory metadata. Smart hosts can use it; simpler hosts ignore it.

### Decision 11: Three-layer architecture — CLI, MCP, and Orchestration Plugins

**What:** The agents/skills architecture must be designed with three consumption layers in mind, not just the MCP server.

```
Layer 3: Orchestration Plugins (platform-specific)
         ┌─────────────────┬──────────────────┬─────────────────┐
         │ opencode-epf     │ cursor-epf       │ claude-desktop   │
         │ (TypeScript)     │ (future)         │ (future)         │
         └────────┬────────┴────────┬─────────┴────────┬────────┘
                  │ event hooks,    │                   │
                  │ tool intercept, │                   │
                  │ system prompt   │                   │
                  │ injection       │                   │
Layer 2: MCP Server (universal, platform-agnostic)
         ┌──────────────────────────────────────────────────────┐
         │ epf-cli serve                                        │
         │  - Tools: epf_list_agents, epf_get_skill, ...        │
         │  - Resources: strategy://skills/{name}               │
         │  - Prompts: strategy://agents/{name}                 │
         └────────────────────────┬─────────────────────────────┘
                                  │
Layer 1: CLI Binary (core logic, all validation/analysis)
         ┌──────────────────────────────────────────────────────┐
         │ epf-cli (Go binary)                                  │
         │  - Embedded agents & skills (go:embed)               │
         │  - Three-tier discovery (instance > framework > global)│
         │  - Schema validation, health checks, coverage        │
         └──────────────────────────────────────────────────────┘
```

**Why three layers matter for this proposal:**

The current opencode-epf plugin already demonstrates that an MCP server alone is insufficient for a great agent experience. The plugin fills four gaps:

1. **Proactive behavior** (event hooks): Session idle health checks, file edit validation, diagnostic aggregation. MCP is pull-only; these are push-based.
2. **Tool interception** (guardrails): Blocking git commits when EPF is broken. MCP cannot intercept other tools.
3. **System prompt injection** (persona switching): The `experimental.chat.system.transform` hook can inject agent persona instructions into the system prompt. This is what enables true "agent activation" — not just serving a prompt blob, but actually modifying the AI's behavior.
4. **Formatted dashboard presentation**: Higher-level aggregation of multiple CLI calls into rich markdown dashboards.

**With agents and skills, the plugin's role expands:**

| Plugin Responsibility | Current | With Agents/Skills |
|---|---|---|
| Health check on idle | Shows toast | Shows toast + recommends relevant agent |
| File edit validation | Validates file | Validates file + activates relevant skill if creation pattern detected |
| Commit guard | Blocks on critical errors | Blocks on critical errors + checks skill output validation |
| Custom tools | 3 dashboard tools | Dashboard tools + agent activation tool + skill execution orchestration |
| System prompt | Not used | Injects active agent persona via `experimental.chat.system.transform` |
| Tool scoping | Not used | Uses skill's `scope.preferred_tools` to modify `tool.definition` descriptions |

**Critical design principle: The MCP server exposes agents and skills. The orchestration plugin activates them.**

- `epf_get_agent("pathfinder")` via MCP → returns the agent's manifest and prompt as JSON
- The orchestration plugin's `experimental.chat.system.transform` hook → injects that prompt into the system prompt
- `epf_get_skill("feature-definition-creation")` via MCP → returns the skill prompt and metadata
- The orchestration plugin's `tool.definition` hook → modifies tool descriptions to match skill scope

This separation means:
- **Dumb MCP hosts** (no plugin API) still get agents/skills as readable content via MCP tools/resources/prompts
- **Smart hosts** (OpenCode, future Cursor plugin) get proactive activation, system prompt injection, and tool scoping
- **The Go CLI** stays logic-only. It never orchestrates agent behavior.

**Alternatives considered:**
- Build orchestration into the MCP server: Violates "Agent as Writer, Tool as Linter." MCP servers respond to requests; they don't drive behavior.
- Build orchestration into the Go CLI: The CLI would need to understand host-specific APIs. Defeats portability.
- Skip orchestration plugins entirely: Works for basic usage but misses the "high determinism" goal. Agent drift is real.

**Rationale:** The three-layer architecture lets the core (CLI + MCP) be maximally portable while platform-specific plugins deliver the orchestration that makes the difference between "tools available" and "agents actually working."

### Decision 12: Agent activation protocol for orchestration plugins

**What:** Define a standard protocol that orchestration plugins follow to activate an agent, so all platform plugins behave consistently.

**Agent activation sequence:**

```
1. DETECT  — Plugin detects task context (user message, file edit, idle, explicit command)
2. MATCH   — Plugin calls epf_get_agent_for_task(task) via MCP to find best agent
3. LOAD    — Plugin calls epf_get_agent(name) via MCP to get full agent manifest + prompt
4. INJECT  — Plugin injects agent prompt into system prompt (platform-specific mechanism)
5. SCOPE   — Plugin loads agent's required skills, applies tool scoping from skill manifests
6. EXECUTE — Agent operates with injected persona and scoped tools
7. VALIDATE — Plugin calls skill validation on outputs (schema + bash validator)
```

**Platform-specific mechanisms:**

| Step | OpenCode | Future: Cursor | Future: Claude Desktop |
|---|---|---|---|
| INJECT | `experimental.chat.system.transform` hook | Extension API `workspace.onDidChangeConfiguration` | MCP `get_prompt()` native support |
| SCOPE | `tool.definition` hook modifies descriptions | N/A (no tool scoping API) | N/A |
| VALIDATE | `tool.execute.after` hook on write operations | Post-save extension handler | N/A (manual) |

**What the CLI provides to ALL platforms (via MCP):**
- Agent discovery and matching (`epf_list_agents`, `epf_get_agent_for_task`)
- Agent content delivery (`epf_get_agent`, MCP Prompts)
- Skill content delivery (`epf_get_skill`, MCP Resources)
- Skill output validation (`epf_validate_skill_output`)
- Capability class metadata (for model tier selection)

**What the CLI does NOT do:**
- Inject system prompts (host-specific)
- Intercept tool calls (host-specific)
- React to events (host-specific)
- Drive multi-step workflows (agent's job, mediated by the host)

### Decision 13: Skill output validation in the orchestration layer

**What:** Orchestration plugins should validate skill outputs automatically, not rely on the AI remembering to call validation.

**Current problem:** The "Validation-Always Workflow" in AGENTS.md says "After ANY change to an EPF YAML file, you MUST validate." But this depends on the AI following instructions. The AI sometimes forgets.

**Proposed solution:** The orchestration plugin uses `tool.execute.after` to detect when the AI writes a file that matches a skill's output pattern, and automatically triggers validation.

```typescript
// In opencode-epf plugin (conceptual)
"tool.execute.after": async (input, output) => {
  if (input.tool === "write" && isEPFArtifact(output.args.filePath)) {
    const result = await execCLI(["validate", output.args.filePath, "--ai-friendly"]);
    if (!result.ok) {
      // Append validation errors to the tool output so the AI sees them
      output.output += "\n\n--- EPF Validation ---\n" + result.data;
    }
  }
}
```

This makes validation genuinely automatic rather than instruction-dependent.

### Decision 14: Standalone MCP experience — graceful degradation without plugin

**What:** The MCP server must deliver a good agent experience on its own, without any orchestration plugin. The plugin enhances the experience; it does not gate it.

**Gap analysis — what the plugin adds vs what the MCP server must compensate for:**

| Capability | With Plugin | MCP-Only Gap | MCP Compensation |
|---|---|---|---|
| Agent persona activation | System prompt injection | AI reads prompt as text, must self-apply | Agent prompt response includes explicit self-application instructions |
| Auto-validation after writes | `tool.execute.after` hook | AI must remember to call `epf_validate_file` | Tool suggestions system already handles this; reinforce in agent prompts |
| Commit guard | `tool.execute.before` intercept | No safety net | `epf_agent_instructions` includes "validate before commit" protocol |
| Proactive health check | `session.idle` event | AI must call `epf_health_check` explicitly | `epf_agent_instructions` includes "run health check first" as mandatory protocol |
| Tool scoping | `tool.definition` modifies descriptions | AI sees scope hints in skill response | Skill responses include "PREFERRED TOOLS" and "AVOID TOOLS" sections in text |
| Plugin advisory | N/A | User doesn't know plugin exists | `epf_agent_instructions` reports plugin detection status and recommends installation |

**Design principles for standalone mode:**

1. **Every agent prompt must be self-contained.** When `epf_get_agent("pathfinder")` returns a prompt in standalone mode, it must include: the persona instructions, the tool scope directives, the validation reminders, and the "when you're done" protocol. The plugin version can strip some of this because it enforces it mechanically, but the standalone version must include it all as text.

2. **Tool suggestions compensate for missing event hooks.** The existing `tool_suggestions.go` system already guides agents to "call X next." With agents/skills, this system can include agent/skill-aware suggestions — e.g., after `epf_get_agent`, suggest `epf_get_skill` for the agent's required skills.

3. **POST-CONDITIONs remain the primary guardrail.** The tool descriptions already use POST-CONDITION directives that work without any plugin. These should be updated to reference agents/skills terminology but the mechanism is unchanged.

4. **MCP Prompts are the best standalone persona mechanism.** For hosts that support MCP Prompts natively (Claude Desktop), `get_prompt("pathfinder")` delivers the persona as a system prompt without any plugin. This is the MCP-native path to persona activation.

### Decision 15: Plugin detection and advisory in `epf_agent_instructions`

**What:** The `epf_agent_instructions` tool detects whether an orchestration plugin is present and advises the AI (and transitively the user) about what they're missing.

**Detection mechanism:**

The MCP server cannot directly query whether a host plugin is installed. However, it can detect plugin presence through several signals:

1. **MCP ClientInfo** — When the MCP connection is established, the client sends `ClientInfo` with its name and version. The server can check if the client name matches a known host that has a plugin available (e.g., `"opencode"` → opencode-epf plugin exists).

2. **Environment variable** — The orchestration plugin can set an environment variable (e.g., `EPF_PLUGIN_ACTIVE=opencode-epf@1.2.0`) that the MCP server reads. This is the most reliable signal.

3. **Tool availability probe** — The server can check if plugin-registered tools (e.g., `epf_dashboard`) are present. But MCP servers can't query other tools on the same host.

**Recommended approach: Both options 1 and 2, combined.**

The opencode-epf plugin already has `shell.env` hook capability. It sets `EPF_PLUGIN_ACTIVE=opencode-epf@{version}` in the shell environment. The MCP server reads this at startup. As a fallback, if no env var is set, the server uses MCP ClientInfo to detect the host and check if a known plugin exists for that host but isn't active.

**Advisory output in `epf_agent_instructions`:**

When plugin is NOT detected:

```json
{
  "orchestration": {
    "plugin_detected": false,
    "host_name": "opencode",
    "available_plugin": "opencode-epf",
    "install_hint": "Add \"opencode-epf\" to the \"plugin\" array in opencode.jsonc",
    "what_you_gain": [
      "Automatic validation after every file write",
      "Commit guard that blocks git commit when EPF instance has critical errors",
      "Proactive health check on session idle",
      "Agent persona injection into system prompt",
      "Tool scoping based on active skill"
    ],
    "standalone_mode": true,
    "standalone_protocols": [
      "You MUST call epf_validate_file after writing or modifying any EPF YAML file",
      "You MUST call epf_health_check at the start of each session before other work",
      "You MUST validate the EPF instance before any git commit",
      "When a skill response includes PREFERRED TOOLS, prioritize those tools"
    ]
  }
}
```

When plugin IS detected:

```json
{
  "orchestration": {
    "plugin_detected": true,
    "plugin_name": "opencode-epf",
    "plugin_version": "1.2.0",
    "standalone_mode": false,
    "active_guardrails": [
      "Automatic file validation on save",
      "Commit guard active",
      "Session idle health check active"
    ]
  }
}
```

**Why this matters:**
- Users who set up only the MCP server (the common case for non-OpenCode hosts) get clear guidance on what they can add.
- The AI agent can adapt its behavior based on `standalone_mode` — being more diligent about calling validation in standalone mode.
- It's not nagging — it's a one-time informational field in the initial instructions response.

**Host detection heuristics (when no env var is set):**

| MCP ClientInfo name | Known host | Plugin available | Install hint |
|---|---|---|---|
| `opencode` | OpenCode | `opencode-epf` | Add to `plugin` array in `opencode.jsonc` |
| `cursor` | Cursor | (future) | Not yet available |
| `claude-desktop` | Claude Desktop | (future) | Not yet available |
| (other) | Unknown | N/A | "Orchestration plugins enhance the EPF experience. Check docs for your platform." |

### Decision 16: Agent prompt content adapts to standalone mode

**What:** When `epf_get_agent` is called and the server is in standalone mode (no plugin detected), the agent prompt response includes additional self-enforcement instructions that the plugin would otherwise handle mechanically.

**Standalone prompt suffix (appended to all agent prompts when `standalone_mode: true`):**

```markdown
---
## Standalone Mode Protocols

You are running without an orchestration plugin. The following protocols
are your responsibility to enforce manually:

### Validation Protocol
After writing or modifying ANY EPF YAML file, you MUST immediately call
`epf_validate_file` on that file. Do not batch validations. Do not skip
this step. This is normally handled automatically by the plugin.

### Pre-Commit Protocol
Before executing any `git commit` command, you MUST call `epf_health_check`
on the EPF instance. If critical errors are found, fix them before committing.
This is normally enforced by the plugin's commit guard.

### Tool Scope
This agent works best with these tools: [list from agent manifest]
Avoid calling these tools during this workflow: [list from skill scopes]
This is normally enforced by the plugin's tool scoping.
---
```

When the plugin IS detected, this suffix is omitted — the plugin enforces these mechanically through hooks.

**Alternatives considered:**
- Always include the standalone protocols (even with plugin): Redundant. Wastes context window. The plugin handles it mechanically.
- Never include standalone protocols: The MCP-only experience degrades. Agents forget to validate.
- Put standalone protocols in tool descriptions only: Tool descriptions are read once during tool selection. The repeated reminder in every agent prompt is more effective for standalone mode.

**Rationale:** Context-aware responses. The MCP server knows whether it's operating standalone or plugin-assisted. It adjusts its output to compensate.

## Risks / Trade-offs

- **Risk: Scope creep** — "Agents and skills" is a broad concept that could grow unbounded.
  - Mitigation: The non-goals are clear. This is a restructuring of existing content delivery, not a new agent framework.

- **Risk: User confusion during transition** — Two naming systems in parallel.
  - Mitigation: Phase 1 maintains full backward compatibility. Phase 2 only starts after Phase 1 is validated.

- **Risk: canonical-epf coordination** — Restructuring requires changes in a separate repository.
  - Mitigation: Phase 1 doesn't require canonical-epf changes (new loader reads old formats). Phase 2 coordinates the canonical migration.

- **Trade-off: More files per agent/skill** — Agents go from 1 file to 2-3 files. Skills (creation type) go from 1 file to 2-3 files.
  - Benefit: Structured metadata enables programmatic discovery, validation, and tooling.

- **Risk: MCP Resources/Prompts support varies across hosts** — Not all MCP hosts support Resources and Prompts yet.
  - Mitigation: Tools remain the primary interface. Resources and Prompts are additive. Hosts that don't support them simply don't see them.

- **Risk: Orchestration plugin complexity** — The opencode-epf plugin's responsibilities grow significantly with agent activation, system prompt injection, and tool scoping.
  - Mitigation: The plugin remains a thin orchestration layer. All logic stays in the Go CLI. The plugin orchestrates; it doesn't compute.

- **Risk: Platform fragmentation** — Building separate plugins for OpenCode, Cursor, Claude Desktop, etc.
  - Mitigation: The activation protocol (Decision 12) standardizes the sequence. Platform-specific code is only the mechanism (how to inject a system prompt), not the logic (which agent to activate).

## Open Questions

1. **Should agents declare their MCP tool requirements?** If an agent needs `epf_get_personas` and `epf_validate_file`, should `agent.yaml` list these so the runtime can verify they're available? (Leaning yes, similar to how skills declare `requires.tools`.)

2. **How to handle the ready_sub_wizard type?** Currently, numbered sub-wizards (01_trend_scout, etc.) are associated with the pathfinder agent. Should they become skills that the pathfinder agent uses, or remain as a special agent type?

3. **Should skills support multi-step workflows?** Current generators are single-step (produce one output). Current wizards can be multi-step (create several artifacts in sequence). Should skills support a `steps` array in the manifest, or should multi-step workflows be handled by the orchestrating agent?

4. **Version compatibility:** When a user creates a custom skill for EPF 2.18, should `skill.yaml` declare the minimum EPF version it's compatible with?

5. **Skill composition:** Should skills be able to declare dependencies on other skills? (e.g., "roadmap-planning" skill depends on "strategy-formulation" skill being completed first.)

6. **Session initialization protocol:** Should `epf_agent_instructions` evolve into a `get_project_context()` tool that returns not just instructions but also the recommended agent, primary skills, and project mode? The external research proposes a "search-first" session initialization where the CLI tells the host what mode to activate.

## Migration Guide for canonical-epf Maintainers

This section documents the Phase 2 migration from the old directory structure (`wizards/`, `outputs/`) to the new structure (`agents/`, `skills/`). Phase 1 (this proposal) builds the new loaders alongside the old ones — no canonical-epf changes are needed yet.

### When to Migrate

Migrate when:
- All Phase 1 code is merged and released
- The new agent/skill MCP tools are stable
- You're ready to take advantage of new features (capability classes, tool scoping, MCP Resources/Prompts)

There is **no urgency** to migrate. The old formats (`generator.yaml`, `.wizard.md`, `.agent_prompt.md`) are permanently supported.

### Directory Structure Changes

```
# Before (current canonical-epf)
wizards/
├── start_epf.agent_prompt.md
├── pathfinder.agent_prompt.md
├── pathfinder.wizard.md
├── feature_definition.wizard.md
├── ...
outputs/
├── context-sheet/
│   ├── generator.yaml
│   ├── wizard.instructions.md
│   ├── schema.json
│   └── validator.sh
├── investor-memo/
│   └── ...

# After (new canonical-epf)
agents/
├── start-epf/
│   ├── agent.yaml         # Structured manifest (new)
│   └── prompt.md           # Agent persona prompt (was .agent_prompt.md)
├── pathfinder/
│   ├── agent.yaml
│   └── prompt.md
├── ...
skills/
├── feature-definition/
│   ├── skill.yaml          # Structured manifest (new)
│   └── prompt.md           # Skill instructions (was .wizard.md)
├── context-sheet/
│   ├── skill.yaml          # Was generator.yaml (alias still works)
│   ├── prompt.md           # Was wizard.instructions.md (alias still works)
│   ├── schema.json
│   └── validator.sh
├── ...
```

### Migration Steps

1. **Create `agents/` directory** — For each `.agent_prompt.md` file, create a directory with `agent.yaml` + `prompt.md`
2. **Create `skills/` directory** — For each `.wizard.md` file, create a directory with `skill.yaml` + `prompt.md`. For each `outputs/*/` directory, move to `skills/*/` (the old file names still work)
3. **Write `agent.yaml` manifests** — Add structured metadata (type, capability, required_skills, trigger_phrases, keywords)
4. **Write `skill.yaml` manifests** — Add structured metadata (type, capability, scope, required_artifacts)
5. **Update `sync-embedded.sh`** — Add syncing from `agents/` and `skills/` directories
6. **Keep old directories temporarily** — The loaders scan both old and new locations. Remove old directories only after verifying everything works.

### Key Rules

- `generator.yaml` is a **permanent alias** for `skill.yaml` — generators in `generators/` directories will always work
- `wizard.instructions.md` is a **permanent alias** for `prompt.md` — old prompt file names will always work
- `{instance}/generators/` is **permanently scanned** alongside `{instance}/skills/`
- The `epf_scaffold_generator` MCP tool always creates files with OLD names (backward compat)
- Agent/skill loaders read BOTH old and new formats — no breaking change

## Phase 2 Rollout Plan

Phase 2 migrates canonical-epf content and updates the embedded pipeline. It is a **separate proposal** to be created after Phase 1 is merged and released.

### Preconditions

1. Phase 1 (`refactor/agents-and-skills`) merged to `main` in emergent-strategy
2. New epf-cli released with agent/skill infrastructure
3. Validated that the new MCP tools work correctly with the old canonical-epf format

### Branch Strategy

```
emergent-strategy (this repo)
├── main                          ← Phase 1 merged here
└── phase2/canonical-migration    ← Section 5 tasks + submodule pointer

emergent-epf (canonical-epf, git submodule)
├── main                          ← Old structure (wizards/, outputs/)
└── refactor/agents-and-skills    ← New structure (agents/, skills/)
```

**Why separate branches in canonical-epf:**
- Older epf-cli binaries (pre-Phase 1) only read `wizards/` and `outputs/`. If canonical-epf `main` switches to `agents/` + `skills/`, those older binaries break.
- A feature branch in canonical-epf lets us test the new structure without affecting anyone using the old CLI.
- Once the new epf-cli is the only supported version, merge the canonical-epf branch.

### Execution Sequence

1. **Create canonical-epf feature branch**
   ```bash
   cd docs/EPF/_instances/emergent
   git checkout -b refactor/agents-and-skills
   ```

2. **Restructure content** — For each wizard/generator, create the new directory structure:
   - `start_epf.agent_prompt.md` → `agents/start-epf/prompt.md` + `agents/start-epf/agent.yaml`
   - `pathfinder.agent_prompt.md` + `pathfinder.wizard.md` → `agents/pathfinder/prompt.md` + `agents/pathfinder/agent.yaml` + `skills/pathfinder-analysis/prompt.md` + `skills/pathfinder-analysis/skill.yaml`
   - `outputs/context-sheet/` → `skills/context-sheet/` (keep `generator.yaml` + `wizard.instructions.md` as-is, they're permanent aliases)

3. **Write structured manifests** — Create `agent.yaml` for each agent and `skill.yaml` for each skill. These add capability classes, tool scoping, trigger phrases, and other metadata that was previously regex-parsed from markdown.

4. **Update embedded pipeline** (Section 5 tasks in emergent-strategy):
   - `internal/embedded/embedded.go` — Add `agents` embed.FS
   - `scripts/sync-embedded.sh` — Sync from `agents/` and `skills/` with fallback to `wizards/` and `outputs/`
   - `MANIFEST.txt` — Include new directory structure

5. **Point submodule at feature branch for testing**
   ```bash
   cd docs/EPF/_instances/emergent
   git checkout refactor/agents-and-skills
   cd ../../../..
   # Test: go build && go test ./...
   ```

6. **Validate end-to-end**
   - `epf-cli agents list` shows agents from new directories
   - `epf-cli skills list` shows skills from new directories
   - MCP tools return structured metadata from `agent.yaml`/`skill.yaml`
   - Embedded content loads correctly
   - Old format files in `wizards/`/`outputs/` still work if present

7. **Merge both branches**
   - Merge canonical-epf `refactor/agents-and-skills` → `main`
   - Point emergent-strategy submodule at canonical-epf `main`
   - Merge emergent-strategy `phase2/canonical-migration` → `main`
   - Release new epf-cli

### What Phase 2 Unlocks

Features that only work with structured `agent.yaml`/`skill.yaml` manifests:

| Feature | Old Format | New Format |
|---------|-----------|------------|
| Capability classes | Not available | `capability.class: high-reasoning` for model tier routing |
| Tool scoping metadata | Not available | `scope.preferred_tools` / `scope.avoid_tools` in structured YAML |
| Trigger phrases | Regex-parsed from markdown | Structured list in `agent.yaml` |
| Keyword matching | Regex-parsed from markdown | Structured list in `agent.yaml` |
| Required skills | Not available | `required_skills` list in `agent.yaml` |
| Skill prerequisites | Only for generators | `requires.artifacts` in `skill.yaml` for all skill types |
| Skill output validation | Only for generators | `output.schema` / `output.validator` for all skill types |

Until Phase 2, all of these features work in a degraded mode: the loaders extract what they can from the old markdown format, and structured manifests from user-created agents/skills work fully.

## Platform Plugin Development Guide

This section describes how to build an EPF orchestration plugin for any AI host (Cursor, Claude Desktop, VS Code extensions, etc.). The activation protocol is standardized; only the platform-specific mechanisms differ.

### What the MCP Server Provides (All Platforms)

Your plugin does NOT need to reimplement any EPF logic. The MCP server provides everything:

| MCP Tool | Purpose |
|----------|---------|
| `epf_get_agent_for_task(task)` | Find the best agent for a task |
| `epf_get_agent(name)` | Get agent manifest + prompt + skill scopes |
| `epf_get_skill(name)` | Get skill prompt + validation schema |
| `epf_validate_skill_output(name, content)` | Validate output against skill schema |
| `epf_validate_file(path)` | Validate any EPF YAML file |
| `epf_health_check(instance_path)` | Run comprehensive health check |
| `epf_agent_instructions()` | Get full agent instructions with plugin detection status |

MCP Prompts (`get_prompt("pathfinder")`) and Resources (`read_resource("strategy://skills/context-sheet")`) provide native MCP-level access for hosts that support them.

### Activation Protocol (7 Steps)

Every platform plugin follows this sequence:

```
1. DETECT   — Detect task context (user message, file edit, idle, explicit command)
2. MATCH    — Call epf_get_agent_for_task(task) to find best agent
3. LOAD     — Call epf_get_agent(name) to get manifest + prompt
4. INJECT   — Inject agent prompt into system prompt (platform-specific)
5. SCOPE    — Apply tool scoping from agent's skill_scopes (platform-specific)
6. EXECUTE  — Agent operates with injected persona and scoped tools
7. VALIDATE — Validate outputs using epf_validate_file or epf_validate_skill_output
```

### Platform-Specific Mechanisms

| Step | OpenCode | Cursor (future) | Claude Desktop (future) |
|------|----------|-----------------|-------------------------|
| **INJECT** | `experimental.chat.system.transform` | Extension API `workspace.onDidChangeConfiguration` | MCP `get_prompt()` native support |
| **SCOPE** | `tool.definition` hook modifies descriptions | N/A (no tool scoping API) | N/A |
| **VALIDATE** | `tool.execute.after` hook on write ops | Post-save extension handler | N/A (manual) |
| **ENV** | `shell.env` sets `EPF_PLUGIN_ACTIVE` | Extension sets env var | N/A |

### Minimum Viable Plugin

A minimal plugin needs only two things:

1. **Set `EPF_PLUGIN_ACTIVE=your-plugin@version`** — So the MCP server knows a plugin is present and adapts responses (omits standalone protocols from agent prompts)
2. **Auto-validate on file write** — Intercept write operations to EPF YAML files and call `epf_validate_file`

Everything else (agent activation, tool scoping, health dashboard) is additive and enhances the experience.

### Testing Your Plugin

1. Check `epf_agent_instructions` response — the `orchestration` section should show `plugin_detected: true`
2. Call `epf_get_agent("pathfinder")` — the response should NOT contain standalone enforcement protocols
3. Write an EPF YAML file — your validation hook should fire
4. Run `epf_dashboard` — should show your plugin version in the orchestration status line

## Standalone vs Plugin-Assisted Experience

This table documents the differences between running with just the MCP server (standalone) vs with the opencode-epf plugin.

### Capability Comparison

| Capability | Standalone (MCP only) | With Plugin |
|---|---|---|
| **Agent persona** | AI reads prompt as text, must self-apply | System prompt injection — AI genuinely adopts persona |
| **Validation** | AI must remember to call `epf_validate_file` | Automatic on every file write |
| **Commit guard** | Agent prompt says "validate before commit" | Plugin intercepts `git commit` and blocks if errors |
| **Health check** | AI must call `epf_health_check` explicitly | Toast on session idle |
| **Tool scoping** | Text-based hints in skill response (PREFERRED/AVOID) | `tool.definition` modifies tool descriptions at runtime |
| **Plugin advisory** | `orchestration` section suggests installation | N/A (already installed) |
| **Diagnostic aggregation** | Not available | LSP diagnostic tracking with threshold toasts |

### How Standalone Mode Compensates

The MCP server compensates for the missing plugin through:

1. **POST-CONDITION directives** — Tool descriptions include "After calling this tool, you MUST call X" instructions
2. **Standalone prompt suffix** — `epf_get_agent` appends validation, pre-commit, and tool scope protocols to agent prompts
3. **Tool suggestions** — `tool_suggestions.go` guides agents to "call X next" after each tool call
4. **Text-based tool scope** — `epf_get_skill` appends "PREFERRED TOOLS" and "AVOID TOOLS" sections
5. **MCP Prompts** — For hosts that support MCP Prompts natively (Claude Desktop), `get_prompt("pathfinder")` delivers the persona as a system prompt without any plugin

### Quality Delta

| Metric | Standalone | With Plugin |
|--------|-----------|-------------|
| Validation consistency | ~85% (AI sometimes forgets) | ~100% (mechanical) |
| Persona adherence | Variable (depends on model) | High (system prompt injection) |
| Pre-commit safety | Low (instruction-dependent) | High (fail-safe) |
| Tool focus | Moderate (text hints) | High (description modification) |
| User awareness | Low (must read orchestration section) | High (proactive toasts) |

The standalone experience is **good enough** for productive work. The plugin makes it **reliable and consistent**.
