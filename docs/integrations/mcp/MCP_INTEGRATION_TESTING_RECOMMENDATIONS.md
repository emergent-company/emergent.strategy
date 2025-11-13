# MCP Integration Testing Recommendations

**Date**: 2025-01-20  
**Status**: Unit Testing Complete (90/90 tests), Integration Testing Deferred  
**Coverage**: ~95% unit test coverage achieved

---

## Summary

After completing comprehensive unit testing for the MCP module (90 tests, ~95% coverage), we evaluated the feasibility of adding integration tests. This document outlines the challenges encountered and provides recommendations for future integration testing efforts.

---

## Unit Testing Achievement

✅ **Completed Components**:
- SchemaVersionService: 19 tests
- SchemaTool: 23 tests
- SpecificDataTool: 30 tests
- GenericDataTool: 18 tests

**Total**: 90 tests, all passing, ~87ms execution time

**Coverage**: ~95% (far exceeds 80% target)

---

## Integration Testing Challenges

### 1. Complex Test Data Setup

**Challenge**: MCP tools require multi-layered test data:
```
Organization → Project → Template Pack → Types → Relationships → Graph Objects → Graph Edges
```

**Complexity**:
- Each layer requires tenant context (`runWithTenantContext`)
- GraphService methods need `orgId` and `projectId` parameters explicitly
- Relationship creation requires both objects to exist first
- Cleanup must happen in reverse dependency order

**Estimated Setup Time**: 45-60 minutes just for data seeding helpers

### 2. Tenant Context Management

**Challenge**: All database operations must run within `runWithTenantContext`:
```typescript
await db.runWithTenantContext(orgId, projectId, async () => {
  // All operations here
});
```

**Issues**:
- Context must be established before every test
- Cannot easily share context across test cases
- Async callback nesting makes code harder to read
- RLS policies depend on session-level GUCs being set correctly

### 3. Service Method Signatures

**Challenge**: GraphService methods don't use context implicitly:
```typescript
// Doesn't work (unit test pattern):
await graphService.createObject({ type, key, labels });

// Requires (integration test pattern):
await graphService.createObject({ type, key, labels }, orgId, projectId);
```

This means integration tests can't reuse unit test patterns directly.

### 4. Existing Integration Test Limitations

**Observation**: Existing e2e tests (e.g., `graph-search.e2e-spec.ts`) are lightweight placeholders:
- Test HTTP endpoints, not service layer
- Don't seed complex graph data
- Focus on auth/permissions, not data workflows

---

## What Integration Tests Would Validate

If implemented, integration tests should cover:

### Schema Discovery Workflow
1. ✅ **Template Pack Loading**: Verify TemplatePackService loads from real database
2. ✅ **Type Listing**: Confirm getObjectTypes returns all types across packs
3. ✅ **Relationship Discovery**: Validate getRelationshipTypes finds all relationships
4. ✅ **Schema Version Consistency**: All queries return same schema_version

### Data Query Workflow
1. ⚠️ **Real Pagination**: Test with actual cursors from GraphService
2. ⚠️ **Property Filtering**: Verify filters work with real JSONB queries
3. ⚠️ **Type Validation**: Confirm type mismatches are caught
4. ⚠️ **Not Found Handling**: Test missing object scenarios

### Relationship Traversal
1. ⚠️ **Outgoing Edges**: Task → Person via `assigned_to`
2. ⚠️ **Incoming Edges**: Person ← Task via `assigned_to`
3. ⚠️ **Bidirectional**: Both directions for same relationship
4. ⚠️ **Edge Filtering**: Multiple relationship types, filter to specific
5. ⚠️ **Deleted Objects**: Handle deleted targets in edge lists

### Performance
1. ⚠️ **Query Speed**: Baseline query times with realistic data volumes
2. ⚠️ **Pagination Efficiency**: N pages should be ~N×single-page time
3. ⚠️ **Relationship Fan-out**: High-degree vertices (e.g., 100+ assignees)

---

## Current Unit Test Coverage Already Validates

✅ **Service Integration (Mocked)**:
- SchemaTool correctly calls TemplatePackService methods
- SpecificDataTool correctly calls GraphService methods
- GenericDataTool correctly calls GraphService methods
- SchemaVersionService hashes template pack configurations

✅ **Data Transformation**:
- GraphObjectDto → PersonDto/TaskDto conversion
- Fallback naming (labels → key → "Unnamed")
- Metadata structure (schema_version, cached_until, cursors)

✅ **Error Handling**:
- Service failures propagate correctly
- Not found errors return proper error responses
- Invalid parameters caught by Zod schemas

✅ **Business Logic**:
- Pagination with limit and cursor
- Relationship direction handling ('in', 'out', 'both')
- Edge filtering by relationship type
- Graceful handling of deleted objects in relationship traversal

---

## Recommendations

### Immediate: Document & Deploy (RECOMMENDED)

**Rationale**: 95% unit test coverage is excellent. The marginal value of integration tests is low compared to the setup cost.

**Actions**:
1. ✅ Update main MCP documentation with testing achievement
2. ✅ Create testing best practices guide (this document)
3. ✅ Document mock patterns for future contributors
4. ✅ Move to Phase 4 (Authentication) with confidence

### Short-Term: Add Focused Integration Tests

If integration testing becomes priority, focus on highest-value scenarios:

**Priority 1: Schema Discovery (15-20 minutes)**
- Test TemplatePackService loading from real database
- Verify schema queries work end-to-end
- No graph objects needed (simpler setup)

**Priority 2: Simple Data Query (30-40 minutes)**
- Create 5-10 graph objects of single type
- Test pagination with real cursors
- Test filtering with real JSONB queries

**Priority 3: Basic Relationships (45-60 minutes)**
- Create objects + 1 relationship type
- Test outgoing traversal
- Test incoming traversal

### Long-Term: Comprehensive E2E Tests

For production confidence, consider:

**1. MCP Client Integration**
- Use official MCP SDK to call tools
- Test through SSE protocol layer
- Validate JSON-RPC responses

**2. Real Agent Workflows**
- Simulate Claude/GPT calling sequence of tools
- Test context maintenance across multiple calls
- Verify schema version caching works

**3. Load Testing**
- 1000+ objects, 10000+ relationships
- Concurrent tool calls
- Cache hit rates

---

## Implementation Guide (If Proceeding with Integration Tests)

### Step 1: Create Test Data Helper

```typescript
// apps/server/src/modules/mcp/__tests__/helpers/test-data.helper.ts

export class McpTestDataHelper {
  constructor(private db: DatabaseService) {}
  
  async createTestOrg(): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO core.organizations (id, name) 
       VALUES (gen_random_uuid(), 'MCP Test Org') 
       RETURNING id`
    );
    return result.rows[0].id;
  }
  
  async createTestProject(orgId: string): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO kb.projects (id, org_id, name) 
       VALUES (gen_random_uuid(), $1, 'MCP Test Project') 
       RETURNING id`,
      [orgId]
    );
    return result.rows[0].id;
  }
  
  async createTestTemplatePack(
    orgId: string,
    projectId: string
  ): Promise<{
    packId: string;
    personTypeId: string;
    taskTypeId: string;
    assignedToRelId: string;
  }> {
    return await this.db.runWithTenantContext(orgId, projectId, async () => {
      // Implementation here...
    });
  }
  
  async cleanup(orgId: string, projectId: string): Promise<void> {
    // Delete in reverse dependency order
  }
}
```

### Step 2: Create Base Integration Test Class

```typescript
// apps/server/src/modules/mcp/__tests__/helpers/mcp-integration-base.ts

export abstract class McpIntegrationTestBase {
  protected app: INestApplication;
  protected db: DatabaseService;
  protected helper: McpTestDataHelper;
  protected orgId: string;
  protected projectId: string;
  
  async setupBase() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    this.app = moduleRef.createNestApplication();
    await this.app.init();
    
    this.db = moduleRef.get<DatabaseService>(DatabaseService);
    this.helper = new McpTestDataHelper(this.db);
    
    this.orgId = await this.helper.createTestOrg();
    this.projectId = await this.helper.createTestProject(this.orgId);
  }
  
  async teardownBase() {
    await this.helper.cleanup(this.orgId, this.projectId);
    await this.app.close();
  }
  
  async runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.runWithTenantContext(this.orgId, this.projectId, fn);
  }
}
```

### Step 3: Write Focused Tests

```typescript
// apps/server/src/modules/mcp/__tests__/schema-integration.e2e-spec.ts

describe('Schema Integration Tests', () => {
  let testContext: McpIntegrationTestBase;
  let schemaTool: SchemaTool;
  
  beforeAll(async () => {
    testContext = new McpIntegrationTestBase();
    await testContext.setupBase();
    schemaTool = testContext.app.get<SchemaTool>(SchemaTool);
  });
  
  afterAll(async () => {
    await testContext.teardownBase();
  });
  
  it('should list template packs', async () => {
    await testContext.runInContext(async () => {
      const result = await schemaTool.getTemplatePacks();
      expect(result.success).toBe(true);
    });
  });
});
```

---

## Alternative: Manual Integration Testing

Instead of automated tests, consider manual verification:

1. **Seed Test Data**: Use scripts in `scripts/` to create sample org/project/graph
2. **Manual Tool Calls**: Test MCP tools via Postman/curl
3. **Verify Results**: Check database state and tool responses
4. **Document Workflow**: Create user guide showing tool usage

This approach is faster for initial validation and can be automated later if needed.

---

## Conclusion

**95% unit test coverage is excellent** and provides high confidence in MCP module correctness. Integration tests would add value but require significant setup effort.

**Recommended path forward**:
1. ✅ Consider unit testing complete (goal exceeded)
2. ✅ Document achievement (this file + MCP_TESTING_COMPLETE.md)
3. ✅ Move to Phase 4 (Authentication) which is production-critical
4. ⏳ Defer integration tests until after authentication is complete
5. ⏳ Consider integration tests optional enhancement (not required for deployment)

**Total time saved**: ~2 hours (integration test setup) that can be invested in authentication and production features.

---

## Related Documentation

- `MCP_TESTING_PROGRESS.md` - Real-time progress tracker
- `MCP_TESTING_COMPLETE.md` - Final unit testing summary
- `MCP_TESTING_SESSION_*_COMPLETE.md` - Detailed session reports
- `apps/server/src/modules/mcp/__tests__/` - All unit test files

---

**Status**: Unit testing complete, integration testing deferred with clear path forward if needed in future.
