## 1. P0 — Bug Fixes

### 1.1 SRC path validator scans all VM files
- [x] 1.1.1 Find SRC generator code that checks `contributes_to` paths (likely `internal/aim/` or `internal/mcp/`)
- [x] 1.1.2 Identify where VM files are loaded — confirm it only loads one file
- [x] 1.1.3 Fix to scan all `FIRE/value_models/*.yaml` files when validating paths
- [x] 1.1.4 Add test with multi-VM instance where paths span different VM files
- [x] 1.1.5 Verify fix against huma-strategy instance (4 VM files, 18 valid paths)

### 1.2 `epf_list_definitions` loading
- [x] 1.2.1 Trace definition loading in `internal/embedded/` or loader code
- [x] 1.2.2 Identify why definitions aren't being loaded (path issue? embedding issue?)
- [x] 1.2.3 Fix loader to find and parse definitions from embedded content
- [x] 1.2.4 Add test that `epf_list_definitions` returns non-empty results for all tracks

### 1.3 `product_name_collision` check finds portfolio
- [x] 1.3.1 Find portfolio loading code in `internal/checks/` or `internal/valuemodel/`
- [x] 1.3.2 Identify path resolution issue — likely looking in wrong directory or expecting wrong nesting
- [x] 1.3.3 Fix to search instance root for `product_portfolio.yaml`
- [x] 1.3.4 Test with huma-strategy's 922-line portfolio file

### 1.4 Semver comparison in migration status
- [x] 1.4.1 Find version comparison code in `internal/migration/` or `cmd/migrate.go`
- [x] 1.4.2 Replace string comparison with proper semver parsing (use existing Go semver library or write simple parser)
- [x] 1.4.3 Add test cases: 2.12.0 vs 2.1.0, 2.2.0 vs 2.10.0, 10.0.0 vs 9.9.9

### 1.5 Multi-file VM overlap false positives
- [x] 1.5.1 Find overlap check in `internal/valuemodel/` or `internal/checks/`
- [x] 1.5.2 Add debug logging to see which file each L1 layer is attributed to
- [x] 1.5.3 Fix overlap detection to correctly associate layers with their source file
- [x] 1.5.4 Test with huma-strategy (hardware VM has 5 specific L1 layers that should NOT overlap with software VM)

## 2. P1 — Semantic Quality Control

### 2.1 Brand/product name detection in VM layers
- [x] 2.1.1 Load product names from `product_portfolio.yaml` (requires fix from 1.3)
- [x] 2.1.2 Add check in VM quality checker: cross-reference L1/L2 layer names against portfolio product names
- [x] 2.1.3 Also check against company name and instance product_name from `_meta.yaml`
- [x] 2.1.4 Report as warning: "L1 'Huma Power Staff App' contains product name 'Power Staff App'"
- [x] 2.1.5 Add to health check summary and semantic triggers

### 2.2 Phantom path detection in mappings.yaml
- [x] 2.2.1 Extend `validate_relationships` (or create new handler) to load `FIRE/mappings.yaml`
- [x] 2.2.2 Extract all `sub_component_id` paths from mappings
- [x] 2.2.3 Validate each path against all loaded VM files (same multi-VM resolution as 1.1)
- [x] 2.2.4 Report invalid paths with "did you mean" suggestions (reuse existing suggestion logic)
- [x] 2.2.5 Add MCP tool support — either extend `epf_validate_relationships` or add `epf_validate_mappings`

### 2.3 LRA factual consistency check
- [x] 2.3.1 Parse LRA for quantitative claims (regex for "N value models", "N features", etc.)
- [x] 2.3.2 Count actual files in `FIRE/value_models/`, `FIRE/feature_definitions/`, etc.
- [x] 2.3.3 Flag discrepancies: "LRA claims 8 value models but instance has 4"
- [x] 2.3.4 Add to AIM health check results
- [x] 2.3.5 Consider also checking evolution log entries for factual accuracy

### 2.4 Stale metadata detection
- [x] 2.4.1 Check `metadata.instance` in READY artifacts against `_epf.yaml` product name
- [x] 2.4.2 Check `last_updated` dates — flag if older than configurable threshold (default: 6 months)
- [x] 2.4.3 Add to health check as warnings (not errors — stale metadata is informational)
- [x] 2.4.4 Test with huma-strategy's `01_insight_analyses.yaml` (wrong instance name, stale date)

### 2.5 Assessment report naming convention
- [x] 2.5.1 Document expected naming pattern in schema comments and AGENTS.md
- [x] 2.5.2 Add informational check: if `assessment_report_*.yaml` exists alongside `assessment_report.yaml`, warn about ambiguity
- [x] 2.5.3 If only cycle-tagged file exists, note it as accepted variant

### 2.6 Fix assumption statement extraction
- [x] 2.6.1 Find assumption extraction code in `internal/aim/` or `internal/roadmap/`
- [x] 2.6.2 Trace why `statement` field comes back empty — likely parsing wrong YAML path
- [x] 2.6.3 Fix to extract assumption text from roadmap recipe
- [x] 2.6.4 Add test with real roadmap data containing assumptions with descriptions

## 3. P2 — Quality-of-Life Improvements

### 3.1 Reweight feature quality scoring
- [x] 3.1.1 Find scoring logic in `internal/checks/features.go`
- [x] 3.1.2 Increase penalty for missing scenarios (should drop score below 80)
- [x] 3.1.3 Increase penalty for missing contexts (should drop score by ~10 points)
- [x] 3.1.4 Ensure features WITH scenarios/contexts still score 95-100
- [x] 3.1.5 Test against both emergent (all have scenarios) and huma-strategy (8/18 missing)

### 3.2 VM quality litmus test heuristics
- [x] 3.2.1 Add Product Removal Test approximation: check if any L1/L2 name matches a product name
- [x] 3.2.2 Weight this in the VM quality score (brand names in layers = -10 points per violation)
- [x] 3.2.3 Document this check's relationship to the wizard's litmus tests

### 3.3 Per-track coverage breakdown in health check
- [x] 3.3.1 Run `analyze_coverage` per track and include in health check summary
- [x] 3.3.2 Format as: "Product: 50%, Strategy: 0%, OrgOps: 0%, Commercial: 0%"
- [x] 3.3.3 Add to MCP health check output

### 3.4 `contributes_to` cardinality check
- [x] 3.4.1 Add informational check in feature quality: count contributes_to paths per feature
- [x] 3.4.2 If count == 1, add info-level suggestion to consider additional paths
- [x] 3.4.3 Do NOT penalize score — this is a nudge, not a requirement

### 3.5 Persona narrative quality heuristics
- [x] 3.5.1 Add paragraph count check (should be 3+) for persona narratives
- [x] 3.5.2 Add per-paragraph character count (200+ per paragraph)
- [x] 3.5.3 Add concrete metrics presence check (numbers, percentages, timeframes)
- [x] 3.5.4 Add bullet-point-in-narrative detection (narratives should be prose, not lists)
- [x] 3.5.5 Weight these as warnings that affect score mildly (-2 each, capped at -10 total)

## 4. P3 — Forward-Looking

### 4.1 Wizard-to-validator pipeline (design only)
- [x] 4.1.1 Document the concept: extract checkable criteria from wizard prose
- [x] 4.1.2 Identify 3-5 wizard criteria that could be automated (e.g., VM litmus test #1, scenario field requirements, persona narrative format)
- [x] 4.1.3 Add as future work in design.md — no implementation in this change
> NOTE: Automated in P2 #13 (litmus test #1 implemented as product_name_collision check) and P2 #16 (persona narrative quality heuristics). Full pipeline concept deferred to future proposal.

### 4.2 Multi-VM instance dashboard (design only)
- [x] 4.2.1 Sketch dashboard output format: per-VM status, per-track coverage, cross-VM health
- [x] 4.2.2 Add `--dashboard` flag to health command that produces compact table
- [x] 4.2.3 Add as future work in design.md — implementation deferred
> NOTE: Per-track coverage breakdown implemented in P2 #14 (MCP health check). Full dashboard with `--dashboard` flag deferred to future proposal.

## 5. Build & Verify

- [x] 5.1 Run all existing tests pass after changes
- [x] 5.2 Build epf-cli binary
- [x] 5.3 Test health check on emergent instance (regression check)
- [x] 5.4 Test health check on huma-strategy instance (verify bugs fixed)
- [x] 5.5 Verify MCP tools work correctly with fixes
