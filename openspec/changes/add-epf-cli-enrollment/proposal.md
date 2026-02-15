# Change: Add EPF CLI enrollment and per-repo configuration

## Why

After extracting the EPF strategy instance to a dedicated repo (`emergent-epf`) and fixing CLI discovery for submodules (Changes A and B), repos can access shared strategy via git submodules. But the enrollment process is manual — developers need to know the submodule URL, the correct mount path, and which docs to update. There's also no way for a repo to declare its EPF setup (instance path, schema source) so the CLI relies entirely on auto-detection.

This change adds:
1. An `epf enroll` command that automates submodule setup
2. Per-repo `.epf.yaml` configuration so repos can declare their EPF setup explicitly
3. A standalone init mode for creating repos that ARE instances (like `emergent-epf`)

## What Changes

### 1. `epf enroll` command

- **ADD** `epf enroll` — connects a repo to a shared EPF instance via git submodule
- Automates: `git submodule add`, creates `.epf.yaml`, suggests `AGENTS.md` additions
- Supports enrolling from a URL or from a known org registry
- Idempotent — running on an already-enrolled repo is a no-op with status message

### 2. Per-repo `.epf.yaml` configuration

- **ADD** `.epf.yaml` at repo root — declares instance path, mode, schema source
- Config precedence: CLI flag > per-repo `.epf.yaml` > global `~/.epf-cli.yaml` > auto-detection
- Created automatically by `epf enroll`, can also be written manually

### 3. `epf init --mode standalone`

- **MODIFY** `epf init` — add `--mode` flag with `integrated` (default) and `standalone` modes
- Standalone mode creates the instance at the specified path directly (no `docs/EPF/` wrapper)
- Suitable for repos that ARE the instance (like `emergent-epf`)
- MCP `epf_init_instance` tool gains matching `mode` parameter

### 4. `epf status` enrollment info

- **ADD** enrollment status to `epf health` and a new `epf status` subcommand
- Shows: enrolled (yes/no), instance source (local/submodule), config source (auto/per-repo/global/flag)

## Dependencies

- **Requires**: `fix-epf-cli-submodule-discovery` (Change A) — CLI must work without local schemas
- **Requires**: `extract-epf-instance-to-submodule` (Change B) — the shared instance must exist as a submodule-able repo
- **Informed by**: real-world experience enrolling 2-3 repos manually during Change B

## Impact

- Affected specs: `epf-cli-mcp` (MODIFIED: init with mode, ADDED: enroll, per-repo config, enrollment status)
- Affected code: `cmd/enroll.go` (new), `cmd/init.go`, `cmd/health.go`, `internal/config/config.go`, `internal/mcp/instance_tools.go`
- **No breaking changes** — all additions are opt-in
- **Risk**: Over-engineering before the pattern is proven. Mitigated by implementing after Changes A+B are done and we have real usage data.

## Open Questions

1. **Registry vs URL-only**: Should `epf enroll` support a registry of known instances (e.g., from org config), or just accept a URL? Start with URL-only, add registry later.
2. **Multi-instance**: Can a repo have both an org-wide strategy instance AND a product-specific instance? Probably yes, but defer until there's a concrete need.
3. **Unenroll**: Should there be `epf unenroll`? Probably just document `git rm` — unenrollment is rare and simple.
4. **Validation on enroll**: Should `epf enroll` validate the remote instance before adding the submodule? Nice to have but adds complexity.
