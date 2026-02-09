# AGENTS.md - EPF-CLI Development Instructions

> **For AI coding assistants working with epf-cli**
>
> **Note:** This comprehensive AGENTS.md file is embedded in the epf-cli binary
> and automatically distributed to product repositories when running `epf-cli init`.
> This ensures AI agents in product repos have complete epf-cli documentation.

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

---

## 🎯 FOUNDATIONAL: Feature Definition Granularity

> **CRITICAL CONCEPT** - Read this before creating ANY Feature Definition.

**FDs are NOT implementation checklists. They are strategic capability targets.**

| Level  | Artifact               | Purpose                        | Stability          |
| ------ | ---------------------- | ------------------------------ | ------------------ |
| L1     | Value Model            | WHY (outcomes)                 | Years              |
| **L2** | **Feature Definition** | **WHAT (capability category)** | **Quarters/Years** |
| L3     | Key Results            | HOW (incremental delivery)     | Each cycle         |

**The relationship:**

- FD = Stable target describing a complete capability category
- KRs = Stepping stones that incrementally deliver FD capabilities over multiple cycles
- One FD is delivered by MANY KRs over time

**Right-sizing an FD:**

- 2-15 capabilities (not 1, not 20+)
- User can describe it as "one thing they accomplish"
- All capabilities serve the same job-to-be-done
- Capabilities will mature on similar timelines

**❌ Wrong:** Creating separate FDs for "Upload Button", "Progress Bar", "Error Display"
**✅ Right:** One FD for "Document Management" with capabilities for upload, processing, search

For detailed guidance: `canonical-epf/docs/guides/FEATURE_DEFINITION_GRANULARITY_GUIDE.md`

---

## 📋 PRE-FLIGHT CHECKLIST: Before Creating/Editing EPF Artifacts

> **MANDATORY for AI agents writing EPF content (feature definitions, roadmaps, etc.)**
>
> This checklist prevents schema validation errors by checking constraints BEFORE writing.

### When to Use This Checklist

Use this checklist when you are about to:

- Create a new feature definition (fd-\*.yaml)
- Edit an existing EPF artifact
- Add personas, capabilities, contexts, or scenarios to a feature
- Modify roadmap key results or value model paths

### Pre-Flight Steps

**Step 1: Get the Schema for Your Artifact Type**

```
# Via MCP tool:
epf_get_schema { "artifact_type": "feature_definition" }

# Via CLI:
epf-cli schemas show feature_definition
```

**Step 2: Check Field Constraints (Enums, Patterns, Limits)**

Look for these constraint types in the schema:

| Constraint            | Example                                   | What to Check                |
| --------------------- | ----------------------------------------- | ---------------------------- |
| `enum`                | `status`, `type`, `technical_proficiency` | Only listed values are valid |
| `pattern`             | `^fd-[0-9]+$`, `^cap-[0-9]+$`             | Must match regex exactly     |
| `minItems`/`maxItems` | `personas: maxItems: 4`                   | Array length limits          |
| `minLength`           | `current_situation: minLength: 200`       | Minimum character counts     |

**Step 3: Quick Reference - Common Enum Values**

These are the most common enum constraints that cause validation errors:

| Field                   | Valid Values                                                  | Found In                             |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `status`                | `draft`, `ready`, `in-progress`, `delivered`                  | feature_definition                   |
| `context.type`          | `ui`, `email`, `notification`, `api`, `report`, `integration` | feature_definition.contexts          |
| `technical_proficiency` | `basic`, `intermediate`, `advanced`, `expert`                 | feature_definition.personas          |
| `tracks[]`              | `product`, `strategy`, `org_ops`, `commercial`                | feature_definition.strategic_context |
| `overall_stage`         | `hypothetical`, `emerging`, `proven`, `scaled`                | feature_definition.feature_maturity  |

**Step 4: Validate Before Committing**

After writing, ALWAYS validate:

```
# Via MCP tool:
epf_validate_file { "path": "path/to/your/artifact.yaml" }

# Via CLI:
epf-cli validate path/to/your/artifact.yaml
```

### Common Mistakes to Avoid

| ❌ Mistake                        | ✅ Correct                                | Why                                     |
| --------------------------------- | ----------------------------------------- | --------------------------------------- |
| `status: 'development'`           | `status: 'in-progress'`                   | 'development' is not a valid enum value |
| `type: 'tui'` or `type: 'web'`    | `type: 'ui'`                              | Use 'ui' for all visual interfaces      |
| 5 personas                        | 4 personas max                            | Schema enforces exactly 4 personas      |
| `contributes_to: ['Core.Search']` | `contributes_to: ['Product.Core.Search']` | Must include L1 prefix                  |
| `id: 'feature-001'`               | `id: 'fd-001'`                            | Must match pattern `^fd-[0-9]+$`        |

### Worked Example: Creating a Feature Definition

```yaml
# 1. Start with required fields from schema
id: 'fd-014' # Pattern: ^fd-[0-9]+$
name: 'My Feature'
slug: 'my-feature' # Pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
status: 'draft' # Enum: draft|ready|in-progress|delivered

strategic_context:
  contributes_to:
    - 'Product.Core.Search' # Pattern: ^(Product|Commercial|Strategy|OrgOps)\.[A-Za-z]+\.[A-Za-z]+
  tracks:
    - 'product' # Enum: product|strategy|org_ops|commercial

definition:
  job_to_be_done: | # minLength: 10
    When I [situation], I want to [action], so I can [outcome].

  solution_approach: | # minLength: 10
    High-level approach description...

  personas: # EXACTLY 4 required (minItems: 4, maxItems: 4)
    - id: 'persona-1' # 11 fields required per persona
      technical_proficiency: 'expert' # Enum: basic|intermediate|advanced|expert
      current_situation: '...' # minLength: 200 chars
      transformation_moment: '...' # minLength: 200 chars
      emotional_resolution: '...' # minLength: 200 chars
      # ... other required fields

  capabilities: # minItems: 1
    - id: 'cap-001' # Pattern: ^cap-[0-9]+$
      name: 'Capability Name'
      description: '...'

implementation:
  contexts:
    - id: 'ctx-001' # Pattern: ^ctx-[0-9]+$
      type: 'ui' # Enum: ui|email|notification|api|report|integration
      name: 'Context Name'
      description: '...' # minLength: 30
      key_interactions: ['...'] # minItems: 1
      data_displayed: ['...'] # minItems: 1
```

### MCP Tool Quick Reference for Pre-Flight

| Task                  | MCP Tool                    | Example                                                       |
| --------------------- | --------------------------- | ------------------------------------------------------------- |
| Get schema            | `epf_get_schema`            | `{ "artifact_type": "feature_definition" }`                   |
| Get template          | `epf_get_template`          | `{ "artifact_type": "feature_definition" }`                   |
| Validate file         | `epf_validate_file`         | `{ "path": "FIRE/feature_definitions/fd-014.yaml" }`          |
| Validate content      | `epf_validate_content`      | `{ "content": "...", "artifact_type": "feature_definition" }` |
| Check feature quality | `epf_check_feature_quality` | `{ "instance_path": "docs/EPF/_instances/emergent" }`         |
| Full health check     | `epf_health_check`          | `{ "instance_path": "docs/EPF/_instances/emergent" }`         |

---

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
- **Serves** MCP tools for AI agents (27 tools available)
- **Discovers** EPF wizards and agent instructions for guided workflows
- **Manages** EPF output generators for creating documents from EPF data

**Key principle:** epf-cli does NOT write content. It only validates, analyzes, and fixes formatting. AI agents write content, epf-cli validates it.

## Using epf-cli in Canonical EPF

The epf-cli is designed to work safely in **both** product repositories and the canonical EPF framework repository itself.

### Canonical EPF Detection

The CLI automatically detects when you're in the canonical EPF repository by checking for these markers:

| Marker                      | Location        |
| --------------------------- | --------------- |
| `CANONICAL_PURITY_RULES.md` | Repository root |
| `schemas/` directory        | Repository root |
| `templates/` directory      | Repository root |
| `wizards/` directory        | Repository root |

If **3 or more** markers are found, the directory is considered canonical EPF.

### Write Protection in Canonical EPF

To prevent accidental corruption of the framework, **write operations are blocked** in canonical EPF:

| Command                | Behavior in Canonical EPF          |
| ---------------------- | ---------------------------------- |
| `validate`             | ✅ Works (read-only)               |
| `schemas list/show`    | ✅ Works (read-only)               |
| `wizards list/show`    | ✅ Works (read-only)               |
| `generators list/show` | ✅ Works (read-only)               |
| `diff`                 | ✅ Works (read-only)               |
| `health`               | ⚠️ Blocked (would check instances) |
| `fix`                  | ❌ Blocked (write operation)       |
| `migrate`              | ❌ Blocked (write operation)       |
| `init`                 | ❌ Blocked (write operation)       |
| `migrate-structure`    | ❌ Blocked (write operation)       |

**Error message example:**

```
Error: refusing to fix EPF files in canonical EPF repository

The target path '/path/to/canonical-epf/templates/READY/00_north_star.yaml'
is inside the canonical EPF framework.
Write operations are not allowed there to preserve framework integrity.

If you are developing EPF itself, use --dev flag:
  epf-cli --dev fix EPF files ...
```

### Developer Mode (--dev)

EPF framework developers can bypass protection using the `--dev` flag:

```bash
# Bypass canonical protection (use with caution!)
epf-cli --dev fix templates/READY/00_north_star.yaml --whitespace
epf-cli --dev migrate schemas/

# Warning displayed:
# ⚠️  Developer mode: allowing fix EPF files in canonical EPF path: ...
```

**⚠️ Use --dev only when:**

- You're actively developing the EPF framework itself
- You understand the impact of your changes
- You're ready to commit and push to the canonical repository

### Useful Commands in Canonical EPF

These read-only operations are **safe and useful** for EPF developers:

```bash
# Browse schemas
epf-cli schemas list
epf-cli schemas show north_star

# Browse wizards
epf-cli wizards list
epf-cli wizards show feature_definition

# Browse generators
epf-cli generators list
epf-cli generators show investor-memo

# Validate templates (will fail with placeholder errors - expected)
epf-cli validate templates/READY/00_north_star.yaml

# Compare templates
epf-cli diff templates/READY/00_north_star.yaml templates/READY/01_insight_analyses.yaml

# Compare against template
epf-cli diff template templates/READY/00_north_star.yaml
```

### Testing EPF Changes

When developing EPF framework changes, follow this workflow:

1. **Make changes** in canonical EPF (schemas, templates, wizards)
2. **Test validation** on templates (expect failures with placeholders)
3. **Test in product repo** - cd to a product using EPF
4. **Run health checks** in the product repo
5. **Verify improvements** - ensure your changes help real usage
6. **Commit to canonical** only after product testing succeeds

### Why This Design?

| Principle                  | Rationale                                                |
| -------------------------- | -------------------------------------------------------- |
| **Separation**             | Framework (canonical) separate from instances (products) |
| **Safety**                 | Prevent accidental framework corruption                  |
| **Single source of truth** | Canonical EPF is the framework, products consume it      |
| **Deliberate changes**     | --dev flag forces conscious decision to modify framework |
| **Testing in context**     | Changes must be tested in real product repos             |

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
│   ├── aim.go              # AIM phase commands (assess/validate-assumptions/okr-progress)
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

## CLI Commands (v0.13.0)

| Command                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `agent`                    | Display AI agent instructions and guidance           |
| `locate`                   | Find EPF instances in directory tree                 |
| `health`                   | Run comprehensive health check (8 checks)            |
| `validate`                 | Schema validation only                               |
| `schemas`                  | List available schemas                               |
| `fix`                      | Auto-fix common issues (with granular flags)         |
| `migrate`                  | Migrate artifacts to newer schema versions           |
| `migrate-anchor`           | Add anchor file to legacy EPF instance               |
| `migrate-structure`        | Migrate EPF from root to docs/epf/ structure         |
| `report`                   | Generate health reports (md/html/json)               |
| `diff`                     | Compare EPF artifacts or instances                   |
| `serve`                    | Start MCP server (29 tools)                          |
| `init`                     | Initialize new EPF instance (now creates \_epf.yaml) |
| `explain`                  | Explain a value model path                           |
| `context` (alias: `ctx`)   | Get strategic context for a feature                  |
| `coverage`                 | Analyze feature coverage of value model              |
| `relationships validate`   | Validate all relationship paths                      |
| `aim assess`               | Pre-populate assessment_report.yaml from roadmap     |
| `aim validate-assumptions` | Check assumption validation status                   |
| `aim okr-progress`         | Calculate OKR/KR achievement rates                   |
| `generators list`          | List available output generators                     |
| `generators show`          | Show generator details and wizard                    |
| `generators check`         | Check generator prerequisites                        |
| `generators scaffold`      | Create new generator from template                   |
| `version`                  | Show version                                         |

### Agent Command (v0.13.0)

Display comprehensive AI agent instructions. **AI agents should run this command first** when entering an EPF context.

```bash
# Get AI agent instructions (human-readable)
epf-cli agent

# Get AI agent instructions as JSON for programmatic use
epf-cli agent --json
```

**Output includes:**

| Section          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| Authority        | Declares epf-cli as normative EPF authority          |
| Discovery Status | Shows if EPF instance was found in current directory |
| Key Commands     | Essential commands with when to use them             |
| MCP Tools        | Key MCP tools for programmatic operations            |
| Workflow         | Recommended first steps and best practices           |

**When to use:**

- First thing when entering an EPF context
- When unsure which command or MCP tool to use
- When onboarding a new AI agent session

### Locate Command (v0.13.0)

Find EPF instances in the directory tree with confidence scoring.

```bash
# Search current directory
epf-cli locate

# Search specific path
epf-cli locate /path/to/search

# Only show instances with anchor files
epf-cli locate --require-anchor

# Search deeper (default: 5 levels)
epf-cli locate --max-depth 10

# Verbose output with issues and suggestions
epf-cli locate -v

# JSON output
epf-cli locate --json
```

**Confidence levels:**

| Level    | Meaning                                              |
| -------- | ---------------------------------------------------- |
| `high`   | Has valid anchor file (`_epf.yaml`) - definitely EPF |
| `medium` | Has EPF markers (READY/FIRE/AIM) but no anchor       |
| `low`    | Has partial EPF structure - may be incomplete        |

**Status types:**

| Status      | Meaning                     |
| ----------- | --------------------------- |
| `valid`     | Ready for use               |
| `legacy`    | Works but needs anchor file |
| `broken`    | Has issues that need fixing |
| `not-found` | No EPF instance found       |

**Output groups instances by status:**

```
VALID INSTANCES (1)
------------------------------------------------------------
  ✓  docs/EPF/_instances/emergent
       Product: Emergent
       Confidence: high

LEGACY INSTANCES (2) - need anchor file
------------------------------------------------------------
  ⚠  old-project/epf
       Confidence: medium
       Markers: READY, FIRE, _meta.yaml

SUMMARY
------------------------------------------------------------
  Total:   3
  Valid:   1
  Legacy:  2
  Broken:  0
```

### Migrate Anchor Command (v0.13.0)

Add an anchor file (`_epf.yaml`) to a legacy EPF instance.

```bash
# Migrate current directory
epf-cli migrate-anchor

# Migrate specific instance
epf-cli migrate-anchor docs/EPF/_instances/my-product

# Preview what would be created (dry run)
epf-cli migrate-anchor --dry-run

# Overwrite existing anchor file
epf-cli migrate-anchor --force

# JSON output
epf-cli migrate-anchor --json
```

**What it does:**

1. Detects if path is a valid legacy EPF instance
2. Infers metadata from existing files (`_meta.yaml`, directory structure)
3. Creates `_epf.yaml` anchor file with appropriate metadata
4. Validates the newly created anchor
5. Confirms instance is now discoverable

**Inference logic:**

| Source          | Inferred Fields                              |
| --------------- | -------------------------------------------- |
| `_meta.yaml`    | `product_name`, `epf_version`, `description` |
| Directory scan  | `structure.type` (phased vs flat)            |
| UUID generation | `instance_id`                                |
| Current time    | `created_at`                                 |

**Post-migration steps:**

1. Review the anchor file and update any inferred values
2. Run `epf-cli health` to validate the instance
3. Commit the anchor file to version control

### Anchor File Format (`_epf.yaml`)

The anchor file is the **authoritative marker** that identifies a directory as a valid EPF instance.

```yaml
# EPF Anchor File
# Do not modify instance_id or created_at after initialization.

epf_anchor: true # Required: must be true
version: '1.0.0' # Required: anchor schema version
instance_id: '550e8400-e29b-41d4-a716-446655440000' # Required: unique ID
created_at: 2024-01-15T10:30:00Z # Required: initialization time

# Optional but recommended
epf_version: '2.0.0' # EPF framework version
product_name: 'My Product' # Product name
description: 'Product description' # Brief description

structure:
  type: 'phased' # Structure type: phased or flat
  location: 'docs/epf/_instances/my-product' # Path from repo root
```

**Required fields:**

| Field         | Type      | Description                                |
| ------------- | --------- | ------------------------------------------ |
| `epf_anchor`  | boolean   | Must be `true` to identify as valid anchor |
| `version`     | string    | Anchor schema version (currently "1.0.0")  |
| `instance_id` | string    | UUID, generated once, never changes        |
| `created_at`  | timestamp | When instance was initialized              |

**Optional fields:**

| Field          | Type   | Description                                    |
| -------------- | ------ | ---------------------------------------------- |
| `epf_version`  | string | EPF framework version (for migration tracking) |
| `product_name` | string | Product name for identification                |
| `description`  | string | Brief instance description                     |
| `structure`    | object | Directory structure information                |

**Benefits of anchor files:**

- **Robust discovery**: No false positives from random "READY" directories
- **Instance identification**: Unique IDs enable tracking across migrations
- **Version tracking**: Know which EPF version instance uses
- **Migration support**: Legacy instances can be upgraded

### Legacy Instance Migration Path

For EPF instances created before the anchor file was introduced:

1. **Identify legacy instances:**

   ```bash
   epf-cli locate
   # Look for instances with "medium" confidence and "legacy" status
   ```

2. **Preview migration:**

   ```bash
   epf-cli migrate-anchor /path/to/legacy --dry-run
   ```

3. **Perform migration:**

   ```bash
   epf-cli migrate-anchor /path/to/legacy
   ```

4. **Verify migration:**

   ```bash
   epf-cli health /path/to/legacy
   epf-cli locate  # Should now show "high" confidence
   ```

5. **Commit changes:**
   ```bash
   git add /path/to/legacy/_epf.yaml
   git commit -m "Add EPF anchor file to legacy instance"
   ```

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

### Diff Template Command (v0.11.0)

Compare a file against its canonical template to identify structural differences.

```bash
epf-cli diff template <file> [flags]
  --format string   # Output format: text (default), markdown, json
  -v, --verbose     # Include extra fields (fields in file but not in template)
```

**Features:**

| Feature         | Description                                                       |
| --------------- | ----------------------------------------------------------------- |
| Type mismatches | Highlights where file has different type than template (critical) |
| Missing fields  | Shows fields present in template but missing from file            |
| Extra fields    | (verbose only) Shows fields in file not present in template       |
| Fix hints       | Actionable suggestions for how to fix each issue                  |
| Template hints  | Shows example value from template for reference                   |
| Priority levels | critical, high, medium, low for prioritizing fixes                |

**Example Output:**

```yaml
Template Diff: 01_insight_analyses.yaml
Artifact Type: insight_analyses
------------------------------------------------------------

🔴 CRITICAL (3):
  • key_insights
    Type mismatch: template has array<string>, file has array<object>
    Template: ["Major insight synthesized from trends", ...] (3 items)
    Fix: Convert array<object> to array<string>
  • target_users[0].current_state.goals
    Type mismatch: template has string, file has array<string>
    Template: "What they're trying to achieve"
    Fix: Extract single value from array or join array items into string

🟠 HIGH (5):
  • market_structure.segments[0].name
    Field 'name' exists in template but not in file
    Template: "Market Segment 1"
    Fix: Add 'name' field with string value
```

**Note:** Template diff shows structural guidance, not validation errors. Use `validate --ai-friendly` for actual schema validation errors.

### Migrate Structure Command (v0.12.0)

Migrate EPF artifacts from root-level structure to the recommended `docs/epf/` structure.

```bash
epf-cli migrate-structure [flags]
  --dry-run    # Preview changes without applying them
  -f, --force  # Overwrite existing docs/epf/ structure
```

**Why This Matters:**

The recommended EPF structure places artifacts under `docs/epf/` instead of at the repository root. This provides several benefits:

| Benefit           | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| **Separation**    | Keeps documentation separate from code                     |
| **CI/CD**         | Easier to exclude docs from build/test processes           |
| **Organization**  | Clear signal that EPF is documentation, not implementation |
| **Convention**    | Follows standard practices (docs/ is well-understood)      |
| **Tool support**  | Many tools recognize docs/ as documentation                |
| **Multi-product** | Easy to manage multiple products in `_instances/`          |

**What It Does:**

1. **Detects** root-level EPF directories: `READY/`, `FIRE/`, `AIM/`, `_meta.yaml`, `cycles/`, `outputs/`
2. **Auto-detects** product name from `_meta.yaml` or git remote
3. **Creates** target structure: `docs/epf/_instances/{product}/`
4. **Moves** all EPF artifacts to new location
5. **Creates** support files: `AGENTS.md`, `README.md`, `.gitignore` in `docs/epf/`
6. **Updates** repository `.gitignore` with EPF tracking rules

**EPF Structure Conventions:**

```
repo/
├── docs/
│   └── epf/                    # Lowercase recommended
│       ├── _instances/
│       │   └── {product}/
│       │       ├── READY/
│       │       ├── FIRE/
│       │       ├── AIM/
│       │       └── _meta.yaml
│       ├── AGENTS.md           # EPF agent instructions
│       ├── README.md           # Human-readable overview
│       └── .gitignore          # EPF-specific ignore rules
└── [code files]
```

**Usage Examples:**

```bash
# Preview what would be migrated
epf-cli migrate-structure --dry-run

# Run migration
epf-cli migrate-structure

# Verify health after migration
epf-cli health
```

**After Migration:**

1. All EPF commands will find the instance under `docs/epf/`
2. Root-level directories (`READY/`, `FIRE/`, `AIM/`) are removed
3. Git tracking is configured for the new location
4. Commit the changes:
   ```bash
   git add docs/epf/
   git commit -m "Migrate EPF to docs/epf/ structure"
   ```

**Automatic Warnings:**

If the CLI detects EPF at root level during normal operations (e.g., `health`, `validate`), it will display a warning:

```
⚠️  Warning: EPF found at root level

EPF artifacts should be under docs/epf/ for better organization.
This keeps documentation separate from code and makes it easier to
exclude from CI/CD processes.

Run: epf-cli migrate-structure
```

**Backward Compatibility:**

- ✅ The CLI still detects and works with root-level EPF
- ⚠️ But warns that it should be migrated
- ✅ `docs/EPF/` (uppercase) and `docs/epf/` (lowercase) both work
- 💡 Lowercase `docs/epf/` is preferred for consistency

### Validate Command - AI-Friendly Output (v0.10.0)

The `validate` command now supports AI-optimized output that makes it much easier for AI agents to fix validation errors.

```bash
epf-cli validate <path> [flags]
  --ai-friendly     # Structured YAML output optimized for AI agents
  --json            # Output as JSON (works with --ai-friendly)
  -v, --verbose     # Show valid files too
  -s, --schema      # Explicit schema file to validate against
```

**AI-Friendly Output Features:**

| Feature              | Description                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Field paths          | Human-readable paths like `target_users[0].problems[0].severity`                                                 |
| Error classification | `type_mismatch`, `missing_required`, `invalid_enum`, `constraint_violation`, `unknown_field`, `pattern_mismatch` |
| Priority levels      | `critical` (type mismatches), `high` (enums), `medium` (constraints), `low` (unknown fields)                     |
| Section grouping     | Errors grouped by top-level field for chunked fixing                                                             |
| Fix hints            | Actionable suggestions for each error type                                                                       |
| Suggested fix order  | Sections ordered by error severity                                                                               |
| Product context      | Product name, description, and keywords extracted from instance metadata (v0.14.0)                               |
| Template warnings    | Detects TBD, TODO, [INSERT...] placeholders even when validation passes (v0.14.0)                                |
| Semantic warnings    | Flags content that may not align with the product domain (v0.14.0)                                               |

#### Product Context in AI-Friendly Output (v0.14.0)

The `--ai-friendly` output now includes **product context** to help AI agents understand what they're validating. This prevents the catastrophic mistake of filling EPF artifacts with generic content that doesn't match the actual product.

**Context sources (in priority order):**

| Source         | Fields Extracted                             |
| -------------- | -------------------------------------------- |
| `_meta.yaml`   | `product_name`, `description`, `epf_version` |
| `README.md`    | Product name (from title), description       |
| Directory name | Product name (fallback)                      |

**Why this matters:**

- **AI agents can verify** their edits match the product domain
- **Template content** is clearly flagged (TBD, TODO, [INSERT...])
- **Semantic mismatches** are detected (e.g., road company with mission about "planning frameworks")

#### Template Warnings (v0.14.0)

Template warnings appear in `--ai-friendly` output when placeholder content is detected, **even if schema validation passes**:

```yaml
template_warnings:
  - path: north_star.purpose.statement
    placeholder: 'TBD'
    context: 'north_star.purpose.statement contains template content: TBD'
  - path: north_star.mission.what_we_do[0]
    placeholder: '[INSERT YOUR CORE ACTIVITY]'
    context: 'north_star.mission.what_we_do[0] contains template content: [INSERT YOUR CORE ACTIVITY]'
```

**Detected patterns include:**

- `TBD`, `TODO`, `FIXME`, `XXX`
- `[INSERT...]`, `[YOUR...]`, `[FILL...]`
- `Example:`, `e.g.,`
- `Your Organization`, `Product Name Here`
- Date placeholders: `YYYY-MM-DD`, `20XX`

#### Semantic Alignment Warnings (v0.14.0)

When product context is available, the validator checks if strategic content (mission, purpose, values) aligns with the product domain:

```yaml
semantic_warnings:
  - path: north_star.mission.mission_statement
    issue: 'Very low keyword overlap with product description'
    confidence: 'medium'
    suggestion: "Check if this content is relevant to 'Emergent - AI-powered knowledge management'. Consider revising to better reflect the product's purpose."
```

**Confidence levels:**

| Level    | Meaning                                                |
| -------- | ------------------------------------------------------ |
| `high`   | Strong mismatch detected (e.g., wrong domain keywords) |
| `medium` | Possible mismatch (low keyword overlap)                |
| `low`    | Minor concern                                          |

**Example AI-Friendly Output:**

```yaml
file: /path/to/file.yaml
artifact_type: insight_analyses
valid: false
error_count: 64
product_context:
    product_name: "Veilag"
    description: "Norwegian private road cost allocation platform"
    keywords: ["veilag", "road", "cost", "allocation", "norwegian", "private"]
    source: "_meta.yaml"
template_warnings:
    - path: target_users[0].description
      placeholder: "TBD"
      context: "target_users[0].description contains template content: TBD"
semantic_warnings:
    - path: key_insights[0]
      issue: "Very low keyword overlap with product description"
      confidence: "medium"
      suggestion: "Check if this content is relevant to 'Veilag'. Consider revising to better reflect road cost allocation."
errors_by_section:
    - section: target_users
      error_count: 20
      errors:
        - path: target_users[0].problems[0].severity
          error_type: invalid_enum
          priority: high
          message: value must be one of "critical", "high", "medium", "low"
          fix_hint: Use one of the allowed values: critical, high, medium, low
        - path: target_users[0].problems[0].workarounds
          error_type: type_mismatch
          priority: critical
          message: Type mismatch: expected array, got string
          details:
            expected_type: array
            actual_type: string
          fix_hint: Convert string to array format with - item syntax
summary:
    critical_count: 10
    high_count: 15
    medium_count: 30
    low_count: 9
    affected_sections:
        - target_users
        - key_insights
    suggested_fix_order:
        - target_users
        - key_insights
```

**Recommended AI Agent Workflow:**

1. Run `epf-cli validate <file> --ai-friendly` to get structured errors
2. **Check `product_context`** - understand what product you're working on
3. **Review `template_warnings`** - replace any TBD/TODO placeholders with real content
4. **Review `semantic_warnings`** - ensure content aligns with the product domain
5. Process errors section by section (start with `suggested_fix_order[0]`)
6. Focus on `critical` and `high` priority errors first
7. Use `fix_hint` for guidance on each error
8. Re-validate after each section fix to verify progress

> **CRITICAL**: Always verify your edits match the `product_context`. If you're editing Veilag artifacts, content should be about road cost allocation, not generic "planning frameworks".

### Validate Command - Fix Plan Output (v0.11.0)

For files with many errors, the `--fix-plan` flag generates a chunked fix plan that AI agents can process incrementally without overwhelming their context window.

```bash
epf-cli validate <path> [flags]
  --fix-plan        # Generate chunked fix plan for AI agents
  --json            # Output as JSON (works with --fix-plan)
```

**Fix Plan Features:**

| Feature           | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| Chunked errors    | Errors grouped into ~10-error chunks for manageable processing |
| Chunk priorities  | `urgent` (critical errors), `normal` (high/medium), `low`      |
| Fix strategies    | Per-chunk guidance on how to approach the errors               |
| Context estimates | Estimated character count per chunk for AI context management  |
| Time estimates    | Rough time estimate for fixing all chunks (~2 min/chunk)       |
| Recommended order | Chunks ordered by priority for optimal fixing sequence         |
| Template examples | Section-specific YAML examples from canonical templates        |

**Chunk Sizing Recommendations:**

The fix plan generator uses these defaults optimized for AI agent context windows:

| Setting                  | Default | Recommendation                                                        |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `MaxErrorsPerChunk`      | 10      | Keep at 10 for most models; reduce to 5-7 for smaller context windows |
| `MaxCharsPerChunk`       | 6000    | ~1500 tokens; safe for 8K+ context models                             |
| Estimated time per chunk | ~2 min  | Accounts for reading, editing, and re-validation                      |

**Why these defaults:**

- **10 errors/chunk**: Allows AI to hold all error context + file context + response space
- **6000 chars/chunk**: Leaves room for the file content being edited (~4K chars) and model response
- **Section grouping**: Errors in the same section share context, reducing redundant information

**Example Fix Plan Output:**

```yaml
file: /path/to/file.yaml
artifact_type: insight_analyses
total_errors: 64
total_chunks: 15
estimated_time: 30 minutes
chunks:
  - id: chunk-1
    section: target_users
    priority: urgent
    error_count: 10
    estimated_size: 2500
    description: Fix 10 type mismatches in 'target_users'
    errors:
      - path: target_users[0].problems
        error_type: type_mismatch
        priority: critical
        message: expected array, but got string
        fix_hint: Convert string to array format with - item syntax
    fix_strategy: For each error, convert the value to the expected type...
summary:
  urgent_chunks: 10
  normal_chunks: 5
  low_chunks: 0
  recommended_order:
    - chunk-1
    - chunk-2
    - chunk-3
```

**Recommended AI Agent Workflow with Fix Plan:**

1. Run `epf-cli validate <file> --fix-plan` to get chunked plan
2. Process chunks in `recommended_order` sequence
3. For each chunk:
   - Read the `fix_strategy` for approach guidance
   - Fix all errors in the chunk
   - Re-validate to confirm fixes
4. Move to next chunk
5. Repeat until all chunks are processed

### Comprehensive Guide: Fixing Validation Errors (v0.11.0)

This guide provides a complete workflow for AI agents to systematically fix EPF validation errors.

#### Step 1: Initial Assessment

**Choose the right output format based on error count:**

| Error Count  | Recommended Approach                                  |
| ------------ | ----------------------------------------------------- |
| 1-10 errors  | Use `--ai-friendly` for direct fixing                 |
| 11-50 errors | Use `--fix-plan` for chunked processing               |
| 50+ errors   | Use `--fix-plan` + `--section` for incremental fixing |

```bash
# Quick assessment
epf-cli validate file.yaml --ai-friendly --json | jq '.error_count'

# If high error count, get fix plan
epf-cli validate file.yaml --fix-plan
```

#### Step 2: Understand Error Types

Prioritize fixes by error type:

| Priority    | Error Type             | Description                       | Fix Strategy                                |
| ----------- | ---------------------- | --------------------------------- | ------------------------------------------- |
| 🔴 critical | `type_mismatch`        | Wrong data type (string vs array) | Convert to correct type structure           |
| 🟠 high     | `invalid_enum`         | Value not in allowed list         | Use one of the allowed values               |
| 🟠 high     | `missing_required`     | Required field is missing         | Add the field with appropriate value        |
| 🟡 medium   | `constraint_violation` | Value doesn't meet constraints    | Adjust value (e.g., add more text)          |
| 🟡 medium   | `pattern_mismatch`     | Value doesn't match regex         | Fix format (e.g., `fd-001` not `feature-1`) |
| 🔵 low      | `unknown_field`        | Extra field not in schema         | Remove or rename the field                  |

#### Step 3: Use Template Examples

When fixing errors, get template examples for the correct structure:

```bash
# Via CLI - get section example
epf-cli diff template file.yaml --format json | jq '.issues[] | select(.path | startswith("target_users"))'

# Via MCP tool
epf_get_section_example { "artifact_type": "insight_analyses", "section": "target_users" }
```

The fix plan now includes `example` fields showing correct YAML structure for each section.

#### Step 4: Fix Errors Systematically

**For small error counts (--ai-friendly):**

1. Group errors by section from `errors_by_section`
2. Start with `suggested_fix_order[0]`
3. Fix all errors in that section
4. Re-validate: `epf-cli validate file.yaml --section <section> --ai-friendly`
5. Move to next section

**For large error counts (--fix-plan):**

1. Process chunks in `recommended_order`
2. For each chunk:
   ```yaml
   # Read chunk details
   chunk.section: target_users
   chunk.priority: urgent
   chunk.fix_strategy: 'For each error, convert the value...'
   chunk.example: | # Template example for this section
     target_users:
       - name: "Target User 1"
         problems:
           - description: "Problem description"
   ```
3. Apply fixes following `fix_strategy` and `example`
4. Validate the section: `epf-cli validate file.yaml --section target_users`
5. Move to next chunk

#### Step 5: Common Fix Patterns

**Type Mismatch: String → Array**

```yaml
# WRONG
workarounds: "Use manual process"

# CORRECT
workarounds:
  - "Use manual process"
  - "Hire consultants"
```

**Type Mismatch: Array → String**

```yaml
# WRONG
description:
  - "First paragraph"
  - "Second paragraph"

# CORRECT
description: |
  First paragraph
  Second paragraph
```

**Invalid Enum**

```yaml
# WRONG (check fix_hint for valid values)
severity: "very_high"

# CORRECT
severity: "critical"  # Must be: critical, high, medium, low
```

**Pattern Mismatch**

```yaml
# WRONG
id: "feature-001"

# CORRECT (pattern: ^fd-[0-9]+$)
id: "fd-001"
```

**Constraint Violation (minLength)**

```yaml
# WRONG (minLength: 200)
current_situation: "They struggle with X"

# CORRECT (expand to 200+ characters)
current_situation: |
  They struggle with X on a daily basis. This affects their productivity
  significantly because they need to manually perform tasks that could be
  automated. The current workarounds are time-consuming and error-prone,
  leading to frustration and missed opportunities.
```

#### Step 6: Verify and Iterate

After fixing each section or chunk:

```bash
# Quick validation of specific section
epf-cli validate file.yaml --section <section> --ai-friendly

# Full validation to check remaining errors
epf-cli validate file.yaml --ai-friendly --json | jq '.error_count'

# When error count is 0
epf-cli validate file.yaml  # Should show "Valid"
```

#### MCP Tool Workflow

For AI agents using MCP tools:

```
1. epf_validate_with_plan { "path": "file.yaml" }
   → Get chunked fix plan with examples

2. For each chunk:
   a. Read chunk.errors, chunk.fix_strategy, chunk.example
   b. Apply fixes to file
   c. epf_validate_section { "path": "file.yaml", "section": "<section>" }
   d. Repeat until section is valid

3. epf_validate_file { "path": "file.yaml", "ai_friendly": true }
   → Final validation
```

### Health Check Components

The `health` command runs these checks:

1. **Instance Structure** (`checks/instance.go`)

   - READY/FIRE/AIM directory presence
   - Required files in each phase
   - \_meta.yaml validation
   - **Living Reality Assessment** (AIM/living_reality_assessment.yaml)
   - **Structure Location** (docs/epf/ vs root level)
   - Framework separation (no schemas/, wizards/ in instance)

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

## MCP Tools (v0.14.0)

The server exposes these tools (49 tools total):

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

### Relationship Maintenance Tools (v0.10.0)

These tools enable AI agents to maintain EPF relationships, not just query them:

| Tool                               | Parameters                                                                                 | Description                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| `epf_add_implementation_reference` | `feature_id`, `instance_path`, `ref_type`, `title`, `url`, `status`?, `description`?       | Link features to PRs, specs, code   |
| `epf_update_capability_maturity`   | `feature_id`, `instance_path`, `capability_id`, `maturity`, `evidence`, `delivered_by_kr`? | Track capability delivery progress  |
| `epf_add_mapping_artifact`         | `instance_path`, `sub_component_id`, `artifact_type`, `url`, `description`                 | Add code artifacts to mappings.yaml |
| `epf_suggest_relationships`        | `instance_path`, `artifact_type`, `artifact_path`, `include_code_analysis`?                | AI-assisted relationship discovery  |

**Use cases:**

- **`epf_add_implementation_reference`**: After merging a PR, link it to the feature it implements. Ref types: `spec`, `issue`, `pr`, `code`, `documentation`, `test`
- **`epf_update_capability_maturity`**: When a capability moves from hypothetical → emerging → proven → scaled, record evidence
- **`epf_add_mapping_artifact`**: Register code files/modules that implement value model components in mappings.yaml
- **`epf_suggest_relationships`**: Analyze code files or PRs to suggest which features/capabilities they relate to

**Typical workflow:**

```
1. Developer merges PR #123 implementing knowledge graph extraction
2. AI agent calls epf_suggest_relationships to analyze the PR
3. Tool suggests: "This PR likely relates to fd-012 Knowledge Exploration Engine, cap-003"
4. AI agent calls epf_add_implementation_reference to link PR to feature
5. AI agent calls epf_update_capability_maturity if capability maturity changed
6. AI agent calls epf_add_mapping_artifact to register new code paths
```

**Parameter details:**

| Parameter                 | Values                                                 |
| ------------------------- | ------------------------------------------------------ |
| `ref_type`                | `spec`, `issue`, `pr`, `code`, `documentation`, `test` |
| `status`                  | `current` (default), `deprecated`, `superseded`        |
| `maturity`                | `hypothetical`, `emerging`, `proven`, `scaled`         |
| `artifact_type` (mapping) | `code`, `design`, `documentation`, `test`              |
| `artifact_type` (suggest) | `feature`, `code_file`, `pr`                           |

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

### AI Agent Discovery Tools (v0.13.0)

These tools help AI agents discover EPF instances and get guidance:

| Tool                     | Parameters                                  | Description                                |
| ------------------------ | ------------------------------------------- | ------------------------------------------ |
| `epf_agent_instructions` | `path` (optional)                           | Get comprehensive AI agent instructions    |
| `epf_locate_instance`    | `path`, `max_depth`, `require_anchor` (opt) | Find EPF instances with confidence scoring |

**Use cases:**

- **`epf_agent_instructions`**: AI agents should call this first when entering an EPF context. Returns authority declaration, discovery status, key commands, MCP tools, and workflow guidance.
- **`epf_locate_instance`**: Find EPF instances in a directory tree with confidence scoring. Returns instances grouped by status (valid, legacy, broken) with suggestions for fixing issues.

**Confidence levels for instance discovery:**

| Level    | Meaning                                              |
| -------- | ---------------------------------------------------- |
| `high`   | Has valid anchor file (`_epf.yaml`) - definitely EPF |
| `medium` | Has EPF markers (READY/FIRE/AIM) but no anchor       |
| `low`    | Has partial EPF structure - may be incomplete        |

**Typical AI agent workflow:**

```
1. Call epf_agent_instructions to understand available tools and detect local instance
2. If no instance found, call epf_locate_instance to search deeper
3. Call epf_health_check on discovered instance
4. Proceed with task using appropriate MCP tools
```

### Instance Management Tools (v0.14.0)

These tools enable AI agents to initialize and fix EPF instances:

| Tool                | Parameters                                              | Description                              |
| ------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `epf_init_instance` | `path`, `product_name`, `epf_version`, `structure_type` | Initialize a new EPF instance            |
| `epf_fix_file`      | `path`, `fix_types`, `dry_run`                          | Auto-fix common issues in EPF YAML files |

**Use cases:**

- **`epf_init_instance`**: Create a new EPF instance with proper structure (READY/FIRE/AIM directories, anchor file, templates)
- **`epf_fix_file`**: Fix common issues like trailing whitespace, CRLF line endings, tabs, missing trailing newlines, and missing meta.epf_version

**Fix types:**

| Fix Type       | Description                               |
| -------------- | ----------------------------------------- |
| `whitespace`   | Remove trailing whitespace from lines     |
| `line_endings` | Convert CRLF to LF                        |
| `tabs`         | Convert tabs to spaces                    |
| `newlines`     | Ensure single trailing newline            |
| `versions`     | Add missing meta.epf_version              |
| `all`          | Apply all fixes (default when none given) |

### AIM Phase Tools (v0.14.0)

These tools support the Assessment & Calibration phase:

| Tool                           | Parameters                                         | Description                                            |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------ |
| `epf_aim_bootstrap`            | `instance_path`, `organization_type`, `team_size`+ | Create Living Reality Assessment non-interactively     |
| `epf_aim_status`               | `instance_path`                                    | Get comprehensive LRA status summary                   |
| `epf_aim_assess`               | `instance_path`, `roadmap_id`                      | Generate assessment report template from roadmap       |
| `epf_aim_validate_assumptions` | `instance_path`, `verbose`                         | Check assumption validation status from assessments    |
| `epf_aim_okr_progress`         | `instance_path`, `track`, `cycle`, `all_cycles`    | Calculate OKR and KR achievement rates from assessment |

**Use cases:**

- **`epf_aim_bootstrap`**: Create a Living Reality Assessment (LRA) for a new instance. Pass organizational context (org type, team size, funding stage, product stage, bottleneck, AI capability level)
- **`epf_aim_status`**: Get a summary of the current LRA including lifecycle stage, adoption level, track maturity, and warnings
- **`epf_aim_assess`**: Pre-populate an assessment_report.yaml template with OKRs and KRs from the roadmap
- **`epf_aim_validate_assumptions`**: Cross-reference assumptions from roadmap with evidence from assessments
- **`epf_aim_okr_progress`**: Calculate achievement rates (exceeded+met/total) by track and cycle

**AIM bootstrap parameters:**

| Parameter             | Values                                                          |
| --------------------- | --------------------------------------------------------------- |
| `organization_type`   | `solo_founder`, `cofounding_team`, `early_team`, `growth_team`  |
| `funding_stage`       | `bootstrapped`, `pre_seed`, `seed`, `series_a`, `series_b_plus` |
| `product_stage`       | `idea`, `prototype`, `mvp`, `growth`, `mature`                  |
| `primary_bottleneck`  | `execution`, `clarity`, `validation`, `funding`                 |
| `ai_capability_level` | `none`, `basic`, `intermediate`, `advanced`                     |

### Report & Diff Tools (v0.14.0)

These tools generate reports and compare EPF artifacts:

| Tool                  | Parameters                           | Description                                 |
| --------------------- | ------------------------------------ | ------------------------------------------- |
| `epf_generate_report` | `instance_path`, `format`, `verbose` | Generate comprehensive health report        |
| `epf_diff_artifacts`  | `path1`, `path2`, `verbose`          | Compare two EPF artifacts or directories    |
| `epf_diff_template`   | `file_path`, `verbose`               | Compare file against its canonical template |

**Use cases:**

- **`epf_generate_report`**: Run all health checks and compile results into markdown, HTML, or JSON format. Does not write to file.
- **`epf_diff_artifacts`**: Compare two files or directories to see structural differences (added, removed, modified fields)
- **`epf_diff_template`**: Auto-detect artifact type and compare against canonical template. Returns fix hints and priorities for each issue.

**Report formats:**

| Format     | Description                                   |
| ---------- | --------------------------------------------- |
| `markdown` | Human-readable markdown with tables (default) |
| `html`     | Self-contained HTML report                    |
| `json`     | Structured JSON for programmatic processing   |

### Strategy Query Tools (v0.16.0)

These tools provide read-only access to EPF product strategy for AI agents. They enable context-aware development by exposing vision, personas, competitive positioning, and roadmap data.

| Tool                               | Parameters                                   | Description                                    |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `epf_get_product_vision`           | `instance_path`                              | Get vision, mission, and north star            |
| `epf_get_personas`                 | `instance_path`                              | List all personas with summaries               |
| `epf_get_persona_details`          | `instance_path`, `persona_id`                | Get full persona details including pain points |
| `epf_get_value_propositions`       | `instance_path`, `persona_id` (optional)     | Get value propositions, optionally by persona  |
| `epf_get_competitive_position`     | `instance_path`                              | Get competitive analysis and positioning       |
| `epf_get_roadmap_summary`          | `instance_path`, `track` (optional)          | Get OKRs and key results, optionally by track  |
| `epf_search_strategy`              | `instance_path`, `query`, `limit` (optional) | Full-text search across all strategy artifacts |
| `epf_get_feature_strategy_context` | `instance_path`, `feature_id`                | Get strategic context for a specific feature   |

**Use cases:**

- **`epf_get_product_vision`**: Understand the product's purpose before writing code. Returns vision statement, mission, and north star metrics.
- **`epf_get_personas`**: Get an overview of target users. Returns list with id, name, role, and key characteristics.
- **`epf_get_persona_details`**: Deep dive into a specific persona's needs, pain points, and goals. Use the `persona_id` from `epf_get_personas`.
- **`epf_get_value_propositions`**: Understand what value the product delivers. Filter by persona to see targeted propositions.
- **`epf_get_competitive_position`**: Review competitive landscape, differentiators, and market positioning before feature design.
- **`epf_get_roadmap_summary`**: See current OKRs and key results. Filter by track (e.g., "Product", "Strategy") for focused view.
- **`epf_search_strategy`**: Find strategy content by keyword. Returns ranked results with snippets showing match context.
- **`epf_get_feature_strategy_context`**: Get complete strategic context for a feature including related personas, value props, and OKRs.

**Example workflows:**

```bash
# Before implementing a feature, understand the strategic context
epf_get_feature_strategy_context instance_path="./epf" feature_id="FD-001"

# When writing user-facing copy, understand the target persona
epf_get_persona_details instance_path="./epf" persona_id="alex-startup-founder"

# When designing competitive features, review positioning
epf_get_competitive_position instance_path="./epf"

# Search for strategy content related to a topic
epf_search_strategy instance_path="./epf" query="AI integration" limit=5
```

**Response formats:**

All strategy tools return JSON with consistent structure:

```json
{
  "success": true,
  "data": {
    /* tool-specific data */
  },
  "metadata": {
    "instance_path": "./epf",
    "loaded_at": "2024-01-15T10:30:00Z"
  }
}
```

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

### Strategy Commands (v0.16.0)

Commands for accessing EPF product strategy. These commands provide read-only access to strategy artifacts for AI agents and human users.

#### `epf-cli strategy serve <instance-path>`

Start the MCP server with strategy query tools enabled.

```bash
# Start MCP server with strategy tools
epf-cli strategy serve ./epf

# With file watching for auto-reload (when files change)
epf-cli strategy serve ./epf --watch

# Output (to stderr, stdout is MCP JSON-RPC):
# Strategy store loaded: 13 features, 8 OKRs, 25 key results
# MCP server ready on stdio
```

This command starts the full MCP server (same as `epf serve`) with the strategy store pre-loaded from the specified instance path. All strategy query tools (`epf_get_product_vision`, `epf_search_strategy`, etc.) become available.

#### `epf-cli strategy status <instance-path>`

Show the current state of the strategy store.

```bash
# Basic status
epf-cli strategy status ./epf

# Output:
# Strategy Store Status
# =====================
# Status: healthy
# Instance: ./epf
# Load time: 22ms
#
# Artifacts:
#   Features: 13
#   OKRs: 8
#   Key Results: 25
#   Personas: 3
#   Value Propositions: 4
#   Competitors: 2

# Verbose output with details
epf-cli strategy status ./epf --verbose

# JSON output for programmatic use
epf-cli strategy status ./epf --json
```

Use this to verify the strategy store loaded correctly and see artifact counts.

#### `epf-cli strategy export <instance-path>`

Generate a comprehensive markdown document of the product strategy.

```bash
# Export to stdout
epf-cli strategy export ./epf

# Export to file
epf-cli strategy export ./epf --output strategy.md

# JSON output
epf-cli strategy export ./epf --json

# Output includes:
# - Product Vision & Mission
# - North Star Metrics
# - Target Personas with Pain Points
# - Value Propositions
# - Competitive Positioning
# - Current Roadmap (OKRs by Track)
# - Feature Summary
```

This is useful for sharing strategy context with stakeholders or archiving strategy snapshots.

**Flags:**

| Flag        | Description                            |
| ----------- | -------------------------------------- |
| `--watch`   | Enable file watching for auto-reload   |
| `--verbose` | Show detailed information              |
| `--json`    | Output in JSON format                  |
| `--output`  | Write output to file instead of stdout |

### AIM Commands (v0.11.0)

Tools for the AIM (Assessment & Calibration) phase of EPF. These commands help you learn from execution and calibrate strategy based on evidence.

**⚠️ IMPORTANT: Living Reality Assessment Required**

All AIM commands now require a Living Reality Assessment (LRA) to exist. The LRA is the foundational baseline that captures your organizational context, track maturity, and current focus. If your instance doesn't have an LRA:

- **New instances**: Run `epf-cli aim bootstrap` to create your baseline interactively
- **Legacy instances**: Run `epf-cli aim migrate-baseline` to infer baseline from existing artifacts

#### `epf-cli aim bootstrap`

Create your initial Living Reality Assessment through an interactive wizard.

```bash
# Interactive wizard (adapts to your adoption level)
epf-cli aim bootstrap

# Force overwrite existing LRA
epf-cli aim bootstrap --force

# Skip adoption level detection
epf-cli aim bootstrap --level 2

# Non-interactive mode (use defaults)
epf-cli aim bootstrap --non-interactive
```

**What it does:**

The bootstrap wizard adapts its questions based on your adoption level:

| Adoption Level | Team Size  | Duration  | Questions                     |
| -------------- | ---------- | --------- | ----------------------------- |
| Level 0        | 1-2 people | 5-10 min  | 7 core questions              |
| Level 1        | 3-5 people | 10-15 min | 12 questions                  |
| Level 2+       | 6+ people  | 20-30 min | Comprehensive track baselines |

**Questions cover:**

- Team size and organizational context
- Product stage (idea/prototype/mvp/growth/mature)
- Funding stage and runway
- Primary bottleneck (execution/clarity/validation/funding)
- Existing assets (code, customers, documentation)
- Track maturity baselines (Product, Strategy, OrgOps, Commercial)
- Current focus and objectives

**Output:**

Creates `AIM/living_reality_assessment.yaml` with:

- Metadata (lifecycle stage, adoption level, cycles completed)
- Adoption context (org type, team size, funding)
- Track baselines with maturity levels
- Existing assets inventory
- Current focus and attention allocation
- Evolution log entry

#### `epf-cli aim status`

Show comprehensive summary of your current Living Reality Assessment.

```bash
# Show LRA summary
epf-cli aim status

# JSON output
epf-cli aim status --json
```

**What it displays:**

- **Lifecycle Stage**: bootstrap → maturing → evolved
- **Adoption Level**: 0-3 (complexity of EPF usage)
- **Organizational Context**:
  - Organization type, team size, funding stage
  - AI capability level, primary bottleneck
  - Runway months (if applicable)
- **Track Maturity Baselines**:
  - Visual progress bars for each track
  - Maturity level: absent → implicit → explicit → measured → optimized
  - Status: not_applicable → not_started → emerging → established → mature
- **Existing Assets**: Code, documentation, customers
- **Current Focus**: Cycle, primary objective, attention allocation
- **Hard Constraints**: Non-negotiable limitations
- **Warnings**: Low maturity, low runway, unbalanced attention

**Use cases:**

- Quick health check of your baseline
- Before planning a new cycle
- When onboarding team members
- Before/after major pivots

#### `epf-cli aim migrate-baseline`

Migrate legacy EPF instances that don't have a Living Reality Assessment.

```bash
# Migrate with inference
epf-cli aim migrate-baseline

# Preview what would be created
epf-cli aim migrate-baseline --dry-run

# Force overwrite existing LRA
epf-cli aim migrate-baseline --force
```

**What it does:**

1. **Reads \_meta.yaml** for adoption level and cycles completed
2. **Infers organizational context** from existing artifacts
3. **Generates track baselines** based on cycles completed
4. **Checks for existing assets** (code, documentation, customers)
5. **Creates LRA** with sensible defaults
6. **Adds evolution log entry** noting migration

**Inference logic:**

| Source             | Inferred Fields                                                 |
| ------------------ | --------------------------------------------------------------- |
| `_meta.yaml`       | `adoption_level`, `cycles_completed`                            |
| Cycles completed   | `lifecycle_stage` (0 = bootstrap, 1-3 = maturing, 4+ = evolved) |
| Cycles completed   | Track `maturity` (0 = implicit, 1-2 = explicit, 3+ = measured)  |
| `.git` directory   | Code assets exist                                               |
| `READY/` directory | Documentation assets exist                                      |

**⚠️ Important:**

The migration uses defaults for many fields. After migration, you should:

1. Review: `epf-cli aim status`
2. Edit: `AIM/living_reality_assessment.yaml`
3. Refine: Organizational context, track baselines, constraints

#### `epf-cli aim assess [roadmap-id]`

Pre-populate an assessment_report.yaml template from roadmap data.

```bash
# Generate assessment report template
epf-cli aim assess

# Specify roadmap ID explicitly
epf-cli aim assess roadmap-mvp-launch-q1

# JSON output
epf-cli aim assess --json

# Verbose output with full YAML
epf-cli aim assess --verbose
```

**What it does:**

- Loads your `05_roadmap_recipe.yaml`
- Extracts all OKRs and Key Results across all 4 tracks
- Generates `assessment_report.yaml` template with:
  - All OKR IDs and Key Results
  - Target values from roadmap
  - TODO placeholders for actuals, status, evidence
  - Assumption references for validation tracking

**Output includes:**

- OKR count by track (Product, Strategy, OrgOps, Commercial)
- Assumptions to validate
- Next steps guidance
- Optional: Full YAML output (with `--verbose`)

#### `epf-cli aim validate-assumptions`

Check assumption validation status from assessment reports.

```bash
# Show assumption validation status
epf-cli aim validate-assumptions

# Detailed evidence for each assumption
epf-cli aim validate-assumptions --verbose

# JSON output
epf-cli aim validate-assumptions --json
```

**What it does:**

- Loads assumptions from `05_roadmap_recipe.yaml`
- Loads validation evidence from `AIM/assessment_report.yaml`
- Cross-references and categorizes assumptions as:
  - ✅ **Validated**: Supporting evidence confirms assumption
  - ❌ **Invalidated**: Evidence contradicts assumption
  - ⚠️ **Inconclusive**: Insufficient or mixed evidence
  - ⏳ **Pending**: Not yet tested

**Output includes:**

- Summary counts and percentages
- Breakdown by track
- Detailed evidence (with `--verbose`)

**Typical workflow:**

1. Run `epf-cli aim assess` to generate assessment template
2. Fill in assessment with actual data and assumption evidence
3. Run `epf-cli aim validate-assumptions` to see validation status
4. Use results to inform calibration decisions (persevere/pivot/pull-the-plug)

#### `epf-cli aim okr-progress`

Calculate OKR and Key Result achievement rates from assessments.

```bash
# Show overall progress
epf-cli aim okr-progress

# Filter by specific cycle
epf-cli aim okr-progress --cycle 1

# Show all cycles for trend analysis
epf-cli aim okr-progress --all-cycles

# Filter by track
epf-cli aim okr-progress --track product
epf-cli aim okr-progress --track strategy --cycle 2

# Detailed breakdown
epf-cli aim okr-progress --verbose

# JSON output
epf-cli aim okr-progress --json
```

**What it does:**

- Loads assessment reports from `AIM/` directory
- Calculates KR achievement rates by status:
  - ✅ **Exceeded**: Surpassed target
  - ✅ **Met**: Achieved target
  - ⚠️ **Partially Met**: Made progress but fell short
  - ❌ **Missed**: Little or no progress
- Computes achievement rate: `(exceeded + met) / total * 100`

**Output includes:**

- Overall achievement rate
- Breakdown by status (exceeded/met/partially_met/missed)
- Breakdown by track (if not filtered)
- Trend analysis across cycles (with `--all-cycles`)
- Detailed OKR and KR status (with `--verbose`)
- Strategic insights based on achievement rate

**Typical workflow:**

1. Complete assessment report with KR statuses
2. Run `epf-cli aim okr-progress` to see achievement rates
3. Use `--track` to drill into specific tracks
4. Use `--all-cycles` to see progress over time
5. Use insights to calibrate strategy for next cycle

**Achievement Rate Guidance:**

- **≥80%**: Strong execution - strategy is working
- **60-79%**: Moderate - some refinement needed
- **40-59%**: Below target - review strategy and capacity
- **<40%**: Low achievement - consider pivot or scope reduction

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
