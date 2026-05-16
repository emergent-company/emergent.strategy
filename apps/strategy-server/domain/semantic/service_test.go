package semantic

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

		case strings.HasSuffix(r.URL.Path, "/edges"):
			// Memory API returns flat Relationship objects.
			resp := map[string]any{
				"incoming": []map[string]any{
					{"id": "rel-1", "type": "contributes_to", "src_id": "obj-2", "dst_id": "obj-1"},
				},
				"outgoing": []map[string]any{
					{"id": "rel-2", "type": "depends_on", "src_id": "obj-1", "dst_id": "obj-3"},
				},
			}
			_ = json.NewEncoder(w).Encode(resp)

		case r.URL.Path == "/api/graph/objects/obj-2" && r.Method == http.MethodGet:
			// Resolve connected object for incoming edge.
			resp := map[string]any{"id": "obj-2", "type": "persona", "key": "user-researcher"}
			_ = json.NewEncoder(w).Encode(resp)

		case r.URL.Path == "/api/graph/objects/obj-3" && r.Method == http.MethodGet:
			// Resolve connected object for outgoing edge.
			resp := map[string]any{"id": "obj-3", "type": "feature", "key": "fd-002"}
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
