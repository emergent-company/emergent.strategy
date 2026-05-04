## Phase A: Strategic Index Migration + Agent Identity

- [ ] A.1 Create migration 002 adding `strategy_artifacts` table with indexes
- [ ] A.2 Create migration 002 adding `strategy_relationships` table with indexes
- [ ] A.3 Create migration 002 adding `agent_id TEXT` and `batch_description TEXT` columns to `strategy_mutations`
- [ ] A.4 Implement `ExtractArtifactFields` — extract name, status, track from payload by artifact type
- [ ] A.5 Implement `ExtractRelationships` — pure function extracting cross-artifact references from payload by artifact type
- [ ] A.6 Modify `CommitBatch` to upsert `strategy_artifacts` and replace `strategy_relationships` on commit
- [ ] A.7 Handle archive action in `CommitBatch` — set `status='archived'` in `strategy_artifacts`, remove relationships
- [ ] A.8 Migrate read operations (`GetCurrentArtifact`, `ListCurrentArtifacts`) to query `strategy_artifacts`
- [ ] A.9 Update import command to trigger derivation after committing imported mutations
- [ ] A.10 Implement backfill function to re-derive artifacts and relationships from existing committed mutations
- [ ] A.11 Add `since_mutation_id` cursor parameter to `ListMutations` for agent polling
- [ ] A.12 Implement `ListPendingBatches(instanceID)` — returns all staged batches with agent_id and description
- [ ] A.13 Write unit tests for `ExtractRelationships` covering all source artifact types
- [ ] A.14 Write integration tests for commit-time derivation (upsert + relationship replace)
- [ ] A.15 Verify all existing 13 MCP test scenarios still pass

## Phase B: Embedded Content

- [ ] B.1 Create `apps/strategy-server/scripts/sync-embedded.sh` mirroring epf-cli's script
- [ ] B.2 Create `apps/strategy-server/internal/embedded/` with `go:embed` directives for schemas, templates, agents, skills, wizards, generators
- [ ] B.3 Implement accessor functions: `ListSchemas`, `GetSchema`
- [ ] B.4 Implement accessor functions: `ListTemplates`, `GetTemplate` (parse YAML, return as JSON)
- [ ] B.5 Implement accessor functions: `ListAgents`, `GetAgent`
- [ ] B.6 Implement accessor functions: `ListSkills`, `GetSkill`
- [ ] B.7 Implement accessor functions: `ListWizards`, `GetWizard`
- [ ] B.8 Implement accessor functions: `ListGenerators`, `GetGenerator`
- [ ] B.9 Run sync script and verify MANIFEST.txt matches epf-cli's canonical-epf version
- [ ] B.10 Add `sync-embedded` task to Taskfile.yml
- [ ] B.11 Write unit tests for all accessor functions

## Phase B+: Agent Runtime MCP Tools

- [ ] B+.1 Register `list_pending_batches` MCP tool (staged batches waiting for human review)
- [ ] B+.2 Register `describe_batch` MCP tool (attach agent_id and description to a staged batch)
- [ ] B+.3 Update `list_mutations` MCP tool to expose `since_mutation_id` parameter
- [ ] B+.4 Add integration tests for agent identity round-trip (stage with agent_id → list_pending_batches → commit → audit log)

## Phase C: Embedded Knowledge MCP Tools

- [ ] C.1 Register `list_schemas` and `get_schema` MCP tools
- [ ] C.2 Register `list_templates` and `get_template` MCP tools
- [ ] C.3 Register `list_agents` and `get_agent` MCP tools
- [ ] C.4 Register `list_skills` and `get_skill` MCP tools
- [ ] C.5 Register `execute_skill` MCP tool (computational skills only; prompt-delivery returns error)
- [ ] C.6 Register `list_wizards` and `get_wizard` MCP tools
- [ ] C.7 Register `list_generators` and `get_generator` MCP tools
- [ ] C.8 Register `get_agent_for_task` routing tool
- [ ] C.9 Register `get_wizard_for_task` routing tool
- [ ] C.10 Add integration tests for all embedded knowledge tools
- [ ] C.11 Verify tool count increased from 26 to ~41

## Phase D: Expanded Write Tools

- [ ] D.1 Add domain service methods for READY artifact types: persona, competitive_position, brand_voice, design_principles
- [ ] D.2 Add domain service methods for FIRE artifact types: roadmap, okrs, value_model, user_journeys, assumptions
- [ ] D.3 Register `create_persona` and `update_persona` MCP tools
- [ ] D.4 Register `update_competitive_position` MCP tool
- [ ] D.5 Register `update_roadmap` and `update_okrs` MCP tools
- [ ] D.6 Register `update_value_model` MCP tool
- [ ] D.7 Register `update_assumptions` MCP tool
- [ ] D.8 Register `update_brand_voice` and `update_design_principles` MCP tools
- [ ] D.9 Register `create_user_journey` and `update_user_journey` MCP tools
- [ ] D.10 Register `batch_create_artifacts` for multi-artifact staging
- [ ] D.11 Add integration tests for all expanded write tools
- [ ] D.12 Verify all writes follow staged batch pattern and trigger artifact/relationship derivation on commit

## Phase E: Derived Read Tools

- [ ] E.1 Register `get_persona_detail` — single persona with pain points and feature connections via `strategy_relationships`
- [ ] E.2 Register `get_value_propositions` — cross-feature value prop summary from `strategy_artifacts`
- [ ] E.3 Register `get_strategic_context_for_feature` — feature-centric strategic view via `strategy_relationships`
- [ ] E.4 Register `explain_value_path` — trace value chain from feature to north star via `strategy_relationships`
- [ ] E.5 Register `get_coverage_analysis` — persona x feature coverage matrix via `strategy_relationships`
- [ ] E.6 Register `get_roadmap_detail` — roadmap with OKR linkage from `strategy_artifacts`
- [ ] E.7 Register `get_okr_detail` — single OKR with key results and linked features via `strategy_relationships`
- [ ] E.8 Register `get_assumptions` — assumptions list with validation status from `strategy_artifacts`
- [ ] E.9 Add integration tests for all derived read tools

## Phase F: Validation and Export Tools

- [ ] F.1 Implement JSON schema validator in `internal/embedded/validator.go` using `santhosh-tekuri/jsonschema`
- [ ] F.2 Implement artifact type auto-detection from payload structure
- [ ] F.3 Register `validate_artifact` MCP tool (auto-detect type, validate against schema)
- [ ] F.4 Register `validate_instance` MCP tool (full instance health check via `strategy_artifacts`)
- [ ] F.5 Register `validate_relationships` MCP tool (cross-artifact reference integrity via `strategy_relationships`)
- [ ] F.6 Register `check_content_readiness` MCP tool (content quality scoring)
- [ ] F.7 Implement YAML export in `domain/strategy/export.go`
- [ ] F.8 Register `export_instance_yaml` MCP tool (DB -> EPF YAML directory structure)
- [ ] F.9 Register `export_feature_yaml` MCP tool (single feature export)
- [ ] F.10 Register `export_report` MCP tool (formatted strategy report)
- [ ] F.11 Add integration tests for all validation and export tools

## Phase G: AIM Lifecycle Tools

- [ ] G.1 Confirm AIM artifact types are handled in `ExtractArtifactFields` and `ExtractRelationships`
- [ ] G.2 Add domain service methods for AIM lifecycle (lra, aim_report, aim_trigger_config)
- [ ] G.3 Register `create_lra` MCP tool (launch readiness assessment)
- [ ] G.4 Register `update_lra` MCP tool (update LRA status and findings)
- [ ] G.5 Register `get_lra` MCP tool (read current LRA state from `strategy_artifacts`)
- [ ] G.6 Register `create_aim_report` MCP tool (post-launch assessment report)
- [ ] G.7 Register `get_aim_summary` MCP tool (AIM phase overview from `strategy_artifacts`)
- [ ] G.8 Add integration tests for all AIM lifecycle tools
- [ ] G.9 Verify final tool count is ~76 (73 + list_pending_batches, describe_batch, updated list_mutations)

## Exit Gate

- [ ] H.1 All integration tests pass (`go test ./...` in strategy-server)
- [ ] H.2 Tool count verified at ~76 via `tools/list` MCP call
- [ ] H.3 Embedded content VERSION matches canonical-epf in epf-cli
- [ ] H.4 No regressions in existing 13 MCP test scenarios
- [ ] H.5 `strategy_artifacts` and `strategy_relationships` populated correctly for imported emergent instance
