## 1. P0 — Critical Bug Fixes

- [x] 1.1 Implement instance data cache with mtime-based invalidation — cache file contents keyed by path, re-read when file mtime changes
- [x] 1.2 Add automatic cache invalidation after all write MCP tools (`epf_update_capability_maturity`, `epf_fix_file`, `epf_aim_bootstrap`, `epf_aim_write_*`, etc.)
- [x] 1.3 Add `epf_reload_instance` MCP tool for manual cache clearing
- [x] ~~1.4 Add cache-age warning in responses when data may be stale~~ — CANCELLED: superseded by mtime-based auto-reload (cache always serves fresh data)
- [x] 1.5 Refactor artifact discovery to use content-based detection (top-level YAML keys) instead of filename matching — updated ParseNorthStar, ParseInsightAnalyses, ParseStrategyFormula, ParseRoadmap, ParseFeatures, ParseValueModels
- [x] 1.6 Apply content-based discovery to: `epf_get_value_propositions`, `epf_get_competitive_position`, `epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary` — done by design, all strategy tools use the parser which now has content-based discovery
- [x] 1.7 Add integration tests: file edit → re-query returns updated data (not stale) — `cache_test.go`: TestCacheInvalidation_FileEditReturnsUpdatedData, TestCacheInvalidation_ExplicitInvalidation, TestCacheInvalidation_NewFileDetected, TestMtimesChanged
- [x] 1.8 Add integration tests: numbered-prefix filenames are discovered correctly — `parser_test.go`: TestDiscoverReadyArtifacts_NumberedPrefixes, TestParseNorthStar_NumberedPrefix, TestParseFeatures_ContentBasedDiscovery, TestParseValueModels_ContentBasedDiscovery, + 6 more

## 2. P1 — High-Impact New Tools

- [x] 2.1 Implement `epf_list_features` — return summary table: feature ID, name, slug, quality score, persona count, scenario count, contributes_to paths, missing optional sections
- [x] 2.2 Implement `epf_rename_value_path` — given old path + new path, update all references across feature `contributes_to`, `mappings.yaml`, and roadmap KR `value_model_target` fields
- [x] 2.3 Implement `epf_update_kr` — update KR fields by KR ID, validate `value_model_target.component_path` against value model before writing
- [x] 2.4 Implement `epf_add_value_model_component` — add L2 component to a value model with schema-aware defaults per track (product vs. non-product field structures)
- [x] 2.5 Implement `epf_add_value_model_sub` — add L3 sub-component with auto-applied track-specific structure (`sub_components` for product, `subs` with `id/name/active/uvp` for non-product)
- [x] 2.6 Implement `epf_batch_validate` — validate all feature definitions (or all files in a directory) in one call, return summary table with per-file error counts and overall pass/fail
- [x] 2.7 Write unit tests for all new tools
- [x] 2.8 Register all new tools in MCP server tool list with proper parameter schemas and descriptions

## 3. P2 — Enhanced Analysis & Output

- [x] 3.1 Enhance `epf_check_content_readiness` to return structured details: `[{file, line, field, placeholder_text}]` instead of just count + grade
- [x] 3.2 Add score-impact annotations to `epf_check_feature_quality` results — each issue includes estimated point impact and which actions improve the score
- [x] 3.3 Enhance `epf_analyze_coverage` to use multi-signal analysis: features (`contributes_to`), KRs (`value_model_target`), roadmap components (`maps_to_value_model`), and mappings
- [x] 3.4 Add optional `file` parameter to `epf_validate_relationships` for scoped single-file validation
- [x] 3.5 Write tests for enhanced analysis output formats

## 4. P3 — DX Improvements

- [x] 4.1 Enhance validation error messages to include violated constraints inline (regex patterns, enum values, required subfields) — not just type mismatch descriptions
- [x] 4.2 Add `dry_run` parameter to all write tools that don't already have it (`epf_update_capability_maturity`, `epf_update_kr`, `epf_add_value_model_component`, `epf_add_value_model_sub`, `epf_rename_value_path`)
- [x] 4.3 Write tests for dry-run behavior across write tools

## 5. Verification

- [x] 5.1 Run full test suite (`go test ./...`)
- [x] 5.2 Manual smoke test: create instance with numbered-prefix files, verify all context tools discover artifacts
- [x] 5.3 Manual smoke test: edit file on disk, verify next MCP tool call returns fresh data
- [x] 5.4 Build CLI and verify all new tools appear in `epf-cli serve` tool listing
