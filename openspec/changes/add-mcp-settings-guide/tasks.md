## 1. Backend: API Token Infrastructure

- [ ] 1.1 Create `api_tokens` entity in `apps/server/src/entities/api-token.entity.ts`
- [ ] 1.2 Create TypeORM migration for `core.api_tokens` table
- [ ] 1.3 Create `ApiTokensModule` with controller, service, repository
- [ ] 1.4 Implement `POST /api/projects/:projectId/tokens` - create token
- [ ] 1.5 Implement `GET /api/projects/:projectId/tokens` - list tokens
- [ ] 1.6 Implement `DELETE /api/projects/:projectId/tokens/:tokenId` - revoke token
- [ ] 1.7 Add API token validation to `AuthService.validateToken()`
- [ ] 1.8 Write unit tests for ApiTokensService
- [ ] 1.9 Write E2E tests for token endpoints

## 2. Frontend: MCP Settings Page

- [ ] 2.1 Create `apps/admin/src/pages/admin/pages/settings/project/mcp.tsx`
- [ ] 2.2 Add MCP endpoint URL display with copy button
- [ ] 2.3 Add agent configuration examples section (Claude, Cursor, Cline, OpenCode)
- [ ] 2.4 Add copy-to-clipboard functionality for config snippets
- [ ] 2.5 Update `SettingsSidebar.tsx` to add "MCP Integration" under "Integrations" group
- [ ] 2.6 Register route in `apps/admin/src/router/register.tsx`

## 3. Frontend: API Token Management UI

- [ ] 3.1 Create token generation modal component
- [ ] 3.2 Create tokens list table component
- [ ] 3.3 Add permission selection (schema:read, data:read, data:write)
- [ ] 3.4 Implement token reveal dialog (shown only once)
- [ ] 3.5 Add token revocation with confirmation dialog
- [ ] 3.6 Add API client functions in `apps/admin/src/api/tokens.ts`

## 4. Documentation & Testing

- [ ] 4.1 Add inline help text explaining each configuration option
- [ ] 4.2 Test configuration examples with actual agents (Claude Desktop, Cursor)
- [ ] 4.3 Verify token authentication works with MCP endpoint
- [ ] 4.4 Manual testing of full flow: generate token → configure agent → make MCP call
