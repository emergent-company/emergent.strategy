# epf-cli → strategy-server Parity Matrix (initial)

Status legend:
- **Covered** — strategy-server already has an equivalent (tool / CLI / web).
- **This change** — closed by a track in this proposal.
- **N/A** — intentionally not ported (rationale given).

This is the initial draft (task 0.1). It is refined to fully green before Track D
(cutover). Counts are source-verified: epf-cli = 94 MCP tools / 41 CLI commands;
strategy-server = 153 MCP tools + web UI.

## CLI commands (epf-cli)

| epf-cli command | strategy-server equivalent | Status |
|---|---|---|
| `validate` | `validate` CLI subcommand (2.1) / `validate_artifact` MCP | This change |
| `health` | `health` CLI subcommand (2.1) / `health_check` MCP | This change |
| `locate` | `locate` CLI subcommand (2.1) | This change |
| `fix` | `fix` CLI subcommand (2.1) | This change |
| `diff` | `diff` CLI subcommand / `diff_versions` MCP | This change / Covered |
| `coverage` | `coverage` CLI / `get_coverage_analysis` MCP | This change / Covered |
| `explain` | `explain` CLI / `explain_value_path` MCP | This change / Covered |
| `context` | `context` CLI / `get_strategic_context_for_feature` MCP | This change / Covered |
| `ask` | `ask` CLI / `search_strategy` MCP | This change / Covered |
| `report` | `report` CLI + `export_report` MCP | This change |
| `ingest` / `sync` / `semantic-edges` | ingest pipeline (auto after commit) | Covered |
| `impact` | semantic ripple `propose_change` / `coherence_check` | Covered |
| `scenario *` | `run_scenario`/`evaluate_scenario`/`commit_scenario`/`discard_scenario` | Covered |
| `aim *` | AIM MCP tools + orchestrated cycle + web | Covered |
| `agents */skills */wizards */generators *` | knowledge tools + scaffold (gaps: agent/generator scaffold) | Partial → 3.4 |
| `schemas */templates */definitions */artifacts *` | knowledge tools (`list/get_schema`, `list/get_template`, etc.) | Covered |
| `init`/`scaffold` | `scaffold_instance` MCP + READY draft web | Covered |
| `enroll`/`connect`/`login`/`push` | GitHub connect/import/push + orgs/auth | Covered |
| `migrate*`/`sync-canonical`/`migrate-anchor`/`migrate-structure` | internal schema sync; user guidance | This change (3.5) / N/A |
| `lsp` | `strategy-server lsp` | This change (2.2) |
| `serve` | `serve` (MCP) | Covered |
| `strategy serve/status/export` | hosted serve + `export_*_yaml` | Covered |
| `update`/`version`/`config` | binary/version/config handling | Covered / N/A |
| `relationships validate` | `validate_relationships` MCP | Covered |

## MCP tools (epf-cli categories)

| epf-cli category | strategy-server | Status |
|---|---|---|
| Schema & Template (10) | knowledge tools (10) | Covered |
| Validate (8) | validation tools (8) | Covered |
| Health/Instance (6) | core `health_check`, admin instance tools | Covered |
| Wizard (4) | `list_wizards`/`get_wizard` (read-only legacy) | Covered (read) |
| Generator (3) | none (content as skills) | This change (3.1) |
| Agent (5) | `list_agents`/`get_agent`; no scaffold/import | Partial → 3.4 |
| Skill (6) | packs: list/get/run/scaffold/install + execute | Covered |
| Write/Relationship (9) | authoring + features write tools | Covered |
| AIM (15) | aim tools (13) + orchestrated cycle | Covered |
| Diff (2) | `diff_versions` + `diff` CLI | Covered |
| Workspace (1) | `list_workspaces` + orgs | Covered |
| Strategy query (8) | strategy reads (12) | Covered |
| Strategy context (8) | strategy reads + features | Covered |
| Session audit (2) | activity stream + audit log + observability | Covered |
| Semantic (4) | semantic tools (6) | Covered |
| Memory (6) | semantic + ingest (graceful degradation) | Covered |
| Journey/navigation (5) | navigation graph (web) + read tools | Partial → review |
| `value-model-preview` (inline) | blocked by `run_skill` | This change (3.2) |
| `report`/HTML preview | none | This change (3.2/3.3) |

## Runtime parity (the "fully local" user)

| epf-cli property | strategy-server today | Status |
|---|---|---|
| Single binary, no DB | Postgres-required | This change (1.1/1.2) |
| Local git repo = source of truth | DB-first, no local-repo mode | This change (1.3) |
| Local models (Ollama) | supported (`LLM_PROVIDER_URL`) | Covered (verify 1.4) |
| No auth / offline | hosted assumes Zitadel | This change (1.2) |
| Editor-time LSP | none | This change (2.2) |
