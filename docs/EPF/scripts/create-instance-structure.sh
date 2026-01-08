#!/bin/bash
# Script to create complete EPF instance directory structure
# Usage: ./scripts/create-instance-structure.sh [--update] <product-name>

set -e

UPDATE_MODE=false

# Parse arguments
if [ "$1" = "--update" ]; then
    UPDATE_MODE=true
    PRODUCT_NAME="$2"
else
    PRODUCT_NAME="$1"
fi

if [ -z "$PRODUCT_NAME" ]; then
    echo "Error: Product name required"
    echo "Usage: ./scripts/create-instance-structure.sh [--update] <product-name>"
    echo ""
    echo "Options:"
    echo "  --update    Update existing instance (only add missing folders)"
    echo ""
    echo "Example (new): ./scripts/create-instance-structure.sh my-product"
    echo "Example (update): ./scripts/create-instance-structure.sh --update my-product"
    exit 1
fi

# Check if we're in a product repo with EPF subtree
if [ ! -d "docs/EPF" ]; then
    echo "Error: docs/EPF directory not found"
    echo "This script should be run from a product repository with EPF subtree"
    exit 1
fi

INSTANCE_ROOT="docs/EPF/_instances/$PRODUCT_NAME"

if [ -d "$INSTANCE_ROOT" ]; then
    if [ "$UPDATE_MODE" = true ]; then
        echo "Update mode: Adding missing folders to existing instance at $INSTANCE_ROOT"
    else
        echo "Warning: Instance directory already exists at $INSTANCE_ROOT"
        read -p "Continue and create missing folders? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi
else
    if [ "$UPDATE_MODE" = true ]; then
        echo "Error: --update flag used but instance does not exist at $INSTANCE_ROOT"
        echo "Use without --update to create a new instance"
        exit 1
    fi
fi

if [ "$UPDATE_MODE" = true ]; then
    echo "Updating EPF instance structure for: $PRODUCT_NAME"
else
    echo "Creating EPF instance structure for: $PRODUCT_NAME"
fi
echo "Location: $INSTANCE_ROOT"
echo ""

# Track what was added
ADDED_DIRS=()
SKIPPED_DIRS=()

# Create complete directory structure
for dir in \
    "READY" \
    "FIRE" \
    "FIRE/feature_definitions" \
    "FIRE/value_models" \
    "FIRE/workflows" \
    "AIM" \
    "ad-hoc-artifacts" \
    "outputs" \
    "cycles"; do
    
    if [ ! -d "$INSTANCE_ROOT/$dir" ]; then
        mkdir -p "$INSTANCE_ROOT/$dir"
        ADDED_DIRS+=("$dir")
    else
        SKIPPED_DIRS+=("$dir")
    fi
done

if [ ${#ADDED_DIRS[@]} -gt 0 ]; then
    echo "✅ Added directories:"
    for dir in "${ADDED_DIRS[@]}"; do
        echo "   + $dir"
    done
    echo ""
fi

if [ ${#SKIPPED_DIRS[@]} -gt 0 ] && [ "$UPDATE_MODE" = true ]; then
    echo "ℹ️  Skipped existing directories:"
    for dir in "${SKIPPED_DIRS[@]}"; do
        echo "   ✓ $dir (already exists)"
    done
    echo ""
fi

echo "Directory structure:"
echo "   $INSTANCE_ROOT/"
echo "   ├── READY/"
echo "   ├── FIRE/"
echo "   │   ├── feature_definitions/"
echo "   │   ├── value_models/"
echo "   │   └── workflows/"
echo "   ├── AIM/"
echo "   ├── ad-hoc-artifacts/"
echo "   ├── outputs/"
echo "   └── cycles/"
echo ""

# Copy README template if it exists in EPF and doesn't exist in instance
if [ -f "docs/EPF/phases/READY/ad-hoc-artifacts_README_template.md" ] && [ ! -f "$INSTANCE_ROOT/ad-hoc-artifacts/README.md" ]; then
    cp "docs/EPF/phases/READY/ad-hoc-artifacts_README_template.md" "$INSTANCE_ROOT/ad-hoc-artifacts/README.md"
    echo "✅ Added ad-hoc-artifacts/README.md from template"
fi

# Create placeholder .gitkeep files in empty directories
for dir in READY FIRE/feature_definitions FIRE/value_models FIRE/workflows AIM outputs cycles; do
    if [ -z "$(ls -A "$INSTANCE_ROOT/$dir" 2>/dev/null)" ]; then
        touch "$INSTANCE_ROOT/$dir/.gitkeep"
    fi
done

echo "✅ Added .gitkeep files to empty directories"
echo ""

# Create basic _meta.yaml if it doesn't exist
if [ ! -f "$INSTANCE_ROOT/_meta.yaml" ]; then
    cat > "$INSTANCE_ROOT/_meta.yaml" << EOF
# EPF Instance Metadata
product_id: "$PRODUCT_NAME"
created: "$(date +%Y-%m-%d)"
epf_version: "1.11.0"
status: "active"

# Update this metadata as your instance evolves
EOF
    echo "✅ Created _meta.yaml"
else
    if [ "$UPDATE_MODE" = true ]; then
        echo "ℹ️  Skipped _meta.yaml (already exists)"
    fi
fi

# Create basic README if it doesn't exist
if [ ! -f "$INSTANCE_ROOT/README.md" ]; then
    cat > "$INSTANCE_ROOT/README.md" << EOF
# $PRODUCT_NAME - EPF Instance

This directory contains the Emergent Product Framework (EPF) strategic artifacts for **$PRODUCT_NAME**.

## Structure

\`\`\`
$PRODUCT_NAME/
├── _meta.yaml              # Instance metadata
├── README.md               # This file
│
├── READY/                  # Strategy & Planning Phase
│   └── (YAML artifacts go here)
│
├── FIRE/                   # Execution & Delivery Phase
│   ├── feature_definitions/
│   ├── value_models/
│   ├── workflows/
│   └── mappings.yaml
│
├── AIM/                    # Learning & Adaptation Phase
│   └── (Assessment artifacts go here)
│
├── ad-hoc-artifacts/       # Generated convenience documents
├── outputs/                # Generated outputs (context-sheets, memos, etc.)
└── cycles/                 # Archived cycle artifacts
\`\`\`

## Next Steps

1. **Copy READY phase templates** from \`docs/EPF/phases/READY/\` to your \`READY/\` folder
2. **Customize the templates** with your product's strategic information
3. **Begin your EPF journey**: READY (plan) → FIRE (execute) → AIM (learn)

See the main EPF documentation at \`docs/EPF/README.md\` for detailed guidance.
EOF
    echo "✅ Created README.md"
else
    if [ "$UPDATE_MODE" = true ]; then
        echo "ℹ️  Skipped README.md (already exists)"
    fi
fi

echo ""
if [ "$UPDATE_MODE" = true ]; then
    if [ ${#ADDED_DIRS[@]} -gt 0 ]; then
        echo "🎉 Instance updated successfully! Added ${#ADDED_DIRS[@]} missing folder(s)."
    else
        echo "✅ Instance already complete - no folders needed to be added."
    fi
else
    echo "🎉 Instance structure created successfully!"
fi
echo ""

if [ ${#ADDED_DIRS[@]} -gt 0 ]; then
    echo "Next steps:"
    if [ "$UPDATE_MODE" = false ]; then
        echo "1. Copy READY phase templates:"
        echo "   cp docs/EPF/phases/READY/*.yaml $INSTANCE_ROOT/READY/"
        echo ""
        echo "2. Customize the templates with your product information"
        echo ""
    fi
    echo "Commit the changes:"
    echo "   git add $INSTANCE_ROOT"
    if [ "$UPDATE_MODE" = true ]; then
        echo "   git commit -m 'EPF: Update $PRODUCT_NAME instance with missing folders'"
    else
        echo "   git commit -m 'EPF: Initialize $PRODUCT_NAME instance structure'"
    fi
    echo ""
fi
