#!/bin/bash
# Pre-commit hook to verify version consistency across VERSION, README.md, MAINTENANCE.md, and integration_specification.yaml
# This prevents inconsistent versions from being committed
#
# To install: cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Check if any version-related files are being committed
VERSION_FILES_CHANGED=false
if git diff --cached --name-only | grep -qE "^(VERSION|README\.md|MAINTENANCE\.md|integration_specification\.yaml)$"; then
    VERSION_FILES_CHANGED=true
fi

# If no version files changed, skip check
if [ "$VERSION_FILES_CHANGED" = false ]; then
    exit 0
fi

echo "🔍 Checking version consistency..."

# Get versions from staged files
VERSION_IN_VERSION=$(git diff --cached VERSION | grep "^+" | grep -v "^+++" | sed 's/^+//')
VERSION_IN_README=$(git diff --cached README.md | grep "^+# Emergent Product Framework" | sed 's/.*v\([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')
VERSION_IN_MAINTENANCE=$(git diff --cached MAINTENANCE.md | grep "^+\*\*Current Framework Version:\*\*" | sed 's/.*v\([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')
VERSION_IN_INTEGRATION_SPEC=$(git diff --cached integration_specification.yaml | grep "^+# Version:" | sed 's/.*: \([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')

# If no version changes in staged files, check current files
if [ -z "$VERSION_IN_VERSION" ]; then
    VERSION_IN_VERSION=$(cat VERSION 2>/dev/null)
fi
if [ -z "$VERSION_IN_README" ]; then
    VERSION_IN_README=$(grep "^# Emergent Product Framework (EPF) Repository - v" README.md | sed 's/.*v\([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')
fi
if [ -z "$VERSION_IN_MAINTENANCE" ]; then
    VERSION_IN_MAINTENANCE=$(grep "**Current Framework Version:**" MAINTENANCE.md | sed 's/.*v\([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')
fi
if [ -z "$VERSION_IN_INTEGRATION_SPEC" ]; then
    VERSION_IN_INTEGRATION_SPEC=$(grep "^# Version:" integration_specification.yaml | sed 's/.*: \([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/')
fi

echo "   VERSION:                  $VERSION_IN_VERSION"
echo "   README.md:                $VERSION_IN_README"
echo "   MAINTENANCE.md:           $VERSION_IN_MAINTENANCE"
echo "   integration_specification: $VERSION_IN_INTEGRATION_SPEC"

# Check for consistency
CONSISTENT=true
ERROR_MSG=""

if [ "$VERSION_IN_VERSION" != "$VERSION_IN_README" ]; then
    CONSISTENT=false
    ERROR_MSG="${ERROR_MSG}\n❌ VERSION ($VERSION_IN_VERSION) doesn't match README.md ($VERSION_IN_README)"
fi

if [ "$VERSION_IN_VERSION" != "$VERSION_IN_MAINTENANCE" ]; then
    CONSISTENT=false
    ERROR_MSG="${ERROR_MSG}\n❌ VERSION ($VERSION_IN_VERSION) doesn't match MAINTENANCE.md ($VERSION_IN_MAINTENANCE)"
fi

if [ "$VERSION_IN_VERSION" != "$VERSION_IN_INTEGRATION_SPEC" ]; then
    CONSISTENT=false
    ERROR_MSG="${ERROR_MSG}\n❌ VERSION ($VERSION_IN_VERSION) doesn't match integration_specification.yaml ($VERSION_IN_INTEGRATION_SPEC)"
fi

if [ "$CONSISTENT" = false ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ COMMIT BLOCKED: Version inconsistency detected!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "$ERROR_MSG"
    echo ""
    echo "All four files must have the same version:"
    echo "   - VERSION (line 1)"
    echo "   - README.md (header)"
    echo "   - MAINTENANCE.md (Current Framework Version)"
    echo "   - integration_specification.yaml (header comment)"
    echo ""
    echo "💡 Use the automated script to bump version:"
    echo "   ./scripts/bump-framework-version.sh \"X.Y.Z\" \"Release notes\""
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi

echo "✅ Version consistency verified!"
exit 0
