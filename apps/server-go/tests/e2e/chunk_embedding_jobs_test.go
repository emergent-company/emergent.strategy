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

// ChunkEmbeddingJobsTestSuite tests the chunk embedding job queue functionality
type ChunkEmbeddingJobsTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *extraction.ChunkEmbeddingJobsService
	log         *slog.Logger
	orgID       string
	projectID   string
	documentID  string
}

func TestChunkEmbeddingJobsSuite(t *testing.T) {
	suite.Run(t, new(ChunkEmbeddingJobsTestSuite))
}

func (s *ChunkEmbeddingJobsTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "chunk_embedding_jobs")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the chunk embedding jobs service
	cfg := &extraction.ChunkEmbeddingConfig{
		BaseRetryDelaySec: 60,
		MaxRetryDelaySec:  3600,
		WorkerIntervalMs:  5000,
		WorkerBatchSize:   10,
	}
	s.jobsService = extraction.NewChunkEmbeddingJobsService(testDB.DB, s.log, cfg)
}

func (s *ChunkEmbeddingJobsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *ChunkEmbeddingJobsTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create an org and project for tests
	s.orgID = uuid.New().String()
	s.projectID = uuid.New().String()
	s.documentID = uuid.New().String()

	err = testutil.CreateTestOrganization(s.ctx, s.testDB.DB, s.orgID, "Test Org for Chunk Embedding")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project for Chunk Embedding",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create a test document
	s.createTestDocument()
}

// createTestDocument creates a test document for chunk creation
func (s *ChunkEmbeddingJobsTestSuite) createTestDocument() {
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.documents (id, project_id, source_type, filename, content, sync_version, created_at, updated_at)
		VALUES (?, ?, 'upload', 'test-document.txt', 'Test content', 1, now(), now())
	`, s.documentID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
}

// createTestChunk creates a test chunk and returns its ID
func (s *ChunkEmbeddingJobsTestSuite) createTestChunk(index int) string {
	id := uuid.NewString()
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.chunks (id, document_id, chunk_index, text, created_at, updated_at)
		VALUES (?, ?, ?, ?, now(), now())
	`, id, s.documentID, index, "Test chunk text "+id).Exec(s.ctx)
	s.Require().NoError(err)
	return id
}

// =============================================================================
// Test: Enqueue
// =============================================================================

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueue_CreatesJob() {
	chunkID := s.createTestChunk(0)

	job, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{
		ChunkID: chunkID,
	})

	s.NoError(err)
	s.NotEmpty(job.ID)
	s.Equal(chunkID, job.ChunkID)
	s.Equal(extraction.JobStatusPending, job.Status)
	s.Equal(0, job.AttemptCount)
	s.Equal(0, job.Priority)
}

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueue_WithPriority() {
	chunkID := s.createTestChunk(0)

	job, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{
		ChunkID:  chunkID,
		Priority: 10,
	})

	s.NoError(err)
	s.Equal(10, job.Priority)
}

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueue_Idempotent() {
	chunkID := s.createTestChunk(0)

	// First enqueue
	job1, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	s.NoError(err)

	// Second enqueue should return same job
	job2, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	s.NoError(err)
	s.Equal(job1.ID, job2.ID, "Should return existing job, not create new one")
}

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueue_AfterCompletion_CreatesNew() {
	chunkID := s.createTestChunk(0)

	// Enqueue first job
	job1, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	s.NoError(err)

	// Mark as completed
	err = s.jobsService.MarkCompleted(s.ctx, job1.ID)
	s.NoError(err)

	// Enqueue again - should create new job
	job2, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	s.NoError(err)
	s.NotEqual(job1.ID, job2.ID, "Should create new job after previous completed")
}

// =============================================================================
// Test: EnqueueBatch
// =============================================================================

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueueBatch_CreatesMultipleJobs() {
	chunkIDs := []string{
		s.createTestChunk(0),
		s.createTestChunk(1),
		s.createTestChunk(2),
	}

	count, err := s.jobsService.EnqueueBatch(s.ctx, chunkIDs, 5)

	s.NoError(err)
	s.Equal(3, count)

	// Verify all jobs exist
	for _, id := range chunkIDs {
		job, err := s.jobsService.GetActiveJobForChunk(s.ctx, id)
		s.NoError(err)
		s.NotNil(job)
		s.Equal(5, job.Priority)
	}
}

func (s *ChunkEmbeddingJobsTestSuite) TestEnqueueBatch_SkipsExisting() {
	// Pre-create a job
	existingID := s.createTestChunk(0)
	_, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: existingID})
	s.NoError(err)

	// Batch enqueue including existing
	chunkIDs := []string{existingID, s.createTestChunk(1), s.createTestChunk(2)}
	count, err := s.jobsService.EnqueueBatch(s.ctx, chunkIDs, 0)

	s.NoError(err)
	s.Equal(2, count, "Should only create 2 new jobs, skipping existing")
}

// =============================================================================
// Test: Dequeue
// =============================================================================

func (s *ChunkEmbeddingJobsTestSuite) TestDequeue_ClaimsJobs() {
	chunkID := s.createTestChunk(0)
	_, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	s.NoError(err)

	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(extraction.JobStatusProcessing, jobs[0].Status)
	s.Equal(1, jobs[0].AttemptCount)
	s.NotNil(jobs[0].StartedAt)
}

func (s *ChunkEmbeddingJobsTestSuite) TestDequeue_RespectsScheduledAt() {
	// Create a job scheduled for future
	futureID := s.createTestChunk(0)
	future := time.Now().Add(1 * time.Hour)
	_, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{
		ChunkID:    futureID,
		ScheduleAt: &future,
	})
	s.NoError(err)

	// Create a job ready now
	nowID := s.createTestChunk(1)
	_, err = s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: nowID})
	s.NoError(err)

	// Dequeue should only get the now job
	jobs, err := s.jobsService.Dequeue(s.ctx, 10)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(nowID, jobs[0].ChunkID)
}

func (s *ChunkEmbeddingJobsTestSuite) TestDequeue_RespectsPriority() {
	// Create low priority job first
	lowID := s.createTestChunk(0)
	_, err := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{
		ChunkID:  lowID,
		Priority: 1,
	})
	s.NoError(err)

	// Create high priority job second
	highID := s.createTestChunk(1)
	_, err = s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{
		ChunkID:  highID,
		Priority: 10,
	})
	s.NoError(err)

	// Dequeue should get high priority first
	jobs, err := s.jobsService.Dequeue(s.ctx, 1)

	s.NoError(err)
	s.Len(jobs, 1)
	s.Equal(highID, jobs[0].ChunkID)
}

// =============================================================================
// Test: MarkCompleted
// =============================================================================

func (s *ChunkEmbeddingJobsTestSuite) TestMarkCompleted_UpdatesJob() {
	chunkID := s.createTestChunk(0)
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})

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

func (s *ChunkEmbeddingJobsTestSuite) TestMarkFailed_RequeuesForRetry() {
	chunkID := s.createTestChunk(0)
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})

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

func (s *ChunkEmbeddingJobsTestSuite) TestRecoverStaleJobs_RecoversProcessingJobs() {
	chunkID := s.createTestChunk(0)
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})

	// Dequeue to set to processing
	_, _ = s.jobsService.Dequeue(s.ctx, 1)

	// Manually set started_at to 15 minutes ago to simulate stale job
	_, err := s.testDB.DB.NewRaw(
		"UPDATE kb.chunk_embedding_jobs SET started_at = now() - interval '15 minutes' WHERE id = ?",
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

func (s *ChunkEmbeddingJobsTestSuite) TestRecoverStaleJobs_IgnoresRecentProcessingJobs() {
	chunkID := s.createTestChunk(0)
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})

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

func (s *ChunkEmbeddingJobsTestSuite) TestStats_ReturnsCorrectCounts() {
	// Create various jobs
	chunk1, chunk2, chunk3 := s.createTestChunk(0), s.createTestChunk(1), s.createTestChunk(2)
	
	// Pending job
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunk1})
	
	// Processing job (dequeue it)
	_, _ = s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunk2})
	_, _ = s.jobsService.Dequeue(s.ctx, 1)
	
	// Completed job
	job3, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunk3})
	_ = s.jobsService.MarkCompleted(s.ctx, job3.ID)

	stats, err := s.jobsService.Stats(s.ctx)
	s.NoError(err)
	s.Equal(int64(1), stats.Pending)
	s.Equal(int64(1), stats.Processing)
	s.Equal(int64(1), stats.Completed)
	s.Equal(int64(0), stats.Failed)
}

// =============================================================================
// Test: GetActiveJobForChunk
// =============================================================================

func (s *ChunkEmbeddingJobsTestSuite) TestGetActiveJobForChunk_ReturnsActiveJob() {
	chunkID := s.createTestChunk(0)
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})

	activeJob, err := s.jobsService.GetActiveJobForChunk(s.ctx, chunkID)
	s.NoError(err)
	s.NotNil(activeJob)
	s.Equal(job.ID, activeJob.ID)
}

func (s *ChunkEmbeddingJobsTestSuite) TestGetActiveJobForChunk_ReturnsNilWhenCompleted() {
	chunkID := s.createTestChunk(0)
	job, _ := s.jobsService.Enqueue(s.ctx, extraction.ChunkEnqueueOptions{ChunkID: chunkID})
	_ = s.jobsService.MarkCompleted(s.ctx, job.ID)

	activeJob, err := s.jobsService.GetActiveJobForChunk(s.ctx, chunkID)
	s.NoError(err)
	s.Nil(activeJob)
}

func (s *ChunkEmbeddingJobsTestSuite) TestGetActiveJobForChunk_ReturnsNilForUnknown() {
	activeJob, err := s.jobsService.GetActiveJobForChunk(s.ctx, uuid.NewString())
	s.NoError(err)
	s.Nil(activeJob)
}
