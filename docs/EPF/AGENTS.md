# AGENTS.md - AI Agent Instructions for EPF

> **This file is for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.)**
> Read this FIRST before performing any EPF operations.

## Mandatory Protocols

**Every EPF interaction MUST follow these protocols:**

### 1. Wizard-First (MANDATORY)

Before creating, modifying, or evaluating any EPF artifact or instance:

1. `epf_get_wizard_for_task` -- find the right wizard for your task
2. `epf_get_wizard` -- retrieve wizard instructions
3. Follow the wizard to produce the artifact
4. `epf_validate_file` -- validate the result

### 2. Strategy-Context (MANDATORY for feature/roadmap work)

Before feature work, roadmap changes, or competitive decisions:

| Need | Tool |
|------|------|
| Product direction | `epf_get_product_vision` |
| Target users | `epf_get_personas` / `epf_get_persona_details` |
| Competitive landscape | `epf_get_competitive_position` |
| Current priorities | `epf_get_roadmap_summary` |
| Search strategy | `epf_search_strategy` |
| Feature context | `epf_get_feature_strategy_context` |

### 3. Validate-Always (MANDATORY)

After ANY change to an EPF YAML file: `epf_validate_file({ path: "<file>" })`

## Quick Start

This repository uses **epf-cli** for all EPF operations. The canonical EPF framework (schemas, templates, wizards, generators, definitions) is loaded from a central location, not stored in this repo.

### MCP Server Configuration

The epf-cli exposes **65+ MCP tools** across two server modes:

| Mode | Command | Purpose |
|------|---------|---------|
| `epf serve` | Generic EPF tools | Validation, wizards, generators, health |
| `strategy serve <path>` | Strategy-aware EPF tools | All of the above + `instance_path` defaults to the given path |

When using `strategy serve`, all tools that accept `instance_path` will default to the configured instance, so you don't need to pass it explicitly.

### MCP Tools Available

| Category | Tools |
|----------|-------|
| **Schemas** | `epf_list_schemas`, `epf_get_schema`, `epf_validate_file`, `epf_validate_content`, `epf_detect_artifact_type`, `epf_get_phase_artifacts` |
| **Templates** | `epf_get_template`, `epf_list_artifacts` |
| **Definitions** | `epf_list_definitions`, `epf_get_definition` |
| **Wizards** | `epf_list_wizards`, `epf_get_wizard`, `epf_get_wizard_for_task`, `epf_list_agent_instructions`, `epf_get_agent_instructions` |
| **Generators** | `epf_list_generators`, `epf_get_generator`, `epf_check_generator_prereqs`, `epf_validate_generator_output`, `epf_scaffold_generator` |
| **Health** | `epf_health_check`, `epf_check_instance`, `epf_check_content_readiness`, `epf_check_feature_quality` |
| **Relationships** | `epf_validate_relationships`, `epf_explain_value_path`, `epf_get_strategic_context`, `epf_analyze_coverage`, `epf_suggest_relationships` |
| **Maintenance** | `epf_add_implementation_reference`, `epf_update_capability_maturity`, `epf_add_mapping_artifact` |
| **Strategy** | `epf_get_product_vision`, `epf_get_personas`, `epf_get_persona_details`, `epf_get_value_propositions`, `epf_get_competitive_position`, `epf_get_roadmap_summary`, `epf_search_strategy`, `epf_get_feature_strategy_context` |
| **AIM** | `epf_aim_bootstrap`, `epf_aim_status`, `epf_aim_assess`, `epf_aim_validate_assumptions`, `epf_aim_okr_progress`, `epf_aim_health`, `epf_aim_init_cycle`, `epf_aim_archive_cycle`, `epf_aim_update_lra`, `epf_aim_generate_src`, `epf_aim_recalibrate`, `epf_aim_write_assessment`, `epf_aim_write_calibration`, `epf_aim_write_src` |
| **Reports** | `epf_generate_report`, `epf_diff_artifacts`, `epf_diff_template` |
| **Discovery** | `epf_agent_instructions`, `epf_locate_instance` |
| **Instance** | `epf_init_instance`, `epf_fix_file`, `epf_check_migration_status`, `epf_get_migration_guide` |
| **Validation** | `epf_validate_section`, `epf_validate_with_plan`, `epf_validate_relationships`, `epf_check_feature_quality`, `epf_get_section_example` |

## Common Operations

### Validate an Artifact

```bash
epf-cli validate docs/EPF/_instances/emergent/READY/00_north_star.yaml
```

Or via MCP: `epf_validate_file({ path: "docs/EPF/_instances/emergent/READY/00_north_star.yaml" })`

### Run Health Check

```bash
epf-cli health docs/EPF/_instances/emergent
```

Or via MCP: `epf_health_check({ instance_path: "docs/EPF/_instances/emergent" })`

### Get a Template

```bash
epf-cli templates get feature_definition
```

Or via MCP: `epf_get_template({ artifact_type: "feature_definition" })`

### Get a Wizard

```bash
epf-cli wizards show feature_definition
```

Or via MCP: `epf_get_wizard({ name: "feature_definition" })`

### List Available Schemas

```bash
epf-cli schemas list
```

Or via MCP: `epf_list_schemas()`

## Instance Structure

The EPF instance at `_instances/emergent/` is a **git submodule** pointing to
`emergent-company/emergent-epf`. If the directory is empty after cloning, run:

```bash
git submodule update --init
```

Structure:

```
docs/EPF/
├── _instances/emergent/          # Instance data
│   ├── READY/                    # Strategic foundation artifacts
│   │   ├── 00_north_star.yaml
│   │   ├── 01_insight_analyses.yaml
│   │   ├── 02_strategy_foundations.yaml
│   │   ├── 03_insight_opportunity.yaml
│   │   ├── 04_strategy_formula.yaml
│   │   └── 05_roadmap_recipe.yaml
│   ├── FIRE/                     # Execution artifacts
│   │   ├── value_models/
│   │   ├── feature_definitions/
│   │   └── mappings.yaml
│   ├── AIM/                      # Assessment artifacts
│   │   └── living_reality_assessment.yaml
│   └── outputs/                  # Generated documents
├── AGENTS.md                     # This file
└── README.md                     # Quick reference
```

## Working with EPF Artifacts

### Creating New Artifacts (Wizard-First)

1. Find the wizard: `epf_get_wizard_for_task({ task: "create a feature definition" })`
2. Get the wizard: `epf_get_wizard({ name: "feature_definition" })`
3. Follow wizard instructions to produce the artifact
4. Validate: `epf_validate_file({ path: "<new_file_path>" })`

### Updating Existing Artifacts

1. Read the current artifact
2. Validate current state: `epf_validate_file({ path: "<file>" })`
3. Make changes following schema requirements
4. Re-validate after changes

### Understanding Value Model Paths

Use `epf_explain_value_path` to understand any value model reference:

```
epf_explain_value_path({
  path: "Product.Discovery.KnowledgeExploration",
  instance_path: "docs/EPF/_instances/emergent"
})
```

### Checking Feature Strategic Context

Use `epf_get_strategic_context` to understand how a feature connects to strategy:

```
epf_get_strategic_context({
  feature_id: "fd-001",
  instance_path: "docs/EPF/_instances/emergent"
})
```

## Migration

If artifacts need schema updates:

1. Check status: `epf_check_migration_status({ instance_path: "..." })`
2. Get guide: `epf_get_migration_guide({ instance_path: "..." })`
3. Follow the migration instructions
4. Validate after migration

## Best Practices

1. **Always use wizards** before creating any EPF artifact (MANDATORY)
2. **Always validate** after making changes (MANDATORY)
3. **Query strategy context** before feature or roadmap work
4. **Check relationships** when modifying value model references
5. **Run health checks** periodically -- follow semantic review recommendations
6. **Follow semantic triggers** -- when health check recommends a review wizard, run it

---

_EPF-CLI powered workflow | See `epf-cli --help` for all commands_
