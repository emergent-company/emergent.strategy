# EPF Repository Maintenance & Consistency Guide

## 🚧 Framework vs. Instance Separation (Critical Rule)

**EPF is composed of two strictly separated domains:**

- **Framework:**
  - Located in the main `docs/EPF/` directory (excluding `_instances/`)
  - Contains only generic templates, schemas, documentation, and wizards
  - **Never** includes product-specific or instance data
  - Must remain generic and reusable for any product or team

- **Instances:**
  - Located in `docs/EPF/_instances/`
  - Contains product-specific implementations, cycle artifacts, and instance metadata
  - Must follow the structure and schemas defined by the framework
  - **Never** modifies or overrides framework templates or schemas

**Mixing framework and instance data is strictly prohibited.**

### Enforcement Rules

1. **Framework files must not reference or include instance-specific data, IDs, or examples.**
2. **Instance folders must not contain framework templates, schemas, or wizards except as references for structure.**
3. **All validation, traceability, and consistency checks for instances must use the framework’s schemas and structure as the source of truth.**
4. **Any change that mixes framework and instance data must be rejected and corrected immediately.**
5. **AI agents and contributors must always check which domain they are operating in before making changes.**

**Warning:** Mixing these domains will break traceability, data integrity, and the ability to maintain the EPF as an executable knowledge graph. Always keep framework and instance content strictly separated.

---

### 📁 Temporary & Working Documents Convention

**EPF maintains a clean separation between framework files and temporary/working documents.**

#### The `.epf-work/` Directory

**Purpose:** Temporary documents that support EPF development but are NOT part of the framework itself.

**Location:** `.epf-work/` (dot-prefix indicates hidden/non-framework directory)

**What Goes Here:**
- ✅ Analysis documents (e.g., `AI_INSTRUCTION_FILES_ANALYSIS.md`)
- ✅ Review documents (e.g., `EPF_DOCUMENTATION_REVIEW.md` - may move here)
- ✅ Todo lists and task tracking documents
- ✅ Draft proposals and RFC-style documents
- ✅ Investigation notes and findings
- ✅ Temporary implementation notes
- ✅ Migration planning documents

**What Does NOT Go Here:**
- ❌ Framework documentation (goes in `docs/`)
- ❌ Templates (goes in `templates/`)
- ❌ Schemas (goes in `schemas/`)
- ❌ Wizards (goes in `wizards/`)
- ❌ Scripts (goes in `scripts/`)
- ❌ Guides (goes in `docs/guides/`)
- ❌ Instance data (goes in `_instances/` in product repos)

#### Naming Convention

**Format:** `{CATEGORY}_{DESCRIPTIVE_NAME}.md`

**Categories:**
- `ANALYSIS_` - Investigation and analysis documents
- `REVIEW_` - Review and assessment documents
- `PROPOSAL_` - Proposals for framework changes
- `RFC_` - Request for Comments documents
- `TODO_` - Task tracking and checklists
- `MIGRATION_` - Migration planning and notes
- `NOTES_` - General investigation notes

**Examples:**
- `.epf-work/ANALYSIS_AI_INSTRUCTION_FILES.md`
- `.epf-work/REVIEW_EPF_DOCUMENTATION_2025-12-28.md`
- `.epf-work/PROPOSAL_FEATURE_ECOSYSTEM_RATIONALIZATION.md`
- `.epf-work/TODO_STRUCTURAL_IMPROVEMENTS.md`

#### Lifecycle Management

**Creation:**
- AI agents and contributors should automatically create working documents in `.epf-work/`
- No need to ask permission - this is the designated space for temporary work

**Retention:**
- Documents stay in `.epf-work/` during active development
- Once work is complete and framework updated, documents can be:
  - Moved to `docs/` if they become permanent documentation
  - Archived (if valuable for future reference)
  - Deleted (if no longer needed)

**Git Tracking:**
- `.epf-work/` is tracked in git (not in `.gitignore`)
- Provides transparency into framework development process
- Future contributors can see how decisions were made

#### Why This Matters

**Before this convention:**
- Temporary documents scattered throughout framework structure
- Confusion about what's framework vs. what's working material
- Review documents (like `EPF_DOCUMENTATION_REVIEW.md`) polluting root directory
- No clear place to put analysis and proposal documents

**After this convention:**
- Clear separation: framework files vs. working documents
- Predictable location for temporary materials
- Easier to understand what's part of EPF framework vs. what's supporting documentation
- AI agents know where to create investigation documents without polluting framework

#### Related Rules

**Canonical Purity:**
- `.epf-work/` documents MUST NOT contain product-specific information (unless explicitly analyzing a product integration pattern)
- Working documents follow same purity rules as framework files
- If a working document needs to reference specific products for analysis, use generic names or clear "Example:" prefixes

**Version Control:**
- Working documents do NOT have version fields
- Git history tracks evolution of working documents
- Reference framework version if needed: "Analysis for EPF v2.0.0"

---

### 🤖 AI Agent Pre-Action Checklist (MANDATORY)

**Before creating, modifying, or documenting ANYTHING in the canonical EPF repository, AI agents MUST verify:**

#### Step 1: Confirm Repository Context
```bash
# Am I in the canonical EPF repository?
pwd  # Should be: /Users/nikolaifasting/code/EPF
     # If in product repo (twentyfirst, emergent, etc.) → Instance-specific content ALLOWED
```

#### Step 2: Check for Instance-Specific Content
```bash
# Does my content mention specific products?
echo "proposed content" | grep -E "twentyfirst|huma-blueprint|lawmatics|emergent|<other-product-names>"
# If match found → STOP! This violates purity rules
```

#### Step 3: Validate Content Type
**Ask yourself:**
- [ ] Is this a validation report or result? → ❌ Belongs in product repo
- [ ] Does this contain product-specific examples? → ❌ Use fictional examples (AcmeCorp, ExampleProduct)
- [ ] Does this reference specific organizations/teams? → ❌ Keep generic
- [ ] Could this apply to ANY product/organization? → ✅ Can proceed if generic

#### Step 4: Determine Correct Location
**Decision Tree:**
```
Is content instance-specific? (mentions real products, validation results, etc.)
  ├─ YES → Create in: /path/to/<product-repo>/docs/
  │         Example: /Users/nikolaifasting/code/twentyfirst/docs/EPF_VALIDATION_REPORT.md
  │
  └─ NO → Is it framework-level documentation/templates?
           ├─ YES → Allowed in canonical EPF
           │         Check: Uses only generic examples/language
           │
           └─ NO → STOP and ask: Where does this truly belong?
```

#### Step 5: Final Verification
Before committing ANY file in canonical EPF:
- [ ] File contains NO real product names
- [ ] File contains NO validation results for specific products
- [ ] File contains NO organization-specific references
- [ ] File uses fictional examples if examples are needed
- [ ] File could be used as-is by any product/organization

**If ANY checkbox is unchecked → STOP and move content to product repository.**

### 📋 Common Violations & Corrections (Learn from Past Mistakes)

#### Violation 1: Validation Reports in Canonical EPF
```markdown
❌ WRONG: /Users/nikolaifasting/code/EPF/docs/EPF_v1.12.0_VALIDATION_COMPLETE.md
Content: "twentyfirst: 45/45 checks passed, emergent: 45/45 checks passed..."
Why wrong: Mentions real product names, contains instance validation results

✅ CORRECT: /Users/nikolaifasting/code/twentyfirst/docs/EPF_VALIDATION_REPORT.md
Content: "EPF v1.12.0 validation for this product: 45/45 checks passed..."
Why correct: Instance data lives in instance repository
```

#### Violation 2: Product-Specific Examples in Framework Docs
```markdown
❌ WRONG (in canonical EPF documentation):
"For example, in the twentyfirst instance, we define group structures..."

✅ CORRECT (in canonical EPF documentation):
"For example, in a portfolio management product, you might define group structures..."
or
"For example, in the AcmeCorp instance, we define group structures..."
```

#### Violation 3: Screenshots Showing Real Products
```markdown
❌ WRONG: Screenshot showing twentyfirst UI in EPF framework docs
✅ CORRECT: Generic mockup, wireframe, or fictional product screenshot
✅ CORRECT: Screenshot placed in product repo's documentation
```

### 🔍 Quick Reference: Framework vs Instance Content

| Content Type | Canonical EPF | Product Repo | Example |
|--------------|---------------|--------------|---------|
| Templates | ✅ YES | ❌ NO (use from EPF) | `templates/READY/02_strategy_foundations.yaml` |
| Schemas | ✅ YES | ❌ NO (use from EPF) | `schemas/feature_definition_schema.json` |
| Validation Scripts | ✅ YES | ❌ NO (use from EPF) | `scripts/health-check.sh` |
| Generic Documentation | ✅ YES | ✅ YES (product-specific) | Framework: `docs/MAINTENANCE.md`, Product: `docs/SETUP.md` |
| Feature Definitions | ❌ NO | ✅ YES | Product: `_instances/<product>/FIRE/fd-001.yaml` |
| Validation Reports | ❌ NO | ✅ YES | Product: `docs/EPF_VALIDATION_REPORT.md` |
| Product-Specific Examples | ❌ NO | ✅ YES | Product: `docs/examples/group-structures.md` |
| Real Product Names | ❌ NEVER | ✅ YES | Product: `_meta.yaml` → `product_name: "twentyfirst"` |

**GOLDEN RULE:** If it mentions a real product, it belongs in that product's repo, NOT in canonical EPF.

### 📚 Additional Resources

**For comprehensive AI agent guidance, see:**
- [`CANONICAL_PURITY_RULES.md`](./CANONICAL_PURITY_RULES.md) - Detailed rules, examples, and decision trees
- [`README.md`](./README.md) - Quick overview and warning section
- [`_instances/README.md`](./_instances/README.md) - Instance structure guidelines

---

## 🤖 AI Agent Consistency Protocol

**This section defines the complete operating protocol for AI agents maintaining EPF consistency.**

**When to use:** Whenever ANY file in the EPF repository is created, modified, or deleted.

**Purpose:** Ensure the EPF repository remains internally consistent, traceable, and aligned with its framework philosophy at all times.

### 📚 Core Principles to Uphold

#### Lean Documentation
- **Git is the source of truth for versioning** - don't add version fields or change history to YAML files
- **One file per concept** - features, components, artifacts each get their own file
- **Minimal structure** - only include what implementation tools need to consume
- **Let AI infer** - context derivable from git history or related artifacts doesn't need duplication

#### Immutable Ledger Philosophy
- Every git commit is a decision record
- The history of what was tried (including what NOT to do) is valuable organizational memory
- Don't delete history - git handles this

#### Tool-Agnostic Design
- EPF doesn't prescribe implementation tools
- Feature definitions are the interface consumed by external tools
- Structure for parseability, not for specific tool requirements

#### EPF's Information Architecture Hierarchy (4 Levels)

**CRITICAL: EPF covers ONLY Levels 1-2. Levels 3-4 are OUTSIDE EPF scope.**

**The WHY-HOW-WHAT Continuum:** Each level contains overlapping WHY-HOW-WHAT elements. The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence.

| Level | Artifact | WHY-HOW-WHAT | EPF Scope | Owner | Changes | Description |
|-------|----------|--------------|-----------|-------|---------|-------------|
| **1** | **Value Model** | **WHY + HOW** (strategic) | ✅ YES | Product team | Annually or less | WHY: Purpose, value drivers, beneficiaries<br>HOW: Value flows, capabilities, logical structure |
| **2** | **Feature Definition** | **HOW + WHAT** (tactical/strategic) | ✅ YES | Product team | Quarterly or less | Inherits WHY from Level 1<br>HOW: User workflows, scenarios, interactions<br>WHAT: Contexts, outcomes, acceptance criteria (high-level, non-implementation) |
| **3** | **Feature Implementation Spec** | **HOW + WHAT** (technical) | ❌ NO | Engineering team | Monthly | Technical HOW: Architecture, APIs, algorithms<br>Technical WHAT: Specific technologies, endpoints, schemas |
| **4** | **Implemented Feature/Code** | **WHAT** (concrete) | ❌ NO | Engineering team | Daily/weekly | The actual running software: Source code, tests, deployments |

**Handoff Point:** Between Levels 2 and 3 (Product team → Engineering team)

**What This Means for AI Agents:**
- ✅ **DO create/modify:** Value models (WHY + strategic HOW), feature definitions (tactical HOW + strategic WHAT)
- ❌ **DO NOT create/modify:** Technical PRDs, API specs, database schemas, architecture diagrams, source code (technical HOW + technical WHAT)
- ✅ **Feature definitions INCLUDE:** Personas, scenarios, contexts, workflows, acceptance criteria, jobs-to-be-done (strategic WHAT)
- ❌ **Feature definitions DO NOT include:** API endpoints, database tables, technology choices, implementation algorithms (technical WHAT)

**Why This Matters - The Emergence Principle:**
- Each level **overlaps** with the next—they are not discretely separated
- The WHAT from Level 2 (acceptance criteria) becomes the WHY for Level 3 (requirements)
- Value models and feature definitions are **outcome-oriented** (WHY we exist, HOW users succeed, WHAT outcomes they experience)
- Implementation specs and code are **technically prescriptive** (HOW to build it technically, WHAT specific technologies)
- EPF defines strategic WHY + HOW. Engineering defines technical HOW + WHAT.
- **Tight coupling is essential:** "In a well-functioning organism, the parts cannot be too loosely coupled." The complete solution emerges from overlapping, interconnected pieces.

---

### STEP 0: Pre-Flight Decision Gate ⚠️ READ THIS FIRST

**Before proposing OR implementing ANY change to EPF, run this checklist:**

#### Breaking Change Detection

Answer these questions about your proposed change:

- [ ] **Will this remove or rename** a schema field, template section, or core concept?
- [ ] **Will existing YAML files fail validation** after this change?
- [ ] **Will instance owners need to migrate** their files?
- [ ] **Will this change how tools consume** EPF artifacts (parsing, structure, fields)?

**If ANY answer is YES** → 🔴 **BREAKING CHANGE DETECTED**

#### Version Impact Assessment (Required for Breaking Changes)

1. **Read MAINTENANCE.md** "Framework Versioning (EPF vX.Y.Z)" section
2. **Determine version impact:**
   - BREAKING CHANGE = **MAJOR version bump** required (X.0.0)
   - New optional features = **MINOR version bump** (X.Y.0)
   - Bug fixes/clarifications = **PATCH version bump** (X.Y.Z)
3. **Check current version:**
   ```bash
   cat VERSION
   ```

#### Proposal Protocol

**For BREAKING changes:**
1. ✅ **State the change**: "Remove value_propositions field from feature_definition_schema.json"
2. ✅ **State version impact**: "Requires EPF v2.0.0 → v3.0.0 (MAJOR bump)"
3. ✅ **Explain reasoning**: "Per MAINTENANCE.md: incompatible schema change requiring migration"
4. ⏸️ **Wait for approval** of BOTH change AND version bump
5. ✅ **Only then proceed** with implementation

**For NON-BREAKING changes:**
- Proceed normally (STEP 1 onwards)
- Version bump may still be needed (MINOR/PATCH)
- Mention in your proposal if applicable

#### 🚨 CRITICAL RULE

**Never implement breaking changes without discussing version impact first!**

If you catch yourself thinking:
- "I'll just remove this field..."
- "Let's update the schema..."
- "All instances need to change..."

**STOP** → You're likely proposing a MAJOR version bump → Run this checklist!

#### 🚦 Trigger Word Detection

If your proposal includes these words, **STOP and check version impact:**

**Action words (on core concepts/fields):**
- "remove", "delete", "rename", "deprecate"
- "replace", "restructure", "refactor"

**Impact phrases:**
- "breaking", "incompatible", "non-backward-compatible"
- "requires migration", "all instances must", "mandatory update"
- "will fail validation", "no longer valid"

**If detected** → You're likely proposing MAJOR version bump → Run STEP 0 checklist

---

### STEP 1: Detect EPF Changes

When you create, modify, or delete ANY file in the EPF repository:
- Immediately flag this as an EPF change
- Read `MAINTENANCE.md` if you haven't already this session
- Proceed to STEP 2

### STEP 2: Assess Change Impact

Determine the change scope:
- Single artifact modification?
- Schema change?
- New artifact type?
- Feature definition change?
- Workflow/process change?
- Documentation update?
- Terminology change?

### STEP 3: Run Consistency Checks

**Always check these (no exceptions):**

#### 1. Framework Health Check (Automated)

**Run framework integrity validation before committing:**
```bash
./scripts/epf-health-check.sh              # Check framework integrity
./scripts/epf-health-check.sh --fix        # Auto-fix VERSION issues
```

**What it checks:**
- VERSION file consistency across all framework files
- Schema JSON validity
- YAML parsing at framework level
- Documentation structure
- File organization

**Use for:**
- Before framework commits
- After version bumps
- During maintenance

#### 2. Framework Version Consistency ⚠️ AUTOMATED - USE SCRIPT!

- **NEVER manually update version files** - this causes inconsistencies that confuse AI agents!
- EPF version is stored in **one place**: `VERSION` file (single source of truth)
- README.md and other files reference this version via automation
   
- **TO BUMP VERSION:** Use the automated script (prevents inconsistencies):
  ```bash
  ./scripts/bump-framework-version.sh "X.Y.Z" "Release notes describing changes"
  ```

- **NEVER do version bumps manually:**
  - ❌ Don't edit VERSION file directly
  - ❌ Don't edit README.md header directly  
  - ❌ Don't edit MAINTENANCE.md version directly
  - ❌ Don't forget to add "What's New" section to README.md

- **The automated script handles:**
  - Updates VERSION file
  - Updates README.md header
  - Adds "What's New in vX.Y.Z" section to README.md with your release notes
  - Verifies consistency across all files before finishing
  - Provides exact git commit command to use
  - Shows summary of all changes made

- **Verification check after ANY version-related change:**
  ```bash
  grep -E "v[0-9]+\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md
  ```
  All files must show the SAME version! If they don't, version bump was done incorrectly.

- Verify all instance folders (`_instances/*/`) follow the SAME version structure
- **CRITICAL: Check `_meta.yaml` in each instance has matching `epf_version`**
- **CRITICAL: Check all `template_version` fields in instance YAML files match framework version**

#### 3. Instance Health Check (Recommended)

**For product teams working on instance artifacts:**

Run 3-tier validation to assess artifact quality:
```bash
# Tier 1-3 Dashboard (all checks in one)
./scripts/validate-instance.sh _instances/my-product

# Deep analysis by tier:
./scripts/analyze-field-coverage.sh _instances/my-product     # Tier 2: Coverage
./scripts/check-version-alignment.sh _instances/my-product    # Tier 3: Currency
```

**When to run:**
- After creating/updating major artifacts (roadmaps, features)
- Before milestone reviews or stakeholder presentations
- After EPF framework updates
- Quarterly health checks

**What it checks:**
- **Tier 1:** Required fields present (schema compliance)
- **Tier 2:** Optional field coverage (strategic completeness, Grade A-D)
- **Tier 3:** Artifact version vs schema version (currency, CURRENT/BEHIND/STALE/OUTDATED)

**Migration support:**
```bash
# Interactive enrichment (wizard-guided)
./scripts/migrate-artifact.sh path/to/artifact.yaml

# Batch migration (prioritized)
./scripts/batch-migrate.sh _instances/my-product --dry-run
./scripts/batch-migrate.sh _instances/my-product --priority high
```

#### 4. Instance Structure Validation

#### 4. Instance Structure Validation

- Instance folders (`_instances/*/`) MUST contain:
  - `00_north_star.yaml` (organizational foundation)
  - `01_insight_analyses.yaml` (living document)
  - `02_strategy_foundations.yaml` (living document)
  - `03_insight_opportunity.yaml` (cycle artifact)
  - `04_strategy_formula.yaml` (cycle artifact)
  - `05_roadmap_recipe.yaml` (cycle artifact)
  - `feature_definitions/` directory (feature specs - one file per feature)
  - `value_models/` directory (instance-specific value models for all 4 tracks)
  - `workflows/` directory (instance-specific workflow configurations)
  - `mappings.yaml` (instance-specific implementation mappings)
  - `README.md`, `GAP_ANALYSIS.md`, `_meta.yaml` (documentation)
  - `cycles/` directory (archived completed cycles)
- Framework FIRE phase (`/templates/FIRE/`) contains TEMPLATES:
  - `value_models/` with placeholder templates for each track
  - `workflows/` with canonical state machines
  - `mappings.yaml` template
  - `feature_definitions/README.md` with template and guidance
- Action: Ensure instance-specific content is in instance folder, templates stay in framework

#### 5. Feature Definition Validation

- Each feature definition file should:
  - Have a unique `id` (fd-{number})
  - Have a valid `status` (draft | ready | in-progress | delivered)
  - Have `contributes_to` references that exist in value model
  - Have `tracks` that match valid roadmap tracks
  - Have `assumptions_tested` that reference valid assumption IDs
  - NOT have version fields or change history (git handles this)
- Validate against `feature_definition_schema.json` if it exists
- Action: Flag invalid references or suggest fixes

#### 6. Schema ↔ Artifact Alignment

- **BEFORE changing schema**: Run STEP 0 to determine if breaking change
- **If breaking**: Propose version bump before implementation
- If an artifact changed: Does it still match its schema?
- If a schema changed: Do all corresponding artifacts still validate?
- Schema-to-artifact mapping:
  - `insight_opportunity_schema.json` → `03_insight_opportunity.yaml`
  - `strategy_formula_schema.json` → `04_strategy_formula.yaml`
  - `roadmap_recipe_schema.json` → `05_roadmap_recipe.yaml`
  - `value_model_schema.json` → `value_models/*.yaml`
  - `workflow_schema.json` → `workflows/*.yaml`
  - `mappings_schema.json` → `mappings.yaml`
  - `assessment_report_schema.json` → `cycles/*/assessment_report.yaml`
  - `calibration_memo_schema.json` → `cycles/*/calibration_memo.yaml`
- **Automated validation**: Run `./scripts/validate-schemas.sh <instance-path>`
- **Migration help**: Run `./scripts/schema-migration.sh list-schemas`
- Action: Update both sides to maintain alignment. **After schema changes**, migrate ALL instances.

#### 5. Wizard ↔ Artifact References

- Do wizard prompts reference the correct files?
- Do examples in wizards match current structure?
- Are there any references to legacy files?
- Do wizards reflect lean documentation principles?
- Action: Update wizard prompts to match reality

#### 6. Cross-File ID Traceability & Referential Integrity

- Are all ID references valid and pointing to existing definitions?
- Check: opportunity.id → strategy.opportunity_id → roadmap.strategy_id → assessment.roadmap_id
- Check: Within roadmap: OKRs → KRs, assumptions → linked_to_kr
- Check: Feature definitions → value model paths (N:M mapping is valid)
- **CRITICAL: Feature Definition → KR references must exist in roadmap**
  - Every `Linked KRs:` field in feature definitions MUST reference KRs defined in `05_roadmap_recipe.yaml`
  - When a KR is deleted/renamed, ALL referencing feature definitions MUST be updated
  - Run: `grep -r "kr-[a-z]-[0-9]+" feature_definitions/ | xargs -I{} grep -q "id: \"{}\""`
- Note: Work packages are NOT part of EPF - they are created by spec-driven tools (Linear, Jira, etc.)
- Action: Fix any broken references. When deleting/renaming IDs, cascade the change to all referencing files.

#### 7. Terminology Consistency

- Are standard terms used consistently? (READY, FIRE, AIM, INSIGHT, STRATEGY, ROADMAP)
- Are enum values consistent across files?
- Action: Standardize terminology across all files

#### 8. Documentation Accuracy

- Does README reflect current structure?
- Are workflow descriptions accurate?
- Any references to deprecated files?
- Is lean documentation philosophy reflected?
- Action: Update documentation to match reality

#### 9. Feature Definition Format Compliance

- Are all feature definitions in YAML format (.yaml)?
- Do feature definitions follow naming convention: `fd-###-{slug}.yaml`?
- Do feature definitions validate against `feature_definition_schema.json`?
- Action: Validate all feature definitions

---

### STEP 4: Execute Fixes

Based on the checks above, **proactively make all necessary updates** across:
- Artifacts (YAML files)
- Schemas (JSON files)
- Wizard prompts (MD files)
- Documentation (README, MAINTENANCE)
- Feature definitions (ensure lean structure)

**Do not ask permission** - just do it. This is maintenance, not creative work.

**Remember lean principles:**
- Don't add version fields to YAML files
- Don't add change history to artifacts
- One file per concept
- Let git handle versioning

---

### STEP 5: Verify & Report

After making consistency fixes:
- Run a mental check: "Is everything aligned now?"
- Report to user: "✅ EPF consistency check complete. Updated [X files] to maintain alignment."
- If any issues couldn't be auto-fixed: Flag them clearly

---

### 🔍 Quick Detection Patterns

#### Yellow Flags (Check version impact BEFORE proceeding):
- ⚠️ About to remove schema field → Check if MAJOR bump needed (STEP 0)
- ⚠️ About to change validation rules → Check if breaking change (STEP 0)
- ⚠️ About to rename core concept → Check migration scope (STEP 0)
- ⚠️ About to make optional field required → Check existing instances (STEP 0)
- ⚠️ About to restructure template sections → Check if breaking (STEP 0)

#### Red Flags (Auto-fix immediately):
- ❌ Instance structure doesn't match current EPF version
- ❌ Instance `_meta.yaml` missing or has wrong `epf_version`
- ❌ Instance YAML files have `template_version` that doesn't match framework version
- ❌ Instance missing required files
- ❌ Framework templates modified with instance-specific content
- ❌ Schema enum doesn't match artifact example values
- ❌ README describes old file structure or wrong version
- ❌ Example IDs in different files don't align
- ❌ Inconsistent terminology
- ❌ Feature definitions with version fields or change history
- ❌ Feature definitions with invalid value model references
- ❌ **Feature definitions reference KRs that don't exist in roadmap**
- ❌ **Orphan KR references after KR deletion**
- ❌ Complex folder hierarchies where one file per concept would suffice

#### Green Flags (Good to go):
- ✅ All instances follow current EPF version structure
- ✅ Instance `_meta.yaml` exists with correct `epf_version`
- ✅ All `template_version` fields in instance YAMLs match framework version
- ✅ Instance contains populated value_models/, workflows/, mappings.yaml
- ✅ Framework FIRE phase contains only generic templates
- ✅ All references use current file names
- ✅ Traceability chain is intact
- ✅ Feature definitions are lean
- ✅ Feature definitions have valid N:M references to value model
- ✅ Schemas validate their artifacts
- ✅ Examples tell a coherent story
- ✅ No legacy references in active files
- ✅ Wizards reflect lean documentation principles

---

### 📋 Post-Change Checklist

After EVERY EPF change, verify:

- [ ] Does this match the current EPF version structure?
- [ ] Does `_meta.yaml` exist with correct `epf_version`?
- [ ] Do all `template_version` fields match framework version?
- [ ] Are value models/workflows/mappings in correct locations?
- [ ] Does the framework FIRE phase contain only generic templates?
- [ ] Does the instance contain all required directories?
- [ ] Are feature definitions in correct format?
- [ ] Did I update the corresponding schema?
- [ ] Did I update wizard examples?
- [ ] Did I check cross-file references?
- [ ] Did I verify all KR references exist?
- [ ] If I deleted/renamed IDs, did I cascade updates?
- [ ] Did I verify terminology is consistent?
- [ ] Did I update README if needed?
- [ ] Are there any legacy file references?
- [ ] Do the example IDs align across files?
- [ ] Is the traceability chain intact?
- [ ] Do feature definitions follow lean principles?
- [ ] Are feature definition value model references valid?
- [ ] Is the tool-agnostic design preserved?

---

### 🔄 After Framework Version Changes (MANDATORY)

When the framework version is bumped, you MUST:

1. **Immediately check all instances** for version mismatch
2. **Update `_meta.yaml`** in each instance: `epf_version: "{new_version}"`
3. **Update `template_version`** in all instance YAML files that have this field
4. **Run verification command:**
   ```bash
   grep "Repository.*v[0-9]" README.md && \
   grep -E "v[0-9]+\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md && \
   grep -r "epf_version\|template_version" _instances/ --include="*.yaml"
   ```
5. **Commit version sync separately** from content changes

**This is not optional. Version drift breaks traceability and causes confusion.**

---

### 🚨 When to Alert the User

Alert the user (don't just fix) when:
- A change would be **breaking** (requires migration)
- A conceptual inconsistency exists (framework philosophy conflict)
- Multiple valid approaches exist (design decision needed)
- Something seems fundamentally wrong (shouldn't happen)

---

### 💡 Proactive Suggestions

If you notice patterns like:
- Repeated updates in the same area → Suggest structural improvement
- Complex cross-references becoming hard to maintain → Suggest simplification
- Growing file size → Suggest splitting
- Terminology drift → Suggest glossary

---

### 🎓 Learning Mode

Each time you run consistency checks:
- Build a mental model of EPF structure
- Remember common inconsistency patterns
- Get faster at detecting issues
- Anticipate what needs updating

---

### ✅ AI Agent Commitment

**"I will not allow EPF repository changes to leave the system in an inconsistent state. I will automatically maintain alignment across artifacts, schemas, wizards, and documentation with every change. This is my core responsibility when working with the EPF repository."**

**For learning from past mistakes, see:** `.github/instructions/self-learning.instructions.md`

---

## 🔢 Versioning Convention

EPF uses **Semantic Versioning (SemVer)** for both the framework and instances, with clear rules for when to increment each part.

### Framework Versioning (EPF vX.Y.Z)

The EPF framework version is tracked in `README.md` and `MAINTENANCE.md`.

| Version Part | When to Increment | Examples |
|--------------|-------------------|----------|
| **MAJOR (X)** | Breaking changes that require migration of all instances. Fundamental philosophy shifts, removal of core concepts, incompatible schema changes. | v1.0.0 → v2.0.0: Complete restructure of phases |
| **MINOR (Y)** | New features, new artifact types, new optional fields, new wizards. Backward-compatible additions that enhance capability. | v1.9.0 → v1.10.0: Add new agent prompt |
| **PATCH (Z)** | Bug fixes, documentation improvements, schema clarifications, typo fixes. No structural changes. | v1.9.3 → v1.9.4: Fix schema validation issue |

**Current Framework Version:** v2.12.0

**Version History Convention:**
- Document version changes in `README.md` under "What's New in vX.Y.Z"
- For MAJOR versions, provide migration guide
- For MINOR versions, list new features
- For PATCH versions, list fixes

### Instance Versioning

Instances use a **Cycle-Based Versioning** system that tracks both the EPF framework version used and the instance's own evolution.

**Instance Metadata (`_meta.yaml`):**
```yaml
instance:
  product_name: "Product Name"
  epf_version: "1.9.4"          # Framework version this instance follows
  instance_version: "1.0.0"      # Instance's own version
  created_date: "YYYY-MM-DD"
  
  current_cycle:
    cycle_number: 1
    cycle_id: "cycle-001"
    phase: "READY"
```

| Version Part | When to Increment | Examples |
|--------------|-------------------|----------|
| **MAJOR (X)** | Major pivot, fundamental strategy change, North Star revision. Represents a significant strategic shift. | v1.0.0 → v2.0.0: Complete pivot to new market |
| **MINOR (Y)** | New cycle completed, significant learnings incorporated, strategy refinements. | v1.0.0 → v1.1.0: Cycle 1 completed, Cycle 2 started |
| **PATCH (Z)** | Minor updates within a cycle, artifact corrections, data fixes. | v1.0.0 → v1.0.1: Fix typo in OKR target |

### Cycle Numbering

Each EPF cycle is numbered sequentially within an instance:

- **cycle-001, cycle-002, cycle-003...** — Sequential cycle identifiers
- Cycles are archived in `_instances/{product}/cycles/cycle-00X/`
- Active cycle artifacts remain in the instance root until completed

### ID Conventions Within Artifacts

IDs within artifacts use a consistent pattern:

| Artifact Type | Pattern | Example |
|---------------|---------|---------|
| Opportunity | `opp-XXX` | `opp-001` |
| Strategy | `strat-XXX` | `strat-001` |
| Roadmap | `roadmap-XXX` | `roadmap-001` |
| OKR (by track) | `okr-{track}-XXX` | `okr-p-001`, `okr-s-001` |
| Key Result | `kr-{track}-XXX` | `kr-p-001`, `kr-c-002` |
| Assumption | `asm-{track}-XXX` | `asm-p-001`, `asm-o-001` |
| Component | `comp-{track}-XXX` | `comp-p-001`, `comp-c-001` |

> **Note:** Work packages (`wp-*`) are NOT part of EPF. They are created by spec-driven development tools (Linear, Jira, etc.) that consume EPF's Key Results. See `TRACK_BASED_ARCHITECTURE.md` for details.

**Track Prefixes:**
- `p` = Product
- `s` = Strategy
- `o` = Org/Ops
- `c` = Commercial

### Framework-Instance Compatibility

When the EPF framework is updated:

1. **PATCH updates:** Instances remain compatible; no action required.
2. **MINOR updates:** Instances remain compatible; optionally adopt new features.
3. **MAJOR updates:** Instances must migrate; follow migration guide in README.

**Tracking Compatibility:**
- Each instance's `_meta.yaml` records the `epf_version` it follows
- When upgrading, update `epf_version` and document in `migration_notes`

### Version Increment Checklist

**⚠️ IMPORTANT: Use the automated script to bump versions!**

Manual version bumps are error-prone and have caused AI agent confusion. **Always use the automation:**

```bash
# Bump framework version (updates VERSION, README.md, MAINTENANCE.md consistently)
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes describing changes"

# The script automatically:
# - Updates all three version files consistently
# - Adds "What's New in vX.Y.Z" section to README.md
# - Verifies consistency before finishing
# - Shows git commit command to use
```

**Install the pre-commit hook to prevent inconsistent versions:**
```bash
./scripts/install-version-hooks.sh
```

This blocks any commit that would create version inconsistencies across VERSION, README.md, and MAINTENANCE.md.

---

**Before releasing a framework version (automated by script above):**
- [ ] Determine correct version increment (MAJOR/MINOR/PATCH)
- [ ] ✅ VERSION file updated (script does this)
- [ ] ✅ README.md header updated (script does this)
- [ ] ✅ "What's New" section added (script does this)
- [ ] ✅ MAINTENANCE.md version updated (script does this)
- [ ] If MAJOR: provide migration guide
- [ ] Update script version headers if needed (`scripts/validate-schemas.sh`, `scripts/epf-health-check.sh`)
- [ ] **Run health check:** `./scripts/epf-health-check.sh` (must pass before commit)
- [ ] **Verify consistency:** `grep -E "v1\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md` (all must match!)

**Before incrementing an instance version:**
- [ ] Determine correct version increment
- [ ] Update `_meta.yaml` with new `instance_version`
- [ ] If cycle completed: archive cycle artifacts, increment MINOR
- [ ] If major pivot: document reasoning, increment MAJOR

### Automated Version Consistency Check

**MANDATORY:** Run the health check script before committing ANY framework changes:

```bash
# From EPF root (docs/EPF/ in product repos, or repo root in canonical EPF)
./scripts/epf-health-check.sh

# To attempt auto-fixes for version mismatches:
./scripts/epf-health-check.sh --fix

# For verbose output:
./scripts/epf-health-check.sh --verbose
```

The health check validates:
1. **Version Consistency**: VERSION file matches README.md, MAINTENANCE.md, script headers
2. **YAML Parsing**: All YAML files parse without syntax errors
3. **JSON Schemas**: All schema files are valid JSON
4. **Documentation Completeness**: Required docs exist
5. **File Structure**: Required directories exist
6. **FIRE Phase Content**: Canonical templates validate, instance value models check with quality analysis
7. **Instance Validation**: Instance metadata is present and valid
8. **Content Quality Assessment**: Analyzes READY phase artifacts for:
   - Template pattern detection (placeholder content, examples, TODOs)
   - Critical field completeness
   - Strategic depth and specificity
   - Readiness scores (0-100) with letter grades (A-F)
9. **Value Model Structure**: Validates hierarchical balance (added v1.14.0):
   - L1 layers: 3-10 per value model (warn if outside range)
   - L2 components: 3-5 per L1 layer (warn if < 3 or > 8)
   - L3 sub-components: 3-5 per L2 component (warn if < 3 or > 10)
   - Prevents flat models (1 L2 per L1) or over-decomposed models (20+ L3s per L2)

**Content Quality Dashboard:**

The health check now provides a comprehensive quality assessment:
```
Content Quality Assessment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Instance: YourProduct
✓   01_insight_analyses.yaml: 100/100 (Grade: A)
⚠   00_north_star.yaml: 70/100 (Grade: C)
✗   05_roadmap_recipe.yaml: 50/100 (Grade: D) - needs enrichment

Instance average: 73/100 across 6 artifacts

Content Quality Summary:
  Total artifacts analyzed: 6
  High quality (A-B): 2 (33%)
  Medium quality (C): 2 (33%)
  Low quality (D-F): 2 (33%)
```

**For detailed content analysis:**
```bash
# Analyze specific artifact with enrichment recommendations
./scripts/check-content-readiness.sh _instances/YourProduct/READY/00_north_star.yaml

# Analyze entire READY phase
./scripts/check-content-readiness.sh _instances/YourProduct/READY
```

**Exit codes:**
- `0` - All checks passed ✅
- `1` - Critical errors found ❌ (DO NOT COMMIT)
- `2` - Warnings found ⚠️ (Should fix)
- `3` - Missing dependencies

---

**Version:** 1.0  
**Purpose:** Ensure all changes to the EPF repository maintain internal consistency, alignment with the framework philosophy, and proper traceability.

---

## 📦 Instance Structure Migration

### When to Migrate

Instances may need structural updates when:
- The EPF framework introduces new required folders or artifacts
- Health checks report warnings about missing instance structure
- A new EPF version adds recommended organizational patterns
- Instances were created before the complete structure was standardized

### Complete Instance Structure

All EPF instances should follow this directory structure:

```
_instances/{product-name}/
├── _meta.yaml                    # Instance metadata (version, product info)
├── README.md                     # Instance overview and guidance
├── READY/                        # Strategy phase artifacts
│   ├── 00-north-star.yaml
│   ├── 01-insights-opportunities.yaml
│   ├── 02-gap-analysis.yaml
│   ├── 03-strategies.yaml
│   ├── 04-roadmap-recipe.yaml
│   └── 05-okrs.yaml
├── FIRE/                         # Execution phase artifacts
│   ├── feature_definitions/      # Feature definitions (fd-*)
│   ├── value_models/             # Value modeling artifacts
│   └── workflows/                # Workflow definitions
├── AIM/                          # Assessment phase artifacts
│   └── assessment_reports/       # Cycle assessments
├── ad-hoc-artifacts/             # Unstructured work products
│   └── README.md                 # Guidelines for ad-hoc content
├── outputs/                      # Generated outputs (context-sheets, memos, etc.)
├── cycles/                       # Archived completed cycles
│   ├── cycle-001/
│   ├── cycle-002/
│   └── ...
```

### Migration Process

#### Step 1: Check Current Structure

Run the EPF health check to identify missing folders:

```bash
cd /path/to/product-repo
./docs/EPF/scripts/epf-health-check.sh
```

Look for warnings like:
```
⚠️  Instance Validation: Missing folders: FIRE, AIM
```

#### Step 2: Add Missing Folders

Use the `--update` flag to safely add missing folders to an existing instance:

```bash
./docs/EPF/scripts/create-instance-structure.sh --update {product-name}
```

**What happens during migration:**
- ✅ Creates any missing folders from the complete structure
- ✅ Adds `.gitkeep` files to empty folders for git tracking
- ✅ Adds `ad-hoc-artifacts/README.md` template if missing
- ✅ Preserves all existing files (_meta.yaml, README.md, artifacts)
- ✅ Reports exactly what was added vs. what was skipped
- ✅ Provides appropriate commit instructions

**Example Output:**
```
Update mode: Adding missing folders to existing instance
✅ Added directories:
   + AIM
   + ad-hoc-artifacts
   + cycles

ℹ️  Skipped existing directories:
   ✓ READY (already exists)
   ✓ FIRE (already exists)
   ...

🎉 Instance updated successfully! Added 3 missing folder(s).
```

#### Step 3: Commit Changes

Follow the commit instructions provided by the script:

```bash
git add docs/EPF/_instances/{product-name}
git commit -m "EPF: Update {product-name} instance with missing folders"
git push
```

#### Step 4: Verify Completion

Run the health check again to confirm all warnings are resolved:

```bash
./docs/EPF/scripts/epf-health-check.sh
```

Expected result:
```
Passed:          45
Warnings:        0
Errors:          0

━━━ ALL HEALTH CHECKS PASSED ━━━
```

### Safety Guarantees

The migration process is designed to be completely safe:

1. **Non-Destructive:** Only adds folders, never removes or overwrites
2. **Preserves Existing Files:** Skips `_meta.yaml`, `README.md`, and all artifacts
3. **Idempotent:** Can run multiple times safely (will skip what exists)
4. **Clear Reporting:** Shows exactly what changed and what was preserved
5. **Validation:** Health checks confirm structure before and after

### Migration Best Practices

- **Run health checks first** to understand what's missing
- **Review the update output** before committing
- **Commit promptly** after successful migration
- **Document any manual changes** needed in instance README
- **Verify with health check** after committing
- **Update `_meta.yaml`** `epf_version` if migrating to new framework version

### Troubleshooting

**Problem:** Script reports "Instance does not exist"  
**Solution:** Remove `--update` flag to create new instance, or check product name spelling

**Problem:** Folders exist but health check still warns  
**Solution:** Ensure folders are committed to git (`.gitkeep` files should exist)

**Problem:** Script reports errors during creation  
**Solution:** Check write permissions, ensure you're in product repo with `docs/EPF/` subtree

### Related Documentation

- [Health Check Enhancement](docs/HEALTH_CHECK_ENHANCEMENT.md) - Structural validation details
- [Create Instance Structure Script](scripts/create-instance-structure.sh) - Implementation details

---

## 🔒 Core Principle

**Every change to the EPF repository MUST be followed by a comprehensive consistency check across all artifacts, schemas, and documentation.**

## ✅ Mandatory Pre-Change Review

Before making ANY change to the EPF repository, review:

1. **What is the scope of change?**
   - Single artifact modification?
   - Schema update?
   - New artifact type?
   - Workflow/process change?
   - Conceptual framework change?

2. **What files will be directly affected?**

3. **What files might be indirectly affected?** (References, examples, schemas)

## 🔄 Post-Change Consistency Checklist

After ANY modification to EPF files, **ALWAYS** run through this complete checklist:

### 1. Data Artifacts ↔ Schema Alignment

**Check:** Do all YAML artifacts validate against their corresponding schemas?

**Files to Review:**
- [ ] `templates/READY/00_north_star.yaml` ↔ `schemas/north_star_schema.json`
- [ ] `templates/READY/01_insight_analyses.yaml` ↔ `schemas/insight_analyses_schema.json`
- [ ] `templates/READY/02_strategy_foundations.yaml` ↔ `schemas/strategy_foundations_schema.json`
- [ ] `templates/READY/03_insight_opportunity.yaml` ↔ `schemas/insight_opportunity_schema.json`
- [ ] `templates/READY/04_strategy_formula.yaml` ↔ `schemas/strategy_formula_schema.json`
- [ ] `templates/READY/05_roadmap_recipe.yaml` ↔ `schemas/roadmap_recipe_schema.json`
- [ ] `templates/FIRE/value_models/*.yaml` ↔ `schemas/value_model_schema.json`
- [ ] `definitions/product/_template/*.yaml` ↔ `schemas/feature_definition_schema.json`
- [ ] `templates/FIRE/workflows/*.yaml` ↔ `schemas/workflow_schema.json`
- [ ] `templates/FIRE/mappings.yaml` ↔ `schemas/mappings_schema.json`
- [ ] `templates/AIM/assessment_report.yaml` ↔ `schemas/assessment_report_schema.json`
- [ ] `templates/AIM/calibration_memo.yaml` ↔ `schemas/calibration_memo_schema.json`

**Actions:**
- If artifact structure changes, update the schema
- If schema changes, update all example artifacts
- Verify all required fields are present
- Check enum values match across files

### 2. Wizard Prompts ↔ Artifacts Alignment

**Check:** Do the AI agent prompts reference the correct artifacts and guide users to create the right structure?

**Files to Review:**
- [ ] `wizards/pathfinder.agent_prompt.md`
  - References: `01_insight_opportunity.yaml`, `02_strategy_formula.yaml`, `03_roadmap_recipe.yaml`
  - Does NOT reference: legacy `okrs.yaml`, `assumptions.yaml`, `work_packages.yaml`
  - Examples show current structure
  - Workflow describes INSIGHT → STRATEGY → ROADMAP correctly

- [ ] `wizards/product_architect.agent_prompt.md`
  - References: `product.value_model.yaml`, `mappings.yaml`
  - Examples match current value model schema
  - Describes L1/L2/L3 hierarchy correctly

- [ ] `wizards/synthesizer.agent_prompt.md`
  - References: `roadmap_id` (not `okr_id` or `cycle_id`)
  - References: `03_roadmap_recipe.yaml` for OKRs and assumptions
  - Generates: `assessment_report.yaml` and `calibration_memo.yaml` with current structure
  - Examples show current AIM artifact structure

**Actions:**
- Update examples in wizard prompts
- Update file references
- Ensure terminology is consistent
- Check that the workflow described matches current process

### 3. Cross-File ID References & Traceability

**Check:** Are all ID references valid and traceable?

**Traceability Chain:**

> **Note on file numbering:** The READY phase files are numbered `00_` through `05_` for organizational purposes. The workflow sequence does not strictly follow numerical order—`03_insight_opportunity.yaml` (cycle opportunity) is created before `02_strategy_foundations.yaml` (cycle strategy foundations) because opportunity identification informs strategy definition. The numbering groups related artifacts logically rather than sequentially.

```
00_north_star.yaml (organizational foundation - stable)
    ↓ informs
01_insight_analyses.yaml (foundational analyses - living document)
    ↓ synthesizes into
03_insight_opportunity.yaml (cycle opportunity)
    ↓ informs
02_strategy_foundations.yaml (cycle strategy foundations - living document)
    ↓ synthesizes into
04_strategy_formula.yaml (cycle formula)
    ↓ drives
05_roadmap_recipe.yaml (cycle roadmap)
    ↓ assessed by
templates/AIM/assessment_report.yaml (roadmap_id)
templates/AIM/calibration_memo.yaml (roadmap_id)
```

**Within Track-Based Roadmap:**
```
tracks.product.okrs[].key_results[].id (kr-p-001)
    ↑
tracks.product.riskiest_assumptions[].linked_to_kr[] (asm-p-001 → kr-p-001)

tracks.product.solution_scaffold.key_components[].maps_to_value_model
    ↓
templates/FIRE/value_models/product.value_model.yaml (L2 components)

cross_track_dependencies[] (kr-c-001 depends on kr-p-001)
```

> **Note:** Key Results (KRs) are the lowest level EPF tracks. Implementation tools consume KRs and create work packages, tasks, and tickets. See `TRACK_BASED_ARCHITECTURE.md`.

**ID Naming Convention:**
- Product track: `okr-p-001`, `kr-p-001`, `asm-p-001`, `comp-p-001`
- Strategy track: `okr-s-001`, `kr-s-001`, `asm-s-001`, `comp-s-001`
- Org/Ops track: `okr-o-001`, `kr-o-001`, `asm-o-001`, `comp-o-001`
- Commercial track: `okr-c-001`, `kr-c-001`, `asm-c-001`, `comp-c-001`

**Files to Review:**
- [ ] All `id` fields use consistent track prefixes
- [ ] All `*_id` reference fields point to valid IDs
- [ ] Example IDs in placeholders follow the pattern
- [ ] Cross-track dependencies properly reference Key Results from other tracks
- [ ] Array references use string arrays consistently
- [ ] Track-specific solution components map to correct value model files

**Actions:**
- Update all cross-references when IDs change
- Ensure example data maintains traceability
- Verify no broken references in examples

### 3.1 Referential Integrity Rules (Critical)

**Every ID reference in EPF must point to an existing definition.** This is a hard rule, not a suggestion.

#### Rule 1: Forward References Must Resolve

When a document references an ID (e.g., `linked_to_kr: ["kr-p-001"]`), that ID **MUST** exist in the referenced artifact.

| Reference Type | Source | Must Exist In |
|----------------|--------|---------------|
| `linked_to_kr` | Assumptions, Feature Definitions | `05_roadmap_recipe.yaml` → `key_results[].id` |
| `maps_to_value_model` | Solution scaffold components | `value_models/*.yaml` → component IDs |
| `strategy_id` | Roadmap | `04_strategy_formula.yaml` → `strategy.id` |
| `roadmap_id` | Assessment report | `05_roadmap_recipe.yaml` → `roadmap.id` |
| Cross-track deps | Roadmap | Other track's `key_results[].id` |

#### Rule 2: Deletion Requires Cascade Check

When removing or renaming an ID:

1. **Before deletion:** Search all instance files for references to that ID
2. **Notify:** List all files that reference the ID being changed
3. **Update:** Either update all references or remove them
4. **Validate:** Confirm no orphan references remain

**Example Cascade Check:**
```bash
# Before removing kr-p-002 from roadmap, check references:
grep -r "kr-p-002" docs/EPF/_instances/{product}/

# Expected output shows files that need updating:
# feature_definitions/feature_def_x.md:  Linked KRs: kr-p-002
# mappings.yaml:  kr_id: kr-p-002
```

#### Rule 3: Feature Definition ↔ KR Bidirectional Integrity

Feature definitions reference KRs. This creates a contract:

| Direction | Rule |
|-----------|------|
| FD → KR | Feature definition's `Linked KRs` field must only list KRs that exist in `05_roadmap_recipe.yaml` |
| KR → FD | When a KR is removed/renamed, all feature definitions referencing it must be updated |

**Validation Checklist:**
- [ ] Every `Linked KRs` value exists in roadmap's `key_results[].id`
- [ ] KR descriptions in feature definitions match (or summarize) the actual KR
- [ ] When a KR is deleted, grep for its ID and update all referencing files
- [ ] When a KR is renamed, update all references to use new ID

#### Rule 4: Assumption ↔ KR Bidirectional Integrity

Assumptions in the roadmap reference the KRs they're testing:

| Direction | Rule |
|-----------|------|
| ASM → KR | `linked_to_kr` array must only list KRs that exist in the same track or cross-track |
| KR change | When a KR is removed, check if any assumptions were testing only that KR |

#### Automated Validation (Recommended)

Add to your CI/CD or pre-commit hooks:

```bash
# scripts/validate-references.sh
#!/bin/bash

INSTANCE_PATH="docs/EPF/_instances/{product}"

# Extract all defined KR IDs from roadmap
KR_IDS=$(grep -oE 'id: "kr-[a-z]-[0-9]+"' "$INSTANCE_PATH/05_roadmap_recipe.yaml" | cut -d'"' -f2)

# Find all referenced KR IDs in feature definitions
REFERENCED_KRS=$(grep -ohE 'kr-[a-z]-[0-9]+' "$INSTANCE_PATH/feature_definitions/"*.md)

# Check each referenced KR exists
for ref in $REFERENCED_KRS; do
  if ! echo "$KR_IDS" | grep -q "^$ref$"; then
    echo "ERROR: Referenced KR '$ref' does not exist in roadmap"
    exit 1
  fi
done

echo "All KR references are valid"
```

### 4. Documentation Consistency

**Check:** Does all documentation accurately reflect the current structure?

**Files to Review:**
- [ ] `README.md`
  - Current version number
  - Accurate "What's New" section
  - Correct file structure references
  - Updated workflow instructions
  - No references to deprecated files
  
- [ ] `templates/READY/_legacy/README.md`
  - Clearly explains why files are deprecated
  - Lists what replaced them
  
- [ ] `schemas/_legacy/README.md`
  - Clearly explains why schemas are deprecated
  - Lists what replaced them

**Actions:**
- Update README with any structural changes
- Increment version number if significant
- Update workflow instructions
- Ensure no outdated terminology

### 5. Terminology Consistency

**Check:** Is terminology used consistently across all files?

**Standard Terms:**
- **Phases:** READY, FIRE, AIM (all caps)
- **READY Sub-phases:** INSIGHT, STRATEGY, ROADMAP (all caps)
- **Outputs:** "Big Opportunity", "Winning Formula", "Recipe for Solution"
- **Files:** Use numbered prefix (`00_` through `05_`) for READY phase sequence
- **Assumption Types:** desirability, feasibility, viability, adaptability (lowercase)
- **KR Outcome Status:** exceeded, met, partially_met, missed (lowercase with underscore)
- **Decision Types:** persevere, pivot, pull_the_plug, pending_assessment (lowercase with underscore)
- **Status Values:** Use consistent enums across artifacts

> **Note:** Work package types (discovery, design, build, test, launch) are NOT part of EPF vocabulary. They belong to spec-driven development tools.

**Files to Review:**
- [ ] All YAML files use consistent terminology
- [ ] All schemas use consistent enum values
- [ ] All wizard prompts use consistent terms
- [ ] README uses consistent language

**Actions:**
- Global find/replace for terminology changes
- Update enums in all schemas
- Update examples everywhere

### 6. Schema Property Completeness

**Check:** Do schemas have all necessary properties and validations?

**For Each Schema, Verify:**
- [ ] All required fields marked as `required`
- [ ] Enum values are comprehensive and match usage
- [ ] Descriptions are clear and helpful
- [ ] Reference fields (IDs) are properly typed as strings
- [ ] Arrays have proper `items` definitions
- [ ] Nested objects have complete property definitions
- [ ] Optional fields are documented as such

**Actions:**
- Add missing properties to schemas
- Add missing `required` declarations
- Update descriptions for clarity
- Ensure all enums are complete

### 7. Example Data Quality

**Check:** Are all placeholder/example values realistic and internally consistent?

**Files to Review:**
- [ ] All example IDs follow naming convention
- [ ] Example data demonstrates realistic use cases
- [ ] Comments/descriptions are helpful, not generic
- [ ] References between files use matching example IDs
- [ ] TBD placeholders are marked clearly
- [ ] Status fields have realistic example values

**Actions:**
- Improve generic examples
- Ensure example data forms a coherent story
- Add more inline comments for guidance
- Update TBD values to be more instructive

### 8. Workflow Logic Consistency

**Check:** Does the described workflow match the artifact structure?

**Verify:**
- [ ] README workflow section matches actual file flow
- [ ] Pathfinder wizard describes correct sequence
- [ ] Synthesizer wizard outputs feed back correctly
- [ ] No circular dependencies or logic gaps
- [ ] Clear what feeds into what

**Actions:**
- Update workflow descriptions
- Fix any process inconsistencies
- Clarify dependencies

## 🚀 Quick Consistency Check Command

Run this from the `docs/EPF` directory after any change:

```bash
# List all active files (should not include legacy references)
find . -type f \( -name "*.yaml" -o -name "*.json" -o -name "*.md" \) | grep -v "_legacy"

# Check for legacy file references in active files
grep -r "okrs\.yaml\|assumptions\.yaml\|work_packages\.yaml" --include="*.md" --include="*.yaml" --include="*.json" . | grep -v "_legacy"

# If the above returns results, those are references that need updating
```

## 📋 Change Impact Matrix

Use this matrix to determine what needs review based on change type:

| Change Type | Artifacts | Schemas | Wizards | README | Legacy Docs |
|-------------|-----------|---------|---------|--------|-------------|
| Add new field to artifact | ✓ | ✓ | ✓ | - | - |
| Change artifact structure | ✓ | ✓ | ✓ | ✓ | - |
| Add new artifact type | ✓ | ✓ | ✓ | ✓ | - |
| Change workflow/process | ✓ | - | ✓ | ✓ | - |
| Rename fields/IDs | ✓ | ✓ | ✓ | - | - |
| Add enum value | ✓ | ✓ | ✓ | - | - |
| Deprecate artifact | - | - | ✓ | ✓ | ✓ |
| Update terminology | ✓ | ✓ | ✓ | ✓ | - |
| Fix typo in docs | - | - | - | ✓ | - |

## 🎯 Commitment

**Before completing ANY EPF repository change:**

1. ✓ Run through the relevant sections of this checklist
2. ✓ Make all necessary updates to maintain consistency
3. ✓ Verify no legacy references in active files
4. ✓ Ensure traceability is maintained
5. ✓ Update version number if significant
6. ✓ Test that examples make sense together

**This is not optional. This is the operating standard for EPF maintenance.**

## 📝 Change Log Template

When making significant changes, document them:

```yaml
change_date: YYYY-MM-DD
version: "x.x.x"
change_type: "enhancement|bugfix|breaking"
description: "Brief description"
files_modified:
  - path/to/file.yaml
affected_areas:
  - artifacts|schemas|wizards|documentation
breaking_changes: true|false
migration_notes: "If breaking, how to migrate"
```

## 🔍 Validation Tools (Future)

Potential tools to build:
- YAML validator against schemas
- Cross-reference validator (check all ID references)
- Terminology consistency checker
- Example data coherence validator

## 🔍 Validation Tools

EPF includes automated validation scripts to ensure consistency across instances:

### `scripts/validate-instance.sh` - Structure Validation

Validates that an EPF instance follows the correct directory structure and file formats.

```bash
# Usage
./scripts/validate-instance.sh <instance-path>

# Examples
./scripts/validate-instance.sh _instances/twentyfirst
./scripts/validate-instance.sh docs/EPF/_instances/huma-blueprint
```

**What it checks:**
- Required READY phase files exist (00-05)
- Required directories exist (feature_definitions/, value_models/)
- Feature definitions are Markdown (not YAML)
- Feature definition naming convention
- Required sections in feature definitions
- Meta file references correct EPF version
- No framework files in instance directory

### `scripts/validate-schemas.sh` - Schema Validation

Validates that YAML artifacts conform to their JSON schemas.

**Prerequisites:**
```bash
# Install required tools
npm install -g ajv-cli
brew install yq  # macOS
# or: apt install yq  # Linux
```

```bash
# Usage
./scripts/validate-schemas.sh <instance-path>

# Examples
./scripts/validate-schemas.sh _instances/twentyfirst
```

**What it validates:**
- `03_insight_opportunity.yaml` → `insight_opportunity_schema.json`
- `04_strategy_formula.yaml` → `strategy_formula_schema.json`
- `05_roadmap_recipe.yaml` → `roadmap_recipe_schema.json`
- `value_models/*.yaml` → `value_model_schema.json`
- `workflows/*.yaml` → `workflow_schema.json`
- `mappings.yaml` → `mappings_schema.json`
- `cycles/*/assessment_report.yaml` → `assessment_report_schema.json`
- `cycles/*/calibration_memo.yaml` → `calibration_memo_schema.json`

### `scripts/schema-migration.sh` - Migration Helper

Helps identify and plan schema migrations when schemas change.

```bash
# List all schemas and their artifact mappings
./scripts/schema-migration.sh list-schemas

# Compare two schema versions to see what changed
./scripts/schema-migration.sh diff old-schema.json new-schema.json

# Check instance compatibility with current schemas
./scripts/schema-migration.sh check-instance _instances/twentyfirst
```

### Schema Migration Workflow

When schemas change:

1. **Identify the change scope:**
   ```bash
   ./scripts/schema-migration.sh diff schemas/_legacy/old.json schemas/new.json
   ```

2. **Check all instances:**
   ```bash
   for instance in _instances/*/; do
     ./scripts/validate-schemas.sh "$instance"
   done
   ```

3. **Update failing artifacts** to match new schema structure

4. **Document breaking changes** in README.md under version notes

5. **Bump EPF version** (MAJOR for breaking, MINOR for additions)

---

## 🔄 Multi-Repository Sync (Git Subtree Workflow)

EPF is a general product development framework used across multiple product repositories. The canonical EPF framework source lives in a dedicated repository, while product-specific instances live in each product repo.

### Repository Structure

**EPF Framework Repo (`github.com/eyedea-io/epf`):**
```
epf/
  README.md
  MAINTENANCE.md
  NORTH_STAR.md
  STRATEGY_FOUNDATIONS.md
  TRACK_BASED_ROADMAP.md
  templates/
    READY/
    FIRE/
    AIM/
  schemas/
  wizards/
  docs/
  # NO _instances/ folder - instances are product-specific
```

**Product Repos (e.g., twentyfirst, other-product):**
```
docs/
  EPF/                      # ← Git subtree from epf repo
    README.md
    MAINTENANCE.md
    templates/
    schemas/
    wizards/
    _instances/             # ← Product-specific, NOT synced back
      {product-name}/
        00_north_star.yaml
        01_insight_analyses.yaml
        ...
```

### Key Principle

- **Framework files** (templates/, schemas/, wizards/, docs/) are synced across all repos via git subtree
- **Instance files** (`_instances/`) are product-specific and never synced to the EPF repo
- Changes to the framework can be made in any product repo and pushed back to the EPF repo

---

### 🤖 AI Copilot Instructions for Git Subtree Operations

> **For AI Assistants (GitHub Copilot, Claude, etc.):** When the user asks you to sync EPF, push framework changes, or pull updates, use the commands in this section. Always confirm the current working directory and branch before executing git commands.

#### Prerequisites Check

Before any subtree operation, verify:
```bash
# Check current directory (should be product repo root, e.g., /Users/nikolai/Code/twentyfirst)
pwd

# Check current branch
git branch --show-current

# Check for uncommitted changes (should be clean before subtree operations)
git status
```

#### Initial Setup (One-Time per Product Repo)

If the product repo doesn't have EPF as a subtree yet:

```bash
# Navigate to product repo root
cd /path/to/product-repo

# Add EPF as a subtree (first time only)
git subtree add --prefix=docs/EPF git@github.com:eyedea-io/epf.git main --squash

# Commit message will be auto-generated
```

#### Pull Framework Updates (EPF Repo → Product Repo)

When the EPF framework has been updated and you want to pull those changes into a product repo:

```bash
# Navigate to product repo root
cd /path/to/product-repo

# Ensure you're on the correct branch and have no uncommitted changes
git status

# Pull latest EPF framework changes
git subtree pull --prefix=docs/EPF git@github.com:eyedea-io/epf.git main --squash -m "EPF: Pull latest framework updates"
```

**What this does:**
- Fetches changes from the EPF repo's `main` branch
- Merges them into your `docs/EPF/` folder
- Creates a squashed commit (cleaner history)
- Your `_instances/` folder is untouched

#### Push Framework Changes (Product Repo → EPF Repo)

When you've evolved the EPF framework while working in a product repo and want to share those changes:

```bash
# Navigate to product repo root
cd /path/to/product-repo

# Ensure all framework changes are committed
git status

# Push framework changes back to EPF repo
git subtree push --prefix=docs/EPF git@github.com:eyedea-io/epf.git main
```

**What this does:**
- Extracts commits that touched `docs/EPF/` (excluding `_instances/`)
- Pushes them to the EPF repo's `main` branch
- Instance-specific files are automatically excluded

**Important:** Only push when your framework changes are stable and tested. This affects all product repos that pull from EPF.

#### Handling the `_instances/` Folder

The `_instances/` folder contains product-specific data and should **never** be pushed to the EPF repo.

**How subtree handles this:**
- When you `git subtree push`, only files that exist in the EPF repo are pushed
- Since `_instances/` doesn't exist in the EPF repo, it's automatically excluded
- Your product-specific instances remain local to your product repo

**If you accidentally try to push instances:**
- The push will fail or create unwanted files in the EPF repo
- Solution: Ensure `_instances/` was created *after* the initial subtree add, not as part of it

#### Handling `.gitignore` for Instance Tracking

The EPF framework includes two different `.gitignore` patterns:

1. **Canonical EPF repo (`.gitignore`):** Contains "CANONICAL REPOSITORY" marker, ignores ALL `_instances/*`
2. **Product repos:** Should track THEIR product's instance while ignoring others

**Problem:** When you `git subtree pull` from canonical EPF, the canonical `.gitignore` can overwrite your product-specific one, causing your instance to become untracked.

**Detection:** The canonical `.gitignore` is identified by the comment "CANONICAL REPOSITORY" in the header.

**Solution (Automatic):** The `sync-repos.sh` script (v2.3+) automatically detects when this happens and restores your product-specific `.gitignore`:
```bash
./docs/EPF/scripts/sync-repos.sh pull
# Automatically:
# 1. Detects product name from existing _instances/ folder
# 2. Checks if .gitignore is the canonical version (has "CANONICAL REPOSITORY" marker)
# 3. Restores product-specific .gitignore from template
# 4. Stages the restored .gitignore for commit
```

**Manual Fix:** If your `.gitignore` still shows "CANONICAL REPOSITORY", regenerate from template:
```bash
# Replace {product-name} with your actual product name
sed 's/{{PRODUCT_NAME}}/{product-name}/g' docs/EPF/templates/product.gitignore.template > docs/EPF/.gitignore
git add docs/EPF/.gitignore
git commit -m "EPF: Restore product-specific .gitignore"
```

**Template Location:** `templates/product.gitignore.template`

**Initializing a New Product Instance:**

**Option 1: Quick Init (creates instance folder and .gitignore)**
```bash
./docs/EPF/scripts/sync-repos.sh init {product-name}
# Creates _instances/{product-name}/ folder structure
# Generates product-specific .gitignore from template
```

**Option 2: Complete Structure Setup (creates all EPF folders)**
```bash
./docs/EPF/scripts/create-instance-structure.sh {product-name}
# Creates complete folder structure:
#   - READY/ (strategy phase)
#   - FIRE/ (execution phase with feature_definitions/, value_models/, workflows/)
#   - AIM/ (learning phase)
#   - ad-hoc-artifacts/ (non-authoritative documents)
#   - outputs/ (generated outputs)
#   - cycles/ (archived cycles)
# Copies templates and adds .gitkeep files
# Generates _meta.yaml and README.md
# Shows structure diagram and next steps
```

**Recommended Workflow:**
1. Use `sync-repos.sh init` to create the instance folder and .gitignore
2. Use `create-instance-structure.sh` to build the complete directory structure
3. Copy strategy templates from `templates/READY/` to your instance
4. Start filling in your strategy documents

#### Sync Status Check

To see if your product repo's EPF is behind or ahead of the main EPF repo:

```bash
# Fetch latest from EPF repo (doesn't merge, just fetches)
git fetch git@github.com:eyedea-io/epf.git main

# Compare (this is approximate - subtree doesn't have perfect tracking)
git log --oneline docs/EPF | head -10
```

---

### 🔁 Sync Workflow Scenarios

#### Scenario 1: "I evolved EPF while working on twentyfirst, now I want to update other-product"

```bash
# Step 1: In twentyfirst, push framework changes to EPF repo
cd /Users/nikolai/Code/twentyfirst
git subtree push --prefix=docs/EPF git@github.com:eyedea-io/epf.git main

# Step 2: In other-product, pull the updates
cd /Users/nikolai/Code/other-product
git subtree pull --prefix=docs/EPF git@github.com:eyedea-io/epf.git main --squash -m "EPF: Pull latest framework updates"
```

#### Scenario 2: "I want to start using EPF in a new product repo"

```bash
# Navigate to new product repo
cd /path/to/new-product

# Add EPF as subtree
git subtree add --prefix=docs/EPF git@github.com:eyedea-io/epf.git main --squash

# Initialize product-specific instance (creates folder, .gitignore, and templates)
./docs/EPF/scripts/sync-repos.sh init new-product

# Commit the new instance
git add docs/EPF/
git commit -m "EPF: Initialize new-product instance"
```

#### Scenario 3: "There's a merge conflict when pulling EPF updates"

```bash
# If pull fails with conflicts:
git status  # See conflicted files

# Resolve conflicts manually in each file, then:
git add <resolved-files>
git commit -m "EPF: Resolve merge conflicts from framework update"
```

#### Scenario 4: "I want to see what changed in the EPF framework recently"

```bash
# View recent EPF repo commits (run from anywhere)
git log --oneline -20 git@github.com:eyedea-io/epf.git main

# Or clone/fetch the EPF repo separately to browse
```

---

### 📋 Copilot Quick Reference Card

| Task | Command |
|------|---------|
| **Pull EPF updates** | `./docs/EPF/scripts/sync-repos.sh pull` (auto-restores .gitignore) |
| **Push EPF changes** | `./docs/EPF/scripts/sync-repos.sh push` (excludes _instances/) |
| **Initial setup** | `git subtree add --prefix=docs/EPF git@github.com:eyedea-io/epf.git main --squash` |
| **Init new product** | `./docs/EPF/scripts/sync-repos.sh init {product-name}` |
| **Create full structure** | `./docs/EPF/scripts/create-instance-structure.sh {product-name}` |
| **Check sync status** | `./docs/EPF/scripts/sync-repos.sh check` |
| **Check status** | `git status` then `pwd` to confirm location |

---

### 🔄 Version Sync Protocol (MANDATORY)

**AI agents MUST follow this protocol after ANY framework or instance changes.**

#### After Pushing Framework Changes

When you push framework changes to the EPF repo, you MUST:

1. **Check the new framework version** in `README.md`:
   ```bash
   grep "EPF.*Repository.*v" docs/EPF/README.md | head -1
   ```

2. **Update ALL instances in the current repo** to match:
   ```bash
   # Check current instance versions
   grep -r "epf_version\|template_version" docs/EPF/_instances/ --include="*.yaml"
   
   # Update _meta.yaml
   # Update template_version in all READY phase files
   ```

3. **Commit the version sync** separately:
   ```bash
   git commit -m "EPF: Sync instance(s) to v{X.Y.Z}"
   ```

#### After Pulling Framework Updates

When you pull framework updates from the EPF repo, you MUST:

1. **Check the pulled framework version**:
   ```bash
   grep "EPF.*Repository.*v" docs/EPF/README.md | head -1
   ```

2. **Compare with instance version**:
   ```bash
   grep "epf_version" docs/EPF/_instances/*/_meta.yaml
   ```

3. **If versions differ, update the instance**:
   - Update `_meta.yaml` → `epf_version`
   - Update `template_version` in all YAML files that have it
   - Review "What's New" in README for any required migrations

4. **Commit the version sync**:
   ```bash
   git commit -m "EPF: Sync instance(s) to v{X.Y.Z} after framework pull"
   ```

#### Version Sync Checklist

Before completing ANY EPF sync operation:

- [ ] Framework version in `README.md` noted
- [ ] Instance `_meta.yaml` exists and has `epf_version` field
- [ ] Instance `epf_version` matches framework version
- [ ] All `template_version` fields in YAML files match framework version
- [ ] If MINOR/MAJOR version change: reviewed "What's New" for migrations
- [ ] Version sync committed separately from content changes

#### Quick Version Check Command

```bash
# Run this after any EPF operation to verify sync
cd docs/EPF && \
  echo "=== Framework Version ===" && \
  grep "Repository.*v[0-9]" README.md | head -1 && \
  echo "" && \
  echo "=== Instance Versions ===" && \
  grep -r "epf_version\|template_version" _instances/ --include="*.yaml" 2>/dev/null | grep -v "example"
```

---

### 🛠️ Automated Sync Tooling

To prevent manual sync errors, EPF provides scripts in `scripts/` that automate common operations.

#### Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `sync-repos.sh` | Verify sync status, push/pull framework changes | `./scripts/sync-repos.sh [check\|push\|pull\|validate]` |
| `bump-version.sh` | Consistently bump all version references | `./scripts/bump-version.sh 1.4.0 "Description"` |

#### `sync-repos.sh` - Framework Sync Management

**Check sync status (safe, read-only):**
```bash
cd docs/EPF
./scripts/sync-repos.sh check
```

This will:
- Verify the EPF remote is configured
- Compare local vs canonical repo versions
- Deep-check file contents for drift
- Report any inconsistencies

**Validate version consistency:**
```bash
./scripts/sync-repos.sh validate
```

Checks that all version references within `integration_specification.yaml` are consistent:
- Header comment version
- `specification.version` field
- Latest `changelog` entry version

**Push framework changes:**
```bash
./scripts/sync-repos.sh push
```

This will:
1. Validate version consistency first (fails if inconsistent)
2. Run `git subtree push` to canonical repo
3. Report success/failure

**Pull framework updates:**
```bash
./scripts/sync-repos.sh pull
```

This will:
1. Run `git subtree pull` with squash
2. Validate version consistency after pull
3. Report success/failure

#### `bump-version.sh` - Consistent Version Updates

**Problem it solves:** When updating the integration specification version, you must update:
1. The header comment (`# Version: X.Y.Z`)
2. The `specification.version` field
3. The `versioning.this_spec_version` field
4. Add a new `changelog` entry

Missing any of these causes sync validation to fail.

**Usage:**
```bash
cd docs/EPF
./scripts/bump-version.sh 1.4.0 "Added automated sync tooling"
```

This updates all four locations atomically and provides next steps.

#### AI Agent Protocol for Sync Operations

**MANDATORY:** AI agents MUST use these scripts instead of manual operations:

1. **Before any EPF framework change:**
   ```bash
   ./scripts/sync-repos.sh check
   ```

2. **After modifying integration_specification.yaml:**
   ```bash
   ./scripts/sync-repos.sh validate
   ```

3. **When bumping versions:**
   ```bash
   ./scripts/bump-version.sh <version> "<description>"
   ```

4. **After pushing to canonical repo:**
   ```bash
   # Copy updated files to other product repos
   cp docs/EPF/integration_specification.yaml /path/to/other-repo/docs/EPF/
   cp docs/EPF/schemas/*.json /path/to/other-repo/docs/EPF/schemas/
   
   # Then in other repo:
   ./scripts/sync-repos.sh validate
   ```

#### Why Scripts Over Manual Commands

| Manual Approach | Problem | Script Solution |
|-----------------|---------|-----------------|
| `sed` to update version | Easy to miss one location | `bump-version.sh` updates all 4 locations |
| `git subtree push` directly | No pre-validation | `sync-repos.sh push` validates first |
| Compare versions manually | Error-prone | `sync-repos.sh check` does deep comparison |
| Copy files between repos | May forget files | Scripts list all framework files |

---

### ⚠️ Important Rules for Multi-Repo EPF Management

1. **Never edit framework files directly in the EPF repo** unless you're doing dedicated framework work. Always evolve EPF in the context of a product repo, then push back.

2. **Always pull before pushing** if others might have updated the EPF repo.

3. **Version bump after significant changes.** After pushing framework changes, update the version in `README.md`.

4. **Always sync instance versions after framework changes.** This is not optional - instances must track which framework version they follow.

5. **Communicate breaking changes.** If your changes require instance migration, document in README and notify other product repo maintainers.

6. **Keep `_instances/` product-specific.** Never copy instances between repos; each product has its own strategic context.

7. **Test framework changes** against at least one real instance before pushing to the EPF repo.

---

## 🤖 AI Copilot Extended Instructions

> **Purpose:** This section provides detailed instructions for AI assistants (GitHub Copilot, Claude, Cursor, etc.) to help users work with EPF effectively. These instructions cover common operations beyond git subtree sync.

---

### 📁 EPF File Structure Reference

When navigating or modifying EPF, use this structure reference:

```
docs/EPF/
├── README.md                 # Framework overview, version, quick start
├── MAINTENANCE.md            # This file - consistency rules, AI instructions
├── NORTH_STAR.md             # North Star concept explanation
├── STRATEGY_FOUNDATIONS.md   # Strategic foundations guide
├── TRACK_BASED_ROADMAP.md    # Track-based roadmap methodology
│
├── templates/
│   ├── READY/                # Strategy & Planning phase
│   │   ├── 00_north_star.yaml
│   │   ├── 01_insight_analyses.yaml
│   │   ├── 02_strategy_foundations.yaml
│   │   ├── 03_insight_opportunity.yaml
│   │   ├── 04_strategy_formula.yaml
│   │   └── 05_roadmap_recipe.yaml
│   ├── FIRE/                 # Execution & Delivery phase
│   │   └── (execution artifacts)
│   └── AIM/                  # Learning & Adaptation phase
│       └── (assessment artifacts)
│
├── schemas/                  # JSON Schema definitions
│   ├── north_star_schema.json
│   ├── insight_analyses_schema.json
│   ├── strategy_foundations_schema.json
│   ├── insight_opportunity_schema.json
│   ├── strategy_formula_schema.json
│   ├── roadmap_recipe_schema.json
│   └── assessment_report_schema.json
│
├── wizards/                  # Interactive creation guides
│   └── (wizard files)
│
├── docs/                     # Additional documentation
│   └── (supplementary docs)
│
├── scripts/                  # Utility scripts
│   └── init-epf-repo.sh      # EPF repo initialization script
│
└── _instances/               # Product-specific instances (LOCAL ONLY)
    └── {product-name}/
        ├── _meta.yaml            # Instance metadata
        ├── README.md             # Instance overview
        ├── outputs/              # Generated outputs (context-sheets, memos, etc.)
        ├── cycles/               # Archived cycle artifacts
        │
        ├── READY/                # Strategy & Planning Phase
        │   ├── 00_north_star.yaml
        │   ├── 01_insight_analyses.yaml
        │   ├── 02_strategy_foundations.yaml
        │   ├── 03_insight_opportunity.yaml
        │   ├── 04_strategy_formula.yaml
        │   └── 05_roadmap_recipe.yaml
        │
        ├── FIRE/                 # Execution & Delivery Phase
        │   ├── feature_definitions/
        │   ├── value_models/
        │   ├── workflows/
        │   └── mappings.yaml
        │
        ├── AIM/                  # Learning & Adaptation Phase
        │   ├── assessment_report.yaml
        │   └── calibration_memo.yaml
        │
        └── ad-hoc-artifacts/     # Generated memos, summaries (optional)
```

---

### 📝 Common EPF Tasks for AI Assistants

#### Task: Validate an EPF Instance Against Schema

When user asks to validate their instance files:

```bash
# Example: Validate north_star.yaml against its schema
# You'll need a JSON schema validator like ajv-cli

# First, convert YAML to JSON (if needed)
npx js-yaml docs/EPF/_instances/twentyfirst/00_north_star.yaml > /tmp/north_star.json

# Then validate
npx ajv validate -s docs/EPF/schemas/north_star_schema.json -d /tmp/north_star.json
```

**AI Assistant approach:** Read both the instance file and schema, then manually check:
1. All required fields are present
2. Field types match schema definitions
3. IDs follow naming conventions (e.g., `ia_001`, `p_wp_001`)
4. Cross-references are valid (e.g., `based_on_analyses` references exist)

#### Task: Create a New Instance from Templates

When user wants to start a new EPF instance for a product:

```bash
# Create instance directory with phase-based structure
mkdir -p docs/EPF/_instances/{product-name}/READY
mkdir -p docs/EPF/_instances/{product-name}/FIRE/feature_definitions
mkdir -p docs/EPF/_instances/{product-name}/FIRE/value_models
mkdir -p docs/EPF/_instances/{product-name}/FIRE/workflows
mkdir -p docs/EPF/_instances/{product-name}/AIM
mkdir -p docs/EPF/_instances/{product-name}/outputs
mkdir -p docs/EPF/_instances/{product-name}/cycles

# Copy READY phase template files
cp docs/EPF/templates/READY/00_north_star.yaml docs/EPF/_instances/{product-name}/READY/
cp docs/EPF/templates/READY/01_insight_analyses.yaml docs/EPF/_instances/{product-name}/READY/
cp docs/EPF/templates/READY/02_strategy_foundations.yaml docs/EPF/_instances/{product-name}/READY/
cp docs/EPF/templates/READY/03_insight_opportunity.yaml docs/EPF/_instances/{product-name}/READY/
cp docs/EPF/templates/READY/04_strategy_formula.yaml docs/EPF/_instances/{product-name}/READY/
cp docs/EPF/templates/READY/05_roadmap_recipe.yaml docs/EPF/_instances/{product-name}/READY/

# Copy FIRE phase template files
cp docs/EPF/templates/FIRE/mappings.yaml docs/EPF/_instances/{product-name}/FIRE/
cp -r docs/EPF/templates/FIRE/value_models/* docs/EPF/_instances/{product-name}/FIRE/value_models/
cp -r docs/EPF/templates/FIRE/workflows/* docs/EPF/_instances/{product-name}/FIRE/workflows/

# Copy AIM phase template files
cp docs/EPF/templates/AIM/assessment_report.yaml docs/EPF/_instances/{product-name}/AIM/
cp docs/EPF/templates/AIM/calibration_memo.yaml docs/EPF/_instances/{product-name}/AIM/
```

Then guide user to fill in product-specific content, starting with `READY/00_north_star.yaml`.

**Important:** Instance structure MUST mirror the framework's phase-based organization:
- `READY/` contains strategy & planning artifacts (00-05)
- `FIRE/` contains execution artifacts (feature_definitions, value_models, mappings)
- `AIM/` contains assessment & learning artifacts

#### Task: Trace from North Star to Key Results

When user asks "how does this Key Result connect to our north star?":

1. **Read the Key Result** from `05_roadmap_recipe.yaml` - note its track and OKR
2. **Find the strategy** in `04_strategy_formula.yaml` - note its `linked_opportunity_ids`
3. **Find the opportunities** in `03_insight_opportunity.yaml` - note their `based_on_analyses`
4. **Find the analyses** in `01_insight_analyses.yaml` - note their `north_star_alignment`
5. **Read the North Star** in `00_north_star.yaml`

Present the full traceability chain to the user.

> **Note:** If the user asks about work packages, remind them that work packages are created by spec-driven development tools (Linear, Jira, etc.) that consume EPF's Key Results. EPF tracks strategic outcomes (KRs), not implementation details (work packages).

#### Task: Add a New Key Result

When user wants to add a Key Result to the roadmap:

1. **Determine the track:** Product (p), Strategy (s), Org/Ops (o), or Commercial (c)
2. **Find next available ID:** Look at existing KRs in that track, increment
3. **Ensure OKR link:** The KR must be under an OKR in `05_roadmap_recipe.yaml`
4. **Link assumptions:** If the KR validates an assumption, update `riskiest_assumptions` with `linked_to_kr`

**ID Format:** `kr-{track}-{number}` (e.g., `kr-p-003`, `kr-s-001`)

#### Task: Check EPF Consistency

When user asks to check EPF consistency or find broken references:

1. **Collect all IDs** from each file:
   - `ia_*` from `01_insight_analyses.yaml`
   - `opp_*` from `03_insight_opportunity.yaml`  
   - Strategic initiative IDs from `04_strategy_formula.yaml`
   - `kr-*`, `okr-*`, `asm-*`, `comp-*` from `05_roadmap_recipe.yaml`

2. **Verify references:**
   - Every `based_on_analyses` in opportunities → exists in insight_analyses
   - Every `linked_opportunity_ids` in initiatives → exists in opportunities
   - Every `strategy_id` in roadmap → exists in strategy_formula
   - Every `cross_track_dependencies` reference → points to valid Key Result

3. **Report any broken links** with specific file locations.

#### Task: Generate Assessment Report Structure

When user asks to assess their cycle/quarter progress:

1. **Read `05_roadmap_recipe.yaml`** for the current milestone's OKRs and work packages
2. **Create assessment structure** following `assessment_report_schema.json`:
   - `okr_assessments` for each OKR with status and actual vs target
   - `work_package_outcomes` for each completed work package
   - `insights_learned` for new learnings
   - `recommendations` for next actions

---

### 🔍 EPF Search Patterns

When searching the EPF codebase, use these patterns:

| Looking for... | Search pattern |
|----------------|----------------|
| All work packages | `work_packages:` or `_wp_` |
| Strategic initiatives | `strategic_initiatives:` |
| Opportunities | `opp_` or `insight_opportunity` |
| Insight analyses | `ia_` or `insight_analyses` |
| Schema definitions | `*.schema.json` or `"$schema"` |
| Cross-references | `based_on` or `linked_` or `strategic_initiative:` |
| Version info | `version:` or `epf_version` |
| Traceability | `traceability` or `alignment` |

---

### ⚡ Quick Prompts for Users

Users can copy these prompts to get AI assistance:

**"Help me fill out my North Star"**
> Read my current `docs/EPF/_instances/{product}/00_north_star.yaml` and help me complete any missing fields. Reference the schema at `docs/EPF/schemas/north_star_schema.json` for required fields.

**"Validate my EPF instance"**
> Check all files in `docs/EPF/_instances/{product}/` against their schemas in `docs/EPF/schemas/`. Report any missing required fields, type mismatches, or broken cross-references.

**"Trace this work package to strategy"**
> For work package `{id}` in my roadmap, show me the complete traceability chain back to the North Star, going through initiative → opportunity → insight analysis → north star alignment.

**"Add a new strategic initiative"**
> Help me add a new strategic initiative to `04_strategy_formula.yaml`. I need to link it to existing opportunities in `03_insight_opportunity.yaml` and then create work packages in `05_roadmap_recipe.yaml`.

**"Sync EPF framework updates"**
> Pull the latest EPF framework updates from the canonical repo into this product repo. Follow the git subtree instructions in MAINTENANCE.md.

**"Assess my current milestone"**
> Based on my current milestone in `05_roadmap_recipe.yaml`, help me create an assessment report following the schema at `docs/EPF/schemas/assessment_report_schema.json`.

---

### 🛠️ Scripts Reference

#### `scripts/init-epf-repo.sh`

**Purpose:** Extract EPF framework files from a product repo and create the canonical EPF repository.

**Usage:**
```bash
cd docs/EPF/scripts
./init-epf-repo.sh [target-directory]

# Example:
./init-epf-repo.sh ~/Code/epf
```

**What it does:**
1. Validates source EPF directory
2. Creates target directory structure
3. Copies framework files (excludes `_instances/` and `scripts/`)
4. Creates `.gitignore` for the EPF repo
5. Initializes git with initial commit
6. Provides next steps for GitHub setup

---

### 🧭 Decision Tree for AI Assistants

When user asks about EPF, follow this decision tree:

```
User request
    │
    ├── About git/sync operations?
    │   └── → Use "Git Subtree Operations" section above
    │
    ├── About creating/editing instance files?
    │   └── → Check Framework vs Instance rules, edit only _instances/
    │
    ├── About validating or checking consistency?
    │   └── → Read schemas, cross-check references, report issues
    │
    ├── About understanding traceability?
    │   └── → Follow reference chain: work_package → initiative → opportunity → analysis → north_star
    │
    ├── About framework structure/methodology?
    │   └── → Reference README.md, NORTH_STAR.md, STRATEGY_FOUNDATIONS.md
    │
    ├── About versioning?
    │   └── → Check "Versioning Convention" section, update appropriately
    │
    └── About setting up EPF in new repo?
        └── → Use init-epf-repo.sh script or manual subtree setup
```

---

**Remember:** The EPF is an executable knowledge graph. Every inconsistency degrades its value as an AI-friendly, traceable system. Maintain rigor.
