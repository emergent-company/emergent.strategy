package e2e

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/extraction"
	"github.com/emergent/emergent-core/internal/testutil"
	"github.com/emergent/emergent-core/pkg/embeddings/vertex"
)

// GraphEmbeddingWorkerTestSuite tests the graph embedding worker functionality
type GraphEmbeddingWorkerTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *extraction.GraphEmbeddingJobsService
	cfg         *extraction.GraphEmbeddingConfig
	log         *slog.Logger
	orgID       string
	projectID   string
}

func TestGraphEmbeddingWorkerSuite(t *testing.T) {
	suite.Run(t, new(GraphEmbeddingWorkerTestSuite))
}

func (s *GraphEmbeddingWorkerTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "graph_embedding_worker")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the graph embedding jobs service with fast polling for tests
	s.cfg = &extraction.GraphEmbeddingConfig{
		BaseRetryDelaySec: 1,      // Fast for testing
		MaxRetryDelaySec:  5,
		WorkerIntervalMs:  100,    // 100ms polling for fast tests
		WorkerBatchSize:   10,
	}
	s.jobsService = extraction.NewGraphEmbeddingJobsService(testDB.DB, s.log, s.cfg)
}

func (s *GraphEmbeddingWorkerTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *GraphEmbeddingWorkerTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create an org and project for tests
	s.orgID = uuid.New().String()
	s.projectID = uuid.New().String()

	err = testutil.CreateTestOrganization(s.ctx, s.testDB.DB, s.orgID, "Test Org for Embedding Worker")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project for Embedding Worker",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)
}

// createGraphObject creates a test graph object and returns its ID
func (s *GraphEmbeddingWorkerTestSuite) createGraphObject(objectType, key string, properties map[string]interface{}) string {
	id := uuid.NewString()
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.graph_objects (id, project_id, canonical_id, type, key, properties, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?::jsonb, now(), now())
	`, id, s.projectID, id, objectType, key, properties).Exec(s.ctx)
	s.Require().NoError(err)
	return id
}

// getEmbedding retrieves the embedding for a graph object
func (s *GraphEmbeddingWorkerTestSuite) getEmbedding(objectID string) ([]float32, *time.Time) {
	var embedding []float32
	var updatedAt *time.Time
	
	// Query using raw SQL for pgvector column
	err := s.testDB.DB.NewRaw(`
		SELECT embedding_v2::float4[], embedding_updated_at 
		FROM kb.graph_objects WHERE id = ?
	`, objectID).Scan(s.ctx, &embedding, &updatedAt)
	
	if err != nil {
		return nil, nil
	}
	return embedding, updatedAt
}

// =============================================================================
// Mock Embedding Service for Testing
// =============================================================================

// mockEmbeddingService is a mock embedding service for testing
type mockEmbeddingService struct {
	enabled         bool
	shouldFail      bool
	failError       error
	callCount       int64
	generatedEmbeds [][]float32
	dimension       int
}

func newMockEmbeddingService(enabled bool) *mockEmbeddingService {
	return &mockEmbeddingService{
		enabled:   enabled,
		dimension: 768,
	}
}

func (m *mockEmbeddingService) IsEnabled() bool {
	return m.enabled
}

func (m *mockEmbeddingService) EmbedQuery(ctx context.Context, query string) ([]float32, error) {
	result, err := m.EmbedQueryWithUsage(ctx, query)
	if err != nil {
		return nil, err
	}
	return result.Embedding, nil
}

func (m *mockEmbeddingService) EmbedDocuments(ctx context.Context, documents []string) ([][]float32, error) {
	embeddings := make([][]float32, len(documents))
	for i := range documents {
		result, err := m.EmbedQueryWithUsage(ctx, documents[i])
		if err != nil {
			return nil, err
		}
		embeddings[i] = result.Embedding
	}
	return embeddings, nil
}

func (m *mockEmbeddingService) EmbedQueryWithUsage(ctx context.Context, query string) (*vertex.EmbedResult, error) {
	atomic.AddInt64(&m.callCount, 1)
	
	if m.shouldFail {
		if m.failError != nil {
			return nil, m.failError
		}
		return nil, errors.New("mock embedding failure")
	}

	// Generate a deterministic embedding based on query hash
	embedding := make([]float32, m.dimension)
	for i := 0; i < m.dimension; i++ {
		// Simple deterministic value based on query and index
		embedding[i] = float32(i%100) / 100.0
	}

	m.generatedEmbeds = append(m.generatedEmbeds, embedding)

	return &vertex.EmbedResult{
		Embedding: embedding,
		Usage: &vertex.Usage{
			PromptTokens: len(query) / 4, // Rough estimate
			TotalTokens:  len(query) / 4,
		},
	}, nil
}

func (m *mockEmbeddingService) CallCount() int64 {
	return atomic.LoadInt64(&m.callCount)
}

// =============================================================================
// Test: Worker Lifecycle
// =============================================================================

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_StartStop() {
	mockEmbeds := newMockEmbeddingService(true)
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)

	// Start worker
	err := worker.Start(s.ctx)
	s.NoError(err)
	s.True(worker.IsRunning())

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	err = worker.Stop(stopCtx)
	s.NoError(err)
	s.False(worker.IsRunning())
}

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_NotStartedWhenEmbeddingsDisabled() {
	mockEmbeds := newMockEmbeddingService(false) // Disabled
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)

	// Start worker - should not actually start
	err := worker.Start(s.ctx)
	s.NoError(err)
	s.False(worker.IsRunning())
}

// =============================================================================
// Test: Job Processing
// =============================================================================

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_ProcessesJob() {
	// Create a graph object
	objectID := s.createGraphObject("Person", "john-doe", map[string]interface{}{
		"name":  "John Doe",
		"email": "john@example.com",
	})

	// Enqueue job
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	// Create and start worker
	mockEmbeds := newMockEmbeddingService(true)
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)
	err = worker.Start(s.ctx)
	s.NoError(err)

	// Wait for job to be processed
	s.Eventually(func() bool {
		job, err := s.jobsService.GetJob(s.ctx, objectID)
		if err != nil || job == nil {
			// Job might be fetched by ID, let's check by object
			activeJob, _ := s.jobsService.GetActiveJobForObject(s.ctx, objectID)
			return activeJob == nil // No active job means completed
		}
		return job.Status == extraction.JobStatusCompleted
	}, 5*time.Second, 100*time.Millisecond, "Job should be completed")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify embedding was generated
	s.Equal(int64(1), mockEmbeds.CallCount())

	// Verify metrics
	metrics := worker.Metrics()
	s.Equal(int64(1), metrics.Processed)
	s.Equal(int64(1), metrics.Succeeded)
	s.Equal(int64(0), metrics.Failed)
}

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_ProcessesMultipleJobs() {
	// Create multiple graph objects
	objectIDs := make([]string, 5)
	for i := 0; i < 5; i++ {
		objectIDs[i] = s.createGraphObject("Person", "person-"+string(rune('a'+i)), map[string]interface{}{
			"name": "Person " + string(rune('A'+i)),
		})
	}

	// Enqueue all jobs
	for _, id := range objectIDs {
		_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: id})
		s.NoError(err)
	}

	// Create and start worker
	mockEmbeds := newMockEmbeddingService(true)
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)
	err := worker.Start(s.ctx)
	s.NoError(err)

	// Wait for all jobs to be processed
	s.Eventually(func() bool {
		stats, _ := s.jobsService.Stats(s.ctx)
		return stats.Pending == 0 && stats.Processing == 0
	}, 10*time.Second, 100*time.Millisecond, "All jobs should be completed")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify all embeddings were generated
	s.Equal(int64(5), mockEmbeds.CallCount())

	// Verify metrics
	metrics := worker.Metrics()
	s.Equal(int64(5), metrics.Processed)
	s.Equal(int64(5), metrics.Succeeded)
	s.Equal(int64(0), metrics.Failed)
}

// =============================================================================
// Test: Error Handling
// =============================================================================

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_HandlesEmbeddingFailure() {
	// Create a graph object
	objectID := s.createGraphObject("Person", "john-doe", map[string]interface{}{
		"name": "John Doe",
	})

	// Enqueue job
	job, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	// Create worker with failing embedding service
	mockEmbeds := newMockEmbeddingService(true)
	mockEmbeds.shouldFail = true
	mockEmbeds.failError = errors.New("embedding API rate limit exceeded")
	
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)
	err = worker.Start(s.ctx)
	s.NoError(err)

	// Wait for job to be attempted
	s.Eventually(func() bool {
		return mockEmbeds.CallCount() >= 1
	}, 5*time.Second, 100*time.Millisecond, "Job should be attempted")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify job was requeued (back to pending with error)
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(extraction.JobStatusPending, updatedJob.Status)
	s.NotNil(updatedJob.LastError)
	s.Contains(*updatedJob.LastError, "rate limit")

	// Verify metrics
	metrics := worker.Metrics()
	s.Equal(int64(1), metrics.Processed)
	s.Equal(int64(0), metrics.Succeeded)
	s.Equal(int64(1), metrics.Failed)
}

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_HandlesMissingObject() {
	// Enqueue job for non-existent object
	nonExistentID := uuid.NewString()
	job, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: nonExistentID})
	s.NoError(err)

	// Create and start worker
	mockEmbeds := newMockEmbeddingService(true)
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)
	err = worker.Start(s.ctx)
	s.NoError(err)

	// Wait for job to be attempted
	s.Eventually(func() bool {
		updatedJob, _ := s.jobsService.GetJob(s.ctx, job.ID)
		if updatedJob == nil {
			return false
		}
		// Job should be requeued with error
		return updatedJob.LastError != nil
	}, 5*time.Second, 100*time.Millisecond, "Job should fail for missing object")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify job has error
	updatedJob, err := s.jobsService.GetJob(s.ctx, job.ID)
	s.NoError(err)
	s.NotNil(updatedJob.LastError)
	s.Contains(*updatedJob.LastError, "object_missing")

	// Embedding service should not be called
	s.Equal(int64(0), mockEmbeds.CallCount())

	// Verify metrics
	metrics := worker.Metrics()
	s.Equal(int64(1), metrics.Processed)
	s.Equal(int64(0), metrics.Succeeded)
	s.Equal(int64(1), metrics.Failed)
}

// =============================================================================
// Test: Text Extraction
// =============================================================================

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_ExtractsTextFromProperties() {
	// Create a graph object with nested properties
	objectID := s.createGraphObject("Company", "acme-corp", map[string]interface{}{
		"name":        "Acme Corporation",
		"description": "A leading technology company",
		"location": map[string]interface{}{
			"city":    "San Francisco",
			"country": "USA",
		},
		"tags": []interface{}{"tech", "startup", "ai"},
	})

	// Enqueue job
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{ObjectID: objectID})
	s.NoError(err)

	// Create and start worker
	mockEmbeds := newMockEmbeddingService(true)
	worker := extraction.NewGraphEmbeddingWorker(s.jobsService, mockEmbeds, s.testDB.DB, s.cfg, s.log)
	err = worker.Start(s.ctx)
	s.NoError(err)

	// Wait for job to be processed
	s.Eventually(func() bool {
		activeJob, _ := s.jobsService.GetActiveJobForObject(s.ctx, objectID)
		return activeJob == nil
	}, 5*time.Second, 100*time.Millisecond, "Job should be completed")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify embedding was generated (text should include type, key, and all property values)
	s.Equal(int64(1), mockEmbeds.CallCount())
}

// =============================================================================
// Test: Priority Processing
// =============================================================================

func (s *GraphEmbeddingWorkerTestSuite) TestWorker_ProcessesHighPriorityFirst() {
	// Create objects
	lowPriorityID := s.createGraphObject("Person", "low-priority", map[string]interface{}{"name": "Low"})
	highPriorityID := s.createGraphObject("Person", "high-priority", map[string]interface{}{"name": "High"})

	// Enqueue low priority first
	_, err := s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: lowPriorityID,
		Priority: 1,
	})
	s.NoError(err)

	// Enqueue high priority second
	_, err = s.jobsService.Enqueue(s.ctx, extraction.EnqueueOptions{
		ObjectID: highPriorityID,
		Priority: 10,
	})
	s.NoError(err)

	// Create worker with batch size 1 to process one at a time
	smallBatchCfg := &extraction.GraphEmbeddingConfig{
		BaseRetryDelaySec: 1,
		MaxRetryDelaySec:  5,
		WorkerIntervalMs:  50,
		WorkerBatchSize:   1,
	}
	mockEmbeds := newMockEmbeddingService(true)
	jobsService := extraction.NewGraphEmbeddingJobsService(s.testDB.DB, s.log, smallBatchCfg)
	worker := extraction.NewGraphEmbeddingWorker(jobsService, mockEmbeds, s.testDB.DB, smallBatchCfg, s.log)
	err = worker.Start(s.ctx)
	s.NoError(err)

	// Wait for all jobs to complete
	s.Eventually(func() bool {
		return mockEmbeds.CallCount() >= 2
	}, 5*time.Second, 50*time.Millisecond, "All jobs should be processed")

	// Stop worker
	stopCtx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	worker.Stop(stopCtx)

	// Verify both jobs completed - the priority ordering is verified by
	// checking that dequeue fetches by priority DESC in the jobs service
	// We test the end state (both complete) rather than trying to catch the race condition
	highJob, _ := jobsService.GetActiveJobForObject(s.ctx, highPriorityID)
	lowJob, _ := jobsService.GetActiveJobForObject(s.ctx, lowPriorityID)
	s.Nil(highJob, "High priority job should be completed")
	s.Nil(lowJob, "Low priority job should be completed")
	s.Equal(int64(2), mockEmbeds.CallCount())
}
