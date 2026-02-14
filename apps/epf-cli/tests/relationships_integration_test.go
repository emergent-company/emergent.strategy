package integration

import (
	"strings"
	"testing"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/relationships"
)

func TestRelationshipsAnalyzerWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	// Test that value models loaded
	valueModels := analyzer.GetValueModels()
	if len(valueModels.Models) == 0 {
		t.Error("No value models loaded")
	}

	// Test that features loaded
	features := analyzer.GetFeatures()
	if len(features.ByID) == 0 {
		t.Error("No features loaded")
	}
	t.Logf("Loaded %d features", len(features.ByID))

	// Test that roadmap loaded
	roadmap := analyzer.GetRoadmap()
	if roadmap == nil {
		t.Error("Roadmap not loaded")
	}
}

func TestRelationshipsFeatureLoaderWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	loader := relationships.NewFeatureLoader(instancePath)
	features, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load features: %v", err)
	}

	// Verify we have features
	if len(features.ByID) == 0 {
		t.Error("No features loaded")
	}
	t.Logf("Loaded %d features", len(features.ByID))

	// Check for expected features (some may fail to parse due to complex YAML)
	expectedFeatures := []string{"fd-001", "fd-004", "fd-005"}
	for _, id := range expectedFeatures {
		if _, ok := features.GetFeature(id); !ok {
			t.Errorf("Expected feature %s not found", id)
		}
	}

	// Check that ByValueModelPath index is populated
	if len(features.ByValueModelPath) == 0 {
		t.Error("ByValueModelPath index is empty")
	}
	t.Logf("Found %d unique value model paths contributed to", len(features.ByValueModelPath))

	// Log the paths for debugging
	for path, feats := range features.ByValueModelPath {
		ids := make([]string, len(feats))
		for i, f := range feats {
			ids[i] = f.ID
		}
		t.Logf("  %s: %v", path, ids)
	}
}

func TestRelationshipsValidationWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	result := analyzer.ValidateAll()

	t.Logf("Validation Results:")
	t.Logf("  Features checked: %d", result.Stats.TotalFeaturesChecked)
	t.Logf("  KRs checked: %d", result.Stats.TotalKRsChecked)
	t.Logf("  Paths checked: %d", result.Stats.TotalPathsChecked)
	t.Logf("  Valid: %d", result.Stats.ValidPaths)
	t.Logf("  Invalid: %d", result.Stats.InvalidPaths)

	if !result.Valid {
		t.Logf("Validation errors found:")
		for _, err := range result.Errors {
			t.Logf("  [%s] %s.%s: %s (path: %s)", err.Severity, err.Source, err.Field, err.Message, err.InvalidPath)
			if err.DidYouMean != "" {
				t.Logf("    Did you mean: %s", err.DidYouMean)
			}
		}
	}

	// This test is informational - we don't fail if validation errors exist
	// because the real instance may have intentional or acceptable deviations
}

func TestRelationshipsCoverageWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	// Analyze all coverage
	coverage := analyzer.AnalyzeCoverage("")

	t.Logf("Coverage Analysis:")
	t.Logf("  Total L2 components: %d", coverage.TotalL2Components)
	t.Logf("  Covered: %d", coverage.CoveredL2Components)
	t.Logf("  Coverage: %.1f%%", coverage.CoveragePercent)

	if len(coverage.UncoveredL2Components) > 0 {
		t.Logf("  Uncovered components (%d):", len(coverage.UncoveredL2Components))
		for _, path := range coverage.UncoveredL2Components {
			t.Logf("    - %s", path)
		}
	}

	// Coverage by track
	t.Logf("\nCoverage by Track:")
	for layer, layerCov := range coverage.ByLayer {
		t.Logf("  %s: %.1f%% (%d/%d)",
			layer, layerCov.CoveragePercent,
			layerCov.CoveredCount, layerCov.TotalComponents)
	}
}

func TestRelationshipsStrategicContextWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	// Get strategic context for fd-001 (Knowledge Graph Engine)
	context, err := analyzer.GetStrategicContext("fd-001")
	if err != nil {
		t.Fatalf("Failed to get strategic context: %v", err)
	}

	t.Logf("Strategic Context for %s (%s):", context.Feature.ID, context.Feature.Name)
	t.Logf("  Status: %s", context.Feature.Status)
	t.Logf("  Contributes to %d value model paths:", len(context.ContributesTo))
	for _, path := range context.ContributesTo {
		if path.IsValid {
			t.Logf("    ✓ %s -> %s", path.Path, path.CanonicalPath)
		} else {
			t.Logf("    ✗ %s: %s", path.Path, path.ErrorMsg)
		}
	}

	t.Logf("  Related KRs: %d", len(context.RelatedKRs))
	for _, kr := range context.RelatedKRs {
		t.Logf("    - %s", kr.KR.ID)
	}

	t.Logf("  Enables features: %d", len(context.EnablesFeatures))
	for _, f := range context.EnablesFeatures {
		t.Logf("    - %s: %s", f.ID, f.Name)
	}

	t.Logf("  Requires features: %d", len(context.RequiresFeatures))
	for _, f := range context.RequiresFeatures {
		t.Logf("    - %s: %s", f.ID, f.Name)
	}
}

func TestRelationshipsExplainPathWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	// Explain a specific path
	testPaths := []string{
		"Product.Discovery.KnowledgeExploration",
		"Product.Core.ConversationalAccess",
	}

	for _, path := range testPaths {
		explanation, err := analyzer.ExplainPath(path)
		if err != nil {
			t.Logf("Path %s: ERROR - %v", path, err)
			continue
		}

		t.Logf("\nPath: %s", path)
		t.Logf("  Canonical: %s", explanation.CanonicalPath)
		t.Logf("  Track: %s", explanation.Track)
		if explanation.Layer != nil {
			t.Logf("  Layer: %s (%s)", explanation.Layer.Name, explanation.Layer.ID)
		}
		if explanation.Component != nil {
			t.Logf("  Component: %s (%s)", explanation.Component.Name, explanation.Component.ID)
			if explanation.Component.Maturity != "" {
				t.Logf("    Maturity: %s", explanation.Component.Maturity)
			}
		}
		t.Logf("  Contributing features: %v", explanation.ContributingFeatures)
		t.Logf("  Targeting KRs: %v", explanation.TargetingKRs)
	}
}

func TestRelationshipsFindGapsWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	gaps := analyzer.FindCoverageGaps()

	t.Logf("Found %d coverage gaps:", len(gaps))

	// Group by priority
	var highPriority, lowPriority []relationships.CoverageGap
	for _, gap := range gaps {
		if gap.HasKRTarget {
			highPriority = append(highPriority, gap)
		} else {
			lowPriority = append(lowPriority, gap)
		}
	}

	t.Logf("\nHigh Priority (KR-targeted but no feature coverage): %d", len(highPriority))
	for _, gap := range highPriority {
		t.Logf("  - %s (KRs: %v)", gap.Path, gap.TargetingKRs)
	}

	t.Logf("\nLower Priority (no feature coverage): %d", len(lowPriority))
	for _, gap := range lowPriority {
		t.Logf("  - %s", gap.Path)
	}
}

func TestRelationshipsSummaryWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	analyzer := relationships.NewAnalyzer(instancePath)
	err := analyzer.Load()
	if err != nil {
		t.Fatalf("Failed to load analyzer: %v", err)
	}

	summary := analyzer.GetSummary()

	t.Log("\n" + summary.SummaryText())

	// Verify summary contains expected data
	if summary.TotalFeatures == 0 {
		t.Error("Summary shows 0 features")
	}

	if len(summary.TracksLoaded) == 0 {
		t.Error("Summary shows no tracks loaded")
	}

	if len(summary.CoverageByTrack) == 0 {
		t.Error("Summary shows no coverage data")
	}
}

func TestRelationshipsFeatureIndexWithEmergent(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Emergent instance not found")
	}

	loader := relationships.NewFeatureLoader(instancePath)
	features, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load features: %v", err)
	}

	index := relationships.NewFeatureIndex(features)

	// Test ByTrack lookup
	productFeatures := index.GetFeaturesInTrack("product")
	t.Logf("Features in product track: %d", len(productFeatures))

	// Test ByAssumption lookup
	asmFeatures := index.GetFeaturesTestingAssumption("asm-p-001")
	t.Logf("Features testing asm-p-001: %d", len(asmFeatures))

	// Test getting features that depend on fd-007 (auth)
	dependentFeatures := index.GetFeaturesDependingOn("fd-007")
	t.Logf("Features depending on fd-007: %d", len(dependentFeatures))
	for _, entry := range dependentFeatures {
		t.Logf("  - %s: %s", entry.Feature.ID, entry.Feature.Name)
	}

	// Test getting all paths that have features
	allPaths := features.GetAllValueModelPaths()
	t.Logf("\nAll value model paths with features: %d", len(allPaths))

	// Group by track
	byTrack := make(map[string]int)
	for _, path := range allPaths {
		parts := strings.Split(path, ".")
		if len(parts) > 0 {
			byTrack[parts[0]]++
		}
	}
	t.Logf("Paths by track:")
	for track, count := range byTrack {
		t.Logf("  %s: %d", track, count)
	}
}
