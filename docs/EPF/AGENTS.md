# AGENTS.md - AI Agent Instructions for EPF

> **This file is for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.)**
> Read this FIRST before performing any EPF operations.

## 🚨 CRITICAL RULE: EPF HAS A SCRIPT FOR EVERYTHING

**DO NOT use raw git commands or shell operations for EPF tasks.**

EPF is a heavily tooled framework. Every common operation has a dedicated script that handles edge cases, validation, and proper sequencing. Using raw commands will break things.

### Script Lookup Table

| Task | ❌ DON'T use | ✅ DO use |
|------|-------------|----------|
| **Sync EPF from canonical** | `git pull`, `git subtree pull` | `./scripts/sync-repos.sh pull` |
| **Push changes to canonical** | `git push`, `git subtree push` | `./scripts/sync-repos.sh push` |
| **Check sync status** | `git status`, `git diff` | `./scripts/sync-repos.sh check` |
| **Check migration needs** | Manual version comparison | `./scripts/generate-migration-plan.sh <instance>` |
| **Validate instance** | Manual file checks | `./scripts/validate-instance.sh <instance>` |
| **Validate schemas** | `jq` on schema files | `./scripts/validate-schemas.sh` |
| **Bump version** | Edit VERSION file directly | `./scripts/bump-framework-version.sh "X.Y.Z" "notes"` |
| **Health check** | Various manual checks | `./scripts/epf-health-check.sh` |
| **Check version alignment** | Compare versions manually | `./scripts/check-version-alignment.sh <instance>` |
| **Content quality check** | Read files manually | `./scripts/check-content-readiness.sh <dir>` |
| **Classify changes** | Guess if version bump needed | `./scripts/classify-changes.sh` |
| **Create new instance** | Copy folders manually | `./scripts/create-instance-structure.sh <name>` |

### When in Doubt

```bash
# List all available scripts
ls scripts/*.sh

# Read the comprehensive script documentation
cat scripts/README.md
```

## 📍 Context: Where Am I?

EPF can exist in two contexts:

1. **Canonical repo** (`eyedea-io/epf`) - The source of truth for the framework
2. **Product repo** (e.g., `lawmatics/docs/EPF/`) - Framework embedded via git subtree

**How to detect:**
- If `_instances/` contains actual company data → Product repo
- If `_instances/` only has README.md → Canonical repo

**In product repos, always run scripts from the repo root:**
```bash
# Correct (from product repo root)
./docs/EPF/scripts/sync-repos.sh pull

# Wrong (from EPF subdirectory - git commands will fail)
cd docs/EPF && ./scripts/sync-repos.sh pull
```

## 🔄 Common Workflows

### Update EPF in a Product Repo
```bash
# From product repo root (e.g., /path/to/lawmatics)
./docs/EPF/scripts/sync-repos.sh pull
./docs/EPF/scripts/generate-migration-plan.sh docs/EPF/_instances/<name>
# Review plan, then validate
./docs/EPF/scripts/validate-instance.sh docs/EPF/_instances/<name>
```

### Make Framework Changes (in canonical repo)
```bash
# 1. Make your changes
# 2. Check if version bump needed
./scripts/classify-changes.sh
# 3. If yes, bump version
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
# 4. Commit and push
./scripts/sync-repos.sh push
```

### Migrate Artifacts
```bash
# 1. Generate migration plan
./scripts/generate-migration-plan.sh _instances/<name>
# 2. Review the generated MIGRATION_PLAN.yaml
# 3. Follow the ai_instructions in that file
# 4. Validate EACH artifact after migration (fail fast!)
./scripts/validate-instance.sh _instances/<name>
```

## 📚 Key Documentation

| File | Purpose |
|------|---------|
| `scripts/README.md` | Comprehensive script documentation |
| `migrations/registry.yaml` | Version history & migration protocol |
| `MAINTENANCE.md` | Framework maintenance guide |
| `outputs/AI_INSTRUCTIONS.md` | How to use output generators |

## ⚠️ Anti-Patterns to Avoid

1. **Don't compare artifact versions against framework VERSION**
   - Artifacts compare against SCHEMA versions (each schema has independent versioning)
   - See `migrations/registry.yaml` for the versioning model explanation

2. **Don't edit VERSION file directly**
   - Use `bump-framework-version.sh` which updates all related files

3. **Don't git push/pull EPF directly in product repos**
   - Use `sync-repos.sh` which handles subtree, gitignore preservation, etc.

4. **Don't skip validation steps**
   - Always validate after changes: `validate-instance.sh`, `epf-health-check.sh`

5. **Don't invent custom migration logic**
   - Read `migrations/registry.yaml` for what actually changed between versions
   - Follow the `ai_migration_protocol` defined there

## 🆘 If Something Goes Wrong

1. Run health check: `./scripts/epf-health-check.sh`
2. Check for known issues: `cat KNOWN_ISSUES.md`
3. If sync issues: `./scripts/sync-repos.sh check`
4. If validation fails: Read the error, fix ONE issue, re-validate (fail fast)

---

*Last updated: 2026-01-25 | EPF v2.9.1*
