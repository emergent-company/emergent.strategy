package cmd

import (
	"testing"
)

// Task 6.1: Test that buildAgentOutput includes mandatory_protocols and workflow_decision_tree

func TestBuildAgentOutput_MandatoryProtocols(t *testing.T) {
	output := buildAgentOutput(nil)

	if output == nil {
		t.Fatal("buildAgentOutput returned nil")
	}

	// Verify mandatory_protocols is populated
	if len(output.MandatoryProtocols) == 0 {
		t.Fatal("Expected MandatoryProtocols to be populated, got empty slice")
	}

	// Check for required protocol names
	expectedProtocols := map[string]bool{
		"wizard_first":      false,
		"strategy_context":  false,
		"validation_always": false,
	}

	for _, protocol := range output.MandatoryProtocols {
		if _, ok := expectedProtocols[protocol.Name]; ok {
			expectedProtocols[protocol.Name] = true
		}

		// Each protocol must have a description and steps
		if protocol.Description == "" {
			t.Errorf("MandatoryProtocol %q has empty description", protocol.Name)
		}
		if len(protocol.Steps) == 0 {
			t.Errorf("MandatoryProtocol %q has no steps", protocol.Name)
		}
	}

	for name, found := range expectedProtocols {
		if !found {
			t.Errorf("Missing mandatory protocol: %q", name)
		}
	}
}

func TestBuildAgentOutput_WorkflowDecisionTree(t *testing.T) {
	output := buildAgentOutput(nil)

	if output == nil {
		t.Fatal("buildAgentOutput returned nil")
	}

	// Verify workflow_decision_tree is populated
	if len(output.WorkflowDecisionTree) == 0 {
		t.Fatal("Expected WorkflowDecisionTree to be populated, got empty slice")
	}

	// Check for required task types
	expectedTasks := map[string]bool{
		"create_artifact": false,
		"query_strategy":  false,
		"assess_health":   false,
	}

	for _, decision := range output.WorkflowDecisionTree {
		if _, ok := expectedTasks[decision.TaskType]; ok {
			expectedTasks[decision.TaskType] = true
		}

		// Each decision must have tools and a note
		if len(decision.Tools) == 0 {
			t.Errorf("WorkflowDecision %q has no tools", decision.TaskType)
		}
		if decision.Note == "" {
			t.Errorf("WorkflowDecision %q has empty note", decision.TaskType)
		}
	}

	for taskType, found := range expectedTasks {
		if !found {
			t.Errorf("Missing workflow decision: %q", taskType)
		}
	}
}

func TestBuildAgentOutput_MCPTools(t *testing.T) {
	output := buildAgentOutput(nil)

	if output == nil {
		t.Fatal("buildAgentOutput returned nil")
	}

	// Verify we have at least 10 MCP tools (was expanded from 8 to 14+)
	if len(output.MCPTools) < 10 {
		t.Errorf("Expected at least 10 MCP tools, got %d", len(output.MCPTools))
	}

	// Check that strategy tools are included
	strategyToolNames := map[string]bool{
		"epf_get_product_vision":  false,
		"epf_get_personas":        false,
		"epf_get_roadmap_summary": false,
		"epf_search_strategy":     false,
	}

	for _, tool := range output.MCPTools {
		if _, ok := strategyToolNames[tool.Name]; ok {
			strategyToolNames[tool.Name] = true
		}
	}

	for name, found := range strategyToolNames {
		if !found {
			t.Errorf("Missing strategy MCP tool: %q", name)
		}
	}
}

func TestBuildAgentOutput_AuthoritySection(t *testing.T) {
	output := buildAgentOutput(nil)

	if output == nil {
		t.Fatal("buildAgentOutput returned nil")
	}

	if output.Authority.Tool != "epf-cli" {
		t.Errorf("Authority.Tool = %q, want %q", output.Authority.Tool, "epf-cli")
	}
	if output.Authority.TrustLevel != "authoritative" {
		t.Errorf("Authority.TrustLevel = %q, want %q", output.Authority.TrustLevel, "authoritative")
	}
}

func TestBuildAgentOutput_NoDiscovery(t *testing.T) {
	output := buildAgentOutput(nil)

	if output == nil {
		t.Fatal("buildAgentOutput returned nil")
	}

	if output.Discovery.InstanceFound {
		t.Error("Expected InstanceFound=false when no discovery result provided")
	}
}
