---
applyTo: "**"
---

# AI Assistant Self-Learning Log

This file tracks mistakes, lessons learned, and important discoveries made during development sessions. The goal is to continuously improve by documenting errors and their solutions.

## Format

Each entry should follow this structure:

```markdown
### [YYYY-MM-DD] - [Brief Title]

**Context**: What task/feature were you working on?

**Mistake**: What did you do wrong?

**Why It Was Wrong**: Root cause analysis

**Correct Approach**: What should have been done

**Prevention**: How to avoid this in the future

**Related Files/Conventions**: Links to relevant docs or code
```

---

## Lessons Learned

### 2025-10-06 - Misunderstood Test ID Static String Requirement

**Context**: Implementing test IDs for ClickUp E2E tests to replace fragile selectors

**Mistake**: Assumed that dynamic test ID construction like `data-testid={\`integration-card-${integration.name}\`}` was acceptable and even praised existing code that used this pattern.

**Why It Was Wrong**: 
- The testid-conventions.instructions.md explicitly states "ALWAYS use static strings for data-testid attributes"
- Dynamic construction inside components prevents LLM grep-ability, which was the PRIMARY REASON for the static string requirement
- I created the instruction file myself but then violated its core principle

**Correct Approach**:
1. **For reusable components in lists** (IntegrationCard, ConfigureIntegrationModal):
   - Component should accept `data-testid` as a prop
   - Parent component passes static string: `<IntegrationCard data-testid="integration-card-clickup" />`
   - Tests use the static string: `page.getByTestId('integration-card-clickup')`

2. **For single-instance components** (ClickUpSyncModal, WorkspaceTree):
   - Hardcode static string directly: `data-testid="clickup-sync-modal"`
   - No dynamic construction at all

**Prevention**:
- Before praising or accepting dynamic test IDs, check if the component is:
  - A) Single-instance → MUST use static string hardcoded in component
  - B) Reusable/list item → Accept as prop, parent provides static string
- Never construct test IDs dynamically inside components using template literals
- Always verify grep-ability: `grep -r "clickup-sync-modal"` should find BOTH the component AND the test

**Related Files/Conventions**:
- `.github/instructions/testid-conventions.instructions.md` (Critical Rules section)
- `docs/TEST_ID_CONVENTIONS.md` (Static Strings for LLM Grep-ability section)

**Action Required**: 
- Refactor IntegrationCard to accept data-testid prop
- Refactor ConfigureIntegrationModal to accept data-testid prop  
- Update parent components to pass static strings
- Update tests to use static strings

---

### 2025-10-06 - Generic Error Messages Hide Root Causes

**Context**: User received "Internal server error" when ClickUp API returned "Workspace not found" error

**Mistake**: ClickUp integration endpoints threw generic exceptions without proper error handling, resulting in unhelpful "Internal server error" responses to users

**Why It Was Wrong**:
- Users can't troubleshoot issues without knowing the specific problem
- Generic errors don't provide actionable guidance (e.g., "check your workspace ID")  
- Difficult to distinguish between authentication, configuration, and API errors
- Poor user experience and increased support burden

**Correct Approach**:
1. **Add specific error handling** for common integration error scenarios:
   - Invalid API tokens (401) → UnauthorizedException with token guidance
   - Invalid workspace IDs → BadRequestException with available workspaces
   - Insufficient permissions (403) → ForbiddenException with permission guidance
   - Network/API errors → BadRequestException with configuration check guidance

2. **Provide structured error responses** with:
   ```typescript
   {
     error: {
       code: 'invalid-workspace-id',
       message: 'User-friendly explanation',
       details: 'Technical details for debugging'
     }
   }
   ```

3. **Include actionable guidance** in error messages:
   - Where to find API tokens
   - How to check workspace IDs
   - What permissions are needed

**Prevention**:
- Always add try-catch blocks to integration endpoints
- Use specific HTTP exception classes (BadRequestException, UnauthorizedException, ForbiddenException)
- Include the integration name in error messages for context
- Provide both user-friendly messages and technical details
- Test error scenarios during development

**Related Files/Conventions**:
- `apps/server-nest/src/modules/integrations/integrations.controller.ts` (added error handling to 3 endpoints)
- NestJS HTTP exceptions: `@nestjs/common` - BadRequestException, UnauthorizedException, ForbiddenException
- Error response structure: `{ error: { code, message, details } }`

**Endpoints Improved**:
- `GET /integrations/clickup/structure` - Workspace structure errors
- `POST /integrations/:name/sync` - Sync operation errors  
- `POST /integrations/:name/test` - Connection test errors

---

### 2025-10-06 - Incomplete Component Instrumentation

**Context**: Adding test IDs to WorkspaceTree component for E2E tests

**Mistake**: Added test IDs only to Select All/Deselect All buttons but forgot to add the main container test ID (`clickup-workspace-tree`) to the root div. Then updated tests to reference the container test ID before actually adding it to the component.

**Why It Was Wrong**:
- Tests were failing with "element(s) not found" because the test ID didn't exist in the DOM
- Changed tests before changing components, creating a mismatch
- Didn't verify with grep that the test ID existed in the component before using it in tests

**Correct Approach**:
1. Always add test IDs to components FIRST
2. Verify with grep: `grep -r "clickup-workspace-tree" apps/admin/src/`
3. THEN update tests to use those test IDs
4. Run tests to verify they find the elements

**Prevention**:
- Before updating test selectors, run grep to confirm test ID exists in component
- Use a checklist when instrumenting components:
  - [ ] Root container test ID
  - [ ] Interactive elements (buttons, inputs, etc.)
  - [ ] Dynamic list items (if applicable)
  - [ ] Verify with grep
  - [ ] Update tests
  - [ ] Run tests

**Related Files/Conventions**:
- Component-first, test-second workflow
- Always verify before using

---

### 2025-10-06 - Dynamic Form Fields Are Actually Acceptable

**Context**: Refactoring IntegrationCard and ConfigureIntegrationModal to use static test IDs

**Mistake**: Initially thought ALL dynamic test ID construction was wrong and tried to remove test IDs from dynamically generated form fields in ConfigureIntegrationModal.

**Why It Was Wrong Initially**:
- The form fields in ConfigureIntegrationModal are truly dynamic - they're generated from the integration's settings schema
- Different integrations have different fields (ClickUp has `api_token` and `workspace_id`, GitHub might have `access_token`, etc.)
- There's no way to know the field names at compile time

**Correct Approach**:
1. **Single-instance components** (modals, main containers): Accept test ID as prop, parent passes static string
2. **List items from API** (IntegrationCard): Accept test ID as prop, parent conditionally passes static string for specific instances
3. **Truly dynamic form fields**: Keep dynamic test IDs like `data-testid={\`${integration.name}-${key}-input\`}` because:
   - Fields are generated from runtime data (settings schema)
   - Tests can still use scoped queries: `modal.getByTestId('clickup-api_token-input')`
   - The modal itself has a static test ID for scoping

**Prevention**:
- Distinguish between three cases:
  - **Case A**: Single-instance component (modal root, page container) → Static string from parent
  - **Case B**: List item from API data → Accept prop, parent passes static string conditionally 
  - **Case C**: Truly dynamic fields (form inputs from schema) → Dynamic construction is OK if scoped properly
- The key is ensuring the **parent container** has a static test ID so tests can scope their queries

**Related Files/Conventions**:
- `ConfigureIntegrationModal.tsx`: Modal has static test ID prop, but form inputs remain dynamic
- Tests use: `const modal = page.getByTestId('clickup-config-modal'); await modal.getByTestId('clickup-api_token-input').fill(...)`

---

### 2025-10-06 - Mock Response Data Must Match Component Expectations

**Context**: Debugging failing E2E tests for ClickUp sync modal - tests were at 6/8 passing, trying to get to 8/8

**Mistake**: The mock API response for the sync endpoint didn't include a `success: true` field, only a `message` field. This caused the component to show "Import Failed" as the heading even though the message was "Sync started successfully".

**Why It Was Wrong**:
- The `ClickUpSyncModal.tsx` component checks `syncResult.success` to determine whether to show "Import Successful!" or "Import Failed" (line 224)
- The mock response only had `{ message, integration_id, started_at, config }` without the `success` boolean
- This caused incorrect UI rendering and test failures looking for "import started successfully" text

**Correct Approach**:
1. **Read the component code** to understand what fields it expects from API responses
2. **Match mock responses** to those expectations exactly
3. **Include all required fields**, not just the obvious ones like `message`
4. **Add delays** to mocks when testing transient UI states (loading spinners, progress steps):
   ```typescript
   // Add delay to allow progress step to be visible
   await new Promise(resolve => setTimeout(resolve, 1000));
   ```

**Why Delays Matter**:
- The sync flow: sets `syncing=true` → calls API → gets response → sets `syncing=false` → transitions to complete step
- If API responds instantly (synchronous mock), the progress step might complete before tests can verify it
- A 1-second delay gives tests time to see the "Importing tasks..." text

**Prevention**:
- When creating mock API responses, check the component's TypeScript interfaces:
  - Search for `interface` or `type` definitions for response types
  - Check what fields the component actually uses (e.g., `syncResult.success`, `syncResult.message`)
- For transient UI states (loading, progress), add appropriate delays to mocks
- Make tests resilient to timing: check if loading exists, but don't fail if it's already gone

**Related Files/Conventions**:
- `apps/admin/src/pages/admin/pages/integrations/clickup/ClickUpSyncModal.tsx` (lines 64-89: handleStartSync, lines 219-242: complete step rendering)
- `apps/admin/e2e/specs/integrations.clickup.spec.ts` (line 227: sync endpoint mock with delay and success field)
- `src/api/integrations.ts` or similar: Look for `TriggerSyncResponse` type definition

**Specific Fixes Applied**:
1. Added `success: true` to mock response (line 235)
2. Added 1-second delay to sync POST endpoint (line 232)
3. Made loading spinner check resilient - tests check if visible but don't fail if already hidden (lines 478-488)
4. Updated completion step assertion to look for "Import Successful!" instead of "import started successfully" (line 608)

**Test Results**:
- Before: 6/8 passing (75%)
- After: 8/8 passing (100%) ✅

---

### 2025-10-06 - Should Use Postgres MCP Instead of Terminal for Database Queries

**Context**: Investigating why user got "already connected" message when trying to connect ClickUp integration

**Mistake**: Initially attempted to use `run_in_terminal` to execute PostgreSQL queries via `psql` command instead of using the available `mcp_postgres_query` tool.

**Why It Was Wrong**:
- The project has a Postgres MCP tool specifically designed for database queries
- Using terminal commands requires:
  - Knowing exact connection parameters (host, port, user, password)
  - Constructing proper `psql` command syntax
  - Parsing text output instead of getting structured JSON
  - Manual escaping of SQL queries
- The MCP tool provides:
  - Automatic connection management
  - Structured JSON responses
  - Better error handling
  - Simpler syntax (just pass SQL query as string)
  - Integration with VS Code's MCP ecosystem

**Correct Approach**:
1. **For all database queries**, use `mcp_postgres_query` tool:
   ```typescript
   mcp_postgres_query({
     sql: "SELECT * FROM kb.integrations WHERE name = 'clickup'"
   })
   ```

2. **Schema discovery pattern** (when you don't know table structure):
   - First, list all schemas: `SELECT schema_name FROM information_schema.schemata`
   - Then, list tables in schema: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'kb'`
   - Finally, get column info: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'kb' AND table_name = 'integrations'`

3. **Always use fully qualified table names**: `kb.integrations`, not just `integrations`

**Prevention**:
- Before running any database query, check if `mcp_postgres_query` tool is available
- Only use terminal `psql` if:
  - You need to run admin commands (CREATE DATABASE, etc.)
  - You need to use psql-specific features (\\d commands, etc.)
  - The MCP tool is explicitly not working
- When encountering "relation does not exist" errors, check the schema - tables might not be in `public` schema
- Document common schema patterns for future reference:
  - `kb.*` - Knowledge base tables (projects, documents, chunks, integrations, etc.)
  - `core.*` - Core user/auth tables
  - `public.*` - Often empty in multi-schema databases

**Related Files/Conventions**:
- `.vscode/mcp.json` - MCP server configuration
- Project uses multi-schema PostgreSQL database with `kb` and `core` schemas
- The `mcp_postgres_query` tool is read-only (perfect for investigations)

**Specific Learning**:
- The `kb.integrations` table structure:
  - Uses `settings_encrypted` (bytea) instead of plain `config` (jsonb)
  - Has `org_id` (text) and `project_id` (uuid) for multi-tenancy
  - Has `enabled` (boolean) flag for soft enable/disable
  - Stores encrypted credentials in `settings_encrypted`

**Real-World Result**:
Using `mcp_postgres_query`, I quickly discovered there was already a ClickUp integration created on October 5th for project `11b1e87c-a86a-4a8f-bdb0-c15c6e06b591`, which explained the "already connected" error.

---

### 2025-10-06 - Route Structure Must Match Frontend/Proxy Expectations

**Context**: User restored integrations controller from git, undoing architectural fixes. Frontend started showing "Cannot GET /integrations/available" 404 errors.

**Mistake**: The controller had `@Controller('api/v1/integrations')` but frontend was calling `/api/integrations` through Vite proxy that strips `/api` prefix.

**Why It Was Wrong**:
- **Request Flow**: Frontend calls `/api/integrations/available` → Vite proxy strips `/api` → Backend receives `/integrations/available`
- **Controller Expected**: `/api/v1/integrations/available` (wrong path with version prefix)
- **Result**: 404 Not Found because paths didn't match
- **Architecture Violation**: We established that controllers should use direct paths without `/api` prefix (per NestJS instructions)

**Correct Approach**:
1. **Controller decorator**: Use `@Controller('integrations')` (no `/api` or `/v1` prefix)
2. **Frontend calls**: `${apiBase}/api/integrations/*` (include `/api/` for proxy)
3. **Vite proxy**: Configured to strip `/api` and forward to backend
4. **Backend receives**: `/integrations/*` (matches controller path)
5. **Request flow**: `/api/integrations/available` → `/integrations/available` → ✅ matches controller

**Complete Fix Applied**:
- Changed `@Controller('api/v1/integrations')` to `@Controller('integrations')`
- Updated all method documentation to show correct paths
- Restored header-based context pattern (8 methods using `@Req() req: Request`)
- Restored enhanced error handling with specific HTTP exceptions
- Verified entire request flow works: Frontend → Vite Proxy → Backend

**Prevention**:
- Always test full frontend-to-backend request flow after controller changes
- Verify route structure matches the established architecture pattern
- Use curl to test both direct backend and through-proxy requests
- Remember: `@Controller('integrations')` not `@Controller('api/integrations')`
- Check NestJS instructions for API endpoint construction rules

**Related Files/Conventions**:
- `.github/instructions/nestjs.instructions.md` (API Endpoint Construction Rules)
- `apps/admin/vite.config.ts` (proxy configuration that strips `/api`)
- Frontend calls must include `/api/` prefix for proxy routing

**Test Commands**:
```bash
# Test backend directly
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/integrations/available

# Test through Vite proxy (frontend path)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5175/api/integrations/available
```

Both should return 200 status code.

---

### 2025-10-06 - API Context Should Use Headers, Not Query Parameters

**Context**: Debugging ClickUp integration not showing in UI. User pointed out "sending org and project in params is not common across the system right?"

**Mistake**: Fixed the integrations API by adding `project_id` and `org_id` as query parameters to frontend requests, when the system's architecture uses HTTP headers for this context.

**Why It Was Wrong**:
- The `use-api` hook already sends org/project context via HTTP headers:
  - `X-Org-ID` header (line 29: `if (activeOrgId) h["X-Org-ID"] = activeOrgId;`)
  - `X-Project-ID` header (line 30: `if (activeProjectId) h["X-Project-ID"] = activeProjectId;`)
- All other controllers in the system read from headers using `req.headers['x-org-id']` and `req.headers['x-project-id']`
- The integrations controller was the outlier, incorrectly expecting query parameters with `@Query()` decorators
- Adding query parameters to frontend was fighting the architecture instead of fixing the backend

**Correct Approach**:
1. **Backend reads from headers** (like all other controllers):
   ```typescript
   async listIntegrations(
       @Req() req: Request,
       @Query() filters: ListIntegrationsDto
   ): Promise<IntegrationDto[]> {
       const projectId = req.headers['x-project-id'] as string;
       const orgId = req.headers['x-org-id'] as string;
       return this.integrationsService.listIntegrations(projectId, orgId, filters);
   }
   ```

2. **Frontend doesn't change** - `fetchJson` already adds headers automatically via `buildHeaders()` in `use-api` hook

3. **Controller documentation updated** to show `Headers: X-Project-ID, X-Org-ID` instead of query params

**Prevention**:
- When implementing new API endpoints, check how existing endpoints handle org/project context
- Look at multiple controllers (documents, templates, type-registry) to identify patterns
- Never add org/project as query parameters - they belong in headers for:
  - Security (not logged in URLs)
  - Consistency across the system
  - Cleaner API design (context in headers, business data in params/body)
- Always grep for existing patterns: `grep -r "x-project-id" apps/server-nest/src/`
- Frontend should never manually add `X-Org-ID` or `X-Project-ID` headers - the `use-api` hook does it automatically

**Related Files/Conventions**:
- `apps/admin/src/hooks/use-api.ts` (lines 29-30: header construction)
- `apps/server-nest/src/modules/documents/documents.controller.ts` (correct pattern)
- `apps/server-nest/src/modules/template-packs/template-pack.controller.ts` (correct pattern)

### 2025-10-16 - Forgot to Re-enable Scope Enforcement in E2E Contexts

**Context**: Restoring the security scopes E2E suite for ingestion/search/chunks while reactivating ScopesGuard enforcement.

**Mistake**: Re-enabled the tests and controller scope annotations without turning off the `SCOPES_DISABLED` flag that defaults to `1` in the environment, so the guard continued to bypass checks and tests kept passing with 200 responses instead of 403.

**Why It Was Wrong**: The suite relies on ScopesGuard actually enforcing required scopes. Leaving `SCOPES_DISABLED=1` meant tokens missing `ingest:write`, `search:read`, or `chunks:read` were still authorized, hiding regressions and producing false positives.

**Correct Approach**: Explicitly force `process.env.SCOPES_DISABLED = '0'` inside the E2E context bootstrap so every spec runs with enforcement active, regardless of global env defaults.

**Prevention**:
- Whenever re-enabling authorization tests, confirm relevant feature flags or bypass env vars are disabled (log or assert in tests if needed).
- Set required auth flags inside shared test bootstrap (`createE2EContext`) so specs cannot silently inherit permissive defaults.
- Keep regression tests that assert the flag is disabled when scope-related suites run.

**Related Files/Conventions**:
- `apps/server-nest/tests/e2e/e2e-context.ts`
- `apps/server-nest/src/modules/auth/scopes.guard.ts`
- `docs/TEST_FIX_SESSION_4_FINAL.md` (records impact of `SCOPES_DISABLED=1`)
- `apps/server-nest/src/modules/integrations/integrations.controller.ts` (was wrong, now fixed)

**System Pattern**:
```
Frontend (use-api hook) → Adds X-Org-ID, X-Project-ID headers automatically
                       ↓
                  Vite Proxy (/api/*)
                       ↓
Backend Controller → Reads req.headers['x-org-id'], req.headers['x-project-id']
                       ↓
                   Service Layer
```

**Real-World Fix**:
- Updated 8 methods in integrations.controller.ts to use `@Req() req: Request` and read from headers
- Reverted frontend query parameter changes (they were unnecessary and wrong)
- Integration now appears in UI because backend correctly reads headers sent by `use-api` hook

---

### 2025-10-14 - Close Methods After runWithTenantContext Wrapping

**Context**: While refactoring `GraphService.createObject` to execute inside `DatabaseService.runWithTenantContext`, I wrapped the method body in an async callback so RLS policies would see the correct tenant.

**Mistake**: Added `return this.db.runWithTenantContext(..., async () => { ... })` but forgot the closing brace for the method after the callback. TypeScript then interpreted every subsequent method as part of the callback, producing dozens of confusing syntax errors.

**Why It Was Wrong**: Missing the method-level `}` meant the compiler flagged unrelated code, slowing diagnosis. The root cause was a simple structural omission hidden by a large diff.

**Correct Approach**: After wrapping in `runWithTenantContext`, explicitly add both `});` and the method's closing `}` before moving on. Immediately run `npm --prefix apps/server-nest run build` (or targeted tests) to confirm the file still parses.

**Prevention**:
- Use editor bracket matching or run Prettier/TS compiler after structural edits.
- Refactor in small steps: wrap call, verify build, then adjust inner logic.
- When big diffs are unavoidable, rely on automated checks quickly instead of waiting until later.

**Related Files/Conventions**:
- `apps/server-nest/src/modules/graph/graph.service.ts`
- `apps/server-nest/src/common/database/database.service.ts` (`runWithTenantContext` usage pattern)

---

## Meta-Lessons

### Pattern Recognition

**Common Mistake Pattern**: Acting on assumptions without verification
- Solution: Always grep/search before claiming something exists
- Solution: Always read current file state before editing

**Common Success Pattern**: Following documented conventions strictly
- When I followed testid-conventions.instructions.md correctly (static strings in ClickUpSyncModal), tests worked perfectly
- When I deviated (dynamic IDs in IntegrationCard), user had to correct me

---

## Instructions for Future Sessions

When you encounter this file:

1. **Read it completely** before starting work on related areas
2. **Check for relevant lessons** related to your current task
3. **Add new lessons** when mistakes happen
4. **Update existing lessons** if you discover additional context

This is a living document. Every mistake is an opportunity to improve.
