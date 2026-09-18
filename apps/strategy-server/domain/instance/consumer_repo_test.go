package instance_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// mustImport creates an instance with an optional home repo.
func mustImport(t *testing.T, svc *instance.Service, ctx context.Context, wsID uuid.UUID, name string, homeRepo, basePath *string) uuid.UUID {
	t.Helper()
	inst, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:    wsID,
		Name:           name,
		GithubRepo:     homeRepo,
		GithubBasePath: basePath,
	})
	if err != nil {
		t.Fatalf("ImportInstance(%s): %v", name, err)
	}
	return inst.ID
}

// TestFindByRepo_HomeAndConsumerAreBothFoundAndDistinguished is the core of the
// change: a repo can reach an instance either because it owns it or because it
// mounts it, and the caller must be able to tell which.
func TestFindByRepo_HomeAndConsumerAreBothFoundAndDistinguished(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "find-by-repo-org")

	home := "find-by-repo-org/strategy-home"
	instID := mustImport(t, svc, ctx, wsID, "Strategy", &home, nil)

	consumer := "find-by-repo-org/consuming-app"
	if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
		InstanceID: instID,
		GithubRepo: consumer,
		BasePath:   "docs/EPF/_instances/strategy",
	}); err != nil {
		t.Fatalf("RegisterConsumerRepo: %v", err)
	}

	byHome, err := svc.FindByRepo(ctx, home, "")
	if err != nil {
		t.Fatalf("FindByRepo(home): %v", err)
	}
	if len(byHome) != 1 {
		t.Fatalf("FindByRepo(home): got %d matches, want 1", len(byHome))
	}
	if byHome[0].MatchType != instance.RepoMatchHome {
		t.Errorf("home lookup: match_type = %q, want %q", byHome[0].MatchType, instance.RepoMatchHome)
	}
	if byHome[0].Instance.ID != instID {
		t.Errorf("home lookup: got instance %s, want %s", byHome[0].Instance.ID, instID)
	}

	byConsumer, err := svc.FindByRepo(ctx, consumer, "")
	if err != nil {
		t.Fatalf("FindByRepo(consumer): %v", err)
	}
	if len(byConsumer) != 1 {
		t.Fatalf("FindByRepo(consumer): got %d matches, want 1", len(byConsumer))
	}
	if byConsumer[0].MatchType != instance.RepoMatchConsumer {
		t.Errorf("consumer lookup: match_type = %q, want %q — a consuming repo must not be reported as the instance's home, "+
			"because the home repo is what sync imports from and AIM pushes to",
			byConsumer[0].MatchType, instance.RepoMatchConsumer)
	}
	if byConsumer[0].Instance.ID != instID {
		t.Errorf("consumer lookup: got instance %s, want %s", byConsumer[0].Instance.ID, instID)
	}
	if got := byConsumer[0].BasePath; got != "docs/EPF/_instances/strategy" {
		t.Errorf("consumer lookup: base_path = %q, want the registered mount path", got)
	}
}

// TestFindByRepo_RegisteringAConsumerDoesNotTouchTheHomeRepo pins the bug that
// motivated the table: making a repo discoverable must not repoint sync.
func TestFindByRepo_RegisteringAConsumerDoesNotTouchTheHomeRepo(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "home-untouched-org")

	home := "home-untouched-org/epf-source"
	instID := mustImport(t, svc, ctx, wsID, "Strategy", &home, nil)

	if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
		InstanceID: instID,
		GithubRepo: "home-untouched-org/some-consumer",
	}); err != nil {
		t.Fatalf("RegisterConsumerRepo: %v", err)
	}

	inst, err := svc.GetInstance(ctx, instID)
	if err != nil {
		t.Fatalf("GetInstance: %v", err)
	}
	if inst.GithubRepo == nil || *inst.GithubRepo != home {
		t.Fatalf("github_repo = %v, want %q — registering a consumer must never move the instance's home, "+
			"or GitHub sync and AIM auto-push silently retarget", inst.GithubRepo, home)
	}
}

// TestFindByRepo_ReturnsAllMatchesNotJustTheFirst — github_repo has no unique
// constraint and a repo may mount several instances, so the API must not
// silently pick a winner.
func TestFindByRepo_ReturnsAllMatchesNotJustTheFirst(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "multi-mount-org")

	monorepo := "multi-mount-org/monorepo"
	first := mustImport(t, svc, ctx, wsID, "Product A", nil, nil)
	second := mustImport(t, svc, ctx, wsID, "Product B", nil, nil)

	for _, tc := range []struct {
		id   uuid.UUID
		path string
	}{
		{first, "docs/EPF/_instances/a"},
		{second, "docs/EPF/_instances/b"},
	} {
		if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
			InstanceID: tc.id,
			GithubRepo: monorepo,
			BasePath:   tc.path,
		}); err != nil {
			t.Fatalf("RegisterConsumerRepo(%s): %v", tc.path, err)
		}
	}

	all, err := svc.FindByRepo(ctx, monorepo, "")
	if err != nil {
		t.Fatalf("FindByRepo: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("FindByRepo(no base_path): got %d matches, want 2 — an empty base_path means 'any mount point'", len(all))
	}

	narrowed, err := svc.FindByRepo(ctx, monorepo, "docs/EPF/_instances/b")
	if err != nil {
		t.Fatalf("FindByRepo(base_path): %v", err)
	}
	if len(narrowed) != 1 || narrowed[0].Instance.ID != second {
		t.Fatalf("FindByRepo with base_path did not narrow to the single matching mount: got %d matches", len(narrowed))
	}
}

// TestRegisterConsumerRepo_IsIdempotent — clients are expected to call this on
// every startup, so repeated registration must not accumulate rows.
func TestRegisterConsumerRepo_IsIdempotent(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "idempotent-org")
	instID := mustImport(t, svc, ctx, wsID, "Strategy", nil, nil)

	note := "mounted as submodule"
	for i := 0; i < 3; i++ {
		if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
			InstanceID: instID,
			GithubRepo: "idempotent-org/app",
			BasePath:   "docs/epf",
			Note:       &note,
		}); err != nil {
			t.Fatalf("RegisterConsumerRepo call %d: %v", i+1, err)
		}
	}

	rows, err := svc.ListConsumerRepos(ctx, instID)
	if err != nil {
		t.Fatalf("ListConsumerRepos: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d consumer rows after 3 identical registrations, want 1", len(rows))
	}
	if rows[0].Note == nil || *rows[0].Note != note {
		t.Errorf("note not persisted on upsert: %v", rows[0].Note)
	}
}

// TestRegisterConsumerRepo_RejectsMalformedSlug — the value is fed straight to
// the GitHub API by other code paths, so shape is validated at the boundary.
func TestRegisterConsumerRepo_RejectsMalformedSlug(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "slug-validation-org")
	instID := mustImport(t, svc, ctx, wsID, "Strategy", nil, nil)

	for _, bad := range []string{"", "no-slash", "/leading", "trailing/", "too/many/parts"} {
		if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
			InstanceID: instID,
			GithubRepo: bad,
		}); err == nil {
			t.Errorf("RegisterConsumerRepo(%q): expected an error, got nil", bad)
		}
	}
}

// TestUnregisterConsumerRepo_RemovesTheLinkAndIsForgiving — unregistering
// something absent already satisfies the caller's intent.
func TestUnregisterConsumerRepo_RemovesTheLinkAndIsForgiving(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "unregister-org")
	instID := mustImport(t, svc, ctx, wsID, "Strategy", nil, nil)

	repo := "unregister-org/app"
	if _, err := svc.RegisterConsumerRepo(ctx, instance.RegisterConsumerRepoParams{
		InstanceID: instID,
		GithubRepo: repo,
	}); err != nil {
		t.Fatalf("RegisterConsumerRepo: %v", err)
	}

	if err := svc.UnregisterConsumerRepo(ctx, instID, repo, ""); err != nil {
		t.Fatalf("UnregisterConsumerRepo: %v", err)
	}
	matches, err := svc.FindByRepo(ctx, repo, "")
	if err != nil {
		t.Fatalf("FindByRepo: %v", err)
	}
	if len(matches) != 0 {
		t.Errorf("after unregister, FindByRepo still returns %d matches", len(matches))
	}

	if err := svc.UnregisterConsumerRepo(ctx, instID, repo, ""); err != nil {
		t.Errorf("second UnregisterConsumerRepo should be a no-op, got: %v", err)
	}
}

// TestFindByRepo_UnknownRepoIsEmptyNotAnError — "no instance uses this repo" is
// a normal answer for a client probing its own workspace.
func TestFindByRepo_UnknownRepoIsEmptyNotAnError(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()

	matches, err := svc.FindByRepo(ctx, "nobody/nothing", "")
	if err != nil {
		t.Fatalf("FindByRepo: %v", err)
	}
	if len(matches) != 0 {
		t.Errorf("got %d matches for an unknown repo, want 0", len(matches))
	}

	if _, err := svc.FindByRepo(ctx, "  ", ""); err == nil {
		t.Error("FindByRepo with a blank repo slug should be rejected, not treated as a wildcard")
	}
}
