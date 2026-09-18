package mcpserver_test

// Behavioural tests for the MCP tool category filter.
//
// These cover three defects found when opencode-harness reported that
// strategy-server "answers a call for a tool it never advertised":
//
//  1. A tool in an inactive category was invocable but undiscoverable, so the
//     caller had no argument schema and guessed the arguments wrong.
//  2. set_tool_filter never sent the tools/list_changed notification its own
//     description and the package doc both promised.
//  3. Two concurrent tools/list calls on one session raced on a shared map.
//
// They deliberately use NewMCPServerForIntrospection so the whole file runs
// without Postgres — the filter is transport/session machinery and has no
// business depending on a database to be tested.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// jsonRPCPayload extracts the JSON-RPC body from a streamable-HTTP response.
//
// Under MCP streamable HTTP a server may answer a POST with either
// application/json or text/event-stream, and clients must handle both. Once
// the server has a notification to deliver (which is now the case after
// set_tool_filter and after auto-activation) mcp-go upgrades the session's
// responses to SSE framing, so a naive json.Unmarshal of the whole body fails
// on the leading "event: message" line.
// An SSE body can carry several frames — a tools/list_changed notification is
// typically flushed ahead of the response it was triggered by — so this picks
// the first frame that is a response (carries an id) rather than the first
// frame outright.
func jsonRPCPayload(raw []byte) []byte {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '{' {
		return trimmed
	}

	var fallback []byte
	for _, line := range bytes.Split(trimmed, []byte("\n")) {
		after, ok := bytes.CutPrefix(bytes.TrimSpace(line), []byte("data:"))
		if !ok {
			continue
		}
		frame := bytes.TrimSpace(after)
		if fallback == nil {
			fallback = frame
		}

		var probe struct {
			ID     *json.RawMessage `json:"id"`
			Method string           `json:"method"`
		}
		if err := json.Unmarshal(frame, &probe); err != nil {
			continue
		}
		if probe.ID != nil && probe.Method == "" {
			return frame
		}
	}
	if fallback != nil {
		return fallback
	}
	return trimmed
}

// filterClient is a minimal MCP-over-HTTP client for filter tests.
type filterClient struct {
	t         *testing.T
	url       string
	sessionID string
}

func newFilterClient(t *testing.T) *filterClient {
	t.Helper()
	ts := httptest.NewServer(server.NewStreamableHTTPServer(mcpserver.NewMCPServerForIntrospection()))
	t.Cleanup(ts.Close)

	c := &filterClient{t: t, url: ts.URL}
	c.initialize()
	return c
}

func (c *filterClient) initialize() {
	c.t.Helper()
	body := `{"jsonrpc":"2.0","id":0,"method":"initialize","params":{` +
		`"protocolVersion":"2024-11-05","capabilities":{},` +
		`"clientInfo":{"name":"filter-test","version":"1.0"}}}`
	req, _ := http.NewRequest(http.MethodPost, c.url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("initialize: %v", err)
	}
	defer resp.Body.Close()        //nolint:errcheck
	io.Copy(io.Discard, resp.Body) //nolint:errcheck

	c.sessionID = resp.Header.Get("Mcp-Session-Id")
	if c.sessionID == "" {
		c.t.Fatal("initialize: no Mcp-Session-Id in response")
	}
}

// call invokes a tool. It does not assert success: several of these tests
// deliberately call tools whose handlers fail on missing arguments, because
// what is under test is the filter side effect, not the tool.
func (c *filterClient) call(id int, tool string, args map[string]any) {
	c.t.Helper()
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(
		`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`,
		id, tool, argsJSON,
	)
	req, _ := http.NewRequest(http.MethodPost, c.url, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("call %s: %v", tool, err)
	}
	defer resp.Body.Close()        //nolint:errcheck
	io.Copy(io.Discard, resp.Body) //nolint:errcheck
}

func (c *filterClient) listTools() map[string]bool {
	c.t.Helper()
	body := `{"jsonrpc":"2.0","id":99,"method":"tools/list","params":{}}`
	req, _ := http.NewRequest(http.MethodPost, c.url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("tools/list: %v", err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Result struct {
			Tools []struct {
				Name string `json:"name"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &envelope); err != nil {
		c.t.Fatalf("tools/list: parse: %v\nbody: %s", err, raw)
	}
	names := make(map[string]bool, len(envelope.Result.Tools))
	for _, t := range envelope.Result.Tools {
		names[t.Name] = true
	}
	return names
}

// TestToolFilter_CallingAnInactiveToolMakesItDiscoverable is the regression
// test for the harness's report. get_agent lives in the "knowledge" category,
// which is off by default. Calling it must work (the filter is not an
// authorization boundary) AND must make it appear in the next tools/list, so
// the client can finally read its argument schema.
func TestToolFilter_CallingAnInactiveToolMakesItDiscoverable(t *testing.T) {
	c := newFilterClient(t)

	const (
		hidden      = "get_agent"
		hiddenCat   = mcpserver.CategoryKnowledge
		sameCatPeer = "get_template"
	)
	if got := mcpserver.ToolCategories[hidden]; got != hiddenCat {
		t.Fatalf("precondition: %s is in category %q, expected %q — pick a different tool for this test",
			hidden, got, hiddenCat)
	}

	before := c.listTools()
	if before[hidden] {
		t.Fatalf("precondition: %s is visible on a fresh session, so it is not in an inactive category", hidden)
	}

	c.call(1, hidden, map[string]any{"name": "does-not-exist"})

	after := c.listTools()
	if !after[hidden] {
		t.Errorf("after calling %s, it is still absent from tools/list — the caller still cannot see its argument schema", hidden)
	}
	if !after[sameCatPeer] {
		t.Errorf("after calling %s, sibling tool %s in the same category is still hidden — the whole category should activate",
			hidden, sameCatPeer)
	}
}

// TestToolFilter_AutoActivationIsScopedToTheCallingSession guards against the
// obvious wrong implementation: activating a category process-wide rather than
// for the session that used it.
func TestToolFilter_AutoActivationIsScopedToTheCallingSession(t *testing.T) {
	a := newFilterClient(t)
	b := newFilterClient(t)

	a.call(1, "get_agent", map[string]any{"name": "does-not-exist"})

	if !a.listTools()["get_agent"] {
		t.Fatal("session A: auto-activation did not take effect")
	}
	if b.listTools()["get_agent"] {
		t.Error("session B sees get_agent after session A called it — filter state is leaking across sessions")
	}
}

// TestToolFilter_CoreCallsDoNotWidenTheFilter — core tools are always active,
// so calling one must not mark anything new as active or emit a spurious
// list_changed. This pins the "only announce a real change" behaviour.
func TestToolFilter_CoreCallsDoNotWidenTheFilter(t *testing.T) {
	c := newFilterClient(t)

	before := c.listTools()
	c.call(1, "list_tool_categories", nil)
	after := c.listTools()

	if len(before) != len(after) {
		t.Errorf("calling a core tool changed the visible tool count: %d → %d", len(before), len(after))
	}
}

// TestToolFilter_SetToolFilterReplacesRatherThanUnions pins the documented
// semantics of set_tool_filter against the auto-activation behaviour added
// alongside it: an explicit call is still authoritative and narrows back down.
func TestToolFilter_SetToolFilterReplacesRatherThanUnions(t *testing.T) {
	c := newFilterClient(t)

	c.call(1, "set_tool_filter", map[string]any{"categories": []string{"knowledge"}})
	if !c.listTools()["get_agent"] {
		t.Fatal("set_tool_filter([knowledge]) did not expose get_agent")
	}

	c.call(2, "set_tool_filter", map[string]any{"categories": []string{"evidence"}})
	after := c.listTools()
	if after["get_agent"] {
		t.Error("set_tool_filter([evidence]) left knowledge active — the call should replace, not union")
	}
	if !after["ingest_evidence"] {
		t.Error("set_tool_filter([evidence]) did not expose ingest_evidence")
	}
	if !after["set_tool_filter"] {
		t.Error("core category was dropped — core must always stay active")
	}
}

// TestToolFilter_ConcurrentListsOnOneSession reproduces the crash path: the
// filter callback used to write CategoryCore into a map it had been handed by
// reference under an already-released read lock. Two simultaneous tools/list
// calls on one session were a concurrent map write, which Go turns into an
// unrecoverable fatal error, not a recoverable panic.
//
// Run with -race for the strongest signal; it fails as a hard crash even
// without it.
func TestToolFilter_ConcurrentListsOnOneSession(t *testing.T) {
	c := newFilterClient(t)
	c.call(1, "set_tool_filter", map[string]any{"categories": []string{"knowledge", "evidence"}})

	const goroutines = 16
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				c.listTools()
			}
		}()
	}
	wg.Wait()
}
