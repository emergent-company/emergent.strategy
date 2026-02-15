## Context

The EPF CLI has 4 overlapping discovery systems:

| System | File | What it finds | Key limitation |
|--------|------|---------------|----------------|
| A. `FindEPFRoot()` | `internal/schema/loader.go` | Framework root (schemas dir) | Dead code — zero callers |
| B. `findEPFRoot()` + `Detect()` | `internal/epfcontext/context.go` | EPF root + instances | Requires `schemas/` to exist |
| C. `Discover()` | `internal/discovery/discovery.go` | Instances with confidence | Most robust, already works without schemas |
| D. `GetInstancePath()` | `cmd/helpers.go` | Instance path for CLI commands | Cascading fallback, duplicates logic |

When `Detect()` fails (no `schemas/`), `epfContext` becomes nil. This causes:
- **`GetInstancePath()`**: Falls through to manual scanning (still works, but slower)
- **`generators.go`**: 14 locations read `epfContext.InstancePath` directly — generators can't auto-detect instance
- **Display functions**: `CurrentInstance` messages show nothing (cosmetic)

The `discovery.go` system (C) already works for submodules — it only checks for anchor files and phase markers.

**Constraints:**
- Must be backward compatible — integrated repos with `schemas/` must work identically
- Must not change any public API or CLI interface
- Should be testable in-place (simulate submodule layout without actual submodule)

## Goals / Non-Goals

**Goals:**
- `Detect()` works in repos without `schemas/` directory
- Instance discovery uses the robust `discovery.Discover()` internally
- Submodule instances are detected and reported in diagnostics
- Uninitialized submodules produce a clear warning
- All existing behavior preserved

**Non-Goals:**
- Full consolidation of all 4 discovery systems (defer to future Change C)
- Per-repo `.epf.yaml` config (defer to future Change C)
- `epf init --mode standalone` (defer to future Change C)
- Removing dead code (`schema.FindEPFRoot()`) — separate cleanup

## Decisions

### Decision 1: Remove schemas requirement from findEPFRoot

**Choice**: `findEPFRoot()` accepts a directory as an EPF root if it contains `_instances/` OR if it IS an instance directory (has `_epf.yaml` or READY/FIRE/AIM). The `schemas/` check becomes optional — its presence is noted but not required.

**Why**: `discovery.Discover()` already proves this works. The schemas requirement was an artifact of the integrated-only era. Embedded schemas are always available as a fallback.

**Alternative considered**: Skip `findEPFRoot()` entirely and only use `discovery.Discover()`. Rejected because `findEPFRoot()` also sets the EPF root path (used by `GetEPFRoot()`, `GetSchemasDir()`), which is different from instance discovery.

### Decision 2: Wire Detect() to use discovery.Discover() for instances

**Choice**: After `findEPFRoot()` locates the EPF root (or fails gracefully), `Detect()` calls `discovery.Discover()` to find instances instead of reimplementing the search. The `discoverInstances()` method in `epfcontext/context.go` delegates to the shared discovery system.

**Why**: Eliminates the duplicated instance-finding logic. `discovery.Discover()` is more thorough (checks anchor files, phase markers, confidence scoring) and already handles edge cases.

### Decision 3: Submodule detection is diagnostic only

**Choice**: Add `IsSubmodule(path) bool` that checks for a `.git` file (not directory). Report this in `epf locate` and `epf health`. No behavioral difference — submodule instances are treated identically to regular instances.

**Why**: Submodules behave identically from a filesystem perspective once initialized. Detection is useful for diagnostics and user guidance only.

Detection logic:
```go
func IsSubmodule(path string) bool {
    info, err := os.Lstat(filepath.Join(path, ".git"))
    return err == nil && !info.IsDir()
}
```

### Decision 4: Uninitialized submodule warning

**Choice**: When an expected instance path exists but is empty (0 files, no `_epf.yaml`), and the parent repo has `.gitmodules` referencing that path, warn the user to run `git submodule update --init`.

**Why**: An empty directory at the expected instance path is the most common symptom of a forgotten `git submodule update --init`. A clear warning saves debugging time.

### Decision 5: Backward compatibility strategy

All changes are additive. Existing behavior is preserved:

| Scenario | Before | After |
|----------|--------|-------|
| Integrated repo with `docs/EPF/schemas/` | Works | Works (unchanged) |
| Consumer repo with submodule, no schemas | Fails (`findEPFRoot` requires schemas) | Works (schemas requirement removed) |
| Consumer repo with empty submodule dir | Silent — instance not found | Warning: "submodule not initialized" |
| `epf locate` | Lists instances | Lists instances + submodule indicator |
| `epf health` | Reports instance status | Reports instance status + submodule info |

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Discovery refactor breaks existing repos | CLI can't find instances it currently finds | Comprehensive tests for integrated + submodule scenarios. Test against real `emergent-strategy` instance before merge. |
| `findEPFRoot()` becomes too permissive | Detects non-EPF directories as EPF roots | Keep the check strict: requires `_instances/` subdirectory OR instance markers. Random directories won't match. |
| `migrate_structure.go` bug fix has side effects | Migration command behavior changes | The fix only adds a guard check — if `.git` isn't a directory, skip the config read. No change to happy path. |

## Open Questions

None — all decisions are straightforward refactors with clear scope.
