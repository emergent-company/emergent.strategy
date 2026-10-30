package semantic_test

import (
	"context"
	"os"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// Section 8 of the fence change: the same ingest and scoped reads as the fake
// based tests, against a real Memory. Gated, because it writes to a Memory
// project that must be empty. Set FENCE_REAL_MEMORY_URL, _PROJECT and _TOKEN.
func realMemory(t *testing.T) (*memory.Client, semantic.Config) {
	t.Helper()
	url, project, token := os.Getenv("FENCE_REAL_MEMORY_URL"), os.Getenv("FENCE_REAL_MEMORY_PROJECT"), os.Getenv("FENCE_REAL_MEMORY_TOKEN")
	if url == "" || project == "" || token == "" {
		t.Skip("set FENCE_REAL_MEMORY_URL, FENCE_REAL_MEMORY_PROJECT and FENCE_REAL_MEMORY_TOKEN to run against a real Memory")
	}
	cl, err := memory.New(memory.Config{BaseURL: url, ProjectID: project, Token: token, AuthMode: memory.AuthModeAPIKey})
	if err != nil {
		t.Fatal(err)
	}
	return cl, semantic.Config{URL: url, Project: project, Token: token, AuthMode: "api-key"}
}

func versionsByKey(t *testing.T, cl *memory.Client, inst uuid.UUID) map[string]int {
	t.Helper()
	out := map[string]int{}
	cursor := ""
	for {
		page, err := cl.ListObjects(context.Background(), memory.ListObjectsOptions{Label: "instance:" + inst.String(), Cursor: cursor, Limit: 200})
		if err != nil {
			t.Fatal(err)
		}
		for _, o := range page.Items {
			out[o.Key] = o.Version
		}
		if page.NextCursor == "" {
			return out
		}
		cursor = page.NextCursor
	}
}

func TestRealMemory_IngestThenScopedReads(t *testing.T) {
	cl, cfg := realMemory(t)
	ctx := context.Background()
	db := database.TestDB(t)
	w := &world{db: db, ws: uuid.New()}
	w.ing = ingest.NewService(db, cl)
	w.sem = semantic.NewService(cfg).WithManifestSource(ingest.NewManifestStore(db))
	org := uuid.New()
	mustExec(t, db, "INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", org, "o-"+org.String()[:8])
	mustExec(t, db, "INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", w.ws, "ws-"+w.ws.String()[:8], org)
	w.withDecomposedLayer()

	a, b := w.instance(t, "a"), w.instance(t, "b")
	for _, c := range []struct {
		inst uuid.UUID
		who  string
	}{{a, "Acme"}, {b, "Rivalco"}} {
		w.artifact(t, c.inst, "north_star", "north_star", map[string]any{"name": c.who + " north star", "description": c.who + " vision"})
		w.artifact(t, c.inst, "feature", "fd-001_shared", map[string]any{"name": c.who + " shared feature"})
		w.artifact(t, c.inst, "feature", "fd-002_other", map[string]any{"name": c.who + " other feature"})
		w.artifact(t, c.inst, "feature", "fd-003_alone", map[string]any{"name": c.who + " feature with no edges"})
		w.relate(t, c.inst, "fd-001_shared", "fd-002_other")
	}
	t.Cleanup(func() {
		if os.Getenv("FENCE_REAL_MEMORY_KEEP") != "" {
			t.Logf("kept: instance A %s, instance B %s", a, b)
			return
		}
		_ = w.ing.PurgeInstance(context.Background(), a)
		_ = w.ing.PurgeInstance(context.Background(), b)
	})

	start := time.Now()
	w.ingestInstance(t, a)
	w.ingestInstance(t, b)
	t.Logf("ingest of two instances: %v", time.Since(start))

	before := versionsByKey(t, cl, a)
	t.Logf("instance A holds %d objects in Memory", len(before))

	// Unchanged re-ingest must not create new versions.
	start = time.Now()
	w.ingestInstance(t, a)
	t.Logf("unchanged re-ingest of A: %v", time.Since(start))
	after := versionsByKey(t, cl, a)
	var bumped []string
	for k, v := range after {
		if before[k] != v {
			bumped = append(bumped, k)
		}
	}
	sort.Strings(bumped)
	if len(bumped) > 0 || len(after) != len(before) {
		t.Errorf("an unchanged re-ingest changed %d of %d objects (count %d -> %d): %v", len(bumped), len(before), len(before), len(after), bumped)
	}

	nb, err := w.sem.GetNeighbors(ctx, a.String(), "fd-001_shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("neighbours of fd-001_shared on real Memory: %+v", nb)
	if len(nb) != 1 || nb[0].NodeKey != "fd-002_other" {
		t.Errorf("neighbours = %+v, want fd-002_other (empty means Expand does not report the edge)", nb)
	}

	cs, err := w.sem.DetectContradictions(ctx, a.String())
	if err != nil {
		t.Fatal(err)
	}
	var orphans []string
	for _, c := range cs {
		orphans = append(orphans, c.Description)
	}
	sort.Strings(orphans)
	t.Logf("contradictions: %v", orphans)
	if len(cs) != 2 {
		t.Errorf("got %d orphans, want fd-003_alone and north_star", len(cs))
	}

	start = time.Now()
	st, err := w.sem.GraphStats(ctx, a.String())
	t.Logf("GraphStats: %v, %+v, err=%v", time.Since(start), st, err)
	if err != nil {
		t.Fatal(err)
	}
	if !st.VisionConnected {
		t.Error("vision connected is false for an instance with a north star")
	}

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "Rivalco shared feature", 20)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range out.Results {
		t.Logf("search hit: %s (%s) layer=%s score=%.3f", r.ArtifactKey, r.ArtifactType, r.Layer, r.Score)
		if r.InstanceID != a.String() {
			t.Errorf("hit %s belongs to %q", r.ArtifactKey, r.InstanceID)
		}
	}
	t.Logf("search: %d hits, excluded framework=%d not_owned=%d not_in_graph=%d", len(out.Results), out.ExcludedFramework, out.ExcludedOtherInstance, out.ExcludedNotInGraph)

	g := w.sem.ScopedGraph(a)
	nodes, ok, err := g.Neighborhood(ctx, "fd-001_shared", 2, 50)
	t.Logf("scoped neighbourhood: %+v ok=%v err=%v", nodes, ok, err)
	if err != nil || !ok || len(nodes) != 2 {
		t.Errorf("scoped neighbourhood = %+v %v %v, want fd-001_shared and fd-002_other", nodes, ok, err)
	}
	if _, ok, _ := g.Neighborhood(ctx, "fd-009_nothing", 1, 10); ok {
		t.Error("an unknown key was found")
	}
}
