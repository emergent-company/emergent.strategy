package mcp

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/checks"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
)

func TestGenerateHealthCheckSuggestions_Empty(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath:  "/test/path",
		OverallStatus: "HEALTHY",
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) != 0 {
		t.Errorf("Expected 0 suggestions for healthy instance, got %d", len(suggestions))
	}
}

func TestGenerateHealthCheckSuggestions_ValueModelQuality(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 60,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) == 0 {
		t.Fatal("Expected suggestions for low value model quality")
	}

	found := false
	for _, s := range suggestions {
		if s.Tool == "epf_get_agent_for_task" && s.Priority == "urgent" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected urgent agent suggestion for low value model quality")
	}
}

func TestGenerateHealthCheckSuggestions_FeatureQuality(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		FeatureQuality: &checks.FeatureQualitySummary{
			AverageScore: 50,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) == 0 {
		t.Fatal("Expected suggestions for low feature quality")
	}
	if suggestions[0].Priority != "urgent" {
		t.Errorf("Expected urgent priority, got %s", suggestions[0].Priority)
	}
}

func TestGenerateHealthCheckSuggestions_ContentReadiness(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		ContentReadiness: &checks.ContentReadinessResult{
			Score: 60,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) == 0 {
		t.Fatal("Expected suggestions for low content readiness")
	}
	if suggestions[0].Priority != "recommended" {
		t.Errorf("Expected recommended priority, got %s", suggestions[0].Priority)
	}
}

func TestGenerateHealthCheckSuggestions_RelationshipErrors(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		Relationships: &checks.RelationshipsResult{
			InvalidPaths: 3,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) == 0 {
		t.Fatal("Expected suggestions for invalid relationship paths")
	}
	if suggestions[0].Tool != "epf_validate_relationships" {
		t.Errorf("Expected epf_validate_relationships tool, got %s", suggestions[0].Tool)
	}
}

func TestGenerateHealthCheckSuggestions_MultipleIssues(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 50,
		},
		FeatureQuality: &checks.FeatureQualitySummary{
			AverageScore: 40,
		},
		Relationships: &checks.RelationshipsResult{
			InvalidPaths: 2,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) < 3 {
		t.Errorf("Expected at least 3 suggestions for multiple issues, got %d", len(suggestions))
	}
}

func TestGenerateHealthCheckSuggestions_HighScoresNoSuggestions(t *testing.T) {
	result := &HealthCheckSummary{
		InstancePath: "/test/path",
		ValueModelQuality: &valuemodel.QualityReport{
			OverallScore: 95,
		},
		FeatureQuality: &checks.FeatureQualitySummary{
			AverageScore: 90,
		},
		ContentReadiness: &checks.ContentReadinessResult{
			Score: 100,
		},
		Relationships: &checks.RelationshipsResult{
			InvalidPaths: 0,
		},
	}

	suggestions := generateHealthCheckSuggestions(result)
	if len(suggestions) != 0 {
		t.Errorf("Expected 0 suggestions for high scores, got %d", len(suggestions))
	}
}

func TestClassifyStructuralErrors_Valid(t *testing.T) {
	result := &validator.AIFriendlyResult{
		Valid:      true,
		ErrorCount: 0,
	}

	isStructural, suggestion := classifyStructuralErrors(result)
	if isStructural {
		t.Error("Expected non-structural for valid result")
	}
	if suggestion != nil {
		t.Error("Expected nil suggestion for valid result")
	}
}

func TestClassifyStructuralErrors_Nil(t *testing.T) {
	isStructural, suggestion := classifyStructuralErrors(nil)
	if isStructural {
		t.Error("Expected non-structural for nil result")
	}
	if suggestion != nil {
		t.Error("Expected nil suggestion for nil result")
	}
}

func TestClassifyStructuralErrors_SurfaceErrors(t *testing.T) {
	// Few errors, no type mismatches — surface level
	result := &validator.AIFriendlyResult{
		Valid:        false,
		ErrorCount:   3,
		ArtifactType: "feature_definition",
		ErrorsBySection: []*validator.SectionErrors{
			{
				Section:    "strategic_context",
				ErrorCount: 3,
				Errors: []*validator.EnhancedValidationError{
					{Path: "strategic_context.tracks[0]", ErrorType: validator.ErrorInvalidEnum, Priority: validator.PriorityHigh},
					{Path: "strategic_context.tracks[1]", ErrorType: validator.ErrorInvalidEnum, Priority: validator.PriorityHigh},
					{Path: "strategic_context.contributes_to[0]", ErrorType: validator.ErrorPatternMismatch, Priority: validator.PriorityMedium},
				},
			},
		},
		Summary: validator.ErrorSummary{
			CriticalCount: 0,
			HighCount:     2,
			MediumCount:   1,
		},
	}

	isStructural, suggestion := classifyStructuralErrors(result)
	if isStructural {
		t.Error("Expected non-structural for surface-level errors")
	}
	if suggestion != nil {
		t.Error("Expected nil suggestion for surface-level errors")
	}
}

func TestClassifyStructuralErrors_TopLevelTypeMismatch(t *testing.T) {
	// Top-level type mismatch → structural
	result := &validator.AIFriendlyResult{
		Valid:        false,
		ErrorCount:   5,
		ArtifactType: "north_star",
		ErrorsBySection: []*validator.SectionErrors{
			{
				Section:    "vision",
				ErrorCount: 5,
				Errors: []*validator.EnhancedValidationError{
					{Path: "vision", ErrorType: validator.ErrorTypeMismatch, Priority: validator.PriorityCritical},
					{Path: "vision.statement", ErrorType: validator.ErrorMissingRequired, Priority: validator.PriorityHigh},
					{Path: "vision.timeframe", ErrorType: validator.ErrorMissingRequired, Priority: validator.PriorityHigh},
					{Path: "mission", ErrorType: validator.ErrorTypeMismatch, Priority: validator.PriorityCritical},
					{Path: "purpose", ErrorType: validator.ErrorMissingRequired, Priority: validator.PriorityHigh},
				},
			},
		},
		Summary: validator.ErrorSummary{
			CriticalCount: 2,
			HighCount:     3,
		},
	}

	isStructural, suggestion := classifyStructuralErrors(result)
	if !isStructural {
		t.Error("Expected structural for top-level type mismatches")
	}
	if suggestion == nil {
		t.Fatal("Expected suggestion for structural errors")
	}
	if suggestion.Tool != "epf_get_agent_for_task" {
		t.Errorf("Expected agent tool suggestion, got %s", suggestion.Tool)
	}
	if suggestion.Priority != "urgent" {
		t.Errorf("Expected urgent priority, got %s", suggestion.Priority)
	}
}

func TestClassifyStructuralErrors_HighCriticalCount(t *testing.T) {
	// Many errors + many critical → structural
	result := &validator.AIFriendlyResult{
		Valid:        false,
		ErrorCount:   30,
		ArtifactType: "insight_analyses",
		ErrorsBySection: []*validator.SectionErrors{
			{
				Section:    "target_users",
				ErrorCount: 30,
				Errors:     makeErrors(30, validator.ErrorConstraintViolation, validator.PriorityMedium),
			},
		},
		Summary: validator.ErrorSummary{
			CriticalCount: 12,
			MediumCount:   18,
		},
	}

	isStructural, suggestion := classifyStructuralErrors(result)
	if !isStructural {
		t.Error("Expected structural for high critical count (>10)")
	}
	if suggestion == nil {
		t.Fatal("Expected suggestion for structural errors")
	}
}

func TestClassifyStructuralErrors_ManyErrorsWithCritical(t *testing.T) {
	// >20 errors + >5 critical → structural (heuristic 2)
	result := &validator.AIFriendlyResult{
		Valid:        false,
		ErrorCount:   25,
		ArtifactType: "feature_definition",
		ErrorsBySection: []*validator.SectionErrors{
			{
				Section:    "definition",
				ErrorCount: 25,
				Errors:     makeErrors(25, validator.ErrorConstraintViolation, validator.PriorityMedium),
			},
		},
		Summary: validator.ErrorSummary{
			CriticalCount: 8,
			HighCount:     10,
			MediumCount:   7,
		},
	}

	isStructural, suggestion := classifyStructuralErrors(result)
	if !isStructural {
		t.Error("Expected structural for >20 errors with >5 critical")
	}
	if suggestion == nil {
		t.Fatal("Expected suggestion for structural errors")
	}
}

func TestGetToolTiers(t *testing.T) {
	tiers := getToolTiers()
	if len(tiers) != 3 {
		t.Fatalf("Expected 3 tiers, got %d", len(tiers))
	}

	// Tier 1: Essential — exactly 5 tools (wizard + agent entry points + memory status)
	if tiers[0].Tier != 1 {
		t.Errorf("Expected tier 1, got %d", tiers[0].Tier)
	}
	if tiers[0].Label != "Essential" {
		t.Errorf("Expected label 'Essential', got %s", tiers[0].Label)
	}
	if len(tiers[0].Tools) != 5 {
		t.Errorf("Expected 5 essential tools, got %d", len(tiers[0].Tools))
	}

	// Verify essential tools are the right ones
	essentialSet := map[string]bool{
		"epf_health_check":        false,
		"epf_get_wizard_for_task": false,
		"epf_get_agent_for_task":  false,
		"epf_validate_file":       false,
		"epf_memory_status":       false,
	}
	for _, tool := range tiers[0].Tools {
		if _, ok := essentialSet[tool]; ok {
			essentialSet[tool] = true
		}
	}
	for tool, found := range essentialSet {
		if !found {
			t.Errorf("Essential tool %s not found in tier 1", tool)
		}
	}

	// Tier 2: Guided — should have strategy and wizard tools
	if tiers[1].Label != "Guided" {
		t.Errorf("Expected label 'Guided', got %s", tiers[1].Label)
	}
	if len(tiers[1].Tools) == 0 {
		t.Error("Expected guided tools to be non-empty")
	}

	// Tier 3: Specialized — should have remaining tools
	if tiers[2].Label != "Specialized" {
		t.Errorf("Expected label 'Specialized', got %s", tiers[2].Label)
	}
	if len(tiers[2].Tools) == 0 {
		t.Error("Expected specialized tools to be non-empty")
	}
}

func TestToolTierForName(t *testing.T) {
	tests := []struct {
		name     string
		expected string
	}{
		// Essential (Tier 1)
		{"epf_health_check", "Essential"},
		{"epf_get_wizard_for_task", "Essential"},
		{"epf_get_agent_for_task", "Essential"},
		{"epf_validate_file", "Essential"},
		// Guided (Tier 2)
		{"epf_get_wizard", "Guided"},
		{"epf_get_agent", "Guided"},
		{"epf_get_skill", "Guided"},
		{"epf_list_agent_skills", "Guided"},
		{"epf_get_template", "Guided"},
		{"epf_get_product_vision", "Guided"},
		// Specialized (Tier 3)
		{"epf_list_schemas", "Specialized"},
		{"epf_fix_file", "Specialized"},
		{"epf_list_agents", "Specialized"},
		{"epf_list_skills", "Specialized"},
		{"epf_scaffold_agent", "Specialized"},
		{"epf_scaffold_skill", "Specialized"},
		{"epf_check_skill_prereqs", "Specialized"},
		{"epf_validate_skill_output", "Specialized"},
		// Unknown → default
		{"unknown_tool", "specialized"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tier := toolTierForName(tt.name)
			if tier != tt.expected {
				t.Errorf("toolTierForName(%q) = %q, want %q", tt.name, tier, tt.expected)
			}
		})
	}
}

func TestToolTiersNoOverlap(t *testing.T) {
	tiers := getToolTiers()
	seen := make(map[string]int)

	for _, tier := range tiers {
		for _, tool := range tier.Tools {
			if prevTier, exists := seen[tool]; exists {
				t.Errorf("Tool %q appears in both tier %d and tier %d", tool, prevTier, tier.Tier)
			}
			seen[tool] = tier.Tier
		}
	}
}

// makeErrors creates a slice of errors for testing
func makeErrors(count int, errType validator.ErrorType, priority validator.ErrorPriority) []*validator.EnhancedValidationError {
	errors := make([]*validator.EnhancedValidationError, count)
	for i := 0; i < count; i++ {
		errors[i] = &validator.EnhancedValidationError{
			Path:      "some.deep.path",
			ErrorType: errType,
			Priority:  priority,
		}
	}
	return errors
}

// =============================================================================
// Section 1: BuildActionDirective tests (task 1.6)
// =============================================================================

func TestBuildActionDirective_Empty(t *testing.T) {
	result := BuildActionDirective(nil)
	if result != "" {
		t.Errorf("Expected empty string for nil suggestions, got %q", result)
	}

	result = BuildActionDirective([]ToolCallSuggestion{})
	if result != "" {
		t.Errorf("Expected empty string for empty suggestions, got %q", result)
	}
}

func TestBuildActionDirective_SingleSuggestion(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:     "epf_get_wizard_for_task",
			Params:   map[string]string{"task": "fix value model quality issues"},
			Reason:   "Value model quality score 50/100 is below the 80 threshold",
			Priority: "urgent",
		},
	}

	result := BuildActionDirective(suggestions)

	if result == "" {
		t.Fatal("Expected non-empty directive")
	}
	if !strings.Contains(result, "IMPORTANT") {
		t.Error("Expected directive to contain 'IMPORTANT'")
	}
	if !strings.Contains(result, "URGENT:") {
		t.Error("Expected directive to contain 'URGENT:' for urgent priority")
	}
	if !strings.Contains(result, "epf_get_wizard_for_task") {
		t.Error("Expected directive to contain tool name")
	}
	if !strings.Contains(result, "task='fix value model quality issues'") {
		t.Error("Expected directive to contain params")
	}
	if !strings.Contains(result, "Do NOT skip") {
		t.Error("Expected directive to contain anti-skip warning")
	}
}

func TestBuildActionDirective_MultipleSuggestions(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:     "epf_get_wizard_for_task",
			Params:   map[string]string{"task": "fix value model"},
			Reason:   "Low quality score",
			Priority: "urgent",
		},
		{
			Tool:     "epf_validate_relationships",
			Params:   map[string]string{"instance_path": "/test"},
			Reason:   "3 invalid paths",
			Priority: "recommended",
		},
	}

	result := BuildActionDirective(suggestions)

	if !strings.Contains(result, "1. URGENT:") {
		t.Error("Expected numbered urgent item")
	}
	if !strings.Contains(result, "2. RECOMMENDED:") {
		t.Error("Expected numbered recommended item")
	}
	if !strings.Contains(result, "epf_get_wizard_for_task") {
		t.Error("Expected first tool name")
	}
	if !strings.Contains(result, "epf_validate_relationships") {
		t.Error("Expected second tool name")
	}
}

func TestBuildActionDirective_OptionalPriority(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:     "epf_aim_assess",
			Params:   map[string]string{"instance_path": "/test"},
			Reason:   "AIM diagnostic",
			Priority: "optional",
		},
	}

	result := BuildActionDirective(suggestions)

	// Optional priority should not have URGENT: or RECOMMENDED: prefix
	if strings.Contains(result, "URGENT:") || strings.Contains(result, "RECOMMENDED:") {
		t.Error("Expected no URGENT/RECOMMENDED prefix for optional priority")
	}
	if !strings.Contains(result, "Call epf_aim_assess") {
		t.Error("Expected tool call instruction")
	}
}

func TestBuildActionDirective_NoParams(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:     "epf_health_check",
			Priority: "recommended",
		},
	}

	result := BuildActionDirective(suggestions)

	if !strings.Contains(result, "Call epf_health_check") {
		t.Error("Expected tool call instruction")
	}
	// Should NOT contain "with" since there are no params
	if strings.Contains(result, " with ") {
		t.Error("Expected no 'with' clause when params are empty")
	}
}

// =============================================================================
// Section 1: BuildActionDirectiveForValidation tests (task 1.7)
// =============================================================================

func TestBuildActionDirectiveForValidation_NoErrors(t *testing.T) {
	result := BuildActionDirectiveForValidation(false, nil, 0, "/test/file.yaml")
	if result != "" {
		t.Errorf("Expected empty string for zero errors and non-structural, got %q", result)
	}
}

func TestBuildActionDirectiveForValidation_Structural(t *testing.T) {
	suggestion := &ToolCallSuggestion{
		Tool:   "epf_get_wizard_for_task",
		Params: map[string]string{"task": "fix north_star structure"},
	}

	result := BuildActionDirectiveForValidation(true, suggestion, 25, "/test/north_star.yaml")

	if !strings.Contains(result, "IMPORTANT") {
		t.Error("Expected 'IMPORTANT' for structural issues")
	}
	if !strings.Contains(result, "Structural issues") {
		t.Error("Expected 'Structural issues' mention")
	}
	if !strings.Contains(result, "25 errors") {
		t.Error("Expected error count in message")
	}
	if !strings.Contains(result, "epf_get_wizard_for_task") {
		t.Error("Expected wizard tool suggestion")
	}
	if !strings.Contains(result, "Do NOT brute-force") {
		t.Error("Expected anti-brute-force warning")
	}
}

func TestBuildActionDirectiveForValidation_NonStructuralErrors(t *testing.T) {
	result := BuildActionDirectiveForValidation(false, nil, 5, "/test/fd-001.yaml")

	if !strings.Contains(result, "5 error(s)") {
		t.Error("Expected error count")
	}
	if !strings.Contains(result, "fix_hint") {
		t.Error("Expected fix_hint guidance mention")
	}
	if !strings.Contains(result, "epf_validate_file") {
		t.Error("Expected re-validate instruction")
	}
}

func TestBuildActionDirectiveForValidation_StructuralButNilSuggestion(t *testing.T) {
	// Edge case: structural=true but suggestion is nil — should fall through to error count path
	result := BuildActionDirectiveForValidation(true, nil, 10, "/test/file.yaml")

	// Should still produce output because errorCount > 0
	if result == "" {
		t.Error("Expected non-empty string for errors even without suggestion")
	}
	if !strings.Contains(result, "10 error(s)") {
		t.Error("Expected error count in fallback message")
	}
}

// =============================================================================
// Section 2: BuildRemainingSteps tests (task 2.5)
// =============================================================================

func TestBuildRemainingSteps_Empty(t *testing.T) {
	result := BuildRemainingSteps(nil)
	if result != nil {
		t.Errorf("Expected nil for nil suggestions, got %v", result)
	}

	result = BuildRemainingSteps([]ToolCallSuggestion{})
	if result != nil {
		t.Errorf("Expected nil for empty suggestions, got %v", result)
	}
}

func TestBuildRemainingSteps_MultipleSuggestions(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:   "epf_get_wizard_for_task",
			Params: map[string]string{"task": "fix value model"},
		},
		{
			Tool:   "epf_validate_relationships",
			Params: map[string]string{"instance_path": "/test"},
		},
	}

	result := BuildRemainingSteps(suggestions)

	// Should have suggestion count + 2 trailing steps
	expectedLen := len(suggestions) + 2
	if len(result) != expectedLen {
		t.Errorf("Expected %d steps, got %d", expectedLen, len(result))
	}

	// First steps should be the tool calls
	if !strings.Contains(result[0], "epf_get_wizard_for_task") {
		t.Errorf("Expected first step to contain wizard tool, got %q", result[0])
	}
	if !strings.Contains(result[1], "epf_validate_relationships") {
		t.Errorf("Expected second step to contain relationship tool, got %q", result[1])
	}

	// Should end with guidance and health check
	if !strings.Contains(result[len(result)-2], "Follow the tool guidance") {
		t.Errorf("Expected penultimate step to contain guidance, got %q", result[len(result)-2])
	}
	if !strings.Contains(result[len(result)-1], "epf_health_check") {
		t.Errorf("Expected last step to mention health check, got %q", result[len(result)-1])
	}
}

func TestBuildRemainingSteps_SingleSuggestionWithParams(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool:   "epf_validate_with_plan",
			Params: map[string]string{"path": "/test/file.yaml"},
		},
	}

	result := BuildRemainingSteps(suggestions)

	if len(result) != 3 { // 1 tool + 2 trailing
		t.Errorf("Expected 3 steps, got %d", len(result))
	}

	if !strings.Contains(result[0], "path='/test/file.yaml'") {
		t.Errorf("Expected params in step, got %q", result[0])
	}
}

func TestBuildRemainingSteps_NoParams(t *testing.T) {
	suggestions := []ToolCallSuggestion{
		{
			Tool: "epf_health_check",
		},
	}

	result := BuildRemainingSteps(suggestions)

	if len(result) != 3 {
		t.Errorf("Expected 3 steps, got %d", len(result))
	}
	// Should NOT contain "with" since there are no params
	if strings.Contains(result[0], " with ") {
		t.Error("Expected no 'with' clause when params are empty")
	}
}

// =============================================================================
// Section 5: Anti-loop detection helper tests (task 5.6)
// =============================================================================

func TestBuildCallCountWarning(t *testing.T) {
	warning := buildCallCountWarning("epf_health_check", 5, "epf_get_wizard_for_task")

	if warning == nil {
		t.Fatal("Expected non-nil warning")
	}
	if warning.ToolName != "epf_health_check" {
		t.Errorf("Expected ToolName='epf_health_check', got %q", warning.ToolName)
	}
	if warning.CallCount != 5 {
		t.Errorf("Expected CallCount=5, got %d", warning.CallCount)
	}
	if warning.SuggestedNext != "epf_get_wizard_for_task" {
		t.Errorf("Expected SuggestedNext='epf_get_wizard_for_task', got %q", warning.SuggestedNext)
	}
	if !strings.Contains(warning.Message, "WARNING") {
		t.Error("Expected message to contain 'WARNING'")
	}
	if !strings.Contains(warning.Message, "5 times") {
		t.Error("Expected message to contain call count")
	}
	if !strings.Contains(warning.Message, "epf_get_wizard_for_task") {
		t.Error("Expected message to contain suggested next tool")
	}
}

func TestBuildCallCountWarning_NoSuggestedNext(t *testing.T) {
	warning := buildCallCountWarning("epf_some_tool", 3, "")

	if warning == nil {
		t.Fatal("Expected non-nil warning")
	}
	if warning.SuggestedNext != "" {
		t.Errorf("Expected empty SuggestedNext, got %q", warning.SuggestedNext)
	}
	// Message should end with period but NOT contain "call" for suggested next
	if strings.Contains(warning.Message, ": call ") {
		t.Error("Expected no suggested next tool in message when empty")
	}
}

func TestSuggestNextToolForLoop(t *testing.T) {
	tests := []struct {
		toolName string
		expected string
	}{
		// Wizard workflow loop breakers
		{"epf_health_check", "epf_get_wizard_for_task"},
		{"epf_validate_file", "epf_get_wizard_for_task"},
		{"epf_get_wizard_for_task", "epf_get_wizard"},
		{"epf_get_wizard", "epf_get_template"},
		{"epf_get_template", "epf_validate_file"},
		// Agent/skill workflow loop breakers
		{"epf_get_agent_for_task", "epf_get_agent"},
		{"epf_get_agent", "epf_get_skill"},
		{"epf_get_skill", "epf_validate_skill_output"},
		{"epf_list_agents", "epf_get_agent"},
		{"epf_list_skills", "epf_get_skill"},
		{"epf_validate_skill_output", "epf_validate_file"},
		{"epf_list_agent_skills", "epf_get_skill"},
		// Unknown
		{"unknown_tool", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.toolName, func(t *testing.T) {
			result := suggestNextToolForLoop(tt.toolName)
			if result != tt.expected {
				t.Errorf("suggestNextToolForLoop(%q) = %q, want %q", tt.toolName, result, tt.expected)
			}
		})
	}
}

func TestLoopThreshold(t *testing.T) {
	if loopThreshold != 2 {
		t.Errorf("Expected loopThreshold=2, got %d", loopThreshold)
	}
}
