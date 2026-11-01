package sync_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// ingestNow ingests an instance inside the notification, so the ingest runs at
// the exact point a worker could pick it up: the moment the writer says the
// instance changed.
type ingestNow struct{ svc *ingest.Service }

func (n ingestNow) InstanceChanged(ctx context.Context, id uuid.UUID) {
	_ = n.svc.ReingestInstance(ctx, id)
}

// A GitHub import used to wipe the instance's artifacts, notify, and only then
// refill them. An ingest that ran in between projected an empty instance and
// removed the whole graph, which it then had to rebuild: every import left a
// window in which search returned nothing, and re-embedded everything.
func TestImportFromGithub_ReimportOfUnchangedContentNeverEmptiesTheGraph(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()
	mem := memtest.New(t)

	ingestSvc := ingest.NewService(db, mem.Client(t))
	marker := changemark.New(db)
	marker.SetNotifier(ingestNow{ingestSvc})
	instSvc := instance.NewService(db).WithChangeMarker(marker)
	stratSvc := strategy.NewService(db).WithChangeMarker(marker)

	reader := &mockRepoReader{
		installationToken: "ghs_read_token",
		defaultBranch:     "main",
		headCommitSHA:     "sha-1",
		files:             map[string][]byte{"READY/north_star.yaml": []byte(northStarYAML)},
	}
	writer := &mockRepoWriter{installationToken: "ghs_write_token", defaultBranch: "main"}
	svc := syncdom.NewService(db, stratSvc, versiondom.NewService(db), writer)
	svc.WithReader(reader)
	svc.WithInstanceReimporter(instSvc)

	orgID := seedTestOrg(t, db)
	ws, err := workspace.NewService(db).CreateWorkspace(ctx, "reimport-"+uuid.NewString()[:8], nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	repo := "acme/strategy"
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: ws.ID, Name: "Acme", GithubRepo: &repo})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID}); err != nil {
		t.Fatalf("first import: %v", err)
	}
	before := len(mem.Objects())
	if before == 0 {
		t.Fatal("setup: the first import produced no graph")
	}
	deletesBefore := mem.Count("DELETE", "/api/graph")

	// The same files at a new commit: GitHub is ahead, the content is identical.
	reader.headCommitSHA = "sha-2"
	res, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID})
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if res.Status != "imported" {
		t.Fatalf("setup: second import status = %q, want imported", res.Status)
	}

	if got := mem.Count("DELETE", "/api/graph") - deletesBefore; got != 0 {
		t.Errorf("the re-import deleted %d graph objects or relationships; unchanged content must delete none", got)
	}
	if after := len(mem.Objects()); after != before {
		t.Errorf("graph holds %d objects after the re-import, %d before", after, before)
	}
}
