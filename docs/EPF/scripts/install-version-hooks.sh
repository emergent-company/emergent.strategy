#!/bin/bash
# Install EPF version consistency checks
# Run this once to set up pre-commit and post-merge hooks
#
# Usage: ./scripts/install-version-hooks.sh [--quiet]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"
PRECOMMIT_SOURCE="$SCRIPT_DIR/pre-commit-version-check.sh"
PRECOMMIT_DEST="$EPF_ROOT/.git/hooks/pre-commit"
POSTMERGE_SOURCE="$SCRIPT_DIR/post-merge-hook.sh"
POSTMERGE_DEST="$EPF_ROOT/.git/hooks/post-merge"

QUIET=false
if [ "$1" = "--quiet" ]; then
    QUIET=true
fi

log() {
    if [ "$QUIET" = false ]; then
        echo "$@"
    fi
}

log "🔧 Installing EPF version consistency hooks..."
log ""

# Check if .git directory exists
if [ ! -d "$EPF_ROOT/.git" ]; then
    echo "❌ Error: .git directory not found"
    echo "   Make sure you're in the EPF repository root"
    exit 1
fi

# Install pre-commit hook
if [ ! -f "$PRECOMMIT_SOURCE" ]; then
    echo "❌ Error: Pre-commit hook source not found at $PRECOMMIT_SOURCE"
    exit 1
fi

if [ -f "$PRECOMMIT_DEST" ] && [ "$QUIET" = false ]; then
    log "📋 Backing up existing pre-commit hook to pre-commit.backup"
    cp "$PRECOMMIT_DEST" "$PRECOMMIT_DEST.backup"
fi

cp "$PRECOMMIT_SOURCE" "$PRECOMMIT_DEST"
chmod +x "$PRECOMMIT_DEST"
log "✅ Pre-commit hook installed (version consistency check)"

# Install post-merge hook
if [ -f "$POSTMERGE_SOURCE" ]; then
    if [ -f "$POSTMERGE_DEST" ] && [ "$QUIET" = false ]; then
        log "📋 Backing up existing post-merge hook to post-merge.backup"
        cp "$POSTMERGE_DEST" "$POSTMERGE_DEST.backup"
    fi
    
    cp "$POSTMERGE_SOURCE" "$POSTMERGE_DEST"
    chmod +x "$POSTMERGE_DEST"
    log "✅ Post-merge hook installed (auto-reinstall after pulls)"
fi

log ""
log "🎯 Version consistency protection is now active!"
log ""
log "What happens now:"
log "  • Pre-commit: Blocks commits if VERSION/README/MAINTENANCE/integration_spec don't match"
log "  • Post-merge: Auto-reinstalls hooks after pulling updates"
log ""
log "💡 To bump version correctly, use:"
log "   ./scripts/bump-framework-version.sh \"X.Y.Z\" \"Release notes\""
log ""
