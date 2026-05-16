// Package index provides pure functions for deriving the Strategic Index
// (strategy_artifacts fields + strategy_relationships) from a committed mutation payload.
//
// All functions are stateless and side-effect free — they can be called from
// CommitBatch, the import backfill, and tests without any database access.
package index

import (
	"encoding/json"
	"strings"
)

// ArtifactFields holds the top-level scalar fields extracted from a payload
// that are promoted to strategy_artifacts columns.
type ArtifactFields struct {
	Name   string // display name (empty if not detectable)
	Status string // artifact lifecycle status (defaults to "active")
	Track  string // product | strategy | org_ops | commercial (empty for non-track artifacts)
}

// Relationship is a single cross-artifact reference extracted from a payload.
type Relationship struct {
	TargetKey    string         // artifact key or path of the target
	TargetType   string         // artifact type of the target
	Relationship string         // relationship kind (domain.Rel* constants)
	Metadata     map[string]any // optional extra context
}

// ExtractArtifactFields derives the top-level index fields from a payload.
// artifactType is the EPF artifact type string (e.g. "feature", "north_star").
func ExtractArtifactFields(artifactType string, payload []byte) ArtifactFields {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return ArtifactFields{Status: "active"}
	}

	f := ArtifactFields{Status: "active"}

	switch artifactType {
	case "feature":
		f.Name = strField(raw, "name")
		f.Status = coalesceStr(strField(raw, "status"), "active")
		// track comes from strategic_context.tracks[] — use first value
		if tracks := strSliceNested(raw, "strategic_context", "tracks"); len(tracks) > 0 {
			f.Track = tracks[0]
		}

	case "north_star":
		// name from nested purpose.problem_we_solve or top-level organization
		if ns := nestedMap(raw, "north_star"); ns != nil {
			f.Name = coalesceStr(strField(ns, "organization"), strField(ns, "purpose"))
		} else {
			f.Name = coalesceStr(strField(raw, "organization"), "North Star")
		}

	case "roadmap", "roadmap_recipe":
		if rm := nestedMap(raw, "roadmap"); rm != nil {
			f.Name = coalesceStr(strField(rm, "id"), "Roadmap")
			f.Status = coalesceStr(strField(rm, "status"), "active")
		} else {
			f.Name = "Roadmap"
		}

	case "strategy_foundations":
		f.Name = "Strategy Foundations"

	case "strategy_formula":
		if s := nestedMap(raw, "strategy"); s != nil {
			f.Name = coalesceStr(strField(s, "title"), "Strategy Formula")
		} else {
			f.Name = "Strategy Formula"
		}

	case "insight_analyses":
		f.Name = "Insight Analyses"

	case "insight_opportunity":
		f.Name = "Insight & Opportunity"

	case "value_model":
		f.Name = strField(raw, "track_name")
		f.Status = coalesceStr(strField(raw, "status"), "active")
		f.Track = strings.ToLower(strField(raw, "track_name"))

	case "org_ops_def":
		f.Name = strField(raw, "name")
		f.Status = coalesceStr(strField(raw, "status"), "active")
		f.Track = "org_ops"

	case "commercial_def":
		f.Name = strField(raw, "name")
		f.Status = coalesceStr(strField(raw, "status"), "active")
		f.Track = "commercial"

	case "strategy_def":
		f.Name = strField(raw, "name")
		f.Status = coalesceStr(strField(raw, "status"), "active")
		f.Track = "strategy"

	case "assessment_report":
		f.Name = "Assessment Report"

	case "living_reality_assessment":
		f.Name = "Living Reality Assessment"

	case "aim_trigger_config":
		f.Name = "AIM Trigger Config"

	case "product_portfolio":
		if p := nestedMap(raw, "portfolio"); p != nil {
			f.Name = coalesceStr(strField(p, "name"), "Product Portfolio")
		} else {
			f.Name = "Product Portfolio"
		}

	default:
		// Best-effort: look for common name fields
		f.Name = coalesceStr(
			strField(raw, "name"),
			strField(raw, "title"),
			strField(raw, "id"),
		)
		f.Status = coalesceStr(strField(raw, "status"), "active")
	}

	return f
}

// ExtractRelationships derives all cross-artifact references from a payload.
// Returns an empty slice (never nil) on unknown artifact types or parse errors.
func ExtractRelationships(artifactType, artifactKey string, payload []byte) []Relationship {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil
	}

	switch artifactType {
	case "feature":
		return extractFeatureRelationships(artifactKey, raw)
	case "org_ops_def":
		return extractContributesTo(artifactKey, artifactType, raw)
	case "commercial_def":
		return extractContributesTo(artifactKey, artifactType, raw)
	case "strategy_def":
		return extractContributesTo(artifactKey, artifactType, raw)
	case "roadmap", "roadmap_recipe":
		return extractRoadmapRelationships(artifactKey, raw)
	case "value_model":
		return extractValueModelRelationships(artifactKey, raw)
	case "product_portfolio":
		return extractPortfolioRelationships(artifactKey, raw)
	case "assessment_report":
		return extractAssessmentRelationships(artifactKey, raw)
	case "calibration_memo":
		return extractCalibrationRelationships(artifactKey, raw)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Feature relationships
// ---------------------------------------------------------------------------

func extractFeatureRelationships(key string, raw map[string]any) []Relationship {
	var rels []Relationship

	sc := nestedMap(raw, "strategic_context")
	if sc != nil {
		// contributes_to value model paths
		for _, path := range strSlice(sc, "contributes_to") {
			rels = append(rels, Relationship{
				TargetKey:    path,
				TargetType:   "value_model_path",
				Relationship: "contributes_to",
			})
		}
		// tests_assumption
		for _, asmID := range strSlice(sc, "assumptions_tested") {
			rels = append(rels, Relationship{
				TargetKey:    asmID,
				TargetType:   "assumption",
				Relationship: "tests_assumption",
			})
		}
		// in_track
		for _, track := range strSlice(sc, "tracks") {
			rels = append(rels, Relationship{
				TargetKey:    track,
				TargetType:   "track",
				Relationship: "in_track",
			})
		}
	}

	// depends_on / enables
	deps := nestedMap(raw, "dependencies")
	if deps != nil {
		for _, req := range mapSlice(deps, "requires") {
			if id := strField(req, "id"); id != "" {
				rels = append(rels, Relationship{
					TargetKey:    id,
					TargetType:   "feature",
					Relationship: "depends_on",
					Metadata:     map[string]any{"reason": strField(req, "reason")},
				})
			}
		}
		for _, en := range mapSlice(deps, "enables") {
			if id := strField(en, "id"); id != "" {
				rels = append(rels, Relationship{
					TargetKey:    id,
					TargetType:   "feature",
					Relationship: "enables",
					Metadata:     map[string]any{"reason": strField(en, "reason")},
				})
			}
		}
	}

	// delivered_by_kr — from feature_maturity.capability_maturity[]
	fm := nestedMap(raw, "feature_maturity")
	if fm != nil {
		for _, cm := range mapSlice(fm, "capability_maturity") {
			if kr := strField(cm, "delivered_by_kr"); kr != "" {
				rels = append(rels, Relationship{
					TargetKey:    kr,
					TargetType:   "key_result",
					Relationship: "delivered_by_kr",
					Metadata:     map[string]any{"capability_id": strField(cm, "capability_id")},
				})
			}
		}
	}

	return rels
}

// ---------------------------------------------------------------------------
// Org ops / commercial: contributes_to value model paths
// ---------------------------------------------------------------------------

func extractContributesTo(key, artifactType string, raw map[string]any) []Relationship {
	var rels []Relationship
	for _, path := range strSlice(raw, "contributes_to") {
		rels = append(rels, Relationship{
			TargetKey:    path,
			TargetType:   "value_model_path",
			Relationship: "contributes_to",
		})
	}
	return rels
}

// ---------------------------------------------------------------------------
// Roadmap: cross-track dependencies and assumption linkage
// ---------------------------------------------------------------------------

func extractRoadmapRelationships(key string, raw map[string]any) []Relationship {
	var rels []Relationship

	rm := nestedMap(raw, "roadmap")
	if rm == nil {
		rm = raw
	}

	// cross_track_dependencies
	for _, dep := range mapSlice(rm, "cross_track_dependencies") {
		fromKR := strField(dep, "from_kr")
		toKR := strField(dep, "to_kr")
		depType := strField(dep, "dependency_type")
		if fromKR != "" && toKR != "" {
			rels = append(rels, Relationship{
				TargetKey:    toKR,
				TargetType:   "key_result",
				Relationship: "cross_track_dep",
				Metadata:     map[string]any{"from_kr": fromKR, "dependency_type": depType},
			})
		}
	}

	// assumptions linked_to_kr within each track
	tracks := nestedMap(rm, "tracks")
	if tracks != nil {
		for _, trackName := range []string{"product", "strategy", "org_ops", "commercial"} {
			track := nestedMap(tracks, trackName)
			if track == nil {
				continue
			}
			for _, okr := range mapSlice(track, "okrs") {
				for _, asm := range mapSlice(okr, "riskiest_assumptions") {
					asmID := strField(asm, "id")
					if asmID == "" {
						continue
					}
					for _, kr := range strSlice(asm, "linked_to_kr") {
						rels = append(rels, Relationship{
							TargetKey:    kr,
							TargetType:   "key_result",
							Relationship: "linked_to_kr",
							Metadata:     map[string]any{"assumption_id": asmID},
						})
					}
				}
			}
		}
	}

	return rels
}

// ---------------------------------------------------------------------------
// Value model: product line → value model reference (from product_portfolio)
// ---------------------------------------------------------------------------

func extractValueModelRelationships(key string, raw map[string]any) []Relationship {
	// Value models themselves don't reference other artifacts.
	// The relationship flows the other way (features → value_model_path).
	return nil
}

func extractPortfolioRelationships(key string, raw map[string]any) []Relationship {
	var rels []Relationship
	portfolio := nestedMap(raw, "portfolio")
	if portfolio == nil {
		return nil
	}
	for _, pl := range mapSlice(portfolio, "product_lines") {
		plID := strField(pl, "id")
		vmRef := strField(pl, "value_model_ref")
		if plID != "" && vmRef != "" {
			rels = append(rels, Relationship{
				TargetKey:    vmRef,
				TargetType:   "value_model",
				Relationship: "uses_value_model",
				Metadata:     map[string]any{"product_line_id": plID},
			})
		}
	}
	return rels
}

// ---------------------------------------------------------------------------
// Assessment report: okr_assessments and assumption_validations
// ---------------------------------------------------------------------------

func extractAssessmentRelationships(key string, raw map[string]any) []Relationship {
	var rels []Relationship

	for _, oa := range mapSlice(raw, "okr_assessments") {
		okrID := strField(oa, "okr_id")
		if okrID != "" {
			rels = append(rels, Relationship{
				TargetKey:    okrID,
				TargetType:   "okr",
				Relationship: "assesses_okr",
			})
		}
		for _, kro := range mapSlice(oa, "key_result_outcomes") {
			krID := strField(kro, "kr_id")
			if krID != "" {
				rels = append(rels, Relationship{
					TargetKey:    krID,
					TargetType:   "key_result",
					Relationship: "assesses_kr",
				})
			}
		}
	}

	for _, av := range mapSlice(raw, "assumption_validations") {
		asmID := strField(av, "id")
		if asmID != "" {
			rels = append(rels, Relationship{
				TargetKey:    asmID,
				TargetType:   "assumption",
				Relationship: "validates_assumption",
				Metadata:     map[string]any{"status": strField(av, "status")},
			})
		}
	}

	return rels
}

// ---------------------------------------------------------------------------
// Calibration memo: references to strategy artifacts that need updating
// ---------------------------------------------------------------------------

func extractCalibrationRelationships(key string, raw map[string]any) []Relationship {
	var rels []Relationship

	// calibration.decision references the overall strategic decision
	cal := nestedMap(raw, "calibration")
	if cal == nil {
		cal = raw // flat structure fallback
	}

	// continue_doing / stop_doing / start_exploring may reference artifact keys
	for _, action := range []string{"continue_doing", "stop_doing", "start_exploring"} {
		for _, item := range mapSlice(cal, action) {
			if ref := strField(item, "artifact_key"); ref != "" {
				rels = append(rels, Relationship{
					TargetKey:    ref,
					TargetType:   "artifact",
					Relationship: "calibrates",
					Metadata:     map[string]any{"action": action},
				})
			}
		}
	}

	// inputs_for_next_ready may reference specific artifacts to update
	inputs := nestedMap(cal, "inputs_for_next_ready")
	if inputs != nil {
		for _, section := range []string{"opportunity_update", "strategy_update", "new_assumptions"} {
			items := mapSlice(inputs, section)
			for _, item := range items {
				if ref := strField(item, "artifact_key"); ref != "" {
					rels = append(rels, Relationship{
						TargetKey:    ref,
						TargetType:   "artifact",
						Relationship: "calibrates",
						Metadata:     map[string]any{"section": section},
					})
				}
			}
		}
	}

	// If the calibration has a decision (persevere/pivot/pull_the_plug),
	// link to north_star and strategy_formula as they may need review.
	decision := strField(cal, "decision")
	if decision == "pivot" || decision == "pull_the_plug" {
		rels = append(rels, Relationship{
			TargetKey:    "north_star",
			TargetType:   "north_star",
			Relationship: "calibrates",
			Metadata:     map[string]any{"decision": decision},
		})
		rels = append(rels, Relationship{
			TargetKey:    "strategy_formula",
			TargetType:   "strategy_formula",
			Relationship: "calibrates",
			Metadata:     map[string]any{"decision": decision},
		})
	}

	return rels
}

// ---------------------------------------------------------------------------
// JSON navigation helpers (pure, no panics)
// ---------------------------------------------------------------------------

func strField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

func nestedMap(m map[string]any, key string) map[string]any {
	if m == nil {
		return nil
	}
	v, ok := m[key]
	if !ok {
		return nil
	}
	nm, _ := v.(map[string]any)
	return nm
}

func strSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	v, ok := m[key]
	if !ok {
		return nil
	}
	raw, _ := v.([]any)
	result := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && s != "" {
			result = append(result, s)
		}
	}
	return result
}

func strSliceNested(m map[string]any, keys ...string) []string {
	cur := m
	for i, k := range keys {
		if i == len(keys)-1 {
			return strSlice(cur, k)
		}
		cur = nestedMap(cur, k)
		if cur == nil {
			return nil
		}
	}
	return nil
}

func mapSlice(m map[string]any, key string) []map[string]any {
	if m == nil {
		return nil
	}
	v, ok := m[key]
	if !ok {
		return nil
	}
	raw, _ := v.([]any)
	result := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if nm, ok := item.(map[string]any); ok {
			result = append(result, nm)
		}
	}
	return result
}

func coalesceStr(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
