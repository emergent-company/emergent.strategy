# Vertex AI Chat Configuration

## Overview

The chat generation system now supports **Vertex AI** as the primary LLM provider, using Google's Gemini models through Vertex AI. This provides enterprise-grade authentication, better reliability, and unified billing with other Google Cloud services.

## Configuration Changes

### Config Service Updates

**File**: `apps/server-nest/src/common/config/config.service.ts`

Updated `chatModelEnabled` getter to support both authentication methods:

```typescript
/**
 * Chat model is enabled if CHAT_MODEL_ENABLED is true AND we have either:
 * - GOOGLE_API_KEY (for direct Gemini API access), OR
 * - VERTEX_AI_PROJECT_ID (for Vertex AI authentication)
 */
get chatModelEnabled() { 
    const hasProvider = !!this.env.GOOGLE_API_KEY || !!this.env.VERTEX_AI_PROJECT_ID;
    return hasProvider && !!this.env.CHAT_MODEL_ENABLED; 
}
```

### Chat Generation Service Updates

**File**: `apps/server-nest/src/modules/chat/chat-generation.service.ts`

Updated `hasKey` getter to check for Vertex AI credentials:

```typescript
/**
 * Check if we have authentication configured for the chat model.
 * Supports both direct Google API key and Vertex AI project credentials.
 */
get hasKey(): boolean { 
    return !!this.config.googleApiKey || !!this.config.vertexAiProjectId; 
}
```

## Environment Variables

### Required Variables

```bash
# Enable chat model
CHAT_MODEL_ENABLED=true

# Vertex AI Configuration (Primary)
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# Optional: Direct API Key (Fallback)
# GOOGLE_API_KEY=your-api-key-here
```

### Variable Priority

The system checks for authentication in this order:
1. **VERTEX_AI_PROJECT_ID** + Application Default Credentials (ADC) - **Preferred**
2. **GOOGLE_API_KEY** - Fallback for development

## Authentication Setup

### Vertex AI (Production Method)

1. **Install Google Cloud SDK** (if not already installed):
   ```bash
   brew install google-cloud-sdk
   ```

2. **Login to Google Cloud**:
   ```bash
   gcloud auth login
   ```

3. **Set Application Default Credentials**:
   ```bash
   gcloud auth application-default login
   ```

4. **Verify Authentication**:
   ```bash
   gcloud auth application-default print-access-token
   ```
   Should output a valid access token (starts with `ya29.`).

5. **Set Project** (optional, but recommended):
   ```bash
   gcloud config set project spec-server-dev
   ```

### Verification

Check that authentication is working:

```bash
# Should return a token
gcloud auth application-default print-access-token

# Check configuration
grep -E "VERTEX_AI|CHAT_MODEL_ENABLED" apps/server-nest/.env
```

Expected output:
```
CHAT_MODEL_ENABLED=true
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
```

## How It Works

### Authentication Flow

```
User Query
    ↓
Chat Controller
    ↓
Chat Generation Service
    ↓
Check: hasKey? (GOOGLE_API_KEY || VERTEX_AI_PROJECT_ID)
    ↓
Check: enabled? (hasKey && CHAT_MODEL_ENABLED)
    ↓
Initialize ChatVertexAI with:
  - model: gemini-2.5-flash
  - authOptions.projectId: spec-server-dev
  - location: us-central1
    ↓
Vertex AI authenticates using ADC
    ↓
Generate response
```

### LangChain Integration

The system uses `@langchain/google-vertexai` package:

```typescript
const model = new ChatVertexAI({
    model: this.config.vertexAiModel,           // gemini-2.5-flash
    authOptions: {
        projectId: this.config.vertexAiProjectId, // spec-server-dev
    },
    location: this.config.vertexAiLocation,      // us-central1
    temperature: 0,
    maxOutputTokens: 8192,
});
```

**Authentication**: Uses Application Default Credentials (ADC) automatically. No need to pass explicit credentials in code.

## Model Options

### Available Gemini Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `gemini-2.5-flash` | Fast, cost-effective | **Current default** - Chat, quick queries |
| `gemini-2.5-pro` | Higher quality, slower | Complex reasoning, analysis |
| `gemini-1.5-pro` | Previous generation | Fallback if 2.5 unavailable |
| `gemini-1.5-flash` | Fast previous gen | Cost-sensitive workloads |

### Changing Models

Edit `.env`:
```bash
VERTEX_AI_MODEL=gemini-2.5-pro
```

Then restart:
```bash
npm run workspace:restart
```

## Cost Considerations

### Vertex AI Pricing (as of 2024)

**Gemini 2.5 Flash**:
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Gemini 2.5 Pro**:
- Input: $1.25 per 1M tokens
- Output: $5.00 per 1M tokens

**Recommendations**:
- Development: Use `gemini-2.5-flash` (faster, cheaper)
- Production: Consider `gemini-2.5-pro` for critical queries
- Monitor usage via Google Cloud Console

## Troubleshooting

### Error: "chat model disabled"

**Cause**: Either `CHAT_MODEL_ENABLED` is false, or no authentication is configured.

**Solution**:
1. Check `.env`:
   ```bash
   grep CHAT_MODEL_ENABLED apps/server-nest/.env
   grep VERTEX_AI_PROJECT_ID apps/server-nest/.env
   ```
2. Verify ADC:
   ```bash
   gcloud auth application-default print-access-token
   ```
3. Restart services:
   ```bash
   npm run workspace:restart
   ```

### Error: "Missing required scope"

**Cause**: SCOPES_DISABLED flag issue (fixed in Bug #3).

**Solution**: Already fixed. Ensure backend is rebuilt.

### Error: "Vertex AI authentication failed"

**Cause**: Application Default Credentials not configured or expired.

**Solution**:
```bash
# Re-authenticate
gcloud auth application-default login

# Verify
gcloud auth application-default print-access-token

# Restart
npm run workspace:restart
```

### Error: "Project not found" or "Permission denied"

**Cause**: 
- Project ID incorrect in `.env`
- User doesn't have access to project
- Vertex AI API not enabled

**Solution**:
1. Verify project ID:
   ```bash
   gcloud projects list
   ```
2. Check current project:
   ```bash
   gcloud config get-value project
   ```
3. Enable Vertex AI API:
   ```bash
   gcloud services enable aiplatform.googleapis.com --project=spec-server-dev
   ```
4. Check IAM permissions (need `Vertex AI User` role)

## Migration from Google API Key

If you were previously using `GOOGLE_API_KEY`:

### Before
```bash
CHAT_MODEL_ENABLED=true
GOOGLE_API_KEY=AIzaSyCqmd3wjHkzmJsX6niUbv8zlO2NKcai_50
```

### After
```bash
CHAT_MODEL_ENABLED=true
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# Optional: Keep as fallback
# GOOGLE_API_KEY=AIzaSyCqmd3wjHkzmJsX6niUbv8zlO2NKcai_50
```

**Benefits of Vertex AI**:
- ✅ Unified billing with other GCP services
- ✅ Enterprise support and SLAs
- ✅ Better rate limits
- ✅ Service account authentication
- ✅ VPC Service Controls support
- ✅ Audit logging
- ✅ Quota management

## Testing

### Manual Test

1. Navigate to: http://localhost:5175/admin/apps/chat/c/new
2. Type: "What is the current schema version?"
3. Expected:
   - Blue badge appears: "Querying schema version..."
   - Badge disappears (~100ms)
   - LLM response streams with actual version number

### Debug Mode

Enable debug logging:
```bash
# Add to .env
E2E_DEBUG_CHAT=1

# Restart
npm run workspace:restart

# View logs
npm run workspace:logs -- --follow | grep -E "(gen|VERTEX)"
```

Expected logs:
```
[gen] start enabled=true model=gemini-2.5-flash promptPreview="..."
[gen] success tokens=128
```

### Verify Configuration

```bash
# Check all chat-related vars
grep -E "CHAT_|VERTEX_AI" apps/server-nest/.env

# Expected output:
# CHAT_MODEL_ENABLED=true
# VERTEX_AI_PROJECT_ID=spec-server-dev
# VERTEX_AI_LOCATION=us-central1
# VERTEX_AI_MODEL=gemini-2.5-flash
```

## Related Documentation

- `docs/MCP_CHAT_INTEGRATION_SUMMARY.md` - Overall MCP chat architecture
- `docs/MCP_CHAT_DIAGRAMS.md` - Visual diagrams and testing guide
- `docs/MCP_CHAT_MANUAL_TESTING_BUG_FIXES.md` - Bug fixes during testing
- `.github/instructions/nestjs.instructions.md` - NestJS development standards

## Summary

✅ **Vertex AI configured as primary LLM provider**  
✅ **Application Default Credentials working**  
✅ **Chat model enabled with Gemini 2.5 Flash**  
✅ **Fallback to Google API Key supported**  
✅ **Ready for production use**

The chat system now uses enterprise-grade Vertex AI authentication with automatic credential management through Google Cloud SDK.
