package instance_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestReimportArtifacts_MarksInstanceChanged(t *testing.T) {
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "mark-org")
	inst, err := svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "m"})
	if err != nil {
		t.Fatal(err)
	}
	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, inst.ID)

	if err := svc.ReimportArtifacts(ctx, inst.ID, map[string]any{"north_star": map[string]string{"v": "x"}}); err != nil {
		t.Fatal(err)
	}
	if s := changemarktest.Load(t, db, inst.ID); s.Dirty == nil || s.Seq != 1 || rec.Count(inst.ID) != 1 {
		t.Errorf("ReimportArtifacts must mark and notify once: %+v notified=%d", s, rec.Count(inst.ID))
	}
}
