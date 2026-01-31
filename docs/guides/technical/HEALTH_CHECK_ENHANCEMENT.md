# EPF Health Check Enhancement - Instance Structure Validation

> **Last updated**: EPF v1.13.0 | **Status**: Current

**Date:** December 12, 2024  
**Version:** v1.11.0  
**Status:** ✅ Deployed to all repositories

## Overview

Enhanced the EPF health check script to automatically detect incomplete instance folder structures and provide actionable remediation guidance. This addresses the gap where existing instances created before the complete structure standard was established are missing required folders.

## What Changed

### Before
The `check_instances()` function only validated:
- Presence of `_meta.yaml` file
- `epf_version` field in `_meta.yaml`

**Result:** All instances passed health checks (44/44) despite having incomplete folder structures.

### After
The `check_instances()` function now validates:
- ✅ Presence of `_meta.yaml` file and `epf_version` field (existing)
- ✅ **NEW:** Required folders: `READY/`, `FIRE/`, `AIM/`, `ad-hoc-artifacts/`
- ✅ **NEW:** FIRE subfolders: `feature_definitions/`, `value_models/`, `workflows/`
- ✅ **NEW:** Migration guidance when folders are missing

**Result:** Health checks now detect structural gaps and report warnings with clear remediation steps.

## Current Instance Status

### Structural Gaps Detected

| Repository | Missing Folders | Missing FIRE Subfolders | Status |
|------------|----------------|-------------------------|--------|
| **emergent** | FIRE, AIM | N/A (no FIRE) | ⚠️ Critical |
| **twentyfirst** | AIM, ad-hoc-artifacts | None | ⚠️ Incomplete |
| **lawmatics** | AIM, ad-hoc-artifacts | None | ⚠️ Incomplete |
| **huma-blueprint** | AIM | workflows | ⚠️ Incomplete |

### Example Health Check Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Instance Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ Checking instance: emergent
✓   _meta.yaml exists
⚠ WARNING:   Missing folders: FIRE AIM

ℹ ━━━ INSTANCE MIGRATION NEEDED ━━━

  1 instance(s) missing complete folder structure.

  To migrate an existing instance to the complete structure:
  1. Review current instance content and back up if needed
  2. Run: ./docs/EPF/scripts/create-instance-structure.sh --update <instance-name>
  3. Or manually create missing folders:
     mkdir -p docs/EPF/_instances/<name>/{READY,AIM,ad-hoc-artifacts,context-sheets,cycles}
     mkdir -p docs/EPF/_instances/<name>/FIRE/{feature_definitions,value_models,workflows}
     touch docs/EPF/_instances/<name>/FIRE/.gitkeep
     touch docs/EPF/_instances/<name>/AIM/.gitkeep

  See: docs/EPF/MAINTENANCE.md#instance-structure-migration
```

## Complete Instance Structure Requirements

Every EPF instance should have this structure:

```
_instances/{product-name}/
├── _meta.yaml                    # Product metadata (required)
├── README.md                      # Instance overview (required)
├── READY/                         # Strategy phase (6 YAML files)
│   ├── 00_north_star.yaml
│   ├── 01_insight_analyses.yaml
│   ├── 02_strategy_foundations.yaml
│   ├── 03_insight_opportunity.yaml
│   ├── 04_strategy_formula.yaml
│   └── 05_roadmap_recipe.yaml
├── FIRE/                          # Execution phase
│   ├── feature_definitions/       # Feature specs
│   ├── value_models/              # Value model YAMLs
│   ├── workflows/                 # Workflow definitions
│   └── mappings.yaml              # Cross-references
├── AIM/                           # Learning phase
│   └── assessment_report.yaml
├── ad-hoc-artifacts/              # Non-authoritative documents
├── context-sheets/                # Additional context
└── cycles/                        # Archived cycles
```

## Technical Implementation

### Code Changes

**File:** `scripts/epf-health-check.sh`  
**Function:** `check_instances()` (lines 347-415)  

**Key Features:**
1. **Folder Validation Loop:** Checks for READY, FIRE, AIM, ad-hoc-artifacts
2. **FIRE Subfolder Validation:** Checks for feature_definitions, value_models, workflows
3. **Migration Counter:** Tracks instances needing migration
4. **Remediation Guidance:** Displays actionable next steps when folders missing
5. **Exit Code:** Returns 2 when warnings present (0 for clean pass)

**Code Snippet:**
```bash
# Check for required folder structure
local missing_folders=()

[ ! -d "$instance_dir/READY" ] && missing_folders+=("READY")
[ ! -d "$instance_dir/FIRE" ] && missing_folders+=("FIRE")
[ ! -d "$instance_dir/AIM" ] && missing_folders+=("AIM")
[ ! -d "$instance_dir/ad-hoc-artifacts" ] && missing_folders+=("ad-hoc-artifacts")

if [ ${#missing_folders[@]} -gt 0 ]; then
    log_warning "  Missing folders: ${missing_folders[*]}"
    instances_need_migration=$((instances_need_migration + 1))
fi
```

### Git History

**Canonical EPF:**
- Commit: `38de701`
- Message: "EPF: Enhanced health check to detect missing instance folders"
- Pushed to: `https://github.com/eyedea-io/epf-canonical-definition.git` (main branch)

**Product Repositories:**
- emergent: `379588f` → `https://github.com/eyedea-io/emergent.git` (master)
- twentyfirst: `cbe238dc1` → `https://github.com/eyedea-io/twentyfirst.git` (develop)
- lawmatics: `e4e42ffd` → `https://github.com/eyedea-io/lawmatics.git` (dev)
- huma-blueprint-ui: `640efcc` → `https://github.com/Huma-Energy/huma-blueprint-ui.git` (develop)

## Migration Path

### Option 1: Automated (Recommended)
Use the `create-instance-structure.sh` script with `--update` flag:
```bash
cd /Users/nikolai/Code/{repository}
./docs/EPF/scripts/create-instance-structure.sh --update {instance-name}
```

**Note:** The `--update` flag is planned but not yet implemented. It will:
- Check if instance exists
- Create only missing folders
- Skip existing files (_meta.yaml, README.md)
- Add .gitkeep to empty folders
- Report what was added vs. skipped

### Option 2: Manual
Create missing folders manually:
```bash
cd /Users/nikolai/Code/{repository}

# For emergent (most critical - missing FIRE and AIM)
mkdir -p docs/EPF/_instances/emergent/{FIRE,AIM,context-sheets,cycles}
mkdir -p docs/EPF/_instances/emergent/FIRE/{feature_definitions,value_models,workflows}
touch docs/EPF/_instances/emergent/FIRE/.gitkeep
touch docs/EPF/_instances/emergent/AIM/.gitkeep

# For twentyfirst, lawmatics, huma-blueprint
mkdir -p docs/EPF/_instances/{name}/{AIM,ad-hoc-artifacts,context-sheets,cycles}
touch docs/EPF/_instances/{name}/AIM/.gitkeep
```

## Benefits

1. **Early Detection:** Structural gaps now caught automatically during health checks
2. **Actionable Guidance:** Users know exactly how to fix issues
3. **Consistency:** All instances will eventually converge to complete structure
4. **Documentation:** Clear reference for what "complete" means
5. **Maintenance:** Integration with existing health check workflow

## Next Steps

1. ✅ **DONE:** Enhanced health check deployed to all repositories
2. ✅ **DONE:** Tested across all four product repos
3. ✅ **DONE:** Pushed to GitHub
4. 🔄 **TODO:** Implement `--update` flag in `create-instance-structure.sh`
5. 🔄 **TODO:** Migrate all existing instances to complete structure
6. 🔄 **TODO:** Update MAINTENANCE.md with migration guidance section
7. 🔄 **TODO:** Re-run health checks after migrations to verify 100% pass

## Documentation References

- **Health Check Script:** `scripts/epf-health-check.sh`
- **Instance Creation Script:** `scripts/create-instance-structure.sh`
- **Maintenance Guide:** `MAINTENANCE.md` (needs migration section)
- **README:** `README.md` (already documents complete structure)

## Success Criteria

- ✅ Health check detects missing folders
- ✅ Clear remediation guidance provided
- ✅ All product repos updated
- ✅ Changes pushed to GitHub
- ⏳ All instances migrated to complete structure (pending)
- ⏳ All health checks pass without warnings (pending)

## Related Issues

This enhancement addresses user feedback: *"emergent has no FIRE folder, we need to make sure that EPF spots such discrepancies and suggests to update it."*

The issue was discovered after deploying the `create-instance-structure.sh` script, which establishes the complete structure standard for NEW instances. However, existing instances created before this standard weren't updated, creating a gap that the health check now detects and guides users to fix.

## Related Resources

- **Script**: [epf-health-check.sh](../../../scripts/epf-health-check.sh) - Health check script for EPF instances
- **Script**: [create-instance-structure.sh](../../../scripts/create-instance-structure.sh) - Instance structure creation script
- **Guide**: [VERSION_MANAGEMENT_AUTOMATED.md](../VERSION_MANAGEMENT_AUTOMATED.md) - Version management and validation protocols
- **Guide**: [INSTANTIATION_GUIDE.md](../INSTANTIATION_GUIDE.md) - Complete workflow for creating EPF instances
- **Doc**: [MAINTENANCE.md](../../../MAINTENANCE.md) - Maintenance procedures and instance migration guidance
