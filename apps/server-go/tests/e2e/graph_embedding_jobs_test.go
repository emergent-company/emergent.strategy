package e2e

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/extraction"
	"github.com/emergent/emergent-core/internal/testutil"
)

// GraphEmbeddingJobsTestSuite tests the graph embedding job queue functionality
type GraphEmbeddingJobsTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *extraction.GraphEmbeddingJobsService
	log         *slog.Logger
}

func TestGraphEmbeddingJobsSuite(t *testing.T) {
	suite.Run(t, new(GraphEmbeddingJobsTestSuite))
}

func (s *GraphEmbeddingJobsTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "graph_embedding_jobs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the graph embedding jobs service
	cfg := &extraction.GraphEmbeddingConfig{
		BaseRetryDelaySec: 60,
		MaxRetryDelaySec:  3600,
		WorkerIntervalMs:  5000,
		WorkerBatchSize:   10,
	}
	s.jobsService = extraction.NewGraphEmbeddingJobsService(testDB.DB, s.log, cfg)
}

func (s *GraphEmbeddingJobsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *GraphEmbeddingJobsTestSuite) SetupTest() {
	// Truncate graph_embedding_jobs table before each test
	_, err := s.testDB.DB.ExecContext(s.ctx, "TRUNCATE TABLE kb.graph_embedding_jobs CASCADE")
	s.Require().NoError(err)
}

// =============================================================================
// Test: Enqueue
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestEnqueue_CreatesJob() {
	objectID := uuid.NewString()

	job, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: objectID,
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal(objectID, job.ObjectID)
	s.Equal(extraction.JobStatusPending, job.Status)
	s.Equal(0, job.AttemptCount)
	s.Equal(0, job.Priority)
}

func (s *GraphEmbeddingJobsTestSuite) TestEnqueue_WithPriority() {
	objectID := uuid.NewString()

	job, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: objectID,
		Priority: 10,
	})

	s.NoError(err)
	s.Equal(10, job.Priority)
}

func (s *GraphEmbeddingJobsTestSuite) TestEnqueue_Idempotent() {
	objectID := uuid.NewString()

	// First enqueue
	job1, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	// Second enqueue should return same job
	job2, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)
	s.Equal(job1.ID, job2.ID, "Should return existing job, not create new one")
}

func (s *GraphEmbeddingJobsTestSuite) TestEnqueue_AfterCompletion_CreatesNew() {
	objectID := uuid.NewString()

	// Enqueue first job
	job1, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	// Mark as completed
	err = s.jobsService.MarkCompleted(s.ctx, job1.ID)
	s.NoError(err)

	// Enqueue again - should create new job
	job2, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)
	s.NotEqual(job1.ID, job2.ID, "Should create new job after previous completed")
}

// =============================================================================
// Test: EnqueueBatch
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestEnqueueBatch_CreatesMultipleJobs() {
	objectIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}

	count, err := s.jobsService.EnqueueBatch(s.ctx, objectIDs, 5)

	s.NoError(err)
	s.Equal(3, count)

	// Verify all jobs exist
	for _, id := range objectIDs {
		job, err := s.jobsService.GetActiveJobForObject(s.ctx, id)
		s.NoError(err)
		s.NotNil(job)
		s.Equal(5, job.Priority)
	}
}

func (s *GraphEmbeddingJobsTestSuite) TestEnqueueBatch_SkipsExisting() {
	// Pre-create a job
	existingID := uuid.NewString()
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: existingID})
	s.NoError(err)

	// Batch enqueue including existing
	objectIDs := []string{existingID, uuid.NewString(), uuid.NewString()}
	count, err := s.jobsService.EnqueueBatch(s.ctx, objectIDs, 0)

	s.NoError(err)
	s.Equal(2, count, "Should only create 2 new jobs, skipping existing")
}

// =============================================================================
// Test: Dequeue
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestDequeue_ClaimsJobs() {
	objectID := uuid.NewString()
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(extraction.JobStatusProcessing, jobs[0].Status)
	s.Equal(1, jobs[0].AttemptCount)
	s.NotNil(jobs[0].StartedAt)
}

func (s *GraphEmbeddingJobsTestSuite) TestDequeue_RespectsScheduledAt() {
	// Create a job scheduled for future
	futureID := uuid.NewString()
	future := time.Now().Add(1 * time.Hour)
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID:   futureID,
		ScheduleAt: &future,
	})
	s.NoError(err)

	// Create a job ready now
	nowID := uuid.NewString()
	_, err = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: nowID})
	s.NoError(err)

	// Dequeue should only get the now job
	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(nowID, jobs[0].ObjectID)
}

func (s *GraphEmbeddingJobsTestSuite) TestDequeue_RespectsPriority() {
	// Create low priority job first
	lowID := uuid.NewString()
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: lowID,
		Priority: 1,
	})
	s.NoError(err)

	// Create high priority job second
	highID := uuid.NewString()
	_, err = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: highID,
		Priority: 10,
	})
	s.NoError(err)

	// Dequeue should get high priority first
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(highID, jobs[0].ObjectID)
}

// =============================================================================
// Test: MarkCompleted
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestMarkCompleted_UpdatesJob() {
	objectID := uuid.NewString()
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})

	// Dequeue first (simulating worker picking up)
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	err := s.jobsService.MarkCompleted(s.ctx, job.ID)
	s.NoError(err)

	// Verify job is completed
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusCompleted, updatedJob.Status)
	s.NotNil(updatedJob.CompletedAt)
}

// =============================================================================
// Test: MarkFailed
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestMarkFailed_RequeuesForRetry() {
	objectID := uuid.NewString()
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	err := s.jobsService.MarkFailed(s.ctx, job.ID, errors.New("Embedding API timeout"))
	s.NoError(err)

	// Verify job is requeued
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusPending, updatedJob.Status)
	s.NotNil(updatedJob.LastError)
	s.Contains(*updatedJob.LastError, "timeout")
}

// =============================================================================
// Test: RecoverStaleJobs
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestRecoverStaleJobs_RecoversProcessingJobs() {
	objectID := uuid.NewString()
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Manually set started_at to 15 minutes ago to simulate stale job
	_, err := s.testDB.DB.NewRaw(
		"UPDATE kb.graph_embedding_jobs SET started_at = now() - interval '15 minutes' WHERE id = ?",
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
}

func (s *GraphEmbeddingJobsTestSuite) TestRecoverStaleJobs_IgnoresRecentProcessingJobs() {
	objectID := uuid.NewString()
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})

	// Dequeue to set to processing (started just now)
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Recover with 10 minute threshold - should not recover
	count, err := s.jobsService.RecoverStaleJobs(s.ctx, 10)
	s.NoError(err)
	s.Equal(0, count)
}

// =============================================================================
// Test: Stats
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestStats_ReturnsCorrectCounts() {
	// Create various jobs
	obj1, obj2, obj3 := uuid.NewString(), uuid.NewString(), uuid.NewString()
	
	// Pending job
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: obj1})
	
	// Processing job (dequeue it)
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: obj2})
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	
	// Completed job
	job3, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: obj3})
	_ = s.jobsService.MarkCompleted(s.ctx, job3.ID)

	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(1), stats.Pending)
	s.Equal(int64(1), stats.Processing)
	s.Equal(int64(1), stats.Completed)
	s.Equal(int64(0), stats.Failed)
}

// =============================================================================
// Test: GetActiveJobForObject
// =============================================================================

func (s *GraphEmbeddingJobsTestSuite) TestGetActiveJobForObject_ReturnsActiveJob() {
	objectID := uuid.NewString()
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})

	activeJob, err := s.jobsService.GetActiveJobForObject(s.ctx, objectID)
	s.NoError(err)
	s.NotNil(activeJob)
	s.Equal(job.ID, activeJob.ID)
}

func (s *GraphEmbeddingJobsTestSuite) TestGetActiveJobForObject_ReturnsNilWhenCompleted() {
	objectID := uuid.NewString()
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	_ = s.jobsService.MarkCompleted(s.ctx, job.ID)

	activeJob, err := s.jobsService.GetActiveJobForObject(s.ctx, objectID)
	s.NoError(err)
	s.Nil(activeJob)
}

func (s *GraphEmbeddingJobsTestSuite) TestGetActiveJobForObject_ReturnsNilForUnknown() {
	activeJob, err := s.jobsService.GetActiveJobForObject(s.ctx, uuid.NewString())
	s.NoError(err)
	s.Nil(activeJob)
}
