# Extraction Worker Setup Guide

## Current Status ✅

**Worker Code**: ✅ Complete and registered  
**Worker Status**: ⚠️ NOT ENABLED (missing environment configuration)  
**Server Status**: ✅ Running (PID 35166)

## Prerequisites

The extraction worker requires an LLM provider to be configured. Two options are available:

### Option 1: Google AI Studio (Recommended for Development)
- **Service**: Google Gemini API via AI Studio
- **Cost**: Free tier available
- **Setup Time**: ~5 minutes
- **Best for**: Development, testing, small-scale usage

### Option 2: Google Vertex AI (Production)
- **Service**: Google Cloud Vertex AI
- **Cost**: Pay-per-use (requires GCP project with billing)
- **Setup Time**: ~30 minutes (includes GCP setup)
- **Best for**: Production deployments, enterprise usage

## Setup Instructions

### Option 1: Enable with Google AI Studio (Quick Start)

#### Step 1: Get API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the generated key (starts with `AIza...`)

#### Step 2: Configure Environment

Add to your `.env` file (in project root):

```bash
# Google AI API Key for extraction worker
GOOGLE_API_KEY=AIza...your-key-here

# Enable extraction worker
EXTRACTION_WORKER_ENABLED=true

# Optional: Worker configuration (defaults shown)
EXTRACTION_WORKER_POLL_INTERVAL_MS=5000       # Poll every 5 seconds
EXTRACTION_WORKER_BATCH_SIZE=5                 # Process 5 jobs per batch
EXTRACTION_RATE_LIMIT_RPM=60                   # 60 requests per minute
EXTRACTION_RATE_LIMIT_TPM=30000                # 30k tokens per minute
```

#### Step 3: Restart Server

```bash
# Stop current server (Ctrl+C in server terminal)
# Then restart:
npm run dev
```

#### Step 4: Verify Worker Started

Look for these log messages on startup:

```
[ExtractionWorkerService] Extraction worker started (poll interval: 5000ms)
[LLMProviderFactory] Using Google AI provider (model: gemini-1.5-pro-002)
```

If you see:
```
[ExtractionWorkerService] Extraction worker disabled: no LLM provider configured
```
→ Check that `GOOGLE_API_KEY` is set correctly in `.env`

---

### Option 2: Enable with Vertex AI (Production Setup)

#### Step 1: GCP Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable billing for the project
4. Enable Vertex AI API:
   - Go to "APIs & Services" → "Enable APIs and Services"
   - Search for "Vertex AI API"
   - Click "Enable"

#### Step 2: Authentication

Choose one of:

**A) Service Account (Recommended for servers)**
```bash
# Create service account
gcloud iam service-accounts create extraction-worker \
    --display-name="Extraction Worker Service Account"

# Grant Vertex AI User role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:extraction-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Create and download key
gcloud iam service-accounts keys create vertex-key.json \
    --iam-account=extraction-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Set environment variable to key path
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/vertex-key.json"
```

**B) Application Default Credentials (for local dev)**
```bash
gcloud auth application-default login
```

#### Step 3: Configure Environment

Add to your `.env` file:

```bash
# Vertex AI Configuration
VERTEX_AI_PROJECT_ID=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1              # or your preferred region
VERTEX_AI_MODEL=gemini-1.5-pro-002          # or other supported model

# Enable extraction worker
EXTRACTION_WORKER_ENABLED=true

# Optional: Worker configuration
EXTRACTION_WORKER_POLL_INTERVAL_MS=5000
EXTRACTION_WORKER_BATCH_SIZE=5
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000
```

#### Step 4: Restart Server

```bash
npm run dev
```

#### Step 5: Verify

Look for:
```
[ExtractionWorkerService] Extraction worker started (poll interval: 5000ms)
[LLMProviderFactory] Using Vertex AI provider (project: your-project, model: gemini-1.5-pro-002)
```

---

## Configuration Reference

### Required Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `GOOGLE_API_KEY` | Google AI Studio | API key from AI Studio |
| `VERTEX_AI_PROJECT_ID` | Vertex AI | GCP project ID |
| `EXTRACTION_WORKER_ENABLED` | Both | Set to `true` to enable worker |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTRACTION_WORKER_POLL_INTERVAL_MS` | `5000` | How often to poll for pending jobs (ms) |
| `EXTRACTION_WORKER_BATCH_SIZE` | `5` | Max jobs to process per batch |
| `EXTRACTION_RATE_LIMIT_RPM` | `60` | Requests per minute limit |
| `EXTRACTION_RATE_LIMIT_TPM` | `30000` | Tokens per minute limit |
| `EXTRACTION_ENTITY_LINKING_STRATEGY` | `always_new` | Default entity linking: `always_new`, `fuzzy`, `strict` |
| `EXTRACTION_CONFIDENCE_THRESHOLD_MIN` | `0.0` | Minimum confidence score (0.0-1.0) |
| `VERTEX_AI_LOCATION` | `us-central1` | Vertex AI region |
| `VERTEX_AI_MODEL` | `gemini-1.5-pro-002` | Model to use |

---

## Troubleshooting

### Worker Not Starting

**Problem**: No log messages about worker on startup

**Solutions**:
1. Check `.env` file exists and contains `GOOGLE_API_KEY` or `VERTEX_AI_PROJECT_ID`
2. Verify `EXTRACTION_WORKER_ENABLED=true` is set
3. Check database is accessible (worker requires DB connection)
4. Restart server with `npm run dev`

### API Key Issues

**Problem**: `Extraction worker disabled: no LLM provider configured`

**Solutions**:
1. Verify API key format: `AIza...` for Google AI
2. Check for typos in `.env` file
3. Ensure no spaces around `=` in `.env` entries
4. Verify API key is active at [AI Studio](https://aistudio.google.com/app/apikey)

### Rate Limiting

**Problem**: Jobs failing with rate limit errors

**Solutions**:
1. Reduce `EXTRACTION_WORKER_BATCH_SIZE` (try 1-3)
2. Increase `EXTRACTION_WORKER_POLL_INTERVAL_MS` (try 10000-30000)
3. Lower rate limits: `EXTRACTION_RATE_LIMIT_RPM=30`
4. For production, use Vertex AI which has higher quotas

### Authentication Errors (Vertex AI)

**Problem**: `Could not load the default credentials`

**Solutions**:
1. Verify `GOOGLE_APPLICATION_CREDENTIALS` points to valid JSON key file
2. Or run `gcloud auth application-default login`
3. Check service account has `roles/aiplatform.user` role
4. Verify Vertex AI API is enabled in GCP project

---

## Monitoring

### Check Worker Status

1. **Server Logs**: Look for `[ExtractionWorkerService]` prefixed messages
2. **Job Status**: Navigate to `/admin/extraction-jobs` in the UI
3. **Database**: Query extraction_jobs table for status changes

### Worker Metrics (In-Memory)

The worker tracks these metrics (reset on restart):
- `processedCount`: Total jobs processed
- `successCount`: Successfully completed jobs
- `failureCount`: Failed jobs

Access via internal monitoring (future enhancement).

### Performance Monitoring

Watch for:
- Jobs stuck in `pending` status → Worker not polling
- Jobs stuck in `running` status → Processing errors
- High failure rate → Check LLM provider quotas/limits

---

## Next Steps After Setup

Once the worker is running:

1. ✅ **Test Manual Extraction** (Todo #7)
   - Navigate to Documents page
   - Click "Extract" on a document
   - Verify job is created and processed

2. ✅ **Test Auto-Extraction** (Todo #6)
   - Enable in Project Settings
   - Upload a document
   - Verify automatic job creation

3. ✅ **Monitor Progress**
   - Check `/admin/extraction-jobs` for job status
   - View detail page for progress/results
   - Verify entities appear in graph view

---

## Production Recommendations

For production deployments:

1. **Use Vertex AI** instead of Google AI Studio
2. **Set up monitoring** for worker health
3. **Configure rate limits** based on your API quotas
4. **Enable notifications** for failed jobs
5. **Set up log aggregation** (CloudWatch, Stackdriver, etc.)
6. **Consider horizontal scaling** (multiple worker instances with job locking)
7. **Implement retry strategies** for transient failures
8. **Set up alerting** for high failure rates

---

## Cost Estimation

### Google AI Studio (Free Tier)
- **Free quota**: 15 requests/minute
- **Rate limit**: Sufficient for development/testing
- **Cost beyond free tier**: Minimal for small usage

### Vertex AI (Production)
- **Pricing**: Pay-per-use (token-based)
- **Gemini 1.5 Pro**: ~$0.000125/1K input tokens, ~$0.000375/1K output tokens
- **Example**: Processing 1000 documents (5K tokens each) ≈ $0.625 input + $1.875 output = ~$2.50
- **Free tier**: $300 credit for new GCP accounts

**Tip**: Start with Google AI Studio for development, then migrate to Vertex AI for production.

---

## Architecture Notes

### How the Worker Works

1. **Polling Loop**: Runs every N seconds (default 5s)
2. **Job Discovery**: Queries DB for `status = 'pending'` jobs
3. **Batch Processing**: Takes up to N jobs (default 5) per batch
4. **Status Update**: Marks jobs as `running`
5. **Content Loading**: Fetches document chunks from DB
6. **LLM Extraction**: Calls Gemini API with structured prompt
7. **Entity Creation**: Creates graph objects from extracted data
8. **Job Completion**: Updates status to `completed` or `failed`
9. **Notifications**: Sends notification if configured

### Error Handling

- **Transient errors**: Job remains `running`, will be retried next poll
- **Permanent errors**: Job marked as `failed` with error details
- **Rate limits**: Worker backs off automatically
- **Validation errors**: Job fails with detailed error message

---

## Support

For issues or questions:
1. Check server logs for error messages
2. Review this guide's troubleshooting section
3. Verify environment configuration
4. Check API provider status/quotas
5. Review extraction job detail page for specific errors

---

**Last Updated**: October 4, 2025
