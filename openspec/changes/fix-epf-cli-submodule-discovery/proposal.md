# Change: Fix EPF CLI discovery to work without local schemas directory

## Why

The EPF CLI's context detection (`epfcontext.Detect()`) requires a `docs/EPF/schemas/` directory to exist before it can find EPF instances. This means any repo that has an EPF instance via git submodule but no local schemas directory (a "consumer repo") fails discovery — `epfContext` becomes nil, and commands degrade silently.

This is a prerequisite for extracting the EPF strategy instance to a dedicated repo with submodules (see `extract-epf-instance-to-submodule`). Without this fix, the submodule pattern won't work.

## What Changes

### 1. Decouple instance discovery from schema discovery

- **MODIFY** `internal/epfcontext/context.go` — `findEPFRoot()` no longer requires `schemas/` to exist. It accepts directories with `_instances/` or direct instance markers (`_epf.yaml`, READY/FIRE/AIM).
- **MODIFY** `internal/epfcontext/context.go` — `Detect()` delegates instance discovery to `internal/discovery/discovery.go` `Discover()` instead of reimplementing its own search.
- **MODIFY** `cmd/helpers.go` — `GetInstancePath()` delegates to `discovery.DiscoverSingle()` instead of its own cascading search.

### 2. Add submodule detection utility

- **ADD** submodule detection: check for `.git` file (not directory) in instance path, expose as `IsSubmodule(path) bool`.
- **ADD** warning for uninitialized submodules (empty directory at expected instance path).

### 3. Surface submodule status in diagnostics

- **UPDATE** `cmd/locate.go` — `epf locate` output includes submodule indicator when detected.
- **UPDATE** `cmd/health.go` — `epf health` reports whether instance is a submodule.

### 4. Fix pre-existing submodule bug

- **FIX** `cmd/migrate_structure.go:303-310` — reads `.git/config` assuming `.git` is a directory. Will crash for submodule `.git` files. Guard the read with a directory check.

### 5. Comprehensive tests

- Tests for discovery in integrated repos (backward compat)
- Tests for discovery in consumer repos (submodule, no schemas)
- Tests for submodule detection (`.git` file vs directory)
- Tests for uninitialized submodule warning
- Full regression suite

## Impact

- Affected specs: `epf-cli-mcp` (ADDED: discovery without schemas, submodule detection)
- Affected code: `internal/epfcontext/context.go`, `internal/discovery/discovery.go`, `cmd/helpers.go`, `cmd/locate.go`, `cmd/health.go`, `cmd/migrate_structure.go`
- **No breaking changes** — existing integrated-mode repos continue to work identically.
- **Dependency**: `extract-epf-instance-to-submodule` depends on this change being completed first.
