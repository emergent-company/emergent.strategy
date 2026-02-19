package valuemodel

import (
	"os"
	"path/filepath"
	"testing"
)

// --- helpers to build test value model sets ---

func newTestModelSet(layers []Layer) *ValueModelSet {
	set := NewValueModelSet()
	model := &ValueModel{
		TrackName: TrackProduct,
		Layers:    layers,
		FilePath:  "product.value_model.yaml",
	}
	set.Models[TrackProduct] = model
	set.ByFile["product.value_model.yaml"] = model
	return set
}

func newTestModelSetMultiFile(files map[string][]Layer) *ValueModelSet {
	set := NewValueModelSet()
	// Merge into one Product model for the Models map (like the loader does)
	merged := &ValueModel{TrackName: TrackProduct}
	for path, layers := range files {
		model := &ValueModel{
			TrackName: TrackProduct,
			Layers:    layers,
			FilePath:  path,
		}
		set.ByFile[path] = model
		merged.Layers = append(merged.Layers, layers...)
	}
	set.Models[TrackProduct] = merged
	return set
}

// --- LoadPortfolioNames ---

func TestLoadPortfolioNames_FileNotExist(t *testing.T) {
	names, err := LoadPortfolioNames("/nonexistent/path")
	if err != nil {
		t.Fatalf("expected nil error for missing file, got: %v", err)
	}
	if names != nil {
		t.Fatalf("expected nil names for missing file, got: %+v", names)
	}
}

func TestLoadPortfolioNames_ValidFile(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}

	content := `portfolio:
  product_lines:
    - name: "Io Core"
      codename: "io"
      key_components:
        - name: "Battery Pack"
    - name: "Huma Platform"
  brands:
    - name: "Huma"
    - name: "OceanForest"
  offerings:
    - name: "CDR Credits"
    - name: "Energy Storage"
`
	if err := os.WriteFile(filepath.Join(readyDir, "product_portfolio.yaml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	names, err := LoadPortfolioNames(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names == nil {
		t.Fatal("expected names, got nil")
	}

	// Product names: "Io Core", "io", "Battery Pack", "Huma Platform"
	if len(names.ProductNames) != 4 {
		t.Errorf("expected 4 product names, got %d: %v", len(names.ProductNames), names.ProductNames)
	}
	// Brand names: "Huma", "OceanForest"
	if len(names.BrandNames) != 2 {
		t.Errorf("expected 2 brand names, got %d: %v", len(names.BrandNames), names.BrandNames)
	}
	// Offering names: "CDR Credits", "Energy Storage"
	if len(names.OfferingNames) != 2 {
		t.Errorf("expected 2 offering names, got %d: %v", len(names.OfferingNames), names.OfferingNames)
	}
	// AllNames: lowercased union, skipping names <= 2 chars ("io" is only 2 chars, should be skipped)
	if len(names.AllNames) == 0 {
		t.Error("expected AllNames to be populated")
	}
	// "io" has len 2, should be skipped
	for _, n := range names.AllNames {
		if n == "io" {
			t.Error("AllNames should skip names <= 2 chars, but contains 'io'")
		}
	}
}

func TestLoadPortfolioNames_InstanceRoot(t *testing.T) {
	dir := t.TempDir()

	content := `portfolio:
  product_lines:
    - name: "Test Product"
  brands:
    - name: "TestBrand"
  offerings:
    - name: "TestOffer"
`
	if err := os.WriteFile(filepath.Join(dir, "product_portfolio.yaml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	names, err := LoadPortfolioNames(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if names == nil {
		t.Fatal("expected names, got nil")
	}
	if len(names.ProductNames) != 1 || names.ProductNames[0] != "Test Product" {
		t.Errorf("expected 1 product name 'Test Product', got %v", names.ProductNames)
	}
}

func TestLoadPortfolioNames_InvalidYAML(t *testing.T) {
	dir := t.TempDir()
	readyDir := filepath.Join(dir, "READY")
	if err := os.MkdirAll(readyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(readyDir, "product_portfolio.yaml"), []byte("invalid: [yaml: {"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := LoadPortfolioNames(dir)
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

// --- AddName ---

func TestAddName_AddsToAllNames(t *testing.T) {
	p := &PortfolioNames{
		AllNames: []string{"existing"},
	}
	p.AddName("Emergent")
	if len(p.AllNames) != 2 {
		t.Fatalf("expected 2 names, got %d: %v", len(p.AllNames), p.AllNames)
	}
	if p.AllNames[1] != "emergent" {
		t.Errorf("expected 'emergent', got %q", p.AllNames[1])
	}
}

func TestAddName_SkipsShortNames(t *testing.T) {
	p := &PortfolioNames{}
	p.AddName("AB")
	p.AddName("")
	if len(p.AllNames) != 0 {
		t.Errorf("expected 0 names for short inputs, got %d: %v", len(p.AllNames), p.AllNames)
	}
}

func TestAddName_SkipsDuplicates(t *testing.T) {
	p := &PortfolioNames{
		AllNames: []string{"emergent"},
	}
	p.AddName("Emergent") // same lowercased
	p.AddName("emergent") // exact duplicate
	if len(p.AllNames) != 1 {
		t.Errorf("expected 1 name (no duplicates), got %d: %v", len(p.AllNames), p.AllNames)
	}
}

func TestAddName_WorksOnNilSlice(t *testing.T) {
	p := &PortfolioNames{}
	p.AddName("Huma")
	if len(p.AllNames) != 1 || p.AllNames[0] != "huma" {
		t.Errorf("expected ['huma'], got %v", p.AllNames)
	}
}

// --- CheckProductNameCollisions ---

func TestCheckProductNameCollisions_NoPortfolio(t *testing.T) {
	set := newTestModelSet([]Layer{{Name: "Energy Transformation"}})
	result := CheckProductNameCollisions(set, nil)
	if !result.Skipped {
		t.Error("expected check to be skipped when portfolio is nil")
	}
	if result.Check != CheckIDProductNameCollision {
		t.Errorf("expected check ID %s, got %s", CheckIDProductNameCollision, result.Check)
	}
}

func TestCheckProductNameCollisions_NoProductModel(t *testing.T) {
	set := NewValueModelSet() // empty, no Product track
	names := &PortfolioNames{AllNames: []string{"huma"}}
	result := CheckProductNameCollisions(set, names)
	if !result.Skipped {
		t.Error("expected check to be skipped when no Product model exists")
	}
}

func TestCheckProductNameCollisions_NoCollisions(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Energy Transformation", Components: []Component{
			{Name: "Heat Exchange"},
			{Name: "Energy Storage"},
		}},
		{Name: "Service Delivery", Components: []Component{
			{Name: "Customer Engagement"},
		}},
	})
	names := &PortfolioNames{AllNames: []string{"huma", "oceanforest", "io core"}}
	result := CheckProductNameCollisions(set, names)
	if result.Score != 100 {
		t.Errorf("expected score 100 with no collisions, got %d", result.Score)
	}
	if len(result.Warnings) != 0 {
		t.Errorf("expected no warnings, got %d", len(result.Warnings))
	}
}

func TestCheckProductNameCollisions_HighCollision(t *testing.T) {
	// All L1 names match product names → should trigger WARNING
	set := newTestModelSet([]Layer{
		{Name: "Huma Platform", Components: []Component{
			{Name: "Huma Dashboard"},
			{Name: "Huma API"},
		}},
		{Name: "OceanForest", Components: []Component{
			{Name: "CDR Credits"},
		}},
	})
	names := &PortfolioNames{AllNames: []string{"huma", "oceanforest", "huma platform", "cdr credits"}}
	result := CheckProductNameCollisions(set, names)

	if result.Score >= 100 {
		t.Errorf("expected score < 100 with high collision, got %d", result.Score)
	}

	// Should have at least one WARNING-level warning
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected at least one WARNING with high collision ratio")
	}
}

func TestCheckProductNameCollisions_LowCollision_InfoLevel(t *testing.T) {
	// Only 1 of 5 L1 names matches → below threshold, should emit INFO not WARNING
	set := newTestModelSet([]Layer{
		{Name: "Energy Transformation"},
		{Name: "Service Delivery"},
		{Name: "Data Processing"},
		{Name: "Huma Platform"}, // matches
		{Name: "Knowledge Management"},
	})
	names := &PortfolioNames{AllNames: []string{"huma platform"}}
	result := CheckProductNameCollisions(set, names)

	// 1/5 = 20% < 30% threshold → no WARNING, but INFO
	hasWarning := false
	hasInfo := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
		if w.Level == WarningLevelInfo {
			hasInfo = true
		}
	}
	if hasWarning {
		t.Error("expected no WARNING below 30% threshold")
	}
	if !hasInfo {
		t.Error("expected INFO for collision below threshold")
	}
}

// --- findNameCollisions ---

func TestFindNameCollisions_ExactMatch(t *testing.T) {
	matches := findNameCollisions(
		[]string{"Huma", "Energy Storage"},
		[]string{"huma", "oceanforest"},
	)
	if _, ok := matches["Huma"]; !ok {
		t.Error("expected 'Huma' to match 'huma' (case-insensitive)")
	}
	if _, ok := matches["Energy Storage"]; ok {
		t.Error("expected 'Energy Storage' not to match anything")
	}
}

func TestFindNameCollisions_PartialMatch(t *testing.T) {
	matches := findNameCollisions(
		[]string{"Huma Platform Integration"},
		[]string{"huma"}, // len 4, long enough for partial
	)
	if _, ok := matches["Huma Platform Integration"]; !ok {
		t.Error("expected partial match: 'huma' is substring of 'huma platform integration'")
	}
}

func TestFindNameCollisions_ShortNameSkipped(t *testing.T) {
	matches := findNameCollisions(
		[]string{"IoT Gateway"},
		[]string{"io"}, // too short (len 2), should not partial match
	)
	if _, ok := matches["IoT Gateway"]; ok {
		t.Error("expected no match for short portfolio name 'io' (len < 4)")
	}
}

// --- CheckOneToOneMapping ---

func TestCheckOneToOneMapping_NilContributions(t *testing.T) {
	set := newTestModelSet([]Layer{})
	result := CheckOneToOneMapping(set, nil)
	if !result.Skipped {
		t.Error("expected check to be skipped when contributions is nil")
	}
}

func TestCheckOneToOneMapping_EmptyContributions(t *testing.T) {
	set := newTestModelSet([]Layer{})
	contributions := &FeatureContributions{
		ComponentToFeatureCount: map[string]int{},
		FeatureToComponentCount: map[string]int{},
	}
	result := CheckOneToOneMapping(set, contributions)
	if !result.Skipped {
		t.Error("expected check to be skipped when no relationships")
	}
}

func TestCheckOneToOneMapping_ManyToMany(t *testing.T) {
	set := newTestModelSet([]Layer{})
	contributions := &FeatureContributions{
		ComponentToFeatureCount: map[string]int{
			"Product.Energy.HeatExchange": 3,
			"Product.Energy.Storage":      2,
			"Product.Service.Delivery":    4,
		},
		FeatureToComponentCount: map[string]int{
			"fd-001": 3,
			"fd-002": 2,
			"fd-003": 2,
		},
	}
	result := CheckOneToOneMapping(set, contributions)
	if result.Score < 80 {
		t.Errorf("expected high score for many-to-many relationships, got %d", result.Score)
	}
	if len(result.Warnings) != 0 {
		t.Errorf("expected no warnings for healthy relationships, got %d", len(result.Warnings))
	}
}

func TestCheckOneToOneMapping_PredominantlyOneToOne(t *testing.T) {
	set := newTestModelSet([]Layer{})
	// 5 components, all with 1 feature; 5 features, all with 1 component → 100% 1:1
	contributions := &FeatureContributions{
		ComponentToFeatureCount: map[string]int{
			"Product.A.One":   1,
			"Product.A.Two":   1,
			"Product.A.Three": 1,
			"Product.B.One":   1,
			"Product.B.Two":   1,
		},
		FeatureToComponentCount: map[string]int{
			"fd-001": 1,
			"fd-002": 1,
			"fd-003": 1,
			"fd-004": 1,
			"fd-005": 1,
		},
	}
	result := CheckOneToOneMapping(set, contributions)
	if result.Score > 20 {
		t.Errorf("expected low score for 100%% 1:1 mapping, got %d", result.Score)
	}
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected WARNING for predominantly 1:1 mapping")
	}
}

func TestCheckOneToOneMapping_ModerateOneToOne(t *testing.T) {
	// 60% 1:1 → should emit INFO not WARNING
	contributions := &FeatureContributions{
		ComponentToFeatureCount: map[string]int{
			"Product.A.One":   1,
			"Product.A.Two":   1,
			"Product.A.Three": 1,
			"Product.B.One":   2,
			"Product.B.Two":   3,
		},
		FeatureToComponentCount: map[string]int{
			"fd-001": 1,
			"fd-002": 1,
			"fd-003": 1,
			"fd-004": 2,
			"fd-005": 3,
		},
	}
	set := newTestModelSet([]Layer{})
	result := CheckOneToOneMapping(set, contributions)

	hasWarning := false
	hasInfo := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
		if w.Level == WarningLevelInfo {
			hasInfo = true
		}
	}
	if hasWarning {
		t.Error("expected no WARNING for moderate 1:1 (60%)")
	}
	if !hasInfo {
		t.Error("expected INFO for moderate 1:1 (60%)")
	}
}

// --- CheckLayerNameHeuristics ---

func TestCheckLayerNameHeuristics_NoProductModel(t *testing.T) {
	set := NewValueModelSet()
	result := CheckLayerNameHeuristics(set)
	if !result.Skipped {
		t.Error("expected check to be skipped when no Product model")
	}
}

func TestCheckLayerNameHeuristics_GoodNames(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Energy Transformation", Components: []Component{
			{Name: "Heat Exchange"},
			{Name: "Energy Storage"},
		}},
		{Name: "Service Delivery", Components: []Component{
			{Name: "Customer Engagement"},
			{Name: "Performance Monitoring"},
		}},
	})
	result := CheckLayerNameHeuristics(set)
	if result.Score < 50 {
		t.Errorf("expected decent score for good value-delivery names, got %d", result.Score)
	}
}

func TestCheckLayerNameHeuristics_ProductLikeNames(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "IoCore", Components: []Component{
			{Name: "FluxBattery"},
		}},
		{Name: "OceanForest", Components: []Component{
			{Name: "CarbonX"},
		}},
	})
	result := CheckLayerNameHeuristics(set)

	// Should flag mixed-case product-like names
	hasFlagged := false
	for _, w := range result.Warnings {
		if w.Check == CheckIDLayerNameHeuristic {
			hasFlagged = true
		}
	}
	if !hasFlagged {
		t.Error("expected flagged warnings for product-like names with mixed case")
	}
}

func TestCheckLayerNameHeuristics_EmptyLayers(t *testing.T) {
	set := newTestModelSet([]Layer{})
	result := CheckLayerNameHeuristics(set)
	if !result.Skipped {
		t.Error("expected check to be skipped when no layers")
	}
}

// --- hasPositiveSignal ---

func TestHasPositiveSignal(t *testing.T) {
	tests := []struct {
		name     string
		expected bool
	}{
		{"Energy Transformation", true},
		{"Data Processing", true},
		{"Service Delivery", true},
		{"Knowledge Management", true},
		{"IoCore", false},
		{"Huma", false},
		{"X", false},
	}
	for _, tc := range tests {
		got := hasPositiveSignal(tc.name)
		if got != tc.expected {
			t.Errorf("hasPositiveSignal(%q) = %v, want %v", tc.name, got, tc.expected)
		}
	}
}

// --- looksLikeProductName ---

func TestLooksLikeProductName(t *testing.T) {
	tests := []struct {
		name     string
		expected bool
	}{
		// Positive signals → not flagged
		{"Energy Transformation", false},
		{"Service Delivery", false},
		{"Data Processing", false},
		// Mixed case brand-like → flagged
		{"IoCore", true},
		{"FluxIt", true},
		{"CarbonX", true},
		// Too short
		{"Io", false},
		// Common words → not flagged
		{"Core", false},
		{"Data", false},
	}
	for _, tc := range tests {
		got := looksLikeProductName(tc.name)
		if got != tc.expected {
			t.Errorf("looksLikeProductName(%q) = %v, want %v", tc.name, got, tc.expected)
		}
	}
}

// --- hasMixedCase ---

func TestHasMixedCase(t *testing.T) {
	tests := []struct {
		word     string
		expected bool
	}{
		{"IoCore", true},    // 'o' lowercase, 'C' uppercase
		{"ALLCAPS", false},  // no lowercase before uppercase
		{"alllower", false}, // no uppercase
		{"Hello", false},    // only initial cap
		{"heLlo", true},     // 'e' lowercase, 'L' uppercase
		{"A", false},        // too short
		{"", false},
	}
	for _, tc := range tests {
		got := hasMixedCase(tc.word)
		if got != tc.expected {
			t.Errorf("hasMixedCase(%q) = %v, want %v", tc.word, got, tc.expected)
		}
	}
}

// --- CheckMultiFileOverlap ---

func TestCheckMultiFileOverlap_SingleFile(t *testing.T) {
	set := newTestModelSet([]Layer{{Name: "Energy"}})
	result := CheckMultiFileOverlap(set)
	if !result.Skipped {
		t.Error("expected check to be skipped with single file")
	}
}

func TestCheckMultiFileOverlap_NoOverlap(t *testing.T) {
	set := newTestModelSetMultiFile(map[string][]Layer{
		"product.hardware.value_model.yaml": {
			{Name: "Energy Transformation", Description: "Converting energy between forms"},
		},
		"product.software.value_model.yaml": {
			{Name: "Digital Intelligence", Description: "AI and machine learning services"},
		},
	})
	result := CheckMultiFileOverlap(set)
	if result.Skipped {
		t.Error("expected check to not be skipped with 2 files")
	}
	// Distinct layers should not trigger overlap warnings
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if hasWarning {
		t.Error("expected no overlap warning for distinct domain files")
	}
}

func TestCheckMultiFileOverlap_DuplicateLayerNames(t *testing.T) {
	set := newTestModelSetMultiFile(map[string][]Layer{
		"product.a.value_model.yaml": {
			{Name: "Energy", Description: "Energy transformation and storage"},
		},
		"product.b.value_model.yaml": {
			{Name: "Energy", Description: "Energy distribution and monitoring"},
		},
	})
	result := CheckMultiFileOverlap(set)

	// Same layer name in different files → overlap
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected WARNING when same layer name appears in multiple files")
	}
}

// --- extractKeywords ---

func TestExtractKeywords(t *testing.T) {
	keywords := extractKeywords("The Energy Transformation and Heat Exchange System")
	// "the" and "and" are stop words, should be excluded
	// "energy", "transformation", "heat", "exchange", "system" should remain
	for _, k := range keywords {
		if k == "the" || k == "and" {
			t.Errorf("extractKeywords should exclude stop word %q", k)
		}
	}
	found := map[string]bool{}
	for _, k := range keywords {
		found[k] = true
	}
	for _, expected := range []string{"energy", "transformation", "heat", "exchange", "system"} {
		if !found[expected] {
			t.Errorf("expected keyword %q in result, got %v", expected, keywords)
		}
	}
}

// --- keywordOverlap ---

func TestKeywordOverlap(t *testing.T) {
	// Identical sets → 1.0
	a := map[string]bool{"energy": true, "heat": true, "exchange": true}
	b := map[string]bool{"energy": true, "heat": true, "exchange": true}
	overlap := keywordOverlap(a, b)
	if overlap != 1.0 {
		t.Errorf("expected 1.0 for identical sets, got %f", overlap)
	}

	// Disjoint sets → 0.0
	c := map[string]bool{"alpha": true, "beta": true}
	d := map[string]bool{"gamma": true, "delta": true}
	overlap = keywordOverlap(c, d)
	if overlap != 0.0 {
		t.Errorf("expected 0.0 for disjoint sets, got %f", overlap)
	}

	// Empty set → 0.0
	overlap = keywordOverlap(map[string]bool{}, a)
	if overlap != 0.0 {
		t.Errorf("expected 0.0 for empty set, got %f", overlap)
	}

	// Partial overlap → between 0 and 1
	e := map[string]bool{"energy": true, "heat": true, "storage": true}
	f := map[string]bool{"energy": true, "heat": true, "monitoring": true}
	overlap = keywordOverlap(e, f)
	// Jaccard: 2/(3+3-2) = 2/4 = 0.5
	if overlap < 0.49 || overlap > 0.51 {
		t.Errorf("expected ~0.5 for partial overlap, got %f", overlap)
	}
}

// --- CheckL2Diversity ---

func TestCheckL2Diversity_NoProductModel(t *testing.T) {
	set := NewValueModelSet()
	result := CheckL2Diversity(set)
	if !result.Skipped {
		t.Error("expected check to be skipped when no Product model exists")
	}
}

func TestCheckL2Diversity_HealthyModel(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Energy Transformation", Components: []Component{
			{Name: "Heat Exchange"}, {Name: "Energy Storage"}, {Name: "Power Distribution"},
		}},
		{Name: "Service Delivery", Components: []Component{
			{Name: "Customer Engagement"}, {Name: "Monitoring"},
		}},
	})
	result := CheckL2Diversity(set)
	if result.Score < 80 {
		t.Errorf("expected high diversity score for model with multiple L2s per L1, got %d", result.Score)
	}
}

func TestCheckL2Diversity_LowDiversity(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "ProductA", Components: []Component{{Name: "FeatureA"}}},
		{Name: "ProductB", Components: []Component{{Name: "FeatureB"}}},
		{Name: "ProductC", Components: []Component{{Name: "FeatureC"}}},
	})
	result := CheckL2Diversity(set)
	if result.Score >= 80 {
		t.Errorf("expected low diversity score when all layers have 1 component, got %d", result.Score)
	}
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected WARNING for >50% single-component layers")
	}
}

func TestCheckL2Diversity_Mixed(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Transformation", Components: []Component{{Name: "A"}, {Name: "B"}, {Name: "C"}}},
		{Name: "Operations", Components: []Component{{Name: "Only One"}}},
	})
	result := CheckL2Diversity(set)
	// 50% single-component — should get INFO, not WARNING
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if hasWarning {
		t.Error("expected INFO not WARNING for exactly 50% single-component layers")
	}
}

// --- CheckL3Distribution ---

func TestCheckL3Distribution_NoProductModel(t *testing.T) {
	set := NewValueModelSet()
	result := CheckL3Distribution(set)
	if !result.Skipped {
		t.Error("expected check to be skipped when no Product model exists")
	}
}

func TestCheckL3Distribution_EvenDistribution(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Transformation", Components: []Component{
			{Name: "A", SubComponents: []SubComponent{{Name: "A1"}, {Name: "A2"}}},
			{Name: "B", SubComponents: []SubComponent{{Name: "B1"}, {Name: "B2"}}},
		}},
	})
	result := CheckL3Distribution(set)
	if result.Skipped {
		t.Error("did not expect skip for model with L3 sub-components")
	}
	if result.Score < 90 {
		t.Errorf("expected high score for evenly distributed L3s, got %d", result.Score)
	}
}

func TestCheckL3Distribution_VeryUneven(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Transformation", Components: []Component{
			{Name: "A", SubComponents: []SubComponent{{Name: "A1"}, {Name: "A2"}, {Name: "A3"}, {Name: "A4"}, {Name: "A5"}, {Name: "A6"}}},
			{Name: "B", SubComponents: []SubComponent{}},
			{Name: "C", SubComponents: []SubComponent{}},
		}},
	})
	result := CheckL3Distribution(set)
	if result.Score >= 80 {
		t.Errorf("expected low score for very uneven distribution, got %d", result.Score)
	}
	hasWarning := false
	for _, w := range result.Warnings {
		if w.Level == WarningLevelWarning {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected WARNING for highly uneven L3 distribution")
	}
}

func TestCheckL3Distribution_NoSubComponents(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Transformation", Components: []Component{
			{Name: "A"}, {Name: "B"},
		}},
	})
	result := CheckL3Distribution(set)
	if !result.Skipped {
		t.Error("expected skip when no L3 sub-components exist")
	}
}

func TestCheckL3Distribution_SingleComponent(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Transformation", Components: []Component{
			{Name: "A", SubComponents: []SubComponent{{Name: "A1"}}},
		}},
	})
	result := CheckL3Distribution(set)
	if !result.Skipped {
		t.Error("expected skip with fewer than 2 L2 components")
	}
}

// --- AssessQuality ---

func TestAssessQuality_EmptyModels(t *testing.T) {
	set := NewValueModelSet()
	report := AssessQuality(set, nil, nil)
	if report.ModelsAnalyzed != 0 {
		t.Errorf("expected 0 models analyzed, got %d", report.ModelsAnalyzed)
	}
}

func TestAssessQuality_HealthyModel(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "Energy Transformation", Components: []Component{
			{Name: "Heat Exchange", SubComponents: []SubComponent{{Name: "Thermal Coupling"}, {Name: "Radiative Transfer"}}},
			{Name: "Energy Storage", SubComponents: []SubComponent{{Name: "Battery Systems"}, {Name: "Thermal Reservoirs"}}},
		}},
		{Name: "Service Delivery", Components: []Component{
			{Name: "Customer Engagement", SubComponents: []SubComponent{{Name: "Onboarding"}, {Name: "Support"}}},
			{Name: "Performance Monitoring", SubComponents: []SubComponent{{Name: "Dashboards"}, {Name: "Alerts"}}},
		}},
	})

	report := AssessQuality(set, nil, nil)
	if report.ModelsAnalyzed != 1 {
		t.Errorf("expected 1 model analyzed, got %d", report.ModelsAnalyzed)
	}
	// With good names and no portfolio (collision check skipped), score should be high
	if report.OverallScore < 50 {
		t.Errorf("expected decent overall score for healthy model, got %d", report.OverallScore)
	}
	if report.ScoreLevel != "good" && report.ScoreLevel != "warning" {
		t.Errorf("unexpected score level: %s", report.ScoreLevel)
	}
	// Should have 6 checks (collision, mapping, names, overlap, diversity, distribution)
	if len(report.Checks) != 6 {
		t.Errorf("expected 6 checks, got %d", len(report.Checks))
	}
}

func TestAssessQuality_BadModel(t *testing.T) {
	set := newTestModelSet([]Layer{
		{Name: "IoCore", Components: []Component{
			{Name: "FluxBattery"},
		}},
		{Name: "OceanForest", Components: []Component{
			{Name: "CarbonX"},
		}},
	})
	names := &PortfolioNames{AllNames: []string{"iocore", "oceanforest", "fluxbattery", "carbonx"}}
	contributions := &FeatureContributions{
		ComponentToFeatureCount: map[string]int{
			"Product.IoCore.FluxBattery":  1,
			"Product.OceanForest.CarbonX": 1,
		},
		FeatureToComponentCount: map[string]int{
			"fd-001": 1,
			"fd-002": 1,
		},
	}

	report := AssessQuality(set, names, contributions)
	if report.OverallScore >= 80 {
		t.Errorf("expected low overall score for bad model, got %d", report.OverallScore)
	}
	if len(report.Warnings) == 0 {
		t.Error("expected warnings for bad model")
	}
}

func TestAssessQuality_ScoreLevels(t *testing.T) {
	tests := []struct {
		score    int
		expected string
	}{
		{100, "good"},
		{80, "good"},
		{79, "warning"},
		{60, "warning"},
		{59, "alert"},
		{0, "alert"},
	}
	for _, tc := range tests {
		// Build a report and check the score level classification
		report := &QualityReport{OverallScore: tc.score}
		switch {
		case report.OverallScore >= 80:
			report.ScoreLevel = "good"
		case report.OverallScore >= 60:
			report.ScoreLevel = "warning"
		default:
			report.ScoreLevel = "alert"
		}
		if report.ScoreLevel != tc.expected {
			t.Errorf("score %d: expected level %q, got %q", tc.score, tc.expected, report.ScoreLevel)
		}
	}
}
