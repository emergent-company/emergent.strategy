# Implementation Tasks

## 1. Preparation

- [x] 1.1 Review OpenCode custom tools documentation
- [x] 1.2 Analyze existing credential scripts for required functionality
- [x] 1.3 Create `.opencode/tool/` directory if it doesn't exist

## 2. Tool Implementation

- [x] 2.1 Create `credentials.ts` tool file with TypeScript structure
- [x] 2.2 Implement environment variable loading from `.env` file
- [x] 2.3 Add test user credential extraction (TEST_USER_EMAIL, TEST_USER_PASSWORD)
- [x] 2.4 Add E2E user credential extraction (E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD)
- [x] 2.5 Add application URL extraction (ADMIN_PORT, SERVER_PORT, ZITADEL_DOMAIN)
- [x] 2.6 Add default fallback values matching existing scripts
- [x] 2.7 Format output as structured JSON with clear field names
- [x] 2.8 Add usage guidance in tool output (DevTools MCP workflow, manual testing)

## 3. Testing

- [x] 3.1 Test tool with OpenCode: ask AI to "get test credentials"
- [x] 3.2 Verify tool works when `.env` file exists with all variables
- [x] 3.3 Verify tool uses defaults when `.env` variables are missing
- [x] 3.4 Verify tool handles missing `.env` file gracefully with error message
- [x] 3.5 Confirm JSON output structure is easy to parse and read

## 4. Documentation

- [x] 4.1 Add JSDoc comments to tool explaining purpose and usage
- [x] 4.2 Add inline comments for complex logic (env parsing)
- [x] 4.3 Update `.opencode/instructions.md` to mention the credentials tool
- [x] 4.4 Consider adding example usage to AGENTS.md or README
