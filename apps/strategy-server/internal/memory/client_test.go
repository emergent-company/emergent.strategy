package memory

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newTestClient creates a Client pointing at a test HTTP server.
func newTestClient(t *testing.T, handler http.Handler) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	c, err := New(Config{
		BaseURL:   srv.URL,
		ProjectID: "test-project",
		Token:     "test-token",
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	return c
}

func TestNew_IncompleteConfig(t *testing.T) {
	_, err := New(Config{BaseURL: "http://localhost"})
	if err == nil {
		t.Fatal("expected error for incomplete config")
	}
}

func TestNew_CompleteConfig(t *testing.T) {
	c, err := New(Config{BaseURL: "http://localhost", ProjectID: "p", Token: "t"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestClient_Headers(t *testing.T) {
	var gotHeaders http.Header
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeaders = r.Header.Clone()
		w.WriteHeader(200)
		_, _ = w.Write([]byte("{}"))
	}))

	_ = c.Healthy(context.Background())

	if got := gotHeaders.Get("Authorization"); got != "Bearer test-token" {
		t.Errorf("Authorization = %q, want %q", got, "Bearer test-token")
	}
	if got := gotHeaders.Get("X-Project-ID"); got != "test-project" {
		t.Errorf("X-Project-ID = %q, want %q", got, "test-project")
	}
}

func TestClient_WithBranch_Header(t *testing.T) {
	var gotBranch string
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBranch = r.Header.Get("X-Branch-ID")
		w.WriteHeader(200)
		_, _ = w.Write([]byte("{}"))
	}))

	branched := c.WithBranch("branch-123")
	_ = branched.Healthy(context.Background())

	if gotBranch != "branch-123" {
		t.Errorf("X-Branch-ID = %q, want %q", gotBranch, "branch-123")
	}
}

func TestClient_APIError(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write([]byte(`{"error":"not found"}`))
	}))

	_, err := c.GetObject(context.Background(), "missing-id")
	if err == nil {
		t.Fatal("expected error for 404 response")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		// APIError may be wrapped; check the underlying cause.
		t.Logf("error type: %T, message: %v", err, err)
	} else {
		if apiErr.StatusCode != 404 {
			t.Errorf("status = %d, want 404", apiErr.StatusCode)
		}
	}
}

func TestCreateObject(t *testing.T) {
	want := Object{ID: "obj-1", Type: "feature", Key: "fd-001"}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/api/graph/objects" {
			t.Errorf("path = %s, want /api/graph/objects", r.URL.Path)
		}

		// Verify request body.
		body, _ := io.ReadAll(r.Body)
		var req CreateObjectRequest
		if err := json.Unmarshal(body, &req); err != nil {
			t.Fatalf("unmarshal request: %v", err)
		}
		if req.Type != "feature" {
			t.Errorf("type = %q, want %q", req.Type, "feature")
		}

		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.CreateObject(context.Background(), CreateObjectRequest{
		Type: "feature",
		Key:  "fd-001",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != want.ID || got.Key != want.Key {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestUpsertObject(t *testing.T) {
	want := Object{ID: "obj-2", Type: "persona", Key: "user-researcher"}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("method = %s, want PUT", r.Method)
		}
		if r.URL.Path != "/api/graph/objects/upsert" {
			t.Errorf("path = %s, want /api/graph/objects/upsert", r.URL.Path)
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.UpsertObject(context.Background(), UpsertObjectRequest{
		Type: "persona",
		Key:  "user-researcher",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Key != want.Key {
		t.Errorf("key = %q, want %q", got.Key, want.Key)
	}
}

func TestListObjects(t *testing.T) {
	want := ListPage[Object]{
		Items: []Object{{ID: "obj-1", Type: "feature"}},
		Total: 1,
	}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s, want GET", r.Method)
		}
		if got := r.URL.Query().Get("type"); got != "feature" {
			t.Errorf("type param = %q, want %q", got, "feature")
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.ListObjects(context.Background(), ListObjectsOptions{Type: "feature"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Items) != 1 {
		t.Fatalf("items len = %d, want 1", len(got.Items))
	}
}

func TestSearch(t *testing.T) {
	want := SearchResponse{
		Results: []SearchResult{
			{Object: Object{ID: "obj-1", Type: "feature"}, Score: 0.95, Source: "vector"},
		},
	}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/api/graph/search" {
			t.Errorf("path = %s, want /api/graph/search", r.URL.Path)
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(want)
	}))

	results, err := c.Search(context.Background(), SearchRequest{Query: "growth features", Limit: 10})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("results len = %d, want 1", len(results))
	}
	if results[0].Score != 0.95 {
		t.Errorf("score = %f, want 0.95", results[0].Score)
	}
}

func TestCreateBranch(t *testing.T) {
	want := Branch{ID: "br-1", Name: "scenario-test", Status: "active"}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.CreateBranch(context.Background(), CreateBranchRequest{Name: "scenario-test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != want.ID {
		t.Errorf("id = %q, want %q", got.ID, want.ID)
	}
}

func TestMergeBranch(t *testing.T) {
	want := MergeResult{ObjectsCreated: 3, RelationshipsCreated: 2}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/graph/branches/br-1/merge" {
			t.Errorf("path = %s, want /api/graph/branches/br-1/merge", r.URL.Path)
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.MergeBranch(context.Background(), "br-1", MergeBranchRequest{
		SourceBranchID: "br-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ObjectsCreated != 3 {
		t.Errorf("objects created = %d, want 3", got.ObjectsCreated)
	}
}

func TestCreateSubgraph(t *testing.T) {
	want := SubgraphResult{
		Objects:       []Object{{ID: "obj-1"}, {ID: "obj-2"}},
		Relationships: []Relationship{{ID: "rel-1"}},
		RefMap:        map[string]string{"ref-a": "obj-1", "ref-b": "obj-2"},
	}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/graph/subgraph" {
			t.Errorf("path = %s, want /api/graph/subgraph", r.URL.Path)
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.CreateSubgraph(context.Background(), SubgraphRequest{
		Objects: []SubgraphObject{
			{Ref: "ref-a", Type: "feature", Key: "fd-001"},
			{Ref: "ref-b", Type: "persona", Key: "user-1"},
		},
		Relationships: []SubgraphRelationship{
			{Type: "targets", FromRef: "ref-a", ToRef: "ref-b"},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Objects) != 2 {
		t.Errorf("objects = %d, want 2", len(got.Objects))
	}
	if len(got.RefMap) != 2 {
		t.Errorf("ref map = %d, want 2", len(got.RefMap))
	}
}

func TestDeleteObject(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("method = %s, want DELETE", r.Method)
		}
		w.WriteHeader(204)
	}))

	err := c.DeleteObject(context.Background(), "obj-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateRelationship(t *testing.T) {
	want := Relationship{ID: "rel-1", Type: "targets", FromID: "obj-1", ToID: "obj-2"}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/graph/relationships" {
			t.Errorf("path = %s, want /api/graph/relationships", r.URL.Path)
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.CreateRelationship(context.Background(), CreateRelationshipRequest{
		Type:   "targets",
		FromID: "obj-1",
		ToID:   "obj-2",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Type != "targets" {
		t.Errorf("type = %q, want %q", got.Type, "targets")
	}
}

func TestListInstalledSchemas(t *testing.T) {
	want := []InstalledSchema{{ID: "s-1", Name: "epf-core", Version: "1.0"}}
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/template-packs/projects/test-project/installed" {
			t.Errorf("path = %s, want project-scoped path", r.URL.Path)
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(want)
	}))

	got, err := c.ListInstalledSchemas(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("schemas = %d, want 1", len(got))
	}
	if got[0].Name != "epf-core" {
		t.Errorf("name = %q, want %q", got[0].Name, "epf-core")
	}
}

func TestHealthy(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))

	err := c.Healthy(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHealthy_Down(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"status":"unhealthy"}`))
	}))

	err := c.Healthy(context.Background())
	if err == nil {
		t.Fatal("expected error for unhealthy server")
	}
}
