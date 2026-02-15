## 1. Anchor File Design

- [x] 1.1 Define `_epf.yaml` schema with required fields (version, instance_id, created_at)
- [x] 1.2 Add anchor file validation to `internal/anchor/`
- [x] 1.3 Add anchor file creation utility to `internal/anchor/`
- [x] 1.4 Write unit tests for anchor validation

## 2. EPF Discovery Module

- [x] 2.1 Create `internal/discovery/` package
- [x] 2.2 Implement directory scanning with anchor detection
- [x] 2.3 Add confidence scoring (high/medium/low/none)
- [x] 2.4 Implement false positive rejection logic
- [x] 2.5 Write unit tests for discovery scenarios

## 3. Agent Command

- [x] 3.1 Create `cmd/agent.go` with agent subcommand
- [x] 3.2 Design AI-friendly output format (banner + instructions)
- [x] 3.3 Add `--json` flag for structured output
- [x] 3.4 Include command reference with examples
- [x] 3.5 Add MCP server connection instructions
- [x] 3.6 Write unit tests for output formats

## 4. Locate Command

- [x] 4.1 Create `cmd/locate.go` with locate subcommand
- [x] 4.2 Integrate with discovery module
- [x] 4.3 Add status reporting (valid, broken, legacy, not-found)
- [x] 4.4 Add repair suggestions for broken instances
- [x] 4.5 Add `--json` flag for structured output
- [x] 4.6 Write unit tests for locate scenarios

## 5. Enhanced Init Command

- [x] 5.1 Update `cmd/init.go` to create anchor file
- [ ] 5.2 Add `--interactive` mode with prompts (deferred - lower priority)
- [x] 5.3 Ensure init creates complete structure (anchor + AGENTS.md)
- [x] 5.4 Add post-init AI guidance output
- [x] 5.5 Add `--force` flag for overwrite scenarios (already existed)
- [x] 5.6 Write unit tests for init scenarios

## 6. Migrate Anchor Command

- [x] 6.1 Create `cmd/migrate_anchor.go`
- [x] 6.2 Implement anchor inference from existing artifacts
- [x] 6.3 Add `--dry-run` flag
- [x] 6.4 Add validation after migration
- [x] 6.5 Write unit tests for migration scenarios

## 7. Health Check Integration

- [x] 7.1 Update `cmd/health.go` to check anchor presence
- [x] 7.2 Add warning for legacy instances
- [x] 7.3 Add anchor validation to health check results
- [x] 7.4 Update health check documentation

## 8. Documentation

- [x] 8.1 Update `apps/epf-cli/AGENTS.md` with new commands
- [x] 8.2 Update `apps/epf-cli/README.md`
- [x] 8.3 Add anchor file format documentation
- [x] 8.4 Document migration path for legacy instances

## 9. MCP Server Updates

- [x] 9.1 Add `epf_agent_instructions` MCP tool
- [x] 9.2 Add `epf_locate_instance` MCP tool
- [x] 9.3 Update MCP tool documentation
- [x] 9.4 Write MCP tool tests

## 10. Testing & Validation

- [x] 10.1 Create integration tests with real directory structures
- [x] 10.2 Test false positive rejection scenarios
- [x] 10.3 Test legacy instance detection and migration
- [x] 10.4 Validate AI agent workflow end-to-end
