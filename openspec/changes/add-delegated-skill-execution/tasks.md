## 1. Skill Manifest Extension (Go)

- [ ] 1.1 Add `Execution` field (string enum: `prompt-delivery`, `inline`, `script`, `plugin`) to `SkillManifest` in `internal/skill/types.go`
- [ ] 1.2 Add `InlineSpec` struct with `Handler` and `Parameters` fields
- [ ] 1.3 Add `ScriptSpec` struct with `Command`, `Args`, `Input`, `Output`, `Timeout` fields
- [ ] 1.4 Add `Inline *InlineSpec` and `Script *ScriptSpec` fields to `SkillManifest`
- [ ] 1.5 Add manifest validation: `inline` requires `inline.handler`; `script` requires `script.command`; `plugin` returns "not yet supported" error
- [ ] 1.6 Add validation: `script` execution only allowed for instance-local skills (not embedded/framework)
- [ ] 1.7 Add validation warning when `inline`/`script` block present on `prompt-delivery` skill
- [ ] 1.8 Write unit tests for manifest parsing with new fields
- [ ] 1.9 Write unit tests for validation of inline and script constraints

## 2. Compute Package (Go)

- [ ] 2.1 Create `internal/compute/` package with `SkillHandler` interface and `Registry`
- [ ] 2.2 Define `ExecutionResult` and `ExecutionLog` types
- [ ] 2.3 Implement value-model-preview handler in `internal/compute/valuemodel/preview.go`
  - [ ] 2.3.1 Load value models via existing `internal/valuemodel/` loader
  - [ ] 2.3.2 Process embedded HTML template with Go `text/template`
  - [ ] 2.3.3 Run validator checks (HTML structure, placeholder replacement, self-contained)
  - [ ] 2.3.4 Return rendered HTML as ExecutionResult
- [ ] 2.4 Write unit tests for value-model-preview with real YAML fixtures
- [ ] 2.5 Implement balance-checker handler in `internal/compute/balance/checker.go`
  - [ ] 2.5.1 Load roadmap via existing `internal/roadmap/` loader
  - [ ] 2.5.2 Implement KR counting and portfolio balance scoring
  - [ ] 2.5.3 Implement dependency graph construction from cross_track_dependencies
  - [ ] 2.5.4 Implement cycle detection (DFS) and critical path calculation (topological sort)
  - [ ] 2.5.5 Implement resource viability scoring (capacity vs. utilization)
  - [ ] 2.5.6 Implement weighted overall score calculation
  - [ ] 2.5.7 Return structured scoring data as ExecutionResult
- [ ] 2.6 Write unit tests for balance-checker with real roadmap YAML fixtures

## 3. Script Execution (Go)

- [ ] 3.1 Implement script executor in `internal/compute/script.go`
  - [ ] 3.1.1 Resolve command (absolute, relative to skill dir, or PATH lookup)
  - [ ] 3.1.2 Build JSON input (instance_path, parameters, skill_dir)
  - [ ] 3.1.3 Spawn subprocess via `os/exec`, pipe JSON to stdin
  - [ ] 3.1.4 Read JSON ExecutionResult from stdout
  - [ ] 3.1.5 Enforce timeout (context.WithTimeout, default 30s)
  - [ ] 3.1.6 Handle errors (command not found, non-zero exit, invalid JSON, timeout)
- [ ] 3.2 Write unit tests for script executor with a test script
- [ ] 3.3 Verify script execution only works for instance-local skills

## 4. MCP Server Changes (Go)

- [ ] 4.1 Register `epf_execute_skill` tool in `internal/mcp/server.go`
- [ ] 4.2 Implement `handleExecuteSkill` in `internal/mcp/skill_tools.go`
  - [ ] 4.2.1 Look up skill, check execution mode (`inline`, `script`, or reject)
  - [ ] 4.2.2 For `inline`: look up registered handler from compute registry, execute
  - [ ] 4.2.3 For `script`: invoke script executor
  - [ ] 4.2.4 Return ExecutionResult
- [ ] 4.3 Update `handleGetSkill` to return redirection instructions for `inline` and `script` skills
- [ ] 4.4 Update `handleListSkills` to include `execution` mode in listing response
- [ ] 4.5 Register compute handlers during server initialization
- [ ] 4.6 Write unit tests for handleExecuteSkill (inline and script paths)
- [ ] 4.7 Write unit tests for handleGetSkill redirection behavior

## 5. Skill Manifest Updates

- [ ] 5.1 Update `value-model-preview/skill.yaml` to add `execution: inline` and `inline.handler`
- [ ] 5.2 Update `balance-checker/skill.yaml` to add `execution: inline` and `inline.handler`
- [ ] 5.3 Verify both skills still appear correctly in `epf_list_skills`

## 6. Integration Testing

- [ ] 6.1 End-to-end test: `epf_execute_skill` with value-model-preview on test instance
- [ ] 6.2 End-to-end test: `epf_execute_skill` with balance-checker on test instance
- [ ] 6.3 End-to-end test: `epf_execute_skill` with a script skill on test instance
- [ ] 6.4 End-to-end test: `epf_get_skill` returns redirection for inline skills
- [ ] 6.5 End-to-end test: `epf_execute_skill` rejects prompt-delivery skills
- [ ] 6.6 End-to-end test: script skill timeout enforcement
- [ ] 6.7 Run full `go test ./...` suite

## 7. Documentation

- [ ] 7.1 Update `AGENTS.md` with inline and script execution documentation
- [ ] 7.2 Update `.opencode/instructions.md` with `epf_execute_skill` tool reference
- [ ] 7.3 Add script skill authoring guide (JSON stdin/stdout contract, example in Python)

## 7. Plugin System (Phase 2, deferred)

- [ ] 7.1 Implement `epf-pack-*` binary discovery on PATH
- [ ] 7.2 Implement `list-skills` / `execute` CLI contract
- [ ] 7.3 Register plugin skills in discovery system with `source: plugin`
- [ ] 7.4 Route `epf_execute_skill` to plugin subprocess for `execution: plugin` skills
- [ ] 7.5 Create example plugin pack scaffold
