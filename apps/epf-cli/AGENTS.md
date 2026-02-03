# AGENTS.md - EPF-CLI Development Instructions

> **For AI coding assistants working with epf-cli**

## 🚨 CRITICAL: Before Starting Any Work

**Always check these files first:**

1. **Master Plan**: `docs/product-factory-os/MASTER_PLAN.md` - Principles, architecture, current phase
2. **Task List**: `openspec/changes/implement-epf-cli/tasks.md` - Current implementation status
3. **Design Doc**: `openspec/changes/implement-epf-cli/design.md` - Technical decisions

**After completing work:**

1. Update `openspec/changes/implement-epf-cli/tasks.md` - Mark completed items with `[x]`
2. Update `docs/product-factory-os/MASTER_PLAN.md` - Add to Progress Log if significant

**For new features:**

1. Create an openspec proposal if the feature is significant (see `openspec/AGENTS.md`)
2. Follow the three-stage workflow: Proposal → Implementation → Archive

## ProductFactoryOS Context

epf-cli is the **Kernel** of ProductFactoryOS (see MASTER_PLAN.md Section 3.1):

- **Role:** The "Language Server" & "Reference Library"
- **Nature:** A standalone Golang CLI
- **Responsibility:**
  - **Validation:** Runs jsonschema validation
  - **MCP Server:** Exposes tools to AI Agents

**Key Development Guidelines (from MASTER_PLAN.md):**

1. **Git is God:** Do not hide state in a database
2. **Clean Repos:** Templates live in epf-cli binary, not user repos
3. **Schema First:** Copilot cannot help without rules
4. **Agent as Writer, Tool as Linter:** epf-cli never writes content

## Project Context

epf-cli is a Go CLI that provides schema validation, health checking, and MCP tooling for the Emergent Product Framework (EPF). It:

- **Loads** JSON schemas from `docs/EPF/schemas/`
- **Validates** YAML artifacts against schemas
- **Analyzes** field coverage based on importance taxonomy
- **Checks** version alignment between artifacts and schemas
- **Fixes** common issues (trailing whitespace, missing versions, tabs)
- **Migrates** artifacts to newer schema versions
- **Detects** artifact types from filename patterns
- **Serves** MCP tools for AI agents (23 tools available)
- **Discovers** EPF wizards and agent instructions for guided workflows
- **Manages** EPF output generators for creating documents from EPF data

**Key principle:** epf-cli does NOT write content. It only validates, analyzes, and fixes formatting. AI agents write content, epf-cli validates it.

## 🚨 CRITICAL: Schema Loading Architecture

The CLI loads schemas from the EPF framework at runtime. It does NOT generate schemas from Go structs.

```
docs/EPF/schemas/          # Source of truth (21 JSON Schema files)
       ↓
internal/schema/loader.go  # Loads all .json files
       ↓
internal/validator/        # Compiles and validates against schemas
       ↓
internal/mcp/server.go     # Exposes via MCP tools
```

## Directory Structure

```
apps/epf-cli/
├── cmd/                    # Cobra CLI commands
│   ├── root.go             # Root + schema dir auto-detection
│   ├── health.go           # Comprehensive health check
│   ├── schemas.go          # List available schemas
│   ├── validate.go         # Validate YAML files
│   ├── fix.go              # Auto-fix common issues (granular flags)
│   ├── fix_test.go         # Fix command unit tests
│   ├── migrate.go          # Version migration
│   ├── migrate_test.go     # Migrate command unit tests
│   ├── report.go           # Generate health reports (md/html/json)
│   ├── diff.go             # Compare EPF artifacts/instances
│   ├── serve.go            # Start MCP server
│   ├── init.go             # Initialize EPF instance
│   ├── generators.go       # Generator commands (list/show/check/scaffold)
│   └── version.go          # Version info
├── internal/
│   ├── schema/
│   │   ├── loader.go       # Schema loading + artifact type detection
│   │   └── loader_test.go  # Unit tests
│   ├── validator/
│   │   ├── validator.go    # YAML validation using jsonschema
│   │   └── validator_test.go
│   ├── mcp/
│   │   ├── server.go       # MCP tool definitions (23 tools)
│   │   ├── wizard_tools.go # Wizard MCP tool handlers
│   │   ├── generator_tools.go # Generator MCP tool handlers
│   │   └── server_test.go  # MCP tool unit tests
│   ├── wizard/             # Wizard discovery and recommendation
│   │   ├── types.go        # WizardType, WizardInfo, Recommendation
│   │   ├── parser.go       # Markdown metadata extraction
│   │   ├── loader.go       # Loads wizards and agent instructions
│   │   ├── recommender.go  # Task-to-wizard matching
│   │   └── wizard_test.go  # Comprehensive tests
│   ├── generator/          # Output generator management
│   │   ├── types.go        # GeneratorInfo, GeneratorManifest, etc.
│   │   ├── manifest.go     # generator.yaml parsing
│   │   ├── loader.go       # Generator discovery from sources
│   │   └── scaffold.go     # New generator scaffolding
│   └── checks/             # Health check implementations
│       ├── instance.go     # Instance structure + content readiness
│       ├── instance_test.go
│       ├── features.go     # Feature quality validation
│       ├── crossrefs.go    # Cross-reference validation
│       ├── coverage.go     # Field coverage analysis (TRL, personas)
│       ├── coverage_test.go
│       └── versions.go     # Version alignment checking
├── tests/
│   └── integration_test.go # Integration tests with real EPF files
├── main.go
├── go.mod
└── README.md
```

## EPF Framework Location

From `apps/epf-cli/`:

```
../../docs/EPF/
├── schemas/               # 21 JSON Schema files (Draft-07)
│   └── field-importance-taxonomy.json  # Field importance for coverage analysis
├── templates/             # READY/FIRE/AIM templates
├── definitions/           # Canonical track definitions
├── _instances/            # Real product instances
│   └── emergent/          # Test data with READY/FIRE/AIM
├── scripts/               # Bash validation scripts (reference)
├── wizards/               # AI wizard instructions
└── AGENTS.md              # EPF framework AI instructions
```

## CLI Commands (v0.9.0)

| Command                  | Description                                  |
| ------------------------ | -------------------------------------------- |
| `health`                 | Run comprehensive health check (7 checks)    |
| `validate`               | Schema validation only                       |
| `schemas`                | List available schemas                       |
| `fix`                    | Auto-fix common issues (with granular flags) |
| `migrate`                | Migrate artifacts to newer schema versions   |
| `report`                 | Generate health reports (md/html/json)       |
| `diff`                   | Compare EPF artifacts or instances           |
| `serve`                  | Start MCP server (23 tools)                  |
| `init`                   | Initialize new EPF instance                  |
| `explain`                | Explain a value model path                   |
| `context` (alias: `ctx`) | Get strategic context for a feature          |
| `coverage`               | Analyze feature coverage of value model      |
| `relationships validate` | Validate all relationship paths              |
| `generators list`        | List available output generators             |
| `generators show`        | Show generator details and wizard            |
| `generators check`       | Check generator prerequisites                |
| `generators scaffold`    | Create new generator from template           |
| `version`                | Show version                                 |

### Fix Command Flags (v0.6.0)

```bash
epf-cli fix <path> [flags]
  --whitespace      # Fix trailing whitespace only
  --line-endings    # Fix CRLF -> LF only
  --tabs            # Convert tabs to spaces only
  --newlines        # Fix missing/multiple trailing newlines only
  --versions        # Add missing meta.epf_version only
  --all             # Apply all fixes (default when no flag specified)
  --dry-run         # Preview without making changes
  -v, --verbose     # Show detailed output
```

### Report Command (v0.6.0)

```bash
epf-cli report <instance-path> [flags]
  --format string   # Output format: md (default), html, json
  -o, --output      # Write to file instead of stdout
  -v, --verbose     # Include detailed issues
```

### Diff Command (v0.6.0)

```bash
epf-cli diff <path1> <path2> [flags]
  --format string   # Output format: text (default), markdown, json
  -v, --verbose     # Show old/new values for changes
```

### Health Check Components

The `health` command runs these checks:

1. **Instance Structure** (`checks/instance.go`)

   - READY/FIRE/AIM directory presence
   - Required files in each phase
   - \_meta.yaml validation

2. **Schema Validation** (`validator/validator.go`)

   - Validates all YAML against JSON schemas
   - Auto-detects artifact types

3. **Feature Quality** (`checks/features.go`)

   - 4 personas required per feature
   - 200+ char narratives
   - Scenario completeness

4. **Cross-References** (`checks/crossrefs.go`)

   - Feature dependencies point to valid IDs

5. **Content Readiness** (`checks/instance.go`)

   - Detects TBD, TODO, placeholders

6. **Field Coverage** (`checks/coverage.go`)

   - TRL fields in roadmap key results (critical)
   - Hypothesis testing fields (high)
   - Persona narrative fields (critical)
   - Uses `field-importance-taxonomy.json`

7. **Version Alignment** (`checks/versions.go`)
   - Compares artifact versions vs schema versions
   - Detects stale/outdated artifacts

## MCP Tools (v0.9.0)

The server exposes these tools (23 tools total):

### Schema & Validation Tools

| Tool                       | Parameters                 | Description                          |
| -------------------------- | -------------------------- | ------------------------------------ |
| `epf_list_schemas`         | none                       | List all loaded schemas              |
| `epf_get_schema`           | `artifact_type`            | Get JSON Schema for an artifact type |
| `epf_validate_file`        | `path`                     | Validate a file (auto-detects type)  |
| `epf_validate_content`     | `content`, `artifact_type` | Validate YAML content                |
| `epf_detect_artifact_type` | `path`                     | Detect artifact type from path       |
| `epf_get_phase_artifacts`  | `phase`                    | Get artifacts for READY/FIRE/AIM     |

### Health Check Tools

| Tool                          | Parameters      | Description                    |
| ----------------------------- | --------------- | ------------------------------ |
| `epf_health_check`            | `instance_path` | Run comprehensive health check |
| `epf_check_instance`          | `instance_path` | Check instance structure       |
| `epf_check_content_readiness` | `path`          | Check for placeholder content  |
| `epf_check_feature_quality`   | `instance_path` | Validate feature quality       |

### Template & Definition Tools

| Tool                   | Parameters                     | Description                            |
| ---------------------- | ------------------------------ | -------------------------------------- |
| `epf_list_artifacts`   | `phase` (optional)             | List artifact types with template info |
| `epf_get_template`     | `artifact_type`                | Get starting template YAML             |
| `epf_list_definitions` | `track`, `category` (optional) | List track definitions                 |
| `epf_get_definition`   | `id`                           | Get definition content by ID           |

### Relationship Intelligence Tools (v0.7.0)

These tools analyze strategic relationships between EPF artifacts:

| Tool                         | Parameters                     | Description                             |
| ---------------------------- | ------------------------------ | --------------------------------------- |
| `epf_explain_value_path`     | `path`, `instance_path`        | Explain what a value model path means   |
| `epf_get_strategic_context`  | `feature_id`, `instance_path`  | Get strategic context for a feature     |
| `epf_analyze_coverage`       | `instance_path`, `track` (opt) | Analyze feature coverage of value model |
| `epf_validate_relationships` | `instance_path`                | Validate all relationship paths         |

**Use cases:**

- **`epf_explain_value_path`**: Understand any value model path like `Product.Discovery.KnowledgeExploration` - shows layer, component, maturity, contributing features, and targeting KRs
- **`epf_get_strategic_context`**: Get full strategic context for a feature - resolved contributes_to paths, related KRs, dependencies
- **`epf_analyze_coverage`**: Find strategic blind spots - which value model components lack feature investment
- **`epf_validate_relationships`**: Validate all contributes_to and KR target paths - includes "did you mean" suggestions

### Wizard & Agent Instructions Tools (v0.8.0)

These tools enable AI agents to discover and retrieve EPF wizards for guided workflows:

| Tool                          | Parameters                 | Description                                |
| ----------------------------- | -------------------------- | ------------------------------------------ |
| `epf_list_wizards`            | `phase`, `type` (optional) | List available wizards with metadata       |
| `epf_get_wizard`              | `name`                     | Get full wizard content and metadata       |
| `epf_get_wizard_for_task`     | `task`                     | Recommend wizard based on task description |
| `epf_list_agent_instructions` | none                       | List EPF agent instruction files           |
| `epf_get_agent_instructions`  | `name`                     | Get agent instruction content              |

**Use cases:**

- **`epf_list_wizards`**: Discover available wizards by phase (Onboarding, READY, FIRE, AIM) or type (agent_prompt, wizard)
- **`epf_get_wizard`**: Retrieve full wizard content to guide a workflow - includes related templates, schemas, and wizards
- **`epf_get_wizard_for_task`**: Find the best wizard for a user's task - returns recommendation with confidence and alternatives
- **`epf_list_agent_instructions`**: Discover instruction files (AGENTS.md, copilot-instructions.md, etc.)
- **`epf_get_agent_instructions`**: Get comprehensive instructions for operating within EPF

### Generator Tools (v0.9.0)

These tools enable AI agents to discover, use, and create EPF output generators:

| Tool                          | Parameters                                 | Description                              |
| ----------------------------- | ------------------------------------------ | ---------------------------------------- |
| `epf_list_generators`         | `category`, `source` (optional)            | List available output generators         |
| `epf_get_generator`           | `name`, `include_wizard`, `include_schema` | Get generator details and wizard         |
| `epf_check_generator_prereqs` | `name`, `instance_path`                    | Check if instance has required artifacts |
| `epf_scaffold_generator`      | `name`, `description`, `category`, etc.    | Create new generator from template       |

**Use cases:**

- **`epf_list_generators`**: Discover what generators are available for creating outputs (investor memos, compliance docs, etc.)
- **`epf_get_generator`**: Get wizard instructions for generating a specific output type
- **`epf_check_generator_prereqs`**: Verify instance has required artifacts before attempting generation
- **`epf_scaffold_generator`**: Create custom generators for new output types

**Wizard Types:**

- `agent_prompt` (\*.agent_prompt.md) - Conversational AI personas for guided workflows
- `wizard` (\*.wizard.md) - Step-by-step guides with structured outputs
- `ready_sub_wizard` (##\_\*.agent_prompt.md) - READY phase numbered sub-wizards

**Recommendation Algorithm:**

1. Check trigger phrases from wizard content (high confidence on match)
2. Match keywords (feature, roadmap, assess, etc.) to known wizard mappings
3. Phase hints in task description boost relevant wizard confidence
4. Returns alternatives when multiple wizards could apply

## Artifact Type Detection

Filename patterns → artifact types (defined in `internal/schema/loader.go`):

```go
// READY Phase
"00_north_star.yaml"           → north_star
"01_insight_analyses.yaml"     → insight_analyses
"02_strategy_foundations.yaml" → strategy_foundations
"03_insight_opportunity.yaml"  → insight_opportunity
"04_strategy_formula.yaml"     → strategy_formula
"05_roadmap_recipe.yaml"       → roadmap_recipe

// FIRE Phase
"feature_definitions/*.yaml"   → feature_definition
"fd-*.yaml"                    → feature_definition
"value_models/*.yaml"          → value_model
"workflows/*.yaml"             → workflow
"mappings.yaml"                → mappings

// AIM Phase
"assessment_report.yaml"       → assessment_report
"calibration_memo.yaml"        → calibration_memo
```

### Relationship Intelligence CLI Commands (v0.7.0)

These commands provide strategic relationship analysis from the terminal:

#### `epf-cli explain <path>`

Explain what a value model path means and show its strategic context.

```bash
# Explain a value model path
epf-cli explain Product.Discovery.KnowledgeExploration
epf-cli explain Strategy.StrategicFramework --verbose
epf-cli explain Product.Discovery --json

# Output shows:
# - Layer (L1) and Component (L2/L3) information
# - Current maturity level
# - Features that contribute to this path
# - Key Results (KRs) targeting this path
```

#### `epf-cli context <feature_id>` (alias: `ctx`)

Get strategic context for a feature.

```bash
# Get context by feature ID or slug
epf-cli context FD-001
epf-cli context knowledge-exploration-engine
epf-cli ctx FD-001 --verbose
epf-cli ctx FD-001 --json

# Output shows:
# - Feature details (ID, slug, name, status)
# - Resolved contributes_to paths with validation
# - Related Key Results from roadmap
# - Feature dependencies (requires/enables)
```

#### `epf-cli coverage [--track <track>]`

Analyze how well features cover the value model.

```bash
# Analyze all tracks
epf-cli coverage

# Analyze specific track
epf-cli coverage --track Product
epf-cli coverage --track Strategy

# Detailed output
epf-cli coverage --verbose
epf-cli coverage --json

# Output shows:
# - Overall coverage percentage
# - Coverage by layer
# - Uncovered components (gaps)
# - Orphan features (no contributes_to)
# - Strategic gaps (KR targets without features)
```

#### `epf-cli relationships validate` (aliases: `rel`, `rels`)

Validate all relationship paths in the instance.

```bash
# Validate all relationships
epf-cli relationships validate
epf-cli rel validate --verbose
epf-cli rels validate --json

# Output shows:
# - Features and KRs checked
# - Valid vs invalid paths
# - Detailed errors with "did you mean" suggestions
# - Available paths for fixing errors
```

### Wizard Commands (v0.8.0)

Discover and retrieve EPF wizard content for guided workflows.

#### `epf-cli wizards list`

List available wizards with optional filtering.

```bash
# List all wizards
epf-cli wizards list

# Filter by phase
epf-cli wizards list --phase READY
epf-cli wizards list --phase FIRE
epf-cli wizards list --phase Onboarding

# Filter by type
epf-cli wizards list --type agent_prompt
epf-cli wizards list --type wizard

# JSON output
epf-cli wizards list --json
```

#### `epf-cli wizards show <name>`

Get full content and metadata for a specific wizard.

```bash
# Show wizard with metadata
epf-cli wizards show feature_definition
epf-cli wizards show start_epf

# Content only (no metadata header)
epf-cli wizards show pathfinder --content-only

# JSON output
epf-cli wizards show product_architect --json
```

#### `epf-cli wizards recommend <task>`

Get wizard recommendation based on task description.

```bash
# Recommend wizard for a task
epf-cli wizards recommend "create a feature definition"
epf-cli wizards recommend "help me get started with EPF"
epf-cli wizards recommend "analyze market trends"

# JSON output
epf-cli wizards recommend "plan our roadmap" --json

# Output shows:
# - Recommended wizard name and type
# - Confidence level (high, medium, low)
# - Reason for recommendation
# - Alternative wizards to consider
```

#### `epf-cli wizards instructions`

List available agent instruction files.

```bash
# List all instruction files
epf-cli wizards instructions

# JSON output
epf-cli wizards instructions --json

# Output shows:
# - AGENTS.md (comprehensive instructions)
# - .github/copilot-instructions.md (quick reference)
# - .ai-agent-instructions.md (maintenance protocol)
```

## Development Commands

```bash
# Build
go build -o epf-cli .

# Run tests (60+ unit tests)
go test ./...
go test ./... -count=1 -v  # Verbose, no cache

# Run health check (recommended)
./epf-cli health ../../docs/EPF/_instances/emergent/
./epf-cli health ../../docs/EPF/_instances/emergent/ --verbose
./epf-cli health ../../docs/EPF/_instances/emergent/ --json

# Fix common issues (granular flags)
./epf-cli fix ../../docs/EPF/_instances/emergent/ --dry-run
./epf-cli fix ../../docs/EPF/_instances/emergent/ --whitespace --tabs
./epf-cli fix ../../docs/EPF/_instances/emergent/ --versions -v

# Generate reports
./epf-cli report ../../docs/EPF/_instances/emergent/
./epf-cli report ../../docs/EPF/_instances/emergent/ --format html -o /tmp/report.html
./epf-cli report ../../docs/EPF/_instances/emergent/ --format json

# Compare artifacts
./epf-cli diff file1.yaml file2.yaml
./epf-cli diff ./instance-v1/ ./instance-v2/ --format markdown

# Migrate versions
./epf-cli migrate ../../docs/EPF/_instances/emergent/ --dry-run
./epf-cli migrate ../../docs/EPF/_instances/emergent/ --target 2.0.0

# List schemas
./epf-cli schemas --schemas-dir ../../docs/EPF/schemas

# Validate files
./epf-cli validate --schemas-dir ../../docs/EPF/schemas ../../docs/EPF/_instances/emergent/READY/

# Test MCP server manually
./epf-cli serve --schemas-dir ../../docs/EPF/schemas
```

## Key Dependencies

- `github.com/spf13/cobra` - CLI framework
- `github.com/santhosh-tekuri/jsonschema/v5` - JSON Schema validation
- `github.com/mark3labs/mcp-go` - MCP server implementation
- `gopkg.in/yaml.v3` - YAML parsing

## Adding New Artifact Types

1. Add schema file to `docs/EPF/schemas/{artifact}_schema.json`
2. Add `ArtifactType` constant in `internal/schema/loader.go`
3. Add filename pattern to `artifactMapping` slice
4. Add schema filename to `schemaFileMapping` map
5. Rebuild and test

## Adding New Health Checks

1. Create new file in `internal/checks/`
2. Define checker struct with `NewXxxChecker(path string)` constructor
3. Implement `Check()` method returning appropriate result type
4. Add to `runHealthCheck()` in `cmd/health.go`
5. Add print function for human-readable output
6. Update `HealthResult` struct if needed

## Schema Reference Resolution

Schemas use `$ref` to reference other schemas. The validator:

1. First loads ALL `.json` files from schemas directory
2. Adds each as a resource with its filename as ID
3. Then compiles schemas (allowing `$ref` to resolve)

Example in `track_definition_base_schema.json`:

```json
{
  "$ref": "track_definition_base_schema.json"
}
```

Resolves because we added the resource as `track_definition_base_schema.json`.

## Output Generators (v0.9.0)

EPF Output Generators transform EPF instance data into useful output artifacts. The epf-cli provides comprehensive tooling for discovering, using, and creating generators.

### Generator Anatomy

Every generator has the same predictable structure:

```
generators/<name>/
├── generator.yaml           # Manifest (required) - metadata and requirements
├── wizard.instructions.md   # AI instructions (required) - how to generate
├── schema.json              # Output schema (required) - validation rules
├── validator.sh             # Validation script (required) - custom checks
├── template.md              # Output template (optional) - starting structure
└── README.md                # Documentation (optional) - human reference
```

### Generator Sources (Priority Order)

1. **Instance** (`_instances/{product}/generators/`) - Custom generators, can override framework
2. **Framework** (`docs/EPF/outputs/`) - Canonical EPF generators
3. **Global** (`~/.epf-cli/generators/`) - User's shared generators

### Generator Categories

| Category      | Icon | Description             | Examples                       |
| ------------- | ---- | ----------------------- | ------------------------------ |
| `compliance`  | 📋   | Regulatory documents    | SkatteFUNN, SEIS, R&D credits  |
| `marketing`   | 📢   | External communications | Positioning docs, messaging    |
| `investor`    | 💼   | Investor materials      | Pitch decks, memos, data rooms |
| `internal`    | 📄   | Team documentation      | Context sheets, handover docs  |
| `development` | 🛠️   | Engineering outputs     | Specs, briefs, ADRs            |
| `custom`      | ⚙️   | Custom generators       | User-defined                   |

### CLI Commands

#### `epf-cli generators list`

List available generators with optional filtering.

```bash
# List all generators
epf-cli generators list

# Filter by category
epf-cli generators list --category compliance
epf-cli generators list --category investor

# Filter by source
epf-cli generators list --source framework
epf-cli generators list --source instance

# JSON output
epf-cli generators list --json
```

#### `epf-cli generators show <name>`

Display full content and metadata of a generator.

```bash
# Show generator with metadata
epf-cli generators show context-sheet
epf-cli generators show skattefunn-application

# Show only wizard instructions
epf-cli generators show investor-memo --wizard

# Show only output schema
epf-cli generators show development-brief --schema

# JSON output
epf-cli generators show context-sheet --json
```

#### `epf-cli generators check <name>`

Check if an EPF instance has required artifacts for a generator.

```bash
# Check prerequisites
epf-cli generators check context-sheet
epf-cli generators check skattefunn-application --instance emergent

# JSON output
epf-cli generators check investor-memo --json
```

#### `epf-cli generators scaffold <name>`

Create a new generator with all required files.

```bash
# Basic scaffold
epf-cli generators scaffold pitch-deck

# Full options
epf-cli generators scaffold seis-application \
  --description "Creates UK SEIS applications from EPF data" \
  --category compliance \
  --requires north_star,strategy_formula \
  --optional value_models \
  --region GB \
  --format markdown

# Output to specific directory
epf-cli generators scaffold team-brief \
  --category internal \
  --output ./my-generators
```

### MCP Tools

| Tool                          | Parameters                                 | Description                              |
| ----------------------------- | ------------------------------------------ | ---------------------------------------- |
| `epf_list_generators`         | `category`, `source` (optional)            | List available generators                |
| `epf_get_generator`           | `name`, `include_wizard`, `include_schema` | Get generator details and content        |
| `epf_check_generator_prereqs` | `name`, `instance_path`                    | Check if instance has required artifacts |
| `epf_scaffold_generator`      | `name`, `description`, `category`, etc.    | Create new generator from template       |

**Use cases:**

- **`epf_list_generators`**: Discover what generators are available for creating outputs
- **`epf_get_generator`**: Get wizard instructions for generating a specific output type
- **`epf_check_generator_prereqs`**: Verify instance readiness before attempting generation
- **`epf_scaffold_generator`**: Create custom generators for new output types

### Creating New Generators

AI agents can create new generators using a streamlined workflow:

1. **Use the wizard**: `epf_get_wizard('create_generator')` for comprehensive guidance
2. **Gather requirements**: Ask about name, category, required artifacts, output format
3. **Scaffold**: Use `epf_scaffold_generator()` or CLI to create structure
4. **Customize**:
   - Edit `wizard.instructions.md` with specific extraction and generation rules
   - Update `schema.json` with output validation
   - Customize `validator.sh` for domain-specific checks
5. **Test**: Use `epf_get_generator()` and `epf_check_generator_prereqs()` to verify

### Example: Creating a Pitch Deck Generator

```bash
# 1. Scaffold the generator
epf-cli generators scaffold pitch-deck \
  --description "Creates investor pitch decks from EPF data" \
  --category investor \
  --requires north_star,strategy_formula \
  --optional value_models,roadmap_recipe

# 2. Edit wizard.instructions.md to define:
#    - Which EPF files to read
#    - What data to extract (YAML paths)
#    - Output structure (sections, formatting)
#    - Quality requirements

# 3. Update schema.json with validation rules

# 4. Customize validator.sh with domain checks

# 5. Test
epf-cli generators show pitch-deck --wizard
epf-cli generators check pitch-deck --instance emergent
```

### Built-in Generators

| Generator                | Category    | Description                             |
| ------------------------ | ----------- | --------------------------------------- |
| `context-sheet`          | internal    | AI context summaries for external tools |
| `investor-memo`          | investor    | Comprehensive investor materials        |
| `skattefunn-application` | compliance  | Norwegian R&D tax credit applications   |
| `development-brief`      | development | Engineering implementation briefs       |
| `value-model-preview`    | internal    | Shareable HTML value model previews     |
