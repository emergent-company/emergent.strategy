package discovery

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
)

func TestCheckPath_EmptyDir(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	result := CheckPath(tmpDir)
	if result != nil {
		t.Error("Empty directory should return nil")
	}
}

func TestCheckPath_WithAnchor(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create anchor file
	a := anchor.NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := a.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	result := CheckPath(tmpDir)
	if result == nil {
		t.Fatal("Should find instance with anchor")
	}

	if result.Confidence != ConfidenceHigh {
		t.Errorf("Expected high confidence, got %s", result.Confidence)
	}

	if result.Status != StatusValid {
		t.Errorf("Expected valid status, got %s", result.Status)
	}

	if result.Anchor == nil {
		t.Error("Anchor should be loaded")
	}
}

func TestCheckPath_LegacyInstance(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create EPF markers without anchor
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte("instance:\n  product_name: Test"), 0644)

	result := CheckPath(tmpDir)
	if result == nil {
		t.Fatal("Should find legacy instance")
	}

	if result.Confidence != ConfidenceMedium {
		t.Errorf("Expected medium confidence, got %s", result.Confidence)
	}

	if result.Status != StatusLegacy {
		t.Errorf("Expected legacy status, got %s", result.Status)
	}

	if len(result.Issues) == 0 {
		t.Error("Should have issues for missing anchor")
	}

	if len(result.Suggestions) == 0 {
		t.Error("Should have suggestions")
	}
}

func TestCheckPath_PartialInstance(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create only one marker
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)

	result := CheckPath(tmpDir)
	if result == nil {
		t.Fatal("Should find partial instance")
	}

	if result.Confidence != ConfidenceLow {
		t.Errorf("Expected low confidence, got %s", result.Confidence)
	}

	if result.Status != StatusBroken {
		t.Errorf("Expected broken status, got %s", result.Status)
	}
}

func TestDiscover_StandardLocations(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create instance in docs/epf/_instances/product
	instanceDir := filepath.Join(tmpDir, "docs", "epf", "_instances", "testproduct")
	os.MkdirAll(instanceDir, 0755)
	os.MkdirAll(filepath.Join(instanceDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "FIRE"), 0755)

	a := anchor.NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := a.Save(instanceDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	results, err := Discover(tmpDir, nil)
	if err != nil {
		t.Fatalf("Discover failed: %v", err)
	}

	if len(results) == 0 {
		t.Fatal("Should find instance in standard location")
	}

	found := false
	for _, r := range results {
		if r.Path == instanceDir && r.Confidence == ConfidenceHigh {
			found = true
			break
		}
	}

	if !found {
		t.Error("Should find high-confidence instance at standard location")
	}
}

func TestDiscoverSingle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// No instance - should return not-found
	result, err := DiscoverSingle(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverSingle failed: %v", err)
	}

	if result.Status != StatusNotFound {
		t.Errorf("Expected not-found status, got %s", result.Status)
	}

	// Create instance
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	a := anchor.NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := a.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	result, err = DiscoverSingle(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverSingle failed: %v", err)
	}

	if result.Status != StatusValid {
		t.Errorf("Expected valid status, got %s", result.Status)
	}

	if result.Confidence != ConfidenceHigh {
		t.Errorf("Expected high confidence, got %s", result.Confidence)
	}
}

func TestDiscover_MultipleCandidates(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create legacy instance at root
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	// Create valid instance in docs/epf
	docsEpf := filepath.Join(tmpDir, "docs", "epf", "_instances", "product")
	os.MkdirAll(docsEpf, 0755)
	os.MkdirAll(filepath.Join(docsEpf, "READY"), 0755)
	os.MkdirAll(filepath.Join(docsEpf, "FIRE"), 0755)

	a := anchor.NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := a.Save(docsEpf); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	// DiscoverSingle should prefer the one with anchor
	result, err := DiscoverSingle(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverSingle failed: %v", err)
	}

	if result.Confidence != ConfidenceHigh {
		t.Errorf("Should prefer high confidence instance, got %s", result.Confidence)
	}

	if result.Path != docsEpf {
		t.Errorf("Should return docs/epf instance, got %s", result.Path)
	}
}

func TestDiscover_RequireAnchor(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-discovery-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create legacy instance (no anchor)
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	opts := DefaultOptions()
	opts.RequireAnchor = true

	results, err := Discover(tmpDir, opts)
	if err != nil {
		t.Fatalf("Discover failed: %v", err)
	}

	if len(results) != 0 {
		t.Error("Should not include legacy instances when RequireAnchor is true")
	}
}

func TestIsFalsePositive(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"/path/to/epf-cli/something", true},
		{"/path/to/canonical-epf/something", true},
		{"/path/to/node_modules/epf", true},
		{"/path/to/docs/epf/_instances/product", false},
		{"/path/to/myproject/epf", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := IsFalsePositive(tt.path)
			if result != tt.expected {
				t.Errorf("IsFalsePositive(%s) = %v, expected %v", tt.path, result, tt.expected)
			}
		})
	}
}

func TestConfidenceRank(t *testing.T) {
	if confidenceRank(ConfidenceHigh) <= confidenceRank(ConfidenceMedium) {
		t.Error("High should rank higher than medium")
	}

	if confidenceRank(ConfidenceMedium) <= confidenceRank(ConfidenceLow) {
		t.Error("Medium should rank higher than low")
	}

	if confidenceRank(ConfidenceLow) <= confidenceRank(ConfidenceNone) {
		t.Error("Low should rank higher than none")
	}
}

func TestNormalizePath(t *testing.T) {
	// sameFile should return false for non-existent paths
	result := sameFile("/nonexistent/path/a", "/nonexistent/path/b")
	if result {
		t.Error("sameFile should return false for non-existent paths")
	}

	// sameFile should return true for the same directory
	tmpDir, err := os.MkdirTemp("", "epf-samefile-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	if !sameFile(tmpDir, tmpDir) {
		t.Error("sameFile should return true for identical paths")
	}

	// sameFile should return false for different directories
	tmpDir2, err := os.MkdirTemp("", "epf-samefile-test2")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir2)

	if sameFile(tmpDir, tmpDir2) {
		t.Error("sameFile should return false for different directories")
	}
}

func TestContainsPath_NormalizedComparison(t *testing.T) {
	// Create a temp directory to get a real path that EvalSymlinks can resolve
	tmpDir, err := os.MkdirTemp("", "epf-contains-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a subdirectory
	subDir := filepath.Join(tmpDir, "testdir")
	os.MkdirAll(subDir, 0755)

	results := []*DiscoveryResult{
		{Path: subDir},
	}

	// Same path should be found
	if !containsPath(results, subDir) {
		t.Error("containsPath should find exact same path")
	}

	// Non-existent different path should not be found
	if containsPath(results, filepath.Join(tmpDir, "otherdir")) {
		t.Error("containsPath should not find different path")
	}
}

func TestGetStandardPaths_DeduplicatesCaseVariants(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-stdpaths-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create docs/EPF (only one variant on disk)
	docsEPF := filepath.Join(tmpDir, "docs", "EPF")
	os.MkdirAll(docsEPF, 0755)

	paths := getStandardPaths(tmpDir)

	// Count how many paths contain "docs" + "epf" (case-insensitive)
	docsEpfCount := 0
	for _, p := range paths {
		rel, err := filepath.Rel(tmpDir, p)
		if err != nil {
			continue
		}
		lower := strings.ToLower(rel)
		// Match "docs/epf" but not "docs/epf/_instances/..."
		if lower == filepath.Join("docs", "epf") {
			docsEpfCount++
		}
	}

	if docsEpfCount > 1 {
		t.Errorf("getStandardPaths should deduplicate case variants of docs/epf, got %d entries", docsEpfCount)
		for _, p := range paths {
			t.Logf("  path: %s", p)
		}
	}
}

func TestDiscover_NoDuplicateInstancesOnCaseInsensitiveFS(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-dedup-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create an instance at docs/EPF/_instances/product (use uppercase EPF)
	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "testproduct")
	os.MkdirAll(instanceDir, 0755)
	os.MkdirAll(filepath.Join(instanceDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(instanceDir, "FIRE"), 0755)

	a := anchor.NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := a.Save(instanceDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	results, err := Discover(tmpDir, nil)
	if err != nil {
		t.Fatalf("Discover failed: %v", err)
	}

	// Count instances that refer to the same filesystem directory
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if sameFile(results[i].Path, results[j].Path) {
				t.Errorf("Duplicate instances found:\n  [%d] %s\n  [%d] %s", i, results[i].Path, j, results[j].Path)
			}
		}
	}
}
