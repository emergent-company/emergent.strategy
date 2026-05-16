package sync_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// mockRepoWriter records all calls for assertion.
type mockRepoWriter struct {
	installationToken string
	defaultBranch     string
	createdBranches   []string
	committedFiles    []syncdom.FileEntry
	createdPRs        []mockPR
}

type mockPR struct {
	owner, repo, head, base, title, body string
}

func (m *mockRepoWriter) GetInstallationToken(_ context.Context, _ string) (string, error) {
	return m.installationToken, nil
}

func (m *mockRepoWriter) GetDefaultBranch(_ context.Context, _, _, _ string) (string, error) {
	return m.defaultBranch, nil
}

func (m *mockRepoWriter) CreateBranch(_ context.Context, _, _, _, _, newBranch string) error {
	m.createdBranches = append(m.createdBranches, newBranch)
	return nil
}

func (m *mockRepoWriter) CommitFiles(_ context.Context, _, _, _, _ string, files []syncdom.FileEntry, _ string) error {
	m.committedFiles = append(m.committedFiles, files...)
	return nil
}

func (m *mockRepoWriter) CreatePullRequest(_ context.Context, _, owner, repo, head, base, title, body string) (*syncdom.PRResult, error) {
	m.createdPRs = append(m.createdPRs, mockPR{owner, repo, head, base, title, body})
	return &syncdom.PRResult{Number: 42, URL: "https://github.com/test/repo/pull/42"}, nil
}

func newCtx() context.Context {
	return audit.ContextWithSource(context.Background(), audit.SourceSystem)
}

func TestSyncToGithub_DraftSync(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)

	mock := &mockRepoWriter{
		installationToken: "ghs_test_token",
		defaultBranch:     "main",
	}
	syncSvc := syncdom.NewService(db, stratSvc, verSvc, mock)

	// Create workspace and instance with github_repo.
	ws, err := wsSvc.CreateWorkspace(ctx, "sync-test-org", nil)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	ghRepo := "test-org/strategy-repo"
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Sync Test Product",
		GithubRepo:  &ghRepo,
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	// Stage and commit a feature.
	batchID, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-001",
		Action:       "create",
		Payload:      map[string]any{"name": "Test Feature", "status": "draft"},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	// Draft sync.
	result, err := syncSvc.SyncToGithub(ctx, syncdom.SyncParams{
		InstanceID: inst.ID,
	})
	if err != nil {
		t.Fatalf("SyncToGithub: %v", err)
	}

	if result.Status != "pr_created" {
		t.Errorf("status=%q, want pr_created", result.Status)
	}
	if result.PRNumber == nil || *result.PRNumber != 42 {
		t.Error("expected PR number 42")
	}
	if result.ArtifactCount != 1 {
		t.Errorf("artifact_count=%d, want 1", result.ArtifactCount)
	}

	// Verify mock was called correctly.
	if len(mock.createdBranches) != 1 {
		t.Fatalf("expected 1 branch created, got %d", len(mock.createdBranches))
	}
	t.Logf("branch: %s", mock.createdBranches[0])

	if len(mock.committedFiles) != 1 {
		t.Fatalf("expected 1 file committed, got %d", len(mock.committedFiles))
	}
	t.Logf("file: %s", mock.committedFiles[0].Path)

	if len(mock.createdPRs) != 1 {
		t.Fatalf("expected 1 PR created, got %d", len(mock.createdPRs))
	}

	// Verify sync history.
	logs, err := syncSvc.GetSyncHistory(ctx, inst.ID)
	if err != nil {
		t.Fatalf("GetSyncHistory: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("expected 1 sync log, got %d", len(logs))
	}
	if logs[0].Status != "pr_created" {
		t.Errorf("log status=%q, want pr_created", logs[0].Status)
	}
}

func TestSyncToGithub_NoGithubRepo(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)

	mock := &mockRepoWriter{installationToken: "ghs_test", defaultBranch: "main"}
	syncSvc := syncdom.NewService(db, stratSvc, verSvc, mock)

	ws, _ := wsSvc.CreateWorkspace(ctx, "no-repo-org", nil)
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "No Repo Instance",
		// No GithubRepo set
	})

	_, err := syncSvc.SyncToGithub(ctx, syncdom.SyncParams{InstanceID: inst.ID})
	if err == nil {
		t.Fatal("expected error when github_repo is not set")
	}
	t.Logf("got expected error: %v", err)
}

func TestSyncToGithub_NotConfigured(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)

	// No writer = not configured.
	syncSvc := syncdom.NewService(db, stratSvc, verSvc, nil)

	_, err := syncSvc.SyncToGithub(ctx, syncdom.SyncParams{InstanceID: uuid.New()})
	if err == nil {
		t.Fatal("expected error when GitHub App is not configured")
	}
	t.Logf("got expected error: %v", err)
}

func TestGetSyncHistory_Empty(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	syncSvc := syncdom.NewService(db, stratSvc, verSvc, nil)

	logs, err := syncSvc.GetSyncHistory(ctx, uuid.New())
	if err != nil {
		t.Fatalf("GetSyncHistory: %v", err)
	}
	if len(logs) != 0 {
		t.Errorf("expected 0 logs, got %d", len(logs))
	}
}
