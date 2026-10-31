package ingest_test

import (
	"context"
	"testing"
)

// Memory identifies an object by type and key. When an artifact keeps its key
// but changes type, the upsert creates a second object and the manifest, which
// lists keys, still says the key is projected. The old-type object must go, or
// two objects answer for one artifact.
func TestIngest_ATypeChangeLeavesOneObjectForTheKey(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}

	mustExec(t, f.db, "UPDATE strategy_artifacts SET artifact_type = 'evidence' WHERE instance_id = ? AND artifact_key = 'fd-001_a'", f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}

	var types []string
	for _, o := range objectsOf(f, f.inst) {
		if o.Key == sk(f.inst, "fd-001_a") {
			types = append(types, o.Type)
		}
	}
	if len(types) != 1 || types[0] != "evidence" {
		t.Errorf("objects for fd-001_a have types %v, want exactly [evidence]", types)
	}
	if n := len(f.projectionKeys(t, f.inst, "object")); n != len(objectsOf(f, f.inst)) {
		t.Errorf("manifest has %d objects, Memory has %d owned", n, len(objectsOf(f, f.inst)))
	}
}

// If the old-type object cannot be removed the ingest fails and the instance
// stays dirty, so it is retried and never reported as converged.
func TestIngest_ATypeChangeThatCannotBeCleanedUpFailsClosed(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	var before int
	if err := f.db.NewRaw("SELECT memory_generation FROM strategy_instances WHERE id = ?", f.inst).Scan(ctx, &before); err != nil {
		t.Fatal(err)
	}

	mustExec(t, f.db, "UPDATE strategy_artifacts SET artifact_type = 'evidence' WHERE instance_id = ? AND artifact_key = 'fd-001_a'", f.inst)
	f.mem.FailDeleteKeys[sk(f.inst, "fd-001_a")] = true
	if err := f.svc.ReingestInstance(ctx, f.inst); err == nil {
		t.Fatal("ingest reported success while the old-type object is still in Memory")
	}
	var after int
	if err := f.db.NewRaw("SELECT memory_generation FROM strategy_instances WHERE id = ?", f.inst).Scan(ctx, &after); err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Errorf("generation moved from %d to %d although the ingest failed", before, after)
	}

	delete(f.mem.FailDeleteKeys, sk(f.inst, "fd-001_a"))
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatalf("retry: %v", err)
	}
	n := 0
	for _, o := range objectsOf(f, f.inst) {
		if o.Key == sk(f.inst, "fd-001_a") {
			n++
		}
	}
	if n != 1 {
		t.Errorf("after the retry %d objects answer for fd-001_a, want 1", n)
	}
}
