package mcpserver

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// LifecycleMode identifies where an instance is in its strategic lifecycle.
type LifecycleMode struct {
	// Mode is one of: "bootstrap", "foundation", "building", "operating", "recalibration_needed".
	Mode string `json:"mode"`
	// Description explains the mode in plain language.
	Description string `json:"description"`
	// NextSteps are concrete actions the user should take.
	NextSteps []string `json:"next_steps"`
	// Signals are the raw data points that led to this assessment.
	Signals LifecycleSignals `json:"signals"`
}

// LifecycleSignals are the raw data used to determine lifecycle mode.
type LifecycleSignals struct {
	ArtifactCount     int      `json:"artifact_count"`
	FeatureCount      int      `json:"feature_count"`
	VersionCount      int      `json:"version_count"`
	HasNorthStar      bool     `json:"has_north_star"`
	HasFoundations    bool     `json:"has_foundations"`
	HasFormula        bool     `json:"has_formula"`
	HasRoadmap        bool     `json:"has_roadmap"`
	HasValueModel     bool     `json:"has_value_model"`
	MissingFoundation []string `json:"missing_foundation,omitempty"`
	InstanceStatus    string   `json:"instance_status"`
	DaysSinceCreation int      `json:"days_since_creation"`
	DaysSinceUpdate   int      `json:"days_since_last_update"`
}

// detectLifecycleMode analyzes an instance's state and returns a lifecycle assessment.
func detectLifecycleMode(
	ctx context.Context,
	svc Services,
	inst *domain.StrategyInstance,
	artifacts []*domain.StrategyArtifact,
) LifecycleMode {
	now := time.Now().UTC()
	signals := LifecycleSignals{
		ArtifactCount:     len(artifacts),
		InstanceStatus:    inst.Status,
		DaysSinceCreation: int(now.Sub(inst.CreatedAt.UTC()).Hours() / 24),
		DaysSinceUpdate:   int(now.Sub(inst.UpdatedAt.UTC()).Hours() / 24),
	}

	// Analyze artifact types.
	for _, a := range artifacts {
		switch a.ArtifactType {
		case "feature":
			signals.FeatureCount++
		case "north_star":
			signals.HasNorthStar = true
		case "strategy_foundations":
			signals.HasFoundations = true
		case "strategy_formula":
			signals.HasFormula = true
		case "roadmap_recipe":
			signals.HasRoadmap = true
		case "value_model":
			signals.HasValueModel = true
		}
	}

	// Check missing foundation artifacts.
	if !signals.HasNorthStar {
		signals.MissingFoundation = append(signals.MissingFoundation, "north_star")
	}
	if !signals.HasFoundations {
		signals.MissingFoundation = append(signals.MissingFoundation, "strategy_foundations")
	}
	if !signals.HasFormula {
		signals.MissingFoundation = append(signals.MissingFoundation, "strategy_formula")
	}

	// Count versions if service is available.
	if svc.Version != nil {
		versions, err := svc.Version.List(ctx, inst.ID)
		if err == nil {
			signals.VersionCount = len(versions)
		}
	}

	// Determine mode.
	return assessMode(signals, inst.ID)
}

func assessMode(s LifecycleSignals, instanceID uuid.UUID) LifecycleMode {
	// Bootstrap: no real content yet.
	if s.ArtifactCount == 0 {
		return LifecycleMode{
			Mode:        "bootstrap",
			Description: "Empty instance — no artifacts created yet.",
			NextSteps: []string{
				"Option A: Use scaffold_instance to create a new instance with READY-phase templates pre-populated.",
				"Option B: Use get_agent('start-epf') for guided onboarding.",
				"Option C: Use get_agent('lean-start') for a quick lightweight setup.",
			},
			Signals: s,
		}
	}

	// Foundation: has some artifacts but missing key READY-phase pieces.
	if len(s.MissingFoundation) > 0 || s.FeatureCount == 0 {
		steps := []string{}
		if !s.HasNorthStar {
			steps = append(steps, "Create your North Star — use get_template('READY/00_north_star.yaml') for the structure, then update_north_star.")
		}
		if !s.HasFoundations {
			steps = append(steps, "Define strategy foundations — use update_strategy_foundations with product vision, value proposition, and sequencing.")
		}
		if !s.HasFormula {
			steps = append(steps, "Write the strategy formula — use update_strategy_formula with positioning, competitive moat, and success metrics.")
		}
		if !s.HasRoadmap {
			steps = append(steps, "Create a roadmap — use update_roadmap with tracks, milestones, and execution plan.")
		}
		if !s.HasValueModel {
			steps = append(steps, "Define a value model — use update_value_model to map capability layers.")
		}
		if s.FeatureCount == 0 {
			steps = append(steps, "Create your first feature — use create_feature with strategic_context.contributes_to linking to your value model.")
		}
		if s.VersionCount == 0 && s.ArtifactCount >= 3 {
			steps = append(steps, "When ready, use publish_version to snapshot your foundation.")
		}

		return LifecycleMode{
			Mode:        "foundation",
			Description: "Building the strategic foundation — some READY-phase artifacts are missing.",
			NextSteps:   steps,
			Signals:     s,
		}
	}

	// Recalibration needed: has everything but hasn't been updated in a while,
	// or has many versions suggesting frequent changes.
	if s.DaysSinceUpdate > 30 && s.VersionCount >= 2 {
		return LifecycleMode{
			Mode:        "recalibration_needed",
			Description: "Strategy has been stable for over 30 days with multiple versions — consider a strategic review.",
			NextSteps: []string{
				"Use get_agent('synthesizer') for a guided strategic assessment.",
				"Create a Living Reality Assessment — use create_lra to capture current strategic context.",
				"Use validate_assumptions to check which assumptions are untested.",
				"Use get_coverage_analysis to identify value model gaps.",
				"After assessment, use diff_versions to compare your current state with an earlier version.",
			},
			Signals: s,
		}
	}

	// Building: has foundation, has features, actively evolving.
	if s.FeatureCount > 0 && s.FeatureCount < 10 && s.VersionCount < 3 {
		steps := []string{
			"Continue building features — use create_feature with strategic alignment.",
			"Use suggest_relationships to find missing cross-artifact connections.",
			"Use validate_instance to check schema compliance across all artifacts.",
		}
		if s.VersionCount == 0 {
			steps = append(steps, "Publish your first version — use publish_version to create a snapshot.")
		}
		if !s.HasRoadmap {
			steps = append(steps, "Create a roadmap to sequence your features — use update_roadmap.")
		}

		return LifecycleMode{
			Mode:        "building",
			Description: "Actively building strategy — foundation is set, features are being defined.",
			NextSteps:   steps,
			Signals:     s,
		}
	}

	// Operating: mature instance with foundation, features, versions.
	steps := []string{
		"Use health_check and validate_instance regularly to maintain quality.",
		"Use publish_version after significant changes to track evolution.",
		"Use diff_versions to review what changed between versions.",
		"Use get_coverage_analysis to ensure all value model paths are covered.",
		"Use validate_assumptions to track which strategic assumptions are tested.",
	}
	if s.DaysSinceUpdate > 14 {
		steps = append(steps, "Consider a strategic review — the instance hasn't been updated in "+
			"over 2 weeks. Use get_agent('synthesizer') for a guided assessment.")
	}

	return LifecycleMode{
		Mode:        "operating",
		Description: "Mature strategy in active operation — foundation, features, and versions are established.",
		NextSteps:   steps,
		Signals:     s,
	}
}
