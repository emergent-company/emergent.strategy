package semantic_test

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
)

// realExporter is the exporter the server wires in: the stored artifacts,
// written back out as the files the decomposer reads.
type realExporter struct{ svc *strategy.Service }

func (e realExporter) ExportInstance(ctx context.Context, id uuid.UUID) (*ingest.ExportResult, error) {
	res, err := e.svc.ExportInstance(ctx, id)
	if err != nil {
		return nil, err
	}
	files := make([]ingest.ExportFile, len(res.Files))
	for i, f := range res.Files {
		files[i] = ingest.ExportFile{RelPath: f.RelPath, ArtifactKey: f.ArtifactKey, Content: f.Content}
	}
	return &ingest.ExportResult{Files: files}, nil
}

// readable is what a client sees of the instance: every hit of a scoped search,
// with its key and its snippet.
func readable(t *testing.T, w *world, inst uuid.UUID) map[string]string {
	t.Helper()
	out, err := w.sem.SearchStrategyScoped(context.Background(), inst.String(), "anything", 100)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	seen := map[string]string{}
	for _, r := range out.Results {
		seen[r.ArtifactKey] = r.Snippet
	}
	return seen
}

func keysOfMap(m map[string]string) []string {
	var ks []string
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

// A change of the stored artifacts reaches the reads with the next ingest and
// nothing of the old state remains readable (AC3, AC4).

func TestFreshness_ARemovedArtifactIsNoLongerReadableAfterTheIngest(t *testing.T) {
	w := newWorld(t)
	inst := w.instance(t, "fresh")
	w.artifact(t, inst, "feature", "fd-001_stays", map[string]any{"name": "stays"})
	w.artifact(t, inst, "feature", "fd-002_goes", map[string]any{"name": "goes away"})
	w.ingestInstance(t, inst)
	if got := keysOfMap(readable(t, w, inst)); strings.Join(got, ",") != "fd-001_stays,fd-002_goes" {
		t.Fatalf("before the change: %v", got)
	}

	mustExec(t, w.db, "UPDATE strategy_artifacts SET status = 'archived' WHERE instance_id = ? AND artifact_key = 'fd-002_goes'", inst)
	mustExec(t, w.db, "UPDATE strategy_instances SET memory_dirty_since = now(), memory_change_seq = memory_change_seq + 1 WHERE id = ?", inst)
	w.ingestInstance(t, inst)

	got := readable(t, w, inst)
	if _, ok := got["fd-002_goes"]; ok {
		t.Errorf("the removed artifact is still readable: %v", keysOfMap(got))
	}
	if w.mem.ObjectByKey(ingest.ScopedKey(inst, "fd-002_goes")) != nil {
		t.Error("the removed artifact's object is still in Memory")
	}
	if _, ok := got["fd-001_stays"]; !ok {
		t.Errorf("the artifact that stayed is gone: %v", keysOfMap(got))
	}
}

func TestFreshness_AChangedArtifactReadsAsNewContentNotOld(t *testing.T) {
	w := newWorld(t)
	inst := w.instance(t, "changing")
	w.artifact(t, inst, "feature", "fd-001_a", map[string]any{"name": "Old pricing: per seat"})
	w.ingestInstance(t, inst)
	if s := readable(t, w, inst)["fd-001_a"]; !strings.Contains(s, "Old pricing") {
		t.Fatalf("before the change the snippet is %q", s)
	}

	mustExec(t, w.db, `UPDATE strategy_artifacts SET payload = '{"name": "New pricing: per farm"}'::jsonb WHERE instance_id = ? AND artifact_key = 'fd-001_a'`, inst)
	mustExec(t, w.db, "UPDATE strategy_instances SET memory_dirty_since = now(), memory_change_seq = memory_change_seq + 1 WHERE id = ?", inst)
	w.ingestInstance(t, inst)

	for key, snippet := range readable(t, w, inst) {
		if strings.Contains(snippet, "Old pricing") {
			t.Errorf("%s still reads the old content: %q", key, snippet)
		}
	}
	if s := readable(t, w, inst)["fd-001_a"]; !strings.Contains(s, "New pricing") {
		t.Errorf("the changed artifact reads %q, want the new content", s)
	}
}

// AC6: a committed change to the North Star reaches the beliefs derived from it.
func TestFreshness_ACommittedNorthStarChangeReachesTheDecomposedBeliefs(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	strat := strategy.NewService(w.db)
	w.ing.SetExporter(realExporter{svc: strat})
	inst := w.instance(t, "northstar")

	commit := func(action, purpose string) {
		t.Helper()
		if _, err := strat.CommitAuto(ctx, strategy.CommitAutoParams{
			InstanceID: inst, ArtifactType: "north_star", ArtifactKey: "north_star", Action: action,
			Payload: map[string]any{"north_star": map[string]any{"purpose": map[string]any{"statement": purpose}}},
		}); err != nil {
			t.Fatalf("CommitAuto %s: %v", action, err)
		}
		mustExec(t, w.db, "UPDATE strategy_instances SET memory_dirty_since = now(), memory_change_seq = memory_change_seq + 1 WHERE id = ?", inst)
		w.ingestInstance(t, inst)
	}
	statement := func() string {
		o := w.mem.ObjectByKey(ingest.ScopedKey(inst, "Belief:north_star:purpose"))
		if o == nil {
			return ""
		}
		s, _ := o.Properties["statement"].(string)
		return s
	}

	commit("create", "Help Acme teams decide")
	if got := statement(); got != "Help Acme teams decide" {
		t.Fatalf("after the first commit the purpose belief is %q", got)
	}
	commit("update", "Make every Acme decision traceable")
	if got := statement(); got != "Make every Acme decision traceable" {
		t.Errorf("after the second commit the purpose belief is %q, want the new statement", got)
	}
	if _, ok := readable(t, w, inst)["Belief:north_star:purpose"]; !ok {
		t.Error("the purpose belief is not readable through the scoped search")
	}
}
