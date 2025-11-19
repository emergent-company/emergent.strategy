# Change: Add OpenCode Custom Tool for Test Credentials

## Why

AI coding assistants frequently need test user credentials when implementing or debugging features that require authentication. Currently, they must:

1. Ask users for credentials
2. Search through `.env` files manually
3. Run bash scripts and parse the output

This creates friction and breaks the flow of development. A custom OpenCode tool would provide instant, structured access to test credentials directly within the AI's tool ecosystem.

## What Changes

- Add custom OpenCode tool in `.opencode/tool/credentials.ts` that:
  - Reads environment variables from `.env` file
  - Returns structured credential data for test users and E2E users
  - Provides application URLs (admin, server, Zitadel)
  - Includes usage guidance for manual testing and DevTools MCP integration
- Consolidates logic from existing bash scripts (`get-test-user-credentials.sh`, `get-e2e-credentials.sh`)

## Impact

- Affected specs: None (tooling addition, no functional changes to application)
- Affected code:
  - Add: `.opencode/tool/credentials.ts` (new custom tool)
- Developer experience: Significantly improves AI assistant workflow when working with authentication
- Existing bash scripts: Remain available for command-line usage
- No breaking changes
