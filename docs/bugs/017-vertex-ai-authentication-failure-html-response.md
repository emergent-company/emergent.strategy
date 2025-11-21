# Bug #017: Vertex AI Authentication Failure Causing HTML Response

**Status:** Identified  
**Severity:** High  
**Date Reported:** 2025-11-20  
**Reported By:** AI Agent (via extraction job retry investigation)

## Summary

Extraction jobs are failing with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` because the Google Cloud Vertex AI SDK is not properly authenticated. The API is returning HTML error pages instead of JSON responses, indicating missing or invalid GCP credentials.

## Evidence

### Error Message

```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

### Stack Trace

```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
    at JSON.parse (<anonymous>)
    at parseJSONFromBytes (node:internal/deps/undici/undici:6433:19)
    at successSteps (node:internal/deps/undici/undici:6414:27)
    at readAllBytes (node:internal/deps/undici/undici:5380:13)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
```

### Debug Metadata

```json
{
  "provider": "VertexAI",
  "failed_calls": 32,
  "first_error": {
    "message": "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
    "stack": "..."
  },
  "allowed_types": null
}
```

### Log Excerpt (apps/logs/server/out.log)

```
[VertexAIProvider] Extracting entities with model: gemini-2.5-flash
[VertexAIProvider] Splitting document (192744 chars) into chunks (size: 100000, overlap: 2000)
[VertexAIProvider] Created 2 chunks
[VertexAIProvider] Extracting 16 types: Book, Angel, Event, Group, Place, Quote, Object, Person, Miracle, Covenant, Prophecy, Meeting, Decision, Question, ActionItem, MeetingSeries
[VertexAIProvider] Extracted 0 total entities across 0 types in 8292ms, tokens: 0
[ExtractionWorkerService] [TIMELINE] Job ... step=llm_extract status=error duration=8383ms message=Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

## Root Cause Analysis

### Issue Location

`apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts:301`

```typescript
const result = await generativeModel.generateContent({
  contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 8192,
  },
});
```

The `@google-cloud/vertexai` SDK's `generateContent()` method is making HTTP requests that return HTML instead of JSON.

### Missing Configuration

**Environment Variable Check:**

```bash
$ env | grep GOOGLE
# No output - GOOGLE_APPLICATION_CREDENTIALS not set
```

**Required Environment Variables:**

- ✅ `GCP_PROJECT_ID` - Set (provider resolves to "VertexAI")
- ✅ `VERTEX_AI_LOCATION` - Set (initialization succeeds)
- ✅ `VERTEX_AI_MODEL` - Set (`gemini-2.5-flash`)
- ❌ `GOOGLE_APPLICATION_CREDENTIALS` - **NOT SET**

### Why HTML is Returned

When the Google Cloud SDK cannot authenticate:

1. It attempts to access the Vertex AI API endpoint
2. GCP's authentication layer rejects the request
3. Instead of returning a JSON error, it returns an HTML error page
4. The HTML starts with `<!DOCTYPE html>`
5. The SDK tries to parse this as JSON → Parse error

This is a common pattern with cloud APIs that use web-based authentication fallbacks.

## Impact

- **All extraction jobs fail** when using Vertex AI provider
- **32 failed LLM calls** per job (2 chunks × 16 entity types)
- **Jobs marked as `failed`** with unhelpful error messages
- **Rate limit tokens consumed** for failed requests
- **No entity extraction** possible until credentials are configured

## Affected Components

- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`
- `apps/server/src/common/config/config.service.ts`
- Extraction worker service
- All extraction jobs using `source_type: 'document'`

## Reproduction Steps

1. Create an extraction job without setting `GOOGLE_APPLICATION_CREDENTIALS`
2. Wait for worker to pick up the job
3. Observe error: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
4. Check `debug_info.timeline` → see 32 failed LLM calls
5. Check logs → see "Extracted 0 total entities"

## Proposed Solution

### Option 1: Set Environment Variable (Immediate Fix)

Add to `.env.local` or `.env.test.local`:

```bash
# Path to GCP service account key JSON file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Example:
# GOOGLE_APPLICATION_CREDENTIALS=/Users/mcj/.config/gcloud/application_default_credentials.json
```

**OR** use Application Default Credentials (ADC):

```bash
gcloud auth application-default login
```

This creates credentials at:

- macOS/Linux: `~/.config/gcloud/application_default_credentials.json`
- Windows: `%APPDATA%\gcloud\application_default_credentials.json`

### Option 2: Add Credentials Check to Provider (Preventive)

Modify `vertex-ai.provider.ts` initialization:

```typescript
private initialize() {
  const projectId = this.config.vertexAiProjectId;
  const location = this.config.vertexAiLocation;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!projectId) {
    this.logger.warn('Vertex AI not configured: GCP_PROJECT_ID missing');
    return;
  }

  if (!location) {
    this.logger.warn('Vertex AI not configured: VERTEX_AI_LOCATION missing');
    return;
  }

  // NEW: Check for credentials
  if (!credsPath && !this.hasApplicationDefaultCredentials()) {
    this.logger.error(
      'Vertex AI not configured: GOOGLE_APPLICATION_CREDENTIALS not set and no Application Default Credentials found. ' +
      'Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS environment variable.'
    );
    return;
  }

  try {
    this.vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });
    this.logger.log(
      `Vertex AI initialized: project=${projectId}, location=${location}`
    );
  } catch (error) {
    this.logger.error('Failed to initialize Vertex AI', error);
    this.vertexAI = null;
  }
}

private hasApplicationDefaultCredentials(): boolean {
  const adcPath = process.env.HOME
    ? `${process.env.HOME}/.config/gcloud/application_default_credentials.json`
    : null;

  if (!adcPath) return false;

  try {
    return require('fs').existsSync(adcPath);
  } catch {
    return false;
  }
}
```

### Option 3: Better Error Handling (Defensive)

Wrap the `generateContent()` call to detect HTML responses:

```typescript
try {
  const result = await generativeModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });
  // ... existing code
} catch (error) {
  // Check if this is an authentication error based on HTML response
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (
    errorMessage.includes('<!DOCTYPE') ||
    errorMessage.includes('Unexpected token')
  ) {
    throw new Error(
      'Vertex AI authentication failed. Please ensure GOOGLE_APPLICATION_CREDENTIALS is set ' +
        'or run `gcloud auth application-default login`. Original error: ' +
        errorMessage
    );
  }

  throw error;
}
```

## Related Issues

- Bug #016: Extraction rate limiting causes job failures (fixed - led to discovery of this bug)
- The retry functionality (newly implemented) helped surface this issue

## Next Steps

1. **Immediate:** Set `GOOGLE_APPLICATION_CREDENTIALS` in environment
2. **Short-term:** Add credentials validation to provider initialization
3. **Long-term:** Add comprehensive GCP setup documentation
4. **Testing:** Verify extraction works after credentials are configured

## Documentation Needed

- `docs/setup/gcp-vertex-ai-setup.md` - How to configure GCP credentials
- `README.md` - Add GCP credentials to setup instructions
- `.env.example` - Add `GOOGLE_APPLICATION_CREDENTIALS` with example

## Related Files

- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts` - Provider initialization
- `apps/server/src/common/config/config.service.ts` - Configuration management
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Error handling
- `.env.example` - Environment variable template
