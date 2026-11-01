package ingest_test

import (
	"context"
	"sort"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// The store is what the semantic read path depends on.
var _ semantic.ManifestSource = (*ingest.ManifestStore)(nil)

func seedInstance(t *testing.T, db *bun.DB, generation int64) uuid.UUID {
	t.Helper()
	ws, org, id := uuid.New(), uuid.New(), uuid.New()
	mustExec(t, db, "INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", org, "o-"+org.String()[:8])
	mustExec(t, db, "INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", ws, "ws-"+ws.String()[:8], org)
	mustExec(t, db, "INSERT INTO strategy_instances (id, workspace_id, name, memory_generation) VALUES (?, ?, 'i', ?)", id, ws, generation)
	return id
}

func seedProjection(t *testing.T, db *bun.DB, inst uuid.UUID, kind string, keys ...string) {
	t.Helper()
	for _, k := range keys {
		mustExec(t, db, "INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, ?, ?)", inst, kind, k)
	}
}

func sorted(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestManifestStore_HasManifest(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()

	cases := []struct {
		name string
		id   uuid.UUID
		want bool
	}{
		{"never ingested (generation 0)", seedInstance(t, db, 0), false},
		{"ingested once", seedInstance(t, db, 1), true},
		{"ingested many times", seedInstance(t, db, 7), true},
		{"unknown instance", uuid.New(), false},
	}
	for _, c := range cases {
		got, err := store.HasManifest(ctx, c.id)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got != c.want {
			t.Errorf("%s: HasManifest = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestManifestStore_EmptyManifestOfIngestedInstanceIsValid(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()
	id := seedInstance(t, db, 1)

	has, err := store.HasManifest(ctx, id)
	if err != nil || !has {
		t.Fatalf("HasManifest = %v, %v; an ingested instance with no artifacts has a valid, empty manifest", has, err)
	}
	vis, err := store.Visible(ctx, id, []string{"anything"})
	if err != nil || len(vis) != 0 {
		t.Errorf("Visible over an empty manifest = %v, %v; want nothing", vis, err)
	}
}

func TestManifestStore_VisibleReturnsOnlyMembersOfThatInstance(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()
	a, b := seedInstance(t, db, 1), seedInstance(t, db, 1)

	seedProjection(t, db, a, "object", "a/x", "a/y")
	seedProjection(t, db, b, "object", "b/x", "a/y") // b lists a key that a also lists
	seedProjection(t, db, a, "relationship", "a/x")  // same string, other kind

	got, err := store.Visible(ctx, a, []string{"a/x", "a/y", "a/missing", "b/x"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a/x", "a/y"}; !equal(sorted(got), want) {
		t.Errorf("Visible(a) = %v, want %v", sorted(got), want)
	}

	got, err = store.Visible(ctx, b, []string{"a/x", "a/y", "b/x"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a/y", "b/x"}; !equal(sorted(got), want) {
		t.Errorf("Visible(b) = %v, want %v", sorted(got), want)
	}
}

func TestManifestStore_VisibleRelationshipsUsesTheRelationshipKind(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()
	id := seedInstance(t, db, 1)

	tuple := ingest.RelationshipKey("depends_on", "p/a", "p/b")
	seedProjection(t, db, id, "relationship", tuple)
	seedProjection(t, db, id, "object", "p/a")

	got, err := store.VisibleRelationships(ctx, id, []string{tuple, "p/a", ingest.RelationshipKey("depends_on", "p/b", "p/a")})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{tuple}; !equal(sorted(got), want) {
		t.Errorf("VisibleRelationships = %v, want %v", sorted(got), want)
	}

	if objs, _ := store.Visible(ctx, id, []string{tuple}); len(objs) != 0 {
		t.Errorf("a relationship tuple was reported visible as an object: %v", objs)
	}
}

func TestManifestStore_VisibleWithNoKeysAsksNothing(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()
	id := seedInstance(t, db, 1)

	for _, keys := range [][]string{nil, {}} {
		got, err := store.Visible(ctx, id, keys)
		if err != nil || len(got) != 0 {
			t.Errorf("Visible(%v) = %v, %v; want empty and no error", keys, got, err)
		}
	}
}

func TestManifestStore_VisibleHandlesLargeKeyLists(t *testing.T) {
	db := database.TestDB(t)
	store := ingest.NewManifestStore(db)
	ctx := context.Background()
	id := seedInstance(t, db, 1)

	keys := make([]string, 5000)
	for i := range keys {
		keys[i] = ingest.ScopedKey(id, "k"+uuid.NewString())
	}
	seedProjection(t, db, id, "object", keys[0], keys[4999])

	got, err := store.Visible(ctx, id, keys)
	if err != nil {
		t.Fatalf("Visible over %d keys: %v", len(keys), err)
	}
	if len(got) != 2 {
		t.Errorf("Visible returned %d keys, want 2", len(got))
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestManifestStore_ProjectionCountsAreOfThatInstanceOnly(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	a, b := seedInstance(t, db, 1), seedInstance(t, db, 1)
	seedProjection(t, db, a, "relationship",
		ingest.RelationshipKey("depends_on", "p/x", "p/y"),
		ingest.RelationshipKey("depends_on", "p/y", "p/z"),
		ingest.RelationshipKey("contributes_to", "p/x", "p/v"))
	seedProjection(t, db, a, "object", "p/x", "p/y")
	seedProjection(t, db, b, "object", "q/x", "q/y", "q/z")
	seedProjection(t, db, b, "relationship", ingest.RelationshipKey("depends_on", "q/x", "q/y"))

	objects, rels, err := ingest.NewManifestStore(db).ProjectionCounts(ctx, a)
	if err != nil {
		t.Fatal(err)
	}
	if objects != 2 || len(rels) != 2 || rels["depends_on"] != 2 || rels["contributes_to"] != 1 {
		t.Errorf("counts = %d objects, %v; want 2 objects, depends_on 2, contributes_to 1, nothing of B", objects, rels)
	}
	if o, r, err := ingest.NewManifestStore(db).ProjectionCounts(ctx, uuid.New()); err != nil || o != 0 || len(r) != 0 {
		t.Errorf("unknown instance: %d, %v, %v", o, r, err)
	}
}
