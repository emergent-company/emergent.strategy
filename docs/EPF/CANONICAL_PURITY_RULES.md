# ⚠️ CANONICAL EPF PURITY RULES - CRITICAL FOR AI AGENTS

## ABSOLUTE RULES - NEVER VIOLATE THESE

### 🚫 Rule 1: NO Instance-Specific Data in Canonical EPF

**The canonical EPF repository (eyedea-io/epf-canonical-definition) must NEVER contain:**

- ❌ Product names (twentyfirst, huma-blueprint-ui, lawmatics, emergent, etc.)
- ❌ Instance-specific validation reports or results
- ❌ Product-specific examples in documentation
- ❌ References to specific organizations, teams, or projects
- ❌ Instance metadata or cycle artifacts
- ❌ Validation results mentioning specific products
- ❌ Screenshots or examples showing product-specific content
- ❌ Links to product repositories or documentation

**This includes ALL directories:**
- ❌ `/docs/` - Only framework documentation, no product mentions
- ❌ `/schemas/` - Only generic schemas
- ❌ `/scripts/` - Only generic validation tools
- ❌ `/wizards/` - Only generic guidance
- ❌ `/templates/` - Only generic templates
- ✅ `/_instances/` - Can contain README.md explaining the structure (no actual instances)

### ✅ Rule 2: What CAN Be in Canonical EPF

**The canonical EPF repository SHOULD contain:**

- ✅ Generic framework documentation
- ✅ Reusable templates and schemas
- ✅ Validation scripts (that work for ANY instance)
- ✅ Wizards with generic guidance
- ✅ Examples using FICTIONAL product names (e.g., "AcmeCorp", "ExampleProduct")
- ✅ Architecture and philosophy documentation
- ✅ Version history and changelog
- ✅ Maintenance and contribution guidelines

### 🎯 Rule 3: Where Instance Data BELONGS

**Instance-specific data MUST live in product repositories:**

```
Product Repo Structure:
/Users/nikolaifasting/code/<product-name>/
└── docs/
    └── EPF/                          ← EPF instance (subtree)
        ├── VERSION                   ← EPF framework version
        ├── templates/                ← Framework templates
        ├── schemas/                  ← Framework schemas
        ├── scripts/                  ← Framework scripts
        └── _instances/               ← Instance data folder
            └── <product-name>/       ← Product-specific content
                ├── _meta.yaml        ✅ Product metadata
                ├── READY/            ✅ Strategy artifacts
                ├── FIRE/             ✅ Feature definitions
                ├── AIM/              ✅ Assessment reports
                └── cycles/           ✅ Cycle reports
```

**Validation reports for a product:**
- ✅ Create at: `/Users/nikolaifasting/code/<product>/docs/EPF_VALIDATION_REPORT.md`
- ❌ NEVER at: `/Users/nikolaifasting/code/EPF/docs/EPF_VALIDATION_REPORT.md`

## 🤖 For AI Coding Agents - PRE-FLIGHT CHECKLIST

**⚠️ STOP - Before creating/modifying ANY file, complete this checklist:**

### Step 1: Identify Repository Context
```bash
pwd  # Check current directory
```

**Am I in a product repo with EPF subtree?**
- Path looks like: `/Users/.../code/{product}/docs/EPF/`
- YES → I can create files in `_instances/{product}/` subdirectories
- NO → Proceed to Step 2

**Am I in the canonical EPF repository?**
- Path looks like: `/Users/.../code/epf/` or similar
- YES → **MAXIMUM CAUTION** - Proceed to Step 2
- NO → Ask user for clarification

### Step 2: Content Analysis - What Type of File Is This?

**A) Framework Improvement** (schema, template, wizard, validator enhancement)
- Examples: New schema field, template update, wizard phase addition
- Location: ✅ Canonical EPF (`docs/EPF/schemas/`, `docs/EPF/outputs/{generator}/`)
- Proceed to Step 3 for validation

**B) Generated Output** (application, memo, report, artifact)
- Examples: SkatteFUNN application, investor memo, calibration report
- Location: ✅ Product repo (`_instances/{product}/outputs/{generator}/`)
- ❌ NEVER in canonical EPF

**C) Learning Document** (proposal, analysis, retrospective, notes)
- Examples: Improvement proposals, mistake analysis, planning docs
- Location: ✅ Product repo (`_instances/{product}/ad-hoc-artifacts/`)
- ❌ NEVER in canonical EPF

**D) Preparation Document** (quick reference, checklist, planning)
- Examples: Generator preparation notes, execution checklists
- Location: ✅ Product repo (`_instances/{product}/outputs/{generator}/`)
- ❌ NEVER in instance root or canonical EPF

### Step 3: Canonical Purity Validation (If Type A - Framework Improvement)

**Question 3.1: Does this content mention specific products?**
```bash
# Check for product names
grep -iE "twentyfirst|huma-blueprint|lawmatics|emergent|epf-fresh-test" proposed-file.md
```
- If matches found → ❌ STOP! Use generic examples (AcmeCorp, ExampleProduct)
- If no matches → Proceed to Question 3.2

**Question 3.2: Does this contain validation results or instance data?**
- Check for: "45/45 checks passed", "Product X validation", specific metrics
- If YES → ❌ STOP! This belongs in product repo
- If NO → Proceed to Question 3.3

**Question 3.3: Could this apply to ANY product using EPF?**
- If specific to one product/organization → ❌ STOP! Move to `_instances/{product}/ad-hoc-artifacts/`
- If generic and reusable → ✅ ALLOWED in canonical EPF
- If uncertain → **ASK USER** before proceeding

### Step 4: File Location Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│ START: What am I creating?                                  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │ Is it product-specific?│
            └────────────────────────┘
                 │              │
                YES            NO (framework improvement)
                 │              │
                 ▼              ▼
    ┌────────────────────┐   ┌────────────────────────┐
    │ Generated output?  │   │ Does it mention        │
    └────────────────────┘   │ specific products?     │
         │          │         └────────────────────────┘
        YES        NO              │              │
         │          │             YES            NO
         │          ▼              │              │
         │   ┌──────────────┐     ▼              ▼
         │   │ Preparation? │   ❌ STOP        ✅ Canonical
         │   └──────────────┘   Use generic      EPF OK
         │      │          │     examples
         │     YES        NO
         │      │          │
         ▼      ▼          ▼
    outputs/  outputs/  ad-hoc-
    {gen}/    {gen}/    artifacts/
```

### Step 5: Final Validation Before File Creation

**Checklist:**
- [ ] File location matches content type (output vs learning vs framework)
- [ ] No instance root clutter (no loose files at `_instances/{product}/`)
- [ ] No canonical contamination (no product data in `docs/EPF/` outside `_instances/`)
- [ ] If canonical: No product names, no specific validation results, no org references
- [ ] If uncertain: **Asked user for confirmation**

**If all checked → Proceed with file creation**  
**If any unchecked → STOP and reconsider location**

## 🔍 Common Violations & Corrections

### Violation Example 1: Validation Report
```markdown
❌ WRONG: /Users/nikolaifasting/code/EPF/docs/EPF_v1.12.0_VALIDATION_COMPLETE.md
Content: "twentyfirst: 45/45 checks passed..."

✅ CORRECT: /Users/nikolaifasting/code/twentyfirst/docs/EPF_VALIDATION_REPORT.md
Content: "This product's EPF validation results..."
```

### Violation Example 2: Product-Specific Examples
```markdown
❌ WRONG (in canonical EPF):
"For example, in the twentyfirst instance, we define group structures..."

✅ CORRECT (in canonical EPF):
"For example, in a portfolio management product, you might define group structures..."
```

### Violation Example 3: Screenshots
```markdown
❌ WRONG: Screenshot showing twentyfirst UI in EPF docs
✅ CORRECT: Generic mockup or fictional product example
```

## 🚨 What To Do If You Violate This Rule

If you accidentally create instance-specific content in canonical EPF:

1. **STOP immediately** - Do not commit or push
2. **Remove the file(s):** `rm path/to/file`
3. **Check git status:** `git status` (should be clean)
4. **Move content to correct location:** Product repo's `docs/` directory
5. **Update any references** to point to correct location
6. **Document the mistake** in self-learning log

## 📚 Why These Rules Exist

### Technical Reasons:
- **Maintainability:** Framework updates shouldn't break due to instance-specific code
- **Reusability:** Clean framework can be instantiated in new products without cleanup
- **Git History:** Framework changes shouldn't be polluted with instance changes
- **Traceability:** Clear separation between framework evolution and instance usage

### Operational Reasons:
- **Multi-Product Scale:** Framework serves 4+ products, must remain neutral
- **Distribution:** Framework is distributed via git subtree - instance data causes conflicts
- **Version Control:** Framework versions track capabilities, not usage results
- **Knowledge Graph:** Clean separation enables proper graph traversal and querying

## 📖 Related Documentation

- `MAINTENANCE.md` - Section: "Framework vs. Instance Separation"
- `README.md` - Section: "What is EPF?"
- `_instances/README.md` - Structure guidelines

## 🎓 Training Examples

### Example 1: Writing Documentation
```markdown
❌ "Run validation on emergent: cd /path/to/emergent && ./scripts/health-check.sh"
✅ "Run validation on your product: cd /path/to/product/docs/EPF && ./scripts/health-check.sh"
```

### Example 2: Creating Scripts
```bash
❌ echo "Checking twentyfirst instance..."
✅ echo "Checking instance: ${instance_name}..."
```

### Example 3: Schema Examples
```yaml
❌ product_name: "twentyfirst"
✅ product_name: "your-product-name"
```

## ⚡ Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  CANONICAL EPF PURITY CHECKLIST                             │
├─────────────────────────────────────────────────────────────┤
│  ❌ Product names (twentyfirst, emergent, lawmatics, etc.)  │
│  ❌ Validation reports with specific results                │
│  ❌ Organization/team-specific references                   │
│  ❌ Screenshots showing product UI                          │
│  ❌ Links to product repos                                  │
│                                                              │
│  ✅ Generic templates and schemas                           │
│  ✅ Fictional examples (AcmeCorp, ExampleProduct)           │
│  ✅ Framework documentation                                 │
│  ✅ Reusable validation scripts                             │
│  ✅ Architecture guides                                     │
└─────────────────────────────────────────────────────────────┘

GOLDEN RULE: If it mentions a real product, it belongs in that product's repo.
```

---

**Last Updated:** 2025-12-18
**Version:** 1.0
**Status:** MANDATORY - No exceptions
