# Change: Improve EPF-CLI Semantic Validation & Quality Control

## Why

EPF-CLI is excellent at structural validation (schema, missing fields, type mismatches) but weak at semantic validation (logical consistency, factual accuracy, cross-artifact coherence). For a framework whose value proposition is strategic coherence, this is a critical gap. Comprehensive field testing on the huma-strategy instance (4 VMs, 18 FDs, full READY/FIRE/AIM, ~39 reports) surfaced 5 bugs and 13 improvement opportunities.

The biggest theme: **close the gap between wizard wisdom and automated tooling.** The wizards contain excellent quality criteria (litmus tests, narrative format requirements, scenario field specs), but these criteria are only enforced as prose — not by validators.

## What Changes

### P0 — Bug Fixes
1. **SRC path validator scans all VM files** — currently only scans one, causing false "broken" paths
2. **`epf_list_definitions` loads definitions** — currently returns "Definitions not loaded"
3. **`product_name_collision` check finds portfolio file** — currently skips even when file exists
4. **`check_migration_status` uses proper semver** — currently uses string comparison (2.12.0 vs 2.1.0)
5. **Multi-file VM overlap check uses correct data** — currently reports false positives

### P1 — Semantic Quality Control
6. **Brand/product name detection in VM layers** — cross-reference portfolio against layer names
7. **Phantom path detection in mappings.yaml** — extend relationship validation to mapping paths
8. **LRA factual consistency check** — validate LRA claims against actual file counts
9. **Stale metadata detection** — check instance name and last_updated freshness
10. **Assessment report naming enforcement** — document and optionally enforce canonical naming
11. **Fix assumption statement extraction** — `epf_aim_validate_assumptions` returns empty statements

### P2 — Quality-of-Life Improvements
12. **Increase scenario/context weight in feature quality score** — features without scenarios should not score above 80
13. **Add litmus test heuristics to VM quality score** — approximate Product Removal Test
14. **Coverage analysis per-track breakdown** — surface per-track numbers in health check
15. **`contributes_to` cardinality check** — informational nudge for single-path features
16. **Persona narrative quality heuristics** — paragraph count, character count, concrete metrics

### P3 — Forward-Looking
17. **Wizard-to-validator pipeline** — extract checkable criteria from wizard prose into validators
18. **Multi-VM instance dashboard** — compact health check summary for complex instances

## Impact

- Affected code: `apps/epf-cli/internal/checks/`, `apps/epf-cli/internal/mcp/`, `apps/epf-cli/cmd/`, `apps/epf-cli/internal/aim/`, `apps/epf-cli/internal/relationships/`
- Affected specs: `epf-cli-validation`, `epf-cli-health-checks`
- Testing: huma-strategy and emergent instances
- No breaking changes — all additions are new checks or bug fixes

## Source

Feedback document: `huma-strategy/ad-hoc-artifacts/2026-02-19_epf_cli_mcp_improvement_feedback.md`
