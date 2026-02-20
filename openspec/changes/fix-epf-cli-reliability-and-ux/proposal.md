# Change: Fix EPF CLI Reliability and UX Issues

## Why

Two independent user feedback reports (from Twenty First and Lawmatics EPF instance remediations, each spanning 28-60+ tasks) converge on the same core problems:

1. **The MCP server cache is broken** — after editing files on disk, tools return stale data, causing phantom validation errors that waste hours of debugging time. Both reports rank this as the #1 issue.
2. **Artifact discovery is filename-dependent** — tools like `epf_get_value_propositions` and `epf_get_competitive_position` silently return empty results when files use numbered-prefix naming (e.g., `04_strategy_formula.yaml`), despite `epf_validate_file` handling this correctly via content-based detection.
3. **No structured write tools exist** for the most common editing operations — agents resort to raw YAML editing for roadmap KRs, value model components, feature `contributes_to` paths, and cross-file value path renames.
4. **Validation and analysis tools lack detail** — quality scores don't show impact per issue, content readiness doesn't report file+line+field, and relationship validation can't scope to a single file.

These aren't feature requests — they're friction that makes the tooling unreliable during real-world multi-hour remediation sessions.

## What Changes

### P0 — Critical Bug Fixes
- **Cache invalidation**: Add automatic cache invalidation after write operations + `epf_reload_instance` tool for manual cache clearing
- **Content-based artifact discovery**: Replace filename-matching with content-based discovery (`meta.artifact_type` field) for all strategy context tools

### P1 — High-Impact New Tools
- **`epf_list_features`**: Summary table of all features (IDs, names, quality scores, structural gaps) — replaces reading N files to plan work
- **`epf_rename_value_path`**: Cross-file value model path rename (features, mappings, roadmap KRs) in one operation
- **`epf_update_kr`**: Structured KR field updates with value model path validation
- **`epf_add_value_model_component`** / **`epf_add_value_model_sub`**: Schema-aware value model population with track-specific field structure
- **`epf_batch_validate`**: Validate all feature definitions in one call with summary table

### P2 — Enhanced Analysis & Output
- **Content readiness detail**: Return `[{file, line, field, placeholder_text}]` from `epf_check_content_readiness`
- **Score-impact annotations**: `epf_check_feature_quality` includes per-issue score impact ("Adding scenarios: +5 points")
- **Multi-signal coverage**: `epf_analyze_coverage` considers KRs, roadmap components, and mappings — not just features
- **Scoped relationship validation**: `epf_validate_relationships` accepts optional `--file` parameter

### P3 — DX Improvements
- **Inline constraint reporting**: Validation errors include violated constraints (regex, enum, required fields) not just type mismatches
- **Dry-run for all write tools**: Extend `dry_run` parameter to all write operations (currently only `epf_fix_file` and `epf_init_instance`)

## Impact
- Affected specs: `epf-cli-mcp`
- Affected code: `apps/epf-cli/` (Go MCP server, instance loading, validation, analysis tools)

## Sources
- Twenty First feedback: `twentyfirst/docs/EPF/ad-hoc-artifacts/epf-tooling-improvement-assessment.md`
- Lawmatics feedback: `lawmatics/docs/EPF/_instances/lawmatics/ad-hoc-artifacts/2026-02-20-epf-cli-mcp-feedback-report.md`
