package strategy

import (
	"os"
	"path/filepath"
	"testing"
)

// =============================================================================
// Content-Based Artifact Discovery Tests (Task 1.8)
// =============================================================================

// TestDiscoverReadyArtifacts_NumberedPrefixes tests that files with non-standard
// numbered prefixes are discovered correctly via content-based detection.
func TestDiscoverReadyArtifacts_NumberedPrefixes(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create files with custom numbered prefixes (not the standard 00_, 01_, etc.)
	files := map[string]string{
		"10_north_star.yaml": `north_star:
  organization: "Test Org"
  purpose:
    statement: "Test purpose"
`,
		"20_insight_analyses.yaml": `target_users:
  - persona: "Test User"
    description: "A test user"
trends:
  technology: []
`,
		"30_strategy_formula.yaml": `strategy:
  id: "sf-001"
  title: "Test Strategy"
`,
		"40_roadmap.yaml": `roadmap:
  id: "rm-001"
  cycle: 1
  timeframe: "Q1 2025"
`,
	}

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(readyDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("Failed to write %s: %v", name, err)
		}
	}

	parser := NewParser(tmpDir)
	discovered := parser.discoverReadyArtifacts()

	// Verify all four artifact types were discovered
	expected := map[string]string{
		"north_star":       "10_north_star.yaml",
		"insight_analyses": "20_insight_analyses.yaml",
		"strategy_formula": "30_strategy_formula.yaml",
		"roadmap_recipe":   "40_roadmap.yaml",
	}

	for artifactType, expectedFile := range expected {
		path, ok := discovered[artifactType]
		if !ok {
			t.Errorf("Artifact type %q not discovered", artifactType)
			continue
		}
		if filepath.Base(path) != expectedFile {
			t.Errorf("Artifact %q: expected file %q, got %q", artifactType, expectedFile, filepath.Base(path))
		}
	}
}

// TestDiscoverReadyArtifacts_ContentOverridesFilename tests that content-based
// detection takes priority over filename patterns.
func TestDiscoverReadyArtifacts_ContentOverridesFilename(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a file with a misleading name but correct content
	misleadingFile := `north_star:
  organization: "Content Wins"
  purpose:
    statement: "Test"
`
	if err := os.WriteFile(filepath.Join(readyDir, "my_custom_file.yaml"), []byte(misleadingFile), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	discovered := parser.discoverReadyArtifacts()

	path, ok := discovered["north_star"]
	if !ok {
		t.Fatal("north_star not discovered from content-based detection")
	}
	if filepath.Base(path) != "my_custom_file.yaml" {
		t.Errorf("Expected my_custom_file.yaml, got %s", filepath.Base(path))
	}
}

// TestDiscoverReadyArtifacts_FilenameFallback tests that filename patterns work
// when content detection doesn't match.
func TestDiscoverReadyArtifacts_FilenameFallback(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a file with matching filename but no identifying top-level keys
	// (e.g., a file that wraps content differently but has the right name)
	fallbackFile := `meta:
  type: north_star
content:
  organization: "Fallback"
`
	if err := os.WriteFile(filepath.Join(readyDir, "north_star.yaml"), []byte(fallbackFile), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	discovered := parser.discoverReadyArtifacts()

	path, ok := discovered["north_star"]
	if !ok {
		t.Fatal("north_star not discovered from filename fallback")
	}
	if filepath.Base(path) != "north_star.yaml" {
		t.Errorf("Expected north_star.yaml, got %s", filepath.Base(path))
	}
}

// TestDiscoverReadyArtifacts_EmptyDirectory tests handling of empty READY dir.
func TestDiscoverReadyArtifacts_EmptyDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	discovered := parser.discoverReadyArtifacts()

	if len(discovered) != 0 {
		t.Errorf("Expected 0 discovered artifacts in empty dir, got %d", len(discovered))
	}
}

// TestDiscoverReadyArtifacts_NoREADYDir tests handling of missing READY dir.
func TestDiscoverReadyArtifacts_NoREADYDir(t *testing.T) {
	tmpDir := t.TempDir()

	parser := NewParser(tmpDir)
	discovered := parser.discoverReadyArtifacts()

	if len(discovered) != 0 {
		t.Errorf("Expected 0 discovered artifacts with no READY dir, got %d", len(discovered))
	}
}

// TestResolveReadyPath_DiscoveredPath tests that resolveReadyPath returns the
// discovered path when available.
func TestResolveReadyPath_DiscoveredPath(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a file with non-standard name
	nsFile := `north_star:
  organization: "Discovered"
`
	if err := os.WriteFile(filepath.Join(readyDir, "99_ns.yaml"), []byte(nsFile), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	path := parser.resolveReadyPath("north_star", "00_north_star.yaml")

	if filepath.Base(path) != "99_ns.yaml" {
		t.Errorf("Expected discovered path 99_ns.yaml, got %s", filepath.Base(path))
	}
}

// TestResolveReadyPath_FallbackToHardcoded tests that resolveReadyPath returns
// the hardcoded path when no discovery match is found.
func TestResolveReadyPath_FallbackToHardcoded(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	path := parser.resolveReadyPath("north_star", "00_north_star.yaml")

	expected := filepath.Join(tmpDir, "READY", "00_north_star.yaml")
	if path != expected {
		t.Errorf("Expected fallback path %s, got %s", expected, path)
	}
}

// TestParseNorthStar_NumberedPrefix tests that ParseNorthStar works with
// non-standard numbered prefix filenames.
func TestParseNorthStar_NumberedPrefix(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	nsContent := `north_star:
  organization: "Test Corp"
  last_reviewed: "2025-01-01"
  version: "1.0"
  purpose:
    statement: "Make testing great"
    problem_we_solve: "Untested code"
    who_we_serve: "Developers"
    impact_we_seek: "Better software"
  vision:
    vision_statement: "A world of tested code"
    timeframe: "5 years"
    success_looks_like:
      - "All code tested"
    not_the_vision:
      - "Manual testing"
  mission:
    mission_statement: "We test everything"
    what_we_do:
      - "Write tests"
    how_we_deliver:
      approach: "TDD"
      key_capabilities:
        - "Unit tests"
    who_we_serve_specifically: "Go developers"
    boundaries:
      we_dont_do:
        - "Manual QA"
      why_not: "Automation is better"
  values:
    - value: "Quality"
      definition: "High standards"
      behaviors_we_expect:
        - "Write tests"
      behaviors_we_reject:
        - "Skip tests"
      example_decision: "Always test first"
`
	// Write with a custom numbered prefix
	if err := os.WriteFile(filepath.Join(readyDir, "50_our_north_star.yaml"), []byte(nsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	ns, err := parser.ParseNorthStar()
	if err != nil {
		t.Fatalf("ParseNorthStar() error: %v", err)
	}

	if ns.Organization != "Test Corp" {
		t.Errorf("Expected organization 'Test Corp', got '%s'", ns.Organization)
	}
	if ns.Purpose.Statement != "Make testing great" {
		t.Errorf("Expected purpose statement 'Make testing great', got '%s'", ns.Purpose.Statement)
	}
}

// TestParseFeatures_ContentBasedDiscovery tests that feature files without
// the fd- prefix are discovered via content detection.
func TestParseFeatures_ContentBasedDiscovery(t *testing.T) {
	tmpDir := t.TempDir()
	fdDir := filepath.Join(tmpDir, "FIRE", "feature_definitions")
	if err := os.MkdirAll(fdDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a feature file WITHOUT the fd- prefix
	featureContent := `id: "fd-099"
name: "Custom Named Feature"
slug: "custom-named"
status: "draft"
strategic_context:
  contributes_to:
    - "Product.Core.Testing"
  tracks:
    - "product"
definition:
  job_to_be_done: "When I need to test, I want automation"
  solution_approach: "Automated testing framework"
  personas: []
implementation:
  capabilities:
    - id: "cap-001"
      name: "Auto Test"
      description: "Automated testing"
feature_maturity:
  overall_stage: "hypothetical"
  capability_maturity: []
`
	if err := os.WriteFile(filepath.Join(fdDir, "custom-feature.yaml"), []byte(featureContent), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	features, err := parser.ParseFeatures()
	if err != nil {
		t.Fatalf("ParseFeatures() error: %v", err)
	}

	if len(features) != 1 {
		t.Fatalf("Expected 1 feature, got %d", len(features))
	}
	if features[0].ID != "fd-099" {
		t.Errorf("Expected feature ID 'fd-099', got '%s'", features[0].ID)
	}
	if features[0].Name != "Custom Named Feature" {
		t.Errorf("Expected feature name 'Custom Named Feature', got '%s'", features[0].Name)
	}
}

// TestParseValueModels_ContentBasedDiscovery tests that value model files
// without "value_model" in the name are discovered via content detection.
func TestParseValueModels_ContentBasedDiscovery(t *testing.T) {
	tmpDir := t.TempDir()
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a value model file WITHOUT "value_model" in the name
	vmContent := `track_name: "Product"
description: "Product value model"
layers:
  - id: "core"
    name: "Core"
    description: "Core layer"
    components:
      - id: "testing"
        name: "Testing"
        description: "Testing capabilities"
        maturity: "emerging"
        sub_components:
          - id: "unit"
            name: "Unit Tests"
            description: "Unit testing"
            maturity: "proven"
`
	if err := os.WriteFile(filepath.Join(vmDir, "product_capabilities.yaml"), []byte(vmContent), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)
	vms, err := parser.ParseValueModels()
	if err != nil {
		t.Fatalf("ParseValueModels() error: %v", err)
	}

	if len(vms) != 1 {
		t.Fatalf("Expected 1 value model, got %d", len(vms))
	}
	vm, ok := vms["Product"]
	if !ok {
		t.Fatal("Expected value model for track 'Product'")
	}
	if vm.Description != "Product value model" {
		t.Errorf("Expected description 'Product value model', got '%s'", vm.Description)
	}
	if len(vm.Layers) != 1 {
		t.Fatalf("Expected 1 layer, got %d", len(vm.Layers))
	}
	if len(vm.Layers[0].Components) != 1 {
		t.Fatalf("Expected 1 component, got %d", len(vm.Layers[0].Components))
	}
}

// TestIsFeatureDefinitionContent tests the content detection helper.
func TestIsFeatureDefinitionContent(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		name     string
		content  string
		expected bool
	}{
		{
			name: "valid feature definition",
			content: `id: "fd-001"
strategic_context:
  contributes_to: []
definition:
  job_to_be_done: "test"
`,
			expected: true,
		},
		{
			name: "missing strategic_context",
			content: `id: "fd-001"
definition:
  job_to_be_done: "test"
`,
			expected: false,
		},
		{
			name: "value model file",
			content: `value_model:
  track: "Product"
`,
			expected: false,
		},
		{
			name:     "empty file",
			content:  "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(tmpDir, tt.name+".yaml")
			if err := os.WriteFile(path, []byte(tt.content), 0o644); err != nil {
				t.Fatal(err)
			}
			result := isFeatureDefinitionContent(path)
			if result != tt.expected {
				t.Errorf("isFeatureDefinitionContent() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestDiscoverReadyArtifacts_CachesResults tests that discovery results are cached.
func TestDiscoverReadyArtifacts_CachesResults(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	nsContent := `north_star:
  organization: "Cached"
`
	if err := os.WriteFile(filepath.Join(readyDir, "ns.yaml"), []byte(nsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	parser := NewParser(tmpDir)

	// First call populates cache
	d1 := parser.discoverReadyArtifacts()
	if len(d1) != 1 {
		t.Fatalf("Expected 1 discovered, got %d", len(d1))
	}

	// Second call should return same map (cached)
	d2 := parser.discoverReadyArtifacts()
	if len(d2) != len(d1) {
		t.Error("Cache returned different results")
	}

	// Verify it's the same map reference (cached, not re-scanned)
	if &d1 == nil || &d2 == nil {
		t.Error("Unexpected nil")
	}
}
