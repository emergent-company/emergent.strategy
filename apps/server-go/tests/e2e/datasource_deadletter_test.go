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

	"github.com/emergent/emergent-core/domain/datasource"
	"github.com/emergent/emergent-core/internal/config"
	"github.com/emergent/emergent-core/internal/testutil"
)

// DataSourceDeadLetterTestSuite tests the dead letter queue functionality for data source sync jobs
type DataSourceDeadLetterTestSuite struct {
	suite.Suite
	testDB      *testutil.TestDB
	ctx         context.Context
	jobsService *datasource.JobsService
	log         *slog.Logger

	// Test fixtures
	projectID     string
	integrationID string
	orgID         string
}

func TestDataSourceDeadLetterSuite(t *testing.T) {
	suite.Run(t, new(DataSourceDeadLetterTestSuite))
}

func (s *DataSourceDeadLetterTestSuite) SetupSuite() {
	s.ctx = context.Background()
	s.log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "ds_deadletter")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create the jobs service
	cfg := &config.Config{}
	s.jobsService = datasource.NewJobsService(testDB.DB, s.log, cfg)

	// Create test fixtures - org and project required for foreign keys
	s.projectID = uuid.NewString()
	s.integrationID = uuid.NewString()
	s.orgID = uuid.NewString()

	// Create organization using testutil helper
	err = testutil.CreateTestOrganization(s.ctx, testDB.DB, s.orgID, "Test Org")
	s.Require().NoError(err)

	// Create project using testutil helper
	err = testutil.CreateTestProject(s.ctx, testDB.DB, testutil.TestProject{
		ID:    s.projectID,
		OrgID: s.orgID,
		Name:  "Test Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create integration (note: data_source_integrations doesn't have organization_id, only project_id)
	_, err = testDB.DB.NewRaw(`
		INSERT INTO kb.data_source_integrations (id, project_id, name, provider_type, source_type)
		VALUES (?, ?, 'Test Integration', 'clickup', 'clickup-document')
	`, s.integrationID, s.projectID).Exec(s.ctx)
	s.Require().NoError(err)
}

func (s *DataSourceDeadLetterTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *DataSourceDeadLetterTestSuite) SetupTest() {
	// Truncate sync jobs table before each test
	_, err := s.testDB.DB.NewRaw("TRUNCATE TABLE kb.data_source_sync_jobs CASCADE").Exec(s.ctx)
	s.Require().NoError(err)
}

// =============================================================================
// Helper: Create a test job
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) createTestJob(status datasource.JobStatus) *datasource.DataSourceSyncJob {
	job := &datasource.DataSourceSyncJob{
		ID:            uuid.NewString(),
		IntegrationID: s.integrationID,
		ProjectID:     s.projectID,
		Status:        status,
		TriggerType:   datasource.TriggerTypeManual,
	}
	err := s.jobsService.Create(s.ctx, job)
	s.Require().NoError(err)
	return job
}

// testError is a simple error type for testing
type dsTestError struct {
	msg string
}

func (e *dsTestError) Error() string {
	return e.msg
}

// =============================================================================
// Test: MarkFailedWithRetry
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestMarkFailedWithRetry_RetriesWhenUnderMaxRetries() {
	job := s.createTestJob(datasource.JobStatusRunning)

	// First failure (retryCount=0, maxRetries=3)
	willRetry, err := s.jobsService.MarkFailedWithRetry(s.ctx, job.ID, errors.New("connection failed"), 0, 3)

	s.NoError(err)
	s.True(willRetry, "Should schedule retry when under max retries")

	// Verify job is back to pending with retry scheduled
	updated, err := s.jobsService.GetByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(datasource.JobStatusPending, updated.Status)
	s.Equal(1, updated.RetryCount)
	s.NotNil(updated.NextRetryAt)
	s.True(updated.NextRetryAt.After(time.Now()), "NextRetryAt should be in the future")
}

func (s *DataSourceDeadLetterTestSuite) TestMarkFailedWithRetry_MovesToDeadLetterAfterMaxRetries() {
	job := s.createTestJob(datasource.JobStatusRunning)

	// Final failure (retryCount=3, maxRetries=3) - at max retries
	willRetry, err := s.jobsService.MarkFailedWithRetry(s.ctx, job.ID, errors.New("permanent failure"), 3, 3)

	s.NoError(err)
	s.False(willRetry, "Should NOT schedule retry when at max retries")

	// Verify job is in dead letter
	updated, err := s.jobsService.GetByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(datasource.JobStatusDeadLetter, updated.Status)
	s.Equal(3, updated.RetryCount)
	s.NotNil(updated.ErrorMessage)
	s.Contains(*updated.ErrorMessage, "permanent failure")
}

func (s *DataSourceDeadLetterTestSuite) TestMarkFailedWithRetry_ExponentialBackoff() {
	// Test backoff increases: 1min, 2min, 4min
	testCases := []struct {
		retryCount      int
		expectedMinutes int
	}{
		{0, 1},  // 2^0 = 1 minute
		{1, 2},  // 2^1 = 2 minutes
		{2, 4},  // 2^2 = 4 minutes
		{3, 8},  // 2^3 = 8 minutes
		{4, 16}, // 2^4 = 16 minutes
	}

	for _, tc := range testCases {
		job := s.createTestJob(datasource.JobStatusRunning)

		willRetry, err := s.jobsService.MarkFailedWithRetry(s.ctx, job.ID, errors.New("error"), tc.retryCount, 10)
		s.NoError(err)
		s.True(willRetry)

		updated, err := s.jobsService.GetByID(s.ctx, job.ID)
		s.NoError(err)

		// Check backoff is approximately correct (within 2 seconds tolerance for test timing)
		expectedTime := time.Now().Add(time.Duration(tc.expectedMinutes) * time.Minute)
		s.InDelta(expectedTime.Unix(), updated.NextRetryAt.Unix(), 2.0,
			"Retry %d should have ~%d minute backoff", tc.retryCount, tc.expectedMinutes)
	}
}

// =============================================================================
// Test: ListDeadLetterJobs
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestListDeadLetterJobs_ReturnsDeadLetterJobs() {
	// Create jobs in various states
	s.createTestJob(datasource.JobStatusPending)
	s.createTestJob(datasource.JobStatusRunning)
	s.createTestJob(datasource.JobStatusCompleted)

	// Create dead letter jobs
	dl1 := s.createTestJob(datasource.JobStatusDeadLetter)
	dl2 := s.createTestJob(datasource.JobStatusDeadLetter)

	jobs, count, err := s.jobsService.ListDeadLetterJobs(s.ctx, "", 10, 0)

	s.NoError(err)
	s.Equal(2, count)
	s.Len(jobs, 2)

	// Verify only dead letter jobs returned
	ids := []string{jobs[0].ID, jobs[1].ID}
	s.Contains(ids, dl1.ID)
	s.Contains(ids, dl2.ID)
}

func (s *DataSourceDeadLetterTestSuite) TestListDeadLetterJobs_FiltersByProjectID() {
	// Create dead letter job for our project
	s.createTestJob(datasource.JobStatusDeadLetter)

	// Create another project and integration
	otherProjectID := uuid.NewString()
	otherIntegrationID := uuid.NewString()
	otherOrgID := uuid.NewString()

	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, otherOrgID, "Other Org")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: otherOrgID,
		Name:  "Other Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.data_source_integrations (id, project_id, name, provider_type, source_type)
		VALUES (?, ?, 'Other Integration', 'clickup', 'clickup-document')
	`, otherIntegrationID, otherProjectID).Exec(s.ctx)
	s.Require().NoError(err)

	// Create dead letter job for other project
	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.data_source_sync_jobs (id, integration_id, project_id, status, trigger_type)
		VALUES (?, ?, ?, 'dead_letter', 'manual')
	`, uuid.NewString(), otherIntegrationID, otherProjectID).Exec(s.ctx)
	s.Require().NoError(err)

	// Filter by our project - should only get 1
	jobs, count, err := s.jobsService.ListDeadLetterJobs(s.ctx, s.projectID, 10, 0)

	s.NoError(err)
	s.Equal(1, count)
	s.Len(jobs, 1)
	s.Equal(s.projectID, jobs[0].ProjectID)
}

func (s *DataSourceDeadLetterTestSuite) TestListDeadLetterJobs_Pagination() {
	// Create 5 dead letter jobs
	for i := 0; i < 5; i++ {
		s.createTestJob(datasource.JobStatusDeadLetter)
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Get first page (2 jobs)
	page1, total, err := s.jobsService.ListDeadLetterJobs(s.ctx, "", 2, 0)
	s.NoError(err)
	s.Equal(5, total)
	s.Len(page1, 2)

	// Get second page (2 jobs)
	page2, _, err := s.jobsService.ListDeadLetterJobs(s.ctx, "", 2, 2)
	s.NoError(err)
	s.Len(page2, 2)

	// Ensure no overlap
	for _, j1 := range page1 {
		for _, j2 := range page2 {
			s.NotEqual(j1.ID, j2.ID)
		}
	}
}

// =============================================================================
// Test: RetryDeadLetterJob
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestRetryDeadLetterJob_MovesToPending() {
	job := s.createTestJob(datasource.JobStatusDeadLetter)

	err := s.jobsService.RetryDeadLetterJob(s.ctx, job.ID)

	s.NoError(err)

	// Verify job is back to pending
	updated, err := s.jobsService.GetByID(s.ctx, job.ID)
	s.NoError(err)
	s.Equal(datasource.JobStatusPending, updated.Status)
	s.Equal(0, updated.RetryCount, "RetryCount should be reset")
	s.Nil(updated.NextRetryAt, "NextRetryAt should be cleared")
	s.Nil(updated.ErrorMessage, "ErrorMessage should be cleared")
}

func (s *DataSourceDeadLetterTestSuite) TestRetryDeadLetterJob_FailsForNonDeadLetter() {
	job := s.createTestJob(datasource.JobStatusFailed) // Not dead_letter

	err := s.jobsService.RetryDeadLetterJob(s.ctx, job.ID)

	s.ErrorIs(err, datasource.ErrJobNotFound)
}

func (s *DataSourceDeadLetterTestSuite) TestRetryDeadLetterJob_FailsForNonexistent() {
	err := s.jobsService.RetryDeadLetterJob(s.ctx, uuid.NewString())

	s.ErrorIs(err, datasource.ErrJobNotFound)
}

// =============================================================================
// Test: DeleteDeadLetterJob
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestDeleteDeadLetterJob_DeletesJob() {
	job := s.createTestJob(datasource.JobStatusDeadLetter)

	err := s.jobsService.DeleteDeadLetterJob(s.ctx, job.ID)

	s.NoError(err)

	// Verify job is deleted
	deleted, err := s.jobsService.GetByID(s.ctx, job.ID)
	s.ErrorIs(err, datasource.ErrJobNotFound)
	s.Nil(deleted)
}

func (s *DataSourceDeadLetterTestSuite) TestDeleteDeadLetterJob_FailsForNonDeadLetter() {
	job := s.createTestJob(datasource.JobStatusPending) // Not dead_letter

	err := s.jobsService.DeleteDeadLetterJob(s.ctx, job.ID)

	s.ErrorIs(err, datasource.ErrJobNotFound)

	// Verify job still exists
	exists, err := s.jobsService.GetByID(s.ctx, job.ID)
	s.NoError(err)
	s.NotNil(exists)
}

// =============================================================================
// Test: PurgeDeadLetterJobs
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestPurgeDeadLetterJobs_DeletesOldJobs() {
	// Create an old dead letter job (update timestamp to 8 days ago)
	oldJob := s.createTestJob(datasource.JobStatusDeadLetter)

	// Disable the trigger that auto-updates updated_at, then update, then re-enable
	_, err := s.testDB.DB.NewRaw(`
		ALTER TABLE kb.data_source_sync_jobs DISABLE TRIGGER trigger_data_source_sync_jobs_updated_at
	`).Exec(s.ctx)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		UPDATE kb.data_source_sync_jobs SET updated_at = now() - interval '8 days' WHERE id = ?
	`, oldJob.ID).Exec(s.ctx)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		ALTER TABLE kb.data_source_sync_jobs ENABLE TRIGGER trigger_data_source_sync_jobs_updated_at
	`).Exec(s.ctx)
	s.Require().NoError(err)

	// Create a recent dead letter job
	recentJob := s.createTestJob(datasource.JobStatusDeadLetter)

	// Purge jobs older than 7 days
	count, err := s.jobsService.PurgeDeadLetterJobs(s.ctx, 7*24*time.Hour)

	s.NoError(err)
	s.Equal(1, count)

	// Verify old job is deleted
	_, err = s.jobsService.GetByID(s.ctx, oldJob.ID)
	s.ErrorIs(err, datasource.ErrJobNotFound)

	// Verify recent job still exists
	exists, err := s.jobsService.GetByID(s.ctx, recentJob.ID)
	s.NoError(err)
	s.NotNil(exists)
}

func (s *DataSourceDeadLetterTestSuite) TestPurgeDeadLetterJobs_IgnoresNonDeadLetter() {
	// Create an old non-dead-letter job
	oldJob := s.createTestJob(datasource.JobStatusFailed)

	// Disable the trigger that auto-updates updated_at, then update, then re-enable
	_, err := s.testDB.DB.NewRaw(`
		ALTER TABLE kb.data_source_sync_jobs DISABLE TRIGGER trigger_data_source_sync_jobs_updated_at
	`).Exec(s.ctx)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		UPDATE kb.data_source_sync_jobs SET updated_at = now() - interval '8 days' WHERE id = ?
	`, oldJob.ID).Exec(s.ctx)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		ALTER TABLE kb.data_source_sync_jobs ENABLE TRIGGER trigger_data_source_sync_jobs_updated_at
	`).Exec(s.ctx)
	s.Require().NoError(err)

	// Purge - should not affect the failed job
	count, err := s.jobsService.PurgeDeadLetterJobs(s.ctx, 7*24*time.Hour)

	s.NoError(err)
	s.Equal(0, count)

	// Verify job still exists
	exists, err := s.jobsService.GetByID(s.ctx, oldJob.ID)
	s.NoError(err)
	s.NotNil(exists)
}

// =============================================================================
// Test: GetDeadLetterStats
// =============================================================================

func (s *DataSourceDeadLetterTestSuite) TestGetDeadLetterStats_ReturnsCorrectStats() {
	// Create 3 dead letter jobs
	for i := 0; i < 3; i++ {
		s.createTestJob(datasource.JobStatusDeadLetter)
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Create non-dead-letter jobs (should be ignored)
	s.createTestJob(datasource.JobStatusPending)
	s.createTestJob(datasource.JobStatusFailed)

	stats, err := s.jobsService.GetDeadLetterStats(s.ctx, "")

	s.NoError(err)
	s.Equal(3, stats.TotalCount)
	s.NotNil(stats.OldestJobAt)
}

func (s *DataSourceDeadLetterTestSuite) TestGetDeadLetterStats_EmptyQueue() {
	stats, err := s.jobsService.GetDeadLetterStats(s.ctx, "")

	s.NoError(err)
	s.Equal(0, stats.TotalCount)
	s.Nil(stats.OldestJobAt)
}

func (s *DataSourceDeadLetterTestSuite) TestGetDeadLetterStats_FiltersByProject() {
	// Create dead letter job for our project
	s.createTestJob(datasource.JobStatusDeadLetter)

	// Create another project's dead letter job
	otherProjectID := uuid.NewString()
	otherIntegrationID := uuid.NewString()
	otherOrgID := uuid.NewString()

	err := testutil.CreateTestOrganization(s.ctx, s.testDB.DB, otherOrgID, "Stats Org")
	s.Require().NoError(err)

	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.TestProject{
		ID:    otherProjectID,
		OrgID: otherOrgID,
		Name:  "Stats Project",
	}, testutil.AdminUser.ID)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.data_source_integrations (id, project_id, name, provider_type, source_type)
		VALUES (?, ?, 'Stats Integration', 'clickup', 'clickup-document')
	`, otherIntegrationID, otherProjectID).Exec(s.ctx)
	s.Require().NoError(err)

	_, err = s.testDB.DB.NewRaw(`
		INSERT INTO kb.data_source_sync_jobs (id, integration_id, project_id, status, trigger_type)
		VALUES (?, ?, ?, 'dead_letter', 'manual')
	`, uuid.NewString(), otherIntegrationID, otherProjectID).Exec(s.ctx)
	s.Require().NoError(err)

	// Get stats for our project only
	stats, err := s.jobsService.GetDeadLetterStats(s.ctx, s.projectID)

	s.NoError(err)
	s.Equal(1, stats.TotalCount)
}
