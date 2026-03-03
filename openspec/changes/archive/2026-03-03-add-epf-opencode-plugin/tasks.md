## Phase 1: Project Setup & CLI Wrapper

### 1.1 Package Scaffold
- [x] 1.1.1 Create `packages/opencode-epf/` directory with `package.json` (`@opencode-ai/plugin` as dependency, `opencode-epf` as package name)
- [x] 1.1.2 Create `tsconfig.json` with strict TypeScript config
- [x] 1.1.3 Create `src/index.ts` with plugin entry point skeleton (export `EPFPlugin` function matching OpenCode plugin signature)
- [x] 1.1.4 Verify plugin loads in OpenCode (symlink to `~/.config/opencode/plugins/` or add to config)

### 1.2 CLI Wrapper
- [x] 1.2.1 Create `src/cli.ts` — subprocess wrapper: `execEPFCLI(args: string[]): Promise<{stdout, stderr, exitCode}>`
- [x] 1.2.2 Add `epf-cli` PATH detection with graceful fallback (check `which epf-cli`, allow configurable path)
- [x] 1.2.3 Add EPF instance detection: run `epf-cli locate --json` in workspace directory, cache result
- [x] 1.2.4 Add JSON output parsing with error handling (malformed JSON, CLI errors, timeouts)
- [x] 1.2.5 Write unit tests for CLI wrapper (mock subprocess execution)

## Phase 2: Guardrails (Event Hooks)

### 2.1 Commit Guard
- [x] 2.1.1 Create `src/guardrails.ts` — implement `tool.execute.before` hook
- [x] 2.1.2 Parse bash command string for git commit patterns (`git commit`, `git commit -m`, `git commit -am`, etc.)
- [x] 2.1.3 On git commit detection: run `epf-cli health <instance_path> --json`
- [x] 2.1.4 If critical errors: throw Error with summary message (blocks the commit)
- [x] 2.1.5 If warnings only: allow commit, emit `tui.toast.show` with warning count
- [x] 2.1.6 If healthy: allow commit silently (no-op)
- [x] 2.1.7 Detect and respect `--no-verify` flag (skip guardrail if user explicitly bypasses)
- [x] 2.1.8 Write unit tests for commit detection patterns and guard logic

### 2.2 Session Idle Health Check
- [x] 2.2.1 Implement `session.idle` hook — run health check on first idle event per session
- [x] 2.2.2 Track idle state to avoid repeated notifications (one toast per session)
- [x] 2.2.3 Format health summary as a concise toast message
- [x] 2.2.4 Write unit tests for idle hook behavior

### 2.3 File Edit Watcher
- [x] 2.3.1 Implement `file.edited` hook — detect EPF YAML file edits
- [x] 2.3.2 Match file paths against EPF artifact patterns (READY/, FIRE/, AIM/ directories)
- [x] 2.3.3 Run lightweight validation on edited file via `epf-cli validate <file> --json`
- [x] 2.3.4 Emit toast with validation result if errors found
- [x] 2.3.5 Write unit tests for file pattern matching and edit hook

### 2.4 Diagnostic Aggregation
- [x] 2.4.1 Implement `lsp.client.diagnostics` hook — collect diagnostics from EPF LSP
- [x] 2.4.2 Track per-file diagnostic counts across the workspace
- [x] 2.4.3 Emit summary toast when diagnostic count crosses thresholds (e.g., "5 EPF files have errors")
- [x] 2.4.4 Write unit tests for diagnostic aggregation logic

## Phase 3: Dashboard Tools

### 3.1 EPF Dashboard Tool
- [x] 3.1.1 Create `src/tools.ts` — define `epf_dashboard` custom tool
- [x] 3.1.2 Run `epf-cli health <instance_path> --json` and parse structured output
- [x] 3.1.3 Create `src/formatters.ts` — format health data as markdown tables (structure status, validation summary, content readiness, workflow guidance)
- [x] 3.1.4 Include instance metadata in output (path, artifact count, schema version)
- [x] 3.1.5 Write unit tests for health data formatting

### 3.2 Coverage Tool
- [x] 3.2.1 Define `epf_coverage` custom tool in `src/tools.ts`
- [x] 3.2.2 Run coverage analysis via `epf-cli` (may need to add `--json` flag to coverage command if not present)
- [x] 3.2.3 Format coverage data as markdown: list L2 components per track, mark covered/uncovered, show contributing features
- [x] 3.2.4 Write unit tests for coverage formatting

### 3.3 Roadmap Status Tool
- [x] 3.3.1 Define `epf_roadmap_status` custom tool in `src/tools.ts`
- [x] 3.3.2 Run OKR progress via `epf-cli` AIM tools (may need JSON output mode)
- [x] 3.3.3 Run assumption validation status via `epf-cli`
- [x] 3.3.4 Format as markdown: OKR achievement rates by track, assumption validation counts, cycle trends
- [x] 3.3.5 Write unit tests for roadmap status formatting

## Phase 4: Documentation & Distribution

### 4.1 Package Documentation
- [x] 4.1.1 Write `packages/opencode-epf/README.md` — installation, configuration, usage examples
- [x] 4.1.2 Document all custom tools with example inputs/outputs
- [x] 4.1.3 Document all guardrails with behavior descriptions and override options

### 4.2 Integration Documentation
- [x] 4.2.1 Update `apps/epf-cli/AGENTS.md` with OpenCode plugin section
- [x] 4.2.2 Update `apps/epf-cli/README.md` with plugin reference
- [x] 4.2.3 Add plugin to "Power Combo" documentation (CLI + MCP + LSP + Plugin)

### 4.3 Distribution
- [x] 4.3.1 Configure `package.json` for npm publishing (name, version, main, types, files)
- [x] 4.3.2 Test local plugin installation (symlink to `~/.config/opencode/plugins/`)
- [x] 4.3.3 Test npm package installation (add to `opencode.json` plugin array)
- [x] 4.3.4 End-to-end test: commit guard blocks invalid commit, dashboard tool renders health
