## 1. P0 — Crashes & Wrong Data
- [x] 1.1 Fix LRA `time.Time` schema validation crash — replace Go type with ISO 8601 string format in JSON Schema generation (`internal/validator/`)
- [x] 1.2 Fix migration version comparison to use proper semver parsing (2.12.0 > 2.1.0, not string comparison) (`internal/migration/` or `cmd/migrate.go`)
- [x] 1.3 Fix `list_definitions` to search instance's `READY/definitions/` directory for synced canonical definitions (`internal/mcp/instance_tools.go`)
- [x] 1.4 Fix `aim_validate_assumptions` to extract full assumption statement text from roadmap YAML structure (`internal/mcp/aim_tools.go`)

## 2. P1 — Misleading Error Messages
- [x] 2.1 Fix `get_competitive_position` to report specific missing section name when strategy formula file exists but competitive section is absent (`internal/mcp/strategy_tools.go`)
- [x] 2.2 Fix `get_value_propositions` to explain what fields/files were searched when returning empty results (`internal/mcp/strategy_tools.go`)
- [x] 2.3 Fix `rename_value_path` to allow renaming to paths not yet in value model, or add clear guidance message for two-step workflow (`internal/mcp/p1_tools.go`)

## 3. P2 — Health Check & Analysis Noise
- [x] 3.1 Add `detail_level` parameter to `epf_health_check` tool (summary/warnings_only/full), default to `warnings_only` for instances with >20 files (`internal/mcp/server.go`)
- [x] 3.2 Aggregate repeated feature quality info messages into counts instead of individual listings (`internal/checks/features.go`)
- [x] 3.3 Expand `batch_validate` to support `artifact_type` parameter (feature_definition, north_star, roadmap, value_model, etc.) and `"all"` value (`internal/mcp/p1_tools.go`)
- [x] 3.4 Add matched filenames to `check_instance` structure validation output (`internal/checks/instance.go`)
- [x] 3.5 Downgrade canonical definitions gap from WARNING to INFO severity (`internal/checks/instance.go`)
- [x] 3.6 Include feature names alongside IDs in coverage analysis `most_contributed` output (`internal/relationships/coverage.go`)

## 4. P3 — Minor UX Improvements
- [x] 4.1 Fix `get_wizard_for_task` to match review-related keywords (review, evaluate, assess quality) to review wizards (`internal/mcp/server.go` or wizard matching logic)
- [x] 4.2 Add `feature_definition` template support to `diff_template` and `get_section_example` tools (`internal/mcp/server.go`)
- [x] 4.3 Add roadmap-based KR status fallback to `aim_okr_progress` when no assessment reports exist (`internal/mcp/aim_tools.go`)
- [x] 4.4 Clarify `check_migration_status` version field labels with descriptive names (`internal/mcp/server.go` or migration tools)
- [x] 4.5 Support cycle-tagged assessment report naming (`assessment_report_c1.yaml`) in AIM health diagnostics (`internal/mcp/aim_tools.go` or `internal/checks/`)
- [x] 4.6 Add `dry_run` parameter to `aim_generate_src` tool (`internal/mcp/aim_src_tools.go`)

## 5. Testing & Validation
- [x] 5.1 Run full test suite (`go test ./...`) — all packages must pass
- [x] 5.2 Smoke test all fixed tools against Emergent EPF instance
- [x] 5.3 Run `openspec validate fix-epf-cli-field-test-issues --strict`
