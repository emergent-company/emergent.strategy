package decompose

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// ============================================================
// Cross-cutting structural relationships
// These require multiple artifacts to be decomposed first.
// ============================================================

// addInformsEdges creates Belief → Positioning edges.
// Every Belief informs the strategic Positioning — the positioning claims
// are grounded in core beliefs about market, users, and approach.
func (d *Decomposer) addInformsEdges(result *Result) {
	// Collect belief and positioning keys from existing objects
	var beliefKeys []string
	var positioningKeys []string

	for _, obj := range result.Objects {
		switch obj.Type {
		case "Belief":
			beliefKeys = append(beliefKeys, obj.Key)
		case "Positioning":
			positioningKeys = append(positioningKeys, obj.Key)
		}
	}

	// Each belief informs all positioning claims (broad causal influence)
	for _, bKey := range beliefKeys {
		for _, pKey := range positioningKeys {
			d.addRel(result, "informs", bKey, "Belief", pKey, "Positioning",
				map[string]any{"strength": "0.6", "weight": "0.6", "edge_source": "causal"})
		}
	}
}

// addConstrainsEdges creates Assumption → Feature edges (reverse of tests_assumption).
// If a Feature tests an Assumption, the Assumption also constrains the Feature.
func (d *Decomposer) addConstrainsEdges(result *Result) {
	// Find existing tests_assumption relationships and create reverse edges
	for _, rel := range result.Relationships {
		if rel.Type != "tests_assumption" {
			continue
		}
		// tests_assumption: Feature/OKR → Assumption
		// constrains: Assumption → Feature/OKR (reverse)
		d.addRel(result, "constrains", rel.ToKey, rel.ToType, rel.FromKey, rel.FromType,
			map[string]any{"strength": "0.8", "weight": "0.8", "edge_source": "causal"})
	}
}

// addValidatesEdges creates Capability → Assumption edges.
// When a Capability has maturity "proven" or "scaled" and the parent Feature
// has assumptions_tested, the capability's evidence validates those assumptions.
func (d *Decomposer) addValidatesEdges(result *Result) {
	// Build a map of feature key → tested assumption keys
	featureAssumptions := map[string][]string{}
	for _, rel := range result.Relationships {
		if rel.Type == "tests_assumption" && rel.FromType == "Feature" {
			featureAssumptions[rel.FromKey] = append(featureAssumptions[rel.FromKey], rel.ToKey)
		}
	}

	// Build a map of feature key → capability objects
	featureCapabilities := map[string][]memory.UpsertObjectRequest{}
	for _, rel := range result.Relationships {
		if rel.Type == "contains" && rel.FromType == "Feature" && rel.ToType == "Capability" {
			for _, obj := range result.Objects {
				if obj.Key == rel.ToKey {
					featureCapabilities[rel.FromKey] = append(featureCapabilities[rel.FromKey], obj)
					break
				}
			}
		}
	}

	// For each feature with tested assumptions, check if any capabilities are proven/scaled
	for featureKey, asmKeys := range featureAssumptions {
		caps := featureCapabilities[featureKey]
		for _, cap := range caps {
			maturity, _ := cap.Properties["maturity"].(string)
			if maturity != "proven" && maturity != "scaled" {
				continue
			}
			evidence, _ := cap.Properties["evidence"].(string)
			for _, asmKey := range asmKeys {
				d.addRel(result, "validates", cap.Key, "Capability", asmKey, "Assumption",
					map[string]any{
						"strength":    "0.9",
						"weight":      "0.9",
						"edge_source": "causal",
						"evidence":    truncate(evidence, 200),
					})
			}
		}
	}
}

// addSharedTechnologyEdges creates Feature → Feature edges for features
// that share contributes_to paths to the same ValueModelComponent.
func (d *Decomposer) addSharedTechnologyEdges(result *Result) {
	// Build map: value model key → list of feature keys that contribute to it
	vmToFeatures := map[string][]string{}
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromType == "Feature" {
			vmToFeatures[rel.ToKey] = append(vmToFeatures[rel.ToKey], rel.FromKey)
		}
	}

	// For each VMC with 2+ features, create shared_technology edges between all pairs
	seen := map[string]bool{} // avoid duplicate edges
	for vmKey, featureKeys := range vmToFeatures {
		if len(featureKeys) < 2 {
			continue
		}
		// Extract the value model path from the key for metadata
		vmPath := strings.TrimPrefix(vmKey, "ValueModelComponent:value_model:")

		for i := 0; i < len(featureKeys); i++ {
			for j := i + 1; j < len(featureKeys); j++ {
				pairKey := featureKeys[i] + "↔" + featureKeys[j]
				reversePairKey := featureKeys[j] + "↔" + featureKeys[i]
				if seen[pairKey] || seen[reversePairKey] {
					continue
				}
				seen[pairKey] = true
				d.addRel(result, "shared_technology", featureKeys[i], "Feature", featureKeys[j], "Feature",
					map[string]any{
						"weight":           "0.7",
						"edge_source":      "structural",
						"shared_component": vmPath,
					})
			}
		}
	}
}

// ============================================================
// Additional YAML extraction: cross-track dependencies
// ============================================================

// decomposeRoadmapCrossTrackDeps extracts CrossTrackDependency objects from
// the roadmap's cross_track_dependencies section. Called from decomposeRoadmap.
func (d *Decomposer) decomposeRoadmapCrossTrackDeps(raw interface{}, artKey string, result *Result) {
	// The cross_track_dependencies are already parsed in the rawRoadmap struct
	// but were not decomposed. We need to handle them via a generic approach
	// since rawRoadmap doesn't have the field yet.
}

// ============================================================
// Additional extraction from roadmap cross_track_dependencies
// ============================================================

type rawCrossTrackDeps struct {
	Roadmap struct {
		CrossTrackDependencies []struct {
			FromKR         string `yaml:"from_kr"`
			ToKR           string `yaml:"to_kr"`
			DependencyType string `yaml:"dependency_type"`
			Description    string `yaml:"description"`
		} `yaml:"cross_track_dependencies"`
		SolutionScaffold struct {
			TechnicalConstraints []string `yaml:"technical_constraints"`
		} `yaml:"solution_scaffold"`
	} `yaml:"roadmap"`
}

// decomposeRoadmapExtras extracts cross-track dependencies and technical constraints
// from the roadmap. These are not in the rawRoadmap struct because it was built
// before these types existed.
func (d *Decomposer) decomposeRoadmapExtras(artKey string, result *Result) {
	var raw rawCrossTrackDeps
	if err := d.readYAML("READY/05_roadmap_recipe.yaml", &raw); err != nil {
		return
	}

	// Cross-track dependencies
	for i, dep := range raw.Roadmap.CrossTrackDependencies {
		if dep.FromKR == "" || dep.ToKR == "" {
			continue
		}
		depID := fmt.Sprintf("ctd-%d-%s-%s", i, dep.FromKR, dep.ToKR)
		depKey := objectKey("CrossTrackDependency", fmt.Sprintf("roadmap:%s", depID))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "CrossTrackDependency", Key: depKey,
			Properties: map[string]any{
				"name":            truncate(dep.Description, 60),
				"description":     dep.Description,
				"from_kr":         dep.FromKR,
				"to_kr":           dep.ToKR,
				"dependency_type": dep.DependencyType,
				"inertia_tier":    "4",
				"source_artifact": "READY/05_roadmap_recipe.yaml",
				"section_path":    fmt.Sprintf("roadmap.cross_track_dependencies[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", depKey, "CrossTrackDependency")

		// converges_at: CrossTrackDependency → to_kr OKR
		toKRKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", dep.ToKR))
		d.addRel(result, "converges_at", depKey, "CrossTrackDependency", toKRKey, "OKR",
			map[string]any{"weight": "1.0", "edge_source": "structural"})

		// Also link from_kr to the dependency via delivers (the from_kr delivers to the to_kr's feature)
		fromKRKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", dep.FromKR))
		d.addRel(result, "converges_at", depKey, "CrossTrackDependency", fromKRKey, "OKR",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// Technical constraints from roadmap solution scaffold
	for _, track := range []string{"product", "strategy", "org_ops", "commercial"} {
		d.decomposeTrackConstraints(artKey, track, result)
	}
}

// decomposeTrackConstraints extracts technical constraints from per-track solution scaffolds.
func (d *Decomposer) decomposeTrackConstraints(artKey, track string, result *Result) {
	// Read the raw roadmap to find technical_constraints in each track's solution_scaffold
	type trackScaffold struct {
		Roadmap struct {
			Tracks map[string]struct {
				SolutionScaffold struct {
					TechnicalConstraints []string `yaml:"technical_constraints"`
				} `yaml:"solution_scaffold"`
			} `yaml:"tracks"`
		} `yaml:"roadmap"`
	}
	var raw trackScaffold
	if err := d.readYAML("READY/05_roadmap_recipe.yaml", &raw); err != nil {
		return
	}

	trackData, ok := raw.Roadmap.Tracks[track]
	if !ok {
		return
	}

	for i, constraint := range trackData.SolutionScaffold.TechnicalConstraints {
		if constraint == "" {
			continue
		}
		constraintKey := objectKey("Constraint", fmt.Sprintf("roadmap:%s:constraint-%d", track, i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Constraint", Key: constraintKey,
			Properties: map[string]any{
				"name":            truncate(constraint, 60),
				"description":     constraint,
				"constraint_type": "technical",
				"inertia_tier":    "3",
				"source_artifact": "READY/05_roadmap_recipe.yaml",
				"section_path":    fmt.Sprintf("roadmap.tracks.%s.solution_scaffold.technical_constraints[%d]", track, i),
			},
		})
		d.addContains(result, artKey, "Artifact", constraintKey, "Constraint")
	}
}
