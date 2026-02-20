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

// =============================================================================
// Strategy Query Tool Tests (v0.16.0)
// =============================================================================

// clearStrategyStoreCache clears the strategy store cache for testing
func clearStrategyStoreCache() {
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()
	strategyStoreCache = make(map[string]*strategyStoreCacheEntry)
}

func TestHandleGetProductVision_ValidInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	// Clear cache to ensure fresh load
	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleGetProductVision(ctx, request)
	if err != nil {
		t.Fatalf("handleGetProductVision failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Parse JSON response
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify expected fields
	if response["organization"] == nil {
		t.Error("Expected organization field")
	}
	if response["purpose"] == nil {
		t.Error("Expected purpose field")
	}
	if response["vision"] == nil {
		t.Error("Expected vision field")
	}
	if response["mission"] == nil {
		t.Error("Expected mission field")
	}
}

func TestHandleGetProductVision_MissingInstancePath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		// Missing instance_path
	}

	result, err := server.handleGetProductVision(ctx, request)
	if err != nil {
		t.Fatalf("handleGetProductVision failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing instance_path")
	}
}

func TestHandleGetProductVision_InvalidPath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": "/nonexistent/path",
	}

	result, err := server.handleGetProductVision(ctx, request)
	if err != nil {
		t.Fatalf("handleGetProductVision failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for invalid instance path")
	}
}

func TestHandleGetPersonas_ValidInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleGetPersonas(ctx, request)
	if err != nil {
		t.Fatalf("handleGetPersonas failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have count and personas
	if response["count"] == nil {
		t.Error("Expected count field")
	}
	if response["personas"] == nil {
		t.Error("Expected personas field")
	}
}

func TestHandleGetPersonaDetails_ValidPersona(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// First get the personas to find a valid ID
	ctx := context.Background()
	personasRequest := mcp.CallToolRequest{}
	personasRequest.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	personasResult, err := server.handleGetPersonas(ctx, personasRequest)
	if err != nil || personasResult.IsError {
		t.Skip("Could not get personas to find a valid ID")
	}

	var personasResponse map[string]interface{}
	json.Unmarshal([]byte(getResultText(personasResult)), &personasResponse)

	personas, ok := personasResponse["personas"].([]interface{})
	if !ok || len(personas) == 0 {
		t.Skip("No personas found in test instance")
	}

	// Get first persona ID
	firstPersona, ok := personas[0].(map[string]interface{})
	if !ok {
		t.Skip("Could not parse first persona")
	}
	personaID, ok := firstPersona["id"].(string)
	if !ok || personaID == "" {
		// Try name if id is not set
		personaID, _ = firstPersona["name"].(string)
	}
	if personaID == "" {
		t.Skip("Could not find persona ID")
	}

	// Now test get persona details
	detailsRequest := mcp.CallToolRequest{}
	detailsRequest.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"persona_id":    personaID,
	}

	result, err := server.handleGetPersonaDetails(ctx, detailsRequest)
	if err != nil {
		t.Fatalf("handleGetPersonaDetails failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have persona details
	if response["name"] == nil {
		t.Error("Expected name field")
	}
}

func TestHandleGetPersonaDetails_InvalidPersona(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"persona_id":    "nonexistent-persona-xyz",
	}

	result, err := server.handleGetPersonaDetails(ctx, request)
	if err != nil {
		t.Fatalf("handleGetPersonaDetails failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for non-existent persona")
	}
}

func TestHandleGetValuePropositions_ValidInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleGetValuePropositions(ctx, request)
	if err != nil {
		t.Fatalf("handleGetValuePropositions failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["count"] == nil {
		t.Error("Expected count field")
	}
	if response["value_propositions"] == nil {
		t.Error("Expected value_propositions field")
	}
}

func TestHandleGetCompetitivePosition_ValidInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleGetCompetitivePosition(ctx, request)
	if err != nil {
		t.Fatalf("handleGetCompetitivePosition failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have positioning and competitive_moat
	if response["positioning"] == nil {
		t.Error("Expected positioning field")
	}
	if response["competitive_moat"] == nil {
		t.Error("Expected competitive_moat field")
	}
}

func TestHandleGetRoadmapSummary_ValidInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleGetRoadmapSummary(ctx, request)
	if err != nil {
		t.Fatalf("handleGetRoadmapSummary failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have roadmap fields
	if response["tracks"] == nil {
		t.Error("Expected tracks field")
	}
}

func TestHandleGetRoadmapSummary_WithTrackFilter(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "product",
	}

	result, err := server.handleGetRoadmapSummary(ctx, request)
	if err != nil {
		t.Fatalf("handleGetRoadmapSummary failed: %v", err)
	}

	// Should not error even if track filter returns limited results
	if result.IsError {
		content := getResultText(result)
		// Only fail if it's not a "no data" type error
		if !strings.Contains(content, "not found") {
			t.Errorf("Unexpected error: %s", content)
		}
	}
}

func TestHandleSearchStrategy_ValidQuery(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "knowledge", // Common term likely in Emergent EPF instance
	}

	result, err := server.handleSearchStrategy(ctx, request)
	if err != nil {
		t.Fatalf("handleSearchStrategy failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have query and results
	if response["query"] == nil {
		t.Error("Expected query field")
	}
	if response["count"] == nil {
		t.Error("Expected count field")
	}
	if response["results"] == nil {
		t.Error("Expected results field")
	}
}

func TestHandleSearchStrategy_WithLimit(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "AI",
		"limit":         "5",
	}

	result, err := server.handleSearchStrategy(ctx, request)
	if err != nil {
		t.Fatalf("handleSearchStrategy failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Count should respect limit
	count, ok := response["count"].(float64)
	if ok && count > 5 {
		t.Errorf("Expected count <= 5 with limit, got %v", count)
	}
}

func TestHandleSearchStrategy_WithTypeFilter(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "user",
		"types":         "persona,feature",
	}

	result, err := server.handleSearchStrategy(ctx, request)
	if err != nil {
		t.Fatalf("handleSearchStrategy failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Results should only contain persona or feature types
	results, ok := response["results"].([]interface{})
	if ok {
		for _, r := range results {
			if item, ok := r.(map[string]interface{}); ok {
				itemType, _ := item["type"].(string)
				if itemType != "persona" && itemType != "feature" {
					t.Errorf("Expected only persona or feature types, got %s", itemType)
				}
			}
		}
	}
}

func TestHandleSearchStrategy_EmptyQuery(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"query":         "", // Empty query
	}

	result, err := server.handleSearchStrategy(ctx, request)
	if err != nil {
		t.Fatalf("handleSearchStrategy failed: %v", err)
	}

	// Empty query should return 0 results (not an error)
	if result.IsError {
		t.Errorf("Unexpected error: %s", getResultText(result))
		return
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Empty query returns all indexed items or empty results depending on implementation
	// Just verify the response structure is valid
	if response["query"] == nil {
		t.Error("Expected query field")
	}
	if response["count"] == nil {
		t.Error("Expected count field")
	}
}

func TestHandleSearchStrategy_MissingQuery(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		// Missing query parameter
	}

	result, err := server.handleSearchStrategy(ctx, request)
	if err != nil {
		t.Fatalf("handleSearchStrategy failed: %v", err)
	}

	// Should return error for missing query parameter
	if !result.IsError {
		t.Error("Expected error for missing query parameter")
	}
}

func TestHandleGetFeatureStrategyContext_ValidTopic(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"topic":         "knowledge management", // Topic likely related to Emergent
	}

	result, err := server.handleGetFeatureStrategyContext(ctx, request)
	if err != nil {
		t.Fatalf("handleGetFeatureStrategyContext failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have topic and context fields
	if response["topic"] == nil {
		t.Error("Expected topic field")
	}
	if response["vision"] == nil {
		t.Error("Expected vision field")
	}
}

func TestHandleGetFeatureStrategyContext_MissingTopic(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		// Missing topic
	}

	result, err := server.handleGetFeatureStrategyContext(ctx, request)
	if err != nil {
		t.Fatalf("handleGetFeatureStrategyContext failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing topic")
	}
}

// =============================================================================
// Strategy Store Cache Tests
// =============================================================================

func TestStrategyStoreCache(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	// Clear cache first
	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()

	// First call should load the store
	request1 := mcp.CallToolRequest{}
	request1.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result1, err := server.handleGetPersonas(ctx, request1)
	if err != nil {
		t.Fatalf("First call failed: %v", err)
	}
	if result1.IsError {
		t.Fatalf("First call returned error: %s", getResultText(result1))
	}

	// Verify store is cached
	strategyStoreMu.RLock()
	_, exists := strategyStoreCache[instancePath]
	strategyStoreMu.RUnlock()

	if !exists {
		t.Error("Expected store to be cached after first call")
	}

	// Second call should use cached store
	request2 := mcp.CallToolRequest{}
	request2.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result2, err := server.handleGetPersonas(ctx, request2)
	if err != nil {
		t.Fatalf("Second call failed: %v", err)
	}
	if result2.IsError {
		t.Fatalf("Second call returned error: %s", getResultText(result2))
	}

	// Results should be equivalent
	content1 := getResultText(result1)
	content2 := getResultText(result2)

	var response1, response2 map[string]interface{}
	json.Unmarshal([]byte(content1), &response1)
	json.Unmarshal([]byte(content2), &response2)

	count1, _ := response1["count"].(float64)
	count2, _ := response2["count"].(float64)

	if count1 != count2 {
		t.Errorf("Cached results differ: count1=%v, count2=%v", count1, count2)
	}
}

// =============================================================================
// Integration Test with Minimal EPF Instance
// =============================================================================

func TestStrategyTools_MinimalInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	// Create a minimal EPF instance with just north star
	tmpDir := t.TempDir()

	// Create READY directory with north star
	readyDir := filepath.Join(tmpDir, "READY")
	os.MkdirAll(readyDir, 0755)

	northStarContent := `meta:
  epf_version: "2.0.0"
north_star:
  organization: "Test Company"
  purpose:
    statement: "Test purpose"
    problem_we_solve: "Test problem"
    who_we_serve: "Test users"
    impact_we_seek: "Test impact"
  vision:
    statement: "Test vision"
    timeframe: "2025"
    success_looks_like: ["Success metric 1"]
  mission:
    statement: "Test mission"
    what_we_do: ["Activity 1"]
    who_we_serve: "Test customers"
  values:
    - name: "Innovation"
      definition: "We innovate"
`
	os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(northStarContent), 0644)

	// Create FIRE directory (empty is fine)
	fireDir := filepath.Join(tmpDir, "FIRE", "feature_definitions")
	os.MkdirAll(fireDir, 0755)

	// Clear cache and test
	clearStrategyStoreCache()

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": tmpDir,
	}

	result, err := server.handleGetProductVision(ctx, request)
	if err != nil {
		t.Fatalf("handleGetProductVision failed: %v", err)
	}

	if result.IsError {
		t.Errorf("Expected success, got error: %s", getResultText(result))
		return
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify our test data
	org, _ := response["organization"].(string)
	if org != "Test Company" {
		t.Errorf("Expected organization 'Test Company', got '%s'", org)
	}
}
