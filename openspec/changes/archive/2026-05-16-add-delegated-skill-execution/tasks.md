## 1. Skill Manifest Extension (Go)

- [x] 1.1 Add `Execution` field (string enum: `prompt-delivery`, `inline`, `script`, `plugin`) to `SkillManifest` in `internal/skill/types.go`
- [x] 1.2 Add `InlineSpec` struct with `Handler` and `Parameters` fields
- [x] 1.3 Add `ScriptSpec` struct with `Command`, `Args`, `Input`, `Output`, `Timeout` fields
- [x] 1.4 Add `Inline *InlineSpec` and `Script *ScriptSpec` fields to `SkillManifest`
- [x] 1.5 Add manifest validation: `inline` requires `inline.handler`; `script` requires `script.command`; `plugin` returns "not yet supported" error
- [x] 1.6 Add validation: `script` execution only allowed for instance-local skills (not embedded/framework)
- [x] 1.7 Add validation warning when `inline`/`script` block present on `prompt-delivery` skill
- [x] 1.8 Write unit tests for manifest parsing with new fields
- [x] 1.9 Write unit tests for validation of inline and script constraints

## 2. Skill Builder Agent (Prompt-Delivery)

- [x] 2.1 Create `skill-builder` agent manifest (`agent.yaml`) with description, phase, and required skills
- [x] 2.2 Create `skill-builder` agent prompt with guided workflow:
  - [x] 2.2.1 Task analysis: understand what the user wants to automate, determine execution mode (prompt-delivery, script, or plugin)
  - [x] 2.2.2 Manifest generation: produce `skill.yaml` with correct execution mode, parameters, required artifacts
  - [x] 2.2.3 Script scaffolding: generate a starter script in the user's preferred language with JSON stdin/stdout contract
  - [x] 2.2.4 Plugin scaffolding: generate Go module scaffold with CLI contract (`list-skills`, `execute`), Makefile, release workflow
  - [x] 2.2.5 Test harness: generate a test script that verifies the skill works (sends sample JSON, validates output)
  - [x] 2.2.6 Wiring: place files in correct instance directory, verify skill appears in `epf_list_skills`
- [x] 2.3 Create `skill-building` skill manifest (`skill.yaml`) with type, keywords, required tools
- [x] 2.4 Create `skill-building` skill prompt (`prompt.md`) with:
  - [x] 2.4.1 JSON stdin/stdout contract reference and examples
  - [x] 2.4.2 Script templates for Python, TypeScript, and bash
  - [x] 2.4.3 Plugin pack Go scaffold template
  - [x] 2.4.4 Testing and debugging guidance
- [x] 2.5 Embed agent and skill in epf-cli for distribution
- [x] 2.6 Test: agent recommender finds skill-builder for tasks like "create a custom skill", "build a script skill"

## 3. Compute Package (Go)

- [x] 3.1 Create `internal/compute/` package with `SkillHandler` interface and `Registry`
- [x] 3.2 Define `ExecutionResult` and `ExecutionLog` types
- [x] 3.3 Implement value-model-preview handler in `internal/compute/valuemodel/preview.go`
  - [x] 3.3.1 Load value models via existing `internal/valuemodel/` loader
  - [x] 3.3.2 Process embedded HTML template with Go `html/template`
  - [x] 3.3.3 Run validator checks (HTML structure, placeholder replacement, self-contained)
  - [x] 3.3.4 Return rendered HTML as ExecutionResult
- [x] 3.4 Write unit tests for value-model-preview with real YAML fixtures
- [x] 3.5 Implement balance-checker handler in `internal/compute/balance/checker.go`
  - [x] 3.5.1 Load roadmap via existing `internal/roadmap/` loader
  - [x] 3.5.2 Implement KR counting and portfolio balance scoring
  - [x] 3.5.3 Implement dependency graph construction from cross_track_dependencies
  - [x] 3.5.4 Implement cycle detection (DFS) and critical path calculation (topological sort)
  - [x] 3.5.5 Implement resource viability scoring (capacity vs. utilization)
  - [x] 3.5.6 Implement weighted overall score calculation
  - [x] 3.5.7 Return structured scoring data as ExecutionResult
- [x] 3.6 Write unit tests for balance-checker with real roadmap YAML fixtures

## 4. Script Execution (Go)

- [x] 4.1 Implement script executor in `internal/compute/script.go`
  - [x] 4.1.1 Resolve command (absolute, relative to skill dir, or PATH lookup)
  - [x] 4.1.2 Build JSON input (instance_path, parameters, skill_dir)
  - [x] 4.1.3 Spawn subprocess via `os/exec`, pipe JSON to stdin
  - [x] 4.1.4 Read JSON ExecutionResult from stdout
  - [x] 4.1.5 Enforce timeout (context.WithTimeout, default 30s)
  - [x] 4.1.6 Handle errors (command not found, non-zero exit, invalid JSON, timeout)
- [x] 4.2 Write unit tests for script executor with a test script
- [x] 4.3 Verify script execution only works for instance-local skills

## 5. MCP Server Changes (Go)

- [x] 5.1 Register `epf_execute_skill` tool in `internal/mcp/server.go`
- [x] 5.2 Implement `handleExecuteSkill` in `internal/mcp/skill_tools.go`
  - [x] 5.2.1 Look up skill, check execution mode (`inline`, `script`, or reject)
  - [x] 5.2.2 For `inline`: look up registered handler from compute registry, execute
  - [x] 5.2.3 For `script`: invoke script executor
  - [x] 5.2.4 Return ExecutionResult
- [x] 5.3 Update `handleGetSkill` to return redirection instructions for `inline` and `script` skills
- [x] 5.4 Update `handleListSkills` to include `execution` mode in listing response
- [x] 5.5 Register compute handlers during server initialization
- [ ] 5.6 Write unit tests for handleExecuteSkill (inline and script paths)
- [ ] 5.7 Write unit tests for handleGetSkill redirection behavior

## 6. Skill Manifest Updates

- [x] 6.1 Update `value-model-preview/skill.yaml` to add `execution: inline` and `inline.handler`
- [x] 6.2 Update `balance-checker/skill.yaml` to add `execution: inline` and `inline.handler`
- [x] 6.3 Verify both skills still appear correctly in `epf_list_skills`

## 7. Integration Testing

- [x] 7.1 End-to-end test: `epf_execute_skill` with value-model-preview on test instance
- [x] 7.2 End-to-end test: `epf_execute_skill` with balance-checker on test instance
- [x] 7.3 End-to-end test: `epf_execute_skill` with a script skill on test instance
- [x] 7.4 End-to-end test: `epf_get_skill` returns redirection for inline skills
- [x] 7.5 End-to-end test: `epf_execute_skill` rejects prompt-delivery skills
- [x] 7.6 End-to-end test: script skill timeout enforcement
- [x] 7.7 End-to-end test: skill-builder agent recommends correctly for extension tasks
- [x] 7.8 Run full `go test ./...` suite

## 8. Documentation

- [x] 8.1 Update `AGENTS.md` with inline and script execution documentation
- [x] 8.2 Update `.opencode/instructions.md` with `epf_execute_skill` tool reference
- [x] 8.3 Add script skill authoring guide (JSON stdin/stdout contract, example in Python) -- included in skill-builder agent prompt

## 9. Plugin System (Phase 2, deferred)

- [ ] 9.1 Implement `epf-pack-*` binary discovery on PATH
- [ ] 9.2 Implement `list-skills` / `execute` CLI contract
- [ ] 9.3 Register plugin skills in discovery system with `source: plugin`
- [ ] 9.4 Route `epf_execute_skill` to plugin subprocess for `execution: plugin` skills
- [ ] 9.5 Create example plugin pack scaffold
