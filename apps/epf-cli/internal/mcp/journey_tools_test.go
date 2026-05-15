package mcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

// createTestNavigationInstance creates a temp directory with a minimal
// navigation graph for testing journey MCP tools.
func createTestNavigationInstance(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	fireDir := filepath.Join(tmpDir, "FIRE")
	os.MkdirAll(fireDir, 0o755)

	graph := `name: test-nav
title: "Test Navigation"
entry_context: home

contexts:
  - id: home
    title: "Home"
    mode: landing
    group: main
    category: operations

  - id: settings
    title: "Settings"
    description: "Application settings and preferences"
    parent: home
    group: main
    category: setup

  - id: admin
    title: "Admin Panel"
    parent: home
    group: admin
    mode: landing
    category: operations

  - id: users
    title: "User Management"
    parent: admin
    group: admin
    category: operations

transitions:
  - id: home-to-settings
    from: home
    to: settings
    label: "Open settings"
    category: navigation

  - id: home-to-admin
    from: home
    to: admin
    label: "Open admin"
    guard: admin-role
    category: navigation

  - id: admin-to-users
    from: admin
    to: users
    label: "Manage users"
    category: drill-down

  - id: settings-to-home
    from: settings
    to: home
    label: "Back to home"
    category: back

guards:
  - id: admin-role
    description: "User must be an administrator"
    type: role
    message: "Admin access required."
    fallback: home

groups:
  - id: main
    title: "Main"
    order: 0

  - id: admin
    title: "Administration"
    order: 1
    visibility_guard: admin-role
`
	os.WriteFile(filepath.Join(fireDir, "navigation_graph.yaml"), []byte(graph), 0o644)
	return tmpDir
}

func TestHandleJourneySearch(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "settings",
	}

	result, err := server.handleJourneySearch(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneySearch failed: %v", err)
	}
	if result.IsError {
		t.Fatalf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(extractJSON(content)), &data); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	count := int(data["count"].(float64))
	if count != 1 {
		t.Errorf("Expected 1 result for 'settings', got %d", count)
	}

	results := data["results"].([]interface{})
	first := results[0].(map[string]interface{})
	if first["id"] != "settings" {
		t.Errorf("Expected first result to be 'settings', got %v", first["id"])
	}
}

func TestHandleJourneySearch_NoResults(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "nonexistent-xyzzy",
	}

	result, err := server.handleJourneySearch(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneySearch failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if int(data["count"].(float64)) != 0 {
		t.Error("Expected 0 results for nonexistent query")
	}
}

func TestHandleJourneyReachability(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"source":        "home",
		// No guards — admin should be blocked
	}

	result, err := server.handleJourneyReachability(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyReachability failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	reachableCount := int(data["reachable_count"].(float64))
	blockedCount := int(data["blocked_count"].(float64))

	// Without admin-role guard: settings is reachable, admin+users are blocked
	if reachableCount != 1 {
		t.Errorf("Expected 1 reachable context (settings), got %d", reachableCount)
	}
	if blockedCount < 1 {
		t.Errorf("Expected at least 1 blocked context (admin), got %d", blockedCount)
	}
}

func TestHandleJourneyReachability_WithGuard(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"source":        "home",
		"guards":        "admin-role",
	}

	result, err := server.handleJourneyReachability(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyReachability failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	reachableCount := int(data["reachable_count"].(float64))
	// With admin-role: settings, admin, users all reachable
	if reachableCount != 3 {
		t.Errorf("Expected 3 reachable contexts with admin guard, got %d", reachableCount)
	}
}

func TestHandleJourneyPath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"from":          "home",
		"to":            "users",
		"guards":        "admin-role",
	}

	result, err := server.handleJourneyPath(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyPath failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if data["reachable"] != true {
		t.Errorf("Expected reachable=true, got %v", data["reachable"])
	}
	steps := int(data["steps"].(float64))
	if steps != 2 {
		t.Errorf("Expected 2 steps (home→admin→users), got %d", steps)
	}
}

func TestHandleJourneyPath_Blocked(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"from":          "home",
		"to":            "admin",
		// No guards — admin-role blocks
	}

	result, err := server.handleJourneyPath(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyPath failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if data["reachable"] != false {
		t.Error("Expected reachable=false without admin guard")
	}
	if !strings.Contains(content, "blocked") {
		t.Error("Expected response to mention blocking")
	}
}

func TestHandleJourneyGuards(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"context_id":    "admin",
	}

	result, err := server.handleJourneyGuards(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyGuards failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if data["context_id"] != "admin" {
		t.Errorf("Expected context_id=admin, got %v", data["context_id"])
	}

	// admin has inbound guard (admin-role on home-to-admin transition)
	inbound := data["inbound_guards"].([]interface{})
	if len(inbound) != 1 {
		t.Errorf("Expected 1 inbound guard, got %d", len(inbound))
	}

	// admin group has visibility_guard
	groupGuard := data["group_guard"]
	if groupGuard == nil {
		t.Error("Expected group_guard to be set (admin group has visibility_guard)")
	}
}

func TestHandleJourneyRun_Pass(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"steps":         "home-to-admin, admin-to-users",
		"guards":        "admin-role",
		"expected_end":  "users",
	}

	result, err := server.handleJourneyRun(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyRun failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if data["passed"] != true {
		t.Errorf("Expected passed=true, got %v (reason: %v)", data["passed"], data["fail_reason"])
	}
	if data["final_state"] != "users" {
		t.Errorf("Expected final_state=users, got %v", data["final_state"])
	}
}

func TestHandleJourneyRun_GuardFails(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := createTestNavigationInstance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"steps":         "home-to-admin",
		// No guards — should fail on admin-role
	}

	result, err := server.handleJourneyRun(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneyRun failed: %v", err)
	}

	content := getResultText(result)
	var data map[string]interface{}
	json.Unmarshal([]byte(extractJSON(content)), &data)

	if data["passed"] != false {
		t.Error("Expected passed=false without admin guard")
	}
	if int(data["failed_at"].(float64)) != 0 {
		t.Errorf("Expected failed_at=0, got %v", data["failed_at"])
	}
}

func TestHandleJourneySearch_NoGraph(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Empty temp dir — no navigation graph
	tmpDir := t.TempDir()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": tmpDir,
		"query":         "anything",
	}

	result, err := server.handleJourneySearch(ctx, request)
	if err != nil {
		t.Fatalf("handleJourneySearch failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when no navigation graph exists")
	}
}
