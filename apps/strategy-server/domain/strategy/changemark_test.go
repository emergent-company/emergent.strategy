package strategy_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func markedService(t *testing.T) (*strategy.Service, uuid.UUID, *changemarktest.Recorder, func() changemarktest.State) {
	t.Helper()
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, instID)
	return svc, instID, rec, func() changemarktest.State { return changemarktest.Load(t, db, instID) }
}

func ctxSys() context.Context {
	return audit.ContextWithSource(context.Background(), audit.SourceSystem)
}

func TestCommitBatch_MarksInstanceChangedOnceAfterTheWrite(t *testing.T) {
	svc, instID, rec, state := markedService(t)
	ctx := ctxSys()
	batch := stage(t, svc, instID, "fd-001_a", "feature")
	stage2(t, svc, instID, batch, "fd-002_b", "feature")

	if _, err := svc.CommitBatch(ctx, batch); err != nil {
		t.Fatal(err)
	}
	if s := state(); s.Dirty == nil || s.Seq != 1 {
		t.Errorf("state after a two-artifact batch = %+v, want dirty with seq 1 (one mark per operation)", s)
	}
	if n := rec.Count(instID); n != 1 {
		t.Errorf("notified %d times, want 1", n)
	}
}

func TestCommitBatch_UnknownBatchDoesNotMark(t *testing.T) {
	svc, instID, rec, state := markedService(t)
	if _, err := svc.CommitBatch(ctxSys(), uuid.New()); err == nil {
		t.Fatal("expected not found")
	}
	if s := state(); s.Dirty != nil || rec.Count(instID) != 0 {
		t.Errorf("a failed commit must not mark: %+v", s)
	}
}

func TestDiscardBatch_DoesNotMark(t *testing.T) {
	svc, instID, rec, state := markedService(t)
	batch := stage(t, svc, instID, "fd-001_a", "feature")
	if _, err := svc.DiscardBatch(ctxSys(), batch); err != nil {
		t.Fatal(err)
	}
	if s := state(); s.Dirty != nil || rec.Count(instID) != 0 {
		t.Errorf("discarding staged work must not mark: %+v", s)
	}
}

func TestCommitAuto_MarksInstanceChanged(t *testing.T) {
	svc, instID, rec, state := markedService(t)
	if _, err := svc.CommitAuto(ctxSys(), strategy.CommitAutoParams{
		InstanceID: instID, ArtifactType: "feature", ArtifactKey: "fd-001_a",
		Action: domain.MutationActionCreate, Payload: map[string]string{"name": "A"},
	}); err != nil {
		t.Fatal(err)
	}
	if s := state(); s.Dirty == nil || rec.Count(instID) != 1 {
		t.Errorf("CommitAuto must mark and notify: %+v notified=%d", s, rec.Count(instID))
	}
}

func TestBackfillIndex_MarksInstanceChanged(t *testing.T) {
	svc, instID, rec, state := markedService(t)
	if _, err := svc.BackfillIndex(ctxSys(), instID); err != nil {
		t.Fatal(err)
	}
	if s := state(); s.Dirty == nil || rec.Count(instID) != 1 {
		t.Errorf("BackfillIndex must mark and notify: %+v notified=%d", s, rec.Count(instID))
	}
}

func TestAlignPortfolio_MarksInstanceChangedWhenAValueModelIsRewritten(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "emerging"))
	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, instID)

	res, err := svc.AlignPortfolio(ctxSys(), instID)
	if err != nil {
		t.Fatal(err)
	}
	if res.TracksChanged == 0 {
		t.Fatal("fixture did not change a track")
	}
	if s := changemarktest.Load(t, db, instID); s.Dirty == nil || rec.Count(instID) == 0 {
		t.Errorf("an aligned value model must mark the instance: %+v", s)
	}
}

func TestNilMarkerIsHarmless(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db) // no marker wired
	if _, err := svc.BackfillIndex(ctxSys(), instID); err != nil {
		t.Fatalf("service without a marker must still work: %v", err)
	}
}

func stage(t *testing.T, svc *strategy.Service, inst uuid.UUID, key, typ string) uuid.UUID {
	t.Helper()
	b, err := svc.Stage(ctxSys(), strategy.StageParams{
		InstanceID: inst, ArtifactType: typ, ArtifactKey: key,
		Action: domain.MutationActionCreate, Payload: map[string]any{"name": key},
	})
	if err != nil {
		t.Fatalf("stage %s: %v", key, err)
	}
	return b
}

func stage2(t *testing.T, svc *strategy.Service, inst, batch uuid.UUID, key, typ string) {
	t.Helper()
	if _, err := svc.Stage(ctxSys(), strategy.StageParams{
		InstanceID: inst, BatchID: &batch, ArtifactType: typ, ArtifactKey: key,
		Action: domain.MutationActionCreate, Payload: map[string]any{"name": key},
	}); err != nil {
		t.Fatalf("stage %s: %v", key, err)
	}
}
