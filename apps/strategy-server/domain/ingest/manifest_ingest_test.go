package ingest_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// fakeExporter returns fixed YAML files, standing in for strategy.Service.
type fakeExporter struct {
	files []ingest.ExportFile
	err   error
}

func (e *fakeExporter) ExportInstance(context.Context, uuid.UUID) (*ingest.ExportResult, error) {
	if e.err != nil {
		return nil, e.err
	}
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

func northStarFile() ingest.ExportFile {
	return ingest.ExportFile{RelPath: "READY/00_north_star.yaml", ArtifactKey: "north_star", Content: northStarYAML}
}

func insightFile() ingest.ExportFile {
	return ingest.ExportFile{RelPath: "READY/01_insight_analyses.yaml", ArtifactKey: "insight_analyses", Content: insightYAML}
}

// withTwoLayers adds a north star and insight analyses artifact and wires an
// exporter that decomposes them.
func (f *fixture) withTwoLayers(t *testing.T, inst uuid.UUID) *fakeExporter {
	t.Helper()
	f.addArtifact(t, inst, "north_star", "north_star", map[string]any{"name": "NS"})
	f.addArtifact(t, inst, "insight_analyses", "insight_analyses", map[string]any{"name": "Insights"})
	ex := &fakeExporter{files: []ingest.ExportFile{northStarFile(), insightFile()}}
	f.svc.SetExporter(ex)
	return ex
}

func (f *fixture) classify(t *testing.T, inst uuid.UUID, key, class, ref string) {
	t.Helper()
	if class == "" {
		mustExec(t, f.db, "UPDATE strategy_artifacts SET integrity_class = NULL, integrity_ref = NULL WHERE instance_id = ? AND artifact_key = ?", inst, key)
		return
	}
	mustExec(t, f.db, "UPDATE strategy_artifacts SET integrity_class = ?, integrity_ref = ? WHERE instance_id = ? AND artifact_key = ?", class, ref, inst, key)
}

// projectionKeys reads the stored manifest of an instance.
func (f *fixture) projectionKeys(t *testing.T, inst uuid.UUID, kind string) []string {
	t.Helper()
	var out []string
	if err := f.db.NewRaw("SELECT key FROM memory_projection WHERE instance_id = ? AND kind = ?", inst, kind).
		Scan(context.Background(), &out); err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	sort.Strings(out) // byte order, not the database collation
	return out
}

func objectsOf(f *fixture, inst uuid.UUID) []memory.Object {
	var out []memory.Object
	for _, o := range f.mem.Objects() {
		if hasLabel(&o, "instance:"+inst.String()) {
			out = append(out, o)
		}
	}
	return out
}

func layer(o memory.Object) string {
	switch {
	case hasLabel(&o, "layer:artifact"):
		return "artifact"
	case hasLabel(&o, "layer:decomposed"):
		return "decomposed"
	}
	return ""
}

// 9.16 and I1: every object of both layers carries the owner in key prefix,
// property and label, and nothing is written without it.
func TestIngest_BothLayersAreStampedAndNothingElseIsWritten(t *testing.T) {
	f := newFixture(t)
	f.withTwoLayers(t, f.inst)
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}

	all := f.mem.Objects()
	layers := map[string]int{}
	prefix := f.inst.String()[:8] + "/"
	for _, o := range all {
		layers[layer(o)]++
		if !strings.HasPrefix(o.Key, prefix) {
			t.Errorf("object %q lacks the instance key prefix", o.Key)
		}
		if got, _ := o.Properties["instance_id"].(string); got != f.inst.String() {
			t.Errorf("object %q instance_id = %q", o.Key, got)
		}
		if !hasLabel(&o, "instance:"+f.inst.String()) {
			t.Errorf("object %q lacks the owner label: %v", o.Key, o.Labels)
		}
	}
	if layers["artifact"] != 2 || layers["decomposed"] == 0 || layers[""] != 0 {
		t.Errorf("objects per layer = %v, want 2 artifact, >0 decomposed, none unlabelled", layers)
	}
	for _, r := range f.mem.Relationships() {
		if got, _ := r.Properties["instance_id"].(string); got != f.inst.String() {
			t.Errorf("relationship %s %s->%s lacks instance_id", r.Type, r.FromID, r.ToID)
		}
	}
	if len(f.mem.Relationships()) == 0 {
		t.Error("the decomposed layer produced no relationships; the check above is vacuous")
	}
}

// The manifest is exactly what was written, objects and relationships, and the
// read interface step 0 added sees it.
func TestIngest_ManifestEqualsWhatWasWrittenAndReadsThroughTheStore(t *testing.T) {
	f := newFixture(t)
	f.withTwoLayers(t, f.inst)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}

	written := keys(objectsOf(f, f.inst))
	sort.Strings(written)
	if got := f.projectionKeys(t, f.inst, "object"); strings.Join(got, "\n") != strings.Join(written, "\n") {
		t.Errorf("object manifest differs from Memory:\n manifest: %v\n memory:   %v", got, written)
	}

	byID := map[string]string{}
	for _, o := range f.mem.Objects() {
		byID[o.StableID()] = o.Key
	}
	var wantRels []string
	for _, r := range f.mem.Relationships() {
		wantRels = append(wantRels, ingest.RelationshipKey(r.Type, byID[r.FromID], byID[r.ToID]))
	}
	sort.Strings(wantRels)
	if got := f.projectionKeys(t, f.inst, "relationship"); strings.Join(got, "\n") != strings.Join(wantRels, "\n") {
		t.Errorf("relationship manifest differs from Memory:\n manifest: %v\n memory:   %v", got, wantRels)
	}

	store := ingest.NewManifestStore(f.db)
	if has, err := store.HasManifest(context.Background(), f.inst); err != nil || !has {
		t.Errorf("HasManifest = %v, %v; want true", has, err)
	}
	vis, err := store.Visible(context.Background(), f.inst, []string{sk(f.inst, "fd-001_a"), sk(f.inst, "nope")})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := vis[sk(f.inst, "fd-001_a")]; !ok || len(vis) != 1 {
		t.Errorf("Visible = %v, want only the written key", vis)
	}
}

func TestIngest_EachSuccessfulIngestBumpsTheGenerationByOne(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	for want := int64(1); want <= 3; want++ {
		if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
			t.Fatal(err)
		}
		if got := f.row(t, f.inst).Gen; got != want {
			t.Fatalf("generation after ingest %d = %d", want, got)
		}
	}
}

func TestIngest_InstanceWithoutArtifactsHasAnEmptyManifest(t *testing.T) {
	f := newFixture(t)
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}
	has, err := ingest.NewManifestStore(f.db).HasManifest(context.Background(), f.inst)
	if err != nil || !has {
		t.Fatalf("HasManifest = %v, %v; an ingested empty instance has a manifest", has, err)
	}
	if n := len(f.projectionKeys(t, f.inst, "object")); n != 0 {
		t.Errorf("empty instance has %d manifest rows", n)
	}
}

// 9.10: a failed ingest leaves the old manifest in force and the instance
// dirty; what the failed attempt managed to write is not in the manifest.
func TestIngest_FailedIngestKeepsTheOldManifestAndStaysDirty(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	before := f.projectionKeys(t, f.inst, "object")
	hashBefore := *f.row(t, f.inst).Hash

	f.addArtifact(t, f.inst, "feature", "fd-003_c", map[string]any{"name": "C"})
	f.addArtifact(t, f.inst, "feature", "fd-004_d", map[string]any{"name": "D"})
	f.markDirty(t, f.inst)
	f.mem.FailUpsertKeys[sk(f.inst, "fd-003_c")] = true

	if err := f.svc.ReingestInstance(ctx, f.inst); err == nil {
		t.Fatal("expected an error when an upsert fails")
	}
	if got := f.projectionKeys(t, f.inst, "object"); strings.Join(got, ",") != strings.Join(before, ",") {
		t.Errorf("manifest changed by a failed ingest:\n before %v\n after  %v", before, got)
	}
	r := f.row(t, f.inst)
	if r.Dirty == nil {
		t.Error("instance must stay dirty")
	}
	if r.Gen != 1 {
		t.Errorf("generation = %d, want 1", r.Gen)
	}
	if r.Hash == nil || *r.Hash != hashBefore {
		t.Error("content hash must be the one of the last complete ingest")
	}
	vis, err := ingest.NewManifestStore(f.db).Visible(ctx, f.inst, []string{sk(f.inst, "fd-004_d")})
	if err != nil || len(vis) != 0 {
		t.Errorf("an object written only by the failed attempt is visible: %v %v", vis, err)
	}
}

// A decomposed layer that cannot be built or written fails the ingest like any
// other write: no half-built projection.
func TestIngest_DecomposedLayerFailureAbortsWithoutTouchingTheManifest(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	ex := f.withTwoLayers(t, f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	before := f.projectionKeys(t, f.inst, "object")
	f.markDirty(t, f.inst)

	ex.err = errors.New("export unavailable")
	if err := f.svc.ReingestInstance(ctx, f.inst); err == nil {
		t.Fatal("an export failure must fail the ingest")
	}
	ex.err = nil
	r := f.row(t, f.inst)
	if r.Dirty == nil || r.Gen != 1 {
		t.Errorf("after a decomposed failure: dirty=%v gen=%d, want dirty and 1", r.Dirty, r.Gen)
	}
	if got := f.projectionKeys(t, f.inst, "object"); strings.Join(got, ",") != strings.Join(before, ",") {
		t.Error("manifest changed")
	}

	var decomposedKey string
	for _, o := range objectsOf(f, f.inst) {
		if layer(o) == "decomposed" {
			decomposedKey = o.Key
			break
		}
	}
	f.markDirty(t, f.inst)
	f.mem.FailUpsertKeys[decomposedKey] = true
	if err := f.svc.ReingestInstance(ctx, f.inst); err == nil {
		t.Fatal("a failed decomposed upsert must fail the ingest")
	}
}

// 9.11: concurrent ingests of one instance run one after the other.
func TestIngest_ConcurrentIngestsOfOneInstanceAreSerialised(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})

	gate := make(chan struct{})
	var once sync.Once
	f.mem.OnUpsert = func(string) { once.Do(func() { <-gate }) }

	errs := make(chan error, 2)
	go func() { errs <- f.svc.ReingestInstance(context.Background(), f.inst) }()
	waitFor(t, "first ingest to reach Memory", func() bool { return f.mem.Count("PUT", "/api/graph/objects/upsert") > 0 })

	second := make(chan error, 1)
	go func() { second <- f.svc.ReingestInstance(context.Background(), f.inst) }()
	select {
	case err := <-second:
		t.Fatalf("second ingest finished while the first held the lock (err=%v)", err)
	case <-time.After(300 * time.Millisecond):
	}
	if g := f.row(t, f.inst).Gen; g != 0 {
		t.Errorf("generation = %d while the first ingest is still writing", g)
	}

	close(gate)
	if err := <-errs; err != nil {
		t.Fatal(err)
	}
	if err := <-second; err != nil {
		t.Fatal(err)
	}
	if g := f.row(t, f.inst).Gen; g != 2 {
		t.Errorf("generation after two serialised ingests = %d, want 2", g)
	}
}

// 9.17: re-ingesting unchanged content sends the same object payloads, so real
// Memory's content-hash check finds nothing to version or re-embed.
func TestIngest_SecondIngestSendsIdenticalPayloads(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.withTwoLayers(t, f.inst)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.classify(t, f.inst, "north_star", "unmodified_template", "templates/north_star.yaml@2.32.1")

	upserts := func() []string {
		var out []string
		for _, r := range f.mem.Requests() {
			if r.Method == "PUT" && r.Path == "/api/graph/objects/upsert" {
				out = append(out, canonical(t, r.Body))
			}
		}
		return out
	}
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	first := upserts()
	n := len(first)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	second := upserts()[n:]
	if len(first) == 0 || len(first) != len(second) {
		t.Fatalf("upserts: first %d, second %d", len(first), len(second))
	}
	sort.Strings(first)
	sort.Strings(second)
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("payload changed between ingests:\n %s\n %s", first[i], second[i])
		}
	}
}

func canonical(t *testing.T, body string) string {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(body), &v); err != nil {
		t.Fatalf("bad body %q: %v", body, err)
	}
	out, _ := json.Marshal(v)
	return string(out)
}

func writeRequests(f *fixture) int {
	n := 0
	for _, r := range f.mem.Requests() {
		if r.Method != "GET" {
			n++
		}
	}
	return n
}

// 9.25: a second replica that finds the instance clean and ingested does no
// Memory writes at all.
func TestIngest_SecondReplicaFindingItCleanWritesNothing(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.withTwoLayers(t, f.inst)
	f.markDirty(t, f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	before := writeRequests(f)
	if before == 0 {
		t.Fatal("first ingest wrote nothing; the test would pass vacuously")
	}

	f.svc.Start(1)
	f.svc.InstanceChanged(ctx, f.inst)
	f.svc.Stop()

	if after := writeRequests(f); after != before {
		t.Errorf("a clean, ingested instance caused %d further Memory writes", after-before)
	}
}

// After the upgrade the content hash can match while no manifest exists; that
// instance must still be ingested.
func TestIngest_MatchingHashWithoutAManifestIsStillIngested(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	mustExec(t, f.db, "UPDATE strategy_instances SET memory_generation = 0 WHERE id = ?", f.inst)
	mustExec(t, f.db, "DELETE FROM memory_projection WHERE instance_id = ?", f.inst)

	f.svc.Start(1)
	f.svc.InstanceChanged(ctx, f.inst)
	f.svc.Stop()

	if g := f.row(t, f.inst).Gen; g != 1 {
		t.Errorf("generation = %d, want 1: an instance without a manifest was skipped as up to date", g)
	}
}

// 9.7: two instances with the same artifact key never touch each other's objects.
func TestIngest_SharedArtifactKeysStayWithTheirOwnInstance(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	other := f.newInstance(t, "other")
	f.addArtifact(t, f.inst, "feature", "fd-001_shared", map[string]any{"name": "A's"})
	f.addArtifact(t, other, "feature", "fd-001_shared", map[string]any{"name": "B's"})

	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.ReingestInstance(ctx, other); err != nil {
		t.Fatal(err)
	}
	a, b := f.mem.ObjectByKey(sk(f.inst, "fd-001_shared")), f.mem.ObjectByKey(sk(other, "fd-001_shared"))
	if a == nil || b == nil || a.ID == b.ID {
		t.Fatalf("expected two distinct objects, got %v and %v", a, b)
	}
	if a.Properties["name"] != "A's" || b.Properties["name"] != "B's" {
		t.Errorf("names crossed: %v / %v", a.Properties["name"], b.Properties["name"])
	}

	f.archive(t, other, "fd-001_shared")
	if err := f.svc.ReingestInstance(ctx, other); err != nil {
		t.Fatal(err)
	}
	if f.mem.ObjectByKey(sk(f.inst, "fd-001_shared")) == nil {
		t.Error("ingesting B removed A's object with the same artifact key")
	}
}

// Keys over Memory's limit are shortened; the writer keeps the original in
// source_key so readers can recover it.
func TestIngest_ShortenedKeysStoreTheOriginalAsSourceKey(t *testing.T) {
	f := newFixture(t)
	long := "fd-009_" + strings.Repeat("very_long_name_", 12)
	f.addArtifact(t, f.inst, "feature", long, map[string]any{"name": "long"})
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "short"})
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}

	scoped := ingest.ScopedKey(f.inst, long)
	if len(scoped) > 128 {
		t.Fatalf("scoped key is %d bytes", len(scoped))
	}
	o := f.mem.ObjectByKey(scoped)
	if o == nil {
		t.Fatalf("shortened object not written; have %v", keys(f.mem.Objects()))
	}
	if o.Properties["source_key"] != long {
		t.Errorf("source_key = %v, want the original key", o.Properties["source_key"])
	}
	if s := f.mem.ObjectByKey(sk(f.inst, "fd-001_a")); s == nil || s.Properties["source_key"] != nil {
		t.Errorf("an unshortened key must not carry source_key: %v", s)
	}
}

// 9.28: decomposed objects carry the class of the artifact they come from; the
// objects of an authored artifact carry no marking.
func TestIngest_DecomposedObjectsTakeTheClassOfTheirSourceArtifact(t *testing.T) {
	f := newFixture(t)
	f.withTwoLayers(t, f.inst)
	f.classify(t, f.inst, "north_star", "unmodified_template", "templates/north_star.yaml@2.32.1")
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}

	var stamped, plain int
	for _, o := range objectsOf(f, f.inst) {
		src, _ := o.Properties["source_artifact"].(string)
		isNS := src == "READY/00_north_star.yaml" || o.Key == sk(f.inst, "north_star") || o.Key == sk(f.inst, "Artifact:READY/00_north_star.yaml")
		isInsight := src == "READY/01_insight_analyses.yaml" || o.Key == sk(f.inst, "insight_analyses") || o.Key == sk(f.inst, "Artifact:READY/01_insight_analyses.yaml")
		class, _ := o.Properties["integrity_class"].(string)
		switch {
		case isNS:
			if class != "unmodified_template" || !hasLabel(&o, "integrity:unmodified_template") {
				t.Errorf("template object %q: class=%q labels=%v", o.Key, class, o.Labels)
			}
			if o.Properties["integrity_ref"] != "templates/north_star.yaml@2.32.1" {
				t.Errorf("template object %q: integrity_ref=%v", o.Key, o.Properties["integrity_ref"])
			}
			stamped++
		case isInsight:
			if class != "" || hasLabelPrefix(o, "integrity:") || o.Properties["integrity_ref"] != nil {
				t.Errorf("authored object %q carries a marking: %v %v", o.Key, o.Properties, o.Labels)
			}
			plain++
		}
	}
	if stamped < 3 || plain < 3 {
		t.Errorf("checked %d template and %d authored objects; both layers of both artifacts should be covered", stamped, plain)
	}
}

func hasLabelPrefix(o memory.Object, p string) bool {
	for _, l := range o.Labels {
		if strings.HasPrefix(l, p) {
			return true
		}
	}
	return false
}

// 9.29: a template edited into authored content loses every marking on its
// next ingest, in both layers.
func TestIngest_EditedTemplateLosesItsMarkingOnTheNextIngest(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.withTwoLayers(t, f.inst)
	f.classify(t, f.inst, "north_star", "unmodified_template", "templates/north_star.yaml@2.32.1")
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	marked := 0
	for _, o := range objectsOf(f, f.inst) {
		if o.Properties["integrity_class"] != nil {
			marked++
		}
	}
	if marked < 3 {
		t.Fatalf("setup: only %d objects were marked", marked)
	}

	f.classify(t, f.inst, "north_star", "", "")
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	for _, o := range objectsOf(f, f.inst) {
		if o.Properties["integrity_class"] != nil || o.Properties["integrity_ref"] != nil || hasLabelPrefix(o, "integrity:") {
			t.Errorf("object %q still marked after the template became authored: %v %v", o.Key, o.Properties, o.Labels)
		}
	}
}

// GC: a relationship dropped from Postgres is removed from Memory even though
// both endpoints remain; a removed endpoint takes its edges with it.
func TestIngest_GarbageCollectionRemovesDroppedRelationshipsAndOrphanedEdges(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	for _, k := range []string{"fd-001_a", "fd-002_b", "fd-003_c"} {
		f.addArtifact(t, f.inst, "feature", k, map[string]any{"name": k})
	}
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002_b")
	f.addRelationship(t, f.inst, "fd-002_b", "fd-003_c")
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if n := len(f.mem.Relationships()); n != 2 {
		t.Fatalf("setup: %d relationships", n)
	}

	mustExec(t, f.db, "DELETE FROM strategy_relationships WHERE instance_id = ? AND source_key = 'fd-001_a'", f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	rels := f.mem.Relationships()
	if len(rels) != 1 {
		t.Fatalf("after dropping one relationship: %d left, want 1", len(rels))
	}
	if got := f.projectionKeys(t, f.inst, "relationship"); len(got) != 1 {
		t.Errorf("relationship manifest = %v, want 1 row", got)
	}

	f.archive(t, f.inst, "fd-003_c")
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if n := len(f.mem.Relationships()); n != 0 {
		t.Errorf("an edge of a removed object remains: %d", n)
	}
}

// Safety net: an object that carries the instance label but is not in the
// manifest is deleted; one that does not carry it is never touched.
func TestIngest_LabelSafetyNetDeletesOwnedStrangersOnly(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.mem.AddObject(memory.Object{Type: "feature", Key: "legacy-owned", Labels: []string{"layer:artifact", "instance:" + f.inst.String()}})
	f.mem.AddObject(memory.Object{Type: "feature", Key: "legacy-nobody", Labels: []string{"layer:artifact"}})
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatal(err)
	}
	if f.mem.ObjectByKey("legacy-owned") != nil {
		t.Error("owned object outside the manifest survived")
	}
	if f.mem.ObjectByKey("legacy-nobody") == nil {
		t.Error("an object without the owner label was deleted")
	}
}

// Without an exporter the decomposed layer is not part of the projection, but
// its objects are left alone rather than deleted.
func TestIngest_WithoutAnExporterDecomposedObjectsAreNotDeleted(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.withTwoLayers(t, f.inst)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	decomposed := 0
	for _, o := range objectsOf(f, f.inst) {
		if layer(o) == "decomposed" {
			decomposed++
		}
	}
	if decomposed == 0 {
		t.Fatal("setup produced no decomposed objects")
	}

	f.svc.SetExporter(nil)
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	left := 0
	for _, o := range objectsOf(f, f.inst) {
		if layer(o) == "decomposed" {
			left++
		}
	}
	if left != decomposed {
		t.Errorf("decomposed objects %d -> %d without an exporter", decomposed, left)
	}
}

// Relationship targets are not always artifact keys. A short id resolves to the
// artifact whose key starts with it; a target that is no artifact is no edge and
// no failure.
func TestIngest_ArtifactRelationshipsResolveShortIDsAndSkipUnknownTargets(t *testing.T) {
	f := newFixture(t)
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	f.addArtifact(t, f.inst, "feature", "fd-002_b", map[string]any{"name": "B"})
	f.addRelationship(t, f.inst, "fd-001_a", "fd-002")
	f.addRelationship(t, f.inst, "fd-001_a", "Product.Some.ValuePath")
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("an unresolvable target must not fail the ingest: %v", err)
	}
	if n := len(f.mem.Relationships()); n != 1 {
		t.Fatalf("relationships = %d, want only the short-id edge", n)
	}
	got := f.projectionKeys(t, f.inst, "relationship")
	want := ingest.RelationshipKey("depends_on", sk(f.inst, "fd-001_a"), sk(f.inst, "fd-002_b"))
	if len(got) != 1 || got[0] != want {
		t.Errorf("relationship manifest = %v, want [%s]", got, want)
	}
}

// 9.8, manifest part: purging a deleted instance removes its manifest rows too.
func TestPurge_RemovesTheManifestRows(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.addArtifact(t, f.inst, "feature", "fd-001_a", map[string]any{"name": "A"})
	if err := f.svc.ReingestInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if len(f.projectionKeys(t, f.inst, "object")) == 0 {
		t.Fatal("setup: no manifest rows")
	}
	mustExec(t, f.db, "UPDATE strategy_instances SET deleted_at = now() WHERE id = ?", f.inst)
	if err := f.svc.PurgeInstance(ctx, f.inst); err != nil {
		t.Fatal(err)
	}
	if n := len(f.projectionKeys(t, f.inst, "object")) + len(f.projectionKeys(t, f.inst, "relationship")); n != 0 {
		t.Errorf("%d manifest rows remain for a purged instance", n)
	}
}

// A real instance through the whole ingest: every object it produces is
// stamped, every key fits Memory's limit, and every shortened key keeps its
// original in source_key. Skipped when the submodule is not checked out.
func TestIngest_RealInstanceIsStampedWithinTheKeyLimit(t *testing.T) {
	root, err := filepath.Abs("../../../../docs/EPF/_instances/emergent")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "_meta.yaml")); err != nil {
		t.Skipf("emergent EPF instance not checked out at %s", root)
	}
	var files []ingest.ExportFile
	if err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".yaml") {
			return err
		}
		data, rerr := os.ReadFile(p)
		if rerr != nil {
			return rerr
		}
		rel, _ := filepath.Rel(root, p)
		files = append(files, ingest.ExportFile{RelPath: filepath.ToSlash(rel), Content: string(data)})
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	f := newFixture(t)
	f.svc.SetExporter(&fakeExporter{files: files})
	if err := f.svc.ReingestInstance(context.Background(), f.inst); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	objs := objectsOf(f, f.inst)
	if len(objs) < 1000 {
		t.Fatalf("only %d objects; the instance did not decompose", len(objs))
	}
	shortened := 0
	for _, o := range objs {
		if len(o.Key) > 128 {
			t.Errorf("key of %d bytes: %s", len(o.Key), o.Key)
		}
		if got, _ := o.Properties["instance_id"].(string); got != f.inst.String() {
			t.Errorf("%s: instance_id = %q", o.Key, got)
		}
		if src, ok := o.Properties["source_key"].(string); ok {
			shortened++
			if ingest.ScopedKey(f.inst, src) != o.Key {
				t.Errorf("source_key %q does not map back to %q", src, o.Key)
			}
		}
	}
	if got, want := len(f.projectionKeys(t, f.inst, "object")), len(objs); got != want {
		t.Errorf("manifest has %d objects, Memory %d", got, want)
	}
	t.Logf("%d objects, %d relationships, %d with source_key", len(objs), len(f.mem.Relationships()), shortened)
}
