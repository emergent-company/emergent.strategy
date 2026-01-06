# EPF Known Issues

This document tracks known issues in the canonical EPF framework discovered during real-world usage.

## Issue #1: Validation Script - Phase-Based Structure Support

**Status:** ✅ Fixed in v1.13.1

**Description:** The `validate-schemas.sh` script was not compatible with the phase-based instance structure (READY/, FIRE/, AIM/). It was looking for flat structure paths.

**Impact:** Schema validation failed for properly structured instances.

**Fix:** Updated `scripts/validate-schemas.sh` to support both phase-based (new) and flat (legacy) structures.

**Date Identified:** 2026-01-06
**Date Fixed:** 2026-01-06

---

## Issue #2: Canonical Value Models - Invalid Layer IDs

**Status:** ✅ Fixed in v1.13.1

**Description:** The canonical value model templates in `templates/FIRE/value_models/` use uppercase layer IDs (e.g., `STRATEGY-L1-strategic-roadmap`, `COMMERCIAL-L1-business-development-and-partnerships`) that don't match the schema pattern requirement `^[a-z][a-z0-9-]*[a-z0-9]$`.

**Affected Files:**
- `templates/FIRE/value_models/strategy.value_model.yaml`
- `templates/FIRE/value_models/commercial.value_model.yaml`
- `templates/FIRE/value_models/org_ops.value_model.yaml`

**Impact:** 
- Templates fail schema validation when copied to instances
- Inconsistency between documentation/examples and actual schema requirements
- Users following templates will create invalid instances

**Validation Errors:**
```
instancePath: '/layers/0/id',
schemaPath: '#/properties/layers/items/properties/id/pattern',
keyword: 'pattern',
params: { pattern: '^[a-z][a-z0-9-]*[a-z0-9]$' },
message: 'must match pattern "^[a-z][a-z0-9-]*[a-z0-9]$"'
```

**Options to Fix:**
1. **Update templates** to use lowercase kebab-case IDs (recommended)
   - Pro: Templates validate immediately
   - Con: Breaks existing instances using these templates
2. **Update schema** to allow uppercase
   - Pro: Backward compatible
   - Con: Less consistent with common kebab-case conventions
3. **Update schema** to be case-insensitive or more permissive
   - Pro: Maximum flexibility
   - Con: Allows inconsistent styles

**Recommendation:** Fix templates (Option 1) and provide migration script for existing instances.

**Fix Applied:** Updated all canonical value model templates to use lowercase kebab-case IDs using regex replacement that preserves YAML formatting. All templates now validate successfully.

**Date Identified:** 2026-01-06
**Date Fixed:** 2026-01-06

---

## Issue #3: Add-to-Repo Script - Missing Value Model Templates

**Status:** ✅ Fixed in v1.13.1

**Description:** The `add-to-repo.sh` script copies READY phase templates but doesn't copy FIRE phase value model templates, leaving new instances with empty value_models directory.

**Impact:** New product instances missing canonical value models for Strategy, OrgOps, and Commercial tracks.

**Fix:** Updated `scripts/add-to-repo.sh` to copy value model templates:
```bash
cp docs/EPF/templates/FIRE/value_models/*.yaml docs/EPF/_instances/"$PRODUCT_NAME"/FIRE/value_models/
```

**Date Identified:** 2026-01-06
**Date Fixed:** 2026-01-06

---

## Contributing

When you discover EPF framework issues while working in product repos:

1. Document the issue in this file
2. Fix it if possible
3. Test the fix
4. Consider impact on existing instances
5. Update version numbers appropriately
6. Commit both the fix and documentation

This "eat your own dog food" approach improves EPF quality for all users.
