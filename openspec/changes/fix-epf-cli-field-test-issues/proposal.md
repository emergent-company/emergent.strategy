# Change: Fix EPF CLI Field Test Issues

## Why

Field testing the v0.21.0 EPF CLI MCP server against two production instances — Huma (38 files, 18 features) and Lawmatics (163 files, 17 features) — revealed 19 unique issues across both reports. Seven are bugs that produce crashes, wrong data, or misleading errors. Twelve are UX issues where tools are noisy, incomplete, or inconsistent in output.

Every issue was hit during real agent-driven remediation sessions and caused measurable time loss: wrong error messages sending agents down debugging dead ends, truncated health check outputs hiding critical warnings, and empty results with no explanation of what was searched or where.

## What Changes

### P0 — Crashes & Wrong Data (4 issues)
- **LRA schema validation crash**: Fix `time.Time` Go type leaking into JSON Schema, causing `epf_validate_file` to crash on `living_reality_assessment.yaml` with `jsonschema: invalid jsonType: time.Time`
- **Migration version comparison bug**: Fix semver comparison that reports `2.12.0 → 2.1.0` as a valid migration path (string comparison, not semver)
- **`list_definitions` path resolution**: Fix to search instance's `READY/definitions/` directory, not just framework-level dir (131 definitions present but "not found")
- **`aim_validate_assumptions` empty statements**: Fix roadmap parsing to extract full assumption statement text (currently returns `statement: ""` for all assumptions)

### P1 — Misleading Error Messages (3 issues)
- **`get_competitive_position` error**: Replace generic "Strategy formula not found" with specific section-missing message when file exists but competitive section is absent/differently-named
- **`get_value_propositions` empty response**: Add explanation of what fields were searched and in which files when returning zero results
- **`rename_value_path` destination check**: Allow renaming to paths that don't yet exist in the value model file (currently errors; should create or clearly document the two-step add-then-rename workflow)

### P2 — Health Check & Analysis Noise (6 issues)
- **Health check output truncation**: Add `detail_level` parameter (`summary`/`warnings_only`/`full`) to control output verbosity — responses currently truncate at ~85KB on large instances
- **Feature quality info noise**: Aggregate repeated identical info patterns into counts (e.g., "17 features have single-paragraph persona narratives") instead of listing each one individually (~200 repetitions)
- **`batch_validate` scope**: Expand beyond feature definitions to support `artifact_type` filter parameter or `"all"` value — currently ignores north_star, roadmap, value models, etc.
- **`check_instance` matched filenames**: Show actual matched filenames alongside "All N required files present" message
- **Canonical definitions gap severity**: Downgrade 131-missing-definitions warning from WARNING to INFO — noisy for instances where most canonical definitions aren't relevant
- **Coverage analysis feature names**: Show feature names alongside IDs in `most_contributed` output

### P3 — Minor UX Improvements (6 issues)
- **`get_wizard_for_task` review matching**: Fix wizard recommendation so "review strategic coherence" matches `strategic_coherence_review` wizard, not `synthesizer`
- **`diff_template`/`get_section_example` for feature_definition**: Fix "No template available" for the most common artifact type
- **`aim_okr_progress` without assessments**: Fall back to showing KR status from roadmap data when no assessment reports exist
- **`check_migration_status` label clarity**: Clarify what "current_version" means (anchor version vs minimum file version vs something else)
- **Assessment report cycle-tagged naming**: Support `assessment_report_c1.yaml` naming pattern in AIM health checks alongside canonical `assessment_report.yaml`
- **`aim_generate_src` dry_run**: Add `dry_run` parameter for consistency with other write-adjacent tools

## Impact
- **Affected specs**: `epf-cli-mcp`
- **Affected code**: `apps/epf-cli/internal/mcp/`, `apps/epf-cli/internal/validator/`, `apps/epf-cli/internal/checks/`, `apps/epf-cli/internal/migration/`, `apps/epf-cli/internal/strategy/`
- **No breaking changes** — all fixes are additive or correct existing behavior
- **Prerequisite**: Archive `fix-epf-cli-reliability-and-ux` (28/28 done) to merge its delta into the spec before this change's MODIFIED requirements can reference its additions (batch_validate, rename_value_path)
