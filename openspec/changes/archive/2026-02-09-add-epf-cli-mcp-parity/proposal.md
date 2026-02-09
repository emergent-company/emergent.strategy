# Change: Add EPF-CLI MCP Parity

## Why

The primary consumers of epf-cli are AI agents, not humans. Currently, ~40% of CLI commands lack MCP equivalents, forcing AI agents to shell out to the CLI for common operations like initializing instances, fixing issues, and working with AIM phase tools. This creates unnecessary friction and breaks the tool-first paradigm.

The MCP server should be the primary interface for AI agents, with the CLI serving as a fallback for human debugging and scripting.

## What Changes

### High Priority - Core AI Agent Operations

1. **Add `epf_init_instance` tool** - Initialize new EPF instances programmatically
2. **Add `epf_fix_file` tool** - Auto-fix common issues (whitespace, tabs, versions)
3. **Add `epf_aim_bootstrap` tool** - Create Living Reality Assessment interactively
4. **Add `epf_aim_status` tool** - Get LRA summary for understanding baseline

### Medium Priority - Strategic Operations

5. **Add `epf_aim_assess` tool** - Pre-populate assessment report from roadmap
6. **Add `epf_aim_validate_assumptions` tool** - Check assumption validation status
7. **Add `epf_aim_okr_progress` tool** - Calculate OKR achievement rates
8. **Add `epf_generate_report` tool** - Generate health reports (md/html/json)
9. **Add `epf_diff_artifacts` tool** - Compare EPF artifacts for structural differences
10. **Add `epf_diff_template` tool** - Compare file against canonical template

### Explicitly NOT Adding (Human-Supervised Operations)

The following CLI commands will NOT get MCP equivalents due to their destructive/structural nature:

- `migrate` - Schema version migration (potentially destructive)
- `migrate-anchor` - One-time legacy migration
- `migrate-structure` - Repository restructuring (involves git)
- `generators copy/export/install` - Filesystem operations with low AI utility
- `version` - No AI utility

### Already Covered (No Action Needed)

#### Wizards (14 total)

All wizards are already fully accessible via existing MCP tools:

- `epf_list_wizards` - Lists all available wizards
- `epf_get_wizard` - Gets wizard by ID
- `epf_get_wizard_for_task` - Gets wizard based on task description

Wizards covered: `start_epf`, `lean_start`, `pathfinder`, `product_architect`, `synthesizer`, `01_trend_scout`, `02_market_mapper`, `03_internal_mirror`, `04_problem_detective`, `aim_trigger_assessment`, `balance_checker`, `feature_definition`, `feature_enrichment`, `roadmap_enrichment`

#### Scripts (8 total)

| Script               | Location                  | Coverage Status                                      |
| -------------------- | ------------------------- | ---------------------------------------------------- |
| `validator.sh` (x5)  | Each output generator     | ✅ Covered by `epf_validate_generator_output`        |
| `sync-embedded.sh`   | Build script              | N/A (internal build tooling)                         |
| `publish-to-gist.sh` | `value-model-preview/`    | ⚠️ Out of scope (external service interaction)       |
| `trim-violations.sh` | `skattefunn-application/` | ⚠️ Out of scope (generator-specific post-processing) |

**Note on uncovered scripts**:

- `publish-to-gist.sh` interacts with GitHub Gist API - this is better handled by the AI agent using native GitHub tools rather than adding external service dependencies to epf-cli
- `trim-violations.sh` is a specialized SkatteFUNN generator post-processor for auto-fixing character limit violations - this is generator-specific and the AI agent can handle this via `epf_fix_file` or direct editing

## Impact

- **Affected specs**: None existing (epf-cli has no openspec spec yet)
- **Affected code**: `apps/epf-cli/internal/mcp/server.go`
- **New tools**: 10 MCP tools
- **Existing tools**: 29 (will become 39)
- **Wizards**: No changes needed (already 100% covered)
- **Scripts**: No changes needed (validators covered, others out of scope)

## Design Considerations

### Write Operations in MCP

Some new tools (like `epf_fix_file`, `epf_init_instance`) are write operations. These should:

1. Support `dry_run` parameter to preview changes
2. Return detailed change descriptions for AI agent confirmation flows
3. Not perform git operations (leave that to the agent)

### Interactive Operations

`epf_aim_bootstrap` in CLI is interactive. The MCP version should:

1. Accept all parameters upfront (non-interactive)
2. Return sensible defaults that the AI agent can present to the user
3. Support partial updates for conversational flows

### Report Generation

`epf_generate_report` should return content directly rather than writing to files, allowing the AI agent to decide disposition.
