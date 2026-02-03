# Tasks: Output Generator Support for epf-cli

**Proposal:** [proposal.md](./proposal.md)  
**Status:** Complete (All Phases)  
**Priority:** Broad generator support + easy generator creation

---

## Design Principles (from Discussion)

1. **Agent as Writer, Tool as Linter** - AI agents write output artifacts, epf-cli validates
2. **Easy Generator Creation** - Users can quickly build proprietary generators with AI assistance
3. **Local-First** - Generators don't need to be shared; instance-local generators are first-class
4. **Git is God** - No package registry; generators are directories in git repos
5. **Broad Support** - Prioritize supporting many generators over deep validation initially

---

## Phase 1: Generator Discovery & Delivery (MVP) ✅

### 1.1 Create generator package types

- [x] Create `internal/generator/types.go`
  - [x] `GeneratorType` (output_generator for now, extensible)
  - [x] `GeneratorCategory` enum (compliance, marketing, investor, internal, development, custom)
  - [x] `GeneratorInfo` struct with metadata
  - [x] `GeneratorManifest` struct for generator.yaml parsing
  - [x] `GeneratorSource` enum (canonical, instance, global)

### 1.2 Create generator manifest schema

- [x] Define `generator.yaml` structure:

  ```yaml
  name: my-generator
  version: 1.0.0
  description: What this generator creates
  category: custom

  # What EPF artifacts are needed
  requires:
    artifacts:
      - north_star
      - strategy_formula
    optional:
      - roadmap_recipe
      - value_models

  # Output specification
  output:
    format: markdown # markdown, json, html, yaml

  # Files (auto-detected if not specified)
  files:
    schema: schema.json
    wizard: wizard.instructions.md
    validator: validator.sh # optional
    template: template.md # optional
  ```

### 1.3 Implement generator loader

- [x] Create `internal/generator/loader.go`
  - [x] `NewLoader(epfRoot string) *Loader`
  - [x] `Load() error` - scan all generator sources
  - [x] Discovery order:
    1. Instance-local: `{instance}/generators/`
    2. EPF Framework: `docs/EPF/outputs/`
    3. Global: `~/.epf-cli/generators/`
  - [x] `ListGenerators(category, source) []*GeneratorInfo`
  - [x] `GetGenerator(name string) (*GeneratorInfo, error)`
  - [x] `GetGeneratorContent(name string) (*GeneratorContent, error)` - returns wizard, schema, template
  - [x] Handle missing generators directory gracefully

### 1.4 Add generator.yaml to existing generators

- [x] Create `docs/EPF/outputs/context-sheet/generator.yaml`
- [x] Create `docs/EPF/outputs/investor-memo/generator.yaml`
- [x] Create `docs/EPF/outputs/skattefunn-application/generator.yaml`
- [x] Create `docs/EPF/outputs/development-brief/generator.yaml`
- [x] Create `docs/EPF/outputs/value-model-preview/generator.yaml`

---

## Phase 2: MCP Tools for AI Agents ✅

### 2.1 Generator discovery tools

- [x] Add `epf_list_generators` tool

  - [x] Parameters: `category` (optional), `source` (optional)
  - [x] Return: List of generators with name, description, category, source
  - [x] Group by source in output

- [x] Add `epf_get_generator` tool
  - [x] Parameters: `name` (required)
  - [x] Return: Full generator content including:
    - Manifest (generator.yaml)
    - Wizard instructions (wizard.instructions.md)
    - Input schema (schema.json)
    - Template (template.md if exists)
  - [x] AI agents use wizard instructions to generate outputs

### 2.2 Prerequisite checking tool

- [x] Add `epf_check_generator_prereqs` tool
  - [x] Parameters: `generator` (required), `instance_path` (optional)
  - [x] Return:
    - `ready`: boolean
    - `missing_artifacts`: array
    - `suggestions`: what to do if not ready

---

## Phase 3: CLI Commands ✅

### 3.1 Generator listing and info

- [x] Create `cmd/generators.go`
- [x] Add `epf-cli generators list` command

  - [x] `--category` flag for filtering
  - [x] `--source` flag (canonical, instance, global)
  - [x] `--json` flag for JSON output
  - [x] Show source location for each generator

- [x] Add `epf-cli generators show <name>` command
  - [x] Display manifest info
  - [x] Display required artifacts
  - [x] Display files included
  - [x] `--wizard` flag to show full wizard content
  - [x] `--schema` flag to show input schema
  - [x] `--json` flag for JSON output

### 3.2 Generator prerequisite check

- [x] Add `epf-cli generators check <name>` command
  - [x] Check if current instance has required artifacts
  - [x] Report what's missing
  - [x] Suggest next steps

---

## Phase 4: Output Validation ✅

### 4.1 Schema-based validation

- [x] Add `epf_validate_generator_output` MCP tool

  - [x] Parameters: `generator`, `content` or `file_path`, `run_bash_validator`
  - [x] Validate against generator's schema.json
  - [x] Return structured validation results with layers

- [x] Add `epf-cli generators validate <generator> <output-file>` command
  - [x] Run schema validation
  - [x] Report errors/warnings
  - [x] `--json` flag for JSON output
  - [x] `--bash` flag to run bash validator

### 4.2 Bash validator execution (optional, Unix only)

- [x] Add optional bash validator execution
  - [x] Detect if validator.sh exists
  - [x] Execute via os/exec on Unix systems
  - [x] Parse validator output (stdout for warnings, stderr for errors)
  - [x] Skip gracefully on Windows with warning
  - [x] Configurable timeout (default 30s)

---

## Phase 5: Easy Generator Creation (Key Feature!) ✅

### 5.1 Generator scaffolding

- [x] Add `epf-cli generators scaffold <name>` command (named `scaffold` instead of `new`)
  - [x] Create generator directory structure
  - [x] Generate starter generator.yaml
  - [x] Generate starter schema.json
  - [x] Generate starter wizard.instructions.md template
  - [x] `--category` flag to set category
  - [x] `--output` flag for location (instance, global, or custom path)

### 5.2 Generator creation wizard (MCP)

- [x] Add `epf_scaffold_generator` tool
  - [x] Parameters: `name`, `description`, `category`, `required_artifacts`
  - [x] Return: Generated starter files content
  - [x] AI can use this + follow up with customization

### 5.3 Generator templates

- [x] Create generator templates embedded in scaffold.go:
  - [x] generator.yaml template
  - [x] schema.json template
  - [x] wizard.instructions.md template
  - [x] validator.sh template
  - [x] README.md template
- [x] Templates are self-documenting with comments

### 5.4 AI-assisted generator creation flow

- [x] Created `docs/EPF/wizards/create_generator.wizard.md` with comprehensive instructions

---

## Phase 6: Documentation & Testing ✅

### 6.1 Update AGENTS.md

- [x] Document generator MCP tools
- [x] Document generator CLI commands
- [x] Document generator creation workflow
- [x] Add examples

### 6.2 Create generator creation guide

- [x] Created `docs/EPF/wizards/create_generator.wizard.md` (wizard format instead of static guide)
  - [x] Step-by-step workflow
  - [x] Best practices
  - [x] Common patterns
  - [x] Category-specific guidelines

### 6.3 Tests

- [x] Create `internal/generator/generator_test.go`
  - [x] Test loader with multiple sources
  - [x] Test manifest parsing
  - [x] Test schema validation
  - [x] Test missing directory handling

---

## File Structure (Implemented)

```
apps/epf-cli/
├── cmd/
│   └── generators.go              # ✅ CLI commands (list, show, check, validate, scaffold)
├── internal/
│   └── generator/                 # ✅ Generator package
│       ├── types.go               # ✅ Types and constants
│       ├── loader.go              # ✅ Generator discovery
│       ├── manifest.go            # ✅ generator.yaml parsing
│       ├── scaffold.go            # ✅ Generator creation (templates embedded)
│       ├── validator.go           # ✅ Output validation
│       └── generator_test.go      # ✅ Tests

docs/EPF/outputs/
├── context-sheet/
│   └── generator.yaml             # ✅ Manifest
├── investor-memo/
│   └── generator.yaml             # ✅ Manifest
├── skattefunn-application/
│   └── generator.yaml             # ✅ Manifest
├── development-brief/
│   └── generator.yaml             # ✅ Manifest
└── value-model-preview/
    └── generator.yaml             # ✅ Manifest

docs/EPF/wizards/
└── create_generator.wizard.md     # ✅ AI-assisted creation guide

docs/EPF/_instances/{product}/
└── generators/                    # ✅ Supported (instance-local generators)
    └── {custom-generator}/
        ├── generator.yaml
        ├── schema.json
        └── wizard.instructions.md
```

---

## MCP Tools Summary (4 new tools implemented)

| Tool                            | Purpose                                               | Status |
| ------------------------------- | ----------------------------------------------------- | ------ |
| `epf_list_generators`           | List available generators by category/source          | ✅     |
| `epf_get_generator`             | Get full generator content (wizard, schema, template) | ✅     |
| `epf_check_generator_prereqs`   | Check if instance is ready for generator              | ✅     |
| `epf_scaffold_generator`        | Create new generator starter files                    | ✅     |
| `epf_validate_generator_output` | Validate generated output against schema              | ✅     |

---

## CLI Commands Summary

| Command                             | Purpose                           | Status |
| ----------------------------------- | --------------------------------- | ------ |
| `generators list`                   | List available generators         | ✅     |
| `generators show <name>`            | Show generator details            | ✅     |
| `generators check <name>`           | Check prerequisites for generator | ✅     |
| `generators scaffold <name>`        | Create new generator scaffold     | ✅     |
| `generators validate <name> <file>` | Validate generated output         | ✅     |

---

## Success Criteria

1. [x] All 5 canonical generators discoverable via `epf_list_generators`
2. [x] AI agents can retrieve wizard instructions via `epf_get_generator`
3. [x] Users can create new generators with `epf-cli generators scaffold`
4. [x] Instance-local generators work alongside canonical ones
5. [x] Generated outputs can be validated against schemas (Phase 4)
6. [x] Generator creation takes < 30 minutes with AI assistance
7. [x] All tests pass: `go test ./...`

---

## Notes

- Generators are NOT plugins in a traditional sense - they're just directories with specific files
- No package registry needed - git repos (canonical or user's own) are the distribution mechanism
- Instance-local generators (`_instances/{product}/generators/`) are first-class citizens
- AI agents do the heavy lifting of generation; epf-cli just provides content and validates
- Validation supports layered approach: schema validation + optional bash validator
