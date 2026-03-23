package memory

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient_RequiresConfig(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{"missing base URL", Config{ProjectID: "p", Token: "t"}, "BaseURL is required"},
		{"missing project ID", Config{BaseURL: "http://x", Token: "t"}, "ProjectID is required"},
		{"missing token", Config{BaseURL: "http://x", ProjectID: "p"}, "Token is required"},
		{"valid config", Config{BaseURL: "http://x", ProjectID: "p", Token: "t"}, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewClient(tt.cfg)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if got := err.Error(); got != "memory: "+tt.wantErr {
					t.Fatalf("got error %q, want %q", got, tt.wantErr)
				}
			}
		})
	}
}

func TestCreateObject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/graph/objects" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing or wrong auth header")
		}
		if r.Header.Get("X-Project-ID") != "test-project" {
			t.Error("missing or wrong project header")
		}

		var req CreateObjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Type != "Belief" {
			t.Errorf("got type %q, want Belief", req.Type)
		}

		resp := Object{
			ID:         "obj-123",
			Type:       req.Type,
			Key:        req.Key,
			Properties: req.Properties,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		BaseURL:   server.URL,
		ProjectID: "test-project",
		Token:     "test-token",
	})

	obj, err := client.CreateObject(context.Background(), CreateObjectRequest{
		Type: "Belief",
		Key:  "ns-belief-semantic",
		Properties: map[string]any{
			"name":         "Strategy is semantic",
			"inertia_tier": "1",
		},
	})
	if err != nil {
		t.Fatalf("CreateObject: %v", err)
	}
	if obj.ID != "obj-123" {
		t.Errorf("got ID %q, want obj-123", obj.ID)
	}
	if obj.Type != "Belief" {
		t.Errorf("got type %q, want Belief", obj.Type)
	}
}

func TestUpsertObject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PUT" || r.URL.Path != "/api/graph/objects/upsert" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}

		var req UpsertObjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.Key == "" {
			t.Error("upsert requires key")
		}

		resp := Object{ID: "obj-456", Type: req.Type, Key: req.Key}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	obj, err := client.UpsertObject(context.Background(), UpsertObjectRequest{
		Type:       "Belief",
		Key:        "ns-belief-semantic",
		Properties: map[string]any{"statement": "updated"},
	})
	if err != nil {
		t.Fatalf("UpsertObject: %v", err)
	}
	if obj.Key != "ns-belief-semantic" {
		t.Errorf("got key %q, want ns-belief-semantic", obj.Key)
	}
}

func TestAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error": "not found"}`))
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	_, err := client.GetObject(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("got status %d, want 404", apiErr.StatusCode)
	}
}

func TestFindSimilar(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}
		if r.URL.Path != "/api/graph/objects/obj-123/similar" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("limit") != "5" {
			t.Errorf("expected limit=5, got %s", r.URL.Query().Get("limit"))
		}

		results := []SimilarResult{
			{ID: "obj-456", Type: "Feature", Key: "Feature:fd-001", Distance: 0.22, Properties: map[string]any{"inertia_tier": "6"}},
			{ID: "obj-789", Type: "Positioning", Key: "Positioning:pos-001", Distance: 0.54, Properties: map[string]any{"inertia_tier": "3"}},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	results, err := client.FindSimilar(context.Background(), "obj-123", SimilarOptions{
		Limit:    5,
		MinScore: 0.7,
	})
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d results, want 2", len(results))
	}
	// Distance 0.22 → Score 0.89 (1 - 0.22/2)
	if score := results[0].Score(); score < 0.88 || score > 0.90 {
		t.Errorf("got score %f, want ~0.89", score)
	}
}

func TestAsk_ChatStream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/chat/stream" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing or wrong auth header")
		}
		if r.Header.Get("X-Project-ID") != "test-project" {
			t.Error("missing or wrong project header")
		}

		var req ChatStreamRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Message == "" {
			t.Error("message should not be empty")
		}

		// Simulate SSE response with tool usage and token streaming
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		events := []string{
			`data: {"type":"meta","sessionId":"sess-abc123"}`,
			`data: {"type":"mcp_tool","tool":"entity-query","status":"started"}`,
			`data: {"type":"mcp_tool","tool":"entity-query","status":"completed"}`,
			`data: {"type":"mcp_tool","tool":"entity-edges-get","status":"started"}`,
			`data: {"type":"mcp_tool","tool":"entity-edges-get","status":"completed"}`,
			`data: {"type":"token","token":"Found "}`,
			`data: {"type":"token","token":"3 trends "}`,
			`data: {"type":"token","token":"in the graph."}`,
			`data: {"type":"done"}`,
		}
		for _, event := range events {
			w.Write([]byte(event + "\n"))
		}
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		BaseURL:   server.URL,
		ProjectID: "test-project",
		Token:     "test-token",
	})

	result, err := client.Ask(context.Background(), "What trends exist?")
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if result.Response != "Found 3 trends in the graph." {
		t.Errorf("got response %q, want 'Found 3 trends in the graph.'", result.Response)
	}
	if len(result.Tools) != 2 {
		t.Errorf("got %d tools, want 2", len(result.Tools))
	}
	if result.SessionID != "sess-abc123" {
		t.Errorf("got session ID %q, want 'sess-abc123'", result.SessionID)
	}

	// Verify tool names
	toolSet := map[string]bool{}
	for _, tool := range result.Tools {
		toolSet[tool] = true
	}
	if !toolSet["entity-query"] {
		t.Error("missing tool 'entity-query'")
	}
	if !toolSet["entity-edges-get"] {
		t.Error("missing tool 'entity-edges-get'")
	}
}

func TestAskWithSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req ChatStreamRequest
		json.NewDecoder(r.Body).Decode(&req)

		if req.SessionID != "sess-abc123" {
			t.Errorf("expected session ID 'sess-abc123', got %q", req.SessionID)
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`data: {"type":"meta","sessionId":"sess-abc123"}` + "\n"))
		w.Write([]byte(`data: {"type":"token","token":"Follow-up answer."}` + "\n"))
		w.Write([]byte(`data: {"type":"done"}` + "\n"))
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	result, err := client.AskWithSession(context.Background(), "Follow-up question", "sess-abc123")
	if err != nil {
		t.Fatalf("AskWithSession: %v", err)
	}
	if result.Response != "Follow-up answer." {
		t.Errorf("got response %q, want 'Follow-up answer.'", result.Response)
	}
}

func TestAsk_EmptyResponse_NoTools(t *testing.T) {
	// Verify that even with the new endpoint, if no tools are used
	// the response is still returned (just the LLM's direct answer)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`data: {"type":"token","token":"Direct answer without tools."}` + "\n"))
		w.Write([]byte(`data: {"type":"done"}` + "\n"))
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	result, err := client.Ask(context.Background(), "Simple question")
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if result.Response != "Direct answer without tools." {
		t.Errorf("got response %q, want 'Direct answer without tools.'", result.Response)
	}
	if len(result.Tools) != 0 {
		t.Errorf("expected no tools, got %d", len(result.Tools))
	}
}

func TestAsk_APIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	_, err := client.Ask(context.Background(), "test")
	if err == nil {
		t.Fatal("expected error for 401 response")
	}
	if !contains(err.Error(), "401") {
		t.Errorf("error should contain '401', got: %v", err)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestCreateBranch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/graph/branches" {
			t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
		}

		var req CreateBranchRequest
		json.NewDecoder(r.Body).Decode(&req)

		resp := Branch{ID: "branch-001", Name: req.Name}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{BaseURL: server.URL, ProjectID: "p", Token: "t"})
	branch, err := client.CreateBranch(context.Background(), CreateBranchRequest{
		Name: "scenario/drop-franchise",
	})
	if err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	if branch.Name != "scenario/drop-franchise" {
		t.Errorf("got name %q, want scenario/drop-franchise", branch.Name)
	}
}
