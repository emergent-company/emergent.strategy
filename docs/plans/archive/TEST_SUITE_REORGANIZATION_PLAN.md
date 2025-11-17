# Test Suite Reorganization Plan

**Created:** October 8, 2025  
**Current Status:** 805/859 passing (93.7%) - 5 infrastructure-dependent failures  
**Goal:** Separate tests by infrastructure requirements for better CI/CD and developer experience

## 🎯 Objectives

1. **Fast Unit Tests**: Run in <5s without any external dependencies
2. **Integration Tests**: Run with PostgreSQL, clear when DB is needed
3. **E2E Tests**: Run with full stack, proper gating for deployment
4. **Scope Tests**: Run with `SCOPES_DISABLED=0`, validate security

## 📊 Current Structure Analysis

### Current Layout
```
apps/server/
├── tests/                          # Mixed: unit + integration + scope tests
│   ├── e2e/                       # ✅ Good: E2E tests already separated (60+ files)
│   ├── scenarios/                 # ❌ Problem: E2E test in wrong place
│   │   └── user-first-run.spec.ts # → Should be in e2e/
│   ├── unit/                      # ⚠️  Mixed: some need DB, some don't
│   │   ├── schema.indexes.spec.ts # → Needs DB (integration test)
│   │   └── [7 other tests]        # → True unit tests
│   └── [80+ test files]           # ❌ Problem: Mixed dependencies
│
└── src/modules/graph/__tests__/   # Mixed: unit + integration tests
    ├── graph-rls.*.spec.ts        # → Need DB (integration)
    ├── graph-validation.*.spec.ts # → Need DB (integration)
    └── [30+ other tests]          # → Mostly unit tests
```

### The 5 Failing Tests
1. `tests/auth-scope-denied.spec.ts` → Needs `SCOPES_DISABLED=0`
2. `tests/error-envelope.spec.ts` → Needs `SCOPES_DISABLED=0`
3. `tests/unit/schema.indexes.spec.ts` → Needs PostgreSQL
4. `src/modules/graph/__tests__/graph-rls.strict-init.spec.ts` → Needs PostgreSQL
5. `tests/scenarios/user-first-run.spec.ts` → Needs full stack (E2E)

## 🎨 Proposed New Structure

### Option A: Flat Structure (Simpler)

```
apps/server/
├── tests/
│   ├── unit/                      # No external dependencies (805 tests)
│   │   ├── auth/
│   │   │   ├── auth.guard.spec.ts
│   │   │   ├── auth.service.spec.ts
│   │   │   └── ...
│   │   ├── chat/
│   │   │   ├── chat.service.spec.ts
│   │   │   ├── chat-generation.spec.ts
│   │   │   └── ...
│   │   ├── graph/
│   │   │   ├── graph.objects.spec.ts
│   │   │   ├── graph.relationships.spec.ts
│   │   │   ├── graph.traverse.spec.ts
│   │   │   └── ...
│   │   ├── search/
│   │   │   ├── search.service.spec.ts
│   │   │   ├── score-normalization.spec.ts
│   │   │   └── ...
│   │   └── openapi/
│   │       ├── openapi-scope-golden-full.spec.ts
│   │       └── ...
│   │
│   ├── integration/               # Requires PostgreSQL (10-15 tests)
│   │   ├── database/
│   │   │   └── schema.indexes.spec.ts
│   │   ├── graph/
│   │   │   ├── graph-rls.strict-init.spec.ts
│   │   │   ├── graph-rls.policies.spec.ts
│   │   │   ├── graph-rls.security.spec.ts
│   │   │   ├── graph-validation.spec.ts
│   │   │   ├── graph-validation.schema-negative.spec.ts
│   │   │   ├── graph-branching.spec.ts
│   │   │   ├── graph-embedding.enqueue.spec.ts
│   │   │   ├── graph-fts.search.spec.ts
│   │   │   └── graph-relationship.multiplicity*.spec.ts
│   │   └── merge/
│   │       ├── graph-merge.spec.ts
│   │       ├── graph-merge-apply.spec.ts
│   │       └── graph-merge-fastforward.spec.ts
│   │
│   ├── scoped/                    # Requires SCOPES_DISABLED=0 (2 tests)
│   │   ├── auth-scope-denied.spec.ts
│   │   └── error-envelope.spec.ts
│   │
│   ├── e2e/                       # Requires full stack (60+ tests)
│   │   ├── chat/
│   │   │   ├── chat.authorization.e2e.spec.ts
│   │   │   ├── chat.streaming*.e2e.spec.ts
│   │   │   └── ...
│   │   ├── documents/
│   │   │   ├── documents.create-and-get.e2e.spec.ts
│   │   │   ├── documents.pagination.e2e.spec.ts
│   │   │   └── ...
│   │   ├── graph/
│   │   │   ├── graph.search.pagination.e2e.spec.ts
│   │   │   ├── graph.traverse.e2e.spec.ts
│   │   │   └── ...
│   │   ├── search/
│   │   │   ├── search.hybrid-modes.e2e.spec.ts
│   │   │   ├── search.ranking.lexical.e2e.spec.ts
│   │   │   └── ...
│   │   ├── security/
│   │   │   ├── security.scopes-enforcement.e2e.spec.ts
│   │   │   ├── security.scopes-matrix.e2e.spec.ts
│   │   │   └── ...
│   │   └── scenarios/
│   │       └── user-first-run.e2e.spec.ts
│   │
│   ├── helpers/                   # Shared test utilities
│   ├── utils/                     # Test utilities
│   └── setup.ts                   # Global test setup
```

### Option B: Nested by Module (More Complex)

```
apps/server/
├── tests/
│   ├── auth/
│   │   ├── unit/
│   │   │   ├── auth.guard.spec.ts
│   │   │   └── auth.service.spec.ts
│   │   ├── scoped/
│   │   │   ├── auth-scope-denied.spec.ts
│   │   │   └── error-envelope.spec.ts
│   │   └── e2e/
│   │       └── security.auth-errors.e2e.spec.ts
│   │
│   ├── graph/
│   │   ├── unit/
│   │   │   ├── graph.objects.spec.ts
│   │   │   ├── graph.traverse.spec.ts
│   │   │   └── ...
│   │   ├── integration/
│   │   │   ├── graph-rls.strict-init.spec.ts
│   │   │   ├── graph-validation.spec.ts
│   │   │   └── ...
│   │   └── e2e/
│   │       ├── graph.search.pagination.e2e.spec.ts
│   │       └── ...
│   └── ...
```

## 🏆 Recommended Approach: **Option A (Flat Structure)**

**Why Option A?**
- ✅ Clear separation by infrastructure needs
- ✅ Easy to run specific test suites: `npm test unit/`
- ✅ CI/CD configuration is straightforward
- ✅ Matches common patterns (Jest, Vitest best practices)
- ✅ Easier to navigate (4 top-level categories)

**Why NOT Option B?**
- ❌ More directory nesting, harder to navigate
- ❌ Duplicates module structure (already in src/)
- ❌ Harder to run all unit tests across modules

## 📋 Migration Steps

### Phase 1: Create New Structure (Non-Breaking)
```bash
# Create new directories
mkdir -p apps/server/tests/unit/{auth,chat,graph,search,documents,openapi,services}
mkdir -p apps/server/tests/integration/{database,graph,merge}
mkdir -p apps/server/tests/scoped
# E2E already organized in tests/e2e/
```

### Phase 2: Move Files

#### 2.1 Move Unit Tests (805 tests)
```bash
# From tests/ root - move to tests/unit/
mv tests/auth.guard.spec.ts tests/unit/auth/
mv tests/auth.service*.spec.ts tests/unit/auth/
mv tests/chat*.spec.ts tests/unit/chat/
mv tests/documents.service.spec.ts tests/unit/documents/
mv tests/graph*.spec.ts tests/unit/graph/
mv tests/search.service.spec.ts tests/unit/search/
mv tests/score-normalization.spec.ts tests/unit/search/
mv tests/openapi*.spec.ts tests/unit/openapi/
mv tests/health.service.spec.ts tests/unit/services/
mv tests/invites.service.spec.ts tests/unit/services/
mv tests/orgs.service.spec.ts tests/unit/services/
# ... etc for other unit tests

# From src/modules/graph/__tests__/ - move true unit tests
mv src/modules/graph/__tests__/diff.util.spec.ts tests/unit/graph/
mv src/modules/graph/__tests__/branch.service.spec.ts tests/unit/graph/
mv src/modules/graph/__tests__/embedding-policy.service.spec.ts tests/unit/graph/
# ... etc
```

#### 2.2 Move Integration Tests (10-15 tests)
```bash
# Database tests
mv tests/unit/schema.indexes.spec.ts tests/integration/database/

# Graph RLS and validation (need DB)
mv src/modules/graph/__tests__/graph-rls.strict-init.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-rls.policies.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-rls.security.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-validation.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-validation.schema-negative.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-branching.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-embedding.enqueue.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-fts.search.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/graph-relationship.multiplicity*.spec.ts tests/integration/graph/

# Merge tests (need DB)
mv tests/graph-merge.spec.ts tests/integration/merge/
mv tests/graph-merge-apply.spec.ts tests/integration/merge/
mv tests/graph-merge-fastforward.spec.ts tests/integration/merge/
```

#### 2.3 Move Scope Tests (2 tests)
```bash
mv tests/auth-scope-denied.spec.ts tests/scoped/
mv tests/error-envelope.spec.ts tests/scoped/
```

#### 2.4 Move E2E Scenarios
```bash
mv tests/scenarios/user-first-run.spec.ts tests/e2e/scenarios/
# E2E tests already well-organized in tests/e2e/
```

### Phase 3: Update Import Paths

After moving files, update relative imports:
```typescript
// Before: import { bootstrapTestApp } from './utils/test-app';
// After:  import { bootstrapTestApp } from '../../utils/test-app';
```

Use find/replace or automated tool:
```bash
# Example: Update imports in moved files
cd apps/server/tests/unit
find . -name "*.spec.ts" -exec sed -i '' "s|from '\./utils/|from '../../utils/|g" {} \;
find . -name "*.spec.ts" -exec sed -i '' "s|from '\./helpers/|from '../../helpers/|g" {} \;
```

### Phase 4: Update package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "test:unit": "vitest run tests/unit --passWithNoTests",
    "test:integration": "vitest run tests/integration --passWithNoTests",
    "test:scoped": "SCOPES_DISABLED=0 vitest run tests/scoped --passWithNoTests",
    "test:e2e": "vitest run tests/e2e --passWithNoTests",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:scoped && npm run test:e2e",
    "test:watch": "vitest watch tests/unit",
    "test:ci": "npm run test:unit && npm run test:integration"
  }
}
```

### Phase 5: Update Vitest Configuration

Create `vitest.config.ts` with test categorization:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    
    // Test categorization
    include: [
      'tests/**/*.spec.ts',
      'src/**/__tests__/**/*.spec.ts',
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'tests/**',
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
    },
    
    // Separate timeouts by test type
    testTimeout: 30000, // Default for integration/e2e
    hookTimeout: 30000,
  },
});
```

### Phase 6: CI/CD Pipeline Updates

Update `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    name: Unit Tests (Fast)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      # Should complete in <30s
      
  integration-tests:
    name: Integration Tests (PostgreSQL)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
          
  scoped-tests:
    name: Scope Enforcement Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:scoped
        # Note: This enables scope enforcement for these tests
        
  e2e-tests:
    name: E2E Tests (Full Stack)
    runs-on: ubuntu-latest
    # Only run on main branch or PRs to main
    if: github.ref == 'refs/heads/main' || github.base_ref == 'main'
    services:
      postgres:
        image: postgres:15
        # ... (same as integration)
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: docker-compose up -d
      - run: npm run migrate
      - run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
          # ... other env vars
```

## 📊 Expected Results After Reorganization

### Test Execution Times
| Suite | Tests | Time | Dependencies |
|-------|-------|------|--------------|
| **Unit** | ~805 | <30s | None |
| **Integration** | ~15 | ~1-2min | PostgreSQL |
| **Scoped** | 2 | ~10s | SCOPES_DISABLED=0 |
| **E2E** | ~60 | ~5-10min | Full stack |

### CI/CD Benefits
- ✅ Fast feedback: Unit tests run first (<30s)
- ✅ Parallel execution: Run integration + scoped tests in parallel
- ✅ Cost savings: E2E only on main branch
- ✅ Clear failures: Know immediately if it's unit, integration, or infrastructure issue

### Developer Experience
- ✅ Fast local development: `npm run test:unit` (no DB needed)
- ✅ Quick iteration: Unit tests complete in seconds
- ✅ Clear categorization: Know which tests need what infrastructure
- ✅ Easy debugging: Run specific test suite when working on features

## 🎯 Success Metrics

After reorganization:
- ✅ Unit tests: 100% passing (805/805)
- ✅ Integration tests: 100% passing when DB available (15/15)
- ✅ Scoped tests: 100% passing when scopes enabled (2/2)
- ✅ E2E tests: 100% passing in full environment (60/60)
- ✅ Overall: 100% passing in appropriate environments
- ✅ CI/CD: Clear pass/fail for each category
- ✅ Dev speed: Unit test feedback in <30s

## 🚀 Rollout Plan

### Week 1: Preparation
- [ ] Create new directory structure
- [ ] Document migration plan with team
- [ ] Create helper scripts for moving files

### Week 2: Migration
- [ ] Move unit tests (bulk move + fix imports)
- [ ] Move integration tests
- [ ] Move scoped tests
- [ ] Move E2E scenarios
- [ ] Update import paths
- [ ] Verify all tests still pass

### Week 3: Configuration
- [ ] Update package.json scripts
- [ ] Create vitest.config.ts
- [ ] Update CI/CD pipeline
- [ ] Test CI/CD in staging branch

### Week 4: Documentation & Cleanup
- [ ] Update README with new test structure
- [ ] Document which tests need what infrastructure
- [ ] Clean up old directories
- [ ] Team training on new structure

## 📚 Documentation to Update

1. **README.md** - Test running instructions
2. **CONTRIBUTING.md** - Where to add new tests
3. **CI/CD docs** - Pipeline explanations
4. **Test conventions** - Categorization guidelines

## ✨ Long-Term Benefits

1. **Faster Development**: Unit tests give instant feedback
2. **Better CI/CD**: Appropriate infrastructure for each test type
3. **Cost Savings**: E2E tests only when needed
4. **Clearer Failures**: Know immediately what broke (code vs infrastructure)
5. **Better Onboarding**: New developers understand test requirements
6. **Scalability**: Easy to add new test categories (performance, smoke, etc.)

---

## 🤝 Alternative: Minimal Reorganization

If full reorganization is too much, minimum viable change:

1. Move 5 failing tests to appropriate folders
2. Add test scripts for each category
3. Update CI/CD to handle categories

This gets you 100% passing in each category without massive restructuring.

---

**Next Steps:** Would you like me to:
1. Start the full reorganization (create directories + move files)?
2. Do the minimal reorganization (just the 5 failing tests)?
3. Create helper scripts to automate the migration?
4. Something else?
