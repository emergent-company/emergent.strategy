#!/bin/bash
# Script to create complete EPF instance directory structure
# Usage: ./scripts/create-instance-structure.sh <product-name>

set -e

PRODUCT_NAME="$1"

if [ -z "$PRODUCT_NAME" ]; then
    echo "Error: Product name required"
    echo "Usage: ./scripts/create-instance-structure.sh <product-name>"
    echo "Example: ./scripts/create-instance-structure.sh my-product"
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
    echo "Warning: Instance directory already exists at $INSTANCE_ROOT"
    read -p "Continue and create missing folders? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo "Creating EPF instance structure for: $PRODUCT_NAME"
echo "Location: $INSTANCE_ROOT"
echo ""

# Create complete directory structure
mkdir -p "$INSTANCE_ROOT/READY"
mkdir -p "$INSTANCE_ROOT/FIRE/feature_definitions"
mkdir -p "$INSTANCE_ROOT/FIRE/value_models"
mkdir -p "$INSTANCE_ROOT/FIRE/workflows"
mkdir -p "$INSTANCE_ROOT/AIM"
mkdir -p "$INSTANCE_ROOT/ad-hoc-artifacts"
mkdir -p "$INSTANCE_ROOT/context-sheets"
mkdir -p "$INSTANCE_ROOT/cycles"

echo "✅ Created directory structure:"
echo "   $INSTANCE_ROOT/"
echo "   ├── READY/"
echo "   ├── FIRE/"
echo "   │   ├── feature_definitions/"
echo "   │   ├── value_models/"
echo "   │   └── workflows/"
echo "   ├── AIM/"
echo "   ├── ad-hoc-artifacts/"
echo "   ├── context-sheets/"
echo "   └── cycles/"
echo ""

# Copy README template if it exists in EPF and doesn't exist in instance
if [ -f "docs/EPF/phases/READY/ad-hoc-artifacts_README_template.md" ] && [ ! -f "$INSTANCE_ROOT/ad-hoc-artifacts/README.md" ]; then
    cp "docs/EPF/phases/READY/ad-hoc-artifacts_README_template.md" "$INSTANCE_ROOT/ad-hoc-artifacts/README.md"
    echo "✅ Added ad-hoc-artifacts/README.md from template"
fi

# Create placeholder .gitkeep files in empty directories
for dir in READY FIRE/feature_definitions FIRE/value_models FIRE/workflows AIM context-sheets cycles; do
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
├── context-sheets/         # Additional context documents
└── cycles/                 # Archived cycle artifacts
\`\`\`

## Next Steps

1. **Copy READY phase templates** from \`docs/EPF/phases/READY/\` to your \`READY/\` folder
2. **Customize the templates** with your product's strategic information
3. **Begin your EPF journey**: READY (plan) → FIRE (execute) → AIM (learn)

See the main EPF documentation at \`docs/EPF/README.md\` for detailed guidance.
EOF
    echo "✅ Created README.md"
fi

echo ""
echo "🎉 Instance structure created successfully!"
echo ""
echo "Next steps:"
echo "1. Copy READY phase templates:"
echo "   cp docs/EPF/phases/READY/*.yaml $INSTANCE_ROOT/READY/"
echo ""
echo "2. Customize the templates with your product information"
echo ""
echo "3. Commit the structure:"
echo "   git add $INSTANCE_ROOT"
echo "   git commit -m 'EPF: Initialize $PRODUCT_NAME instance structure'"
echo ""
