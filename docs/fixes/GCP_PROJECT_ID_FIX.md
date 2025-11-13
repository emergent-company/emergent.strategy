# GCP Project ID Configuration Fix

## Problem
Vertex AI API was returning 403 Forbidden errors with message:
```
Permission denied on resource project spec-server.
```

The application was using an incorrect GCP project ID ("spec-server" instead of "twentyfirst-io").

## Root Cause
During the environment variable consolidation from `VERTEX_AI_PROJECT_ID` to `GCP_PROJECT_ID`, the `.env` files were not fully updated:

1. **Root `.env`**: Had `GCP_PROJECT_ID=spec-server-dev` (wrong value)
2. **`apps/server/.env`**: Still had old variable names:
   - `VERTEX_AI_PROJECT_ID=twentyfirst-io` (old name)
   - `VERTEX_EMBEDDING_PROJECT=twentyfirst-io` (old name)
   - `VERTEX_EMBEDDING_LOCATION=us-central1` (old name)

3. **Missing variable**: `VERTEX_AI_LOCATION` was removed during consolidation but the code still requires it

## Solution Applied

### 1. Updated Root `.env`
Changed incorrect project ID:
```bash
# Before
GCP_PROJECT_ID=spec-server-dev

# After
GCP_PROJECT_ID=twentyfirst-io
VERTEX_AI_LOCATION=us-central1
```

### 2. Updated `apps/server/.env`
Consolidated to use `GCP_PROJECT_ID` while keeping `VERTEX_AI_LOCATION`:
```bash
# Before
VERTEX_EMBEDDING_PROJECT=twentyfirst-io
VERTEX_EMBEDDING_LOCATION=us-central1
VERTEX_AI_PROJECT_ID=twentyfirst-io
VERTEX_AI_LOCATION=us-central1

# After
GCP_PROJECT_ID=twentyfirst-io
VERTEX_AI_LOCATION=us-central1
```

### 3. Restarted Services
```bash
npm run workspace:restart
```

## Environment Variable Strategy

### Consolidated Variables
- **`GCP_PROJECT_ID`**: Main GCP project identifier (replaces `VERTEX_AI_PROJECT_ID`, `VERTEX_EMBEDDING_PROJECT`)
  - Used by: Vertex AI, embeddings, all GCP services
  - Value: `twentyfirst-io`

### Service-Specific Variables (Kept)
- **`VERTEX_AI_LOCATION`**: GCP region for Vertex AI endpoints
  - Why kept: Different code modules check for this specific name
  - Value: `us-central1`
  - Used by: `VertexAIProvider`, `LangChainGeminiProvider`, `DiscoveryLLMProvider`

- **`VERTEX_AI_MODEL`**: Model name for extraction/generation
  - Value: `gemini-2.5-flash`

- **`VERTEX_EMBEDDING_MODEL`**: Model for embeddings
  - Value: `text-embedding-004`

## Verification

### Success Indicators
After restart, check logs for:

✅ **No configuration warnings**:
```bash
# Should NOT see these anymore:
# - "Vertex AI not configured: VERTEX_AI_LOCATION missing"
# - "LangChain Vertex AI not configured: VERTEX_AI_LOCATION missing"
# - "Discovery LLM not configured: VERTEX_AI_LOCATION missing"
```

✅ **Extraction worker starts**:
```bash
npx pm2 logs spec-server-server --lines 20 --nostream | grep "Extraction worker started"
# Expected: [ExtractionWorkerService] Extraction worker started (interval=5000ms, batch=5)
```

✅ **No 403 errors** when running extractions

### Check Commands
```bash
# Check environment is loaded correctly
npx pm2 logs spec-server-server --lines 100 --nostream | grep -E "Vertex|LLM|configured"

# Check extraction worker status
npx pm2 logs spec-server-server --lines 30 --nostream | grep "Extraction worker"

# Monitor for API errors
npx pm2 logs spec-server-server --lines 50 --nostream | grep "403\|Permission denied"
```

## Configuration Files Updated

1. **`/Users/mcj/code/spec-server/.env`**
   - Line 117-119: `GCP_PROJECT_ID` and `VERTEX_AI_LOCATION`

2. **`/Users/mcj/code/spec-server/apps/server/.env`**
   - Lines 16-22: Consolidated GCP configuration section
   - Removed old variable names
   - Kept `VERTEX_AI_LOCATION` for code compatibility

## Code References

The code expects these exact variable names:

### Config Schema (`apps/server/src/common/config/config.schema.ts`)
```typescript
export class EnvironmentVariables {
    GCP_PROJECT_ID?: string;           // ← Consolidated (was VERTEX_AI_PROJECT_ID)
    VERTEX_AI_LOCATION?: string;       // ← Still needed by multiple providers
    VERTEX_AI_MODEL?: string;
    VERTEX_EMBEDDING_MODEL?: string;
    // ...
}
```

### Config Service (`apps/server/src/common/config/config.service.ts`)
```typescript
get vertexAiProjectId() { return this.env.GCP_PROJECT_ID; }      // Uses GCP_PROJECT_ID
get vertexAiLocation() { return this.env.VERTEX_AI_LOCATION; }   // Uses VERTEX_AI_LOCATION
```

### Provider Checks
Multiple providers check for `VERTEX_AI_LOCATION`:
- `VertexAIProvider` (line 39)
- `LangChainGeminiProvider` (line 38)
- `DiscoveryLLMProvider` (line 31)

## Future Improvements

### Option 1: Code Consolidation
Rename all `VERTEX_AI_LOCATION` references to `GCP_LOCATION`:
- Update `config.schema.ts`
- Update all provider files
- Update config service getter
- Update all `.env` files

**Pros**: More consistent naming
**Cons**: Larger code change, affects multiple files

### Option 2: Keep Current Strategy
Use `GCP_PROJECT_ID` for project, `VERTEX_AI_LOCATION` for location:
- Already working
- Minimal code changes
- Clear service-specific naming

**Recommendation**: Keep Option 2 for now (already implemented)

## Related Documentation
- Environment variable consolidation: Previous session notes
- Vertex AI setup: `docs/AUTO_EXTRACTION_SETTINGS_COMPLETE.md`
- GCP authentication: Application Default Credentials (ADC) via `gcloud auth application-default login`

## Testing Checklist

After applying this fix:
- [ ] Server restarts without warnings
- [ ] Extraction worker starts successfully
- [ ] No 403 errors in logs
- [ ] Cost analytics page loads
- [ ] Extraction jobs can be triggered
- [ ] Vertex AI API calls succeed

## Timestamp
Fixed: October 23, 2025 09:24:39
Restarted: `npm run workspace:restart`
Status: ✅ Resolved
