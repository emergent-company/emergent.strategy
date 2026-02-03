package roadmap

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewLoader(t *testing.T) {
	loader := NewLoader("/test/path")
	if loader == nil {
		t.Fatal("NewLoader returned nil")
	}
	if loader.instancePath != "/test/path" {
		t.Errorf("instancePath = %q, want %q", loader.instancePath, "/test/path")
	}
}

func TestLoadFile(t *testing.T) {
	// Create a temp directory with a test roadmap file
	tmpDir := t.TempDir()

	testYAML := `
roadmap:
  id: "roadmap-001"
  strategy_id: "strat-001"
  cycle: 1
  timeframe: "Q1 2025"
  status: "active"
  tracks:
    product:
      track_objective: "Ship core product"
      okrs:
        - id: "okr-p-001"
          objective: "Launch MVP"
          key_results:
            - id: "kr-p-001"
              description: "Feature A complete"
              target: "100% complete"
              value_model_target:
                track: "product"
                component_path: "core-platform.data-management.csv-import"
                target_maturity: "proven"
                maturity_rationale: "Validates core capability"
            - id: "kr-p-002"
              description: "Feature B complete"
              target: "95% accuracy"
    strategy:
      track_objective: "Establish market position"
      okrs:
        - id: "okr-s-001"
          objective: "Define positioning"
          key_results:
            - id: "kr-s-001"
              description: "Landing page live"
              target: "Page live"
`

	testFile := filepath.Join(tmpDir, "roadmap.yaml")
	if err := os.WriteFile(testFile, []byte(testYAML), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	loader := NewLoader(tmpDir)
	roadmap, err := loader.LoadFile(testFile)
	if err != nil {
		t.Fatalf("LoadFile failed: %v", err)
	}

	// Verify basic fields
	if roadmap.ID != "roadmap-001" {
		t.Errorf("ID = %q, want %q", roadmap.ID, "roadmap-001")
	}
	if roadmap.Cycle != 1 {
		t.Errorf("Cycle = %d, want 1", roadmap.Cycle)
	}
	if roadmap.Status != "active" {
		t.Errorf("Status = %q, want %q", roadmap.Status, "active")
	}

	// Verify Product track
	if roadmap.Tracks.Product == nil {
		t.Fatal("Product track is nil")
	}
	if roadmap.Tracks.Product.TrackObjective != "Ship core product" {
		t.Errorf("Product.TrackObjective = %q, want %q", roadmap.Tracks.Product.TrackObjective, "Ship core product")
	}
	if len(roadmap.Tracks.Product.OKRs) != 1 {
		t.Errorf("Product.OKRs count = %d, want 1", len(roadmap.Tracks.Product.OKRs))
	}
	if len(roadmap.Tracks.Product.OKRs[0].KeyResults) != 2 {
		t.Errorf("Product.OKRs[0].KeyResults count = %d, want 2", len(roadmap.Tracks.Product.OKRs[0].KeyResults))
	}

	// Verify Strategy track
	if roadmap.Tracks.Strategy == nil {
		t.Fatal("Strategy track is nil")
	}
	if len(roadmap.Tracks.Strategy.OKRs) != 1 {
		t.Errorf("Strategy.OKRs count = %d, want 1", len(roadmap.Tracks.Strategy.OKRs))
	}

	// Verify value model target
	kr := roadmap.Tracks.Product.OKRs[0].KeyResults[0]
	if kr.ValueModelTarget == nil {
		t.Fatal("ValueModelTarget is nil")
	}
	if kr.ValueModelTarget.ComponentPath != "core-platform.data-management.csv-import" {
		t.Errorf("ComponentPath = %q, want %q", kr.ValueModelTarget.ComponentPath, "core-platform.data-management.csv-import")
	}
	if kr.ValueModelTarget.TargetMaturity != "proven" {
		t.Errorf("TargetMaturity = %q, want %q", kr.ValueModelTarget.TargetMaturity, "proven")
	}
}

func TestLoad_StandardLocation(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatalf("failed to create READY dir: %v", err)
	}

	testYAML := `
roadmap:
  id: "roadmap-test"
  cycle: 1
  timeframe: "Q1 2025"
  status: "draft"
  tracks:
    product:
      track_objective: "Test"
`

	testFile := filepath.Join(readyDir, "05_roadmap_recipe.yaml")
	if err := os.WriteFile(testFile, []byte(testYAML), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	loader := NewLoader(tmpDir)
	roadmap, err := loader.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if roadmap.ID != "roadmap-test" {
		t.Errorf("ID = %q, want %q", roadmap.ID, "roadmap-test")
	}
}

func TestLoad_AlternativeLocation(t *testing.T) {
	tmpDir := t.TempDir()
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatalf("failed to create READY dir: %v", err)
	}

	testYAML := `
roadmap:
  id: "roadmap-alt"
  cycle: 1
  timeframe: "Q1 2025"
  status: "draft"
  tracks:
    product:
      track_objective: "Test"
`

	testFile := filepath.Join(readyDir, "roadmap_recipe.yaml")
	if err := os.WriteFile(testFile, []byte(testYAML), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	loader := NewLoader(tmpDir)
	roadmap, err := loader.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if roadmap.ID != "roadmap-alt" {
		t.Errorf("ID = %q, want %q", roadmap.ID, "roadmap-alt")
	}
}

func TestLoad_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	loader := NewLoader(tmpDir)
	_, err := loader.Load()
	if err == nil {
		t.Error("expected error for missing roadmap file")
	}
}

func TestGetAllKRs(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{ID: "kr-p-001"},
							{ID: "kr-p-002"},
						},
					},
				},
			},
			Strategy: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-s-001",
						KeyResults: []KeyResult{
							{ID: "kr-s-001"},
						},
					},
				},
			},
		},
	}

	krs := roadmap.GetAllKRs()
	if len(krs) != 3 {
		t.Errorf("GetAllKRs count = %d, want 3", len(krs))
	}
}

func TestGetKRsByTrack(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{ID: "kr-p-001"},
							{ID: "kr-p-002"},
						},
					},
					{
						ID: "okr-p-002",
						KeyResults: []KeyResult{
							{ID: "kr-p-003"},
						},
					},
				},
			},
		},
	}

	krs := roadmap.GetKRsByTrack(TrackProduct)
	if len(krs) != 3 {
		t.Errorf("GetKRsByTrack(Product) count = %d, want 3", len(krs))
	}

	krs = roadmap.GetKRsByTrack(TrackStrategy)
	if len(krs) != 0 {
		t.Errorf("GetKRsByTrack(Strategy) count = %d, want 0", len(krs))
	}
}

func TestGetKR(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{ID: "kr-p-001", Description: "First KR"},
							{ID: "kr-p-002", Description: "Second KR"},
						},
					},
				},
			},
		},
	}

	kr, track, found := roadmap.GetKR("kr-p-001")
	if !found {
		t.Fatal("GetKR did not find kr-p-001")
	}
	if kr.Description != "First KR" {
		t.Errorf("Description = %q, want %q", kr.Description, "First KR")
	}
	if track != TrackProduct {
		t.Errorf("Track = %q, want %q", track, TrackProduct)
	}

	_, _, found = roadmap.GetKR("kr-p-999")
	if found {
		t.Error("GetKR found non-existent KR")
	}
}

func TestTrackFromKRID(t *testing.T) {
	tests := []struct {
		krID     string
		expected Track
	}{
		{"kr-p-001", TrackProduct},
		{"kr-s-001", TrackStrategy},
		{"kr-o-001", TrackOrgOps},
		{"kr-c-001", TrackCommercial},
		{"invalid", ""},
		{"kr-x-001", ""},
	}

	for _, tt := range tests {
		t.Run(tt.krID, func(t *testing.T) {
			got := trackFromKRID(tt.krID)
			if got != tt.expected {
				t.Errorf("trackFromKRID(%q) = %q, want %q", tt.krID, got, tt.expected)
			}
		})
	}
}

func TestGetKRsWithValueModelTargets(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &ValueModelTarget{
									ComponentPath: "core-platform.data-management",
								},
							},
							{
								ID: "kr-p-002",
								// No value model target
							},
						},
					},
				},
			},
		},
	}

	krs := roadmap.GetKRsWithValueModelTargets()
	if len(krs) != 1 {
		t.Errorf("GetKRsWithValueModelTargets count = %d, want 1", len(krs))
	}
	if krs[0].ID != "kr-p-001" {
		t.Errorf("ID = %q, want %q", krs[0].ID, "kr-p-001")
	}
}

func TestKRIndex_ByID(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{ID: "kr-p-001", Description: "Test KR"},
						},
					},
				},
			},
		},
	}

	idx := NewKRIndex(roadmap)

	entry, ok := idx.ByID["kr-p-001"]
	if !ok {
		t.Fatal("ByID did not find kr-p-001")
	}
	if entry.KR.Description != "Test KR" {
		t.Errorf("Description = %q, want %q", entry.KR.Description, "Test KR")
	}
	if entry.Track != TrackProduct {
		t.Errorf("Track = %q, want %q", entry.Track, TrackProduct)
	}
	if entry.OKRID != "okr-p-001" {
		t.Errorf("OKRID = %q, want %q", entry.OKRID, "okr-p-001")
	}
}

func TestKRIndex_ByValueModelPath(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &ValueModelTarget{
									Track:         "product",
									ComponentPath: "core-platform.data-management",
								},
							},
							{
								ID: "kr-p-002",
								ValueModelTarget: &ValueModelTarget{
									Track:         "product",
									ComponentPath: "core-platform.data-management",
								},
							},
						},
					},
				},
			},
		},
	}

	idx := NewKRIndex(roadmap)

	// The path should be normalized to Product.CorePlatform.DataManagement
	entries := idx.GetKRsTargetingPath("Product.CorePlatform.DataManagement")
	if len(entries) != 2 {
		t.Errorf("GetKRsTargetingPath count = %d, want 2", len(entries))
	}
}

func TestKRIndex_ByTrack(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{ID: "kr-p-001"},
							{ID: "kr-p-002"},
						},
					},
				},
			},
			Strategy: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-s-001",
						KeyResults: []KeyResult{
							{ID: "kr-s-001"},
						},
					},
				},
			},
		},
	}

	idx := NewKRIndex(roadmap)

	if len(idx.ByTrack[TrackProduct]) != 2 {
		t.Errorf("ByTrack[Product] count = %d, want 2", len(idx.ByTrack[TrackProduct]))
	}
	if len(idx.ByTrack[TrackStrategy]) != 1 {
		t.Errorf("ByTrack[Strategy] count = %d, want 1", len(idx.ByTrack[TrackStrategy]))
	}
}

func TestNormalizeValueModelPath(t *testing.T) {
	tests := []struct {
		track         string
		componentPath string
		expected      string
	}{
		{"product", "core-platform.data-management", "Product.CorePlatform.DataManagement"},
		{"strategy", "market-expansion.enterprise-gtm", "Strategy.MarketExpansion.EnterpriseGtm"},
		{"org_ops", "engineering-excellence", "OrgOps.EngineeringExcellence"},
		{"commercial", "pricing.enterprise", "Commercial.Pricing.Enterprise"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			got := normalizeValueModelPath(tt.track, tt.componentPath)
			if got != tt.expected {
				t.Errorf("normalizeValueModelPath(%q, %q) = %q, want %q", tt.track, tt.componentPath, got, tt.expected)
			}
		})
	}
}

func TestNormalizeTrackName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"product", "Product"},
		{"PRODUCT", "Product"},
		{"strategy", "Strategy"},
		{"org_ops", "OrgOps"},
		{"orgops", "OrgOps"},
		{"org-ops", "OrgOps"},
		{"commercial", "Commercial"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeTrackName(tt.input)
			if got != tt.expected {
				t.Errorf("normalizeTrackName(%q) = %q, want %q", tt.input, got, tt.expected)
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
		{"single", "Single"},
		{"one-two-three", "OneTwoThree"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := kebabToPascal(tt.input)
			if got != tt.expected {
				t.Errorf("kebabToPascal(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestGetAllValueModelPaths(t *testing.T) {
	roadmap := &Roadmap{
		Tracks: Tracks{
			Product: &TrackConfig{
				OKRs: []OKR{
					{
						ID: "okr-p-001",
						KeyResults: []KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &ValueModelTarget{
									Track:         "product",
									ComponentPath: "core-platform.data-management",
								},
							},
							{
								ID: "kr-p-002",
								ValueModelTarget: &ValueModelTarget{
									Track:         "product",
									ComponentPath: "intelligence.ai-chat",
								},
							},
						},
					},
				},
			},
		},
	}

	idx := NewKRIndex(roadmap)
	paths := idx.GetAllValueModelPaths()

	if len(paths) != 2 {
		t.Errorf("GetAllValueModelPaths count = %d, want 2", len(paths))
	}
}
