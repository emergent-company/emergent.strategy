package aim

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// RECALIBRATION CHANGESET TESTS
// =============================================================================

func TestGenerateChangeset_RequiresMemoOrSRC(t *testing.T) {
	_, err := GenerateRecalibrationChangeset(".", nil, nil)
	if err == nil {
		t.Fatal("Expected error when both memo and SRC are nil")
	}
}

func TestGenerateChangeset_MemoOnlyPersevere(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:      1,
		Decision:   "persevere",
		Confidence: "high",
		Reasoning:  "Strong execution",
		NextReadyInputs: CalibrationNextReadyInputs{
			StrategyUpdate: "Refine competitive positioning",
		},
		NextCycleFocus: CalibrationNextCycleFocus{
			ContinueBuilding: []string{"Knowledge graph engine"},
		},
		NextSteps: []string{"Ship v1.0", "Run user interviews"},
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, nil)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	if cs.Meta.Decision != "persevere" {
		t.Errorf("Decision = %s, want persevere", cs.Meta.Decision)
	}
	if cs.Meta.SourceMemo != true {
		t.Error("SourceMemo should be true")
	}
	if cs.Meta.SourceSRC != false {
		t.Error("SourceSRC should be false")
	}

	// Should have: strategy_update (high) + continue_building (low)
	if cs.Summary.TotalChanges < 2 {
		t.Errorf("TotalChanges = %d, want >= 2", cs.Summary.TotalChanges)
	}

	// Check that strategy formula change exists
	found := false
	for _, c := range cs.Changes {
		if strings.Contains(c.TargetArtifact, "04_strategy_formula") {
			found = true
			if c.Operation != "update" {
				t.Errorf("Strategy formula operation = %s, want update", c.Operation)
			}
			if c.Priority != "high" {
				t.Errorf("Strategy formula priority = %s, want high", c.Priority)
			}
		}
	}
	if !found {
		t.Error("Expected a change targeting strategy_formula")
	}
}

func TestGenerateChangeset_PivotDecision(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:      2,
		Decision:   "pivot",
		Confidence: "medium",
		Reasoning:  "Market shifted dramatically",
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, nil)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	// Pivot should produce critical changes to strategy_formula and north_star
	if cs.Summary.CriticalChanges < 2 {
		t.Errorf("CriticalChanges = %d, want >= 2 for pivot", cs.Summary.CriticalChanges)
	}

	// Strategy formula should be rewritten
	for _, c := range cs.Changes {
		if strings.Contains(c.TargetArtifact, "04_strategy_formula") {
			if c.Operation != "rewrite" {
				t.Errorf("Strategy formula operation = %s, want rewrite for pivot", c.Operation)
			}
			if c.Priority != "critical" {
				t.Errorf("Strategy formula priority = %s, want critical for pivot", c.Priority)
			}
		}
	}

	// LRA should be set to bootstrap
	if cs.LRAUpdates == nil {
		t.Fatal("LRAUpdates should not be nil for pivot")
	}
	if cs.LRAUpdates.LifecycleStage == nil || *cs.LRAUpdates.LifecycleStage != "bootstrap" {
		t.Error("Pivot should set lifecycle stage to bootstrap")
	}
}

func TestGenerateChangeset_PullThePlug(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:     1,
		Decision:  "pull_the_plug",
		Reasoning: "No market demand",
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, nil)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	// Pull the plug should produce at least one critical change
	if cs.Summary.CriticalChanges < 1 {
		t.Errorf("CriticalChanges = %d, want >= 1 for pull_the_plug", cs.Summary.CriticalChanges)
	}
}

func TestGenerateChangeset_SRCOnly(t *testing.T) {
	src := &StrategicRealityCheck{
		Cycle: 2,
		RecalibrationPlan: []RecalibrationAction{
			{
				ID:             "src-ra-001",
				TargetArtifact: "READY/01_insight_analyses.yaml",
				TargetSection:  "competitive_landscape",
				Action:         "update",
				Priority:       "high",
				Rationale:      "Competitive landscape is 6 months stale",
				EffortEstimate: "2 hours",
			},
			{
				ID:             "src-ra-002",
				TargetArtifact: "READY/04_strategy_formula.yaml",
				TargetSection:  "risks",
				Action:         "review",
				Priority:       "medium",
				Rationale:      "Risk monitoring directives not evaluated",
			},
		},
		Summary: SRCSummary{OverallHealth: "attention_needed"},
	}

	cs, err := GenerateRecalibrationChangeset(".", nil, src)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	if cs.Meta.SourceSRC != true {
		t.Error("SourceSRC should be true")
	}
	if cs.Meta.SourceMemo != false {
		t.Error("SourceMemo should be false")
	}
	if cs.Meta.Decision != "pending_assessment" {
		t.Errorf("Decision = %s, want pending_assessment for SRC-only", cs.Meta.Decision)
	}
	if cs.Summary.TotalChanges != 2 {
		t.Errorf("TotalChanges = %d, want 2", cs.Summary.TotalChanges)
	}

	// Check SRC source is preserved
	for _, c := range cs.Changes {
		if c.Source.Type != "src" {
			t.Errorf("Source.Type = %s, want src", c.Source.Type)
		}
	}
}

func TestGenerateChangeset_MergedSources(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:    1,
		Decision: "persevere",
		NextReadyInputs: CalibrationNextReadyInputs{
			StrategyUpdate: "Update competitive moat",
		},
	}

	src := &StrategicRealityCheck{
		Cycle: 1,
		RecalibrationPlan: []RecalibrationAction{
			{
				ID:             "src-ra-001",
				TargetArtifact: "READY/04_strategy_formula.yaml",
				TargetSection:  "strategy_formula",
				Action:         "update",
				Priority:       "high",
				Rationale:      "Strategy formula needs competitive refresh",
			},
		},
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, src)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	if cs.Meta.SourceMemo != true || cs.Meta.SourceSRC != true {
		t.Error("Both sources should be true")
	}

	// Overlapping changes to strategy_formula should be merged
	sfCount := 0
	for _, c := range cs.Changes {
		if strings.Contains(c.TargetArtifact, "04_strategy_formula") && c.TargetSection == "strategy_formula" {
			sfCount++
			if c.Source.Type != "merged" {
				t.Errorf("Overlapping change source.type = %s, want merged", c.Source.Type)
			}
		}
	}
	if sfCount != 1 {
		t.Errorf("Expected 1 merged strategy_formula change, got %d", sfCount)
	}
}

func TestGenerateChangeset_InvalidatedAssumptions(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:    1,
		Decision: "persevere",
		Learnings: CalibrationLearnings{
			InvalidatedAssumptions: []string{"Users want self-hosted", "Enterprise is primary market"},
		},
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, nil)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	// Invalidated assumptions target the same artifact+section, so dedup merges them.
	// Expect at least 1 roadmap_recipe change with both hints merged.
	roadmapChanges := 0
	for _, c := range cs.Changes {
		if strings.Contains(c.TargetArtifact, "05_roadmap_recipe") {
			roadmapChanges++
			// Merged content should mention both assumptions
			if !strings.Contains(c.ContentHint, "self-hosted") || !strings.Contains(c.ContentHint, "Enterprise") {
				t.Errorf("Merged content_hint should mention both assumptions, got: %s", c.ContentHint)
			}
		}
	}
	if roadmapChanges < 1 {
		t.Errorf("Expected >= 1 roadmap_recipe changes for invalidated assumptions, got %d", roadmapChanges)
	}
}

func TestGenerateChangeset_StopAndStartBuilding(t *testing.T) {
	memo := &CalibrationMemo{
		Cycle:    1,
		Decision: "persevere",
		NextCycleFocus: CalibrationNextCycleFocus{
			StopBuilding:   []string{"Admin dashboard"},
			StartExploring: []string{"Mobile app", "CLI interface"},
		},
	}

	cs, err := GenerateRecalibrationChangeset(".", memo, nil)
	if err != nil {
		t.Fatalf("GenerateRecalibrationChangeset failed: %v", err)
	}

	// Stop targets section "feature_maturity.overall_stage", start targets section "".
	// Two start_exploring items share the same artifact+section key, so dedup merges them.
	// Result: stop(1) + start(1 merged) = 2
	featureChanges := 0
	for _, c := range cs.Changes {
		if strings.Contains(c.TargetArtifact, "feature_definitions") {
			featureChanges++
		}
	}
	if featureChanges != 2 {
		t.Errorf("Expected 2 feature_definitions changes (deduped), got %d", featureChanges)
	}
}

func TestSortChangesByPriority(t *testing.T) {
	changes := []RecalibrationChange{
		{ID: "1", Priority: "low", Operation: "review"},
		{ID: "2", Priority: "critical", Operation: "rewrite"},
		{ID: "3", Priority: "high", Operation: "update"},
		{ID: "4", Priority: "medium", Operation: "append"},
	}

	sortChangesByPriority(changes)

	expected := []string{"critical", "high", "medium", "low"}
	for i, c := range changes {
		if c.Priority != expected[i] {
			t.Errorf("changes[%d].Priority = %s, want %s", i, c.Priority, expected[i])
		}
	}
}

func TestDeduplicateChanges(t *testing.T) {
	changes := []RecalibrationChange{
		{
			ID: "1", TargetArtifact: "READY/a.yaml", TargetSection: "s1",
			Operation: "review", Priority: "medium",
			Source:      ChangeSource{Type: "calibration_memo", Field: "f1"},
			ContentHint: "from memo",
		},
		{
			ID: "2", TargetArtifact: "READY/a.yaml", TargetSection: "s1",
			Operation: "update", Priority: "high",
			Source:      ChangeSource{Type: "src", FindingID: "src-1"},
			ContentHint: "from src",
		},
		{
			ID: "3", TargetArtifact: "READY/b.yaml", TargetSection: "s2",
			Operation: "review", Priority: "low",
			Source: ChangeSource{Type: "src"},
		},
	}

	result := deduplicateChanges(changes)

	if len(result) != 2 {
		t.Fatalf("Expected 2 changes after dedup, got %d", len(result))
	}

	// First should be merged with higher priority and stronger operation
	if result[0].Priority != "high" {
		t.Errorf("Merged priority = %s, want high", result[0].Priority)
	}
	if result[0].Operation != "update" {
		t.Errorf("Merged operation = %s, want update", result[0].Operation)
	}
	if result[0].Source.Type != "merged" {
		t.Errorf("Merged source.type = %s, want merged", result[0].Source.Type)
	}
	if !strings.Contains(result[0].ContentHint, "from memo") || !strings.Contains(result[0].ContentHint, "from src") {
		t.Error("Merged content_hint should contain both hints")
	}
}

func TestFormatChangesetReport(t *testing.T) {
	cs := &RecalibrationChangeset{}
	cs.Meta.GeneratedAt = "2025-02-17T12:00:00Z"
	cs.Meta.Cycle = 2
	cs.Meta.Decision = "persevere"
	cs.Meta.Confidence = "high"
	cs.Meta.SourceMemo = true
	cs.Meta.SourceSRC = true
	cs.Changes = []RecalibrationChange{
		{
			ID:             "rc-001",
			TargetArtifact: "READY/04_strategy_formula.yaml",
			TargetSection:  "strategy_formula",
			Operation:      "update",
			Priority:       "high",
			Source:         ChangeSource{Type: "merged", Field: "next_ready_inputs.strategy_update", FindingID: "src-ra-001"},
			ContentHint:    "Update competitive moat section",
		},
	}
	cs.Summary = calculateRecalibrationSummary(cs.Changes)

	report := FormatChangesetReport(cs)

	if !strings.Contains(report, "Recalibration Changeset") {
		t.Error("Report should contain header")
	}
	if !strings.Contains(report, "persevere") {
		t.Error("Report should contain decision")
	}
	if !strings.Contains(report, "rc-001") {
		t.Error("Report should contain change ID")
	}
	if !strings.Contains(report, "strategy_formula") {
		t.Error("Report should reference target artifact")
	}
}

func TestBuildLRAUpdates_Persevere(t *testing.T) {
	memo := &CalibrationMemo{
		Decision:  "persevere",
		NextSteps: []string{"Ship v1.0", "Run user interviews"},
	}

	update := buildLRAUpdates(memo)

	if update == nil {
		t.Fatal("LRA updates should not be nil when NextSteps exist")
	}
	if update.PrimaryObjective == nil {
		t.Fatal("PrimaryObjective should be set from NextSteps")
	}
	if update.LifecycleStage != nil {
		t.Error("LifecycleStage should be nil for persevere")
	}
}

func TestBuildLRAUpdates_Pivot(t *testing.T) {
	memo := &CalibrationMemo{
		Decision: "pivot",
	}

	update := buildLRAUpdates(memo)

	if update == nil {
		t.Fatal("LRA updates should not be nil for pivot")
	}
	if update.LifecycleStage == nil || *update.LifecycleStage != "bootstrap" {
		t.Error("Pivot should set lifecycle stage to bootstrap")
	}
}

func TestBuildLRAUpdates_NoUpdatesNeeded(t *testing.T) {
	memo := &CalibrationMemo{
		Decision: "persevere",
	}

	update := buildLRAUpdates(memo)

	if update != nil {
		t.Error("LRA updates should be nil when no updates needed")
	}
}

func TestRecalibrationSummary(t *testing.T) {
	changes := []RecalibrationChange{
		{Priority: "critical", AutoApplicable: false, Source: ChangeSource{Type: "calibration_memo"}, TargetArtifact: "a"},
		{Priority: "high", AutoApplicable: false, Source: ChangeSource{Type: "src"}, TargetArtifact: "b"},
		{Priority: "high", AutoApplicable: true, Source: ChangeSource{Type: "merged"}, TargetArtifact: "a"},
		{Priority: "medium", AutoApplicable: false, Source: ChangeSource{Type: "src"}, TargetArtifact: "c"},
		{Priority: "low", AutoApplicable: false, Source: ChangeSource{Type: "calibration_memo"}, TargetArtifact: "a"},
	}

	s := calculateRecalibrationSummary(changes)

	if s.TotalChanges != 5 {
		t.Errorf("TotalChanges = %d, want 5", s.TotalChanges)
	}
	if s.CriticalChanges != 1 {
		t.Errorf("CriticalChanges = %d, want 1", s.CriticalChanges)
	}
	if s.HighChanges != 2 {
		t.Errorf("HighChanges = %d, want 2", s.HighChanges)
	}
	if s.AutoApplicable != 1 {
		t.Errorf("AutoApplicable = %d, want 1", s.AutoApplicable)
	}
	if s.ManualReview != 4 {
		t.Errorf("ManualReview = %d, want 4", s.ManualReview)
	}
	if s.AffectedArtifacts != 3 {
		t.Errorf("AffectedArtifacts = %d, want 3", s.AffectedArtifacts)
	}
	// merged counts as both
	if s.FromCalibMemo != 3 {
		t.Errorf("FromCalibMemo = %d, want 3", s.FromCalibMemo)
	}
	if s.FromSRC != 3 {
		t.Errorf("FromSRC = %d, want 3", s.FromSRC)
	}
}

// =============================================================================
// HEALTH DIAGNOSTICS TESTS
// =============================================================================

func TestHealthDiagnostics_EmptyInstance(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	report, err := RunHealthDiagnostics(dir)
	if err != nil {
		t.Fatalf("RunHealthDiagnostics failed: %v", err)
	}

	// Should find LRA missing
	found := false
	for _, d := range report.Diagnostics {
		if d.ID == "aim-lra-missing" {
			found = true
			if d.Severity != "critical" {
				t.Errorf("LRA missing severity = %s, want critical", d.Severity)
			}
		}
	}
	if !found {
		t.Error("Expected aim-lra-missing diagnostic")
	}
}

func TestHealthDiagnostics_StaleLRA(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	// Create LRA with old last_updated
	oldDate := time.Now().AddDate(0, -4, 0).Format("2006-01-02") // 4 months ago
	lra := `metadata:
  lifecycle_stage: maturing
  last_updated: ` + oldDate + `
track_baselines:
  product:
    maturity: explicit
    last_signal_date: ` + oldDate + `
`
	os.WriteFile(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"), []byte(lra), 0644)

	report, err := RunHealthDiagnostics(dir)
	if err != nil {
		t.Fatalf("RunHealthDiagnostics failed: %v", err)
	}

	// Should find LRA stale and track stale
	staleCount := 0
	for _, d := range report.Diagnostics {
		if d.Category == "lra_staleness" {
			staleCount++
		}
	}
	if staleCount < 2 {
		t.Errorf("Expected >= 2 staleness diagnostics, got %d", staleCount)
	}
}

func TestHealthDiagnostics_MissingAssessment(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	// Create valid LRA
	lra := `metadata:
  lifecycle_stage: maturing
  last_updated: ` + time.Now().Format("2006-01-02") + `
`
	os.WriteFile(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"), []byte(lra), 0644)

	// Create calibration memo without assessment
	calibration := `roadmap_id: test
cycle: 1
decision: persevere
reasoning: test
`
	os.WriteFile(filepath.Join(dir, "AIM", "calibration_memo.yaml"), []byte(calibration), 0644)

	report, err := RunHealthDiagnostics(dir)
	if err != nil {
		t.Fatalf("RunHealthDiagnostics failed: %v", err)
	}

	found := false
	for _, d := range report.Diagnostics {
		if d.ID == "aim-missing-assessment" {
			found = true
		}
	}
	if !found {
		t.Error("Expected aim-missing-assessment diagnostic")
	}
}

func TestHealthDiagnostics_DeliveryDrift(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	// Create valid LRA
	lra := `metadata:
  lifecycle_stage: maturing
  last_updated: ` + time.Now().Format("2006-01-02") + `
`
	os.WriteFile(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"), []byte(lra), 0644)

	// Create a delivered feature with hypothetical maturity
	fd := `id: fd-001
name: Test Feature
slug: test-feature
status: delivered
feature_maturity:
  overall_stage: hypothetical
`
	os.WriteFile(filepath.Join(dir, "FIRE", "feature_definitions", "fd-001_test.yaml"), []byte(fd), 0644)

	report, err := RunHealthDiagnostics(dir)
	if err != nil {
		t.Fatalf("RunHealthDiagnostics failed: %v", err)
	}

	found := false
	for _, d := range report.Diagnostics {
		if strings.HasPrefix(d.ID, "aim-drift-") {
			found = true
			if d.Severity != "warning" {
				t.Errorf("Delivery drift severity = %s, want warning", d.Severity)
			}
		}
	}
	if !found {
		t.Error("Expected delivery drift diagnostic")
	}
}

func TestHealthDiagnostics_OverallStatus(t *testing.T) {
	tests := []struct {
		name     string
		summary  HealthSummary
		expected string
	}{
		{"healthy", HealthSummary{Total: 0}, "healthy"},
		{"attention_needed", HealthSummary{Total: 1, Warning: 1}, "attention_needed"},
		{"at_risk", HealthSummary{Total: 3, Warning: 3}, "at_risk"},
		{"critical", HealthSummary{Total: 1, Critical: 1}, "critical"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := deriveOverallStatus(tt.summary)
			if status != tt.expected {
				t.Errorf("deriveOverallStatus = %s, want %s", status, tt.expected)
			}
		})
	}
}

func TestFormatHealthReport(t *testing.T) {
	report := &HealthReport{
		GeneratedAt:   "2025-02-17T12:00:00Z",
		InstancePath:  "/test/instance",
		OverallStatus: "attention_needed",
		Diagnostics: []HealthDiagnostic{
			{
				ID:          "aim-lra-stale",
				Category:    "lra_staleness",
				Severity:    "warning",
				Title:       "LRA is stale",
				Description: "Last updated 120 days ago",
				Suggestion:  "Update LRA",
			},
		},
		Summary: HealthSummary{Total: 1, Warning: 1},
	}

	formatted := FormatHealthReport(report)

	if !strings.Contains(formatted, "AIM Health Diagnostics") {
		t.Error("Report should contain header")
	}
	if !strings.Contains(formatted, "attention_needed") {
		t.Error("Report should contain overall status")
	}
	if !strings.Contains(formatted, "LRA is stale") {
		t.Error("Report should contain diagnostic title")
	}
}

func TestLoadStrategicRealityCheck(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)

	srcContent := `cycle: 2
assessment_date: "2025-02-17"
belief_validity: []
market_currency: []
strategic_alignment: []
execution_reality: []
recalibration_plan:
  - id: src-ra-001
    target_artifact: "READY/01_insight_analyses.yaml"
    target_section: "competitive_landscape"
    action: update
    priority: high
    rationale: "Stale data"
summary:
  overall_health: attention_needed
`
	os.WriteFile(filepath.Join(dir, "AIM", "strategic_reality_check.yaml"), []byte(srcContent), 0644)

	src, err := LoadStrategicRealityCheck(dir)
	if err != nil {
		t.Fatalf("LoadStrategicRealityCheck failed: %v", err)
	}

	if src.Cycle != 2 {
		t.Errorf("Cycle = %d, want 2", src.Cycle)
	}
	if len(src.RecalibrationPlan) != 1 {
		t.Errorf("RecalibrationPlan length = %d, want 1", len(src.RecalibrationPlan))
	}
	if src.RecalibrationPlan[0].ID != "src-ra-001" {
		t.Errorf("RecalibrationPlan[0].ID = %s, want src-ra-001", src.RecalibrationPlan[0].ID)
	}
}

func TestLoadStrategicRealityCheck_Missing(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)

	_, err := LoadStrategicRealityCheck(dir)
	if err == nil {
		t.Error("Expected error for missing SRC file")
	}
}
