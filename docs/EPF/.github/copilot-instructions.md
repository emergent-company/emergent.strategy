# EPF Copilot Instructions

**Purpose:** Quick reference for EPF setup and daily usage  
**When to use:** Adding EPF to a new repository, syncing framework updates, quick pre-flight checks  
**See also:**
- `MAINTENANCE.md` → Comprehensive consistency protocol (see "AI Agent Consistency Protocol" section)
- `CANONICAL_PURITY_RULES.md` → Framework vs instance separation rules
- `.github/instructions/self-learning.instructions.md` → Learn from past AI mistakes

---

## ⚠️ CRITICAL: Pre-Flight Checklist for AI Agents

**BEFORE doing ANYTHING with EPF, answer these questions:**

### Question 1: Where am I right now?
```bash
pwd  # Check your current working directory
```

- If you are in `/Users/*/Code/epf` (or similar canonical EPF path) → **STOP!** Read `CANONICAL_PURITY_RULES.md`
- If you are in `/Users/*/Code/{product-name}` (e.g., huma-blueprint-ui, twentyfirst, lawmatics) → Proceed

### Question 2: What is the user asking me to do?

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

## When User Asks to "Add EPF" to a New Repo

Run this command from the target product repository:

```bash
# Download and run the setup script
curl -sSL https://raw.githubusercontent.com/eyedea-io/epf/main/scripts/add-to-repo.sh | bash -s -- {product-name}
```

Or manually:

```bash
# 1. Add EPF remote
git remote add epf git@github.com:eyedea-io/epf.git

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

---

## Syncing EPF

**Pull framework updates:**
```bash
git subtree pull --prefix=docs/EPF epf main --squash -m "EPF: Pull updates"
```

**Push framework improvements:**
```bash
git subtree push --prefix=docs/EPF epf main
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

## Quick Command Reference

```bash
# Check current EPF version
cat VERSION

# Classify changes and check if version bump needed (NEW in v2.0.1) ✨
./scripts/classify-changes.sh                    # Check uncommitted changes
./scripts/classify-changes.sh --staged           # Check staged changes
./scripts/classify-changes.sh --since-commit HEAD~1  # Check last commit

# Bump framework version (automated - prevents inconsistencies)
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"

# Validate an instance
./scripts/validate-instance.sh _instances/{product-name}

# Validate schemas
./scripts/validate-schemas.sh _instances/{product-name}

# Validate feature quality
./scripts/validate-feature-quality.sh features/path/to/feature.yaml

# Validate cross-references (check that all feature dependencies exist)
./scripts/validate-cross-references.sh features/

# Validate value model references (THE LINCHPIN - checks strategic alignment)
./scripts/validate-value-model-references.sh features/

# Validate roadmap references (checks assumption testing links)
./scripts/validate-roadmap-references.sh features/

# Check roadmap balance before FIRE phase (NEW in v2.0.0) ✨
# Use AI wizard: @wizards/balance_checker.agent_prompt.md
# Requires: roadmap file, North Star, resource constraints
# Output: Viability score (threshold: ≥75/100 for FIRE commitment)

# Bump framework version (automated - prevents inconsistencies)
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
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

