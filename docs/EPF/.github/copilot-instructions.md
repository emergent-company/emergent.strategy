# EPF Copilot Instructions

This is the **Emergent Product Framework (EPF)** - a structured approach to product development used across multiple product repositories.

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
cp docs/EPF/phases/READY/*.yaml docs/EPF/_instances/{product-name}/

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

- `phases/READY/` - Strategy & planning templates (00-05)
- `phases/FIRE/` - Execution templates
- `phases/AIM/` - Assessment templates
- `schemas/` - JSON Schema validation files
- `wizards/` - AI-assisted content creation prompts
- `scripts/` - Automation scripts

## Full Documentation

See `MAINTENANCE.md` for complete instructions on:
- Framework vs Instance separation
- Versioning conventions
- All sync scenarios
- AI assistant decision tree
