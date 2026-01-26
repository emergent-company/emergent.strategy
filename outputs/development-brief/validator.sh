#!/bin/bash
# Development Handover Brief Validator
# Version: 1.0.0
# Purpose: Validate generated development briefs against schema and quality requirements

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0

# Functions
log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
    ((WARNINGS++))
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

# Check if file argument provided
if [ -z "$1" ]; then
    echo "Usage: $0 <development-brief.md>"
    echo ""
    echo "Validates a generated development handover brief."
    exit 1
fi

BRIEF_FILE="$1"

# Check if file exists
if [ ! -f "$BRIEF_FILE" ]; then
    log_error "File not found: $BRIEF_FILE"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "📋 DEVELOPMENT BRIEF VALIDATOR v1.0.0"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Validating: $BRIEF_FILE"
echo ""

# Read file content
CONTENT=$(cat "$BRIEF_FILE")

# ============================================================================
# SECTION 1: Required Sections Check
# ============================================================================
echo "--- Section 1: Required Sections ---"

REQUIRED_SECTIONS=(
    "## Overview"
    "## Features Included"
    "## Value Model Mapping"
    "## Tech Stack Impact"
    "## Calibration & Constraints"
    "## EPF Artifact Links"
)

for section in "${REQUIRED_SECTIONS[@]}"; do
    if echo "$CONTENT" | grep -q "^$section"; then
        log_success "Found section: $section"
    else
        log_error "Missing required section: $section"
    fi
done

echo ""

# ============================================================================
# SECTION 2: Metadata Validation
# ============================================================================
echo "--- Section 2: Metadata Validation ---"

# Check for YAML frontmatter
if echo "$CONTENT" | head -20 | grep -q "^---"; then
    log_success "YAML frontmatter present"
    
    # Check required metadata fields
    METADATA_FIELDS=(
        "generated_at:"
        "epf_version:"
        "generator:"
        "generator_version:"
    )
    
    # Extract frontmatter (between first --- and second ---)
    FRONTMATTER=$(echo "$CONTENT" | awk '/^---$/{p=1;next} p&&/^---$/{exit} p')
    
    for field in "${METADATA_FIELDS[@]}"; do
        if echo "$FRONTMATTER" | grep -q "$field"; then
            log_success "Metadata field present: $field"
        else
            log_error "Missing metadata field: $field"
        fi
    done
else
    log_error "Missing YAML frontmatter (should start with ---)"
fi

echo ""

# ============================================================================
# SECTION 3: Feature Definitions Validation
# ============================================================================
echo "--- Section 3: Feature Definitions ---"

# Check for at least one feature
FEATURE_COUNT=$(echo "$CONTENT" | grep -c "^### fd-" || true)

if [ "$FEATURE_COUNT" -gt 0 ]; then
    log_success "Found $FEATURE_COUNT feature definition(s)"
else
    log_error "No feature definitions found (expected ### fd-XXX headers)"
fi

# Check each feature has required sub-sections
FEATURE_IDS=$(echo "$CONTENT" | grep "^### fd-" | sed 's/^### //' | cut -d':' -f1)

for fd_id in $FEATURE_IDS; do
    # Find the feature section and check for required content
    FEATURE_SECTION=$(echo "$CONTENT" | awk "/^### $fd_id/,/^###[^#]/" | head -100)
    
    if echo "$FEATURE_SECTION" | grep -q "Priority:"; then
        log_success "$fd_id: Priority specified"
    else
        log_warning "$fd_id: Missing Priority"
    fi
    
    if echo "$FEATURE_SECTION" | grep -q "Problem Statement:"; then
        log_success "$fd_id: Problem Statement present"
    else
        log_warning "$fd_id: Missing Problem Statement"
    fi
    
    if echo "$FEATURE_SECTION" | grep -q "Capabilities:"; then
        log_success "$fd_id: Capabilities listed"
    else
        log_error "$fd_id: Missing Capabilities section"
    fi
    
    if echo "$FEATURE_SECTION" | grep -q "Full Definition:"; then
        log_success "$fd_id: EPF link present"
    else
        log_warning "$fd_id: Missing EPF artifact link"
    fi
done

echo ""

# ============================================================================
# SECTION 4: Value Model Mapping Validation
# ============================================================================
echo "--- Section 4: Value Model Mapping ---"

# Check for value model entries
VM_SECTION=$(echo "$CONTENT" | awk '/^## Value Model Mapping/,/^## [^#]/')

if echo "$VM_SECTION" | grep -qE "^### (Product|Strategy|OrgOps|Commercial)"; then
    log_success "Value model track(s) mapped"
    
    # Count mappings
    VM_COUNT=$(echo "$VM_SECTION" | grep -cE "^### (Product|Strategy|OrgOps|Commercial)" || true)
    log_info "Found $VM_COUNT value model component mapping(s)"
else
    log_error "No value model components mapped"
fi

echo ""

# ============================================================================
# SECTION 4b: Existing Implementation & Delta Validation
# ============================================================================
echo "--- Section 4b: Existing Implementation & Delta ---"

# Check if the section exists
if echo "$CONTENT" | grep -q "^## Existing Implementation & Delta"; then
    log_success "Existing Implementation & Delta section present"
    
    DELTA_SECTION=$(echo "$CONTENT" | awk '/^## Existing Implementation & Delta/,/^## [^#]/')
    
    # Check if it's net-new or has existing implementation
    if echo "$DELTA_SECTION" | grep -q "net-new with no existing code"; then
        log_info "Implementation is net-new (no existing code)"
    else
        # Should have Current State section
        if echo "$DELTA_SECTION" | grep -q "### Current State"; then
            log_success "Current State section present"
        else
            log_warning "Missing Current State section for existing implementation"
        fi
        
        # Should have Implementation Delta section
        if echo "$DELTA_SECTION" | grep -q "### Implementation Delta"; then
            log_success "Implementation Delta section present"
        else
            log_warning "Missing Implementation Delta section"
        fi
        
        # Check for capability changes table
        if echo "$DELTA_SECTION" | grep -q "Capability Changes"; then
            log_success "Capability Changes documented"
        else
            log_warning "Capability Changes table missing"
        fi
        
        # Check for code references if existing implementation
        if echo "$DELTA_SECTION" | grep -q "Code References"; then
            log_success "Code References documented"
        else
            log_warning "Code References missing - helpful for engineering"
        fi
    fi
else
    log_info "No Existing Implementation & Delta section (optional if all features are new)"
fi

echo ""

# ============================================================================
# SECTION 5: Calibration Validation
# ============================================================================
echo "--- Section 5: Calibration Validation ---"

CALIB_SECTION=$(echo "$CONTENT" | awk '/^## Calibration & Constraints/,/^## [^#]/')

# Check for scope level
if echo "$CONTENT" | grep -qE "Scope Level.*(MVP|mvp|Functional|functional|Polished|polished|Enterprise|enterprise)"; then
    log_success "Scope level specified"
else
    log_error "Scope level not found or invalid (expected: MVP, Functional, Polished, or Enterprise)"
fi

# Check for timeline pressure
if echo "$CONTENT" | grep -qE "Timeline Pressure.*(Relaxed|relaxed|Normal|normal|Aggressive|aggressive|Critical|critical)"; then
    log_success "Timeline pressure specified"
else
    log_error "Timeline pressure not found or invalid"
fi

# Check for quality expectations
QUALITY_DIMS=("Test Coverage" "Documentation" "Performance" "Security")
for dim in "${QUALITY_DIMS[@]}"; do
    if echo "$CALIB_SECTION" | grep -q "$dim"; then
        log_success "Quality dimension present: $dim"
    else
        log_warning "Quality dimension missing: $dim"
    fi
done

echo ""

# ============================================================================
# SECTION 6: Tech Stack Impact Validation
# ============================================================================
echo "--- Section 6: Tech Stack Impact ---"

TECH_SECTION=$(echo "$CONTENT" | awk '/^## Tech Stack Impact/,/^## [^#]/')

if echo "$TECH_SECTION" | grep -q "Services Affected"; then
    log_success "Services Affected section present"
else
    log_warning "Services Affected section missing"
fi

if echo "$TECH_SECTION" | grep -q "External Integrations"; then
    log_success "External Integrations section present"
else
    log_warning "External Integrations section missing"
fi

echo ""

# ============================================================================
# SECTION 7: EPF Artifact Links Validation
# ============================================================================
echo "--- Section 7: EPF Artifact Links (GitHub Permalinks) ---"

LINKS_SECTION=$(echo "$CONTENT" | awk '/^## EPF Artifact Links/,/^## [^#]/')

# Check for GitHub permalink format
GITHUB_LINKS=$(echo "$LINKS_SECTION" | grep -cE 'https://github\.com/[^/]+/[^/]+/blob/' || true)
if [ "$GITHUB_LINKS" -gt 0 ]; then
    log_success "Found $GITHUB_LINKS GitHub permalink(s)"
else
    log_error "No GitHub permalinks found - links should be in format: https://github.com/owner/repo/blob/branch/path"
fi

# Validate permalink structure
echo ""
echo "--- Validating GitHub permalink format ---"

# Extract all GitHub URLs
GITHUB_URLS=$(echo "$CONTENT" | grep -oE 'https://github\.com/[^)]+' || true)

VALID_URLS=0
INVALID_URLS=0

for url in $GITHUB_URLS; do
    # Check URL structure: https://github.com/owner/repo/blob/ref/path
    if echo "$url" | grep -qE '^https://github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9._-]+/blob/[a-zA-Z0-9._/-]+$'; then
        ((VALID_URLS++))
    else
        log_warning "Malformed GitHub URL: $url"
        ((INVALID_URLS++))
    fi
done

if [ "$VALID_URLS" -gt 0 ] && [ "$INVALID_URLS" -eq 0 ]; then
    log_success "All $VALID_URLS GitHub URL(s) properly formatted"
elif [ "$VALID_URLS" -gt 0 ]; then
    log_info "$VALID_URLS valid URL(s), $INVALID_URLS need attention"
fi

# Check for feature definition links
echo ""
if echo "$LINKS_SECTION" | grep -q "Feature Definitions"; then
    FD_LINKS=$(echo "$LINKS_SECTION" | grep -c "feature_definitions" || true)
    if [ "$FD_LINKS" -gt 0 ]; then
        log_success "Feature definition links present ($FD_LINKS)"
    else
        log_warning "Feature Definitions section exists but no links found"
    fi
else
    log_error "Missing Feature Definitions link section"
fi

# Check for value model links
if echo "$LINKS_SECTION" | grep -q "Value Models"; then
    log_success "Value Models link section present"
else
    log_warning "Missing Value Models link section"
fi

# Check metadata for github_repo configuration
echo ""
echo "--- Validating metadata github_repo configuration ---"

if echo "$FRONTMATTER" | grep -q "github_repo:"; then
    log_success "github_repo configuration present in metadata"
    
    # Check required fields
    if echo "$FRONTMATTER" | grep -q "owner:"; then
        log_success "  - owner specified"
    else
        log_error "  - missing owner in github_repo"
    fi
    
    if echo "$FRONTMATTER" | grep -q "repo:"; then
        log_success "  - repo specified"
    else
        log_error "  - missing repo in github_repo"
    fi
    
    if echo "$FRONTMATTER" | grep -q "branch:"; then
        log_success "  - branch specified"
    else
        log_warning "  - missing branch in github_repo (defaulting may cause issues)"
    fi
else
    log_error "Missing github_repo configuration in metadata"
fi

echo ""

# ============================================================================
# SECTION 8: Content Quality Checks
# ============================================================================
echo "--- Section 8: Content Quality ---"

# Check for placeholder text
PLACEHOLDERS=$(echo "$CONTENT" | grep -cE '\{[A-Za-z_]+\}|\[TBD\]|\[TODO\]|PLACEHOLDER' || true)
if [ "$PLACEHOLDERS" -gt 0 ]; then
    log_error "Found $PLACEHOLDERS placeholder(s) - all placeholders must be replaced"
else
    log_success "No placeholders found"
fi

# Check minimum content length (brief should be substantial)
WORD_COUNT=$(echo "$CONTENT" | wc -w | tr -d ' ')
if [ "$WORD_COUNT" -lt 500 ]; then
    log_warning "Brief seems short ($WORD_COUNT words). Expected 500+ words for a complete brief."
elif [ "$WORD_COUNT" -lt 200 ]; then
    log_error "Brief too short ($WORD_COUNT words). Likely incomplete."
else
    log_success "Content length adequate ($WORD_COUNT words)"
fi

# Check for empty sections
EMPTY_SECTIONS=$(echo "$CONTENT" | grep -B1 "^$" | grep -c "^##" || true)
if [ "$EMPTY_SECTIONS" -gt 0 ]; then
    log_warning "Possible empty sections detected"
fi

echo ""

# ============================================================================
# SECTION 9: Optional Sections Check
# ============================================================================
echo "--- Section 9: Optional Enhancements ---"

OPTIONAL_SECTIONS=(
    "## Implementation Considerations"
    "## Questions for Engineering Review"
    "## Success Criteria"
    "## Related Key Results"
    "## Next Steps"
)

for section in "${OPTIONAL_SECTIONS[@]}"; do
    if echo "$CONTENT" | grep -q "^$section"; then
        log_success "Optional section present: $section"
    else
        log_info "Optional section missing: $section (not required)"
    fi
done

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "📊 VALIDATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}✅ PASSED - No errors or warnings${NC}"
    EXIT_CODE=0
elif [ "$ERRORS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
    echo "   Errors:   0"
    echo "   Warnings: $WARNINGS"
    EXIT_CODE=0
else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Errors:   $ERRORS"
    echo "   Warnings: $WARNINGS"
    EXIT_CODE=1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"

exit $EXIT_CODE
