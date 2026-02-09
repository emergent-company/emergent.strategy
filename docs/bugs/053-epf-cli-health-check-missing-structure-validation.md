# Bug #053: epf-cli Health Check Missing Product Repo Structure Validation

**Status**: ✅ RESOLVED  
**Priority**: High  
**Component**: epf-cli  
**Affects**: AI agents, product repo maintainers  
**Discovered**: 2026-02-08  
**Resolved**: 2026-02-08

## Resolution Summary

Implemented structure validation in `epf-cli health` command that detects when a product repository contains canonical EPF framework content.

### Implementation Details

| File                                             | Description                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/epf-cli/internal/checks/structure.go`      | Repository structure validation logic - detects repo type (canonical vs product), validates structure, returns issues with fix recommendations                                 |
| `apps/epf-cli/internal/checks/structure_test.go` | 9 test cases covering product repo detection, canonical detection, mixed content detection                                                                                     |
| `apps/epf-cli/cmd/health.go`                     | Integrated structure check as FIRST check in `runHealthCheck()`, added `printStructureCheckSummary()`, updated `calculateTiers()` to include structure issues in Critical tier |
| `apps/epf-cli/cmd/fix.go`                        | Added `epf-cli fix structure` subcommand to auto-remove canonical content from product repos                                                                                   |

### Verification

```bash
# Build and test
cd apps/epf-cli && go test ./... # All tests pass

# Check product repo structure
./epf-cli health /path/to/product/docs/EPF/_instances/product/
```

---

---

## Problem Summary

The `epf-cli health` command does not detect when a product repository contains canonical EPF framework content (schemas, templates, scripts, etc.) that should NOT be there. This leads to:

1. **AI agents working on the wrong files** - fixing schemas/templates in product repos instead of the canonical repo
2. **Structural debt** - product repos become bloated with framework content
3. **Sync confusion** - git subtree operations on product repos that shouldn't have subtrees
4. **Lost work** - fixes made to canonical content in product repos don't propagate

## Current Behavior

When running `epf-cli health` on twentyfirst product repo:

```bash
epf-cli health /Users/nikolaifasting/code/twentyfirst/docs/EPF/_instances/twentyfirst
```

**Output:**

```
▶ Checking instance structure...
  ⚠️ Instance Structure: 12/14 checks passed (2 warnings)

════════════════════════════════════════════════════════════
  ❌ Overall Status: ERRORS
════════════════════════════════════════════════════════════

  Health Tiers:
  ─────────────
  ✅ Critical:  100/100  All essential structure in place
  ❌ Schema:     20/100  55 schema validation issues
  ⚠️ Quality:    89/100  Good content quality with room for improvement
```

**Problem:** Health check reports "All essential structure in place" but doesn't detect:

```
docs/EPF/
├── _instances/twentyfirst/  ✅ Correct
├── schemas/                  ❌ Should NOT be here (canonical content)
├── templates/                ❌ Should NOT be here (canonical content)
├── scripts/                  ❌ Should NOT be here (canonical content)
├── migrations/               ❌ Should NOT be here (canonical content)
├── wizards/                  ❌ Should NOT be here (canonical content)
├── outputs/                  ❌ Should NOT be here (canonical content)
├── features/                 ❌ Should NOT be here (canonical content)
├── docs/                     ❌ Should NOT be here (canonical content)
├── definitions/              ❌ Should NOT be here (canonical content)
├── phases/                   ❌ Should NOT be here (canonical content)
└── ... (entire canonical framework)
```

## Expected Behavior

According to `epf-cli init --help`:

> **The canonical EPF (schemas, templates, wizards, generators) is NOT copied.**  
> **Instead, epf-cli loads these from the configured canonical_path at runtime.**

Product repos should ONLY contain:

```
docs/EPF/
├── _instances/{product}/     ✅ Instance data
├── AGENTS.md                 ✅ Minimal guidance
├── README.md                 ✅ Minimal docs
└── .gitignore                ✅ Ignore rules
```

### Proposed Health Check Output

When canonical content is detected in a product repo:

```
▶ Checking repository structure...
  ❌ Repository Structure: INVALID (product repo contains canonical content)

  🚨 CRITICAL STRUCTURAL ERROR
  ──────────────────────────────────────────────────────────
  This product repository contains canonical EPF framework
  content that should NOT be here.

  Found canonical directories:
    ❌ docs/EPF/schemas/      (10 schema files)
    ❌ docs/EPF/templates/    (25 template files)
    ❌ docs/EPF/scripts/      (34 scripts)
    ❌ docs/EPF/migrations/   (migration registry)
    ❌ docs/EPF/wizards/      (20 wizard files)
    ❌ docs/EPF/outputs/      (output generators)
    ❌ docs/EPF/features/     (feature corpus)

  📋 EXPECTED STRUCTURE (product repos):
    ✅ docs/EPF/_instances/{product}/
    ✅ docs/EPF/AGENTS.md
    ✅ docs/EPF/README.md
    ✅ docs/EPF/.gitignore

  ⚠️  IMPACT:
    • AI agents may edit canonical content in product repo
    • Changes won't propagate to other products
    • Creates sync/subtree complications
    • Bloats product repo with framework content

  🔧 FIX:
    Option 1 (Recommended): Use epf-cli to restructure
      $ epf-cli fix structure --product-repo

    Option 2: Manual cleanup
      $ cd docs/EPF
      $ rm -rf schemas templates scripts migrations wizards \
               outputs features docs definitions phases \
               integration_specification.yaml VERSION \
               MAINTENANCE.md CANONICAL_PURITY_RULES.md \
               MIGRATIONS.md KNOWN_ISSUES.md
      $ # Keep: _instances/ AGENTS.md README.md .gitignore

    Option 3: Remove and reinitialize
      $ epf-cli init {product-name} --force

  📖 REFERENCE:
    • epf-cli loads schemas/templates from canonical_path
    • See: epf-cli config show
    • See: epf-cli init --help
  ──────────────────────────────────────────────────────────

════════════════════════════════════════════════════════════
  ❌ Overall Status: STRUCTURAL ERROR
════════════════════════════════════════════════════════════

  Health Tiers:
  ─────────────
  ❌ Critical:    0/100  Product repo structure invalid
  ⚠️ Schema:     20/100  (check blocked by structural error)
  ⚠️ Quality:    89/100  (check blocked by structural error)
```

## Root Cause

The `epf-cli health` command has no check that validates:

1. **Repository type detection** - Is this a canonical repo or product repo?
2. **Structure validation** - Does the structure match the expected type?
3. **Canonical content detection** - Are canonical directories present when they shouldn't be?

## Impact on AI Agents

This is **critical for AI agents** because:

1. **Agents trust epf-cli as the source of truth** - If health check says structure is fine, agents assume it is
2. **Agents see local files first** - They'll find and edit `docs/EPF/schemas/` instead of asking where schemas come from
3. **No guidance to fix** - Without health check error, agents don't know to restructure
4. **Lost context** - Agents waste time fixing feature definitions when the fundamental structure is wrong

### Real Example

AI agent working on twentyfirst EPF health issues:

1. ✅ Ran `epf-cli health` → got 32 issues
2. ❌ Started fixing feature definitions (wrong paths in `contributes_to`)
3. ❌ Never discovered that the repo structure itself is wrong
4. ⏰ Wasted 30+ minutes on wrong layer of the problem

**With proper health check:**

1. ✅ Ran `epf-cli health` → CRITICAL: Invalid structure
2. ✅ Fixed structure first (removed canonical content)
3. ✅ Then worked on feature definitions with clean foundation

## Proposed Implementation

### Detection Logic

```go
// In health check command
func (hc *HealthChecker) CheckRepositoryStructure() StructureResult {
    // 1. Detect repo type
    repoType := hc.detectRepoType()

    // 2. Check for canonical content
    canonicalDirs := []string{
        "schemas", "templates", "scripts", "migrations",
        "wizards", "outputs", "features", "docs",
        "definitions", "phases",
    }

    foundCanonicalContent := []string{}
    for _, dir := range canonicalDirs {
        path := filepath.Join(hc.epfRoot, dir)
        if exists(path) {
            foundCanonicalContent = append(foundCanonicalContent, dir)
        }
    }

    // 3. Validate structure matches repo type
    if repoType == "product-repo" && len(foundCanonicalContent) > 0 {
        return StructureResult{
            Valid: false,
            Severity: "critical",
            Message: "Product repo contains canonical EPF content",
            FoundCanonicalDirs: foundCanonicalContent,
            Recommendations: generateStructureFix(foundCanonicalContent),
        }
    }

    return StructureResult{Valid: true}
}

func (hc *HealthChecker) detectRepoType() string {
    // Check if _instances/ contains actual instance data
    instancesPath := filepath.Join(hc.epfRoot, "_instances")

    instances := findInstances(instancesPath)
    if len(instances) > 0 && !onlyContainsReadme(instancesPath) {
        return "product-repo"
    }

    return "canonical-repo"
}
```

### Health Check Priority

This check should run **FIRST** in the health check sequence:

```
1. ⚠️  Repository Structure    [NEW - BLOCKING]
2. Anchor File
3. Instance Structure
4. Schema Validation
5. Feature Quality
... (rest of checks)
```

If structure check fails with "critical" severity, subsequent checks should be marked as "blocked" or "skipped pending structure fix".

## Additional Enhancements

### 1. New Command: `epf-cli fix structure`

Auto-fix common structure issues:

```bash
# Detect and fix product repo structure
epf-cli fix structure --product-repo

# Preview what will be removed (dry-run)
epf-cli fix structure --product-repo --dry-run

# Interactive mode (confirm each deletion)
epf-cli fix structure --product-repo --interactive
```

### 2. Enhanced `epf-cli config context`

Show detected repo type and structure validity:

```bash
epf-cli config context

# Output:
Detected Context:
  Type:      product-repo
  EPF Root:  /Users/user/code/twentyfirst/docs/EPF
  Structure: ❌ INVALID (contains canonical content)
  Instances: [twentyfirst]
  Current:   twentyfirst

  Issues:
    ❌ Found canonical directories that should not be here
    ❌ Run 'epf-cli fix structure --product-repo' to clean up
```

### 3. Warning in Other Commands

When running other epf-cli commands in a product repo with invalid structure:

```bash
epf-cli validate some-file.yaml

# Output:
⚠️  WARNING: Product repo contains canonical EPF content
   Run 'epf-cli health' for details and fix recommendations.

Validating: some-file.yaml
...
```

## Test Cases

1. **Product repo with canonical content** → Structure check fails (critical)
2. **Product repo with clean structure** → Structure check passes
3. **Canonical repo with canonical content** → Structure check passes (expected)
4. **Product repo with git subtree** → Detect and warn about subtree usage

## Benefits

1. **AI agents immediately see the problem** - Health check fails fast with clear guidance
2. **Prevents wasted work** - Don't fix feature definitions until structure is clean
3. **Self-documenting** - Error message explains the correct structure
4. **Actionable** - Provides fix commands, not just warnings
5. **Protects canonical repo** - Reduces risk of product data in canonical repo

## Files to Modify

1. `apps/epf-cli/cmd/health.go` - Add structure validation check
2. `apps/epf-cli/internal/health/structure.go` - New file for structure logic
3. `apps/epf-cli/cmd/fix.go` - New command for auto-fixing structure
4. `apps/epf-cli/cmd/config.go` - Enhance context output
5. `apps/epf-cli/internal/config/detect.go` - Add repo type detection

## Priority Justification

**High Priority** because:

- Affects all AI agents using epf-cli
- Currently causing wasted effort on wrong problems
- Fundamental to correct EPF usage pattern
- Blocks productive work on instance health

---

## Related Issues

- None (first report of this issue)

## References

- `epf-cli init --help` - Documents that canonical content is NOT copied
- `epf-cli config show` - Shows canonical_path configuration
- Real-world example: twentyfirst repo health check session (2026-02-08)
