# langfuse-tracing Specification

## Purpose
TBD - created by archiving change add-langfuse-observability. Update Purpose after archive.
## Requirements
### Requirement: LangFuse SDK SHALL be initialized as a NestJS module

The system SHALL provide a `LangfuseModule` with a `LangfuseService` that initializes the LangFuse SDK client, manages configuration, and provides trace/observation methods throughout the application.

#### Scenario: LangfuseService initializes when enabled with valid credentials

**Given** environment has `LANGFUSE_ENABLED=true`  
**And** `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` are set  
**And** `LANGFUSE_HOST` points to running LangFuse server  
**When** application starts and `LangfuseModule` initializes  
**Then** `LangfuseService` creates a LangFuse SDK client  
**And** logs "LangFuse initialized: http://localhost:3010"  
**And** `isEnabled()` method returns `true`  
**And** application continues normal startup  

#### Scenario: LangfuseService gracefully degrades when disabled

**Given** environment has `LANGFUSE_ENABLED=false`  
**When** application starts and `LangfuseModule` initializes  
**Then** `LangfuseService` logs "LangFuse is disabled"  
**And** no SDK client is created  
**And** `isEnabled()` method returns `false`  
**And** `createJobTrace()` returns `null` without errors  
**And** `createObservation()` returns `null` without errors  
**And** application functions normally without tracing  

#### Scenario: LangfuseService handles missing credentials gracefully

**Given** environment has `LANGFUSE_ENABLED=true`  
**But** `LANGFUSE_SECRET_KEY` or `LANGFUSE_PUBLIC_KEY` is missing  
**When** application starts and `LangfuseModule` initializes  
**Then** `LangfuseService` logs warning about missing credentials  
**And** no SDK client is created  
**And** `isEnabled()` returns `false` (treats as disabled)  
**And** application continues normal startup without crashing  

#### Scenario: LangfuseService handles SDK initialization errors

**Given** environment has valid LangFuse configuration  
**But** LangFuse SDK constructor throws an error (e.g., network issue)  
**When** application starts and attempts to create SDK client  
**Then** `LangfuseService` catches the error  
**And** logs error message: "LangFuse initialization failed: <error details>"  
**And** treats LangFuse as disabled for this session  
**And** application continues normal startup

### Requirement: Extraction jobs SHALL create parent traces to group LLM calls

The system SHALL create a parent trace in LangFuse for each extraction job, containing metadata about the job and serving as the container for all child LLM call observations.

#### Scenario: ExtractionWorkerService creates parent trace on job start

**Given** LangFuse is enabled and configured  
**And** an extraction job is queued with ID "job-123"  
**When** `ExtractionWorkerService.processJob()` starts processing the job  
**Then** a parent trace is created in LangFuse  
**And** trace name is "extraction-job-job-123"  
**And** trace metadata includes:  
  - `jobId`: "job-123"  
  - `projectId`: "<uuid>"  
  - `sourceType`: "url" or "file"  
  - `sourceId`: "<source-id>"  
  - `documentCount`: number of documents to process  
**And** trace ID is stored in job context for child observations  

#### Scenario: Parent trace finalizes with success status

**Given** an extraction job has a parent trace in LangFuse  
**When** the job completes successfully  
**And** all entities are extracted and saved  
**Then** `LangfuseService.finalizeTrace()` is called  
**And** trace status is set to "success"  
**And** trace duration is calculated from start to finish  
**And** trace is visible in LangFuse UI with green success indicator  

#### Scenario: Parent trace finalizes with error status on job failure

**Given** an extraction job has a parent trace in LangFuse  
**When** the job fails due to LLM error or processing exception  
**And** error is logged to internal monitoring  
**Then** `LangfuseService.finalizeTrace()` is called with status "error"  
**And** trace status is set to "error"  
**And** trace is visible in LangFuse UI with red error indicator  
**And** error message is attached to trace metadata  

#### Scenario: Job continues if parent trace creation fails

**Given** LangFuse is enabled but SDK encounters an error  
**When** `ExtractionWorkerService.processJob()` calls `createJobTrace()`  
**And** `LangfuseService` returns `null` due to error  
**Then** job processing continues without trace context  
**And** internal monitoring still logs job events  
**And** LLM calls still execute successfully  
**And** entities are still extracted and saved

### Requirement: LLM provider calls SHALL create child observations under parent trace

Each LLM call (via `VertexAIProvider` or `LangChainGeminiProvider`) SHALL create an observation in LangFuse as a child of the parent job trace, capturing input, output, token usage, and timing.

#### Scenario: VertexAI provider creates observation for entity extraction

**Given** an extraction job has parent trace ID "trace-abc"  
**When** `VertexAIProvider.extractEntitiesForType()` is called  
**And** extracts entities of type "Location"  
**Then** a child observation is created in LangFuse  
**And** observation name is "extract-Location"  
**And** observation is linked to parent trace "trace-abc"  
**And** observation input metadata includes:  
  - `type`: "Location"  
  - `model`: "gemini-1.5-pro"  
  - `promptLength`: number of characters  
  - `documentLength`: number of characters  
**And** observation is marked as "pending" status  

#### Scenario: Observation updates with LLM response and token usage

**Given** an LLM observation is created and pending  
**When** Vertex AI returns successful response  
**And** response includes extracted entities and usage metadata  
**Then** observation is updated with:  
  - `output`: { entitiesCount: 5 }  
  - `usage`: { promptTokens: 1234, completionTokens: 456, totalTokens: 1690 }  
  - `level`: "DEFAULT"  
  - `status`: "success"  
**And** observation duration is calculated from start to completion  
**And** observation is visible in LangFuse UI under parent trace  

#### Scenario: Observation marks error when LLM call fails

**Given** an LLM observation is created and pending  
**When** Vertex AI throws an error (e.g., rate limit, timeout, invalid request)  
**And** error is caught by provider error handling  
**Then** observation is updated with:  
  - `level`: "ERROR"  
  - `statusMessage`: error message from exception  
  - `status`: "error"  
**And** observation is visible in LangFuse UI with red error indicator  
**And** error details are displayed in observation details panel  

#### Scenario: Multiple observations nest under parent trace correctly

**Given** an extraction job processes 4 entity types  
**When** LLM provider extracts:  
  - 3 entities of type "Location" (gemini-1.5-pro)  
  - 5 entities of type "Person" (gemini-1.5-pro)  
  - 2 entities of type "Organization" (gemini-1.5-flash)  
  - 1 entity of type "Event" (gemini-1.5-flash)  
**Then** parent trace shows 4 child observations  
**And** observations are named:  
  - "extract-Location"  
  - "extract-Person"  
  - "extract-Organization"  
  - "extract-Event"  
**And** each observation shows correct model, tokens, and duration  
**And** trace timeline visualizes all 4 observations in sequence

### Requirement: LangFuse tracing SHALL not block or slow down LLM operations

All LangFuse SDK calls SHALL be non-blocking and SHALL NOT add significant latency to LLM operations. Failures in trace/observation creation SHALL NOT crash the application.

#### Scenario: Observation creation does not delay LLM call

**Given** LangFuse is enabled  
**When** `VertexAIProvider.extractEntitiesForType()` creates observation  
**And** immediately proceeds to call Vertex AI  
**Then** observation creation completes in under 5ms  
**And** LLM call starts without waiting for trace acknowledgment  
**And** total added latency is under 10ms (negligible)  

#### Scenario: LangFuse SDK batches events to reduce network overhead

**Given** 10 LLM calls create 10 observations  
**When** observations are created and updated  
**Then** SDK buffers observations in memory  
**And** sends a single batched HTTP request with all 10 observations  
**And** batch is sent after 10 events or 10 seconds (whichever comes first)  
**And** no blocking HTTP request per observation  

#### Scenario: Application shuts down gracefully with pending traces

**Given** LangFuse has buffered 5 observations not yet sent  
**When** application receives shutdown signal (SIGTERM)  
**And** `LangfuseService.shutdown()` is called  
**Then** SDK flushes all pending observations to LangFuse API  
**And** flush operation waits up to 5 seconds for completion  
**And** application exits only after flush succeeds or times out  
**And** no trace data is lost during normal shutdown  

#### Scenario: Observation update fails silently without crashing

**Given** an observation is created successfully  
**When** `observation.update()` is called with output data  
**But** LangFuse API returns 500 error or network timeout  
**Then** SDK logs warning about failed update  
**And** error is not thrown to calling code  
**And** LLM operation completes successfully  
**And** internal monitoring still captures the LLM call

### Requirement: Configuration SHALL control LangFuse behavior via environment variables

The system SHALL expose environment variables to control LangFuse enablement, connection details, and SDK behavior (flush thresholds, timeouts).

#### Scenario: Developer enables LangFuse for specific environment

**Given** production environment requires observability  
**When** developer sets in production `.env`:  
  - `LANGFUSE_ENABLED=true`  
  - `LANGFUSE_SECRET_KEY=sk-lf-prod-key`  
  - `LANGFUSE_PUBLIC_KEY=pk-lf-prod-key`  
  - `LANGFUSE_HOST=https://langfuse.company.com`  
**Then** production server sends traces to enterprise LangFuse instance  
**And** traces are visible at `https://langfuse.company.com`  
**And** credentials authenticate to production LangFuse project  

#### Scenario: Developer disables LangFuse in development environment

**Given** local development does not need tracing overhead  
**When** developer sets in local `.env`:  
  - `LANGFUSE_ENABLED=false`  
**Then** no LangFuse SDK client is created  
**And** no trace HTTP requests are made  
**And** application runs normally with internal monitoring only  
**And** no LangFuse services need to be running locally  

#### Scenario: Developer tunes SDK batch behavior

**Given** high-volume production environment sends many traces  
**When** developer configures:  
  - `LANGFUSE_FLUSH_AT=50` (batch size)  
  - `LANGFUSE_FLUSH_INTERVAL=5000` (5 seconds)  
**Then** SDK sends batch after 50 observations OR 5 seconds  
**And** fewer HTTP requests reduce network overhead  
**And** traces still arrive in LangFuse within acceptable delay

