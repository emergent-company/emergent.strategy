# EPF Validation Context & Guidance Improvements

## Metadata

- **Type**: Enhancement
- **Status**: Draft
- **Priority**: Critical
- **Component**: epf-cli validation system
- **Created**: 2026-02-05
- **Bug Report**: `/docs/bugs/2026-02-05_epf-cli-validation-context-failure.md`

## Problem Statement

### What Happened

AI agent catastrophically misunderstood validation task while fixing errors in Veilag EPF artifacts, filling them with completely wrong content (described Veilag as "a product planning framework company" when it's actually "a Norwegian private road cost allocation platform").

### Root Cause

**epf-cli validation provides zero product context** when reporting errors:

- Validation errors say WHAT is wrong ("field too short") but not WHY it matters
- No reference to what the product actually IS
- Templates look identical to draft artifacts - no clear "fill this in with YOUR product" guidance
- No sanity checks to catch obvious content mismatches

### Impact

- **AI agents cannot safely use epf-cli** without human supervision
- **Human users** easily lose sight of actual product strategy while chasing validation passes
- **Strategic artifacts** can become nonsensical without anyone realizing during validation

## Proposed Solution

### Phase 1: Critical Fixes (Immediate)

#### 1.1 Add Product Context to Validation Output

**Problem**: Errors lack context about what product/instance being validated
**Solution**: Read and display product context with every validation run

```go
// Internal: cmd/validate.go
type InstanceContext struct {
    ProductName   string
    Description   string
    Domain        string // e.g., "transportation", "fintech"
    SourceFiles   []string // _meta.yaml, README.md, etc.
}

func getInstanceContext(instanceDir string) *InstanceContext {
    // 1. Try _meta.yaml
    // 2. Fall back to README.md
    // 3. Infer from directory name
}
```

**Output Enhancement**:

```
Validating: docs/epf/_instances/veilag/READY/00_north_star.yaml

PRODUCT CONTEXT:
  Name: Veilag
  Type: Norwegian private road cost allocation platform
  Purpose: Help road associations fairly distribute maintenance costs
  Source: _meta.yaml

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ VALIDATION ERRORS (40 found)

[1] north_star.mission.mission_statement
    Error: length must be >= 50, but got 12
    Current: "Who they are"
    ⚠️  This looks like template placeholder text

    GUIDANCE:
    This field describes WHAT your product does and FOR WHOM.
    For Veilag: Describe how the platform solves road cost allocation

    Example for similar product:
    "We automate maintenance cost distribution for Norwegian private
     road associations based on graduated usage patterns"
```

#### 1.2 Template Detection & Warnings

**Problem**: Templates indistinguishable from drafts - agent assumed it should "fill in" placeholders

**Solution**: Detect and warn about template content

```go
// Internal: internal/validation/template_detection.go
var templateKeywords = []string{
    "Example:",
    "Your Organization",
    "TBD",
    "Who they are",
    "[FIELD]",
    "YYYY-MM-DD",
    "What they do",
}

func detectTemplateContent(field string, value string) bool {
    for _, keyword := range templateKeywords {
        if strings.Contains(value, keyword) {
            return true
        }
    }
    return false
}
```

**Output**:

```
⚠️  TEMPLATE CONTENT DETECTED (3 fields):
   - north_star.purpose.statement contains "Your Organization"
   - north_star.mission.what_we_do[0] contains "Core activity 1"
   - trends.technology[0].impact contains "high/medium/low"

This file appears to contain template placeholders.
Have you customized it for Veilag's actual strategy?

To suppress this warning: epf-cli validate --allow-templates
```

#### 1.3 Basic Semantic Sanity Checks

**Problem**: No validation caught mission about "planning frameworks" in "veilag" (road) project

**Solution**: Simple keyword mismatch detection

```go
// Internal: internal/validation/sanity_check.go
type SanityCheck struct {
    Field      string
    ProjectContext string
    FieldContent   string
    Suspicious bool
    Reason     string
}

func checkContentAlignment(productName, domain string, content map[string]string) []SanityCheck {
    // Check if mission/purpose/values mention topics unrelated to product domain
    // E.g., "veilag" (road) + mission about "planning frameworks" = SUSPICIOUS
}
```

**Output**:

```
⚠️  CONTENT ALIGNMENT WARNINGS (2 found):

[1] north_star.purpose.statement
    Project: Veilag (road cost allocation platform)
    Content mentions: "product organizations", "planning frameworks"

    → These topics seem unrelated to road cost allocation
    → Did you mean to describe how Veilag helps road associations?

[2] target_users[0].persona
    Project: Veilag (road associations)
    Content: "Product Manager"

    → Are product managers your primary users?
    → Expected users might be: road association board members, treasurers
```

### Phase 2: Enhanced Guidance (Short-term)

#### 2.1 Field-Level Help Text

**Problem**: Users don't understand what each field should contain

**Solution**: Add `--explain <field>` command

```bash
epf-cli validate north_star.yaml --explain mission_statement

# Output:
Field: north_star.mission.mission_statement
Purpose: Concrete statement of WHAT you do and FOR WHOM
Constraints: 50-250 characters
Tone: Clear, specific, stable over time

Examples by domain:
  Transportation: "We automate cost allocation for Norwegian road associations"
  SaaS: "We build project management software for distributed teams"
  FinTech: "We provide real-time payment infrastructure for e-commerce platforms"

For Veilag (road cost allocation):
  Consider: How does Veilag solve the maintenance cost distribution problem?
  Audience: Road association board members and treasurers
  Focus: Automation, fairness, transparency in cost allocation
```

#### 2.2 Improved Error Messages with Examples

**Current**:

```
error: length must be >= 50, but got 12
```

**Improved**:

```
❌ north_star.mission.mission_statement (too short)
   Current: "Who they are" (12 chars)
   Required: 50-250 characters

   WHY: Mission needs enough detail to guide strategic decisions

   EXAMPLE for Veilag:
   "We automate fair cost distribution for Norwegian private road
    associations by calculating graduated usage patterns from property
    data and maintenance records"

   ⚠️  Your content "Who they are" looks like template placeholder
```

#### 2.3 Validation Summary with Strategic Guidance

**Current**: Just lists errors
**Improved**: Groups and prioritizes with context

```
VALIDATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Product: Veilag (Norwegian private road cost allocation platform)

📋 CRITICAL ISSUES (3):
   ⚠️  Template content detected in 3 fields
       → Customize these for Veilag's actual strategy

   ⚠️  Mission mentions "planning frameworks" but product is road-related
       → Misalignment between mission statement and product domain

   ❌ 8 required fields missing
       → Complete these to meet minimum strategic clarity

📏 STRUCTURAL ISSUES (37):
   • 15 text fields too short (expand with more detail)
   • 12 date format errors (use YYYY-MM-DD)
   • 10 type mismatches (string → object conversions needed)

💡 GUIDANCE:
   1. Start with mission/purpose - describe what Veilag does for road associations
   2. Refer to original investor memo for product context
   3. Replace template examples with Veilag-specific content

   Need help? Run: epf-cli wizard north-star
```

### Phase 3: Interactive Guidance (Medium-term)

#### 3.1 Wizard Mode

```bash
epf-cli wizard north-star

# Interactive Q&A:
? What problem does Veilag solve?
  ▸ Private road associations need fair cost allocation

? Who are your primary users?
  ▸ Road association board members (treasurers, chairmen)

? What's unique about your solution?
  ▸ Automated graduated usage calculation with property registry integration

✅ Generated mission statement:
   "We automate fair cost allocation for Norwegian private road associations
    by calculating graduated usage patterns from official property data"

   Save to north_star.yaml? (Y/n)
```

#### 3.2 Example Library

```bash
epf-cli example north-star --domain=transportation
epf-cli example north-star --similar-to=veilag

# Shows real-world examples from similar products
```

#### 3.3 Content Review

```bash
epf-cli review north-star.yaml

# Semantic review of strategic coherence:
✓ Purpose aligns with product domain
✓ Mission describes concrete user value
⚠️ Value #2 mentions "product managers" but users are road association boards
⚠️ Core belief about "competition" doesn't mention key differentiator (property registry)
```

### Phase 4: Advanced Validation (Long-term)

#### 4.1 LLM-Powered Semantic Validation

- Check if artifact content aligns with product context
- Suggest improvements based on product domain understanding
- Flag logical inconsistencies between artifacts

#### 4.2 Cross-Artifact Coherence

- Validate that north_star → insight_analyses → strategy flow makes sense
- Check that OKRs align with mission, features align with strategy
- Detect strategic drift between planning cycles

## Implementation Plan

### Files to Modify

**Core Validation**:

- `apps/epf-cli/cmd/validate.go` - Enhanced output, context loading
- `apps/epf-cli/internal/validation/validator.go` - Add context parameter
- `apps/epf-cli/internal/validation/template_detection.go` - NEW: Template keyword detection
- `apps/epf-cli/internal/validation/sanity_check.go` - NEW: Content alignment checks
- `apps/epf-cli/internal/validation/formatter.go` - Improved error formatting

**Context Management**:

- `apps/epf-cli/internal/context/instance_context.go` - NEW: Load product metadata
- `apps/epf-cli/internal/context/meta_reader.go` - NEW: Parse \_meta.yaml, README.md

**New Commands**:

- `apps/epf-cli/cmd/explain.go` - NEW: Field-level help
- `apps/epf-cli/cmd/wizard.go` - NEW: Interactive content generation (Phase 3)
- `apps/epf-cli/cmd/review.go` - NEW: Semantic review (Phase 4)

**Documentation**:

- `apps/epf-cli/AGENTS.md` - Update validation workflow guidance
- `apps/epf-cli/README.md` - Document new flags and features
- EPF template files - Add clear "TEMPLATE" markers

### Testing Strategy

**Regression Tests**:

```go
// apps/epf-cli/internal/validation/template_detection_test.go
func TestDetectTemplateContent(t *testing.T) {
    cases := []struct{
        content string
        isTemplate bool
    }{
        {"Example: Some text", true},
        {"We automate road cost allocation", false},
        {"Your Organization Name", true},
    }
    // ...
}
```

**Integration Tests**:

- Validate Veilag artifacts with new context system
- Ensure template warnings appear for unmodified templates
- Verify sanity checks catch product/content misalignment

**UX Testing**:

- Give test users blank templates
- Measure time to first valid artifact
- Collect feedback on error message clarity

## Success Metrics

### Immediate (Phase 1)

- ✅ Product context displayed in every validation run
- ✅ Template content warnings prevent placeholder submissions
- ✅ Basic sanity checks catch obvious content mismatches
- ✅ AI agents request product context before proceeding

### Short-term (Phase 2)

- ✅ 80% of validation errors include actionable guidance with examples
- ✅ Users spend less time understanding errors, more time on strategy
- ✅ Validation pass rate increases without sacrificing content quality

### Medium-term (Phase 3)

- ✅ Wizard mode reduces time-to-first-valid-artifact by 50%
- ✅ Example library provides real-world reference for each artifact type
- ✅ Review command catches 90% of strategic inconsistencies

### Long-term (Phase 4)

- ✅ LLM validation catches semantic issues structural validation misses
- ✅ Cross-artifact coherence validation ensures strategic alignment
- ✅ EPF artifacts become living strategic documents, not compliance checkbox

## Risks & Mitigations

### Risk: False Positives on Sanity Checks

**Mitigation**: Make sanity checks warnings, not errors. Allow override with `--no-sanity-checks`

### Risk: Context Detection Failures

**Mitigation**: Graceful degradation - if no context found, still show structural errors but with generic guidance

### Risk: LLM Costs (Phase 4)

**Mitigation**: Make LLM validation opt-in with `--semantic` flag. Cache results per content hash.

### Risk: Over-Engineering

**Mitigation**: Ship Phase 1 first, validate user feedback before building Phase 2-4

## Dependencies

- None for Phase 1 (pure Go improvements)
- Phase 4 requires LLM integration (Anthropic/OpenAI API)

## Coordination with Existing Features

### Existing Content Readiness Checker

**Location**: `apps/epf-cli/internal/checks/instance.go:623-790`

The CLI already has a `ContentReadinessChecker` that runs during `epf-cli health` and detects placeholders. This proposal coordinates with and extends that system:

| Feature          | Existing (ContentReadinessChecker)          | This Proposal (Validation Context)                  |
| ---------------- | ------------------------------------------- | --------------------------------------------------- |
| **When it runs** | During `health` command                     | During `validate` command                           |
| **Scope**        | Entire instance directory                   | Single file or directory                            |
| **Detection**    | 16 placeholder patterns (regex)             | Template keywords + semantic checks                 |
| **Output**       | Score (0-100), Grade (A-F), list of matches | Per-field errors with fix hints and product context |
| **Purpose**      | Instance-wide content quality               | File-level validation guidance                      |

**Integration Points:**

1. **Share Pattern Lists**:

   - Move `PlaceholderPatterns` and `ExclusionPatterns` from `internal/checks/instance.go` to shared `internal/validation/patterns.go`
   - Both systems use same patterns for consistency

2. **Template Detection Flow**:

   ```
   User runs: epf-cli validate file.yaml
        ↓
   validate command → calls schema validation
        ↓
   IF validation fails AND placeholders detected:
        ↓
   Show: "⚠️  TEMPLATE CONTENT DETECTED" warning
        ↓
   Suggest: "Run epf-cli fix --versions" or customize content
   ```

3. **Health Check Integration**:

   ```
   User runs: epf-cli health
        ↓
   ContentReadinessChecker runs (existing)
        ↓
   IF content readiness grade < B:
        ↓
   Suggest: "Run epf-cli validate <file> --ai-friendly to see specific errors"
   ```

4. **Shared Context Loading**:
   - `InstanceContext` struct used by both:
     - ContentReadinessChecker: For instance-wide summary
     - Validation context: For per-file error messages
   - Single source of truth for product name, description, domain

**Why Keep Both Systems?**

| Use Case                               | Best Tool                          | Reason                                           |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| "Is my instance ready to use?"         | `health` (ContentReadinessChecker) | Fast scan, overall quality score                 |
| "Why is this file failing validation?" | `validate` (Validation Context)    | Detailed per-field guidance with product context |
| "Fix all placeholder issues"           | `health` → `fix`                   | Batch operations on entire instance              |
| "Fix validation errors in one file"    | `validate` → manual edits          | Focused, context-aware fixes                     |

**Recommended Workflow:**

```bash
# 1. Initial health check
epf-cli health
# Output: "Content Readiness: Grade C (65/100), 15 placeholders detected"

# 2. Drill into specific files with errors
epf-cli validate READY/00_north_star.yaml --ai-friendly
# Output: Product context + detailed errors + fix hints

# 3. Fix errors with product-specific content
# (Manual edits guided by validation context)

# 4. Re-check health
epf-cli health
# Output: "Content Readiness: Grade A (95/100), 1 placeholder detected"
```

## Related Work

- Bug report: `docs/bugs/2026-02-05_epf-cli-validation-context-failure.md`
- Existing content readiness: `apps/epf-cli/internal/checks/instance.go` (ContentReadinessChecker)
- EPF content readiness openspec: `openspec/changes/epf-content-readiness/` (if exists)
- Schema explain: `openspec/changes/add-epf-cli-schema-explain/` (may overlap with Phase 2)
- Wizard support: `openspec/changes/add-epf-cli-wizard-support/` (Phase 3 implementation)

## Open Questions

1. Should we require `_meta.yaml` for all instances or allow README fallback?
2. What's the right balance between helpful warnings and validation noise?
3. Should template detection block validation (error) or just warn?
4. How do we handle multi-language instances (Norwegian content in Veilag)?
