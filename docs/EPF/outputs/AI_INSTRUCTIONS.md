# ⚠️ CRITICAL: AI Agent Instructions for EPF Output Generators

**FOR AI ASSISTANTS ONLY - READ THIS FIRST BEFORE GENERATING ANY OUTPUT**

---

## 🚨 MANDATORY: Always Use the Wizard-First Approach

When a user asks you to generate an EPF output (context sheet, investor memo, SkatteFUNN application, etc.), you **MUST**:

### ✅ CORRECT Approach (Use EPF Wizard)

1. **Read** `wizard.instructions.md` in the generator directory
2. **Follow** the phases sequentially (Phase 0 → Phase 1 → ... → Final Phase)
3. **Extract** EPF data as specified in the wizard
4. **Synthesize** content using the wizard's synthesis rules
5. **Use** the `template.md` structure if provided
6. **Validate** output using `validator.sh`

**Example:**
```bash
# Step 1: Read the wizard
cat docs/EPF/outputs/skattefunn-application/wizard.instructions.md

# Step 2: Follow each phase in the wizard
# Phase 0: Pre-flight checks
# Phase 1: EPF data extraction
# Phase 2: Content synthesis
# ...

# Step 3: Validate
bash docs/EPF/outputs/skattefunn-application/validator.sh output.md
```

### ❌ WRONG Approach (Custom Scripts)

**DO NOT:**
- ❌ Create your own Python/JavaScript generator scripts
- ❌ Invent your own synthesis logic
- ❌ Skip the wizard and go straight to output generation
- ❌ Use a different template structure than specified
- ❌ Ignore the validator.sh requirements

**Why this is wrong:**
1. Your custom logic will NOT match the validated EPF methodology
2. Output will fail validation (validator.sh checks specific structure)
3. You'll miss critical phases (like Phase 0.5 interactive selection)
4. Content synthesis rules in wizard are battle-tested (e.g., Frascati compliance)
5. You break consistency across all EPF instances

---

## 🎯 Why Wizards Exist

Each `wizard.instructions.md` file contains:

1. **Validated methodology** - Battle-tested generation logic (1,000-4,000 lines)
2. **Compliance rules** - E.g., Frascati Manual compliance for SkatteFUNN
3. **Synthesis patterns** - How to transform EPF → External format
4. **Interactive phases** - User decision points (e.g., selecting Key Results)
5. **Validation requirements** - What the validator.sh expects

**These are NOT suggestions - they are requirements.**

---

## 📋 How to Use Wizards Correctly

### Step-by-Step Process

1. **User Request:** "Generate a SkatteFUNN application"

2. **Your First Action:** Read the wizard
   ```bash
   cat docs/EPF/outputs/skattefunn-application/wizard.instructions.md
   ```

3. **Understand Structure:**
   - Count phases (e.g., Phase 0-5)
   - Identify interactive steps (e.g., Phase 0.5)
   - Note required EPF sources (north_star, roadmap, etc.)

4. **Execute Phases Sequentially:**
   ```
   Phase 0: Pre-flight Validation
   - Check EPF files exist
   - Validate TRL data present
   - Check required fields
   
   Phase 0.5: Interactive Selection (if applicable)
   - Present options to user
   - Get confirmation before proceeding
   
   Phase 1: EPF Data Extraction
   - Load YAML files
   - Parse according to wizard specs
   
   Phase 2: Content Synthesis
   - Apply synthesis rules from wizard
   - Transform EPF language → Output language
   
   Phase 3: Document Assembly
   - Use template.md structure
   - Insert synthesized content
   
   Phase 4: Validation
   - Run validator.sh
   - Fix any errors
   ```

5. **Generate Output:**
   - Follow exact template.md structure
   - Place in correct location: `_instances/{product}/outputs/{generator}/`
   - Name according to convention: `{product}-{generator}-{date}.md`

6. **Validate:**
   ```bash
   bash validator.sh path/to/output.md
   ```

---

## 🔍 Template.md Usage

If a generator has `template.md`, you MUST:

1. **Use its exact section structure**
   - Section 1, Section 2, etc.
   - Subsection numbering (8.1, 8.2, etc.)
   - Required headers

2. **Follow variable placeholders**
   - `{{variable_name}}` format
   - Populate from EPF data extraction

3. **Respect character limits**
   - Noted as `*[Max 100 characters]*`
   - Validator will check these

4. **Include all required tables**
   - Budget tables in specific formats
   - Traceability sections
   - Cost breakdowns

---

## 💡 When You're Tempted to Write Custom Code

**STOP and ask:**

1. ❓ "Is there a wizard.instructions.md for this?"
   - **YES** → Follow it, don't create custom logic
   - **NO** → Ask user if this is a new generator (then follow GENERATOR_GUIDE.md)

2. ❓ "Can I simplify by skipping phases?"
   - **NO** → Each phase exists for a reason (validation, user input, compliance)

3. ❓ "The wizard is long (1,800 lines), can I summarize?"
   - **NO** → Long = comprehensive. Read it all. Details matter.

4. ❓ "Can I use my own synthesis logic?"
   - **NO** → Wizard synthesis rules ensure compliance (e.g., Frascati, investor standards)

---

## 🚀 Example: SkatteFUNN Application Generation

### ❌ What You Did (WRONG)

```python
# Created generate_application.py with custom logic
def synthesize_background(epf_data):
    # Made up my own synthesis rules
    background = f"Current industry situation..."
    return background
```

**Problems:**
- Custom synthesis doesn't match Frascati Manual requirements
- Missing Phase 0.5 interactive KR selection
- Wrong Section 7 structure (no R&D Challenges subsection)
- Budget tables don't match template.md format
- Validator fails with 18 errors

### ✅ What You Should Do (CORRECT)

1. Read wizard:
   ```bash
   cat docs/EPF/outputs/skattefunn-application/wizard.instructions.md
   ```

2. Follow Phase 0:
   - Validate EPF instance has required files
   - Check TRL data exists (2-7 range)
   - Verify org info, timeline, budget

3. Follow Phase 0.5:
   - Present eligible Key Results to user
   - Get user selection (which KRs to include)
   - STOP and wait for confirmation

4. Follow Phase 1-5:
   - Extract EPF data using wizard's parsing rules
   - Synthesize using wizard's Frascati-compliant patterns
   - Assemble using template.md exact structure
   - Allocate budget using wizard's formulas

5. Validate:
   ```bash
   bash validator.sh output.md
   ```
   **Result:** 0 errors (passes validation)

---

## 📝 Special Cases

### Interactive Phases (e.g., Phase 0.5)

Some wizards have **mandatory interactive phases**:

```
Phase 0.5: Interactive Key Result Selection
⚠️ STOP HERE - DO NOT PROCEED WITHOUT USER INPUT
```

**What to do:**
1. Present options to user clearly
2. Explain why selection matters
3. Wait for explicit confirmation
4. Document selected items
5. Continue to next phase

**DO NOT:**
- Skip this phase
- Make selections on behalf of user
- Use "default" selections without asking

### Missing EPF Data

If wizard requires EPF fields that don't exist:

**CORRECT:**
1. Stop generation
2. Report missing fields to user
3. Explain what's needed and why
4. Offer to help populate EPF first

**WRONG:**
- Make up placeholder data
- Skip validation
- Generate incomplete output

---

## 🎓 Learning Resources

Before generating ANY output, read:

1. **This file** (`AI_INSTRUCTIONS.md`) - You're reading it now ✓
2. **Generator's README.md** - Quick reference for that generator
3. **wizard.instructions.md** - Complete generation methodology
4. **GENERATOR_GUIDE.md** - If building new generators

**Time investment:** 10-15 minutes reading saves hours of rework.

---

## ✅ Checklist Before Starting

Before you generate any EPF output, confirm:

- [ ] I've read wizard.instructions.md for this generator
- [ ] I understand all phases (0 through final)
- [ ] I've identified any interactive phases
- [ ] I know which EPF files are required
- [ ] I've checked template.md structure (if exists)
- [ ] I know where validator.sh is located
- [ ] I understand the output file naming convention
- [ ] I'm ready to follow the wizard, not invent my own logic

---

## 🆘 When to Deviate from Wizard

**Answer: Never, unless:**

1. **Bug in wizard** - Then report it, don't fix it silently
2. **New generator** - Then follow GENERATOR_GUIDE.md to create proper wizard
3. **Wizard explicitly says** "or use your own approach" - It won't say this

**If you think you found a valid reason to skip the wizard:**
1. STOP
2. Explain to user why you think deviation is needed
3. Get explicit permission
4. Document the deviation in output

---

## 🎯 Success Criteria

You've succeeded when:

✅ Output passes `validator.sh` with 0 errors
✅ User confirms content matches their expectations  
✅ Output structure matches `template.md` exactly
✅ All phases in `wizard.instructions.md` were followed
✅ EPF traceability section references correct source files
✅ You can explain which wizard phase generated each section

---

## 🔗 Related Documentation

- [`GENERATOR_GUIDE.md`](./GENERATOR_GUIDE.md) - Building new generators
- [`VALIDATION_README.md`](./VALIDATION_README.md) - Understanding validators
- [`QUICK_START.md`](./QUICK_START.md) - User-facing quick start

---

**Remember: EPF wizards are not suggestions - they are the validated, tested, compliant way to generate outputs. Follow them always.**

**Last Updated:** 2026-01-08  
**Applies To:** All EPF output generators (v1.0+)
