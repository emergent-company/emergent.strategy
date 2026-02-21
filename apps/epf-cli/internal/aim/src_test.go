package aim

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

// =============================================================================
// SRC GENERATE TESTS
// =============================================================================

func TestGenerateSRC_MinimalInstance(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "value_models"), 0755)

	src, err := GenerateSRC(dir, 1)
	if err != nil {
		t.Fatalf("GenerateSRC failed: %v", err)
	}

	if src.Cycle != 1 {
		t.Errorf("Cycle = %d, want 1", src.Cycle)
	}
	if src.AssessmentDate == "" {
		t.Error("AssessmentDate should not be empty")
	}
	if src.Summary.OverallHealth == "" {
		t.Error("OverallHealth should not be empty")
	}
	if src.Meta.EPFVersion == "" {
		t.Error("Meta.EPFVersion should not be empty")
	}

	// Minimal instance should produce healthy or attention_needed
	// (no artifacts to check = no findings)
	if src.Summary.OverallHealth != "healthy" {
		t.Errorf("OverallHealth = %s, want healthy for empty instance", src.Summary.OverallHealth)
	}
}

func TestCheckMarketCurrency_StaleDateDetected(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	// Write north star with stale last_reviewed (600 days ago, >1.5x cadence = critical)
	staleDate := time.Now().AddDate(0, 0, -600).Format("2006-01-02")
	ns := map[string]interface{}{
		"last_reviewed": staleDate,
	}
	data, _ := yaml.Marshal(ns)
	os.WriteFile(filepath.Join(dir, "READY", "00_north_star.yaml"), data, 0644)

	findings := checkMarketCurrency(dir, time.Now())

	if len(findings) == 0 {
		t.Fatal("Expected at least one finding for stale north star")
	}

	f := findings[0]
	if f.StalenessLevel != "critical" {
		t.Errorf("StalenessLevel = %s, want critical (600 days on 365-day cadence)", f.StalenessLevel)
	}
	if f.DaysSinceReview < 590 {
		t.Errorf("DaysSinceReview = %d, want ~600", f.DaysSinceReview)
	}
	if !strings.HasPrefix(f.ID, "src-mc-") {
		t.Errorf("ID = %s, want prefix src-mc-", f.ID)
	}
}

func TestCheckMarketCurrency_FutureDateClampedToZero(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	// Write insight analyses with future next_review_date
	futureDate := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	ia := map[string]interface{}{
		"next_review_date": futureDate,
	}
	data, _ := yaml.Marshal(ia)
	os.WriteFile(filepath.Join(dir, "READY", "01_insight_analyses.yaml"), data, 0644)

	findings := checkMarketCurrency(dir, time.Now())

	// Should produce a finding but with days_since_review = 0
	for _, f := range findings {
		if f.SourceArtifact == "READY/01_insight_analyses.yaml" {
			if f.DaysSinceReview < 0 {
				t.Errorf("DaysSinceReview = %d, want >= 0 (future date should clamp to 0)", f.DaysSinceReview)
			}
			return
		}
	}
	// If future date means "low" staleness, it might be filtered
	// That's acceptable — just verify no negative values exist
	for _, f := range findings {
		if f.DaysSinceReview < 0 {
			t.Errorf("Found negative DaysSinceReview = %d in %s", f.DaysSinceReview, f.ID)
		}
	}
}

func TestCheckMarketCurrency_MissingReviewDateIsFinding(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	// Write north star without last_reviewed field
	ns := map[string]interface{}{
		"vision": "Test vision",
	}
	data, _ := yaml.Marshal(ns)
	os.WriteFile(filepath.Join(dir, "READY", "00_north_star.yaml"), data, 0644)

	findings := checkMarketCurrency(dir, time.Now())

	found := false
	for _, f := range findings {
		if f.SourceArtifact == "READY/00_north_star.yaml" && f.FieldPath == "last_reviewed" {
			found = true
			if f.StalenessLevel != "medium" {
				t.Errorf("StalenessLevel = %s, want medium for missing review date", f.StalenessLevel)
			}
			if f.DaysSinceReview != 0 {
				t.Errorf("DaysSinceReview = %d, want 0 for missing review date", f.DaysSinceReview)
			}
		}
	}
	if !found {
		t.Error("Expected finding for missing last_reviewed field")
	}
}

func TestCheckStrategicAlignment_BrokenContributesToPath(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "value_models"), 0755)

	// Write a value model with known paths (using proper track_name structure)
	vm := map[string]interface{}{
		"track_name": "Product",
		"layers": []interface{}{
			map[string]interface{}{
				"name": "Core",
				"components": []interface{}{
					map[string]interface{}{
						"name": "Search",
						"sub_components": []interface{}{
							map[string]interface{}{"name": "Indexing"},
						},
					},
				},
			},
		},
	}
	vmData, _ := yaml.Marshal(vm)
	os.WriteFile(filepath.Join(dir, "FIRE", "value_models", "product_value_model.yaml"), vmData, 0644)

	// Write feature with broken path
	fd := map[string]interface{}{
		"id":     "fd-001",
		"slug":   "test-feature",
		"status": "draft",
		"strategic_context": map[string]interface{}{
			"contributes_to": []interface{}{
				"Product.Core.Nonexistent", // broken path
				"Product.Core.Search",      // valid path
			},
		},
	}
	fdData, _ := yaml.Marshal(fd)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001-test.yaml"), fdData, 0644)

	findings := checkStrategicAlignment(dir)

	brokenCount := 0
	for _, f := range findings {
		if f.Status == "broken" && f.CheckType == "value_model_path" {
			brokenCount++
			if !strings.Contains(f.Details, "Nonexistent") {
				t.Errorf("Expected broken path details to mention 'Nonexistent', got: %s", f.Details)
			}
		}
	}
	if brokenCount != 1 {
		t.Errorf("Expected 1 broken value_model_path finding, got %d", brokenCount)
	}
}

func TestCheckStrategicAlignment_BrokenFeatureDependency(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "value_models"), 0755)

	// Write two features, one with a broken dependency
	fd1 := map[string]interface{}{
		"id":   "fd-001",
		"slug": "feature-a",
	}
	fd2 := map[string]interface{}{
		"id":   "fd-002",
		"slug": "feature-b",
		"dependencies": []interface{}{
			map[string]interface{}{"feature_id": "fd-001"},         // valid
			map[string]interface{}{"feature_id": "fd-999-missing"}, // broken
		},
	}

	fd1Data, _ := yaml.Marshal(fd1)
	fd2Data, _ := yaml.Marshal(fd2)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001.yaml"), fd1Data, 0644)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-002.yaml"), fd2Data, 0644)

	findings := checkStrategicAlignment(dir)

	brokenDeps := 0
	for _, f := range findings {
		if f.CheckType == "feature_dependency" && f.Status == "broken" {
			brokenDeps++
		}
	}
	if brokenDeps != 1 {
		t.Errorf("Expected 1 broken feature_dependency, got %d", brokenDeps)
	}
}

func TestCheckExecutionReality_DeliveredButHypothetical(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	fd := map[string]interface{}{
		"id":     "fd-001",
		"status": "delivered",
		"feature_maturity": map[string]interface{}{
			"overall_stage": "hypothetical",
		},
	}
	data, _ := yaml.Marshal(fd)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001.yaml"), data, 0644)

	findings := checkExecutionReality(dir)

	found := false
	for _, f := range findings {
		if f.FieldPath == "feature_maturity.overall_stage" {
			found = true
			if f.Severity != "warning" {
				t.Errorf("Severity = %s, want warning", f.Severity)
			}
			if !strings.Contains(f.GapDescription, "delivered") {
				t.Errorf("GapDescription should mention 'delivered', got: %s", f.GapDescription)
			}
		}
	}
	if !found {
		t.Error("Expected finding for delivered status with hypothetical maturity")
	}
}

func TestCheckExecutionReality_InProgressNoImplRefs(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	fd := map[string]interface{}{
		"id":     "fd-001",
		"status": "in-progress",
		// no implementation_references
	}
	data, _ := yaml.Marshal(fd)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001.yaml"), data, 0644)

	findings := checkExecutionReality(dir)

	found := false
	for _, f := range findings {
		if f.FieldPath == "implementation_references" {
			found = true
			if f.Severity != "info" {
				t.Errorf("Severity = %s, want info for in-progress without impl refs", f.Severity)
			}
		}
	}
	if !found {
		t.Error("Expected finding for in-progress without implementation references")
	}
}

func TestCheckExecutionReality_DeliveredNoImplRefsIsWarning(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)

	fd := map[string]interface{}{
		"id":     "fd-001",
		"status": "delivered",
		"feature_maturity": map[string]interface{}{
			"overall_stage": "proven",
		},
	}
	data, _ := yaml.Marshal(fd)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001.yaml"), data, 0644)

	findings := checkExecutionReality(dir)

	for _, f := range findings {
		if f.FieldPath == "implementation_references" {
			if f.Severity != "warning" {
				t.Errorf("Severity = %s, want warning for delivered without impl refs", f.Severity)
			}
			return
		}
	}
	t.Error("Expected warning finding for delivered without implementation references")
}

func TestGenerateBeliefPlaceholders_NorthStarBeliefChallenges(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)

	ns := map[string]interface{}{
		"belief_challenges": []interface{}{
			map[string]interface{}{
				"challenge": "AI will become the primary interface for knowledge work",
			},
			map[string]interface{}{
				"challenge": "Users prefer structured data over unstructured notes",
			},
		},
	}
	data, _ := yaml.Marshal(ns)
	os.WriteFile(filepath.Join(dir, "READY", "00_north_star.yaml"), data, 0644)

	findings := generateBeliefPlaceholders(dir)

	if len(findings) != 2 {
		t.Fatalf("Expected 2 belief findings, got %d", len(findings))
	}

	if findings[0].Signal != "holding" {
		t.Errorf("Signal = %s, want holding (placeholder default)", findings[0].Signal)
	}
	if !strings.Contains(findings[0].CurrentEvidence, "TODO") {
		t.Errorf("CurrentEvidence should contain TODO, got: %s", findings[0].CurrentEvidence)
	}
	if findings[0].SourceArtifact != "READY/00_north_star.yaml" {
		t.Errorf("SourceArtifact = %s, want READY/00_north_star.yaml", findings[0].SourceArtifact)
	}
}

func TestGenerateBeliefPlaceholders_StrategyFormulaRisks(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)

	sf := map[string]interface{}{
		"risks": []interface{}{
			map[string]interface{}{
				"risk": "Market may shift to open-source alternatives",
			},
		},
	}
	data, _ := yaml.Marshal(sf)
	os.WriteFile(filepath.Join(dir, "READY", "04_strategy_formula.yaml"), data, 0644)

	findings := generateBeliefPlaceholders(dir)

	if len(findings) != 1 {
		t.Fatalf("Expected 1 risk finding, got %d", len(findings))
	}
	if findings[0].SourceArtifact != "READY/04_strategy_formula.yaml" {
		t.Errorf("SourceArtifact = %s, want READY/04_strategy_formula.yaml", findings[0].SourceArtifact)
	}
}

func TestBuildRecalibrationPlan_CriticalMarketCurrency(t *testing.T) {
	mc := []MarketCurrencyFinding{
		{ID: "src-mc-001", SourceArtifact: "READY/00_north_star.yaml", StalenessLevel: "critical", DaysSinceReview: 500},
		{ID: "src-mc-002", SourceArtifact: "READY/01_insight_analyses.yaml", StalenessLevel: "low", DaysSinceReview: 30},
	}

	plan := buildRecalibrationPlan(mc, nil, nil)

	// Only critical/high should generate actions
	if len(plan) != 1 {
		t.Fatalf("Expected 1 action for critical finding, got %d", len(plan))
	}
	if plan[0].Priority != "high" {
		t.Errorf("Priority = %s, want high for critical staleness", plan[0].Priority)
	}
	if plan[0].Action != "update" {
		t.Errorf("Action = %s, want update for critical staleness", plan[0].Action)
	}
	if len(plan[0].LinkedFindings) != 1 || plan[0].LinkedFindings[0] != "src-mc-001" {
		t.Errorf("LinkedFindings = %v, want [src-mc-001]", plan[0].LinkedFindings)
	}
}

func TestBuildRecalibrationPlan_BrokenAlignment(t *testing.T) {
	sa := []AlignmentFinding{
		{ID: "src-sa-001", CheckType: "value_model_path", SourceArtifact: "FIRE/definitions/product/fd-001.yaml", Status: "broken"},
		{ID: "src-sa-002", CheckType: "value_model_path", SourceArtifact: "FIRE/definitions/product/fd-002.yaml", Status: "valid"},
	}

	plan := buildRecalibrationPlan(nil, sa, nil)

	// Only broken should generate actions
	if len(plan) != 1 {
		t.Fatalf("Expected 1 action for broken alignment, got %d", len(plan))
	}
	if plan[0].Priority != "high" {
		t.Errorf("Priority = %s, want high for broken alignment", plan[0].Priority)
	}
}

func TestCalculateSummary_Healthy(t *testing.T) {
	src := &StrategicRealityCheck{
		MarketCurrency:     []MarketCurrencyFinding{{StalenessLevel: "low"}},
		StrategicAlignment: []AlignmentFinding{{Status: "valid"}},
		ExecutionReality:   []ExecutionRealityFinding{{Severity: "info"}},
	}

	summary := calculateSummary(src, time.Now())
	if summary.OverallHealth != "healthy" {
		t.Errorf("OverallHealth = %s, want healthy", summary.OverallHealth)
	}
}

func TestCalculateSummary_AtRisk(t *testing.T) {
	src := &StrategicRealityCheck{
		StrategicAlignment: make([]AlignmentFinding, 0),
		ExecutionReality:   make([]ExecutionRealityFinding, 0),
	}
	// Add 7 broken alignment findings (>= 6 non-info = at_risk)
	for i := 0; i < 7; i++ {
		src.StrategicAlignment = append(src.StrategicAlignment, AlignmentFinding{
			Status: "broken",
		})
	}

	summary := calculateSummary(src, time.Now())
	if summary.OverallHealth != "at_risk" {
		t.Errorf("OverallHealth = %s, want at_risk", summary.OverallHealth)
	}
}

func TestCalculateSummary_Critical(t *testing.T) {
	src := &StrategicRealityCheck{
		StrategicAlignment: make([]AlignmentFinding, 0),
		ExecutionReality:   make([]ExecutionRealityFinding, 0),
		RecalibrationPlan: []RecalibrationAction{
			{Priority: "critical"},
			{Priority: "critical"},
		},
	}

	summary := calculateSummary(src, time.Now())
	if summary.OverallHealth != "critical" {
		t.Errorf("OverallHealth = %s, want critical (2+ critical plan actions)", summary.OverallHealth)
	}
}

func TestCalculateSummary_CountsCorrect(t *testing.T) {
	src := &StrategicRealityCheck{
		BeliefValidity:     make([]BeliefValidityFinding, 3),
		MarketCurrency:     make([]MarketCurrencyFinding, 2),
		StrategicAlignment: make([]AlignmentFinding, 5),
		ExecutionReality:   make([]ExecutionRealityFinding, 1),
		RecalibrationPlan:  make([]RecalibrationAction, 4),
	}

	summary := calculateSummary(src, time.Now())
	if summary.FindingCounts.BeliefValidity != 3 {
		t.Errorf("BeliefValidity count = %d, want 3", summary.FindingCounts.BeliefValidity)
	}
	if summary.FindingCounts.MarketCurrency != 2 {
		t.Errorf("MarketCurrency count = %d, want 2", summary.FindingCounts.MarketCurrency)
	}
	if summary.FindingCounts.StrategicAlignment != 5 {
		t.Errorf("StrategicAlignment count = %d, want 5", summary.FindingCounts.StrategicAlignment)
	}
	if summary.FindingCounts.RecalibrationActions != 4 {
		t.Errorf("RecalibrationActions count = %d, want 4", summary.FindingCounts.RecalibrationActions)
	}
}

// =============================================================================
// WRITE SRC TESTS
// =============================================================================

func TestWriteStrategicRealityCheck(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)

	src := &StrategicRealityCheck{
		Cycle:          1,
		AssessmentDate: "2026-01-15",
		Summary: SRCSummary{
			OverallHealth: "healthy",
			FindingCounts: &FindingCounts{
				BeliefValidity:     0,
				MarketCurrency:     1,
				StrategicAlignment: 2,
			},
			GeneratedAt: time.Now().Format(time.RFC3339),
		},
		MarketCurrency: []MarketCurrencyFinding{
			{
				ID:              "src-mc-001",
				SourceArtifact:  "READY/00_north_star.yaml",
				StalenessLevel:  "low",
				DaysSinceReview: 30,
			},
		},
	}

	outPath, err := WriteStrategicRealityCheck(dir, src)
	if err != nil {
		t.Fatalf("WriteStrategicRealityCheck failed: %v", err)
	}

	// Verify file was written
	if _, err := os.Stat(outPath); os.IsNotExist(err) {
		t.Fatal("strategic_reality_check.yaml was not written")
	}

	// Verify content is valid YAML
	written, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}

	var result StrategicRealityCheck
	if err := yaml.Unmarshal(written, &result); err != nil {
		t.Fatalf("unmarshal written file: %v", err)
	}

	if result.Cycle != 1 {
		t.Errorf("Cycle = %d, want 1", result.Cycle)
	}
	if result.Summary.OverallHealth != "healthy" {
		t.Errorf("OverallHealth = %s, want healthy", result.Summary.OverallHealth)
	}
}

// =============================================================================
// HELPER TESTS
// =============================================================================

func TestClassifyStaleness(t *testing.T) {
	tests := []struct {
		days    int
		cadence int
		want    string
	}{
		{0, 365, "low"},
		{100, 365, "low"},
		{250, 365, "low"},      // 0.68 ratio
		{260, 365, "medium"},   // 0.71 ratio
		{350, 365, "medium"},   // 0.96 ratio
		{365, 365, "high"},     // 1.0 ratio
		{500, 365, "high"},     // 1.37 ratio
		{550, 365, "critical"}, // 1.51 ratio
		{0, 90, "low"},
		{80, 90, "medium"},    // 0.89 ratio
		{100, 90, "high"},     // 1.11 ratio
		{140, 90, "critical"}, // 1.56 ratio
	}

	for _, tt := range tests {
		got := classifyStaleness(tt.days, tt.cadence)
		if got != tt.want {
			t.Errorf("classifyStaleness(%d, %d) = %s, want %s", tt.days, tt.cadence, got, tt.want)
		}
	}
}

func TestFindDateField_Direct(t *testing.T) {
	data := map[string]interface{}{
		"last_reviewed": "2025-06-15",
	}
	got := findDateField(data, "last_reviewed")
	if got != "2025-06-15" {
		t.Errorf("findDateField = %s, want 2025-06-15", got)
	}
}

func TestFindDateField_InMeta(t *testing.T) {
	data := map[string]interface{}{
		"meta": map[string]interface{}{
			"last_updated": "2025-08-01",
		},
	}
	got := findDateField(data, "last_updated")
	if got != "2025-08-01" {
		t.Errorf("findDateField = %s, want 2025-08-01", got)
	}
}

func TestFindDateField_Missing(t *testing.T) {
	data := map[string]interface{}{
		"vision": "test",
	}
	got := findDateField(data, "last_reviewed")
	if got != "" {
		t.Errorf("findDateField = %s, want empty string", got)
	}
}

func TestParseDate(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{"2025-06-15", true},
		{"2025-06-15T10:30:00Z", true},
		{"2025-06-15T10:30:00+02:00", true},
		{"not-a-date", false},
		{"", false},
	}

	for _, tt := range tests {
		_, err := parseDate(tt.input)
		if (err == nil) != tt.valid {
			t.Errorf("parseDate(%q) valid=%v, want %v", tt.input, err == nil, tt.valid)
		}
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("short", 10); got != "short" {
		t.Errorf("truncate = %s, want short", got)
	}
	if got := truncate("this is a very long string", 10); len(got) != 10 {
		t.Errorf("truncate length = %d, want 10", len(got))
	}
	if got := truncate("this is a very long string", 10); !strings.HasSuffix(got, "...") {
		t.Errorf("truncated string should end with ..., got: %s", got)
	}
}

func TestSuggestSimilarPath(t *testing.T) {
	paths := []string{"Product.Core.Search", "Product.Discovery.KnowledgeExploration"}

	got := suggestSimilarPath("Strategy.Core.Search", paths)
	if !strings.Contains(got, "Product.Core.Search") {
		t.Errorf("suggestSimilarPath should suggest Product.Core.Search, got: %s", got)
	}

	got = suggestSimilarPath("Strategy.Core.Nothing", paths)
	if got != "" {
		t.Errorf("suggestSimilarPath should return empty for no match, got: %s", got)
	}
}

// =============================================================================
// INTEGRATION: GenerateSRC on test fixture
// =============================================================================

func TestGenerateSRC_WithFixtures(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "definitions", "product"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "value_models"), 0755)

	// Write stale north star (200 days ago)
	staleDate := time.Now().AddDate(0, 0, -200).Format("2006-01-02")
	ns := map[string]interface{}{
		"last_reviewed": staleDate,
		"belief_challenges": []interface{}{
			map[string]interface{}{
				"challenge": "AI will become the primary interface",
			},
		},
	}
	nsData, _ := yaml.Marshal(ns)
	os.WriteFile(filepath.Join(dir, "READY", "00_north_star.yaml"), nsData, 0644)

	// Write value model (with proper track_name structure)
	vm := map[string]interface{}{
		"track_name": "Product",
		"layers": []interface{}{
			map[string]interface{}{
				"name": "Core",
				"components": []interface{}{
					map[string]interface{}{
						"name": "Search",
					},
				},
			},
		},
	}
	vmData, _ := yaml.Marshal(vm)
	os.WriteFile(filepath.Join(dir, "FIRE", "value_models", "product.yaml"), vmData, 0644)

	// Write feature with broken contributes_to
	fd := map[string]interface{}{
		"id":     "fd-001",
		"slug":   "test-feature",
		"status": "delivered",
		"feature_maturity": map[string]interface{}{
			"overall_stage": "hypothetical",
		},
		"strategic_context": map[string]interface{}{
			"contributes_to": []interface{}{
				"Product.Core.Nonexistent",
			},
		},
	}
	fdData, _ := yaml.Marshal(fd)
	os.WriteFile(filepath.Join(dir, "FIRE", "definitions", "product", "fd-001.yaml"), fdData, 0644)

	src, err := GenerateSRC(dir, 1)
	if err != nil {
		t.Fatalf("GenerateSRC failed: %v", err)
	}

	// Should have findings across multiple sections
	if len(src.MarketCurrency) == 0 {
		t.Error("Expected market_currency findings")
	}
	if len(src.StrategicAlignment) == 0 {
		t.Error("Expected strategic_alignment findings")
	}
	if len(src.ExecutionReality) == 0 {
		t.Error("Expected execution_reality findings")
	}
	if len(src.BeliefValidity) == 0 {
		t.Error("Expected belief_validity findings")
	}
	if len(src.RecalibrationPlan) == 0 {
		t.Error("Expected recalibration_plan actions")
	}

	// All finding IDs should be unique
	ids := make(map[string]bool)
	for _, f := range src.BeliefValidity {
		if ids[f.ID] {
			t.Errorf("Duplicate ID: %s", f.ID)
		}
		ids[f.ID] = true
	}
	for _, f := range src.MarketCurrency {
		if ids[f.ID] {
			t.Errorf("Duplicate ID: %s", f.ID)
		}
		ids[f.ID] = true
	}
	for _, f := range src.StrategicAlignment {
		if ids[f.ID] {
			t.Errorf("Duplicate ID: %s", f.ID)
		}
		ids[f.ID] = true
	}
	for _, f := range src.ExecutionReality {
		if ids[f.ID] {
			t.Errorf("Duplicate ID: %s", f.ID)
		}
		ids[f.ID] = true
	}
	for _, a := range src.RecalibrationPlan {
		if ids[a.ID] {
			t.Errorf("Duplicate action ID: %s", a.ID)
		}
		ids[a.ID] = true
	}

	// All recalibration plan linked_findings should reference valid finding IDs
	findingIDs := make(map[string]bool)
	for _, f := range src.BeliefValidity {
		findingIDs[f.ID] = true
	}
	for _, f := range src.MarketCurrency {
		findingIDs[f.ID] = true
	}
	for _, f := range src.StrategicAlignment {
		findingIDs[f.ID] = true
	}
	for _, f := range src.ExecutionReality {
		findingIDs[f.ID] = true
	}
	for _, a := range src.RecalibrationPlan {
		for _, linked := range a.LinkedFindings {
			if !findingIDs[linked] {
				t.Errorf("RecalibrationAction %s linked_finding %s not found in findings", a.ID, linked)
			}
		}
	}

	// Summary counts should match actual finding counts
	if src.Summary.FindingCounts.BeliefValidity != len(src.BeliefValidity) {
		t.Errorf("Summary BeliefValidity count = %d, actual = %d",
			src.Summary.FindingCounts.BeliefValidity, len(src.BeliefValidity))
	}
	if src.Summary.FindingCounts.RecalibrationActions != len(src.RecalibrationPlan) {
		t.Errorf("Summary RecalibrationActions count = %d, actual = %d",
			src.Summary.FindingCounts.RecalibrationActions, len(src.RecalibrationPlan))
	}

	// No negative days_since_review
	for _, f := range src.MarketCurrency {
		if f.DaysSinceReview < 0 {
			t.Errorf("Negative DaysSinceReview in %s: %d", f.ID, f.DaysSinceReview)
		}
	}

	// ID patterns should match schema
	for _, f := range src.BeliefValidity {
		if !strings.HasPrefix(f.ID, "src-") {
			t.Errorf("BeliefValidity ID %s doesn't match pattern ^src-", f.ID)
		}
	}
	for _, a := range src.RecalibrationPlan {
		if !strings.HasPrefix(a.ID, "rp-") {
			t.Errorf("RecalibrationPlan ID %s doesn't match pattern ^rp-", a.ID)
		}
	}

	fmt.Printf("GenerateSRC fixture test: bv=%d, mc=%d, sa=%d, er=%d, rp=%d, health=%s\n",
		len(src.BeliefValidity), len(src.MarketCurrency), len(src.StrategicAlignment),
		len(src.ExecutionReality), len(src.RecalibrationPlan), src.Summary.OverallHealth)
}
