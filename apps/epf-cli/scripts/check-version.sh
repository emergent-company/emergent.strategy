#!/usr/bin/env bash
# check-version.sh — Warn if there are code changes since the last VERSION bump.
#
# Usage: ./scripts/check-version.sh [--strict]
#   --strict: exit 1 if version bump is needed (for CI/release)
#   default:  warn only (for local builds)
#
# How it works:
#   1. Reads current version from VERSION file
#   2. Finds the commit that last modified VERSION
#   3. Counts code changes (*.go, go.mod, go.sum, Makefile, scripts/) since that commit
#   4. Parses conventional commit prefixes to suggest the right semver bump
#
# Conventional commit parsing:
#   - Extracts type from "type(scope): description" or "type: description"
#   - Detects breaking changes via "type!:" or "BREAKING CHANGE:" in body
#   - Only considers the commit type prefix, not description text
#   - Monorepo-aware: filters by apps/epf-cli/ path, accepts any scope
#
# Bump logic (highest wins):
#   MAJOR: any breaking change (type! or BREAKING CHANGE in body)
#   MINOR: feat
#   PATCH: fix, refactor, perf, build, test, chore, docs, style, ci, or unknown
#
# Exit codes:
#   0 — version is current (or warn-only mode)
#   1 — version bump needed (--strict mode only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

STRICT=false
if [[ "${1:-}" == "--strict" ]]; then
    STRICT=true
fi

VERSION_FILE="$CLI_DIR/VERSION"
if [[ ! -f "$VERSION_FILE" ]]; then
    echo "ERROR: VERSION file not found at $VERSION_FILE"
    exit 1
fi

CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

# Find the commit that last touched VERSION
VERSION_COMMIT=$(git -C "$CLI_DIR" log -1 --format='%H' -- VERSION 2>/dev/null || echo "")
if [[ -z "$VERSION_COMMIT" ]]; then
    echo "WARNING: Could not determine last VERSION commit (new file?)"
    echo "  Current version: $CURRENT_VERSION"
    exit 0
fi

VERSION_SHORT=$(git -C "$CLI_DIR" log -1 --format='%h' -- VERSION)
VERSION_DATE=$(git -C "$CLI_DIR" log -1 --format='%ci' -- VERSION | cut -d' ' -f1)

# Get commits with code changes since the VERSION commit
# We track: Go source, go.mod/go.sum, Makefile, scripts
CHANGES=$(git -C "$CLI_DIR" log --oneline "$VERSION_COMMIT"..HEAD -- \
    '*.go' 'go.mod' 'go.sum' 'Makefile' 'scripts/' \
    2>/dev/null | grep -v "^$" || true)

if [[ -z "$CHANGES" ]]; then
    echo "Version $CURRENT_VERSION is current (last bump: $VERSION_SHORT on $VERSION_DATE)"
    exit 0
fi

# CHANGES is non-empty; count lines
CHANGE_COUNT=$(echo "$CHANGES" | wc -l | tr -d ' ')

# ── Conventional commit parser ────────────────────────────────────────────
#
# For each commit since the last VERSION bump, extract the full commit message
# and parse the type prefix. We need the full message (not just --oneline) to
# detect BREAKING CHANGE in the body/footer.

COMMIT_HASHES=$(git -C "$CLI_DIR" log --format='%H' "$VERSION_COMMIT"..HEAD -- \
    '*.go' 'go.mod' 'go.sum' 'Makefile' 'scripts/' \
    2>/dev/null || true)

HAS_BREAKING=0
HAS_FEAT=0
HAS_FIX=0
HAS_REFACTOR=0
HAS_PERF=0
HAS_OTHER=0  # chore, build, test, docs, style, ci, or non-conventional

# Track per-type counts for the summary
declare -A TYPE_COUNTS 2>/dev/null || true  # associative arrays need bash 4+
TYPES_SEEN=""

for hash in $COMMIT_HASHES; do
    if [[ -z "$hash" ]]; then continue; fi

    # Get full commit message
    FULL_MSG=$(git -C "$CLI_DIR" log -1 --format='%B' "$hash" 2>/dev/null || echo "")
    SUBJECT=$(git -C "$CLI_DIR" log -1 --format='%s' "$hash" 2>/dev/null || echo "")

    # Extract type from subject line: "type(scope)!: desc" or "type!: desc" or "type(scope): desc"
    # The regex captures: type, optional !, then ( or :
    COMMIT_TYPE=""
    IS_BREAKING_SUBJECT=false

    if [[ "$SUBJECT" =~ ^([a-zA-Z]+)(\(.+\))?\!:\ .+ ]]; then
        # type(scope)!: description — breaking change via !
        COMMIT_TYPE="${BASH_REMATCH[1]}"
        IS_BREAKING_SUBJECT=true
    elif [[ "$SUBJECT" =~ ^([a-zA-Z]+)(\(.+\))?:\ .+ ]]; then
        # type(scope): description — normal conventional commit
        COMMIT_TYPE="${BASH_REMATCH[1]}"
    fi

    # Normalize type to lowercase
    COMMIT_TYPE=$(echo "$COMMIT_TYPE" | tr '[:upper:]' '[:lower:]')

    # Check for BREAKING CHANGE in commit body (per conventional commits spec)
    IS_BREAKING_BODY=false
    if echo "$FULL_MSG" | grep -q '^BREAKING CHANGE:'; then
        IS_BREAKING_BODY=true
    fi
    if echo "$FULL_MSG" | grep -q '^BREAKING-CHANGE:'; then
        IS_BREAKING_BODY=true
    fi

    # Classify
    if [[ "$IS_BREAKING_SUBJECT" == true || "$IS_BREAKING_BODY" == true ]]; then
        HAS_BREAKING=$((HAS_BREAKING + 1))
        TYPES_SEEN="$TYPES_SEEN breaking"
    fi

    case "$COMMIT_TYPE" in
        feat)
            HAS_FEAT=$((HAS_FEAT + 1))
            TYPES_SEEN="$TYPES_SEEN feat"
            ;;
        fix)
            HAS_FIX=$((HAS_FIX + 1))
            TYPES_SEEN="$TYPES_SEEN fix"
            ;;
        refactor)
            HAS_REFACTOR=$((HAS_REFACTOR + 1))
            TYPES_SEEN="$TYPES_SEEN refactor"
            ;;
        perf)
            HAS_PERF=$((HAS_PERF + 1))
            TYPES_SEEN="$TYPES_SEEN perf"
            ;;
        "")
            # Non-conventional commit message
            HAS_OTHER=$((HAS_OTHER + 1))
            TYPES_SEEN="$TYPES_SEEN other"
            ;;
        *)
            # chore, build, test, docs, style, ci, etc.
            HAS_OTHER=$((HAS_OTHER + 1))
            TYPES_SEEN="$TYPES_SEEN $COMMIT_TYPE"
            ;;
    esac
done

# ── Determine suggested bump ─────────────────────────────────────────────
#
# Precedence: BREAKING (major) > feat (minor) > everything else (patch)
# refactor gets PATCH — it's internal restructuring without new functionality.

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

BUMP_REASON=""
if [[ "$HAS_BREAKING" -gt 0 ]]; then
    SUGGESTED="$((MAJOR + 1)).0.0"
    BUMP_REASON="MAJOR — breaking change(s) detected"
elif [[ "$HAS_FEAT" -gt 0 ]]; then
    SUGGESTED="$MAJOR.$((MINOR + 1)).0"
    BUMP_REASON="MINOR — new feature(s)"
elif [[ "$HAS_FIX" -gt 0 || "$HAS_REFACTOR" -gt 0 || "$HAS_PERF" -gt 0 ]]; then
    SUGGESTED="$MAJOR.$MINOR.$((PATCH + 1))"
    if [[ "$HAS_FIX" -gt 0 && "$HAS_REFACTOR" -gt 0 ]]; then
        BUMP_REASON="PATCH — bug fixes and refactors"
    elif [[ "$HAS_FIX" -gt 0 ]]; then
        BUMP_REASON="PATCH — bug fix(es)"
    elif [[ "$HAS_REFACTOR" -gt 0 ]]; then
        BUMP_REASON="PATCH — refactor(s)"
    else
        BUMP_REASON="PATCH — performance improvement(s)"
    fi
else
    SUGGESTED="$MAJOR.$MINOR.$((PATCH + 1))"
    BUMP_REASON="PATCH — maintenance"
fi

# ── Build type breakdown string ───────────────────────────────────────────

BREAKDOWN=""
if [[ "$HAS_BREAKING" -gt 0 ]]; then BREAKDOWN="${BREAKDOWN}${HAS_BREAKING} breaking, "; fi
if [[ "$HAS_FEAT" -gt 0 ]];     then BREAKDOWN="${BREAKDOWN}${HAS_FEAT} feat, "; fi
if [[ "$HAS_FIX" -gt 0 ]];      then BREAKDOWN="${BREAKDOWN}${HAS_FIX} fix, "; fi
if [[ "$HAS_REFACTOR" -gt 0 ]]; then BREAKDOWN="${BREAKDOWN}${HAS_REFACTOR} refactor, "; fi
if [[ "$HAS_PERF" -gt 0 ]];     then BREAKDOWN="${BREAKDOWN}${HAS_PERF} perf, "; fi
if [[ "$HAS_OTHER" -gt 0 ]];    then BREAKDOWN="${BREAKDOWN}${HAS_OTHER} other, "; fi
# Trim trailing ", "
BREAKDOWN="${BREAKDOWN%, }"

# ── Output ────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  VERSION BUMP SUGGESTED                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "  Current version: $CURRENT_VERSION (set in $VERSION_SHORT on $VERSION_DATE)"
echo "  Code changes since: $CHANGE_COUNT commit(s) [$BREAKDOWN]"
echo "║                                                              ║"

# Show the commits with parsed type annotation
echo "  Commits since last bump:"
echo "$CHANGES" | while IFS= read -r line; do
    if [[ -n "$line" ]]; then
        echo "    • $line"
    fi
done

echo "║                                                              ║"
echo "  Suggested: $SUGGESTED ($BUMP_REASON)"
echo "║                                                              ║"
echo "  To bump: echo \"$SUGGESTED\" > VERSION"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$STRICT" == true ]]; then
    echo "STRICT MODE: Aborting build. Bump VERSION before release."
    exit 1
fi

# Warn-only mode: return success but print guidance
echo "Continuing build with version $CURRENT_VERSION..."
echo ""
