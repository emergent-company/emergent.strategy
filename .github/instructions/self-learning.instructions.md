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

### 2025-12-30 - Work Files Belong in .epf-work/, Not Production Directories

**Context**: After migrating EPF output validators from TypeScript to shell scripts, created several analysis and implementation documents in `docs/EPF/outputs/` directory.

**Mistake**: Created temporary work/analysis documents directly in production directory:
- `docs/EPF/outputs/VALIDATOR_ARCHITECTURE_DECISION.md`
- `docs/EPF/outputs/IMPLEMENTATION_SUMMARY.md`
- `docs/EPF/outputs/INVESTOR_MEMO_IMPLEMENTATION.md`
- `docs/EPF/outputs/validation/*.archived` files

User had to remind me that these belong in `.epf-work/` directory.

**Why It Was Wrong**:
- Production directories should only contain files that are part of the actual system
- Work documents, analysis, implementation notes, and archived files clutter production structure
- Makes it unclear what's "real" vs "temporary" for other developers
- This is the SECOND time user has had to remind me about this pattern (forgot the established convention)

**Correct Approach**:
1. **ALWAYS put work/analysis documents in `.epf-work/`** with appropriate subdirectory:
   ```bash
   .epf-work/validator-migration/
   .epf-work/feature-analysis/
   .epf-work/debugging-sessions/
   ```

2. **Production directories contain ONLY**:
   - Schemas (JSON Schema files)
   - Wizards (generator instructions)
   - Templates (output templates)
   - Validation scripts (executable validators)
   - README.md (user documentation)

3. **Work documents include**:
   - Architecture decision records
   - Implementation summaries
   - Analysis documents
   - Session notes
   - Archived/old versions

**Prevention**:
- **BEFORE creating ANY .md document**, ask: "Is this a production file or work document?"
- If it contains: "DECISION", "IMPLEMENTATION", "ANALYSIS", "SUMMARY", "ARCHIVED" → `.epf-work/`
- If it explains how to USE the system → production directory (e.g., `README.md`)
- When archiving old code, delete it OR move to `.epf-work/archived-*`
- Check `.epf-work/` directory structure FIRST before creating new analysis docs
- Remember: User has corrected this pattern multiple times - it's a core convention!

**Related Files/Conventions**:
- `.epf-work/` - Root directory for ALL temporary/work files
- `docs/EPF/outputs/` - Production output system files ONLY
- Pattern applies to ALL workspace areas, not just EPF

**Key Takeaway**: `.epf-work/` exists specifically for this purpose. Work documents pollute production directories and confuse structure. This is an established project convention that must be followed consistently.

---

### 2025-11-10 - Testing Sprint Session 9 - Database Migration to 99.6% Coverage (Excellence Achieved!)

**Context**: Pushing from 98.7% (Session 8) to 99%+ coverage. User chose "Option B" - database migration approach to fix pgvector dimension mismatch blocking 11 graph-vector tests.

**Mistake**: None major in this session! Applied lessons from previous sessions correctly. However, had 3 test configuration attempts before finding the right balance.

**Why Multiple Attempts Were Needed**:
- **Attempt 1**: Original StubGraphModule had no controllers → 404 errors on all endpoints
- **Attempt 2**: Removed stub override (used full GraphModule) → TypeORM dependency errors
- **Attempt 3**: Hybrid StubGraphModule with real controller + services → ✅ Success!

**Root Cause of Test Challenge**:
E2E tests need a balance:
- Need **real controllers** to register HTTP endpoints (avoid 404s)
- Need **real services** that do actual work (GraphVectorSearchService)
- Need **stubbed services** that require TypeORM repositories (GraphService, EmbeddingJobsService)
- Cannot use full module without TypeORM.forRoot() configuration

**Correct Approach - Database Migration + Hybrid Module Pattern**:

**Step 1: Fix Infrastructure First**
```sql
-- Created migration: 20251110_update_embedding_vec_dimensions.sql
ALTER TABLE kb.graph_objects 
    ALTER COLUMN embedding_vec TYPE vector(768);
```
Applied with: `docker exec -i spec-server-2-db-1 psql -U spec -d spec < migration.sql`

**Step 2: Hybrid StubGraphModule for E2E Tests**
```typescript
@Module({
    imports: [
        AppConfigModule,
        DatabaseModule  // ← Provides DatabaseService for queries
    ],
    controllers: [
        GraphObjectsController  // ← Real: registers HTTP endpoints
    ],
    providers: [
        GraphVectorSearchService,  // ← Real: executes actual pgvector queries
        { provide: GraphService, useValue: {} },  // ← Stub: avoid TypeORM
        { provide: EmbeddingJobsService, useValue: {} },  // ← Stub: avoid TypeORM
        { provide: 'EMBEDDING_PROVIDER', useFactory: ... }
    ]
})
class StubGraphModule { }
```

**Results**:
- Migration applied: ✅ vector(32) → vector(768)
- Tests fixed: ✅ All 11 graph-vector tests passing
- Coverage achieved: ✅ **1121/1125 (99.6%)**
- Time: ~50 minutes (investigation → migration → test fixes → verification)
- **Goal exceeded**: Target 99.0%, achieved 99.6% (+0.6% bonus!)

**Prevention & Best Practices**:
- **Database Issues First**: Always fix infrastructure before debugging test configuration
- **Hybrid Module Pattern**: For E2E tests, include real controllers + services that do work, stub services that need repositories
- **Verify Schema**: Database constraints must match code expectations (vector dimensions, NOT NULL, etc.)
- **Migration Documentation**: Always document why dimensions/types were chosen
- **Test Balance**: E2E tests need real endpoints but not full DI container

**Pattern Decision Tree for Test Modules** (Updated):
```
Error/Symptom                                    → Action
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"expected 32 dimensions, not 768"                → Fix database schema (migration)
"expected 200 OK, got 404 Not Found"            → Add real controllers to test module
"Nest can't resolve dependencies... Repository" → Use hybrid stub (real controllers, stub repos)
"Key format conversion failed" / DECODER error   → Mock crypto module
"Cannot find name 'jose'"                        → Mock jose module

Test Needs                                       → Module Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HTTP endpoints only                              → Real controllers, stub everything else
HTTP endpoints + database queries                → Real controllers + real query services + DatabaseModule
HTTP endpoints + TypeORM repositories            → Full module OR Pattern 5 Level 3
```

**Coverage Progression (All Sessions)**:
```
Session  Milestone              Tests      Coverage   Gain      Pattern
─────────────────────────────────────────────────────────────────────────
3        Documents Fix          1003       89.2%      +9        Pattern 5 L3
4        Invites Fix            1017       90.4%      +14       Pattern 5 L3
5        Orgs Fix               1039       92.4%      +24       Mock Layer Alignment
6        Product Version        1063       94.5%      +8        Hybrid Mock
7        TypeORM + Chat         1063       94.5%      +33       Dual Module + Mock
8        Zitadel               1110       98.7%      +7        Crypto Mock
9        Database Migration     1121       99.6%      +11       DB Migration + Hybrid ✅
─────────────────────────────────────────────────────────────────────────
Total                           +118 tests +10.5%     Epic Win! 🎉
```

**Key Discovery**: **Database Migration + Hybrid Test Module Pattern**
- When code expects different dimensions/types than database schema
- Create migration first, then fix tests
- For E2E vector operations: real controllers + real vector services + DatabaseModule
- Stub only services that require TypeORM repositories
- Balance between full module (heavy) and pure stubs (incomplete)

**Strategic Achievement**:
- **99.6% coverage** achieved (exceeded 99% goal!)
- Only **4 tests skipped** (infrastructure constraints, acceptable)
- **Zero failing tests** in final run
- Pattern mastery: 10min → 25min → 50min per session (increasing complexity, consistent success)

**Related Files/Conventions**:
- `apps/server/migrations/20251110_update_embedding_vec_dimensions.sql` (DB migration)
- `apps/server/tests/graph/graph-vector.controller.spec.ts` (hybrid stub pattern)
- `docs/TESTING_SPRINT_SESSION9_FINAL.md` (comprehensive report + 99.6% achievement)
- New pattern: **Database Migration + Hybrid Test Module** (for E2E with real queries)

**Key Takeaway**: Fix infrastructure first (database schema), then configure tests appropriately. Hybrid test modules work best for E2E: real controllers + real services that do work + stubbed services that need complex dependencies. Always verify database constraints match code expectations. Document dimension choices in schema comments for future reference.

**Victory Lap**: From 89.2% (Session 3) to 99.6% (Session 9) = **+10.5% coverage** in 6 focused sessions. Pattern-based systematic fixing highly effective. Database migrations unlock entire feature test suites when schema constraints block operations.

---

### 2025-11-10 - Testing Sprint Session 8 - Crypto Module Mocking for Key Conversion (98.7% Milestone!)

**Context**: Targeting zitadel.service.spec.ts to reach 98.7% coverage. Expected 7 failures based on previous grep output. Actually found 17 failures when tests ran.

**Mistake**: Assumed all failures were due to variable name mismatches from service refactoring (cachedToken → cachedApiToken). Didn't investigate why 17 failures instead of expected 7.

**Why It Was Wrong**:
- 13 of 17 failures were **"Key format conversion failed: error:1E08010C:DECODER routines::unsupported"**
- Service has PKCS#1 to PKCS#8 key conversion logic using `crypto.createPrivateKey()`
- Tests use mock keys with "BEGIN RSA PRIVATE KEY" header (PKCS#1 format)
- Real Node.js crypto module tried to convert mock keys and failed
- Only 4 failures were actually variable name mismatches

**Root Cause**:
```typescript
// Service code (zitadel.service.ts:860-890)
if (keyToImport.includes('BEGIN RSA PRIVATE KEY')) {
    const crypto = await import('crypto');
    const keyObject = crypto.createPrivateKey({
        key: keyToImport,
        format: 'pem',
        type: 'pkcs1'  // ← Real crypto can't convert mock keys!
    });
    keyToImport = keyObject.export({ type: 'pkcs8', format: 'pem' });
}
```

**Correct Approach**:

1. **First**: Run tests to see actual errors (don't rely only on previous grep counts)
2. **Identify primary vs secondary issues**: 
   - Primary: Crypto conversion (13 failures) 
   - Secondary: Variable names (4 failures)
3. **Fix in order of impact**: Fix crypto mock first (13 → 4), then variables (4 → 0)

**Solution - Mock Crypto Module**:
```typescript
// Add at top of test file (same level as jose mock)
vi.mock('crypto', async () => {
    const actual = await vi.importActual('crypto');
    return {
        ...actual,
        createPrivateKey: vi.fn().mockReturnValue({
            export: vi.fn().mockReturnValue('-----BEGIN PRIVATE KEY-----\nMOCK_PKCS8_KEY\n-----END PRIVATE KEY-----'),
        }),
    };
});
```

**Results**:
- After crypto mock: 17 failures → 4 failures (+13 tests, 76% of issue)
- After variable updates: 4 failures → 0 failures (+4 tests, 24% of issue)
- **Total**: +7 tests net gain (1103 → 1110, 98.0% → 98.7%)
- **Time**: ~25 minutes (crypto mock + 5 variable updates)
- **Milestone**: ✅ **98.7% coverage achieved!**

**Prevention**:
- **Always run tests first** to see actual errors, don't rely only on static analysis
- **Check for crypto/jose/fetch usage** in service implementation - these often need mocking
- **Look for key conversion logic** (PKCS#1, PKCS#8, PEM, DER formats) - real crypto can't process mock keys
- **Mock crypto module early** when service does cryptographic operations
- **Preserve actual crypto exports** (`...actual`) for other uses
- **Mock only failing methods** (e.g., `createPrivateKey`) not entire module

**Pattern Decision Tree** (Updated with Crypto Mocking):
```
Error/Symptom                                    → Action
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Key format conversion failed" / DECODER error   → Mock crypto module ✅ NEW
"Cannot find name 'jose'"                        → Mock jose module
Service uses fetch()                             → Mock global.fetch
"expected X to be defined" (refactored service)  → Update variable names
Repository not found / DI issues                 → Pattern 5 Level 3
Mock layer mismatch (Repository vs SQL)          → Mock Layer Alignment

Service Implementation Contains                  → Test Must Mock
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
crypto.createPrivateKey / crypto.createHash      → Mock crypto module
jose.importPKCS8 / jose.SignJWT                 → Mock jose module
fetch() for HTTP calls                           → Mock global.fetch
PKCS#1 → PKCS#8 conversion                      → Mock crypto.createPrivateKey
```

**Performance Comparison**:
```
Session  Service            Pattern                    Tests  Time
────────────────────────────────────────────────────────────────────
3        documents          Pattern 5 L3 (full)        +9     ~2h
4        invites            Pattern 5 L3 (full)        +14    ~2h
5        orgs               Mock Layer Alignment       +24    ~30min
6        product-version    Hybrid Layer Align         +8     ~10min
7        typeorm+chat+      Dual Module + Mock + P5L3  +33    ~3h
         audit
8        zitadel            Crypto Mock + Variables    +7     ~25min ✅
```

**Key Discovery**: **Crypto Module Mocking Pattern** (NEW)
- When service uses `crypto` module for key conversion, signing, hashing
- Tests with mock data (keys, certificates) can't use real crypto operations
- Mock `crypto.createPrivateKey()`, `crypto.createHash()`, etc. with deterministic returns
- Preserve actual exports: `const actual = await vi.importActual('crypto'); return { ...actual, ... }`
- Error signatures: "DECODER routines", "Key format conversion failed", "unsupported"
- Place crypto mock at file top alongside other library mocks (jose, fetch)

**Dual Service Account Architecture** (Bonus Discovery):
Service was refactored from single to dual service account pattern:
```
Old: serviceAccountKey + cachedToken
New: clientServiceAccountKey + apiServiceAccountKey + 
     cachedClientToken + cachedApiToken
```
- CLIENT account: Minimal permissions (token introspection only)
- API account: Elevated permissions (Management API operations)
- Security benefit: Least privilege principle, reduced blast radius
- Tests must update variable references after service refactoring

**Related Files/Conventions**:
- `apps/server/src/modules/auth/__tests__/zitadel.service.spec.ts` (crypto mock + variable fixes)
- `apps/server/src/modules/auth/zitadel.service.ts` (PKCS#1 conversion logic lines 860-890)
- `docs/TESTING_SPRINT_SESSION8_FINAL.md` (comprehensive analysis + 98.7% milestone)
- New pattern: **Crypto Module Mocking** (for key conversion, cryptographic operations)

**Key Takeaway**: When service does cryptographic operations (key conversion, signing, hashing) on mock test data, real crypto modules will fail. Mock crypto module methods to return deterministic mock output. Always run tests first to see actual errors - don't assume based on static analysis or grep counts. Crypto mocking is fast and effective: fixed 13 of 17 failures (76%) in 5 minutes!

**Strategic Insight**: Only **4 tests remain to 99% coverage**! Sessions 6-8 gained +22 tests in under 1 hour of work. Pattern mastery accelerating: 2h → 30min → 10min → 25min per session.

---

### 2025-11-09 - Testing Sprint Session 6 - Hybrid Mock Layer Alignment (95% Milestone!)

**Context**: Continuing from Session 5 breakthrough (94.5%, +24 tests). Targeting product-version.service.spec.ts (7 failures) to reach exactly 95% coverage goal.

**Initial Assumption**: Low passing rate (1/8 = 12.5%) suggested full Pattern 5 Level 3 conversion needed (like Sessions 3-4). Expected ~2 hours of work.

**Reality Discovery**: Simple constructor parameter mismatch! Tests passed only 1 parameter when service expected 4.

**Why Initial Analysis Was Wrong**:
- Jumped to "low passing rate = complex fix" without checking constructor
- Service had clear 4-parameter DI signature but tests only provided FakeDb
- TypeScript errors clearly stated "Expected 4 arguments, but got 1"
- Should have checked constructor signature FIRST before assuming infrastructure problems

**Root Cause**:
```typescript
// Service Constructor (4 parameters)
constructor(
  @InjectRepository(ProductVersion)
  private readonly productVersionRepository: Repository<ProductVersion>,
  @InjectRepository(ProductVersionMember)
  private readonly memberRepository: Repository<ProductVersionMember>,
  private readonly dataSource: DataSource,
  @Inject(DatabaseService) private readonly db: DatabaseService
) {}

// Test Instantiation (WRONG - only 1 parameter)
const svc = new ProductVersionService(new FakeDb(() => client) as any);
// ❌ Missing 3 required dependencies!
```

**Correct Approach - Hybrid Mock Layer Alignment**:

1. **Check constructor signature FIRST** (before analyzing infrastructure):
   ```bash
   grep "constructor" apps/server/src/modules/graph/product-version.service.ts
   ```

2. **Provide ALL constructor parameters**:
   ```typescript
   const mockProductVersionRepo = createMockRepository();
   const mockMemberRepo = createMockRepository();
   const mockDataSource = {} as any;
   const svc = new ProductVersionService(
       mockProductVersionRepo as any,
       mockMemberRepo as any,
       mockDataSource,
       new FakeDb(() => client) as any
   );
   ```

3. **Mock appropriate abstraction layers per method**:
   - `create()` uses raw SQL → FakeDb/FakeClient sufficient
   - `get()` uses Repository → Mock `findOne()` and `count()`
   - Both need all 4 constructor params regardless

**Results**:
- Fixed all 7 tests in 1 iteration (100% success rate)
- **Gained**: +8 tests (1063 → 1071, 94.5% → 95.2%)
- **Time**: ~10 minutes (FASTEST session yet!)
- **Milestone**: ✅ **95% coverage achieved!** (+0.2% bonus)

**Prevention**:
- **Always check constructor signature first** when low passing rate
- Don't assume "low passing rate = complex infrastructure fix"
- TypeScript compiler errors often point directly to solution
- Constructor parameter count matters more than infrastructure complexity
- Read service code to understand which methods use which abstraction layers

**Pattern Decision Tree** (Updated with Hybrid):
```
Test Status                                      → Action
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0-30% passing, no Pattern 5 L3                  → Full infrastructure replacement
0-30% passing, TypeScript "Expected N args"     → Hybrid Mock Layer Alignment ✅ NEW
30-60% passing, incomplete infrastructure       → Complete infrastructure + fix logic
60%+ passing, infrastructure present            → Mock Layer Alignment only
100% failing, error mentions Repository         → Pattern 5 Level 3 conversion

Constructor Check (NEW FIRST STEP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Clear 3-4+ parameters, tests provide 1-2        → Hybrid Mock Layer Alignment (fastest!)
Unclear dependencies, complex DI                → Pattern 5 Level 3 conversion
```

**Performance Comparison**:
```
Session  Service            Passing Rate  Approach               Tests  Time
────────────────────────────────────────────────────────────────────────────
3        documents          0%            Pattern 5 L3 (full)    +9     ~2h
4        invites            0%            Pattern 5 L3 (full)    +14    ~2h
5        orgs.service       60% (9/15)    Mock Layer Alignment   +24    ~30min
6        product-version    12.5% (1/8)   Hybrid Layer Align     +8     ~10min ✅
```

**Why Session 6 Was Fastest**:
- Simple root cause (missing constructor params)
- Small test file (8 tests vs 15-17 in other sessions)
- Clear TypeScript compiler errors pointing to solution
- No cascading infrastructure issues to debug

**Key Discovery**: **Hybrid Mock Layer Alignment** (NEW Pattern!)
- When service uses **multiple abstraction layers** (raw SQL + Repository)
- Constructor has **clear dependency injection** (multiple parameters)
- Tests mock **only one layer** but service expects **multiple dependencies**
- **Solution**: Provide all constructor params, mock each layer appropriately
- **Speed**: Fastest pattern yet (~10 minutes vs 30 min to 2 hours)

**Related Files/Conventions**:
- `apps/server/tests/product-version.service.spec.ts` (Hybrid Mock Layer Alignment)
- `docs/TESTING_SPRINT_SESSION6_FINAL.md` (comprehensive analysis + 95% milestone)
- New pattern: **Hybrid Mock Layer Alignment** (constructor + multi-layer mocking)

**Key Takeaway**: Constructor parameter count matters more than infrastructure complexity. Always check service constructor signature first. Low passing rate + clear TypeScript errors about argument count = quick Hybrid Mock Layer Alignment fix. Don't waste time assuming complex infrastructure conversion when simple parameter addition solves it!

**Strategic Insight**: Pattern selection order matters:
1. **First**: Check constructor (TypeScript errors about argument count?)
2. **Second**: Check passing rate (60%+ = Mock Layer Alignment, 0-30% = Pattern 5 L3 or Hybrid)
3. **Third**: Analyze service code (mixed abstractions = Hybrid, single pattern = standard approach)

---

### 2025-11-09 - Testing Sprint Session 5 - Mock Layer Alignment Discovery

**Context**: Continuing toward 95% coverage goal (at 92.4% from Session 4). Targeted orgs.service.spec.ts expecting 13 failures per todo, found only 6 failures with infrastructure already present.

**Mistake**: Initially started analyzing as if full Pattern 5 Level 3 conversion was needed (like Sessions 3-4), wasting time before discovering infrastructure was already complete.

**Why It Was Wrong**:
- Test file already had complete Pattern 5 Level 3 infrastructure (createMockRepository, FakeDataSource, FakeQueryRunner, FakeDb, pgError helper)
- 9/15 tests already passing (60% success rate) proved infrastructure worked
- 6 failures were **mock layer misalignment**, not infrastructure problems
- Tests mocked wrong abstraction layers:
  - ❌ Mocked `dataSource.query()` when service used `membershipRepo.createQueryBuilder().getCount()`
  - ❌ Used `FakeClient` when service used `queryRunner.manager.save()`
  - ❌ Mocked `dataSource.query()` when service used `orgRepo.delete()`
- Root cause: Tests mocked low-level query execution, but service used high-level TypeORM abstractions

**Correct Approach - Mock Layer Alignment Pattern**:
1. **Read service code first** to identify exact abstraction layers used:
   - Does it use `Repository.method()`?
   - Does it use `QueryBuilder` chains?
   - Does it use `QueryRunner.manager.save()`?
   - Does it use raw `DataSource.query()`?

2. **Mock at the SAME abstraction level**:
   ```typescript
   // Service uses QueryBuilder
   const count = await this.membershipRepo.createQueryBuilder('om').getCount();
   
   // Test MUST mock QueryBuilder, NOT dataSource.query()
   const mockQueryBuilder = {
       where: vi.fn().mockReturnThis(),
       getCount: vi.fn().mockResolvedValue(100)  // ← Mock THIS layer
   };
   membershipRepo.createQueryBuilder = vi.fn().mockReturnValue(mockQueryBuilder);
   ```

3. **Use existing infrastructure properly**:
   - If `FakeQueryRunner` exists, use it (don't create FakeClient)
   - If `createMockRepository()` exists, extend it (don't bypass)
   - If `pgError()` helper exists, use it consistently

4. **Verify layer matching before fixing**:
   - Grep service code for method calls: `Repository.`, `createQueryBuilder`, `QueryRunner`, `DataSource.query`
   - Map each to corresponding mock setup in test
   - Fix mismatches systematically

**Results**:
- Fixed all 6 tests in 1 iteration (100% success rate)
- **Bonus**: +18 additional tests passed (cascading fix!)
- **Total gain**: +24 tests (1039 → 1063, 92.4% → 94.5%)
- **Time**: ~30 minutes (vs ~2 hours for full Pattern 5 L3 conversion)
- **Distance to 95%**: Only +7 tests remaining!

**Prevention**:
- **Before assuming infrastructure conversion needed**: Check current test status! 60%+ passing = infrastructure likely works
- **Always read service code first**: Understand abstraction layers before writing/fixing mocks
- **Match mock layers to service layers**: Repository→Repository, QueryBuilder→QueryBuilder, QueryRunner→QueryRunner
- **Use existing infrastructure**: Don't reinvent (FakeClient) when pattern exists (FakeQueryRunner)
- **Check for cascading opportunities**: Fixing base infrastructure can yield 3-4x direct gains

**Pattern Decision Tree** (Updated):
```
Test Status                                      → Action
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0-30% passing, no Pattern 5 L3                  → Full infrastructure replacement
30-60% passing, incomplete infrastructure       → Complete infrastructure + fix logic
60%+ passing, infrastructure present            → Mock Layer Alignment only ✅ NEW
100% failing, error mentions Repository         → Pattern 5 Level 3 conversion

Service Uses                                     → Test Must Mock
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Repository.method()                              → Repository.method()
createQueryBuilder().chain()                     → createQueryBuilder() mock
QueryRunner.manager.save()                       → FakeQueryRunner.manager.save()
DataSource.query() (raw SQL)                     → FakeDataSource.query()
```

**Cascading Fix Phenomenon**:
- **Direct**: orgs.service.spec.ts +6 tests
- **Indirect**: +18 tests across other files (3x multiplier!)
- **Hypothesis**: Shared infrastructure improvements (FakeQueryRunner, FakeDataSource) benefited other test files
- **Strategic Implication**: Target services with high reuse potential for maximum cascade effect

**Related Files/Conventions**:
- `apps/server/tests/orgs.service.spec.ts` (Mock Layer Alignment fixes)
- `docs/TESTING_SPRINT_SESSION5_FINAL.md` (comprehensive analysis)
- New pattern: **Mock Layer Alignment** (abstraction level matching)

**Key Takeaway**: Infrastructure completeness doesn't guarantee test success. Mock layers must align with service abstraction layers. When 60%+ tests already pass, focus on mock layer alignment instead of infrastructure replacement. Always read service code to understand exact TypeORM patterns used (Repository vs QueryBuilder vs QueryRunner vs raw SQL).

---

### 2025-11-09 - Testing Sprint Session 2 Complete - Pattern-Based Test Fixing

**Context**: Testing Sprint Session 2 systematically applied 4 discovered fix patterns to 9 services. Target: 80% tests (900/1125) and 85% files (98/115).

**Results**:
- **Tests**: 910/1125 (80.9%) - ✅ EXCEEDED target by +0.9%
- **Files**: 83/115 (72.2%) - ❌ MISSED target by -12.8%
- **Net gain**: +74 tests, +1 file from Session 2 start (836 tests, 82 files)
- **Services improved**: 9 (2 complete at 100%, 7 partial at 33-76%)

**Why Tests Target Met But Files Target Missed**:
- Test improvements within files don't flip file status automatically
- Need ~90% tests passing per file to reliably move file to "passing"
- Partial improvements (47-76%) add many tests but keep files in "failing"
- Example: EmbeddingPolicyService 0→19 tests (76%) but file still "failing"
- Files harder to move than tests - this is NORMAL

**Pattern Effectiveness by Complexity**:

| Pattern | Success Rate | Best Use Case |
|---------|--------------|---------------|
| 1: Repository Mock | 100% | Simple services with basic repository usage |
| 2: Jest→Vitest | 48% | Basic conversions (QueryBuilder issues limit) |
| 3: Constructor Param | 100%→33% | Diminishes with service complexity |
| 4: Repository Provider | 47%→76% | Complex DI, varies by service architecture |

**Pattern 4 Critical Learnings** (Most Complex):
1. ❌ WRONG: `import { DataSource } from '@nestjs/typeorm'` → ✅ CORRECT: `from 'typeorm'`
2. ❌ WRONG: `provide: 'DataSource'` (string) → ✅ CORRECT: `provide: DataSource` (class)
3. ❌ WRONG: Entity from module path → ✅ CORRECT: From `src/entities/`
4. ❌ MISSING: Rely on DI alone → ✅ REQUIRED: Manual mock assignment `(service as any).dep = mock`
5. Must include ALL CRUD methods: findOne, find, save, create, update, delete, increment, createQueryBuilder
6. Share query mock: `mockDataSource.query = mockDb.query`
7. Declare mocks in describe scope for manual assignment access

**Pattern 4 Success by Service Type**:
- Repository only: **76%** (EmbeddingPolicyService - cleanest)
- Repository + DataSource: **54%** (TypeRegistryService)
- Repository + complex assertions: **47%** (PostgresCacheService)

**Why Pattern 3 Hit Diminishing Returns**:
- 1st application: 100% (ExtractionJobService - simple)
- 2nd application: 67% (EntityLinkingService - moderate)
- 3rd/4th: 33-50% (ProjectsService, BranchService - complex)
- Root cause: Service complexity grows beyond simple constructor issues

**Test Count Discrepancy Explained**:
- Gross additions: 113 tests (sum of all additions)
- Net gain: 74 tests (actual result)
- Difference caused by: test status changes, skipped tests, duplicate removals
- **ALWAYS measure with full suite run**, don't rely on addition projections

**Pattern Selection Decision Tree**:
```
Error                                            → Pattern
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Cannot find name 'Repository'"                 → 1
"Cannot find name 'jest'"                       → 2
"Cannot read properties of undefined"           → 3
"Nest can't resolve dependencies... Repository" → 4

Service Type                                     → Expected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Single repository                                → 70-100%
Repository + simple mocks                        → 60-100%
Repository + DataSource                          → 50-70%
Repository + complex assertions                  → 40-60%
```

**Reaching 85% Files Would Require**:
Complete 7 partial services to 90%+:
- DocumentsService: +17 tests → 100%
- EntityLinkingService: +11 tests → 100%
- TypeRegistryService: +11 tests → 100%
- PostgresCacheService: +10 tests → 100%
- EmbeddingPolicyService: +6 tests → 100%
- BranchService: +3 tests → 100%
- ProjectsService: +2 tests → 100%

Impact: +60 tests, +7 files → 970/1125 (86.2%), 90/115 files (78.3%)

**Prevention**:
- Use pattern decision tree for error → pattern mapping
- Set realistic file targets: files harder than tests to move
- Accept 47-76% success as good outcome for complex services
- Per-service refinement beyond patterns requires dedicated sessions
- Always run full suite to confirm final metrics

**Related Files/Conventions**:
- `docs/TESTING_SPRINT_SESSION2_FINAL.md` - Complete report
- Pattern 1-4 templates in sprint documentation
- Implementations: PostgresCacheService, TypeRegistryService, EmbeddingPolicyService test files

**Key Takeaway**: Pattern-based systematic fixing highly effective for test count. Success depends on service complexity. Partial improvements (47-76%) add value but don't flip files. Always confirm with full suite run. Files need 90%+ tests to pass reliably.

---

### 2025-10-22 - ClickUp API v2/v3 ID Mismatch & Discovery of Parent Parameter

**Context**: User wanted to import documents only from "Huma" space (ID: 90152846670) but all documents from workspace were being imported, ignoring space selection.

**Mistake**: Attempted to filter documents by comparing v2 Spaces API space IDs (90152846670) directly with v3 Docs API parent IDs (42415326, 42415333, etc.). Wasted time investigating folder-to-space mapping when the solution was much simpler: the v3 API supports a `parent` parameter.

**Why It Was Wrong**:
- ClickUp v2 API (spaces, folders, lists, tasks) uses one ID numbering system
- ClickUp v3 API (docs, pages) uses a completely different ID numbering system
- The `doc.parent.id` field contains **folder IDs** from v2, not space IDs
- Direct comparison of space IDs vs doc parent IDs always failed (0 matches)
- Resulted in either importing ALL documents OR importing NONE (depending on filter logic)
- User's space selection was completely ignored
- **Critical miss**: Didn't check v3 API documentation for filtering parameters before building complex workarounds

**Investigation Process**:
1. Initially suspected parent IDs were folders → tried calling `GET /folder/{id}` to resolve
2. Got 401 error: "Team(s) not authorized" - API token lacks permission for individual folder endpoint
3. Discovered `GET /space/{id}/folder` endpoint IS accessible and returns folders with space relationship
4. Started implementing folder→space mapping approach
5. **User discovered the real solution**: ClickUp v3 API supports `?parent={spaceId}` parameter!
6. Refactored to use native API filtering instead of complex local filtering

**Correct Approach**:
**ALWAYS check API documentation for native filtering parameters first!** The v3 Docs API supports `?parent={parentId}` parameter:

```typescript
// Simple approach using native API filtering
for (const spaceId of selectedSpaceIds) {
    const docsResponse = await this.apiClient.getDocs(workspaceId, undefined, spaceId);
    allDocs.push(...docsResponse.docs);
}
```

The API client passes it through:
```typescript
async getDocs(workspaceId: string, cursor?: string, parentId?: string) {
    const params: any = {};
    if (cursor) params.cursor = cursor;
    if (parentId) params.parent = parentId; // ← Native API filtering!
    return this.requestV3(`/workspaces/${workspaceId}/docs`, params);
}
```

**Alternative (Complex) Approach** - folder-to-space mapping:
Only needed if API doesn't support native filtering. Build lookup map BEFORE processing:

```typescript
// Build mapping (1 API call per space)
const folderToSpaceMap = new Map<string, string>();
for (const spaceId of selectedSpaceIds) {
    const foldersResponse = await this.apiClient.getFolders(spaceId);
    for (const folder of foldersResponse.folders) {
        folderToSpaceMap.set(folder.id, spaceId);
    }
}

// Filter documents locally
const filteredDocs = docs.filter(doc => {
    if (doc.parent.type === 6) { // Type 6 = folder parent
        return folderToSpaceMap.has(doc.parent.id);
    }
    return false;
});
```

**Prevention**:
- **FIRST**: Check API documentation for native filtering parameters (query params, request body filters)
- **SECOND**: Test filtering parameters with curl/Postman before implementing complex workarounds
- When working with external APIs, never assume IDs from different API versions/endpoints are compatible
- Always test actual API responses with real data to see exact ID formats
- When direct comparison fails, look for relationship/mapping endpoints as LAST resort
- Use accessible batch endpoints (GET /space/{id}/folder) instead of restricted individual endpoints (GET /folder/{id})
- Document API version differences prominently in code comments
- Add investigation logging on first iteration to validate filtering logic with real data

**API Discovery Process**:
1. Read official API docs for filtering/query parameters
2. Test parameters with curl: `curl "https://api.clickup.com/api/v3/workspaces/{id}/docs?parent={spaceId}"`
3. If no native filtering, then investigate relationship endpoints
4. Build mapping/lookup tables as last resort

**Related Files/Conventions**:
- `apps/server/src/modules/clickup/clickup-import.service.ts` (importDocs using parent parameter)
- `apps/server/src/modules/clickup/clickup-api.client.ts` (getDocs with parent parameter support)
- ClickUp v3 API documentation: Check for query parameters on list/fetch endpoints

**Performance Impact**:
- Before: Fetch ALL workspace docs → filter locally → wasted network/processing on unwanted docs
- After (with parent param): Fetch only selected spaces' docs → API does filtering → dramatically faster
- Using parent parameter: 1 API call per selected space, only retrieves relevant documents

**Key Takeaway**: ALWAYS check if the API supports native filtering before implementing complex client-side filtering or ID mapping. Read the docs, test the parameters. Most modern APIs support filtering via query parameters. Don't reinvent the wheel.

---

### 2025-10-22 - Unlimited Pagination Caused UI to Hang

**Context**: User reported "select lists" step in ClickUp integration taking forever and finishing with 500 error. Investigating the algorithm to list documents and spaces.

**Mistake**: The `fetchWorkspaceStructure()` method was fetching ALL documents in the workspace using unlimited pagination before returning to the UI. No safety mechanisms existed to prevent infinite loops or timeouts.

**Why It Was Wrong**:
- **Performance Issue**: With hundreds/thousands of documents, pagination could take minutes
- **Timeout Risk**: Long-running requests would exceed 30s timeout and return 500 errors
- **Infinite Loop Risk**: No max iterations, no cursor deduplication, no safety breaks
- **Unnecessary Work**: UI only needs a preview for selection, not all documents upfront
- **Poor UX**: Users waited indefinitely while all docs loaded, even if they only needed a few

**Original Problematic Code**:
```typescript
// BEFORE: Fetched ALL documents without limits
do {
    const docsResponse = await this.apiClient.getDocs(workspaceId, cursor);
    allDocs.push(...docsResponse.docs);
    cursor = docsResponse.next_cursor;
    this.logger.log(`Fetched ${docsResponse.docs.length} docs (cursor: ${cursor || 'none'}), total: ${allDocs.length}`);
} while (cursor);  // ❌ Could run indefinitely!
```

**Correct Approach**:
1. **Preview-Only Philosophy**: UI selection doesn't need ALL documents, just a preview
2. **Add Safety Limits**: Multiple mechanisms to prevent infinite loops
3. **Architecture Split**: Preview for UI (fast), full fetch during import (when needed)

**Implemented Solution**:
```typescript
// AFTER: Preview-only with multiple safety mechanisms
const MAX_PREVIEW_DOCS = 100;
const MAX_ITERATIONS = 10; // Safety ceiling
const seenCursors = new Set<string>(); // Loop detection

do {
    iterations++;
    
    // Safety check 1: Max iterations
    if (iterations > MAX_ITERATIONS) {
        this.logger.warn(`Reached max iterations (${MAX_ITERATIONS}). Breaking loop.`);
        break;
    }
    
    // Safety check 2: Cursor loop detection
    if (cursor && seenCursors.has(cursor)) {
        this.logger.warn(`Detected cursor loop (cursor: ${cursor}). Breaking.`);
        break;
    }
    if (cursor) seenCursors.add(cursor);
    
    const startTime = Date.now();
    const docsResponse = await this.apiClient.getDocs(workspaceId, cursor);
    const elapsed = Date.now() - startTime;
    
    allDocs.push(...docsResponse.docs);
    cursor = docsResponse.next_cursor;
    
    this.logger.log(`[Preview] Fetched ${docsResponse.docs.length} docs in ${elapsed}ms, total: ${allDocs.length}`);
    
    // Safety check 3: Preview limit reached
    if (allDocs.length >= MAX_PREVIEW_DOCS) {
        this.logger.log(`Reached preview limit (${allDocs.length} docs). Stopping.`);
        break;
    }
} while (cursor && allDocs.length < MAX_PREVIEW_DOCS);
```

**Prevention**:
- When implementing pagination, ALWAYS add safety mechanisms:
  - Max iteration limit (prevent runaway loops)
  - Cursor deduplication (detect API bugs returning same cursor)
  - Item count limit (when full set not needed)
  - Timeout mechanisms (per-request and total)
- Consider the use case: Does the caller need ALL items or just a preview?
- Separate "preview" operations from "full fetch" operations architecturally
- Add performance tracking (elapsed time per iteration)
- Enhance logging to show progress and safety trigger reasons

**When to Fetch All vs Preview**:
- **Preview**: UI selection, autocomplete, dropdowns, initial load
- **Full Fetch**: Data imports, bulk operations, background sync, reports

**Related Files/Conventions**:
- `apps/server/src/modules/clickup/clickup-import.service.ts` (fetchWorkspaceStructure method)
- `apps/server/src/modules/clickup/clickup-api.client.ts` (getDocs pagination)
- `docs/CLICKUP_SELECT_LISTS_HANG_FIX.md` (full documentation)

**Performance Impact**:
- Before: 50+ seconds for large workspaces → timeout → 500 error
- After: ~1-2 seconds regardless of workspace size → success → 200 OK
- Improvement: ~50x faster for large workspaces

**Key Takeaway**: Never implement unlimited pagination loops. Always add multiple safety mechanisms (max iterations, deduplication, limits). Consider whether the use case needs "all items" or just a "preview". For UI operations, preview is almost always sufficient and dramatically faster.

**Update 2025-10-22 (Later same day)**: This exact issue occurred AGAIN in `importDocs()` method. The ClickUp API returned the same cursor repeatedly (`eyJuZXh0SWQiOiI0Ymo0MS0xNzY0NCJ9`), and because all 50 docs per iteration were being filtered out (not in selected spaces), the loop continued infinitely with 0 progress. Applied the same safety mechanisms:
- MAX_ITERATIONS = 50 (for import, higher than preview's 10)
- Cursor deduplication with `seenCursors` Set
- Enhanced logging showing iteration count and elapsed time
- Better completion messages distinguishing natural end vs safety trigger

This proves the pattern: **ANY pagination loop MUST have these safety mechanisms**, not just preview operations. Data import operations are actually MORE critical because they run in background and can waste server resources indefinitely.

---

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
- `apps/server/src/modules/integrations/integrations.controller.ts` (added error handling to 3 endpoints)
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
- Always grep for existing patterns: `grep -r "x-project-id" apps/server/src/`
- Frontend should never manually add `X-Org-ID` or `X-Project-ID` headers - the `use-api` hook does it automatically

**Related Files/Conventions**:
- `apps/admin/src/hooks/use-api.ts` (lines 29-30: header construction)
- `apps/server/src/modules/documents/documents.controller.ts` (correct pattern)
- `apps/server/src/modules/template-packs/template-pack.controller.ts` (correct pattern)

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
- `apps/server/tests/e2e/e2e-context.ts`
- `apps/server/src/modules/auth/scopes.guard.ts`
- `docs/TEST_FIX_SESSION_4_FINAL.md` (records impact of `SCOPES_DISABLED=1`)
- `apps/server/src/modules/integrations/integrations.controller.ts` (was wrong, now fixed)

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

**Correct Approach**: After wrapping in `runWithTenantContext`, explicitly add both `});` and the method's closing `}` before moving on. Immediately run `nx run server:build` (or targeted tests) to confirm the file still parses.

**Prevention**:
- Use editor bracket matching or run Prettier/TS compiler after structural edits.
- Refactor in small steps: wrap call, verify build, then adjust inner logic.
- When big diffs are unavoidable, rely on automated checks quickly instead of waiting until later.

**Related Files/Conventions**:
- `apps/server/src/modules/graph/graph.service.ts`
- `apps/server/src/common/database/database.service.ts` (`runWithTenantContext` usage pattern)

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
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
- `apps/server/src/modules/extraction-jobs/__tests__/extraction-worker.service.spec.ts`
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
- `apps/server/package.json` - "start:dev": "ts-node-dev --respawn" (watch mode)
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
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts` (updateProgress method)
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
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` (key generation)
- `apps/server/src/modules/graph/graph.service.ts` (object creation, key constraint)
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
   - Read migration files from `apps/server/migrations/` directory
   - Track applied migrations in database table (`kb.schema_migrations`)
   - Auto-detect connection method (Docker container or direct psql)
   - Handle credentials from environment variables
   - Provide dry-run and list modes for safety
   - Record execution time and errors
   
2. **Then**: Use the script for all future migrations:
   ```bash
   npx nx run server:migrate -- --list      # Check status
   npx nx run server:migrate -- --dry-run   # Preview changes
   npx nx run server:migrate                # Apply pending
   ```

3. **Benefits**:
   - One command applies all pending migrations in order
   - Database tracks what's been applied (prevents duplicates)
   - Safe to run multiple times (idempotent)
   - Works in CI/CD without manual intervention
   - Performance metrics for each migration
   - Error tracking and debugging

**Solution Implemented**:
- Created `apps/server/scripts/migrate.mjs`:
  * Node.js script that reads SQL files from migrations directory
  * Creates `kb.schema_migrations` table to track applied migrations
  * Compares filesystem migrations with database records
  * Applies pending migrations in alphabetical order
  * Records checksums, execution time, success/failure
  * Supports `--list`, `--dry-run` modes
  * Works with Docker or direct database connection
  
- Added Nx target: `nx run server:migrate`
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
- `apps/server/scripts/migrate.mjs` (migration runner)
- `apps/server/project.json` (Nx target definition)
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
- `apps/server/src/common/logger/file-logger.service.ts`:
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
- `apps/server/src/common/logger/file-logger.service.ts` (enhanced logger)
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
2. **Check controller methods**: `grep -r "@Patch\|@Put\|@Post\|@Get\|@Delete" apps/server/src/modules/<module>/`
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
  grep -r "@Patch.*projects" apps/server/src/modules/projects/
  
  # Check DTO includes field
  grep "kb_purpose" apps/server/src/modules/projects/dto/
  
  # Check database column exists
  # (use postgres MCP or check migrations)
  ```
- Use semantic_search to find controller and check methods before coding frontend
- For CRUD operations, verify all standard endpoints exist (GET, POST, PATCH, DELETE)
- Don't assume standard patterns - verify explicitly
- Test backend endpoint with curl before integrating frontend
- Add to checklist: "Verified backend endpoint exists" before frontend PR

**Related Files/Conventions**:
- `apps/server/src/modules/projects/projects.controller.ts` (added PATCH endpoint)
- `apps/server/src/modules/projects/projects.service.ts` (added update method)
- `apps/server/src/modules/projects/dto/project.dto.ts` (added UpdateProjectDto)
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
