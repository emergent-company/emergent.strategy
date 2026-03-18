## Phase 1: Consolidate and Remove (~94 → ~55 tools)

### 1.1 Remove Legacy Generator Tools (5 tools)
- [ ] 1.1.1 Remove `epf_list_generators` from MCP registration
- [ ] 1.1.2 Remove `epf_get_generator` from MCP registration
- [ ] 1.1.3 Remove `epf_check_generator_prereqs` from MCP registration
- [ ] 1.1.4 Remove `epf_scaffold_generator` from MCP registration
- [ ] 1.1.5 Remove `epf_validate_generator_output` from MCP registration
- [ ] 1.1.6 Add `EPF_LEGACY_TOOLS=true` env var to re-enable during transition
- [ ] 1.1.7 Update AGENTS.md to reference skill tools instead of generator tools

### 1.2 Remove Review Tool Wrappers (4 tools)
- [ ] 1.2.1 Remove `epf_review_strategic_coherence` (alias for `epf_get_wizard("strategic_coherence_review")`)
- [ ] 1.2.2 Remove `epf_review_feature_quality` (alias for `epf_get_wizard("feature_quality_review")`)
- [ ] 1.2.3 Remove `epf_review_value_model` (alias for `epf_get_wizard("value_model_review")`)
- [ ] 1.2.4 Remove `epf_recommend_reviews` (convenience wrapper)

### 1.3 Consolidate Validation Tools (remove 3, keep 3)
- [ ] 1.3.1 Add `mode` parameter to `epf_validate_file`: `file` (default), `plan`, `section`
- [ ] 1.3.2 Add `content` parameter to `epf_validate_file` for inline content validation
- [ ] 1.3.3 Remove standalone `epf_validate_with_plan` (now `mode=plan`)
- [ ] 1.3.4 Remove standalone `epf_validate_section` (now `section` param)
- [ ] 1.3.5 Remove standalone `epf_validate_content` (now `content` param)
- [ ] 1.3.6 Keep `epf_validate_relationships` (separate concern)
- [ ] 1.3.7 Keep `epf_batch_validate` (directory-level validation with summary)
- [ ] 1.3.8 Keep `epf_validate_skill_output` (skill-specific validation)

### 1.4 Consolidate Catalog/Browse Tools (remove 2, keep 1)
- [ ] 1.4.1 Create `epf_browse` tool with `what` param: `schemas`, `artifacts`, `phase`
- [ ] 1.4.2 Remove standalone `epf_list_schemas`
- [ ] 1.4.3 Remove standalone `epf_get_phase_artifacts`
- [ ] 1.4.4 Keep `epf_list_artifacts` (rename to `epf_browse` with backward compat)

### 1.5 Move Rare Operations to CLI-Only (8 tools)
- [ ] 1.5.1 Remove `epf_migrate_definitions` from MCP (keep CLI command)
- [ ] 1.5.2 Remove `epf_sync_canonical` from MCP (keep CLI command)
- [ ] 1.5.3 Remove `epf_generate_report` from MCP (keep CLI command)
- [ ] 1.5.4 Remove `epf_import_agent` from MCP (keep CLI command)
- [ ] 1.5.5 Remove `epf_import_skill` from MCP (keep CLI command)
- [ ] 1.5.6 Remove `epf_reload_instance` from MCP (make automatic on file change)
- [ ] 1.5.7 Remove `epf_detect_artifact_type` from MCP (built into validate)
- [ ] 1.5.8 Remove `epf_check_migration_status` from MCP (subset of migration_guide)

### 1.6 Remove Health Check Subsets (3 tools)
- [ ] 1.6.1 Remove `epf_check_instance` (subset of `epf_health_check`)
- [ ] 1.6.2 Remove `epf_check_content_readiness` (subset of `epf_health_check`)
- [ ] 1.6.3 Remove `epf_check_feature_quality` (subset of `epf_health_check`)

### 1.7 Consolidate Smaller Tool Groups (5 tools)
- [ ] 1.7.1 Merge `epf_aim_init_cycle` + `epf_aim_archive_cycle` → `epf_aim_cycle` with `action` param
- [ ] 1.7.2 Remove `epf_aim_health` (fold into `epf_health_check`)
- [ ] 1.7.3 Merge `epf_diff_artifacts` + `epf_diff_template` → `epf_diff` with `mode` param
- [ ] 1.7.4 Merge `epf_add_value_model_component` + `epf_add_value_model_sub` → `epf_add_value_model_node`
- [ ] 1.7.5 Remove `epf_list_agent_skills` (redundant — agent response includes skills)

### 1.8 Consolidate Agent Discovery (2 tools)
- [ ] 1.8.1 Merge `epf_list_agent_instructions` + `epf_get_agent_instructions` → `epf_agent_instructions` with optional `name` param
- [ ] 1.8.2 Remove standalone `epf_list_agent_instructions`

### 1.9 Update Documentation
- [ ] 1.9.1 Update AGENTS.md with new tool names and consolidated parameters
- [ ] 1.9.2 Update openspec/specs/epf-cli-mcp/spec.md with revised tool inventory
- [ ] 1.9.3 Update opencode-epf plugin if it references removed tools

## Phase 2: Router Tool and Description Quality

### 2.1 Router Tool
- [ ] 2.1.1 Create `internal/mcp/router.go` with task→tool routing table
- [ ] 2.1.2 Define routing patterns: regex patterns → tool name + default params
- [ ] 2.1.3 Register `epf` router tool (or `epf_help` — decide naming)
- [ ] 2.1.4 Include routing for all ~55 remaining tools
- [ ] 2.1.5 Return confidence, reasoning, and alternatives
- [ ] 2.1.6 Test routing with 20+ common task descriptions

### 2.2 Description Rewrite
- [ ] 2.2.1 Define description format: `[Category] USE WHEN <trigger>. <what>. <constraint>.`
- [ ] 2.2.2 Rewrite all ~55 tool descriptions in the new format
- [ ] 2.2.3 Add category prefixes: [Validate], [Query], [Write], [AIM], [Semantic], [Manage]
- [ ] 2.2.4 Test with multiple LLMs (Claude, GPT-4, Gemini) for tool selection accuracy

### 2.3 Validation
- [ ] 2.3.1 Run full test suite — all existing tests must pass
- [ ] 2.3.2 Manual testing: exercise the consolidated tools with real EPF instances
- [ ] 2.3.3 Verify `EPF_LEGACY_TOOLS=true` re-enables removed tools
- [ ] 2.3.4 Test router tool accuracy on 20+ task descriptions

## Phase 3: Context-Aware Filtering (Future)

### 3.1 Agent-Scoped Tools
- [ ] 3.1.1 Design agent→tool scoping manifest format
- [ ] 3.1.2 Implement dynamic tool filtering when agent is activated
- [ ] 3.1.3 Verify scoped tool count per agent (target: 10-15 per agent)

### 3.2 Context-Aware Registration
- [ ] 3.2.1 Only register semantic tools when Memory API is configured
- [ ] 3.2.2 Only register AIM tools when AIM directory exists
- [ ] 3.2.3 Only register multi-tenant tools when in multi-tenant mode
