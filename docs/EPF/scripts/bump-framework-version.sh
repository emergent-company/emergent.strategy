#!/bin/bash
set -e

# EPF Framework Version Bump Script
# Automatically updates VERSION, README.md, MAINTENANCE.md, and integration_specification.yaml consistently
# 
# This script ensures ALL version-related files are updated to prevent inconsistencies
# that cause AI agent confusion.
#
# Usage: ./scripts/bump-framework-version.sh <version> "<release-notes>"
# Example: ./scripts/bump-framework-version.sh "1.14.0" "Added new feature X, Fixed bug Y"

VERSION="$1"
RELEASE_NOTES="$2"
DATE=$(date +%Y-%m-%d)

if [ -z "$VERSION" ] || [ -z "$RELEASE_NOTES" ]; then
    echo "❌ Error: Missing required arguments"
    echo ""
    echo "Usage: ./scripts/bump-framework-version.sh <version> \"<release-notes>\""
    echo ""
    echo "Example:"
    echo '  ./scripts/bump-framework-version.sh "1.14.0" "Added new feature X, Fixed bug Y"'
    echo ""
    exit 1
fi

# Validate version format (must be semver: X.Y.Z)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Error: Version must be in semver format (X.Y.Z)"
    echo "   Got: $VERSION"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$EPF_ROOT"

echo "🚀 EPF Framework Version Bump: v$VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pre-bump Framework Health Check
echo "🏥 Running pre-bump framework health check..."
echo ""
set +e  # Temporarily disable errexit to capture exit code
./scripts/epf-health-check.sh
HEALTH_EXIT_CODE=$?
set -e  # Re-enable errexit

if [ "$HEALTH_EXIT_CODE" -eq 1 ] || [ "$HEALTH_EXIT_CODE" -eq 3 ]; then
    echo ""
    echo "❌ Framework health check failed!"
    echo "   Please fix critical issues before bumping version."
    echo ""
    exit 1
elif [ "$HEALTH_EXIT_CODE" -eq 2 ]; then
    echo ""
    echo "⚠️  Health check passed with warnings (this is acceptable)"
    echo ""
else
    echo ""
    echo "✅ Pre-bump health check passed"
    echo ""
fi

# Get current version
CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
echo "📌 Current version: $CURRENT_VERSION"
echo "📌 New version:     $VERSION"
echo "📅 Date:            $DATE"
echo ""
echo "📝 Release notes:"
echo "   $RELEASE_NOTES"
echo ""

# Confirm before proceeding
read -p "Continue with version bump? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "📝 Updating files..."
echo ""

# 1. Update VERSION file
echo "$VERSION" > VERSION
echo "✅ [1/4] Updated VERSION"

# 2. Update README.md header
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' -E "s/# Emergent Product Framework \(EPF\) Repository - v[0-9]+\.[0-9]+\.[0-9]+/# Emergent Product Framework (EPF) Repository - v$VERSION/" README.md
else
    # Linux
    sed -i -E "s/# Emergent Product Framework \(EPF\) Repository - v[0-9]+\.[0-9]+\.[0-9]+/# Emergent Product Framework (EPF) Repository - v$VERSION/" README.md
fi
echo "✅ [2/4] Updated README.md header"

# 3. Add "What's New" section to README.md
# Find the line number of the first "## What's New" section
FIRST_WHATS_NEW_LINE=$(grep -n "^## What's New in v" README.md | head -n 1 | cut -d: -f1)

if [ -z "$FIRST_WHATS_NEW_LINE" ]; then
    echo "❌ Error: Could not find 'What's New' section in README.md"
    exit 1
fi

# Create temporary file with new "What's New" section inserted
{
    head -n $((FIRST_WHATS_NEW_LINE - 1)) README.md
    echo "## What's New in v$VERSION"
    echo ""
    echo "$RELEASE_NOTES"
    echo ""
    tail -n +$FIRST_WHATS_NEW_LINE README.md
} > README.md.tmp
mv README.md.tmp README.md

echo "✅ [3/4] Added 'What's New in v$VERSION' to README.md"

# 4. Update MAINTENANCE.md version reference
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' -E "s/\*\*Current Framework Version:\*\* v[0-9]+\.[0-9]+\.[0-9]+/**Current Framework Version:** v$VERSION/" MAINTENANCE.md
else
    # Linux
    sed -i -E "s/\*\*Current Framework Version:\*\* v[0-9]+\.[0-9]+\.[0-9]+/**Current Framework Version:** v$VERSION/" MAINTENANCE.md
fi
echo "✅ [4/5] Updated MAINTENANCE.md"

# 5. Update integration_specification.yaml (4 version references)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' -E "s/^# Version: [0-9]+\.[0-9]+\.[0-9]+/# Version: $VERSION/" integration_specification.yaml
    sed -i '' -E "s/^  version: \"[0-9]+\.[0-9]+\.[0-9]+\"/  version: \"$VERSION\"/" integration_specification.yaml
    sed -i '' -E "s/^  this_spec_version: \"[0-9]+\.[0-9]+\.[0-9]+\"/  this_spec_version: \"$VERSION\"/" integration_specification.yaml
    sed -i '' -E "s/^    - version: \"[0-9]+\.[0-9]+\.[0-9]+\"/    - version: \"$VERSION\"/" integration_specification.yaml
else
    # Linux
    sed -i -E "s/^# Version: [0-9]+\.[0-9]+\.[0-9]+/# Version: $VERSION/" integration_specification.yaml
    sed -i -E "s/^  version: \"[0-9]+\.[0-9]+\.[0-9]+\"/  version: \"$VERSION\"/" integration_specification.yaml
    sed -i -E "s/^  this_spec_version: \"[0-9]+\.[0-9]+\.[0-9]+\"/  this_spec_version: \"$VERSION\"/" integration_specification.yaml
    sed -i -E "s/^    - version: \"[0-9]+\.[0-9]+\.[0-9]+\"/    - version: \"$VERSION\"/" integration_specification.yaml
fi
echo "✅ [5/5] Updated integration_specification.yaml"

# 6. Update migrations/registry.yaml (epf_current_version and last_updated)
REGISTRY_FILE="migrations/registry.yaml"
if [ -f "$REGISTRY_FILE" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' -E "s/^epf_current_version: \"[0-9]+\.[0-9]+\.[0-9]+\"/epf_current_version: \"$VERSION\"/" "$REGISTRY_FILE"
        sed -i '' -E "s/^last_updated: \"[0-9]{4}-[0-9]{2}-[0-9]{2}\"/last_updated: \"$DATE\"/" "$REGISTRY_FILE"
    else
        # Linux
        sed -i -E "s/^epf_current_version: \"[0-9]+\.[0-9]+\.[0-9]+\"/epf_current_version: \"$VERSION\"/" "$REGISTRY_FILE"
        sed -i -E "s/^last_updated: \"[0-9]{4}-[0-9]{2}-[0-9]{2}\"/last_updated: \"$DATE\"/" "$REGISTRY_FILE"
    fi
    echo "✅ [6/6] Updated migrations/registry.yaml (epf_current_version, last_updated)"
    
    echo ""
    echo "⚠️  REMINDER: Migration registry version entry"
    echo "   The bump script updated epf_current_version and last_updated."
    echo "   If this version includes breaking changes or new fields:"
    echo "   → Manually add a version entry to migrations/registry.yaml"
    echo "   → Create migration guide if needed: migrations/guides/vX.X-to-v$VERSION.md"
    echo ""
else
    echo "⚠️  [6/6] migrations/registry.yaml not found (skipped)"
fi

echo ""
echo "🔍 Verifying consistency..."
echo ""

# Verify all files have been updated
VERSION_IN_VERSION=$(cat VERSION)
VERSION_IN_README=$(grep "^# Emergent Product Framework (EPF) Repository - v" README.md | sed -E 's/.*v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
VERSION_IN_MAINTENANCE=$(grep "\*\*Current Framework Version:\*\*" MAINTENANCE.md | sed -E 's/.*v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
VERSION_IN_INTEGRATION_SPEC=$(grep "^# Version:" integration_specification.yaml | sed -E 's/.*: ([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
WHATS_NEW_COUNT=$(grep -c "## What's New in v$VERSION" README.md || echo "0")

# Check migration registry if it exists
if [ -f "migrations/registry.yaml" ]; then
    VERSION_IN_REGISTRY=$(grep "^epf_current_version:" migrations/registry.yaml | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
else
    VERSION_IN_REGISTRY="(not found)"
fi

echo "   VERSION file:             $VERSION_IN_VERSION"
echo "   README.md header:         $VERSION_IN_README"
echo "   MAINTENANCE.md:           $VERSION_IN_MAINTENANCE"
echo "   integration_specification: $VERSION_IN_INTEGRATION_SPEC"
echo "   migrations/registry.yaml: $VERSION_IN_REGISTRY"
echo "   What's New:               $WHATS_NEW_COUNT section(s)"
echo ""

# Check for consistency
CONSISTENT=true
if [ "$VERSION_IN_VERSION" != "$VERSION" ]; then
    echo "❌ VERSION file has wrong version: $VERSION_IN_VERSION (expected $VERSION)"
    CONSISTENT=false
fi
if [ "$VERSION_IN_README" != "$VERSION" ]; then
    echo "❌ README.md header has wrong version: $VERSION_IN_README (expected $VERSION)"
    CONSISTENT=false
fi
if [ "$VERSION_IN_MAINTENANCE" != "$VERSION" ]; then
    echo "❌ MAINTENANCE.md has wrong version: $VERSION_IN_MAINTENANCE (expected $VERSION)"
    CONSISTENT=false
fi
if [ "$VERSION_IN_INTEGRATION_SPEC" != "$VERSION" ]; then
    echo "❌ integration_specification.yaml has wrong version: $VERSION_IN_INTEGRATION_SPEC (expected $VERSION)"
    CONSISTENT=false
fi
if [ -f "migrations/registry.yaml" ] && [ "$VERSION_IN_REGISTRY" != "$VERSION" ]; then
    echo "❌ migrations/registry.yaml has wrong version: $VERSION_IN_REGISTRY (expected $VERSION)"
    CONSISTENT=false
fi
if [ "$WHATS_NEW_COUNT" -eq 0 ]; then
    echo "❌ README.md is missing 'What's New in v$VERSION' section"
    CONSISTENT=false
fi

if [ "$CONSISTENT" = false ]; then
    echo ""
    echo "⚠️  Version inconsistency detected! Please review the changes."
    exit 1
fi

echo "✅ All files are consistent!"
echo ""

# Post-bump Framework Health Check
echo "🏥 Running post-bump framework health check..."
echo ""
set +e  # Temporarily disable errexit to capture exit code
./scripts/epf-health-check.sh
POST_HEALTH_EXIT_CODE=$?
set -e  # Re-enable errexit

if [ "$POST_HEALTH_EXIT_CODE" -eq 1 ] || [ "$POST_HEALTH_EXIT_CODE" -eq 3 ]; then
    echo ""
    echo "❌ Post-bump health check failed!"
    echo "   Version files may have inconsistencies."
    echo ""
    exit 1
elif [ "$POST_HEALTH_EXIT_CODE" -eq 2 ]; then
    echo ""
    echo "⚠️  Post-bump health check passed with warnings (acceptable)"
    echo ""
else
    echo ""
    echo "✅ Post-bump health check passed"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Changes Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "migrations/registry.yaml" ]; then
    git diff --stat VERSION README.md MAINTENANCE.md integration_specification.yaml migrations/registry.yaml
else
    git diff --stat VERSION README.md MAINTENANCE.md integration_specification.yaml
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Version Bump Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo ""
echo "   1. Review changes:"
echo "      git diff"
echo ""
echo "   2. Commit (use this exact message):"
echo "      git add VERSION README.md MAINTENANCE.md integration_specification.yaml migrations/registry.yaml"
echo "      git commit -m \"Release: Bump version to $VERSION"
echo ""
echo "      $RELEASE_NOTES\""
echo ""
echo "   3. Push to canonical repository:"
echo "      git push origin main"
echo ""
echo "   4. Propagate to product repos:"
echo "      ./scripts/sync-repos.sh push"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
