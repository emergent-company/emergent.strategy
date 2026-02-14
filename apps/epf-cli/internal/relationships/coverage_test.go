package relationships

import (
	"sort"
	"testing"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/roadmap"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/valuemodel"
)

func TestCoverageAnalyzerAnalyzeAll(t *testing.T) {
	valueModels := createTestValueModelSet()

	// Create features that contribute to some paths
	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
				"Product.Search.SemanticFindability",
			},
		},
	}
	features.ByID["fd-002"] = &FeatureDefinition{
		ID: "fd-002",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Core.DataManagement",
			},
		},
	}

	// Build the ByValueModelPath index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	analysis := analyzer.AnalyzeAll()

	// Check total L2 components
	// Product track has: KnowledgeExploration, ContentDiscovery, SemanticFindability, DataManagement, RagRetrieval (5)
	// Strategy track has: Positioning (1)
	// Total: 6
	expectedTotal := 6
	if analysis.TotalL2Components != expectedTotal {
		t.Errorf("TotalL2Components = %d, want %d", analysis.TotalL2Components, expectedTotal)
	}

	// Features contribute to: KnowledgeExploration, SemanticFindability, DataManagement (3 covered)
	// Uncovered: ContentDiscovery, RagRetrieval, Positioning (3 uncovered)
	if analysis.CoveredL2Components != 3 {
		t.Errorf("CoveredL2Components = %d, want 3", analysis.CoveredL2Components)
	}

	if len(analysis.UncoveredL2Components) != 3 {
		t.Errorf("UncoveredL2Components count = %d, want 3", len(analysis.UncoveredL2Components))
	}

	// Coverage should be 50%
	expectedCoverage := 50.0
	if analysis.CoveragePercent != expectedCoverage {
		t.Errorf("CoveragePercent = %.1f, want %.1f", analysis.CoveragePercent, expectedCoverage)
	}
}

func TestCoverageAnalyzerAnalyzeTrack(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
			},
		},
	}

	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)

	// Analyze Product track
	analysis := analyzer.AnalyzeTrack("Product")

	if analysis.Track != "Product" {
		t.Errorf("Track = %q, want 'Product'", analysis.Track)
	}

	// Product has 5 L2 components, 1 covered
	if analysis.TotalL2Components != 5 {
		t.Errorf("TotalL2Components = %d, want 5", analysis.TotalL2Components)
	}

	if analysis.CoveredL2Components != 1 {
		t.Errorf("CoveredL2Components = %d, want 1", analysis.CoveredL2Components)
	}

	// Analyze Strategy track
	analysis = analyzer.AnalyzeTrack("Strategy")

	if analysis.TotalL2Components != 1 {
		t.Errorf("Strategy TotalL2Components = %d, want 1", analysis.TotalL2Components)
	}

	if analysis.CoveredL2Components != 0 {
		t.Errorf("Strategy CoveredL2Components = %d, want 0", analysis.CoveredL2Components)
	}
}

func TestCoverageAnalyzerFindOrphanFeatures(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
			},
		},
	}
	// Orphan feature - no contributes_to
	features.ByID["fd-002"] = &FeatureDefinition{
		ID: "fd-002",
		StrategicContext: StrategicContext{
			ContributesTo: []string{}, // Empty
		},
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	analysis := analyzer.AnalyzeAll()

	if len(analysis.OrphanFeatures) != 1 {
		t.Errorf("OrphanFeatures count = %d, want 1", len(analysis.OrphanFeatures))
	}

	if len(analysis.OrphanFeatures) > 0 && analysis.OrphanFeatures[0].ID != "fd-002" {
		t.Errorf("OrphanFeature ID = %q, want 'fd-002'", analysis.OrphanFeatures[0].ID)
	}
}

func TestCoverageAnalyzerMostContributed(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	// Multiple features contribute to the same path
	features.ByID["fd-001"] = &FeatureDefinition{
		ID:               "fd-001",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	features.ByID["fd-002"] = &FeatureDefinition{
		ID:               "fd-002",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	features.ByID["fd-003"] = &FeatureDefinition{
		ID:               "fd-003",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	features.ByID["fd-004"] = &FeatureDefinition{
		ID:               "fd-004",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Search.SemanticFindability"}},
	}

	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	analysis := analyzer.AnalyzeAll()

	if len(analysis.MostContributed) == 0 {
		t.Fatal("MostContributed should not be empty")
	}

	// The most contributed should be KnowledgeExploration with 3 features
	top := analysis.MostContributed[0]
	if top.FeatureCount != 3 {
		t.Errorf("Top contributed FeatureCount = %d, want 3", top.FeatureCount)
	}
}

func TestCoverageAnalyzerKRTargetsWithoutFeatures(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID:               "fd-001",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	// Create roadmap with KR targeting an uncovered path
	roadmapData := &roadmap.Roadmap{
		Tracks: roadmap.Tracks{
			Product: &roadmap.TrackConfig{
				OKRs: []roadmap.OKR{
					{
						ID: "okr-p-1",
						KeyResults: []roadmap.KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &roadmap.ValueModelTarget{
									Track:         "product",
									ComponentPath: "core.rag-retrieval", // No feature covers this
								},
							},
						},
					},
				},
			},
		},
	}

	krIndex := roadmap.NewKRIndex(roadmapData)
	analyzer := NewCoverageAnalyzer(valueModels, features, krIndex)
	analysis := analyzer.AnalyzeAll()

	if len(analysis.KRTargetsWithoutFeatures) == 0 {
		t.Error("Should find KR targets without feature coverage")
	}
}

func TestCoverageAnalyzerFindGaps(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID:               "fd-001",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	// Create roadmap with KR targeting an uncovered path
	roadmapData := &roadmap.Roadmap{
		Tracks: roadmap.Tracks{
			Product: &roadmap.TrackConfig{
				OKRs: []roadmap.OKR{
					{
						ID: "okr-p-1",
						KeyResults: []roadmap.KeyResult{
							{
								ID: "kr-p-001",
								ValueModelTarget: &roadmap.ValueModelTarget{
									Track:         "product",
									ComponentPath: "core.rag-retrieval",
								},
							},
						},
					},
				},
			},
		},
	}

	krIndex := roadmap.NewKRIndex(roadmapData)
	analyzer := NewCoverageAnalyzer(valueModels, features, krIndex)

	gaps := analyzer.FindGaps()

	// Should find multiple gaps
	if len(gaps) == 0 {
		t.Fatal("FindGaps should return gaps")
	}

	// Gaps with KR targets should be sorted first
	var hasKRTargetGap bool
	for _, gap := range gaps {
		if gap.HasKRTarget {
			hasKRTargetGap = true
			if len(gap.TargetingKRs) == 0 {
				t.Error("Gap with HasKRTarget=true should have TargetingKRs")
			}
			break
		}
	}

	if !hasKRTargetGap {
		t.Error("Should find at least one gap with KR target")
	}
}

func TestCoverageAnalyzerByLayer(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID: "fd-001",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Product.Discovery.KnowledgeExploration",
				"Product.Discovery.ContentDiscovery",
			},
		},
	}
	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	analysis := analyzer.AnalyzeAll()

	// Check layer coverage
	discoveryLayer := analysis.ByLayer["Product.Discovery"]
	if discoveryLayer == nil {
		t.Fatal("Product.Discovery layer not found in ByLayer")
	}

	// Discovery has 2 components, both covered
	if discoveryLayer.TotalComponents != 2 {
		t.Errorf("Discovery TotalComponents = %d, want 2", discoveryLayer.TotalComponents)
	}

	if discoveryLayer.CoveredCount != 2 {
		t.Errorf("Discovery CoveredCount = %d, want 2", discoveryLayer.CoveredCount)
	}

	if discoveryLayer.CoveragePercent != 100.0 {
		t.Errorf("Discovery CoveragePercent = %.1f, want 100.0", discoveryLayer.CoveragePercent)
	}
}

func TestCoverageAnalyzerGetCoverageByTrack(t *testing.T) {
	valueModels := createTestValueModelSet()

	features := NewFeatureSet()
	features.ByID["fd-001"] = &FeatureDefinition{
		ID:               "fd-001",
		StrategicContext: StrategicContext{ContributesTo: []string{"Product.Discovery.KnowledgeExploration"}},
	}
	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	coverageByTrack := analyzer.GetCoverageByTrack()

	if _, ok := coverageByTrack["Product"]; !ok {
		t.Error("Product track not in coverageByTrack")
	}

	if _, ok := coverageByTrack["Strategy"]; !ok {
		t.Error("Strategy track not in coverageByTrack")
	}

	// Product: 1 of 5 covered = 20%
	if coverageByTrack["Product"] != 20.0 {
		t.Errorf("Product coverage = %.1f, want 20.0", coverageByTrack["Product"])
	}

	// Strategy: 0 of 1 covered = 0%
	if coverageByTrack["Strategy"] != 0.0 {
		t.Errorf("Strategy coverage = %.1f, want 0.0", coverageByTrack["Strategy"])
	}
}

func TestCoverageGap(t *testing.T) {
	gap := CoverageGap{
		Path:          "Product.Core.DataManagement",
		LayerName:     "Core",
		ComponentName: "DataManagement",
		HasKRTarget:   true,
		TargetingKRs:  []string{"kr-p-001", "kr-p-002"},
	}

	if gap.Path != "Product.Core.DataManagement" {
		t.Errorf("Gap.Path = %q, want 'Product.Core.DataManagement'", gap.Path)
	}

	if !gap.HasKRTarget {
		t.Error("Gap.HasKRTarget should be true")
	}

	if len(gap.TargetingKRs) != 2 {
		t.Errorf("Gap.TargetingKRs length = %d, want 2", len(gap.TargetingKRs))
	}
}

func TestLayerCoverage(t *testing.T) {
	coverage := LayerCoverage{
		LayerName:       "Discovery",
		LayerPath:       "Product.Discovery",
		TotalComponents: 5,
		CoveredCount:    3,
		UncoveredPaths: []string{
			"Product.Discovery.Component4",
			"Product.Discovery.Component5",
		},
	}

	coverage.CoveragePercent = float64(coverage.CoveredCount) / float64(coverage.TotalComponents) * 100

	if coverage.CoveragePercent != 60.0 {
		t.Errorf("CoveragePercent = %.1f, want 60.0", coverage.CoveragePercent)
	}

	if len(coverage.UncoveredPaths) != 2 {
		t.Errorf("UncoveredPaths length = %d, want 2", len(coverage.UncoveredPaths))
	}
}

func TestPathContribution(t *testing.T) {
	contribution := PathContribution{
		Path:          "Product.Discovery.KnowledgeExploration",
		FeatureCount:  3,
		FeatureIDs:    []string{"fd-001", "fd-002", "fd-003"},
		HasKRTargeted: true,
	}

	if contribution.FeatureCount != 3 {
		t.Errorf("FeatureCount = %d, want 3", contribution.FeatureCount)
	}

	if len(contribution.FeatureIDs) != 3 {
		t.Errorf("FeatureIDs length = %d, want 3", len(contribution.FeatureIDs))
	}
}

func TestCoverageAnalyzerCrossTrackShorthandPaths(t *testing.T) {
	// This test verifies the fix for the coverage path normalization issue.
	// Value model IDs use prefixed kebab-case (e.g., "strategy-l1-context", "strategy-c-user-insight")
	// which become PascalCase paths like "Strategy.StrategyL1Context.StrategyCUserInsight".
	// Feature definitions use shorthand name-based paths like "Strategy.Context.UserInsight".
	// The coverage analyzer must resolve shorthand paths through the resolver to match.

	set := valuemodel.NewValueModelSet()

	// Product track with simple IDs (no prefix mismatch)
	set.Models[valuemodel.TrackProduct] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackProduct,
		Layers: []valuemodel.Layer{
			{
				ID:   "discovery",
				Name: "Discovery",
				Components: []valuemodel.Component{
					{ID: "knowledge-exploration", Name: "Knowledge Exploration"},
				},
			},
		},
	}

	// Strategy track with prefixed IDs — the canonical template pattern
	// ID "strategy-l1-context" produces PascalCase "StrategyL1Context"
	// but features reference it as "Context" (from the Name field)
	set.Models[valuemodel.TrackStrategy] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackStrategy,
		Layers: []valuemodel.Layer{
			{
				ID:   "strategy-l1-context",
				Name: "CONTEXT",
				Components: []valuemodel.Component{
					{
						ID:   "strategy-c-user-insight",
						Name: "User Insight",
						SubComponents: []valuemodel.SubComponent{
							{ID: "strategy-s-user-research", Name: "User Research", Active: true},
						},
					},
					{
						ID:   "strategy-c-market-analysis",
						Name: "Market Analysis",
					},
				},
			},
		},
	}

	features := NewFeatureSet()

	// Feature uses shorthand name-based path (how features are written in practice)
	features.ByID["fd-007"] = &FeatureDefinition{
		ID: "fd-007",
		StrategicContext: StrategicContext{
			ContributesTo: []string{
				"Strategy.Context.UserInsight",           // Shorthand — should resolve to Strategy.StrategyL1Context.StrategyCUserInsight
				"Product.Discovery.KnowledgeExploration", // Direct match — no resolution issue
			},
		},
	}

	// Build index
	for _, f := range features.ByID {
		for _, path := range f.StrategicContext.ContributesTo {
			normalizedPath := NormalizeValueModelPath(path)
			features.ByValueModelPath[normalizedPath] = append(features.ByValueModelPath[normalizedPath], f)
		}
	}

	analyzer := NewCoverageAnalyzer(set, features, nil)

	// Test AnalyzeAll — Strategy should show coverage
	analysis := analyzer.AnalyzeAll()

	// Total L2: Product has 1 (KnowledgeExploration), Strategy has 2 (UserInsight, MarketAnalysis) = 3
	if analysis.TotalL2Components != 3 {
		t.Errorf("TotalL2Components = %d, want 3", analysis.TotalL2Components)
	}

	// Covered: KnowledgeExploration + UserInsight = 2
	if analysis.CoveredL2Components != 2 {
		t.Errorf("CoveredL2Components = %d, want 2 (KnowledgeExploration + UserInsight)", analysis.CoveredL2Components)
	}

	// Only MarketAnalysis should be uncovered
	if len(analysis.UncoveredL2Components) != 1 {
		t.Errorf("UncoveredL2Components count = %d, want 1, got %v", len(analysis.UncoveredL2Components), analysis.UncoveredL2Components)
	}

	// Test AnalyzeTrack for Strategy specifically
	strategyAnalysis := analyzer.AnalyzeTrack("Strategy")

	if strategyAnalysis.TotalL2Components != 2 {
		t.Errorf("Strategy TotalL2Components = %d, want 2", strategyAnalysis.TotalL2Components)
	}

	// UserInsight should be covered via shorthand path resolution
	if strategyAnalysis.CoveredL2Components != 1 {
		t.Errorf("Strategy CoveredL2Components = %d, want 1 (UserInsight via shorthand path)", strategyAnalysis.CoveredL2Components)
	}

	// Coverage should be 50% (1 of 2)
	if strategyAnalysis.CoveragePercent != 50.0 {
		t.Errorf("Strategy CoveragePercent = %.1f, want 50.0", strategyAnalysis.CoveragePercent)
	}

	// Test GetCoverageByTrack
	coverageByTrack := analyzer.GetCoverageByTrack()

	if coverageByTrack["Strategy"] != 50.0 {
		t.Errorf("Strategy coverage by track = %.1f, want 50.0", coverageByTrack["Strategy"])
	}

	if coverageByTrack["Product"] != 100.0 {
		t.Errorf("Product coverage by track = %.1f, want 100.0", coverageByTrack["Product"])
	}
}

func TestCoverageAnalyzerMissingTracks(t *testing.T) {
	// createTestValueModelSet only loads Product and Strategy
	// So OrgOps and Commercial should be reported as missing
	valueModels := createTestValueModelSet()
	features := NewFeatureSet()

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	analysis := analyzer.AnalyzeAll()

	if len(analysis.MissingTracks) != 2 {
		t.Errorf("MissingTracks count = %d, want 2 (OrgOps, Commercial)", len(analysis.MissingTracks))
	}

	sort.Strings(analysis.MissingTracks)
	expected := []string{"Commercial", "OrgOps"}
	sort.Strings(expected)

	for i, track := range expected {
		if i >= len(analysis.MissingTracks) {
			break
		}
		if analysis.MissingTracks[i] != track {
			t.Errorf("MissingTracks[%d] = %q, want %q", i, analysis.MissingTracks[i], track)
		}
	}
}

func TestCoverageAnalyzerNoMissingTracks(t *testing.T) {
	// Create a set with all 4 tracks
	set := valuemodel.NewValueModelSet()
	set.Models[valuemodel.TrackProduct] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackProduct,
		Layers: []valuemodel.Layer{{
			ID: "core", Name: "Core",
			Components: []valuemodel.Component{{ID: "comp1", Name: "Comp1"}},
		}},
	}
	set.Models[valuemodel.TrackStrategy] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackStrategy,
		Layers: []valuemodel.Layer{{
			ID: "growth", Name: "Growth",
			Components: []valuemodel.Component{{ID: "comp1", Name: "Comp1"}},
		}},
	}
	set.Models[valuemodel.TrackOrgOps] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackOrgOps,
		Layers: []valuemodel.Layer{{
			ID: "process", Name: "Process",
			Components: []valuemodel.Component{{ID: "comp1", Name: "Comp1"}},
		}},
	}
	set.Models[valuemodel.TrackCommercial] = &valuemodel.ValueModel{
		TrackName: valuemodel.TrackCommercial,
		Layers: []valuemodel.Layer{{
			ID: "revenue", Name: "Revenue",
			Components: []valuemodel.Component{{ID: "comp1", Name: "Comp1"}},
		}},
	}

	features := NewFeatureSet()
	analyzer := NewCoverageAnalyzer(set, features, nil)
	analysis := analyzer.AnalyzeAll()

	if len(analysis.MissingTracks) != 0 {
		t.Errorf("MissingTracks should be empty when all 4 tracks loaded, got %v", analysis.MissingTracks)
	}
}

func TestCoverageAnalyzerGetCoverageByTrackMissing(t *testing.T) {
	// Only Product loaded — OrgOps, Commercial should get -1 sentinel
	valueModels := createTestValueModelSet()
	features := NewFeatureSet()

	analyzer := NewCoverageAnalyzer(valueModels, features, nil)
	coverageByTrack := analyzer.GetCoverageByTrack()

	// OrgOps is not in createTestValueModelSet(), should be -1
	if coverage, ok := coverageByTrack["OrgOps"]; !ok {
		t.Error("OrgOps should be in coverageByTrack")
	} else if coverage != -1 {
		t.Errorf("OrgOps coverage = %.1f, want -1 (not loaded)", coverage)
	}

	// Commercial is not in createTestValueModelSet(), should be -1
	if coverage, ok := coverageByTrack["Commercial"]; !ok {
		t.Error("Commercial should be in coverageByTrack")
	} else if coverage != -1 {
		t.Errorf("Commercial coverage = %.1f, want -1 (not loaded)", coverage)
	}

	// Product IS loaded, should have real coverage
	if coverage, ok := coverageByTrack["Product"]; !ok {
		t.Error("Product should be in coverageByTrack")
	} else if coverage == -1 {
		t.Error("Product coverage should not be -1 (it IS loaded)")
	}
}
