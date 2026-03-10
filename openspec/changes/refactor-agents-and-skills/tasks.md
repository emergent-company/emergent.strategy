## 1. Research & Design Validation

- [ ] 1.1 Survey industry standards for AI agent/skill definitions (OpenAI Assistants API, Anthropic tool_use, Google Gemini function declarations, CrewAI skill format, LangGraph agent specs, AutoGen patterns) — document commonalities in design.md
- [ ] 1.2 Analyze all 20 existing wizard files: extract actual metadata used, classify by proposed agent vs skill, identify which should become agents, which should become skills, and which should become both
- [ ] 1.3 Analyze all 5 existing generator bundles: map current generator.yaml fields to proposed skill.yaml fields, identify gaps
- [ ] 1.4 Research MCP 2.0 Resources and Prompts primitives — verify Go library (mcp-go) support for `list_resources`, `read_resource`, `list_prompts`, `get_prompt`; document API surface and integration patterns
- [ ] 1.5 Research capability class / model-tier hinting patterns in existing agent frameworks (CrewAI delegation, AutoGen model config, LangChain model routing) — validate the `high-reasoning / balanced / fast-exec` taxonomy
- [ ] 1.6 Prototype `agent.yaml` schema — write JSON Schema, validate against 3 converted wizard examples (include capability class and tools fields)
- [ ] 1.7 Prototype `skill.yaml` schema — write JSON Schema, validate against 2 converted generators + 2 converted wizards (include capability class and scope fields)
- [ ] 1.8 Resolve open questions from design.md (sub-wizards, multi-step, composition, version compat, session init protocol)
- [ ] 1.9 Review decision with stakeholder and finalize agent.yaml / skill.yaml formats

## 2. Core Infrastructure (Phase 1)

- [ ] 2.1 Create `internal/agent/types.go` — AgentManifest, AgentInfo, AgentType structs
- [ ] 2.2 Create `internal/agent/loader.go` — three-tier loader with legacy format support (reads .agent_prompt.md as agents)
- [ ] 2.3 Create `internal/agent/recommender.go` — task-to-agent matching (evolve from wizard recommender)
- [ ] 2.4 Create `internal/skill/types.go` — SkillManifest, SkillInfo, SkillType structs
- [ ] 2.5 Create `internal/skill/loader.go` — three-tier loader with legacy format support (reads generator.yaml and .wizard.md)
- [ ] 2.6 Create `internal/skill/scaffold.go` — scaffold new skills (evolve from generator scaffold)
- [ ] 2.7 Create `internal/skill/validator.go` — validate skill outputs (evolve from generator validator)
- [ ] 2.8 Create `internal/skill/sharing.go` — copy/export/install skills (evolve from generator sharing)
- [ ] 2.9 Write unit tests for agent loader (legacy format reading, three-tier priority, manifest parsing)
- [ ] 2.10 Write unit tests for skill loader (legacy format reading, three-tier priority, manifest parsing)
- [ ] 2.11 Write backward compatibility tests for generator format: verify `generator.yaml` is read correctly as a skill, `wizard.instructions.md` is loaded as prompt, `{instance}/generators/` directory is scanned, all existing fields are preserved, `type: generation` is inferred
- [ ] 2.12 Write backward compatibility tests for scaffold: verify `epf_scaffold_generator` creates `generator.yaml` + `wizard.instructions.md` (not `skill.yaml` + `prompt.md`)
- [ ] 2.13 Write backward compatibility tests for sharing: verify generators exported in old format can be imported and work, verify generators in `generators/` override framework skills with same name

## 3. MCP Tool Registration & Primitives

- [ ] 3.1 Create `internal/mcp/agent_tools.go` — handlers for epf_list_agents, epf_get_agent, epf_get_agent_for_task, epf_scaffold_agent, epf_list_agent_skills
- [ ] 3.2 Create `internal/mcp/skill_tools.go` — handlers for epf_list_skills, epf_get_skill, epf_scaffold_skill, epf_check_skill_prereqs, epf_validate_skill_output
- [ ] 3.3 Implement MCP Resources: register `list_resources` and `read_resource` handlers exposing skills as `strategy://skills/{name}` URIs with lazy-loaded content
- [ ] 3.4 Implement MCP Prompts: register `list_prompts` and `get_prompt` handlers exposing agents as persona templates with optional instance context injection
- [ ] 3.5 Register new tools in server.go alongside old tools (aliases)
- [ ] 3.6 Update tool descriptions for new tools with POST-CONDITIONs and directives
- [ ] 3.7 Update tool_suggestions.go with new tool names in suggestion mappings
- [ ] 3.8 Write MCP tool and primitives integration tests

## 4. CLI Commands

- [ ] 4.1 Create `cmd/agents.go` — agents list, agents show, agents recommend, agents scaffold
- [ ] 4.2 Create `cmd/skills.go` — skills list, skills show, skills check, skills scaffold, skills validate, skills copy, skills export, skills install
- [ ] 4.3 Add aliases for old commands (wizards -> agents, generators -> skills)
- [ ] 4.4 Write CLI command tests

## 5. Embedded Content & Build

- [ ] 5.1 Update `internal/embedded/embedded.go` — add agents embed.FS alongside existing wizards embed.FS
- [ ] 5.2 Update `scripts/sync-embedded.sh` — support syncing from agents/ and skills/ directories (with fallback to wizards/ and outputs/)
- [ ] 5.3 Update MANIFEST.txt generation for new directory structure
- [ ] 5.4 Verify build with both old and new canonical-epf structures

## 6. Standalone Mode & Plugin Detection

- [ ] 6.1 Implement plugin detection in MCP server: read `EPF_PLUGIN_ACTIVE` env var, parse MCP ClientInfo for host name
- [ ] 6.2 Add `orchestration` section to `epf_agent_instructions` response: plugin_detected, standalone_mode, install_hint, what_you_gain, standalone_protocols
- [ ] 6.3 Add standalone prompt suffix to `epf_get_agent`: append self-enforcement protocols (validation, pre-commit, tool scope) when `standalone_mode: true`
- [ ] 6.4 Add tool scope text rendering to `epf_get_skill`: format `scope.preferred_tools` and `scope.avoid_tools` as text when `standalone_mode: true`
- [ ] 6.5 Update `tool_suggestions.go` with agent/skill-aware suggestions (e.g., after `epf_get_agent`, suggest `epf_get_skill` for required skills)
- [ ] 6.6 Add host registry with known hosts and available plugins (opencode → opencode-epf, cursor → future, claude-desktop → future)
- [ ] 6.7 Write tests for plugin detection (env var set, env var not set, known host, unknown host)
- [ ] 6.8 Write tests for standalone mode prompt adaptation (with plugin vs without)

## 7. Orchestration Plugin Updates (opencode-epf)

- [ ] 7.1 Add `shell.env` hook to set `EPF_PLUGIN_ACTIVE=opencode-epf@{version}` so MCP server can detect plugin presence
- [ ] 7.2 Add agent activation tool to opencode-epf: `epf_activate_agent` custom tool that calls `epf_get_agent_for_task` + injects system prompt via `experimental.chat.system.transform`
- [ ] 7.3 Add skill-aware file edit validation: detect when written file matches a skill's output pattern, auto-trigger validation
- [ ] 7.4 Add tool scoping via `tool.definition` hook: when a skill is active, modify tool descriptions to highlight preferred tools and de-emphasize avoided tools
- [ ] 7.5 Update `epf_dashboard` to show active agent/skills status alongside health
- [ ] 7.6 Update idle health toast to recommend relevant agent when issues are found
- [ ] 7.7 Document the agent activation protocol (Decision 12) for future platform plugin developers
- [ ] 7.8 Write tests for agent activation flow, skill-aware validation, and `EPF_PLUGIN_ACTIVE` env var setting

## 8. Documentation & Migration

- [ ] 8.1 Update AGENTS.md to reference agents/skills terminology (keep wizard/generator as secondary terms)
- [ ] 8.2 Write migration guide for canonical-epf maintainers
- [ ] 8.3 Update openspec/project.md with new architecture description
- [ ] 8.4 Update epf-cli-mcp spec with new tool requirements
- [ ] 8.5 Document three-layer architecture (CLI → MCP → Plugin) and when to use each layer
- [ ] 8.6 Write platform plugin development guide (how to build a Cursor/Claude Desktop EPF plugin using the activation protocol)
- [ ] 8.7 Document standalone vs plugin-assisted experience with comparison table
