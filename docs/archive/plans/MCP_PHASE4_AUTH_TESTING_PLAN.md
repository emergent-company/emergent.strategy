# MCP Phase 4: Authentication & Authorization Testing Plan

**Date**: 2025-10-20  
**Status**: Ready to implement  
**Goal**: Protect MCP endpoints with JWT authentication and scope-based authorization

---

## Executive Summary

After achieving 95% unit test coverage for MCP tools (90/90 tests passing), we're moving to Phase 4: securing the MCP module with authentication and authorization. The authentication infrastructure already exists in the codebase - we need to:

1. Apply guards to MCP endpoints
2. Define scope requirements per endpoint
3. Test authentication and authorization flows
4. Document security model

---

## Current State Analysis

### ✅ Existing Authentication Infrastructure

**AuthGuard** (`apps/server/src/modules/auth/auth.guard.ts`):
- Validates JWT bearer tokens
- Extracts user from token
- Attaches `req.user` for downstream use
- Tested in `apps/server/tests/auth.guard.spec.ts` (7 tests)

**ScopesGuard** (`apps/server/src/modules/auth/scopes.guard.ts`):
- Checks user scopes against required scopes
- Supports dynamic scope expansion via `PermissionService`
- Logs authorization events via `AuditService`
- Supports `SCOPES_DISABLED=1` bypass for testing
- Tested in `apps/server/tests/scopes.guard.spec.ts` (8 tests)

**AuthService** (`apps/server/src/modules/auth/auth.service.ts`):
- Validates JWT tokens via JWKS
- Supports mock tokens for testing (`e2e-all`, `no-scope`, `with-scope`)
- Parses scopes from token claims
- Tested in `apps/server/tests/auth.service.jwt.spec.ts` (12 tests)

**PermissionService** (`apps/server/src/modules/auth/permission.service.ts`):
- Computes effective scopes from user roles
- Currently returns mock scopes (all granted)

**Existing Scopes** (from `MOCK_SCOPES` constant):
```typescript
orgRead: 'org:read'
graphSearchRead: 'search:read'
chatUse: 'chat:use'
documentsRead: 'documents:read'
documentsWrite: 'documents:write'
ingestWrite: 'ingest:write'
chunksRead: 'chunks:read'
// etc.
```

### 🚧 MCP Controller (NOT Protected)

**Current State** (`apps/server/src/modules/mcp/mcp.controller.ts`):
```typescript
@Controller('mcp')
@ApiTags('MCP')
export class McpController {
  // NO @UseGuards decorators
  // NO @Scopes decorators
  
  @Get('schema/version')
  async getSchemaVersion() { ... }
  
  @Get('schema/changelog')
  async getSchemaChangelog() { ... }
}
```

**Issue**: Endpoints are completely open - no authentication required!

---

## Security Model Design

### Scope Hierarchy for MCP

**Schema Read Operations** (`schema:read`):
- View template pack structure
- List object types and properties
- List relationship types
- Get schema version and changelog

**Data Read Operations** (`data:read`):
- Query objects by type (Person, Task)
- Get object by ID
- Traverse relationships
- Search across types

**Data Write Operations** (`data:write`) - Future:
- Create objects
- Update object properties
- Delete objects
- Create/modify relationships

**Admin Operations** (`mcp:admin`) - Future:
- Modify template packs
- Change schema structure
- System configuration

### Proposed Scope Assignment

| Endpoint | HTTP Method | Required Scopes | Notes |
|----------|-------------|-----------------|-------|
| `/mcp/schema/version` | GET | `schema:read` | Low-risk metadata |
| `/mcp/schema/changelog` | GET | `schema:read` | Read-only audit trail |
| Future: Tool endpoints | GET | `data:read` | Query operations |
| Future: Tool endpoints | POST | `data:write` | Mutations |

---

## Implementation Plan

### Step 1: Add New Scopes to MOCK_SCOPES

**File**: `apps/server/src/modules/auth/auth.service.ts`

```typescript
export const MOCK_SCOPES = {
    // Existing scopes...
    orgRead: 'org:read',
    graphSearchRead: 'search:read',
    
    // NEW: MCP-specific scopes
    schemaRead: 'schema:read',
    dataRead: 'data:read',
    dataWrite: 'data:write',
    mcpAdmin: 'mcp:admin',
};
```

**Rationale**: Separate MCP scopes from graph/search scopes for fine-grained control.

### Step 2: Protect MCP Controller Endpoints

**File**: `apps/server/src/modules/mcp/mcp.controller.ts`

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@Controller('mcp')
@ApiTags('MCP')
@UseGuards(AuthGuard, ScopesGuard)  // Apply to all endpoints
@ApiBearerAuth()
export class McpController {
    constructor(
        private readonly schemaVersionService: SchemaVersionService,
    ) { }

    @Get('schema/version')
    @Scopes('schema:read')  // Require schema:read scope
    @ApiOperation({ ... })
    @ApiResponse({ ... })
    async getSchemaVersion(): Promise<SchemaVersionDto> {
        // Implementation unchanged
    }

    @Get('schema/changelog')
    @Scopes('schema:read')  // Require schema:read scope
    @ApiOperation({ ... })
    @ApiResponse({ ... })
    async getSchemaChangelog(...): Promise<SchemaChangeDto[]> {
        // Implementation unchanged
    }
}
```

### Step 3: Create MCP Authentication E2E Tests

**File**: `apps/server/src/modules/mcp/__tests__/mcp-auth.e2e-spec.ts`

**Test Coverage** (20-25 tests):

1. **Schema Version Endpoint** (8 tests):
   - ✅ Returns 401 when no token provided
   - ✅ Returns 401 when invalid token provided
   - ✅ Returns 403 when token missing `schema:read` scope
   - ✅ Returns 200 with valid token and `schema:read` scope
   - ✅ Returns 200 when token has `mcp:admin` scope (hierarchy)
   - ✅ Returns schema version with correct structure
   - ✅ Includes cache hint TTL
   - ✅ Logs authorization events (check audit service)

2. **Schema Changelog Endpoint** (8 tests):
   - ✅ Returns 401 when no token provided
   - ✅ Returns 401 when invalid token provided
   - ✅ Returns 403 when token missing `schema:read` scope
   - ✅ Returns 200 with valid token and `schema:read` scope
   - ✅ Accepts `since` query parameter
   - ✅ Accepts `limit` query parameter
   - ✅ Returns empty array (until implemented)
   - ✅ Validates query parameters

3. **Cross-Endpoint Security** (4 tests):
   - ✅ Single token works across both endpoints
   - ✅ Scope check happens on every request (no caching)
   - ✅ Authorization failure returns proper error structure
   - ✅ Debug headers present when `DEBUG_AUTH_SCOPES=1`

4. **Token Validation** (4 tests):
   - ✅ Expired token rejected
   - ✅ Malformed JWT rejected
   - ✅ Unknown issuer rejected
   - ✅ Missing bearer prefix rejected

**Test Pattern** (based on existing e2e tests):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('MCP Authentication E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /mcp/schema/version', () => {
    it('returns 401 when no token provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/mcp/schema/version')
        .expect(401);
      
      expect(response.body.error.code).toBe('unauthorized');
    });

    it('returns 403 when token missing schema:read scope', async () => {
      // AuthService mock supports 'no-scope' token
      const response = await request(app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer no-scope')
        .expect(403);
      
      expect(response.body.error.code).toBe('forbidden');
      expect(response.body.error.details.missing).toContain('schema:read');
    });

    it('returns 200 with valid token and schema:read scope', async () => {
      // Need to create a mock token with schema:read scope
      const response = await request(app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer schema-read-token')
        .expect(200);
      
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body).toHaveProperty('cache_hint_ttl');
    });
  });
});
```

### Step 4: Update Mock Tokens for Testing

**File**: `apps/server/src/modules/auth/auth.service.ts`

Add new mock tokens for MCP testing:

```typescript
async validateToken(token: string | undefined): Promise<AuthUser | null> {
    if (process.env.NODE_ENV === 'test' || !this.jwksUri) {
        // Existing mocks...
        if (token === 'no-scope') return { ... };
        if (token === 'with-scope') return { ... };
        
        // NEW: MCP-specific test tokens
        if (token === 'schema-read-token') {
            return { 
                sub: toUuid('schema-read'), 
                scopes: [MOCK_SCOPES.schemaRead] 
            };
        }
        if (token === 'data-read-token') {
            return { 
                sub: toUuid('data-read'), 
                scopes: [MOCK_SCOPES.schemaRead, MOCK_SCOPES.dataRead] 
            };
        }
        if (token === 'data-write-token') {
            return { 
                sub: toUuid('data-write'), 
                scopes: [
                    MOCK_SCOPES.schemaRead, 
                    MOCK_SCOPES.dataRead, 
                    MOCK_SCOPES.dataWrite
                ] 
            };
        }
        if (token === 'mcp-admin-token') {
            return { 
                sub: toUuid('mcp-admin'), 
                scopes: [MOCK_SCOPES.mcpAdmin] 
            };
        }
    }
    // Real JWT validation...
}
```

### Step 5: Document Security Model

**File**: `docs/MCP_SECURITY_MODEL.md`

Document:
- Available scopes
- Endpoint-to-scope mapping
- Token structure requirements
- Error responses
- Testing strategies
- Production deployment considerations

---

## Testing Strategy

### Unit Tests (Existing - No changes needed)

All guard and auth service tests already exist:
- `auth.guard.spec.ts`: 7 tests ✅
- `scopes.guard.spec.ts`: 8 tests ✅
- `auth.service.jwt.spec.ts`: 12 tests ✅

**Total existing auth tests**: 27 tests, all passing

### E2E Tests (New - To implement)

**File**: `apps/server/src/modules/mcp/__tests__/mcp-auth.e2e-spec.ts`

**Estimated**: 20-25 tests covering authentication and authorization flows

### Manual Testing Checklist

- [ ] Test with Postman/curl without token → 401
- [ ] Test with invalid token → 401
- [ ] Test with valid token but wrong scope → 403
- [ ] Test with valid token and correct scope → 200
- [ ] Verify error response structure matches spec
- [ ] Verify debug headers when `DEBUG_AUTH_SCOPES=1`
- [ ] Test with real JWT from Zitadel (if available)

---

## Implementation Checklist

### Phase 4.1: Add Scopes (5-10 minutes)
- [ ] Add `schemaRead`, `dataRead`, `dataWrite`, `mcpAdmin` to `MOCK_SCOPES`
- [ ] Add mock tokens for testing
- [ ] Rebuild server (`npm run build`)
- [ ] Update `SECURITY_SCOPES.md` documentation

### Phase 4.2: Protect MCP Controller (5-10 minutes)
- [ ] Add `@UseGuards(AuthGuard, ScopesGuard)` to controller class
- [ ] Add `@ApiBearerAuth()` for OpenAPI docs
- [ ] Add `@Scopes('schema:read')` to both endpoints
- [ ] Add import statements
- [ ] Test manually with Postman

### Phase 4.3: Create E2E Tests (30-45 minutes)
- [ ] Create `mcp-auth.e2e-spec.ts` file
- [ ] Implement schema/version authentication tests (8 tests)
- [ ] Implement schema/changelog authentication tests (8 tests)
- [ ] Implement cross-endpoint tests (4 tests)
- [ ] Implement token validation tests (4 tests)
- [ ] Run tests: `npm run test:e2e -- mcp-auth.e2e-spec.ts`
- [ ] Fix any failures
- [ ] Verify all 20-25 tests passing

### Phase 4.4: Documentation (15-20 minutes)
- [ ] Create `MCP_SECURITY_MODEL.md`
- [ ] Update `MCP_TESTING_COMPLETE.md` with Phase 4 results
- [ ] Update `SECURITY_SCOPES.md` with MCP scopes
- [ ] Add security section to main MCP README
- [ ] Document token requirements for AI agents

### Phase 4.5: Validation (10-15 minutes)
- [ ] Run all MCP tests together (unit + e2e)
- [ ] Run full test suite to ensure no regressions
- [ ] Test with real JWT if available
- [ ] Update OpenAPI spec (rebuild server)
- [ ] Review error responses in browser/Postman

---

## Expected Outcomes

### Test Coverage

**Before Phase 4**:
- Unit tests: 90 tests (MCP tools)
- E2E tests: 0 tests (MCP authentication)

**After Phase 4**:
- Unit tests: 90 tests (unchanged)
- E2E tests: 20-25 tests (new authentication tests)
- **Total**: 110-115 tests for MCP module

### Security Posture

**Before**: MCP endpoints completely open (anyone can query)
**After**: MCP endpoints protected by JWT + scope checks

### Documentation

**New documents**:
- `MCP_SECURITY_MODEL.md` - Security architecture
- `MCP_PHASE4_AUTH_COMPLETE.md` - Implementation summary

**Updated documents**:
- `SECURITY_SCOPES.md` - Add MCP scopes
- `MCP_TESTING_COMPLETE.md` - Add Phase 4 results

---

## Risks & Mitigations

### Risk 1: Breaking Existing Tools
**Impact**: Medium  
**Likelihood**: Low  
**Mitigation**: MCP tools themselves don't change, only controller endpoints. All existing unit tests should still pass.

### Risk 2: Mock Tokens Not Working
**Impact**: Medium  
**Likelihood**: Low  
**Mitigation**: Test tokens follow existing patterns (see `auth.service.ts` mock implementations). Pattern is proven in other modules.

### Risk 3: Scope Naming Conflicts
**Impact**: Low  
**Likelihood**: Low  
**Mitigation**: Using `schema:read` and `data:read` which don't conflict with existing scopes (`org:read`, `documents:read`, etc.)

### Risk 4: AI Agent Integration Breaks
**Impact**: High  
**Likelihood**: Medium  
**Mitigation**: 
- Document token requirements clearly
- Provide example tokens for testing
- Test with Claude Desktop before declaring complete
- Can disable scopes via `SCOPES_DISABLED=1` for development

---

## Alternative Approaches Considered

### Option A: No Authentication (Rejected)
**Pros**: Simplest implementation  
**Cons**: Production risk, not suitable for multi-tenant deployment

### Option B: API Key Only (Rejected)
**Pros**: Simpler than JWT  
**Cons**: Doesn't integrate with existing auth system, no scope granularity

### Option C: JWT + Scopes (SELECTED)
**Pros**: 
- Integrates with existing auth infrastructure
- Fine-grained access control via scopes
- Industry standard approach
- Already tested and working in other modules

**Cons**:
- Requires token management
- Adds complexity to AI agent setup

### Option D: OAuth 2.0 Client Credentials (Future)
**Pros**: Standard for machine-to-machine auth  
**Cons**: Overkill for current needs, can add later if needed

---

## Success Criteria

- [ ] ✅ All MCP endpoints require authentication
- [ ] ✅ All MCP endpoints require appropriate scopes
- [ ] ✅ 20-25 new authentication E2E tests passing
- [ ] ✅ No regressions in existing tests (90/90 unit tests still passing)
- [ ] ✅ 401/403 errors return proper error structure
- [ ] ✅ OpenAPI spec updated with security requirements
- [ ] ✅ Documentation complete and clear
- [ ] ✅ Manual testing with Postman successful

---

## Timeline Estimate

| Phase | Estimated Time | Complexity |
|-------|---------------|------------|
| 4.1: Add Scopes | 5-10 min | Low |
| 4.2: Protect Controller | 5-10 min | Low |
| 4.3: Create E2E Tests | 30-45 min | Medium |
| 4.4: Documentation | 15-20 min | Low |
| 4.5: Validation | 10-15 min | Low |
| **Total** | **65-100 min** | **Medium** |

**Recommended**: Allocate 90 minutes to allow for unexpected issues and thorough testing.

---

## Next Steps After Phase 4

Once authentication is complete, consider:

1. **Phase 5: AI Agent Integration** - Test MCP tools with Claude Desktop
2. **Phase 6: Integration Tests** - Return to deferred integration tests if valuable
3. **Phase 7: Production Hardening** - Rate limiting, monitoring, error tracking
4. **Phase 8: Advanced Features** - Caching, batch operations, webhooks

---

## Related Documentation

- `docs/MCP_TESTING_COMPLETE.md` - Unit testing summary
- `docs/MCP_INTEGRATION_TESTING_RECOMMENDATIONS.md` - Integration test guidance
- `apps/server/tests/auth.guard.spec.ts` - Existing auth tests
- `apps/server/tests/scopes.guard.spec.ts` - Existing scope tests
- `SECURITY_SCOPES.md` - Current security model
- `docs/spec/18-authorization-model.md` - Authorization architecture

---

**Status**: Ready to implement. All infrastructure exists. Clear path forward. Estimated 90 minutes to complete.
