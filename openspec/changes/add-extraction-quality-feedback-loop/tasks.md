# Tasks: Extraction Quality Feedback Loop

## Phase 0: Chunk Soft Delete Migration (0.5-1 day)

**Prerequisite:** This migration must be completed before training data export can work reliably.

### 0.1 Database Migration

- [ ] Create migration file `migrations/XXXXXX-add-chunks-soft-delete.ts`
- [ ] Add `deleted_at TIMESTAMPTZ` column to `kb.chunks` table
- [ ] Add index on `deleted_at` for performance
- [ ] Update document re-processing to soft-delete old chunks instead of hard delete

### 0.2 Repository Updates

- [ ] Update `ChunkRepository` queries to filter `deleted_at IS NULL` by default
- [ ] Add `includeDeleted` option for training data queries
- [ ] Update `deleteChunksForDocument()` to set `deleted_at` instead of DELETE

### 0.3 Testing

- [ ] Test document re-processing preserves old chunks (soft deleted)
- [ ] Test normal queries don't return soft-deleted chunks
- [ ] Test training data export can access soft-deleted chunks

---

## Phase 1: Core Export Service (2-3 days)

### 1.1 Create Module Structure

- [ ] Create `apps/server/src/modules/training-export/` directory
- [ ] Create `training-export.module.ts` with imports
- [ ] Create interfaces in `interfaces/vertex-ai-training.interface.ts`
- [ ] Create DTOs in `dto/export-options.dto.ts` and `dto/export-result.dto.ts`

### 1.2 Implement Data Queries

- [ ] Implement `queryVerifiedObjects()` - fetch eligible graph objects
- [ ] Implement `queryOrganizationVerifiedObjects()` - fetch across all projects
- [ ] Implement `getRelationships()` - fetch relationships between objects
- [ ] Implement `getSourceChunk()` - reconstruct source chunk from extraction job
- [ ] Add query optimization for large datasets (pagination, batching)

### 1.3 Implement Example Builder

- [ ] Implement `buildTrainingExample()` - construct Vertex AI format
- [ ] Create system prompt template matching current extraction prompts
- [ ] Create user prompt template with chunk and entity types
- [ ] Format model output as verified extraction JSON

### 1.4 Implement Validation

- [ ] Implement `validateExample()` with all validation rules
- [ ] Add token counting (estimate or use tiktoken)
- [ ] Add PII detection (regex patterns for emails, SSNs, phones)
- [ ] Track and report validation failures

## Phase 2: Export Pipeline (1-2 days)

### 2.1 JSONL Writer

- [ ] Implement `writeJsonl()` - stream examples to file
- [ ] Add train/validation split logic with shuffle
- [ ] Generate metadata.json with statistics
- [ ] Support both local paths and temp directories

### 2.2 Statistics Collector

- [ ] Track entity type distribution
- [ ] Track relationship type distribution
- [ ] Calculate averages (entities/example, relationships/example, chunk length)
- [ ] Track exclusion reasons

### 2.3 Main Export Flow

- [ ] Implement `exportTrainingData()` for project-level export
- [ ] Implement `exportOrganizationData()` for org-wide export
- [ ] Add progress logging for large exports
- [ ] Handle edge cases (no data, all filtered, etc.)

## Phase 3: Cloud Storage Integration (1 day)

### 3.1 GCS Upload

- [ ] Add `@google-cloud/storage` dependency
- [ ] Implement `uploadToGCS()` with retry logic
- [ ] Support GCS URIs in outputPath option
- [ ] Organize by org/project hierarchy

### 3.2 Configuration

- [ ] Add environment variables for GCS bucket, defaults
- [ ] Add to `.env.example` and documentation

## Phase 4: Model Registry (1-2 days)

### 4.1 Database Schema

- [ ] Create `ml` schema in database
- [ ] Create `ml.fine_tuned_models` table with all columns
- [ ] Add indexes for organization, project, and status
- [ ] Create migration file

### 4.2 Model Entity

- [ ] Create `fine-tuned-model.entity.ts` with TypeORM decorators
- [ ] Add relationships to Organization and Project entities
- [ ] Create repository with common query methods

### 4.3 Model Selection Service

- [ ] Implement `ModelSelectionService`
- [ ] Implement `getModelForExtraction()` with fallback logic
- [ ] Add caching for model lookups (avoid DB hit on every extraction)
- [ ] Integrate with existing extraction worker

## Phase 5: Fine-Tuning Orchestration (2-3 days)

### 5.1 Vertex AI Tuning Service

- [ ] Add `@google-cloud/aiplatform` dependency
- [ ] Implement `VertexAITuningService`
- [ ] Implement `createTuningJob()` for supervised fine-tuning
- [ ] Implement `getTuningJobStatus()` for polling
- [ ] Handle API errors and retries

### 5.2 Orchestration Service

- [ ] Implement `FineTuningOrchestrationService`
- [ ] Implement `trainGeneralModel()` for org-wide training
- [ ] Implement `trainProjectModel()` for project-specific training
- [ ] Implement async polling for training completion
- [ ] Update model status on completion/failure

### 5.3 Training Thresholds

- [ ] Implement minimum example validation (100 for general, 50 for project)
- [ ] Add quality checks before training initiation
- [ ] Log training decisions and skips

## Phase 6: CLI and API (1 day)

### 6.1 CLI Scripts

- [ ] Create `scripts/export-training-data.ts`
- [ ] Create `scripts/train-general-model.ts`
- [ ] Create `scripts/train-project-model.ts`
- [ ] Create `scripts/training-status.ts`
- [ ] Create `scripts/list-models.ts`
- [ ] Add to `project.json` as nx targets

### 6.2 REST API

- [ ] Create `training-export.controller.ts`
- [ ] Implement `GET /training-export/stats/:projectId`
- [ ] Implement `POST /training-export/export`
- [ ] Create `fine-tuning.controller.ts`
- [ ] Implement `POST /fine-tuning/train-general`
- [ ] Implement `POST /fine-tuning/train-project`
- [ ] Implement `GET /fine-tuning/models`
- [ ] Implement `GET /fine-tuning/models/:id/status`
- [ ] Add proper auth guards and validation

## Phase 7: Integration with Extraction (1 day)

### 7.1 Extraction Worker Updates

- [ ] Inject `ModelSelectionService` into extraction worker
- [ ] Update LLM provider selection to use fine-tuned models
- [ ] Add model version tracking in extraction results
- [ ] Log which model was used for each extraction

### 7.2 Metrics and Monitoring

- [ ] Track extraction accuracy by model type
- [ ] Compare fine-tuned vs base model performance
- [ ] Add dashboard metrics for model usage

## Phase 8: Testing (2-3 days)

### 8.1 Unit Tests

- [ ] Test `buildTrainingExample()` with various inputs
- [ ] Test `validateExample()` with valid/invalid cases
- [ ] Test train/validation split logic
- [ ] Test statistics calculation
- [ ] Test model selection fallback logic

### 8.2 Integration Tests

- [ ] Test full export flow with test database
- [ ] Test GCS upload (with mock or test bucket)
- [ ] Test model registry CRUD operations
- [ ] Test fine-tuning job creation (mock Vertex AI)

### 8.3 E2E Validation

- [ ] Export test dataset
- [ ] Validate JSONL format manually
- [ ] Test upload to Vertex AI (dry run)
- [ ] Verify model selection works end-to-end

## Phase 9: Admin UI - Training Management (3-4 days)

### 9.1 Project Training Page

- [ ] Create route `/projects/:projectId/settings/ai-training`
- [ ] Add navigation menu item under Project Settings
- [ ] Implement Training Data Overview component
  - [ ] Display verified extraction counts (total, human-reviewed, auto-accepted)
  - [ ] Show entity type distribution chart
  - [ ] Display minimum threshold status
- [ ] Implement Training Actions component
  - [ ] Export Training Data button with options modal
  - [ ] Start Training button with confirmation
  - [ ] Training parameter inputs (confidence, human-reviewed only)
- [ ] Implement Training History table
  - [ ] List all training jobs with version, dates, examples, status
  - [ ] Expandable row for job details (metrics, duration, dataset URI)
  - [ ] Status badges (training, ready, failed, deprecated)

### 9.2 Training Schedule Settings

- [ ] Implement schedule configuration form
  - [ ] Enable/disable toggle
  - [ ] Threshold trigger (new extractions count)
  - [ ] Scheduled interval (cron picker: weekly/monthly + day + time)
  - [ ] Retrain on general model update checkbox
- [ ] Implement training parameters section
  - [ ] Min confidence slider
  - [ ] Human-reviewed only toggle
  - [ ] Epochs input
  - [ ] Learning rate multiplier input
- [ ] Show next scheduled training date/time
- [ ] Save/cancel buttons with validation

### 9.3 Organization Training Page

- [ ] Create route `/organizations/:orgId/settings/ai-training`
- [ ] Add navigation menu item under Organization Settings
- [ ] Implement Organization Overview component
  - [ ] General model status card
  - [ ] Total verified extractions across org
  - [ ] Projects contributing count
  - [ ] Project models trained count
- [ ] Implement Project Contributions table
  - [ ] List projects with verified count, last updated, custom model status
- [ ] Implement General Model Training section
  - [ ] Export All Training Data button
  - [ ] Train General Model button
  - [ ] Current model info display
- [ ] Implement Organization Schedule Settings
  - [ ] Similar to project schedule but for general model
  - [ ] Notification settings for project admins

### 9.4 Shared UI Components

- [ ] Create `TrainingStatusBadge` component
- [ ] Create `EntityDistributionChart` component (bar chart)
- [ ] Create `TrainingHistoryTable` component
- [ ] Create `ScheduleConfigForm` component
- [ ] Create `TrainingParametersForm` component
- [ ] Create `ExportOptionsModal` component
- [ ] Create `TrainingConfirmationModal` component

### 9.5 Real-time Updates

- [ ] Implement polling for training job status
- [ ] Show progress indicator during training
- [ ] Toast notifications on training completion/failure
- [ ] Auto-refresh training history on status change

## Phase 10: Scheduling Backend (1-2 days)

### 10.1 Schedule Database

- [ ] Create `ml.training_schedules` table migration
- [ ] Create `training-schedule.entity.ts`
- [ ] Add repository methods

### 10.2 Schedule Service

- [ ] Implement `TrainingScheduleService`
- [ ] Implement `getSchedule()` / `updateSchedule()` methods
- [ ] Implement `checkThresholdTrigger()` - check if new examples exceed threshold
- [ ] Implement `calculateNextScheduledRun()` from cron expression

### 10.3 Scheduled Job Runner

- [ ] Create cron job to check schedules (runs every hour)
- [ ] Implement `processScheduledTraining()` - find due schedules and trigger
- [ ] Track `last_training_at` and `last_example_count`
- [ ] Handle concurrent execution prevention (locking)
- [ ] Implement retry logic for failed scheduled jobs

### 10.4 Schedule API Endpoints

- [ ] `GET /api/projects/:projectId/training/schedule`
- [ ] `PUT /api/projects/:projectId/training/schedule`
- [ ] `GET /api/organizations/:orgId/training/schedule`
- [ ] `PUT /api/organizations/:orgId/training/schedule`
- [ ] Add validation and auth guards

## Phase 11: Documentation (0.5 days)

- [ ] Add usage documentation to `docs/features/`
- [ ] Document CLI commands
- [ ] Document API endpoints
- [ ] Add example workflows for fine-tuning
- [ ] Document multi-layer model architecture
- [ ] Add UI user guide for training management

---

## Dependencies

| Task                      | Depends On                                |
| ------------------------- | ----------------------------------------- |
| Core Export Service       | Phase 0 (Chunk Soft Delete)               |
| Example Builder           | Data Queries                              |
| Export Flow               | Example Builder, Validation, JSONL Writer |
| GCS Upload                | JSONL Writer                              |
| Model Registry            | Database schema                           |
| Fine-Tuning Orchestration | Export Flow, GCS Upload, Model Registry   |
| CLI/API                   | All services                              |
| Extraction Integration    | Model Selection Service                   |
| Admin UI                  | REST API endpoints                        |
| Scheduling Backend        | Fine-Tuning Orchestration                 |
| Integration Tests         | All implementation                        |

## Estimated Total: 17-23 days

## Future Tasks (Not in Scope)

- [ ] A/B testing infrastructure
- [ ] Model rollback UI with one-click revert
- [ ] Cost monitoring and optimization dashboard
- [ ] Multi-region model deployment
- [ ] Training data preview/sampling UI
- [ ] Model performance comparison charts
