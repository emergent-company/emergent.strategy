# Observability Specification

## ADDED Requirements

### Requirement: Hierarchical Tracing

The system MUST support hierarchical tracing of background jobs, where high-level steps (Spans) contain low-level operations (Generations), mirroring the execution flow.

#### Scenario: Extraction Job Trace

Given an extraction job is processed
When I view the trace in Langfuse
Then I see a root "Trace" for the job
And I see "Spans" for major steps: `load_document`, `load_prompt`, `llm_extract`, `graph_upsert`
And inside the `llm_extract` Span, I see "Generations" for each LLM call (chunk extraction)
And the duration of each Span accurately reflects the time spent in that step.

#### Scenario: Failed LLM Call

Given an extraction job where the LLM API fails
When the job completes with an error
Then the `llm_extract` Span is marked as "error"
And the child Generation that failed is marked as "error" with the error message
And the parent Trace is marked as "error"
So that I can quickly identify which part of the pipeline failed.

### Requirement: Span Context Propagation

The system MUST propagate tracing context (Trace ID and Parent Span ID) through all layers of the application, including async workers and external providers.

#### Scenario: Passing Context to Provider

Given the `ExtractionWorker` is executing the `llm_extract` step
When it calls `llmProvider.extractEntities`
Then it passes the ID of the current `llm_extract` Span as `parentObservationId` in the context
So that any observations created by the provider are nested under that Span.

### Requirement: Timeline-Driven Tracing

The system MUST automatically map internal timeline events to tracing Spans to ensure consistency between application logs and distributed traces.

#### Scenario: Automatic Span Creation

Given the worker starts a timeline step using `beginTimelineStep('my_step')`
Then a Langfuse Span named `my_step` is automatically started
And when the step finishes (success or error), the Span is automatically ended with the correct status.
