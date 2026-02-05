#!/bin/bash
# sync-embedded.sh - Copies canonical EPF artifacts into the embedded directory for go:embed
#
# This script is run before `go build` to ensure the binary contains the latest
# canonical EPF schemas, templates, wizards, and generators.
#
# Usage: ./scripts/sync-embedded.sh [canonical-epf-path]
#   If no path is provided, uses CANONICAL_EPF_PATH env var or defaults to ../../../canonical-epf

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_CLI_DIR="$(dirname "$SCRIPT_DIR")"
EMBEDDED_DIR="$EPF_CLI_DIR/internal/embedded"

# Determine canonical EPF path
if [ -n "$1" ]; then
    CANONICAL_EPF="$1"
elif [ -n "$CANONICAL_EPF_PATH" ]; then
    CANONICAL_EPF="$CANONICAL_EPF_PATH"
else
    # Default: assume canonical-epf is sibling to emergent repo
    CANONICAL_EPF="$EPF_CLI_DIR/../../../canonical-epf"
fi

# Resolve to absolute path
CANONICAL_EPF="$(cd "$CANONICAL_EPF" 2>/dev/null && pwd)" || {
    echo "Error: Canonical EPF not found at: $CANONICAL_EPF"
    echo ""
    echo "Please either:"
    echo "  1. Clone canonical-epf to the expected location"
    echo "  2. Set CANONICAL_EPF_PATH environment variable"
    echo "  3. Pass the path as an argument: $0 /path/to/canonical-epf"
    exit 1
}

echo "Syncing embedded artifacts from: $CANONICAL_EPF"
echo "Target: $EMBEDDED_DIR"
echo ""

# Clean existing embedded artifacts (but not the Go source files)
rm -rf "$EMBEDDED_DIR/schemas" "$EMBEDDED_DIR/templates" "$EMBEDDED_DIR/wizards" "$EMBEDDED_DIR/outputs"

# Create directories
mkdir -p "$EMBEDDED_DIR/schemas"
mkdir -p "$EMBEDDED_DIR/templates"
mkdir -p "$EMBEDDED_DIR/wizards"
mkdir -p "$EMBEDDED_DIR/outputs"

# Copy schemas (required for validation)
echo "Copying schemas..."
cp "$CANONICAL_EPF"/schemas/*.json "$EMBEDDED_DIR/schemas/" 2>/dev/null || {
    echo "Warning: No schema files found"
}
SCHEMA_COUNT=$(ls -1 "$EMBEDDED_DIR/schemas/"*.json 2>/dev/null | wc -l | tr -d ' ')
echo "  Copied $SCHEMA_COUNT schema files"

# Copy templates (required for init/scaffold)
echo "Copying templates..."
cp -r "$CANONICAL_EPF/templates/"* "$EMBEDDED_DIR/templates/" 2>/dev/null || {
    echo "Warning: No template files found"
}

# Copy wizards/agent prompts (required for MCP tools)
echo "Copying wizards..."
cp "$CANONICAL_EPF"/wizards/*.md "$EMBEDDED_DIR/wizards/" 2>/dev/null || {
    echo "Warning: No wizard files found"
}
WIZARD_COUNT=$(ls -1 "$EMBEDDED_DIR/wizards/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "  Copied $WIZARD_COUNT wizard files"

# Copy generators (default output generators)
echo "Copying generators..."
GENERATOR_COUNT=0
for generator_dir in "$CANONICAL_EPF/outputs/"*/; do
    if [ -d "$generator_dir" ]; then
        generator_name=$(basename "$generator_dir")
        # Only copy if it looks like a generator (has schema.json or wizard.instructions.md)
        if [ -f "$generator_dir/schema.json" ] || [ -f "$generator_dir/wizard.instructions.md" ]; then
            mkdir -p "$EMBEDDED_DIR/outputs/$generator_name"
            cp -r "$generator_dir"* "$EMBEDDED_DIR/outputs/$generator_name/"
            echo "  Copied generator: $generator_name"
            GENERATOR_COUNT=$((GENERATOR_COUNT + 1))
        fi
    fi
done
echo "  Copied $GENERATOR_COUNT generators"

# Copy VERSION file
if [ -f "$CANONICAL_EPF/VERSION" ]; then
    cp "$CANONICAL_EPF/VERSION" "$EMBEDDED_DIR/VERSION"
    echo ""
    echo "Embedded EPF version: $(cat "$EMBEDDED_DIR/VERSION")"
else
    echo "unknown" > "$EMBEDDED_DIR/VERSION"
    echo ""
    echo "Warning: No VERSION file found in canonical EPF"
fi

# Create a manifest of embedded files
echo ""
echo "Creating manifest..."
cat > "$EMBEDDED_DIR/MANIFEST.txt" << EOF
# EPF-CLI Embedded Artifacts Manifest
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Source: $CANONICAL_EPF
# Version: $(cat "$EMBEDDED_DIR/VERSION")

## Schemas
$(ls -1 "$EMBEDDED_DIR/schemas/"*.json 2>/dev/null | xargs -I {} basename {} | sort)

## Templates
$(find "$EMBEDDED_DIR/templates" -type f -name "*.yaml" -o -name "*.yml" 2>/dev/null | sed "s|$EMBEDDED_DIR/templates/||" | sort)

## Wizards
$(ls -1 "$EMBEDDED_DIR/wizards/"*.md 2>/dev/null | xargs -I {} basename {} | sort)

## Generators
$(ls -1d "$EMBEDDED_DIR/outputs/"*/ 2>/dev/null | xargs -I {} basename {} | sort)
EOF

echo ""
echo "Sync complete!"
echo ""
echo "Summary:"
echo "  Schemas:    $SCHEMA_COUNT files"
echo "  Templates:  $(find "$EMBEDDED_DIR/templates" -type f 2>/dev/null | wc -l | tr -d ' ') files"
echo "  Wizards:    $WIZARD_COUNT files"
echo "  Generators: $(ls -1d "$EMBEDDED_DIR/outputs/"*/ 2>/dev/null | wc -l | tr -d ' ') directories"
