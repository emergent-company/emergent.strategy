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

// Verify the unused import is addressed.
var _ = domain.ArtifactTypeFeature
