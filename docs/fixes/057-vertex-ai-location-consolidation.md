# Fix 057: Vertex AI Location Variable Consolidation

**Date:** 2025-01-21  
**Status:** Completed  
**Type:** Configuration Refactoring  
**Component:** Vertex AI / Embeddings Configuration

## Summary

Simplified Vertex AI configuration by consolidating location variables. Now uses a single `VERTEX_AI_LOCATION` variable for both LLM and embeddings instead of separate `VERTEX_AI_LOCATION` and `VERTEX_EMBEDDING_LOCATION`.

## Problem

The configuration had redundant location variables:
- `VERTEX_AI_LOCATION` - for LLM/chat models
- `VERTEX_EMBEDDING_LOCATION` - for embedding models
- `VERTEX_EMBEDDING_MODEL` - for embedding model name (now hardcoded to text-embedding-004)
- `VERTEX_EMBEDDING_PROJECT` - for project ID (now uses GCP_PROJECT_ID)

This created unnecessary complexity and potential for misconfiguration.

## Solution

**Consolidated to single variables:**
- `VERTEX_AI_LOCATION` - Single location for all Vertex AI services
- `GCP_PROJECT_ID` - Single project ID for all GCP services
- Embedding model hardcoded to `text-embedding-004`

## Changes Made

### 1. Configuration Files

**apps/server/.env.example**
```diff
- VERTEX_AI_LOCATION=us-central1
- VERTEX_AI_MODEL=gemini-2.5-flash-lite
- VERTEX_EMBEDDING_LOCATION=us-central1
- VERTEX_EMBEDDING_MODEL=text-embedding-004
- VERTEX_EMBEDDING_PROJECT=  # Defaults to GCP_PROJECT_ID
+ # Vertex AI - Single location for all Vertex AI services (LLM and embeddings)
+ VERTEX_AI_LOCATION=us-central1
+ 
+ # LLM Model
+ VERTEX_AI_MODEL=gemini-2.5-flash-lite
+ 
+ # Embeddings (uses VERTEX_AI_LOCATION and GCP_PROJECT_ID)
  EMBEDDING_PROVIDER=vertex
- EMBEDDING_DIMENSION=1536
+ EMBEDDING_DIMENSION=768
```

### 2. Config Schema

**apps/server/src/common/config/config.schema.ts**
```diff
- // --- Vertex AI Embedding Configuration ---
- @IsString()
- @IsOptional()
- VERTEX_EMBEDDING_LOCATION?: string;
- 
- @IsString()
- @IsOptional()
- VERTEX_EMBEDDING_MODEL?: string;
- 
- @IsString()
- @IsOptional()
- VERTEX_EMBEDDING_PROJECT?: string;
- 
+ // --- Embeddings Configuration ---
  @IsString()
  @IsOptional()
  EMBEDDING_PROVIDER?: string;
```

### 3. Main Validation

**apps/server/src/main.ts**
```diff
  if (process.env.EMBEDDING_PROVIDER === 'vertex') {
-   if (!process.env.VERTEX_EMBEDDING_LOCATION) {
-     errors.push('❌ VERTEX_EMBEDDING_LOCATION is required when EMBEDDING_PROVIDER=vertex');
+   if (!process.env.VERTEX_AI_LOCATION) {
+     errors.push('❌ VERTEX_AI_LOCATION is required when EMBEDDING_PROVIDER=vertex');
    }
-   if (!process.env.VERTEX_EMBEDDING_MODEL) {
-     errors.push('❌ VERTEX_EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=vertex');
-   }
-   if (!process.env.GCP_PROJECT_ID && !process.env.VERTEX_EMBEDDING_PROJECT) {
-     errors.push('❌ GCP_PROJECT_ID or VERTEX_EMBEDDING_PROJECT is required for Vertex AI');
+   if (!process.env.GCP_PROJECT_ID) {
+     errors.push('❌ GCP_PROJECT_ID is required for Vertex AI');
    }
  }
```

### 4. Embedding Provider

**apps/server/src/modules/graph/google-vertex-embedding.provider.ts**
```diff
  private initialize() {
-   const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
-   const location = process.env.VERTEX_EMBEDDING_LOCATION;
+   const projectId = process.env.GCP_PROJECT_ID;
+   const location = process.env.VERTEX_AI_LOCATION;
    
    if (!projectId || !location) {
      this.logger.warn(
        'Vertex AI Embeddings not configured. Required: ' +
-         'VERTEX_EMBEDDING_PROJECT, VERTEX_EMBEDDING_LOCATION. ' +
+         'GCP_PROJECT_ID, VERTEX_AI_LOCATION. ' +
        'Check your .env file.'
      );
    }
  }

  async generate(text: string): Promise<number[]> {
-   const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
-   const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
-   const location = process.env.VERTEX_EMBEDDING_LOCATION;
+   const model = 'text-embedding-004';
+   const projectId = process.env.GCP_PROJECT_ID;
+   const location = process.env.VERTEX_AI_LOCATION;
  }
```

### 5. Embeddings Service

**apps/server/src/modules/embeddings/embeddings.service.ts**
```diff
  private async ensureClient(): Promise<EmbeddingClient> {
    const useVertexAI =
-     process.env.VERTEX_EMBEDDING_PROJECT &&
-     process.env.VERTEX_EMBEDDING_LOCATION;
+     process.env.GCP_PROJECT_ID &&
+     process.env.VERTEX_AI_LOCATION;
  }

  private async createVertexAIClient(): Promise<EmbeddingClient> {
-   const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
-   const location = process.env.VERTEX_EMBEDDING_LOCATION;
-   const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
+   const projectId = process.env.GCP_PROJECT_ID;
+   const location = process.env.VERTEX_AI_LOCATION;
+   const model = 'text-embedding-004';
  }
```

### 6. Test Script

**scripts/test-vertex-ai-credentials.mjs**
```diff
  function captureEnvState(phase) {
    const vars = [
      'GCP_PROJECT_ID',
      'VERTEX_AI_PROJECT_ID',
      'VERTEX_AI_LOCATION',
      'VERTEX_AI_MODEL',
-     'VERTEX_EMBEDDING_LOCATION',
-     'VERTEX_EMBEDDING_MODEL',
      'GOOGLE_APPLICATION_CREDENTIALS',
    ];
  }

  async function testEmbeddings() {
    const projectId = process.env.GCP_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID;
-   const location = process.env.VERTEX_EMBEDDING_LOCATION;
-   const model = process.env.VERTEX_EMBEDDING_MODEL;
+   const location = process.env.VERTEX_AI_LOCATION;
+   const model = 'text-embedding-004';
  }
```

## Migration Guide

### For Existing Deployments

If you have existing `.env` or `.env.local` files with separate embedding variables:

**Before:**
```bash
VERTEX_AI_LOCATION=us-central1
VERTEX_EMBEDDING_LOCATION=europe-north1
VERTEX_EMBEDDING_MODEL=text-embedding-004
VERTEX_EMBEDDING_PROJECT=my-project
```

**After:**
```bash
VERTEX_AI_LOCATION=us-central1  # Used for both LLM and embeddings
# Remove VERTEX_EMBEDDING_LOCATION
# Remove VERTEX_EMBEDDING_MODEL (hardcoded to text-embedding-004)
# Remove VERTEX_EMBEDDING_PROJECT (uses GCP_PROJECT_ID)
```

**Important:** If you were using different locations for LLM and embeddings, choose one location and use it for both. The embedding model is now hardcoded to `text-embedding-004`.

### Environment Variable Changes

| Old Variable | New Variable | Notes |
|---|---|---|
| `VERTEX_EMBEDDING_LOCATION` | `VERTEX_AI_LOCATION` | Single location for all services |
| `VERTEX_EMBEDDING_MODEL` | _(removed)_ | Hardcoded to `text-embedding-004` |
| `VERTEX_EMBEDDING_PROJECT` | `GCP_PROJECT_ID` | Use existing GCP project ID |

## Benefits

1. **Simpler Configuration** - Fewer variables to manage
2. **Consistent Location** - LLM and embeddings use same region
3. **Less Error-Prone** - Can't misconfigure separate locations
4. **Cleaner Code** - Less conditional logic around configuration
5. **Standard Model** - Embeddings always use latest recommended model (text-embedding-004)

## Testing

All tests pass after changes:
```
✅ Credentials: PASS
✅ Embeddings API: PASS (text-embedding-004, 768-dim)
✅ Chat/LLM API: PASS (gemini-2.5-flash-lite)
```

## Related Files

- `apps/server/.env.example` - Updated configuration example
- `apps/server/src/common/config/config.schema.ts` - Removed embedding-specific vars
- `apps/server/src/main.ts` - Updated validation
- `apps/server/src/modules/graph/google-vertex-embedding.provider.ts` - Uses shared location
- `apps/server/src/modules/embeddings/embeddings.service.ts` - Uses shared location
- `scripts/test-vertex-ai-credentials.mjs` - Updated test script

## Notes

- Embedding model is now hardcoded to `text-embedding-004` (768 dimensions)
- This is Google's recommended embedding model for production use
- If you need a different embedding model in the future, it can be made configurable again
- This change does not affect existing embeddings in the database
