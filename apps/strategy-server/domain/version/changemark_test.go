package version_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestRestore_MarksInstanceChangedInsideItsTransaction(t *testing.T) {
	ctx, stratSvc, verSvc, instID := seedInstance(t)
	db := stratSvc.DB()
	v1, err := verSvc.Publish(ctx, instID, "v1", "")
	if err != nil {
		t.Fatal(err)
	}
	marker, rec := changemarktest.New(db)
	verSvc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, instID)

	if _, err := verSvc.Restore(ctx, instID, v1.ID); err != nil {
		t.Fatal(err)
	}
	if s := changemarktest.Load(t, db, instID); s.Dirty == nil || s.Seq != 1 {
		t.Errorf("Restore must mark exactly once: %+v", s)
	}
	if rec.Count(instID) != 1 {
		t.Errorf("notified %d times, want 1", rec.Count(instID))
	}
}

func TestRestore_FailedRestoreLeavesNoMark(t *testing.T) {
	ctx, stratSvc, verSvc, instID := seedInstance(t)
	db := stratSvc.DB()
	marker, rec := changemarktest.New(db)
	verSvc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, instID)

	if _, err := verSvc.Restore(ctx, instID, [16]byte{1}); err == nil {
		t.Fatal("expected an error for an unknown version")
	}
	if s := changemarktest.Load(t, db, instID); s.Dirty != nil || rec.Count(instID) != 0 {
		t.Errorf("failed restore marked the instance: %+v", s)
	}
}

var (
	_ = version.NewService
	_ = database.TestDB
)
