package relationships

import (
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/roadmap"
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
