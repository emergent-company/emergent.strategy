## Phase 1: Remove Redundancies + Description Rewrite (~94 → ~72 tools)

Zero breaking changes. Every removed tool has an exact equivalent.

### 1.1 Remove Review Tool Wrappers (4 tools)
- [ ] 1.1.1 Remove `epf_review_strategic_coherence` from MCP registration
- [ ] 1.1.2 Remove `epf_review_feature_quality` from MCP registration
- [ ] 1.1.3 Remove `epf_review_value_model` from MCP registration
- [ ] 1.1.4 Remove `epf_recommend_reviews` from MCP registration
- [ ] 1.1.5 Update AGENTS.md references: replace `epf_review_*` → `epf_get_wizard("..._review")`

### 1.2 Remove Health Check Subsets (3 tools)
- [ ] 1.2.1 Remove `epf_check_instance` from MCP registration
- [ ] 1.2.2 Remove `epf_check_content_readiness` from MCP registration
- [ ] 1.2.3 Remove `epf_check_feature_quality` from MCP registration
- [ ] 1.2.4 Verify `epf_health_check` output includes all data these tools returned

### 1.3 Remove Utility Tools With No Standalone Value (5 tools)
- [ ] 1.3.1 Remove `epf_detect_artifact_type` (already built into `epf_validate_file`)
- [ ] 1.3.2 Remove `epf_check_migration_status` (strict subset of `epf_get_migration_guide`)
- [ ] 1.3.3 Remove `epf_reload_instance` (make automatic on file change detection)
- [ ] 1.3.4 Remove `epf_list_agent_skills` (redundant — `epf_get_agent` response includes skills)
- [ ] 1.3.5 Fold `epf_list_agent_instructions` into `epf_agent_instructions` with optional `name` param

### 1.4 Move One-Time Operations to CLI-Only (4 tools)
- [ ] 1.4.1 Remove `epf_migrate_definitions` from MCP (keep `epf-cli migrate-definitions` CLI command)
- [ ] 1.4.2 Remove `epf_sync_canonical` from MCP (keep `epf-cli sync-canonical` CLI command)
- [ ] 1.4.3 Remove `epf_generate_report` from MCP (keep `epf-cli report` CLI command)
- [ ] 1.4.4 Remove `epf_check_generator_prereqs` from MCP (already checked by `epf_get_generator`)

### 1.5 Rewrite All Tool Descriptions
- [ ] 1.5.1 Define category list: [Validate], [Health], [Query], [Write], [AIM], [Semantic], [Agent], [Wizard], [Skill], [Generator], [Instance], [Diff], [Audit]
- [ ] 1.5.2 Rewrite descriptions for validation tools (epf_validate_file, epf_validate_content, epf_validate_with_plan, epf_validate_section, epf_batch_validate, epf_validate_relationships, epf_validate_skill_output, epf_validate_generator_output)
- [ ] 1.5.3 Rewrite descriptions for health/instance tools (epf_health_check, epf_locate_instance, epf_init_instance, epf_fix_file)
- [ ] 1.5.4 Rewrite descriptions for wizard tools (epf_list_wizards, epf_get_wizard, epf_get_wizard_for_task)
- [ ] 1.5.5 Rewrite descriptions for agent tools (epf_list_agents, epf_get_agent, epf_get_agent_for_task, epf_scaffold_agent, epf_import_agent)
- [ ] 1.5.6 Rewrite descriptions for skill tools (epf_list_skills, epf_get_skill, epf_scaffold_skill, epf_import_skill, epf_check_skill_prereqs, epf_validate_skill_output)
- [ ] 1.5.7 Rewrite descriptions for generator tools (epf_list_generators, epf_get_generator, epf_scaffold_generator, epf_validate_generator_output)
- [ ] 1.5.8 Rewrite descriptions for strategy query tools (8 tools)
- [ ] 1.5.9 Rewrite descriptions for strategy context tools (8 tools)
- [ ] 1.5.10 Rewrite descriptions for AIM tools (10 tools)
- [ ] 1.5.11 Rewrite descriptions for relationship maintenance tools (4 tools)
- [ ] 1.5.12 Rewrite descriptions for value model write tools (3 tools)
- [ ] 1.5.13 Rewrite descriptions for diff/report tools (2 tools)
- [ ] 1.5.14 Rewrite descriptions for semantic engine tools (4 tools)
- [ ] 1.5.15 Rewrite descriptions for audit tools (2 tools)
- [ ] 1.5.16 Verify all triggers are unique — no two tools have the same USE WHEN

### 1.6 Enhance Existing Router
- [ ] 1.6.1 Extend `epf_get_agent_for_task` to return `direct_tool` + `parameters` when no agent activation needed
- [ ] 1.6.2 Add tool routing patterns for common tasks (validate, search, create feature, check health, etc.)
- [ ] 1.6.3 Return `direct_tool` with high confidence for unambiguous tasks

### 1.7 Update Documentation
- [ ] 1.7.1 Update AGENTS.md tool inventory and references to removed tools
- [ ] 1.7.2 Update AGENTS.md tool discovery section with new description format
- [ ] 1.7.3 Update openspec/specs/epf-cli-mcp/spec.md with revised tool inventory
- [ ] 1.7.4 Check all wizard/agent prompts for references to removed tools

### 1.8 Test
- [ ] 1.8.1 Run full test suite — all existing tests must pass
- [ ] 1.8.2 Manual test: verify each removed tool's functionality via its equivalent
- [ ] 1.8.3 Test description quality: give 10 common tasks to an LLM with the new descriptions, verify tool selection accuracy

## Phase 2: Targeted Consolidation (~72 → ~66 tools)

Only merge tools that share implementation and have obvious parameter semantics.

### 2.1 Merge AIM Cycle Tools
- [ ] 2.1.1 Create `epf_aim_cycle` with `action` param (`init` or `archive`)
- [ ] 2.1.2 Remove `epf_aim_init_cycle` and `epf_aim_archive_cycle`

### 2.2 Merge Diff Tools
- [ ] 2.2.1 Create `epf_diff` with `mode` param (`artifacts` or `template`)
- [ ] 2.2.2 Remove `epf_diff_artifacts` and `epf_diff_template`

### 2.3 Merge Value Model Write Tools
- [ ] 2.3.1 Create `epf_add_value_model_node` with `level` param (`component` or `sub_component`)
- [ ] 2.3.2 Remove `epf_add_value_model_component` and `epf_add_value_model_sub`

### 2.4 Fold AIM Health Into Health Check
- [ ] 2.4.1 Add AIM diagnostics to `epf_health_check` output
- [ ] 2.4.2 Remove `epf_aim_health`

### 2.5 Context-Aware Registration
- [ ] 2.5.1 Only register semantic tools when `EPF_MEMORY_URL` is set
- [ ] 2.5.2 Only register `epf_list_workspaces` in multi-tenant mode
- [ ] 2.5.3 Only register `epf_aim_*` tools when AIM directory exists in the instance

## Phase 3: Agent-Scoped Tools (Future)

### 3.1 Design
- [ ] 3.1.1 Define agent→tool scoping manifest format (which tools each agent needs)
- [ ] 3.1.2 Design MCP dynamic tool registration or description modification

### 3.2 Implementation
- [ ] 3.2.1 Implement tool filtering when agent is activated
- [ ] 3.2.2 Verify scoped tool count per agent (target: 10-15 per agent)
- [ ] 3.2.3 Test with multiple agents to ensure no needed tool is accidentally scoped out
