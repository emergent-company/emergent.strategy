# Tasks for Add Canonical Artifact Awareness to Health Checks and Init

## 1. Canonical Context Infrastructure

- [x] **1.1** Create canonical context helper functions (`IsCanonicalTrack`, `IsCanonicalArtifact`) in `internal/template/` or a new `internal/canonical/` package
- [x] **1.2** Add unit tests for canonical context helpers covering all tracks and edge cases
- [x] **1.3** Verify existing `DefinitionType` constants in `internal/template/definitions.go` align with the new helpers

## 2. Embed Canonical Definitions

- [x] **2.1** Extend `scripts/sync-embedded.sh` to copy canonical definitions (sd-*, pd-*, cd-*) into `internal/embedded/templates/READY/definitions/`
- [x] **2.2** Add `//go:embed` directives in `internal/embedded/embedded.go` for the canonical definitions directory
- [x] **2.3** Add accessor functions in `embedded.go` (e.g., `GetCanonicalDefinition(id string)`, `ListCanonicalDefinitions()`)
- [x] **2.4** Run `sync-embedded.sh` and verify definitions are present in the embedded directory
- [x] **2.5** Write unit tests verifying embedded definition loading

## 3. Init Creates Canonical Definitions

- [x] **3.1** Update `cmd/init.go` to create canonical definitions during instance initialization using 3-tier loading priority (instance > canonical_path > embedded)
- [x] **3.2** Create definitions in the appropriate READY/ subdirectory following existing init conventions
- [x] **3.3** Add integration test for init creating canonical definitions
- [x] **3.4** Verify dry_run mode reports canonical definitions that would be created

## 4. Health Check: Content Readiness

- [x] **4.1** Update `internal/checks/instance.go` content readiness checker to detect canonical track artifacts
- [x] **4.2** Suppress or annotate TBD/TODO/placeholder warnings for canonical artifacts that ship with `active: false`
- [x] **4.3** Add tests verifying canonical artifacts don't produce false positive content readiness warnings

## 5. Health Check: Coverage Analysis

- [x] **5.1** Update `internal/checks/coverage.go` to compute separate coverage metrics for canonical vs product tracks
- [x] **5.2** Weight product track coverage more heavily in the overall score
- [x] **5.3** Add tests verifying canonical track coverage doesn't inflate/deflate overall scores

## 6. Health Check: Relationship Integrity

- [x] **6.1** Update `internal/checks/relationships.go` to apply canonical-aware scoring
- [x] **6.2** Ensure `generateSuggestions` canonical filtering (already Product-prefix only) is consistent with the new helpers
- [x] **6.3** Add tests for canonical-aware relationship scoring

## 7. Health Check: Feature Quality

- [x] **7.1** Update `internal/checks/features.go` to pass track context when scoring feature quality
- [x] **7.2** Adjust thresholds or skip scoring for canonical track feature definitions
- [x] **7.3** Add tests verifying canonical track features don't produce false positive quality warnings

## 8. Health Check: AIM Health

- [x] **8.1** Update `internal/aim/health.go` to apply different thresholds for canonical tracks (LRA staleness, evidence gaps)
- [x] **8.2** Add tests for canonical-aware AIM health diagnostics

## 9. Health Check: Cross-References and Versions

- [x] **9.1** Update `internal/checks/crossrefs.go` to account for canonical artifact cross-reference patterns
- [x] **9.2** Update `internal/checks/versions.go` to handle canonical artifacts with framework-managed versions
- [x] **9.3** Add tests for cross-reference and version checks with canonical artifacts

## 10. Health Report Integration

- [x] **10.1** Update `cmd/health.go` health orchestration to pass canonical context to all check functions
- [x] **10.2** Ensure health report output labels canonical vs product sections when both are present
- [x] **10.3** Verify overall health score computation properly weights canonical vs product results
- [x] **10.4** Run full health check on the emergent EPF instance and confirm no false positives from canonical tracks

## 11. Final Validation

- [x] **11.1** Run `go test ./...` and ensure all tests pass
- [x] **11.2** Run `go build` and verify binary builds cleanly
- [x] **11.3** Run `epf-cli health` on a test instance with canonical artifacts and verify output
- [x] **11.4** Verify MCP tools (`epf_health_check`, `epf_generate_report`) return canonical-aware results
