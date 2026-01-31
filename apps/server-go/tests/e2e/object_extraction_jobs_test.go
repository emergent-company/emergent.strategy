package e2e

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/extraction"
	"github.com/emergent/emergent-core/internal/testutil"
)

// ObjectExtractionJobsTestSuite tests the object extraction job queue functionality
type ObjectExtractionJobsTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *extraction.ObjectExtractionJobsService
	log         *slog.Logger
	orgID       string
	projectID   string
	documentID  string // test document for FK tests
}

func TestObjectExtractionJobsSuite(t *testing.T) {
	suite.Run(t, new(ObjectExtractionJobsTestSuite))
}

func (s *ObjectExtractionJobsTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "object_extraction_jobs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the object extraction jobs service
	cfg := &extraction.ObjectExtractionConfig{
		DefaultMaxRetries:     3,
		WorkerIntervalMs:      1000,
		WorkerBatchSize:       5,
		StaleThresholdMinutes: 10,
	}
	s.jobsService = extraction.NewObjectExtractionJobsService(testDB.DB, s.log, cfg)
}

func (s *ObjectExtractionJobsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *ObjectExtractionJobsTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create an org and project for tests
	s.orgID = uuid.New().String()
	s.projectID = uuid.New().String()

	err = testutil.CreateTestOrganization(s.ctx, s.testDB.DB, s.orgID, "Test Org for Object Extraction")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project for Object Extraction",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create a test document for FK tests
	s.documentID = uuid.New().String()
	s.createTestDocument()
}

// createTestDocument creates a test document for FK tests
func (s *ObjectExtractionJobsTestSuite) createTestDocument() {
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.documents (id, project_id, source_type, filename, content, sync_version, created_at, updated_at)
		VALUES (?, ?, 'upload', 'test-document.txt', 'Test content for extraction', 1, now(), now())
	`, s.documentID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
}

// =============================================================================
// Test: CreateJob
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestCreateJob_CreatesJob() {
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID:    s.projectID,
		DocumentID:   &s.documentID,
		JobType:      extraction.JobTypeFullExtraction,
		EnabledTypes: []string{"Person", "Organization", "Concept"},
		ExtractionConfig: extraction.JSON{
			"model": "gemini-1.5-flash",
		},
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal(s.projectID, job.ProjectID)
	s.Equal(&s.documentID, job.DocumentID)
	s.Equal(extraction.JobTypeFullExtraction, job.JobType)
	s.Equal(extraction.JobStatusPending, job.Status)
	s.Equal([]string{"Person", "Organization", "Concept"}, job.EnabledTypes)
	s.Equal(0, job.RetryCount)
	s.Equal(3, job.MaxRetries)
}

func (s *ObjectExtractionJobsTestSuite) TestCreateJob_WithMinimalOptions() {
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal(s.projectID, job.ProjectID)
	s.Equal(extraction.JobTypeFullExtraction, job.JobType) // Default
	s.Equal(extraction.JobStatusPending, job.Status)
	s.Nil(job.DocumentID)
}

func (s *ObjectExtractionJobsTestSuite) TestCreateJob_WithSourceMetadata() {
	sourceType := "document"
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID:  s.projectID,
		SourceType: &sourceType,
		SourceMetadata: extraction.JSON{
			"trigger": "manual",
			"user":    "test-user",
		},
	})

	s.NoError(err)
	s.Equal(&sourceType, job.SourceType)
	s.Equal("manual", job.SourceMetadata["trigger"])
}

func (s *ObjectExtractionJobsTestSuite) TestCreateJob_WithCreatedBy() {
	createdBy := uuid.New().String()
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
		CreatedBy: &createdBy,
	})

	s.NoError(err)
	s.Equal(&createdBy, job.CreatedBy)
}

func (s *ObjectExtractionJobsTestSuite) TestCreateJob_Reextraction() {
	// Create original job
	originalJob, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
		JobType:   extraction.JobTypeFullExtraction,
	})

	// Create reextraction job
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID:      s.projectID,
		JobType:        extraction.JobTypeReextraction,
		ReprocessingOf: &originalJob.ID,
	})

	s.NoError(err)
	s.Equal(extraction.JobTypeReextraction, job.JobType)
	s.Equal(&originalJob.ID, job.ReprocessingOf)
}

// =============================================================================
// Test: Dequeue
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestDequeue_ClaimsJob() {
	_, err := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	s.NoError(err)

	job, err := s.jobsService.Dequeue(s.ctx)

	s.NoError(err)
	s.NotNil(job)
	s.Equal(extraction.JobStatusProcessing, job.Status)
	s.NotNil(job.StartedAt)
}

func (s *ObjectExtractionJobsTestSuite) TestDequeue_ReturnsNilWhenEmpty() {
	job, err := s.jobsService.Dequeue(s.ctx)

	s.NoError(err)
	s.Nil(job)
}

func (s *ObjectExtractionJobsTestSuite) TestDequeue_RespectsOrder() {
	// Create first job
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Create second job
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Dequeue one job - should get first (FIFO order)
	dequeuedJob, err := s.jobsService.Dequeue(s.ctx)
	s.NoError(err)
	s.Equal(job1.ID, dequeuedJob.ID, "Should dequeue jobs in FIFO order")

	// Dequeue next - but wait, same project can only have one running job
	// so the second dequeue should return nil
	dequeuedJob2, err := s.jobsService.Dequeue(s.ctx)
	s.NoError(err)
	s.Nil(dequeuedJob2, "Second job should not be dequeued while first is processing (same project)")

	// Complete the first job
	_ = s.jobsService.MarkCompleted(s.ctx, job1.ID, extraction.ObjectExtractionResults{})

	// Now we should be able to dequeue the second
	dequeuedJob2, err = s.jobsService.Dequeue(s.ctx)
	s.NoError(err)
	s.NotNil(dequeuedJob2)
	s.Equal(job2.ID, dequeuedJob2.ID)
}

func (s *ObjectExtractionJobsTestSuite) TestDequeue_DifferentProjectsCanRunInParallel() {
	// Create another project
	otherProjectID := uuid.NewString()
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: s.orgID,
		Name:  "Other Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create jobs for different projects
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: otherProjectID,
	})

	// Dequeue first job
	dequeuedJob1, err := s.jobsService.Dequeue(s.ctx)
	s.NoError(err)
	s.Equal(job1.ID, dequeuedJob1.ID)

	// Dequeue second job (different project) - should work
	dequeuedJob2, err := s.jobsService.Dequeue(s.ctx)
	s.NoError(err)
	s.NotNil(dequeuedJob2)
	s.Equal(job2.ID, dequeuedJob2.ID)
}

// =============================================================================
// Test: MarkCompleted
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestMarkCompleted_UpdatesJob() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Dequeue first
	_, _ = s.jobsService.Dequeue(s.ctx)

	err := s.jobsService.MarkCompleted(s.ctx, job.ID, extraction.ObjectExtractionResults{
		ObjectsCreated:       10,
		RelationshipsCreated: 5,
		SuggestionsCreated:   3,
		TotalItems:           20,
		ProcessedItems:       20,
		SuccessfulItems:      18,
		FailedItems:          2,
		DiscoveredTypes:      extraction.JSONArray{"Person", "Organization"},
		CreatedObjects:       extraction.JSONArray{"obj-1", "obj-2"},
	})
	s.NoError(err)

	// Verify job is completed
	updatedJob, err := s.jobsService.FindByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusCompleted, updatedJob.Status)
	s.NotNil(updatedJob.CompletedAt)
	s.Equal(10, updatedJob.ObjectsCreated)
	s.Equal(5, updatedJob.RelationshipsCreated)
	s.Equal(18, updatedJob.SuccessfulItems)
	s.Equal(2, updatedJob.FailedItems)
}

// =============================================================================
// Test: MarkFailed
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestMarkFailed_SchedulesRetry() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx)

	err := s.jobsService.MarkFailed(s.ctx, job.ID, "LLM API error: rate limited", extraction.JSON{
		"code": "RATE_LIMITED",
	})
	s.NoError(err)

	// Verify job is back to pending (scheduled for retry)
	updatedJob, err := s.jobsService.FindByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusPending, updatedJob.Status)
	s.NotNil(updatedJob.ErrorMessage)
	s.Contains(*updatedJob.ErrorMessage, "rate limited")
	s.Equal(1, updatedJob.RetryCount)
}

func (s *ObjectExtractionJobsTestSuite) TestMarkFailed_PermanentlyFailsAfterMaxRetries() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Simulate max retries reached by setting retry_count
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET retry_count = 2 WHERE id = ?",
		job.ID).Exec(s.ctx)

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx)

	err := s.jobsService.MarkFailed(s.ctx, job.ID, "Final failure", nil)
	s.NoError(err)

	// Verify job is moved to dead letter queue (permanently failed)
	updatedJob, err := s.jobsService.FindByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusDeadLetter, updatedJob.Status, "Job should be moved to dead_letter status after max retries")
	s.NotNil(updatedJob.CompletedAt)
	s.Equal(3, updatedJob.RetryCount)
}

// =============================================================================
// Test: UpdateProgress
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestUpdateProgress_UpdatesProgressFields() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	_, _ = s.jobsService.Dequeue(s.ctx)

	err := s.jobsService.UpdateProgress(s.ctx, job.ID, 50, 100)
	s.NoError(err)

	updatedJob, _ := s.jobsService.FindByID(s.ctx, job.ID)
	s.Equal(50, updatedJob.ProcessedItems)
	s.Equal(100, updatedJob.TotalItems)
}

// =============================================================================
// Test: CancelJob
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestCancelJob_CancelsPendingJob() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	err := s.jobsService.CancelJob(s.ctx, job.ID)
	s.NoError(err)

	updatedJob, _ := s.jobsService.FindByID(s.ctx, job.ID)
	s.Equal(extraction.JobStatusCancelled, updatedJob.Status)
	s.NotNil(updatedJob.CompletedAt)
}

func (s *ObjectExtractionJobsTestSuite) TestCancelJob_CancelsProcessingJob() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	_, _ = s.jobsService.Dequeue(s.ctx)

	err := s.jobsService.CancelJob(s.ctx, job.ID)
	s.NoError(err)

	updatedJob, _ := s.jobsService.FindByID(s.ctx, job.ID)
	s.Equal(extraction.JobStatusCancelled, updatedJob.Status)
}

func (s *ObjectExtractionJobsTestSuite) TestCancelJob_FailsForCompletedJob() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	_, _ = s.jobsService.Dequeue(s.ctx)
	_ = s.jobsService.MarkCompleted(s.ctx, job.ID, extraction.ObjectExtractionResults{})

	err := s.jobsService.CancelJob(s.ctx, job.ID)
	s.Error(err) // Should fail - can't cancel completed job
}

// =============================================================================
// Test: RecoverStaleJobs
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestRecoverStaleJobs_RecoversProcessingJobs() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx)

	// Manually set started_at to 15 minutes ago to simulate stale job
	_, err := s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET started_at = now() - interval '15 minutes' WHERE id = ?",
		job.ID).Exec(s.ctx)
	s.NoError(err)

	// Recover with default 10 minute threshold
	count, err := s.jobsService.RecoverStaleJobs(s.ctx)
	s.NoError(err)
	s.Equal(1, count)

	// Verify job is back to pending
	updatedJob, _ := s.jobsService.FindByID(s.ctx, job.ID)
	s.Equal(extraction.JobStatusPending, updatedJob.Status)
	s.Nil(updatedJob.StartedAt)
}

func (s *ObjectExtractionJobsTestSuite) TestRecoverStaleJobs_IgnoresRecentProcessingJobs() {
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Dequeue to set to processing (started just now)
	_, _ = s.jobsService.Dequeue(s.ctx)

	// Recover with 10 minute threshold - should not recover
	count, err := s.jobsService.RecoverStaleJobs(s.ctx)
	s.NoError(err)
	s.Equal(0, count)
}

// =============================================================================
// Test: FindByProject
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestFindByProject_ReturnsProjectJobs() {
	// Create jobs for our project
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Create job for different project
	otherProjectID := uuid.NewString()
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: s.orgID,
		Name:  "Other Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: otherProjectID,
	})

	// Find jobs for our project
	jobs, err := s.jobsService.FindByProject(s.ctx, s.projectID, nil, 20)
	s.NoError(err)
	s.Len(jobs, 2)
}

func (s *ObjectExtractionJobsTestSuite) TestFindByProject_WithStatusFilter() {
	// Create pending job
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Create and complete another job
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_ = s.jobsService.MarkCompleted(s.ctx, job2.ID, extraction.ObjectExtractionResults{})

	// Find pending jobs only
	pendingStatus := extraction.JobStatusPending
	jobs, err := s.jobsService.FindByProject(s.ctx, s.projectID, &pendingStatus, 20)
	s.NoError(err)
	s.Len(jobs, 1)
}

// =============================================================================
// Test: FindByDocument
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestFindByDocument_ReturnsMatchingJobs() {
	// Create job with document ID
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID:  s.projectID,
		DocumentID: &s.documentID,
	})

	// Create job without document ID
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Find by document ID
	jobs, err := s.jobsService.FindByDocument(s.ctx, s.documentID)
	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(job.ID, jobs[0].ID)
}

// =============================================================================
// Test: Stats
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestStats_ReturnsCorrectCounts() {
	// Create pending job
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	// Create and process job (set to processing)
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	// Note: can't dequeue second while first is pending

	// Create and complete job
	job3, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'completed' WHERE id = ?",
		job3.ID).Exec(s.ctx)

	// Create failed job
	job4, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'failed' WHERE id = ?",
		job4.ID).Exec(s.ctx)

	stats, err := s.jobsService.Stats(s.ctx, &s.projectID)
	s.NoError(err)
	s.Equal(int64(2), stats.Pending)
	s.Equal(int64(0), stats.Processing)
	s.Equal(int64(1), stats.Completed)
	s.Equal(int64(1), stats.Failed)
	s.Equal(int64(4), stats.Total)
}

func (s *ObjectExtractionJobsTestSuite) TestStats_AllProjects() {
	// Create jobs in different projects
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	otherProjectID := uuid.NewString()
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: s.orgID,
		Name:  "Other Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: otherProjectID,
	})

	// Get stats for all projects (nil projectID)
	stats, err := s.jobsService.Stats(s.ctx, nil)
	s.NoError(err)
	s.Equal(int64(2), stats.Pending)
	s.Equal(int64(2), stats.Total)
}

// =============================================================================
// Test: BulkCancelByProject
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestBulkCancelByProject_CancelsAllPendingJobs() {
	// Create multiple jobs
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	job3, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	// Complete one
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'completed' WHERE id = ?",
		job3.ID).Exec(s.ctx)

	count, err := s.jobsService.BulkCancelByProject(s.ctx, s.projectID)
	s.NoError(err)
	s.Equal(2, count) // Only pending jobs cancelled

	// Verify stats
	stats, _ := s.jobsService.Stats(s.ctx, &s.projectID)
	s.Equal(int64(0), stats.Pending)
	s.Equal(int64(2), stats.Cancelled)
	s.Equal(int64(1), stats.Completed)
}

// =============================================================================
// Test: BulkRetryFailed
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestBulkRetryFailed_ResetsFailedJobs() {
	// Create and fail jobs
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})

	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'failed', error_message = 'test error' WHERE id IN (?, ?)",
		job1.ID, job2.ID).Exec(s.ctx)

	count, err := s.jobsService.BulkRetryFailed(s.ctx, s.projectID)
	s.NoError(err)
	s.Equal(2, count)

	// Verify jobs are back to pending
	updatedJob1, _ := s.jobsService.FindByID(s.ctx, job1.ID)
	s.Equal(extraction.JobStatusPending, updatedJob1.Status)
	s.Nil(updatedJob1.ErrorMessage)
}

// =============================================================================
// Test: DeleteCompleted
// =============================================================================

func (s *ObjectExtractionJobsTestSuite) TestDeleteCompleted_DeletesFinishedJobs() {
	// Create jobs in various states
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	job3, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	})
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateObjectExtractionJobOptions{
		ProjectID: s.projectID,
	}) // job4 stays pending

	// Set various statuses
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'completed' WHERE id = ?",
		job1.ID).Exec(s.ctx)
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'failed' WHERE id = ?",
		job2.ID).Exec(s.ctx)
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.object_extraction_jobs SET status = 'cancelled' WHERE id = ?",
		job3.ID).Exec(s.ctx)
	// job4 stays pending

	count, err := s.jobsService.DeleteCompleted(s.ctx, s.projectID)
	s.NoError(err)
	s.Equal(3, count) // completed, failed, cancelled

	// Verify only pending job remains
	stats, _ := s.jobsService.Stats(s.ctx, &s.projectID)
	s.Equal(int64(1), stats.Total)
	s.Equal(int64(1), stats.Pending)
}
