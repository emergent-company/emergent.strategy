package e2e

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/scheduler"
	"github.com/emergent/emergent-core/internal/testutil"
)

// SchedulerTestSuite tests the scheduler functionality
type SchedulerTestSuite struct {
	suite.Suite
	testDB    *testutil.TestDB
	ctx       context.Context
	log       *slog.Logger
	orgID     string
	projectID string
}

func TestSchedulerSuite(t *testing.T) {
	suite.Run(t, new(SchedulerTestSuite))
}

func (s *SchedulerTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database
	testDB, err := testutil.SetupTestDB(s.ctx, "scheduler")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB
}

func (s *SchedulerTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *SchedulerTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create an org and project for tests
	s.orgID = uuid.New().String()
	s.projectID = uuid.New().String()

	err = testutil.CreateTestOrganization(s.ctx, s.testDB.DB, s.orgID, "Test Org for Scheduler")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project for Scheduler",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)
}

// =============================================================================
// Test: Scheduler Start/Stop
// =============================================================================

func (s *SchedulerTestSuite) TestScheduler_StartStop() {
	sched := scheduler.NewScheduler(s.log)

	// Initially not running
	s.False(sched.IsRunning(), "scheduler should not be running initially")

	// Start scheduler
	err := sched.Start(s.ctx)
	s.Require().NoError(err)
	s.True(sched.IsRunning(), "scheduler should be running after Start")

	// Stop scheduler
	err = sched.Stop(s.ctx)
	s.Require().NoError(err)
	s.False(sched.IsRunning(), "scheduler should not be running after Stop")
}

func (s *SchedulerTestSuite) TestScheduler_DoubleStart() {
	sched := scheduler.NewScheduler(s.log)

	// Start once
	err := sched.Start(s.ctx)
	s.Require().NoError(err)
	s.True(sched.IsRunning())

	// Start again - should be no-op
	err = sched.Start(s.ctx)
	s.Require().NoError(err)
	s.True(sched.IsRunning())

	// Stop
	err = sched.Stop(s.ctx)
	s.Require().NoError(err)
}

func (s *SchedulerTestSuite) TestScheduler_DoubleStop() {
	sched := scheduler.NewScheduler(s.log)

	// Start
	err := sched.Start(s.ctx)
	s.Require().NoError(err)

	// Stop once
	err = sched.Stop(s.ctx)
	s.Require().NoError(err)
	s.False(sched.IsRunning())

	// Stop again - should be no-op
	err = sched.Stop(s.ctx)
	s.Require().NoError(err)
	s.False(sched.IsRunning())
}

// =============================================================================
// Test: Task Management
// =============================================================================

func (s *SchedulerTestSuite) TestScheduler_AddCronTask() {
	sched := scheduler.NewScheduler(s.log)

	task := func(ctx context.Context) error {
		return nil
	}

	// Add cron task with short interval (every second)
	err := sched.AddCronTask("test-cron", "*/1 * * * * *", task)
	s.Require().NoError(err)

	tasks := sched.ListTasks()
	s.Contains(tasks, "test-cron")
}

func (s *SchedulerTestSuite) TestScheduler_AddIntervalTask() {
	sched := scheduler.NewScheduler(s.log)

	task := func(ctx context.Context) error {
		return nil
	}

	// Add interval task
	err := sched.AddIntervalTask("test-interval", 1*time.Second, task)
	s.Require().NoError(err)

	tasks := sched.ListTasks()
	s.Contains(tasks, "test-interval")
}

func (s *SchedulerTestSuite) TestScheduler_RemoveTask() {
	sched := scheduler.NewScheduler(s.log)

	task := func(ctx context.Context) error {
		return nil
	}

	// Add task
	err := sched.AddIntervalTask("removable", 1*time.Hour, task)
	s.Require().NoError(err)
	s.Contains(sched.ListTasks(), "removable")

	// Remove task
	sched.RemoveTask("removable")
	s.NotContains(sched.ListTasks(), "removable")
}

func (s *SchedulerTestSuite) TestScheduler_GetTaskInfo() {
	sched := scheduler.NewScheduler(s.log)

	task := func(ctx context.Context) error {
		return nil
	}

	// Add a task
	err := sched.AddIntervalTask("info-test", 1*time.Hour, task)
	s.Require().NoError(err)

	// Get task info
	info := sched.GetTaskInfo()
	s.Len(info, 1)
	s.Equal("info-test", info[0].Name)
	// NextRun may or may not be set depending on scheduler state
	// The important thing is we got the task info back
}

func (s *SchedulerTestSuite) TestScheduler_ReplaceTask() {
	sched := scheduler.NewScheduler(s.log)

	task1 := func(ctx context.Context) error {
		return nil
	}
	task2 := func(ctx context.Context) error {
		return nil
	}

	// Add first task
	err := sched.AddIntervalTask("replace-test", 1*time.Hour, task1)
	s.Require().NoError(err)

	// Replace with second task
	err = sched.AddIntervalTask("replace-test", 1*time.Hour, task2)
	s.Require().NoError(err)

	// Should only have one task
	tasks := sched.ListTasks()
	s.Len(tasks, 1)
	s.Contains(tasks, "replace-test")
}

// =============================================================================
// Test: Task Execution
// =============================================================================

func (s *SchedulerTestSuite) TestScheduler_TaskExecution() {
	sched := scheduler.NewScheduler(s.log)

	executed := make(chan bool, 1)
	task := func(ctx context.Context) error {
		select {
		case executed <- true:
		default:
		}
		return nil
	}

	// Add task with 1 second interval
	err := sched.AddIntervalTask("exec-test", 1*time.Second, task)
	s.Require().NoError(err)

	// Start scheduler
	err = sched.Start(s.ctx)
	s.Require().NoError(err)
	defer sched.Stop(s.ctx)

	// Wait for task to execute (give it up to 3 seconds)
	select {
	case <-executed:
		// Success
	case <-time.After(3 * time.Second):
		s.Fail("task did not execute within timeout")
	}
}

// =============================================================================
// Test: Tag Cleanup Task
// =============================================================================

func (s *SchedulerTestSuite) TestTagCleanupTask_Run() {
	// Create a product version for tags (required FK)
	productVersionID := s.createProductVersion()

	// Create a tag that IS referenced by a graph object
	referencedTagName := "referenced-tag-" + uuid.New().String()[:8]
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.tags (project_id, product_version_id, name) VALUES (?, ?, ?)
	`, s.projectID, productVersionID, referencedTagName).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a graph object referencing this tag in properties->tags
	graphObjID := uuid.New().String()
	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.graph_objects (id, project_id, type, canonical_id, properties)
		VALUES (?, ?, 'test', ?, ?::jsonb)
	`, graphObjID, s.projectID, graphObjID, `{"tags": ["`+referencedTagName+`"]}`).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a tag that is NOT referenced
	orphanTagName := "orphan-tag-" + uuid.New().String()[:8]
	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.tags (project_id, product_version_id, name) VALUES (?, ?, ?)
	`, s.projectID, productVersionID, orphanTagName).Exec(s.ctx)
	s.Require().NoError(err)

	// Create the task and run it
	task := scheduler.NewTagCleanupTask(s.testDB.DB, s.log)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Referenced tag should still exist
	var count int
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.tags WHERE name = ?
	`, referencedTagName).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(1, count, "referenced tag should still exist")

	// Orphan tag should be deleted
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.tags WHERE name = ?
	`, orphanTagName).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(0, count, "orphan tag should be deleted")
}

func (s *SchedulerTestSuite) TestTagCleanupTask_NoOrphans() {
	// Create a product version for tags (required FK)
	productVersionID := s.createProductVersion()

	// Create a tag that IS referenced
	tagName := "used-tag-" + uuid.New().String()[:8]
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.tags (project_id, product_version_id, name) VALUES (?, ?, ?)
	`, s.projectID, productVersionID, tagName).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a graph object referencing this tag
	graphObjID := uuid.New().String()
	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.graph_objects (id, project_id, type, canonical_id, properties)
		VALUES (?, ?, 'test', ?, ?::jsonb)
	`, graphObjID, s.projectID, graphObjID, `{"tags": ["`+tagName+`"]}`).Exec(s.ctx)
	s.Require().NoError(err)

	// Run cleanup - should not error even with no orphans
	task := scheduler.NewTagCleanupTask(s.testDB.DB, s.log)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Tag should still exist
	var count int
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.tags WHERE name = ?
	`, tagName).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(1, count)
}

// =============================================================================
// Test: Cache Cleanup Task
// =============================================================================

func (s *SchedulerTestSuite) TestCacheCleanupTask_Run() {
	// Create an expired cache entry
	expiredToken := "expired-token-" + uuid.New().String()[:8]
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.auth_introspection_cache (token_hash, introspection_data, expires_at)
		VALUES (?, '{}', NOW() - INTERVAL '1 hour')
	`, expiredToken).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a valid cache entry
	validToken := "valid-token-" + uuid.New().String()[:8]
	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.auth_introspection_cache (token_hash, introspection_data, expires_at)
		VALUES (?, '{}', NOW() + INTERVAL '1 hour')
	`, validToken).Exec(s.ctx)
	s.Require().NoError(err)

	// Create the task and run it
	task := scheduler.NewCacheCleanupTask(s.testDB.DB, s.log)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Expired entry should be deleted
	var count int
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.auth_introspection_cache WHERE token_hash = ?
	`, expiredToken).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(0, count, "expired cache entry should be deleted")

	// Valid entry should still exist
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.auth_introspection_cache WHERE token_hash = ?
	`, validToken).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(1, count, "valid cache entry should still exist")
}

func (s *SchedulerTestSuite) TestCacheCleanupTask_AllExpired() {
	// Create multiple expired cache entries
	for i := 0; i < 3; i++ {
		token := "expired-" + uuid.New().String()[:8]
		_, err := s.testDB.DB.NewRaw(`
			INSERT INTO kb.auth_introspection_cache (token_hash, introspection_data, expires_at)
			VALUES (?, '{}', NOW() - INTERVAL '1 hour')
		`, token).Exec(s.ctx)
		s.Require().NoError(err)
	}

	// Run cleanup
	task := scheduler.NewCacheCleanupTask(s.testDB.DB, s.log)
	err := task.Run(s.ctx)
	s.Require().NoError(err)

	// All should be deleted
	var count int
	err = s.testDB.DB.NewRaw(`
		SELECT COUNT(*) FROM kb.auth_introspection_cache WHERE expires_at < NOW()
	`).Scan(s.ctx, &count)
	s.Require().NoError(err)
	s.Equal(0, count)
}

// =============================================================================
// Test: Stale Job Cleanup Task
// =============================================================================

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_Run() {
	// Create a test document
	documentID := s.createTestDocument()

	// Create a stale pending job (started 60 minutes ago)
	staleJobID := s.createDocumentParsingJob(documentID, "pending")
	_, err := s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NOW() - INTERVAL '60 minutes',
		    updated_at = NOW() - INTERVAL '60 minutes'
		WHERE id = ?
	`, staleJobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a fresh pending job
	freshJobID := s.createDocumentParsingJob(documentID, "pending")
	_, err = s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NOW() - INTERVAL '5 minutes',
		    updated_at = NOW()
		WHERE id = ?
	`, freshJobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Create the task with 30 minute stale threshold and run it
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 30)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Stale job should be marked as failed
	var staleStatus string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, staleJobID).Scan(s.ctx, &staleStatus)
	s.Require().NoError(err)
	s.Equal("failed", staleStatus, "stale job should be marked as failed")

	// Fresh job should still be pending
	var freshStatus string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, freshJobID).Scan(s.ctx, &freshStatus)
	s.Require().NoError(err)
	s.Equal("pending", freshStatus, "fresh job should still be pending")
}

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_ProcessingJobs() {
	documentID := s.createTestDocument()

	// Create a stale processing job
	jobID := s.createDocumentParsingJob(documentID, "processing")
	_, err := s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NOW() - INTERVAL '60 minutes',
		    updated_at = NOW() - INTERVAL '60 minutes'
		WHERE id = ?
	`, jobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Run cleanup
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 30)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Job should be marked as failed
	var status string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, jobID).Scan(s.ctx, &status)
	s.Require().NoError(err)
	s.Equal("failed", status)
}

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_CompletedJobsNotAffected() {
	documentID := s.createTestDocument()

	// Create a completed job (even if old)
	jobID := s.createDocumentParsingJob(documentID, "completed")
	_, err := s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NOW() - INTERVAL '60 minutes',
		    completed_at = NOW() - INTERVAL '55 minutes',
		    updated_at = NOW() - INTERVAL '55 minutes'
		WHERE id = ?
	`, jobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Run cleanup
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 30)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Job should still be completed
	var status string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, jobID).Scan(s.ctx, &status)
	s.Require().NoError(err)
	s.Equal("completed", status)
}

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_FailedJobsNotAffected() {
	documentID := s.createTestDocument()

	// Create a failed job (even if old)
	jobID := s.createDocumentParsingJob(documentID, "failed")
	_, err := s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NOW() - INTERVAL '60 minutes',
		    updated_at = NOW() - INTERVAL '55 minutes'
		WHERE id = ?
	`, jobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Run cleanup
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 30)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Job should still be failed (not touched)
	var status string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, jobID).Scan(s.ctx, &status)
	s.Require().NoError(err)
	s.Equal("failed", status)
}

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_JobWithNoStartedAt() {
	documentID := s.createTestDocument()

	// Create a job with no started_at but old created_at
	jobID := s.createDocumentParsingJob(documentID, "pending")
	_, err := s.testDB.DB.NewRaw(`
		UPDATE kb.document_parsing_jobs 
		SET started_at = NULL,
		    created_at = NOW() - INTERVAL '60 minutes',
		    updated_at = NOW() - INTERVAL '60 minutes'
		WHERE id = ?
	`, jobID).Exec(s.ctx)
	s.Require().NoError(err)

	// Run cleanup with 30 minute threshold
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 30)
	err = task.Run(s.ctx)
	s.Require().NoError(err)

	// Job should be marked as failed (based on created_at)
	var status string
	err = s.testDB.DB.NewRaw(`
		SELECT status FROM kb.document_parsing_jobs WHERE id = ?
	`, jobID).Scan(s.ctx, &status)
	s.Require().NoError(err)
	s.Equal("failed", status)
}

func (s *SchedulerTestSuite) TestStaleJobCleanupTask_DefaultMinutes() {
	// Create task with 0 minutes - should default to 30
	task := scheduler.NewStaleJobCleanupTask(s.testDB.DB, s.log, 0)
	err := task.Run(s.ctx)
	s.Require().NoError(err) // Should not error
}

// =============================================================================
// Helper methods
// =============================================================================

func (s *SchedulerTestSuite) createTestDocument() string {
	documentID := uuid.New().String()
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.documents (id, project_id, source_type, filename, content, sync_version, created_at, updated_at)
		VALUES (?, ?, 'upload', 'test-document.txt', 'Test content', 1, now(), now())
	`, documentID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
	return documentID
}

func (s *SchedulerTestSuite) createDocumentParsingJob(documentID, status string) string {
	var jobID string
	err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.document_parsing_jobs (organization_id, project_id, document_id, status, source_type, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'upload', NOW(), NOW())
		RETURNING id
	`, s.orgID, s.projectID, documentID, status).Scan(s.ctx, &jobID)
	s.Require().NoError(err)
	return jobID
}

func (s *SchedulerTestSuite) createProductVersion() string {
	productVersionID := uuid.New().String()
	_, err := s.testDB.DB.NewRaw(`
		INSERT INTO kb.product_versions (id, project_id, name)
		VALUES (?, ?, 'Test Product')
	`, productVersionID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
	return productVersionID
}
