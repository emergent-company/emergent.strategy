package strategy

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

// TestFileSystemSource_Load tests loading a real EPF instance.
func TestFileSystemSource_Load(t *testing.T) {
	// Use the real emergent instance for testing
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")

	store := NewFileSystemSource(instancePath)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := store.Load(ctx)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Verify model was loaded
	model := store.GetModel()
	if model == nil {
		t.Fatal("GetModel() returned nil after Load()")
	}

	// Verify basic artifacts were loaded
	if model.NorthStar == nil {
		t.Error("Expected NorthStar to be loaded")
	}
	if model.InsightAnalyses == nil {
		t.Error("Expected InsightAnalyses to be loaded")
	}
	if model.StrategyFormula == nil {
		t.Error("Expected StrategyFormula to be loaded")
	}
	if model.Roadmap == nil {
		t.Error("Expected Roadmap to be loaded")
	}
	if len(model.Features) == 0 {
		t.Error("Expected at least one feature to be loaded")
	}
}

// TestFileSystemSource_GetProductVision tests retrieving the north star.
func TestFileSystemSource_GetProductVision(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	vision, err := store.GetProductVision()
	if err != nil {
		t.Fatalf("GetProductVision() error = %v", err)
	}

	if vision.Purpose.Statement == "" {
		t.Error("Expected purpose statement to be non-empty")
	}
	if vision.Vision.Statement == "" {
		t.Error("Expected vision statement to be non-empty")
	}
	if vision.Mission.Statement == "" {
		t.Error("Expected mission statement to be non-empty")
	}
}

// TestFileSystemSource_GetPersonas tests retrieving personas.
func TestFileSystemSource_GetPersonas(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	personas, err := store.GetPersonas()
	if err != nil {
		t.Fatalf("GetPersonas() error = %v", err)
	}

	if len(personas) == 0 {
		t.Error("Expected at least one persona")
	}

	// Check persona has required fields
	for _, p := range personas {
		if p.Name == "" {
			t.Error("Persona should have a name")
		}
	}
}

// TestFileSystemSource_GetFeatures tests retrieving features.
func TestFileSystemSource_GetFeatures(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Get all features
	features, err := store.GetFeatures("")
	if err != nil {
		t.Fatalf("GetFeatures() error = %v", err)
	}

	if len(features) == 0 {
		t.Fatal("Expected at least one feature")
	}

	// Check features have required fields
	for _, f := range features {
		if f.ID == "" {
			t.Error("Feature should have an ID")
		}
		if f.Name == "" {
			t.Error("Feature should have a name")
		}
	}
}

// TestFileSystemSource_GetFeatures_WithStatusFilter tests filtering features by status.
func TestFileSystemSource_GetFeatures_WithStatusFilter(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Get features with specific status
	features, err := store.GetFeatures("ready")
	if err != nil {
		t.Fatalf("GetFeatures(ready) error = %v", err)
	}

	// All returned features should have status "ready"
	for _, f := range features {
		if f.Status != "ready" {
			t.Errorf("Expected status 'ready', got '%s'", f.Status)
		}
	}
}

// TestFileSystemSource_GetFeatureDetails tests getting full feature details.
func TestFileSystemSource_GetFeatureDetails(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Get all features first to get an ID
	features, _ := store.GetFeatures("")
	if len(features) == 0 {
		t.Skip("No features available to test")
	}

	featureID := features[0].ID
	feature, err := store.GetFeatureDetails(featureID)
	if err != nil {
		t.Fatalf("GetFeatureDetails(%s) error = %v", featureID, err)
	}

	if feature.ID != featureID {
		t.Errorf("Expected feature ID %s, got %s", featureID, feature.ID)
	}
	if feature.Name == "" {
		t.Error("Expected feature name to be non-empty")
	}
}

// TestFileSystemSource_GetRoadmapSummary tests retrieving roadmap.
func TestFileSystemSource_GetRoadmapSummary(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	roadmap, err := store.GetRoadmapSummary("", 0)
	if err != nil {
		t.Fatalf("GetRoadmapSummary() error = %v", err)
	}

	if len(roadmap.Tracks) == 0 {
		t.Error("Expected at least one track in roadmap")
	}

	// Count OKRs
	okrCount := 0
	for _, track := range roadmap.Tracks {
		okrCount += len(track.OKRs)
	}
	if okrCount == 0 {
		t.Error("Expected at least one OKR in roadmap")
	}
}

// TestFileSystemSource_GetRoadmapSummary_FilterByTrack tests filtering roadmap by track.
func TestFileSystemSource_GetRoadmapSummary_FilterByTrack(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	roadmap, err := store.GetRoadmapSummary("product", 0)
	if err != nil {
		t.Fatalf("GetRoadmapSummary(product, 0) error = %v", err)
	}

	if len(roadmap.Tracks) != 1 {
		t.Errorf("Expected exactly 1 track when filtering, got %d", len(roadmap.Tracks))
	}
}

// TestFileSystemSource_GetCompetitivePosition tests competitive analysis retrieval.
func TestFileSystemSource_GetCompetitivePosition(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	moat, positioning, err := store.GetCompetitivePosition()
	if err != nil {
		t.Fatalf("GetCompetitivePosition() error = %v", err)
	}

	if positioning.Statement == "" && positioning.UniqueValueProp == "" {
		t.Error("Expected at least one positioning field to be set")
	}

	if moat.Differentiation == "" && len(moat.Advantages) == 0 {
		t.Error("Expected at least some competitive moat information")
	}
}

// TestFileSystemSource_Search tests full-text search.
func TestFileSystemSource_Search(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Search for a term that should match
	results, err := store.Search("knowledge", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) == 0 {
		t.Error("Expected at least one search result for 'knowledge'")
	}

	// Check results have required fields
	for _, r := range results {
		if r.Type == "" {
			t.Error("Search result should have a type")
		}
		if r.Score == 0 {
			t.Error("Search result should have a non-zero score")
		}
	}
}

// TestFileSystemSource_GetStrategicContext tests context synthesis.
func TestFileSystemSource_GetStrategicContext(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	context, err := store.GetStrategicContext("knowledge graph")
	if err != nil {
		t.Fatalf("GetStrategicContext() error = %v", err)
	}

	if context.Topic != "knowledge graph" {
		t.Errorf("Expected topic 'knowledge graph', got '%s'", context.Topic)
	}
	if context.Vision == "" {
		t.Error("Expected vision context to be populated")
	}
}

// TestFileSystemSource_Reload tests reloading the store.
func TestFileSystemSource_Reload(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	firstLoadTime := store.GetModel().LastLoaded

	// Small delay to ensure timestamp changes
	time.Sleep(10 * time.Millisecond)

	if err := store.Reload(ctx); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}

	secondLoadTime := store.GetModel().LastLoaded
	if !secondLoadTime.After(firstLoadTime) {
		t.Error("Expected LastLoaded to be updated after Reload")
	}
}

// TestFileSystemSource_Close tests closing the store.
func TestFileSystemSource_Close(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	// After close, model should be nil
	if store.GetModel() != nil {
		t.Error("Expected model to be nil after Close()")
	}
}

// TestFileSystemSource_NotLoaded tests error when accessing before load.
func TestFileSystemSource_NotLoaded(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	store := NewFileSystemSource(instancePath)

	// Try to access without loading
	_, err := store.GetProductVision()
	if err == nil {
		t.Error("Expected error when accessing before Load()")
	}
}

// TestNewFileSystemSource_WithOptions tests store options.
func TestNewFileSystemSource_WithOptions(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")

	reloadCalled := false
	store := NewFileSystemSource(instancePath,
		WithWatchChanges(true),
		WithDebounce(100),
		WithOnReload(func() {
			reloadCalled = true
		}),
	)

	ctx := context.Background()
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// Reload should trigger callback
	if err := store.Reload(ctx); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}

	if !reloadCalled {
		t.Error("Expected OnReload callback to be called")
	}
}
