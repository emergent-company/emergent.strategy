package sync_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func seedTestOrg(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	orgID := uuid.New()
	_, err := db.ExecContext(context.Background(),
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Test Org", "test-org-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return orgID
}

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
	orgID := seedTestOrg(t, db)
	ws, err := wsSvc.CreateWorkspace(ctx, "sync-test-org", nil, orgID)
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

	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "no-repo-org", nil, orgID)
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

// ---------------------------------------------------------------------------
// Import from GitHub tests
// ---------------------------------------------------------------------------

// mockRepoReader is a controllable RepoReader for testing.
type mockRepoReader struct {
	installationToken string
	defaultBranch     string
	headCommitSHA     string
	files             map[string][]byte // path -> content
	getTokenErr       error
	listFilesErr      error
	getFileContentErr error
	getPRStateResult  string
}

func (m *mockRepoReader) GetInstallationToken(_ context.Context, _ string) (string, error) {
	if m.getTokenErr != nil {
		return "", m.getTokenErr
	}
	return m.installationToken, nil
}

func (m *mockRepoReader) GetDefaultBranch(_ context.Context, _, _, _ string) (string, error) {
	return m.defaultBranch, nil
}

func (m *mockRepoReader) GetHeadCommitSHA(_ context.Context, _, _, _, _ string) (string, error) {
	return m.headCommitSHA, nil
}

func (m *mockRepoReader) GetHeadCommitInfo(_ context.Context, _, _, _, _ string) (string, time.Time, error) {
	return m.headCommitSHA, time.Time{}, nil
}

func (m *mockRepoReader) ListFiles(_ context.Context, _, _, _, _, _ string) ([]string, error) {
	if m.listFilesErr != nil {
		return nil, m.listFilesErr
	}
	paths := make([]string, 0, len(m.files))
	for p := range m.files {
		paths = append(paths, p)
	}
	return paths, nil
}

func (m *mockRepoReader) GetFileContent(_ context.Context, _, _, _, _, path string) ([]byte, error) {
	if m.getFileContentErr != nil {
		return nil, m.getFileContentErr
	}
	content, ok := m.files[path]
	if !ok {
		return nil, errors.New("file not found: " + path)
	}
	return content, nil
}

func (m *mockRepoReader) GetAllFileContents(_ context.Context, _, _, _, _, _ string) (map[string][]byte, error) {
	if m.listFilesErr != nil {
		return nil, m.listFilesErr
	}
	if m.getFileContentErr != nil {
		return nil, m.getFileContentErr
	}
	out := make(map[string][]byte, len(m.files))
	for k, v := range m.files {
		out[k] = v
	}
	return out, nil
}

func (m *mockRepoReader) GetPullRequestState(_ context.Context, _, _, _ string, _ int) (string, error) {
	if m.getPRStateResult != "" {
		return m.getPRStateResult, nil
	}
	return "open", nil
}

func (m *mockRepoReader) ListInstallations(_ context.Context) ([]syncdom.InstallationInfo, error) {
	return nil, nil
}

func (m *mockRepoReader) ListUserInstallations(_ context.Context, _ string) ([]syncdom.InstallationInfo, error) {
	return nil, nil
}

func (m *mockRepoReader) ListUserRepos(_ context.Context, _ string) ([]syncdom.UserRepoInfo, error) {
	return nil, nil
}

func (m *mockRepoReader) DetectEPFInRepo(_ context.Context, _, _, _, _ string) ([]syncdom.DetectedEPFInstance, []syncdom.SubmoduleRef, bool, syncdom.RepoCommitInfo, error) {
	return nil, nil, false, syncdom.RepoCommitInfo{}, nil
}

// mockInstanceReimporter records calls to ReimportArtifacts.
type mockInstanceReimporter struct {
	reimportedPayloads map[string]any
}

func (m *mockInstanceReimporter) ReimportArtifacts(_ context.Context, _ uuid.UUID, payloads map[string]any) error {
	m.reimportedPayloads = payloads
	return nil
}

// northStarYAML is a minimal valid north_star YAML for test purposes.
const northStarYAML = `north_star:
  organization: Test Corp
  vision_statement: Test vision
  mission: Test mission
`

func newTestSyncService(t *testing.T, db *bun.DB) (*syncdom.Service, *mockRepoWriter, *mockRepoReader, *mockInstanceReimporter) {
	t.Helper()
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	writer := &mockRepoWriter{installationToken: "ghs_write_token", defaultBranch: "main"}
	reader := &mockRepoReader{
		installationToken: "ghs_read_token",
		defaultBranch:     "main",
		headCommitSHA:     "remote123abc456",
		files:             map[string][]byte{"READY/north_star.yaml": []byte(northStarYAML)},
	}
	reimporter := &mockInstanceReimporter{}

	svc := syncdom.NewService(db, stratSvc, verSvc, writer)
	svc.WithReader(reader)
	svc.WithInstanceReimporter(reimporter)
	return svc, writer, reader, reimporter
}

func TestDetermineSyncState_Unlinked(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, reader, reimporter := newTestSyncService(t, db)
	_ = reimporter

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "unlinked-org", nil, orgID)
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Unlinked Instance",
		// No GithubRepo
	})

	result, err := svc.DetermineSyncState(ctx, inst.ID, "")
	if err != nil {
		t.Fatalf("DetermineSyncState: %v", err)
	}
	if result.State != syncdom.SyncStateUnlinked {
		t.Errorf("state=%q, want unlinked", result.State)
	}
	_ = reader
}

func TestDetermineSyncState_GithubAhead_NeverSynced(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, _, _ := newTestSyncService(t, db)

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "github-ahead-org", nil, orgID)
	repo := "test-org/strategy"
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "GitHub Ahead",
		GithubRepo:  &repo,
	})

	result, err := svc.DetermineSyncState(ctx, inst.ID, "")
	if err != nil {
		t.Fatalf("DetermineSyncState: %v", err)
	}
	// Never synced, no local changes → github_ahead (safe to import).
	if result.State != syncdom.SyncStateGithubAhead {
		t.Errorf("state=%q, want github_ahead", result.State)
	}
	if result.RemoteSHA == "" {
		t.Error("expected RemoteSHA to be set")
	}
}

func TestImportFromGithub_Success(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, reader, reimporter := newTestSyncService(t, db)
	reader.headCommitSHA = "abc123def456"

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "import-success-org", nil, orgID)
	repo := "test-org/strategy"
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Import Success",
		GithubRepo:  &repo,
	})

	result, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID})
	if err != nil {
		t.Fatalf("ImportFromGithub: %v", err)
	}
	if result.Status != "imported" {
		t.Errorf("status=%q, want imported", result.Status)
	}
	if result.TargetBranch != "main" {
		t.Errorf("target_branch=%q, want main", result.TargetBranch)
	}
	if reimporter.reimportedPayloads == nil {
		t.Error("expected ReimportArtifacts to be called")
	}
	// north_star artifact should be in the payloads.
	if _, ok := reimporter.reimportedPayloads["north_star"]; !ok {
		t.Errorf("expected north_star in payloads, got keys: %v", keyNames(reimporter.reimportedPayloads))
	}
}

func TestImportFromGithub_ServerAhead(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, reader, _ := newTestSyncService(t, db)
	// Set the reader's remote SHA to match the local SHA we'll plant on the instance.
	reader.headCommitSHA = "same123"

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "server-ahead-org", nil, orgID)
	repo := "test-org/strategy"
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Server Ahead",
		GithubRepo:  &repo,
	})

	// Plant a commit SHA on the instance to simulate "same commit as remote".
	_, _ = db.ExecContext(ctx,
		"UPDATE strategy_instances SET github_commit_sha = ? WHERE id = ?",
		"same123", inst.ID)

	// Plant a staged (pending) mutation to simulate local changes.
	_, _ = db.ExecContext(ctx,
		`INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source, created_at)
		 VALUES (gen_random_uuid(), ?, 'feature', 'fd-staged', 'create', '{}', 'staged', 'mcp', NOW())`,
		inst.ID)

	result, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID})
	if err != nil {
		t.Fatalf("ImportFromGithub: %v", err)
	}
	if result.Status != "server_ahead" {
		t.Errorf("status=%q, want server_ahead", result.Status)
	}
	if result.Recommendation == "" {
		t.Error("expected Recommendation to be set")
	}
}

func TestImportFromGithub_AlreadyInSync(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, reader, _ := newTestSyncService(t, db)
	reader.headCommitSHA = "synced123"

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "in-sync-org", nil, orgID)
	repo := "test-org/strategy"
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "In Sync",
		GithubRepo:  &repo,
	})

	// Same SHA as remote, no pending mutations → in_sync.
	_, _ = db.ExecContext(ctx,
		"UPDATE strategy_instances SET github_commit_sha = ? WHERE id = ?",
		"synced123", inst.ID)

	result, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID})
	if err != nil {
		t.Fatalf("ImportFromGithub: %v", err)
	}
	if result.Status != "already_in_sync" {
		t.Errorf("status=%q, want already_in_sync", result.Status)
	}
}

func TestImportFromGithub_NoGithubApp(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	// No writer, no reader.
	svc := syncdom.NewService(db, stratSvc, verSvc, nil)

	_, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: uuid.New()})
	if err == nil {
		t.Fatal("expected error when GitHub App is not configured")
	}
}

func TestImportFromGithub_BranchSpecified(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, reader, reimporter := newTestSyncService(t, db)
	reader.headCommitSHA = "devbranch123"

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	orgID := seedTestOrg(t, db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "branch-import-org", nil, orgID)
	repo := "test-org/strategy"
	inst, _ := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Branch Import",
		GithubRepo:  &repo,
	})

	result, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{
		InstanceID: inst.ID,
		Branch:     "dev",
	})
	if err != nil {
		t.Fatalf("ImportFromGithub with branch: %v", err)
	}
	if result.Status != "imported" {
		t.Errorf("status=%q, want imported", result.Status)
	}
	if result.TargetBranch != "dev" {
		t.Errorf("target_branch=%q, want dev", result.TargetBranch)
	}

	// Verify github_branch was stored on the instance.
	var storedBranch *string
	_ = db.NewSelect().
		TableExpr("strategy_instances").
		ColumnExpr("github_branch").
		Where("id = ?", inst.ID).
		Scan(ctx, &storedBranch)
	if storedBranch == nil || *storedBranch != "dev" {
		t.Errorf("github_branch=%v, want 'dev'", storedBranch)
	}
	_ = reimporter
}

func TestImportFromGithub_NotConfigured(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	// Sync service with reader but no RepoReader wired — DetermineSyncState will fail.
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	svc := syncdom.NewService(db, stratSvc, verSvc, nil)
	// reader = nil by default

	_, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: uuid.New()})
	if err == nil {
		t.Fatal("expected error when not configured")
	}
}

// keyNames returns the keys of a map for error messages.
func keyNames(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// ---------------------------------------------------------------------------
// ScanInstallationRepos tests
// ---------------------------------------------------------------------------

// scanMockReader extends mockRepoReader with discovery method implementations.
type scanMockReader struct {
	mockRepoReader
	installations  []syncdom.InstallationInfo
	repos          []syncdom.RepoInfo
	detectedByRepo map[string][]syncdom.DetectedEPFInstance
	detectCalls    int
}

func (m *scanMockReader) ListInstallations(_ context.Context) ([]syncdom.InstallationInfo, error) {
	return m.installations, nil
}

func (m *scanMockReader) ListUserInstallations(_ context.Context, _ string) ([]syncdom.InstallationInfo, error) {
	return m.installations, nil
}

func (m *scanMockReader) ListUserRepos(_ context.Context, _ string) ([]syncdom.UserRepoInfo, error) {
	out := make([]syncdom.UserRepoInfo, len(m.repos))
	for i, r := range m.repos {
		out[i] = syncdom.UserRepoInfo{
			Name: r.Name, FullName: r.FullName, Owner: "owner",
			HTMLURL: r.HTMLURL, DefaultBranch: r.DefaultBranch, Private: r.Private,
		}
	}
	return out, nil
}

func (m *mockRepoReader) ListInstallationRepos(_ context.Context, _ string) ([]syncdom.RepoInfo, error) {
	return nil, nil
}

func (m *scanMockReader) ListInstallationRepos(_ context.Context, _ string) ([]syncdom.RepoInfo, error) {
	return m.repos, nil
}

func (m *scanMockReader) DetectEPFInRepo(_ context.Context, _, _, repo, _ string) ([]syncdom.DetectedEPFInstance, []syncdom.SubmoduleRef, bool, syncdom.RepoCommitInfo, error) {
	m.detectCalls++
	if instances, ok := m.detectedByRepo[repo]; ok {
		return instances, nil, false, syncdom.RepoCommitInfo{}, nil
	}
	return nil, nil, false, syncdom.RepoCommitInfo{}, nil
}

func newScanTestService(t *testing.T, db *bun.DB) (*syncdom.Service, *scanMockReader) {
	t.Helper()
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	reader := &scanMockReader{
		mockRepoReader: mockRepoReader{
			installationToken: "ghs_scan_token",
			defaultBranch:     "main",
		},
	}
	svc := syncdom.NewService(db, stratSvc, verSvc, nil)
	svc.WithReader(reader)
	return svc, reader
}

func TestScanInstallationRepos_Basic(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, reader := newScanTestService(t, db)

	reader.repos = []syncdom.RepoInfo{
		{Name: "strategy", FullName: "acme/strategy", DefaultBranch: "main"},
		{Name: "api", FullName: "acme/api", DefaultBranch: "main"},
		{Name: "mono", FullName: "acme/mono", DefaultBranch: "main"},
	}
	reader.detectedByRepo = map[string][]syncdom.DetectedEPFInstance{
		"strategy": {{BasePath: "", HasMetaFile: true}},
		"mono":     {{BasePath: "docs/strategy", HasMetaFile: false}},
		// "api" returns nothing
	}

	results, err := svc.ScanInstallationRepos(ctx, "acme")
	if err != nil {
		t.Fatalf("ScanInstallationRepos: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("want 3 results, got %d", len(results))
	}

	byName := make(map[string]syncdom.RepoScanResult, 3)
	for _, r := range results {
		byName[r.Name] = r
	}

	if !byName["strategy"].HasEPF {
		t.Error("strategy should have EPF")
	}
	if byName["strategy"].DetectedInstances[0].BasePath != "" {
		t.Errorf("strategy BasePath=%q, want empty", byName["strategy"].DetectedInstances[0].BasePath)
	}
	if byName["api"].HasEPF {
		t.Error("api should not have EPF")
	}
	if !byName["mono"].HasEPF {
		t.Error("mono should have EPF")
	}
	if byName["mono"].DetectedInstances[0].BasePath != "docs/strategy" {
		t.Errorf("mono BasePath=%q, want docs/strategy", byName["mono"].DetectedInstances[0].BasePath)
	}
	// All 3 repos were scanned concurrently.
	if reader.detectCalls != 3 {
		t.Errorf("detectCalls=%d, want 3", reader.detectCalls)
	}
}

func TestScanInstallationRepos_CacheHit(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, reader := newScanTestService(t, db)
	reader.repos = []syncdom.RepoInfo{
		{Name: "repo1", FullName: "owner/repo1", DefaultBranch: "main"},
	}
	reader.detectedByRepo = map[string][]syncdom.DetectedEPFInstance{}

	// First call populates the cache.
	_, err := svc.ScanInstallationRepos(ctx, "owner")
	if err != nil {
		t.Fatalf("first ScanInstallationRepos: %v", err)
	}
	callsAfterFirst := reader.detectCalls

	// Second call within TTL should use cache.
	_, err = svc.ScanInstallationRepos(ctx, "owner")
	if err != nil {
		t.Fatalf("second ScanInstallationRepos: %v", err)
	}
	if reader.detectCalls != callsAfterFirst {
		t.Errorf("detectCalls increased on cache hit: was %d, now %d", callsAfterFirst, reader.detectCalls)
	}
}

func TestListInstallations_NotConfigured(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	// No reader wired — simulates unconfigured App.
	stratSvc := strategy.NewService(db)
	verSvc := versiondom.NewService(db)
	svc := syncdom.NewService(db, stratSvc, verSvc, nil)

	_, err := svc.ListInstallations(ctx)
	if err == nil {
		t.Fatal("expected error when GitHub App not configured")
	}
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


