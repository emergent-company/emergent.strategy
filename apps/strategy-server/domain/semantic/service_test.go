package semantic

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// newTestService creates a Service with a mock Memory server.
func newTestService(t *testing.T, handler http.Handler) *Service {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	svc := NewService(Config{
		URL:     srv.URL,
		Project: "test-project",
		Token:   "test-token",
	})
	if svc.client == nil {
		t.Fatal("expected non-nil Memory client")
	}
	return svc
}

func TestNewService_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	if svc.IsAvailable() {
		t.Fatal("expected service to be unavailable without config")
	}
}

func TestNewService_Configured(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("{}"))
	}))
	defer srv.Close()

	svc := NewService(Config{URL: srv.URL, Project: "p", Token: "t"})
	if !svc.IsAvailable() {
		t.Fatal("expected service to be available with config")
	}
	if svc.Client() == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestSearchStrategy_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	_, err := svc.SearchStrategy(context.Background(), "inst-1", "growth", 10)
	if err == nil {
		t.Fatal("expected error")
	}
	if !isSemanticUnavailable(err) {
		t.Errorf("expected ErrSemanticUnavailable, got: %v", err)
	}
}

func TestSearchStrategy_Success(t *testing.T) {
	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/graph/search" {
			w.WriteHeader(404)
			return
		}
		resp := map[string]any{
			"results": []map[string]any{
				{
					"object": map[string]any{
						"id":   "obj-1",
						"type": "feature",
						"key":  "fd-001",
						"properties": map[string]any{
							"artifact_type": "feature",
							"name":          "User Onboarding",
						},
					},
					"score":  0.92,
					"source": "vector",
				},
			},
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(resp)
	}))

	results, err := svc.SearchStrategy(context.Background(), "inst-1", "onboarding", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("results = %d, want 1", len(results))
	}
	if results[0].ArtifactKey != "fd-001" {
		t.Errorf("key = %q, want fd-001", results[0].ArtifactKey)
	}
	if results[0].Score != 0.92 {
		t.Errorf("score = %f, want 0.92", results[0].Score)
	}
}

func TestGetNeighbors_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	_, err := svc.GetNeighbors(context.Background(), "inst-1", "fd-001")
	if err == nil {
		t.Fatal("expected error")
	}
	if !isSemanticUnavailable(err) {
		t.Errorf("expected ErrSemanticUnavailable, got: %v", err)
	}
}

func TestGetNeighbors_Success(t *testing.T) {
	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/graph/objects/search" && r.Method == http.MethodGet:
			// GetObjectByKey — return the node by key filter.
			resp := map[string]any{
				"items": []map[string]any{
					{
						"id":   "obj-1",
						"type": "feature",
						"key":  "fd-001",
					},
				},
				"total": 1,
			}
			_ = json.NewEncoder(w).Encode(resp)

		case r.URL.Path == "/api/graph/expand" && r.Method == http.MethodPost:
			// Expand at depth 1 — returns the root node, its neighbors,
			// and all relationships connecting them.
			resp := map[string]any{
				"objects": []map[string]any{
					{"id": "obj-1", "type": "feature", "key": "fd-001"},
					{"id": "obj-2", "type": "persona", "key": "user-researcher"},
					{"id": "obj-3", "type": "feature", "key": "fd-002"},
				},
				"relationships": []map[string]any{
					{"id": "rel-1", "type": "contributes_to", "src_id": "obj-2", "dst_id": "obj-1"},
					{"id": "rel-2", "type": "depends_on", "src_id": "obj-1", "dst_id": "obj-3"},
				},
			}
			_ = json.NewEncoder(w).Encode(resp)

		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"items": []any{}, "total": 0})
		}
	}))

	neighbors, err := svc.GetNeighbors(context.Background(), "inst-1", "fd-001")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(neighbors) != 2 {
		t.Fatalf("neighbors = %d, want 2", len(neighbors))
	}

	// Check directions.
	var hasInbound, hasOutbound bool
	for _, n := range neighbors {
		if n.EdgeDir == "inbound" {
			hasInbound = true
		}
		if n.EdgeDir == "outbound" {
			hasOutbound = true
		}
	}
	if !hasInbound || !hasOutbound {
		t.Errorf("expected both inbound and outbound neighbors, got: %+v", neighbors)
	}
}

func TestDetectContradictions_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	_, err := svc.DetectContradictions(context.Background(), "inst-1")
	if err == nil {
		t.Fatal("expected error")
	}
}

// TestDetectContradictions_PaginatesAndUsesEdges covers emergent.strategy#45/#46:
// DetectContradictions must (a) paginate ListObjects so instances with >200
// objects are fully scanned, and (b) determine connectivity via the per-object
// /edges endpoint — NOT the graph expand endpoint, which does not surface the
// relationships reliably. Even-indexed objects have edges (connected);
// odd-indexed have none (orphaned).
func TestDetectContradictions_PaginatesAndUsesEdges(t *testing.T) {
	const total = 130 // spans multiple pages at pageSize 60

	makeObj := func(i int) map[string]any {
		return map[string]any{"id": "obj-" + itoa(i), "type": "feature", "key": "fd-" + itoa(i)}
	}

	edgeCalls := 0
	expandCalled := false

	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/graph/objects/search" && r.Method == http.MethodGet:
			if r.URL.Query().Get("label") != "layer:artifact" {
				t.Errorf("expected label=layer:artifact filter, got %q", r.URL.Query().Get("label"))
			}
			const pageSize = 60
			start := 0
			if c := r.URL.Query().Get("cursor"); c != "" {
				start = atoi(c)
			}
			end := start + pageSize
			if end > total {
				end = total
			}
			items := make([]map[string]any, 0, end-start)
			for i := start; i < end; i++ {
				items = append(items, makeObj(i))
			}
			resp := map[string]any{"items": items, "total": total}
			if end < total {
				resp["next_cursor"] = itoa(end)
			}
			_ = json.NewEncoder(w).Encode(resp)

		case strings.HasSuffix(r.URL.Path, "/edges") && r.Method == http.MethodGet:
			edgeCalls++
			// Path: /api/graph/objects/obj-<i>/edges
			id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/graph/objects/"), "/edges")
			idx := atoi(strings.TrimPrefix(id, "obj-"))
			resp := map[string]any{"incoming": []any{}, "outgoing": []any{}}
			if idx%2 == 0 { // even = connected
				resp["outgoing"] = []map[string]any{
					{"id": "rel-" + id, "type": "enables", "src_id": id, "dst_id": "other"},
				}
			}
			_ = json.NewEncoder(w).Encode(resp)

		case r.URL.Path == "/api/graph/expand":
			expandCalled = true
			w.WriteHeader(500) // must not be used
		default:
			w.WriteHeader(404)
		}
	}))

	got, err := svc.DetectContradictions(context.Background(), "inst-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if expandCalled {
		t.Fatal("detect must not use the expand endpoint (it does not surface edges reliably)")
	}
	if edgeCalls != total {
		t.Fatalf("expected an edges call per object (%d), got %d", total, edgeCalls)
	}
	wantOrphans := total / 2 // odd-indexed
	if len(got) != wantOrphans {
		t.Fatalf("expected %d orphaned contradictions, got %d", wantOrphans, len(got))
	}
}

// TestDetectContradictions_ScopesToArtifactLayer verifies that orphan detection
// only scans the artifact layer (label=layer:artifact) and never includes
// decomposed sub-objects, which would otherwise flood the result with false
// positives (emergent.strategy#46).
func TestDetectContradictions_ScopesToArtifactLayer(t *testing.T) {
	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/graph/objects/search" && r.Method == http.MethodGet:
			if label := r.URL.Query().Get("label"); label != "layer:artifact" {
				t.Fatalf("contradiction scan must filter to layer:artifact; got label=%q", label)
			}
			resp := map[string]any{
				"items": []map[string]any{
					{"id": "art-feature", "type": "feature", "key": "fd-001"},
					{"id": "art-orphan", "type": "north_star", "key": "north_star"},
				},
				"total": 2,
			}
			_ = json.NewEncoder(w).Encode(resp)

		case strings.HasSuffix(r.URL.Path, "/edges") && r.Method == http.MethodGet:
			// art-feature is connected; art-orphan has no edges.
			if strings.Contains(r.URL.Path, "art-feature") {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"incoming": []any{},
					"outgoing": []map[string]any{{"id": "rel-1", "type": "contributes_to", "src_id": "art-feature", "dst_id": "art-other"}},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"incoming": []any{}, "outgoing": []any{}})

		default:
			w.WriteHeader(404)
		}
	}))

	got, err := svc.DetectContradictions(context.Background(), "inst-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 orphan (north_star), got %d: %+v", len(got), got)
	}
	if !strings.Contains(got[0].Description, "north_star") {
		t.Errorf("expected the orphan to be north_star, got %q", got[0].Description)
	}
}

// itoa/atoi are tiny helpers to avoid importing strconv at call sites in tests.
func itoa(i int) string { return strconv.Itoa(i) }
func atoi(s string) int { n, _ := strconv.Atoi(s); return n }

func TestRunScenario_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	_, err := svc.RunScenario(context.Background(), "inst-1", "what if we double pricing", "")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestRunScenario_Success(t *testing.T) {
	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/graph/branches" && r.Method == http.MethodPost {
			resp := map[string]any{"id": "br-scenario-1", "name": "test", "status": "active"}
			w.WriteHeader(201)
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		w.WriteHeader(404)
	}))

	scenarioID, err := svc.RunScenario(context.Background(), "inst-1", "test scenario", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scenarioID != "br-scenario-1" {
		t.Errorf("scenario_id = %q, want br-scenario-1", scenarioID)
	}
}

func TestCommitScenario_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	_, err := svc.CommitScenario(context.Background(), "sc-1", "inst-1")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestVerifySchemas_NotConfigured(t *testing.T) {
	svc := NewService(Config{})
	// Not configured should skip silently (return nil).
	err := svc.VerifySchemas(context.Background())
	if err != nil {
		t.Fatalf("expected nil error for unconfigured service, got: %v", err)
	}
}

func TestVerifySchemas_Success(t *testing.T) {
	svc := newTestService(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`[{"id":"s-1","name":"epf-core"}]`))
	}))

	err := svc.VerifySchemas(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// isSemanticUnavailable checks if the error is the semantic unavailable error.
func isSemanticUnavailable(err error) bool {
	if err == nil {
		return false
	}
	// Check against the typed error.
	if ae := apperror.AsAppError(err); ae != nil {
		return ae.Code == apperror.ErrSemanticUnavailable.Code
	}
	// Fallback: check if the error message indicates semantic unavailable.
	msg := err.Error()
	return strings.Contains(msg, "semantic") || strings.Contains(msg, "unavailable")
}
