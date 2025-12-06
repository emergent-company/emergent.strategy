# Implement Hierarchical Tracing

## Summary

Implement comprehensive, hierarchical tracing for the extraction pipeline using Langfuse. This transforms the current "flat" trace structure into a nested tree that mirrors the actual execution flow, ensuring visibility into every step (loading, processing, LLM calls, database operations) and enabling precise error attribution.

## Motivation

The current tracing implementation provides limited visibility into the extraction process.

- **Problem**: Traces are flat, making it difficult to distinguish between different stages of the job.
- **Problem**: LLM generations are linked to the root trace but lack context of the specific extraction step they belong to.
- **Problem**: Failures in the pipeline (e.g., "All LLM extraction calls failed") often result in missing generation data or silent failures in the trace, making debugging difficult.
- **Benefit**: Hierarchical tracing will provide a clear visual timeline, accurate cost/latency breakdown per step, and rapid root cause analysis for failures.

## Proposed Solution

1.  **Architecture**: Transition to a nested trace structure: `Trace -> Span (Step) -> Generation (LLM)`.
2.  **Service Updates**: Enhance `LangfuseService` to support generic Spans and parent-child nesting via `parentObservationId`.
3.  **Worker Instrumentation**: Modify `ExtractionWorkerService` to wrap timeline steps in Langfuse Spans automatically.
4.  **Provider Integration**: Update `LangChainGeminiProvider` to accept parent span contexts and nest LLM generations correctly.

## Trace Structure

```mermaid
graph TD
    Root[Trace: Extraction Job] --> Start[Span: job_started]
    Root --> Load[Span: load_document]
    Root --> Prep[Span: load_prompt]
    Root --> LLM_Step[Span: llm_extract]
    LLM_Step --> LLM_Gen1[Generation: Extract Entities (Chunk 1)]
    LLM_Step --> LLM_Gen2[Generation: Extract Entities (Chunk 2)]
    Root --> Graph[Span: graph_upsert]
    Root --> Rels[Span: create_relationships]
    Root --> End[Span: job_completed]
```
