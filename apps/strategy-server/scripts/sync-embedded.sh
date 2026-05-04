#!/bin/bash
# sync-embedded.sh — Copies canonical EPF artifacts into internal/embedded/ for go:embed.
#
# Run before `go build` to ensure the binary contains the latest schemas, templates,
# agents, skills, wizards, and generators from canonical EPF.
#
# Usage:
#   ./scripts/sync-embedded.sh [canonical-epf-path]
#
# Path resolution order:
#   1. First argument
#   2. CANONICAL_EPF_PATH environment variable
#   3. ../epf-canonical  (sibling of the monorepo root)
#   4. ../../epf-canonical

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
EMBEDDED_DIR="$SERVER_DIR/internal/embedded"

# Determine canonical EPF path
if [ -n "$1" ]; then
    CANONICAL_EPF="$1"
elif [ -n "$CANONICAL_EPF_PATH" ]; then
    CANONICAL_EPF="$CANONICAL_EPF_PATH"
else
    # Try common locations relative to the monorepo root
    MONOREPO_ROOT="$(dirname "$(dirname "$SERVER_DIR")")"
    CANONICAL_EPF="${MONOREPO_ROOT}/../epf-canonical"
fi

CANONICAL_EPF="$(cd "$CANONICAL_EPF" 2>/dev/null && pwd)" || {
    echo "Error: canonical EPF not found."
    echo ""
    echo "Tried: $CANONICAL_EPF"
    echo ""
    echo "Fix options:"
    echo "  1. export CANONICAL_EPF_PATH=/path/to/epf-canonical"
    echo "  2. $0 /path/to/epf-canonical"
    exit 1
}

echo "Source: $CANONICAL_EPF  ($(cat "$CANONICAL_EPF/VERSION" 2>/dev/null || echo 'unknown version'))"
echo "Target: $EMBEDDED_DIR"
echo ""

# Clean and recreate content directories (never touch .go files)
rm -rf \
    "$EMBEDDED_DIR/schemas" \
    "$EMBEDDED_DIR/templates" \
    "$EMBEDDED_DIR/wizards" \
    "$EMBEDDED_DIR/outputs" \
    "$EMBEDDED_DIR/agents" \
    "$EMBEDDED_DIR/skills"

mkdir -p \
    "$EMBEDDED_DIR/schemas" \
    "$EMBEDDED_DIR/templates" \
    "$EMBEDDED_DIR/wizards" \
    "$EMBEDDED_DIR/outputs" \
    "$EMBEDDED_DIR/agents" \
    "$EMBEDDED_DIR/skills"

# --- Schemas ---
echo "Copying schemas..."
cp "$CANONICAL_EPF"/schemas/*.json "$EMBEDDED_DIR/schemas/" 2>/dev/null || true
SCHEMA_COUNT=$(ls -1 "$EMBEDDED_DIR/schemas/"*.json 2>/dev/null | wc -l | tr -d ' ')
echo "  $SCHEMA_COUNT schema files"

# --- Templates ---
echo "Copying templates..."
cp -r "$CANONICAL_EPF/templates/"* "$EMBEDDED_DIR/templates/" 2>/dev/null || true
TEMPLATE_COUNT=$(find "$EMBEDDED_DIR/templates" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "  $TEMPLATE_COUNT template files"

# --- Wizards ---
echo "Copying wizards..."
cp "$CANONICAL_EPF"/wizards/*.md "$EMBEDDED_DIR/wizards/" 2>/dev/null || true
WIZARD_COUNT=$(ls -1 "$EMBEDDED_DIR/wizards/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "  $WIZARD_COUNT wizard files"

# --- Generators (outputs/) ---
echo "Copying generators..."
GENERATOR_COUNT=0
for generator_dir in "$CANONICAL_EPF/outputs/"*/; do
    [ -d "$generator_dir" ] || continue
    generator_name=$(basename "$generator_dir")
    if [ -f "$generator_dir/schema.json" ] || [ -f "$generator_dir/wizard.instructions.md" ]; then
        mkdir -p "$EMBEDDED_DIR/outputs/$generator_name"
        cp -r "$generator_dir"* "$EMBEDDED_DIR/outputs/$generator_name/"
        GENERATOR_COUNT=$((GENERATOR_COUNT + 1))
    fi
done
echo "  $GENERATOR_COUNT generators"

# --- Agents ---
echo "Copying agents..."
AGENT_COUNT=0
if [ -d "$CANONICAL_EPF/agents" ]; then
    for agent_dir in "$CANONICAL_EPF/agents/"*/; do
        [ -d "$agent_dir" ] || continue
        agent_name=$(basename "$agent_dir")
        if [ -f "$agent_dir/agent.yaml" ]; then
            mkdir -p "$EMBEDDED_DIR/agents/$agent_name"
            cp -r "$agent_dir"* "$EMBEDDED_DIR/agents/$agent_name/"
            AGENT_COUNT=$((AGENT_COUNT + 1))
        fi
    done
fi
echo "  $AGENT_COUNT agents"

# --- Skills ---
echo "Copying skills..."
SKILL_COUNT=0
if [ -d "$CANONICAL_EPF/skills" ]; then
    for skill_dir in "$CANONICAL_EPF/skills/"*/; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        if [ -f "$skill_dir/skill.yaml" ]; then
            mkdir -p "$EMBEDDED_DIR/skills/$skill_name"
            cp -r "$skill_dir"* "$EMBEDDED_DIR/skills/$skill_name/"
            SKILL_COUNT=$((SKILL_COUNT + 1))
        fi
    done
fi
echo "  $SKILL_COUNT skills"

# --- Canonical definitions (strategy, org_ops, commercial only — not product fd-*) ---
echo "Copying canonical definitions..."
DEFINITION_COUNT=0
DEFINITION_DIR="$EMBEDDED_DIR/templates/FIRE/definitions"
rm -rf "$DEFINITION_DIR"
for track_dir in strategy org_ops commercial; do
    if [ -d "$CANONICAL_EPF/definitions/$track_dir" ]; then
        for category_dir in "$CANONICAL_EPF/definitions/$track_dir/"*/; do
            [ -d "$category_dir" ] || continue
            category_name=$(basename "$category_dir")
            target_dir="$DEFINITION_DIR/$track_dir/$category_name"
            mkdir -p "$target_dir"
            for def_file in "$category_dir"*.yaml "$category_dir"*.yml; do
                [ -f "$def_file" ] || continue
                cp "$def_file" "$target_dir/"
                DEFINITION_COUNT=$((DEFINITION_COUNT + 1))
            done
        done
    fi
done
echo "  $DEFINITION_COUNT canonical definition files"

# --- VERSION ---
if [ -f "$CANONICAL_EPF/VERSION" ]; then
    cp "$CANONICAL_EPF/VERSION" "$EMBEDDED_DIR/VERSION"
else
    echo "unknown" > "$EMBEDDED_DIR/VERSION"
fi
echo ""
echo "EPF version: $(cat "$EMBEDDED_DIR/VERSION")"

# --- MANIFEST ---
echo ""
echo "Writing MANIFEST.txt..."
cat > "$EMBEDDED_DIR/MANIFEST.txt" << EOF
# Strategy-Server Embedded Artifacts Manifest
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Source: $CANONICAL_EPF
# Version: $(cat "$EMBEDDED_DIR/VERSION")

## Schemas
$(ls -1 "$EMBEDDED_DIR/schemas/"*.json 2>/dev/null | xargs -I {} basename {} | sort)

## Templates
$(find "$EMBEDDED_DIR/templates" -type f \( -name "*.yaml" -o -name "*.yml" \) 2>/dev/null | sed "s|$EMBEDDED_DIR/templates/||" | sort)

## Wizards
$(ls -1 "$EMBEDDED_DIR/wizards/"*.md 2>/dev/null | xargs -I {} basename {} | sort)

## Generators
$(ls -1d "$EMBEDDED_DIR/outputs/"*/ 2>/dev/null | xargs -I {} basename {} | sort)

## Agents
$(ls -1d "$EMBEDDED_DIR/agents/"*/ 2>/dev/null | xargs -I {} basename {} | sort)

## Skills
$(ls -1d "$EMBEDDED_DIR/skills/"*/ 2>/dev/null | xargs -I {} basename {} | sort)
EOF

echo ""
echo "Sync complete."
echo "  Schemas:    $SCHEMA_COUNT"
echo "  Templates:  $TEMPLATE_COUNT files"
echo "  Wizards:    $WIZARD_COUNT"
echo "  Generators: $GENERATOR_COUNT"
echo "  Agents:     $AGENT_COUNT"
echo "  Skills:     $SKILL_COUNT"
echo "  Defs:       $DEFINITION_COUNT"
