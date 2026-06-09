package handler

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// ---------------------------------------------------------------------------
// computeReadyReadiness — Group 5/11
// ---------------------------------------------------------------------------

func TestComputeReadyReadiness_Empty(t *testing.T) {
	data := ui.ReadyPhaseData{}
	score, blockers, items := computeReadyReadiness(data)
	// 0 artifacts = 0 pts; no evidence = 0 pts; no pending batches = +8 pts
	if score != 8 {
		t.Errorf("empty data: score=%d, want 8", score)
	}
	// Blockers: 6 missing artifacts
	if len(blockers) != 6 {
		t.Errorf("empty data: expected 6 blockers, got %d: %v", len(blockers), blockers)
	}
	// Items: 6 artifacts + product_portfolio + evidence + pending = 9
	if len(items) != 9 {
		t.Errorf("expected 9 readiness items, got %d", len(items))
	}
}

func TestComputeReadyReadiness_AllArtifacts(t *testing.T) {
	data := ui.ReadyPhaseData{
		NorthStarExists:   true,
		InsightExists:     true,
		OpportunityExists: true,
		FoundationExists:  true,
		FormulaExists:     true,
		RoadmapExists:     true,
		EvidenceCount:     3,
	}
	score, blockers, items := computeReadyReadiness(data)
	// 6×14 = 84 + 8 (evidence) + 8 (no pending batches) = 100
	if score != 100 {
		t.Errorf("all artifacts + evidence: score=%d, want 100", score)
	}
	// No missing artifact blockers; evidence blocker gone; pending batches blocker gone
	for _, b := range blockers {
		t.Errorf("unexpected blocker: %q", b)
	}
	_ = blockers
	// Items should reflect completion state
	for _, item := range items {
		if item.MaxPts > 0 && !item.Done {
			t.Errorf("scored item %q should be done", item.Label)
		}
	}
	_ = items
}

func TestComputeReadyReadiness_PartialArtifacts(t *testing.T) {
	// Only North Star + evidence
	data := ui.ReadyPhaseData{
		NorthStarExists: true,
		EvidenceCount:   2,
	}
	score, blockers, items := computeReadyReadiness(data)
	// 1×14 + 8 (evidence) + 8 (no pending) = 30
	if score != 30 {
		t.Errorf("partial: score=%d, want 30", score)
	}
	// Should have 5 missing artifact blockers
	missingCount := 0
	for _, b := range blockers {
		if len(b) > 8 && b[:8] == "Missing:" {
			missingCount++
		}
	}
	if missingCount != 5 {
		t.Errorf("expected 5 missing blockers, got %d", missingCount)
	}
	// Items: North Star should be done, others not
	for _, item := range items {
		if item.Label == "North Star" && !item.Done {
			t.Error("North Star should be done")
		}
	}
	_ = items
}

func TestComputeReadyReadiness_ReadinessThreshold(t *testing.T) {
	// 5 artifacts + evidence → should be just under 80
	data := ui.ReadyPhaseData{
		NorthStarExists:   true,
		InsightExists:     true,
		OpportunityExists: true,
		FoundationExists:  true,
		FormulaExists:     true,
		EvidenceCount:     2,
	}
	score, _, _ := computeReadyReadiness(data)
	// 5×14 + 8 + 8 = 86 — above 80
	if score != 86 {
		t.Errorf("5 artifacts + evidence: score=%d, want 86", score)
	}
	if score < 80 {
		t.Error("score should be >= 80 with 5 artifacts and evidence")
	}
}

func TestComputeReadyReadiness_PendingBatchesDocked(t *testing.T) {
	data := ui.ReadyPhaseData{
		NorthStarExists:   true,
		InsightExists:     true,
		OpportunityExists: true,
		FoundationExists:  true,
		FormulaExists:     true,
		RoadmapExists:     true,
		EvidenceCount:     3,
		PendingBatches:    []ui.ReadyPendingBatch{{BatchID: "b1"}},
	}
	score, _, items := computeReadyReadiness(data)
	// Without pending dock: 100; with dock: 92
	if score != 92 {
		t.Errorf("with pending batches: score=%d, want 92", score)
	}
	// "No pending drafts" item should not be done
	for _, item := range items {
		if item.Label == "No pending drafts" && item.Done {
			t.Error("'No pending drafts' should not be done when batches are pending")
		}
	}
}

// ---------------------------------------------------------------------------
// evidenceSufficiencySpec — Group 2/11
// ---------------------------------------------------------------------------

func TestEvidenceSufficiencySpec_AllTypesPresent(t *testing.T) {
	expected := []string{
		"north_star",
		"insight_analyses",
		"insight_opportunity",
		"strategy_formula",
		"strategy_foundations",
		"roadmap_recipe",
	}
	for _, artType := range expected {
		if _, ok := evidenceSufficiencySpec[artType]; !ok {
			t.Errorf("evidenceSufficiencySpec missing artifact type %q", artType)
		}
	}
}

func TestEvidenceSufficiencySpec_MinCountsReasonable(t *testing.T) {
	for artType, spec := range evidenceSufficiencySpec {
		if spec.MinCount < 1 {
			t.Errorf("artifact type %q has MinCount=%d, want >= 1", artType, spec.MinCount)
		}
		if len(spec.RequiredTags) == 0 {
			t.Errorf("artifact type %q has no RequiredTags", artType)
		}
	}
}

// ---------------------------------------------------------------------------
// guidedInterviewQuestions — Group 1/11
// ---------------------------------------------------------------------------

func TestGuidedInterviewQuestions_Coverage(t *testing.T) {
	if len(guidedInterviewQuestions) < 4 {
		t.Errorf("expected >= 4 guided interview questions, got %d", len(guidedInterviewQuestions))
	}
	seenIDs := map[string]bool{}
	for _, q := range guidedInterviewQuestions {
		if q.ID == "" {
			t.Error("question has empty ID")
		}
		if seenIDs[q.ID] {
			t.Errorf("duplicate question ID: %q", q.ID)
		}
		seenIDs[q.ID] = true
		if q.Question == "" {
			t.Errorf("question %q has empty Question", q.ID)
		}
		if len(q.Tags) == 0 {
			t.Errorf("question %q has no tags", q.ID)
		}
	}
}

// ---------------------------------------------------------------------------
// readyDraftSkills prerequisite map — Group 4/11
// ---------------------------------------------------------------------------

func TestReadyDraftSkills_AllSkillsConfigured(t *testing.T) {
	expectedKeys := []string{"north-star", "insights", "foundations", "opportunity", "formula", "roadmap"}
	for _, key := range expectedKeys {
		cfg, ok := readyDraftSkills[key]
		if !ok {
			t.Errorf("readyDraftSkills missing key %q", key)
			continue
		}
		if cfg.skillName == "" {
			t.Errorf("readyDraftSkills[%q].skillName is empty", key)
		}
		if cfg.artifactType == "" {
			t.Errorf("readyDraftSkills[%q].artifactType is empty", key)
		}
	}
}

func TestReadyDraftSkills_PrerequisiteOrder(t *testing.T) {
	// north-star and insights have no prerequisites
	for _, key := range []string{"north-star", "insights"} {
		cfg := readyDraftSkills[key]
		if len(cfg.prereqs) != 0 {
			t.Errorf("readyDraftSkills[%q] should have no prereqs, got %v", key, cfg.prereqs)
		}
	}
	// foundations requires north_star
	foundations := readyDraftSkills["foundations"]
	found := false
	for _, p := range foundations.prereqs {
		if p == "north_star" {
			found = true
		}
	}
	if !found {
		t.Error("readyDraftSkills[foundations] should require north_star")
	}
	// roadmap requires both formula and foundations
	roadmap := readyDraftSkills["roadmap"]
	prereqSet := map[string]bool{}
	for _, p := range roadmap.prereqs {
		prereqSet[p] = true
	}
	if !prereqSet["strategy_formula"] {
		t.Error("readyDraftSkills[roadmap] should require strategy_formula")
	}
	if !prereqSet["strategy_foundations"] {
		t.Error("readyDraftSkills[roadmap] should require strategy_foundations")
	}
}
