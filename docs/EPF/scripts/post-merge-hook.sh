#!/bin/bash
# Post-merge hook to auto-install version consistency checks
# This ensures pre-commit hooks are always up to date after pulling/merging

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check if we're in the EPF repository (has VERSION file and scripts/ dir)
if [ ! -f "$EPF_ROOT/VERSION" ] || [ ! -d "$EPF_ROOT/scripts" ]; then
    # Not in EPF root, exit silently
    exit 0
fi

# Check if install script exists
if [ ! -f "$EPF_ROOT/scripts/install-version-hooks.sh" ]; then
    exit 0
fi

# Only run if the scripts directory or hook installer was updated
if git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD | grep -qE "scripts/(install-version-hooks|pre-commit-version-check)\.sh"; then
    echo "📦 EPF scripts updated - reinstalling version hooks..."
    "$EPF_ROOT/scripts/install-version-hooks.sh" --quiet || true
fi

exit 0
