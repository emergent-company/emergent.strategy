package mcp

import (
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
		if s.Tool == "epf_get_wizard_for_task" && s.Priority == "urgent" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected urgent wizard suggestion for low value model quality")
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
	if suggestion.Tool != "epf_get_wizard_for_task" {
		t.Errorf("Expected wizard tool suggestion, got %s", suggestion.Tool)
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

	// Tier 1: Essential — exactly 3 tools
	if tiers[0].Tier != 1 {
		t.Errorf("Expected tier 1, got %d", tiers[0].Tier)
	}
	if tiers[0].Label != "Essential" {
		t.Errorf("Expected label 'Essential', got %s", tiers[0].Label)
	}
	if len(tiers[0].Tools) != 3 {
		t.Errorf("Expected 3 essential tools, got %d", len(tiers[0].Tools))
	}

	// Verify essential tools are the right ones
	essentialSet := map[string]bool{
		"epf_health_check":        false,
		"epf_get_wizard_for_task": false,
		"epf_validate_file":       false,
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
		{"epf_health_check", "Essential"},
		{"epf_get_wizard_for_task", "Essential"},
		{"epf_validate_file", "Essential"},
		{"epf_get_wizard", "Guided"},
		{"epf_get_template", "Guided"},
		{"epf_get_product_vision", "Guided"},
		{"epf_list_schemas", "Specialized"},
		{"epf_fix_file", "Specialized"},
		{"unknown_tool", "specialized"}, // default
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
