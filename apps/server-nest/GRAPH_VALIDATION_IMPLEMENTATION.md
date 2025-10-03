# Graph Object Schema Validation - Implementation Summary

## Overview

Successfully integrated the Type Registry system into GraphService to provide dynamic schema validation for graph objects. This enables real-time validation of object properties against project-level type schemas during object creation and updates.

## Implementation Details

### 1. Module Integration

**File: `graph.module.ts`**
- Added `TypeRegistryModule` to imports array
- Enables GraphService to inject and use TypeRegistryService

**Changes:**
```typescript
imports: [DatabaseModule, AppConfigModule, AuthModule, TypeRegistryModule]
```

### 2. Service Integration

**File: `graph.service.ts`**

**Constructor Injection:**
```typescript
constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SchemaRegistryService) private readonly schemaRegistry: SchemaRegistryService,
    @Optional() @Inject(TypeRegistryService) private readonly typeRegistry?: TypeRegistryService,
    // ... other services
) { }
```

**Key Design Decisions:**
- TypeRegistryService is **optional** (`@Optional()`) to maintain backward compatibility
- Service gracefully handles absence of TypeRegistry
- Validation layer runs **after** SchemaRegistry validation (existing system)

### 3. Validation in createObject()

**Location:** After SchemaRegistry validation, before transaction commit

**Validation Flow:**
1. Check if TypeRegistryService is available
2. Check if project_id and org_id are present
3. Call `typeRegistry.validateObjectData()`
4. Handle validation result:
   - **Valid**: Continue object creation
   - **Invalid**: Throw BadRequestException with detailed errors
   - **Type Not Found (NotFoundException)**: Allow creation (type registry is optional)
   - **Type Disabled (BadRequestException)**: Propagate error to user
   - **Other Errors**: Log but don't block creation

**Error Response Format:**
```typescript
{
    code: 'type_registry_validation_failed',
    message: 'Object properties do not match type schema',
    errors: [
        { path: '/name', message: 'Missing required property: name', keyword: 'required' },
        { path: '/version', message: 'Missing required property: version', keyword: 'required' }
    ]
}
```

### 4. Validation in patchObject()

**Location:** After SchemaRegistry validation, before transaction commit

**Validation Flow:**
1. Merge patch properties with existing properties: `nextProps = { ...current.properties, ...patch.properties }`
2. Validate merged properties against type schema
3. Same error handling strategy as createObject()

**Key Behavior:**
- Validates the **final merged state**, not just the patch
- Ensures the resulting object always conforms to type schema
- Prevents incremental patches from creating invalid objects

### 5. Validation Priority

The validation pipeline runs in this order:

```
1. SchemaRegistry Validation (legacy system)
   ↓
2. Type Registry Validation (new system)
   ↓
3. Transaction Execution
```

**Rationale:**
- SchemaRegistry provides static, compile-time schemas
- Type Registry provides dynamic, runtime schemas
- Both must pass for object to be created/updated
- SchemaRegistry failures block Type Registry validation (fail fast)

## Test Coverage

**File: `graph/__tests__/graph.type-validation.spec.ts` (320 lines)**

### Test Cases (14 total)

**createObject Validation:**
1. ✅ Validates against Type Registry and creates object when validation passes
2. ✅ Throws BadRequestException when Type Registry validation fails
3. ✅ Allows creation when type is not registered (optional validation)
4. ✅ Propagates BadRequestException when type is disabled
5. ✅ Skips validation when TypeRegistry service is not available
6. ✅ Skips validation when project_id or org_id is missing

**patchObject Validation:**
7. ✅ Validates merged properties against Type Registry when patching
8. ✅ Throws BadRequestException when patched properties fail validation
9. ✅ Allows patch when type is not registered
10. ✅ Propagates BadRequestException when type is disabled during patch

**Validation Priority:**
11. ✅ Runs SchemaRegistry validation before Type Registry validation
12. ✅ Runs Type Registry validation only when SchemaRegistry passes

**Edge Cases:**
13. ✅ Handles missing org/project context gracefully
14. ✅ Handles Type Registry service unavailability

## Error Handling Strategy

### 1. Type Not Found (NotFoundException)
- **Scenario**: Type not yet registered in project's type registry
- **Action**: Allow object creation/update
- **Rationale**: Type registry is optional; types can exist without registration

### 2. Type Disabled (BadRequestException)
- **Scenario**: Type exists but is disabled in project
- **Action**: Block operation, propagate error to user
- **Rationale**: User explicitly disabled type; enforce restriction

### 3. Validation Failed (Invalid Schema)
- **Scenario**: Properties don't match type's JSON Schema
- **Action**: Block operation, return detailed validation errors
- **Rationale**: Ensure data quality and type conformance

### 4. Service Unavailable
- **Scenario**: TypeRegistry service not injected or DB connection error
- **Action**: Allow operation (graceful degradation)
- **Rationale**: Don't block core functionality if registry is down

## API Examples

### Example 1: Creating an Object with Valid Properties

**Request:**
```http
POST /graph/objects
Content-Type: application/json

{
  "type": "Application",
  "key": "my-app",
  "properties": {
    "name": "My Application",
    "version": "1.0.0",
    "status": "active"
  },
  "project_id": "proj-123",
  "org_id": "org-456"
}
```

**Response (200 OK):**
```json
{
  "id": "obj-789",
  "type": "Application",
  "properties": {
    "name": "My Application",
    "version": "1.0.0",
    "status": "active"
  },
  "version": 1,
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Example 2: Creating an Object with Invalid Properties

**Request:**
```http
POST /graph/objects
Content-Type: application/json

{
  "type": "Application",
  "key": "my-app",
  "properties": {
    "name": "My Application"
    // Missing required "version" field
  },
  "project_id": "proj-123",
  "org_id": "org-456"
}
```

**Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": {
    "code": "type_registry_validation_failed",
    "message": "Object properties do not match type schema",
    "errors": [
      {
        "path": "/version",
        "message": "Missing required property: version",
        "keyword": "required"
      }
    ]
  }
}
```

### Example 3: Patching an Object

**Request:**
```http
PATCH /graph/objects/obj-789
Content-Type: application/json

{
  "properties": {
    "status": "inactive"
  }
}
```

**Validation Process:**
1. Fetch current properties: `{ name: "My Application", version: "1.0.0", status: "active" }`
2. Merge with patch: `{ name: "My Application", version: "1.0.0", status: "inactive" }`
3. Validate merged properties against Application type schema
4. If valid, create new version with merged properties

## Integration with Existing Systems

### 1. SchemaRegistry (Legacy)
- **Relationship**: Type Registry validation runs **after** SchemaRegistry
- **Overlap**: Both provide schema validation
- **Migration Path**: Eventually deprecate SchemaRegistry in favor of Type Registry

### 2. Template Packs
- **Relationship**: Template packs provide initial type schemas
- **Flow**: Install template → Types added to registry → Objects validated against types

### 3. Embedding System
- **Relationship**: Independent; validation happens before embedding
- **Flow**: Validate → Create object → Queue for embedding (if policies match)

### 4. Branch System
- **Relationship**: Validation applies to all branches
- **Flow**: Same validation rules regardless of branch context

## Performance Considerations

### 1. Validation Cost
- **Database Query**: 1 additional query to Type Registry per object operation
- **Validation Logic**: Basic schema validation (lightweight)
- **Optimization**: Type schemas cached in memory (future enhancement)

### 2. Transaction Safety
- Validation runs **inside** transaction
- Failed validation triggers rollback
- No partial state or orphaned data

### 3. Async Validation
- All validation is synchronous (by design)
- Ensures data consistency before commit
- Trade-off: Slight latency increase vs. data quality guarantee

## Future Enhancements

### 1. Full AJV Integration
- **Current**: Basic required property validation
- **Future**: Complete JSON Schema validation with:
  - Type checking (string, number, boolean, etc.)
  - Format validation (email, URL, date, etc.)
  - Pattern matching (regex)
  - Array validation (minItems, maxItems, uniqueItems)
  - Nested object validation

**Implementation:**
```typescript
// Add to package.json
"ajv": "^8.12.0",
"ajv-formats": "^2.1.1"

// Update TypeRegistryService
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

this.ajv = new Ajv({ allErrors: true, strict: false });
addFormats(this.ajv);
```

### 2. Validation Caching
- Cache compiled validators in memory
- Invalidate cache on type schema updates
- Reduces validation latency for frequently-used types

### 3. Validation Metrics
- Track validation success/failure rates
- Identify problematic types or properties
- Dashboard for data quality monitoring

### 4. Custom Validation Rules
- Support custom validators beyond JSON Schema
- Business logic validation (e.g., cross-field dependencies)
- Integration with external validation services

### 5. Validation Warnings
- Non-blocking validation warnings (e.g., deprecated properties)
- Soft validation vs. hard validation
- User feedback without blocking operations

## Migration Guide

### For Existing Projects

**Step 1: Install Template Pack**
```http
POST /template-packs/projects/{projectId}/assign
{
  "template_pack_id": "togaf-pack-123"
}
```

**Step 2: Enable Types**
```http
PATCH /type-registry/projects/{projectId}/types/Application/toggle
{
  "enabled": true
}
```

**Step 3: Test Validation**
```http
POST /type-registry/projects/{projectId}/validate
{
  "type": "Application",
  "properties": {
    "name": "Test App",
    "version": "1.0.0"
  }
}
```

**Step 4: Create Objects**
```http
POST /graph/objects
{
  "type": "Application",
  "properties": { ... }
}
```

### For New Projects

1. Install desired template pack during project setup
2. Types automatically available and enabled
3. Objects validated from first creation

## Troubleshooting

### Issue: Validation always passes

**Possible Causes:**
- Type not registered in Type Registry
- TypeRegistry service not available
- Project ID or Org ID missing from context

**Solution:**
1. Check if type exists: `GET /type-registry/projects/{projectId}/types/{typeName}`
2. Verify type is enabled: Check `enabled` field in response
3. Confirm context is set: Check request headers or session

### Issue: Validation fails unexpectedly

**Possible Causes:**
- Schema requirements changed
- Properties don't match schema format
- Type schema is too restrictive

**Solution:**
1. Get current schema: `GET /type-registry/projects/{projectId}/types/{typeName}/schema`
2. Test validation explicitly: `POST /type-registry/projects/{projectId}/validate`
3. Review validation errors for specific issues
4. Update type schema if needed: `PATCH /type-registry/projects/{projectId}/types/{typeName}`

### Issue: "Type is disabled" error

**Possible Causes:**
- Type was explicitly disabled
- Template pack was uninstalled

**Solution:**
1. Check type status: `GET /type-registry/projects/{projectId}/types/{typeName}`
2. Enable type: `PATCH /type-registry/projects/{projectId}/types/{typeName}/toggle { "enabled": true }`

## Summary

✅ **What Was Delivered:**
- Type Registry validation integrated into GraphService
- Validation in both createObject and patchObject flows
- Comprehensive error handling with graceful degradation
- 14 integration tests covering all scenarios
- Backward compatible with existing SchemaRegistry system

✅ **Key Benefits:**
- Dynamic type management without code deployments
- Detailed validation error messages for users
- Optional validation (doesn't break existing functionality)
- Foundation for Phase 2 extraction workflows

✅ **Lines of Code:**
- Service integration: ~60 lines
- Test coverage: 320 lines
- Total changes: ~380 lines across 3 files

✅ **Test Coverage:**
- 14 test cases
- createObject: 6 tests
- patchObject: 4 tests
- Validation priority: 2 tests
- Edge cases: 2 tests

## Next Steps

Recommended order for completing Phase 1:

1. **Extraction Job Framework** (Task #5)
   - Basic job tracking structure
   - Status management
   - Foundation for Phase 2

2. **E2E Tests** (Task #6)
   - Full workflow testing
   - Integration validation

3. **Seed Data** (Task #7)
   - TOGAF template pack
   - Ready-to-use type catalog
