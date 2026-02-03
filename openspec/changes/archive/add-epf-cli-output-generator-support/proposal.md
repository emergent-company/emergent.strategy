# Proposal: Output Generator Support for epf-cli

**Author:** AI Assistant  
**Date:** 2025-01-XX  
**Status:** Approved - Ready for Implementation  
**Depends On:** Wizard Support (completed)

---

## Decision Summary

Based on discussion, the following decisions have been made:

1. **Architecture:** Hybrid with emphasis on **easy local/proprietary generator creation**
2. **Agent Model:** "Agent as Writer, Tool as Linter" - AI writes outputs, epf-cli validates
3. **Priority:** Broad generator support + simple generator creation process
4. **User Story:** Users should be able to quickly build and use custom generators with AI assistance

---

## Executive Summary

EPF has a concept of **Output Generators** - self-contained packages that transform core EPF artifacts into external-facing documents (investor memos, context sheets, grant applications, etc.). Currently these exist as markdown wizards with bash validators in `docs/EPF/outputs/`. This proposal discusses how epf-cli should support output generators, with a key architectural decision: **monolithic vs. plugin architecture**.

---

## Background

### What Are Output Generators?

Output generators synthesize **external artifacts** from core EPF data:

```
┌─────────────────────────────────────────┐
│     Core EPF Artifacts (Source)         │
├─────────────────────────────────────────┤
│  • 00_north_star.yaml                   │
│  • 04_strategy_formula.yaml             │
│  • 05_roadmap_recipe.yaml               │
│  • value_models/*.yaml                  │
└─────────────────┬───────────────────────┘
                  │
                  │ READ (never modify)
                  ▼
┌─────────────────────────────────────────┐
│       Output Generators (Process)       │
├─────────────────────────────────────────┤
│  • Extract relevant data                │
│  • Transform to output format           │
│  • Validate against schema              │
│  • Add metadata & traceability          │
└─────────────────┬───────────────────────┘
                  │
                  │ GENERATE
                  ▼
┌─────────────────────────────────────────┐
│   External Outputs (Artifacts)          │
├─────────────────────────────────────────┤
│  • Context sheets (AI context)          │
│  • Investor materials (fundraising)     │
│  • Grant applications (SkatteFUNN)      │
│  • Development briefs (handover)        │
└─────────────────────────────────────────┘
```

### Current Generator Structure

Each generator is self-contained in `docs/EPF/outputs/{generator-name}/`:

```
{generator-name}/
├── schema.json               # INPUT parameter validation (JSON Schema)
├── wizard.instructions.md    # Generation logic (for AI agents)
├── validator.sh              # OUTPUT validation (bash script)
├── README.md                 # Quick reference
└── template.md               # Optional: fixed output structure
```

### Current Generators (5 available)

| Generator                | Purpose                                         | Status     |
| ------------------------ | ----------------------------------------------- | ---------- |
| `context-sheet`          | AI context for external tools (ChatGPT, Claude) | Production |
| `investor-memo`          | Complete investor materials package             | Production |
| `skattefunn-application` | Norwegian R&D tax deduction form                | Production |
| `development-brief`      | Engineering handover from product               | Production |
| `value-model-preview`    | HTML preview of value model                     | Production |

---

## The Key Architectural Question

### Option A: Monolithic (Generators in epf-cli)

Embed all output generators directly in epf-cli, similar to how schemas and wizards are currently handled.

**Pros:**

- ✅ Single binary with all capabilities
- ✅ Consistent validation interface
- ✅ Simple distribution (just epf-cli)
- ✅ Version alignment guaranteed

**Cons:**

- ❌ epf-cli grows with every new generator
- ❌ Users get generators they don't need
- ❌ Specialized generators (e.g., Norwegian tax forms) have global reach
- ❌ Slower release cycle for generator updates
- ❌ Harder for community/partners to contribute generators

### Option B: Plugin Architecture (Generators as Installable Packages)

epf-cli provides a plugin system where generators are installed separately.

**Pros:**

- ✅ epf-cli stays lean and focused
- ✅ Generators can be updated independently
- ✅ Users install only what they need
- ✅ Community/partners can create custom generators
- ✅ Organization-specific generators stay private
- ✅ Better separation of concerns

**Cons:**

- ❌ More complex architecture
- ❌ Plugin versioning challenges
- ❌ Discovery/installation UX to design
- ❌ Potential compatibility issues

### Option C: Hybrid (Core + Plugins)

Bundle essential generators in epf-cli, allow additional plugins.

**Pros:**

- ✅ Common generators work out-of-the-box
- ✅ Flexibility for specialized needs
- ✅ Gradual migration path

**Cons:**

- ❌ Complexity of both approaches
- ❌ Where to draw the line on "core"?

---

## Recommendation: Hybrid with Git-Based Plugins

Given the MASTER_PLAN principle "**Git is God**", I recommend a **hybrid approach** where:

1. **epf-cli is aware of generators** - can discover, list, validate
2. **Generators live in git repositories** - following "Git is God"
3. **Instance-local generators are first-class** - users create proprietary generators easily
4. **No package registry** - just directories in git repos
5. **AI-assisted creation** - easy to build new generators with AI help

### Key Insight: Generators Are Just Directories

A generator is simply a directory with specific files:

```
my-generator/
├── generator.yaml           # Manifest (name, description, requirements)
├── schema.json              # Input validation
├── wizard.instructions.md   # Generation logic for AI
├── validator.sh             # Optional: output validation
└── template.md              # Optional: fixed structure
```

No compilation, no installation, no registry. Just files in git.

### Generator Discovery Locations

epf-cli discovers generators from (in priority order):

```
1. Instance-local:  _instances/{product}/generators/   # User's custom generators
2. EPF Framework:   docs/EPF/outputs/                  # Canonical generators
3. Global:          ~/.epf-cli/generators/             # Shared across projects
```

**Instance-local is intentionally first** - users can override canonical generators or create product-specific ones.

### Why This Fits ProductFactoryOS

From MASTER_PLAN:

- "**Git is God:** Do not hide state in a database"
- "**Clean Repos:** Templates live in epf-cli binary, not user repos"
- "**Schema First:** Copilot cannot help without rules"
- "**Agent as Writer, Tool as Linter:** epf-cli never writes content"

**Applied to generators:**

- Generators are git repositories (Git is God)
- Generator definitions stay in canonical EPF (Clean Repos)
- Output schemas enable validation (Schema First)
- AI generates output, epf-cli validates (Agent as Writer, Tool as Linter)

---

## Proposed Architecture

### 1. Generator Discovery

epf-cli discovers generators from multiple sources:

```
Priority Order:
1. Instance-local: {instance}/outputs/generators/    # Custom generators
2. EPF Framework:  docs/EPF/outputs/                 # Canonical generators
3. Installed:      ~/.epf-cli/generators/            # Globally installed
```

### 2. Generator Interface

Every generator must provide:

```
{generator}/
├── generator.yaml           # NEW: Machine-readable manifest
├── schema.json              # Input validation (existing)
├── wizard.instructions.md   # Generation logic (existing)
├── validator.sh             # Output validation (existing)
└── README.md                # Documentation (existing)
```

**New file: `generator.yaml`**

```yaml
# Generator manifest for epf-cli
name: skattefunn-application
version: 1.0.0
description: Norwegian R&D tax deduction (SkatteFUNN) application generator
author: Emergent Team

# Generator metadata
type: output_generator
category: compliance # compliance, marketing, investor, internal, development
regions: [NO] # Geographic relevance (optional)

# Required EPF artifacts
requires:
  - north_star
  - strategy_formula
  - roadmap_recipe
  - value_models

# Output specification
output:
  format: markdown
  schema: schema.json
  validator: validator.sh

# Dependencies on other generators (optional)
depends_on: []
```

### 3. epf-cli Commands

#### List Generators

```bash
# List all available generators
epf-cli generators list
epf-cli generators list --category compliance
epf-cli generators list --installed

# Output:
# CANONICAL GENERATORS (from EPF framework)
#   context-sheet         AI context for external tools
#   investor-memo         Complete investor materials package
#   development-brief     Engineering handover documentation
#   value-model-preview   HTML preview of value model
#   skattefunn-application  Norwegian R&D tax deduction form
#
# INSTALLED GENERATORS (from ~/.epf-cli/generators/)
#   (none)
#
# INSTANCE GENERATORS (from _instances/emergent/outputs/generators/)
#   (none)
```

#### Get Generator Info

```bash
# Get generator details
epf-cli generators show skattefunn-application

# Output:
# Generator: skattefunn-application
# Version: 1.0.0
# Category: compliance
# Regions: NO
#
# Description:
#   Norwegian R&D tax deduction (SkatteFUNN) application generator
#
# Required EPF Artifacts:
#   - north_star
#   - strategy_formula
#   - roadmap_recipe
#   - value_models
#
# Files:
#   - schema.json (11.2 KB) - Input validation
#   - wizard.instructions.md (23.4 KB) - Generation logic
#   - validator.sh (33.5 KB) - Output validation
#   - template.md (5.6 KB) - Output template
```

#### Validate Generator Output

```bash
# Validate a generated output against its generator's schema and validator
epf-cli generators validate skattefunn-application ./outputs/skattefunn/application.md

# Output:
# Validating: ./outputs/skattefunn/application.md
# Generator: skattefunn-application (v1.0.0)
#
# ═══════════════════════════════════════════════
#   Layer 1: Schema/Structure Validation
# ═══════════════════════════════════════════════
# ✅ All required sections present
# ✅ Metadata block valid
#
# ═══════════════════════════════════════════════
#   Layer 2: Semantic Validation
# ═══════════════════════════════════════════════
# ✅ No placeholders found
# ✅ EPF source references valid
#
# ... (runs validator.sh internally)
#
# SUMMARY: ✅ PASSED (0 errors, 0 warnings)
```

#### Install/Manage Generators (Future)

```bash
# Install a generator from a git repository
epf-cli generators install https://github.com/org/my-generator.git

# Or from local path
epf-cli generators install ./custom-generators/partner-brief

# List installed generators
epf-cli generators list --installed

# Remove an installed generator
epf-cli generators remove my-generator
```

### 4. MCP Tools

#### `epf_list_generators`

```json
{
  "name": "epf_list_generators",
  "description": "List available output generators",
  "parameters": {
    "category": "Optional filter by category (compliance, marketing, investor, internal, development)",
    "source": "Optional filter by source (canonical, installed, instance)"
  }
}
```

#### `epf_get_generator`

```json
{
  "name": "epf_get_generator",
  "description": "Get generator details including wizard instructions",
  "parameters": {
    "name": "Generator name (required)"
  },
  "returns": {
    "manifest": "generator.yaml content",
    "schema": "schema.json content",
    "wizard": "wizard.instructions.md content",
    "template": "template.md content (if exists)"
  }
}
```

#### `epf_validate_generator_output`

```json
{
  "name": "epf_validate_generator_output",
  "description": "Validate a generated output against its generator",
  "parameters": {
    "generator": "Generator name",
    "output_path": "Path to the generated output file"
  },
  "returns": {
    "valid": "boolean",
    "errors": "array of error messages",
    "warnings": "array of warning messages",
    "layer_results": "breakdown by validation layer"
  }
}
```

#### `epf_check_generator_prerequisites`

```json
{
  "name": "epf_check_generator_prerequisites",
  "description": "Check if EPF instance has required artifacts for a generator",
  "parameters": {
    "generator": "Generator name",
    "instance_path": "Path to EPF instance"
  },
  "returns": {
    "ready": "boolean",
    "missing_artifacts": "array of missing artifact types",
    "incomplete_artifacts": "array of artifacts with missing required fields"
  }
}
```

---

## Implementation Phases

### Phase 1: Generator Discovery & Metadata (MVP)

1. Add `generator.yaml` manifest to existing generators
2. Create `internal/generator/` package:
   - `types.go` - Generator, GeneratorManifest types
   - `loader.go` - Load generators from canonical location
   - `parser.go` - Parse generator.yaml manifests
3. Add MCP tools: `epf_list_generators`, `epf_get_generator`
4. Add CLI: `epf-cli generators list`, `epf-cli generators show`

### Phase 2: Output Validation

1. Extend generator package:
   - `validator.go` - Run validator.sh programmatically
   - Capture and parse validator output
2. Add MCP tool: `epf_validate_generator_output`
3. Add CLI: `epf-cli generators validate`
4. Add prerequisite checking: `epf_check_generator_prerequisites`

### Phase 3: Plugin Installation (Future)

1. Add generator installation from git
2. Support instance-local generators
3. Add CLI: `epf-cli generators install`, `remove`
4. Version compatibility checking

### Phase 4: Generator Creation Assistance (Future)

1. AI-assisted generator creation wizard
2. Generator template scaffolding
3. Validator generation from schema

---

## Key Decisions Needed

### 1. Where Do Output Schemas Live?

**Option A:** In `docs/EPF/outputs/{generator}/schema.json` (current)

- Pro: Self-contained generators
- Con: Schemas not with other EPF schemas

**Option B:** In `docs/EPF/schemas/outputs/` alongside core schemas

- Pro: Consistent with existing schema location
- Con: Breaks generator self-containment

**Recommendation:** Keep in generator directories (Option A) - self-containment is more valuable for plugin architecture.

### 2. How to Handle Validator.sh?

Current validators are bash scripts (500-900 lines). Options:

**Option A:** Execute bash scripts via `os/exec`

- Pro: Reuse existing validators
- Con: Platform compatibility (Windows)
- Con: Security considerations

**Option B:** Port validators to Go

- Pro: Cross-platform, type-safe
- Con: Significant effort (5 validators × 500-900 lines)
- Con: Maintenance burden (two implementations)

**Option C:** JSON Schema validation only, skip semantic validators

- Pro: Simple, cross-platform
- Con: Loses rich semantic validation

**Recommendation:** Phase 1 uses Option C (schema-only), Phase 2 adds Option A (bash execution) with platform check.

### 3. Generator Versioning Strategy

How should generators version relative to EPF?

**Option A:** Generators version independently

- Pro: Flexibility, rapid iteration
- Con: Compatibility matrix complexity

**Option B:** Generators version with EPF

- Pro: Guaranteed compatibility
- Con: Slow release cycle

**Recommendation:** Independent versioning (Option A) with `requires.epf_version` in manifest for compatibility checking.

---

## Alignment with MASTER_PLAN

| Principle                       | How This Proposal Aligns                          |
| ------------------------------- | ------------------------------------------------- |
| Git is God                      | Generators are git repos, no database             |
| Clean Repos                     | Generator definitions in EPF, outputs in instance |
| Schema First                    | Output schemas enable validation                  |
| Agent as Writer, Tool as Linter | AI uses wizard to generate, epf-cli validates     |
| Canonical EPF Owns Schemas      | Output schemas in canonical EPF                   |

---

## Open Questions for Discussion

~~1. **Should epf-cli actually RUN generators?** Or just provide wizard content to AI agents and validate outputs?~~
**DECIDED:** AI agents write outputs using wizard instructions, epf-cli validates.

~~2. **What's the minimum viable plugin system?** Git clone into `~/.epf-cli/generators/`? Or something more sophisticated?~~
**DECIDED:** No plugin system needed. Generators are just directories. Instance-local first.

~~3. **How do we handle Windows users?** Bash validators don't work natively.~~
**DECIDED:** Schema validation is primary. Bash validators are optional/Unix-only.

~~4. **Should there be a generator registry?** Or pure git-based discovery?~~
**DECIDED:** No registry. Directory-based discovery from instance → framework → global.

~~5. **Who creates new generators?** Framework team only, or community contribution process?~~
**DECIDED:** Users create their own generators easily with AI assistance. Canonical generators for common cases.

---

## Next Steps

1. ~~**Discuss** this proposal and gather feedback~~ ✅ Done
2. ~~**Decide** on key architectural questions~~ ✅ Done
3. **Create** tasks.md for chosen approach ✅ Done - see [tasks.md](./tasks.md)
4. **Implement** Phase 1 (Generator Discovery)

---

## The Easy Generator Creation Flow

This is the key user story - a user should be able to create a custom generator in ~30 minutes:

```
┌─────────────────────────────────────────────────────────────────┐
│ USER: "I need to generate board meeting summaries from EPF"     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: Creates generator scaffold                                   │
│     epf_create_generator_scaffold(                              │
│       name: "board-summary",                                    │
│       description: "Monthly board meeting summary",             │
│       required_artifacts: ["north_star", "roadmap_recipe"]      │
│     )                                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: Customizes wizard.instructions.md                           │
│     - Defines what data to extract from EPF                     │
│     - Defines transformation rules                              │
│     - Defines output structure                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FILES SAVED TO: _instances/emergent/generators/board-summary/   │
│     ├── generator.yaml                                          │
│     ├── schema.json                                             │
│     └── wizard.instructions.md                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER: "Generate a board summary for January"                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: Retrieves and follows wizard                                │
│     epf_get_generator("board-summary")                          │
│     → Follows wizard.instructions.md                            │
│     → Reads EPF artifacts                                       │
│     → Generates board-summary.md                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI: Validates output                                            │
│     epf_validate_generator_output(                              │
│       generator: "board-summary",                               │
│       content: <generated content>                              │
│     )                                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OUTPUT SAVED TO: _instances/emergent/outputs/board-summaries/   │
│     └── 2025-01-board-summary.md                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points:**

- Generator creation is AI-assisted, not manual
- Generators are instance-local by default (proprietary)
- No approval process or contribution workflow needed
- Once created, generators are reusable

---

## Appendix: Existing Generator Analysis

### Generator Complexity

| Generator              | Schema Lines | Wizard Lines | Validator Lines | Template   |
| ---------------------- | ------------ | ------------ | --------------- | ---------- |
| context-sheet          | 408          | ~1000        | ~600            | No         |
| investor-memo          | ~500         | ~2000        | ~900            | No         |
| skattefunn-application | ~200         | ~1500        | ~900            | Yes        |
| development-brief      | ~150         | ~800         | ~500            | No         |
| value-model-preview    | ~100         | ~400         | ~300            | Yes (HTML) |

### Validation Layers (Common Across Generators)

1. **Schema/Structure** - Required sections, format compliance
2. **Semantics** - No placeholders, content quality
3. **Traceability** - EPF source references, metadata
4. **Domain-Specific** - External standards (Frascati, investor standards, etc.)

---

## References

- `docs/EPF/outputs/README.md` - Output generators overview
- `docs/EPF/outputs/GENERATOR_GUIDE.md` - Generator development guide
- `docs/EPF/outputs/STRUCTURE.md` - Directory structure
- `docs/product-factory-os/MASTER_PLAN.md` - ProductFactoryOS principles
