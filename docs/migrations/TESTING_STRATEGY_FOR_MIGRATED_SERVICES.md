# Testing Strategy for TypeORM Migrated Services

**Purpose**: Establish comprehensive testing approach for services migrated from raw SQL to TypeORM  
**Status**: Planning document - to be executed before Phase 3  
**Target Coverage**: 80% for migrated methods by end of Phase 2

---

## Current Testing State

### Coverage Analysis (Post-Session 20)

| Category | Services | Methods Migrated | Unit Tests | Integration Tests | E2E Tests |
|----------|----------|------------------|------------|-------------------|-----------|
| **Phase 1 (Simple)** | 26 | ~130 | ~10% | ~5% | ~2% |
| **Phase 2 (Moderate)** | 10.5 | ~45 | ~8% | ~3% | ~1% |
| **Total** | 36.5 | ~175 | ~9% | ~4% | ~1.5% |

**Gap**: Need ~140 unit tests and ~30 integration tests to reach 80% coverage target.

---

## Testing Pyramid for Migrated Services

```
        /\
       /  \     E2E Tests (5%)
      /____\    Critical user flows
     /      \   
    /        \  Integration Tests (15%)
   /__________\ Service interactions
  /            \
 /              \ Unit Tests (80%)
/________________\ Individual methods
```

### Layer Breakdown

**Unit Tests (80% of effort)**:
- Mock all dependencies (repositories, other services)
- Test each migrated method in isolation
- Focus: Correct TypeORM API usage, error handling, edge cases

**Integration Tests (15% of effort)**:
- Real database (test instance)
- Test service delegation chains
- Focus: Multi-service workflows, transaction boundaries

**E2E Tests (5% of effort)**:
- Full application stack
- Test critical business flows
- Focus: User-facing scenarios that exercise migrated services

---

## Unit Testing Patterns

### Pattern 1: Simple CRUD Method

**Example**: `GraphTypeService.getTypeById()`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GraphTypeService } from './graph-type.service';
import { GraphType } from './entities/graph-type.entity';

describe('GraphTypeService', () => {
  let service: GraphTypeService;
  let repository: jest.Mocked<Repository<GraphType>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphTypeService,
        {
          provide: getRepositoryToken(GraphType),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GraphTypeService>(GraphTypeService);
    repository = module.get(getRepositoryToken(GraphType));
  });

  describe('getTypeById', () => {
    it('should return graph type by id', async () => {
      const mockType: GraphType = {
        id: 'type-1',
        name: 'TestType',
        schema: {},
        organization_id: 'org-1',
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      repository.findOne.mockResolvedValue(mockType);

      const result = await service.getTypeById('type-1');

      expect(result).toEqual(mockType);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'type-1' },
      });
    });

    it('should return null when type not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getTypeById('nonexistent');

      expect(result).toBeNull();
    });

    it('should propagate repository errors', async () => {
      repository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.getTypeById('type-1')).rejects.toThrow('Database error');
    });
  });
});
```

**Coverage requirements**:
- ✅ Success case (entity found)
- ✅ Not found case (returns null/undefined)
- ✅ Error propagation
- Optional: Multiple calls (caching behavior if applicable)

---

### Pattern 2: Create with Validation

**Example**: `TemplatePackService.createTemplatePack()`

```typescript
describe('createTemplatePack', () => {
  it('should create new template pack', async () => {
    const dto = {
      name: 'TestPack',
      version: '1.0.0',
      type_schemas: {},
      extraction_prompts: {},
    };
    
    const createdEntity = {
      id: 'pack-1',
      ...dto,
      organization_id: 'org-1',
      created_at: new Date(),
    };
    
    repository.findOne.mockResolvedValue(null); // No duplicate
    repository.create.mockReturnValue(createdEntity as any);
    repository.save.mockResolvedValue(createdEntity as any);

    const result = await service.createTemplatePack(dto, 'org-1');

    expect(result).toEqual(createdEntity);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { name: dto.name, version: dto.version, organization_id: 'org-1' },
    });
    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      organization_id: 'org-1',
    });
    expect(repository.save).toHaveBeenCalledWith(createdEntity);
  });

  it('should throw ConflictException when duplicate exists', async () => {
    const dto = { name: 'Existing', version: '1.0.0' };
    
    repository.findOne.mockResolvedValue({ id: 'existing-1' } as any);

    await expect(
      service.createTemplatePack(dto, 'org-1')
    ).rejects.toThrow(ConflictException);
  });

  it('should handle invalid input gracefully', async () => {
    const invalidDto = { name: '', version: '1.0.0' }; // Empty name
    
    await expect(
      service.createTemplatePack(invalidDto as any, 'org-1')
    ).rejects.toThrow(); // Specific error depends on validation
  });
});
```

**Coverage requirements**:
- ✅ Success case (entity created)
- ✅ Duplicate detection (conflict exception)
- ✅ Invalid input (validation error)
- ✅ Default values applied correctly
- Optional: Transaction rollback on save failure

---

### Pattern 3: List with Filters

**Example**: `GraphTypeService.listTypes()`

```typescript
describe('listTypes', () => {
  it('should return all types when no filters', async () => {
    const mockTypes = [
      { id: 'type-1', name: 'Type1' },
      { id: 'type-2', name: 'Type2' },
    ];
    
    repository.find.mockResolvedValue(mockTypes as any);

    const result = await service.listTypes({}, 'org-1');

    expect(result).toEqual(mockTypes);
    expect(repository.find).toHaveBeenCalledWith({
      where: { organization_id: 'org-1' },
    });
  });

  it('should filter by name when provided', async () => {
    const mockTypes = [{ id: 'type-1', name: 'FilteredType' }];
    
    repository.find.mockResolvedValue(mockTypes as any);

    const result = await service.listTypes({ name: 'FilteredType' }, 'org-1');

    expect(result).toEqual(mockTypes);
    expect(repository.find).toHaveBeenCalledWith({
      where: { organization_id: 'org-1', name: 'FilteredType' },
    });
  });

  it('should return empty array when no matches', async () => {
    repository.find.mockResolvedValue([]);

    const result = await service.listTypes({ name: 'Nonexistent' }, 'org-1');

    expect(result).toEqual([]);
  });

  it('should handle pagination', async () => {
    const mockTypes = [{ id: 'type-1', name: 'Type1' }];
    
    repository.find.mockResolvedValue(mockTypes as any);

    const result = await service.listTypes(
      { skip: 10, take: 5 }, 
      'org-1'
    );

    expect(repository.find).toHaveBeenCalledWith({
      where: { organization_id: 'org-1' },
      skip: 10,
      take: 5,
    });
  });
});
```

**Coverage requirements**:
- ✅ No filters (returns all)
- ✅ With filters (applies correctly)
- ✅ Empty result set
- ✅ Pagination parameters
- Optional: Sorting, complex filter combinations

---

### Pattern 4: Service Delegation

**Example**: `ExtractionWorkerService.getRetryCount()` → `ExtractionJobService`

```typescript
describe('ExtractionWorkerService', () => {
  let worker: ExtractionWorkerService;
  let jobService: jest.Mocked<ExtractionJobService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionWorkerService,
        {
          provide: ExtractionJobService,
          useValue: {
            getRetryCount: jest.fn(),
          },
        },
      ],
    }).compile();

    worker = module.get<ExtractionWorkerService>(ExtractionWorkerService);
    jobService = module.get(ExtractionJobService);
  });

  describe('getRetryCount', () => {
    it('should delegate to job service', async () => {
      jobService.getRetryCount.mockResolvedValue(3);

      const result = await worker.getRetryCount('job-1');

      expect(result).toBe(3);
      expect(jobService.getRetryCount).toHaveBeenCalledWith('job-1');
    });

    it('should propagate errors from job service', async () => {
      jobService.getRetryCount.mockRejectedValue(new Error('Job service error'));

      await expect(worker.getRetryCount('job-1')).rejects.toThrow('Job service error');
    });
  });
});
```

**Coverage requirements**:
- ✅ Delegation path verified
- ✅ Correct parameters passed
- ✅ Response handling
- ✅ Error propagation
- Optional: Multiple delegation calls (performance)

---

## Integration Testing Patterns

### Pattern 5: Real Database Test (describeWithDb)

**Example**: Multi-service workflow

```typescript
import { describeWithDb } from '../../test/db-test-helpers';

describeWithDb('TemplatePackService Integration', (getDb) => {
  let service: TemplatePackService;
  let repository: Repository<TemplatePack>;

  beforeEach(async () => {
    const db = getDb();
    repository = db.getRepository(TemplatePack);
    service = new TemplatePackService(repository, /* other deps */);
  });

  afterEach(async () => {
    // Clean up test data
    await repository.delete({});
  });

  it('should create and retrieve template pack', async () => {
    // Create
    const dto = {
      name: 'IntegrationPack',
      version: '1.0.0',
      type_schemas: { TestType: {} },
    };
    
    const created = await service.createTemplatePack(dto, 'org-1');
    expect(created.id).toBeDefined();

    // Retrieve
    const retrieved = await service.getTemplatePackById(created.id);
    expect(retrieved).toMatchObject(dto);
  });

  it('should enforce unique constraint', async () => {
    const dto = { name: 'UniquePack', version: '1.0.0' };
    
    await service.createTemplatePack(dto, 'org-1');
    
    await expect(
      service.createTemplatePack(dto, 'org-1')
    ).rejects.toThrow(ConflictException);
  });
});
```

**Coverage requirements**:
- ✅ Create → Read workflow
- ✅ Database constraints enforced
- ✅ Transaction behavior
- ✅ Cleanup after tests
- Optional: Update → Read, Delete workflows

---

### Pattern 6: Cross-Service Integration

**Example**: ExtractionWorkerService using TemplatePackService

```typescript
describeWithDb('ExtractionWorker Integration', (getDb) => {
  let worker: ExtractionWorkerService;
  let templatePackService: TemplatePackService;
  let templatePackRepo: Repository<TemplatePack>;
  let projectPackRepo: Repository<ProjectTemplatePackAssignment>;

  beforeEach(async () => {
    const db = getDb();
    templatePackRepo = db.getRepository(TemplatePack);
    projectPackRepo = db.getRepository(ProjectTemplatePackAssignment);
    
    templatePackService = new TemplatePackService(
      templatePackRepo,
      projectPackRepo,
      /* other deps */
    );
    
    worker = new ExtractionWorkerService(
      /* job service */,
      templatePackService,
      /* other deps */
    );
  });

  afterEach(async () => {
    await projectPackRepo.delete({});
    await templatePackRepo.delete({});
  });

  it('should load extraction config from template packs', async () => {
    // Setup: Create template pack
    const pack = await templatePackService.createTemplatePack({
      name: 'TestPack',
      version: '1.0.0',
      extraction_prompts: { entity_extraction: 'prompt...' },
      type_schemas: { Person: {} },
    }, 'org-1');

    // Setup: Assign to project
    await templatePackService.assignTemplatePackToProject(
      pack.id,
      'project-1',
      'org-1'
    );

    // Test: Worker loads config
    const mockJob = {
      id: 'job-1',
      project_id: 'project-1',
      organization_id: 'org-1',
    };
    
    const config = await worker.loadExtractionConfig(mockJob as any);

    expect(config.schemas).toHaveProperty('Person');
    expect(config.prompts).toHaveProperty('entity_extraction');
  });
});
```

**Coverage requirements**:
- ✅ Service A creates data
- ✅ Service B reads/uses that data
- ✅ Nested relationships work correctly
- ✅ Cross-service error handling
- Optional: Transaction coordination

---

## Testing Priorities by Service Type

### Priority 1: Core CRUD Services (Sessions 1-5)
**Services**: GraphTypeService, GraphRelationshipService, GraphPropertyService, etc.

**Why high priority**:
- Foundation for other services
- Simple patterns (good starting point)
- High usage frequency

**Testing focus**:
- Unit tests: All CRUD methods (5-10 tests per service)
- Integration: Create → Read → Update → Delete workflows
- Target: 90% coverage

**Estimated effort**: 2-3 hours per service (~20 hours total for 8 services)

---

### Priority 2: Service Delegation Chains (Sessions 17-20)
**Services**: ExtractionWorkerService, ChatService, IngestionService

**Why high priority**:
- Complex multi-service workflows
- Recent migrations (good memory/context)
- Delegation patterns need verification

**Testing focus**:
- Unit tests: Delegation paths verified
- Integration: Full workflow with real database
- Target: 80% coverage

**Estimated effort**: 3-4 hours per service (~12 hours for 4 services)

---

### Priority 3: Partial Migrations (Sessions 16-20)
**Services**: TemplatePackService, NotificationsService, ExtractionWorkerService

**Why medium priority**:
- Mix of migrated and strategic SQL
- Need to verify boundaries clear
- Document what's tested vs preserved

**Testing focus**:
- Unit tests: Only migrated methods
- Integration: Strategic SQL paths (manual verification)
- Target: 70% coverage of migrated methods

**Estimated effort**: 2-3 hours per service (~10 hours for 4 services)

---

### Priority 4: Remaining Phase 1 Services (Sessions 6-10)
**Services**: Remaining simple CRUD services

**Why lower priority**:
- Similar patterns to Priority 1
- Less critical business logic
- Can batch test generation

**Testing focus**:
- Unit tests: Standard CRUD patterns
- Integration: Optional (similar to Priority 1)
- Target: 75% coverage

**Estimated effort**: 1-2 hours per service (~20 hours for 14 services)

---

## Test Generation Approach

### Manual Test Writing (Recommended for Priority 1-2)

**Advantages**:
- Deep understanding of service behavior
- Catch edge cases AI might miss
- Learn testing patterns hands-on

**Process**:
1. Read service implementation
2. Identify all code paths
3. Write tests for success, failure, edge cases
4. Run and verify coverage

**Tools**:
- Jest with NestJS testing utilities
- `describeWithDb` for integration tests
- Coverage report: `nx run server:test-coverage`

---

### AI-Assisted Test Generation (Acceptable for Priority 3-4)

**Advantages**:
- Faster initial test scaffold
- Good for repetitive CRUD patterns
- Can batch generate similar tests

**Process**:
1. Provide service code to AI
2. Generate test scaffolds
3. **Review and customize** (critical!)
4. Add edge cases AI missed

**Caution**: Always review AI-generated tests. Verify:
- Mocks configured correctly
- Edge cases covered
- Error cases tested
- Coverage actually meaningful

---

## Testing Timeline & Milestones

### Milestone 1: Core Services (Weeks 1-2)
**Goal**: Test 8 Priority 1 services (GraphType, GraphRelationship, etc.)

**Deliverables**:
- 80+ unit tests written
- 10+ integration tests
- 90% coverage for these services
- Patterns documented

**Estimated effort**: 20 hours

---

### Milestone 2: Delegation Chains (Week 3)
**Goal**: Test 4 Priority 2 services (ExtractionWorker, Chat, etc.)

**Deliverables**:
- 60+ unit tests written
- 8+ integration tests
- 80% coverage for these services
- Cross-service test patterns documented

**Estimated effort**: 12 hours

---

### Milestone 3: Partial Migrations (Week 4)
**Goal**: Test migrated methods in 4 Priority 3 services

**Deliverables**:
- 40+ unit tests written
- 5+ integration tests
- 70% coverage of migrated methods
- Strategic SQL boundaries verified

**Estimated effort**: 10 hours

---

### Milestone 4: Remaining Services (Weeks 5-6)
**Goal**: Test 14 Priority 4 services

**Deliverables**:
- 100+ unit tests written (may use AI assistance)
- 10+ integration tests
- 75% coverage
- Complete coverage report

**Estimated effort**: 20 hours

---

### Total Effort Estimate
**Timeline**: 6 weeks  
**Total hours**: ~62 hours  
**Sessions**: ~12-15 sessions (4-5 hours each)  
**Final coverage**: ~80% of migrated methods

---

## Coverage Tracking

### Coverage Report Format

```bash
# Run full test suite with coverage
nx run server:test-coverage

# View HTML report
open apps/server/coverage/lcov-report/index.html
```

### Target Metrics

| Service Category | Target Coverage | Actual | Status |
|-----------------|-----------------|--------|---------|
| **Phase 1 Simple CRUD** | 90% | TBD | 🔴 Not started |
| **Phase 2 Delegation** | 80% | TBD | 🔴 Not started |
| **Phase 2 Partial** | 70% | TBD | 🔴 Not started |
| **Overall Migrated Code** | 80% | ~9% | 🔴 Major gap |

**Goal**: All categories green before Phase 3 begins.

---

## Testing Best Practices

### 1. Test Isolation
```typescript
// ✅ GOOD: Each test isolated
it('should create entity', async () => {
  const result = await service.create(mockDto);
  expect(result).toBeDefined();
});

it('should get entity', async () => {
  repository.findOne.mockResolvedValue(mockEntity);
  const result = await service.getById('id');
  expect(result).toEqual(mockEntity);
});

// ❌ BAD: Tests depend on each other
let createdEntity;
it('should create entity', async () => {
  createdEntity = await service.create(mockDto);
});
it('should get created entity', async () => {
  const result = await service.getById(createdEntity.id);
  expect(result).toEqual(createdEntity);
});
```

### 2. Mock Granularity
```typescript
// ✅ GOOD: Mock only what you use
repository.findOne.mockResolvedValue(mockEntity);

// ❌ BAD: Mock everything "just in case"
repository.findOne.mockResolvedValue(mockEntity);
repository.find.mockResolvedValue([]);
repository.save.mockResolvedValue({});
// ... unused mocks
```

### 3. Descriptive Test Names
```typescript
// ✅ GOOD: Clear intent
it('should throw ConflictException when duplicate name exists', ...);
it('should return null when entity not found', ...);

// ❌ BAD: Vague
it('should work', ...);
it('should handle errors', ...);
```

### 4. Arrange-Act-Assert Pattern
```typescript
it('should create entity with defaults', async () => {
  // Arrange: Set up test data
  const dto = { name: 'Test' };
  repository.save.mockResolvedValue({ id: '1', ...dto, status: 'active' });
  
  // Act: Perform the action
  const result = await service.create(dto);
  
  // Assert: Verify the outcome
  expect(result.status).toBe('active');
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'active' })
  );
});
```

---

## Common Testing Challenges

### Challenge 1: Testing Strategic SQL

**Problem**: Strategic SQL methods preserved intentionally - how to test?

**Solution**: Manual verification + documentation

```typescript
/**
 * recoverOrphanedJobs() - Strategic SQL preserved
 * 
 * Testing approach:
 * 1. Manual verification in development environment
 * 2. Monitor production behavior
 * 3. Integration test with real database (slow, run separately)
 * 
 * Not included in unit test coverage metrics.
 */
async recoverOrphanedJobs(): Promise<void> {
  // RLS + loop + transaction logic
}

// Separate integration test (marked as slow)
describeWithDb.slow('recoverOrphanedJobs - Integration', (getDb) => {
  it('should recover stuck jobs', async () => {
    // Setup: Create stuck job
    // Run: Execute recovery
    // Verify: Job status updated correctly
  });
});
```

---

### Challenge 2: Testing RLS Context

**Problem**: TypeORM tests don't naturally set RLS context

**Solution**: Use `describeWithDb` helper that sets context

```typescript
describeWithDb('Service with RLS', (getDb) => {
  beforeEach(async () => {
    const db = getDb();
    // RLS context already set by describeWithDb helper
    service = new Service(db.getRepository(Entity));
  });

  it('should only return entities for current tenant', async () => {
    // Test sees only org-1's data (RLS enforced)
    const results = await service.list();
    results.forEach(r => {
      expect(r.organization_id).toBe('org-1');
    });
  });
});
```

---

### Challenge 3: Testing Cross-Service Dependencies

**Problem**: Service A depends on Service B - how to test A in isolation?

**Solution**: Mock Service B for unit tests, use real for integration

```typescript
// Unit test: Mock dependencies
describe('ServiceA Unit', () => {
  let serviceA: ServiceA;
  let mockServiceB: jest.Mocked<ServiceB>;

  beforeEach(() => {
    mockServiceB = {
      method: jest.fn(),
    } as any;
    
    serviceA = new ServiceA(mockServiceB);
  });

  it('should use ServiceB correctly', async () => {
    mockServiceB.method.mockResolvedValue('result');
    await serviceA.doSomething();
    expect(mockServiceB.method).toHaveBeenCalled();
  });
});

// Integration test: Real dependencies
describeWithDb('ServiceA Integration', (getDb) => {
  let serviceA: ServiceA;
  let serviceB: ServiceB;

  beforeEach(() => {
    const db = getDb();
    serviceB = new ServiceB(db.getRepository(EntityB));
    serviceA = new ServiceA(serviceB);
  });

  it('should work end-to-end', async () => {
    const result = await serviceA.doSomething();
    // Verify actual database state
  });
});
```

---

## Next Actions

### Immediate (This Week)
1. ✅ Create this testing strategy document
2. ⏳ Create test template files (Jest describe blocks for common patterns)
3. ⏳ Set up coverage tracking dashboard
4. ⏳ Begin Milestone 1: Test GraphTypeService (pilot)

### Short-term (Next 2 Weeks)
1. Complete Milestone 1: Priority 1 services (8 services)
2. Document lessons learned from first testing sprint
3. Refine patterns based on actual testing experience

### Medium-term (Next 6 Weeks)
1. Complete Milestones 2-4: All priority services tested
2. Achieve 80% coverage target
3. Conduct testing strategy review
4. Prepare for Phase 3 with robust test foundation

---

## Success Criteria

**Before starting Phase 3, we should have**:

- [ ] 80% unit test coverage for migrated methods
- [ ] 15% integration test coverage for cross-service workflows
- [ ] 5% E2E test coverage for critical user flows
- [ ] All Priority 1-2 services fully tested
- [ ] Testing patterns documented and proven
- [ ] CI/CD pipeline includes test runs
- [ ] Coverage tracking automated
- [ ] Team confident in test suite quality

**If these criteria not met**: Pause migrations, focus on testing until met.

---

## Conclusion

Testing is not optional. 36.5 services migrated without adequate tests creates technical debt and risk. This strategy provides a clear path to:

1. **Catch regressions**: Tests verify migrations maintain correctness
2. **Document behavior**: Tests serve as living documentation
3. **Enable refactoring**: Confidence to improve code further
4. **Support maintenance**: Future developers understand expected behavior

**Recommendation**: Dedicate next 2-3 sessions to testing before any new migrations. Build quality foundation for Phase 3.

---

**Document Status**: Planning document - execution pending  
**Created**: November 8, 2025  
**Next Review**: After Milestone 1 completion
