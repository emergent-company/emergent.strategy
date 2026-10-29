package workspace_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestDeleteWorkspace_NotifiesEveryDeletedInstanceAndOnlyThose(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	ctx := newCtx()
	orgID := seedTestOrg(t, db)
	ws, err := svc.CreateWorkspace(ctx, "ws-del", nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.CreateWorkspace(ctx, "ws-keep", nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	a, b, kept, alreadyGone := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	for _, r := range []struct {
		id uuid.UUID
		ws uuid.UUID
	}{{a, ws.ID}, {b, ws.ID}, {kept, other.ID}, {alreadyGone, ws.ID}} {
		if _, err := db.ExecContext(context.Background(),
			"INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, 'i')", r.id, r.ws); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(context.Background(),
		"UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", alreadyGone); err != nil {
		t.Fatal(err)
	}
	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)

	if err := svc.DeleteWorkspace(ctx, ws.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []uuid.UUID{a, b} {
		if rec.Count(id) != 1 {
			t.Errorf("instance %s notified %d times, want 1", id, rec.Count(id))
		}
	}
	if rec.Count(kept) != 0 {
		t.Error("an instance in another workspace was notified")
	}
	if rec.Count(alreadyGone) != 0 {
		t.Error("an instance deleted earlier was notified again")
	}
}

func TestDeleteWorkspace_UnknownWorkspaceNotifiesNothing(t *testing.T) {
	db := database.TestDB(t)
	svc := workspace.NewService(db)
	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)
	if err := svc.DeleteWorkspace(newCtx(), uuid.New()); err == nil {
		t.Fatal("expected not found")
	}
	if len(rec.All()) != 0 {
		t.Errorf("notified %v", rec.All())
	}
}
