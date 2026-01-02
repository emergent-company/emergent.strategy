# Validator Fix Session Summary

**Date**: 2026-01-01  
**Goal**: Fix validator.sh to independently verify budget temporal consistency

## Progress Summary

### ✅ COMPLETED

1. **Wizard Step 5.5 Added** (430 lines, wizard.instructions.md lines 2157-2472)
   - Budget temporal consistency validation
   - Validates budget years ⊆ WP duration years
   - Validates proportional allocation (5% tolerance)
   - Detailed error messages with fix examples
   - Fails fast before application generation
   - Status: ✅ FULLY COMPLETE

2. **Validator Section Order Fixed** (validator.sh line ~140)
   - Updated required_sections array
   - Section 4: R&D Content ✓
   - Section 5: Primary Objective and Innovation ✓
   - Status: ✅ FIXED

3. **Validator Budget Temporal Validation Added** (150+ lines, validator.sh lines ~502-652)
   - For each WP: Extract duration years, parse budget years
   - Error if budget years outside duration
   - Warning if budget not proportional to months
   - Detailed fix instructions
   - Status: ✅ CODE ADDED (needs regex fixes to work)

4. **Validator `set -e` Removed** (validator.sh line 26)
   - Reason: Script needs to collect ALL errors, not exit on first problem
   - Result: All 4 layers now execute ✓
   - Status: ✅ FIXED

### ⏳ IN PROGRESS

**Validator Regex Issues** (blocking completion):

1. **Total Budget Extraction** (line ~355)
   - Problem: Extracts 650,000 instead of 3,250,000
   - Cause: Gets first value from Project Total row, not last
   - Fix needed: Use `tail -1` properly or target **3,250,000** pattern

2. **Variable Newline Handling** (lines 488, 673)
   - Problem: Variables contain "0\n0" causing syntax errors
   - Error: `[[: 00: syntax error in expression (error token is "0")`
   - Fix needed: Strip newlines, use quotes, or use `head -1`

3. **Temporal Duration Parsing** (lines ~520-640)
   - Problem: "repetition-operator operand invalid"
   - Cause: Regex pattern incompatible with macOS grep
   - Fix needed: Proper escaping for extended regex (`-E` flag)

4. **Cost Code Extraction** (line ~375)
   - Problem: Cannot extract Personnel/Equipment/Overhead totals
   - Cause: Pattern doesn't match markdown table format
   - Fix needed: Target "| **2,275,000**" pattern in Project Total row

5. **WP Budget Reconciliation** (line ~395)
   - Problem: Cannot extract WP budgets from Section 8.2
   - Cause: Pattern doesn't match table structure
   - Fix needed: Target "| WP1: ... | ... | 1,830,000 | ..." pattern

## File Status

### wizard.instructions.md
- **Size**: 2,548 → 2,978 lines (+430 lines)
- **Status**: ✅ COMPLETE - Step 5.5 added and integrated
- **Location**: docs/EPF/outputs/skattefunn-application/wizard.instructions.md

### validator.sh
- **Size**: 652 → ~791 lines (+139 lines)
- **Status**: ⏳ 70% COMPLETE - Code added, regex fixes needed
- **Location**: docs/EPF/outputs/skattefunn-application/validator.sh
- **Changes Applied**:
  * Removed `set -e` (line 26) ✓
  * Fixed section order (line ~140) ✓
  * Added budget temporal validation (lines ~502-652) ✓
  * Fixed some regex patterns ⏳ (more fixes needed)

### emergent-skattefunn-application-2026-01-01.md
- **Size**: 669 lines
- **Status**: ✅ CORRECT - All budget fixes applied
- **Location**: docs/EPF/_instances/emergent/outputs/skattefunn-application/emergent-skattefunn-application-2026-01-01.md
- **Validation Tests**:
  * Manual copy-paste: ✅ PASSED
  * Validator Layer 1 (Schema): ✅ PASSED (all 9 sections found)
  * Validator Layer 2 (Semantic): ✅ PASSED (all checks)
  * Validator Layer 3 (Budget): ⏳ PARTIAL (errors due to regex issues)
  * Validator Layer 4 (Traceability): ✅ MOSTLY PASSED (1 regex error)

## Current Validator Test Results

```
✓ Layer 1: Schema Structure - ALL CHECKS PASSED (9/9 sections found)
✓ Layer 2: Semantic Rules - ALL CHECKS PASSED (no placeholders, TRL valid, 3 WPs with 4-6 activities each)
⚠ Layer 3: Budget Validation - PARTIAL (1 error, 3 warnings)
   - ERROR: Work Package 3 missing Budget section (false positive - needs regex fix)
   - Total budget: extracted 650,000 NOK (should be 3,250,000 NOK)
   - Yearly budgets: max 1,422,000 NOK ✓ (within 25M limit)
   - Cost codes: extraction failed (regex issue)
   - WP reconciliation: extraction failed (regex issue)
   - Temporal validation: passed ✓ (but regex warnings during parsing)
✓ Layer 4: Traceability - MOSTLY PASSED (1 regex error)
   - Found 9 KR references ✓
   - Found Direct Traceability section ✓
   - Mapping count: syntax error (0\n0 issue)
   - All EPF sources referenced ✓
```

**Exit Code**: 1 (due to 1 budget error)  
**Warnings**: 9 total (mostly regex extraction failures)

## Regex Fix Patterns Needed

### Pattern 1: Extract Last Value from Row
```bash
# BEFORE (gets first value)
local total=$(... | grep -oE "[0-9,]+" | tr -d ',' | tail -1)

# AFTER (target specific pattern)
local total=$(grep "| \*\*Project Total\*\*" "$file" | grep -oE "\*\*[0-9,]+\*\*" | tail -1 | grep -oE "[0-9,]+" | tr -d ',')
```

### Pattern 2: Handle Multi-line Variables
```bash
# BEFORE (causes "0\n0" syntax error)
local count=$(grep -c "pattern" "$file" || echo 0)
if [[ $count -gt 0 ]]; then

# AFTER (ensure single line)
local count=$(grep -c "pattern" "$file" 2>/dev/null || echo "0")
count=$(echo "$count" | head -1 | tr -d '\n')
if [[ "$count" -gt 0 ]]; then
```

### Pattern 3: macOS Grep Extended Regex
```bash
# BEFORE (causes "repetition-operator operand invalid")
grep -E "pattern with [0-9\\.]\\+ escaped"

# AFTER (proper extended regex)
grep -E "pattern with [0-9.]+ unescaped"
```

### Pattern 4: Extract from Markdown Tables
```bash
# Table structure:
# | Year | Personnel (NOK) | Equipment (NOK) | ... | Year Total (NOK) |
# | 2025 | 890,000 | 254,000 | ... | **1,271,000** |
# | **Project Total** | **2,275,000** | **649,000** | ... | **3,250,000** |

# Extract year totals (bold column)
grep -E "^\| [0-9]{4}" "$file" | grep -oE "\*\*[0-9,]+\*\*" | tail -1 | grep -oE "[0-9,]+" | tr -d ','

# Extract project total (last value in Project Total row)
grep "| \*\*Project Total\*\*" "$file" | grep -oE "\*\*[0-9,]+\*\*" | tail -1 | grep -oE "[0-9,]+" | tr -d ','

# Extract Personnel/Equipment/Overhead from Project Total row (columns 2, 3, 5)
grep "| \*\*Project Total\*\*" "$file" | grep -oE "\*\*[0-9,]+\*\*" | head -3 | grep -oE "[0-9,]+" | tr -d ','
```

### Pattern 5: Extract WP Budgets from Section 8.2
```bash
# Table structure:
# | Work Package | Duration | Total Budget (NOK) | % of Total |
# | WP1: Production-Ready Knowledge Graph | Aug 2025 - Jul 2026 (12 months) | 1,830,000 | 56.3% |

# Extract WP budgets (3rd column, not bold)
grep -E "^\| WP[0-9]:" "$file" | grep -oE "\| [0-9,]+ \|" | grep -oE "[0-9,]+" | tr -d ','
```

### Pattern 6: Extract WP Duration Years
```bash
# Duration format: "Aug 2025 - Jul 2026 (12 months)"
# Need to extract: start_year=2025, end_year=2026

# BEFORE (causes repetition-operator error)
grep -E "Duration: .+ [0-9]{4} - .+ [0-9]{4}"

# AFTER (proper extended regex)
local duration_line=$(grep -A 5 "### Work Package $i:" "$file" | grep "Duration:")
local start_year=$(echo "$duration_line" | grep -oE "20[0-9]{2}" | head -1)
local end_year=$(echo "$duration_line" | grep -oE "20[0-9]{2}" | tail -1)
```

## Next Steps

### Immediate (Validator Fixes)
1. Fix total budget extraction (line ~355) - target **3,250,000** pattern
2. Fix variable newline handling (lines 488, 673) - add quotes and head -1
3. Fix temporal duration parsing (lines ~520-640) - proper extended regex
4. Fix cost code extraction (line ~375) - target bold values in Project Total
5. Fix WP budget reconciliation (line ~395) - extract from Section 8.2 table
6. Test validator on corrected application - should pass all 4 layers
7. Test validator on OLD application with 2027 WP1 costs - should fail temporal check

### After Validator Works
1. Add Phase 6 (self-validation) to wizard (wizard calls validator after generation)
2. Test wizard end-to-end with all validations
3. Document wizard design principles with case studies

## Key Learnings

### Issue 1: `set -e` Incompatible with Validation Scripts
- **Problem**: Script exited on first grep failure, didn't collect all errors
- **Solution**: Remove `set -e`, validation scripts need to run ALL checks
- **Pattern**: Use explicit error counters, check total at end

### Issue 2: Regex Escaping with `-E` Flag
- **Problem**: Mixed basic and extended regex patterns
- **Solution**: With `grep -E`, don't escape `+` or `{3}` - use them directly
- **Pattern**: `grep -E "pattern+"` not `grep -E "pattern\\+"`

### Issue 3: Multi-line Variable Handling
- **Problem**: Variables like "0\n0" cause bash syntax errors in comparisons
- **Solution**: Always use quotes and ensure single-line: `count=$(... | head -1)`
- **Pattern**: `if [[ "$var" -gt 0 ]]` with quotes and newline stripping

### Issue 4: Markdown Table Parsing
- **Problem**: Tables have complex formatting with bold, commas, pipes
- **Solution**: Multi-step extraction: target row → extract bold → parse numbers
- **Pattern**: `grep "| **Target**" | grep -oE "**[0-9,]+**" | grep -oE "[0-9,]+" | tr -d ','`

### Issue 5: macOS vs Linux Grep Differences
- **Problem**: Some regex patterns work on Linux but fail on macOS
- **Solution**: Use POSIX-compliant patterns, test on macOS
- **Pattern**: Extended regex with `-E`, avoid GNU-specific features

## Files Created/Modified

1. ✅ `wizard.instructions.md` - Added Step 5.5 (430 lines)
2. ⏳ `validator.sh` - Fixed set -e, section order, added temporal validation (needs regex fixes)
3. ✅ `VALIDATOR_FIX_SESSION_SUMMARY.md` - This document

## Time Estimates

- Validator regex fixes: 30-45 minutes
- Validator testing & verification: 15 minutes
- Phase 6 self-validation: 30-45 minutes
- End-to-end wizard testing: 45-60 minutes
- Design principles documentation: 20-30 minutes

**Total remaining**: ~2-3 hours

## Success Criteria

- ✅ Wizard Step 5.5 validates budget temporal consistency before generation
- ⏳ Validator runs all 4 layers without errors (regex fixes needed)
- ⏳ Validator correctly identifies budget temporal errors (regex fixes needed)
- ⏳ Validator passes on corrected application (waiting on regex fixes)
- ⏳ Validator fails on OLD application with 2027 WP1 costs (waiting on regex fixes)
- ⏳ Phase 6 added to wizard (self-validation loop)
- ⏳ Wizard generates compliant application on first try
- ⏳ Design principles documented with case studies
