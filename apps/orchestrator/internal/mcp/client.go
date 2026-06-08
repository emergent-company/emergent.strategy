// Package mcp is a minimal MCP (Model Context Protocol) client for the
// orchestrator. It speaks JSON-RPC 2.0 over MCP's streamable-HTTP transport,
// which is a single POST endpoint that accepts a request and returns either a
// JSON body or an SSE stream whose data frames carry the JSON-RPC response.
//
// The client is deliberately dependency-free (stdlib only) to keep the
// orchestrator's footprint small. It is a pure CLIENT of strategy-server — the
// orchestrator never imports strategy-server code; this is the entire surface
// of the strategy/execution handoff used for the strategic scorecard.
//
// Auth: an optional bearer token (config/env) is sent as Authorization.
// Tool filter: strategy-server gates strategic tools behind a category filter,
// so EnsureCategories self-enables the categories the scorecard needs.
// Degradation: callers treat any client error as "scorecard unavailable" and
// still emit the deterministic wave plan.
package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// Config configures the MCP client.
type Config struct {
	// Endpoint is the strategy-server MCP URL (e.g. http://localhost:8090/mcp).
	Endpoint string
	// BearerToken is an optional auth token sent as "Authorization: Bearer ...".
	BearerToken string
	// Timeout bounds each request. Zero means a sensible default.
	Timeout time.Duration
	// HTTPClient overrides the HTTP client (used in tests). Optional.
	HTTPClient *http.Client
}

// Client is a minimal MCP JSON-RPC client.
type Client struct {
	cfg  Config
	http *http.Client
	id   atomic.Int64
	// sessionID is the Mcp-Session-Id returned by initialize; it must be sent on
	// every subsequent request on the streamable-HTTP transport.
	sessionID atomic.Value // string
}

const mcpSessionHeader = "Mcp-Session-Id"

func (c *Client) session() string {
	if v := c.sessionID.Load(); v != nil {
		return v.(string)
	}
	return ""
}

// New constructs a Client. It does not perform any network I/O.
func New(cfg Config) *Client {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: cfg.Timeout}
	}
	return &Client{cfg: cfg, http: hc}
}

// Enabled reports whether an endpoint is configured. When false, callers should
// skip the scorecard and emit only the deterministic plan.
func (c *Client) Enabled() bool { return strings.TrimSpace(c.cfg.Endpoint) != "" }

// Initialize performs the MCP handshake: it sends `initialize`, captures the
// Mcp-Session-Id from the response, then sends the `notifications/initialized`
// notification. It must be called before tools/list or tools/call on a
// streamable-HTTP server that enforces sessions.
func (c *Client) Initialize(ctx context.Context) error {
	if !c.Enabled() {
		return fmt.Errorf("mcp: no endpoint configured")
	}
	params := map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "orchestrator-planner", "version": "0.1"},
	}
	if err := c.call(ctx, "initialize", params, nil); err != nil {
		return fmt.Errorf("mcp: initialize: %w", err)
	}
	// The session ID is now stored (captured from the response header in call()).
	// Send the initialized notification (a notification has no id and no response
	// is expected; we best-effort it).
	_ = c.notify(ctx, "notifications/initialized", map[string]any{})
	return nil
}

// notify sends a JSON-RPC notification (no id, no response decoded).
func (c *Client) notify(ctx context.Context, method string, params any) error {
	body, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if c.cfg.BearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.BearerToken)
	}
	if sid := c.session(); sid != "" {
		req.Header.Set(mcpSessionHeader, sid)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}

// rpcRequest is a JSON-RPC 2.0 request envelope.
type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// rpcResponse is a JSON-RPC 2.0 response envelope.
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return fmt.Sprintf("mcp rpc error %d: %s", e.Code, e.Message) }

// call performs a single JSON-RPC call and decodes result into out (if non-nil).
func (c *Client) call(ctx context.Context, method string, params any, out any) error {
	if !c.Enabled() {
		return fmt.Errorf("mcp: no endpoint configured")
	}

	reqBody := rpcRequest{JSONRPC: "2.0", ID: c.id.Add(1), Method: method, Params: params}
	buf, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("mcp: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.Endpoint, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("mcp: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	// Streamable HTTP servers may reply with either JSON or an SSE stream.
	httpReq.Header.Set("Accept", "application/json, text/event-stream")
	if c.cfg.BearerToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.BearerToken)
	}
	if sid := c.session(); sid != "" {
		httpReq.Header.Set(mcpSessionHeader, sid)
	}

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("mcp: %s: %w", method, err)
	}
	defer resp.Body.Close()

	// Capture/refresh the session ID if the server issued one.
	if sid := resp.Header.Get(mcpSessionHeader); sid != "" {
		c.sessionID.Store(sid)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("mcp: %s: http %d: %s", method, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	rpcResp, err := decodeResponse(resp.Header.Get("Content-Type"), resp.Body)
	if err != nil {
		return fmt.Errorf("mcp: %s: %w", method, err)
	}
	if rpcResp.Error != nil {
		return fmt.Errorf("mcp: %s: %w", method, rpcResp.Error)
	}
	if out != nil && len(rpcResp.Result) > 0 {
		if err := json.Unmarshal(rpcResp.Result, out); err != nil {
			return fmt.Errorf("mcp: %s: decode result: %w", method, err)
		}
	}
	return nil
}

// decodeResponse reads a JSON-RPC response from either a plain JSON body or an
// SSE stream (text/event-stream), returning the first response object found.
func decodeResponse(contentType string, body io.Reader) (rpcResponse, error) {
	if strings.Contains(contentType, "text/event-stream") {
		return decodeSSE(body)
	}
	var r rpcResponse
	if err := json.NewDecoder(body).Decode(&r); err != nil {
		return rpcResponse{}, fmt.Errorf("decode json: %w", err)
	}
	return r, nil
}

// decodeSSE scans an SSE stream for the first `data:` frame that parses as a
// JSON-RPC response.
func decodeSSE(body io.Reader) (rpcResponse, error) {
	sc := bufio.NewScanner(body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		var r rpcResponse
		if err := json.Unmarshal([]byte(payload), &r); err != nil {
			continue // not a JSON-RPC frame (could be a notification); keep scanning
		}
		if r.JSONRPC != "" || r.Error != nil || len(r.Result) > 0 {
			return r, nil
		}
	}
	if err := sc.Err(); err != nil {
		return rpcResponse{}, fmt.Errorf("read sse: %w", err)
	}
	return rpcResponse{}, fmt.Errorf("no json-rpc data frame in sse stream")
}

// Tool describes a tool advertised by the server (subset of the MCP schema).
type Tool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type listToolsResult struct {
	Tools []Tool `json:"tools"`
}

// ListTools returns the tools currently exposed by the server. The set depends
// on the server's active tool-category filter.
func (c *Client) ListTools(ctx context.Context) ([]Tool, error) {
	var res listToolsResult
	if err := c.call(ctx, "tools/list", map[string]any{}, &res); err != nil {
		return nil, err
	}
	return res.Tools, nil
}

// CallTool invokes a tool by name with the given arguments and returns the
// concatenated text content of the result. Structured callers can re-parse the
// text as JSON when the tool returns JSON.
func (c *Client) CallTool(ctx context.Context, name string, args map[string]any) (string, error) {
	params := map[string]any{"name": name, "arguments": args}
	var res toolCallResult
	if err := c.call(ctx, "tools/call", params, &res); err != nil {
		return "", err
	}
	if res.IsError {
		return "", fmt.Errorf("mcp: tool %q returned an error: %s", name, res.text())
	}
	return res.text(), nil
}

type toolCallResult struct {
	Content []toolContent `json:"content"`
	IsError bool          `json:"isError"`
}

type toolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (r toolCallResult) text() string {
	var b strings.Builder
	for _, c := range r.Content {
		if c.Type == "text" {
			b.WriteString(c.Text)
		}
	}
	return b.String()
}
