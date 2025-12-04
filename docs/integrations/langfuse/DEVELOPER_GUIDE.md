# LangFuse Developer Guide

This guide explains how to use LangFuse observability for debugging and improving LLM extraction jobs.

## Local Development Setup

1.  **Start LangFuse**:

    ```bash
    cd ~/emergent-infra/langfuse
    docker-compose up -d
    ```

2.  **Configure Environment**:
    Ensure your `apps/server/.env` has:

    ```env
    LANGFUSE_ENABLED=true
    LANGFUSE_HOST=http://localhost:3010
    LANGFUSE_PUBLIC_KEY=pk-...
    LANGFUSE_SECRET_KEY=sk-...
    ```

3.  **Access UI**:
    Open [http://localhost:3010](http://localhost:3010). Default credentials are defined in your `.env` (or create a new account on first launch).

## Debugging Extraction Jobs

### 1. Find the Trace

When an extraction job runs, it creates a **Parent Trace** with the name `Extraction Job <uuid>`.

- Go to **Traces** in LangFuse.
- Filter by `Name` contains `Extraction Job`.
- Or filter by `metadata.project_id` or `metadata.source_type`.

### 2. Inspect LLM Calls

Click on a trace to see the waterfall view. You will see:

- **Parent Span**: The job duration and metadata.
- **Child Generations**: Individual LLM calls (e.g., `extract-Requirement`, `extract-Risk`).
  - **Input**: The prompt sent to the model (including the chunk of text).
  - **Output**: The JSON response from the model.
  - **Usage**: Token counts (prompt, completion, total).
  - **Latency**: How long the call took.

### 3. Identify Issues

- **Errors**: Failed calls show as red in the waterfall. Click to see the error message (e.g., "Rate limit exceeded", "JSON parse error").
- **High Latency**: Sort spans by duration to find slow calls.
- **Cost**: Check the total token usage for the trace to estimate cost.

## Extending Tracing

To add tracing to new services, inject `LangfuseService`:

```typescript
import { LangfuseService } from '../langfuse/langfuse.service';

@Injectable()
export class MyService {
  constructor(private readonly langfuse: LangfuseService) {}

  async doSomething() {
    // Create a trace
    const traceId = this.langfuse.createJobTrace('my-job-id', {
      type: 'custom',
    });

    // ... do work ...

    // Create an observation (span/generation) linked to the trace
    const observation = this.langfuse.createObservation(traceId, 'my-step', {
      input: 'some input',
    });

    // ... call LLM ...

    // Update observation
    this.langfuse.updateObservation(
      observation,
      { output: 'some output' },
      { totalTokens: 100 }
    );

    // Finalize
    this.langfuse.finalizeTrace(traceId, 'success');
  }
}
```

## Internal vs External Logs

We use **Dual-Path Logging**:

1.  **Internal DB**: `kb.system_process_logs` and `kb.llm_call_logs` are the source of truth for the application history and UI display.
2.  **LangFuse**: Used for _debugging_, _inspection_, and _ad-hoc analysis_.

Logs are cross-referenced:

- `kb.system_process_logs` has a `langfuse_trace_id` column.
- `kb.llm_call_logs` has a `langfuse_observation_id` column.
