package ingest_test

import (
	"context"
	"testing"
)

// A first ingest that fails leaves the instance at generation 0 and not dirty:
// the failure marks nothing. The heartbeat must still find it.
func TestRepairMemoryDrift_RetriesAFailedFirstIngest(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.mem.FailUpsertKeys[sk(f.inst, "fd-001_a")] = true

	if err := f.svc.ReingestInstance(ctx, f.inst); err == nil {
		t.Fatal("setup: the first ingest was expected to fail")
	}
	if r := f.row(t, f.inst); r.Gen != 0 || r.Dirty != nil {
		t.Fatalf("setup: generation=%d dirty=%v, want 0 and not dirty", r.Gen, r.Dirty)
	}

	delete(f.mem.FailUpsertKeys, sk(f.inst, "fd-001_a"))
	f.svc.Start(2)
	f.svc.RepairMemoryDrift(ctx)
	f.svc.Stop()

	if r := f.row(t, f.inst); r.Gen < 1 {
		t.Errorf("generation = %d after the heartbeat: the instance was never retried", r.Gen)
	}
	if !f.contains(sk(f.inst, "fd-001_a")) {
		t.Errorf("the artifact never reached Memory; have %v", f.liveKeys())
	}
}

// The heartbeat must not start ingesting what the startup sweep also skips:
// deleted and archived instances.
func TestRepairMemoryDrift_DoesNotIngestDeletedOrArchivedInstancesAtGenerationZero(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	gone := f.newInstance(t, "gone")
	f.addArtifact(t, gone, "feature", "fd-gone", map[string]any{"name": "gone"})
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now(), memory_sync_status = NULL WHERE id = ?", gone)
	old := f.newInstance(t, "old")
	f.addArtifact(t, old, "feature", "fd-old", map[string]any{"name": "old"})
	mustExec(t, f.db, "UPDATE strategy_instances SET status = 'archived' WHERE id = ?", old)

	f.svc.Start(2)
	f.svc.RepairMemoryDrift(ctx)
	f.svc.Stop()

	if f.contains(sk(gone, "fd-gone")) || f.contains(sk(old, "fd-old")) {
		t.Errorf("a deleted or archived instance was ingested; have %v", f.liveKeys())
	}
}
