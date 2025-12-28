# EPF Version Management - Automated & Foolproof

> **Last updated**: EPF v1.13.0 | **Status**: Current

## The Problem

Version inconsistencies have repeatedly caused AI agent confusion. When VERSION, README.md, and MAINTENANCE.md don't match, AI agents get conflicting information about which version is current, leading to:

- ❌ Outdated version references in documentation
- ❌ Confusion about what features are available
- ❌ Inconsistent behavior across tools
- ❌ Wasted time debugging version mismatches

### Root Cause
Manual version management requires updating THREE files simultaneously:
1. `VERSION` - Single line file with version number
2. `README.md` - Header and "What's New" section
3. `MAINTENANCE.md` - "Current Framework Version" reference

**Humans and AI agents forget steps**, leading to inconsistencies.

## The Solution: Automation + Enforcement

We've implemented a two-layer defense system:

### Layer 1: Automated Version Bump Script

**Use this script for ALL version bumps:**

```bash
./scripts/bump-framework-version.sh "X.Y.Z" "Release notes describing the changes"
```

**Example:**
```bash
./scripts/bump-framework-version.sh "1.14.0" "Added VALUE_MODEL guides, Enhanced product architect wizard, Improved sync script"
```

#### What the Script Does Automatically:

1. ✅ **Updates VERSION file** - Single source of truth
2. ✅ **Updates README.md header** - Changes "v1.13.0" to "v1.14.0"
3. ✅ **Adds "What's New" section** - Inserts your release notes before previous version
4. ✅ **Updates MAINTENANCE.md** - Updates "Current Framework Version" reference
5. ✅ **Verifies consistency** - Checks all files match before finishing
6. ✅ **Shows git commands** - Provides exact commit message to use

#### Script Output:

```
🚀 EPF Framework Version Bump: v1.14.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 Current version: 1.13.0
📌 New version:     1.14.0
📅 Date:            2025-12-23

📝 Release notes:
   Added VALUE_MODEL guides, Enhanced product architect wizard

Continue with version bump? (y/n) y

📝 Updating files...

✅ [1/4] Updated VERSION
✅ [2/4] Updated README.md header
✅ [3/4] Added 'What's New in v1.14.0' to README.md
✅ [4/4] Updated MAINTENANCE.md

🔍 Verifying consistency...

   VERSION file:     1.14.0
   README.md header: 1.14.0
   MAINTENANCE.md:   1.14.0
   What's New:       1 section(s)

✅ All files are consistent!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Changes Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 VERSION        | 1 +
 README.md      | 8 ++++++++
 MAINTENANCE.md | 2 +-
 3 files changed, 10 insertions(+), 1 deletion(-)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Version Bump Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Next Steps:

   1. Review changes:
      git diff

   2. Commit (use this exact message):
      git add VERSION README.md MAINTENANCE.md
      git commit -m "Release: Bump version to 1.14.0

      Added VALUE_MODEL guides, Enhanced product architect wizard"

   3. Push to canonical repository:
      git push origin main

   4. Propagate to product repos:
      ./scripts/sync-repos.sh push
```

### Layer 2: Pre-Commit Git Hook

**Install once to prevent inconsistent commits:**

```bash
./scripts/install-version-hooks.sh
```

#### What the Hook Does:

The git pre-commit hook runs automatically before EVERY commit and:

1. ✅ Detects if VERSION, README.md, or MAINTENANCE.md are being committed
2. ✅ Extracts version from each file
3. ✅ Compares versions across all three files
4. ❌ **BLOCKS the commit** if versions don't match
5. ✅ Shows helpful error message with exact mismatch

#### Example Hook Output (Blocking Bad Commit):

```
🔍 Checking version consistency...
   VERSION:        1.14.0
   README.md:      1.13.0  ← MISMATCH!
   MAINTENANCE.md: 1.14.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ COMMIT BLOCKED: Version inconsistency detected!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ VERSION (1.14.0) doesn't match README.md (1.13.0)

All three files must have the same version:
   - VERSION (line 1)
   - README.md (header)
   - MAINTENANCE.md (Current Framework Version)

💡 Use the automated script to bump version:
   ./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The commit is BLOCKED until you fix the inconsistency!

## Usage Workflows

### Scenario 1: Bumping Framework Version (Normal Release)

```bash
# 1. Determine version increment (see Semantic Versioning below)
# Let's say going from 1.13.0 → 1.14.0 (MINOR bump for new features)

# 2. Run the automated script
./scripts/bump-framework-version.sh "1.14.0" "Added X, Enhanced Y, Fixed Z"

# 3. Review the changes
git diff

# 4. Commit (use exact message from script output)
git add VERSION README.md MAINTENANCE.md
git commit -m "Release: Bump version to 1.14.0

Added X, Enhanced Y, Fixed Z"

# 5. Push to canonical EPF
git push origin main

# 6. Propagate to product repos
./scripts/sync-repos.sh push
```

### Scenario 2: Emergency Fix for Version Inconsistency

If you discover versions are already inconsistent:

```bash
# 1. Check current state
grep -E "v1\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md

# 2. Determine correct version (usually VERSION file is authoritative)
cat VERSION

# 3. Run script with CURRENT version to fix inconsistency
./scripts/bump-framework-version.sh "1.13.0" "Fix version inconsistency in documentation"

# 4. Commit the fix
git add VERSION README.md MAINTENANCE.md
git commit -m "docs: Fix version inconsistency

- Ensure VERSION, README.md, and MAINTENANCE.md all show v1.13.0
- Prevents AI agent confusion with versioning"

# 5. Push
git push origin main
```

### Scenario 3: Verifying Version Consistency

Before committing version-related changes:

```bash
# Quick verification
grep -E "v1\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md

# Should show:
# VERSION:1.13.0
# README.md:# Emergent Product Framework (EPF) Repository - v1.13.0
# README.md:## What's New in v1.13.0
# MAINTENANCE.md:**Current Framework Version:** v1.13.0
```

All files must show the SAME version number!

## Semantic Versioning Guide

EPF follows [Semantic Versioning (SemVer)](https://semver.org/):

**Format:** `MAJOR.MINOR.PATCH` (e.g., `1.14.2`)

### When to Increment:

| Version | When | Examples |
|---------|------|----------|
| **MAJOR** (1.x.x → 2.x.x) | Breaking changes to framework structure | - Changed file naming convention<br>- Restructured template hierarchy<br>- Removed/renamed core schemas |
| **MINOR** (x.1.x → x.2.x) | New features, backward-compatible | - Added new guide<br>- Added new wizard<br>- Enhanced existing templates<br>- Added new schema fields (optional) |
| **PATCH** (x.x.1 → x.x.2) | Bug fixes, documentation updates | - Fixed typos<br>- Clarified documentation<br>- Fixed schema validation<br>- Updated examples |

### Current Version: 1.13.0

**Recent version history:**
- `1.13.0` (2024-12-21) - Added VALUE_MODEL guides, product architect wizard, enhanced templates
- `1.12.0` (2024-12-19) - Added Feature Definition Schema v2.0 quality system
- `1.11.0` - Previous release...

## For AI Agents: Critical Rules

### ⚠️ NEVER Do This:

1. ❌ Don't manually edit VERSION file
2. ❌ Don't manually edit README.md version
3. ❌ Don't manually edit MAINTENANCE.md version
4. ❌ Don't update only 1 or 2 files (must be all 3!)
5. ❌ Don't forget to add "What's New" section
6. ❌ Don't commit version changes without verification

### ✅ ALWAYS Do This:

1. ✅ Use `./scripts/bump-framework-version.sh` for ALL version bumps
2. ✅ Verify consistency before committing: `grep -E "v1\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md`
3. ✅ Run the verification even if you used the script (double-check!)
4. ✅ Install pre-commit hook: `./scripts/install-version-hooks.sh`
5. ✅ Read the script output carefully - it provides exact commands
6. ✅ If you discover inconsistency, fix it immediately with the script

### Decision Tree for AI Agents:

```
User wants to bump version?
  ↓
Is there a version bump script? (./scripts/bump-framework-version.sh)
  ↓ YES
Use the script! NEVER do it manually.
  ↓
Run: ./scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
  ↓
Follow the script output for commit message
  ↓
Done! ✅

  ↓ NO (script doesn't exist??)
STOP! Inform user that automation is missing.
Ask them to check if they're in the correct repository.
```

## Installation

### For Canonical EPF Repository:

```bash
cd /Users/nikolai/Code/epf

# Verify scripts exist
ls -la scripts/bump-framework-version.sh
ls -la scripts/pre-commit-version-check.sh
ls -la scripts/install-version-hooks.sh

# Install pre-commit hook
./scripts/install-version-hooks.sh
```

### For Product Repositories:

The scripts and hooks are part of the EPF framework and will be synced via git subtree:

```bash
cd /path/to/product-repo

# After syncing EPF framework
git subtree pull --prefix=docs/EPF epf main --squash

# Install hooks in product repo
./docs/EPF/scripts/install-version-hooks.sh
```

## Troubleshooting

### "Script not found" Error

```bash
# Make sure you're in the EPF root
pwd  # Should show /Users/*/Code/epf or /path/to/product/docs/EPF

# Check if script exists
ls -la scripts/bump-framework-version.sh

# If missing, you may need to sync from canonical EPF
git subtree pull --prefix=docs/EPF epf main --squash
```

### "Permission denied" Error

```bash
# Make script executable
chmod +x scripts/bump-framework-version.sh
chmod +x scripts/pre-commit-version-check.sh
chmod +x scripts/install-version-hooks.sh
```

### Version Still Inconsistent After Using Script

```bash
# 1. Check what the script actually changed
git diff

# 2. Verify versions manually
grep -E "v1\.[0-9]+\.[0-9]+" VERSION README.md MAINTENANCE.md

# 3. If still wrong, report as bug with:
#    - Script output (copy/paste)
#    - git diff output
#    - OS version (macOS/Linux)
```

### Pre-Commit Hook Not Blocking Bad Commits

```bash
# Check if hook is installed
ls -la .git/hooks/pre-commit

# Reinstall if missing
./scripts/install-version-hooks.sh

# Test the hook manually
.git/hooks/pre-commit
```

## Benefits

### Before (Manual Process):
- ❌ Required remembering 3 file locations
- ❌ Required correct sed syntax for updates
- ❌ Required manual "What's New" section creation
- ❌ Easy to forget a file → inconsistency
- ❌ Easy to make typos → inconsistency
- ❌ No verification before commit
- ❌ Inconsistencies only discovered later
- ❌ AI agents frequently confused

### After (Automated Process):
- ✅ Single command updates all files
- ✅ Consistent formatting guaranteed
- ✅ "What's New" section auto-generated
- ✅ Built-in verification before finishing
- ✅ Pre-commit hook catches mistakes
- ✅ Clear error messages with fix instructions
- ✅ Exact git commit commands provided
- ✅ AI agents have consistent information
- ✅ Impossible to create inconsistency accidentally

## Related Documentation

- `MAINTENANCE.md` - Version Increment Checklist section (uses these scripts)
- `.ai-agent-instructions.md` - Framework Version Consistency section (references these scripts)
- `scripts/bump-framework-version.sh` - The automation script itself
- `scripts/pre-commit-version-check.sh` - The pre-commit hook
- `scripts/install-version-hooks.sh` - Hook installation script

## Related Resources

- **Guide**: [INSTANTIATION_GUIDE.md](./INSTANTIATION_GUIDE.md) - Creating EPF instances (references current version)
- **Guide**: [HEALTH_CHECK_ENHANCEMENT.md](./HEALTH_CHECK_ENHANCEMENT.md) - Health check enhancements including version validation
- **Script**: [bump-framework-version.sh](../../scripts/bump-framework-version.sh) - Automated version bump script
- **Script**: [pre-commit-version-check.sh](../../scripts/pre-commit-version-check.sh) - Pre-commit hook for version consistency

## Version History of This System

- **2025-12-23**: Created automated version bump system to solve recurring AI agent confusion
- **2025-12-21**: Version 1.13.0 release forgot to update README.md → inconsistency discovered
- **2025-12-19**: Version 1.12.0 release - last manual version bump

**Going forward:** ALL version bumps MUST use the automated script.
