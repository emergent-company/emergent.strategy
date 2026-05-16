# Change: Expand strategy-server MCP tools to full EPF authoring parity

## Why

strategy-server currently has 26 MCP tools covering workspace/instance lifecycle, north star
and feature authoring, semantic stubs, and mutation history. epf-cli exposes 83+ tools covering
the full EPF protocol: embedded knowledge (schemas, templates, agents, skills, wizards,
generators), all READY/FIRE/AIM artifact types, validation, and export. To replace epf-cli as
the primary authoring platform, strategy-server needs comparable tool coverage.

Two discoveries inform this change:

1. Go's `internal/` package visibility rule prevents strategy-server from importing epf-cli's
   `internal/` packages, even within a `go.work` workspace. strategy-server must own its
   embedded content independently, synced from canonical-epf at build time.

2. The current document-level JSONB storage (one mutation row = one full artifact snapshot)
   works for history and export but creates friction for cross-cutting UI views. The web UI
   needs to query by strategic relationships (which features serve persona X? what value path
   connects feature Y to north star?), not by parsing JSONB documents at read time.

## What Changes

- **Strategic Index data model** — Two new tables (`strategy_artifacts` for current state
  cache, `strategy_relationships` for cross-artifact references) alongside the existing
  mutation ledger. On commit, current state is upserted into `strategy_artifacts` and
  cross-artifact references are extracted into `strategy_relationships`.
- **Embedded content system** — New `internal/embedded/` in strategy-server with its own
  `go:embed` directives and sync script, consuming canonical-epf independently from epf-cli.
- **Agent runtime tools** (~3) — `list_pending_batches`, `describe_batch`, and
  `list_mutations` extended with `since_mutation_id` cursor for polling. Enables autonomous
  background agents to stage changes for human review, identify themselves in the audit log,
  and react to mutations committed by humans or other agents.
- **Embedded knowledge tools** (~15) — `list_schemas`, `get_schema`, `list_templates`,
  `get_template`, `list_agents`, `get_agent`, `list_skills`, `get_skill`, `execute_skill`,
  `list_wizards`, `get_wizard`, `list_generators`, `get_generator`, `get_agent_for_task`,
  `get_wizard_for_task`
- **Expanded write tools** (~12) — Stage/commit for all artifact types: personas, competitive
  position, roadmap/OKRs, value model, assumptions, brand voice, design principles, user
  journeys, plus batch operations for multi-artifact authoring
- **Derived read tools** (~8) — `get_persona_detail`, `get_value_propositions`,
  `get_strategic_context_for_feature`, `explain_value_path`, `get_coverage_analysis`,
  `get_roadmap_detail`, `get_okr_detail`, `get_assumptions`
- **Validation tools** (~4) — `validate_artifact`, `validate_instance`,
  `validate_relationships`, `check_content_readiness`
- **Export tools** (~3) — `export_instance_yaml`, `export_feature_yaml`, `export_report`
- **AIM lifecycle tools** (~5) — `create_lra`, `update_lra`, `get_lra`,
  `create_aim_report`, `get_aim_summary`

Total: ~50 new tools, bringing the inventory from 26 to ~76.

## Impact

- Affected specs: `strategy-mcp` (new tool requirements), `strategy-authoring` (Strategic
  Index data model, expanded artifact types, agent identity on mutations)
- Affected code: `apps/strategy-server/internal/mcpserver/`,
  `apps/strategy-server/internal/embedded/`,
  `apps/strategy-server/internal/database/migrations/`,
  `apps/strategy-server/domain/strategy/`
- No changes to `apps/epf-cli/` (frozen)
- Corrects the outdated assumption in `add-strategy-server` design.md Decision 3 (epf-cli
  internal/ imports are not possible due to Go's `internal/` visibility rule)
