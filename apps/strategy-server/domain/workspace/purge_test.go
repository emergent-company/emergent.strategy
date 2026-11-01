package workspace_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// Deleting a workspace removes the graph data of every instance in it, through
// the real marker and the real ingest service, and leaves other workspaces'
// instances alone.
func TestDeleteWorkspace_PurgesTheGraphDataOfEachInstance(t *testing.T) {
	db := database.TestDB(t)
	mem := memtest.New(t)
	ing := ingest.NewService(db, mem.Client(t))
	marker := changemark.New(db)
	marker.SetNotifier(ing)
	svc := workspace.NewService(db)
	svc.WithChangeMarker(marker)
	ctx := newCtx()
	orgID := seedTestOrg(t, db)

	doomed, err := svc.CreateWorkspace(ctx, "ws-doomed", nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	safe, err := svc.CreateWorkspace(ctx, "ws-safe", nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	a, b, kept := uuid.New(), uuid.New(), uuid.New()
	for _, r := range []struct{ id, ws uuid.UUID }{{a, doomed.ID}, {b, doomed.ID}, {kept, safe.ID}} {
		if _, err := db.ExecContext(context.Background(),
			"INSERT INTO strategy_instances (id, workspace_id, name, memory_sync_status) VALUES (?, ?, 'i', 'synced')", r.id, r.ws); err != nil {
			t.Fatal(err)
		}
		mem.AddObject(memory.Object{
			Type: "feature", Key: ingest.ScopedKey(r.id, "fd-001_a"),
			Labels:     []string{"layer:artifact", "instance:" + r.id.String()},
			Properties: map[string]any{"instance_id": r.id.String()},
		})
	}
	mem.AddBranch(memory.ScenarioBranchPrefix(a) + "what-if")

	ing.Start(2)
	if err := svc.DeleteWorkspace(ctx, doomed.ID); err != nil {
		t.Fatal(err)
	}
	ing.Stop()

	for _, id := range []uuid.UUID{a, b} {
		if mem.ObjectByKey(ingest.ScopedKey(id, "fd-001_a")) != nil {
			t.Errorf("the graph objects of deleted instance %s are still in Memory", id)
		}
	}
	for _, br := range mem.Branches() {
		if strings.HasPrefix(br.Name, memory.ScenarioBranchPrefix(a)) {
			t.Errorf("scenario branch %s of a deleted instance survived", br.Name)
		}
	}
	if mem.ObjectByKey(ingest.ScopedKey(kept, "fd-001_a")) == nil {
		t.Error("an instance in another workspace lost its graph objects")
	}
}
