package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// newTestClient creates a memory.Client pointed at a test server.
func newTestClient(t *testing.T, serverURL string) *memory.Client {
	t.Helper()
	client, err := memory.NewClient(memory.Config{
		BaseURL:   serverURL,
		ProjectID: "test-project",
		Token:     "test-token",
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return client
}

// mockMemoryServer creates a test HTTP server that simulates the Memory API.
// It tracks upserted objects and created relationships for assertions.
func mockMemoryServer(t *testing.T) (*httptest.Server, *mockState) {
	t.Helper()
	state := &mockState{
		objects:       make(map[string]memory.Object),
		relationships: make([]memory.Relationship, 0),
		nextID:        1,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "PUT" && r.URL.Path == "/api/graph/objects/upsert":
			var req memory.UpsertObjectRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			id := fmt.Sprintf("obj-%d", state.nextID)
			state.nextID++
			obj := memory.Object{
				ID:         id,
				Type:       req.Type,
				Key:        req.Key,
				Properties: req.Properties,
			}
			state.objects[req.Key] = obj
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(obj)

		case r.Method == "POST" && r.URL.Path == "/api/graph/relationships":
			var req memory.CreateRelationshipRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			id := fmt.Sprintf("rel-%d", state.nextID)
			state.nextID++
			rel := memory.Relationship{
				ID:         id,
				Type:       req.Type,
				FromID:     req.FromID,
				ToID:       req.ToID,
				Properties: req.Properties,
			}
			state.relationships = append(state.relationships, rel)
			w.Header().Set("Content-Type", "application/json")
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
	nextID        int
}

func TestIngestResult(t *testing.T) {
	srv, state := mockMemoryServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	ing := New(client)

	result := &decompose.Result{
		Objects: []memory.UpsertObjectRequest{
			{Type: "Belief", Key: "Belief:north_star:purpose", Properties: map[string]any{"name": "Purpose"}},
			{Type: "Feature", Key: "Feature:feature:fd-020", Properties: map[string]any{"name": "Semantic Engine"}},
			{Type: "Capability", Key: "Capability:feature:fd-020:cap-001", Properties: map[string]any{"name": "Parser"}},
		},
		Relationships: []decompose.RelationshipSpec{
			{
				Type: "contains", FromKey: "Feature:feature:fd-020", FromType: "Feature",
				ToKey: "Capability:feature:fd-020:cap-001", ToType: "Capability",
				Properties: map[string]any{"weight": "1.0"},
			},
			{
				// This relationship points to a non-existent object — should be skipped
				Type: "contributes_to", FromKey: "Feature:feature:fd-020", FromType: "Feature",
				ToKey: "ValueModelComponent:value_model:Product.SemanticEngine", ToType: "ValueModelComponent",
				Properties: map[string]any{"weight": "1.0"},
			},
		},
	}

	stats, err := ing.IngestResult(context.Background(), result)
	if err != nil {
		t.Fatalf("IngestResult failed: %v", err)
	}

	if stats.ObjectsUpserted != 3 {
		t.Errorf("Expected 3 objects upserted, got %d", stats.ObjectsUpserted)
	}
	if stats.ObjectsFailed != 0 {
		t.Errorf("Expected 0 objects failed, got %d", stats.ObjectsFailed)
	}
	if stats.RelationshipsCreated != 1 {
		t.Errorf("Expected 1 relationship created (contains), got %d", stats.RelationshipsCreated)
	}
	if stats.RelationshipsSkipped != 1 {
		t.Errorf("Expected 1 relationship skipped (unresolved VM key), got %d", stats.RelationshipsSkipped)
	}

	// Verify objects in mock state
	if len(state.objects) != 3 {
		t.Errorf("Expected 3 objects in mock, got %d", len(state.objects))
	}
	if _, ok := state.objects["Belief:north_star:purpose"]; !ok {
		t.Error("Missing Belief:north_star:purpose in mock state")
	}

	// Verify relationship was created with correct IDs
	if len(state.relationships) != 1 {
		t.Fatalf("Expected 1 relationship in mock, got %d", len(state.relationships))
	}
	rel := state.relationships[0]
	if rel.Type != "contains" {
		t.Errorf("Expected relationship type 'contains', got %s", rel.Type)
	}
	// FromID should be the Feature's ID, ToID should be the Capability's ID
	featureObj := state.objects["Feature:feature:fd-020"]
	capObj := state.objects["Capability:feature:fd-020:cap-001"]
	if rel.FromID != featureObj.ID {
		t.Errorf("Expected fromId=%s, got %s", featureObj.ID, rel.FromID)
	}
	if rel.ToID != capObj.ID {
		t.Errorf("Expected toId=%s, got %s", capObj.ID, rel.ToID)
	}
}

func TestIngestHandlesAPIErrors(t *testing.T) {
	// Server that fails on the second upsert
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PUT" && r.URL.Path == "/api/graph/objects/upsert" {
			callCount++
			if callCount == 2 {
				http.Error(w, `{"error":"schema violation"}`, 422)
				return
			}
			var req memory.UpsertObjectRequest
			json.NewDecoder(r.Body).Decode(&req)
			obj := memory.Object{ID: fmt.Sprintf("obj-%d", callCount), Type: req.Type, Key: req.Key}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(obj)
			return
		}
		http.Error(w, "not found", 404)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	ing := New(client)

	result := &decompose.Result{
		Objects: []memory.UpsertObjectRequest{
			{Type: "Belief", Key: "Belief:a", Properties: map[string]any{"name": "A"}},
			{Type: "Belief", Key: "Belief:b", Properties: map[string]any{"name": "B"}}, // this will fail
			{Type: "Belief", Key: "Belief:c", Properties: map[string]any{"name": "C"}},
		},
	}

	stats, err := ing.IngestResult(context.Background(), result)
	if err != nil {
		t.Fatalf("IngestResult should not return error for partial failures: %v", err)
	}

	if stats.ObjectsUpserted != 2 {
		t.Errorf("Expected 2 objects upserted, got %d", stats.ObjectsUpserted)
	}
	if stats.ObjectsFailed != 1 {
		t.Errorf("Expected 1 object failed, got %d", stats.ObjectsFailed)
	}
	if len(stats.Warnings) == 0 {
		t.Error("Expected warnings for failed upsert")
	}
}

func TestIngestIdempotency(t *testing.T) {
	srv, state := mockMemoryServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	ing := New(client)

	result := &decompose.Result{
		Objects: []memory.UpsertObjectRequest{
			{Type: "Belief", Key: "Belief:x", Properties: map[string]any{"name": "X"}},
		},
	}

	// Ingest twice
	stats1, _ := ing.IngestResult(context.Background(), result)
	stats2, _ := ing.IngestResult(context.Background(), result)

	// Both should succeed (upsert is idempotent)
	if stats1.ObjectsUpserted != 1 || stats2.ObjectsUpserted != 1 {
		t.Errorf("Both ingestions should succeed: run1=%d, run2=%d",
			stats1.ObjectsUpserted, stats2.ObjectsUpserted)
	}

	// The mock replaces the object on second upsert (same key)
	if len(state.objects) != 1 {
		t.Errorf("Expected 1 unique object after 2 ingestions (upsert), got %d", len(state.objects))
	}
}

// TestIngestEmergentInstance is an integration test that decomposes and ingests
// the real Emergent EPF instance into a mock Memory server.
func TestIngestEmergentInstance(t *testing.T) {
	candidates := []string{
		filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent"),
		"/Users/nikolaifasting/code/emergent-epf",
	}
	var instancePath string
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(filepath.Join(abs, "READY", "00_north_star.yaml")); err == nil {
			instancePath = abs
			break
		}
	}
	if instancePath == "" {
		t.Skip("Emergent EPF instance not available")
	}

	srv, state := mockMemoryServer(t)
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	ing := New(client)

	stats, err := ing.Ingest(context.Background(), instancePath)
	if err != nil {
		t.Fatalf("Ingest failed: %v", err)
	}

	t.Logf("=== Ingestion Stats ===")
	t.Logf("Objects upserted:      %d", stats.ObjectsUpserted)
	t.Logf("Objects failed:        %d", stats.ObjectsFailed)
	t.Logf("Relationships created: %d", stats.RelationshipsCreated)
	t.Logf("Relationships failed:  %d", stats.RelationshipsFailed)
	t.Logf("Relationships skipped: %d", stats.RelationshipsSkipped)
	t.Logf("Duration:              %s", stats.Duration)
	t.Logf("Warnings:              %d", len(stats.Warnings))

	// Sanity checks
	if stats.ObjectsUpserted < 100 {
		t.Errorf("Expected at least 100 objects upserted, got %d", stats.ObjectsUpserted)
	}
	if stats.ObjectsFailed != 0 {
		t.Errorf("Expected 0 failed objects against mock, got %d", stats.ObjectsFailed)
	}
	if stats.RelationshipsCreated < 100 {
		t.Errorf("Expected at least 100 relationships created, got %d", stats.RelationshipsCreated)
	}

	// Verify key→ID resolution worked
	// Relationships with both endpoints in the instance should resolve
	// Only cross-references to non-existent objects (e.g., contributes_to paths
	// pointing to VM components that didn't get ingested) should be skipped
	totalRels := stats.RelationshipsCreated + stats.RelationshipsFailed + stats.RelationshipsSkipped
	resolutionRate := float64(stats.RelationshipsCreated) / float64(totalRels) * 100
	t.Logf("Resolution rate:       %.1f%%", resolutionRate)

	if resolutionRate < 50 {
		t.Errorf("Expected at least 50%% relationship resolution rate, got %.1f%%", resolutionRate)
	}

	// Log a few warnings if any
	for i, w := range stats.Warnings {
		if i >= 5 {
			t.Logf("  ... and %d more warnings", len(stats.Warnings)-5)
			break
		}
		// Only log first 100 chars
		if len(w) > 100 {
			w = w[:100] + "..."
		}
		t.Logf("  WARNING: %s", w)
	}

	// Verify all objects in mock have IDs
	for key, obj := range state.objects {
		if obj.ID == "" {
			t.Errorf("Object %s has empty ID", key)
		}
		if !strings.Contains(key, ":") {
			t.Errorf("Object key %s doesn't follow Type:id convention", key)
		}
	}
}
