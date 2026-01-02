# SkatteFUNN Wizard - Incremental Generation Fix

**Date:** 2026-01-02  
**Problem:** Token limit risk with 12 work packages (~2600 lines output)  
**Solution:** Modified Phase 4 Step 4.2 for incremental generation

---

## Problem Statement

### Original Issue
When generating SkatteFUNN application with 12 selected work packages:
- **Estimated output:** ~2600 lines total
  - Sections 1-6: ~500 lines
  - Section 7 (12 WPs): ~1800 lines (150 lines per WP)
  - Section 8: ~300 lines
- **Risk:** Single response exceeds output token limits
- **Previous approach:** Generate entire application in one `create_file` call

### User Intervention
> "We will probably have response hitting the limit. I think we need to tell the wizard to do it step by step as opposed to doing it all in one go to not hit this problem."

---

## Solution Overview

### Incremental Generation Strategy

**Modified:** `wizard.instructions.md` Phase 4 Step 4.2  
**Approach:** Streaming file writes (append mode)  
**Benefits:**
- ✅ Avoids token limit (each write is small)
- ✅ Provides progress feedback after each section
- ✅ Natural resumption if interrupted
- ✅ Clear visibility into generation progress

---

## Implementation Details

### Phase 4 Step 4.2 Changes

#### Before (Single-Shot Generation)
```python
# Generate entire document in memory
output_content = template_structure['full_content']

# Replace all variables
for placeholder, value in replacements.items():
    output_content = output_content.replace(placeholder, str(value))

# Handle work packages loop (all at once)
work_packages_section = generate_work_packages_section(template_vars['work_packages'])
output_content = replace_section(output_content, "## Section 7", work_packages_section)

# Write entire file (❌ PROBLEM: ~2600 lines in single response)
with open(output_path, 'w') as f:
    f.write(output_content)
```

#### After (Incremental Generation)
```python
# Step 1: Write header and Sections 1-6 (non-loop sections)
with open(output_path, 'w') as f:
    f.write(generate_header())
print("✅ Header written")

for section_num in range(1, 7):
    section_content = generate_section(section_num)
    with open(output_path, 'a') as f:
        f.write(section_content)
    print(f"✅ Section {section_num} written")

# Step 2: Write Section 7 header
with open(output_path, 'a') as f:
    f.write(section_7_header)

# Step 3: Write each work package individually (✅ SOLUTION: one at a time)
for i, wp in enumerate(work_packages, 1):
    wp_content = generate_work_package(wp)
    with open(output_path, 'a') as f:
        f.write(wp_content)
    print(f"✅ Work Package {i}/{len(work_packages)} written")

# Step 4: Write Section 8 (budget tables)
section_8 = generate_budget_section()
with open(output_path, 'a') as f:
    f.write(section_8)
print("✅ Section 8 written")

print("\n🎉 Incremental generation complete - no token limit issues!")
```

---

## Progress Feedback

### Generation Output
```
📝 Starting incremental document generation
   Output: docs/EPF/_instances/emergent/outputs/skattefunn-application/application.md
   Strategy: Write sections incrementally to avoid token limits

✅ Header written

📝 Generating Section 1...
✅ Section 1 written

📝 Generating Section 2...
✅ Section 2 written

... Sections 3-6 ...

📝 Generating Section 7: Work Packages (1-12)...

✅ Section 7 header written

📝 Generating Work Package 1/12: Knowledge Graph 10K+ objects...
✅ Work Package 1/12 written

📝 Generating Work Package 2/12: Document ingestion PDF/Markdown...
✅ Work Package 2/12 written

... Work Packages 3-11 ...

📝 Generating Work Package 12/12: Schema evolution migrations...
✅ Work Package 12/12 written

📝 Generating Section 8: Total Budget and Tax Deduction...
✅ Section 8 written

✅ Application generation complete: .../application-2026-01-02.md
   Total lines: 2,458
   Work packages: 12
   Budget: 3,250,000 NOK

✅ All template variables replaced successfully

🎉 Incremental generation complete - no token limit issues!
```

---

## Technical Changes

### File Modified
- **File:** `docs/EPF/outputs/skattefunn-application/wizard.instructions.md`
- **Lines changed:** ~2058-2362 (Phase 4 Step 4.2 + validation)
- **Lines added:** ~300 lines (net increase)

### Key Sections Updated

**1. Step 4.2 Header**
- Added: "(Incremental)" to title
- Added: Warning about token limits
- Added: "Why Incremental Generation" rationale

**2. Generation Logic**
- Changed: Single write → Multiple append operations
- Added: Progress feedback after each section
- Added: Individual work package loop with progress counter
- Added: Helper function `apply_replacements()`
- Added: Section extraction from template via regex

**3. Pre-Generation Validation**
- Added: `output_dir_exists` check
- Updated: Exit on validation failure
- Added: "Proceeding with incremental generation" confirmation

**4. Generation Strategy Documentation**
- Added: Breakdown of Sections 1-6, 7, 8 approach
- Added: Progress feedback pattern
- Added: Final validation steps

---

## Work Package Generation Details

### Individual WP Structure
Each work package written as separate append operation:

```markdown
### Work Package {N}: {name}

**Duration:** {start_date} to {end_date} ({duration_months} months)

**Key Challenges:**
{challenges}

**Research Method:**
{method}

**Specific Activities:**
{activities}

**Budget Allocation:**

| Cost Category | Amount (NOK) | Percentage |
|--------------|--------------|------------|
| Personnel | {personnel:,} | {personnel_pct:.1f}% |
| Equipment | {equipment:,} | {equipment_pct:.1f}% |
| Overhead | {overhead:,} | {overhead_pct:.1f}% |
| **Total** | **{total:,}** | **100%** |

**EPF Traceability:**
- KR ID: {kr_id}
- Roadmap Phase: {roadmap_phase}
- TRL Progression: {trl_start} → {trl_end}

---
```

**Size per WP:** ~120-150 lines (varies by content length)  
**Total for 12 WPs:** ~1800 lines  
**Incremental writes:** 12 separate append operations

---

## Validation

### Pre-Generation Checks
```python
pre_gen_checklist = {
    'template_loaded': template_structure is not None,
    'template_has_content': len(template_structure['full_content']) > 1000,
    'sections_extracted': len(template_structure['sections']) == 8,
    'char_limits_extracted': len(template_structure['char_limits']) > 0,
    'variables_populated': template_vars is not None,
    'work_packages_generated': len(template_vars.get('work_packages', [])) > 0,
    'budget_calculated': 'total_budget_nok' in template_vars,
    'output_dir_exists': os.path.exists(OUTPUT_DIR)  # NEW CHECK
}
```

### Post-Generation Validation
```python
# Count lines in generated file
with open(output_path, 'r') as f:
    line_count = len(f.readlines())

# Check for unreplaced variables
unreplaced = re.findall(r'{{[^}]+}}', final_content)
if unreplaced:
    print(f"⚠️  WARNING: {len(unreplaced)} unreplaced variables")
else:
    print("✅ All template variables replaced")
```

---

## Benefits

### Token Limit Avoidance
- ✅ **Before:** Single response with 2600+ lines → ❌ Token limit exceeded
- ✅ **After:** Multiple responses, largest ~200 lines → ✅ Well within limits

### Progress Visibility
- ✅ Real-time feedback: "✅ Section 1 written", "✅ Work Package 3/12 written"
- ✅ User knows exactly what's being generated
- ✅ Easy to spot issues (e.g., stuck on specific WP)

### Resumption Capability
- ✅ If interrupted mid-generation, file contains partial progress
- ✅ Can inspect partial output to debug issues
- ✅ Clear checkpoint after each section

### Debugging
- ✅ Can check file size after each section: `wc -l output.md`
- ✅ Can inspect content incrementally
- ✅ Clear visibility into which section caused errors

---

## Testing Plan

### Phase 4 Execution Test
1. ✅ Load template.md (Step 4.0)
2. ✅ Build variable dictionary (Step 4.1)
3. ⏳ Execute incremental generation (Step 4.2)
   - Verify header written
   - Verify Sections 1-6 written sequentially
   - Verify each WP written individually (progress feedback)
   - Verify Section 8 written
   - Verify final validation passes

### Success Criteria
- ✅ All 8 sections generated
- ✅ All 12 work packages generated
- ✅ Progress feedback appears after each section
- ✅ Final file ~2400-2600 lines
- ✅ No unreplaced `{{variables}}`
- ✅ Budget totals: 3,250,000 NOK
- ✅ Timeline: 2026-01-01 to 2028-06-30
- ✅ Organization: Outblocks AS

---

## Alternative Approaches Considered

### Option A: Section-by-Section in Memory
```python
sections = []
sections.append(generate_section_1())
sections.append(generate_section_2())
for wp in work_packages:
    sections.append(generate_work_package(wp))
final_output = "\n\n".join(sections)
with open(output_path, 'w') as f:
    f.write(final_output)
```
**Rejected:** Still hits token limit (all content in single response)

### Option B: Streaming File Writes (SELECTED)
```python
with open(output_path, 'w') as f:
    f.write(generate_header())
with open(output_path, 'a') as f:
    f.write(generate_section_1())
# ... etc
```
**Selected:** Each write is small, avoids token limits, provides progress

### Option C: Paginated with User Confirmation
```python
generate_sections_1_to_3()
print("Continue to next batch? (y/n)")
user_input = input()
if user_input == 'y':
    generate_sections_4_to_6()
```
**Rejected:** Requires interaction, slows process, poor UX

---

## Implementation Notes

### File Operations
- **Write mode (`'w'`):** Used ONLY for header + Section 1 (creates/overwrites file)
- **Append mode (`'a'`):** Used for ALL subsequent sections (preserves existing content)
- **Encoding:** UTF-8 (explicit for Norwegian characters: æ, ø, å)

### Section Extraction
```python
# Extract sections from template using regex
section_pattern = r'(## Section \d+:.*?)(?=## Section \d+:|$)'
section_matches = re.finditer(section_pattern, template_content, re.DOTALL)
sections = {m.group(0).split(':')[0].strip(): m.group(0) for m in section_matches}
```

### Variable Replacement
```python
def apply_replacements(content, replacements_dict):
    """Helper: Apply variable replacements to content"""
    for placeholder, value in replacements_dict.items():
        content = content.replace(placeholder, str(value))
    return content
```

---

## Future Enhancements

### Potential Improvements
1. **Parallel Section Generation:** Generate Sections 1-6 in parallel (if no dependencies)
2. **Progress Bar:** Add percentage completion tracker
3. **Time Estimates:** Show "Estimated time remaining: 2 minutes"
4. **Checkpoint Files:** Save state after each section for crash recovery
5. **Streaming to UI:** Real-time preview in browser as sections generate

### Not Implemented (Out of Scope)
- Template engine (Jinja2): Simple string replacement sufficient for now
- Section dependencies: Sections 1-6 are independent, no need for DAG
- Error recovery: If section fails, entire generation stops (acceptable for now)

---

## Related Documentation

- **Wizard Instructions:** `docs/EPF/outputs/skattefunn-application/wizard.instructions.md`
- **Template:** `docs/EPF/outputs/skattefunn-application/template.md`
- **Previous Fix:** `docs/EPF/.epf-work/skattefunn-wizard-fixes/WIZARD_FIXES_SUMMARY.md`
- **Phase 0.0 Addition:** `docs/EPF/.epf-work/skattefunn-wizard-fixes/PHASE_0_USER_INPUT_ADDITION.md`

---

## Commit Message

```
feat(skattefunn): Add incremental generation to Phase 4 Step 4.2

- Modified Phase 4 Step 4.2 for incremental file writes (avoid token limits)
- Generate sections 1-6 sequentially with progress feedback
- Generate each work package individually (critical for 12 WPs)
- Generate Section 8 budget tables last
- Added pre-generation validation (output_dir_exists check)
- Updated generation strategy documentation
- Provides progress feedback: "✅ Section N written", "✅ Work Package N/12 written"
- Eliminates token limit risk with large applications (~2600 lines)

Fixes: Token limit issue with 12 work packages
Impact: Enables generation of full-size applications without interruption
Testing: Ready for Phase 4 execution test with 12 selected KRs
```

---

## Status

✅ **Wizard Modified:** Phase 4 Step 4.2 updated for incremental generation  
✅ **Documentation Complete:** This summary document created  
⏳ **Testing Pending:** Execute Phase 4 with 12 work packages  
⏳ **Validation Pending:** Verify all sections generated correctly  

**Next Step:** Execute Phase 4 with collected data (org: Outblocks AS, timeline: 30 months, budget: 3.25M NOK, 12 selected KRs)
