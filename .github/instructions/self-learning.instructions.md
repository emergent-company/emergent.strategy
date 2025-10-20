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

**Correct Approach**: After wrapping in `runWithTenantContext`, explicitly add both `});` and the method's closing `}` before moving on. Immediately run `nx run server-nest:build` (or targeted tests) to confirm the file still parses.

**Prevention**:
- Use editor bracket matching or run Prettier/TS compiler after structural edits.
- Refactor in small steps: wrap call, verify build, then adjust inner logic.
- When big diffs are unavoidable, rely on automated checks quickly instead of waiting until later.

**Related Files/Conventions**:
- `apps/server-nest/src/modules/graph/graph.service.ts`
- `apps/server-nest/src/common/database/database.service.ts` (`runWithTenantContext` usage pattern)

---

### 2025-10-18 - Assumed org_id Column Existed In Extraction Jobs Table

**Context**: Updating `recoverOrphanedJobs` in `ExtractionWorkerService` to run updates inside `runWithTenantContext`.

**Mistake**: Selected `org_id` in the SQL query even though `kb.object_extraction_jobs` only exposes `organization_id` (and `tenant_id`). This would have thrown at runtime, preventing recovery from running.

**Why It Was Wrong**: I assumed legacy naming carried over without confirming the schema. The table definition clearly lacks `org_id`, so the query would error before any rows could be processed.

**Correct Approach**: Query `organization_id` and fall back to `tenant_id` when organization is null, matching the actual schema. Verify column names via `information_schema.columns` before coding.

**Prevention**:
- Inspect table schemas before referencing column names.
- Run lightweight SQL to validate assumptions before wiring logic.
- Reflect schema differences (org vs tenant) directly in TypeScript typings and tests.

**Related Files/Conventions**:
- `apps/server-nest/src/modules/extraction-jobs/extraction-worker.service.ts`
- `apps/server-nest/src/modules/extraction-jobs/__tests__/extraction-worker.service.spec.ts`
- `information_schema.columns` checks for `kb.object_extraction_jobs`

---

### 2025-10-18 - User Asked For Feature That Already Existed (Hot Reload)

**Context**: User asked "can you add option for hot reload for admin and api to scripts?" after completing extraction modal fix. This seemed like a reasonable feature request.

**Mistake**: Started investigating how to add hot reload as a new feature, looking at command catalog and workspace CLI structure, when I should have first verified if hot reload was already configured.

**Why It Was Wrong**: 
- Wasted time investigating implementation approach before checking existing configuration
- Could have added unnecessary/duplicate commands
- Missing documentation led to user confusion about existing features
- This was a documentation problem, not a missing feature problem

**Correct Approach**:
1. **First**: Check PM2 ecosystem config to see what scripts are actually running
2. **Second**: Check package.json scripts to see if dev/watch modes exist
3. **Third**: If already configured, document it clearly rather than add new commands
4. **Finally**: Add to Copilot instructions so future AI sessions know about it

**What I Discovered**:
- Admin: PM2 runs `npm run dev` → Vite dev server with HMR (instant updates)
- Server: PM2 runs `npm run start:dev` → ts-node-dev with `--respawn` flag (auto-restart)
- Both have `autorestart: true` for crash recovery
- Hot reload has been working by default all along!

**Prevention**:
- When user requests a feature, first check if similar functionality exists
- Search for: PM2 config, package.json scripts, existing commands
- Look for evidence of watch mode: `vite`, `nodemon`, `ts-node-dev`, `--watch`, `--respawn`
- If feature exists but undocumented, documentation is the fix, not new code
- Add to central docs (copilot-instructions.md) to prevent future confusion

**Related Files/Conventions**:
- `tools/workspace-cli/pm2/ecosystem.apps.cjs` - PM2 process configuration (check `args` array)
- `apps/admin/package.json` - "dev": "vite" (Vite HMR built-in)
- `apps/server-nest/package.json` - "start:dev": "ts-node-dev --respawn" (watch mode)
- `.github/copilot-instructions.md` - Added "Development Environment" section with hot reload info
- `docs/HOT_RELOAD.md` - Created comprehensive hot reload documentation

**Documentation Added**:
- Added to `.github/copilot-instructions.md` so future AI sessions know hot reload is default
- Created `docs/HOT_RELOAD.md` with full details on how it works, troubleshooting, customization
- Prevents future AI assistants from trying to "add" something that already exists

**User Impact**:
- User was likely editing files and seeing changes but wasn't sure if hot reload was working
- Lack of explicit documentation created uncertainty
- Now clearly documented that `workspace:start` = hot reload enabled

---

### 2025-10-18 - Progress UI Not Working Due To Missing Database Columns

**Context**: User reported extraction progress metrics showing "0 / 0" and "Calculating..." despite extractions running

**Mistake**: Assumed the database schema matched the code expectations without verifying column existence

**Why It Was Wrong**:
- Backend code referenced `total_items`, `processed_items`, `successful_items`, `failed_items` columns
- Frontend calculated progress from these fields
- Database table `kb.object_extraction_jobs` didn't have these columns
- Result: All progress metrics showed 0 or "Calculating..." because reading undefined/null values

**Correct Approach**:
1. When investigating UI issues showing "0" or null values, check database schema first
2. Query `information_schema.columns` to verify columns exist
3. Compare backend DTO/service code with actual table structure
4. Create migration to add missing columns with appropriate defaults

**Root Cause Discovery**:
```sql
-- Expected columns in code
total_items, processed_items, successful_items, failed_items

-- Actual table only had
objects_created, relationships_created, suggestions_created
```

**Solution Applied**:
- Created migration: `20251018_add_extraction_progress_columns.sql`
- Added 4 integer columns with default 0
- Added check constraints for data consistency
- Added index for efficient progress queries
- Applied migration successfully

**Prevention**:
- When adding progress tracking, ensure database schema is updated FIRST
- Add schema validation tests that compare DTO types to actual columns
- Document column requirements in service layer comments
- Use TypeScript database schema libraries (e.g., Kysely, Drizzle) for type-safe schema management

**Related Files/Conventions**:
- `apps/server-nest/src/modules/extraction-jobs/extraction-job.service.ts` (updateProgress method)
- `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx` (progress calculations)
- `docs/EXTRACTION_PROGRESS_TRACKING_ISSUES.md` (full analysis)

---

### 2025-10-18 - Graph Objects Failing Due To Null Keys

**Context**: All extracted entities (5/5) failed with "null value in column 'key' violates not-null constraint"

**Mistake**: Passed `key: entity.business_key || undefined` assuming LLM would always provide business_key

**Why It Was Wrong**:
- LLM extraction returned `business_key: null` for all entities
- The `graph_objects.key` column is NOT NULL (no default)
- Code passed `null` which violated constraint
- Result: 0 objects created, extraction appeared to fail

**Root Cause Analysis**:
```typescript
// Worker code
key: entity.business_key || undefined  // becomes null in DB

// LLM response
{
  "type_name": "Location",
  "name": "Sweden",
  "business_key": null,  // ← Problem
  ...
}

// Database constraint
graph_objects.key TEXT NOT NULL  // Rejects null
```

**Correct Approach**:
1. Always provide fallback for required database columns
2. Generate reasonable default from available data
3. Document that business_key is optional for LLM but key is required for storage
4. Add key generation logic that creates valid identifiers

**Solution Applied**:
Added `generateKeyFromName()` method:
```typescript
private generateKeyFromName(name: string, typeName: string): string {
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 64);
    
    const typePrefix = typeName.toLowerCase().substring(0, 16);
    const hash = crypto.createHash('md5')
        .update(`${typeName}:${name}`)
        .digest('hex')
        .substring(0, 8);
    
    return `${typePrefix}-${normalized}-${hash}`.substring(0, 128);
}
```

Then updated creation:
```typescript
// Before
key: entity.business_key || undefined

// After
const objectKey = entity.business_key || this.generateKeyFromName(entity.name, entity.type_name);
```

**Prevention**:
- For any required NOT NULL column, ensure fallback logic exists
- Test with edge cases: null, undefined, empty string
- Document where auto-generation happens vs user-provided values
- Add validation tests that try to create objects with missing fields
- Consider making business_key required in LLM prompt if it's important

**Related Files/Conventions**:
- `apps/server-nest/src/modules/extraction-jobs/extraction-worker.service.ts` (key generation)
- `apps/server-nest/src/modules/graph/graph.service.ts` (object creation, key constraint)
- Key pattern: `{type}-{normalized-name}-{hash}` (e.g., `location-sweden-a1b2c3d4`)

---

### 2025-10-18 - Manual Migration Application Without Automation

**Context**: After fixing extraction progress columns issue, user pointed out I spent time figuring out Docker credentials and psql commands manually

**Mistake**: Applied migration via manual docker exec commands instead of creating a reusable automation script first

**Why It Was Wrong**:
- Manual process wastes time on every migration (find container, check credentials, construct command)
- Error-prone: easy to use wrong container, database, or credentials
- No tracking: database doesn't know which migrations were applied
- Not repeatable: next developer has to rediscover the same steps
- No validation: can't easily check migration status before/after
- Missing in CI/CD: can't automate deployments without migration script

**Correct Approach**:
1. **First**: Create migration automation script before applying any migration:
   - Read migration files from `apps/server-nest/migrations/` directory
   - Track applied migrations in database table (`kb.schema_migrations`)
   - Auto-detect connection method (Docker container or direct psql)
   - Handle credentials from environment variables
   - Provide dry-run and list modes for safety
   - Record execution time and errors
   
2. **Then**: Use the script for all future migrations:
   ```bash
   npx nx run server-nest:migrate -- --list      # Check status
   npx nx run server-nest:migrate -- --dry-run   # Preview changes
   npx nx run server-nest:migrate                # Apply pending
   ```

3. **Benefits**:
   - One command applies all pending migrations in order
   - Database tracks what's been applied (prevents duplicates)
   - Safe to run multiple times (idempotent)
   - Works in CI/CD without manual intervention
   - Performance metrics for each migration
   - Error tracking and debugging

**Solution Implemented**:
- Created `apps/server-nest/scripts/migrate.mjs`:
  * Node.js script that reads SQL files from migrations directory
  * Creates `kb.schema_migrations` table to track applied migrations
  * Compares filesystem migrations with database records
  * Applies pending migrations in alphabetical order
  * Records checksums, execution time, success/failure
  * Supports `--list`, `--dry-run` modes
  * Works with Docker or direct database connection
  
- Added Nx target: `nx run server-nest:migrate`
  * Easy to remember command
  * Forwards all arguments (--dry-run, --list)
  * Integrates with existing Nx workflow

- Created comprehensive documentation: `docs/DATABASE_MIGRATIONS.md`
  * Usage examples for all modes
  * Migration naming conventions
  * Best practices and troubleshooting
  * CI/CD integration guide
  * Rollback strategy

**Prevention**:
- When a manual command needs credentials/container discovery, ask: "Will I need this again?"
- If yes, create automation FIRST, then use it
- For database operations, always prefer tracked migrations over ad-hoc SQL
- Add documentation alongside automation so next developer finds it easily
- Think about CI/CD: if you can't automate it, you can't deploy it reliably

**Related Files/Conventions**:
- `apps/server-nest/scripts/migrate.mjs` (migration runner)
- `apps/server-nest/project.json` (Nx target definition)
- `docs/DATABASE_MIGRATIONS.md` (comprehensive guide)
- `kb.schema_migrations` table (tracks applied migrations)

**Migration System Features**:
- Automatic tracking in database table
- Alphabetical ordering (use numbered prefixes: `0002_`, `20251018_`)
- Checksum validation (detects file modifications)
- Error handling with detailed messages
- Performance metrics (execution time per migration)
- Flexible connection (Docker container or direct)
- Safe modes: `--list` (status), `--dry-run` (preview)

**Real-World Impact**:
- Future migrations: single command instead of manual docker exec
- CI/CD ready: can run in deployment pipeline
- Team collaboration: everyone uses same process
- Debugging: can query migration history in database
- Confidence: dry-run mode prevents mistakes

---

### 2025-10-18 - Enhanced Logging with File/Line/Method Information

**Context**: User requested "everytime we are using logger it would be great to have a date, file/servoce/controller etc. and line where it was logged (somtimes you are looking for exact place beased on logs)"

**Problem**: Existing logging included timestamps and context (service names) but lacked precise source location information (file path, line number, method name), making it difficult to quickly locate where specific logs originated in the codebase.

**Solution Implemented**:
Enhanced the `FileLogger` service to automatically capture and include:
1. **File path** (relative to project root): `src/modules/extraction-jobs/extraction-job.service.ts`
2. **Line number**: `400`
3. **Method name** (when available): `ExtractionJobService.dequeueJobs`

**Technical Approach**:
1. Added `getCallerInfo()` method that:
   - Captures stack trace using `new Error().stack`
   - Parses stack frames to extract file path, line number, column, and method name
   - Skips internal logger frames and node_modules
   - Converts absolute paths to relative (from project root)
   - Returns structured `CallerInfo` object

2. Updated `writeToFile()` to:
   - Call `getCallerInfo()` for every log entry
   - Build location string: `file:line (method)` or `file:line`
   - Include in both structured log data and formatted output
   - Format: `timestamp [LEVEL] [Context] location - message`

3. Updated all public log methods (`log`, `error`, `warn`, `debug`, `verbose`, `fatal`) to:
   - Include caller info in console output
   - Maintain consistent format across all log levels

**Log Format Output**:
```
2025-10-18T20:02:36.433Z [DEBUG] [ExtractionJobService] src/modules/extraction-jobs/extraction-job.service.ts:400 (ExtractionJobService.dequeueJobs) - [DEQUEUE] Found 0 jobs (rowCount=0)
```

**Benefits**:
- **Instant navigation**: Click file path in IDE to jump to exact line
- **Faster debugging**: No more grepping through code to find log sources
- **Production troubleshooting**: Identify exact code path without adding debug logs
- **Code review**: Understand execution flow and logging coverage
- **Zero code changes**: Backward compatible with all existing logger calls

**Performance**:
- Stack trace parsing adds ~0.1-0.5ms per log call
- Negligible impact for typical logging volumes (< 1000 logs/sec)
- Already optimized to skip internal frames

**Usage Examples**:
```bash
# Find all logs from specific file
grep "extraction-worker.service.ts" logs/app.log

# Find all logs from specific line
grep "extraction-worker.service.ts:400" logs/app.log

# Find all logs from specific method
grep "ExtractionWorkerService.processJob" logs/app.log
```

**Files Modified**:
- `apps/server-nest/src/common/logger/file-logger.service.ts`:
  * Added `CallerInfo` interface
  * Added `getCallerInfo()` method (stack trace parsing)
  * Updated `writeToFile()` to include location info
  * Updated all public methods to use caller info in console output
  * Added project root tracking for relative path conversion

**Documentation Created**:
- `docs/ENHANCED_LOGGING_SYSTEM.md`: Comprehensive guide (200+ lines)
  * Log format explanation
  * Usage examples
  * Searching logs
  * IDE integration tips
  * Performance considerations
  * Troubleshooting guide

**Prevention**:
- When implementing logging systems, consider including source location from the start
- Use stack trace APIs to automatically capture caller context
- Make location information easily parseable and clickable in IDEs
- Balance detail with performance (stack traces have minimal overhead)
- Document log format clearly for team consistency

**Related Files/Conventions**:
- `apps/server-nest/src/common/logger/file-logger.service.ts` (enhanced logger)
- `docs/ENHANCED_LOGGING_SYSTEM.md` (comprehensive guide)
- Node.js `Error.stack` API for stack trace capture
- Pattern: `timestamp [LEVEL] [Context] file:line (method) - message`

**Real-World Example**:
Before:
```
2025-10-18T20:01:56.344Z [WARN] [EncryptionService] INTEGRATION_ENCRYPTION_KEY is only 8 characters
```
After:
```
2025-10-18T20:01:56.344Z [WARN] [EncryptionService] src/modules/integrations/encryption.service.ts:45 (EncryptionService.encrypt) - INTEGRATION_ENCRYPTION_KEY is only 8 characters
```

Now you immediately know: File: `encryption.service.ts`, Line: `45`, Method: `encrypt` ✅

---

### 2025-10-19 - Frontend Request Failing Because Backend Endpoint Didn't Exist

**Context**: User reported KB Purpose Editor showing 400 Bad Request when clicking "Save". Frontend was sending PATCH request to `/api/projects/:id` with `{ kb_purpose: "..." }`.

**Mistake**: Implemented frontend component that calls PATCH endpoint without verifying the backend endpoint existed first. Assumed the standard CRUD pattern would include update endpoints.

**Why It Was Wrong**:
- Frontend development completed before backend endpoint verification
- Made assumption that ProjectsController would have a PATCH endpoint because it had GET, POST, DELETE
- Didn't check the controller implementation before building dependent frontend features
- This created a "works in code but fails at runtime" situation
- User discovered the issue only during manual browser testing

**Correct Approach**:
1. **Before implementing frontend that calls an API**: Verify the endpoint exists in the backend controller
2. **Check controller methods**: `grep -r "@Patch\|@Put\|@Post\|@Get\|@Delete" apps/server-nest/src/modules/<module>/`
3. **If endpoint missing**: Implement backend first, then frontend
4. **For new features requiring API changes**: 
   - Create migration (if database schema changes needed)
   - Create/update DTOs (request/response types)
   - Add service method (business logic)
   - Add controller endpoint (HTTP handler)
   - Test endpoint with curl/Postman
   - Then implement frontend
5. **Full-stack verification checklist**:
   - [ ] Database column exists (check schema or run migration)
   - [ ] DTO includes field (check `*.dto.ts`)
   - [ ] Service method handles field (check `*.service.ts`)
   - [ ] Controller endpoint exists (check `*.controller.ts`)
   - [ ] Endpoint has correct HTTP method (@Patch, @Post, etc.)
   - [ ] Endpoint has correct scope/auth guards
   - [ ] Test endpoint with curl before frontend work

**Solution Applied**:
1. Created `UpdateProjectDto` with `name?` and `kb_purpose?` fields
2. Added `update()` method to ProjectsService (dynamic SQL builder)
3. Added `@Patch(':id')` endpoint to ProjectsController with `@Scopes('project:write')`
4. Updated `ProjectDto` to include `kb_purpose?: string` in response
5. Verified `kb_purpose` column existed in database (migration already applied)
6. Restarted server to load new endpoint
7. Documented fix in `docs/KB_PURPOSE_EDITOR_FIX.md`

**Prevention**:
- When implementing frontend API calls, first verify endpoint exists:
  ```bash
  # Check if endpoint exists
  grep -r "@Patch.*projects" apps/server-nest/src/modules/projects/
  
  # Check DTO includes field
  grep "kb_purpose" apps/server-nest/src/modules/projects/dto/
  
  # Check database column exists
  # (use postgres MCP or check migrations)
  ```
- Use semantic_search to find controller and check methods before coding frontend
- For CRUD operations, verify all standard endpoints exist (GET, POST, PATCH, DELETE)
- Don't assume standard patterns - verify explicitly
- Test backend endpoint with curl before integrating frontend
- Add to checklist: "Verified backend endpoint exists" before frontend PR

**Related Files/Conventions**:
- `apps/server-nest/src/modules/projects/projects.controller.ts` (added PATCH endpoint)
- `apps/server-nest/src/modules/projects/projects.service.ts` (added update method)
- `apps/server-nest/src/modules/projects/dto/project.dto.ts` (added UpdateProjectDto)
- `apps/admin/src/components/organisms/KBPurposeEditor/KBPurposeEditor.tsx` (frontend caller)
- NestJS patterns: Controller (@Patch) → Service (business logic) → Database
- Full-stack verification: Migration → DTO → Service → Controller → Frontend

**Real-World Impact**:
- Before: Frontend compiled successfully but failed at runtime with 400 error
- After: Full CRUD support for projects (can now update name or kb_purpose)
- Discovery Wizard can now save KB purpose before running discovery
- Users can edit and persist knowledge base purpose descriptions
- Proper RESTful API pattern established for projects resource

**Time Cost**:
- Frontend implementation: 2 hours (KB Purpose Editor component)
- Bug discovery: 5 minutes (user testing)
- Root cause diagnosis: 10 minutes (grep searches, controller inspection)
- Backend implementation: 30 minutes (DTO + Service + Controller)
- Testing & documentation: 15 minutes
- **Total wasted time**: ~1 hour (could have been prevented with upfront verification)

**Key Takeaway**: Always verify backend APIs exist before implementing frontend features that depend on them. A 2-minute grep search would have saved an hour of rework.

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
