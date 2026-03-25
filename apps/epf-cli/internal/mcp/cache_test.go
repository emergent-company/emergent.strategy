package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
)

// mockStrategyStore is a minimal mock for testing IsRegisteredStore.
// It only needs to satisfy the interface — no methods are called in these tests.
type mockStrategyStore struct{}

func (m *mockStrategyStore) Load(context.Context) error                      { return nil }
func (m *mockStrategyStore) Reload(context.Context) error                    { return nil }
func (m *mockStrategyStore) Close() error                                    { return nil }
func (m *mockStrategyStore) GetProductVision() (*strategy.NorthStar, error)  { return nil, nil }
func (m *mockStrategyStore) GetPersonas() ([]strategy.PersonaSummary, error) { return nil, nil }
func (m *mockStrategyStore) GetPersonaDetails(string) (*strategy.TargetUser, []strategy.PainPoint, error) {
	return nil, nil, nil
}
func (m *mockStrategyStore) GetValuePropositions(string) ([]strategy.ValueProposition, error) {
	return nil, nil
}
func (m *mockStrategyStore) GetCompetitivePosition() (*strategy.CompetitiveMoat, *strategy.Positioning, error) {
	return nil, nil, nil
}
func (m *mockStrategyStore) GetRoadmapSummary(string, int) (*strategy.Roadmap, error) {
	return nil, nil
}
func (m *mockStrategyStore) GetFeatures(string) ([]strategy.FeatureSummary, error) { return nil, nil }
func (m *mockStrategyStore) GetFeatureDetails(string) (*strategy.Feature, error)   { return nil, nil }
func (m *mockStrategyStore) Search(string, int) ([]strategy.SearchResult, error)   { return nil, nil }
func (m *mockStrategyStore) GetStrategicContext(string) (*strategy.StrategicContextResult, error) {
	return nil, nil
}
func (m *mockStrategyStore) GetModel() *strategy.StrategyModel { return nil }

// =============================================================================
// Cache Invalidation Integration Tests (Tasks 1.7 + 1.8)
// =============================================================================

// TestCacheInvalidation_FileEditReturnsUpdatedData tests that editing a file
// on disk causes the next getOrCreateStrategyStore call to return updated data.
// This is the core integration test for mtime-based cache invalidation.
func TestCacheInvalidation_FileEditReturnsUpdatedData(t *testing.T) {
	// Create a minimal EPF instance in temp dir
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	fireDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(fireDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Write an anchor file
	anchorContent := `epf_anchor: true
version: "1.0.0"
instance_id: "test-cache-invalidation"
created_at: 2025-01-01T00:00:00Z
product_name: "Cache Test"
`
	if err := os.WriteFile(filepath.Join(tmpDir, "_epf.yaml"), []byte(anchorContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// Write initial north star with organization "Original Org"
	nsV1 := `north_star:
  organization: "Original Org"
  purpose:
    statement: "Original purpose"
    problem_we_solve: "Test"
    who_we_serve: "Devs"
    impact_we_seek: "Quality"
  vision:
    vision_statement: "Original vision"
    timeframe: "5 years"
  mission:
    mission_statement: "Original mission"
    what_we_do:
      - "Build"
    how_we_deliver:
      approach: "TDD"
      key_capabilities: []
    who_we_serve_specifically: "Engineers"
    boundaries:
      we_dont_do: []
      why_not: "N/A"
  values: []
`
	nsPath := filepath.Join(readyDir, "00_north_star.yaml")
	if err := os.WriteFile(nsPath, []byte(nsV1), 0o644); err != nil {
		t.Fatal(err)
	}

	// Clear any prior cache
	clearStrategyStoreCache()

	// Load via cache — should get "Original Org"
	store1, err := getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("First getOrCreateStrategyStore failed: %v", err)
	}

	model1 := store1.GetModel()
	if model1 == nil || model1.NorthStar == nil {
		t.Fatal("Expected NorthStar to be loaded")
	}
	if model1.NorthStar.Organization != "Original Org" {
		t.Errorf("Expected 'Original Org', got '%s'", model1.NorthStar.Organization)
	}

	// Wait to ensure filesystem timestamp resolution is sufficient
	time.Sleep(50 * time.Millisecond)

	// Modify the north star on disk
	nsV2 := `north_star:
  organization: "Updated Org"
  purpose:
    statement: "Updated purpose"
    problem_we_solve: "Test"
    who_we_serve: "Devs"
    impact_we_seek: "Quality"
  vision:
    vision_statement: "Updated vision"
    timeframe: "5 years"
  mission:
    mission_statement: "Updated mission"
    what_we_do:
      - "Build"
    how_we_deliver:
      approach: "TDD"
      key_capabilities: []
    who_we_serve_specifically: "Engineers"
    boundaries:
      we_dont_do: []
      why_not: "N/A"
  values: []
`
	if err := os.WriteFile(nsPath, []byte(nsV2), 0o644); err != nil {
		t.Fatalf("Failed to write updated north star: %v", err)
	}

	// Load again — mtime-based invalidation should detect the change
	store2, err := getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("Second getOrCreateStrategyStore failed: %v", err)
	}

	model2 := store2.GetModel()
	if model2 == nil || model2.NorthStar == nil {
		t.Fatal("Expected NorthStar to be loaded after update")
	}
	if model2.NorthStar.Organization != "Updated Org" {
		t.Errorf("Expected 'Updated Org' after file edit, got '%s' (stale cache)", model2.NorthStar.Organization)
	}
}

// TestCacheInvalidation_ExplicitInvalidation tests that invalidateStrategyStore
// causes a full reload on next access.
func TestCacheInvalidation_ExplicitInvalidation(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	fireDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(fireDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	anchorContent := `epf_anchor: true
version: "1.0.0"
instance_id: "test-explicit-invalidation"
created_at: 2025-01-01T00:00:00Z
product_name: "Explicit Test"
`
	if err := os.WriteFile(filepath.Join(tmpDir, "_epf.yaml"), []byte(anchorContent), 0o644); err != nil {
		t.Fatal(err)
	}

	nsContent := `north_star:
  organization: "Test"
  purpose:
    statement: "Test"
  vision:
    vision_statement: "Test"
  mission:
    mission_statement: "Test"
    what_we_do: []
    how_we_deliver:
      approach: "Test"
      key_capabilities: []
    boundaries:
      we_dont_do: []
      why_not: "Test"
  values: []
`
	if err := os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(nsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	clearStrategyStoreCache()

	// Load into cache
	_, err := getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("First load failed: %v", err)
	}

	// Verify it's cached
	age := getStrategyStoreAge(tmpDir)
	if age == 0 {
		t.Error("Expected non-zero cache age after loading")
	}

	// Explicitly invalidate
	invalidateStrategyStore(tmpDir)

	// Cache age should be 0 after invalidation
	age = getStrategyStoreAge(tmpDir)
	if age != 0 {
		t.Errorf("Expected zero cache age after invalidation, got %v", age)
	}

	// Next load should create fresh entry
	_, err = getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("Reload after invalidation failed: %v", err)
	}

	age = getStrategyStoreAge(tmpDir)
	if age == 0 {
		t.Error("Expected non-zero cache age after reload")
	}
}

// TestCacheInvalidation_NewFileDetected tests that adding a new file to the
// instance triggers a cache reload.
func TestCacheInvalidation_NewFileDetected(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	fireDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	vmDir := filepath.Join(tmpDir, "FIRE", "value_models")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(fireDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(vmDir, 0o755); err != nil {
		t.Fatal(err)
	}

	anchorContent := `epf_anchor: true
version: "1.0.0"
instance_id: "test-new-file"
created_at: 2025-01-01T00:00:00Z
product_name: "New File Test"
`
	if err := os.WriteFile(filepath.Join(tmpDir, "_epf.yaml"), []byte(anchorContent), 0o644); err != nil {
		t.Fatal(err)
	}

	nsContent := `north_star:
  organization: "Test"
  purpose:
    statement: "Test"
  vision:
    vision_statement: "Test"
  mission:
    mission_statement: "Test"
    what_we_do: []
    how_we_deliver:
      approach: "Test"
      key_capabilities: []
    boundaries:
      we_dont_do: []
      why_not: "Test"
  values: []
`
	if err := os.WriteFile(filepath.Join(readyDir, "00_north_star.yaml"), []byte(nsContent), 0o644); err != nil {
		t.Fatal(err)
	}

	clearStrategyStoreCache()

	// Load — should have 0 features
	store1, err := getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("First load failed: %v", err)
	}

	model1 := store1.GetModel()
	if model1 == nil {
		t.Fatal("Model is nil")
	}
	if len(model1.Features) != 0 {
		t.Errorf("Expected 0 features initially, got %d", len(model1.Features))
	}

	// Wait for timestamp resolution
	time.Sleep(50 * time.Millisecond)

	// Add a new feature file
	featureContent := `id: "fd-001"
name: "New Feature"
slug: "new-feature"
status: "draft"
strategic_context:
  contributes_to: []
  tracks:
    - "product"
definition:
  job_to_be_done: "Test"
  solution_approach: "Test"
  personas: []
implementation:
  capabilities: []
feature_maturity:
  overall_stage: "hypothetical"
  capability_maturity: []
`
	if err := os.WriteFile(filepath.Join(fireDir, "fd-001.yaml"), []byte(featureContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// Load again — should detect the new file and reload
	store2, err := getOrCreateStrategyStore(tmpDir)
	if err != nil {
		t.Fatalf("Second load failed: %v", err)
	}

	model2 := store2.GetModel()
	if model2 == nil {
		t.Fatal("Model is nil after reload")
	}
	if len(model2.Features) != 1 {
		t.Errorf("Expected 1 feature after adding file, got %d (stale cache)", len(model2.Features))
	}
}

// TestIsRegisteredStore_NormalizesRemotePaths tests that IsRegisteredStore
// correctly resolves raw "owner/repo" paths to "github://owner/repo" cache keys.
// This is the fix for the bug where handleHealthCheck passed raw user input to
// IsRegisteredStore but stores were registered under github:// keys.
func TestIsRegisteredStore_NormalizesRemotePaths(t *testing.T) {
	// Register a store under the canonical github:// key.
	dummyStore := &mockStrategyStore{}
	strategyStoreMu.Lock()
	registeredStores["github://test-org/test-repo"] = dummyStore
	startupStores["github://test-org/test-repo"] = true
	strategyStoreMu.Unlock()

	defer func() {
		strategyStoreMu.Lock()
		delete(registeredStores, "github://test-org/test-repo")
		delete(startupStores, "github://test-org/test-repo")
		strategyStoreMu.Unlock()
	}()

	tests := []struct {
		name     string
		key      string
		expected bool
	}{
		{
			name:     "canonical github:// key",
			key:      "github://test-org/test-repo",
			expected: true,
		},
		{
			name:     "raw owner/repo input",
			key:      "test-org/test-repo",
			expected: true,
		},
		{
			name:     "non-existent repo",
			key:      "other-org/other-repo",
			expected: false,
		},
		{
			name:     "local filesystem path",
			key:      "/Users/test/docs/EPF/_instances/product",
			expected: false,
		},
		{
			name:     "relative path (not remote)",
			key:      "./docs/EPF/_instances/product",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsRegisteredStore(tt.key)
			if result != tt.expected {
				t.Errorf("IsRegisteredStore(%q) = %v, want %v", tt.key, result, tt.expected)
			}
		})
	}
}

// TestIsRegisteredStore_WithSubpath tests that owner/repo/subpath format is handled.
func TestIsRegisteredStore_WithSubpath(t *testing.T) {
	dummyStore := &mockStrategyStore{}
	cacheKey := "github://test-org/test-repo/docs/EPF/_instances/product"

	strategyStoreMu.Lock()
	registeredStores[cacheKey] = dummyStore
	startupStores[cacheKey] = true
	strategyStoreMu.Unlock()

	defer func() {
		strategyStoreMu.Lock()
		delete(registeredStores, cacheKey)
		delete(startupStores, cacheKey)
		strategyStoreMu.Unlock()
	}()

	// Raw user input with subpath should match
	if !IsRegisteredStore("test-org/test-repo/docs/EPF/_instances/product") {
		t.Error("Expected IsRegisteredStore to resolve owner/repo/subpath to github:// key")
	}
}

// TestMtimesChanged tests the mtime comparison logic.
func TestMtimesChanged(t *testing.T) {
	base := time.Now()

	tests := []struct {
		name     string
		recorded map[string]time.Time
		current  map[string]time.Time
		expected bool
	}{
		{
			name:     "identical",
			recorded: map[string]time.Time{"/a": base, "/b": base},
			current:  map[string]time.Time{"/a": base, "/b": base},
			expected: false,
		},
		{
			name:     "modified file",
			recorded: map[string]time.Time{"/a": base},
			current:  map[string]time.Time{"/a": base.Add(time.Second)},
			expected: true,
		},
		{
			name:     "new file",
			recorded: map[string]time.Time{"/a": base},
			current:  map[string]time.Time{"/a": base, "/b": base},
			expected: true,
		},
		{
			name:     "deleted file",
			recorded: map[string]time.Time{"/a": base, "/b": base},
			current:  map[string]time.Time{"/a": base},
			expected: true,
		},
		{
			name:     "empty both",
			recorded: map[string]time.Time{},
			current:  map[string]time.Time{},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := mtimesChanged(tt.recorded, tt.current)
			if result != tt.expected {
				t.Errorf("mtimesChanged() = %v, want %v", result, tt.expected)
			}
		})
	}
}
