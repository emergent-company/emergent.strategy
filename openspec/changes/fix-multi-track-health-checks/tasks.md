## 1. Feature Loader — Multi-Track Support

- [x] 1.1 Add `Track` field to `FeatureDefinition` struct (product, strategy, org_ops, commercial)
- [x] 1.2 Change `FeatureLoader.Load()` to scan all 4 subdirectories under `FIRE/definitions/`
- [x] 1.3 Infer track from subdirectory path (product/ → product, commercial/ → commercial, etc.)
- [x] 1.4 Handle ID prefix conventions per track (fd-*, cd-*, sd-*, pd-*)
- [x] 1.5 Update `FeatureSet` indexes to work with all tracks
- [x] 1.6 Write tests: loader finds definitions from all 4 subdirectories
- [x] 1.7 Write tests: track field is correctly set based on directory

## 2. Relationship Validation — All Tracks

- [x] 2.1 Update `RelationshipsChecker.Check()` to validate all loaded definitions
- [x] 2.2 Validate each definition's `contributes_to` paths against the corresponding track's value model
- [x] 2.3 Update coverage analysis to count per-track (all 4 tracks, not just product)
- [x] 2.4 Update orphan feature detection to include non-product definitions
- [x] 2.5 Write tests: invalid commercial `contributes_to` path is reported
- [x] 2.6 Write tests: coverage reports non-zero for commercial track when definitions exist

## 3. Feature Quality — All Tracks

- [x] 3.1 Update `features.go` to check all definitions, not just `fd-*` / `definitions/product`
- [x] 3.2 Handle schema differences between tracks (non-product definitions may have different required fields)
- [x] 3.3 Write tests: quality check runs on a commercial definition

## 4. Cross-Reference Validation — All Tracks

- [x] 4.1 Update `crossrefs.go` to validate dependency references across all prefixes
- [x] 4.2 Support cross-track dependencies (e.g., cd-* depends on fd-*)
- [x] 4.3 Write tests: cross-track dependency reference is validated

## 5. Health Output — Per-Track Breakdown

- [x] 5.1 Update `cmd/health.go` to display per-track relationship results with actual counts
- [x] 5.2 Ensure the tier scoring accounts for non-product definition issues
- [x] 5.3 Update JSON output to include track breakdowns

## 6. Fix Emergent Instance Data

### Commercial definitions — wrong L2 component names

- [x] 6.1 cd-007: `Alliance Management` → `Collaboration Models` (revenue-sharing-agreements)
- [x] 6.2 cd-008: `Alliance Management` → `Collaboration Models` (resource-sharing-protocols)
- [x] 6.3 cd-009: `Alliance Management` → `Collaboration Models` (co-branding-opportunities)
- [x] 6.4 cd-012: `Financial Structuring` → `Fundraising` (term-sheet-negotiations)
- [x] 6.5 cd-013: `Financial Structuring` → `Fundraising` (softfunding)
- [x] 6.6 cd-014: Already correct (instance matches canonical)
- [x] 6.7 cd-015: Already correct (instance matches canonical)
- [x] 6.8 cd-021: `Marketing Operations` → `Lead Generation` (social-media-outreach)
- [x] 6.9 cd-022: `Marketing Operations` → `Lead Generation` (seo-strategies)
- [x] 6.10 cd-023: `Marketing Operations` → `Campaign Execution` (multichannel-campaigns)
- [x] 6.11 cd-024: `Marketing Operations` → `Campaign Execution` (ad-spend-optimization)
- [x] 6.12 cd-025: `Marketing Operations` → `Campaign Execution` (campaign-performance-analytics)
- [x] 6.13 cd-026: `Customer Success` → `Customer Retention` (loyalty-programs)
- [x] 6.14 cd-027: `Marketing Operations` → `Customer Retention` (personalization-strategies)
- [x] 6.15 cd-028: `Customer Success` → `Customer Retention` (customer-support-systems)

### Commercial definitions — wrong L2 for L3

- [x] 6.16 cd-039: `Market Differentiation` → `Competitive Positioning` (industry-positioning-maps)
- [x] 6.17 cd-040: `Market Differentiation` → `Competitive Positioning` (perception-tracking)
- [x] 6.18 cd-041: `Market Differentiation` → `Competitive Positioning` (pricing-strategies)

### Commercial definitions — phantom paths (remove) + content ops L2

- [x] 6.19-6.24 cd-030, cd-031, cd-032: Replaced all phantom paths and wrong L2 names with canonical `contributes_to` paths

### Value model naming fixes

- [x] 6.25 commercial.value_model.yaml: Added `path_segment: verbal-guidelines` to L3 `Verbal guidelines (tone and voice)`
- [x] 6.26 org_ops.value_model.yaml: Added `path_segment: salary-calculation-and-payments` to L3 `Salary calculation & payments`

### OrgOps/Commercial cross-track fixes

- [x] 6.27 pd-027: Fixed by adding path_segment to value model (6.26)
- [x] 6.28 pd-037: `Commercial.InvestorRelations.investor-updates` → `OrgOps.Shareholders & Investors.investor-communications`

## 7. Verification

- [x] 7.1 Run `epf-cli health` on emergent instance — all tracks report valid counts
- [ ] 7.2 Run `epf-cli ingest --dry-run` — zero "does not match" warnings
- [x] 7.3 Run full test suite — 0 failures
- [ ] 7.4 Run `epf-cli ingest` — zero skipped relationships
