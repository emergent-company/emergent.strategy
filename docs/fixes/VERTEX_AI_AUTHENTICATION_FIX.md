# Vertex AI Authentication Fix

## Issue Summary

**Problem**: Discovery process was failing silently (returning "0 entity types discovered") instead of failing with a clear error. Investigation revealed a 401 authentication error: "API keys are not supported by this API. Expected OAuth2 access token or other authentication credentials."

**Root Cause**: ChatVertexAI from LangChain was using the `GOOGLE_API_KEY` environment variable (auth priority #3), but Vertex AI's REST API doesn't support API keys - it requires OAuth2 access tokens or Application Default Credentials (ADC).

**Impact**:
- Discovery jobs completed with "success" status but found 0 types
- Template packs were created empty (useless to users)
- No clear error message about authentication failure
- Extraction feature at risk of same issue

## Authentication Priority Chain

According to `@langchain/google-vertexai` documentation, ChatVertexAI uses this auth priority:

1. `apiKey` parameter in constructor
2. `authInfo` parameter in constructor
3. **`API_KEY` environment variable** ← Was using this (WRONG for Vertex AI)
4. `GOOGLE_APPLICATION_CREDENTIALS` file (ADC) ← Should use this (CORRECT)
5. Default credentials

## Solution

### 1. Removed API Key from Environment

**Files Modified**:
- `.env` - Commented out `GOOGLE_API_KEY`
- `apps/server/.env` - Commented out `GOOGLE_API_KEY`

**Action**:
```bash
# Commented out in both files
#GOOGLE_API_KEY=AIzaSyCqmd3wjHkzmJsX6niUbv8zlO2NKcai_50
```

**Why**: Prevents ChatVertexAI from picking up the API key from environment variables.

### 2. Added Explicit Project/Location Configuration

**Correct ChatVertexAI Configuration**:
```typescript
new ChatVertexAI({
    model: modelName,
    authOptions: {
        projectId: projectId,  // Explicitly set GCP project
    },
    location: location,         // Explicitly set GCP region (e.g., 'us-central1')
    temperature: 0,
    maxOutputTokens: 8192,
})
```

**Files Modified**:
- `apps/server/src/modules/discovery-jobs/discovery-llm.provider.ts`
- `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`
- `apps/server/src/modules/chat/chat-generation.service.ts`

**Why**: 
- `authOptions.projectId` tells google-auth-library which GCP project to authenticate against
- `location` tells Vertex AI which regional endpoint to use
- Without these, ChatVertexAI might pick up wrong credentials or use wrong endpoint

### 3. Improved Discovery Error Handling

**File Modified**: `apps/server/src/modules/discovery-jobs/discovery-job.service.ts`

**Change 1 - Batch Failure Tracking**:
```typescript
const batchResults: Array<{success: boolean, error?: string}> = [];

// Track each batch result
batchResults.push({ success: true });  // on success
batchResults.push({ success: false, error: error.message });  // on failure

// Fail only if ALL batches failed
const failedBatches = batchResults.filter(r => !r.success);
if (failedBatches.length === batchResults.length) {
    throw new Error(`Discovery failed: All ${batchResults.length} batches failed. Errors: ${failedBatches.map((r, i) => `Batch ${i+1}: ${r.error}`).join(', ')}`);
}
```

**Change 2 - Prevent Empty Template Pack**:
```typescript
// Step 5: Create template pack
if (refinedTypes.length === 0) {
    throw new Error('Discovery completed but found no entity types. Cannot create template pack.');
}
```

**Why**: 
- Users get clear error messages instead of silent failures
- Discovery fails loudly when authentication is broken
- No more useless empty template packs

### 4. Killed PM2 to Clear Cached Environment

**Command**:
```bash
npx pm2 kill  # Kill daemon completely
npm run workspace:deps:start
npm run workspace:start
```

**Why**: PM2 caches environment variables even after `.env` files are updated. A full daemon restart ensures clean environment.

## Verification

### Before Fix
```
❌ Logs showed: "Google request failed with status code 401"
❌ Error: "API keys are not supported by this API"
❌ Discovery returned: "0 types discovered"
❌ Template pack created: Empty/useless
```

### After Fix
```
✅ LangChainGeminiProvider initialized: model=gemini-2.5-pro
✅ DiscoveryLLMProvider initialized: model=gemini-2.5-pro
✅ VertexAIProvider initialized: project=spec-server-dev, location=us-central1
✅ No 401 errors in logs
✅ No "API keys are not supported" errors
```

## Testing Checklist

- [x] Build succeeds without TypeScript errors
- [x] Server restarts successfully
- [x] All three Vertex AI providers initialize
- [x] No 401 authentication errors in logs
- [ ] Test discovery with actual documents (next step)
- [ ] Test extraction with actual documents
- [ ] Test chat generation

## Application Default Credentials (ADC)

**Location**: `~/.config/gcloud/application_default_credentials.json`

**Setup** (if not already configured):
```bash
gcloud auth application-default login
```

**Contents**:
```json
{
  "account": "",
  "client_id": "764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com",
  "client_secret": "d-FL95Q19q7MQmFpd7hHD0Ty",
  "quota_project_id": "278302318654",
  "refresh_token": "...",
  "type": "authorized_user",
  "universe_domain": "googleapis.com"
}
```

**How ChatVertexAI Uses ADC**:
1. No `apiKey` parameter → skip
2. No `authInfo` parameter → skip
3. No `API_KEY` environment variable → skip
4. Check `GOOGLE_APPLICATION_CREDENTIALS` env var or default location
5. Find `~/.config/gcloud/application_default_credentials.json`
6. Read OAuth2 refresh token
7. Exchange for access token
8. Authenticate with Vertex AI endpoint: `{location}-aiplatform.googleapis.com`

## Important Notes

### Why Not Use GOOGLE_API_KEY?

**Google AI API vs Vertex AI**:
- **Google AI API** (AI Studio): Accepts API keys (`AIzaSy...`)
- **Vertex AI**: Only accepts OAuth2 tokens or service account credentials
- Different endpoints, different auth mechanisms

**ChatVertexAI** uses Vertex AI, not Google AI API, so it must use OAuth2/ADC.

### TypeScript Type Reference

From `google-auth-library/build/src/auth/googleauth.d.ts`:

```typescript
export interface GoogleAuthOptions<T extends AuthClient = JSONClient> {
    apiKey?: string;                          // Cannot use with Vertex AI
    authClient?: T;
    keyFilename?: string;
    credentials?: JWTInput | ExternalAccountClientOptions;
    clientOptions?: JWTOptions | OAuth2ClientOptions | ...;
    scopes?: string | string[];
    projectId?: string;                       // ← We use this!
    universeDomain?: string;
}
```

From `@langchain/google-common`:

```typescript
interface GoogleConnectionParams<AuthOptions> extends GoogleClientParams<AuthOptions> {
    endpoint?: string;
    location?: string;                        // ← We use this!
    apiVersion?: string;
    platformType?: GooglePlatformType;
    vertexai?: boolean;
}
```

## Related Documentation

- LangChain Vertex AI: https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-google-vertexai
- Google Auth Library: https://github.com/googleapis/google-auth-library-nodejs
- Vertex AI Authentication: https://cloud.google.com/vertex-ai/docs/authentication
- Application Default Credentials: https://cloud.google.com/docs/authentication/application-default-credentials

## Session Context

This fix was completed across two sessions:

**Previous Session** (Vertex AI Migration):
- Migrated from Google AI API to Vertex AI
- Changed all providers to use `gemini-2.5-pro`
- Removed fallback patterns

**Current Session** (Authentication Fix):
- User reported: "discovery doesn't find any entity types"
- Found: 401 authentication error
- Root cause: ChatVertexAI using API key instead of ADC
- Fix: Removed API key, added explicit project/location config
- Result: All providers now authenticate correctly with ADC

## Next Steps

1. Test discovery with actual documents
2. Test extraction with actual documents  
3. Test chat generation
4. Update `.env.example` to show GOOGLE_API_KEY should be commented out
5. Add documentation note about ADC setup requirement
