package schema

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestArtifactTypeFromString tests the ArtifactTypeFromString function
func TestArtifactTypeFromString(t *testing.T) {
	tests := []struct {
		input    string
		expected ArtifactType
		wantErr  bool
	}{
		{"north_star", ArtifactNorthStar, false},
		{"north-star", ArtifactNorthStar, false},
		{"NORTH_STAR", ArtifactNorthStar, false},
		{"North-Star", ArtifactNorthStar, false},
		{"feature_definition", ArtifactFeatureDefinition, false},
		{"feature-definition", ArtifactFeatureDefinition, false},
		{"value_model", ArtifactValueModel, false},
		{"roadmap_recipe", ArtifactRoadmapRecipe, false},
		{"mappings", ArtifactMappings, false},
		{"unknown_type", "", true},
		{"", "", true},
		{"invalid", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, err := ArtifactTypeFromString(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ArtifactTypeFromString(%q) expected error, got nil", tt.input)
				}
			} else {
				if err != nil {
					t.Errorf("ArtifactTypeFromString(%q) unexpected error: %v", tt.input, err)
				}
				if result != tt.expected {
					t.Errorf("ArtifactTypeFromString(%q) = %v, want %v", tt.input, result, tt.expected)
				}
			}
		})
	}
}

// TestDetectArtifactType tests the DetectArtifactType function
func TestDetectArtifactType(t *testing.T) {
	loader := NewLoader("/fake/path") // Path doesn't matter for detection

	tests := []struct {
		filePath string
		expected ArtifactType
		wantErr  bool
	}{
		// READY phase files
		{"READY/00_north_star.yaml", ArtifactNorthStar, false},
		{"READY/00_north_star.yml", ArtifactNorthStar, false},
		{"instance/READY/01_insight_analyses.yaml", ArtifactInsightAnalyses, false},
		{"READY/02_strategy_foundations.yaml", ArtifactStrategyFoundations, false},
		{"READY/03_insight_opportunity.yaml", ArtifactInsightOpportunity, false},
		{"READY/04_strategy_formula.yaml", ArtifactStrategyFormula, false},
		{"READY/05_roadmap_recipe.yaml", ArtifactRoadmapRecipe, false},
		{"READY/04_roadmap_recipe.yaml", ArtifactRoadmapRecipe, false}, // Also valid with 04
		{"product_portfolio.yaml", ArtifactProductPortfolio, false},

		// FIRE phase files
		{"FIRE/feature_definitions/fd-001_something.yaml", ArtifactFeatureDefinition, false},
		{"FIRE/feature_definition/my_feature.yaml", ArtifactFeatureDefinition, false},
		{"fd-123_feature.yaml", ArtifactFeatureDefinition, false},
		{"FIRE/value_models/some_model.yaml", ArtifactValueModel, false},
		{"something_value_model.yaml", ArtifactValueModel, false},
		{"FIRE/workflows/process.yaml", ArtifactWorkflow, false},
		{"FIRE/mappings.yaml", ArtifactMappings, false},

		// AIM phase files
		{"AIM/assessment_report.yaml", ArtifactAssessmentReport, false},
		{"AIM/calibration_memo.yaml", ArtifactCalibrationMemo, false},

		// Track definitions
		{"definitions/strategy_definition.yaml", ArtifactStrategyDefinition, false},
		{"definitions/strategy-definition.yaml", ArtifactStrategyDefinition, false},
		{"definitions/org_ops_definition.yaml", ArtifactOrgOpsDefinition, false},
		{"definitions/orgops_definition.yaml", ArtifactOrgOpsDefinition, false},
		{"definitions/commercial_definition.yaml", ArtifactCommercialDefinition, false},

		// Other artifacts
		{"track_health_assessment.yaml", ArtifactTrackHealthAssessment, false},
		{"track-health-assessment.yaml", ArtifactTrackHealthAssessment, false},
		{"current_reality_assessment.yaml", ArtifactCurrentRealityAssessment, false},
		{"aim_trigger_config.yaml", ArtifactAimTriggerConfig, false},

		// Unknown files
		{"random_file.yaml", "", true},
		{"READY/unknown.yaml", "", true},
		{"some/path/file.txt", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.filePath, func(t *testing.T) {
			result, err := loader.DetectArtifactType(tt.filePath)
			if tt.wantErr {
				if err == nil {
					t.Errorf("DetectArtifactType(%q) expected error, got nil", tt.filePath)
				}
			} else {
				if err != nil {
					t.Errorf("DetectArtifactType(%q) unexpected error: %v", tt.filePath, err)
				}
				if result != tt.expected {
					t.Errorf("DetectArtifactType(%q) = %v, want %v", tt.filePath, result, tt.expected)
				}
			}
		})
	}
}

// TestSchemaFilename tests the SchemaFilename function
func TestSchemaFilename(t *testing.T) {
	tests := []struct {
		artifactType ArtifactType
		expected     string
	}{
		{ArtifactNorthStar, "north_star_schema.json"},
		{ArtifactFeatureDefinition, "feature_definition_schema.json"},
		{ArtifactValueModel, "value_model_schema.json"},
		{ArtifactMappings, "mappings_schema.json"},
		{ArtifactType("unknown"), ""},
	}

	for _, tt := range tests {
		t.Run(string(tt.artifactType), func(t *testing.T) {
			result := SchemaFilename(tt.artifactType)
			if result != tt.expected {
				t.Errorf("SchemaFilename(%v) = %q, want %q", tt.artifactType, result, tt.expected)
			}
		})
	}
}

// TestAllArtifactTypes tests that AllArtifactTypes returns all types
func TestAllArtifactTypes(t *testing.T) {
	types := AllArtifactTypes()

	if len(types) == 0 {
		t.Error("AllArtifactTypes() returned empty slice")
	}

	// Check that some expected types are present
	expectedTypes := []ArtifactType{
		ArtifactNorthStar,
		ArtifactFeatureDefinition,
		ArtifactValueModel,
		ArtifactMappings,
	}

	for _, expected := range expectedTypes {
		found := false
		for _, at := range types {
			if at == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("AllArtifactTypes() missing expected type: %v", expected)
		}
	}
}

// TestNewLoader tests creating a new loader
func TestNewLoader(t *testing.T) {
	loader := NewLoader("/fake/path")
	if loader == nil {
		t.Error("NewLoader() returned nil")
	}
	if loader.schemasDir != "/fake/path" {
		t.Errorf("NewLoader() schemasDir = %q, want %q", loader.schemasDir, "/fake/path")
	}
	if loader.schemas == nil {
		t.Error("NewLoader() schemas map is nil")
	}
}

// TestLoaderLoad tests loading schemas from the actual schemas directory
func TestLoaderLoad(t *testing.T) {
	// Find the actual schemas directory
	// This test requires the real schemas to exist
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get working directory: %v", err)
	}

	// Try to find schemas directory by walking up
	schemasDir := ""
	searchDir := cwd
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(searchDir, "docs", "EPF", "schemas")
		if _, err := os.Stat(candidate); err == nil {
			schemasDir = candidate
			break
		}
		searchDir = filepath.Dir(searchDir)
	}

	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	loader := NewLoader(schemasDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	// Check that schemas were loaded
	schemas := loader.ListSchemas()
	if len(schemas) == 0 {
		t.Error("Load() loaded no schemas")
	}

	// Check that we can get a specific schema
	schema, err := loader.GetSchema(ArtifactNorthStar)
	if err != nil {
		t.Errorf("GetSchema(ArtifactNorthStar) error: %v", err)
	}
	if schema == nil {
		t.Error("GetSchema(ArtifactNorthStar) returned nil")
	}
}

// TestLoaderLoadNonexistent tests loading from a nonexistent directory (falls back to embedded)
func TestLoaderLoadNonexistent(t *testing.T) {
	loader := NewLoader("/nonexistent/path/to/schemas")
	err := loader.Load()
	// With embedded fallback, this should now succeed if embedded artifacts are available
	if err != nil {
		// Check if we're running without embedded artifacts (e.g., in CI without sync)
		if !strings.Contains(err.Error(), "embedded") {
			t.Logf("Load() returned error (expected if embedded not available): %v", err)
		}
	} else {
		// If it succeeded, verify it loaded from embedded
		if !loader.IsEmbedded() {
			t.Error("Load() should have used embedded fallback for nonexistent path")
		}
	}
}

// TestGetArtifactTypesByPhase tests filtering by phase
func TestGetArtifactTypesByPhase(t *testing.T) {
	// Find the actual schemas directory
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get working directory: %v", err)
	}

	schemasDir := ""
	searchDir := cwd
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(searchDir, "docs", "EPF", "schemas")
		if _, err := os.Stat(candidate); err == nil {
			schemasDir = candidate
			break
		}
		searchDir = filepath.Dir(searchDir)
	}

	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	loader := NewLoader(schemasDir)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	// Test READY phase
	readyTypes := loader.GetArtifactTypesByPhase(PhaseREADY)
	if len(readyTypes) == 0 {
		t.Error("GetArtifactTypesByPhase(READY) returned empty")
	}

	// Verify north_star is in READY phase
	found := false
	for _, at := range readyTypes {
		if at == ArtifactNorthStar {
			found = true
			break
		}
	}
	if !found {
		t.Error("north_star should be in READY phase")
	}

	// Test FIRE phase
	fireTypes := loader.GetArtifactTypesByPhase(PhaseFIRE)
	if len(fireTypes) == 0 {
		t.Error("GetArtifactTypesByPhase(FIRE) returned empty")
	}

	// Verify feature_definition is in FIRE phase
	found = false
	for _, at := range fireTypes {
		if at == ArtifactFeatureDefinition {
			found = true
			break
		}
	}
	if !found {
		t.Error("feature_definition should be in FIRE phase")
	}
}
