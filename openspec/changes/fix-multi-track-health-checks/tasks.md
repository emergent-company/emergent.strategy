## 1. Feature Loader — Multi-Track Support

- [ ] 1.1 Add `Track` field to `FeatureDefinition` struct (product, strategy, org_ops, commercial)
- [ ] 1.2 Change `FeatureLoader.Load()` to scan all 4 subdirectories under `FIRE/definitions/`
- [ ] 1.3 Infer track from subdirectory path (product/ → product, commercial/ → commercial, etc.)
- [ ] 1.4 Handle ID prefix conventions per track (fd-*, cd-*, sd-*, pd-*)
- [ ] 1.5 Update `FeatureSet` indexes to work with all tracks
- [ ] 1.6 Write tests: loader finds definitions from all 4 subdirectories
- [ ] 1.7 Write tests: track field is correctly set based on directory

## 2. Relationship Validation — All Tracks

- [ ] 2.1 Update `RelationshipsChecker.Check()` to validate all loaded definitions
- [ ] 2.2 Validate each definition's `contributes_to` paths against the corresponding track's value model
- [ ] 2.3 Update coverage analysis to count per-track (all 4 tracks, not just product)
- [ ] 2.4 Update orphan feature detection to include non-product definitions
- [ ] 2.5 Write tests: invalid commercial `contributes_to` path is reported
- [ ] 2.6 Write tests: coverage reports non-zero for commercial track when definitions exist

## 3. Feature Quality — All Tracks

- [ ] 3.1 Update `features.go` to check all definitions, not just `fd-*` / `definitions/product`
- [ ] 3.2 Handle schema differences between tracks (non-product definitions may have different required fields)
- [ ] 3.3 Write tests: quality check runs on a commercial definition

## 4. Cross-Reference Validation — All Tracks

- [ ] 4.1 Update `crossrefs.go` to validate dependency references across all prefixes
- [ ] 4.2 Support cross-track dependencies (e.g., cd-* depends on fd-*)
- [ ] 4.3 Write tests: cross-track dependency reference is validated

## 5. Health Output — Per-Track Breakdown

- [ ] 5.1 Update `cmd/health.go` to display per-track relationship results with actual counts
- [ ] 5.2 Ensure the tier scoring accounts for non-product definition issues
- [ ] 5.3 Update JSON output to include track breakdowns

## 6. Fix Emergent Instance Data

### Commercial definitions — wrong L2 component names

- [ ] 6.1 cd-007: `Alliance Management` → `Collaboration Models` (revenue-sharing-agreements)
- [ ] 6.2 cd-008: `Alliance Management` → `Collaboration Models` (resource-sharing-protocols)
- [ ] 6.3 cd-009: `Alliance Management` → `Collaboration Models` (co-branding-opportunities)
- [ ] 6.4 cd-012: `Financial Structuring` → `Fundraising` (term-sheet-negotiations)
- [ ] 6.5 cd-013: `Financial Structuring` → `Fundraising` (softfunding)
- [ ] 6.6 cd-014: `Financial Modeling (for Fundraising)` → `Financial Modeling` (revenue-modeling)
- [ ] 6.7 cd-015: `Financial Modeling (for Fundraising)` → `Financial Modeling` (capital-expenditure-planning)
- [ ] 6.8 cd-021: `Marketing Operations` → `Lead Generation` (social-media-outreach)
- [ ] 6.9 cd-022: `Marketing Operations` → `Lead Generation` (seo-strategies)
- [ ] 6.10 cd-023: `Marketing Operations` → `Campaign Execution` (multichannel-campaigns)
- [ ] 6.11 cd-024: `Marketing Operations` → `Campaign Execution` (ad-spend-optimization)
- [ ] 6.12 cd-025: `Marketing Operations` → `Campaign Execution` (campaign-performance-analytics)
- [ ] 6.13 cd-026: `Customer Success` → `Customer Retention` (loyalty-programs)
- [ ] 6.14 cd-027: `Marketing Operations` → `Customer Retention` (personalization-strategies)
- [ ] 6.15 cd-028: `Customer Success` → `Customer Retention` (customer-support-systems)

### Commercial definitions — wrong L2 for L3

- [ ] 6.16 cd-039: `Market Differentiation` → `Competitive Positioning` (industry-positioning-maps)
- [ ] 6.17 cd-040: `Market Differentiation` → `Competitive Positioning` (perception-tracking)
- [ ] 6.18 cd-041: `Market Differentiation` → `Competitive Positioning` (pricing-strategies)

### Commercial definitions — phantom paths (remove)

- [ ] 6.19 cd-030: Remove `Commercial.Pipeline.awareness` and `Commercial.Brand.authority` (no valid target)
- [ ] 6.20 cd-031: Remove `Commercial.Pipeline.awareness` and `Commercial.Brand.reach` (no valid target)
- [ ] 6.21 cd-032: Remove `Commercial.Analytics.content-analytics`, `Commercial.Pipeline.optimization`, `Commercial.Strategy.data-driven` (no valid targets)

### Commercial definitions — content ops L2

- [ ] 6.22 cd-030: `Content Operations` → `Content Production & Management` (content-creation-workflows)
- [ ] 6.23 cd-031: `Content Operations` → `Content Production & Management` (content-distribution)
- [ ] 6.24 cd-032: `Content Operations` → `Content Production & Management` (content-performance-tracking)

### Value model naming fixes

- [ ] 6.25 commercial.value_model.yaml: Rename L3 `Verbal guidelines (tone and voice)` → `Verbal guidelines` (or add path_segment)
- [ ] 6.26 org_ops.value_model.yaml: Rename L3 `Salary calculation & payments` → `Salary calculation and payments` (or add path_segment)

### OrgOps/Commercial cross-track fixes

- [ ] 6.27 pd-027: Fix normalisation mismatch (`&` vs `and` in salary path)
- [ ] 6.28 pd-037: `Commercial.InvestorRelations.investor-updates` → `OrgOps.Shareholders & Investors.investor-communications`

## 7. Verification

- [ ] 7.1 Run `epf-cli health` on emergent instance — all tracks report valid counts
- [ ] 7.2 Run `epf-cli ingest --dry-run` — zero "does not match" warnings
- [ ] 7.3 Run full test suite — 0 failures
- [ ] 7.4 Run `epf-cli ingest` — zero skipped relationships
