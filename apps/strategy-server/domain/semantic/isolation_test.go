package semantic_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// world is a real ingest writing into a Memory fake, read back through the
// semantic service: the write side and the read side of the fence together.
type world struct {
	db  *bun.DB
	mem *memtest.Server
	ing *ingest.Service
	sem *semantic.Service
	ws  uuid.UUID
}

func newWorld(t *testing.T) *world {
	t.Helper()
	db := database.TestDB(t)
	mem := memtest.New(t)
	w := &world{db: db, mem: mem, ws: uuid.New()}
	w.ing = ingest.NewService(db, mem.Client(t))
	w.sem = semantic.NewService(semantic.Config{URL: mem.URL, Project: "test-project", Token: "test-token"}).
		WithManifestSource(ingest.NewManifestStore(db))
	org := uuid.New()
	mustExec(t, db, "INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", org, "o-"+org.String()[:8])
	mustExec(t, db, "INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", w.ws, "ws-"+w.ws.String()[:8], org)
	return w
}

func mustExec(t *testing.T, db *bun.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), q, args...); err != nil {
		t.Fatalf("exec %q: %v", q, err)
	}
}

func (w *world) instance(t *testing.T, name string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	mustExec(t, w.db, "INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, ?)", id, w.ws, name)
	return id
}

func (w *world) artifact(t *testing.T, inst uuid.UUID, typ, key string, payload map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(payload)
	mid := uuid.New()
	mustExec(t, w.db, `INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source)
		VALUES (?, ?, ?, ?, 'create', ?, 'committed', 'system')`, mid, inst, typ, key, string(raw))
	mustExec(t, w.db, `INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
		VALUES (?, ?, ?, ?, 'active', ?, ?)`, uuid.New(), inst, typ, key, string(raw), mid)
}

func (w *world) relate(t *testing.T, inst uuid.UUID, from, to string) {
	t.Helper()
	mustExec(t, w.db, `INSERT INTO strategy_relationships (id, instance_id, source_key, source_type, target_key, target_type, relationship)
		VALUES (?, ?, ?, 'feature', ?, 'feature', 'depends_on')`, uuid.New(), inst, from, to)
}

func (w *world) classify(t *testing.T, inst uuid.UUID, key, class string) {
	t.Helper()
	mustExec(t, w.db, "UPDATE strategy_artifacts SET integrity_class = ?, integrity_ref = 'templates/x.yaml@1' WHERE instance_id = ? AND artifact_key = ?", class, inst, key)
}

func (w *world) ingestInstance(t *testing.T, inst uuid.UUID) {
	t.Helper()
	if err := w.ing.ReingestInstance(context.Background(), inst); err != nil {
		t.Fatalf("ingest %s: %v", inst, err)
	}
}

type fakeExporter struct{ files []ingest.ExportFile }

func (e *fakeExporter) ExportInstance(context.Context, uuid.UUID) (*ingest.ExportResult, error) {
	return &ingest.ExportResult{Files: e.files}, nil
}

const northStarYAML = `north_star:
  purpose:
    statement: Help Acme teams decide
  vision:
    vision_statement: Every Acme decision is traceable
`

const insightYAML = `trends:
  technology:
    - trend: Rivalco ships a cheaper tool
      impact: Price pressure
`

func (w *world) withDecomposedLayer() {
	w.ing.SetExporter(&fakeExporter{files: []ingest.ExportFile{
		{RelPath: "READY/00_north_star.yaml", ArtifactKey: "north_star", Content: northStarYAML},
		{RelPath: "READY/01_insight_analyses.yaml", ArtifactKey: "insight_analyses", Content: insightYAML},
	}})
}

func keysOf(res []*semantic.SearchResult) []string {
	var out []string
	for _, r := range res {
		out = append(out, r.ArtifactKey)
	}
	sort.Strings(out)
	return out
}

func labelsOfSearches(t *testing.T, mem *memtest.Server) [][]string {
	t.Helper()
	var out [][]string
	for _, r := range mem.Requests() {
		if r.Method == "POST" && r.Path == "/api/graph/search" {
			var req struct {
				Labels []string `json:"labels"`
			}
			if err := json.Unmarshal([]byte(r.Body), &req); err != nil {
				t.Fatalf("bad search body: %v", err)
			}
			out = append(out, req.Labels)
		}
	}
	return out
}

func readRequests(mem *memtest.Server) int {
	n := 0
	for _, r := range mem.Requests() {
		if r.Method == "GET" || r.Path == "/api/graph/search" || r.Path == "/api/graph/expand" {
			n++
		}
	}
	return n
}

// twoInstances ingests A and B, which share artifact keys and differ in text.
func twoInstances(t *testing.T, w *world) (a, b uuid.UUID) {
	t.Helper()
	a, b = w.instance(t, "a"), w.instance(t, "b")
	for _, c := range []struct {
		inst uuid.UUID
		who  string
	}{{a, "Acme"}, {b, "Rivalco"}} {
		w.artifact(t, c.inst, "north_star", "north_star", map[string]any{"name": c.who + " north star", "description": c.who + " vision"})
		w.artifact(t, c.inst, "feature", "fd-001_shared", map[string]any{"name": c.who + " shared feature"})
		w.artifact(t, c.inst, "feature", "fd-002_other", map[string]any{"name": c.who + " other feature"})
		w.relate(t, c.inst, "fd-001_shared", "fd-002_other")
	}
	w.artifact(t, b, "feature", "fd-009_b_only", map[string]any{"name": "Rivalco orphan feature"})
	w.ingestInstance(t, a)
	w.ingestInstance(t, b)
	return a, b
}

// 9.1, 9.2: no read for A returns or counts B's objects, and objects that do
// not carry A's owner stamp or are outside A's manifest are never returned.
func TestScopedReads_NeverReturnOrCountAnotherInstancesObjects(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a, b := twoInstances(t, w)
	bPrefix := b.String()[:8] + "/"

	aLabel := "instance:" + a.String()
	w.mem.AddObject(memory.Object{Type: "feature", Key: "unowned-top", Properties: map[string]any{"name": "no owner at all"}})
	w.mem.AddObject(memory.Object{Type: "feature", Key: ingest.ScopedKey(a, "forged"), Labels: []string{aLabel, "layer:artifact"},
		Properties: map[string]any{"name": "labelled for A, no instance_id"}})
	w.mem.AddObject(memory.Object{Type: "feature", Key: ingest.ScopedKey(a, "fd-777_stale"), Labels: []string{aLabel, "layer:artifact"},
		Properties: map[string]any{"name": "A's leftover", "instance_id": a.String(), "artifact_type": "feature"}})
	w.mem.AddObject(memory.Object{Type: "feature", Key: ingest.ScopedKey(a, "mislabelled"), Labels: []string{aLabel, "layer:artifact"},
		Properties: map[string]any{"name": "A's label, B's property", "instance_id": b.String()}})
	for _, k := range []string{"unowned-top", ingest.ScopedKey(a, "forged"), ingest.ScopedKey(a, "fd-777_stale"), ingest.ScopedKey(a, "mislabelled")} {
		w.mem.Scores[k] = 0.99
	}

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "feature", 50)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"fd-001_shared", "fd-002_other", "north_star"}
	if got := keysOf(out.Results); !reflect.DeepEqual(got, want) {
		t.Errorf("search results = %v, want exactly A's own %v", got, want)
	}
	for _, r := range out.Results {
		if r.InstanceID != a.String() {
			t.Errorf("hit %s carries instance_id %q", r.ArtifactKey, r.InstanceID)
		}
		if strings.Contains(r.Snippet, "Rivalco") || strings.HasPrefix(r.ArtifactKey, bPrefix) {
			t.Errorf("a hit of the other instance leaked: %+v", r)
		}
	}
	for _, labels := range labelsOfSearches(t, w.mem) {
		if len(labels) != 1 || labels[0] != aLabel {
			t.Errorf("a search was sent with labels %v, want exactly [%s]", labels, aLabel)
		}
	}

	nb, err := w.sem.GetNeighbors(ctx, a.String(), "fd-001_shared")
	if err != nil {
		t.Fatal(err)
	}
	if len(nb) != 1 || nb[0].NodeKey != "fd-002_other" || nb[0].EdgeDir != "outbound" {
		t.Errorf("neighbours of A's fd-001_shared = %+v, want only fd-002_other", nb)
	}
	nbB, err := w.sem.GetNeighbors(ctx, a.String(), "fd-009_b_only")
	if err != nil || len(nbB) != 0 {
		t.Errorf("a key only B has must read as a missing node: %+v, %v", nbB, err)
	}

	cs, err := w.sem.DetectContradictions(ctx, a.String())
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cs {
		if strings.Contains(c.Description, "fd-009_b_only") || strings.Contains(c.Description, "forged") || strings.Contains(c.Description, "stale") {
			t.Errorf("contradiction about an object that is not A's projection: %s", c.Description)
		}
	}
	if len(cs) != 1 || !strings.Contains(c0(cs), "north_star") {
		t.Errorf("contradictions of A = %v, want only the unconnected north_star", cs)
	}

	st, err := w.sem.GraphStats(ctx, a.String())
	if err != nil {
		t.Fatal(err)
	}
	if st.NodeCount != 3 {
		t.Errorf("A's node count = %d, want 3: B's objects, unowned and stale objects are not counted", st.NodeCount)
	}
	if st.EdgeCount != 1 || st.DependsOnEdges != 1 {
		t.Errorf("A's edges = %d (depends_on %d), want its own single relationship and not B's", st.EdgeCount, st.DependsOnEdges)
	}
}

func c0(cs []*semantic.Contradiction) string {
	if len(cs) == 0 {
		return ""
	}
	return cs[0].Description
}

// 9.14: an instance without a manifest reads as not ready from every semantic
// read, touches no data of anyone, and an ingested empty instance is ready.
func TestScopedReads_InstanceWithoutManifestIsNotReady(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a, _ := twoInstances(t, w)
	fresh := w.instance(t, "never ingested")
	w.artifact(t, fresh, "north_star", "north_star", map[string]any{"name": "pending"})
	before := readRequests(w.mem)

	if _, err := w.sem.SearchStrategyScoped(ctx, fresh.String(), "x", 5); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("search: %v, want ErrGraphNotReady", err)
	}
	if _, err := w.sem.GetNeighbors(ctx, fresh.String(), "north_star"); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("neighbours: %v", err)
	}
	if _, err := w.sem.DetectContradictions(ctx, fresh.String()); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("contradictions: %v", err)
	}
	if _, err := w.sem.GraphStats(ctx, fresh.String()); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("stats: %v", err)
	}
	if _, err := w.sem.ScopedGraph(fresh).Search(ctx, "x", 5, nil); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("scoped graph search: %v", err)
	}
	if after := readRequests(w.mem); after != before {
		t.Errorf("a not-ready instance caused %d reads against Memory", after-before)
	}

	empty := w.instance(t, "ingested, no artifacts")
	w.ingestInstance(t, empty)
	out, err := w.sem.SearchStrategyScoped(ctx, empty.String(), "x", 5)
	if err != nil || len(out.Results) != 0 {
		t.Errorf("an ingested empty instance: %v, %v; want an empty result and no error", out, err)
	}
	if _, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 5); err != nil {
		t.Errorf("an ingested instance must stay readable: %v", err)
	}
}

func TestScopedReads_RejectAnInstanceIDThatIsNotAUUID(t *testing.T) {
	w := newWorld(t)
	if _, err := w.sem.SearchStrategyScoped(context.Background(), "inst-1", "x", 5); err == nil || errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("err = %v, want a bad-request error", err)
	}
}

// 9.13: hits say which instance and layer they came from and, for decomposed
// objects, the file; limit is filled when stale same-instance hits rank first.
func TestSearch_HitsCarryProvenanceAndFillTheLimitPastStaleHits(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	w.withDecomposedLayer()
	a := w.instance(t, "a")
	w.artifact(t, a, "north_star", "north_star", map[string]any{"name": "North star"})
	w.artifact(t, a, "insight_analyses", "insight_analyses", map[string]any{"name": "Insights"})
	for _, k := range []string{"fd-001_a", "fd-002_b", "fd-003_c", "fd-004_d"} {
		w.artifact(t, a, "feature", k, map[string]any{"name": k})
	}
	w.ingestInstance(t, a)
	for _, k := range []string{"fd-771_stale", "fd-772_stale"} {
		w.mem.AddObject(memory.Object{Type: "feature", Key: ingest.ScopedKey(a, k), Labels: []string{"layer:artifact", "instance:" + a.String()},
			Properties: map[string]any{"name": k, "instance_id": a.String(), "artifact_type": "feature"}})
		w.mem.Scores[ingest.ScopedKey(a, k)] = 0.99
	}

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "anything", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 3 {
		t.Fatalf("got %d results, want the limit of 3 although two stale hits rank first", len(out.Results))
	}
	if out.ExcludedNotInGraph != 2 {
		t.Errorf("excluded_not_in_graph = %d, want the 2 stale hits", out.ExcludedNotInGraph)
	}

	all, err := w.sem.SearchStrategyScoped(ctx, a.String(), "anything", 50)
	if err != nil {
		t.Fatal(err)
	}
	layers := map[string]int{}
	for _, r := range all.Results {
		layers[r.Layer]++
		switch r.Layer {
		case "artifact":
			if r.Artifact == "" || r.InstanceID != a.String() {
				t.Errorf("artifact-layer hit lacks provenance: %+v", r)
			}
		case "decomposed":
			if r.SourceArtifact == "" || r.InstanceID != a.String() {
				t.Errorf("decomposed hit lacks source_artifact: %+v", r)
			}
		default:
			t.Errorf("hit %s has layer %q", r.ArtifactKey, r.Layer)
		}
	}
	if layers["artifact"] == 0 || layers["decomposed"] == 0 {
		t.Errorf("layers seen = %v, want both", layers)
	}
	raw, _ := json.Marshal(all.Results[0])
	for _, f := range []string{`"instance_id"`, `"layer"`} {
		if !strings.Contains(string(raw), f) {
			t.Errorf("serialised hit lacks %s: %s", f, raw)
		}
	}
}

// 9.30, 9.31: framework hits of both layers are dropped and counted, authored
// hits are returned, and the page is still filled when framework hits rank first.
func TestSearch_DropsFrameworkHitsOfBothLayersAndStillFillsThePage(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	w.withDecomposedLayer()
	a := w.instance(t, "a")
	w.artifact(t, a, "north_star", "north_star", map[string]any{"name": "Template north star"})
	w.artifact(t, a, "insight_analyses", "insight_analyses", map[string]any{"name": "Authored insights"})
	for _, k := range []string{"fd-001_a", "fd-002_b", "fd-003_c"} {
		w.artifact(t, a, "feature", k, map[string]any{"name": k})
	}
	w.classify(t, a, "north_star", "unmodified_template")
	w.ingestInstance(t, a)

	var framework int
	for _, o := range w.mem.Objects() {
		if o.Properties["integrity_class"] == "unmodified_template" {
			framework++
			w.mem.Scores[o.Key] = 0.99
		}
	}
	if framework < 3 {
		t.Fatalf("setup: only %d framework objects, want the artifact and decomposed ones", framework)
	}

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 50)
	if err != nil {
		t.Fatal(err)
	}
	if out.ExcludedFramework != framework {
		t.Errorf("excluded_framework = %d, want %d", out.ExcludedFramework, framework)
	}
	for _, r := range out.Results {
		if strings.Contains(r.ArtifactKey, "north_star") && r.Layer == "artifact" {
			t.Errorf("framework artifact returned: %+v", r)
		}
		if strings.Contains(r.Snippet, "Acme teams decide") {
			t.Errorf("framework decomposed object returned: %+v", r)
		}
	}
	if len(out.Results) == 0 {
		t.Fatal("authored hits were dropped with the framework ones")
	}

	page, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 4)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Results) != 4 {
		t.Errorf("got %d results, want 4: framework hits rank first and must not starve the page", len(page.Results))
	}
}

// A template edited into authored content is returned again after its next ingest.
func TestSearch_AnEditedTemplateIsReturnedAgain(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a := w.instance(t, "a")
	w.artifact(t, a, "north_star", "north_star", map[string]any{"name": "North star"})
	w.classify(t, a, "north_star", "unmodified_template")
	w.ingestInstance(t, a)
	if out, _ := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 5); len(out.Results) != 0 {
		t.Fatalf("a template was returned: %v", keysOf(out.Results))
	}
	mustExec(t, w.db, "UPDATE strategy_artifacts SET integrity_class = NULL, integrity_ref = NULL WHERE instance_id = ?", a)
	w.ingestInstance(t, a)
	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 5)
	if err != nil || len(out.Results) != 1 {
		t.Fatalf("after editing: %v, %v; want the north star back", keysOf(out.Results), err)
	}
}

// A shortened key reads back as the original, in search and in neighbours.
func TestScopedReads_ShortenedKeysReadBackAsTheOriginal(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a := w.instance(t, "a")
	long := "fd-009_" + strings.Repeat("very_long_name_", 12)
	w.artifact(t, a, "feature", long, map[string]any{"name": "long"})
	w.artifact(t, a, "feature", "fd-001_short", map[string]any{"name": "short"})
	w.relate(t, a, long, "fd-001_short")
	w.ingestInstance(t, a)

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 10)
	if err != nil {
		t.Fatal(err)
	}
	if got := keysOf(out.Results); !reflect.DeepEqual(got, []string{"fd-001_short", long}) && !reflect.DeepEqual(got, []string{long, "fd-001_short"}) {
		t.Errorf("keys = %v, want the original long key back", got)
	}
	nb, err := w.sem.GetNeighbors(ctx, a.String(), long)
	if err != nil || len(nb) != 1 || nb[0].NodeKey != "fd-001_short" {
		t.Errorf("neighbours of the long key = %+v, %v", nb, err)
	}
}

// Edges that are not part of the projection do not connect an object, and an
// object whose only edge is stale is reported as unconnected.
func TestDetectContradictions_ADroppedRelationshipLeavesBothEndsUnconnected(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a := w.instance(t, "a")
	w.artifact(t, a, "feature", "fd-001_a", map[string]any{"name": "A"})
	w.artifact(t, a, "feature", "fd-002_b", map[string]any{"name": "B"})
	w.relate(t, a, "fd-001_a", "fd-002_b")
	w.ingestInstance(t, a)
	if cs, _ := w.sem.DetectContradictions(ctx, a.String()); len(cs) != 0 {
		t.Fatalf("connected objects reported: %v", cs)
	}

	// The edge stays in Memory but leaves the manifest.
	mustExec(t, w.db, "DELETE FROM memory_projection WHERE instance_id = ? AND kind = 'relationship'", a)
	cs, err := w.sem.DetectContradictions(ctx, a.String())
	if err != nil || len(cs) != 2 {
		t.Fatalf("contradictions = %v, %v; want both objects unconnected", cs, err)
	}
	nb, err := w.sem.GetNeighbors(ctx, a.String(), "fd-001_a")
	if err != nil || len(nb) != 0 {
		t.Errorf("a relationship outside the manifest was returned as a neighbour: %+v, %v", nb, err)
	}
}

func scaffoldInstance(t *testing.T, w *world, name, northStarKey string) uuid.UUID {
	t.Helper()
	id := w.instance(t, name)
	w.artifact(t, id, "north_star", northStarKey, map[string]any{"name": name + " north star"})
	w.artifact(t, id, "feature", "fd-001_x", map[string]any{"name": "x"})
	w.ingestInstance(t, id)
	return id
}

// 9.12, 9.27: vision connectivity comes from the instance's own north star,
// found by artifact type, whatever its key is; another instance's north star
// does not count; B's data does not change A's signals.
func TestGraphStats_VisionConnectedFollowsTheInstancesOwnNorthStar(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()

	scaffolded := scaffoldInstance(t, w, "scaffolded", "north_star")
	imported := scaffoldInstance(t, w, "imported", "READY/00_north_star")
	noStar := w.instance(t, "no north star")
	w.artifact(t, noStar, "feature", "fd-001_x", map[string]any{"name": "x"})
	w.ingestInstance(t, noStar)

	for name, id := range map[string]uuid.UUID{"scaffolded": scaffolded, "imported": imported} {
		st, err := w.sem.GraphStats(ctx, id.String())
		if err != nil {
			t.Fatal(err)
		}
		if !st.VisionConnected {
			t.Errorf("%s: vision connected = false, want true", name)
		}
	}
	st, err := w.sem.GraphStats(ctx, noStar.String())
	if err != nil {
		t.Fatal(err)
	}
	if st.VisionConnected {
		t.Error("an instance with no north star is vision-connected because another instance has one")
	}
}

func TestGraphStats_AreIndependentOfOtherInstances(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a := scaffoldInstance(t, w, "a", "north_star")
	before, err := w.sem.GraphStats(ctx, a.String())
	if err != nil {
		t.Fatal(err)
	}
	b := w.instance(t, "b")
	for i := 0; i < 5; i++ {
		w.artifact(t, b, "feature", "fd-00"+string(rune('1'+i))+"_b", map[string]any{"name": "b"})
	}
	w.ingestInstance(t, b)
	after, err := w.sem.GraphStats(ctx, a.String())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Errorf("A's signals changed when B was ingested:\n before %+v\n after  %+v", before, after)
	}
}

// 9.26: ripple reads through the scoped graph with unscoped keys, so it still
// finds an artifact in its own search results after keys are prefixed, and never
// sees another instance's objects.
func TestScopedGraph_FindsOwnArtifactsByUnscopedKeyAndNothingElse(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a, b := twoInstances(t, w)
	w.mem.Scores[ingest.ScopedKey(b, "fd-001_shared")] = 0.99
	w.mem.Scores[ingest.ScopedKey(a, "fd-001_shared")] = 0.8

	g := w.sem.ScopedGraph(a)
	hits, err := g.Search(ctx, "shared feature", 10, nil)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, h := range hits {
		if h.Key == "fd-001_shared" {
			found = true
			if h.Score != 0.8 {
				t.Errorf("score = %v, want A's own 0.8 and not B's 0.99", h.Score)
			}
		}
		if h.Key == "fd-009_b_only" {
			t.Error("B's object was returned")
		}
	}
	if !found || len(hits) != 3 {
		t.Errorf("hits = %+v, want A's 3 objects including fd-001_shared by its unscoped key", hits)
	}
	if only, err := g.Search(ctx, "x", 10, []string{"north_star"}); err != nil || len(only) != 1 || only[0].Key != "north_star" {
		t.Errorf("type filter: %+v, %v", only, err)
	}
	for _, labels := range labelsOfSearches(t, w.mem) {
		if len(labels) != 1 || labels[0] != "instance:"+a.String() {
			t.Errorf("a scoped graph search used labels %v", labels)
		}
	}

	nodes, ok, err := g.Neighborhood(ctx, "fd-001_shared", 2, 50)
	if err != nil || !ok {
		t.Fatalf("neighbourhood: %v %v", ok, err)
	}
	var keys []string
	for _, n := range nodes {
		keys = append(keys, n.Key)
	}
	sort.Strings(keys)
	if !reflect.DeepEqual(keys, []string{"fd-001_shared", "fd-002_other"}) {
		t.Errorf("neighbourhood = %v, want A's two connected features by unscoped key", keys)
	}
	if _, ok, _ := g.Neighborhood(ctx, "fd-009_b_only", 2, 50); ok {
		t.Error("a key that only B has was found through A's graph")
	}
}

// The scan pages through everything the instance has, not just the first page.
func TestDetectContradictions_ScansEveryPageOfAnInstance(t *testing.T) {
	w := newWorld(t)
	a := w.instance(t, "big")
	const n = 450
	for i := 0; i < n; i++ {
		w.artifact(t, a, "feature", "fd-"+strings.Repeat("0", 3-len(itoa(i%1000)))+itoa(i)+"_x", map[string]any{"name": "x"})
	}
	w.ingestInstance(t, a)
	cs, err := w.sem.DetectContradictions(context.Background(), a.String())
	if err != nil {
		t.Fatal(err)
	}
	if len(cs) != n {
		t.Errorf("contradictions = %d, want %d unconnected objects across several pages", len(cs), n)
	}
}

func itoa(i int) string {
	b, _ := json.Marshal(i)
	return string(b)
}

// The owner label and the instance_id property are each checked in the server,
// not only trusted from Memory's filter: an object that is in the manifest but
// lacks either is not returned. Both objects here are in A's manifest, so
// nothing but those two checks keeps them out.
func TestScopedReads_OwnerLabelAndPropertyAreCheckedEvenForManifestMembers(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	a, b := twoInstances(t, w)
	aLabel := "instance:" + a.String()

	wrongProp := ingest.ScopedKey(a, "wrong-property")
	w.mem.AddObject(memory.Object{Type: "feature", Key: wrongProp, Labels: []string{aLabel, "layer:artifact"},
		Properties: map[string]any{"instance_id": b.String(), "name": "labelled for A, owned by B"}})
	noLabel := ingest.ScopedKey(a, "no-label")
	w.mem.AddObject(memory.Object{Type: "feature", Key: noLabel, Labels: []string{"layer:artifact"},
		Properties: map[string]any{"instance_id": a.String(), "name": "A's property, no owner label"}})
	for _, k := range []string{wrongProp, noLabel} {
		mustExec(t, w.db, "INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'object', ?)", a, k)
		w.mem.Scores[k] = 0.99
	}

	out, err := w.sem.SearchStrategyScoped(ctx, a.String(), "x", 50)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range out.Results {
		if r.ArtifactKey == "wrong-property" {
			t.Error("an object whose instance_id names another instance was returned")
		}
	}
	// Neighbours look the root up by key, which sends no label filter.
	nb, err := w.sem.GetNeighbors(ctx, a.String(), "no-label")
	if err != nil || len(nb) != 0 {
		t.Errorf("neighbours of an object without the owner label: %+v, %v", nb, err)
	}
	root, ok, err := w.sem.ScopedGraph(a).Neighborhood(ctx, "no-label", 1, 10)
	if err != nil || ok || len(root) != 0 {
		t.Errorf("the scoped graph found an object without the owner label: %v %v %v", root, ok, err)
	}
	if out.ExcludedOtherInstance < 1 {
		t.Errorf("the dropped object was not counted: %+v", out)
	}
}
