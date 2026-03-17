package scenario

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// mockServer simulates the Memory API with branch support.
func mockServer(t *testing.T) (*httptest.Server, *mockState) {
	t.Helper()
	state := &mockState{
		objects:       map[string]memory.Object{},
		relationships: []memory.Relationship{},
		branches:      map[string]memory.Branch{},
		nextID:        1,
	}

	// Pre-populate with some objects
	for _, obj := range seedObjects() {
		state.objects[obj.Key] = obj
	}
	for _, rel := range seedRelationships() {
		state.relationships = append(state.relationships, rel)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		// Branch CRUD
		case r.Method == "POST" && r.URL.Path == "/api/graph/branches":
			var req memory.CreateBranchRequest
			json.NewDecoder(r.Body).Decode(&req)
			id := fmt.Sprintf("branch-%d", state.nextID)
			state.nextID++
			branch := memory.Branch{ID: id, Name: req.Name}
			state.branches[id] = branch
			json.NewEncoder(w).Encode(branch)

		case r.Method == "DELETE" && strings.HasPrefix(r.URL.Path, "/api/graph/branches/"):
			id := strings.TrimPrefix(r.URL.Path, "/api/graph/branches/")
			delete(state.branches, id)
			w.WriteHeader(204)

		// Object operations
		case r.Method == "PUT" && r.URL.Path == "/api/graph/objects/upsert":
			var req memory.UpsertObjectRequest
			json.NewDecoder(r.Body).Decode(&req)
			id := fmt.Sprintf("obj-%d", state.nextID)
			state.nextID++
			obj := memory.Object{ID: id, Type: req.Type, Key: req.Key, Properties: req.Properties}
			state.objects[req.Key] = obj
			json.NewEncoder(w).Encode(obj)

		case r.Method == "PATCH" && strings.HasPrefix(r.URL.Path, "/api/graph/objects/"):
			id := strings.TrimPrefix(r.URL.Path, "/api/graph/objects/")
			var req memory.UpdateObjectRequest
			json.NewDecoder(r.Body).Decode(&req)
			// Find object by ID and update properties
			for key, obj := range state.objects {
				if obj.ID == id {
					for k, v := range req.Properties {
						obj.Properties[k] = v
					}
					state.objects[key] = obj
					json.NewEncoder(w).Encode(obj)
					return
				}
			}
			http.Error(w, `{"error":"not found"}`, 404)

		case r.URL.Path == "/api/graph/objects/search":
			// Return all objects wrapped in {items:[]}
			items := make([]memory.Object, 0, len(state.objects))
			for _, obj := range state.objects {
				items = append(items, obj)
			}
			json.NewEncoder(w).Encode(map[string]any{"items": items, "next_cursor": "", "total": len(items)})

		case r.URL.Path == "/api/graph/relationships/search":
			json.NewEncoder(w).Encode(map[string]any{"items": state.relationships, "next_cursor": "", "total": len(state.relationships)})

		case r.Method == "POST" && r.URL.Path == "/api/graph/relationships":
			var req memory.CreateRelationshipRequest
			json.NewDecoder(r.Body).Decode(&req)
			id := fmt.Sprintf("rel-%d", state.nextID)
			state.nextID++
			rel := memory.Relationship{ID: id, Type: req.Type, FromID: req.FromID, ToID: req.ToID, Properties: req.Properties}
			state.relationships = append(state.relationships, rel)
			json.NewEncoder(w).Encode(rel)

		default:
			http.Error(w, fmt.Sprintf("unexpected: %s %s", r.Method, r.URL.Path), 404)
		}
	}))

	return srv, state
}

type mockState struct {
	objects       map[string]memory.Object
	relationships []memory.Relationship
	branches      map[string]memory.Branch
	nextID        int
}

func seedObjects() []memory.Object {
	return []memory.Object{
		{ID: "id-belief", Key: "Belief:north_star:purpose", Type: "Belief",
			Properties: map[string]any{"name": "Purpose", "statement": "We exist to make strategy semantic", "inertia_tier": "1"}},
		{ID: "id-feature", Key: "Feature:feature:fd-012", Type: "Feature",
			Properties: map[string]any{"name": "EPF CLI", "jtbd": "Local development workflow", "inertia_tier": "6"}},
		{ID: "id-cap", Key: "Capability:feature:fd-012:cap-001", Type: "Capability",
			Properties: map[string]any{"name": "Validation", "inertia_tier": "7"}},
	}
}

func seedRelationships() []memory.Relationship {
	return []memory.Relationship{
		{ID: "rel-1", Type: "contains", FromID: "id-feature", ToID: "id-cap",
			Properties: map[string]any{"weight": "1.0", "edge_source": "structural"}},
	}
}

func newTestClient(t *testing.T, serverURL string) *memory.Client {
	t.Helper()
	client, err := memory.NewClient(memory.Config{
		BaseURL: serverURL, ProjectID: "test", Token: "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

// mockReasoner returns a fixed verdict.
type mockReasoner struct {
	verdict reasoning.Verdict
}

func (r *mockReasoner) Evaluate(req reasoning.EvaluationRequest) (*reasoning.Assessment, error) {
	return &reasoning.Assessment{
		Verdict:        r.verdict,
		Confidence:     0.8,
		Reasoning:      "mock",
		Classification: reasoning.ClassSemantic,
		ModelUsed:      "mock",
	}, nil
}

func TestCreateAndDiscard(t *testing.T) {
	srv, state := mockServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	mgr := NewManager(client, &mockReasoner{verdict: reasoning.VerdictUnchanged})

	// Create
	s, err := mgr.Create(context.Background(), "test-scenario", "What if we pivot?")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if s.ID == "" {
		t.Error("Expected non-empty branch ID")
	}
	if s.Status != "open" {
		t.Errorf("Expected status=open, got %s", s.Status)
	}
	if len(state.branches) != 1 {
		t.Errorf("Expected 1 branch in state, got %d", len(state.branches))
	}

	// Discard
	if err := mgr.Discard(context.Background(), s); err != nil {
		t.Fatalf("Discard failed: %v", err)
	}
	if s.Status != "discarded" {
		t.Errorf("Expected status=discarded, got %s", s.Status)
	}
	if len(state.branches) != 0 {
		t.Errorf("Expected 0 branches after discard, got %d", len(state.branches))
	}
}

func TestModifyAndEvaluate(t *testing.T) {
	srv, _ := mockServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	reasoner := &mockReasoner{verdict: reasoning.VerdictModified}
	mgr := NewManager(client, reasoner)

	// Create scenario
	s, err := mgr.Create(context.Background(), "pivot-test", "Is semantic wrong?")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Modify a belief
	err = mgr.Modify(context.Background(), s, Modification{
		NodeKey:    "Belief:north_star:purpose",
		Changes:    map[string]any{"statement": "We exist to make strategy structural"},
		ChangeType: "content_modified",
	})
	if err != nil {
		t.Fatalf("Modify: %v", err)
	}
	if len(s.Modifications) != 1 {
		t.Errorf("Expected 1 modification, got %d", len(s.Modifications))
	}

	// Evaluate
	result, err := mgr.Evaluate(context.Background(), s)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}

	if s.Status != "evaluated" {
		t.Errorf("Expected status=evaluated, got %s", s.Status)
	}
	if result == nil {
		t.Fatal("Expected non-nil evaluation result")
	}
	t.Logf("Evaluations: %d, Proposed: %d, Waves: %d",
		len(result.Trace), len(result.ProposedChanges), result.Waves)
}

func TestDiffShowsModifications(t *testing.T) {
	srv, _ := mockServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	reasoner := &mockReasoner{verdict: reasoning.VerdictModified}
	mgr := NewManager(client, reasoner)

	s, _ := mgr.Create(context.Background(), "diff-test", "Test diff")
	mgr.Modify(context.Background(), s, Modification{
		NodeKey: "Belief:north_star:purpose", ChangeType: "content_modified",
		Changes: map[string]any{"statement": "Changed"},
	})
	mgr.Evaluate(context.Background(), s)

	diff, err := mgr.Diff(context.Background(), s)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}

	if len(diff) == 0 {
		t.Error("Expected non-empty diff")
	}

	// Should have at least one direct modification
	directCount := 0
	cascadeCount := 0
	for _, d := range diff {
		switch d.Status {
		case "modified":
			directCount++
		case "cascade_modified":
			cascadeCount++
		}
	}

	t.Logf("Diff entries: %d (direct: %d, cascade: %d)", len(diff), directCount, cascadeCount)
	if directCount == 0 {
		t.Error("Expected at least one direct modification in diff")
	}
}

func TestCannotModifyAfterEvaluate(t *testing.T) {
	srv, _ := mockServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	mgr := NewManager(client, &mockReasoner{verdict: reasoning.VerdictUnchanged})

	s, _ := mgr.Create(context.Background(), "lock-test", "Test locking")
	mgr.Modify(context.Background(), s, Modification{
		NodeKey: "Belief:north_star:purpose", ChangeType: "content_modified",
		Changes: map[string]any{"statement": "X"},
	})
	mgr.Evaluate(context.Background(), s)

	// Should fail — scenario is evaluated
	err := mgr.Modify(context.Background(), s, Modification{
		NodeKey: "Feature:feature:fd-012", ChangeType: "content_modified",
		Changes: map[string]any{"name": "Y"},
	})
	if err == nil {
		t.Error("Expected error when modifying evaluated scenario")
	}
}

func TestWithBranch(t *testing.T) {
	client, _ := memory.NewClient(memory.Config{
		BaseURL: "http://test", ProjectID: "proj", Token: "tok",
	})

	branched := client.WithBranch("branch-123")
	if branched.BranchID() != "branch-123" {
		t.Errorf("Expected branch-123, got %s", branched.BranchID())
	}
	if client.BranchID() != "" {
		t.Error("Original client should not have branch ID")
	}
}
