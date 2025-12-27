# Database Migration Lifecycle Fix

## Problem

After refactoring migrations to run in-process using `DatabaseService.runMigrations()` (commit a731aad), the application crashed on startup with:

```
Error: Nest could not find DatabaseService element (this provider does not exist in the current context)
```

**Root Cause**: The `main.ts` bootstrap function tried to get `DatabaseService` from the DI container using `app.get('DatabaseService')` before NestJS finished initializing all modules. Even though logs showed all modules loaded, the DI container wasn't accessible via `app.get()` at that phase of the bootstrap lifecycle.

## Solution

Moved the `runMigrations()` call from `main.ts` to the proper NestJS lifecycle hook: `DatabaseService.onModuleInit()`.

This follows the exact pattern used in `huma-blueprint-ui` project, where migrations are executed during module initialization, not from the application bootstrap function.

## Changes Made

### 1. DatabaseService.onModuleInit() - Added Migration Call

**File**: `apps/server/src/common/database/database.service.ts`

```typescript
async onModuleInit() {
    // ... establish pool ...
    await this.pool.query('SELECT 1');

    // Run migrations automatically on startup
    if (process.env.SKIP_MIGRATIONS !== '1') {
        await this.runMigrations();
    } else {
        this.logger.log('Skipping migrations (SKIP_MIGRATIONS=1)');
    }

    // ... continue with RLS role switch ...
    await this.switchToRlsApplicationRole();
    this.online = true;
}
```

**Why This Works**:

- `onModuleInit()` is a NestJS lifecycle hook that runs when the module initializes
- At this point, the `DatabaseService` instance exists with full access to `this.pool`
- No need to use DI container lookup (`app.get()`) - direct method call
- Migrations run before the application becomes ready to handle requests
- Ensures database schema is up-to-date before any API endpoints are accessed

### 2. main.ts - Removed Manual Migration Call

**File**: `apps/server/src/main.ts`

**Removed**:

```typescript
// Run database migrations automatically on startup
if (process.env.SKIP_MIGRATIONS !== '1') {
  try {
    fileLogger.log('[startup] Running database migrations...', 'Bootstrap');
    const databaseService = app.get('DatabaseService'); // ❌ FAILED HERE
    await databaseService.runMigrations();
    fileLogger.log(
      '[startup] Database migrations completed successfully',
      'Bootstrap'
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    fileLogger.error(
      `[startup] Database migration failed: ${errMsg}`,
      'Bootstrap'
    );
    throw new Error('Failed to run database migrations');
  }
} else {
  fileLogger.log(
    '[startup] Skipping migrations (SKIP_MIGRATIONS=1)',
    'Bootstrap'
  );
}
```

**Result**: Bootstrap function now immediately configures CORS after setting up the logger.

## Migration Flow

### Before (Broken)

```
1. validateEnvironment()
2. NestFactory.create(AppModule)  ← Modules initialize here
3. app.useLogger(fileLogger)
4. app.get('DatabaseService')     ❌ DI container not accessible
5. databaseService.runMigrations() ← Never reaches here
```

### After (Fixed)

```
1. validateEnvironment()
2. NestFactory.create(AppModule)
   ↳ Modules initialize
   ↳ DatabaseService.onModuleInit()
     ↳ Establish pool
     ↳ runMigrations()            ✅ Runs automatically
     ↳ Switch to RLS role
     ↳ Mark online
3. app.useLogger(fileLogger)
4. Configure CORS
5. ... rest of bootstrap
```

## Environment Variable Control

Migrations can still be skipped if needed:

```bash
SKIP_MIGRATIONS=1 npm start
```

This sets `process.env.SKIP_MIGRATIONS` which is checked in `onModuleInit()` before calling `runMigrations()`.

## Pattern Reference

This implementation follows the exact pattern from `huma-blueprint-ui`:

```typescript
// huma-blueprint-ui/apps/server/src/common/database/database.service.ts
async onModuleInit() {
    // ... connect to database ...

    if (this.config.autoInitDb) {
        await this.ensureDatabase();  // Create DB if needed
    }

    this.pool = new Pool({...});

    if (this.config.autoInitDb) {
        await this.ensureSchema();    // ← Run migrations here
    }

    this.online = true;
}
```

## Logging

Migration execution is logged at the `DatabaseService` level:

```
[DatabaseService] Running database migrations...
[DatabaseService] Running migration: 0001_initial_schema.sql
[DatabaseService] ✓ Migration 0001_initial_schema.sql completed
[DatabaseService] Running migration: 0002_add_kb_purpose.sql
[DatabaseService] ✓ Migration 0002_add_kb_purpose.sql completed
[DatabaseService] All migrations completed in 145ms
```

## Testing

### Local Development

```bash
npm --prefix apps/server run build
npm --prefix apps/server run start:dev
```

Check logs for:

- "Running database migrations..." message
- Individual migration completion messages
- "All migrations completed in Xms" summary
- No DI errors

### Production (Docker)

After pushing to master, deployment will:

1. Build Docker image
2. Start container
3. DatabaseService.onModuleInit() runs migrations
4. Application starts accepting requests

Monitor logs in your deployment platform.

Expected logs:

```
Starting Nest application...
[Nest] 1  - 11/02/2025, 2:30:45 PM     LOG [InstanceLoader] AppModule dependencies initialized
[Nest] 1  - 11/02/2025, 2:30:45 PM     LOG [InstanceLoader] DatabaseModule dependencies initialized
[DatabaseService] Running database migrations...
[DatabaseService] Running migration: 0001_initial_schema.sql
[DatabaseService] ✓ Migration 0001_initial_schema.sql completed
[DatabaseService] All migrations completed in 156ms
[Nest] 1  - 11/02/2025, 2:30:46 PM     LOG [NestApplication] Nest application successfully started
```

## Benefits

1. **Automatic**: Migrations run on every startup without manual intervention
2. **Lifecycle Aware**: Uses proper NestJS initialization hooks
3. **DI Compatible**: No container access issues
4. **Production Ready**: Works in Docker deployments
5. **Idempotent**: Safe to run multiple times (uses advisory locks)
6. **Error Tolerant**: Warns on individual migration failures but continues
7. **Configurable**: Can be skipped with `SKIP_MIGRATIONS=1` if needed

## Commits

- **a731aad**: Refactored migrations to run in-process using DatabaseService
- **501d11d**: Fixed DI timing issue by moving migrations to onModuleInit lifecycle hook

## Verification Steps

After deployment, verify:

1. ✅ No DI errors in startup logs
2. ✅ "Running database migrations..." appears
3. ✅ Each migration shows "✓ Migration XXX.sql completed"
4. ✅ Summary shows "All migrations completed in Xms"
5. ✅ Application starts successfully
6. ✅ API health endpoint responds: https://spec-api.kucharz.net/health
7. ✅ Admin frontend loads: https://spec-admin.kucharz.net

## Related Documentation

- `docs/DATABASE_MIGRATIONS.md` - General migration system documentation
- `docs/HOT_RELOAD.md` - Development environment setup
- `.github/instructions/nestjs.instructions.md` - NestJS patterns and conventions
