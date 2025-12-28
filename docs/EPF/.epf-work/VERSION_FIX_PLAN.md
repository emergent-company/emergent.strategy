# EPF v1.13.0 Release - README Update

## Problem

The v1.13.0 release (commit c023e03) updated VERSION and MAINTENANCE.md but missed updating README.md, causing version inconsistency.

**Current State:**
- `VERSION`: v1.13.0 ✅
- `MAINTENANCE.md`: v1.13.0 ✅  
- `README.md`: v1.12.0 ❌

## Changes in v1.13.0

Based on git commit c023e03 message:
- Added `VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md`
- Added `VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md`
- Added product architect wizard
- Enhanced value models (commercial, org_ops, product, strategy)
- Added pre-flight checklist for AI agents
- Improved sync script error handling and fallback

## Required Updates

1. Update README.md header from v1.12.0 to v1.13.0
2. Add "What's New in v1.13.0" section with changes above
3. Propagate fix to all product repos via git subtree

## Implementation

### Step 1: Update README.md

```bash
cd /Users/nikolai/Code/epf

# Edit README.md:
# - Line 1: Change "v1.12.0" to "v1.13.0"
# - After line 31 (What's New in v1.12.0), add new v1.13.0 section
```

### Step 2: Verify

```bash
# Run health check
./scripts/epf-health-check.sh

# Verify version consistency
grep -E "v1\.(12|13)\.0" README.md MAINTENANCE.md VERSION
```

### Step 3: Commit

```bash
git add README.md
git commit -m "docs: Update README.md to v1.13.0

- Update header to match VERSION file (v1.13.0)
- Add 'What's New in v1.13.0' section
- Fixes version inconsistency identified in documentation review"
```

### Step 4: Propagate to Product Repos

After merging to main in canonical EPF:

```bash
# For each product repo (lawmatics, huma-blueprint-ui, twentyfirst, emergent)
cd /path/to/product-repo
git subtree pull --prefix=docs/EPF epf main --squash -m "EPF: Pull v1.13.0 README fix"
```

## Testing

Verify no broken links or references:
```bash
cd /Users/nikolai/Code/epf
grep -r "v1\.12\.0" *.md | grep -v "What's New in v1.12.0"
# Should only show historical "What's New" sections, no current version refs
```

## Checklist

- [ ] Update README.md header to v1.13.0
- [ ] Add "What's New in v1.13.0" section
- [ ] Run health check script
- [ ] Commit to canonical EPF
- [ ] Propagate to product repos
- [ ] Verify version consistency across all repos
