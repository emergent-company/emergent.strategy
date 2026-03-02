package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// newTestMCPServer creates a minimal MCP server with one echo tool for testing.
func newTestMCPServer() *server.MCPServer {
	s := server.NewMCPServer("test-epf-server", "0.0.1",
		server.WithToolCapabilities(true),
	)
	s.AddTool(
		mcp.NewTool("echo",
			mcp.WithDescription("Echoes back the input"),
			mcp.WithString("message", mcp.Description("Message to echo"), mcp.Required()),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			args := req.GetArguments()
			msg, _ := args["message"].(string)
			return mcp.NewToolResultText("echo: " + msg), nil
		},
	)
	return s
}

// getFreePort returns an available TCP port.
func getFreePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("failed to get free port: %v", err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return port
}

// startHTTPServer starts an HTTPServer in the background and returns it along
// with a cleanup function. It waits for the server to be ready before returning.
func startHTTPServer(t *testing.T, config HTTPServerConfig) *HTTPServer {
	t.Helper()
	mcpSrv := newTestMCPServer()
	srv := NewHTTPServer(mcpSrv, config)

	errCh := make(chan error, 1)
	go func() {
		if err := srv.Start(); err != nil && err.Error() != "http: Server closed" {
			errCh <- err
		}
	}()

	// Wait for the server to be ready.
	addr := fmt.Sprintf("http://localhost:%d/health", config.Port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(addr)
		if err == nil {
			resp.Body.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	})

	// Check if the server failed to start.
	select {
	case err := <-errCh:
		t.Fatalf("server failed to start: %v", err)
	default:
	}

	return srv
}

// ---------------------------------------------------------------------------
// Health endpoint tests
// ---------------------------------------------------------------------------

func TestHealthEndpoint(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port: port,
		HealthInfo: HealthInfo{
			ServerName:   "test-server",
			Version:      "1.2.3",
			InstanceName: "my-instance",
			InstancePath: "/path/to/instance",
		},
	})

	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health", port))
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}

	var hr HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&hr); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if hr.Status != "ok" {
		t.Errorf("expected status ok, got %q", hr.Status)
	}
	if hr.Server.ServerName != "test-server" {
		t.Errorf("expected server_name test-server, got %q", hr.Server.ServerName)
	}
	if hr.Server.Version != "1.2.3" {
		t.Errorf("expected version 1.2.3, got %q", hr.Server.Version)
	}
	if hr.Server.InstanceName != "my-instance" {
		t.Errorf("expected instance_name my-instance, got %q", hr.Server.InstanceName)
	}
	if hr.Uptime == "" {
		t.Error("expected non-empty uptime")
	}
	if hr.StartedAt.IsZero() {
		t.Error("expected non-zero started_at")
	}
}

// ---------------------------------------------------------------------------
// Streamable HTTP transport tests (task 2.7)
// ---------------------------------------------------------------------------

func TestStreamableHTTP_InitializeAndListTools(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{Port: port})

	baseURL := fmt.Sprintf("http://localhost:%d/mcp", port)
	c, err := client.NewStreamableHttpClient(baseURL)
	if err != nil {
		t.Fatalf("create client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client start: %v", err)
	}
	defer c.Close()

	initResp, err := c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo: mcp.Implementation{
				Name:    "test-client",
				Version: "0.0.1",
			},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("initialize: %v", err)
	}
	if initResp.ServerInfo.Name != "test-epf-server" {
		t.Errorf("expected server name test-epf-server, got %q", initResp.ServerInfo.Name)
	}

	tools, err := c.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(tools.Tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools.Tools))
	}
	if tools.Tools[0].Name != "echo" {
		t.Errorf("expected tool name echo, got %q", tools.Tools[0].Name)
	}
}

func TestStreamableHTTP_CallTool(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{Port: port})

	baseURL := fmt.Sprintf("http://localhost:%d/mcp", port)
	c, err := client.NewStreamableHttpClient(baseURL)
	if err != nil {
		t.Fatalf("create client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client start: %v", err)
	}
	defer c.Close()

	_, err = c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "test-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("initialize: %v", err)
	}

	result, err := c.CallTool(ctx, mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Name:      "echo",
			Arguments: map[string]any{"message": "hello world"},
		},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content")
	}
	text, ok := result.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("expected TextContent, got %T", result.Content[0])
	}
	if text.Text != "echo: hello world" {
		t.Errorf("expected 'echo: hello world', got %q", text.Text)
	}
}

func TestStreamableHTTP_Ping(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{Port: port})

	baseURL := fmt.Sprintf("http://localhost:%d/mcp", port)
	c, err := client.NewStreamableHttpClient(baseURL)
	if err != nil {
		t.Fatalf("create client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client start: %v", err)
	}
	defer c.Close()

	_, err = c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "test-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("initialize: %v", err)
	}

	if err := c.Ping(ctx); err != nil {
		t.Errorf("ping failed: %v", err)
	}
}

// ---------------------------------------------------------------------------
// SSE transport tests (task 2.8)
// ---------------------------------------------------------------------------

func TestSSE_InitializeAndListTools(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:      port,
		EnableSSE: true,
	})

	baseURL := fmt.Sprintf("http://localhost:%d", port)
	c, err := client.NewSSEMCPClient(baseURL + "/sse")
	if err != nil {
		t.Fatalf("create SSE client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client start: %v", err)
	}
	defer c.Close()

	initResp, err := c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "test-sse-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("initialize: %v", err)
	}
	if initResp.ServerInfo.Name != "test-epf-server" {
		t.Errorf("expected server name test-epf-server, got %q", initResp.ServerInfo.Name)
	}

	tools, err := c.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(tools.Tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools.Tools))
	}
	if tools.Tools[0].Name != "echo" {
		t.Errorf("expected tool name echo, got %q", tools.Tools[0].Name)
	}
}

func TestSSE_CallTool(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:      port,
		EnableSSE: true,
	})

	baseURL := fmt.Sprintf("http://localhost:%d", port)
	c, err := client.NewSSEMCPClient(baseURL + "/sse")
	if err != nil {
		t.Fatalf("create SSE client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client start: %v", err)
	}
	defer c.Close()

	_, err = c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "test-sse-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("initialize: %v", err)
	}

	result, err := c.CallTool(ctx, mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Name:      "echo",
			Arguments: map[string]any{"message": "sse test"},
		},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content")
	}
	text, ok := result.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("expected TextContent, got %T", result.Content[0])
	}
	if text.Text != "echo: sse test" {
		t.Errorf("expected 'echo: sse test', got %q", text.Text)
	}
}

func TestSSE_NotEnabledReturns404(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:      port,
		EnableSSE: false, // SSE not enabled
	})

	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/sse", port))
	if err != nil {
		t.Fatalf("GET /sse: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 when SSE disabled, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// CORS middleware tests
// ---------------------------------------------------------------------------

func TestCORS_AllowedOrigin(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:           port,
		AllowedOrigins: []string{"https://example.com"},
	})

	req, _ := http.NewRequest("OPTIONS", fmt.Sprintf("http://localhost:%d/mcp", port), nil)
	req.Header.Set("Origin", "https://example.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS /mcp: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", resp.StatusCode)
	}
	if acao := resp.Header.Get("Access-Control-Allow-Origin"); acao != "https://example.com" {
		t.Errorf("expected ACAO https://example.com, got %q", acao)
	}
	if acah := resp.Header.Get("Access-Control-Allow-Headers"); !strings.Contains(acah, "Mcp-Session-Id") {
		t.Errorf("expected ACAH to contain Mcp-Session-Id, got %q", acah)
	}
}

func TestCORS_DisallowedOrigin(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:           port,
		AllowedOrigins: []string{"https://example.com"},
	})

	req, _ := http.NewRequest("OPTIONS", fmt.Sprintf("http://localhost:%d/mcp", port), nil)
	req.Header.Set("Origin", "https://evil.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS /mcp: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for disallowed origin, got %d", resp.StatusCode)
	}
	if acao := resp.Header.Get("Access-Control-Allow-Origin"); acao != "" {
		t.Errorf("expected no ACAO header, got %q", acao)
	}
}

func TestCORS_WildcardOrigin(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:           port,
		AllowedOrigins: []string{"*"},
	})

	req, _ := http.NewRequest("OPTIONS", fmt.Sprintf("http://localhost:%d/mcp", port), nil)
	req.Header.Set("Origin", "https://any-origin.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS /mcp: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", resp.StatusCode)
	}
	if acao := resp.Header.Get("Access-Control-Allow-Origin"); acao != "https://any-origin.com" {
		t.Errorf("expected ACAO https://any-origin.com, got %q", acao)
	}
}

func TestCORS_NoOriginHeader(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:           port,
		AllowedOrigins: []string{"https://example.com"},
	})

	// Request without Origin header — should pass through without CORS headers.
	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/health", port))
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if acao := resp.Header.Get("Access-Control-Allow-Origin"); acao != "" {
		t.Errorf("expected no ACAO header for no-origin request, got %q", acao)
	}
}

func TestCORS_NoneConfigured(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port: port,
		// No AllowedOrigins — CORS middleware should be a pass-through.
	})

	req, _ := http.NewRequest("OPTIONS", fmt.Sprintf("http://localhost:%d/mcp", port), nil)
	req.Header.Set("Origin", "https://example.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS /mcp: %v", err)
	}
	defer resp.Body.Close()

	// When no origins configured, the middleware is a no-op pass-through.
	// The underlying Streamable HTTP handler handles OPTIONS.
	if acao := resp.Header.Get("Access-Control-Allow-Origin"); acao != "" {
		t.Errorf("expected no ACAO when no origins configured, got %q", acao)
	}
}

// ---------------------------------------------------------------------------
// Both transports share the same MCP server
// ---------------------------------------------------------------------------

func TestBothTransportsShareTools(t *testing.T) {
	port := getFreePort(t)
	startHTTPServer(t, HTTPServerConfig{
		Port:      port,
		EnableSSE: true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect via Streamable HTTP
	httpClient, err := client.NewStreamableHttpClient(fmt.Sprintf("http://localhost:%d/mcp", port))
	if err != nil {
		t.Fatalf("create streamable client: %v", err)
	}
	if err := httpClient.Start(ctx); err != nil {
		t.Fatalf("http client start: %v", err)
	}
	defer httpClient.Close()

	_, err = httpClient.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "http-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("http initialize: %v", err)
	}

	httpTools, err := httpClient.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		t.Fatalf("http list tools: %v", err)
	}

	// Connect via SSE
	sseClient, err := client.NewSSEMCPClient(fmt.Sprintf("http://localhost:%d/sse", port))
	if err != nil {
		t.Fatalf("create SSE client: %v", err)
	}
	if err := sseClient.Start(ctx); err != nil {
		t.Fatalf("sse client start: %v", err)
	}
	defer sseClient.Close()

	_, err = sseClient.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ClientInfo:      mcp.Implementation{Name: "sse-client", Version: "0.0.1"},
			ProtocolVersion: mcp.LATEST_PROTOCOL_VERSION,
		},
	})
	if err != nil {
		t.Fatalf("sse initialize: %v", err)
	}

	sseTools, err := sseClient.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		t.Fatalf("sse list tools: %v", err)
	}

	// Both should see the same tools.
	if len(httpTools.Tools) != len(sseTools.Tools) {
		t.Errorf("tool count mismatch: HTTP=%d SSE=%d", len(httpTools.Tools), len(sseTools.Tools))
	}
	if len(httpTools.Tools) > 0 && len(sseTools.Tools) > 0 {
		if httpTools.Tools[0].Name != sseTools.Tools[0].Name {
			t.Errorf("tool name mismatch: HTTP=%q SSE=%q", httpTools.Tools[0].Name, sseTools.Tools[0].Name)
		}
	}
}

// ---------------------------------------------------------------------------
// Graceful shutdown test
// ---------------------------------------------------------------------------

func TestGracefulShutdown(t *testing.T) {
	port := getFreePort(t)
	mcpSrv := newTestMCPServer()
	srv := NewHTTPServer(mcpSrv, HTTPServerConfig{Port: port})

	errCh := make(chan error, 1)
	go func() {
		if err := srv.Start(); err != nil && err.Error() != "http: Server closed" {
			errCh <- err
		}
		close(errCh)
	}()

	// Wait for ready.
	addr := fmt.Sprintf("http://localhost:%d/health", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(addr)
		if err == nil {
			resp.Body.Close()
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	// Shutdown.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}

	// Double shutdown should be a no-op.
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("double shutdown: %v", err)
	}

	// Server goroutine should have exited cleanly.
	if err := <-errCh; err != nil {
		t.Fatalf("server error after shutdown: %v", err)
	}

	// Health should no longer respond.
	resp, err := http.Get(addr)
	if err == nil {
		resp.Body.Close()
		t.Error("expected connection refused after shutdown")
	}
}

// ---------------------------------------------------------------------------
// Default port test
// ---------------------------------------------------------------------------

func TestDefaultPort(t *testing.T) {
	mcpSrv := newTestMCPServer()
	srv := NewHTTPServer(mcpSrv, HTTPServerConfig{})
	if srv.config.Port != 8080 {
		t.Errorf("expected default port 8080, got %d", srv.config.Port)
	}
	if srv.Addr() != ":8080" {
		t.Errorf("expected addr :8080, got %q", srv.Addr())
	}
}
