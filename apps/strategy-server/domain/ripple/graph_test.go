package ripple_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

type rippleWorld struct {
	svc  *semantic.Service
	mem  *memtest.Server
	ing  *ingest.Service
	exec func(q string, args ...any)
}

func newRippleWorld(t *testing.T) (*rippleWorld, uuid.UUID, uuid.UUID, ripple.Graph) {
	t.Helper()
	db := database.TestDB(t)
	mem := memtest.New(t)
	w := &rippleWorld{
		mem: mem,
		ing: ingest.NewService(db, mem.Client(t)),
		svc: semantic.NewService(semantic.Config{URL: mem.URL, Project: "p", Token: "t"}).WithManifestSource(ingest.NewManifestStore(db)),
		exec: func(q string, args ...any) {
			t.Helper()
			if _, err := db.ExecContext(context.Background(), q, args...); err != nil {
				t.Fatalf("exec %q: %v", q, err)
			}
		},
	}
	org, ws := uuid.New(), uuid.New()
	w.exec("INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, 'o', ?, now(), now())", org, "o-"+org.String()[:8])
	w.exec("INSERT INTO workspaces (id, github_owner, org_id) VALUES (?, ?, ?)", ws, "ws-"+ws.String()[:8], org)
	mk := func(name, who string) uuid.UUID {
		id := uuid.New()
		w.exec("INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, ?)", id, ws, name)
		for _, a := range []struct{ typ, key string }{{"north_star", "north_star"}, {"feature", "fd-001_shared"}} {
			raw, _ := json.Marshal(map[string]any{"name": who + " " + a.key})
			mid := uuid.New()
			w.exec(`INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source)
				VALUES (?, ?, ?, ?, 'create', ?, 'committed', 'system')`, mid, id, a.typ, a.key, string(raw))
			w.exec(`INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
				VALUES (?, ?, ?, ?, 'active', ?, ?)`, uuid.New(), id, a.typ, a.key, string(raw), mid)
		}
		if err := w.ing.ReingestInstance(context.Background(), id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	a, b := mk("a", "Acme"), mk("b", "Rivalco")
	return w, a, b, ripple.GraphFor(w.svc, a)
}

// 9.26: after keys are prefixed, the analyser finds the changed artifact in its
// own search results by the key the strategy tables use, and never sees the
// other instance's objects.
func TestSemanticAnalyzer_FindsItsOwnArtifactAfterKeysArePrefixed(t *testing.T) {
	w, a, b, graph := newRippleWorld(t)
	w.mem.Scores[ingest.ScopedKey(a, "fd-001_shared")] = 0.9
	w.mem.Scores[ingest.ScopedKey(b, "fd-001_shared")] = 0.99

	analyzer := ripple.NewSemanticAnalyzer(graph, nil)
	if analyzer == nil {
		t.Fatal("no analyzer although the graph is available")
	}
	old := json.RawMessage(`{"name":"Acme fd-001_shared","description":"serve small teams with a hosted tool"}`)
	changed := json.RawMessage(`{"name":"Acme fd-001_shared","description":"serve small teams with a hosted tool today"}`)
	res, err := analyzer.ClassifyChange(context.Background(), "fd-001_shared", old, changed, ripple.DefaultRippleConfig())
	if err != nil {
		t.Fatal(err)
	}
	if res.Method != "embedding" {
		t.Fatalf("method = %q, want embedding: the artifact was not found in its own search results", res.Method)
	}
	if res.Score != 0.9 {
		t.Errorf("score = %v, want the instance's own 0.9 and not the other instance's 0.99", res.Score)
	}

	hits, err := graph.Search(context.Background(), "anything", 50, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range hits {
		if strings.Contains(h.Key, "/") {
			t.Errorf("hit key %q still carries the instance prefix", h.Key)
		}
	}
	if len(hits) != 2 {
		t.Errorf("got %d hits, want the instance's own 2", len(hits))
	}
}

func TestGraphFor_IsNilWithoutMemoryAndAnalyzerIsThenNil(t *testing.T) {
	if g := ripple.GraphFor(nil, uuid.New()); g != nil {
		t.Errorf("GraphFor(nil) = %v, want nil", g)
	}
	if g := ripple.GraphFor(semantic.NewService(semantic.Config{}), uuid.New()); g != nil {
		t.Errorf("GraphFor(unconfigured) = %v, want nil", g)
	}
	if a := ripple.NewSemanticAnalyzer(nil, nil); a != nil {
		t.Error("NewSemanticAnalyzer(nil) must be nil so callers skip semantic analysis")
	}
}

// With no graph built the analyser degrades to text comparison instead of
// failing the commit it runs after.
func TestSemanticAnalyzer_FallsBackToTextWhenTheGraphIsNotBuilt(t *testing.T) {
	w, _, _, _ := newRippleWorld(t)
	fresh := uuid.New()
	analyzer := ripple.NewSemanticAnalyzer(ripple.GraphFor(w.svc, fresh), nil)
	old := json.RawMessage(`{"name":"x","description":"one two three four five six seven eight"}`)
	changed := json.RawMessage(`{"name":"x","description":"one two three four five six seven nine"}`)
	res, err := analyzer.ClassifyChange(context.Background(), "fd-001_shared", old, changed, ripple.DefaultRippleConfig())
	if err != nil {
		t.Fatal(err)
	}
	if res.Method != "text_fallback" {
		t.Errorf("method = %q, want text_fallback", res.Method)
	}
}
