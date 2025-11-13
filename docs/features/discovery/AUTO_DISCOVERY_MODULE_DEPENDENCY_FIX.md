# Auto-Discovery Module Dependency Fix

**Date:** October 19, 2025  
**Issue:** Server startup failure - NestJS dependency injection error  
**Resolution:** Export LangChainGeminiProvider from ExtractionJobModule  

## Problem

After implementing the auto-discovery system and integrating LLM functionality, the server failed to start with the following error:

```
ERROR [ExceptionHandler] Nest can't resolve dependencies of the DiscoveryJobService 
(DatabaseService, AppConfigService, ?). 
Please make sure that the argument LangChainGeminiProvider at index [2] is available 
in the DiscoveryJobModule context.

Potential solutions:
- Is DiscoveryJobModule a valid NestJS module?
- If LangChainGeminiProvider is a provider, is it part of the current DiscoveryJobModule?
- If LangChainGeminiProvider is exported from a separate @Module, is that module imported 
  within DiscoveryJobModule?
```

## Root Cause

The `DiscoveryJobService` constructor requires `LangChainGeminiProvider`:

```typescript
// discovery-job.service.ts
constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
    private readonly llmProvider: LangChainGeminiProvider  // ← Required dependency
) {}
```

The `DiscoveryJobModule` imports `ExtractionJobModule`:

```typescript
// discovery-job.module.ts
@Module({
    imports: [
        DatabaseModule,
        AppConfigModule,
        ExtractionJobModule,  // ← Imports the module
    ],
    providers: [DiscoveryJobService],
    controllers: [DiscoveryJobController],
    exports: [DiscoveryJobService]
})
export class DiscoveryJobModule {}
```

However, `ExtractionJobModule` was **NOT exporting** `LangChainGeminiProvider`:

```typescript
// extraction-job.module.ts (BEFORE FIX)
@Module({
    imports: [...],
    providers: [
        ExtractionJobService,
        ExtractionWorkerService,
        ExtractionLoggerService,
        RateLimiterService,
        ConfidenceScorerService,
        EntityLinkingService,
        LangChainGeminiProvider,  // ← Defined as provider
        VertexAIProvider,
        LLMProviderFactory,
    ],
    controllers: [ExtractionJobController],
    exports: [
        ExtractionJobService, 
        ExtractionWorkerService, 
        ExtractionLoggerService
        // ❌ LangChainGeminiProvider NOT exported
    ],
})
export class ExtractionJobModule { }
```

## NestJS Module Export Rules

In NestJS:
1. **Providers are module-scoped** by default - they're only available within the module that declares them
2. **To share providers across modules**, they must be explicitly exported
3. **Importing a module** only gives access to that module's **exported** providers
4. **Not exporting a provider** = that provider is private to the module

Therefore:
- `DiscoveryJobModule` imports `ExtractionJobModule` ✅
- `ExtractionJobModule` provides `LangChainGeminiProvider` ✅
- `ExtractionJobModule` DOES NOT export `LangChainGeminiProvider` ❌
- Result: `DiscoveryJobService` **cannot inject** `LangChainGeminiProvider` ❌

## Solution

Add `LangChainGeminiProvider` to the exports array of `ExtractionJobModule`:

```typescript
// extraction-job.module.ts (AFTER FIX)
@Module({
    imports: [...],
    providers: [
        ExtractionJobService,
        ExtractionWorkerService,
        ExtractionLoggerService,
        RateLimiterService,
        ConfidenceScorerService,
        EntityLinkingService,
        LangChainGeminiProvider,  // ← Provided
        VertexAIProvider,
        LLMProviderFactory,
    ],
    controllers: [ExtractionJobController],
    exports: [
        ExtractionJobService, 
        ExtractionWorkerService, 
        ExtractionLoggerService,
        LangChainGeminiProvider  // ✅ Now exported - available to other modules
    ],
})
export class ExtractionJobModule { }
```

## Why This Fix is Correct

1. **Logical Ownership**: `LangChainGeminiProvider` logically belongs to the extraction system (it's in `extraction-jobs/llm/`)
2. **Reusability**: Other modules (like DiscoveryJobModule) need LLM capabilities for AI-powered features
3. **Single Source of Truth**: One module provides and configures the LLM provider, others consume it
4. **Clean Architecture**: Follows NestJS best practices for module composition

## Alternative Solutions (Not Used)

### Alternative 1: Add Provider Directly to DiscoveryJobModule
```typescript
// discovery-job.module.ts (NOT RECOMMENDED)
@Module({
    imports: [DatabaseModule, AppConfigModule, ExtractionJobModule],
    providers: [
        DiscoveryJobService,
        LangChainGeminiProvider  // ❌ Duplicates provider definition
    ],
    // ...
})
```
**Why rejected:** Creates duplicate instances, violates single responsibility

### Alternative 2: Create Separate LLM Module
```typescript
// llm.module.ts (OVER-ENGINEERING)
@Module({
    providers: [LangChainGeminiProvider],
    exports: [LangChainGeminiProvider]
})
export class LLMModule {}
```
**Why rejected:** Unnecessary abstraction, the provider is already well-organized in ExtractionJobModule

## Verification

After applying the fix:

```bash
# Restart server
npm run workspace:restart

# Check health endpoint
curl http://localhost:3001/health

# Response
{
  "ok": true,
  "model": "text-embedding-004",
  "db": "up",
  "embeddings": "enabled",
  "rls_policies_ok": true,
  "rls_policy_count": 8,
  "rls_policy_hash": "policies:191:4d86"
}
```

✅ Server starts successfully  
✅ No dependency injection errors  
✅ All modules load correctly  

## Lessons Learned

### For AI Assistants

1. **Check Module Exports**: When adding new service dependencies, always verify the provider module exports what you need
2. **Follow NestJS Patterns**: Review how similar modules (e.g., `IngestionModule` using `ExtractionJobModule`) handle provider imports
3. **Read Error Messages Carefully**: NestJS errors explicitly tell you what's missing and where to look
4. **Test After Major Changes**: Always restart the server after adding module dependencies

### For Developers

1. **Export Reusable Providers**: If a provider will be used by multiple modules, add it to exports
2. **Document Module APIs**: Make it clear which providers a module exposes
3. **Use Dependency Injection**: Don't create provider instances manually; let NestJS manage the lifecycle
4. **Check Health Endpoint**: Use `/health` to quickly verify server startup success

## Related Files

- `/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-job.module.ts` (MODIFIED)
- `/Users/mcj/code/spec-server/apps/server/src/modules/discovery-jobs/discovery-job.module.ts` (unchanged)
- `/Users/mcj/code/spec-server/apps/server/src/modules/discovery-jobs/discovery-job.service.ts` (unchanged)

## Impact

This single-line change (adding one export) enables:
- ✅ Auto-discovery system to use AI for type discovery
- ✅ Auto-discovery system to use AI for relationship inference
- ✅ Future modules to leverage LLM capabilities
- ✅ Clean dependency injection architecture

## Next Steps

Now that the server is running:
1. ✅ Test discovery API endpoints
2. ✅ Verify type discovery works end-to-end
3. ✅ Verify relationship discovery works end-to-end
4. 🔲 Build frontend UI for discovery wizard
5. 🔲 Add unit tests for discovery service
6. 🔲 Add integration tests for full discovery flow
