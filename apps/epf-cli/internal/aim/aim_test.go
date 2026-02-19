package aim

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// HELPERS
// =============================================================================

// createTestInstance creates a minimal EPF instance in a temp directory.
func createTestInstance(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)
	return dir
}

// writeLRA writes an LRA fixture into an instance.
func writeLRA(t *testing.T, dir string, a *lra.LivingRealityAssessment) {
	t.Helper()
	path := filepath.Join(dir, "AIM", "living_reality_assessment.yaml")
	data, err := yaml.Marshal(a)
	if err != nil {
		t.Fatalf("marshal LRA: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write LRA: %v", err)
	}
}

// minimalLRA returns a minimal valid LRA for testing.
func minimalLRA() *lra.LivingRealityAssessment {
	return &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			LifecycleStage:  "bootstrap",
			CyclesCompleted: 0,
			AdoptionLevel:   1,
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType: "solo_founder",
			FundingStage:     "bootstrapped",
			TeamSize:         1,
		},
		TrackBaselines: map[string]lra.TrackBaseline{
			"product":    {Maturity: "implicit", Status: "emerging"},
			"strategy":   {Maturity: "absent", Status: "not_started"},
			"org_ops":    {Maturity: "absent", Status: "not_applicable"},
			"commercial": {Maturity: "absent", Status: "not_started"},
		},
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   "C1",
			PrimaryTrack:     "product",
			PrimaryObjective: "Build MVP",
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Trigger:        "bootstrap_complete",
				Summary:        "Initial LRA created",
				Changes: []lra.ChangeDetail{
					{Section: "metadata", Field: "lifecycle_stage", ChangeType: "created", NewValue: "bootstrap"},
				},
			},
		},
	}
}

// writeRoadmap writes a roadmap fixture to READY/05_roadmap_recipe.yaml.
func writeRoadmap(t *testing.T, dir string, roadmap *RoadmapData) {
	t.Helper()
	path := filepath.Join(dir, "READY", "05_roadmap_recipe.yaml")
	data, err := yaml.Marshal(roadmap)
	if err != nil {
		t.Fatalf("marshal roadmap: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write roadmap: %v", err)
	}
}

// testRoadmap returns a roadmap fixture with 2 OKRs and 1 assumption.
func testRoadmap() *RoadmapData {
	return &RoadmapData{
		Roadmap: struct {
			ID         string `yaml:"id"`
			StrategyID string `yaml:"strategy_id"`
			Cycle      int    `yaml:"cycle"`
			Timeframe  string `yaml:"timeframe"`
			Tracks     struct {
				Product    TrackData `yaml:"product"`
				Strategy   TrackData `yaml:"strategy"`
				OrgOps     TrackData `yaml:"org_ops"`
				Commercial TrackData `yaml:"commercial"`
			} `yaml:"tracks"`
		}{
			ID:        "roadmap-q1-2025",
			Cycle:     1,
			Timeframe: "Q1 2025",
			Tracks: struct {
				Product    TrackData `yaml:"product"`
				Strategy   TrackData `yaml:"strategy"`
				OrgOps     TrackData `yaml:"org_ops"`
				Commercial TrackData `yaml:"commercial"`
			}{
				Product: TrackData{
					OKRs: []OKRData{
						{
							ID:        "okr-p-001",
							Objective: "Ship core product",
							KeyResults: []KRData{
								{ID: "kr-p-001", Description: "Launch MVP", Target: "MVP live by March"},
								{ID: "kr-p-002", Description: "Reach 10 beta users"},
							},
						},
					},
					Assumptions: []AssumptionData{
						{ID: "a-p-001", Description: "Users want AI features", Criticality: "high", Evidence: "User interviews"},
					},
				},
				Strategy: TrackData{
					OKRs: []OKRData{
						{
							ID:        "okr-s-001",
							Objective: "Clarify positioning",
							KeyResults: []KRData{
								{ID: "kr-s-001", Description: "Complete competitive analysis", Target: "Full report"},
							},
						},
					},
				},
			},
		},
	}
}

// writeAssessmentReport writes an assessment report fixture.
func writeAssessmentReportFixture(t *testing.T, dir string, report *AssessmentReport) {
	t.Helper()
	path := filepath.Join(dir, "AIM", "assessment_report.yaml")
	data, err := yaml.Marshal(report)
	if err != nil {
		t.Fatalf("marshal assessment: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write assessment: %v", err)
	}
}

// =============================================================================
// WRITER TESTS
// =============================================================================

func TestWriteAssessmentReport(t *testing.T) {
	dir := createTestInstance(t)
	report := &AssessmentReport{
		RoadmapID: "roadmap-q1",
		Cycle:     1,
		OKRAssessments: []OKRAssessment{
			{OKRID: "okr-p-001", Assessment: "Good progress"},
		},
	}
	report.Meta.EPFVersion = "2.0.0"

	path, err := WriteAssessmentReport(dir, report)
	if err != nil {
		t.Fatalf("WriteAssessmentReport failed: %v", err)
	}

	expected := filepath.Join(dir, "AIM", "assessment_report.yaml")
	if path != expected {
		t.Errorf("expected path %s, got %s", expected, path)
	}

	// Verify file exists and is parseable
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}
	var loaded AssessmentReport
	if err := yaml.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("unmarshal written file: %v", err)
	}
	if loaded.RoadmapID != "roadmap-q1" {
		t.Errorf("expected roadmap_id 'roadmap-q1', got '%s'", loaded.RoadmapID)
	}
	if len(loaded.OKRAssessments) != 1 {
		t.Errorf("expected 1 OKR assessment, got %d", len(loaded.OKRAssessments))
	}
}

func TestWriteCalibrationMemo(t *testing.T) {
	dir := createTestInstance(t)
	memo := &CalibrationMemo{
		RoadmapID:  "roadmap-q1",
		Cycle:      1,
		Decision:   "persevere",
		Confidence: "high",
		Reasoning:  "Strong user signal, metrics on track",
		Learnings: CalibrationLearnings{
			ValidatedAssumptions:   []string{"AI features validated"},
			InvalidatedAssumptions: []string{},
			Surprises:              []string{"Onboarding needs work"},
		},
		NextCycleFocus: CalibrationNextCycleFocus{
			ContinueBuilding: []string{"Core AI pipeline"},
			StopBuilding:     []string{},
			StartExploring:   []string{},
		},
		NextReadyInputs: CalibrationNextReadyInputs{
			OpportunityUpdate: "Market remains strong",
			StrategyUpdate:    "Focus on retention",
			NewAssumptions:    []string{},
		},
		NextSteps: []string{"Review roadmap priorities"},
	}
	memo.Meta.EPFVersion = "2.0.0"

	path, err := WriteCalibrationMemo(dir, memo)
	if err != nil {
		t.Fatalf("WriteCalibrationMemo failed: %v", err)
	}

	expected := filepath.Join(dir, "AIM", "calibration_memo.yaml")
	if path != expected {
		t.Errorf("expected path %s, got %s", expected, path)
	}

	// Verify roundtrip
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}
	var loaded CalibrationMemo
	if err := yaml.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("unmarshal written file: %v", err)
	}
	if loaded.Decision != "persevere" {
		t.Errorf("expected decision 'persevere', got '%s'", loaded.Decision)
	}
	if len(loaded.Learnings.ValidatedAssumptions) != 1 {
		t.Errorf("expected 1 validated assumption, got %d", len(loaded.Learnings.ValidatedAssumptions))
	}
}

func TestApplyLRAUpdate_FieldUpdates(t *testing.T) {
	dir := createTestInstance(t)
	writeLRA(t, dir, minimalLRA())

	// Update several fields
	newObjective := "Ship cloud server"
	newStage := "maturing"
	update := &LRAUpdate{
		PrimaryObjective: &newObjective,
		LifecycleStage:   &newStage,
		Trigger:          "aim_signals",
		Summary:          "Updated after Q1 assessment",
		Changes: []lra.ChangeDetail{
			{Section: "current_focus", Field: "primary_objective", ChangeType: "updated", NewValue: newObjective},
		},
	}

	if err := ApplyLRAUpdate(dir, update, "test-agent"); err != nil {
		t.Fatalf("ApplyLRAUpdate failed: %v", err)
	}

	// Reload and verify
	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}

	if loaded.CurrentFocus.PrimaryObjective != "Ship cloud server" {
		t.Errorf("primary_objective not updated: got '%s'", loaded.CurrentFocus.PrimaryObjective)
	}
	if loaded.Metadata.LifecycleStage != "maturing" {
		t.Errorf("lifecycle_stage not updated: got '%s'", loaded.Metadata.LifecycleStage)
	}
	if loaded.Metadata.LastUpdatedBy != "test-agent" {
		t.Errorf("last_updated_by not set: got '%s'", loaded.Metadata.LastUpdatedBy)
	}

	// Check evolution log was appended
	if len(loaded.EvolutionLog) != 2 {
		t.Fatalf("expected 2 evolution log entries, got %d", len(loaded.EvolutionLog))
	}
	latest := loaded.EvolutionLog[1]
	if latest.Trigger != "aim_signals" {
		t.Errorf("evolution trigger: got '%s'", latest.Trigger)
	}
	if latest.UpdatedBy != "test-agent" {
		t.Errorf("evolution updated_by: got '%s'", latest.UpdatedBy)
	}
}

func TestApplyLRAUpdate_TrackUpdates(t *testing.T) {
	dir := createTestInstance(t)
	writeLRA(t, dir, minimalLRA())

	newMaturity := "explicit"
	newStatus := "established"
	update := &LRAUpdate{
		TrackUpdates: map[string]*TrackBaselineUpdate{
			"product": {
				Maturity:      &newMaturity,
				Status:        &newStatus,
				KeyActivities: []string{"Shipping MVP", "User interviews"},
			},
		},
		Trigger: "aim_signals",
		Summary: "Product track advanced",
	}

	if err := ApplyLRAUpdate(dir, update, "test"); err != nil {
		t.Fatalf("ApplyLRAUpdate failed: %v", err)
	}

	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}

	product := loaded.TrackBaselines["product"]
	if product.Maturity != "explicit" {
		t.Errorf("product maturity not updated: got '%s'", product.Maturity)
	}
	if product.Status != "established" {
		t.Errorf("product status not updated: got '%s'", product.Status)
	}
	if len(product.KeyActivities) != 2 {
		t.Errorf("expected 2 key activities, got %d", len(product.KeyActivities))
	}

	// Verify other tracks unchanged
	strategy := loaded.TrackBaselines["strategy"]
	if strategy.Maturity != "absent" {
		t.Errorf("strategy maturity should be unchanged: got '%s'", strategy.Maturity)
	}
}

func TestApplyLRAUpdate_NoEvolutionLogWithoutTrigger(t *testing.T) {
	dir := createTestInstance(t)
	writeLRA(t, dir, minimalLRA())

	newObj := "New objective"
	update := &LRAUpdate{
		PrimaryObjective: &newObj,
		// No Trigger/Summary
	}

	if err := ApplyLRAUpdate(dir, update, "test"); err != nil {
		t.Fatalf("ApplyLRAUpdate failed: %v", err)
	}

	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}

	// Evolution log should still have only the original entry
	if len(loaded.EvolutionLog) != 1 {
		t.Errorf("expected 1 evolution log entry (no new one), got %d", len(loaded.EvolutionLog))
	}
}

func TestApplyLRAUpdate_MissingLRA(t *testing.T) {
	dir := createTestInstance(t)
	// Don't write any LRA

	newObj := "anything"
	update := &LRAUpdate{PrimaryObjective: &newObj}
	err := ApplyLRAUpdate(dir, update, "test")
	if err == nil {
		t.Fatal("expected error for missing LRA, got nil")
	}
}

func TestArchiveCycle(t *testing.T) {
	dir := createTestInstance(t)

	// Create assessment report
	writeAssessmentReportFixture(t, dir, &AssessmentReport{
		RoadmapID: "roadmap-q1",
		Cycle:     1,
	})
	// Create LRA
	writeLRA(t, dir, minimalLRA())

	archiveDir, err := ArchiveCycle(dir, 1)
	if err != nil {
		t.Fatalf("ArchiveCycle failed: %v", err)
	}

	expected := filepath.Join(dir, "AIM", "cycles", "cycle-1")
	if archiveDir != expected {
		t.Errorf("expected archive dir %s, got %s", expected, archiveDir)
	}

	// Check that at least assessment_report.yaml and living_reality_assessment.yaml were archived
	for _, name := range []string{"assessment_report.yaml", "living_reality_assessment.yaml"} {
		archived := filepath.Join(archiveDir, name)
		if _, err := os.Stat(archived); os.IsNotExist(err) {
			t.Errorf("expected archived file %s to exist", name)
		}
	}
}

func TestArchiveCycle_NoArtifacts(t *testing.T) {
	dir := createTestInstance(t)
	// Empty AIM directory — nothing to archive

	_, err := ArchiveCycle(dir, 1)
	if err == nil {
		t.Fatal("expected error when no artifacts to archive, got nil")
	}
}

func TestInitCycle(t *testing.T) {
	dir := createTestInstance(t)

	// Set up cycle 1 artifacts
	writeLRA(t, dir, minimalLRA())
	writeAssessmentReportFixture(t, dir, &AssessmentReport{
		RoadmapID: "roadmap-q1",
		Cycle:     1,
	})

	// Write a calibration memo too
	calPath := filepath.Join(dir, "AIM", "calibration_memo.yaml")
	calData, _ := yaml.Marshal(&CalibrationMemo{RoadmapID: "roadmap-q1", Cycle: 1, Decision: "persevere"})
	os.WriteFile(calPath, calData, 0644)

	// Init cycle 2 with archive
	if err := InitCycle(dir, 2, true, "test-agent"); err != nil {
		t.Fatalf("InitCycle failed: %v", err)
	}

	// Verify previous cycle was archived
	archiveDir := filepath.Join(dir, "AIM", "cycles", "cycle-1")
	if _, err := os.Stat(archiveDir); os.IsNotExist(err) {
		t.Error("expected cycle-1 archive directory to exist")
	}

	// Verify old assessment and calibration removed
	if _, err := os.Stat(filepath.Join(dir, "AIM", "assessment_report.yaml")); !os.IsNotExist(err) {
		t.Error("expected assessment_report.yaml to be removed")
	}
	if _, err := os.Stat(filepath.Join(dir, "AIM", "calibration_memo.yaml")); !os.IsNotExist(err) {
		t.Error("expected calibration_memo.yaml to be removed")
	}

	// Verify LRA was updated
	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}
	if loaded.CurrentFocus.CycleReference != "C2" {
		t.Errorf("expected cycle_reference 'C2', got '%s'", loaded.CurrentFocus.CycleReference)
	}

	// Check evolution log
	lastEntry := loaded.EvolutionLog[len(loaded.EvolutionLog)-1]
	if lastEntry.Trigger != "cycle_transition" {
		t.Errorf("expected trigger 'cycle_transition', got '%s'", lastEntry.Trigger)
	}
}

func TestInitCycle_WithoutArchive(t *testing.T) {
	dir := createTestInstance(t)
	writeLRA(t, dir, minimalLRA())

	// Init cycle 2 without archiving
	if err := InitCycle(dir, 2, false, "test"); err != nil {
		t.Fatalf("InitCycle failed: %v", err)
	}

	// No archive directory should exist
	archiveDir := filepath.Join(dir, "AIM", "cycles", "cycle-1")
	if _, err := os.Stat(archiveDir); !os.IsNotExist(err) {
		t.Error("expected no archive directory when archive=false")
	}
}

// =============================================================================
// LOADER TESTS
// =============================================================================

func TestLoadRoadmap(t *testing.T) {
	dir := createTestInstance(t)
	writeRoadmap(t, dir, testRoadmap())

	roadmap, err := LoadRoadmap(dir)
	if err != nil {
		t.Fatalf("LoadRoadmap failed: %v", err)
	}
	if roadmap.Roadmap.ID != "roadmap-q1-2025" {
		t.Errorf("expected roadmap ID 'roadmap-q1-2025', got '%s'", roadmap.Roadmap.ID)
	}
	if len(roadmap.Roadmap.Tracks.Product.OKRs) != 1 {
		t.Errorf("expected 1 product OKR, got %d", len(roadmap.Roadmap.Tracks.Product.OKRs))
	}
	if len(roadmap.Roadmap.Tracks.Product.OKRs[0].KeyResults) != 2 {
		t.Errorf("expected 2 KRs for product OKR, got %d", len(roadmap.Roadmap.Tracks.Product.OKRs[0].KeyResults))
	}
}

func TestLoadRoadmap_NotFound(t *testing.T) {
	dir := createTestInstance(t)
	_, err := LoadRoadmap(dir)
	if err == nil {
		t.Fatal("expected error for missing roadmap")
	}
}

func TestLoadAssessmentReports(t *testing.T) {
	dir := createTestInstance(t)
	writeAssessmentReportFixture(t, dir, &AssessmentReport{
		RoadmapID: "roadmap-q1",
		Cycle:     1,
		OKRAssessments: []OKRAssessment{
			{OKRID: "okr-p-001"},
		},
	})

	reports, err := LoadAssessmentReports(dir)
	if err != nil {
		t.Fatalf("LoadAssessmentReports failed: %v", err)
	}
	if len(reports) != 1 {
		t.Errorf("expected 1 report, got %d", len(reports))
	}
	if reports[0].RoadmapID != "roadmap-q1" {
		t.Errorf("expected roadmap_id 'roadmap-q1', got '%s'", reports[0].RoadmapID)
	}
}

func TestLoadAssessmentReports_NoReports(t *testing.T) {
	dir := createTestInstance(t)
	_, err := LoadAssessmentReports(dir)
	if err == nil {
		t.Fatal("expected error for missing reports")
	}
}

func TestLoadCalibrationMemo(t *testing.T) {
	dir := createTestInstance(t)
	memo := &CalibrationMemo{RoadmapID: "roadmap-q1", Cycle: 1, Decision: "pivot"}
	calPath := filepath.Join(dir, "AIM", "calibration_memo.yaml")
	data, _ := yaml.Marshal(memo)
	os.WriteFile(calPath, data, 0644)

	loaded, err := LoadCalibrationMemo(dir)
	if err != nil {
		t.Fatalf("LoadCalibrationMemo failed: %v", err)
	}
	if loaded.Decision != "pivot" {
		t.Errorf("expected decision 'pivot', got '%s'", loaded.Decision)
	}
}

func TestGetAllTracks(t *testing.T) {
	roadmap := testRoadmap()
	tracks := GetAllTracks(roadmap)

	if len(tracks) != 4 {
		t.Errorf("expected 4 tracks, got %d", len(tracks))
	}
	if _, ok := tracks["product"]; !ok {
		t.Error("expected 'product' track")
	}
	if len(tracks["product"].OKRs) != 1 {
		t.Errorf("expected 1 product OKR, got %d", len(tracks["product"].OKRs))
	}
}

func TestGetTrackFromID(t *testing.T) {
	tests := []struct {
		id       string
		expected string
	}{
		{"okr-p-001", "product"},
		{"kr-p-001", "product"},
		{"okr-s-001", "strategy"},
		{"kr-s-002", "strategy"},
		{"okr-o-001", "org_ops"},
		{"okr-c-001", "commercial"},
		{"unknown", "unknown"},
		{"okr-x-001", "unknown"},
		{"short", "unknown"},
	}

	for _, tc := range tests {
		result := GetTrackFromID(tc.id)
		if result != tc.expected {
			t.Errorf("GetTrackFromID(%q): expected %q, got %q", tc.id, tc.expected, result)
		}
	}
}

func TestPercentage(t *testing.T) {
	tests := []struct {
		part, total, expected int
	}{
		{0, 0, 0},
		{0, 10, 0},
		{5, 10, 50},
		{10, 10, 100},
		{3, 4, 75},
	}
	for _, tc := range tests {
		result := Percentage(tc.part, tc.total)
		if result != tc.expected {
			t.Errorf("Percentage(%d, %d): expected %d, got %d", tc.part, tc.total, tc.expected, result)
		}
	}
}

func TestContainsInt(t *testing.T) {
	slice := []int{1, 3, 5, 7}
	if !ContainsInt(slice, 3) {
		t.Error("expected ContainsInt to find 3")
	}
	if ContainsInt(slice, 4) {
		t.Error("expected ContainsInt to not find 4")
	}
	if ContainsInt(nil, 1) {
		t.Error("expected ContainsInt on nil to return false")
	}
}

func TestGetTargetFromKR(t *testing.T) {
	// With explicit target
	kr1 := KRData{ID: "kr-1", Description: "Launch MVP", Target: "MVP live"}
	if got := GetTargetFromKR(kr1); got != "MVP live" {
		t.Errorf("expected explicit target, got %q", got)
	}

	// Without target but "target:" in description
	kr2 := KRData{ID: "kr-2", Description: "reach target: 10 users"}
	got := GetTargetFromKR(kr2)
	if got != "TODO: Extract target from description or add explicit target" {
		t.Errorf("expected extraction TODO, got %q", got)
	}

	// Without target, no hint
	kr3 := KRData{ID: "kr-3", Description: "Do something"}
	got = GetTargetFromKR(kr3)
	if got != "TODO: Define measurable target for this KR" {
		t.Errorf("expected define TODO, got %q", got)
	}
}

func TestBuildOKRMetadata(t *testing.T) {
	roadmap := testRoadmap()
	metadata := BuildOKRMetadata(roadmap)

	if metadata["okr-p-001"] != "Ship core product" {
		t.Errorf("expected okr-p-001 objective, got '%s'", metadata["okr-p-001"])
	}
	if metadata["okr-s-001"] != "Clarify positioning" {
		t.Errorf("expected okr-s-001 objective, got '%s'", metadata["okr-s-001"])
	}
}

// =============================================================================
// ASSESS TESTS
// =============================================================================

func TestGenerateAssessmentReport(t *testing.T) {
	roadmap := testRoadmap()
	report := GenerateAssessmentReport(roadmap, "roadmap-q1-2025")

	if report.RoadmapID != "roadmap-q1-2025" {
		t.Errorf("expected roadmap_id 'roadmap-q1-2025', got '%s'", report.RoadmapID)
	}
	if report.Cycle != 1 {
		t.Errorf("expected cycle 1, got %d", report.Cycle)
	}
	if report.Meta.EPFVersion != "2.0.0" {
		t.Errorf("expected epf_version '2.0.0', got '%s'", report.Meta.EPFVersion)
	}

	// Should have OKR assessments for all OKRs (2 total: product + strategy)
	if len(report.OKRAssessments) != 2 {
		t.Fatalf("expected 2 OKR assessments, got %d", len(report.OKRAssessments))
	}

	// Product OKR should have 2 KR outcomes
	var productOKR *OKRAssessment
	for i := range report.OKRAssessments {
		if report.OKRAssessments[i].OKRID == "okr-p-001" {
			productOKR = &report.OKRAssessments[i]
			break
		}
	}
	if productOKR == nil {
		t.Fatal("expected product OKR assessment")
	}
	if len(productOKR.KeyResultOutcomes) != 2 {
		t.Errorf("expected 2 KR outcomes, got %d", len(productOKR.KeyResultOutcomes))
	}

	// Should have 1 assumption check
	if len(report.Assumptions) != 1 {
		t.Errorf("expected 1 assumption, got %d", len(report.Assumptions))
	}
	if report.Assumptions[0].ID != "a-p-001" {
		t.Errorf("expected assumption ID 'a-p-001', got '%s'", report.Assumptions[0].ID)
	}
}

func TestValidateAssumptions(t *testing.T) {
	roadmap := testRoadmap()

	assessments := []AssessmentReport{
		{
			RoadmapID: "roadmap-q1",
			Cycle:     1,
			Assumptions: []AssumptionCheck{
				{ID: "a-p-001", Status: "validated", Evidence: "User interviews confirmed demand"},
			},
		},
	}

	summary, details := ValidateAssumptions(roadmap, assessments)

	if summary.Total != 1 {
		t.Errorf("expected total 1, got %d", summary.Total)
	}
	if summary.Validated != 1 {
		t.Errorf("expected 1 validated, got %d", summary.Validated)
	}
	if summary.Pending != 0 {
		t.Errorf("expected 0 pending, got %d", summary.Pending)
	}

	if len(details) != 1 {
		t.Fatalf("expected 1 detail, got %d", len(details))
	}
	if details[0].Status != "validated" {
		t.Errorf("expected status 'validated', got '%s'", details[0].Status)
	}
}

func TestValidateAssumptions_NoEvidence(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{} // no assessment data

	summary, details := ValidateAssumptions(roadmap, assessments)

	if summary.Total != 1 {
		t.Errorf("expected total 1, got %d", summary.Total)
	}
	if summary.Pending != 1 {
		t.Errorf("expected 1 pending (no evidence), got %d", summary.Pending)
	}
	if details[0].Evidence != "No assessment evidence available yet" {
		t.Errorf("expected pending evidence message, got '%s'", details[0].Evidence)
	}
}

func TestValidateAssumptions_InvalidStatus(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{
		{
			Assumptions: []AssumptionCheck{
				{ID: "a-p-001", Status: "bogus-status"},
			},
		},
	}

	summary, details := ValidateAssumptions(roadmap, assessments)
	// Invalid status should be counted as "pending"
	if summary.Pending != 1 {
		t.Errorf("expected 1 pending for invalid status, got %d", summary.Pending)
	}
	if details[0].Status != "pending" {
		t.Errorf("expected status overridden to 'pending', got '%s'", details[0].Status)
	}
}

func TestCalculateOKRProgress(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{
		{
			RoadmapID: "roadmap-q1",
			Cycle:     1,
			OKRAssessments: []OKRAssessment{
				{
					OKRID: "okr-p-001",
					KeyResultOutcomes: []KROutcome{
						{KRID: "kr-p-001", Status: "met", Target: "MVP live", Actual: "MVP shipped"},
						{KRID: "kr-p-002", Status: "partially_met", Target: "10 beta users", Actual: "7 users"},
					},
				},
				{
					OKRID: "okr-s-001",
					KeyResultOutcomes: []KROutcome{
						{KRID: "kr-s-001", Status: "exceeded", Target: "Full report", Actual: "Report + analysis"},
					},
				},
			},
		},
	}

	overall, byTrack, cycles := CalculateOKRProgress(roadmap, assessments, 0, false, "")

	// Overall: 3 KRs total, 1 exceeded + 1 met + 1 partially_met
	if overall.TotalKRs != 3 {
		t.Errorf("expected 3 total KRs, got %d", overall.TotalKRs)
	}
	if overall.Exceeded != 1 {
		t.Errorf("expected 1 exceeded, got %d", overall.Exceeded)
	}
	if overall.Met != 1 {
		t.Errorf("expected 1 met, got %d", overall.Met)
	}
	if overall.PartiallyMet != 1 {
		t.Errorf("expected 1 partially_met, got %d", overall.PartiallyMet)
	}
	// Achievement rate: (1+1)/3 = 66.67%
	expectedRate := float64(2) / float64(3) * 100
	if overall.AchievementRate != expectedRate {
		t.Errorf("expected achievement rate %.2f, got %.2f", expectedRate, overall.AchievementRate)
	}

	// By track
	productTrack, ok := byTrack["product"]
	if !ok {
		t.Fatal("expected product track in byTrack")
	}
	if productTrack.Summary.TotalKRs != 2 {
		t.Errorf("expected 2 product KRs, got %d", productTrack.Summary.TotalKRs)
	}

	strategyTrack, ok := byTrack["strategy"]
	if !ok {
		t.Fatal("expected strategy track in byTrack")
	}
	if strategyTrack.Summary.Exceeded != 1 {
		t.Errorf("expected 1 exceeded in strategy, got %d", strategyTrack.Summary.Exceeded)
	}

	// Cycles
	if len(cycles) != 1 {
		t.Errorf("expected 1 cycle, got %d", len(cycles))
	}
}

func TestCalculateOKRProgress_WithTrackFilter(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{
		{
			Cycle: 1,
			OKRAssessments: []OKRAssessment{
				{OKRID: "okr-p-001", KeyResultOutcomes: []KROutcome{{KRID: "kr-p-001", Status: "met"}}},
				{OKRID: "okr-s-001", KeyResultOutcomes: []KROutcome{{KRID: "kr-s-001", Status: "exceeded"}}},
			},
		},
	}

	overall, _, _ := CalculateOKRProgress(roadmap, assessments, 0, false, "product")

	// Only product track should be counted
	if overall.TotalKRs != 1 {
		t.Errorf("expected 1 KR with product filter, got %d", overall.TotalKRs)
	}
	if overall.Met != 1 {
		t.Errorf("expected 1 met with product filter, got %d", overall.Met)
	}
}

func TestCalculateOKRProgress_WithCycleFilter(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{
		{Cycle: 1, OKRAssessments: []OKRAssessment{
			{OKRID: "okr-p-001", KeyResultOutcomes: []KROutcome{{KRID: "kr-p-001", Status: "met"}}},
		}},
		{Cycle: 2, OKRAssessments: []OKRAssessment{
			{OKRID: "okr-p-001", KeyResultOutcomes: []KROutcome{{KRID: "kr-p-001", Status: "exceeded"}}},
		}},
	}

	overall, _, _ := CalculateOKRProgress(roadmap, assessments, 2, false, "")
	if overall.TotalKRs != 1 {
		t.Errorf("expected 1 KR with cycle filter=2, got %d", overall.TotalKRs)
	}
	if overall.Exceeded != 1 {
		t.Errorf("expected 1 exceeded in cycle 2, got %d", overall.Exceeded)
	}
}

func TestCalculateOKRProgress_SkipsTODOStatus(t *testing.T) {
	roadmap := testRoadmap()
	assessments := []AssessmentReport{
		{
			Cycle: 1,
			OKRAssessments: []OKRAssessment{
				{
					OKRID: "okr-p-001",
					KeyResultOutcomes: []KROutcome{
						{KRID: "kr-p-001", Status: "met"},
						{KRID: "kr-p-002", Status: "TODO: Set status"},
					},
				},
			},
		},
	}

	overall, _, _ := CalculateOKRProgress(roadmap, assessments, 0, false, "")
	// TODO status should be skipped
	if overall.TotalKRs != 1 {
		t.Errorf("expected 1 KR (TODO skipped), got %d", overall.TotalKRs)
	}
}

// =============================================================================
// WRITE YAML HELPER TEST
// =============================================================================

func TestWriteYAML_CreatesDirectories(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "deeply", "nested", "dir", "file.yaml")

	data := map[string]string{"key": "value"}
	path, err := writeYAML(nested, data)
	if err != nil {
		t.Fatalf("writeYAML failed: %v", err)
	}
	if path != nested {
		t.Errorf("expected path %s, got %s", nested, path)
	}
	if _, err := os.Stat(nested); os.IsNotExist(err) {
		t.Error("expected file to be created")
	}
}
