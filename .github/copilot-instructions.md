# EPF Quick Reference (Copilot Instructions)

> **File Purpose**: Quick command reference and product repo operations  
> **When to use**: Daily work in **product repos** OR need quick commands/sync procedures  
> **For other contexts**: See "When to Use Which File" below

## 📁 When to Use Which File

| Your Situation | Use This File |
|----------------|---------------|
| **User adopting EPF for first time** | → [`.ai-agent-first-contact.md`](../.ai-agent-first-contact.md) |
| **Daily operations in product repo** (commands, sync) | → **This file** (you're in the right place) |
| **Modifying EPF framework** (schemas, templates) | → [`.ai-agent-instructions.md`](../.ai-agent-instructions.md) |
| **Enriching instance artifacts** (YAML files) | → [`.ai-agent-instructions.md`](../.ai-agent-instructions.md) |

## ⚠️ READ THIS FIRST ⚠️

**All comprehensive EPF guidelines are in:** `docs/EPF/.ai-agent-instructions.md`

**You MUST read `.ai-agent-instructions.md` before doing ANY EPF work.** 

This file is just a quick reference for common commands and repo locations. For:
- Schema-first enrichment workflow → `.ai-agent-instructions.md`
- Version management → `.ai-agent-instructions.md`
- Breaking change protocol → `.ai-agent-instructions.md`
- Validation procedures → `.ai-agent-instructions.md`
- Consistency checks → `.ai-agent-instructions.md`

---

## ⚡ Quick Command Reference

**Check EPF version:**
```bash
./docs/EPF/scripts/check-epf-version.sh  # Quick check if VERSION matches canonical
```

**Deep sync verification (when debugging or after manual edits):**
```bash
./docs/EPF/scripts/verify-canonical-sync.sh           # Compare all framework files against canonical
./docs/EPF/scripts/verify-canonical-sync.sh --verbose # Show each file comparison
./docs/EPF/scripts/verify-canonical-sync.sh --fix     # Auto-sync if differences found
```

**Sync between repos:**
```bash
./docs/EPF/scripts/sync-repos.sh push   # Sync TO canonical
./docs/EPF/scripts/sync-repos.sh pull   # Sync FROM canonical
```

**Version management:**
```bash
./docs/EPF/scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
```

**Validation:**
```bash
# Comprehensive health check (run before commits)
./docs/EPF/scripts/epf-health-check.sh

# Schema validation
./docs/EPF/scripts/validate-schemas.sh path/to/file.yaml

# Field coverage analysis
./docs/EPF/scripts/analyze-field-coverage.sh path/to/instance/

# Content quality assessment (scores, grades, enrichment guidance)
./docs/EPF/scripts/check-content-readiness.sh path/to/artifact.yaml
./docs/EPF/scripts/check-content-readiness.sh path/to/instance/READY
```

**Available scripts:**
```bash
ls docs/EPF/scripts/  # Always check existing tooling first
```

---

## 📦 Product Repositories Using EPF

**Complete list of product repos with EPF framework:**

1. **emergent** - `/Users/nikolai/Code/emergent` (branch: `master`)
2. **twentyfirst** - `/Users/nikolai/Code/twentyfirst` (branch: `develop`)
3. **lawmatics** - `/Users/nikolai/Code/lawmatics` (branch: `dev`)
4. **huma-blueprint-ui** - `/Users/nikolai/Code/huma-blueprint-ui` (branch: `develop`)

**When user says "all product repos" or "all products", these are THE FOUR repositories.**

---

## 📖 Full Documentation

**For comprehensive guidelines, workflows, and protocols:**

**→ Read `docs/EPF/.ai-agent-instructions.md`**

That file contains:
- Schema-first enrichment workflow (how to populate EPF artifacts correctly)
- Version management and breaking change protocol
- Comprehensive validation procedures
- Consistency check protocols
- Canonical vs product repo rules

**Additional references:**
- `MAINTENANCE.md` - Detailed consistency protocol
- `CANONICAL_PURITY_RULES.md` - Framework vs instance separation
- `docs/EPF/outputs/README.md` - Output generator documentation
- `.github/instructions/self-learning.instructions.md` - Historical lessons learned

---

## ⚠️ Remember

**Everything else (workflows, validation, protocols) → `docs/EPF/.ai-agent-instructions.md`**

This quick reference is intentionally minimal. For any EPF work beyond basic commands, read the comprehensive instructions first.

## ⚠️ CRITICAL: Pre-Flight Checklist for AI Agents

**BEFORE doing ANYTHING with EPF, answer these questions:**

### Question 1: Where am I right now?
```bash
pwd  # Check your current working directory
```

- If you are in `/Users/*/Code/epf` (or similar canonical EPF path) → **STOP!** Read `CANONICAL_PURITY_RULES.md`
- If you are in `/Users/*/Code/{product-name}` (e.g., huma-blueprint-ui, twentyfirst, lawmatics) → Proceed

### Question 2: Is my EPF framework up to date?
```bash
./docs/EPF/scripts/check-epf-version.sh
```

- ✅ **If up to date**: Proceed with EPF work
- ⚠️ **If behind**: Offer to sync before proceeding:
  ```bash
  ./docs/EPF/scripts/sync-repos.sh pull
  ```
  
**Why this matters**: Working with outdated EPF may use deprecated schemas, miss bug fixes, or lack new features. Always sync to latest before major EPF work.

**When to run deep verification:**
Use `verify-canonical-sync.sh` when:
- Health check passes but behavior differs from canonical
- Debugging "works in canonical, fails in product" issues
- After manual edits to framework files
- Before major releases requiring guaranteed sync

```bash
./docs/EPF/scripts/verify-canonical-sync.sh  # Compare ALL framework files
```

### Question 3: What is the user asking me to do?

- **"Create an instance"** or **"Add a product line"** → Instance work (must be in product repo)
- **"Update EPF framework"** or **"Fix schema"** → Framework work (can be in canonical EPF)

### Question 3: Am I about to create files in `_instances/`?

- If YES and you're in canonical EPF repo → **STOP! NEVER DO THIS!**
- If YES and you're in a product repo → Correct, proceed

**IF IN DOUBT:** Read `CANONICAL_PURITY_RULES.md` first, then `MAINTENANCE.md`, then proceed.

---

## ⚠️ CRITICAL: Pre-Commit Checklist for Framework Changes

**BEFORE committing ANY changes to canonical EPF framework, run this checklist:**

### Step 1: Classify Your Change Type

```bash
# Use automated classifier (RECOMMENDED)
./scripts/classify-changes.sh

# Or check specific changes:
./scripts/classify-changes.sh --staged              # Check staged changes
./scripts/classify-changes.sh --since-commit HEAD~1  # Check last commit

# Script will:
# 1. Analyze changed files
# 2. Classify change type (schema, docs, templates, etc.)
# 3. Recommend version bump type (MAJOR/MINOR/PATCH)
# 4. Calculate next version suggestions
# 5. Exit with error if version bump needed
```

**Manual classification if script unavailable:**

```
What did you change?
├─ Schemas (JSON Schema files)?
│   └─ Breaking changes (removed fields, changed types)? → MAJOR version
│   └─ New optional fields? → MINOR version
│   └─ Clarifications, fixes? → PATCH version
├─ Templates (YAML templates)?
│   └─ New templates? → MINOR version
│   └─ Template improvements? → PATCH version
├─ Documentation (README, guides, white paper)?
│   └─ Affects how users understand EPF? → PATCH version
│   └─ Typo fixes only? → PATCH version
├─ Wizards (AI prompts)?
│   └─ New wizard? → MINOR version
│   └─ Wizard improvements? → PATCH version
├─ Scripts (validation, automation)?
│   └─ New functionality? → MINOR version
│   └─ Bug fixes? → PATCH version
└─ Working files (.epf-work/)?
    └─ NO VERSION BUMP NEEDED (not part of framework)
```

### Step 2: Version Bump Decision

```
Does your change affect the framework?
├─ YES → Continue to Step 3
└─ NO (only .epf-work/ or .github/) → Skip to commit
```

**Rule:** If you changed docs, schemas, templates, wizards, or scripts → VERSION BUMP REQUIRED

### Step 3: Determine Version Type

| Change Type | Version | Examples |
|-------------|---------|----------|
| **Breaking changes** | MAJOR (X.0.0) | Removed schema fields, incompatible changes |
| **New features** | MINOR (0.Y.0) | New templates, new wizards, new optional fields |
| **Improvements/fixes** | PATCH (0.0.Z) | Documentation clarification, bug fixes, typos |

**This session example:**
- Changed: 11 documentation files (README, MAINTENANCE, guides, wizards)
- Impact: Clarifies WHY-HOW-WHAT ontology (affects understanding)
- Breaking? NO | New features? NO | Improvement? YES
- **Verdict: PATCH (2.0.0 → 2.0.1)** ✅

### Step 4: Use Automated Version Bump

```bash
# Run automated script (PREFERRED - prevents inconsistencies)
./scripts/bump-framework-version.sh "X.Y.Z" "Brief description of changes"

# Script will:
# 1. Prompt for confirmation
# 2. Update VERSION, README.md, MAINTENANCE.md, integration_specification.yaml
# 3. Create version bump commit
# 4. Git hook validates consistency before commit succeeds
```

**For detailed breaking change protocol and version impact assessment:**  
→ See [`.ai-agent-instructions.md`](../.ai-agent-instructions.md) STEP 0

### Step 5: If Manual Bump Needed

Only if automated script unavailable, update ALL 4 files:

1. **VERSION** - Change first line to `X.Y.Z`
2. **README.md** - Update title: `# Emergent Product Framework (EPF) Repository - vX.Y.Z`
3. **MAINTENANCE.md** - Update: `**Current Framework Version:** vX.Y.Z`
4. **integration_specification.yaml** - Update both:
   - Line 3: `# Version: X.Y.Z (EPF vX.Y.Z)`
   - Line 7: `version: "X.Y.Z"`
   - Line 8: `epf_version: "X.Y.Z"`

**Git pre-commit hook will BLOCK if versions are inconsistent.** ✅

### Step 6: Commit with Descriptive Message

```bash
git add <changed files>
git commit -m "Brief title

- Change 1 (what and why)
- Change 2 (what and why)
- Change 3 (what and why)

Version: X.Y.Z (MAJOR|MINOR|PATCH)
Impact: <who is affected and how>
Breaking: <YES|NO>"
```

### Quick Reference: "Should I Bump Version?"

**✅ YES - Bump version when:**
- Changing docs that affect how users understand EPF
- Adding/removing/changing schemas
- Adding/modifying templates or wizards
- Fixing bugs in validation scripts
- Adding new features or capabilities

**❌ NO - Skip version bump when:**
- Only editing `.epf-work/` files (working documents)
- Only editing `.github/` files (CI/CD, instructions)
- Git operations (merging, rebasing) without content changes

**When in doubt → Bump the version (PATCH).** Over-versioning is safer than under-versioning.

---

## 📝 Adding a New Product Repository to EPF

When adding a new product repo to the EPF ecosystem, follow this procedure:

### Step 1: Add EPF to the Product Repo

Run this command from the target product repository:

```bash
# Download and run the setup script
curl -sSL https://raw.githubusercontent.com/eyedea-io/epf-canonical-definition/main/scripts/add-to-repo.sh | bash -s -- {product-name}
```

Or manually:

```bash
# 1. Add EPF remote
git remote add epf git@github.com:eyedea-io/epf-canonical-definition.git

# 2. Add as subtree
git subtree add --prefix=docs/EPF epf main --squash

# 3. Create instance folder
mkdir -p docs/EPF/_instances/{product-name}

# 4. Copy templates
cp docs/EPF/templates/READY/*.yaml docs/EPF/_instances/{product-name}/

# 5. Commit
git add docs/EPF/_instances/
git commit -m "EPF: Initialize {product-name} instance"
```

### Step 2: Update Canonical EPF Documentation

Edit `.github/copilot-instructions.md` in the **canonical EPF repo** to add the new product:

**Files to update:**

1. **Section: "📦 Product Repositories Using EPF"** (lines ~16-20)
   - Add new line: `5. **{product-name}** - `/Users/nikolai/Code/{product-name}` (branch: `{branch-name}`)`
   - Update count: "When user says 'all product repos', these are THE **FIVE** repositories."

2. **Section: "Sync updates to all product repos"** (lines ~246-249)
   - Add new line: `cd /Users/nikolai/Code/{product-name} && ./docs/EPF/scripts/sync-repos.sh pull && git push`

3. **Section: "Quick Command Reference"** (lines ~363-366)
   - Add new line: `cd /path/to/{product-name} && ./docs/EPF/scripts/sync-repos.sh pull && git push`

4. **Commit the changes:**
   ```bash
   cd /Users/nikolai/Code/epf
   git add .github/copilot-instructions.md
   git commit -m "docs: Add {product-name} to product repos list"
   git push origin main
   ```

### Step 3: Sync to All Product Repos (including new one)

```bash
# Sync the updated instructions to all product repos
cd /Users/nikolai/Code/emergent && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/twentyfirst && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/lawmatics && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/huma-blueprint-ui && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/{product-name} && ./docs/EPF/scripts/sync-repos.sh pull && git push
```

### Why This Matters

- **sync-repos.sh auto-detects** product names from `_instances/` folder (no code changes needed)
- **Copilot instructions define** what "all product repos" means for AI agents
- **Without updating copilot-instructions.md**, AI won't know the new repo exists when you say "sync all products"

---

## Syncing EPF

**Pull framework updates (recommended method):**
```bash
# From product repository (e.g., emergent, twentyfirst, lawmatics, huma-blueprint-ui)
./docs/EPF/scripts/sync-repos.sh pull
```

**Push framework improvements (from canonical EPF repo):**
```bash
# CRITICAL: Always check if version bump needed FIRST
./scripts/classify-changes.sh

# If version bump needed:
./scripts/bump-framework-version.sh "X.Y.Z" "Description"
git add VERSION README.md MAINTENANCE.md integration_specification.yaml
git commit -m "chore(version): Bump to vX.Y.Z"

# Then push to canonical
git push origin main
```

**Sync updates to all product repos:**

When EPF framework is updated in canonical repo, propagate to all product repos:

```bash
# ⚠️ IMPORTANT: Product repos are: emergent, twentyfirst, lawmatics, huma-blueprint-ui
# ALWAYS use sync-repos.sh (NOT git subtree commands directly)

# Method 1: Manual sync (run from each product repo)
cd /Users/nikolai/Code/emergent && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/twentyfirst && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/lawmatics && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /Users/nikolai/Code/huma-blueprint-ui && ./docs/EPF/scripts/sync-repos.sh pull && git push

# Method 2: Automated sync (when user asks to "update all product repos")
# For EACH of the 4 repos above, sequentially:
#   1. cd to repo directory
#   2. Run: ./docs/EPF/scripts/sync-repos.sh pull
#   3. Handle conflicts: git checkout --theirs <files> && git add .
#   4. Commit: git commit (if needed)
#   5. Push: git push
```

**⛔ DEPRECATED: Manual subtree operations (DO NOT USE):**
```bash
# ❌ NEVER USE THESE COMMANDS - They cannot exclude _instances/ properly
# ❌ ALWAYS use sync-repos.sh instead

# git subtree pull --prefix=docs/EPF epf main --squash
# git subtree push --prefix=docs/EPF epf main

# Why deprecated:
# - git subtree push cannot exclude directories (_instances/ would pollute canonical)
# - No version bump checks before push
# - No conflict resolution for product .gitignore
# - sync-repos.sh handles all these issues correctly
```

---

## Key Directories

- `templates/READY/` - Strategy & planning templates (00-05)
- `templates/FIRE/` - Execution templates
- `templates/AIM/` - Assessment templates
- `schemas/` - JSON Schema validation files
- `wizards/` - AI-assisted content creation prompts
- `scripts/` - Automation scripts

---

## For Ongoing Maintenance & Consistency Checks

See **MAINTENANCE.md** for:
- **AI Agent Consistency Protocol** (STEP 0-5) - Complete protocol for maintaining EPF
- Version management procedures
- Instance validation rules
- Schema-artifact alignment
- Traceability checks
- Breaking change detection
- Post-change verification checklists

---

## For Canonical Purity Rules

See **CANONICAL_PURITY_RULES.md** for:
- What NEVER goes in canonical EPF
- Framework vs instance separation
- Absolute rules and decision trees
- Common violations and corrections

---

## For Learning from Past Mistakes

See **.github/instructions/self-learning.instructions.md** for:
- Past AI mistakes and lessons learned
- Prevention checklists
- Schema-first generation principles
- Time cost analysis of rework

---
## 🏥 Health Check & Quality Validation

EPF provides **two complementary validation systems**:

### 1. Framework Health Check (for EPF maintainers)
```bash
# Check framework integrity before committing framework changes
./scripts/epf-health-check.sh

# Auto-fix VERSION mismatches
./scripts/epf-health-check.sh --fix
```

**Use when:**
- Making framework changes (schemas, templates, docs)
- Before committing to canonical EPF repository
- After version bumps (`bump-framework-version.sh`)

**Checks:** VERSION consistency, schema validity, YAML parsing, documentation structure

---

### 2. Instance Health Check (for product teams)

EPF provides a **3-tier validation system** for assessing instance artifact quality:

#### Tier 1: Schema Compliance (Always Required)
```bash
# Validate all artifacts pass schema validation
./scripts/validate-schemas.sh _instances/my-product
./scripts/validate-instance.sh _instances/my-product

# Exit code 0 = valid, 1 = errors
```

### Tier 2: Field Coverage Analysis (Recommended for Quality)
```bash
# Analyze how complete artifacts are (beyond just "valid")
./scripts/analyze-field-coverage.sh _instances/my-product

# Shows:
# - Coverage percentage (0-100%)
# - Missing CRITICAL/HIGH/MEDIUM fields
# - ROI and effort estimates for enrichment
# - Health grade (A/B/C/D)
```

**When to use Tier 2:**
- After creating/updating major artifacts (roadmap, features)
- Before milestone reviews or stakeholder presentations
- When artifacts feel "incomplete" but pass validation
- To identify high-value enrichment opportunities

### Tier 3: Version Alignment (Recommended for Currency)
```bash
# Check if artifacts lag behind schema evolution
./scripts/check-version-alignment.sh _instances/my-product

# Classifications:
# - CURRENT: matches schema (0 versions behind)
# - BEHIND: 1-2 minor versions behind
# - STALE: 3+ minor versions behind
# - OUTDATED: major version behind (breaking changes)
```

**When to use Tier 3:**
- After EPF framework updates (version bumps)
- Before starting new READY/FIRE cycles
- When artifacts haven't been updated in months
- To identify migration priorities

### Migration & Enrichment

⚠️ **CRITICAL: Do NOT invent your own migration approach!**

Before attempting ANY EPF migration:
1. **Read [`MIGRATIONS.md`](../MIGRATIONS.md)** - Contains mandatory AI agent protocol
2. **Read [`migrations/registry.yaml`](../migrations/registry.yaml)** - Machine-readable instructions
3. **Generate plan FIRST**: `./scripts/generate-migration-plan.sh _instances/{product}`
4. **Follow the plan's `ai_instructions`** - Do NOT improvise

**Why this matters:** Migration has validation built into every step. Improvised migrations accumulate errors that are painful to fix. The documented approach catches problems immediately.

```bash
# Generate migration plan (MANDATORY first step)
./scripts/generate-migration-plan.sh _instances/my-product
# Creates MIGRATION_PLAN.yaml with priorities and AI instructions

# Interactive migration (wizard-guided)
./scripts/migrate-artifact.sh _instances/my-product/READY/05_roadmap_recipe.yaml

# Batch migration (prioritized)
./scripts/batch-migrate.sh _instances/my-product --dry-run
./scripts/batch-migrate.sh _instances/my-product --priority high
```

**Migration Infrastructure:**
- `MIGRATIONS.md` - Strategy guide and AI agent instructions
- `migrations/registry.yaml` - Machine-readable version history with changes
- `migrations/guides/*.md` - Detailed migration guides per version transition

**Workflow:**
1. Run Tier 1 (compliance) - must pass
2. Run Tier 2 (coverage) - identify gaps
3. Run Tier 3 (alignment) - check currency
4. Generate migration plan: `./scripts/generate-migration-plan.sh`
5. Execute migrations following plan's `ai_instructions`
6. Re-validate to confirm improvements

**Complete documentation:** See [`scripts/README.md`](../scripts/README.md) - Enhanced Health Check System section

---
## 🔧 Quick Command Reference

### Health Check Commands

```bash
# Framework health (for EPF maintainers)
./scripts/epf-health-check.sh              # Check framework integrity
./scripts/epf-health-check.sh --fix        # Auto-fix VERSION issues

# Instance health (for product teams)
./scripts/validate-instance.sh _instances/{product}          # Tier 1-3 dashboard
./scripts/analyze-field-coverage.sh _instances/{product}     # Tier 2 deep dive
./scripts/check-version-alignment.sh _instances/{product}    # Tier 3 deep dive
./scripts/generate-migration-plan.sh _instances/{product}    # Create MIGRATION_PLAN.yaml
./scripts/migrate-artifact.sh path/to/artifact.yaml          # Interactive enrichment
./scripts/batch-migrate.sh _instances/{product} --dry-run    # Batch migration
```

### Version Management

```bash
# Check current EPF version
cat VERSION

# Classify changes and check if version bump needed (NEW in v2.0.1) ✨
./scripts/classify-changes.sh                    # Check uncommitted changes
./scripts/classify-changes.sh --staged           # Check staged changes
./scripts/classify-changes.sh --since-commit HEAD~1  # Check last commit

# Bump framework version (automated - prevents inconsistencies)
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
```

### Validation

```bash
# Validate an instance
./scripts/validate-instance.sh _instances/{product-name}

# Validate schemas
./scripts/validate-schemas.sh _instances/{product-name}

# Validate feature quality
./scripts/validate-feature-quality.sh definitions/product/path/to/feature.yaml

# Validate cross-references (check that all feature dependencies exist)
./scripts/validate-cross-references.sh definitions/product/

# Validate value model references (THE LINCHPIN - checks strategic alignment)
./scripts/validate-value-model-references.sh definitions/product/

# Validate roadmap references (checks assumption testing links)
./scripts/validate-roadmap-references.sh definitions/product/

# Check roadmap balance before FIRE phase (NEW in v2.0.0) ✨
# Use AI wizard: @wizards/balance_checker.agent_prompt.md
# Requires: roadmap file, North Star, resource constraints
# Output: Viability score (threshold: ≥75/100 for FIRE commitment)

# Bump framework version (automated - prevents inconsistencies)
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"

# Sync EPF updates to product repos (after pushing to canonical)
# Run from each product repo:
cd /path/to/emergent && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /path/to/twentyfirst && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /path/to/lawmatics && ./docs/EPF/scripts/sync-repos.sh pull && git push
cd /path/to/huma-blueprint-ui && ./docs/EPF/scripts/sync-repos.sh pull && git push
```

---

## READY Phase Workflow ✨ Updated for v2.0.0

When creating or updating a roadmap (`05_roadmap_recipe.yaml`):

1. **Create/Update Roadmap** - Define OKRs, KRs, assumptions across 4 tracks
2. **Validate Schema** - `./scripts/validate-schemas.sh roadmap_file.yaml`
3. **Check Balance** ✨ NEW - Run balance checker before FIRE phase:
   - Reference: `@wizards/balance_checker.agent_prompt.md`
   - Provide: roadmap file, North Star, team size, budget, constraints
   - Get: Viability assessment (Resource 30%, Balance 25%, Coherence 25%, Alignment 20%)
   - Iterate: Adjust roadmap if score < 75/100
   - Commit: Only after viability confirmed (≥75/100)
4. **Proceed to FIRE** - Execute roadmap with confidence

**Why balance checking matters**: EPF's "braided model" has 4 interdependent tracks. Balance checker prevents over-commitment, imbalanced portfolios, circular dependencies, and timeline infeasibility before you commit resources.

---

## Full Documentation

See `MAINTENANCE.md` for complete instructions on:
- Framework vs Instance separation
- Versioning conventions
- All sync scenarios
- AI assistant decision tree
- Complete consistency protocol

---

## 🚨 AI Self-Learning: Common Mistakes & Prevention

### Mistake 1: Polluting Canonical Directories with Working Documents

**What I did wrong (2025-12-31):**
- Created `TRL_UNIVERSAL_IMPLEMENTATION_SUMMARY.md` in `docs/EPF/schemas/`
- Created `UNIVERSAL_TRL_FRAMEWORK.md` in `docs/EPF/schemas/`
- These are WORKING/SUMMARY documents, not canonical framework files

**Why it's wrong:**
- `docs/EPF/schemas/` is for **JSON Schema files only** (framework validation rules)
- Working documents, summaries, analysis belong in `.epf-work/` directory
- Pollutes canonical EPF with temporary/session-specific content
- User has corrected this mistake MULTIPLE times

**Root cause:**
- When completing a task (schema update), I instinctively want to "document what I did"
- I see an existing directory (schemas/) and think "this is related, put summary here"
- I forget the fundamental rule: **EPF directories are type-specific, not topic-specific**

**Correct approach:**
1. **Before creating ANY file in docs/EPF/**, ask: "Is this a canonical framework file?"
2. **Canonical framework files** (allowed in docs/EPF/):
   - JSON Schema files (`.json`) in `schemas/`
   - YAML templates (`.yaml`) in `templates/`
   - AI prompts (`.md`) in `wizards/`
   - Shell scripts (`.sh`) in `scripts/`
   - Framework documentation (`README.md`, `MAINTENANCE.md`, `CANONICAL_PURITY_RULES.md`)
3. **Working/summary documents** (MUST go in `.epf-work/`):
   - Implementation summaries
   - Session notes
   - Analysis documents
   - Decision records
   - Any file with words like: SUMMARY, IMPLEMENTATION, ANALYSIS, DECISION, NOTES, SESSION

**Decision tree for file placement:**
```
Creating a new .md file?
├─ Is it an AI wizard prompt (agent_prompt.md)? → docs/EPF/wizards/
├─ Is it core framework docs (README, MAINTENANCE, etc.)? → docs/EPF/
└─ Is it a summary/analysis/session note? → .epf-work/{session-name}/
```

**Prevention checklist:**
- [ ] File name contains: SUMMARY, IMPLEMENTATION, ANALYSIS, DECISION, SESSION, NOTES? → `.epf-work/`
- [ ] File documents "what I just did" vs "how to use EPF"? → `.epf-work/`
- [ ] File is specific to one task/session vs reusable framework? → `.epf-work/`
- [ ] Would this file help future EPF users or just explain this change? → If latter, `.epf-work/`

**Quick fix when I make this mistake:**
```bash
# Move working documents from canonical to EPF .epf-work
mv docs/EPF/schemas/SUMMARY_FILE.md docs/EPF/.epf-work/{session-name}/
```

**Remember:** EPF is a FRAMEWORK. Working documents are PROJECT-SPECIFIC. Keep them separate!

---

### Mistake 2: Creating Multiple .epf-work Directories at Different Levels

**What I did wrong (2025-12-31):**
- Created `.epf-work/` at repository root (`/emergent/.epf-work`)
- Created `.epf-work/` at EPF level (`/emergent/docs/EPF/.epf-work`)
- Created `.epf-work/` at instance level (`/emergent/docs/EPF/_instances/emergent/.epf-work`)
- Result: 3 different working directories across the repository!

**Why it's wrong:**
- Confusing: Where should new working documents go?
- Inconsistent: Files scattered across multiple locations
- Hard to find: Need to check 3 locations to find session notes
- Violates single source of truth principle

**Root cause:**
- When working at repository root, created `.epf-work/` there
- When working in EPF directory, created `.epf-work/` there
- When working on instance, created `.epf-work/` there
- Didn't stop to ask: "Is there already a canonical working directory?"

**Correct approach:**
1. **ONLY ONE .epf-work directory**: `docs/EPF/.epf-work/`
2. **ALL working documents go there**, regardless of where I'm working in the repo
3. **Use subdirectories** to organize by session/topic:
   ```
   docs/EPF/.epf-work/
   ├── skattefunn-wizard-selection/
   ├── validator-work/
   ├── emergent-instance-work/
   └── schema-enhancement-2025-12-28/
   ```

**Decision tree for working document placement:**
```
Creating a working document?
├─ Is it EPF-related? → docs/EPF/.epf-work/{session-name}/
└─ Is it product-specific (non-EPF)? → Still docs/EPF/.epf-work/ (EPF is framework for all product work)
```

**Why docs/EPF/.epf-work/ is the canonical location:**
- EPF is the framework for ALL product development work
- Working documents are analysis/notes about using EPF
- Keeping them with EPF ensures they're version-controlled with framework
- Easy to find: single location for all temporary work
- Instance-specific work still belongs here (instances are EPF usage examples)

**Prevention checklist:**
- [ ] Before creating `.epf-work/` directory, check: Does `docs/EPF/.epf-work/` exist? → Use it!
- [ ] Before creating session subdirectory, check: Is this session already documented? → Add to existing!
- [ ] Never create `.epf-work/` at repository root
- [ ] Never create `.epf-work/` inside `_instances/`

**Quick fix when I make this mistake:**
```bash
# Consolidate all .epf-work directories to canonical location
mv .epf-work/* docs/EPF/.epf-work/{session-name}/
rmdir .epf-work/

# Or move from instance directory
mv docs/EPF/_instances/{product}/.epf-work/* docs/EPF/.epf-work/{session-name}/
rmdir docs/EPF/_instances/{product}/.epf-work/
```

**Remember:** ONE working directory (`docs/EPF/.epf-work/`), organized by sessions. Check for existing location before creating new!
