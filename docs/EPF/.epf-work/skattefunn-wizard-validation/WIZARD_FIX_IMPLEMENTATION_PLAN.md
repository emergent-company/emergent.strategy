# SkatteFUNN Wizard Fix - Implementation Plan

**Date:** 2 January 2026  
**Root Cause Analysis:** WIZARD_FAILURE_ROOT_CAUSE_ANALYSIS.md  
**Target File:** docs/EPF/outputs/skattefunn-application/wizard.instructions.md

---

## Changes Required

### Change 1: Add Step 4.0 (Template Loading) - BEFORE Line 1513

**Location:** Before "## Phase 4: Document Assembly" heading

**Insert:**

```markdown
## Phase 4: Document Assembly

**⚠️ CRITICAL: MUST read template.md file BEFORE generating output.**

### Step 4.0: Load and Validate Template (MANDATORY)

**Purpose:** Load the authoritative template file and extract structure/limits.

**Why This Step Exists:** The embedded structure example in Step 4.1 is for REFERENCE ONLY. The actual authoritative source is `template.md`. Without reading this file, the AI will generate non-compliant output.

```python
# Read the authoritative template file
template_path = "docs/EPF/outputs/skattefunn-application/template.md"
print(f"📖 Reading template from: {template_path}")

# MUST use read_file tool - do not skip this step
template_content = read_file(template_path)
print(f"✅ Template loaded ({len(template_content)} characters, {template_content.count(chr(10))} lines)")

# Extract section titles from template using regex
import re
section_pattern = r'^## Section \d+:.*$'
template_sections = re.findall(section_pattern, template_content, re.MULTILINE)

print(f"✅ Found {len(template_sections)} sections in template")

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

# Validate template structure
missing_sections = []
for section_title in required_sections:
    if section_title not in template_content:
        missing_sections.append(section_title)

if missing_sections:
    print("❌ Template validation failed - missing sections:")
    for section in missing_sections:
        print(f"   - {section}")
    raise ValueError(f"Template incomplete: {len(missing_sections)} sections missing")

print("✅ Template validation complete - all 8 sections present")
print("\n📋 Section titles to use (from template.md):")
for i, section in enumerate(required_sections, 1):
    print(f"   {i}. {section}")

# Extract character limits from template comments
# Format: {{variable}} <!-- max N characters -->
# Example: {{project_info.title_english}} <!-- max 100 characters -->
char_limits = {}
limit_pattern = r'{{([^}]+)}}[^<]*<!-- max (\d+) characters -->'
for match in re.finditer(limit_pattern, template_content):
    field_name = match.group(1)
    limit = int(match.group(2))
    char_limits[field_name] = limit

print(f"\n✅ Extracted {len(char_limits)} character limits from template")
if char_limits:
    print("📏 Character limits found:")
    for field, limit in sorted(char_limits.items())[:5]:  # Show first 5
        print(f"   - {field}: {limit} chars")
    if len(char_limits) > 5:
        print(f"   ... and {len(char_limits) - 5} more")

# Store for use in generation
template_structure = {
    'sections': required_sections,
    'char_limits': char_limits,
    'full_content': template_content
}

print("\n⚠️  IMPORTANT: The structure embedded in Step 4.1 below is for REFERENCE ONLY.")
print("⚠️  You MUST use the section titles extracted above from template.md.")
print("⚠️  DO NOT invent alternative section numbering (e.g., ## 1., ## 2.).")
```

**Validation Checklist Before Proceeding:**

- [ ] ✅ template.md file read successfully
- [ ] ✅ All 8 section titles extracted
- [ ] ✅ Character limits extracted from comments
- [ ] ✅ Template structure stored in memory
- [ ] ⚠️ Understood that Step 4.1 embedded structure is REFERENCE ONLY

**If ANY checkbox is unchecked, DO NOT proceed to Step 4.1.**

---

```

**Note:** This insert happens BEFORE the current "### Template Variable Mapping" heading.

---

### Change 2: Add Warning After Embedded Structure - AFTER Line 1725

**Location:** After the embedded structure example ends (after "**EPF Version:** 2.2.0" line)

**Insert:**

```markdown
```

---

**⚠️ CRITICAL REMINDER: The structure above is a REFERENCE ONLY.**

**The authoritative source is `template.md` (loaded in Step 4.0).**

### Step 4.2: Generate Output Using Template Structure

**To generate the actual document, you MUST:**

1. ✅ Use the exact section titles from `template_structure['sections']` (Step 4.0)
2. ✅ Replace `{{variables}}` with actual data from `template_vars`
3. ✅ Respect character limits from `template_structure['char_limits']`
4. ✅ Preserve all template formatting (tables, headers, lists)
5. ❌ **DO NOT** invent alternative section numbering (e.g., "## 1.", "## 2.")
6. ❌ **DO NOT** use the embedded structure as the template

**Pre-Generation Validation:**

```python
# Before writing output, verify you have everything needed
pre_gen_checklist = {
    'template_loaded': template_structure is not None,
    'sections_extracted': len(template_structure['sections']) == 8,
    'char_limits_extracted': len(template_structure['char_limits']) > 0,
    'variables_populated': template_vars is not None,
    'work_packages_generated': len(template_vars.get('work_packages', [])) > 0,
    'budget_calculated': 'total_budget_nok' in template_vars
}

print("\n🔍 Pre-Generation Validation:")
all_passed = True
for check_name, passed in pre_gen_checklist.items():
    status = "✅" if passed else "❌"
    print(f"   {status} {check_name}")
    if not passed:
        all_passed = False

if not all_passed:
    raise ValueError("Pre-generation validation failed. Cannot proceed.")

print("\n✅ All pre-generation checks passed")
print("📝 Ready to generate output using template structure")
```

**Output Generation Algorithm:**

```python
# Read template.md content (already loaded in Step 4.0)
output_content = template_structure['full_content']

# Replace all {{variable}} placeholders with actual values
for var_path, value in template_vars.items():
    # Handle nested variables (e.g., organization.name)
    if isinstance(value, dict):
        for sub_key, sub_value in value.items():
            placeholder = f"{{{{{var_path}.{sub_key}}}}}"
            output_content = output_content.replace(placeholder, str(sub_value))
    else:
        placeholder = f"{{{{{var_path}}}}}"
        output_content = output_content.replace(placeholder, str(value))

# Handle Handlebars loops ({{#each work_packages}})
# (Implementation depends on template structure - use proper Handlebars parser)

# Verify all required sections present in output
print("\n🔍 Verifying output structure:")
for section_title in template_structure['sections']:
    if section_title not in output_content:
        raise ValueError(f"Output missing required section: {section_title}")
    print(f"   ✅ {section_title}")

print("\n✅ Output structure validated")
```

**Post-Generation Validation:**

```python
# After generating output_content, validate before writing file

# 1. Check all sections present
for section_title in required_sections:
    if section_title not in output_content:
        raise ValueError(f"Generated content missing section: {section_title}")

# 2. Check section order
section_positions = []
for section_title in required_sections:
    pos = output_content.find(section_title)
    section_positions.append((section_title, pos))

section_positions.sort(key=lambda x: x[1])
for i, (title, pos) in enumerate(section_positions):
    expected_title = required_sections[i]
    if title != expected_title:
        raise ValueError(f"Section order incorrect at position {i}: "
                        f"found '{title}', expected '{expected_title}'")

# 3. Check character limits (sample fields)
for field_name, limit in char_limits.items():
    # Extract field content from output_content
    # (Implementation depends on field format)
    # Verify length <= limit
    pass

print("✅ Post-generation validation complete")
print("✅ Output ready to write to file")
```

---
```

---

### Change 3: Update Phase 4 Heading - REPLACE Line 1513

**Old:**
```markdown
## Phase 4: Document Assembly
```

**New:**
```markdown
(This heading is now part of Change 1 - remove the old heading at line 1513)
```

---

## Implementation Steps

1. **Backup Current File:**
   ```bash
   cp docs/EPF/outputs/skattefunn-application/wizard.instructions.md \
      docs/EPF/outputs/skattefunn-application/wizard.instructions.md.backup
   ```

2. **Apply Change 1:** Insert Step 4.0 before line 1513

3. **Apply Change 2:** Insert validation section after line 1725

4. **Apply Change 3:** Remove duplicate Phase 4 heading

5. **Verify Line Numbers:** Re-count after insertions (lines will shift)

6. **Test Changes:** Run wizard end-to-end to validate fixes

---

## Expected Outcome

After these changes, when AI executes Phase 4:

1. **Step 4.0:** AI reads template.md file using read_file tool
2. **Step 4.0:** AI extracts 8 section titles from template
3. **Step 4.0:** AI extracts character limits from template comments
4. **Step 4.1:** AI sees embedded structure marked as "REFERENCE ONLY"
5. **Step 4.2:** AI generates output using actual template structure
6. **Step 4.2:** AI validates output matches template before writing file

**Result:** Output will have correct section structure matching template.md exactly.

---

## Verification Checklist

After implementing changes, verify:

- [ ] ✅ Step 4.0 instructs AI to read template.md
- [ ] ✅ Step 4.0 extracts section titles using regex
- [ ] ✅ Step 4.0 validates all 8 sections present
- [ ] ✅ Step 4.1 embedded structure marked as "REFERENCE ONLY"
- [ ] ✅ Step 4.2 validates output before writing file
- [ ] ✅ No duplicate Phase 4 headings
- [ ] ✅ All line references updated in documentation

---

## Testing Protocol

1. **Reset State:** Start fresh wizard execution
2. **Run Phase 0-3:** Complete data extraction
3. **Enter Phase 4:** Observe AI behavior at Step 4.0
4. **Verify:** AI calls read_file tool for template.md
5. **Verify:** AI extracts section titles correctly
6. **Verify:** AI generates output using template structure
7. **Verify:** Output has "## Section 1:" not "## 1."
8. **Run Validator:** Confirm validation passes

**Success Criteria:**
- ✅ AI reads template.md in Step 4.0
- ✅ AI uses template section titles in output
- ✅ Validator accepts output structure
- ✅ No regeneration required

---

## Rollback Plan

If changes cause issues:

1. Restore backup:
   ```bash
   cp docs/EPF/outputs/skattefunn-application/wizard.instructions.md.backup \
      docs/EPF/outputs/skattefunn-application/wizard.instructions.md
   ```

2. Document issue in WIZARD_FAILURE_ROOT_CAUSE_ANALYSIS.md

3. Investigate alternative fix approach
