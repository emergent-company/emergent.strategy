# langfuse-monitoring-integration Specification

## Purpose
TBD - created by archiving change add-langfuse-observability. Update Purpose after archive.
## Requirements
### Requirement: Dual-path monitoring SHALL preserve internal monitoring data

The system SHALL continue writing to `kb.llm_call_logs` and `kb.system_process_logs` tables through `MonitoringLoggerService` even when LangFuse tracing is enabled, ensuring internal dashboards and reports remain functional.

#### Scenario: LLM call is logged to both internal DB and LangFuse

**Given** LangFuse is enabled  
**And** `VertexAIProvider.extractEntitiesForType()` is called  
**When** provider starts LLM call  
**Then** `MonitoringLoggerService.startLLMCall()` creates record in `kb.llm_call_logs`  
**And** record includes: jobId, projectId, model, promptTokens, status="pending"  
**And** `LangfuseService.createObservation()` creates observation in LangFuse  
**And** observation includes: name="extract-Location", input metadata  
**When** LLM call completes  
**Then** `MonitoringLoggerService.completeLLMCall()` updates DB record  
**And** DB record includes: completionTokens, totalTokens, cost, duration, status="completed"  
**And** `observation.update()` adds output and usage to LangFuse observation  
**And** both monitoring paths have complete data  

#### Scenario: Internal monitoring continues when LangFuse is disabled

**Given** LangFuse is disabled (`LANGFUSE_ENABLED=false`)  
**When** `VertexAIProvider.extractEntitiesForType()` processes LLM call  
**Then** `MonitoringLoggerService.startLLMCall()` creates DB record  
**And** `MonitoringLoggerService.completeLLMCall()` updates DB record  
**And** no LangFuse SDK calls are made  
**And** internal monitoring data is complete and accurate  
**And** cost tracking and reporting queries work as expected  

#### Scenario: Internal monitoring continues when LangFuse tracing fails

**Given** LangFuse is enabled but SDK encounters network error  
**When** `LangfuseService.createObservation()` returns `null`  
**And** provider proceeds with LLM call  
**Then** `MonitoringLoggerService.startLLMCall()` still creates DB record  
**And** `MonitoringLoggerService.completeLLMCall()` still updates DB record  
**And** internal monitoring data is unaffected by LangFuse failure  
**And** cost calculation and dashboards show accurate data

### Requirement: MonitoringLoggerService SHALL pass trace context to LangFuse

The `MonitoringLoggerService` SHALL accept optional trace context (traceId, observationId) from callers and use it to link internal logs with LangFuse traces.

#### Scenario: ExtractionWorkerService passes job trace ID to monitoring logger

**Given** an extraction job creates parent trace with ID "trace-abc"  
**When** `ExtractionWorkerService.processJob()` logs job start  
**And** calls `MonitoringLoggerService.logProcessEvent()` with:  
  - eventType: "extraction_job_started"  
  - metadata: { jobId: "job-123", traceId: "trace-abc" }  
**Then** event is saved to `kb.system_process_logs` with traceId column  
**And** traceId can be used to correlate DB logs with LangFuse traces  
**And** queries can join internal logs to LangFuse for unified view  

#### Scenario: VertexAIProvider passes observation ID to monitoring logger

**Given** LangFuse observation is created with ID "obs-xyz"  
**When** `VertexAIProvider` starts LLM call  
**And** calls `MonitoringLoggerService.startLLMCall()` with:  
  - context: { jobId: "job-123", observationId: "obs-xyz" }  
**Then** LLM call record in `kb.llm_call_logs` includes observationId  
**And** DB record can link to LangFuse observation via observationId  
**And** developers can query internal DB to find corresponding LangFuse trace  

#### Scenario: Monitoring logger handles missing trace context gracefully

**Given** caller does not provide traceId or observationId  
**When** `MonitoringLoggerService.logProcessEvent()` is called  
**And** metadata does not include traceId or observationId  
**Then** event is saved to `kb.system_process_logs` with traceId=null  
**And** no error is thrown  
**And** internal monitoring functions normally without LangFuse linkage

### Requirement: LangFuse SHALL augment internal monitoring with visual debugging

The system SHALL use LangFuse to provide visual trace debugging, prompt inspection, and external dashboard access that complement internal monitoring's cost tracking and performance metrics.

#### Scenario: Developer inspects extraction job traces in LangFuse UI

**Given** an extraction job processed 4 entity types  
**And** created parent trace with 4 child LLM observations  
**When** developer opens LangFuse UI at `http://localhost:3010`  
**And** navigates to Traces page  
**Then** trace "extraction-job-job-123" is visible in list  
**And** clicking trace shows timeline with 4 observations  
**And** each observation shows:  
  - Input: prompt text and document content  
  - Output: extracted entities JSON  
  - Metadata: model, tokens, duration, cost  
  - Status: success or error  
**And** developer can click observation to inspect prompt and response  

#### Scenario: Developer identifies slow LLM calls via LangFuse timeline

**Given** 5 extraction jobs completed today  
**When** developer opens LangFuse UI and filters traces by date  
**Then** traces show duration for each job  
**And** clicking a trace shows observation timeline  
**And** observations are sorted by duration (longest first)  
**And** developer identifies "extract-Organization" took 15 seconds  
**And** can inspect prompt to understand why it was slow  
**And** can compare to internal DB query: `SELECT * FROM kb.llm_call_logs WHERE duration_ms > 10000`  

#### Scenario: Developer shares LangFuse trace with teammate

**Given** developer finds interesting trace with entity extraction patterns  
**When** developer clicks "Share" in LangFuse UI  
**Then** LangFuse generates shareable link: `http://localhost:3010/trace/trace-abc`  
**And** teammate can open link to view trace without LangFuse account  
**And** trace shows all observations, prompts, and outputs  
**And** teammate can debug or provide feedback without accessing internal DB  

#### Scenario: Developer compares LangFuse and internal monitoring data

**Given** an extraction job with traceId "trace-abc"  
**When** developer queries internal DB:  
```sql
SELECT * FROM kb.llm_call_logs WHERE metadata->>'traceId' = 'trace-abc';
```  
**Then** DB returns 4 LLM call records with cost, tokens, duration  
**When** developer opens LangFuse trace "trace-abc"  
**Then** LangFuse shows 4 observations matching DB records  
**And** token counts match between DB and LangFuse  
**And** duration matches between DB and LangFuse  
**And** developer confirms consistency between monitoring systems

### Requirement: Database schema SHALL support LangFuse trace linking

The `kb.llm_call_logs` and `kb.system_process_logs` tables SHALL have optional columns to store LangFuse trace IDs and observation IDs for cross-referencing.

#### Scenario: llm_call_logs table includes langfuse_observation_id column

**Given** migration adds `langfuse_observation_id TEXT` to `kb.llm_call_logs`  
**When** LLM call creates observation "obs-xyz"  
**And** `MonitoringLoggerService.startLLMCall()` saves DB record  
**Then** record includes `langfuse_observation_id: "obs-xyz"`  
**And** developers can query: `SELECT * FROM kb.llm_call_logs WHERE langfuse_observation_id = 'obs-xyz'`  
**And** can correlate internal cost data with LangFuse trace details  

#### Scenario: system_process_logs table includes langfuse_trace_id column

**Given** migration adds `langfuse_trace_id TEXT` to `kb.system_process_logs`  
**When** extraction job creates parent trace "trace-abc"  
**And** `MonitoringLoggerService.logProcessEvent()` logs job start  
**Then** event record includes `langfuse_trace_id: "trace-abc"`  
**And** developers can query: `SELECT * FROM kb.system_process_logs WHERE langfuse_trace_id = 'trace-abc'`  
**And** can correlate job-level events with LangFuse parent trace  

#### Scenario: Columns accept null when LangFuse is disabled

**Given** LangFuse is disabled  
**When** LLM call is logged to `kb.llm_call_logs`  
**Then** `langfuse_observation_id` is `null`  
**And** no error occurs  
**And** internal monitoring queries work as expected  
**And** reports that don't need LangFuse linkage are unaffected

### Requirement: MonitoringLoggerService SHALL not throw errors when LangFuse fails

All LangFuse-related operations in `MonitoringLoggerService` SHALL be wrapped in try-catch blocks to prevent LangFuse failures from breaking internal monitoring.

#### Scenario: Monitoring logger catches LangFuse SDK error

**Given** `LangfuseService.createObservation()` throws exception  
**When** `VertexAIProvider` calls `MonitoringLoggerService.startLLMCall()`  
**And** monitoring logger attempts to create observation  
**Then** error is caught and logged: "Failed to create LangFuse observation: <error>"  
**And** `langfuse_observation_id` is saved as `null` in DB  
**And** internal monitoring continues normally  
**And** LLM call proceeds without error  

#### Scenario: Monitoring logger handles network timeout from LangFuse API

**Given** LangFuse API is slow or unreachable  
**When** `MonitoringLoggerService.completeLLMCall()` attempts to update observation  
**And** SDK times out after 5 seconds  
**Then** timeout is caught and logged  
**And** internal DB record is still updated with tokens and cost  
**And** monitoring reports show accurate data  
**And** application does not hang or crash

