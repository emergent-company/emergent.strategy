## 1. Per-repo configuration

- [x] 1.1 Add `.epf.yaml` config struct to `internal/config/config.go` — fields: `instance_path`, `mode`, `schemas`
- [x] 1.2 Implement repo root detection — walk up from cwd to `.git`, check for `.epf.yaml` adjacent
- [x] 1.3 Implement config loading with precedence: CLI flag > per-repo > global > auto-detect
- [x] 1.4 Wire `cmd/helpers.go` — `GetInstancePath()` and `GetSchemasDir()` read per-repo config
- [x] 1.5 Wire `cmd/serve.go` — MCP server startup reads per-repo config

## 2. `epf enroll` command

- [x] 2.1 Create `cmd/enroll.go` — `epf enroll <url> [--path <mount-path>] [--dry-run]`
- [x] 2.2 Implement submodule add: derive default mount path from URL, run `git submodule add`
- [x] 2.3 Run `git submodule update --init` after adding
- [x] 2.4 Create `.epf.yaml` with instance_path and mode=submodule
- [x] 2.5 Print AGENTS.md snippet for user to add
- [x] 2.6 Idempotency: detect already-enrolled repos and print status instead of failing

## 3. `epf init --mode standalone`

- [x] 3.1 Add `--mode` flag to `cmd/init.go` — values: `integrated` (default), `standalone`
- [x] 3.2 Implement standalone mode in `createInstanceStructure()` — create instance at path directly, no wrapper
- [x] 3.3 Add `mode` parameter to `internal/mcp/instance_tools.go` `handleInitInstance()`
- [x] 3.4 Update interactive prompts — ask about mode if not specified

## 4. Enrollment diagnostics

- [x] 4.1 Add enrollment info to `epf health` output — enrolled, instance source, config source
- [x] 4.2 Cross-check `.epf.yaml` config against actual filesystem state
- [x] 4.3 Warn if config says submodule but instance is not a submodule (or vice versa)

## 5. Tests

- [x] 5.1 Unit tests for `RepoConfig` (config_test.go) — FindRepoRoot, LoadRepoConfig, SaveRepoConfig
- [x] 5.2 Unit tests for `deriveInstanceName` (enroll_test.go) — 11 table-driven cases
- [x] 5.3 Test: `epf enroll` on already-enrolled repo is idempotent
- [x] 5.4 Test: config precedence — CLI flag > per-repo > global > auto-detect
- [x] 5.5 Test: `epf init --mode standalone` creates correct structure
- [x] 5.6 Test: `epf init --mode integrated` behaves identically to current behavior
- [x] 5.7 Test: `epf health` shows enrollment status and config source
- [x] 5.8 Run full test suite `go test ./...` and verify no regressions
