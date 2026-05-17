package decompose

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

// DecomposePayload decomposes a single artifact payload (parsed from JSONB or
// YAML) into graph objects and structural relationships. This is the in-memory
// counterpart to DecomposeInstance — it does not touch the filesystem.
//
// artifactType must be one of the supported EPF artifact types:
//
//	"north_star", "insight_analyses", "strategy_foundations",
//	"insight_opportunity", "strategy_formula", "roadmap_recipe",
//	"feature", "value_model"
//
// The payload should be the artifact's JSONB content as map[string]any.
// For features, the payload is the feature definition root (with id, name, etc.).
// For value_models, the payload is the value model root (with track_name, layers).
//
// Note: cross-cutting relationships (informs, constrains, validates, shared_technology)
// are NOT generated because they require multiple artifact types to be decomposed
// together. The caller should use DecomposeInstance for full-graph decomposition.
// VMC path resolution for contributes_to edges is also unavailable without the
// full instance context — unresolved paths are emitted with best-effort keys.
func DecomposePayload(artifactType string, payload map[string]any) (*Result, error) {
	d := &Decomposer{
		seenPersonas: make(map[string]bool),
	}
	result := &Result{}

	// Marshal payload back to YAML bytes so we can unmarshal into typed structs.
	// This is safe because all raw structs use yaml tags.
	yamlBytes, err := yaml.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	switch artifactType {
	case "north_star":
		var raw rawNorthStar
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse north_star: %w", err)
		}
		d.decomposeNorthStarRaw(result, &raw)

	case "insight_analyses":
		var raw rawInsightAnalyses
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse insight_analyses: %w", err)
		}
		d.decomposeInsightAnalysesRaw(result, &raw)

		var rawExp rawInsightAnalysesExpanded
		if err := yaml.Unmarshal(yamlBytes, &rawExp); err == nil {
			d.decomposeInsightAnalysesExpandedRaw(result, &rawExp)
		}

	case "strategy_foundations":
		var raw rawStrategyFoundations
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse strategy_foundations: %w", err)
		}
		d.decomposeStrategyFoundationsRaw(result, &raw)

	case "insight_opportunity":
		var raw rawInsightOpportunity
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse insight_opportunity: %w", err)
		}
		d.decomposeInsightOpportunityRaw(result, &raw)

	case "strategy_formula":
		var raw rawStrategyFormula
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse strategy_formula: %w", err)
		}
		d.decomposeStrategyFormulaRaw(result, &raw)

		var rawExp rawStrategyFormulaExpanded
		if err := yaml.Unmarshal(yamlBytes, &rawExp); err == nil {
			d.decomposeStrategyFormulaExpandedRaw(result, &rawExp)
		}

	case "roadmap_recipe", "roadmap":
		var raw rawRoadmap
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse roadmap: %w", err)
		}
		d.decomposeRoadmapRaw(result, &raw)

	case "feature":
		var raw rawFeature
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse feature: %w", err)
		}
		if raw.ID == "" {
			return nil, fmt.Errorf("feature payload missing id field")
		}
		d.decomposeFeatureRaw(result, &raw, fmt.Sprintf("feature:%s", raw.ID))

	case "value_model":
		var raw rawValueModel
		if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
			return nil, fmt.Errorf("parse value_model: %w", err)
		}
		if len(raw.Layers) == 0 {
			return nil, fmt.Errorf("value_model payload has no layers")
		}
		d.decomposeValueModelRaw(result, &raw, "value_model")

	default:
		return nil, fmt.Errorf("unsupported artifact type: %s", artifactType)
	}

	return result, nil
}
