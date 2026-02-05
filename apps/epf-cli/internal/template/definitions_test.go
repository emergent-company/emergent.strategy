package template

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewDefinitionLoader(t *testing.T) {
	loader := NewDefinitionLoader("/some/path")
	if loader == nil {
		t.Fatal("NewDefinitionLoader returned nil")
	}
	if loader.epfRoot != "/some/path" {
		t.Errorf("expected epfRoot '/some/path', got '%s'", loader.epfRoot)
	}
	if loader.definitions == nil {
		t.Error("definitions map not initialized")
	}
}

func TestDefinitionLoaderWithRealEPF(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	err := loader.Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Definitions may not be available if using embedded (definitions aren't embedded)
	if loader.DefinitionCount() == 0 {
		t.Skip("No definitions loaded - expected when EPF definitions directory not available")
	}

	t.Logf("Loaded %d definitions", loader.DefinitionCount())
}

func TestGetDefinition(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Get all definitions and test one
	defs := loader.ListDefinitions(nil, nil)
	if len(defs) == 0 {
		t.Skip("No definitions available - expected when EPF definitions directory not available")
	}

	// Test getting the first definition by ID
	firstID := defs[0].ID
	def, err := loader.GetDefinition(firstID)
	if err != nil {
		t.Fatalf("GetDefinition(%s) failed: %v", firstID, err)
	}

	if def.ID != firstID {
		t.Errorf("expected ID '%s', got '%s'", firstID, def.ID)
	}
	if def.Content == "" {
		t.Error("definition content is empty")
	}
}

func TestGetDefinitionNotFound(t *testing.T) {
	loader := NewDefinitionLoader("/nonexistent")
	// Don't call Load() so definitions map is empty

	_, err := loader.GetDefinition("fd-999")
	if err == nil {
		t.Error("expected error for missing definition, got nil")
	}
}

func TestListDefinitions(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Test listing all definitions
	allDefs := loader.ListDefinitions(nil, nil)
	if len(allDefs) == 0 {
		t.Skip("No definitions available - expected when EPF definitions directory not available")
	}

	// Verify all definitions have required fields
	for _, def := range allDefs {
		if def.ID == "" {
			t.Error("definition has empty ID")
		}
		if def.Track == "" {
			t.Errorf("definition %s has empty track", def.ID)
		}
		if def.Type == "" {
			t.Errorf("definition %s has empty type", def.ID)
		}
		if def.Content == "" {
			t.Errorf("definition %s has empty content", def.ID)
		}
	}
}

func TestListDefinitionsByTrack(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Test each track
	for _, track := range AllTracks() {
		t.Run(string(track), func(t *testing.T) {
			defs := loader.ListDefinitionsByTrack(track)
			for _, def := range defs {
				if def.Track != track {
					t.Errorf("definition %s has track %s, expected %s", def.ID, def.Track, track)
				}
			}
		})
	}
}

func TestDefinitionTypes(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Product track should be examples
	productDefs := loader.ListDefinitionsByTrack(TrackProduct)
	for _, def := range productDefs {
		if def.Type != DefinitionTypeExample {
			t.Errorf("product definition %s should be 'example', got '%s'", def.ID, def.Type)
		}
	}

	// Other tracks should be canonical
	canonicalTracks := []Track{TrackStrategy, TrackOrgOps, TrackCommercial}
	for _, track := range canonicalTracks {
		defs := loader.ListDefinitionsByTrack(track)
		for _, def := range defs {
			if def.Type != DefinitionTypeCanonical {
				t.Errorf("%s definition %s should be 'canonical', got '%s'", track, def.ID, def.Type)
			}
		}
	}
}

func TestGetCategories(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Product track should have categories
	categories := loader.GetCategories(TrackProduct)
	if len(categories) == 0 {
		t.Log("No categories found for product track (may be expected if definitions are flat)")
	}

	for _, cat := range categories {
		if cat.Name == "" {
			t.Error("category has empty name")
		}
		if cat.Count <= 0 {
			t.Errorf("category %s has invalid count %d", cat.Name, cat.Count)
		}
	}
}

func TestTrackFromString(t *testing.T) {
	testCases := []struct {
		input       string
		expected    Track
		expectError bool
	}{
		{"product", TrackProduct, false},
		{"Product", TrackProduct, false},
		{"PRODUCT", TrackProduct, false},
		{"strategy", TrackStrategy, false},
		{"org_ops", TrackOrgOps, false},
		{"orgops", TrackOrgOps, false},
		{"org-ops", TrackOrgOps, false},
		{"commercial", TrackCommercial, false},
		{"invalid", "", true},
		{"", "", true},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			track, err := TrackFromString(tc.input)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for '%s', got nil", tc.input)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for '%s': %v", tc.input, err)
				}
				if track != tc.expected {
					t.Errorf("expected track '%s', got '%s'", tc.expected, track)
				}
			}
		})
	}
}

func TestGetTrackForID(t *testing.T) {
	testCases := []struct {
		id          string
		expected    Track
		expectError bool
	}{
		{"fd-001", TrackProduct, false},
		{"fd-tech-003", TrackProduct, false},
		{"sd-001", TrackStrategy, false},
		{"pd-005", TrackOrgOps, false},
		{"cd-001", TrackCommercial, false},
		{"xx-001", "", true},
		{"invalid", "", true},
	}

	for _, tc := range testCases {
		t.Run(tc.id, func(t *testing.T) {
			track, err := GetTrackForID(tc.id)
			if tc.expectError {
				if err == nil {
					t.Errorf("expected error for '%s', got nil", tc.id)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error for '%s': %v", tc.id, err)
				}
				if track != tc.expected {
					t.Errorf("expected track '%s', got '%s'", tc.expected, track)
				}
			}
		})
	}
}

func TestGetTrackDescription(t *testing.T) {
	for _, track := range AllTracks() {
		desc, defType := GetTrackDescription(track)
		if desc == "" {
			t.Errorf("empty description for track %s", track)
		}
		if defType == "" {
			t.Errorf("empty definition type for track %s", track)
		}

		// Verify type matches expected
		if track == TrackProduct {
			if defType != DefinitionTypeExample {
				t.Errorf("product track should return 'example' type, got '%s'", defType)
			}
		} else {
			if defType != DefinitionTypeCanonical {
				t.Errorf("%s track should return 'canonical' type, got '%s'", track, defType)
			}
		}
	}
}

func TestDefinitionInfo(t *testing.T) {
	epfRoot := findEPFRoot(t)
	if epfRoot == "" {
		t.Skip("EPF root not found")
	}

	loader := NewDefinitionLoader(epfRoot)
	if err := loader.Load(); err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	defs := loader.ListDefinitions(nil, nil)
	if len(defs) == 0 {
		t.Skip("No definitions available - expected when EPF definitions directory not available")
	}

	// Check first definition has all fields
	def := defs[0]
	if def.ID == "" {
		t.Error("ID is empty")
	}
	if def.Name == "" {
		t.Error("Name is empty")
	}
	if def.Track == "" {
		t.Error("Track is empty")
	}
	if def.Type == "" {
		t.Error("Type is empty")
	}
	if def.FilePath == "" {
		t.Error("FilePath is empty")
	}
	if def.Content == "" {
		t.Error("Content is empty")
	}
	if def.Description == "" {
		t.Error("Description is empty")
	}
	if def.UsageHint == "" {
		t.Error("UsageHint is empty")
	}
}

func TestAllTracks(t *testing.T) {
	tracks := AllTracks()
	if len(tracks) != 4 {
		t.Errorf("expected 4 tracks, got %d", len(tracks))
	}

	expected := []Track{TrackProduct, TrackStrategy, TrackOrgOps, TrackCommercial}
	for i, track := range expected {
		if tracks[i] != track {
			t.Errorf("expected track %s at index %d, got %s", track, i, tracks[i])
		}
	}
}

// findEPFRootForDefs is a duplicate helper (same as in loader_test.go)
// In a real codebase, this would be in a shared test helper
func findEPFRootForDefs(t *testing.T) string {
	t.Helper()

	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

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
