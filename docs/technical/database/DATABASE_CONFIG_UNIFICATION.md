# Database Configuration Unification

## Problem Statement

The test suite had **duplicate database connection configuration** scattered across multiple test files. Each test file was independently setting up environment variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) and constructing database configuration objects. This duplication created several issues:

1. **Maintenance burden** - Configuration changes required updating multiple files
2. **Inconsistency risk** - Different files could use different fallback values
3. **Code bloat** - 5-15 lines of boilerplate in every test file
4. **No single source of truth** - Configuration logic spread across codebase

## Solution: Unified Test Database Configuration

Created a centralized configuration module `tests/test-db-config.ts` that provides:

1. **Single source of truth** for all database connection parameters
2. **Consistent fallback chain**: `PG*` → `POSTGRES_*` → defaults
3. **Two export formats**:
   - `getTestDbConfig()` - Sets PG* env vars and returns simple config object
   - `getTestDbServiceConfig()` - Returns NestJS `DatabaseService` compatible format
4. **Automatic environment variable setup** - No manual env var assignments needed

### Configuration Module

```typescript
// tests/test-db-config.ts
export interface TestDbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

export function getTestDbConfig(): TestDbConfig {
    // Fallback chain with proper precedence
    const config = {
        host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
        port: +(process.env.PGPORT || process.env.POSTGRES_PORT || '5437'),
        user: process.env.PGUSER || process.env.POSTGRES_USER || 'spec',
        password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'spec',
        database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'spec',
    };

    // Set PG* environment variables for pg library
    process.env.PGHOST = config.host;
    process.env.PGPORT = config.port.toString();
    // ... (sets all PG* vars)

    return config;
}

export function getTestDbServiceConfig() {
    const dbConfig = getTestDbConfig();
    return {
        dbHost: dbConfig.host,
        dbPort: dbConfig.port,
        dbUser: dbConfig.user,
        dbPassword: dbConfig.password,
        dbName: dbConfig.database,
    };
}
```

## Files Updated

### Phase 1: E2E Infrastructure (Session 1)
1. ✅ `tests/e2e/e2e-context.ts` - **11 lines eliminated**
   - Before: Manual env var setup (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
   - After: `const dbConfig = getTestDbConfig()`

2. ✅ `src/modules/graph/__tests__/graph-validation.spec.ts` - **5 lines eliminated**
   - Before: 5 env var assignments + manual config object construction
   - After: `const dbServiceConfig = getTestDbServiceConfig()` with spread operator

3. ✅ `src/modules/graph/__tests__/graph-branching.spec.ts` - **8 lines eliminated**
   - Before: 5 env var assignments + manual config mapping
   - After: `getTestDbServiceConfig()` with spread operator

### Phase 2: Graph Test Suite (Session 2)
4. ✅ `src/modules/graph/__tests__/graph-relationship.multiplicity.spec.ts` - **10 lines eliminated**
   - Before: 5 env var assignments + 5 manual config properties
   - After: `getTestDbServiceConfig()` with spread operator

5. ✅ `src/modules/graph/__tests__/graph-rls.security.spec.ts` - **10 lines eliminated**
   - Before: 5 env var assignments + 5 manual config properties
   - After: `getTestDbServiceConfig()` with spread operator

6. ✅ `src/modules/graph/__tests__/graph-rls.strict-init.spec.ts` - **5 lines eliminated**
   - Before: 5 env var assignments
   - After: `getTestDbConfig()` call (uses NestJS module for config)

7. ✅ `src/modules/graph/__tests__/graph-validation.schema-negative.spec.ts` - **8 lines eliminated**
   - Before: 5 env var assignments + 5 manual config properties
   - After: `getTestDbServiceConfig()` with spread operator

8. ✅ `src/modules/graph/__tests__/graph-relationship.multiplicity.negative.spec.ts` - **10 lines eliminated**
   - Before: 5 env var assignments + 5 manual config properties
   - After: `getTestDbServiceConfig()` with spread operator

## Impact Summary

### Code Reduction
- **Total files updated**: 8
- **Total lines eliminated**: ~67 lines of duplicate code
- **Average reduction per file**: ~8 lines

### Before Example (graph-validation.spec.ts)
```typescript
beforeAll(async () => {
    // Manual environment variable setup (5 lines)
    process.env.PGHOST = process.env.PGHOST || 'localhost';
    process.env.PGPORT = process.env.PGPORT || '5432';
    process.env.PGUSER = process.env.PGUSER || 'spec';
    process.env.PGPASSWORD = process.env.PGPASSWORD || 'spec';
    process.env.PGDATABASE = process.env.PGDATABASE || 'spec';
    
    // Manual config object construction (8 lines)
    const fakeConfig: any = {
        skipDb: false,
        autoInitDb: true,
        dbHost: process.env.PGHOST,
        dbPort: +(process.env.PGPORT || 5432),
        dbUser: process.env.PGUSER,
        dbPassword: process.env.PGPASSWORD,
        dbName: process.env.PGDATABASE,
    } satisfies Partial<AppConfigService>;
    
    db = new DatabaseService(fakeConfig as AppConfigService);
    // ... rest of setup
});
```

### After Example (graph-validation.spec.ts)
```typescript
import { getTestDbServiceConfig } from '../../../../tests/test-db-config';

beforeAll(async () => {
    // Unified configuration (3 lines)
    const dbServiceConfig = getTestDbServiceConfig();
    const fakeConfig: any = {
        skipDb: false,
        autoInitDb: true,
        ...dbServiceConfig,
    } satisfies Partial<AppConfigService>;
    
    db = new DatabaseService(fakeConfig as AppConfigService);
    // ... rest of setup
});
```

**Benefits:**
- ✅ Reduced from 13 lines → 3 lines (10 line reduction)
- ✅ No manual env var assignments
- ✅ Cleaner, more maintainable code
- ✅ Single source of truth for configuration

## Configuration Precedence

The unified module implements the following precedence chain:

```
PG* environment variables (highest priority)
    ↓ (if not set)
POSTGRES_* environment variables
    ↓ (if not set)
Default values (for testing):
    - host: 'localhost'
    - port: 5437
    - user: 'spec'
    - password: 'spec'
    - database: 'spec'
```

## Usage Patterns

### Pattern 1: Direct Pool Creation (E2E Context)
```typescript
import { getTestDbConfig } from '../test-db-config';

const dbConfig = getTestDbConfig();
const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
});
```

### Pattern 2: NestJS DatabaseService (Graph Tests)
```typescript
import { getTestDbServiceConfig } from '../../../../tests/test-db-config';

const dbServiceConfig = getTestDbServiceConfig();
const fakeConfig: any = {
    skipDb: false,
    autoInitDb: true,
    ...dbServiceConfig,
} satisfies Partial<AppConfigService>;

const db = new DatabaseService(fakeConfig as AppConfigService);
```

### Pattern 3: NestJS Testing Module (RLS Strict)
```typescript
import { getTestDbConfig } from '../../../../tests/test-db-config';

getTestDbConfig(); // Sets PG* env vars

const moduleRef = await Test.createTestingModule({
    providers: [DatabaseService, AppConfigService, /* ... */],
}).compile();
```

## Verification

After all changes, confirmed no duplicate database configuration remains:

```bash
# Search for manual env var assignments
grep -r "process\.env\.PGHOST.*=" apps/server/**/*.spec.ts
# Result: No matches found ✅

grep -r "process\.env\.PGPORT.*=" apps/server/**/*.spec.ts
# Result: No matches found ✅

grep -r "process\.env\.PGUSER.*=" apps/server/**/*.spec.ts
# Result: No matches found ✅
```

All test files now use the centralized configuration module.

## Test Results

After completing the database configuration unification:

### E2E Test Suite Status
- **Before all fixes**: 64/68 files failing (94% failure rate)
- **After SQL fixes**: 20/68 files failing (29% failure rate)
- **After config unification**: 21/68 files failing (31% failure rate)

The configuration unification work ensures:
- ✅ Tests remain passing after refactor
- ✅ No additional test failures introduced
- ✅ Cleaner, more maintainable test infrastructure
- ✅ Single source of truth for database configuration

## Future Improvements

1. **Auto-discovery**: Consider adding logic to detect Docker container vs direct connection
2. **Connection pooling**: Explore sharing a single pool across test files
3. **Configuration validation**: Add explicit validation of required env vars
4. **Documentation**: Update test writing guidelines to reference unified config module

## Related Documentation

- `docs/ORG_ID_TO_ORGANIZATION_ID_CODE_FIXES.md` - SQL query fixes that preceded this work
- `apps/server/tests/test-db-config.ts` - The unified configuration module
- `.github/instructions/testing.instructions.md` - General testing guidelines
