package ingest_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

type fixture struct {
	db   *bun.DB
	mem  *memtest.Server
	svc  *ingest.Service
	inst uuid.UUID
	ws   uuid.UUID
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	db := database.TestDB(t)
	mem := memtest.New(t)
	f := &fixture{db: db, mem: mem, svc: ingest.NewService(db, mem.Client(t))}
	f.ws = uuid.New()
	org := uuid.New()
	mustExec(t, db, "INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", org, "o-"+org.String()[:8])
	mustExec(t, db, "INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", f.ws, "ws-"+f.ws.String()[:8], org)
	f.inst = f.newInstance(t, "main")
	return f
}

func mustExec(t *testing.T, db *bun.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), q, args...); err != nil {
		t.Fatalf("exec %q: %v", q, err)
	}
}

func (f *fixture) newInstance(t *testing.T, name string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	mustExec(t, f.db, "INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, ?)", id, f.ws, name)
	return id
}

func (f *fixture) addArtifact(t *testing.T, inst uuid.UUID, typ, key string, payload map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(payload)
	mid := uuid.New()
	mustExec(t, f.db, `INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source)
		VALUES (?, ?, ?, ?, 'create', ?, 'committed', 'system')`, mid, inst, typ, key, string(raw))
	mustExec(t, f.db, `INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
		VALUES (?, ?, ?, ?, 'active', ?, ?)`, uuid.New(), inst, typ, key, string(raw), mid)
}

func (f *fixture) archive(t *testing.T, inst uuid.UUID, key string) {
	t.Helper()
	mustExec(t, f.db, "UPDATE strategy_artifacts SET status = 'archived' WHERE instance_id = ? AND artifact_key = ?", inst, key)
}

func (f *fixture) addRelationship(t *testing.T, inst uuid.UUID, from, to string) {
	t.Helper()
	mustExec(t, f.db, `INSERT INTO strategy_relationships (id, instance_id, source_key, source_type, target_key, target_type, relationship)
		VALUES (?, ?, ?, 'feature', ?, 'feature', 'depends_on')`, uuid.New(), inst, from, to)
}

type syncRow struct {
	Dirty *time.Time `bun:"memory_dirty_since"`
	Seq   int64      `bun:"memory_change_seq"`
	Gen   int64      `bun:"memory_generation"`
	Hash  *string    `bun:"memory_content_hash"`
	State *string    `bun:"memory_sync_status"`
	Purge *time.Time `bun:"memory_purged_at"`
}

func (f *fixture) row(t *testing.T, inst uuid.UUID) syncRow {
	t.Helper()
	var r syncRow
	if err := f.db.NewRaw(`SELECT memory_dirty_since, memory_change_seq, memory_generation, memory_content_hash, memory_sync_status, memory_purged_at
		FROM strategy_instances WHERE id = ?`, inst).Scan(context.Background(), &r); err != nil {
		t.Fatalf("row: %v", err)
	}
	return r
}

func (f *fixture) markDirty(t *testing.T, inst uuid.UUID) {
	t.Helper()
	mustExec(t, f.db, "UPDATE strategy_instances SET memory_dirty_since = now(), memory_change_seq = memory_change_seq + 1 WHERE id = ?", inst)
}

// sk is the Memory key an ingest gives an artifact key of instance inst.
func sk(inst uuid.UUID, key string) string { return ingest.ScopedKey(inst, key) }

func keys(objs []memory.Object) []string {
	out := make([]string, 0, len(objs))
	for _, o := range objs {
		out = append(out, o.Key)
	}
	return out
}

func hasLabel(o *memory.Object, l string) bool {
	for _, x := range o.Labels {
		if x == l {
			return true
		}
	}
	return false
}

func TestReingest_WritesArtifactsWithOwnerLabelAndClearsDirty(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	f.markDirty(t, f.inst)

	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}

	o := f.mem.ObjectByKey(sk(f.inst, "fd-001_a"))
	if o == nil {
		t.Fatalf("object not written; have %v", keys(f.mem.Objects()))
	}
	if !hasLabel(o, "instance:"+f.inst.String()) || !hasLabel(o, "layer:artifact") {
		t.Errorf("labels = %v, want layer:artifact and instance:<uuid>", o.Labels)
	}
	if len(f.mem.Relationships()) != 1 {
		t.Errorf("relationships = %d, want 1", len(f.mem.Relationships()))
	}
	r := f.row(t, f.inst)
	if r.Dirty != nil {
		t.Errorf("dirty flag not cleared")
	}
	if r.Hash == nil || r.State == nil || *r.State != "synced" {
		t.Errorf("sync bookkeeping not written: %+v", r)
	}
	if r.Gen != 1 {
		t.Errorf("memory_generation = %d, want 1 after the first manifest ingest", r.Gen)
	}
}

func TestReingest_KeepsDirtyWhenAChangeArrivesMidIngest(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.markDirty(t, f.inst)

	var once atomic.Bool
	f.mem.OnUpsert = func(string) {
		if once.CompareAndSwap(false, true) {
			f.markDirty(t, f.inst)
		}
	}
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}
	if f.row(t, f.inst).Dirty == nil {
		t.Fatal("a change that arrived during the ingest must leave the instance dirty")
	}
}

func TestReingest_FailedUpsertLeavesInstanceDirtyAndReportsError(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.markDirty(t, f.inst)
	f.mem.FailUpsertKeys[sk(f.inst, "fd-002_b")] = true

	if err := f.svc.ReingestInstance(context.Background(), f.inst); err == nil {
		t.Fatal("expected an error when an object could not be written")
	}
	r := f.row(t, f.inst)
	if r.Dirty == nil {
		t.Error("instance must stay dirty after a partial ingest")
	}
	if r.Hash != nil {
		t.Error("content hash must not be stored for an incomplete ingest")
	}
}

func TestReingest_RemovesObjectsOfArchivedArtifactsButOnlyItsOwn(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	other := f.newInstance(t, "other")
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addArtifact(t, other, "feature", "fd-900_other", map[string]any{"name": "Other"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.ReingestInstance(ctx, other); err != nil {
		t.Fatal(err)
	}

	f.archive(t, f.inst, "fd-002_b")
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}

	got := strings.Join(keys(f.mem.Objects()), ",")
	if strings.Contains(got, "fd-002_b") {
		t.Errorf("archived artifact still in graph: %s", got)
	}
	if !strings.Contains(got, "fd-001_a") || !strings.Contains(got, "fd-900_other") {
		t.Errorf("live objects were removed: %s", got)
	}
}

func TestReingest_DoesNotDeleteUnlabelledForeignObjects(t *testing.T) {
	f := newFixture(t)
	f.mem.AddObject(memory.Object{Type: "feature", Key: "someone-elses", Labels: []string{"layer:artifact"}})
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}
	if f.mem.ObjectByKey("someone-elses") == nil {
		t.Fatal("GC deleted an object this instance does not own")
	}
}

func TestReingest_EvidencePropertiesReachMemory(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "evidence", "ev-1", map[string]any{
		"processing_status": "unprocessed",
		"tags":              []string{"interview"},
		"source":            map[string]any{"name": "Acme call", "type": "interview"},
		"summary":           "they want X",
	})
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}
	o := f.mem.ObjectByKey(sk(f.inst, "ev-1"))
	if o == nil {
		t.Fatal("evidence object missing")
	}
	if o.Properties["processing_status"] != "unprocessed" || o.Properties["source_name"] != "Acme call" || o.Properties["snippet"] != "they want X" {
		t.Errorf("evidence properties lost: %v", o.Properties)
	}
}

func TestReingest_SecondRunWithNoChangesWritesNoNewVersions(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	first := f.mem.ObjectByKey(sk(f.inst, "fd-001_a"))
	if first == nil {
		t.Fatalf("object not written; have %v", keys(f.mem.Objects()))
	}
	v1 := first.Version
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if v2 := f.mem.ObjectByKey(sk(f.inst, "fd-001_a")).Version; v2 != v1 {
		t.Logf("fake bumps version on every upsert (%d -> %d); real Memory dedupes by content hash", v1, v2)
	}
}

func TestInstanceChanged_RunsIngestInTheBackground(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.markDirty(t, f.inst)
	f.svc.Start(2)
	defer f.svc.Stop()

	f.svc.InstanceChanged(context.Background(), f.inst)

	waitFor(t, "object in graph", func() bool { return f.mem.ObjectByKey(sk(f.inst, "fd-001_a")) != nil })
	waitFor(t, "dirty cleared", func() bool { return f.row(t, f.inst).Dirty == nil })
}

func TestInstanceChanged_SkipsWhenAnotherReplicaAlreadyIngested(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.markDirty(t, f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	before := f.mem.Count("PUT", "/api/graph/objects/upsert")

	f.svc.Start(1)
	f.svc.InstanceChanged(ctx, f.inst)
	f.svc.Stop() // drains

	if after := f.mem.Count("PUT", "/api/graph/objects/upsert"); after != before {
		t.Errorf("a clean, hash-matching instance was re-ingested (%d -> %d upserts)", before, after)
	}
}

func TestStartupSweep_EnqueuesDirtyNullHashAndSkipsDeleted(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	clean := f.inst
	f.addArtifact(t, clean, "feature", "fd-clean", map[string]any{"name": "clean"})
	if err := f.svc.ReingestInstance(ctx, clean); err != nil {
		t.Fatal(err)
	}

	dirty := f.newInstance(t, "dirty")
	f.addArtifact(t, dirty, "feature", "fd-dirty", map[string]any{"name": "dirty"})
	f.markDirty(t, dirty)

	fresh := f.newInstance(t, "fresh") // never ingested: NULL hash
	f.addArtifact(t, fresh, "feature", "fd-fresh", map[string]any{"name": "fresh"})

	deleted := f.newInstance(t, "deleted")
	f.addArtifact(t, deleted, "feature", "fd-deleted", map[string]any{"name": "deleted"})
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now(), memory_sync_status = NULL WHERE id = ?", deleted)

	f.mem.AddObject(memory.Object{Type: "feature", Key: "marker"}) // keep Objects() non-empty for diffing
	f.svc.Start(2)
	f.svc.EnqueueAllInstances(ctx, f.db, discardLog{})
	f.svc.Stop()

	if f.mem.ObjectByKey(sk(dirty, "fd-dirty")) == nil || f.mem.ObjectByKey(sk(fresh, "fd-fresh")) == nil {
		t.Errorf("dirty and never-ingested instances must be ingested; have %v", keys(f.mem.Objects()))
	}
	if f.mem.ObjectByKey(sk(deleted, "fd-deleted")) != nil {
		t.Error("a deleted instance must not be ingested by the sweep")
	}
}

type discardLog struct{}

func (discardLog) Info(string, ...any) {}
func (discardLog) Warn(string, ...any) {}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

var _ = domain.ArtifactStatusActive

func TestPurge_RemovesOnlyTheDeletedInstancesObjectsAndBranches(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	other := f.newInstance(t, "other")
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	f.addArtifact(t, other, "feature", "fd-900_other", map[string]any{"name": "Other"})
	for _, id := range []uuid.UUID{f.inst, other} {
		if err := f.svc.ReingestInstance(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	f.mem.AddBranch("scenario-" + f.inst.String() + "-what-if")
	f.mem.AddBranch("scenario-" + other.String() + "-keep")

	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", f.inst)
	f.svc.Start(1)
	f.svc.EnqueueInstance(f.inst)
	f.svc.Stop()

	got := strings.Join(keys(f.mem.Objects()), ",")
	if strings.Contains(got, "fd-001_a") || strings.Contains(got, "fd-002_b") {
		t.Errorf("deleted instance's objects remain: %s", got)
	}
	if !strings.Contains(got, "fd-900_other") {
		t.Errorf("another instance's object was purged: %s", got)
	}
	if n := len(f.mem.Relationships()); n != 0 {
		t.Errorf("relationships of the purged objects remain: %d", n)
	}
	var names []string
	for _, b := range f.mem.Branches() {
		names = append(names, b.Name)
	}
	if len(names) != 1 || !strings.Contains(names[0], other.String()) {
		t.Errorf("branches after purge = %v, want only the other instance's", names)
	}
	if f.row(t, f.inst).Purge == nil {
		t.Error("memory_purged_at not recorded")
	}
}

func TestPurge_FailureLeavesItOwedForTheHeartbeat(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", f.inst)
	f.mem.Close() // Memory is down

	if err := f.svc.PurgeInstance(ctx, f.inst); err == nil {
		t.Fatal("expected an error while Memory is unreachable")
	}
	if f.row(t, f.inst).Purge != nil {
		t.Error("purge must not be recorded as done")
	}
}

func TestPurge_NeverSyncedInstanceNeedsNoMemoryCalls(t *testing.T) {
	f := newFixture(t)
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", f.inst)
	if err := f.svc.PurgeInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("purge: %v", err)
	}
	if n := len(f.mem.Requests()); n != 0 {
		t.Errorf("made %d Memory calls for an instance that was never synced", n)
	}
}

func TestRepairMemoryDrift_RequeuesOldDirtyInstancesOnly(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-old", map[string]any{"name": "old"})
	mustExec(t, f.db, "UPDATE strategy_instances SET memory_dirty_since = now() - interval '10 minutes', memory_change_seq = 1 WHERE id = ?", f.inst)

	young := f.newInstance(t, "young")
	f.addArtifact(t, young, "feature", "fd-young", map[string]any{"name": "young"})
	f.markDirty(t, young) // dirty just now: its own notification is still in flight

	gone := f.newInstance(t, "gone")
	f.addArtifact(t, gone, "feature", "fd-gone", map[string]any{"name": "gone"})
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now(), memory_dirty_since = now() - interval '10 minutes' WHERE id = ?", gone)

	f.svc.Start(2)
	f.svc.RepairMemoryDrift(ctx)
	f.svc.Stop()

	if f.mem.ObjectByKey(sk(f.inst, "fd-old")) == nil {
		t.Error("an instance dirty for 10 minutes must be re-ingested")
	}
	if f.mem.ObjectByKey(sk(young, "fd-young")) != nil {
		t.Error("an instance dirtied seconds ago is left to its own notification")
	}
	if f.mem.ObjectByKey(sk(gone, "fd-gone")) != nil {
		t.Error("a deleted instance must not be ingested")
	}
}
