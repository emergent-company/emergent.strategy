package mcpserver

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
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

	// Semantic signals — populated when Memory graph is available.
	SemanticAvailable bool             `json:"semantic_available"`
	Semantic          *SemanticSignals `json:"semantic,omitempty"`
}

// SemanticSignals are graph-based maturity indicators from the Memory graph.
type SemanticSignals struct {
	// Graph topology.
	GraphNodeCount         int     `json:"graph_node_count"`
	GraphEdgeCount         int     `json:"graph_edge_count"`
	AvgEdgesPerNode        float64 `json:"avg_edges_per_node"`
	OrphanedNodeCount      int     `json:"orphaned_node_count"`
	OrphanedNodes          []string `json:"orphaned_nodes,omitempty"`

	// Strategic coherence.
	VisionConnected        bool    `json:"vision_connected"`         // north star has outgoing edges
	VisionReachableFeatures int    `json:"vision_reachable_features"` // features reachable from north star via BFS
	ContributesToEdges     int     `json:"contributes_to_edges"`     // features → value model paths
	TestsAssumptionEdges   int     `json:"tests_assumption_edges"`
	DependsOnEdges         int     `json:"depends_on_edges"`

	// Content depth.
	PersonaCount           int     `json:"persona_count"`
	CapabilityCount        int     `json:"capability_count"`
	AssumptionCount        int     `json:"assumption_count"`

	// Maturity score (0-100) computed from all signals.
	MaturityScore          int     `json:"maturity_score"`
	MaturityLevel          string  `json:"maturity_level"` // "nascent", "emerging", "coherent", "mature"
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

	// Enrich with semantic signals from the Memory graph (non-blocking).
	if svc.Semantic != nil && svc.Semantic.IsAvailable() {
		enrichWithSemantics(ctx, svc.Semantic.Client(), &signals)
	}

	// Determine mode.
	return assessMode(signals, inst.ID)
}

// enrichWithSemantics queries the Memory graph to add semantic maturity signals.
// Non-fatal — if Memory is unavailable, signals stay nil.
func enrichWithSemantics(ctx context.Context, client *memory.Client, signals *LifecycleSignals) {
	if client == nil {
		return
	}

	sem := &SemanticSignals{}

	// 1. Count objects by type.
	objectPage, err := client.ListObjects(ctx, memory.ListObjectsOptions{Limit: 1})
	if err != nil {
		slog.Debug("lifecycle: memory list objects failed", "err", err)
		return // Memory not reachable — skip semantic enrichment
	}
	sem.GraphNodeCount = objectPage.Total

	// Count specific types.
	for _, objType := range []struct {
		memType string
		target  *int
	}{
		{"Persona", &sem.PersonaCount},
		{"Capability", &sem.CapabilityCount},
		{"Assumption", &sem.AssumptionCount},
	} {
		page, err := client.ListObjects(ctx, memory.ListObjectsOptions{
			Type:  objType.memType,
			Limit: 1,
		})
		if err == nil {
			*objType.target = page.Total
		}
	}

	// 2. Count relationships by type.
	relPage, err := client.ListRelationships(ctx, memory.ListRelationshipsOptions{Limit: 1})
	if err == nil {
		sem.GraphEdgeCount = relPage.Total
	}

	// Average edges per node.
	if sem.GraphNodeCount > 0 {
		sem.AvgEdgesPerNode = float64(sem.GraphEdgeCount) / float64(sem.GraphNodeCount)
	}

	// Count specific relationship types.
	for _, relType := range []struct {
		memType string
		target  *int
	}{
		{"contributes_to", &sem.ContributesToEdges},
		{"tests_assumption", &sem.TestsAssumptionEdges},
		{"depends_on", &sem.DependsOnEdges},
	} {
		page, err := client.ListRelationships(ctx, memory.ListRelationshipsOptions{
			Type:  relType.memType,
			Limit: 1,
		})
		if err == nil {
			*relType.target = page.Total
		}
	}

	// 3. Check vision connectivity — can we reach features from the north star?
	northStar, err := client.GetObjectByKey(ctx, "Artifact:READY/00_north_star.yaml")
	if err == nil && northStar != nil {
		sem.VisionConnected = true
		// BFS from north star to find reachable features.
		expandResult, err := client.Expand(ctx, memory.ExpandRequest{
			RootIDs:  []string{northStar.StableID()},
			MaxDepth: 4,
			MaxNodes: 200,
		})
		if err == nil {
			for _, obj := range expandResult.Objects {
				if obj.Type == "Feature" {
					sem.VisionReachableFeatures++
				}
			}
		}
	}

	// 4. Find orphaned nodes (nodes with 0 edges).
	// Sample up to 50 objects and check their edge count.
	samplePage, err := client.ListObjects(ctx, memory.ListObjectsOptions{Limit: 50})
	if err == nil {
		for _, obj := range samplePage.Items {
			edges, edgeErr := client.ObjectEdges(ctx, obj.StableID())
			if edgeErr == nil && len(edges.Outgoing)+len(edges.Incoming) == 0 {
				sem.OrphanedNodeCount++
				if len(sem.OrphanedNodes) < 5 { // cap at 5 examples
					sem.OrphanedNodes = append(sem.OrphanedNodes, obj.Key)
				}
			}
		}
	}

	// 5. Compute maturity score (0-100).
	sem.MaturityScore = computeMaturityScore(sem, signals)
	switch {
	case sem.MaturityScore >= 75:
		sem.MaturityLevel = "mature"
	case sem.MaturityScore >= 50:
		sem.MaturityLevel = "coherent"
	case sem.MaturityScore >= 25:
		sem.MaturityLevel = "emerging"
	default:
		sem.MaturityLevel = "nascent"
	}

	signals.SemanticAvailable = true
	signals.Semantic = sem
}

// computeMaturityScore derives a 0-100 maturity score from semantic and structural signals.
func computeMaturityScore(sem *SemanticSignals, structural *LifecycleSignals) int {
	score := 0
	maxScore := 0

	// Graph density (0-20 points).
	maxScore += 20
	if sem.AvgEdgesPerNode >= 3.0 {
		score += 20
	} else if sem.AvgEdgesPerNode >= 1.5 {
		score += 15
	} else if sem.AvgEdgesPerNode >= 0.5 {
		score += 8
	}

	// Strategic alignment — contributes_to edges (0-20 points).
	maxScore += 20
	if sem.ContributesToEdges >= 5 {
		score += 20
	} else if sem.ContributesToEdges >= 2 {
		score += 12
	} else if sem.ContributesToEdges >= 1 {
		score += 5
	}

	// Vision connectivity (0-15 points).
	maxScore += 15
	if sem.VisionConnected && sem.VisionReachableFeatures >= 3 {
		score += 15
	} else if sem.VisionConnected && sem.VisionReachableFeatures >= 1 {
		score += 10
	} else if sem.VisionConnected {
		score += 5
	}

	// Assumption testing (0-15 points).
	maxScore += 15
	if sem.TestsAssumptionEdges >= 3 {
		score += 15
	} else if sem.TestsAssumptionEdges >= 1 {
		score += 8
	}

	// Content depth — personas, capabilities (0-15 points).
	maxScore += 15
	depthItems := sem.PersonaCount + sem.CapabilityCount
	if depthItems >= 10 {
		score += 15
	} else if depthItems >= 5 {
		score += 10
	} else if depthItems >= 2 {
		score += 5
	}

	// Low orphan rate (0-15 points).
	maxScore += 15
	if sem.GraphNodeCount > 0 {
		orphanRate := float64(sem.OrphanedNodeCount) / float64(sem.GraphNodeCount)
		if orphanRate <= 0.05 {
			score += 15
		} else if orphanRate <= 0.15 {
			score += 10
		} else if orphanRate <= 0.30 {
			score += 5
		}
	}

	// Normalize to 0-100.
	if maxScore == 0 {
		return 0
	}
	return (score * 100) / maxScore
}

func maturityAdvice(level string) string {
	switch level {
	case "nascent":
		return "Most graph nodes are disconnected. Focus on adding relationships between artifacts."
	case "emerging":
		return "Some connections exist but the graph is sparse. Add contributes_to and tests_assumption edges."
	case "coherent":
		return "Good graph structure. Consider deepening with more personas, capabilities, and assumption tests."
	case "mature":
		return "Strong graph connectivity. Focus on maintenance, version tracking, and periodic review."
	default:
		return ""
	}
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

	// Recalibration needed: structural staleness OR semantic signals showing decay.
	recalibrationNeeded := false
	recalibrationReasons := []string{}

	// Structural: stale instance with history.
	if s.DaysSinceUpdate > 30 && s.VersionCount >= 2 {
		recalibrationNeeded = true
		recalibrationReasons = append(recalibrationReasons,
			"Strategy hasn't been updated in over 30 days despite having multiple versions.")
	}

	// Semantic: graph shows structural decay.
	if s.Semantic != nil {
		if s.Semantic.MaturityScore < 25 && s.FeatureCount >= 3 {
			recalibrationNeeded = true
			recalibrationReasons = append(recalibrationReasons,
				"Semantic maturity is nascent despite having features — graph connections are weak or missing.")
		}
		if s.Semantic.OrphanedNodeCount > 5 {
			recalibrationNeeded = true
			recalibrationReasons = append(recalibrationReasons,
				fmt.Sprintf("%d orphaned nodes in the knowledge graph — content exists but is disconnected.", s.Semantic.OrphanedNodeCount))
		}
		if s.Semantic.VisionConnected && s.Semantic.VisionReachableFeatures == 0 && s.FeatureCount > 0 {
			recalibrationNeeded = true
			recalibrationReasons = append(recalibrationReasons,
				"Vision exists but no features are reachable from it — strategic alignment is broken.")
		}
		if s.Semantic.ContributesToEdges == 0 && s.FeatureCount >= 2 {
			recalibrationNeeded = true
			recalibrationReasons = append(recalibrationReasons,
				"No features have contributes_to relationships — features are not connected to value model paths.")
		}
	}

	if recalibrationNeeded {
		steps := []string{
			"Use get_agent('synthesizer') for a guided strategic assessment.",
			"Create a Living Reality Assessment — use create_lra to capture current strategic context.",
			"Use validate_assumptions to check which assumptions are untested.",
			"Use get_coverage_analysis to identify value model gaps.",
			"After assessment, use diff_versions to compare your current state with an earlier version.",
		}
		if s.Semantic != nil && s.Semantic.OrphanedNodeCount > 0 {
			steps = append(steps,
				"Use suggest_relationships on each feature to find missing connections.")
		}

		desc := "Strategic review recommended."
		if len(recalibrationReasons) > 0 {
			desc = recalibrationReasons[0]
		}

		return LifecycleMode{
			Mode:        "recalibration_needed",
			Description: desc,
			NextSteps:   steps,
			Signals:     s,
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
		// Semantic-specific guidance.
		if s.Semantic != nil {
			if s.Semantic.ContributesToEdges == 0 {
				steps = append(steps, "Critical: No features are linked to value model paths — use add_relationship with 'contributes_to' to connect features to your value model.")
			}
			if s.Semantic.OrphanedNodeCount > 3 {
				steps = append(steps, fmt.Sprintf("Warning: %d orphaned nodes in the graph — use suggest_relationships to find missing connections.", s.Semantic.OrphanedNodeCount))
			}
			if s.Semantic.MaturityLevel != "" {
				steps = append(steps, fmt.Sprintf("Semantic maturity: %s (score: %d/100) — %s",
					s.Semantic.MaturityLevel, s.Semantic.MaturityScore, maturityAdvice(s.Semantic.MaturityLevel)))
			}
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
	if s.Semantic != nil {
		if s.Semantic.MaturityLevel != "" {
			steps = append(steps, fmt.Sprintf("Semantic maturity: %s (score: %d/100) — %s",
				s.Semantic.MaturityLevel, s.Semantic.MaturityScore, maturityAdvice(s.Semantic.MaturityLevel)))
		}
		if s.Semantic.OrphanedNodeCount > 0 {
			steps = append(steps, fmt.Sprintf("%d orphaned nodes detected — use suggest_relationships to improve graph connectivity.", s.Semantic.OrphanedNodeCount))
		}
	}

	return LifecycleMode{
		Mode:        "operating",
		Description: "Mature strategy in active operation — foundation, features, and versions are established.",
		NextSteps:   steps,
		Signals:     s,
	}
}
