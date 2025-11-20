# Vertex AI Migration for Chat UI

## Summary

The LangGraphService has been updated to use **Google Vertex AI** instead of the Gemini API key approach. This aligns with the rest of the codebase which already uses Vertex AI for extraction, discovery, and embeddings.

## Changes Made

### 1. Updated LangGraphService

**File**: `apps/server/src/modules/chat-ui/services/langgraph.service.ts`

**Changed From**:

- `ChatGoogleGenerativeAI` from `@langchain/google-genai`
- API key authentication (`GOOGLE_API_KEY`)
- Direct API access to Gemini

**Changed To**:

- `ChatVertexAI` from `@langchain/google-vertexai`
- Application Default Credentials (ADC) authentication
- Google Cloud Vertex AI service (production-grade)

### 2. Configuration Requirements

**Required Environment Variables**:

```bash
GCP_PROJECT_ID=spec-server-dev              # Your GCP project ID
VERTEX_AI_LOCATION=europe-north1            # GCP region
VERTEX_AI_MODEL=gemini-2.5-flash            # Model name
```

**Current .env Status**:

- ✅ `GCP_PROJECT_ID=spec-server-dev` (already set)
- ❌ `VERTEX_AI_LOCATION` (missing - needs to be added)
- ✅ `VERTEX_AI_MODEL=gemini-2.5-flash` (already set)

## Action Required

Add the missing `VERTEX_AI_LOCATION` to your `.env` file:

```bash
echo "VERTEX_AI_LOCATION=europe-north1" >> .env
```

**Why `europe-north1`?**

- This matches your existing `VERTEX_EMBEDDING_LOCATION` configuration
- Keeps all Vertex AI services in the same region
- Reduces cross-region latency and costs

**Alternative Regions** (if preferred):

- `us-central1` (Iowa, USA)
- `us-west1` (Oregon, USA)
- `europe-west1` (Belgium, EU)
- `europe-west4` (Netherlands, EU)
- `asia-northeast1` (Tokyo, Japan)

## Benefits of Vertex AI

### 1. **Consistent Authentication**

- Uses Application Default Credentials (ADC)
- Same auth mechanism as existing extraction/discovery services
- No API keys to manage

### 2. **Production-Ready**

- Enterprise-grade SLA and reliability
- Better rate limits and quotas
- Integrated monitoring and logging in Google Cloud Console

### 3. **Better Control**

- IAM-based access control
- Audit logging
- Cost tracking per project

### 4. **Already Installed**

- `@langchain/google-vertexai@1.0.0` already in dependencies
- No additional packages needed
- Used throughout the codebase

## How It Works

### Initialization

```typescript
this.model = new ChatVertexAI({
  model: 'gemini-2.5-flash', // From VERTEX_AI_MODEL
  authOptions: {
    projectId: 'spec-server-dev', // From GCP_PROJECT_ID
  },
  location: 'europe-north1', // From VERTEX_AI_LOCATION
  temperature: 0.7,
  maxOutputTokens: 1000,
});
```

### Authentication

- Uses Application Default Credentials (ADC)
- Automatically discovers credentials from:
  1. `GOOGLE_APPLICATION_CREDENTIALS` env var (path to service account key)
  2. Google Cloud SDK (`gcloud auth application-default login`)
  3. GCE/GKE metadata server (when running in Google Cloud)

### API Calls

- Calls Vertex AI API endpoint: `https://{location}-aiplatform.googleapis.com`
- Uses REST API (not direct Gemini API)
- Inherits all Google Cloud quotas and policies

## Existing Vertex AI Usage in Codebase

The codebase already uses Vertex AI extensively:

### 1. **Extraction Jobs** (`extraction-jobs/llm/`)

- `langchain-gemini.provider.ts` - Uses `ChatVertexAI` for entity extraction
- `vertex-ai.provider.ts` - Uses `@google-cloud/vertexai` SDK

### 2. **Discovery Jobs** (`discovery-jobs/`)

- `discovery-llm.provider.ts` - Uses `ChatVertexAI` for type/relationship discovery

### 3. **Chat (Legacy)** (`chat/`)

- `chat-generation.service.ts` - Uses `ChatVertexAI` for chat responses
- `mcp-tool-selector.service.ts` - Uses `ChatVertexAI` for tool selection

### 4. **Embeddings** (`graph/`)

- `google-vertex-embedding.provider.ts` - Uses Vertex AI for embeddings

## Verification

### 1. Check Configuration

```bash
# Check if variables are set
grep -E "^(GCP_PROJECT_ID|VERTEX_AI_LOCATION|VERTEX_AI_MODEL)=" .env
```

**Expected Output**:

```
GCP_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=europe-north1
VERTEX_AI_MODEL=gemini-2.5-flash
```

### 2. Check Authentication

```bash
# Verify ADC is configured
gcloud auth application-default print-access-token
```

If this fails, run:

```bash
gcloud auth application-default login
```

### 3. Test Vertex AI Access

```bash
# List available models (requires gcloud CLI)
gcloud ai models list --region=europe-north1
```

### 4. Start Server and Check Logs

```bash
nx run workspace-cli:workspace:start
nx run workspace-cli:workspace:logs -- --service=server | grep "Vertex AI"
```

**Expected Log**:

```
[LangGraphService] Initializing Vertex AI Chat: project=spec-server-dev, location=europe-north1, model=gemini-2.5-flash
[LangGraphService] Vertex AI Chat initialized: model=gemini-2.5-flash
[LangGraphService] LangGraph conversation graph compiled
```

## Comparison: Gemini API vs Vertex AI

| Feature              | Gemini API (API Key) | Vertex AI (ADC)            |
| -------------------- | -------------------- | -------------------------- |
| **Authentication**   | API key (manual)     | ADC (automatic)            |
| **Rate Limits**      | Lower (per key)      | Higher (per project)       |
| **Monitoring**       | Limited              | Full Cloud Console         |
| **Audit Logging**    | No                   | Yes (Cloud Audit Logs)     |
| **IAM Control**      | No                   | Yes (fine-grained)         |
| **Cost Tracking**    | Manual               | Integrated (Cloud Billing) |
| **SLA**              | No                   | Yes (production SLA)       |
| **Deployment**       | Any environment      | Google Cloud preferred     |
| **Setup Complexity** | Simple (just key)    | Moderate (ADC setup)       |

## Troubleshooting

### Error: "Vertex AI not configured: GCP_PROJECT_ID missing"

**Solution**: Add `GCP_PROJECT_ID` to `.env`

### Error: "Vertex AI not configured: VERTEX_AI_LOCATION missing"

**Solution**: Add `VERTEX_AI_LOCATION` to `.env`

### Error: "Vertex AI not configured: VERTEX_AI_MODEL missing"

**Solution**: Add `VERTEX_AI_MODEL` to `.env`

### Error: "Could not load the default credentials"

**Solution**:

1. Install Google Cloud SDK: `brew install google-cloud-sdk`
2. Login: `gcloud auth application-default login`
3. Verify: `gcloud auth application-default print-access-token`

### Error: "Permission denied" or "403 Forbidden"

**Solution**:

1. Enable Vertex AI API: `gcloud services enable aiplatform.googleapis.com`
2. Grant IAM role: `gcloud projects add-iam-policy-binding PROJECT_ID --member=user:YOUR_EMAIL --role=roles/aiplatform.user`

### Error: "Model not found in region"

**Solution**: Some models are region-specific. Try:

- `us-central1` (most models available)
- Or check available models: `gcloud ai models list --region=REGION`

## Next Steps

1. **Add VERTEX_AI_LOCATION to .env**:

   ```bash
   echo "VERTEX_AI_LOCATION=europe-north1" >> .env
   ```

2. **Verify ADC is configured**:

   ```bash
   gcloud auth application-default login
   ```

3. **Restart services**:

   ```bash
   nx run workspace-cli:workspace:restart
   ```

4. **Check logs**:

   ```bash
   nx run workspace-cli:workspace:logs -- --service=server | grep "Vertex AI"
   ```

5. **Continue with Phase 2 integration** (LangChainAdapter in controller)

## References

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [LangChain Vertex AI Integration](https://python.langchain.com/docs/integrations/chat/google_vertex_ai_palm)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
