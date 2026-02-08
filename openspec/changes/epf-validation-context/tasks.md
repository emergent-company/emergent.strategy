# Implementation Tasks

## Phase 1: Critical Fixes

### 1.1 Product Context Infrastructure

- [x] Create `internal/context/` package
- [x] Implement `InstanceContext` struct with ProductName, Description, Domain, SourceFiles
- [x] Implement `LoadInstanceContext()` function
  - [x] Read `_meta.yaml` (product name, description)
  - [x] Fallback to `README.md` parsing
  - [x] Fallback to directory name inference
- [x] Implement `GetKeywords()` for domain keyword extraction
- [x] Add unit tests (10 tests, all passing)

### 1.2 Template Detection

- [x] Move placeholder patterns to shared `internal/validation/patterns.go`
  - [x] Extract `PlaceholderPatterns` (16 patterns)
  - [x] Extract `ExclusionPatterns` (11 patterns)
- [x] Implement `IsTemplateContent(value) bool`
- [x] Implement `DetectTemplatePlaceholder(field, value) (bool, matchedText)`
  - [x] Return actual matched text instead of regex pattern
- [x] Add unit tests (4 test suites, all passing)

### 1.3 Semantic Sanity Checks

- [x] Create `internal/validation/sanity.go`
- [x] Implement `CheckContentAlignment()` function
  - [x] Extract keywords from product context
  - [x] Extract keywords from field content
  - [x] Detect domain mismatches (strong vs weak indicators)
  - [x] Return `AlignmentWarning` with confidence levels
- [x] Add unit tests (10 test cases, all passing)

### 1.4 Enhanced Validation Output

**Goal:** Integrate the built infrastructure into the validation command output.

- [x] Update `cmd/validate.go`
  - [x] Load instance context at validation start
  - [x] Display product context header before validation results
  - [x] Create AI-friendly result even when validation passes (for warnings)
- [x] Add template warnings to output
  - [x] Call `DetectTemplatePlaceholder()` on string field values
  - [x] Add `template_warnings` section to `--ai-friendly` output
  - [x] Template warnings work even without product context
- [x] Add semantic alignment warnings to output
  - [x] Call `CheckContentAlignment()` on strategic fields
  - [x] Add `semantic_warnings` section to `--ai-friendly` output (when context available)
- [x] Update `--ai-friendly` YAML/JSON format
  - [x] Add `product_context:` section (product_name, description, keywords, source)
  - [x] Add `template_warnings:` array (path, placeholder, context)
  - [x] Add `semantic_warnings:` array (path, issue, confidence, suggestion)
- [x] All existing tests pass

### 1.5 Per-Field Examples (Enhancement - Future)

**Goal:** Show field-specific examples based on product domain.

- [x] Create `internal/validation/examples.go`
  - [x] Implement ExampleExtractor using embedded templates
  - [x] Implement GetFieldExample(artifactType, fieldPath) to extract examples at YAML paths
  - [x] Implement GetSectionExample() for complete section YAML
  - [x] Implement GetExamplesForErrors() for batch extraction
  - [x] Add field description lookup for common fields (severity, impact, status, etc.)
- [x] Add examples to validation errors
  - [x] Add Example field to EnhancedValidationError in validator/ai_friendly.go
  - [x] Add FieldExample struct with Value, Type, Description
  - [x] Integrate example extraction into createAIResultFromBasic()
  - [x] Integrate example extraction into createAIResultFromBasicWithContext()
- [x] Add `--explain <field>` command option
  - [x] Show field purpose, constraints, and examples
  - [x] Include product context and template examples
  - [x] Support JSON output with `--json` flag

### 1.6 Integration with Health Check (Future)

- [ ] Update `cmd/health.go`
  - [ ] Suggest `validate --ai-friendly` when content issues found
  - [ ] Share context loading with validation
- [ ] Coordinate ContentReadinessChecker with validation context
  - [ ] Use same pattern lists
  - [ ] Share InstanceContext loading

### 1.7 Testing (Future)

- [ ] Integration test with Veilag-like misaligned content
  - [ ] Should catch mission/product domain mismatch
  - [ ] Should detect template placeholders
  - [ ] Should show product context
- [ ] Integration test with emergent artifacts
  - [ ] Should pass without false positives
- [ ] Update existing validation tests

### 1.8 Documentation (Future)

- [x] Update `apps/epf-cli/README.md`
  - [x] Document new validation features
  - [x] Add examples of enhanced output
- [x] Update `apps/epf-cli/AGENTS.md`
  - [x] Document validation workflow with product context
  - [x] Add troubleshooting for template/sanity warnings

## Success Criteria

- [x] `epf-cli validate` shows product context header
- [x] Template placeholders trigger warnings with `--ai-friendly`
- [x] Obvious content mismatches are flagged with confidence
- [x] Per-field examples appear in error output
- [x] `--explain <field>` command option shows field purpose, constraints, and template examples
- [x] All tests pass
- [x] Documentation updated
- [x] Tested on real EPF instances (emergent)

## Implementation Notes

**Built Infrastructure:**

- `internal/context/context.go` - Product context loading (270 lines)
- `internal/validation/sanity.go` - Alignment checking (233 lines)
- `internal/validation/patterns.go` - Template detection (84 lines)
- `internal/validation/examples.go` - Per-field example extraction from templates (294 lines)

**Key Integration Points (Completed):**

1. `validateSingleFile()` in `cmd/validate.go` - context loading, warning collection
2. `createAIResultFromBasicWithContext()` - creates AI-friendly result with context and examples
3. `createAIResultFromBasic()` - creates AI-friendly result with examples
4. `addFieldExamplesToErrors()` - populates Example field on each error using ExampleExtractor
5. `collectTemplateWarnings()` - template detection (works without context)
6. `collectSemanticWarnings()` - semantic alignment (requires context)
7. `CreateAIFriendlyResultWithContext()` in `validator/ai_friendly.go`
8. `runExplainField()` in `cmd/validate.go` - `--explain` flag handler
9. `GetTopLevelSection()` in `validator/ai_friendly.go` - exported for section name extraction

**Test Files:**

- `internal/context/context_test.go` - 10 tests
- `internal/validation/sanity_test.go` - 10 tests
- `internal/validation/patterns_test.go` - 4 test suites
