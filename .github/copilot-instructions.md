# EPF Copilot Instructions

This is the **Emergent Product Framework (EPF)** - a structured approach to product development used across multiple product repositories.

## ⚠️ CRITICAL: Pre-Flight Checklist for AI Agents

**BEFORE doing ANYTHING with EPF instances, answer these questions:**

### Question 1: Where am I right now?
```bash
pwd  # Check your current working directory
```

- If you are in `/Users/*/Code/epf` (or similar canonical EPF path) → **STOP!** Read CANONICAL_PURITY_RULES.md
- If you are in `/Users/*/Code/{product-name}` (e.g., huma-blueprint-ui, twentyfirst, lawmatics) → Proceed

### Question 2: What is the user asking me to do?

- **"Create an instance"** or **"Add a product line"** → Instance work (must be in product repo)
- **"Update EPF framework"** or **"Fix schema"** → Framework work (can be in canonical EPF)

### Question 3: Am I about to create files in `_instances/`?

- If YES and you're in canonical EPF repo → **STOP! NEVER DO THIS!**
- If YES and you're in a product repo → Correct, proceed
- Read `CANONICAL_PURITY_RULES.md` for absolute rules

**IF IN DOUBT:** Read `CANONICAL_PURITY_RULES.md` first, then `MAINTENANCE.md`, then proceed.

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

## Syncing EPF

**Pull framework updates:**
```bash
git subtree pull --prefix=docs/EPF epf main --squash -m "EPF: Pull updates"
```

**Push framework improvements:**
```bash
git subtree push --prefix=docs/EPF epf main
```

## Key Directories

- `templates/READY/` - Strategy & planning templates (00-05)
- `templates/FIRE/` - Execution templates
- `templates/AIM/` - Assessment templates
- `schemas/` - JSON Schema validation files
- `wizards/` - AI-assisted content creation prompts
- `scripts/` - Automation scripts

## Full Documentation

See `MAINTENANCE.md` for complete instructions on:
- Framework vs Instance separation
- Versioning conventions
- All sync scenarios
- AI assistant decision tree
