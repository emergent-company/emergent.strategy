package ingest_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// verifyWorld is an ingested instance with three artifacts and a relationship.
func newVerifyWorld(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addArtifact(t, f.inst, "feature", "fd-003_c", map[string]any{"name": "C"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}
	return f
}

// removeFromMemory deletes an object behind the ingest's back, as an older
// build's import did.
func (f *fixture) removeFromMemory(t *testing.T, key string) {
	t.Helper()
	o := f.mem.ObjectByKey(key)
	if o == nil {
		t.Fatalf("no object %q to remove; have %v", key, f.liveKeys())
	}
	if err := f.mem.Client(t).DeleteObject(context.Background(), o.StableID(), memory.DeleteObjectRequest{Reason: "test"}); err != nil {
		t.Fatalf("delete %q: %v", key, err)
	}
}

func (f *fixture) verification(t *testing.T, rep *ingest.VerifyReport, inst uuid.UUID) ingest.InstanceVerification {
	t.Helper()
	for _, v := range rep.Instances {
		if v.InstanceID == inst.String() {
			return v
		}
	}
	t.Fatalf("report has no entry for instance %s: %+v", inst, rep.Instances)
	return ingest.InstanceVerification{}
}

func TestVerify_AnInstanceThatMatchesItsManifestIsOK(t *testing.T) {
	f := newVerifyWorld(t)
	gone := f.newInstance(t, "gone")
	f.softDelete(t, gone)

	rep, err := f.svc.VerifyInstances(context.Background(), false)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	v := f.verification(t, rep, f.inst)
	if v.Status != ingest.VerifyOK || v.Missing != 0 || v.Extra != 0 {
		t.Errorf("status=%s missing=%d extra=%d, want ok 0 0", v.Status, v.Missing, v.Extra)
	}
	if v.Manifest == 0 || v.InMemory != v.Manifest {
		t.Errorf("manifest=%d in_memory=%d, want equal and not zero", v.Manifest, v.InMemory)
	}
	if rep.Unresolved() != 0 {
		t.Errorf("unresolved = %d, want 0", rep.Unresolved())
	}
	for _, e := range rep.Instances {
		if e.InstanceID == gone.String() {
			t.Error("a deleted instance was verified")
		}
	}
}

func TestVerify_ReportsObjectsMissingFromMemoryAndChangesNothing(t *testing.T) {
	f := newVerifyWorld(t)
	missing := sk(f.inst, "fd-002_b")
	f.removeFromMemory(t, missing)
	upserts := f.mem.Count("POST", "/api/graph/objects")

	rep, err := f.svc.VerifyInstances(context.Background(), false)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	v := f.verification(t, rep, f.inst)
	if v.Status != ingest.VerifyMismatch || v.Missing != 1 || len(v.MissingSample) != 1 || v.MissingSample[0] != missing {
		t.Errorf("status=%s missing=%d sample=%v, want mismatch 1 [%s]", v.Status, v.Missing, v.MissingSample, missing)
	}
	if rep.Unresolved() != 1 {
		t.Errorf("unresolved = %d, want 1", rep.Unresolved())
	}
	if f.contains(missing) {
		t.Error("a check without repair put the object back")
	}
	if n := f.mem.Count("POST", "/api/graph/objects"); n != upserts {
		t.Errorf("a check without repair wrote %d objects", n-upserts)
	}
}

// The rollback in #146: an older build's import deletes the instance's objects
// and writes look-alikes with no owner. The instance still claims them.
func TestVerify_CatchesTheDamageAnOlderBuildLeaves(t *testing.T) {
	f := newVerifyWorld(t)
	var owned []string
	for _, o := range f.mem.Objects() {
		owned = append(owned, o.Key)
	}
	for _, k := range owned {
		f.removeFromMemory(t, k)
		f.mem.AddObject(memory.Object{Type: "feature", Key: strings.TrimPrefix(k, f.inst.String()[:8]+"/"), Labels: []string{"layer:artifact"}})
	}

	rep, err := f.svc.VerifyInstances(context.Background(), false)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	v := f.verification(t, rep, f.inst)
	if v.Status != ingest.VerifyMismatch || v.Missing != len(owned) || v.InMemory != 0 {
		t.Errorf("status=%s missing=%d in_memory=%d, want mismatch %d 0", v.Status, v.Missing, v.InMemory, len(owned))
	}
}

func TestVerify_ExtraObjectsAreReportedButAreTheSweepsBusiness(t *testing.T) {
	f := newVerifyWorld(t)
	f.strayOf(f.inst, sk(f.inst, "fd-removed"))

	rep, err := f.svc.VerifyInstances(context.Background(), true)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	v := f.verification(t, rep, f.inst)
	if v.Status != ingest.VerifyOK || v.Extra != 1 || len(v.ExtraSample) != 1 {
		t.Errorf("status=%s extra=%d sample=%v, want ok 1 and a sample", v.Status, v.Extra, v.ExtraSample)
	}
	if !f.contains(sk(f.inst, "fd-removed")) {
		t.Error("verify deleted an object; removing those is the sweep's job")
	}
	if rep.Unresolved() != 0 {
		t.Errorf("unresolved = %d, want 0 (extras alone are not a failure)", rep.Unresolved())
	}
}

func TestVerify_RepairPutsTheObjectsBack(t *testing.T) {
	f := newVerifyWorld(t)
	missing := sk(f.inst, "fd-002_b")
	f.removeFromMemory(t, missing)
	before := f.row(t, f.inst)

	rep, err := f.svc.VerifyInstances(context.Background(), true)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	v := f.verification(t, rep, f.inst)
	if v.Status != ingest.VerifyRepaired || v.Missing != 1 {
		t.Errorf("status=%s missing=%d, want repaired 1", v.Status, v.Missing)
	}
	if !f.contains(missing) {
		t.Fatal("the missing object is still missing after repair")
	}
	if rep.Unresolved() != 0 {
		t.Errorf("unresolved = %d, want 0", rep.Unresolved())
	}
	if after := f.row(t, f.inst); after.Gen <= before.Gen {
		t.Errorf("generation %d -> %d: repair did not re-ingest", before.Gen, after.Gen)
	}

	again, err := f.svc.VerifyInstances(context.Background(), false)
	if err != nil {
		t.Fatalf("second verify: %v", err)
	}
	if v := f.verification(t, again, f.inst); v.Status != ingest.VerifyOK {
		t.Errorf("after repair status=%s, want ok", v.Status)
	}
}

func TestVerify_SkipsWhatItCannotJudge(t *testing.T) {
	f := newVerifyWorld(t)
	f.removeFromMemory(t, sk(f.inst, "fd-001_a"))
	ctx := context.Background()

	dirty := f.newInstance(t, "dirty")
	f.addArtifact(t, dirty, "feature", "fd-001_a", map[string]any{"name": "D"})
	if err := f.svc.ReingestInstance(ctx, dirty); err != nil {
		t.Fatalf("reingest: %v", err)
	}
	f.markDirty(t, dirty)

	fresh := f.newInstance(t, "fresh")
	f.addArtifact(t, fresh, "feature", "fd-001_a", map[string]any{"name": "F"})

	release, err := ingest.HoldInstanceLock(ctx, f.db, f.inst)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	rep, err := f.svc.VerifyInstances(ctx, true)
	release()
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	for inst, reason := range map[uuid.UUID]string{f.inst: ingest.VerifySkipLocked, dirty: ingest.VerifySkipDirty, fresh: ingest.VerifySkipNoManifest} {
		v := f.verification(t, rep, inst)
		if v.Status != ingest.VerifySkipped || v.SkipReason != reason {
			t.Errorf("%s: status=%s reason=%q, want skipped %q", v.Name, v.Status, v.SkipReason, reason)
		}
	}
	if f.contains(sk(f.inst, "fd-001_a")) {
		t.Error("an instance whose lock is held was repaired anyway")
	}
}

func TestRepairMemoryDrift_HealsAnInstanceWhoseObjectsAreMissing(t *testing.T) {
	f := newVerifyWorld(t)
	missing := sk(f.inst, "fd-003_c")
	f.removeFromMemory(t, missing)
	if r := f.row(t, f.inst); r.Dirty != nil {
		t.Fatalf("precondition: instance is dirty (%v), so the older drift checks would catch it", r.Dirty)
	}

	f.svc.Start(2)
	f.svc.RepairMemoryDrift(context.Background())
	f.svc.Stop()

	if !f.contains(missing) {
		t.Errorf("the heartbeat did not restore the missing object; have %v", f.liveKeys())
	}
}

func TestRepairMemoryDrift_ChecksEachInstanceOnlyOncePerInterval(t *testing.T) {
	f := newVerifyWorld(t)
	ctx := context.Background()
	f.svc.Start(2)
	defer f.svc.Stop()

	setup := f.mem.Count("GET", "/api/graph/objects")

	f.svc.RepairMemoryDrift(ctx)
	lists := f.mem.Count("GET", "/api/graph/objects")
	if lists == setup {
		t.Fatal("the first heartbeat did not look at Memory")
	}

	f.removeFromMemory(t, sk(f.inst, "fd-003_c"))
	f.svc.RepairMemoryDrift(ctx)
	if n := f.mem.Count("GET", "/api/graph/objects"); n != lists {
		t.Errorf("the second heartbeat listed Memory again (%d -> %d requests)", lists, n)
	}
}
