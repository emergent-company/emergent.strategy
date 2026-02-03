package integration

import (
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/valuemodel"
)

func TestValueModelIntegration_RealInstance(t *testing.T) {
	// Test with real emergent instance
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := valuemodel.NewLoader(instancePath)
	set, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load value models: %v", err)
	}

	t.Logf("Loaded %d tracks from %s", len(set.Models), instancePath)

	// Verify we loaded at least one model
	if len(set.Models) == 0 {
		t.Skip("No value models found in test instance")
	}

	// Log what we found
	for track, model := range set.Models {
		t.Logf("Track: %s (version %s, status: %s)", track, model.Version, model.Status)
		t.Logf("  Layers: %d", len(model.Layers))
		for _, layer := range model.Layers {
			t.Logf("    - %s (%s) with %d components", layer.Name, layer.ID, len(layer.Components))
		}
	}

	// Test resolver
	resolver := valuemodel.NewResolver(set)
	paths := resolver.GetAvailablePaths()
	t.Logf("Total paths: %d", len(paths))

	// Test resolving some paths
	for i, path := range paths {
		if i >= 5 { // Only test first 5
			break
		}
		res, err := resolver.Resolve(path)
		if err != nil {
			t.Errorf("Failed to resolve path %s: %v", path, err)
		} else {
			t.Logf("Resolved %s -> Track=%s, Depth=%d, Canonical=%s",
				path, res.Track, res.Depth, res.CanonicalPath)
		}
	}
}

func TestValueModelIntegration_PathErrorContext(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := valuemodel.NewLoader(instancePath)
	set, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load value models: %v", err)
	}

	if len(set.Models) == 0 {
		t.Skip("No value models found in test instance")
	}

	resolver := valuemodel.NewResolver(set)

	// Test error with context
	_, err = resolver.Resolve("Product.NonExistentLayer")
	if err == nil {
		t.Fatal("Expected error for invalid path")
	}

	pathErr, ok := err.(*valuemodel.PathError)
	if !ok {
		t.Fatalf("Expected *PathError, got %T", err)
	}

	t.Logf("Error message: %s", pathErr.Message)
	t.Logf("Hint: %s", pathErr.Hint)
	t.Logf("Available paths: %v", pathErr.AvailablePaths)
	if pathErr.DidYouMean != "" {
		t.Logf("Did you mean: %s", pathErr.DidYouMean)
	}
}
