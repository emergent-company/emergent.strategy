#!/usr/bin/env bash

# trim-violations.sh - Pure bash solution for trimming character violations in SkatteFUNN applications
# No Python dependencies required

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

# Usage information
usage() {
    cat <<EOF
Usage: $(basename "$0") <application-file.md>

Trim character violations in SkatteFUNN application markdown file.
Creates a backup before modifying the file.

Example:
    $(basename "$0") emergent-skattefunn-application-2026-01-02.md

The script:
1. Creates a timestamped backup
2. Finds all character violation markers
3. Trims text using multi-stage strategy:
   - Remove common filler phrases
   - Condense verbose expressions
   - Truncate at sentence boundaries
4. Removes violation markers
5. Reports results

EOF
    exit 1
}

# Create backup of file
create_backup() {
    local file="$1"
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local backup="${file}.backup-${timestamp}"
    
    cp "$file" "$backup"
    log_success "Backup created: $backup"
    echo "$backup"
}

# Trim text to max characters using bash string manipulation
trim_text() {
    local text="$1"
    local max_chars="$2"
    local result="$text"
    
    # Stage 1: Remove common filler phrases
    result="${result//(hypothesis: /(}"
    result="${result//for example, /}"
    result="${result//in order to /to }"
    result="${result//such as /}"
    result="${result//it is important to note that /}"
    result="${result//in the context of /in }"
    result="${result//with respect to /for }"
    result="${result//in particular, /}"
    result="${result//as well as /and }"
    result="${result//in addition to /plus }"
    
    # Stage 2: Condense verbose phrases
    result="${result//measure quantitative outcomes/measure outcomes}"
    result="${result//systematic /}"
    result="${result//comprehensive /}"
    result="${result//detailed /}"
    result="${result//extensive /}"
    result="${result//significant /}"
    result="${result//substantial /}"
    result="${result//demonstrate that /show }"
    result="${result//in a manner that /to }"
    result="${result//with the goal of /to }"
    
    # Stage 3: Remove double spaces
    while [[ "$result" =~ "  " ]]; do
        result="${result//  / }"
    done
    
    # Stage 4: If still too long, truncate at sentence boundary
    if [[ ${#result} -gt $max_chars ]]; then
        local target=$((max_chars - 3))
        local truncated="${result:0:$target}"
        
        # Find last sentence boundary (. or ?)
        if [[ "$truncated" =~ \.\ [^.]*$ ]] || [[ "$truncated" =~ \?\ [^?]*$ ]]; then
            # Extract position of last ". " or "? "
            local temp="${truncated%.*}"
            if [[ ${#temp} -gt $((target * 7 / 10)) ]]; then
                result="${temp}."
            else
                result="${truncated}..."
            fi
        else
            result="${truncated}..."
        fi
    fi
    
    echo "$result"
}

# Extract character limit from violation marker
extract_limit() {
    local line="$1"
    # Extract from pattern: *[Max 500 characters: 588/500]*
    if [[ "$line" =~ \*\[Max\ ([0-9]+)\ characters:\ [0-9]+/[0-9]+\] ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "500" # default
    fi
}

# Process file and fix violations
process_file() {
    local file="$1"
    local temp_file="${file}.tmp"
    local violations_found=0
    local violations_fixed=0
    
    # First pass: count violations
    while IFS= read -r line; do
        if [[ "$line" =~ \[Exceeded\ by\ [0-9]+\ characters ]]; then
            ((violations_found++))
        fi
    done < "$file"
    
    if [[ $violations_found -eq 0 ]]; then
        log_info "No character violations found"
        return 0
    fi
    
    log_info "Found $violations_found character violations to fix"
    
    # Second pass: process file
    local in_violation=false
    local violation_text=""
    local max_chars=500
    local line_num=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_num++))
        
        # Check if this is a violation marker line
        if [[ "$line" =~ \*\[Max\ [0-9]+\ characters:\ [0-9]+/[0-9]+\]\*\ ⚠️\ \*\[Exceeded\ by\ [0-9]+\ characters ]]; then
            # Extract max chars from previous context
            max_chars=$(extract_limit "$line")
            in_violation=true
            
            # Process previous text block (look back in temp file)
            if [[ -f "$temp_file" ]]; then
                # Get last non-empty line from temp file
                local last_line
                last_line=$(grep -v "^$" "$temp_file" | tail -1)
                
                if [[ -n "$last_line" ]]; then
                    # Trim the text
                    local trimmed
                    trimmed=$(trim_text "$last_line" "$max_chars")
                    
                    # Replace last line in temp file (BSD-compatible)
                    local temp_file2="${temp_file}.2"
                    local line_count
                    line_count=$(wc -l < "$temp_file" | tr -d ' ')
                    if [[ $line_count -gt 0 ]]; then
                        sed -n "1,$((line_count - 1))p" "$temp_file" > "$temp_file2"
                        echo "$trimmed" >> "$temp_file2"
                        mv "$temp_file2" "$temp_file"
                        
                        ((violations_fixed++))
                        log_info "Fixed violation $violations_fixed/$violations_found (line $line_num)"
                    fi
                fi
            fi
            
            # Skip the violation marker line
            continue
        fi
        
        # Write line to temp file
        echo "$line" >> "$temp_file"
        
    done < "$file"
    
    # Replace original file
    mv "$temp_file" "$file"
    
    log_success "Fixed $violations_fixed character violations"
    
    return 0
}

# Main execution
main() {
    if [[ $# -eq 0 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
        usage
    fi
    
    local file="$1"
    
    # Validate file exists
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        exit 1
    fi
    
    # Create backup
    local backup
    backup=$(create_backup "$file")
    
    # Process file
    log_info "Processing $file..."
    if process_file "$file"; then
        log_success "All character violations processed"
        log_info "Original file backed up to: $backup"
        log_info "Modified file: $file"
        
        # Show summary
        local remaining
        remaining=$(grep -c "\[Exceeded by" "$file" 2>/dev/null || echo "0")
        remaining=$(echo "$remaining" | tr -d '\n' | tr -d ' ')
        if [[ "$remaining" == "0" ]]; then
            log_success "✓ No remaining character violations"
        else
            log_warn "$remaining character violations remain (may need manual review)"
        fi
    else
        log_error "Failed to process file"
        log_info "Restoring from backup: $backup"
        cp "$backup" "$file"
        exit 1
    fi
}

main "$@"
