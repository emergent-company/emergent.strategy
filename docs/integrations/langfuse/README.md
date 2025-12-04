# LangFuse Observability Integration

This integration provides detailed tracing and observability for LLM-powered features in the platform, specifically **Extraction Jobs**.

## Architecture

The integration works by:

1.  **Parent Traces**: Each extraction job creates a parent trace in LangFuse.
2.  **Observations**: Each LLM call (e.g. `LangChainGeminiProvider` extraction call) creates a child observation linked to the parent trace.
3.  **Dual-Path Logging**: Logs are written to both:
    - Internal Database (`kb.system_process_logs`, `kb.llm_call_logs`)
    - LangFuse (via SDK)

## Configuration

Set the following environment variables in `apps/server/.env`:

```env
LANGFUSE_ENABLED=true
LANGFUSE_HOST=http://localhost:3010
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

## Infrastructure

The self-hosted LangFuse infrastructure is defined in `~/emergent-infra/langfuse/docker-compose.yml`.
See [Infrastructure README](../../../emergent-infra/langfuse/README.md) for deployment details.

## Usage

### Viewing Traces

1.  Log in to LangFuse UI (http://localhost:3010).
2.  Navigate to **Traces**.
3.  Filter by trace name (e.g. "Extraction Job ...") or tags.

### Linking to Internal Logs

Internal DB tables store the LangFuse IDs for cross-referencing:

- `kb.system_process_logs.langfuse_trace_id` -> Links to Parent Trace
- `kb.llm_call_logs.langfuse_observation_id` -> Links to LLM Generation

### Graceful Degradation

If LangFuse is down or misconfigured:

- The application logs an error but continues processing.
- Internal DB logging remains unaffected.
- Tracing will simply be skipped for that job.
