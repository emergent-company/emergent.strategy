## 1. Embedded template directory restructure

- [x] 1.1 Move `templates/READY/definitions/strategy/` → `templates/FIRE/definitions/strategy/`
- [x] 1.2 Move `templates/READY/definitions/org_ops/` → `templates/FIRE/definitions/org_ops/`
- [x] 1.3 Move `templates/READY/definitions/commercial/` → `templates/FIRE/definitions/commercial/`
- [x] 1.4 Move `templates/FIRE/feature_definitions/feature_definition_template.yaml` → `templates/FIRE/definitions/product/feature_definition_template.yaml`
- [x] 1.5 Remove empty `templates/FIRE/feature_definitions/` directory (or leave README redirect)
- [x] 1.6 Remove empty `templates/READY/definitions/` directory
- [x] 1.7 Regenerate `MANIFEST.txt` after all moves

## 2. Schema/artifact detection (`internal/schema/loader.go`)

- [x] 2.1 Update `artifactMapping` regex for `feature_definition` from `feature_definitions?/` to `definitions/product/`
- [x] 2.2 Update `artifactTypeDirMap` entry for `feature_definition` from `FIRE/feature_definitions` to `FIRE/definitions/product`
- [x] 2.3 Update `artifactTypeDirMap` entry for `strategy_definition` from `READY/definitions/strategy` to `FIRE/definitions/strategy`
- [x] 2.4 Update `artifactTypeDirMap` entry for `org_ops_definition` from `READY/definitions/org_ops` to `FIRE/definitions/org_ops`
- [x] 2.5 Update `artifactTypeDirMap` entry for `commercial_definition` from `READY/definitions/commercial` to `FIRE/definitions/commercial`
- [x] 2.6 Assign `PhaseFIRE` to `strategy_definition`, `org_ops_definition`, `commercial_definition` in `artifactMapping` (currently blank)

## 3. Core strategy parser (`internal/strategy/parser.go`)

- [x] 3.1 Update `ParseFeatures` to read from `FIRE/definitions/product/` instead of `FIRE/feature_definitions/`
- [x] 3.2 Update any comments referencing `feature_definitions/`

## 4. Checks: instance health (`internal/checks/instance.go`)

- [x] 4.1 Update `RequiredFIREDirs` — replace `"feature_definitions"` with `"definitions"`
- [x] 4.2 Update `fdPath` construction from `FIRE/feature_definitions` to `FIRE/definitions/product`
- [x] 4.3 Add blocking CRITICAL check: if `FIRE/feature_definitions/` exists, emit error with migration command — message varies by deployment mode (embedded vs submodule consumer)
- [x] 4.4 Add blocking CRITICAL check: if `READY/definitions/` exists, emit error with migration command — same deployment-mode-aware messaging
- [x] 4.5 Add submodule detection to health check path construction: use `git -C <instance_path> rev-parse --show-superproject-working-tree` to determine if instance is a submodule and adjust error message accordingly

## 5. Checks: feature quality (`internal/checks/features.go`)

- [x] 5.1 Update path substring check from `feature_definitions` to `definitions/product`

## 6. Checks: version checker (`internal/checks/versions.go`)

- [x] 6.1 Update `fireFdPath` from `FIRE/feature_definitions` to `FIRE/definitions/product`
- [x] 6.2 Update path classifier substring from `feature_definitions` to `definitions/product`

## 7. Checks: coverage (`internal/checks/coverage.go`)

- [x] 7.1 Update `firePath` from `FIRE/feature_definitions` to `FIRE/definitions/product`

## 8. AIM health (`internal/aim/health.go`)

- [x] 8.1 Update `checkDeliveryDrift` fdDir from `FIRE/feature_definitions` to `FIRE/definitions/product`
- [x] 8.2 Update artifact path string in delivery drift diagnostic
- [x] 8.3 Update `countFeatureDefinitions` path
- [x] 8.4 Update canonical completeness diagnostic artifact path from `READY/definitions/` to `FIRE/definitions/`

## 9. Relationships writer (`internal/relationships/writer.go`)

- [x] 9.1 Update `featureDefsDir` from `FIRE/feature_definitions` to `FIRE/definitions/product`
- [x] 9.2 Update error message text

## 10. MCP: p1_tools (`internal/mcp/p1_tools.go`)

- [x] 10.1 Update `handleListFeatures` fdDir
- [x] 10.2 Update `findFeatureFilePath` fdDir
- [x] 10.3 Update `artifactTypeDirMap` — all four definition entries (see task 2.2–2.5)
- [x] 10.4 Update `handleRenameValuePath` fdDir

## 11. MCP: cache (`internal/mcp/cache.go`)

- [x] 11.1 Update `fdDir` for cache invalidation watching from `FIRE/feature_definitions` to `FIRE/definitions/product`

## 12. MCP: wizard tools (`internal/mcp/wizard_tools.go`)

- [x] 12.1 Update `fdDir` for wizard context building

## 13. MCP: generator tools (`internal/mcp/generator_tools.go`)

- [x] 13.1 Update feature_definitions glob pattern to `FIRE/definitions/product/*.yaml`

## 14. MCP: report/diff tools (`internal/mcp/report_diff_tools.go`)

- [x] 14.1 Update `firePath` from `FIRE/feature_definitions` to `FIRE/definitions/product`

## 15. MCP: server description strings (`internal/mcp/server.go`)

- [x] 15.1 Update `epf_get_definition` tool description — remove `READY/definitions/` reference
- [x] 15.2 Update error message text referencing `READY/definitions/`

## 16. Template loader (`internal/template/loader.go`)

- [x] 16.1 Update embedded template path from `templates/FIRE/feature_definitions/feature_definition_template.yaml` to `templates/FIRE/definitions/product/feature_definition_template.yaml`

## 17. Definition loader (`internal/template/definitions.go`)

- [x] 17.1 Update `LoadFromInstancePath` from `READY/definitions` to `FIRE/definitions`

## 18. Embedded sync (`internal/embedded/sync.go` + `embedded.go`)

- [x] 18.1 Update `SyncCanonical` destination from `READY/definitions` to `FIRE/definitions`
- [x] 18.2 Update `embedded.go` fs.Sub calls from `templates/READY/definitions` to `templates/FIRE/definitions`
- [x] 18.3 Update `ListCanonicalDefinitions` source path

## 19. Instance initialization (`internal/mcp/instance_tools.go`)

- [x] 19.1 Update FIRE subdirs list — replace `feature_definitions` with `definitions/product`, `definitions/strategy`, `definitions/org_ops`, `definitions/commercial`
- [x] 19.2 Update `copyCanonicalDefinitionsFromEmbedded` destination from `READY/definitions` to `FIRE/definitions`
- [x] 19.3 Update all dry-run file listing paths

## 20. New: structural migration command + MCP tool

- [x] 20.1 Create `internal/migration/structural.go` with `MigrateDefinitions(instancePath, dryRun)` function
- [x] 20.2 Detection logic: check for `FIRE/feature_definitions/`, `READY/definitions/strategy/`, `READY/definitions/org_ops/`, `READY/definitions/commercial/`
- [x] 20.3 Move logic: create target dirs, move files, remove empty source dirs
- [x] 20.4 Update `FIRE/mappings.yaml` comment reference if present
- [x] 20.5 Support `--dry-run` flag: report what would move without moving
- [x] 20.6 Emit migration report: list every moved file with old path → new path
- [x] 20.7 Register as CLI subcommand: `epf migrate definitions <instance_path> [--dry-run]`
- [x] 20.8 Register as MCP tool: `epf_migrate_definitions` with `instance_path` and `dry_run` params
- [x] 20.9 Add submodule detection: run `git -C <instance_path> rev-parse --show-superproject-working-tree`; if non-empty, the instance is being accessed from a consumer repo
- [x] 20.10 Submodule guard: if consumer-repo context detected and `dry_run=false`, refuse migration and emit instructions to run migration in the submodule source repo (include remote URL from `git -C <instance_path> remote get-url origin`)
- [x] 20.11 Submodule dry-run: if consumer-repo context detected and `dry_run=true`, show the planned moves with a warning that they cannot be applied from this context

## 21. Embedded documentation and wizards

- [x] 21.1 Update `internal/embedded/AGENTS.md` — path examples (lines 231, 1663)
- [x] 21.2 Update `templates/READY/product_portfolio.yaml` — comment on line 339
- [x] 21.3 Update `templates/READY/ad-hoc-artifacts_README_template.md` — line 35
- [x] 21.4 Update `templates/READY/05_roadmap_recipe.yaml` — line 65
- [x] 21.5 Update `templates/AIM/strategic_reality_check.yaml` — `source_artifact` values
- [x] 21.6 Update `templates/README.md` — table row for feature_definitions
- [x] 21.7 Update `wizards/product_architect.agent_prompt.md` — all path references
- [x] 21.8 Update `wizards/feature_enrichment.wizard.md` — path references
- [x] 21.9 Update `wizards/feature_definition.wizard.md` — path references
- [x] 21.10 Update `wizards/strategic_reality_check.agent_prompt.md` — table row
- [x] 21.11 Update `wizards/start_epf.agent_prompt.md` — directory tree
- [x] 21.12 Update `wizards/value_model_review.agent_prompt.md` — path reference
- [x] 21.13 Update `outputs/development-brief/wizard.instructions.md` — all path references
- [x] 21.14 Update `outputs/development-brief/validator.sh` — grep string
- [x] 21.15 Update `outputs/development-brief/README.md` — GitHub URL example

## 22. Instance documentation (`docs/EPF/`)

- [x] 22.1 Update `docs/EPF/AGENTS.md` — directory tree
- [x] 22.2 Update `docs/EPF/_instances/emergent/AGENTS.md` — directory tree and example commands
- [x] 22.3 Update `docs/EPF/_instances/emergent/README.md` — directory tree and quick-start
- [x] 22.4 Update `docs/EPF/_instances/emergent/FIRE/mappings.yaml` — comment
- [x] 22.5 Update `docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml` — measurement_method
- [x] 22.6 Update `docs/EPF/_instances/README.md` — instance directory structure documentation and migration guide

## 23. Tests

- [x] 23.1 Update `mcp/p1_tools_test.go` — fixture dirs (lines 26, 457, 967)
- [x] 23.2 Update `mcp/cache_test.go` — fixture dirs (lines 21, 141, 224)
- [x] 23.3 Update `mcp/strategy_tools_test.go` — fixture dir (line 858)
- [x] 23.4 Update `mcp/server_test.go` — fixture dirs (lines 194, 500)
- [x] 23.5 Update `mcp/protocol_test.go` — fixture dir (line 525)
- [x] 23.6 Update `mcp/aim_recalibrate_tools_test.go` — fixture dirs (lines 324, 351)
- [x] 23.7 Update `mcp/new_tools_test.go` — fixture dirs checking `READY/definitions/` (lines 146–156)
- [x] 23.8 Update `checks/features_test.go` — fixture dirs (lines 15–16, 32)
- [x] 23.9 Update `checks/crossrefs_test.go` — fixture dirs (lines 14–15, 23, 65, 79)
- [x] 23.10 Update `checks/coverage_test.go` — fixture dir (line 29)
- [x] 23.11 Update `checks/instance_test.go` — fixture dirs (lines 113, 356, 402, 571, 647)
- [x] 23.12 Update `checks/p2_enhancements_test.go` — fixture dir (line 123)
- [x] 23.13 Update `strategy/parser_test.go` — fixture dir (line 279)
- [x] 23.14 Update `aim/src_test.go` — fixture dirs (lines 22, 53, 84, 117, 147, 183)
- [x] 23.15 Update `schema/loader_test.go` — test path (line 71)
- [x] 23.16 Add tests for `epf_migrate_definitions` tool: dry-run output, actual migration, idempotency
- [x] 23.17 Add tests for health check CRITICAL error on old structure detection

## 24. Instance file migration (emergent-epf submodule)

- [x] 24.1 Build CLI and confirm it compiles cleanly
- [x] 24.2 Run `go test ./...` to confirm all tests pass after code changes
- [x] 24.3 Clone `emergent-company/emergent-epf` repo directly (not via submodule)
- [x] 24.4 Run `epf migrate definitions . --dry-run` from the emergent-epf repo root to verify migration plan
- [x] 24.5 Run `epf migrate definitions .` to apply migration
- [x] 24.6 Run `epf health .` to confirm no errors post-migration
- [x] 24.7 Commit file moves in emergent-epf repo: `git add -A && git commit -m "refactor: move definitions to FIRE/definitions/"`
- [x] 24.8 Push to emergent-epf remote
- [x] 24.9 Update submodule pointer in this repo: `git submodule update --remote docs/EPF/_instances/emergent`
- [x] 24.10 Commit submodule pointer update in this repo

## 25. Final validation

- [x] 25.1 Run full test suite: `cd apps/epf-cli && go test ./...`
- [x] 25.2 Build and run health check on emergent instance
- [x] 25.3 Confirm `epf_list_features` returns all 19 feature definitions from new location
- [x] 25.4 Confirm `epf_list_definitions` returns strategy/org_ops/commercial definitions from new location
- [x] 25.5 Confirm `epf_sync_canonical` syncs to `FIRE/definitions/` on a fresh test instance
- [x] 25.6 Confirm `epf_init_instance` creates correct directory structure on a new instance
- [x] 25.7 Confirm `epf_validate_relationships` still resolves all `contributes_to` paths correctly
