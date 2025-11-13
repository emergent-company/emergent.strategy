# Discovery Feature: Migration to Vertex AI

**Date**: October 19, 2025  
**Status**: ✅ Complete

## Overview

Migrated the Discovery feature from Google AI API (direct) to Vertex AI to align with the existing extraction pipeline and use enterprise-grade GCP credentials.

## Changes Made

### 1. Package Installation

```bash
npm install @langchain/google-vertexai
```

Installed `@langchain/google-vertexai` package to use Vertex AI instead of the direct Google Generative AI API.

### 2. Code Updates

**File**: `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`

#### Import Change
```typescript
// Before
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// After
import { ChatVertexAI } from '@langchain/google-vertexai';
```

#### Type Declaration
```typescript
// Before
private model: ChatGoogleGenerativeAI | null = null;

// After
private model: ChatVertexAI | null = null;
```

#### Initialization Logic
```typescript
// Before
private initialize() {
    const apiKey = this.config.googleApiKey;
    if (!apiKey) {
        this.logger.warn('LangChain Gemini not configured: GOOGLE_API_KEY missing');
        return;
    }
    
    this.model = new ChatGoogleGenerativeAI({
        apiKey: apiKey,
        model: modelName,
        temperature: 0,
        maxOutputTokens: 8192,
    });
}

// After
private initialize() {
    const projectId = this.config.vertexAiProjectId;
    const location = this.config.vertexAiLocation || 'us-central1';
    const modelName = this.config.vertexAiModel || 'gemini-1.5-flash';
    
    if (!projectId) {
        this.logger.warn('LangChain Gemini not configured: VERTEX_AI_PROJECT_ID missing');
        return;
    }
    
    this.model = new ChatVertexAI({
        model: modelName,
        temperature: 0,
        maxOutputTokens: 8192,
        // Vertex AI uses Application Default Credentials (ADC)
    });
}
```

### 3. PM2 Environment Configuration

**File**: `tools/workspace-cli/pm2/ecosystem.apps.cjs`

```javascript
env_development: {
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
    VERTEX_AI_MODEL: 'gemini-1.5-flash',
    VERTEX_AI_PROJECT_ID: 'spec-server-dev',
    VERTEX_AI_LOCATION: 'us-central1'
}
```

Removed `GOOGLE_API_KEY` and added Vertex AI configuration.

### 4. Environment Variables

**Required in `.env`**:
```bash
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-1.5-flash
```

**No longer needed**:
- `GOOGLE_API_KEY` (removed)

## Benefits

1. **Unified Authentication**: Both discovery and extraction now use Vertex AI with GCP credentials
2. **Enterprise Features**: Access to Vertex AI's enterprise features and SLAs
3. **Cost Management**: Better cost tracking and quota management through GCP
4. **Security**: Uses Application Default Credentials instead of API keys
5. **Consistency**: Same model access and configuration across all LLM features

## Authentication

Vertex AI uses **Application Default Credentials (ADC)**:

- In development: Uses `gcloud auth application-default login`
- In production: Uses service account keys or workload identity
- No API key needed in environment variables

## Testing

After migration, verify discovery works:

1. Navigate to Discovery Wizard
2. Click "Run Discovery"
3. Check logs for: `Initializing Vertex AI: project=spec-server-dev, location=us-central1, model=gemini-1.5-flash`
4. Verify types are discovered successfully

## Logs

**Successful initialization**:
```
[LOG] [LangChainGeminiProvider] Initializing Vertex AI: project=spec-server-dev, location=us-central1, model=gemini-1.5-flash
[LOG] [LangChainGeminiProvider] LangChain Gemini initialized: model=gemini-1.5-flash
```

## Rollback

If needed, revert by:
1. Reinstall `@langchain/google-genai`
2. Change imports back to `ChatGoogleGenerativeAI`
3. Restore `GOOGLE_API_KEY` in PM2 config
4. Update initialization to use API key

## Related Documentation

- [Vertex AI LangChain Documentation](https://js.langchain.com/docs/integrations/chat/google_vertex_ai)
- [Google Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- Extraction Worker: Already using Vertex AI
- Chat Service: Uses direct Google AI API (may migrate later)
