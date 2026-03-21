package decompose

import (
	"strings"
)

// ============================================================
// Phase 3: Cross-artifact relationship inference
//
// These functions scan the decomposed objects to infer structural
// relationships between objects from different artifacts. They use
// text matching (name mentions, keyword overlap) and explicit ID
// references — no embedding similarity needed.
// ============================================================

// addCompetesWithEdges creates Positioning → Competitor edges when
// a positioning claim mentions a competitor by name.
func (d *Decomposer) addCompetesWithEdges(result *Result) {
	// Collect competitor names and keys
	type competitorInfo struct {
		key  string
		name string
	}
	var competitors []competitorInfo
	for _, obj := range result.Objects {
		if obj.Type != "Competitor" {
			continue
		}
		name, _ := obj.Properties["name"].(string)
		if name != "" {
			competitors = append(competitors, competitorInfo{key: obj.Key, name: name})
		}
	}
	if len(competitors) == 0 {
		return
	}

	// Scan positioning objects for competitor name mentions
	for _, obj := range result.Objects {
		if obj.Type != "Positioning" {
			continue
		}
		claim, _ := obj.Properties["claim"].(string)
		vsComp, _ := obj.Properties["vs_competitor"].(string)
		searchText := strings.ToLower(claim + " " + vsComp)

		for _, comp := range competitors {
			if strings.Contains(searchText, strings.ToLower(comp.name)) {
				d.addRel(result, "competes_with", obj.Key, "Positioning", comp.key, "Competitor",
					map[string]any{"weight": "0.9", "edge_source": "structural"})
			}
		}
	}
}

// addValidatesHypothesisEdges creates Capability → Hypothesis edges when
// a proven/scaled capability exists on a feature whose description or JTBD
// overlaps with a hypothesis statement.
func (d *Decomposer) addValidatesHypothesisEdges(result *Result) {
	// Collect hypotheses
	type hypoInfo struct {
		key        string
		hypothesis string
	}
	var hypotheses []hypoInfo
	for _, obj := range result.Objects {
		if obj.Type != "Hypothesis" {
			continue
		}
		h, _ := obj.Properties["hypothesis"].(string)
		if h != "" {
			hypotheses = append(hypotheses, hypoInfo{key: obj.Key, hypothesis: h})
		}
	}
	if len(hypotheses) == 0 {
		return
	}

	// Find proven/scaled capabilities and check for hypothesis keyword overlap
	for _, obj := range result.Objects {
		if obj.Type != "Capability" {
			continue
		}
		maturity, _ := obj.Properties["maturity"].(string)
		if maturity != "proven" && maturity != "scaled" {
			continue
		}
		capDesc, _ := obj.Properties["description"].(string)
		capName, _ := obj.Properties["name"].(string)
		capText := strings.ToLower(capName + " " + capDesc)

		for _, hypo := range hypotheses {
			// Extract keywords from hypothesis (words > 5 chars)
			hypoWords := extractKeywords(hypo.hypothesis)
			matchCount := 0
			for _, w := range hypoWords {
				if strings.Contains(capText, w) {
					matchCount++
				}
			}
			// Require at least 2 keyword matches for a connection
			if matchCount >= 2 {
				evidence, _ := obj.Properties["evidence"].(string)
				d.addRel(result, "validates_hypothesis", obj.Key, "Capability", hypo.key, "Hypothesis",
					map[string]any{
						"weight":      "0.8",
						"edge_source": "structural",
						"evidence":    truncate(evidence, 200),
					})
			}
		}
	}
}

// addMitigatesEdges creates Feature → Threat and Feature → StrategicRisk edges
// when a feature's description or capabilities overlap with a threat/risk description.
func (d *Decomposer) addMitigatesEdges(result *Result) {
	// Collect threats and risks
	type threatInfo struct {
		key     string
		text    string
		objType string
	}
	var threats []threatInfo
	for _, obj := range result.Objects {
		if obj.Type != "Threat" && obj.Type != "StrategicRisk" {
			continue
		}
		desc, _ := obj.Properties["description"].(string)
		name, _ := obj.Properties["name"].(string)
		if desc == "" {
			desc = name
		}
		threats = append(threats, threatInfo{key: obj.Key, text: desc, objType: obj.Type})
	}
	if len(threats) == 0 {
		return
	}

	// Scan features for keyword overlap with threats
	for _, obj := range result.Objects {
		if obj.Type != "Feature" {
			continue
		}
		featureDesc, _ := obj.Properties["description"].(string)
		featureName, _ := obj.Properties["name"].(string)
		featureText := strings.ToLower(featureName + " " + featureDesc)

		for _, threat := range threats {
			keywords := extractKeywords(threat.text)
			matchCount := 0
			for _, w := range keywords {
				if strings.Contains(featureText, w) {
					matchCount++
				}
			}
			// Require at least 2 keyword matches
			if matchCount >= 2 {
				d.addRel(result, "mitigates", obj.Key, "Feature", threat.key, threat.objType,
					map[string]any{"weight": "0.7", "edge_source": "structural"})
			}
		}
	}
}

// addLeveragesEdges creates Feature → Strength edges when a feature
// description overlaps with an organizational strength.
func (d *Decomposer) addLeveragesEdges(result *Result) {
	type strengthInfo struct {
		key  string
		text string
	}
	var strengths []strengthInfo
	for _, obj := range result.Objects {
		if obj.Type != "Strength" {
			continue
		}
		desc, _ := obj.Properties["description"].(string)
		name, _ := obj.Properties["name"].(string)
		strengths = append(strengths, strengthInfo{key: obj.Key, text: name + " " + desc})
	}
	if len(strengths) == 0 {
		return
	}

	for _, obj := range result.Objects {
		if obj.Type != "Feature" {
			continue
		}
		featureDesc, _ := obj.Properties["description"].(string)
		featureName, _ := obj.Properties["name"].(string)
		featureText := strings.ToLower(featureName + " " + featureDesc)

		for _, strength := range strengths {
			keywords := extractKeywords(strength.text)
			matchCount := 0
			for _, w := range keywords {
				if strings.Contains(featureText, w) {
					matchCount++
				}
			}
			if matchCount >= 2 {
				d.addRel(result, "leverages", obj.Key, "Feature", strength.key, "Strength",
					map[string]any{"weight": "0.7", "edge_source": "structural"})
			}
		}
	}
}

// addTargetsSegmentEdges creates Feature → MarketSegment edges when a feature
// serves personas whose characteristics overlap with a segment's description.
func (d *Decomposer) addTargetsSegmentEdges(result *Result) {
	type segmentInfo struct {
		key  string
		text string
	}
	var segments []segmentInfo
	for _, obj := range result.Objects {
		if obj.Type != "MarketSegment" {
			continue
		}
		name, _ := obj.Properties["name"].(string)
		chars, _ := obj.Properties["characteristics"].(string)
		needs, _ := obj.Properties["unmet_needs"].(string)
		segments = append(segments, segmentInfo{key: obj.Key, text: name + " " + chars + " " + needs})
	}
	if len(segments) == 0 {
		return
	}

	// Collect persona names served by each feature via "serves" edges
	featurePersonas := map[string][]string{} // feature key → persona descriptions
	for _, rel := range result.Relationships {
		if rel.Type != "serves" {
			continue
		}
		// Find the persona object to get its description
		for _, obj := range result.Objects {
			if obj.Key == rel.ToKey && obj.Type == "Persona" {
				desc, _ := obj.Properties["description"].(string)
				name, _ := obj.Properties["name"].(string)
				featurePersonas[rel.FromKey] = append(featurePersonas[rel.FromKey], name+" "+desc)
			}
		}
	}

	// Also use feature descriptions directly
	for _, obj := range result.Objects {
		if obj.Type != "Feature" {
			continue
		}
		featureDesc, _ := obj.Properties["description"].(string)
		featureName, _ := obj.Properties["name"].(string)
		fullText := strings.ToLower(featureName + " " + featureDesc)

		// Add persona text
		for _, pDesc := range featurePersonas[obj.Key] {
			fullText += " " + strings.ToLower(pDesc)
		}

		for _, segment := range segments {
			keywords := extractKeywords(segment.text)
			matchCount := 0
			for _, w := range keywords {
				if strings.Contains(fullText, w) {
					matchCount++
				}
			}
			if matchCount >= 2 {
				d.addRel(result, "targets_segment", obj.Key, "Feature", segment.key, "MarketSegment",
					map[string]any{"weight": "0.7", "edge_source": "structural"})
			}
		}
	}
}

// addAddressesWhiteSpaceEdges creates Feature → WhiteSpace edges when a
// feature's JTBD or description overlaps with a white space gap.
func (d *Decomposer) addAddressesWhiteSpaceEdges(result *Result) {
	type wsInfo struct {
		key  string
		text string
	}
	var whiteSpaces []wsInfo
	for _, obj := range result.Objects {
		if obj.Type != "WhiteSpace" {
			continue
		}
		desc, _ := obj.Properties["description"].(string)
		name, _ := obj.Properties["name"].(string)
		whiteSpaces = append(whiteSpaces, wsInfo{key: obj.Key, text: name + " " + desc})
	}
	if len(whiteSpaces) == 0 {
		return
	}

	for _, obj := range result.Objects {
		if obj.Type != "Feature" {
			continue
		}
		featureDesc, _ := obj.Properties["description"].(string)
		featureName, _ := obj.Properties["name"].(string)
		jtbd, _ := obj.Properties["jtbd"].(string)
		featureText := strings.ToLower(featureName + " " + featureDesc + " " + jtbd)

		for _, ws := range whiteSpaces {
			keywords := extractKeywords(ws.text)
			matchCount := 0
			for _, w := range keywords {
				if strings.Contains(featureText, w) {
					matchCount++
				}
			}
			if matchCount >= 2 {
				d.addRel(result, "addresses_white_space", obj.Key, "Feature", ws.key, "WhiteSpace",
					map[string]any{"weight": "0.7", "edge_source": "structural"})
			}
		}
	}
}

// addRelatedDefinitionEdges creates TrackDefinition → TrackDefinition edges
// from explicit domain_context.synergies references in track definitions.
func (d *Decomposer) addRelatedDefinitionEdges(result *Result) {
	// Build a map of definition ID → key
	defIDToKey := map[string]string{}
	for _, obj := range result.Objects {
		if obj.Type != "TrackDefinition" {
			continue
		}
		defID, _ := obj.Properties["definition_id"].(string)
		if defID != "" {
			defIDToKey[defID] = obj.Key
		}
	}

	// Scan track definition objects for synergy references
	// The synergies field contains strings like "sd-002 (Competitive Landscape): ..."
	for _, obj := range result.Objects {
		if obj.Type != "TrackDefinition" {
			continue
		}
		fromKey := obj.Key

		// Check if any other definition IDs are mentioned in the description/purpose
		purpose, _ := obj.Properties["purpose"].(string)
		outcome, _ := obj.Properties["outcome"].(string)
		desc, _ := obj.Properties["description"].(string)
		allText := strings.ToLower(purpose + " " + outcome + " " + desc)

		for defID, toKey := range defIDToKey {
			if toKey == fromKey {
				continue // Skip self
			}
			if strings.Contains(allText, strings.ToLower(defID)) {
				d.addRel(result, "related_definition", fromKey, "TrackDefinition", toKey, "TrackDefinition",
					map[string]any{
						"weight":       "0.8",
						"edge_source":  "structural",
						"relationship": "related",
					})
			}
		}
	}
}

// extractKeywords splits text into lowercase words > 5 chars, deduplicating.
// Filters out common stop words that would cause false matches.
func extractKeywords(text string) []string {
	stopWords := map[string]bool{
		"about": true, "above": true, "after": true, "again": true,
		"against": true, "along": true, "already": true, "always": true,
		"among": true, "another": true, "approach": true, "around": true,
		"based": true, "because": true, "become": true, "before": true,
		"being": true, "below": true, "between": true, "better": true,
		"beyond": true, "build": true, "built": true, "called": true,
		"change": true, "could": true, "create": true, "current": true,
		"different": true, "during": true, "enable": true, "ensure": true,
		"every": true, "example": true, "existing": true, "first": true,
		"follow": true, "found": true, "given": true, "going": true,
		"great": true, "handle": true, "having": true, "helps": true,
		"including": true, "instead": true, "large": true, "level": true,
		"making": true, "might": true, "multiple": true, "needs": true,
		"never": true, "number": true, "often": true, "other": true,
		"place": true, "point": true, "possible": true, "process": true,
		"provide": true, "provides": true, "rather": true, "right": true,
		"running": true, "second": true, "several": true, "should": true,
		"simple": true, "since": true, "single": true, "small": true,
		"specific": true, "start": true, "state": true, "still": true,
		"support": true, "system": true, "their": true, "these": true,
		"thing": true, "think": true, "those": true, "three": true,
		"through": true, "together": true, "under": true, "until": true,
		"update": true, "using": true, "value": true, "various": true,
		"version": true, "wants": true, "where": true, "which": true,
		"while": true, "within": true, "without": true, "world": true,
		"would": true, "years": true, "there": true,
	}

	words := strings.Fields(strings.ToLower(text))
	seen := map[string]bool{}
	var result []string
	for _, w := range words {
		// Clean punctuation
		w = strings.Trim(w, ".,;:!?\"'()[]{}/-")
		if len(w) <= 5 || stopWords[w] || seen[w] {
			continue
		}
		seen[w] = true
		result = append(result, w)
	}
	return result
}
