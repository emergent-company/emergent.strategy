// Package mcp provides the MCP (Model Context Protocol) server implementation.
// This file contains protocol-level tests for the MCP server over stdio transport.
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log"
	"testing"
	"time"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/version"
	"github.com/mark3labs/mcp-go/server"
)

// =============================================================================
// JSON-RPC Protocol Types
// =============================================================================

// JSONRPCRequest represents a JSON-RPC 2.0 request
type JSONRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// JSONRPCResponse represents a JSON-RPC 2.0 response
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCError represents a JSON-RPC 2.0 error
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// InitializeParams for the initialize request
type InitializeParams struct {
	ProtocolVersion string     `json:"protocolVersion"`
	ClientInfo      ClientInfo `json:"clientInfo"`
}

// ClientInfo represents the client information
type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ToolsListResult is the result of tools/list
type ToolsListResult struct {
	Tools []ToolInfo `json:"tools"`
}

// ToolInfo represents a tool in the list
type ToolInfo struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"inputSchema,omitempty"`
}

// CallToolParams for tools/call
type CallToolParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// CallToolResult is the result of tools/call
type CallToolResult struct {
	Content []ContentItem `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// ContentItem represents content in a tool result
type ContentItem struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// =============================================================================
// Test Infrastructure
// =============================================================================

// protocolTestServer creates a test server with stdio transport
type protocolTestServer struct {
	server       *Server
	stdioServer  *server.StdioServer
	stdinReader  *io.PipeReader
	stdinWriter  *io.PipeWriter
	stdoutReader *io.PipeReader
	stdoutWriter *io.PipeWriter
	cancel       context.CancelFunc
	errCh        chan error
	scanner      *bufio.Scanner
}

// newProtocolTestServer creates a new test server with pipes
func newProtocolTestServer(t *testing.T) *protocolTestServer {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	srv, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create pipes for stdin and stdout
	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()

	// Create stdio server
	stdioServer := server.NewStdioServer(srv.mcpServer)
	stdioServer.SetErrorLogger(log.New(io.Discard, "", 0))

	// Create context with cancel
	ctx, cancel := context.WithCancel(context.Background())

	// Create error channel
	errCh := make(chan error, 1)

	// Start server in goroutine
	go func() {
		err := stdioServer.Listen(ctx, stdinReader, stdoutWriter)
		if err != nil && err != io.EOF && err != context.Canceled {
			errCh <- err
		}
		stdoutWriter.Close()
		close(errCh)
	}()

	// Create scanner with larger buffer for large responses
	scanner := bufio.NewScanner(stdoutReader)
	// Set max token size to 1MB to handle large schema responses
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	return &protocolTestServer{
		server:       srv,
		stdioServer:  stdioServer,
		stdinReader:  stdinReader,
		stdinWriter:  stdinWriter,
		stdoutReader: stdoutReader,
		stdoutWriter: stdoutWriter,
		cancel:       cancel,
		errCh:        errCh,
		scanner:      scanner,
	}
}

// sendRequest sends a JSON-RPC request and returns the response
func (pts *protocolTestServer) sendRequest(t *testing.T, req JSONRPCRequest) JSONRPCResponse {
	reqBytes, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal request: %v", err)
	}

	// Write request with newline
	_, err = pts.stdinWriter.Write(append(reqBytes, '\n'))
	if err != nil {
		t.Fatalf("Failed to write request: %v", err)
	}

	// Read response
	if !pts.scanner.Scan() {
		if err := pts.scanner.Err(); err != nil {
			t.Fatalf("Failed to read response: %v", err)
		}
		t.Fatal("Failed to read response: scanner returned false with no error (EOF?)")
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(pts.scanner.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v\nRaw: %s", err, pts.scanner.Text())
	}

	return resp
}

// initialize performs the MCP initialize handshake
func (pts *protocolTestServer) initialize(t *testing.T) {
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
		Params: InitializeParams{
			ProtocolVersion: "2024-11-05",
			ClientInfo: ClientInfo{
				Name:    "test-client",
				Version: "1.0.0",
			},
		},
	}

	resp := pts.sendRequest(t, req)
	if resp.Error != nil {
		t.Fatalf("Initialize failed: %v", resp.Error.Message)
	}
}

// close cleans up the test server
func (pts *protocolTestServer) close() {
	pts.cancel()
	pts.stdinWriter.Close()
	// Wait for server error channel to close (with timeout)
	select {
	case <-pts.errCh:
	case <-time.After(time.Second):
	}
}

// =============================================================================
// Protocol Tests
// =============================================================================

func TestProtocol_Initialize(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
		Params: InitializeParams{
			ProtocolVersion: "2024-11-05",
			ClientInfo: ClientInfo{
				Name:    "test-client",
				Version: "1.0.0",
			},
		},
	}

	resp := pts.sendRequest(t, req)

	// Verify JSON-RPC structure
	if resp.JSONRPC != "2.0" {
		t.Errorf("Expected jsonrpc=2.0, got %s", resp.JSONRPC)
	}
	if resp.ID != float64(1) {
		t.Errorf("Expected id=1, got %v", resp.ID)
	}
	if resp.Error != nil {
		t.Errorf("Unexpected error: %v", resp.Error.Message)
	}
	if resp.Result == nil {
		t.Error("Expected result in response")
	}

	// Parse result to verify server info
	var result struct {
		ProtocolVersion string `json:"protocolVersion"`
		ServerInfo      struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"serverInfo"`
		Capabilities struct {
			Tools map[string]interface{} `json:"tools,omitempty"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse result: %v", err)
	}

	if result.ServerInfo.Name != ServerName {
		t.Errorf("Expected server name %s, got %s", ServerName, result.ServerInfo.Name)
	}
	if result.ServerInfo.Version != version.Version {
		t.Errorf("Expected server version %s, got %s", version.Version, result.ServerInfo.Version)
	}
}

func TestProtocol_ToolsList(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	// Must initialize first
	pts.initialize(t)

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      2,
		Method:  "tools/list",
	}

	resp := pts.sendRequest(t, req)

	if resp.Error != nil {
		t.Fatalf("tools/list failed: %v", resp.Error.Message)
	}

	// Parse the result
	var result ToolsListResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse tools list: %v", err)
	}

	// Verify expected tools are registered
	expectedTools := []string{
		"epf_list_schemas",
		"epf_get_schema",
		"epf_validate_file",
		"epf_validate_content",
		"epf_detect_artifact_type",
		"epf_get_phase_artifacts",
		"epf_health_check",
		"epf_check_instance",
		"epf_check_content_readiness",
		"epf_check_feature_quality",
		"epf_list_artifacts",
		"epf_get_template",
		"epf_list_definitions",
		"epf_get_definition",
		"epf_explain_value_path",
		"epf_get_strategic_context",
		"epf_analyze_coverage",
		"epf_validate_relationships",
		"epf_check_migration_status",
		"epf_get_migration_guide",
	}

	toolNames := make(map[string]bool)
	for _, tool := range result.Tools {
		toolNames[tool.Name] = true
	}

	for _, expected := range expectedTools {
		if !toolNames[expected] {
			t.Errorf("Expected tool %s not found in tools list", expected)
		}
	}

	t.Logf("Found %d tools", len(result.Tools))
}

func TestProtocol_ToolsListSchemas(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      3,
		Method:  "tools/call",
		Params: CallToolParams{
			Name: "epf_list_schemas",
		},
	}

	resp := pts.sendRequest(t, req)

	if resp.Error != nil {
		t.Fatalf("tools/call epf_list_schemas failed: %v", resp.Error.Message)
	}

	// Parse the result
	var result CallToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse call result: %v", err)
	}

	if len(result.Content) == 0 {
		t.Error("Expected content in result")
	}

	// Verify content contains expected schema info
	if result.Content[0].Type != "text" {
		t.Errorf("Expected text content, got %s", result.Content[0].Type)
	}

	text := result.Content[0].Text
	expectedSchemas := []string{"north_star", "feature_definition", "value_model", "roadmap_recipe"}
	for _, schema := range expectedSchemas {
		if !containsString(text, schema) {
			t.Errorf("Expected schema %s in list", schema)
		}
	}
}

func TestProtocol_ToolsCallWithArguments(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      4,
		Method:  "tools/call",
		Params: CallToolParams{
			Name: "epf_get_schema",
			Arguments: map[string]interface{}{
				"artifact_type": "north_star",
			},
		},
	}

	resp := pts.sendRequest(t, req)

	if resp.Error != nil {
		t.Fatalf("tools/call epf_get_schema failed: %v", resp.Error.Message)
	}

	var result CallToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse call result: %v", err)
	}

	if result.IsError {
		t.Error("Expected success, got error result")
	}

	// Verify content is a JSON schema
	text := result.Content[0].Text
	if !containsString(text, "$schema") {
		t.Error("Expected JSON schema in result")
	}
	if !containsString(text, "properties") {
		t.Error("Expected properties in schema")
	}
}

func TestProtocol_ToolsCallMissingRequired(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	// Call epf_get_schema without required artifact_type argument
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      5,
		Method:  "tools/call",
		Params: CallToolParams{
			Name:      "epf_get_schema",
			Arguments: map[string]interface{}{},
		},
	}

	resp := pts.sendRequest(t, req)

	// Should return an error result (not a protocol error)
	if resp.Error != nil {
		// Protocol-level error is also acceptable
		return
	}

	var result CallToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse call result: %v", err)
	}

	// The tool should indicate an error
	if !result.IsError {
		t.Error("Expected error for missing required argument")
	}
}

func TestProtocol_ToolsCallInvalidTool(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      6,
		Method:  "tools/call",
		Params: CallToolParams{
			Name: "nonexistent_tool",
		},
	}

	resp := pts.sendRequest(t, req)

	// Should return a protocol-level error for unknown tool
	if resp.Error == nil {
		t.Error("Expected error for nonexistent tool")
	}
}

func TestProtocol_InvalidMethod(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      7,
		Method:  "invalid/method",
	}

	resp := pts.sendRequest(t, req)

	// Should return a method not found error
	if resp.Error == nil {
		t.Error("Expected error for invalid method")
	}
	// JSON-RPC method not found error code is -32601
	if resp.Error.Code != -32601 {
		t.Logf("Got error code %d (expected -32601 for method not found)", resp.Error.Code)
	}
}

func TestProtocol_DetectArtifactType(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	tests := []struct {
		path         string
		expectedType string
	}{
		{"READY/00_north_star.yaml", "north_star"},
		{"READY/05_roadmap_recipe.yaml", "roadmap_recipe"},
		{"FIRE/feature_definitions/fd-001_test.yaml", "feature_definition"},
		{"FIRE/value_models/vm-product.yaml", "value_model"},
	}

	for i, tt := range tests {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      10 + i,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_detect_artifact_type",
				Arguments: map[string]interface{}{
					"path": tt.path,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Errorf("epf_detect_artifact_type(%s) failed: %v", tt.path, resp.Error.Message)
			continue
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Errorf("Failed to parse result for %s: %v", tt.path, err)
			continue
		}

		if !containsString(result.Content[0].Text, tt.expectedType) {
			t.Errorf("Expected %s for path %s, got: %s", tt.expectedType, tt.path, result.Content[0].Text)
		}
	}
}

func TestProtocol_GetPhaseArtifacts(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	phases := []struct {
		phase    string
		expected []string
	}{
		{"READY", []string{"north_star", "roadmap_recipe"}},
		{"FIRE", []string{"feature_definition", "value_model"}},
	}

	for i, p := range phases {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      20 + i,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_get_phase_artifacts",
				Arguments: map[string]interface{}{
					"phase": p.phase,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Errorf("epf_get_phase_artifacts(%s) failed: %v", p.phase, resp.Error.Message)
			continue
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Errorf("Failed to parse result for %s: %v", p.phase, err)
			continue
		}

		for _, expected := range p.expected {
			if !containsString(result.Content[0].Text, expected) {
				t.Errorf("Expected %s artifact in %s phase", expected, p.phase)
			}
		}
	}
}

func TestProtocol_ValidateContent(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	validYAML := `meta:
  epf_version: "1.9.6"
vision:
  statement: "Test vision statement"
  target_horizon: "2025"
north_star:
  narrative: "Test narrative"
  metrics:
    - name: "Test metric"
      target: "100"
`

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      30,
		Method:  "tools/call",
		Params: CallToolParams{
			Name: "epf_validate_content",
			Arguments: map[string]interface{}{
				"content":       validYAML,
				"artifact_type": "north_star",
			},
		},
	}

	resp := pts.sendRequest(t, req)

	if resp.Error != nil {
		t.Fatalf("epf_validate_content failed: %v", resp.Error.Message)
	}

	var result CallToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse result: %v", err)
	}

	// Valid YAML should pass validation
	if result.IsError {
		t.Errorf("Expected valid YAML to pass, got error: %s", result.Content[0].Text)
	}
}

func TestProtocol_MigrationTools(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	// Test epf_check_migration_status
	t.Run("CheckMigrationStatus", func(t *testing.T) {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      40,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_check_migration_status",
				Arguments: map[string]interface{}{
					"instance_path": instancePath,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Fatalf("epf_check_migration_status failed: %v", resp.Error.Message)
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Fatalf("Failed to parse result: %v", err)
		}

		// Should return migration status info
		text := result.Content[0].Text
		if !containsString(text, "needs_migration") && !containsString(text, "NeedsMigration") {
			t.Error("Expected migration status information in result")
		}
	})

	// Test epf_get_migration_guide
	t.Run("GetMigrationGuide", func(t *testing.T) {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      41,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_get_migration_guide",
				Arguments: map[string]interface{}{
					"instance_path": instancePath,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Fatalf("epf_get_migration_guide failed: %v", resp.Error.Message)
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Fatalf("Failed to parse result: %v", err)
		}

		// Should return migration guide
		if len(result.Content) == 0 {
			t.Error("Expected content in migration guide")
		}
	})
}

func TestProtocol_RelationshipTools(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	// Test epf_explain_value_path
	t.Run("ExplainValuePath", func(t *testing.T) {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      50,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_explain_value_path",
				Arguments: map[string]interface{}{
					"path":          "Product",
					"instance_path": instancePath,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Fatalf("epf_explain_value_path failed: %v", resp.Error.Message)
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Fatalf("Failed to parse result: %v", err)
		}

		if result.IsError {
			t.Errorf("Expected valid path to succeed: %s", result.Content[0].Text)
		}
	})

	// Test epf_analyze_coverage
	t.Run("AnalyzeCoverage", func(t *testing.T) {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      51,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_analyze_coverage",
				Arguments: map[string]interface{}{
					"instance_path": instancePath,
				},
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Fatalf("epf_analyze_coverage failed: %v", resp.Error.Message)
		}

		var result CallToolResult
		if err := json.Unmarshal(resp.Result, &result); err != nil {
			t.Fatalf("Failed to parse result: %v", err)
		}

		// Should have coverage data
		text := result.Content[0].Text
		if !containsString(text, "coverage") && !containsString(text, "Coverage") {
			t.Error("Expected coverage information in result")
		}
	})
}

func TestProtocol_ConcurrentRequests(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	// Send multiple requests in sequence (concurrent requests need separate handling)
	// This tests that the server can handle multiple requests properly
	for i := 0; i < 5; i++ {
		req := JSONRPCRequest{
			JSONRPC: "2.0",
			ID:      100 + i,
			Method:  "tools/call",
			Params: CallToolParams{
				Name: "epf_list_schemas",
			},
		}

		resp := pts.sendRequest(t, req)

		if resp.Error != nil {
			t.Errorf("Request %d failed: %v", i, resp.Error.Message)
		}
		if resp.ID != float64(100+i) {
			t.Errorf("Request %d: expected id=%d, got %v", i, 100+i, resp.ID)
		}
	}
}

func TestProtocol_LargeResponse(t *testing.T) {
	pts := newProtocolTestServer(t)
	defer pts.close()

	pts.initialize(t)

	// Get a large schema
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      200,
		Method:  "tools/call",
		Params: CallToolParams{
			Name: "epf_get_schema",
			Arguments: map[string]interface{}{
				"artifact_type": "feature_definition",
			},
		},
	}

	resp := pts.sendRequest(t, req)

	if resp.Error != nil {
		t.Fatalf("Failed to get large schema: %v", resp.Error.Message)
	}

	var result CallToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse result: %v", err)
	}

	// Feature definition schema should be substantial
	if len(result.Content[0].Text) < 1000 {
		t.Errorf("Expected large schema, got %d bytes", len(result.Content[0].Text))
	}
}

// =============================================================================
// Helper Functions
// =============================================================================

func containsString(haystack, needle string) bool {
	return len(haystack) > 0 && len(needle) > 0 &&
		(haystack == needle ||
			len(haystack) >= len(needle) &&
				(haystack[:len(needle)] == needle ||
					containsSubstring(haystack, needle)))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
