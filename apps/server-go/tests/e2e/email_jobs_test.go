package e2e

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/email"
	"github.com/emergent/emergent-core/internal/testutil"
)

// EmailJobsTestSuite tests the email job queue functionality
type EmailJobsTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *email.JobsService
	log         *slog.Logger
}

func TestEmailJobsSuite(t *testing.T) {
	suite.Run(t, new(EmailJobsTestSuite))
}

func (s *EmailJobsTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "email_jobs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the email jobs service
	cfg := &email.Config{
		Enabled:          true,
		MaxRetries:       3,
		RetryDelaySec:    60,
		WorkerIntervalMs: 5000,
		WorkerBatchSize:  10,
	}
	s.jobsService = email.NewJobsService(testDB.DB, s.log, cfg)
}

func (s *EmailJobsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *EmailJobsTestSuite) SetupTest() {
	// Truncate email_jobs table before each test
	_, err := s.testDB.DB.ExecContext(s.ctx, "TRUNCATE TABLE kb.email_jobs CASCADE")
	s.Require().NoError(err)
}

// =============================================================================
// Test: Enqueue
// =============================================================================

func (s *EmailJobsTestSuite) TestEnqueue_CreatesJob() {
	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "welcome",
		ToEmail:      "test@example.com",
		Subject:      "Welcome!",
		TemplateData: map[string]interface{}{"name": "Test User"},
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal("welcome", job.TemplateName)
	s.Equal("test@example.com", job.ToEmail)
	s.Equal("Welcome!", job.Subject)
	s.Equal(email.JobStatusPending, job.Status)
	s.Equal(0, job.Attempts)
	s.Equal(3, job.MaxAttempts)
}

func (s *EmailJobsTestSuite) TestEnqueue_WithOptionalFields() {
	toName := "John Doe"
	sourceType := "invite"
	sourceID := "123e4567-e89b-12d3-a456-426614174000"
	maxAttempts := 5

	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "invite",
		ToEmail:      "john@example.com",
		ToName:       &toName,
		Subject:      "You're invited!",
		SourceType:   &sourceType,
		SourceID:     &sourceID,
		MaxAttempts:  &maxAttempts,
	})

	s.NoError(err)
	s.NotNil(job.ToName)
	s.Equal(toName, *job.ToName)
	s.NotNil(job.SourceType)
	s.Equal(sourceType, *job.SourceType)
	s.NotNil(job.SourceID)
	s.Equal(sourceID, *job.SourceID)
	s.Equal(5, job.MaxAttempts)
}

// =============================================================================
// Test: Dequeue
// =============================================================================

func (s *EmailJobsTestSuite) TestDequeue_ClaimsJobs() {
	// Enqueue 3 jobs
	for i := 0; i < 3; i++ {
		_, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
			TemplateName: "test",
			ToEmail:      "test@example.com",
			Subject:      "Test",
		})
		s.Require().NoError(err)
	}

	// Dequeue 2 jobs
	jobs, err := s.jobsService.Dequeue(s.ctx, 2)

	s.NoError(err)
	s.Len(jobs, 2)

	// Jobs should be marked as processing and have attempts incremented
	for _, job := range jobs {
		s.Equal(email.JobStatusProcessing, job.Status)
		s.Equal(1, job.Attempts)
	}

	// Verify only 1 pending job remains
	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(1), stats.Pending)
	s.Equal(int64(2), stats.Processing)
}

func (s *EmailJobsTestSuite) TestDequeue_RespectsScheduledAt() {
	// Enqueue a job scheduled for the future
	_, err := s.testDB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.email_jobs (template_name, to_email, subject, status, next_retry_at)
		VALUES ('test', 'test@example.com', 'Test', 'pending', now() + interval '1 hour')
	`)
	s.Require().NoError(err)

	// Dequeue should return no jobs (job is scheduled for later)
	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 0)
}

func (s *EmailJobsTestSuite) TestDequeue_FIFO() {
	// Enqueue jobs with a small delay between them
	var firstJobID string
	for i := 0; i < 3; i++ {
		job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
			TemplateName: "test",
			ToEmail:      "test@example.com",
			Subject:      "Test",
		})
		s.Require().NoError(err)
		if i == 0 {
			firstJobID = job.ID
		}
		time.Sleep(10 * time.Millisecond) // Ensure different created_at
	}

	// Dequeue 1 job - should be the first one
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(firstJobID, jobs[0].ID)
}

// =============================================================================
// Test: Mark Sent
// =============================================================================

func (s *EmailJobsTestSuite) TestMarkSent_UpdatesJob() {
	// Enqueue and dequeue a job
	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "test",
		ToEmail:      "test@example.com",
		Subject:      "Test",
	})
	s.Require().NoError(err)

	// Mark as sent
	err = s.jobsService.MarkSent(s.ctx, job.ID, "mailgun-message-id-123")
	s.NoError(err)

	// Verify job is marked as sent
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(email.JobStatusSent, updatedJob.Status)
	s.NotNil(updatedJob.MailgunMessageID)
	s.Equal("mailgun-message-id-123", *updatedJob.MailgunMessageID)
	s.NotNil(updatedJob.ProcessedAt)
}

// =============================================================================
// Test: Mark Failed
// =============================================================================

func (s *EmailJobsTestSuite) TestMarkFailed_RequeuesForRetry() {
	// Enqueue a job
	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "test",
		ToEmail:      "test@example.com",
		Subject:      "Test",
	})
	s.Require().NoError(err)

	// Dequeue to increment attempts
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)
	s.Require().NoError(err)
	s.Require().Len(jobs, 1)

	// Mark as failed
	testErr := &testError{msg: "SMTP connection failed"}
	err = s.jobsService.MarkFailed(s.ctx, job.ID, testErr)
	s.NoError(err)

	// Verify job is requeued for retry
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(email.JobStatusPending, updatedJob.Status)
	s.NotNil(updatedJob.LastError)
	s.Contains(*updatedJob.LastError, "SMTP connection failed")
	s.NotNil(updatedJob.NextRetryAt)
	s.True(updatedJob.NextRetryAt.After(time.Now()))
}

func (s *EmailJobsTestSuite) TestMarkFailed_PermanentlyFailsAfterMaxAttempts() {
	// Create a job with max_attempts = 1
	maxAttempts := 1
	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "test",
		ToEmail:      "test@example.com",
		Subject:      "Test",
		MaxAttempts:  &maxAttempts,
	})
	s.Require().NoError(err)

	// Dequeue to increment attempts to 1
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)
	s.Require().NoError(err)
	s.Require().Len(jobs, 1)
	s.Equal(1, jobs[0].Attempts) // Now at attempt 1, max is 1

	// Mark as failed - should move to dead letter since attempts >= maxAttempts
	testErr := &testError{msg: "Permanent failure"}
	err = s.jobsService.MarkFailed(s.ctx, job.ID, testErr)
	s.NoError(err)

	// Verify job is moved to dead letter queue (permanently failed)
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(email.JobStatusDeadLetter, updatedJob.Status, "Job should be moved to dead_letter status after max attempts")
	s.NotNil(updatedJob.ProcessedAt)
}

// =============================================================================
// Test: Recover Stale Jobs
// =============================================================================

func (s *EmailJobsTestSuite) TestRecoverStaleJobs_RecoversProcessingJobs() {
	// Create a stale processing job (started 20 minutes ago)
	_, err := s.testDB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.email_jobs (template_name, to_email, subject, status, created_at)
		VALUES ('test', 'test@example.com', 'Test', 'processing', now() - interval '20 minutes')
	`)
	s.Require().NoError(err)

	// Recover stale jobs (threshold: 10 minutes)
	count, err := s.jobsService.RecoverStaleJobs(s.ctx, 10)

	s.NoError(err)
	s.Equal(1, count)

	// Verify job is now pending
	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(1), stats.Pending)
	s.Equal(int64(0), stats.Processing)
}

func (s *EmailJobsTestSuite) TestRecoverStaleJobs_IgnoresRecentProcessingJobs() {
	// Create a recent processing job (started 5 minutes ago)
	_, err := s.testDB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.email_jobs (template_name, to_email, subject, status, created_at)
		VALUES ('test', 'test@example.com', 'Test', 'processing', now() - interval '5 minutes')
	`)
	s.Require().NoError(err)

	// Recover stale jobs (threshold: 10 minutes)
	count, err := s.jobsService.RecoverStaleJobs(s.ctx, 10)

	s.NoError(err)
	s.Equal(0, count)

	// Verify job is still processing
	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(0), stats.Pending)
	s.Equal(int64(1), stats.Processing)
}

// =============================================================================
// Test: Stats
// =============================================================================

func (s *EmailJobsTestSuite) TestStats_ReturnsCorrectCounts() {
	// Create jobs in various states
	_, err := s.testDB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.email_jobs (template_name, to_email, subject, status) VALUES
		('test', 'test1@example.com', 'Test 1', 'pending'),
		('test', 'test2@example.com', 'Test 2', 'pending'),
		('test', 'test3@example.com', 'Test 3', 'processing'),
		('test', 'test4@example.com', 'Test 4', 'sent'),
		('test', 'test5@example.com', 'Test 5', 'sent'),
		('test', 'test6@example.com', 'Test 6', 'sent'),
		('test', 'test7@example.com', 'Test 7', 'failed')
	`)
	s.Require().NoError(err)

	stats, err := s.jobsService.Stats(s.ctx)

	s.NoError(err)
	s.Equal(int64(2), stats.Pending)
	s.Equal(int64(1), stats.Processing)
	s.Equal(int64(3), stats.Sent)
	s.Equal(int64(1), stats.Failed)
}

// =============================================================================
// Test: Get Job
// =============================================================================

func (s *EmailJobsTestSuite) TestGetJob_ReturnsJob() {
	job, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "test",
		ToEmail:      "test@example.com",
		Subject:      "Test",
	})
	s.Require().NoError(err)

	retrieved, err := s.jobsService.GetJob(s.ctx, job.ID)

	s.NoError(err)
	s.NotNil(retrieved)
	s.Equal(job.ID, retrieved.ID)
	s.Equal("test@example.com", retrieved.ToEmail)
}

func (s *EmailJobsTestSuite) TestGetJob_ReturnsNilForNonexistent() {
	retrieved, err := s.jobsService.GetJob(s.ctx, "00000000-0000-0000-0000-000000000000")

	s.NoError(err)
	s.Nil(retrieved)
}

// =============================================================================
// Test: Get Jobs By Source
// =============================================================================

func (s *EmailJobsTestSuite) TestGetJobsBySource_ReturnsMatchingJobs() {
	sourceType := "invite"
	sourceID := "123e4567-e89b-12d3-a456-426614174000"

	// Create 2 jobs with matching source
	for i := 0; i < 2; i++ {
		_, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
			TemplateName: "invite",
			ToEmail:      "test@example.com",
			Subject:      "Invite",
			SourceType:   &sourceType,
			SourceID:     &sourceID,
		})
		s.Require().NoError(err)
	}

	// Create 1 job with different source
	_, err := s.jobsService.Enqueue(s.ctx, email.EnqueueOptions{
		TemplateName: "other",
		ToEmail:      "other@example.com",
		Subject:      "Other",
	})
	s.Require().NoError(err)

	jobs, err := s.jobsService.GetJobsBySource(s.ctx, sourceType, sourceID)

	s.NoError(err)
	s.Len(jobs, 2)
	for _, job := range jobs {
		s.Equal(sourceType, *job.SourceType)
		s.Equal(sourceID, *job.SourceID)
	}
}

// =============================================================================
// Helpers
// =============================================================================

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}
