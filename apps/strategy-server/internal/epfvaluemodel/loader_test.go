package valuemodel

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewLoader(t *testing.T) {
	loader := NewLoader("/test/path")
	if loader.instancePath != "/test/path" {
		t.Errorf("expected instancePath to be /test/path, got %s", loader.instancePath)
	}
}

func TestLoadFile(t *testing.T) {
	// Create a temporary test file
	tempDir := t.TempDir()
	testFile := filepath.Join(tempDir, "product.value_model.yaml")

	content := `
track_name: "Product"
version: "1.0.0"
status: "active"
description: "Test product value model for unit testing"
layers:
  - id: core-platform
    name: Core Platform
    description: "Core platform capabilities"
    components:
      - id: data-management
        name: Data Management
        description: "Data management component"
        subs:
          - id: csv-import
            name: CSV Import
            active: true
            uvp: "Import data from CSV files"
          - id: excel-sync
            name: Excel Sync
            active: false
            premium: true
            uvp: "Sync with Excel files"
  - id: intelligence
    name: Intelligence
    components:
      - id: ai-chat
        name: AI Chat
        sub_components:
          - id: semantic-search
            name: Semantic Search
            active: true
`

	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	loader := NewLoader(tempDir)
	model, err := loader.LoadFile(testFile)
	if err != nil {
		t.Fatalf("LoadFile failed: %v", err)
	}

	// Verify basic fields
	if model.TrackName != TrackProduct {
		t.Errorf("expected TrackName to be Product, got %s", model.TrackName)
	}
	if model.Version != "1.0.0" {
		t.Errorf("expected Version to be 1.0.0, got %s", model.Version)
	}
	if model.Status != "active" {
		t.Errorf("expected Status to be active, got %s", model.Status)
	}

	// Verify layers
	if len(model.Layers) != 2 {
		t.Fatalf("expected 2 layers, got %d", len(model.Layers))
	}

	// Verify first layer
	layer := model.Layers[0]
	if layer.ID != "core-platform" {
		t.Errorf("expected layer ID to be core-platform, got %s", layer.ID)
	}
	if layer.Name != "Core Platform" {
		t.Errorf("expected layer name to be Core Platform, got %s", layer.Name)
	}

	// Verify components
	if len(layer.Components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(layer.Components))
	}

	comp := layer.Components[0]
	if comp.ID != "data-management" {
		t.Errorf("expected component ID to be data-management, got %s", comp.ID)
	}

	// Verify sub-components using Subs field
	subs := comp.GetSubComponents()
	if len(subs) != 2 {
		t.Fatalf("expected 2 sub-components, got %d", len(subs))
	}

	sub := subs[0]
	if sub.ID != "csv-import" {
		t.Errorf("expected sub-component ID to be csv-import, got %s", sub.ID)
	}
	if !sub.Active {
		t.Error("expected sub-component to be active")
	}

	// Verify second layer uses sub_components field
	layer2 := model.Layers[1]
	comp2 := layer2.Components[0]
	subs2 := comp2.GetSubComponents()
	if len(subs2) != 1 {
		t.Fatalf("expected 1 sub-component in layer2, got %d", len(subs2))
	}
}

func TestLoad(t *testing.T) {
	// Create a temporary test directory structure
	tempDir := t.TempDir()
	valueModelsDir := filepath.Join(tempDir, "FIRE", "value_models")
	if err := os.MkdirAll(valueModelsDir, 0755); err != nil {
		t.Fatalf("failed to create test directory: %v", err)
	}

	// Create product value model
	productContent := `
track_name: "Product"
version: "1.0.0"
status: "active"
description: "Product value model"
layers:
  - id: core
    name: Core
`
	if err := os.WriteFile(filepath.Join(valueModelsDir, "product.yaml"), []byte(productContent), 0644); err != nil {
		t.Fatalf("failed to write product file: %v", err)
	}

	// Create strategy value model
	strategyContent := `
track_name: "Strategy"
version: "1.0.0"
status: "active"
description: "Strategy value model"
layers:
  - id: growth
    name: Growth
`
	if err := os.WriteFile(filepath.Join(valueModelsDir, "strategy.yaml"), []byte(strategyContent), 0644); err != nil {
		t.Fatalf("failed to write strategy file: %v", err)
	}

	loader := NewLoader(tempDir)
	set, err := loader.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Verify models were loaded
	if len(set.Models) != 2 {
		t.Errorf("expected 2 models, got %d", len(set.Models))
	}

	// Verify Product track
	if !set.HasTrack(TrackProduct) {
		t.Error("expected Product track to be loaded")
	}

	// Verify Strategy track
	if !set.HasTrack(TrackStrategy) {
		t.Error("expected Strategy track to be loaded")
	}

	// Verify instance path
	if set.Instance != tempDir {
		t.Errorf("expected Instance to be %s, got %s", tempDir, set.Instance)
	}
}

func TestLoad_EmptyDirectory(t *testing.T) {
	tempDir := t.TempDir()

	loader := NewLoader(tempDir)
	set, err := loader.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if len(set.Models) != 0 {
		t.Errorf("expected 0 models for empty directory, got %d", len(set.Models))
	}
}

func TestValueModelSet_GetTrack(t *testing.T) {
	set := NewValueModelSet()
	set.Models[TrackProduct] = &ValueModel{TrackName: TrackProduct}

	// Exact match
	model, ok := set.GetTrack(TrackProduct)
	if !ok {
		t.Error("expected to find Product track")
	}
	if model.TrackName != TrackProduct {
		t.Errorf("expected TrackName to be Product, got %s", model.TrackName)
	}

	// Case-insensitive match
	model, ok = set.GetTrack("product")
	if !ok {
		t.Error("expected to find Product track with lowercase input")
	}

	// Not found
	_, ok = set.GetTrack(TrackStrategy)
	if ok {
		t.Error("expected Strategy track to not be found")
	}
}

func TestNormalizeTrack(t *testing.T) {
	tests := []struct {
		input    string
		expected Track
		ok       bool
	}{
		{"Product", TrackProduct, true},
		{"product", TrackProduct, true},
		{"PRODUCT", TrackProduct, true},
		{"Strategy", TrackStrategy, true},
		{"strategy", TrackStrategy, true},
		{"OrgOps", TrackOrgOps, true},
		{"orgops", TrackOrgOps, true},
		{"org_ops", TrackOrgOps, true},
		{"org-ops", TrackOrgOps, true},
		{"Commercial", TrackCommercial, true},
		{"commercial", TrackCommercial, true},
		{"invalid", "", false},
		{"", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, ok := NormalizeTrack(tt.input)
			if ok != tt.ok {
				t.Errorf("NormalizeTrack(%q): expected ok=%v, got ok=%v", tt.input, tt.ok, ok)
			}
			if result != tt.expected {
				t.Errorf("NormalizeTrack(%q): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestKebabToPascal(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"core-platform", "CorePlatform"},
		{"data-management", "DataManagement"},
		{"csv-import", "CsvImport"},
		{"ai", "Ai"},
		{"single", "Single"},
		{"one-two-three", "OneTwoThree"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := kebabToPascal(tt.input)
			if result != tt.expected {
				t.Errorf("kebabToPascal(%q): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestToPascalCase(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Core Platform", "CorePlatform"},
		{"Data Management", "DataManagement"},
		{"CSV Import", "CsvImport"},
		{"AI Chat", "AiChat"},
		{"single", "Single"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := toPascalCase(tt.input)
			if result != tt.expected {
				t.Errorf("toPascalCase(%q): expected %s, got %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestComponent_GetSubComponents(t *testing.T) {
	// Test with SubComponents field
	comp1 := Component{
		SubComponents: []SubComponent{{ID: "sub1"}},
	}
	if len(comp1.GetSubComponents()) != 1 {
		t.Error("expected GetSubComponents to return SubComponents")
	}

	// Test with Subs field
	comp2 := Component{
		Subs: []SubComponent{{ID: "sub2"}},
	}
	if len(comp2.GetSubComponents()) != 1 {
		t.Error("expected GetSubComponents to return Subs")
	}

	// Test with both (SubComponents takes precedence)
	comp3 := Component{
		SubComponents: []SubComponent{{ID: "sub1"}},
		Subs:          []SubComponent{{ID: "sub2"}, {ID: "sub3"}},
	}
	subs := comp3.GetSubComponents()
	if len(subs) != 1 || subs[0].ID != "sub1" {
		t.Error("expected GetSubComponents to prefer SubComponents over Subs")
	}
}

func TestValueModelSet_GetAllPaths(t *testing.T) {
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
							{ID: "csv-import", Name: "CSV Import"},
						},
					},
				},
			},
		},
	}

	paths := set.GetAllPaths()
	if len(paths) == 0 {
		t.Fatal("expected paths to be generated")
	}

	// Should have: layer, component, sub-component paths
	expectedPaths := []string{
		"Product.CorePlatform",
		"Product.CorePlatform.DataManagement",
		"Product.CorePlatform.DataManagement.CsvImport",
	}

	for _, expected := range expectedPaths {
		found := false
		for _, p := range paths {
			if p == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected path %s not found in %v", expected, paths)
		}
	}
}
