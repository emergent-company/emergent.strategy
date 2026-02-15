## 1. Per-repo configuration

- [ ] 1.1 Add `.epf.yaml` config struct to `internal/config/config.go` — fields: `instance_path`, `mode`, `schemas`
- [ ] 1.2 Implement repo root detection — walk up from cwd to `.git`, check for `.epf.yaml` adjacent
- [ ] 1.3 Implement config loading with precedence: CLI flag > per-repo > global > auto-detect
- [ ] 1.4 Wire `cmd/helpers.go` — `GetInstancePath()` and `GetSchemasDir()` read per-repo config
- [ ] 1.5 Wire `cmd/serve.go` — MCP server startup reads per-repo config

## 2. `epf enroll` command

- [ ] 2.1 Create `cmd/enroll.go` — `epf enroll <url> [--path <mount-path>] [--dry-run]`
- [ ] 2.2 Implement submodule add: derive default mount path from URL, run `git submodule add`
- [ ] 2.3 Run `git submodule update --init` after adding
- [ ] 2.4 Create `.epf.yaml` with instance_path and mode=submodule
- [ ] 2.5 Print AGENTS.md snippet for user to add
- [ ] 2.6 Idempotency: detect already-enrolled repos and print status instead of failing

## 3. `epf init --mode standalone`

- [ ] 3.1 Add `--mode` flag to `cmd/init.go` — values: `integrated` (default), `standalone`
- [ ] 3.2 Implement standalone mode in `createInstanceStructure()` — create instance at path directly, no wrapper
- [ ] 3.3 Add `mode` parameter to `internal/mcp/instance_tools.go` `handleInitInstance()`
- [ ] 3.4 Update interactive prompts — ask about mode if not specified

## 4. Enrollment diagnostics

- [ ] 4.1 Add enrollment info to `epf health` output — enrolled, instance source, config source
- [ ] 4.2 Cross-check `.epf.yaml` config against actual filesystem state
- [ ] 4.3 Warn if config says submodule but instance is not a submodule (or vice versa)

## 5. Tests

- [ ] 5.1 Test: `epf enroll` adds submodule and creates `.epf.yaml`
- [ ] 5.2 Test: `epf enroll --dry-run` prints plan without changes
- [ ] 5.3 Test: `epf enroll` on already-enrolled repo is idempotent
- [ ] 5.4 Test: config precedence — CLI flag > per-repo > global > auto-detect
- [ ] 5.5 Test: `epf init --mode standalone` creates correct structure
- [ ] 5.6 Test: `epf init --mode integrated` behaves identically to current behavior
- [ ] 5.7 Test: `epf health` shows enrollment status and config source
- [ ] 5.8 Run full test suite `go test ./...` and verify no regressions
