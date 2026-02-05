# Implementation Tasks

## Phase 1: Critical Fixes (Immediate)

### 1.1 Product Context Infrastructure ✅ COMPLETE

- [x] Create `internal/context/` package
- [x] Implement `InstanceContext` struct
- [x] Implement `LoadInstanceContext()` function
  - [x] Read `_meta.yaml` (product name, description)
  - [x] Fallback to `README.md` parsing
  - [x] Fallback to directory name inference
- [x] Add unit tests for context loading (10 tests, all passing)

### 1.2 Template Detection ✅ COMPLETE

- [x] Move placeholder patterns to shared location
  - [x] Extract `PlaceholderPatterns` from `internal/checks/instance.go`
  - [x] Extract `ExclusionPatterns` from `internal/checks/instance.go`
  - [x] Create `internal/validation/patterns.go`
- [x] Implement template detection functions
  - [x] `IsTemplateContent(value) bool`
  - [x] `DetectTemplatePlaceholder(field, value) (bool, string)`
  - [x] Use existing patterns from ContentReadinessChecker
- [x] Add template keyword patterns (17 patterns + 11 exclusions)
  - [x] "Example:", "Your Organization", "TBD"
  - [x] "Who they are", "What they do"
  - [x] "YYYY-MM-DD", "[FIELD]", "[INSERT]"
- [x] Add unit tests for template detection (4 test suites, all passing)

### 1.3 Basic Semantic Sanity Checks ✅ COMPLETE

- [x] Create `internal/validation/sanity.go`
- [x] Implement product/content alignment checks
  - [x] Extract keywords from product name/description
  - [x] Extract keywords from field content
  - [x] Flag mismatches (e.g., "veilag" + "planning frameworks")
  - [x] Distinguish strong vs weak domain indicators
  - [x] Confidence levels (high/medium/low)
- [x] Implement `CheckContentAlignment()` function
- [x] Add unit tests for sanity checks (10 test cases, all passing)

**Summary of Phase 1 Implementation:**

- ✅ Task 1.1: Product Context Infrastructure (context loading, 10 tests)
- ✅ Task 1.2: Template Detection (shared patterns, 4 test suites)
- ✅ Task 1.3: Semantic Sanity Checks (alignment detection, 10 tests)

**Next Steps:** Integrate into validation command (Task 1.4)

### 1.4 Enhanced Validation Output 🔄 NEXT

- [ ] Update `cmd/validate.go`
  - [ ] Load instance context before validation
  - [ ] Display product context header
  - [ ] Add template detection warnings to output
  - [ ] Add sanity check warnings to output
- [ ] Update `internal/validator/validator.go`
  - [ ] Pass context to validation functions
  - [ ] Enhance error messages with product context
  - [ ] Add fix hints based on product domain
- [ ] Update `--ai-friendly` output format
  - [ ] Include product context in YAML output
  - [ ] Add `template_warnings` section
  - [ ] Add `sanity_warnings` section

### 1.5 Integration with Health Check

- [ ] Update `cmd/health.go`
  - [ ] Link content readiness to validation command
  - [ ] Suggest `validate --ai-friendly` for details
- [ ] Coordinate with ContentReadinessChecker
  - [ ] Share pattern lists
  - [ ] Use same InstanceContext loading

### 1.6 Testing

- [ ] Unit tests for context loading
- [ ] Unit tests for template detection
- [ ] Unit tests for sanity checks
- [ ] Integration test with Veilag artifacts
  - [ ] Should catch mission/product mismatch
  - [ ] Should detect template placeholders
  - [ ] Should show product context
- [ ] Integration test with emergent artifacts
  - [ ] Should pass without false positives

### 1.7 Documentation

- [ ] Update `apps/epf-cli/README.md`
  - [ ] Document new validation features
  - [ ] Add examples of enhanced output
- [ ] Update `apps/epf-cli/AGENTS.md`
  - [ ] Document validation workflow with product context
  - [ ] Add troubleshooting for template warnings
  - [ ] Add guidance on sanity check warnings
- [ ] Update bug report with implementation notes

## Success Criteria

### Phase 1 Complete When:

- [ ] `epf-cli validate` shows product context header
- [ ] Template placeholders trigger warnings
- [ ] Obvious content mismatches are flagged
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Tested on real EPF instances (Veilag, emergent)

### Validation Test Cases:

1. **Veilag with wrong content**: Should flag "planning frameworks" as mismatch with "road associations"
2. **File with templates**: Should warn about "Example:", "TBD", "YYYY-MM-DD"
3. **Valid content**: Should not trigger false positive warnings
4. **Missing \_meta.yaml**: Should gracefully fallback to README or directory name

## Implementation Order

1. **Context loading** (1.1) - Foundation for everything else
2. **Template detection** (1.2) - Reuses existing patterns
3. **Sanity checks** (1.3) - New validation layer
4. **Enhanced output** (1.4) - Ties everything together
5. **Integration** (1.5) - Coordinates with existing systems
6. **Testing** (1.6) - Validates implementation
7. **Documentation** (1.7) - Makes it usable

## Notes

- **Reuse existing patterns**: ContentReadinessChecker already has 16 placeholder patterns - don't duplicate
- **Graceful degradation**: If context loading fails, validation should still work (just without product context)
- **Performance**: Context loading should be fast (<100ms) - cache if needed
- **False positives**: Start conservative - better to miss some issues than annoy users with wrong warnings
