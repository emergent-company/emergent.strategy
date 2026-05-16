package mcpserver

import (
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestAssessMode_Bootstrap(t *testing.T) {
	s := LifecycleSignals{ArtifactCount: 0}
	result := assessMode(s, uuid.New())
	if result.Mode != "bootstrap" {
		t.Errorf("mode=%q, want bootstrap", result.Mode)
	}
	if len(result.NextSteps) == 0 {
		t.Error("expected next steps for bootstrap mode")
	}
}

func TestAssessMode_Foundation_MissingAll(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:     1, // has something but not complete
		MissingFoundation: []string{"north_star", "strategy_foundations", "strategy_formula"},
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "foundation" {
		t.Errorf("mode=%q, want foundation", result.Mode)
	}
	if len(result.Signals.MissingFoundation) != 3 {
		t.Errorf("missing=%d, want 3 (north_star, foundations, formula)", len(result.Signals.MissingFoundation))
	}
}

func TestAssessMode_Foundation_NoFeatures(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:  5,
		HasNorthStar:   true,
		HasFoundations: true,
		HasFormula:     true,
		HasRoadmap:     true,
		HasValueModel:  true,
		FeatureCount:   0, // no features yet
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "foundation" {
		t.Errorf("mode=%q, want foundation (no features yet)", result.Mode)
	}
}

func TestAssessMode_Building(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:  8,
		FeatureCount:   3,
		HasNorthStar:   true,
		HasFoundations: true,
		HasFormula:     true,
		HasRoadmap:     true,
		HasValueModel:  true,
		VersionCount:   1,
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "building" {
		t.Errorf("mode=%q, want building", result.Mode)
	}
}

func TestAssessMode_Operating(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:   20,
		FeatureCount:    12,
		HasNorthStar:    true,
		HasFoundations:  true,
		HasFormula:      true,
		HasRoadmap:      true,
		HasValueModel:   true,
		VersionCount:    5,
		DaysSinceUpdate: 3,
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "operating" {
		t.Errorf("mode=%q, want operating", result.Mode)
	}
}

func TestAssessMode_RecalibrationNeeded(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:   15,
		FeatureCount:    8,
		HasNorthStar:    true,
		HasFoundations:  true,
		HasFormula:      true,
		HasRoadmap:      true,
		HasValueModel:   true,
		VersionCount:    3,
		DaysSinceUpdate: 45, // stale
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "recalibration_needed" {
		t.Errorf("mode=%q, want recalibration_needed", result.Mode)
	}
}

func TestAssessMode_FoundationFromTemplates(t *testing.T) {
	// Simulates a scaffold_instance result: has all READY artifacts but they're
	// templates, and no features or versions yet.
	s := LifecycleSignals{
		ArtifactCount:  6,
		FeatureCount:   0,
		HasNorthStar:   true,
		HasFoundations: true,
		HasFormula:     true,
		HasRoadmap:     true,
		HasValueModel:  false,
		VersionCount:   0,
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "foundation" {
		t.Errorf("mode=%q, want foundation (scaffolded, no features)", result.Mode)
	}
	t.Logf("next steps: %v", result.NextSteps)
}

// ---------------------------------------------------------------------------
// Semantic maturity scoring
// ---------------------------------------------------------------------------

func TestComputeMaturityScore_Empty(t *testing.T) {
	sem := &SemanticSignals{}
	structural := &LifecycleSignals{}
	score := computeMaturityScore(sem, structural)
	if score != 0 {
		t.Errorf("score=%d, want 0 for empty graph", score)
	}
}

func TestComputeMaturityScore_Nascent(t *testing.T) {
	sem := &SemanticSignals{
		GraphNodeCount:    10,
		GraphEdgeCount:    2,
		AvgEdgesPerNode:   0.2,
		ContributesToEdges: 0,
	}
	structural := &LifecycleSignals{}
	score := computeMaturityScore(sem, structural)
	if score >= 25 {
		t.Errorf("score=%d, want < 25 for nascent graph", score)
	}
	t.Logf("nascent score: %d", score)
}

func TestComputeMaturityScore_Coherent(t *testing.T) {
	sem := &SemanticSignals{
		GraphNodeCount:          50,
		GraphEdgeCount:          80,
		AvgEdgesPerNode:         1.6,
		ContributesToEdges:      3,
		TestsAssumptionEdges:    2,
		VisionConnected:         true,
		VisionReachableFeatures: 2,
		PersonaCount:            3,
		CapabilityCount:         5,
		OrphanedNodeCount:       3,
	}
	structural := &LifecycleSignals{}
	score := computeMaturityScore(sem, structural)
	if score < 50 || score >= 75 {
		t.Errorf("score=%d, want 50-74 for coherent graph", score)
	}
	t.Logf("coherent score: %d", score)
}

func TestComputeMaturityScore_Mature(t *testing.T) {
	sem := &SemanticSignals{
		GraphNodeCount:          200,
		GraphEdgeCount:          800,
		AvgEdgesPerNode:         4.0,
		ContributesToEdges:      10,
		TestsAssumptionEdges:    5,
		VisionConnected:         true,
		VisionReachableFeatures: 8,
		PersonaCount:            6,
		CapabilityCount:         15,
		OrphanedNodeCount:       2,
	}
	structural := &LifecycleSignals{}
	score := computeMaturityScore(sem, structural)
	if score < 75 {
		t.Errorf("score=%d, want >= 75 for mature graph", score)
	}
	t.Logf("mature score: %d", score)
}

func TestAssessMode_RecalibrationFromSemantics(t *testing.T) {
	// Has features and foundation but graph shows decay.
	s := LifecycleSignals{
		ArtifactCount:   10,
		FeatureCount:    5,
		HasNorthStar:    true,
		HasFoundations:  true,
		HasFormula:      true,
		HasRoadmap:      true,
		HasValueModel:   true,
		VersionCount:    1,
		DaysSinceUpdate: 5, // recent — structural check would say "operating"
		SemanticAvailable: true,
		Semantic: &SemanticSignals{
			GraphNodeCount:          50,
			GraphEdgeCount:          10,
			AvgEdgesPerNode:         0.2,
			ContributesToEdges:      0, // no value alignment!
			OrphanedNodeCount:       8,
			VisionConnected:         true,
			VisionReachableFeatures: 0, // vision exists but nothing connects
			MaturityScore:           10,
			MaturityLevel:           "nascent",
		},
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "recalibration_needed" {
		t.Errorf("mode=%q, want recalibration_needed (semantic decay)", result.Mode)
	}
	t.Logf("description: %s", result.Description)
}

func TestAssessMode_BuildingWithSemantics(t *testing.T) {
	s := LifecycleSignals{
		ArtifactCount:   8,
		FeatureCount:    3,
		HasNorthStar:    true,
		HasFoundations:  true,
		HasFormula:      true,
		HasValueModel:   true,
		VersionCount:    1,
		SemanticAvailable: true,
		Semantic: &SemanticSignals{
			ContributesToEdges: 2,
			OrphanedNodeCount:  1,
			MaturityScore:      45,
			MaturityLevel:      "emerging",
		},
	}
	result := assessMode(s, uuid.New())
	if result.Mode != "building" {
		t.Errorf("mode=%q, want building", result.Mode)
	}
	// Should include semantic advice.
	hasMaturity := false
	for _, step := range result.NextSteps {
		if len(step) > 0 && step[0:8] == "Semantic" {
			hasMaturity = true
		}
	}
	if !hasMaturity {
		t.Error("expected semantic maturity info in next_steps")
	}
}

func TestMaturityAdvice(t *testing.T) {
	for _, level := range []string{"nascent", "emerging", "coherent", "mature"} {
		advice := maturityAdvice(level)
		if advice == "" {
			t.Errorf("no advice for level %q", level)
		}
	}
}

// Verify the unused import is addressed.
var _ = domain.ArtifactTypeFeature
