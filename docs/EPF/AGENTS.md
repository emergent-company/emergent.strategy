# AGENTS.md - AI Agent Instructions for EPF

> **This file is for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.)**
> Read this FIRST before performing any EPF operations.

## Quick Start

This repository uses **epf-cli** for all EPF operations. The canonical EPF framework (schemas, templates, wizards, generators, definitions) is loaded from a central location, not stored in this repo.

### Configuration

The epf-cli is configured via `~/.epf-cli.yaml`:

```yaml
canonical_path: /path/to/canonical-epf
```

### MCP Tools Available

When using epf-cli as an MCP server, you have access to 30 tools:

| Category          | Tools                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **Schemas**       | `epf_list_schemas`, `epf_get_schema`, `epf_validate_file`, `epf_validate_content`                           |
| **Templates**     | `epf_get_template`, `epf_list_artifacts`, `epf_get_phase_artifacts`                                         |
| **Definitions**   | `epf_list_definitions`, `epf_get_definition`                                                                |
| **Wizards**       | `epf_list_wizards`, `epf_get_wizard`, `epf_get_wizard_for_task`                                             |
| **Generators**    | `epf_list_generators`, `epf_get_generator`, `epf_check_generator_prereqs`, `epf_validate_generator_output`  |
| **Health**        | `epf_health_check`, `epf_check_instance`, `epf_check_content_readiness`, `epf_check_feature_quality`        |
| **Relationships** | `epf_validate_relationships`, `epf_explain_value_path`, `epf_get_strategic_context`, `epf_analyze_coverage` |
| **Migration**     | `epf_check_migration_status`, `epf_get_migration_guide`                                                     |

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
epf-cli wizards get feature_definition
```

Or via MCP: `epf_get_wizard({ name: "feature_definition" })`

### List Available Schemas

```bash
epf-cli schemas list
```

Or via MCP: `epf_list_schemas()`

## Instance Structure

This repo contains only instance-specific data:

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

### Creating New Artifacts

1. Get the template: `epf_get_template({ artifact_type: "feature_definition" })`
2. Get the wizard for guidance: `epf_get_wizard({ name: "feature_definition" })`
3. Create the file with the template structure
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

1. **Always validate** after making changes
2. **Use wizards** for guidance on complex artifacts
3. **Check relationships** when modifying value model references
4. **Run health checks** periodically to catch issues early

---

_EPF-CLI powered workflow | See `epf-cli --help` for all commands_
