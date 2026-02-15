# Tasks: Add Wizard/Prompt Support to epf-cli

**Proposal:** [proposal.md](./proposal.md)
**Status:** Complete ✅

---

## Overview

Add wizard/prompt delivery capabilities to epf-cli, enabling AI agents to discover and retrieve EPF workflow guidance dynamically through MCP tools and CLI commands.

---

## Phase 1: Core Package Structure

### 1.1 Create wizard package types

- [x] Create `internal/wizard/types.go`
  - [x] Define `WizardType` enum (agent_prompt, wizard, ready_sub_wizard)
  - [x] Define `WizardInfo` struct with metadata fields
  - [x] Define `WizardRecommendation` struct for task matching
  - [x] Add constants for wizard file patterns

### 1.2 Implement wizard loader

- [x] Create `internal/wizard/loader.go`
  - [x] `NewLoader(epfRoot string) *Loader`
  - [x] `Load() error` - scan wizards directory
  - [x] `ListWizards(phase, wizardType) []*WizardInfo`
  - [x] `GetWizard(name string) (*WizardInfo, error)`
  - [x] `GetWizardByFile(path string) (*WizardInfo, error)`
  - [x] Handle missing wizards directory gracefully

### 1.3 Implement metadata parser

- [x] Create `internal/wizard/parser.go`
  - [x] Parse purpose from first heading/paragraph
  - [x] Parse trigger phrases from "When to Use" sections
  - [x] Parse duration from tables or inline mentions
  - [x] Parse outputs from "What you'll create" sections
  - [x] Parse related wizards from content references
  - [x] Detect wizard type from filename pattern

---

## Phase 2: Task-to-Wizard Matching

### 2.1 Implement recommender

- [x] Create `internal/wizard/recommender.go`
  - [x] `NewRecommender(loader *Loader) *Recommender`
  - [x] `RecommendForTask(task string) (*Recommendation, error)`
  - [x] Implement trigger phrase matching (exact, contains)
  - [x] Implement keyword matching (feature, roadmap, assess, etc.)
  - [x] Implement phase detection from task description
  - [x] Return confidence level (high, medium, low)
  - [x] Return alternatives when multiple matches

### 2.2 Define keyword mappings

- [x] Map common keywords to wizards:
  - [x] "feature", "create feature" → feature_definition, product_architect
  - [x] "roadmap", "planning" → pathfinder, lean_start
  - [x] "trend", "market" → 01_trend_scout
  - [x] "validate", "check" → balance_checker
  - [x] "assess", "retrospective" → synthesizer
  - [x] "start", "begin", "new" → start_epf

---

## Phase 3: Agent Instructions Support

### 3.1 Add agent instructions loader

- [x] Extend loader or create separate loader for:
  - [x] `AGENTS.md` - Full agent instructions
  - [x] `.github/copilot-instructions.md` - Quick reference
  - [x] `.ai-agent-instructions.md` - Maintenance protocol
- [x] Parse purpose/scope from content

---

## Phase 4: MCP Tools Implementation

### 4.1 Add epf_list_wizards tool

- [x] Add to `internal/mcp/server.go`
- [x] Parameters: `phase` (optional), `type` (optional)
- [x] Return: List of wizards with metadata (name, type, phase, purpose, duration, triggers)
- [x] Group by phase in human-readable output

### 4.2 Add epf_get_wizard tool

- [x] Add to `internal/mcp/server.go`
- [x] Parameters: `name` (required)
- [x] Return: Full wizard content + metadata
- [x] Include related_templates, related_schemas, related_wizards
- [x] Provide helpful error with available wizards on not found

### 4.3 Add epf_get_wizard_for_task tool

- [x] Add to `internal/mcp/server.go`
- [x] Parameters: `task` (required)
- [x] Return: Recommended wizard with confidence and reason
- [x] Include alternatives array
- [x] Provide guidance for ambiguous tasks

### 4.4 Add epf_list_agent_instructions tool

- [x] Add to `internal/mcp/server.go`
- [x] Return: List of instruction files with purpose and scope

### 4.5 Add epf_get_agent_instructions tool

- [x] Add to `internal/mcp/server.go`
- [x] Parameters: `name` (required)
- [x] Return: Full instruction file content

### 4.6 Initialize wizard loader in server

- [x] Add `wizardLoader *wizard.Loader` to Server struct
- [x] Initialize in `NewServer()`
- [x] Handle missing wizards directory gracefully (optional feature)

---

## Phase 5: CLI Commands

### 5.1 Add wizards command group

- [x] Create `cmd/wizards.go`
- [x] Add `epf-cli wizards list` subcommand
  - [x] `--phase` flag for filtering
  - [x] `--type` flag for filtering
  - [x] `--json` flag for JSON output
- [x] Add `epf-cli wizards show <name>` subcommand
  - [x] `--json` flag for JSON output
  - [x] `--content-only` flag for raw content
- [x] Add `epf-cli wizards recommend <task>` subcommand
  - [x] Show recommended wizard with reason
  - [x] Show alternatives
- [x] Add `epf-cli wizards instructions` subcommand
  - [x] List agent instruction files

### 5.2 Add agents command group

- [x] Consolidated into `wizards instructions` subcommand instead of separate command

---

## Phase 6: Testing

### 6.1 Unit tests

- [x] Create `internal/wizard/wizard_test.go`
  - [x] Test loading from valid wizards directory
  - [x] Test handling missing directory
  - [x] Test filtering by phase/type
  - [x] Test trigger phrase extraction
  - [x] Test duration extraction
  - [x] Test purpose extraction
  - [x] Test exact trigger matches
  - [x] Test keyword matching
  - [x] Test confidence levels

### 6.2 MCP protocol tests

- [ ] Add wizard tool tests to `internal/mcp/protocol_test.go` (optional follow-up)
  - [ ] Test epf_list_wizards
  - [ ] Test epf_get_wizard
  - [ ] Test epf_get_wizard_for_task
  - [ ] Test error handling

### 6.3 Integration tests

- [x] Test with real EPF wizards directory (manual testing completed)
- [x] Test recommendation accuracy with common tasks

---

## Phase 7: Documentation

### 7.1 Update AGENTS.md

- [x] Document new wizard tools in MCP tools section
- [x] Add wizard CLI commands documentation
- [x] Document wizard types and recommendation workflow

### 7.2 Update README.md

- [ ] Add wizard commands to CLI reference (optional follow-up)
- [ ] Add wizard tools to MCP tools section (optional follow-up)

---

## Dependencies

- **Requires:** EPF wizards directory at `docs/EPF/wizards/`
- **Requires:** Existing template/definition loader patterns for consistency
- **Blocks:** ProductFactoryOS dynamic wizard injection

---

## Acceptance Criteria

1. [x] All 17+ EPF wizards are discoverable via `epf_list_wizards`
2. [x] Each wizard's content is retrievable via `epf_get_wizard`
3. [x] Task recommendations work for common scenarios:
   - "create feature definition" → feature_definition or product_architect
   - "start epf" → start_epf
   - "analyze trends" → 01_trend_scout
   - "assess our progress" → synthesizer
4. [x] CLI commands work: `epf-cli wizards list`, `show`, `recommend`
5. [x] All tests pass: `go test ./...`
6. [x] Server starts without wizards directory (graceful degradation)

---

## Implementation Summary

**Files Created:**

- `internal/wizard/types.go` - Core types (WizardType, WizardInfo, Recommendation)
- `internal/wizard/parser.go` - Markdown metadata extraction
- `internal/wizard/loader.go` - Loads wizards and agent instructions
- `internal/wizard/recommender.go` - Task-to-wizard matching
- `internal/wizard/wizard_test.go` - Comprehensive tests
- `internal/mcp/wizard_tools.go` - MCP tool handlers
- `cmd/wizards.go` - CLI commands

**Files Modified:**

- `internal/mcp/server.go` - Added wizard loader and tool registration
- `AGENTS.md` - Documented wizard tools and CLI commands

**MCP Server Version:** 0.6.0 → 0.8.0

---

## Notes

- Follow existing patterns from `internal/template/loader.go` for consistency
- Wizard metadata parsing may need refinement as we learn wizard content patterns
- Consider adding YAML front matter to wizards in future for explicit metadata
- Recommender accuracy can be improved iteratively based on usage patterns
