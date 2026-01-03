#!/bin/bash
#
# Context Sheet Validator (Shell Script)
# 
# Validates EPF-generated AI Context Sheets against:
# 1. Metadata structure (HTML comment block)
# 2. Semantic rules (content quality)
# 3. Freshness (source file currency)
# 4. Markdown formatting
# 
# Usage:
#   bash validate-context-sheet.sh <path-to-context-sheet.md>
#   bash validate-context-sheet.sh --file path/to/context-sheet.md
# 
# Environment Variables:
#   VALIDATION_MAX_SOURCE_AGE        Max age in days before warning (default: 90)
#   VALIDATION_MAX_SOURCE_AGE_ERROR  Max age in days before error (default: 180)
#   VALIDATION_WARN_STALE           Warn instead of fail on stale (default: false)
#   VALIDATION_STRICT               Treat warnings as errors (default: false)
# 
# Exit Codes:
#   0 - Valid
#   1 - Invalid (errors found)
#   2 - File not found
#   3 - Stale sources (warning mode)

# NOTE: We do NOT use 'set -e' because a validation script should collect
# ALL errors across all layers, not exit on the first problem.
# Each validation layer explicitly increments error counters and the final
# exit code is determined by the total error count in main().

# ============================================================================
# Configuration
# ============================================================================

MAX_SOURCE_AGE_WARNING=${VALIDATION_MAX_SOURCE_AGE:-90}
MAX_SOURCE_AGE_ERROR=${VALIDATION_MAX_SOURCE_AGE_ERROR:-180}
WARN_ON_STALE=${VALIDATION_WARN_STALE:-false}
STRICT_MODE=${VALIDATION_STRICT:-false}

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Counters
# ============================================================================

ERRORS=0
WARNINGS=0
PASSED=0

# Validation layer counters
METADATA_ERRORS=0
SEMANTIC_ERRORS=0
FRESHNESS_ERRORS=0
MARKDOWN_ERRORS=0

METADATA_WARNINGS=0
SEMANTIC_WARNINGS=0
FRESHNESS_WARNINGS=0
MARKDOWN_WARNINGS=0

# ============================================================================
# Helper Functions
# ============================================================================

log_error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    ((WARNINGS++))
}

log_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
}

# ============================================================================
# Date Helpers (Cross-platform)
# ============================================================================

get_file_mtime_epoch() {
    local file="$1"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        stat -f %m "$file" 2>/dev/null || echo 0
    else
        # Linux
        stat -c %Y "$file" 2>/dev/null || echo 0
    fi
}

parse_iso8601_to_epoch() {
    local timestamp="$1"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - BSD date
        date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s 2>/dev/null || \
        date -j -f "%Y-%m-%d %H:%M:%S" "$timestamp" +%s 2>/dev/null || \
        echo 0
    else
        # Linux - GNU date
        date -d "$timestamp" +%s 2>/dev/null || echo 0
    fi
}

# ============================================================================
# Argument Parsing
# ============================================================================

CONTEXT_SHEET_PATH=""

parse_args() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: validate-context-sheet.sh <path-to-context-sheet.md>"
        echo "   or: validate-context-sheet.sh --file <path-to-context-sheet.md>"
        echo ""
        echo "Environment Variables:"
        echo "  VALIDATION_MAX_SOURCE_AGE         Max age in days before warning (default: 90)"
        echo "  VALIDATION_MAX_SOURCE_AGE_ERROR   Max age in days before error (default: 180)"
        echo "  VALIDATION_WARN_STALE             Warn instead of fail on stale (default: false)"
        echo "  VALIDATION_STRICT                 Treat warnings as errors (default: false)"
        echo ""
        echo "Exit Codes:"
        echo "  0 - Valid"
        echo "  1 - Invalid (errors found)"
        echo "  2 - File not found"
        echo "  3 - Stale sources (warning mode)"
        exit 1
    fi

    if [[ "$1" == "--file" ]]; then
        CONTEXT_SHEET_PATH="$2"
    else
        CONTEXT_SHEET_PATH="$1"
    fi

    if [[ -z "$CONTEXT_SHEET_PATH" ]]; then
        log_error "No file path provided"
        exit 1
    fi

    if [[ ! -f "$CONTEXT_SHEET_PATH" ]]; then
        log_error "File not found: $CONTEXT_SHEET_PATH"
        exit 2
    fi
}

# ============================================================================
# Validation Layer 1: Metadata Structure
# ============================================================================

validate_metadata() {
    log_section "Layer 1: Metadata Structure"
    
    local file="$CONTEXT_SHEET_PATH"
    
    # Check for HTML comment metadata block
    if ! grep -q "^<!--" "$file"; then
        log_error "Missing metadata comment block at start of file"
        ((METADATA_ERRORS++))
        return
    fi
    
    # Extract metadata block (everything between <!-- and -->)
    local metadata=$(sed -n '/^<!--/,/-->/p' "$file")
    
    # Check required metadata fields
    if ! echo "$metadata" | grep -q "Generated:"; then
        log_error "Missing 'Generated:' field in metadata"
        ((METADATA_ERRORS++))
    fi
    
    if ! echo "$metadata" | grep -q "Generator:"; then
        log_error "Missing 'Generator:' field in metadata"
        ((METADATA_ERRORS++))
    fi
    
    if ! echo "$metadata" | grep -q "EPF Version:"; then
        log_error "Missing 'EPF Version:' field in metadata"
        ((METADATA_ERRORS++))
    fi
    
    if ! echo "$metadata" | grep -q "Source Files:"; then
        log_warning "Missing 'Source Files:' section in metadata"
        ((METADATA_WARNINGS++))
    fi
    
    if [[ $METADATA_ERRORS -eq 0 ]]; then
        log_pass "Metadata structure valid"
    fi
}

# ============================================================================
# Validation Layer 2: Semantic Content
# ============================================================================

validate_semantic() {
    log_section "Layer 2: Semantic Content Quality"
    
    local file="$CONTEXT_SHEET_PATH"
    
    # Check for unreplaced placeholders
    local placeholders=$(grep -oE '\{[A-Z_]+\}' "$file" 2>/dev/null || true)
    if [[ -n "$placeholders" ]]; then
        local count=$(echo "$placeholders" | wc -l | tr -d ' ')
        log_error "Found $count unreplaced placeholder(s): $(echo "$placeholders" | tr '\n' ' ')"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Check for TODO/TK/PLACEHOLDER markers
    local markers=$(grep -c 'TODO\|TK\|\[PLACEHOLDER\]' "$file" 2>/dev/null || echo 0)
    if [[ $markers -gt 0 ]]; then
        log_warning "Found $markers TODO/TK/PLACEHOLDER marker(s)"
        ((SEMANTIC_WARNINGS++))
    fi
    
    # Check for Purpose field with meaningful content
    local purpose=$(grep -A 1 '\*\*Purpose\*\*:' "$file" | tail -1 | sed 's/^[[:space:]]*//')
    if [[ -z "$purpose" ]] || [[ ${#purpose} -lt 10 ]]; then
        log_error "Purpose is missing or too short (minimum 10 characters)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Check for Vision field with meaningful content
    local vision=$(grep -A 1 '\*\*Vision\*\*:' "$file" | tail -1 | sed 's/^[[:space:]]*//')
    if [[ -z "$vision" ]] || [[ ${#vision} -lt 10 ]]; then
        log_error "Vision is missing or too short (minimum 10 characters)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Check for capability sections (## headings that aren't standard sections)
    local capability_count=$(grep -c '^## ' "$file" 2>/dev/null || echo 0)
    local standard_sections=$(grep -cE '^## (Quick Reference|Product Overview|Current Focus|Out of Scope)' "$file" 2>/dev/null || echo 0)
    local actual_capabilities=$((capability_count - standard_sections))
    
    if [[ $actual_capabilities -eq 0 ]]; then
        log_warning "No capability sections found - this is unusual"
        ((SEMANTIC_WARNINGS++))
    fi
    
    # Check for potentially empty sections (heading followed by another heading or EOF)
    local empty_sections=0
    while IFS= read -r line; do
        if [[ "$line" =~ ^##[[:space:]] ]]; then
            local section_name="$line"
            local has_content=false
            
            # Read next lines until we hit another heading or EOF
            while IFS= read -r next_line; do
                if [[ "$next_line" =~ ^##[[:space:]] ]]; then
                    break
                fi
                if [[ -n "${next_line// /}" ]] && [[ ! "$next_line" =~ ^#[[:space:]] ]]; then
                    has_content=true
                    break
                fi
            done
            
            if [[ "$has_content" == "false" ]]; then
                ((empty_sections++))
            fi
        fi
    done < "$file"
    
    if [[ $empty_sections -gt 0 ]]; then
        log_warning "Found $empty_sections potentially empty section(s)"
        ((SEMANTIC_WARNINGS++))
    fi
    
    if [[ $SEMANTIC_ERRORS -eq 0 ]]; then
        log_pass "Semantic content validation passed"
    fi
}

# ============================================================================
# Validation Layer 3: Freshness
# ============================================================================

validate_freshness() {
    log_section "Layer 3: Source Freshness"
    
    local file="$CONTEXT_SHEET_PATH"
    local now_epoch=$(date +%s)
    
    # Extract generated timestamp from metadata
    local generated_at=$(sed -n '/^<!--/,/-->/p' "$file" | grep "Generated:" | sed 's/Generated:[[:space:]]*//')
    
    if [[ -z "$generated_at" ]]; then
        log_error "Cannot determine generation timestamp"
        ((FRESHNESS_ERRORS++))
        return
    fi
    
    # Parse generated timestamp
    local generated_epoch=$(parse_iso8601_to_epoch "$generated_at")
    
    if [[ $generated_epoch -eq 0 ]]; then
        log_error "Invalid generated timestamp format: $generated_at"
        ((FRESHNESS_ERRORS++))
    else
        local age_seconds=$((now_epoch - generated_epoch))
        local age_days=$((age_seconds / 86400))
        
        if [[ $age_days -gt $MAX_SOURCE_AGE_ERROR ]]; then
            log_error "Context sheet is very old ($age_days days) - regeneration required"
            ((FRESHNESS_ERRORS++))
        elif [[ $age_days -gt $MAX_SOURCE_AGE_WARNING ]]; then
            log_warning "Context sheet is $age_days days old - consider regenerating"
            ((FRESHNESS_WARNINGS++))
        else
            log_pass "Context sheet age acceptable ($age_days days)"
        fi
    fi
    
    # Check source files freshness
    local metadata=$(sed -n '/^<!--/,/-->/p' "$file")
    local in_source_files=false
    
    while IFS= read -r line; do
        if [[ "$line" =~ "Source Files:" ]]; then
            in_source_files=true
            continue
        fi
        
        if [[ "$in_source_files" == "true" ]] && [[ "$line" =~ ^-[[:space:]] ]]; then
            # Parse source file line: "- path (last modified: timestamp, version: v)"
            local source_path=$(echo "$line" | sed -n 's/^- \(.*\) (last modified:.*/\1/p')
            local last_modified=$(echo "$line" | sed -n 's/.*last modified: \([^,)]*\).*/\1/p')
            
            if [[ -n "$source_path" ]] && [[ -n "$last_modified" ]]; then
                # Resolve relative path from repo root
                local repo_root=$(cd "$(dirname "$BASH_SOURCE")/../../../.." && pwd)
                local full_path="$repo_root/$source_path"
                
                # Check if source file exists
                if [[ ! -f "$full_path" ]]; then
                    log_warning "Source file not found: $source_path"
                    ((FRESHNESS_WARNINGS++))
                    continue
                fi
                
                # Parse source file timestamp
                local source_epoch=$(parse_iso8601_to_epoch "$last_modified")
                
                if [[ $source_epoch -eq 0 ]]; then
                    log_warning "Invalid timestamp for source: $source_path"
                    ((FRESHNESS_WARNINGS++))
                else
                    local source_age_seconds=$((now_epoch - source_epoch))
                    local source_age_days=$((source_age_seconds / 86400))
                    
                    if [[ $source_age_days -gt $MAX_SOURCE_AGE_ERROR ]]; then
                        log_warning "Source file very old ($source_age_days days): $source_path"
                        ((FRESHNESS_WARNINGS++))
                    elif [[ $source_age_days -gt $MAX_SOURCE_AGE_WARNING ]]; then
                        log_warning "Source file aging ($source_age_days days): $source_path"
                        ((FRESHNESS_WARNINGS++))
                    fi
                    
                    # Check if output is older than source
                    if [[ $source_epoch -gt $generated_epoch ]]; then
                        log_warning "Source file modified after output generation: $source_path"
                        ((FRESHNESS_WARNINGS++))
                    fi
                fi
            fi
        fi
        
        if [[ "$in_source_files" == "true" ]] && [[ "$line" =~ ^[[:space:]]*$ ]]; then
            in_source_files=false
        fi
    done <<< "$metadata"
    
    if [[ $FRESHNESS_ERRORS -eq 0 ]] && [[ $FRESHNESS_WARNINGS -eq 0 ]]; then
        log_pass "All sources are fresh"
    fi
}

# ============================================================================
# Validation Layer 4: Markdown Format
# ============================================================================

validate_markdown() {
    log_section "Layer 4: Markdown Format"
    
    local file="$CONTEXT_SHEET_PATH"
    
    # Check for main heading (# Title)
    if ! grep -q '^# ' "$file"; then
        log_error "Missing main heading (# Title)"
        ((MARKDOWN_ERRORS++))
    fi
    
    # Check for broken links (empty URLs)
    local broken_links=$(grep -c '\[[^\]]*\]([[:space:]]*)' "$file" 2>/dev/null || echo 0)
    if [[ $broken_links -gt 0 ]]; then
        log_error "Found $broken_links broken link(s) with empty URLs"
        ((MARKDOWN_ERRORS++))
    fi
    
    # Check for proper list formatting (lists should have blank line before)
    # This is a simplified check - look for lists that start immediately after paragraphs
    local improper_lists=$(grep -B1 '^- ' "$file" | grep -c '^[^-#[:space:]]' 2>/dev/null || echo 0)
    if [[ $improper_lists -gt 3 ]]; then
        log_warning "Found $improper_lists potentially improperly formatted list(s)"
        ((MARKDOWN_WARNINGS++))
    fi
    
    if [[ $MARKDOWN_ERRORS -eq 0 ]]; then
        log_pass "Markdown format validation passed"
    fi
}

# ============================================================================
# Main Validation Flow
# ============================================================================

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║      Context Sheet Validator v1.0.0 (Shell)          ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "File: $CONTEXT_SHEET_PATH"
    echo ""
    
    # Run all validation layers
    validate_metadata || true
    validate_semantic || true
    validate_freshness || true
    validate_markdown || true
    
    # ========================================================================
    # Summary Report
    # ========================================================================
    
    log_section "Validation Summary"
    
    echo ""
    echo "Layer Results:"
    echo "  1. Metadata Structure:    $(format_result $METADATA_ERRORS $METADATA_WARNINGS)"
    echo "  2. Semantic Content:      $(format_result $SEMANTIC_ERRORS $SEMANTIC_WARNINGS)"
    echo "  3. Source Freshness:      $(format_result $FRESHNESS_ERRORS $FRESHNESS_WARNINGS)"
    echo "  4. Markdown Format:       $(format_result $MARKDOWN_ERRORS $MARKDOWN_WARNINGS)"
    echo ""
    
    echo "Overall:"
    echo "  Total Errors:   $ERRORS"
    echo "  Total Warnings: $WARNINGS"
    echo ""
    
    # ========================================================================
    # Exit Code Decision
    # ========================================================================
    
    if [[ $ERRORS -gt 0 ]]; then
        echo ""
        echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║                  VALIDATION FAILED                    ║${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
        exit 1
    fi
    
    if [[ $WARNINGS -gt 0 ]]; then
        if [[ "$STRICT_MODE" == "true" ]]; then
            echo ""
            echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║    VALIDATION FAILED (STRICT MODE - WARNINGS)        ║${NC}"
            echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
            exit 1
        else
            echo ""
            echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${YELLOW}║         VALIDATION PASSED WITH WARNINGS              ║${NC}"
            echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"
            
            if [[ "$WARN_ON_STALE" == "true" ]] && [[ $FRESHNESS_WARNINGS -gt 0 ]]; then
                exit 3
            fi
            exit 0
        fi
    fi
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            VALIDATION PASSED - ALL CLEAR!             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    exit 0
}

# ============================================================================
# Helper for Summary Display
# ============================================================================

format_result() {
    local errors=$1
    local warnings=$2
    
    if [[ $errors -gt 0 ]]; then
        echo -e "${RED}✗ FAILED${NC} ($errors error(s), $warnings warning(s))"
    elif [[ $warnings -gt 0 ]]; then
        echo -e "${YELLOW}⚠ PASSED${NC} (0 errors, $warnings warning(s))"
    else
        echo -e "${GREEN}✓ PASSED${NC}"
    fi
}

# ============================================================================
# Entry Point
# ============================================================================

parse_args "$@"
main
