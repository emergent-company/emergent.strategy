package agent

import "testing"

func TestRouteTask_DirectTool(t *testing.T) {
	tests := []struct {
		task     string
		wantTool string
	}{
		{"validate this artifact file", "validate_artifact"},
		{"check the instance health", "health_check"},
		{"search for growth opportunities", "search_strategy"},
		{"list all features in the instance", "list_features"},
		{"show me the roadmap", "get_roadmap"},
		{"what is the product vision", "get_product_vision"},
		{"show target personas", "get_personas"},
		{"competitive analysis", "get_competitive_position"},
		{"find contradictions", "detect_contradictions"},
		{"show connected nodes", "get_neighbors"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			result := RouteTask(tt.task)
			if result.Type != "direct_tool" {
				t.Errorf("type = %q, want direct_tool", result.Type)
			}
			if result.ToolName != tt.wantTool {
				t.Errorf("tool = %q, want %q", result.ToolName, tt.wantTool)
			}
			if result.Confidence <= 0 {
				t.Errorf("confidence = %f, want > 0", result.Confidence)
			}
		})
	}
}

func TestRouteTask_Agent(t *testing.T) {
	tests := []struct {
		task      string
		wantAgent string
	}{
		{"create a new feature for user onboarding", "pathfinder"},
		{"update feature fd-001", "pathfinder"},
		{"help me with strategic planning", "pathfinder"},
		{"update the value model contributions", "pathfinder"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			result := RouteTask(tt.task)
			if result.Type != "agent" {
				t.Errorf("type = %q, want agent", result.Type)
			}
			if result.AgentName != tt.wantAgent {
				t.Errorf("agent = %q, want %q", result.AgentName, tt.wantAgent)
			}
		})
	}
}

func TestRouteTask_Unknown(t *testing.T) {
	result := RouteTask("do something completely random and unrelated")
	if result.Confidence >= 0.5 {
		t.Errorf("confidence for unknown task = %f, want < 0.5", result.Confidence)
	}
	if result.ToolName == "" {
		t.Error("expected a fallback tool suggestion")
	}
}

func TestRouteTask_Scenarios(t *testing.T) {
	result := RouteTask("what if we double our pricing")
	if result.ToolName != "run_scenario" {
		t.Errorf("tool = %q, want run_scenario for what-if tasks", result.ToolName)
	}
}

func TestRouteTask_Phase2cTools(t *testing.T) {
	tests := []struct {
		task     string
		wantTool string
	}{
		{"list READY phase artifact types", "get_phase_artifacts"},
		{"show fire artifact types", "get_phase_artifacts"},
		{"list track definition templates", "list_definitions"},
		{"show commercial def templates", "list_definitions"},
		{"create a fix plan for validation errors", "validate_with_plan"},
		{"which assumptions are untested", "validate_assumptions"},
		{"stage a calibration memo", "stage_calibration"},
		{"add relationship between artifacts", "add_relationship"},
		{"suggest missing relationship gaps", "suggest_relationships"},
		{"discard scenario branch", "discard_scenario"},
	}

	for _, tt := range tests {
		t.Run(tt.task, func(t *testing.T) {
			result := RouteTask(tt.task)
			if result.Type != "direct_tool" {
				t.Errorf("type = %q, want direct_tool", result.Type)
			}
			if result.ToolName != tt.wantTool {
				t.Errorf("tool = %q, want %q", result.ToolName, tt.wantTool)
			}
		})
	}
}
