package ingest_test

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// strayOf puts an object into Memory behind the ingest's back, owned by inst
// (label and property), with the given key.
func (f *fixture) strayOf(inst uuid.UUID, key string) {
	f.mem.AddObject(memory.Object{
		Type: "feature", Key: key,
		Labels:     []string{"layer:artifact", "instance:" + inst.String()},
		Properties: map[string]any{"instance_id": inst.String()},
	})
}

func (f *fixture) deleteCalls() int { return f.mem.Count("DELETE", "/api/graph/objects/") }

func (f *fixture) liveKeys() []string {
	ks := keys(f.mem.Objects())
	sort.Strings(ks)
	return ks
}

func (f *fixture) contains(key string) bool { return f.mem.ObjectByKey(key) != nil }

func (f *fixture) softDelete(t *testing.T, inst uuid.UUID) {
	t.Helper()
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", inst)
}

// sweepWorld is an ingested instance with a relationship plus one object of each
// class the sweep removes.
type sweepWorld struct {
	f       *fixture
	deleted uuid.UUID
	ghost   uuid.UUID
}

func newSweepWorld(t *testing.T) *sweepWorld {
	t.Helper()
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}
	w := &sweepWorld{f: f, deleted: f.newInstance(t, "gone"), ghost: uuid.New()}
	f.softDelete(t, w.deleted)

	f.mem.AddObject(memory.Object{Type: "feature", Key: "fd-ownerless", Labels: []string{"layer:artifact"}})
	f.strayOf(w.deleted, sk(w.deleted, "fd-001_a"))
	f.strayOf(w.ghost, sk(w.ghost, "fd-001_a"))
	f.strayOf(f.inst, sk(f.inst, "fd-removed"))
	f.strayOf(f.inst, "fd-legacy")
	return w
}

func TestSweep_DryRunReportsEachClassAndDeletesNothing(t *testing.T) {
	w := newSweepWorld(t)
	f := w.f
	before := f.liveKeys()

	rep, err := f.svc.SweepOrphans(context.Background(), false)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}

	want := map[string]int{
		ingest.SweepNoOwner: 1, ingest.SweepUnknownOwner: 2,
		ingest.SweepNotInManifest: 1, ingest.SweepLegacyKey: 1,
	}
	for class, n := range want {
		if rep.Counts[class] != n {
			t.Errorf("%s = %d, want %d (all: %v)", class, rep.Counts[class], n, rep.Counts)
		}
	}
	if rep.Applied || rep.Deleted != 0 {
		t.Errorf("dry run reported applied=%v deleted=%d", rep.Applied, rep.Deleted)
	}
	if rep.Scanned != len(before) {
		t.Errorf("scanned %d objects, Memory holds %d", rep.Scanned, len(before))
	}
	if n := f.deleteCalls(); n != 0 {
		t.Errorf("dry run sent %d delete requests", n)
	}
	if after := f.liveKeys(); strings.Join(after, ",") != strings.Join(before, ",") {
		t.Errorf("dry run changed Memory:\n before %v\n after  %v", before, after)
	}
	if len(rep.Samples[ingest.SweepLegacyKey]) != 1 || rep.Samples[ingest.SweepLegacyKey][0] != "fd-legacy" {
		t.Errorf("legacy sample = %v", rep.Samples[ingest.SweepLegacyKey])
	}
}

func TestSweep_ApplyDeletesTheClassesAndKeepsTheProjection(t *testing.T) {
	w := newSweepWorld(t)
	f := w.f

	rep, err := f.svc.SweepOrphans(context.Background(), true)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if !rep.Applied || rep.Deleted != 5 || rep.Failed != 0 {
		t.Errorf("applied=%v deleted=%d failed=%d, want true 5 0", rep.Applied, rep.Deleted, rep.Failed)
	}
	got := f.liveKeys()
	wantKeys := []string{sk(f.inst, "fd-001_a"), sk(f.inst, "fd-002_b")}
	sort.Strings(wantKeys)
	if strings.Join(got, ",") != strings.Join(wantKeys, ",") {
		t.Errorf("Memory after apply = %v, want only the projected objects %v", got, wantKeys)
	}
	if n := len(f.mem.Relationships()); n != 1 {
		t.Errorf("the projected relationship was lost: %d relationships", n)
	}

	again, err := f.svc.SweepOrphans(context.Background(), true)
	if err != nil {
		t.Fatal(err)
	}
	if total := again.Counts[ingest.SweepNoOwner] + again.Counts[ingest.SweepUnknownOwner] +
		again.Counts[ingest.SweepNotInManifest] + again.Counts[ingest.SweepLegacyKey]; total != 0 || again.Deleted != 0 {
		t.Errorf("a second sweep found %v and deleted %d", again.Counts, again.Deleted)
	}
}

func TestSweep_SkipsAnInstanceWhoseIngestIsRunning(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	f.strayOf(f.inst, sk(f.inst, "fd-removed"))

	release, err := ingest.HoldInstanceLock(ctx, f.db, f.inst)
	if err != nil {
		t.Fatal(err)
	}
	rep, err := f.svc.SweepOrphans(ctx, true)
	if err != nil {
		release()
		t.Fatal(err)
	}
	if !f.contains(sk(f.inst, "fd-removed")) {
		t.Error("an object of an instance whose lock is held was deleted")
	}
	if len(rep.Skipped) != 1 || rep.Skipped[0].InstanceID != f.inst.String() || rep.Skipped[0].Reason != "locked" || rep.Skipped[0].Objects != 2 {
		t.Errorf("skipped = %+v, want the locked instance with 2 objects", rep.Skipped)
	}
	if rep.Counts[ingest.SweepNotInManifest] != 0 {
		t.Errorf("a skipped object was counted: %v", rep.Counts)
	}

	release()
	if _, err := f.svc.SweepOrphans(ctx, true); err != nil {
		t.Fatal(err)
	}
	if f.contains(sk(f.inst, "fd-removed")) {
		t.Error("the stray object survived once the lock was free")
	}
	if !f.contains(sk(f.inst, "fd-001_a")) {
		t.Error("the projected object was deleted")
	}
}

func TestSweep_SkipsAnInstanceWithoutAManifest(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	notYet := f.newInstance(t, "not-ingested")
	f.strayOf(notYet, sk(notYet, "fd-001_a"))
	f.strayOf(notYet, "fd-legacy")

	rep, err := f.svc.SweepOrphans(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	if !f.contains(sk(notYet, "fd-001_a")) || !f.contains("fd-legacy") {
		t.Errorf("objects of an instance without a manifest were deleted; Memory: %v", f.liveKeys())
	}
	if len(rep.Skipped) != 1 || rep.Skipped[0].Reason != "no_manifest" || rep.Skipped[0].Objects != 2 {
		t.Errorf("skipped = %+v, want no_manifest with 2 objects", rep.Skipped)
	}
	if rep.Deleted != 0 {
		t.Errorf("deleted %d", rep.Deleted)
	}
}

func TestSweep_ArchivedInstanceKeepsItsData(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	mustExec(t, f.db, "UPDATE strategy_instances SET status = 'archived' WHERE id = ?", f.inst)
	f.strayOf(f.inst, sk(f.inst, "fd-removed"))

	if _, err := f.svc.SweepOrphans(ctx, true); err != nil {
		t.Fatal(err)
	}
	if !f.contains(sk(f.inst, "fd-001_a")) {
		t.Error("an archived instance's projected object was deleted")
	}
	if f.contains(sk(f.inst, "fd-removed")) {
		t.Error("an archived instance is still an owner: its stray object should be swept")
	}
}

func TestSweep_OwnerIsTheLabelOrThePropertyAndAConflictHasNone(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	other := f.newInstance(t, "other")
	// Label only: owned by f.inst, not in its manifest.
	f.mem.AddObject(memory.Object{Type: "feature", Key: sk(f.inst, "label-only"), Labels: []string{"instance:" + f.inst.String()}})
	// Property only: owned by f.inst.
	f.mem.AddObject(memory.Object{Type: "feature", Key: sk(f.inst, "prop-only"), Properties: map[string]any{"instance_id": f.inst.String()}})
	// Label says one instance, property says another.
	f.mem.AddObject(memory.Object{Type: "feature", Key: sk(f.inst, "conflict"),
		Labels: []string{"instance:" + f.inst.String()}, Properties: map[string]any{"instance_id": other.String()}})
	// An owner that is not a UUID.
	f.mem.AddObject(memory.Object{Type: "feature", Key: "12345678/garbage", Labels: []string{"instance:not-a-uuid"}})

	rep, err := f.svc.SweepOrphans(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Counts[ingest.SweepNotInManifest] != 2 || rep.Counts[ingest.SweepNoOwner] != 1 || rep.Counts[ingest.SweepUnknownOwner] != 1 {
		t.Errorf("counts = %v, want not_in_manifest 2 (label-only, prop-only), no_owner 1 (conflict), unknown_owner 1 (not-a-uuid)", rep.Counts)
	}
}

func TestSweep_AFailedDeleteIsReportedAndTheRestIsStillSwept(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	f.strayOf(f.inst, sk(f.inst, "stuck"))
	f.strayOf(f.inst, sk(f.inst, "fine-1"))
	f.strayOf(f.inst, sk(f.inst, "fine-2"))
	f.mem.FailDeleteKeys[sk(f.inst, "stuck")] = true

	rep, err := f.svc.SweepOrphans(ctx, true)
	if err != nil {
		t.Fatalf("a failed delete must be in the report, not abort it: %v", err)
	}
	if rep.Deleted != 2 || rep.Failed != 1 {
		t.Errorf("deleted=%d failed=%d, want 2 and 1", rep.Deleted, rep.Failed)
	}
	if !f.contains(sk(f.inst, "stuck")) || f.contains(sk(f.inst, "fine-1")) || f.contains(sk(f.inst, "fine-2")) {
		t.Errorf("Memory = %v", f.liveKeys())
	}

	delete(f.mem.FailDeleteKeys, sk(f.inst, "stuck"))
	rep, err = f.svc.SweepOrphans(ctx, true)
	if err != nil || rep.Deleted != 1 || rep.Failed != 0 || f.contains(sk(f.inst, "stuck")) {
		t.Errorf("retry: err=%v report=%+v", err, rep)
	}
}

func TestSweep_PagesThroughEveryObject(t *testing.T) {
	f := newFixture(t)
	const n = 450 // more than two pages of 200
	for i := range n {
		f.mem.AddObject(memory.Object{Type: "feature", Key: fmt.Sprintf("ownerless-%03d", i)})
	}
	rep, err := f.svc.SweepOrphans(context.Background(), true)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Scanned != n || rep.Deleted != n || len(f.mem.Objects()) != 0 {
		t.Errorf("scanned=%d deleted=%d left=%d, want %d %d 0", rep.Scanned, rep.Deleted, len(f.mem.Objects()), n, n)
	}
	if got := len(rep.Samples[ingest.SweepNoOwner]); got > 5 {
		t.Errorf("a sample has %d entries; the report must stay small", got)
	}
}

func TestSweep_WithoutMemoryItIsAnError(t *testing.T) {
	f := newFixture(t)
	svc := ingest.NewService(f.db, nil)
	if _, err := svc.SweepOrphans(context.Background(), false); err == nil {
		t.Fatal("expected an error when Memory is not configured")
	}
}
