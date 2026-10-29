package mcpserver_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

func markedSvc(t *testing.T) (mcpserver.Services, *changemarktest.Recorder) {
	t.Helper()
	svc := buildSvc(t)
	marker, rec := changemarktest.New(svc.Strategy.DB())
	svc.Strategy.WithChangeMarker(marker)
	svc.Workspace.WithChangeMarker(marker)
	svc.Instance.WithChangeMarker(marker)
	return svc, rec
}

// A scaffolded instance used to have mutations but no strategy_artifacts rows,
// so the Memory graph had nothing to ingest for it.
func TestScaffoldInstance_DerivesTheIndexAndMarksTheInstance(t *testing.T) {
	svc, rec := markedSvc(t)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	ws, _ := seedInstance(t, svc, "scaffold-owner", map[string]any{"north_star": map[string]any{"vision": "x"}})
	c := newMCPClient(t, svc)

	var out struct {
		Instance struct {
			ID uuid.UUID `json:"id"`
		} `json:"instance"`
		Seeded []string `json:"seeded"`
	}
	c.call(1, "scaffold_instance", map[string]any{"workspace_id": ws.String(), "name": "Scaffolded"}).
		assertOK().decode(&out)
	if len(out.Seeded) == 0 {
		t.Skip("no templates available in this build")
	}

	var artifacts int
	if err := svc.Strategy.DB().NewRaw("SELECT count(*) FROM strategy_artifacts WHERE instance_id = ?", out.Instance.ID).
		Scan(ctx, &artifacts); err != nil {
		t.Fatal(err)
	}
	if artifacts != len(out.Seeded) {
		t.Errorf("strategy_artifacts rows = %d, want %d (one per seeded template)", artifacts, len(out.Seeded))
	}
	if st := changemarktest.Load(t, svc.Strategy.DB(), out.Instance.ID); st.Dirty == nil || rec.Count(out.Instance.ID) == 0 {
		t.Errorf("scaffolded instance must be marked for ingest: %+v", st)
	}
}

func TestDeleteInstanceTool_SaysTheGraphIsPurgedAsynchronously(t *testing.T) {
	svc, rec := markedSvc(t)
	_, inst := seedInstance(t, svc, "del-owner", map[string]any{"north_star": map[string]any{"vision": "x"}})
	c := newMCPClient(t, svc)

	r := c.call(1, "delete_instance", map[string]any{"instance_id": inst.String()}).assertOK()
	r.contains(`"deleted":true`)
	if rec.Count(inst) == 0 {
		t.Error("deleting through the tool must notify the ingest service")
	}
}
