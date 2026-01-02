# SkatteFUNN Wizard Failure - Root Cause Analysis

**Date:** 2 January 2026  
**Issue:** First application generation created non-compliant document (wrong section structure)  
**User Discovery:** "How come this became wrong? We have schema and template, did the wizard not use that at all?"

---

## Executive Summary

The wizard instructions file (`wizard.instructions.md`) **embeds the expected output structure directly in the instructions** (lines 1575-1725) but **never instructs the AI to read the actual `template.md` file**. This caused the AI to generate output from the embedded example structure rather than reading and following the authoritative template.

**Critical Gap:** No explicit instruction exists anywhere in `wizard.instructions.md` to:
1. Read `docs/EPF/outputs/skattefunn-application/template.md`
2. Parse the template structure
3. Follow the template format exactly

---

## Evidence

### 1. Wizard Instructions Embed Structure (Lines 1575-1725)

```markdown
## Section 1: Project Owner and Roles
...
## Section 2: About the Project
...
## Section 8: Total Budget and Estimated Tax Deduction
```

**Problem:** This is a **conceptual explanation** of the structure, not the authoritative template. The AI interpreted this as the actual format to follow.

### 2. No File Read Instruction Found

Search results for template file reading instructions:

```bash
grep -n "read.*template\.md" wizard.instructions.md
# Result: No matches

grep -n "load.*template\.md" wizard.instructions.md
# Result: No matches

grep -n "template\.md.*file" wizard.instructions.md
# Result: No matches
```

**Finding:** **ZERO instructions to read the template.md file.**

### 3. Template References Are Conceptual Only

All mentions of "template" in wizard.instructions.md refer to:
- "Template Variable Mapping" (data structure, not file)
- "Template Variables" (Handlebars variables)
- "Template Version" (metadata)

**None** refer to reading the actual `template.md` file.

### 4. What Actually Happened

**First Generation Attempt:**
- AI read `wizard.instructions.md` (2,381 lines)
- AI saw embedded structure example (lines 1575-1725)
- AI interpreted embedded structure as the format to follow
- AI generated document with section titles like "## 1. Organization Information" instead of "## Section 1: Project Owner and Roles"
- **AI never read `template.md` because no instruction told it to**

**Validator Rejection:**
```
❌ Section 1 title incorrect
   Expected: ## Section 1: Project Owner and Roles
   Found:    ## 1. Organization Information
```

---

## Root Causes

### Primary Root Cause: Missing File Read Instruction

**Location:** `wizard.instructions.md` Phase 4 (Document Assembly)

**What's Missing:** Explicit instruction to read and use `template.md`:

```python
# ❌ MISSING INSTRUCTION (should be in Phase 4):

# Step 4.1: Load Template File
template_path = "docs/EPF/outputs/skattefunn-application/template.md"
template_content = read_file(template_path)

# Verify template has all 8 official sections
required_sections = [
    "## Section 1: Project Owner and Roles",
    "## Section 2: About the Project",
    "## Section 3: Background and Company Activities",
    "## Section 4: Primary Objective and Innovation",
    "## Section 5: R&D Content",
    "## Section 6: Project Summary",
    "## Section 7: Work Packages",
    "## Section 8: Total Budget and Estimated Tax Deduction"
]

for section_title in required_sections:
    if section_title not in template_content:
        raise ValueError(f"Template missing required section: {section_title}")

print("✅ Template validated - all 8 sections present")
```

### Secondary Root Cause: Ambiguous Guidance

**Problem:** Wizard instructions say "Section Structure (8 Official Sections)" followed by example markdown that looks like output format.

**What AI Sees:**
- "Here's the structure" (lines 1575-1725)
- Embedded markdown that looks authoritative
- No indication that `template.md` is the **actual** source of truth

**What AI Should See:**
- "Read template.md file located at docs/EPF/outputs/skattefunn-application/template.md"
- "Parse template structure and preserve all section titles exactly"
- "The embedded structure below is for reference only - always follow template.md"

### Tertiary Root Cause: No Validation Step

**Missing:** Pre-generation validation that template.md was read and parsed correctly.

```python
# ❌ MISSING VALIDATION (should be before generation):

# Verify AI has template structure loaded
assert template_content is not None, "Template not loaded"
assert len(required_sections) == 8, "Template structure incomplete"

# Verify AI will use template sections (not invented ones)
print("Confirming section titles to use:")
for section in required_sections:
    print(f"  - {section}")
print("\n⚠️ Do NOT use alternative section numbering (e.g., ## 1., ## 2.)")
print("⚠️ Must match template.md exactly")
```

---

## Impact Analysis

### What Went Wrong

1. **First Generation:** Wrong section structure (## 1. vs ## Section 1:)
2. **Validator Rejection:** Section title mismatch detected
3. **User Escalation:** User questioned why wizard didn't use template/schema
4. **Time Wasted:** ~2 hours debugging/regenerating
5. **Trust Impact:** User questioned whether wizard works at all

### Why This Is Critical

**SkatteFUNN submission requires exact format matching:**
- Online form at https://kunde.forskningsradet.no/skattefunn/ expects specific structure
- Users copy-paste sections 1-8 directly into form fields
- Wrong section titles = manual editing required = defeats copy-paste goal
- Character limits must match official requirements exactly

**Template.md is the single source of truth for:**
- Section titles (exact wording)
- Section order (1-8 sequence)
- Character limits (per Research Council requirements)
- Markdown formatting (headers, tables, lists)

---

## Why AI Didn't Read Template

### AI Decision-Making Process (Reconstructed)

1. **Instruction Interpretation:**
   - Wizard says "Phase 4: Document Assembly"
   - Wizard shows "Section Structure (8 Official Sections)"
   - Embedded markdown looks like the format to follow

2. **Tool Selection:**
   - No explicit "read template.md" instruction
   - Embedded structure appears complete
   - AI assumes embedded structure IS the template

3. **Generation Logic:**
   - AI uses embedded structure as blueprint
   - AI fills in variables from EPF data
   - AI generates output matching embedded format

4. **Validation Skipped:**
   - No instruction to compare output with template.md
   - No instruction to verify section titles match
   - AI proceeds to write file

**Result:** AI follows wizard.instructions.md literally (embedded structure) instead of reading authoritative template.md file.

---

## Solution: Add Explicit Template Reading Instructions

### Location: `wizard.instructions.md` Phase 4

### Before Line 1513 ("## Phase 4: Document Assembly"), Insert:

```markdown
## Phase 4: Document Assembly

**⚠️ CRITICAL: MUST read template.md file BEFORE generating output.**

### Step 4.0: Load and Validate Template (MANDATORY)

```python
# Read the authoritative template file
template_path = "docs/EPF/outputs/skattefunn-application/template.md"
print(f"Reading template from: {template_path}")

template_content = read_file(template_path)  # Must use read_file tool
print(f"✅ Template loaded ({len(template_content)} characters)")

# Extract section titles from template
import re
section_pattern = r'^## Section \d+:.*$'
template_sections = re.findall(section_pattern, template_content, re.MULTILINE)

# Verify all 8 required sections present
required_sections = [
    "## Section 1: Project Owner and Roles",
    "## Section 2: About the Project", 
    "## Section 3: Background and Company Activities",
    "## Section 4: Primary Objective and Innovation",
    "## Section 5: R&D Content",
    "## Section 6: Project Summary",
    "## Section 7: Work Packages",
    "## Section 8: Total Budget and Estimated Tax Deduction"
]

missing_sections = [s for s in required_sections if s not in template_sections]
if missing_sections:
    raise ValueError(f"Template missing required sections: {missing_sections}")

print("✅ Template validation complete - all 8 sections present")
print("\nSection titles to use (from template.md):")
for section in required_sections:
    print(f"  {section}")

# Extract character limits from template comments
# Example: {{project_info.title_english}} <!-- max 100 characters -->
char_limits = {}
limit_pattern = r'{{(\w+\.[\w\.]+)}}.*?max (\d+) characters'
for match in re.finditer(limit_pattern, template_content):
    field_name = match.group(1)
    limit = int(match.group(2))
    char_limits[field_name] = limit

print(f"\n✅ Extracted {len(char_limits)} character limits from template")
```

**Why This Step Is Critical:**

1. **Single Source of Truth:** template.md is the ONLY authoritative source for section structure
2. **Prevents Drift:** Embedded examples in wizard.instructions.md may become outdated
3. **Validation:** Confirms template hasn't been corrupted or modified
4. **Character Limits:** Extracts exact limits from template comments
5. **Section Titles:** Ensures output matches online form expectations exactly

**⚠️ DO NOT proceed to Step 4.1 until template.md is loaded and validated.**

**⚠️ DO NOT use the embedded structure example below as the template - it is for reference only.**

---

### Step 4.1: Template Variable Mapping (Schema v2.0.0)
```

### After Line 1725 (end of embedded structure), Insert:

```markdown
---

**⚠️ REMINDER: The structure above is a REFERENCE ONLY.**

**To generate the actual document:**

1. ✅ You MUST have read `template.md` in Step 4.0
2. ✅ You MUST use the exact section titles from `template.md`
3. ✅ You MUST replace `{{variables}}` with actual data
4. ✅ You MUST respect character limits from template comments
5. ❌ You MUST NOT invent alternative section numbering (e.g., ## 1., ## 2.)

**Verification Before Writing Output:**

```python
# Before writing output file, verify structure
output_sections = extract_sections_from_output(generated_content)

for i, expected_section in enumerate(required_sections, 1):
    if expected_section not in output_sections:
        raise ValueError(f"Output missing required section: {expected_section}")
    
    actual_position = output_sections.index(expected_section)
    if actual_position != i - 1:
        raise ValueError(f"Section out of order: {expected_section} "
                        f"at position {actual_position}, expected {i-1}")

print("✅ Output structure validated against template.md")
```

---
```

---

## Additional Improvements

### 1. Schema Validation

**Add to Phase 4:** Validate output against `schema.json` before writing file.

```python
# Step 4.X: Validate Output Against Schema
import json

schema_path = "docs/EPF/outputs/skattefunn-application/schema.json"
schema = json.load(open(schema_path))

# Validate structure matches schema requirements
# (use jsonschema library or equivalent)
```

### 2. Pre-Generation Checklist

**Add to Phase 4 start:**

```markdown
**Pre-Generation Checklist:**

- [ ] ✅ Template.md loaded and parsed
- [ ] ✅ All 8 section titles extracted from template
- [ ] ✅ Character limits extracted from template comments
- [ ] ✅ Template variables mapped to EPF data
- [ ] ✅ Work packages generated from selected KRs
- [ ] ✅ Budget reconciliation complete

**If ANY checkbox is unchecked, DO NOT proceed to generation.**
```

### 3. Post-Generation Validation

**Add after file write:**

```python
# After writing output file
output_path = f"{instance_path}/outputs/skattefunn-application/{filename}"
output_content = read_file(output_path)

# Verify all required sections present
for section_title in required_sections:
    if section_title not in output_content:
        raise ValueError(f"Generated file missing section: {section_title}")

# Verify character limits respected
for field, limit in char_limits.items():
    # Extract field content and verify length
    # (implementation depends on field format)

print("✅ Output validation complete")
```

---

## Prevention Strategy

### Design Principle: Explicit Over Implicit

**Old Pattern (Implicit):**
- Show example structure in instructions
- Assume AI will follow it
- No verification AI read authoritative source

**New Pattern (Explicit):**
- **Instruct** AI to read authoritative file
- **Verify** AI loaded file successfully
- **Validate** AI extracted structure correctly
- **Confirm** output matches authoritative source

### Implementation Checklist

For ANY wizard that generates structured output:

1. **Identify authoritative source file** (template.md, schema.json)
2. **Add explicit read instruction** ("Read file X, extract structure Y")
3. **Add validation step** ("Verify structure matches requirements")
4. **Add pre-generation checklist** ("Confirm all sources loaded")
5. **Add post-generation validation** ("Verify output matches source")
6. **Mark embedded examples clearly** ("This is reference only, not authoritative")

---

## Lessons Learned

### For Wizard Design

1. **Never embed structure directly** - always reference external authoritative file
2. **Always include explicit read instructions** - don't assume AI will infer
3. **Always validate before proceeding** - catch errors early
4. **Mark examples clearly** - prevent confusion with authoritative sources

### For AI Assistant Execution

1. **Question embedded structures** - ask "Is this the authoritative source?"
2. **Look for file references** - if instructions mention a file, read it
3. **Validate assumptions** - don't proceed if uncertain about source
4. **Prefer explicit over implicit** - read files even if structure is shown

### For Testing

1. **Test first-time execution** - don't assume wizard works without testing
2. **Validate output format** - compare with authoritative sources
3. **Check validator feedback** - use automated validation when available
4. **User testing catches gaps** - real usage reveals missing instructions

---

## Recommended Actions

### Immediate (Block Future Failures)

1. ✅ **Add Step 4.0 to wizard.instructions.md** (template reading)
2. ✅ **Add validation checkpoints** (pre/post generation)
3. ✅ **Mark embedded structure as reference only**

### Short-Term (Improve Process)

4. ⏳ **Create wizard testing protocol** (validate new wizards before release)
5. ⏳ **Add schema validation step** (verify output against schema.json)
6. ⏳ **Document wizard design principles** (explicit > implicit)

### Long-Term (Prevent Class of Errors)

7. ⏳ **Standardize wizard structure** (all wizards follow same pattern)
8. ⏳ **Create wizard template** (reusable structure with validation built-in)
9. ⏳ **Automated wizard testing** (CI/CD validation of wizard outputs)

---

## Conclusion

**Root Cause:** Missing explicit instruction to read `template.md` file.

**Why It Happened:** Wizard instructions embedded structure example that AI mistook for authoritative template.

**Impact:** First generation produced non-compliant output, requiring regeneration.

**Solution:** Add explicit Step 4.0 instructing AI to read and validate template.md before generating output.

**Prevention:** Apply "Explicit Over Implicit" design principle to all wizards - never assume AI will infer file reading requirements.

**Status:** Analysis complete, ready to update wizard.instructions.md with fixes.
