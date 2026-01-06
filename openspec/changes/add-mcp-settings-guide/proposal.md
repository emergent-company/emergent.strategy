# Change: Add MCP Configuration Guide and API Token Management

## Why

Users want to connect external AI agents (Claude Desktop, Cursor, Cline, OpenCode, etc.) to the Emergent MCP server to access their project's knowledge graph. Currently:

1. There's no UI showing how to configure external agents
2. There's no way to generate API tokens for programmatic MCP access
3. Users must understand Zitadel OAuth to get tokens manually

This friction prevents adoption of the MCP integration for external tooling.

## What Changes

### Phase 1: MCP Configuration Guide (Settings Page)

- Add new settings page: `/admin/settings/project/mcp`
- Display the MCP endpoint URL for the current project
- Show configuration examples for popular AI agents:
  - Claude Desktop (`claude_desktop_config.json`)
  - Cursor (`.cursor/mcp.json`)
  - Cline/Continue (VS Code settings)
  - OpenCode (`opencode.jsonc`)
- Include copy-to-clipboard functionality for config snippets

### Phase 2: API Token Generation

- Add `api_tokens` table to store project-scoped tokens
- Backend endpoints for token CRUD operations
- UI to generate, list, view, and revoke API tokens
- Tokens are scoped to a specific project with configurable permissions
- Token validation in AuthService alongside existing JWT validation

### Future (Out of Scope)

- OAuth device flow for agents that support browser-based auth
- Token usage analytics and rate limiting

## Impact

- Affected specs: New capability `mcp-settings-guide`
- Affected code:
  - `apps/admin/src/pages/admin/pages/settings/project/mcp.tsx` (new)
  - `apps/admin/src/pages/admin/pages/settings/components/SettingsSidebar.tsx`
  - `apps/server/src/entities/api-token.entity.ts` (new)
  - `apps/server/src/modules/api-tokens/` (new module)
  - `apps/server/src/modules/auth/auth.service.ts` (token validation)
  - Router registration in `apps/admin/src/router/register.tsx`
