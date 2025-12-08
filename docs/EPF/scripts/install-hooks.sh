#!/bin/bash
# EPF Hooks Installer
# Version: 1.0.0
#
# Installs EPF git hooks to the current repository.
#
# Usage:
#   ./docs/EPF/scripts/install-hooks.sh

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Find repo and EPF root
REPO_ROOT="$(git rev-parse --show-toplevel)"
EPF_HOOKS="$REPO_ROOT/docs/EPF/scripts/hooks"
GIT_HOOKS="$REPO_ROOT/.git/hooks"

if [[ ! -d "$EPF_HOOKS" ]]; then
    echo "Error: EPF hooks directory not found at $EPF_HOOKS"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} Installing EPF git hooks..."

# Install pre-commit hook
if [[ -f "$EPF_HOOKS/pre-commit" ]]; then
    ln -sf "$EPF_HOOKS/pre-commit" "$GIT_HOOKS/pre-commit"
    chmod +x "$GIT_HOOKS/pre-commit"
    echo -e "${GREEN}✅${NC} Installed pre-commit hook"
fi

echo -e "${GREEN}Done!${NC} EPF hooks are now active."
echo ""
echo "Hooks installed:"
ls -la "$GIT_HOOKS" | grep -E "pre-commit|pre-push" || true
