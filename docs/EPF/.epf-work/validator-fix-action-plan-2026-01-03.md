# Validator Fix Action Plan

**Goal:** Remove `set -e` from context-sheet and investor-memo validators and implement error collection

---

## Current State

Both validators currently use `set -e` which exits on first error:
- `context-sheet/validator.sh` - Line 27
- `investor-memo/validator.sh` - Line 32

This means users only see ONE error at a time, requiring multiple validation cycles to fix all issues.

---

## Target State (Skattefunn Pattern)

Validators should:
1. ❌ NOT use `set -e`
2. ✅ Collect ALL errors across all validation layers
3. ✅ Use error/warning counters
4. ✅ Return exit code based on total error count

---

## Implementation Pattern (from skattefunn)

```bash
#!/bin/bash
# NOTE: We do NOT use 'set -e' because a validation script should collect
# ALL errors across all layers, not exit on the first problem.

# Counters
ERRORS=0
WARNINGS=0

# Logging functions
log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    ((WARNINGS++))
}

# Validation layers increment counters
validate_layer_1() {
    # ... checks ...
    [[ condition ]] || log_error "Message"
}

# Main function returns based on totals
main() {
    validate_layer_1
    validate_layer_2
    validate_layer_3
    validate_layer_4
    
    # Final report
    if [[ $ERRORS -gt 0 ]]; then
        exit 1  # Errors found
    elif [[ $WARNINGS -gt 0 ]]; then
        exit 3  # Warnings only
    else
        exit 0  # Valid
    fi
}
```

---

## Changes Required

### context-sheet/validator.sh

**Line 27:** Remove `set -e`

**Add after line 40 (after colors):**
```bash
# ============================================================================
# Counters
# ============================================================================

ERRORS=0
WARNINGS=0
```

**Update logging functions (around line 50):**
```bash
log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    ((WARNINGS++))
}
```

**Update main() function exit logic (end of file):**
```bash
main() {
    # ... existing validation calls ...
    
    # Final report
    echo ""
    log_section "Validation Summary"
    echo "Errors: $ERRORS"
    echo "Warnings: $WARNINGS"
    
    if [[ $ERRORS -gt 0 ]]; then
        echo ""
        echo -e "${RED}✗ VALIDATION FAILED${NC}"
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        if [[ "$STRICT_MODE" == "true" ]]; then
            echo ""
            echo -e "${RED}✗ VALIDATION FAILED (strict mode)${NC}"
            exit 1
        else
            echo ""
            echo -e "${YELLOW}⚠ VALIDATION PASSED WITH WARNINGS${NC}"
            exit 3
        fi
    else
        echo ""
        echo -e "${GREEN}✓ VALIDATION PASSED${NC}"
        exit 0
    fi
}
```

### investor-memo/validator.sh

Same changes as context-sheet:
1. Remove `set -e` (line 32)
2. Add ERRORS/WARNINGS counters
3. Update log_error/log_warning to increment counters
4. Update main() exit logic to check totals

---

## Testing Checklist

After making changes, test each validator with:

### Valid file (should pass):
```bash
bash validator.sh valid-example.md
echo $?  # Should be 0
```

### File with 1 error (should report):
```bash
bash validator.sh one-error-example.md
echo $?  # Should be 1
```

### File with multiple errors (should report ALL):
```bash
bash validator.sh multiple-errors-example.md
# Should show ALL errors, not just first one
echo $?  # Should be 1
```

### File with warnings only:
```bash
bash validator.sh warnings-example.md
echo $?  # Should be 3 (warnings only)
```

### Strict mode with warnings:
```bash
VALIDATION_STRICT=true bash validator.sh warnings-example.md
echo $?  # Should be 1 (warnings treated as errors)
```

---

## Benefits After Fix

✅ Users see ALL errors in one validation run  
✅ Faster debugging (fix multiple issues at once)  
✅ Better user experience (less frustration)  
✅ Alignment with skattefunn canonical pattern  
✅ Proper error vs warning distinction  
✅ Strict mode support (treat warnings as errors)  

---

## Estimated Effort

**Per validator:** 30 minutes
- Find all log_error/log_warning calls
- Verify they increment counters
- Test with various scenarios
- Update documentation if needed

**Total:** ~1 hour for both validators

---

## Next Steps

1. **Fix context-sheet/validator.sh** (30 min)
2. **Test context-sheet validator** (15 min)
3. **Fix investor-memo/validator.sh** (30 min)
4. **Test investor-memo validator** (15 min)
5. **Update STRUCTURE.md** to show validators now ✅ (5 min)
6. **Commit with message:** "fix: Remove set -e from validators, collect all errors"

**Total time:** ~1.5 hours

---

## Verification

After fixing both validators, verify in STRUCTURE.md that status shows:

| Component | context-sheet | investor-memo | skattefunn | Standard |
|-----------|---------------|---------------|------------|----------|
| validator.sh | ✅ | ✅ | ✅ | ✅ |

All three validators should now follow the canonical pattern!
