## 1. Discovery refactor

- [x] 1.1 Refactor `internal/epfcontext/context.go` — `findEPFRoot()` must not require `schemas/` directory; accept directories with `_instances/` or direct instance markers (`_epf.yaml`, READY/FIRE/AIM)
- [x] 1.2 Refactor `internal/epfcontext/context.go` — `Detect()` delegates instance discovery to `internal/discovery/discovery.go` `Discover()` instead of reimplementing search
- [x] 1.3 Simplify `cmd/helpers.go` — `GetInstancePath()` delegates to `discovery.DiscoverSingle()` instead of its own cascading search
- [x] 1.4 Verify `internal/schema/loader.go` — `FindEPFRoot()` is dead code (zero callers); leave as-is but add comment noting it

## 2. Submodule detection

- [x] 2.1 Add `IsSubmodule(path string) bool` utility — check for `.git` file (not directory) in instance path
- [x] 2.2 Add uninitialized submodule detection — empty directory at expected instance path with `.gitmodules` referencing it
- [x] 2.3 Update `cmd/locate.go` — `epf locate` output includes submodule indicator when detected
- [x] 2.4 Update `cmd/health.go` — `epf health` reports whether instance is a submodule

## 3. Bug fix

- [x] 3.1 Fix `cmd/migrate_structure.go:303-310` — guard `.git/config` read with directory check; skip for submodule `.git` files

## 4. Tests

- [x] 4.1 Test: discovery finds instance in integrated repo with `schemas/` directory (backward compat)
- [x] 4.2 Test: discovery finds instance in consumer repo with submodule, no `schemas/`
- [x] 4.3 Test: submodule detection returns true for `.git` file, false for `.git/` directory
- [x] 4.4 Test: uninitialized submodule (empty dir) produces warning
- [x] 4.5 Test: `epf locate` shows submodule indicator
- [x] 4.6 Test: `epf health` shows submodule status
- [x] 4.7 Run full test suite `go test ./...` and verify no regressions

### Pre-existing test failures (not caused by this change)

- `TestDetectInstanceInCanonical` in `internal/checks/structure_test.go:130` — `detectRepoType()` Priority 1 returns `RepoTypeProduct` when `_instances/` has subdirs, even when all canonical markers exist. Verified failing on `main` before our changes.
- `TestCLI_Migrate_DryRun` in `tests/integration_test.go:313` — uses `--target` flag that doesn't exist on `migrate` command.
