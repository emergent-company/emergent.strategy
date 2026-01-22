package e2e

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/extraction"
	"github.com/emergent/emergent-core/internal/testutil"
)

// DocumentParsingJobsTestSuite tests the document parsing job queue functionality
type DocumentParsingJobsTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *extraction.DocumentParsingJobsService
	log         *slog.Logger
	orgID       string
	projectID   string
	documentID  string // test document for FK tests
}

func TestDocumentParsingJobsSuite(t *testing.T) {
	suite.Run(t, new(DocumentParsingJobsTestSuite))
}

func (s *DocumentParsingJobsTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "document_parsing_jobs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the document parsing jobs service
	cfg := &extraction.DocumentParsingConfig{
		BaseRetryDelayMs:      1000,  // 1 second for tests
		MaxRetryDelayMs:       5000,  // 5 seconds max
		RetryMultiplier:       2.0,
		DefaultMaxRetries:     3,
		WorkerIntervalMs:      1000,
		WorkerBatchSize:       5,
		StaleThresholdMinutes: 10,
	}
	s.jobsService = extraction.NewDocumentParsingJobsService(testDB.DB, s.log, cfg)
}

func (s *DocumentParsingJobsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *DocumentParsingJobsTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create an org and project for tests
	s.orgID = uuid.New().String()
	s.projectID = uuid.New().String()

	err = testutil.CreateTestOrganization(s.ctx, s.testDB.DB, s.orgID, "Test Org for Document Parsing")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project for Document Parsing",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create a test document for FK tests
	s.documentID = uuid.New().String()
	s.createTestDocument()
}

// createTestDocument creates a test document for FK tests
func (s *DocumentParsingJobsTestSuite) createTestDocument() {
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.documents (id, project_id, source_type, filename, content, sync_version, created_at, updated_at)
		VALUES (?, ?, 'upload', 'test-document.txt', 'Test content', 1, now(), now())
	`, s.documentID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
}

// =============================================================================
// Test: CreateJob
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestCreateJob_CreatesJob() {
	filename := "test.pdf"
	mimeType := "application/pdf"
	fileSize := int64(12345)
	storageKey := "uploads/test.pdf"

	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		SourceFilename: &filename,
		MimeType:       &mimeType,
		FileSizeBytes:  &fileSize,
		StorageKey:     &storageKey,
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal(s.orgID, job.OrganizationID)
	s.Equal(s.projectID, job.ProjectID)
	s.Equal("file_upload", job.SourceType)
	s.Equal(filename, *job.SourceFilename)
	s.Equal(mimeType, *job.MimeType)
	s.Equal(fileSize, *job.FileSizeBytes)
	s.Equal(storageKey, *job.StorageKey)
	s.Equal(extraction.JobStatusPending, job.Status)
	s.Equal(0, job.RetryCount)
	s.Equal(3, job.MaxRetries)
}

func (s *DocumentParsingJobsTestSuite) TestCreateJob_WithCustomMaxRetries() {
	maxRetries := 5
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "web_page",
		MaxRetries:     &maxRetries,
	})

	s.NoError(err)
	s.Equal(5, job.MaxRetries)
}

func (s *DocumentParsingJobsTestSuite) TestCreateJob_WithMetadata() {
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		Metadata: map[string]interface{}{
			"uploadedBy": "user123",
			"tags":       []string{"important", "contract"},
		},
	})

	s.NoError(err)
	s.Equal("user123", job.Metadata["uploadedBy"])
}

func (s *DocumentParsingJobsTestSuite) TestCreateJob_MinimalOptions() {
	job, err := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "web_page",
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Nil(job.SourceFilename)
	s.Nil(job.StorageKey)
}

// =============================================================================
// Test: Dequeue
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestDequeue_ClaimsJobs() {
	_, err := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	s.NoError(err)

	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(extraction.JobStatusProcessing, jobs[0].Status)
	s.NotNil(jobs[0].StartedAt)
}

func (s *DocumentParsingJobsTestSuite) TestDequeue_RespectsOrder() {
	// Create first job
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Create second job
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue one job - should get first (FIFO order)
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(job1.ID, jobs[0].ID, "Should dequeue jobs in FIFO order")

	// Dequeue next
	jobs, err = s.jobsService.Dequeue(s.ctx, 1)
	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(job2.ID, jobs[0].ID)
}

func (s *DocumentParsingJobsTestSuite) TestDequeue_IncludesRetryPendingJobs() {
	// Create a job and mark it as retry_pending with past next_retry_at
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue and fail it to trigger retry_pending
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	err := s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("Test error"))
	s.NoError(err)

	// Verify it's in retry_pending status
	updatedJob, _ := s.jobsService.GetJob(s.ctx, job.ID)
	s.Equal(extraction.RetryPendingStatus, updatedJob.Status)

	// Manually set next_retry_at to past
	_, err = s.testDB.DB.NewRaw(
		"UPDATE kb.document_parsing_jobs SET next_retry_at = now() - interval '1 minute' WHERE id = ?",
		job.ID).Exec(s.ctx)
	s.NoError(err)

	// Dequeue should pick it up
	jobs, err := s.jobsService.Dequeue(s.ctx, 10)
	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(job.ID, jobs[0].ID)
}

func (s *DocumentParsingJobsTestSuite) TestDequeue_SkipsRetryPendingWithFutureNextRetry() {
	// Create a job and mark it as retry_pending with future next_retry_at
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue and fail it
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	err := s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("Test error"))
	s.NoError(err)

	// next_retry_at is in the future, so dequeue should not pick it up
	jobs, err := s.jobsService.Dequeue(s.ctx, 10)
	s.NoError(err)
	s.Len(jobs, 0)
}

// =============================================================================
// Test: MarkCompleted
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestMarkCompleted_UpdatesJob() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue first
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Use the pre-created document ID (FK constraint requires valid document)
	err := s.jobsService.MarkCompleted(s.ctx, job.ID, extraction.MarkCompletedResult{
		ParsedContent: "This is the extracted text content from the PDF.",
		DocumentID:    &s.documentID,
		Metadata: map[string]interface{}{
			"pages": 5,
		},
	})
	s.NoError(err)

	// Verify job is completed
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusCompleted, updatedJob.Status)
	s.NotNil(updatedJob.CompletedAt)
	s.NotNil(updatedJob.ParsedContent)
	s.Equal("This is the extracted text content from the PDF.", *updatedJob.ParsedContent)
	s.Equal(s.documentID, *updatedJob.DocumentID)
}

// =============================================================================
// Test: MarkFailed
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestMarkFailed_SchedulesRetry() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	err := s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("PDF parsing failed: corrupted file"))
	s.NoError(err)

	// Verify job is retry_pending with scheduled retry
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.RetryPendingStatus, updatedJob.Status)
	s.NotNil(updatedJob.ErrorMessage)
	s.Contains(*updatedJob.ErrorMessage, "corrupted file")
	s.Equal(1, updatedJob.RetryCount)
	s.NotNil(updatedJob.NextRetryAt)
}

func (s *DocumentParsingJobsTestSuite) TestMarkFailed_PermanentlyFailsAfterMaxRetries() {
	maxRetries := 1
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		MaxRetries:     &maxRetries,
	})

	// Dequeue and fail once
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	_ = s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("First failure"))

	// Manually allow retry
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.document_parsing_jobs SET next_retry_at = now() - interval '1 minute' WHERE id = ?",
		job.ID).Exec(s.ctx)

	// Dequeue and fail again (should be permanent now)
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	err := s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("Second failure - should be permanent"))
	s.NoError(err)

	// Verify job is moved to dead letter queue (permanently failed)
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusDeadLetter, updatedJob.Status, "Job should be moved to dead_letter status after max retries")
	s.NotNil(updatedJob.CompletedAt, "Should have completedAt set for permanently failed jobs")
}

// =============================================================================
// Test: RecoverStaleJobs
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestRecoverStaleJobs_RecoversProcessingJobs() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Manually set started_at to 15 minutes ago to simulate stale job
	_, err := s.testDB.DB.NewRaw(
		"UPDATE kb.document_parsing_jobs SET started_at = now() - interval '15 minutes' WHERE id = ?",
		job.ID).Exec(s.ctx)
	s.NoError(err)

	// Recover with 10 minute threshold
	count, err := s.jobsService.RecoverStaleJobs(s.ctx, 10)
	s.NoError(err)
	s.Equal(1, count)

	// Verify job is back to pending
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusPending, updatedJob.Status)
	s.Nil(updatedJob.StartedAt)
}

func (s *DocumentParsingJobsTestSuite) TestRecoverStaleJobs_IgnoresRecentProcessingJobs() {
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Dequeue to set to processing (started just now)
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Recover with 10 minute threshold - should not recover
	count, err := s.jobsService.RecoverStaleJobs(s.ctx, 10)
	s.NoError(err)
	s.Equal(0, count)
}

// =============================================================================
// Test: FindByProject
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestFindByProject_ReturnsProjectJobs() {
	// Create jobs for our project
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "web_page",
	})

	// Create job for different project
	otherProjectID := uuid.NewString()
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: s.orgID,
		Name:  "Other Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      otherProjectID,
		SourceType:     "file_upload",
	})

	// Find jobs for our project
	jobs, err := s.jobsService.FindByProject(s.ctx, s.projectID, 20, 0)
	s.NoError(err)
	s.Len(jobs, 2)
}

// =============================================================================
// Test: FindByStatus
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestFindByStatus_ReturnsMatchingJobs() {
	// Create pending job
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Create and complete another job
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	_ = s.jobsService.MarkCompleted(s.ctx, job2.ID, extraction.MarkCompletedResult{
		ParsedContent: "Content",
	})

	// Find pending jobs
	pendingJobs, err := s.jobsService.FindByStatus(s.ctx, extraction.JobStatusPending, 100)
	s.NoError(err)
	s.Len(pendingJobs, 1)

	// Find completed jobs
	completedJobs, err := s.jobsService.FindByStatus(s.ctx, extraction.JobStatusCompleted, 100)
	s.NoError(err)
	s.Len(completedJobs, 1)
}

// =============================================================================
// Test: FindByDocumentID
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestFindByDocumentID_ReturnsMatchingJobs() {
	// Use the pre-created document ID (FK constraint requires valid document)

	// Create job with document ID
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		DocumentID:     &s.documentID,
	})

	// Create job without document ID
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Find by document ID
	jobs, err := s.jobsService.FindByDocumentID(s.ctx, s.documentID)
	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(job.ID, jobs[0].ID)
}

// =============================================================================
// Test: CancelJobsForDocument
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestCancelJobsForDocument_CancelsPendingJobs() {
	// Use the pre-created document ID (FK constraint requires valid document)

	// Create pending job
	job1, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		DocumentID:     &s.documentID,
	})

	// Create and process another job
	job2, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
		DocumentID:     &s.documentID,
	})
	_, _ = s.jobsService.Dequeue(s.ctx, 10) // Dequeues both

	// Cancel jobs for document
	count, err := s.jobsService.CancelJobsForDocument(s.ctx, s.documentID)
	s.NoError(err)
	s.Equal(2, count) // Both pending and processing should be cancelled

	// Verify jobs are failed with cancel message
	updatedJob1, _ := s.jobsService.GetJob(s.ctx, job1.ID)
	s.Equal(extraction.JobStatusFailed, updatedJob1.Status)
	s.Contains(*updatedJob1.ErrorMessage, "Cancelled")

	updatedJob2, _ := s.jobsService.GetJob(s.ctx, job2.ID)
	s.Equal(extraction.JobStatusFailed, updatedJob2.Status)
}

// =============================================================================
// Test: Stats
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestStats_ReturnsCorrectCounts() {
	// Create pending job
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	// Create and process job (set to processing)
	_, _ = s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Create and complete job
	job3, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	_ = s.jobsService.MarkCompleted(s.ctx, job3.ID, extraction.MarkCompletedResult{
		ParsedContent: "Content",
	})

	// Create retry_pending job
	job4, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})
	_, _ = s.testDB.DB.NewRaw(
		"UPDATE kb.document_parsing_jobs SET status = 'retry_pending' WHERE id = ?",
		job4.ID).Exec(s.ctx)

	// Note: job2 was dequeued so it's processing
	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(1), stats.Pending)
	s.Equal(int64(1), stats.Processing)
	s.Equal(int64(1), stats.RetryPending)
	s.Equal(int64(1), stats.Completed)
	s.Equal(int64(0), stats.Failed)
}

// =============================================================================
// Test: UpdateStatus
// =============================================================================

func (s *DocumentParsingJobsTestSuite) TestUpdateStatus_UpdatesJobStatus() {
	job, _ := s.jobsService.CreateJob(s.ctx, extraction.CreateJobOptions{
		OrganizationID: s.orgID,
		ProjectID:      s.projectID,
		SourceType:     "file_upload",
	})

	parsedContent := "Extracted content"
	err := s.jobsService.UpdateStatus(s.ctx, job.ID, extraction.JobStatusCompleted, &extraction.JobStatusUpdates{
		ParsedContent: &parsedContent,
		Metadata: map[string]interface{}{
			"wordCount": 2,
		},
	})
	s.NoError(err)

	updatedJob, _ := s.jobsService.GetJob(s.ctx, job.ID)
	s.Equal(extraction.JobStatusCompleted, updatedJob.Status)
	s.Equal(parsedContent, *updatedJob.ParsedContent)
}
