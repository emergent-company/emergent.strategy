package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// stubServer is an in-process MCP server mimicking strategy-server's JSON-RPC
// behavior over streamable HTTP.
type stubServer struct {
	// tools returned by tools/list.
	tools []Tool
	// toolResults maps tool name -> text content returned by tools/call.
	toolResults map[string]string
	// filterCalls records categories passed to set_tool_filter.
	filterCalls [][]string
	// useSSE makes the server reply with an SSE stream instead of JSON.
	useSSE bool
	// requireAuth, when set, returns 401 unless the bearer token matches.
	requireAuth string
}

func (s *stubServer) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.requireAuth != "" {
			if r.Header.Get("Authorization") != "Bearer "+s.requireAuth {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
		}

		var req rpcRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}

		switch req.Method {
		case "initialize":
			w.Header().Set("Mcp-Session-Id", "test-session-1")
			res, _ := json.Marshal(map[string]any{
				"protocolVersion": "2024-11-05",
				"serverInfo":      map[string]any{"name": "stub", "version": "1"},
			})
			resp.Result = res
		case "notifications/initialized":
			// notification: no response needed
			w.WriteHeader(http.StatusAccepted)
			return
		case "tools/list":
			res, _ := json.Marshal(listToolsResult{Tools: s.tools})
			resp.Result = res
		case "tools/call":
			name, args := parseToolCall(req.Params)
			if name == "set_tool_filter" {
				s.recordFilter(args)
			}
			text, ok := s.toolResults[name]
			if !ok {
				text = "" // empty success
			}
			res, _ := json.Marshal(toolCallResult{
				Content: []toolContent{{Type: "text", Text: text}},
			})
			resp.Result = res
		default:
			resp.Error = &rpcError{Code: -32601, Message: "method not found: " + req.Method}
		}

		s.write(w, resp)
	}
}

func (s *stubServer) recordFilter(args map[string]any) {
	raw, ok := args["categories"].([]any)
	if !ok {
		return
	}
	cats := make([]string, 0, len(raw))
	for _, c := range raw {
		if str, ok := c.(string); ok {
			cats = append(cats, str)
		}
	}
	s.filterCalls = append(s.filterCalls, cats)
}

func (s *stubServer) write(w http.ResponseWriter, resp rpcResponse) {
	body, _ := json.Marshal(resp)
	if s.useSSE {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "event: message\ndata: %s\n\n", body)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func parseToolCall(params any) (string, map[string]any) {
	m, ok := params.(map[string]any)
	if !ok {
		return "", nil
	}
	name, _ := m["name"].(string)
	args, _ := m["arguments"].(map[string]any)
	return name, args
}

func newTestClient(t *testing.T, s *stubServer) *Client {
	t.Helper()
	srv := httptest.NewServer(s.handler())
	t.Cleanup(srv.Close)
	return New(Config{Endpoint: srv.URL, HTTPClient: srv.Client()})
}

func TestEnabled(t *testing.T) {
	if New(Config{}).Enabled() {
		t.Error("client with no endpoint should be disabled")
	}
	if !New(Config{Endpoint: "http://x/mcp"}).Enabled() {
		t.Error("client with endpoint should be enabled")
	}
}

func TestListTools(t *testing.T) {
	s := &stubServer{tools: []Tool{{Name: "semantic_search"}, {Name: "get_roadmap"}}}
	c := newTestClient(t, s)

	tools, err := c.ListTools(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(tools))
	}
}

func TestCallTool(t *testing.T) {
	s := &stubServer{toolResults: map[string]string{"semantic_search": `{"hits":3}`}}
	c := newTestClient(t, s)

	text, err := c.CallTool(context.Background(), "semantic_search", map[string]any{"query": "x"})
	if err != nil {
		t.Fatal(err)
	}
	if text != `{"hits":3}` {
		t.Fatalf("unexpected result: %q", text)
	}
}

func TestCallJSON(t *testing.T) {
	s := &stubServer{toolResults: map[string]string{"get_roadmap": `{"krs":["kr-p-001"]}`}}
	c := newTestClient(t, s)

	var out struct {
		KRs []string `json:"krs"`
	}
	if err := c.CallJSON(context.Background(), "get_roadmap", nil, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.KRs) != 1 || out.KRs[0] != "kr-p-001" {
		t.Fatalf("unexpected decode: %+v", out)
	}
}

func TestConnectEnablesCategories(t *testing.T) {
	s := &stubServer{
		tools:       []Tool{{Name: "semantic_search"}, {Name: "epf_contradictions"}},
		toolResults: map[string]string{"set_tool_filter": "ok"},
	}
	c := newTestClient(t, s)

	d, err := c.Connect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !d.FilterApplied {
		t.Error("expected filter to be applied")
	}
	if !d.Has("semantic_search") || !d.Has("epf_contradictions") {
		t.Fatalf("expected discovered tools, got %v", d.Names())
	}
	if len(s.filterCalls) != 1 {
		t.Fatalf("expected set_tool_filter called once, got %d", len(s.filterCalls))
	}
	// The requested categories should match ScorecardCategories.
	if len(s.filterCalls[0]) != len(ScorecardCategories) {
		t.Errorf("filter categories = %v, want %v", s.filterCalls[0], ScorecardCategories)
	}
}

func TestConnectOverSSE(t *testing.T) {
	s := &stubServer{
		useSSE:      true,
		tools:       []Tool{{Name: "semantic_search"}},
		toolResults: map[string]string{"set_tool_filter": "ok"},
	}
	c := newTestClient(t, s)

	d, err := c.Connect(context.Background())
	if err != nil {
		t.Fatalf("connect over SSE failed: %v", err)
	}
	if !d.Has("semantic_search") {
		t.Fatalf("expected semantic_search via SSE, got %v", d.Names())
	}
}

func TestAuthHeader(t *testing.T) {
	s := &stubServer{requireAuth: "secret-token", tools: []Tool{{Name: "t"}}}
	srv := httptest.NewServer(s.handler())
	t.Cleanup(srv.Close)

	// Without token: unauthorized.
	noAuth := New(Config{Endpoint: srv.URL, HTTPClient: srv.Client()})
	if _, err := noAuth.ListTools(context.Background()); err == nil {
		t.Fatal("expected auth failure without token")
	}

	// With token: succeeds.
	withAuth := New(Config{Endpoint: srv.URL, BearerToken: "secret-token", HTTPClient: srv.Client()})
	if _, err := withAuth.ListTools(context.Background()); err != nil {
		t.Fatalf("expected success with token, got %v", err)
	}
}

func TestDegradationNoEndpoint(t *testing.T) {
	c := New(Config{})
	if _, err := c.Connect(context.Background()); err == nil {
		t.Fatal("expected error connecting with no endpoint")
	}
	if _, err := c.ListTools(context.Background()); err == nil {
		t.Fatal("expected error listing tools with no endpoint")
	}
}

func TestConnectFallsBackWhenFilterUnsupported(t *testing.T) {
	// Server returns an error for set_tool_filter (meta-tool absent) but still
	// lists tools. Connect should fall back to plain ListTools.
	s := &stubServerNoFilter{tools: []Tool{{Name: "semantic_search"}}}
	srv := httptest.NewServer(s.handler())
	t.Cleanup(srv.Close)
	c := New(Config{Endpoint: srv.URL, HTTPClient: srv.Client()})

	d, err := c.Connect(context.Background())
	if err != nil {
		t.Fatalf("expected graceful fallback, got %v", err)
	}
	if d.FilterApplied {
		t.Error("filter should not be marked applied when unsupported")
	}
	if !d.Has("semantic_search") {
		t.Fatalf("expected fallback tool listing, got %v", d.Names())
	}
}

// stubServerNoFilter errors on set_tool_filter but supports tools/list.
type stubServerNoFilter struct{ tools []Tool }

func (s *stubServerNoFilter) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req rpcRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
		switch req.Method {
		case "initialize":
			w.Header().Set("Mcp-Session-Id", "test-session-2")
			res, _ := json.Marshal(map[string]any{"protocolVersion": "2024-11-05"})
			resp.Result = res
		case "notifications/initialized":
			w.WriteHeader(http.StatusAccepted)
			return
		case "tools/list":
			res, _ := json.Marshal(listToolsResult{Tools: s.tools})
			resp.Result = res
		case "tools/call":
			name, _ := parseToolCall(req.Params)
			if name == "set_tool_filter" {
				resp.Error = &rpcError{Code: -32601, Message: "unknown tool"}
			} else {
				res, _ := json.Marshal(toolCallResult{Content: []toolContent{{Type: "text", Text: ""}}})
				resp.Result = res
			}
		}
		body, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}
}
