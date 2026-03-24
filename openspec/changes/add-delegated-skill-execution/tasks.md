## 1. Skill Manifest Extension (Go)

- [ ] 1.1 Add `Execution` field (string enum: `prompt-delivery`, `delegated`, `inline`) to `SkillManifest` in `internal/skill/types.go`
- [ ] 1.2 Add `DelegateSpec` struct with `Server`, `Tool`, `InputMapping` fields
- [ ] 1.3 Add `Delegate *DelegateSpec` field to `SkillManifest`
- [ ] 1.4 Add manifest validation: `delegated` requires `delegate.server` + `delegate.tool`; `inline` returns "not yet supported" error
- [ ] 1.5 Add validation warning when `delegate` block present on `prompt-delivery` skill
- [ ] 1.6 Update skill manifest JSON Schema in `docs/EPF/_schemas/` (if applicable)
- [ ] 1.7 Write unit tests for manifest parsing with new fields
- [ ] 1.8 Write unit tests for validation of delegation constraints

## 2. MCP Server Changes (Go)

- [ ] 2.1 Update `handleGetSkill` in `internal/mcp/skill_tools.go` to check `execution` mode
- [ ] 2.2 For `delegated` skills, return delegation instructions instead of prompt content
- [ ] 2.3 Include input schema in delegation response if available
- [ ] 2.4 Update `handleListSkills` to include `execution` mode in listing response
- [ ] 2.5 Update skill recommender to work with delegated skills (keyword matching on manifest)
- [ ] 2.6 Write unit tests for delegated skill response format
- [ ] 2.7 Write integration tests for end-to-end delegated skill flow

## 3. Companion MCP Server Scaffold (TypeScript)

- [ ] 3.1 Create `packages/epf-agents/` directory structure
- [ ] 3.2 Set up `package.json` with Bun, MCP SDK, and test dependencies
- [ ] 3.3 Create `serve.ts` MCP server entry point (stdio transport)
- [ ] 3.4 Create agent/skill registry pattern (directory-based discovery)
- [ ] 3.5 Define `AgentContext` interface for dependency injection (Memory client, logger, config)
- [ ] 3.6 Create structured execution log format and response builder
- [ ] 3.7 Add health check / ping tool for companion server verification
- [ ] 3.8 Write basic tests for server startup and tool registration

## 4. First Computational Skill (TypeScript)

- [ ] 4.1 Identify first concrete computational skill (Memory graph sync is the candidate)
- [ ] 4.2 Create skill manifest (`skill.yaml`) with `execution: delegated`
- [ ] 4.3 Implement the skill as a tool in `packages/epf-agents/`
- [ ] 4.4 Create corresponding embedded manifest in epf-cli for discovery
- [ ] 4.5 Test end-to-end: agent activates -> skill resolved as delegated -> LLM calls companion tool -> result returned
- [ ] 4.6 Write unit tests for the computational skill
- [ ] 4.7 Write integration test with mock Memory API

## 5. Configuration and Documentation

- [ ] 5.1 Add `epf-agents` MCP server entry to `opencode.jsonc`
- [ ] 5.2 Update `AGENTS.md` with delegation architecture documentation
- [ ] 5.3 Update `.opencode/instructions.md` with epf-agents context
- [ ] 5.4 Add build/run instructions for `packages/epf-agents/`
- [ ] 5.5 Document the execution mode extension in EPF framework docs

## 6. Plugin Awareness (Optional, can defer)

- [ ] 6.1 Evaluate whether `opencode-epf` needs special handling for delegated skills
- [ ] 6.2 If needed: add companion server health check to plugin dashboard
- [ ] 6.3 If needed: add delegated skill awareness to tool scoping logic
