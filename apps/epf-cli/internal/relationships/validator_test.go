package relationships

import (
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/roadmap"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/valuemodel"
)

// Helper to create a minimal value model set for testing
func createTestValueModelSet() *valuemodel.ValueModelSet {
	set := valuemodel.NewValueModelSet()

	set.Models[valuemodel.TrackProduct] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackProduct,
		Layers: []valuemodel.Layer{
			{
				ID:   "discovery",
				Name: "Discovery",
				Components: []valuemodel.Component{
					{
						ID:   "knowledge-exploration",
						Name: "Knowledge Exploration",
						SubComponents: []valuemodel.SubComponent{
							{ID: "semantic-search", Name: "Semantic Search", Active: true},
							{ID: "graph-navigation", Name: "Graph Navigation", Active: true},
						},
					},
					{
						ID:   "content-discovery",
						Name: "Content Discovery",
					},
				},
			},
			{
				ID:   "search",
				Name: "Search",
				Components: []valuemodel.Component{
					{
						ID:   "semantic-findability",
						Name: "Semantic Findability",
					},
				},
			},
			{
				ID:   "core",
				Name: "Core Platform",
				Components: []valuemodel.Component{
					{
						ID:   "data-management",
						Name: "Data Management",
					},
					{
						ID:   "rag-retrieval",
						Name: "RAG Retrieval",
					},
				},
			},
		},
	}

	set.Models[valuemodel.TrackStrategy] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackStrategy,
		Layers: []valuemodel.Layer{
			{
				ID:   "market",
				Name: "Market",
				Components: []valuemodel.Component{
					{
						ID:   "positioning",
						Name: "Positioning",
					},
				},
			},
		},
	}

	return set
}

func TestValidatorValidatePath(t *testing.T) {
	valueModels := createTestValueModelSet()
	validator := NewValidator(valueModels)

	tests := []struct {
		path    string
		wantErr bool
	}{
		// Valid paths
		{"Product.Discovery.KnowledgeExploration", false},
		{"Product.Search.SemanticFindability", false},
		{"Product.Core.DataManagement", false},
		{"Strategy.Market.Positioning", false},

		// Valid with different casing
		{"product.discovery.knowledge-exploration", false},
		{"Product.discovery.KnowledgeExploration", false},

		// Invalid paths
		{"Product.Discovery.NonExistent", true},
		{"Product.NonExistent.Something", true},
		{"NonExistent.Layer.Component", true},
		{"", true},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result, err := validator.ValidatePath(tt.path)

			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidatePath(%q) expected error, got nil", tt.path)
				}
				if result.Valid {
					t.Errorf("ValidatePath(%q) result.Valid = true, want false", tt.path)
				}
			} else {
				if err != nil {
					t.Errorf("ValidatePath(%q) unexpected error: %v", tt.path, err)
				}
				if !result.Valid {
					t.Errorf("ValidatePath(%q) result.Valid = false, want true", tt.path)
				}
			}
		})
	}
}

func TestValidatorValidateFeature(t *testing.T) {
	valueModels := createTestValueModelSet()
	validator := NewValidator(valueModels)

	// Feature with all valid paths
	validFeature := &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
				"Product.Search.SemanticFindability",
			},
		},
	}

	errors := validator.ValidateFeature(validFeature)
	if len(errors) != 0 {
		t.Errorf("ValidateFeature(validFeature) returned %d errors, want 0", len(errors))
		for _, e := range errors {
			t.Logf("  Error: %v", e)
		}
	}

	// Feature with some invalid paths
	invalidFeature := &FeatureDefinition{
		ID: "fd-002",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration", // valid
				"Product.Discovery.NonExistent",          // invalid
				"NonExistent.Layer.Component",            // invalid
			},
		},
	}

	errors = validator.ValidateFeature(invalidFeature)
	if len(errors) != 2 {
		t.Errorf("ValidateFeature(invalidFeature) returned %d errors, want 2", len(errors))
	}

	// Check error details
	for _, e := range errors {
		if e.Source != "fd-002" {
			t.Errorf("Error source = %q, want 'fd-002'", e.Source)
		}
		if e.SourceType != "feature" {
			t.Errorf("Error sourceType = %q, want 'feature'", e.SourceType)
		}
		if e.Field != "contributes_to" {
			t.Errorf("Error field = %q, want 'contributes_to'", e.Field)
		}
	}
}

func TestValidatorValidateFeatures(t *testing.T) {
	valueModels := createTestValueModelSet()
	validator := NewValidator(valueModels)

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
			},
		},
	}
	features.ByID["fd-002"] = &FeatureDefinition{
		ID: "fd-002",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.NonExistent", // invalid
			},
		},
	}

	result := validator.ValidateFeatures(features)

	if result.Valid {
		t.Error("ValidateFeatures should return Valid=false with invalid paths")
	}

	if result.Stats.TotalFeaturesChecked != 2 {
		t.Errorf("TotalFeaturesChecked = %d, want 2", result.Stats.TotalFeaturesChecked)
	}

	if result.Stats.TotalPathsChecked != 2 {
		t.Errorf("TotalPathsChecked = %d, want 2", result.Stats.TotalPathsChecked)
	}

	if result.Stats.ValidPaths != 1 {
		t.Errorf("ValidPaths = %d, want 1", result.Stats.ValidPaths)
	}

	if result.Stats.InvalidPaths != 1 {
		t.Errorf("InvalidPaths = %d, want 1", result.Stats.InvalidPaths)
	}
}

func TestValidatorValidateKR(t *testing.T) {
	valueModels := createTestValueModelSet()
	validator := NewValidator(valueModels)

	// Valid KR
	validKR := &roadmap.KeyResult{
		ID: "kr-p-001",
		ValueModelTarget: &roadmap.ValueModelTarget{
			Track:         "product",
			ComponentPath: "core.data-management",
		},
	}

	err := validator.ValidateKR(validKR, "kr-p-001")
	if err != nil {
		t.Errorf("ValidateKR(validKR) returned error: %v", err)
	}

	// Invalid KR
	invalidKR := &roadmap.KeyResult{
		ID: "kr-p-002",
		ValueModelTarget: &roadmap.ValueModelTarget{
			Track:         "product",
			ComponentPath: "core.non-existent",
		},
	}

	err = validator.ValidateKR(invalidKR, "kr-p-002")
	if err == nil {
		t.Error("ValidateKR(invalidKR) should return error")
	}

	// KR without value_model_target (should be valid - it's optional)
	noTargetKR := &roadmap.KeyResult{
		ID: "kr-p-003",
	}

	err = validator.ValidateKR(noTargetKR, "kr-p-003")
	if err != nil {
		t.Errorf("ValidateKR(noTargetKR) should not return error for missing target: %v", err)
	}
}

func TestValidationResultGroupBySource(t *testing.T) {
	result := &ValidationResult{
		Valid: false,
		Errors: []*ValidationError{
			{Source: "fd-001", Field: "contributes_to", InvalidPath: "path1"},
			{Source: "fd-001", Field: "contributes_to", InvalidPath: "path2"},
			{Source: "fd-002", Field: "contributes_to", InvalidPath: "path3"},
			{Source: "kr-p-001", Field: "value_model_target", InvalidPath: "path4"},
		},
	}

	grouped := result.GroupBySource()

	if len(grouped["fd-001"]) != 2 {
		t.Errorf("Expected 2 errors for fd-001, got %d", len(grouped["fd-001"]))
	}

	if len(grouped["fd-002"]) != 1 {
		t.Errorf("Expected 1 error for fd-002, got %d", len(grouped["fd-002"]))
	}

	if len(grouped["kr-p-001"]) != 1 {
		t.Errorf("Expected 1 error for kr-p-001, got %d", len(grouped["kr-p-001"]))
	}
}

func TestValidationResultGetErrorsAndWarnings(t *testing.T) {
	result := &ValidationResult{
		Errors: []*ValidationError{
			{Severity: SeverityError, Message: "error1"},
			{Severity: SeverityWarning, Message: "warning1"},
			{Severity: SeverityError, Message: "error2"},
			{Severity: SeverityInfo, Message: "info1"},
		},
	}

	errors := result.GetErrors()
	if len(errors) != 2 {
		t.Errorf("GetErrors() returned %d, want 2", len(errors))
	}

	warnings := result.GetWarnings()
	if len(warnings) != 1 {
		t.Errorf("GetWarnings() returned %d, want 1", len(warnings))
	}
}

func TestValidationResultSummary(t *testing.T) {
	result := &ValidationResult{
		Valid: false,
		Stats: ValidationStats{
			TotalFeaturesChecked: 5,
			TotalKRsChecked:      10,
			TotalPathsChecked:    20,
			ValidPaths:           18,
			InvalidPaths:         2,
			ErrorCount:           2,
			WarningCount:         0,
		},
		Errors: []*ValidationError{
			{
				Source:      "fd-001",
				Field:       "contributes_to",
				InvalidPath: "Invalid.Path",
				Message:     "path not found",
				DidYouMean:  "Valid.Path",
			},
		},
	}

	summary := result.Summary()

	// Check that summary contains expected information
	if summary == "" {
		t.Error("Summary() returned empty string")
	}

	// Check for key elements in summary
	expectedPhrases := []string{
		"Features checked: 5",
		"KRs checked: 10",
		"Paths checked: 20",
		"Valid: 18",
		"Invalid: 2",
		"2 error(s)",
	}

	for _, phrase := range expectedPhrases {
		if !containsString(summary, phrase) {
			t.Errorf("Summary missing expected phrase: %q", phrase)
		}
	}
}

func TestBuildKRPath(t *testing.T) {
	tests := []struct {
		track         string
		componentPath string
		expected      string
	}{
		{"product", "core.data-management", "Product.Core.DataManagement"},
		{"Product", "discovery.knowledge-exploration", "Product.Discovery.KnowledgeExploration"},
		{"strategy", "market.positioning", "Strategy.Market.Positioning"},
		{"org_ops", "operations.workflow", "OrgOps.Operations.Workflow"},
	}

	for _, tt := range tests {
		t.Run(tt.track+"/"+tt.componentPath, func(t *testing.T) {
			result := buildKRPath(tt.track, tt.componentPath)
			if result != tt.expected {
				t.Errorf("buildKRPath(%q, %q) = %q, want %q",
					tt.track, tt.componentPath, result, tt.expected)
			}
		})
	}
}

func TestValidatorValidateAll(t *testing.T) {
	valueModels := createTestValueModelSet()
	validator := NewValidator(valueModels)

	// Create feature set
	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
			},
		},
	}

	// Create roadmap with KRs
	roadmapData := &roadmap.Roadmap{
		Tracks: roadmap.Tracks{
			Product: &roadmap.TrackConfig{
				OKRs: []roadmap.OKR{
					{
						ID: "okr-p-1",
						KeyResults: []roadmap.KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &roadmap.ValueModelTarget{
									Track:         "product",
									ComponentPath: "core.data-management",
								},
							},
						},
					},
				},
			},
		},
	}

	result := validator.ValidateAll(features, roadmapData)

	if !result.Valid {
		t.Error("ValidateAll should return Valid=true for valid data")
		for _, e := range result.Errors {
			t.Logf("  Error: %v", e)
		}
	}

	if result.Stats.TotalFeaturesChecked != 1 {
		t.Errorf("TotalFeaturesChecked = %d, want 1", result.Stats.TotalFeaturesChecked)
	}

	if result.Stats.TotalKRsChecked != 1 {
		t.Errorf("TotalKRsChecked = %d, want 1", result.Stats.TotalKRsChecked)
	}
}

// Helper function
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
