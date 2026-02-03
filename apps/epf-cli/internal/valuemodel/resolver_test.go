package valuemodel

import (
	"testing"
)

func createTestValueModelSet() *ValueModelSet {
	set := NewValueModelSet()
	set.Models[TrackProduct] = &ValueModel{
		TrackName: TrackProduct,
		Layers: []Layer{
			{
				ID:   "core-platform",
				Name: "Core Platform",
				Components: []Component{
					{
						ID:   "data-management",
						Name: "Data Management",
						Subs: []SubComponent{
							{ID: "csv-import", Name: "CSV Import", Active: true},
							{ID: "excel-sync", Name: "Excel Sync", Active: false},
						},
					},
					{
						ID:   "knowledge-access",
						Name: "Knowledge Access",
						Subs: []SubComponent{
							{ID: "semantic-search", Name: "Semantic Search", Active: true},
							{ID: "ai-chat", Name: "AI Chat", Active: true},
						},
					},
				},
			},
			{
				ID:   "intelligence",
				Name: "Intelligence",
				Components: []Component{
					{
						ID:   "analysis",
						Name: "Analysis",
						Subs: []SubComponent{
							{ID: "reporting", Name: "Reporting", Active: true},
						},
					},
				},
			},
		},
	}
	set.Models[TrackStrategy] = &ValueModel{
		TrackName: TrackStrategy,
		Layers: []Layer{
			{
				ID:   "market-expansion",
				Name: "Market Expansion",
				Components: []Component{
					{
						ID:   "enterprise-gtm",
						Name: "Enterprise GTM",
					},
				},
			},
		},
	}
	return set
}

func TestResolver_Resolve_Track(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		path          string
		expectedTrack Track
		expectedDepth int
	}{
		{"Product", TrackProduct, 1},
		{"product", TrackProduct, 1},
		{"Strategy", TrackStrategy, 1},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			res, err := resolver.Resolve(tt.path)
			if err != nil {
				t.Fatalf("Resolve(%q) failed: %v", tt.path, err)
			}
			if res.Track != tt.expectedTrack {
				t.Errorf("expected Track=%s, got %s", tt.expectedTrack, res.Track)
			}
			if res.Depth != tt.expectedDepth {
				t.Errorf("expected Depth=%d, got %d", tt.expectedDepth, res.Depth)
			}
			if res.TrackModel == nil {
				t.Error("expected TrackModel to be set")
			}
		})
	}
}

func TestResolver_Resolve_Layer(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		path            string
		expectedLayerID string
		expectedDepth   int
	}{
		{"Product.CorePlatform", "core-platform", 2},
		{"Product.core-platform", "core-platform", 2},
		{"Product.Core Platform", "core-platform", 2},
		{"Product.Intelligence", "intelligence", 2},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			res, err := resolver.Resolve(tt.path)
			if err != nil {
				t.Fatalf("Resolve(%q) failed: %v", tt.path, err)
			}
			if res.Layer == nil {
				t.Fatal("expected Layer to be set")
			}
			if res.Layer.ID != tt.expectedLayerID {
				t.Errorf("expected Layer.ID=%s, got %s", tt.expectedLayerID, res.Layer.ID)
			}
			if res.Depth != tt.expectedDepth {
				t.Errorf("expected Depth=%d, got %d", tt.expectedDepth, res.Depth)
			}
		})
	}
}

func TestResolver_Resolve_Component(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		path                string
		expectedComponentID string
		expectedDepth       int
	}{
		{"Product.CorePlatform.DataManagement", "data-management", 3},
		{"Product.CorePlatform.data-management", "data-management", 3},
		{"Product.CorePlatform.KnowledgeAccess", "knowledge-access", 3},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			res, err := resolver.Resolve(tt.path)
			if err != nil {
				t.Fatalf("Resolve(%q) failed: %v", tt.path, err)
			}
			if res.Component == nil {
				t.Fatal("expected Component to be set")
			}
			if res.Component.ID != tt.expectedComponentID {
				t.Errorf("expected Component.ID=%s, got %s", tt.expectedComponentID, res.Component.ID)
			}
			if res.Depth != tt.expectedDepth {
				t.Errorf("expected Depth=%d, got %d", tt.expectedDepth, res.Depth)
			}
		})
	}
}

func TestResolver_Resolve_SubComponent(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		path                   string
		expectedSubComponentID string
		expectedDepth          int
	}{
		{"Product.CorePlatform.DataManagement.CsvImport", "csv-import", 4},
		{"Product.CorePlatform.DataManagement.csv-import", "csv-import", 4},
		{"Product.CorePlatform.KnowledgeAccess.SemanticSearch", "semantic-search", 4},
		{"Product.CorePlatform.KnowledgeAccess.AiChat", "ai-chat", 4},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			res, err := resolver.Resolve(tt.path)
			if err != nil {
				t.Fatalf("Resolve(%q) failed: %v", tt.path, err)
			}
			if res.SubComponent == nil {
				t.Fatal("expected SubComponent to be set")
			}
			if res.SubComponent.ID != tt.expectedSubComponentID {
				t.Errorf("expected SubComponent.ID=%s, got %s", tt.expectedSubComponentID, res.SubComponent.ID)
			}
			if res.Depth != tt.expectedDepth {
				t.Errorf("expected Depth=%d, got %d", tt.expectedDepth, res.Depth)
			}
		})
	}
}

func TestResolver_Resolve_CanonicalPath(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		input    string
		expected string
	}{
		{"Product", "Product"},
		{"product", "Product"},
		{"Product.core-platform", "Product.CorePlatform"},
		{"Product.CorePlatform.data-management", "Product.CorePlatform.DataManagement"},
		{"Product.CorePlatform.DataManagement.csv-import", "Product.CorePlatform.DataManagement.CsvImport"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			res, err := resolver.Resolve(tt.input)
			if err != nil {
				t.Fatalf("Resolve(%q) failed: %v", tt.input, err)
			}
			if res.CanonicalPath != tt.expected {
				t.Errorf("expected CanonicalPath=%s, got %s", tt.expected, res.CanonicalPath)
			}
		})
	}
}

func TestResolver_Resolve_Errors(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	tests := []struct {
		path        string
		errContains string
	}{
		{"", "cannot be empty"},
		{"Invalid", "track \"Invalid\" not found"},
		{"Product.NonExistent", "layer \"NonExistent\" not found"},
		{"Product.CorePlatform.NonExistent", "component \"NonExistent\" not found"},
		{"Product.CorePlatform.DataManagement.NonExistent", "sub-component \"NonExistent\" not found"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			_, err := resolver.Resolve(tt.path)
			if err == nil {
				t.Fatalf("expected error for path %q", tt.path)
			}

			pathErr, ok := err.(*PathError)
			if !ok {
				t.Fatalf("expected *PathError, got %T", err)
			}

			if pathErr.Message == "" {
				t.Error("expected PathError.Message to be set")
			}
		})
	}
}

func TestResolver_Resolve_PathError_Context(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	// Test that error contains helpful context
	_, err := resolver.Resolve("Product.CorePlatform.DataManagement.NonExistent")
	if err == nil {
		t.Fatal("expected error")
	}

	pathErr, ok := err.(*PathError)
	if !ok {
		t.Fatalf("expected *PathError, got %T", err)
	}

	// Should have available paths
	if len(pathErr.AvailablePaths) == 0 {
		t.Error("expected AvailablePaths to be populated")
	}

	// Should have hint
	if pathErr.Hint == "" {
		t.Error("expected Hint to be populated")
	}
}

func TestResolver_ValidatePath(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	// Valid path
	err := resolver.ValidatePath("Product.CorePlatform.DataManagement")
	if err != nil {
		t.Errorf("expected valid path, got error: %v", err)
	}

	// Invalid path
	err = resolver.ValidatePath("Product.NonExistent")
	if err == nil {
		t.Error("expected error for invalid path")
	}
}

func TestResolver_GetAvailablePaths(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	paths := resolver.GetAvailablePaths()
	if len(paths) == 0 {
		t.Fatal("expected paths to be returned")
	}

	// Should contain known paths
	expectedContains := []string{
		"Product.CorePlatform",
		"Product.CorePlatform.DataManagement",
	}

	for _, expected := range expectedContains {
		found := false
		for _, p := range paths {
			if p == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected path %s in available paths", expected)
		}
	}
}

func TestResolver_GetPathsForTrack(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	paths := resolver.GetPathsForTrack(TrackProduct)
	if len(paths) == 0 {
		t.Fatal("expected paths for Product track")
	}

	// All paths should start with Product
	for _, p := range paths {
		if len(p) < 7 || p[:7] != "Product" {
			t.Errorf("expected path to start with 'Product', got %s", p)
		}
	}

	// Non-existent track
	paths = resolver.GetPathsForTrack(TrackCommercial)
	if len(paths) != 0 {
		t.Errorf("expected no paths for Commercial track, got %d", len(paths))
	}
}

func TestResolver_SuggestPaths(t *testing.T) {
	set := createTestValueModelSet()
	resolver := NewResolver(set)

	// Partial match
	suggestions := resolver.SuggestPaths("DataManagement")
	if len(suggestions) == 0 {
		t.Error("expected suggestions for partial match")
	}

	// Check suggestions contain DataManagement in the path
	found := false
	for _, s := range suggestions {
		if len(s) > 0 && (normalizeForComparison(s) != "" &&
			len(normalizeForComparison(s)) >= len(normalizeForComparison("DataManagement")) &&
			indexOfSubstring(normalizeForComparison(s), normalizeForComparison("DataManagement")) >= 0) {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected suggestions to contain DataManagement path, got %v", suggestions)
	}
}

// indexOfSubstring returns the index of substr in s, or -1 if not found
func indexOfSubstring(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func TestNormalizeForComparison(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"CorePlatform", "coreplatform"},
		{"core-platform", "coreplatform"},
		{"core_platform", "coreplatform"},
		{"Core Platform", "coreplatform"},
		{"CORE PLATFORM", "coreplatform"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := normalizeForComparison(tt.input)
			if result != tt.expected {
				t.Errorf("normalizeForComparison(%q): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestFindClosestMatch(t *testing.T) {
	candidates := []string{"DataManagement", "KnowledgeAccess", "Analysis"}

	tests := []struct {
		input    string
		expected string
	}{
		{"DataManage", "DataManagement"},
		{"Knowledge", "KnowledgeAccess"},
		{"xyz", ""}, // No good match
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := findClosestMatch(tt.input, candidates)
			if result != tt.expected {
				t.Errorf("findClosestMatch(%q): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}

func containsIgnoreCase(s, substr string) bool {
	return normalizeForComparison(s) == normalizeForComparison(substr) ||
		len(normalizeForComparison(s)) > 0 && len(normalizeForComparison(substr)) > 0 &&
			(normalizeForComparison(s) != "" && normalizeForComparison(substr) != "" &&
				(len(s) >= len(substr) && normalizeForComparison(s[:len(substr)]) == normalizeForComparison(substr)))
}
