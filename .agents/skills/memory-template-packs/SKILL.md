---
name: memory-template-packs
description: Manage Emergent schemas (template packs) — discover, install, and remove reusable sets of object and relationship types in a project. Use when the user wants to configure what types of knowledge objects a project can contain.
metadata:
  author: emergent
  version: "2.0"
---

Manage schemas (template packs) using `memory schemas`. Schemas define reusable sets of object types and relationship types that can be installed into a project's knowledge graph schema.

> **New to Emergent?** Load the `memory-onboard` skill first — it walks through designing and installing a schema from scratch.

## Rules

- **Never run `memory browse`** — it launches a full interactive TUI that blocks on terminal input and will hang in an automated agent context.
- **Always prefix `memory` commands with `NO_PROMPT=1`** (e.g. `NO_PROMPT=1 memory <cmd>`). Without it, the CLI may show interactive pickers when no project, agent, MCP server, skill, or agent-definition ID is provided. Do not add this to `.env.local` — it must only apply to agent-driven invocations.
- **Always supply a project** with `--project <id>` on project-scoped commands, or ensure `MEMORY_PROJECT` is set.

## Concepts

- **Schema (template pack)** — a versioned bundle of `objectTypeSchemas` and `relationshipTypeSchemas`. Immutable once created; new versions get new IDs.
- **Installed schema** — a schema assigned to a specific project. Multiple schemas can be installed; their types are merged into the project's compiled type registry.
- **Compiled types** — the merged view of all object + relationship types from all installed schemas in a project.

---

## Commands

### List available schemas
```bash
memory schemas list
memory schemas list --output json
```

### Get schema details
```bash
memory schemas get <schema-id>
```
Shows object types, relationship types, version, description.

### Create a new schema
```bash
memory schemas create --file pack.json
```

Schema JSON structure:
```json
{
  "name": "my-pack",
  "version": "1.0",
  "description": "Object types for my domain",
  "objectTypeSchemas": [
    {
      "name": "Requirement",
      "label": "Requirement",
      "description": "A product requirement",
      "properties": {}
    }
  ],
  "relationshipTypeSchemas": [
    {
      "name": "implements",
      "label": "Implements",
      "fromTypes": ["Task"],
      "toTypes": ["Requirement"]
    }
  ]
}
```

### List installed schemas in the current project
```bash
memory schemas installed
memory schemas installed --output json
```

### Install a schema into the current project
```bash
# Install an existing schema by ID:
memory schemas install <schema-id>

# Create from JSON file and install in one step:
memory schemas install --file pack.json

# Preview without making changes:
memory schemas install --file pack.json --dry-run

# Merge into existing registered types:
memory schemas install --file pack.json --merge
```

### Uninstall a schema from the current project
```bash
memory schemas uninstall <assignment-id>
```
Use `memory schemas installed` to find the assignment ID.

### Delete a schema from the registry
```bash
memory schemas delete <schema-id>
```

### View compiled types (merged schema)
```bash
memory schemas compiled-types
memory schemas compiled-types --output json
```
Shows all object and relationship types available in the current project, with which schema each comes from.

---

## Workflow

1. **Set up a project schema**: `list` to find existing schemas → `install <schema-id>` to add to project → `compiled-types` to verify
2. **Create a custom schema**: write a JSON file → `install --file pack.json --dry-run` to preview → `install --file pack.json` to create and install in one step
3. **Inspect project schema**: `compiled-types` to see all available types before creating objects
4. **Remove a schema**: `uninstall <assignment-id>` — use `installed` to find the assignment ID first

## Notes

- Schema IDs are UUIDs; use `list --output json` to find by name
- Schemas are immutable — creating a schema with the same name but different content creates a new version with a new ID
- `--project` global flag selects the project for `installed`, `install`, `uninstall`, and `compiled-types`
- `list` and `create` are org-scoped (no project needed)
