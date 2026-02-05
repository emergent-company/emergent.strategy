package template

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
)

func TestNewLoader(t *testing.T) {
	loader := NewLoader("/some/path")
	if loader == nil {
		t.Fatal("NewLoader returned nil")
	}
	if loader.epfRoot != "/some/path" {
		t.Errorf("expected epfRoot '/some/path', got '%s'", loader.epfRoot)
	}
	if loader.templates == nil {
		t.Error("templates map not initialized")
	}
}

func TestLoaderWithRealEPF(t *testing.T) {
	// Find the EPF root directory
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	err := loader.Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Should have loaded multiple templates
	if loader.TemplateCount() == 0 {
		t.Error("No templates loaded")
	}

	t.Logf("Loaded %d templates", loader.TemplateCount())
}

func TestGetTemplate(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Test getting a known template
	tmpl, err := loader.GetTemplate(schema.ArtifactNorthStar)
	if err != nil {
		t.Fatalf("GetTemplate(north_star) failed: %v", err)
	}

	if tmpl.ArtifactType != schema.ArtifactNorthStar {
		t.Errorf("expected artifact type 'north_star', got '%s'", tmpl.ArtifactType)
	}
	if tmpl.Phase != schema.PhaseREADY {
		t.Errorf("expected phase 'READY', got '%s'", tmpl.Phase)
	}
	if tmpl.Content == "" {
		t.Error("template content is empty")
	}
	if tmpl.SchemaFile == "" {
		t.Error("schema file is empty")
	}
}

func TestGetTemplateNotFound(t *testing.T) {
	loader := NewLoader("/nonexistent")
	// Don't call Load() so templates map is empty

	_, err := loader.GetTemplate(schema.ArtifactNorthStar)
	if err == nil {
		t.Error("expected error for missing template, got nil")
	}
}

func TestGetTemplateByName(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Check if using embedded (feature_definition may not be available in embedded)
	usingEmbedded := loader.IsEmbedded()

	// Test various name formats
	testCases := []struct {
		name           string
		expectError    bool
		skipIfEmbedded bool // Skip this test case if using embedded templates
	}{
		{"north_star", false, false},
		{"North Star", false, false},
		{"feature_definition", false, true}, // May not be available in embedded
		{"value_model", false, false},
		{"nonexistent_type", true, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.skipIfEmbedded && usingEmbedded {
				t.Skipf("Skipping '%s' test - template may not be available in embedded", tc.name)
			}
			_, err := loader.GetTemplateByName(tc.name)
			if tc.expectError && err == nil {
				t.Errorf("expected error for '%s', got nil", tc.name)
			}
			if !tc.expectError && err != nil {
				t.Errorf("unexpected error for '%s': %v", tc.name, err)
			}
		})
	}
}

func TestListTemplates(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	templates := loader.ListTemplates()
	if len(templates) == 0 {
		t.Error("ListTemplates returned empty list")
	}

	// Verify all templates have required fields
	for _, tmpl := range templates {
		if tmpl.ArtifactType == "" {
			t.Error("template has empty artifact type")
		}
		if tmpl.Content == "" {
			t.Errorf("template %s has empty content", tmpl.ArtifactType)
		}
	}
}

func TestListTemplatesByPhase(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Test each phase
	phases := []schema.Phase{schema.PhaseREADY, schema.PhaseFIRE, schema.PhaseAIM}
	for _, phase := range phases {
		t.Run(string(phase), func(t *testing.T) {
			templates := loader.ListTemplatesByPhase(phase)
			for _, tmpl := range templates {
				if tmpl.Phase != phase {
					t.Errorf("template %s has phase %s, expected %s", tmpl.ArtifactType, tmpl.Phase, phase)
				}
			}
		})
	}
}

func TestHasTemplate(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	if !loader.HasTemplate(schema.ArtifactNorthStar) {
		t.Error("expected HasTemplate(north_star) to return true")
	}
}

func TestTemplateInfo(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Feature definition template may not be available in embedded mode
	// (it's in definitions/ not templates/)
	tmpl, err := loader.GetTemplate(schema.ArtifactFeatureDefinition)
	if err != nil {
		if loader.IsEmbedded() {
			t.Skip("Feature definition template not available in embedded mode")
		}
		t.Fatalf("GetTemplate(feature_definition) failed: %v", err)
	}

	// Verify TemplateInfo fields
	if tmpl.Name == "" {
		t.Error("Name is empty")
	}
	if tmpl.Description == "" {
		t.Error("Description is empty")
	}
	if tmpl.UsageHint == "" {
		t.Error("UsageHint is empty")
	}
	if tmpl.FilePath == "" {
		t.Error("FilePath is empty")
	}
}

// findEPFRoot finds the EPF root directory by looking up from cwd
func findEPFRoot(t *testing.T) string {
	t.Helper()

	// Start from current working directory
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	// Walk up looking for docs/EPF
	dir := cwd
	for i := 0; i < 10; i++ {
		epfPath := filepath.Join(dir, "docs", "EPF")
		if _, err := os.Stat(epfPath); err == nil {
			return epfPath
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return ""
}
