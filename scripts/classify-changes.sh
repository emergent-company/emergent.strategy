#!/bin/bash
set -e

# EPF Change Type Classifier
# Analyzes git changes and recommends version bump type
#
# Usage: ./scripts/classify-changes.sh [--staged|--since-commit <commit>]
# 
# Examples:
#   ./scripts/classify-changes.sh --staged          # Check staged changes
#   ./scripts/classify-changes.sh --since-commit HEAD~1  # Check last commit
#   ./scripts/classify-changes.sh                   # Check all uncommitted changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$EPF_ROOT"

# Parse arguments
MODE="unstaged"
SINCE_COMMIT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --staged)
            MODE="staged"
            shift
            ;;
        --since-commit)
            MODE="since-commit"
            SINCE_COMMIT="$2"
            shift 2
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo ""
            echo "Usage: ./scripts/classify-changes.sh [--staged|--since-commit <commit>]"
            exit 1
            ;;
    esac
done

# Get list of changed files
if [ "$MODE" = "staged" ]; then
    CHANGED_FILES=$(git diff --cached --name-only)
    CHANGE_SCOPE="staged changes"
elif [ "$MODE" = "since-commit" ]; then
    CHANGED_FILES=$(git diff --name-only "$SINCE_COMMIT")
    CHANGE_SCOPE="changes since $SINCE_COMMIT"
else
    CHANGED_FILES=$(git diff --name-only)
    CHANGE_SCOPE="uncommitted changes"
fi

if [ -z "$CHANGED_FILES" ]; then
    echo "ℹ️  No $CHANGE_SCOPE detected"
    exit 0
fi

echo "🔍 EPF Change Classifier"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Analyzing: $CHANGE_SCOPE"
echo ""

# Initialize counters
SCHEMAS_CHANGED=0
TEMPLATES_CHANGED=0
DOCS_CHANGED=0
WIZARDS_CHANGED=0
SCRIPTS_CHANGED=0
WORK_FILES_CHANGED=0
GITHUB_FILES_CHANGED=0
VERSION_FILES_CHANGED=0
OTHER_CHANGED=0

# Classify each file
while IFS= read -r file; do
    case "$file" in
        schemas/*.json)
            SCHEMAS_CHANGED=$((SCHEMAS_CHANGED + 1))
            ;;
        templates/*)
            TEMPLATES_CHANGED=$((TEMPLATES_CHANGED + 1))
            ;;
        docs/*.md|docs/guides/*.md|README.md|MAINTENANCE.md|CANONICAL_PURITY_RULES.md)
            DOCS_CHANGED=$((DOCS_CHANGED + 1))
            ;;
        wizards/*)
            WIZARDS_CHANGED=$((WIZARDS_CHANGED + 1))
            ;;
        scripts/*)
            SCRIPTS_CHANGED=$((SCRIPTS_CHANGED + 1))
            ;;
        .epf-work/*)
            WORK_FILES_CHANGED=$((WORK_FILES_CHANGED + 1))
            ;;
        .github/*)
            GITHUB_FILES_CHANGED=$((GITHUB_FILES_CHANGED + 1))
            ;;
        VERSION|integration_specification.yaml)
            VERSION_FILES_CHANGED=$((VERSION_FILES_CHANGED + 1))
            ;;
        *)
            OTHER_CHANGED=$((OTHER_CHANGED + 1))
            ;;
    esac
done <<< "$CHANGED_FILES"

# Display summary
echo "📊 Change Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $SCHEMAS_CHANGED -gt 0 ] && echo "  📋 Schemas:           $SCHEMAS_CHANGED file(s)"
[ $TEMPLATES_CHANGED -gt 0 ] && echo "  📄 Templates:         $TEMPLATES_CHANGED file(s)"
[ $DOCS_CHANGED -gt 0 ] && echo "  📚 Documentation:     $DOCS_CHANGED file(s)"
[ $WIZARDS_CHANGED -gt 0 ] && echo "  🧙 Wizards:           $WIZARDS_CHANGED file(s)"
[ $SCRIPTS_CHANGED -gt 0 ] && echo "  🔧 Scripts:           $SCRIPTS_CHANGED file(s)"
[ $WORK_FILES_CHANGED -gt 0 ] && echo "  📝 Work files:        $WORK_FILES_CHANGED file(s) (.epf-work/)"
[ $GITHUB_FILES_CHANGED -gt 0 ] && echo "  ⚙️  GitHub config:     $GITHUB_FILES_CHANGED file(s) (.github/)"
[ $VERSION_FILES_CHANGED -gt 0 ] && echo "  🏷️  Version files:    $VERSION_FILES_CHANGED file(s)"
[ $OTHER_CHANGED -gt 0 ] && echo "  ❓ Other:             $OTHER_CHANGED file(s)"
echo ""

# Determine version bump recommendation
NEEDS_VERSION_BUMP=false
RECOMMENDED_TYPE=""
REASONING=()

# Check if version files already changed
if [ $VERSION_FILES_CHANGED -gt 0 ]; then
    echo "✅ Version files already updated"
    echo ""
    echo "Current version: $(cat VERSION 2>/dev/null || echo 'unknown')"
    exit 0
fi

# Classify change severity
if [ $SCHEMAS_CHANGED -gt 0 ]; then
    NEEDS_VERSION_BUMP=true
    echo "⚠️  Schema changes detected - requires manual review:"
    echo "   - Breaking changes (removed fields, type changes)? → MAJOR"
    echo "   - New optional fields? → MINOR"
    echo "   - Documentation/validation fixes? → PATCH"
    REASONING+=("Schemas modified ($SCHEMAS_CHANGED file(s))")
    echo ""
fi

if [ $TEMPLATES_CHANGED -gt 0 ]; then
    NEEDS_VERSION_BUMP=true
    if [ -z "$RECOMMENDED_TYPE" ]; then
        RECOMMENDED_TYPE="MINOR"
    fi
    REASONING+=("Templates modified ($TEMPLATES_CHANGED file(s))")
fi

if [ $DOCS_CHANGED -gt 0 ]; then
    NEEDS_VERSION_BUMP=true
    if [ -z "$RECOMMENDED_TYPE" ]; then
        RECOMMENDED_TYPE="PATCH"
    fi
    REASONING+=("Documentation modified ($DOCS_CHANGED file(s))")
fi

if [ $WIZARDS_CHANGED -gt 0 ]; then
    NEEDS_VERSION_BUMP=true
    if [ -z "$RECOMMENDED_TYPE" ] || [ "$RECOMMENDED_TYPE" = "PATCH" ]; then
        RECOMMENDED_TYPE="MINOR"
    fi
    REASONING+=("Wizards modified ($WIZARDS_CHANGED file(s))")
fi

if [ $SCRIPTS_CHANGED -gt 0 ]; then
    NEEDS_VERSION_BUMP=true
    if [ -z "$RECOMMENDED_TYPE" ]; then
        RECOMMENDED_TYPE="PATCH"
    fi
    REASONING+=("Scripts modified ($SCRIPTS_CHANGED file(s))")
fi

# Report recommendation
if [ "$NEEDS_VERSION_BUMP" = true ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔔 VERSION BUMP REQUIRED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if [ -n "$RECOMMENDED_TYPE" ]; then
        echo "Recommended: $RECOMMENDED_TYPE"
        echo ""
    fi
    
    echo "Reasoning:"
    for reason in "${REASONING[@]}"; do
        echo "  • $reason"
    done
    echo ""
    
    CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
    echo "Current version: $CURRENT_VERSION"
    echo ""
    echo "To bump version:"
    echo "  ./scripts/bump-framework-version.sh \"X.Y.Z\" \"Release notes\""
    echo ""
    
    # Calculate next version suggestions
    if [ "$CURRENT_VERSION" != "unknown" ] && [[ "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        MAJOR="${BASH_REMATCH[1]}"
        MINOR="${BASH_REMATCH[2]}"
        PATCH="${BASH_REMATCH[3]}"
        
        echo "Version suggestions:"
        echo "  MAJOR: $((MAJOR + 1)).0.0  (breaking changes)"
        echo "  MINOR: $MAJOR.$((MINOR + 1)).0  (new features, backward-compatible)"
        echo "  PATCH: $MAJOR.$MINOR.$((PATCH + 1))  (fixes, documentation)"
    fi
    
    exit 1  # Exit with error to signal version bump needed
else
    if [ $WORK_FILES_CHANGED -gt 0 ] || [ $GITHUB_FILES_CHANGED -gt 0 ]; then
        echo "✅ No version bump required"
        echo ""
        echo "Changes are limited to:"
        [ $WORK_FILES_CHANGED -gt 0 ] && echo "  • Working files (.epf-work/) - not part of framework"
        [ $GITHUB_FILES_CHANGED -gt 0 ] && echo "  • GitHub config (.github/) - infrastructure only"
        echo ""
        echo "Safe to commit without version bump."
    else
        echo "ℹ️  No framework changes detected"
    fi
    
    exit 0
fi
