#!/bin/bash
# EPF Version Bump Script
# Ensures all version references are updated consistently
#
# Usage: ./bump-version.sh <new-version> "<changelog-description>"
# Example: ./bump-version.sh 1.4.0 "Added validation tooling"

set -e

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <new-version> \"<changelog-description>\""
    echo "Example: $0 1.4.0 \"Added validation tooling\""
    exit 1
fi

NEW_VERSION="$1"
CHANGELOG_DESC="$2"
DATE=$(date +%Y-%m-%d)

# Validate version format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format X.Y.Z (e.g., 1.4.0)"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"
SPEC_FILE="$EPF_ROOT/integration_specification.yaml"

echo "Bumping EPF Integration Specification to version $NEW_VERSION"
echo "Changelog: $CHANGELOG_DESC"
echo ""

# Get current version
CURRENT_VERSION=$(grep "^  version:" "$SPEC_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"
echo "New version: $NEW_VERSION"
echo ""

# 1. Update comment header
sed -i '' "s/^# Version: $CURRENT_VERSION/# Version: $NEW_VERSION/" "$SPEC_FILE"

# 2. Update specification.version
sed -i '' "s/^  version: \"$CURRENT_VERSION\"/  version: \"$NEW_VERSION\"/" "$SPEC_FILE"

# 3. Update versioning.this_spec_version
sed -i '' "s/this_spec_version: \"$CURRENT_VERSION\"/this_spec_version: \"$NEW_VERSION\"/" "$SPEC_FILE"

# 4. Add changelog entry (insert after "changelog:" line)
# Create the new changelog entry
CHANGELOG_ENTRY="    - version: \"$NEW_VERSION\"\n      date: \"$DATE\"\n      changes: \"$CHANGELOG_DESC\""

# Use awk to insert the entry after "changelog:"
awk -v entry="$CHANGELOG_ENTRY" '
    /^  changelog:/ {
        print
        print entry
        next
    }
    { print }
' "$SPEC_FILE" > "$SPEC_FILE.tmp" && mv "$SPEC_FILE.tmp" "$SPEC_FILE"

echo "✅ Updated: $SPEC_FILE"
echo ""
echo "Changes made:"
echo "  - Header comment version"
echo "  - specification.version"
echo "  - versioning.this_spec_version"
echo "  - Added changelog entry"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff $SPEC_FILE"
echo "  2. Commit: git add $SPEC_FILE && git commit -m 'EPF: Bump integration spec to v$NEW_VERSION'"
echo "  3. Sync: ./scripts/sync-repos.sh push"
