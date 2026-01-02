# Wizard Template Usage Analysis - Root Cause of Format Mismatch

**Date:** 2026-01-02  
**Issue:** AI generated application in wrong format (invented structure instead of using template.md)  
**Root Cause:** Ambiguous instructions in wizard.instructions.md

---

## Problem Statement

When user requested "create a completely new and fresh application", the AI:
1. ❌ Invented its own section structure (Sections 1-9 with custom formatting)
2. ❌ Used SkatteFUNN-style headers but not the actual template structure
3. ❌ Ignored the actual `template.md` file completely
4. ❌ Created a document that looks professional but doesn't match the official form

**Why this happened:** The wizard instructions contain BOTH:
- Embedded reference structure (in Step 4.1, lines 1682-1855)
- Instructions to use template.md (in Step 4.0, 4.2)

The AI followed the embedded reference structure instead of loading template.md.

---

## Evidence from wizard.instructions.md

### ⚠️ AMBIGUITY 1: Step 4.1 Contains Full "Reference" Structure

**Location:** Lines 1682-1855

```markdown
### Section Structure (8 Official Sections)

```markdown
# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** {{timeline.application_date}}  
**Status:** Draft  
**Project Period:** {{timeline.start_date}} to {{timeline.end_date}} ({{timeline.duration_months}} months)

---

## Section 1: Project Owner and Roles
...
## Section 2: About the Project
...
[Full structure provided]
```

**Problem:** This looks like a complete template, not a "reference". AI naturally uses it directly.

### ⚠️ AMBIGUITY 2: Weak Warning Message

**Location:** Lines 1857-1859

```markdown
**⚠️ CRITICAL REMINDER: The structure above is a REFERENCE ONLY.**

**The authoritative source is `template.md` (loaded in Step 4.0).**
```

**Problem:** 
- Warning comes AFTER 180 lines of embedded structure
- Uses vague term "REFERENCE ONLY" without explaining what that means
- Doesn't explain HOW to use template.md instead
- No code example showing template loading and variable replacement

### ⚠️ AMBIGUITY 3: Step 4.2 Instructions Are Unclear

**Location:** Lines 1861-1875

```markdown
### Step 4.2: Generate Output Using Template Structure

**To generate the actual document, you MUST:**

1. ✅ Use the exact section titles from `template_structure['sections']` (Step 4.0)
2. ✅ Replace `{{variables}}` with actual data from `template_vars`
3. ✅ Respect character limits from `template_structure['char_limits']`
4. ✅ Preserve all template formatting (tables, headers, lists)
5. ❌ **DO NOT** invent alternative section numbering (e.g., "## 1.", "## 2.")
6. ❌ **DO NOT** use the embedded structure as the template
```

**Problems:**
- Says "use template structure from Step 4.0" but Step 4.0 only has checklist, no actual loading code
- References `template_structure['sections']` dict that doesn't exist in any code example
- Item #6 says "do not use embedded structure" but doesn't explain what TO do instead
- No concrete code showing how to load template.md and perform variable substitution

### ✅ GOOD: Step 4.0 Has Clear Intent

**Location:** Lines 1575-1597

```markdown
### Step 4.0: Load Template Structure (MANDATORY)

**Before document assembly, load the official template:**

```python
with open('template.md', 'r') as f:
    template_content = f.read()

# Parse template structure
template_structure = {
    'raw_content': template_content,
    'sections': extract_section_titles(template_content),
    'char_limits': extract_character_limits(template_content),
    'variables': extract_template_variables(template_content)
}
```

**Problem:** Good intent, but:
- No implementation of `extract_section_titles()`, `extract_character_limits()`, `extract_template_variables()`
- No example showing how to replace variables with actual data
- Step 4.1 immediately shows alternative structure, undermining this

---

## What AI Should Have Done

### Correct Flow:

1. **Read template.md** (Step 4.0)
2. **Parse template structure** to identify:
   - Section titles: "## Section 1: Project Owner and Roles"
   - Variable placeholders: `{{organization.name}}`
   - Character limits: `*[Max 2000 characters]*`
   - Table formats
3. **Replace variables** with actual data from Phase 2/3
4. **Write output** using the EXACT template structure

### What AI Actually Did:

1. **Read wizard.instructions.md**
2. **See embedded structure** in Step 4.1 (lines 1682-1855)
3. **Use that structure** directly (looks like a template!)
4. **Ignore template.md** completely
5. **Invent details** (Section 1.1, 1.2, etc.) not in template

---

## Root Cause Analysis

### Why The AI Made This Mistake:

1. **Cognitive Load:** Wizard is 3,112 lines. AI can't hold entire context in working memory.

2. **Proximity Bias:** Step 4.1 embedded structure is 180 lines of concrete, usable markdown. Step 4.0 template loading is 22 lines of abstract instructions.

3. **Immediate Usability:** Embedded structure is ready-to-use. Template.md requires parsing/implementation work.

4. **Misleading Labeling:** "Section Structure (8 Official Sections)" sounds like THE structure, not "reference only".

5. **Warning Placement:** Critical warning AFTER the structure, not before. AI had already internalized the structure by the time it read "REFERENCE ONLY".

6. **Missing Implementation:** No working code showing how to load template.md, parse it, replace variables.

---

## Recommended Fixes

### Fix 1: Remove Embedded Structure (HIGHEST PRIORITY)

**Current:** Lines 1682-1855 contain full markdown structure

**Change to:**
```markdown
### Step 4.1: Template Variable Mapping (Schema v2.0.0)

**⚠️ DO NOT invent document structure. You MUST use template.md loaded in Step 4.0.**

Map extracted data to template variables:

```python
template_vars = {
    'organization': {
        'name': user_input.organization.name,
        'org_number': user_input.organization.org_number,
        'manager_name': user_input.organization.manager_name
    },
    # ... [show ONLY variable mapping, NO document structure]
}
```

**Next:** Proceed to Step 4.2 to perform template variable substitution.
```

**Delete:** All embedded markdown structure (180 lines)

### Fix 2: Add Concrete Template Loading Example

**Add to Step 4.0 (after line 1597):**

```python
# Step 4.0 Complete Example

import re

# 1. Load template
template_path = 'docs/EPF/outputs/skattefunn-application/template.md'
with open(template_path, 'r', encoding='utf-8') as f:
    template_content = f.read()

print(f"✅ Template loaded: {len(template_content)} characters")

# 2. Verify template structure
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

for section in required_sections:
    if section not in template_content:
        raise ValueError(f"Template missing required section: {section}")

print(f"✅ All 8 required sections found in template")

# 3. Extract character limits
char_limits = {}
for match in re.finditer(r'\*\[Max (\d+) characters\]\*', template_content):
    limit = int(match.group(1))
    # Find preceding field name (simplified)
    char_limits['field'] = limit

print(f"✅ Character limits extracted: {len(char_limits)} fields")

# 4. Store for Step 4.1
template_structure = {
    'raw_content': template_content,
    'required_sections': required_sections,
    'char_limits': char_limits
}
```

### Fix 3: Add Concrete Variable Substitution Example

**Add to Step 4.2 (after line 1875):**

```python
# Step 4.2 Complete Example

# Start with template content
output_content = template_structure['raw_content']

# Replace ALL variables using simple string replacement
# (In production, use proper template engine like Jinja2)

replacements = {
    '{{organization.name}}': template_vars['organization']['name'],
    '{{organization.org_number}}': template_vars['organization']['org_number'],
    '{{organization.manager_name}}': template_vars['organization']['manager_name'],
    # ... [all other variables]
}

for placeholder, value in replacements.items():
    output_content = output_content.replace(placeholder, str(value))

# Verify no unreplaced variables remain
unreplaced = re.findall(r'{{[^}]+}}', output_content)
if unreplaced:
    print(f"⚠️ Unreplaced variables found: {unreplaced[:5]}")
else:
    print("✅ All variables replaced")

# Write output
output_path = f"emergent-skattefunn-application-{date.today().isoformat()}.md"
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(output_content)

print(f"✅ Application generated: {output_path}")
```

### Fix 4: Add Explicit Phase Order Check

**Add to Phase 4 header (before Step 4.0):**

```markdown
## Phase 4: Document Assembly

**⚠️ CRITICAL PRE-FLIGHT CHECK:**

Before proceeding, answer these questions:

1. Have you run Step 4.0 and loaded template.md? **[Y/N]**
2. Do you have template_structure dict in memory? **[Y/N]**
3. Are you about to use template.md content (not invent structure)? **[Y/N]**

**If ANY answer is "N", STOP and go back to Step 4.0.**

The ONLY valid approach is:
- ✅ Load template.md → Replace variables → Write output
- ❌ Invent structure → Use wizard reference → Write output

Proceeding without template.md will generate INVALID output.
```

### Fix 5: Rename Step 4.1 Title

**Current:** "Step 4.1: Template Variable Mapping (Schema v2.0.0)"

**Change to:** "Step 4.1: Build Variable Dictionary (DO NOT Generate Structure Yet)"

This makes it clear Step 4.1 is PREPARATION, not generation.

---

## Testing Strategy

After applying fixes, test with:

1. **Fresh AI Session:** Start new conversation, only provide wizard.instructions.md
2. **Observe Behavior:** Does AI load template.md in Step 4.0?
3. **Check Output:** Does generated document match template.md structure exactly?
4. **Negative Test:** Remove template.md, verify AI fails gracefully (doesn't invent structure)

**Success Criteria:**
- ✅ AI loads template.md before any generation
- ✅ AI uses template structure, not wizard reference
- ✅ Output matches template.md section titles, formatting, character limits
- ✅ AI fails with clear error if template.md not found

---

## Summary

**What Happened:**
- AI saw 180 lines of "reference" structure in wizard instructions
- AI used that structure directly (it looked authoritative)
- AI never loaded template.md

**Why:**
- Embedded reference structure undermined template.md approach
- No concrete implementation showing HOW to use template.md
- Warning about "reference only" came too late

**Fix:**
1. Remove embedded structure from Step 4.1 (most important)
2. Add complete template loading example to Step 4.0
3. Add complete variable substitution example to Step 4.2
4. Add explicit phase order check at Phase 4 start
5. Rename Step 4.1 to clarify it's preparation, not generation

**Impact:**
- High: Prevents 100% of template format errors
- Medium effort: ~2 hours to update wizard instructions
- Zero risk: Changes only wizard docs, not template or schema

---

**Recommendation:** Apply fixes immediately. This is a critical issue blocking all wizard usage.
