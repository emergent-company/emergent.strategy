# Vertex AI Latency Optimization Guide

## Overview

This document addresses intermittent latency issues with Vertex AI Gemini models, where API calls sometimes complete in ~1 second but occasionally timeout at 120 seconds.

## Root Cause Analysis

### Key Finding: No Traditional Cold Starts for Gemini Models

Unlike self-deployed models on Vertex AI, **Gemini models are managed services** and do not experience traditional cold starts. The latency variability is caused by:

1. **Dynamic Shared Quota (DSQ) Contention** - Gemini 2.0+ models use DSQ, which dynamically distributes PayGo capacity among all customers for a specific model and region. When demand exceeds capacity, requests queue.

2. **Rate Limiting (HTTP 429)** - When quota is exhausted, Vertex AI returns error code 429 with "Resource exhausted, please try again later."

3. **Regional Capacity Differences** - Different regions have varying available capacity.

4. **Request Complexity** - Large prompts, multimodal inputs, or complex reasoning tasks take longer.

## Immediate Mitigations

### 1. Use Global Endpoint Instead of Regional

```python
# Instead of regional endpoint
# endpoint = "us-central1-aiplatform.googleapis.com"

# Use global endpoint for better availability
endpoint = "aiplatform.googleapis.com"
```

### 2. Implement Exponential Backoff Retry

```python
import google.api_core.retry
import google.api_core.exceptions
from google.cloud import aiplatform

# Define retry predicate for transient errors
retry_predicate = google.api_core.retry.if_exception_type(
    google.api_core.exceptions.ServiceUnavailable,
    google.api_core.exceptions.ResourceExhausted,  # 429 errors
    google.api_core.exceptions.DeadlineExceeded,
)

# Create retry configuration
retry_config = google.api_core.retry.Retry(
    predicate=retry_predicate,
    initial=1.0,        # Initial delay in seconds
    maximum=60.0,       # Maximum delay
    multiplier=2.0,     # Exponential multiplier
    deadline=300.0,     # Total retry deadline in seconds
)
```

### 3. With Langchain/Langfuse Integration

```python
from langchain_google_vertexai import ChatVertexAI
from langfuse.callback import CallbackHandler

# Configure with appropriate timeout and retries
llm = ChatVertexAI(
    model="gemini-2.0-flash-001",
    project="your-project-id",
    location="us-central1",
    max_retries=3,
    request_timeout=60,  # Per-request timeout
    # Use streaming for more consistent time-to-first-token
    streaming=True,
)

# Langfuse callback for observability
langfuse_handler = CallbackHandler(
    public_key="your-public-key",
    secret_key="your-secret-key",
    host="https://cloud.langfuse.com",  # or self-hosted URL
)

# Invoke with callbacks
response = llm.invoke(
    messages,
    config={"callbacks": [langfuse_handler]}
)
```

### 4. Using Vercel AI SDK (TypeScript)

```typescript
import { createVertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';

const vertex = createVertex({
  project: 'your-project-id',
  location: 'us-central1',
});

// Streaming provides more consistent time-to-first-token
const result = await streamText({
  model: vertex('gemini-2.0-flash-001'),
  messages: [...],
  // AbortController for timeout management
  abortSignal: AbortSignal.timeout(60000), // 60 second timeout
});
```

### 5. Traffic Smoothing

Avoid large request spikes. If you need to process many items:

```python
import asyncio
from asyncio import Semaphore

# Limit concurrent requests
MAX_CONCURRENT = 5
semaphore = Semaphore(MAX_CONCURRENT)

async def rate_limited_call(prompt):
    async with semaphore:
        # Add jitter to avoid thundering herd
        await asyncio.sleep(random.uniform(0, 0.5))
        return await llm.ainvoke(prompt)
```

## Production Reliability Options

### Provisioned Throughput

For guaranteed SLAs, purchase **Provisioned Throughput**:

- **What it provides**: Reserved capacity independent of DSQ contention - bypasses Dynamic Shared Quota entirely
- **When to use**:
  - Real-time generative AI production applications (chatbots, agents)
  - Critical workloads requiring consistently high throughput
  - Applications needing predictable, consistent user experience
  - When you want deterministic costs (fixed monthly/weekly pricing)
- **How to purchase**: Via [Google Cloud Console](https://console.cloud.google.com/vertex-ai/provisioned-throughput) or contact sales
- **Billing**: Pay for reserved capacity whether used or not (commitment-based)

#### Key Considerations Before Purchasing

1. **Non-cancelable commitment**: You cannot cancel mid-term. Terms available:

   - 1 week (Google models only)
   - 1 month
   - 3 months
   - 1 year

2. **Auto-renewal available**: Monthly and longer terms can auto-renew. Cancel auto-renewal 30 days before term end.

3. **Flexibility**: You can change model, model version, or region after activation (processed within ~10 business days).

4. **Overage handling**: By default, usage exceeding your Provisioned Throughput is billed as pay-as-you-go. You can control this per-request.

5. **Supported models**: Gemini 2.0 Flash, Gemini 2.5 Pro/Flash, Gemini 3 Pro, and others. Check [supported models docs](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/supported-models).

#### GSU (Generative AI Scale Unit) Estimation

Google provides an estimation tool in the Cloud Console to calculate GSUs needed based on:

- Queries per second
- Input tokens per query (text, image, video, audio)
- Output tokens per query
- Cache hit percentage

#### Purchasing Steps

1. Go to [Vertex AI > Provisioned Throughput](https://console.cloud.google.com/vertex-ai/provisioned-throughput)
2. Click "New order"
3. Select model and region
4. Use the GSU estimation tool to calculate requirements
5. Select term and renewal options
6. Submit order (approval time varies based on capacity - minutes to weeks)

```python
# When using provisioned throughput, specify the endpoint
llm = ChatVertexAI(
    model="gemini-2.0-flash-001",
    project="your-project-id",
    # Use provisioned endpoint if available
    endpoint_id="projects/PROJECT/locations/LOCATION/endpoints/ENDPOINT_ID",
)
```

### Multi-Region Fallback

```python
REGIONS = ["us-central1", "us-east4", "europe-west4"]

async def call_with_fallback(prompt):
    for region in REGIONS:
        try:
            llm = ChatVertexAI(
                model="gemini-2.0-flash-001",
                location=region,
                request_timeout=30,
            )
            return await llm.ainvoke(prompt)
        except Exception as e:
            if region == REGIONS[-1]:
                raise
            continue
```

## Known SDK Issues

### Langfuse + Vertex AI Gemini 2.0 (GitHub #5419)

Some users report validation errors with Gemini 2.0 Flash and Langfuse callback handler.

**Workaround**: Downgrade `google-cloud-aiplatform`:

```bash
pip install google-cloud-aiplatform==1.78.0
```

## Monitoring Recommendations

### 1. Track Latency Percentiles in Langfuse

Monitor p50, p95, and p99 latencies to understand the distribution of response times.

### 2. Alert on 429 Errors

Set up alerts when receiving HTTP 429 responses - this indicates quota exhaustion.

### 3. Log Request Metadata

```python
import logging

logger = logging.getLogger(__name__)

async def instrumented_call(prompt, **kwargs):
    start = time.time()
    try:
        response = await llm.ainvoke(prompt, **kwargs)
        duration = time.time() - start
        logger.info(f"Vertex AI call succeeded", extra={
            "duration_ms": duration * 1000,
            "model": "gemini-2.0-flash-001",
            "prompt_tokens": len(prompt) // 4,  # rough estimate
        })
        return response
    except Exception as e:
        duration = time.time() - start
        logger.error(f"Vertex AI call failed", extra={
            "duration_ms": duration * 1000,
            "error_type": type(e).__name__,
            "error_message": str(e),
        })
        raise
```

## Summary of Recommendations

| Priority | Action                                   | Effort | Impact    |
| -------- | ---------------------------------------- | ------ | --------- |
| High     | Implement retry with exponential backoff | Low    | High      |
| High     | Use streaming for consistent TTFT        | Low    | Medium    |
| Medium   | Add request timeout + fallback           | Medium | High      |
| Medium   | Monitor latency percentiles              | Low    | Medium    |
| Low      | Consider Provisioned Throughput          | High   | Very High |
| Low      | Multi-region fallback                    | Medium | Medium    |

## References

- [Vertex AI Quotas](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas)
- [Dynamic Shared Quota](https://cloud.google.com/vertex-ai/generative-ai/docs/dynamic-shared-quota)
- [Error Code 429](https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429)
- [Provisioned Throughput Overview](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/overview)
- [Purchase Provisioned Throughput](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/purchase-provisioned-throughput)
- [Langfuse Vertex AI Integration](https://langfuse.com/docs/integrations/llm-frameworks/langchain)
