#!/bin/bash
# Install EPF version consistency checks
# Run this once to set up the pre-commit hook

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"
HOOK_SOURCE="$SCRIPT_DIR/pre-commit-version-check.sh"
HOOK_DEST="$EPF_ROOT/.git/hooks/pre-commit"

echo "🔧 Installing EPF version consistency pre-commit hook..."
echo ""

# Check if .git directory exists
if [ ! -d "$EPF_ROOT/.git" ]; then
    echo "❌ Error: .git directory not found"
    echo "   Make sure you're in the EPF repository root"
    exit 1
fi

# Check if hook source exists
if [ ! -f "$HOOK_SOURCE" ]; then
    echo "❌ Error: Hook source not found at $HOOK_SOURCE"
    exit 1
fi

# Backup existing hook if it exists
if [ -f "$HOOK_DEST" ]; then
    echo "📋 Backing up existing pre-commit hook to pre-commit.backup"
    cp "$HOOK_DEST" "$HOOK_DEST.backup"
fi

# Copy and make executable
cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-commit hook installed!"
echo ""
echo "The hook will automatically check version consistency before each commit."
echo "It will block commits if VERSION, README.md, and MAINTENANCE.md don't match."
echo ""
echo "💡 To bump version correctly, use:"
echo "   ./scripts/bump-framework-version.sh \"X.Y.Z\" \"Release notes\""
echo ""
