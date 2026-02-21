package strategy

import (
	"sort"
	"strings"
	"unicode"
)

// Searcher provides full-text search capabilities over strategy content.
type Searcher struct {
	model *StrategyModel
}

// NewSearcher creates a new searcher for the given model.
func NewSearcher(model *StrategyModel) *Searcher {
	return &Searcher{model: model}
}

// SearchOptions configures search behavior.
type SearchOptions struct {
	// Limit is the maximum number of results to return (default: 20)
	Limit int

	// Types filters results to specific types (e.g., "persona", "feature", "okr")
	// Empty means all types.
	Types []string

	// MinScore filters out results below this relevance score (0-1)
	MinScore float64
}

// Search performs full-text search across all strategy content.
func (s *Searcher) Search(query string, opts SearchOptions) []SearchResult {
	if s.model == nil {
		return nil
	}

	if opts.Limit <= 0 {
		opts.Limit = 20
	}

	// Tokenize query
	queryTokens := tokenize(query)
	if len(queryTokens) == 0 {
		return nil
	}

	var results []SearchResult

	// Search all content types
	results = append(results, s.searchNorthStar(queryTokens)...)
	results = append(results, s.searchInsightAnalyses(queryTokens)...)
	results = append(results, s.searchStrategyFormula(queryTokens)...)
	results = append(results, s.searchRoadmap(queryTokens)...)
	results = append(results, s.searchFeatures(queryTokens)...)
	results = append(results, s.searchValueModels(queryTokens)...)

	// Filter by type if specified
	if len(opts.Types) > 0 {
		typeSet := make(map[string]bool)
		for _, t := range opts.Types {
			typeSet[strings.ToLower(t)] = true
		}

		filtered := results[:0]
		for _, r := range results {
			if typeSet[strings.ToLower(r.Type)] {
				filtered = append(filtered, r)
			}
		}
		results = filtered
	}

	// Filter by minimum score
	if opts.MinScore > 0 {
		filtered := results[:0]
		for _, r := range results {
			if r.Score >= opts.MinScore {
				filtered = append(filtered, r)
			}
		}
		results = filtered
	}

	// Sort by score (highest first)
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	// Limit results
	if len(results) > opts.Limit {
		results = results[:opts.Limit]
	}

	return results
}

// searchNorthStar searches the north star content.
func (s *Searcher) searchNorthStar(queryTokens []string) []SearchResult {
	var results []SearchResult
	ns := s.model.NorthStar
	if ns == nil {
		return results
	}

	// Purpose
	if score := scoreMatch(ns.Purpose.Statement, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "purpose",
			ID:      "north-star-purpose",
			Title:   "Purpose Statement",
			Content: ns.Purpose.Statement,
			Snippet: extractSearchSnippet(ns.Purpose.Statement, queryTokens),
			Score:   score * 1.0, // Purpose is high priority
			Source:  "READY/00_north_star.yaml",
		})
	}

	if score := scoreMatch(ns.Purpose.ProblemWeSolve, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "purpose",
			ID:      "north-star-problem",
			Title:   "Problem We Solve",
			Content: ns.Purpose.ProblemWeSolve,
			Snippet: extractSearchSnippet(ns.Purpose.ProblemWeSolve, queryTokens),
			Score:   score * 0.95,
			Source:  "READY/00_north_star.yaml",
		})
	}

	// Vision
	if score := scoreMatch(ns.Vision.Statement, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "vision",
			ID:      "north-star-vision",
			Title:   "Vision Statement",
			Content: ns.Vision.Statement,
			Snippet: extractSearchSnippet(ns.Vision.Statement, queryTokens),
			Score:   score * 1.0,
			Source:  "READY/00_north_star.yaml",
		})
	}

	// Mission
	if score := scoreMatch(ns.Mission.Statement, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "mission",
			ID:      "north-star-mission",
			Title:   "Mission Statement",
			Content: ns.Mission.Statement,
			Snippet: extractSearchSnippet(ns.Mission.Statement, queryTokens),
			Score:   score * 1.0,
			Source:  "READY/00_north_star.yaml",
		})
	}

	// Values
	for i, v := range ns.Values {
		combined := v.Name + " " + v.Definition
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "value",
				ID:      sanitizeSearchID("value", i),
				Title:   v.Name,
				Content: v.Definition,
				Snippet: extractSearchSnippet(v.Definition, queryTokens),
				Score:   score * 0.85,
				Source:  "READY/00_north_star.yaml",
			})
		}
	}

	return results
}

// searchInsightAnalyses searches insight analyses content.
func (s *Searcher) searchInsightAnalyses(queryTokens []string) []SearchResult {
	var results []SearchResult
	ia := s.model.InsightAnalyses
	if ia == nil {
		return results
	}

	// Key insights
	for i, ki := range ia.KeyInsights {
		combined := ki.Insight + " " + ki.StrategicImplication
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "insight",
				ID:      sanitizeSearchID("insight", i),
				Title:   "Key Insight",
				Content: ki.Insight,
				Snippet: extractSearchSnippet(ki.Insight, queryTokens),
				Score:   score * 0.9,
				Source:  "READY/01_insight_analyses.yaml",
				Context: map[string]string{
					"implication": ki.StrategicImplication,
				},
			})
		}
	}

	// Target users (personas)
	for _, tu := range ia.TargetUsers {
		combined := tu.Name + " " + tu.Description + " " + strings.Join(tu.PainPoints, " ")
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "persona",
				ID:      tu.ID,
				Title:   tu.Name,
				Content: tu.Description,
				Snippet: extractSearchSnippet(tu.Description, queryTokens),
				Score:   score * 0.9,
				Source:  "READY/01_insight_analyses.yaml",
				Context: map[string]string{
					"role":        tu.Role,
					"pain_points": strings.Join(tu.PainPoints, "; "),
				},
			})
		}
	}

	// Market segments
	for i, seg := range ia.Segments {
		combined := seg.Name + " " + strings.Join(seg.Characteristics, " ") + " " + strings.Join(seg.UnmetNeeds, " ")
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "market_segment",
				ID:      sanitizeSearchID("segment", i),
				Title:   seg.Name,
				Content: strings.Join(seg.Characteristics, "; "),
				Snippet: extractSearchSnippet(strings.Join(seg.Characteristics, " "), queryTokens),
				Score:   score * 0.75,
				Source:  "READY/01_insight_analyses.yaml",
				Context: map[string]string{
					"size": seg.Size,
				},
			})
		}
	}

	// Trends
	allTrends := append(ia.Trends.Technology, ia.Trends.Market...)
	allTrends = append(allTrends, ia.Trends.UserBehavior...)
	allTrends = append(allTrends, ia.Trends.Regulatory...)
	allTrends = append(allTrends, ia.Trends.Competitive...)

	for i, trend := range allTrends {
		combined := trend.Name + " " + trend.Impact + " " + strings.Join(trend.Evidence, " ")
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "trend",
				ID:      sanitizeSearchID("trend", i),
				Title:   trend.Name,
				Content: trend.Impact,
				Snippet: extractSearchSnippet(trend.Impact, queryTokens),
				Score:   score * 0.7,
				Source:  "READY/01_insight_analyses.yaml",
				Context: map[string]string{
					"timeframe": trend.Timeframe,
				},
			})
		}
	}

	return results
}

// searchStrategyFormula searches strategy formula content.
func (s *Searcher) searchStrategyFormula(queryTokens []string) []SearchResult {
	var results []SearchResult
	sf := s.model.StrategyFormula
	if sf == nil {
		return results
	}

	// Positioning
	pos := sf.Positioning
	if score := scoreMatch(pos.UniqueValueProp, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "positioning",
			ID:      "uvp",
			Title:   "Unique Value Proposition",
			Content: pos.UniqueValueProp,
			Snippet: extractSearchSnippet(pos.UniqueValueProp, queryTokens),
			Score:   score * 1.0,
			Source:  "READY/04_strategy_formula.yaml",
		})
	}

	if score := scoreMatch(pos.Statement, queryTokens); score > 0 {
		results = append(results, SearchResult{
			Type:    "positioning",
			ID:      "positioning-statement",
			Title:   "Positioning Statement",
			Content: pos.Statement,
			Snippet: extractSearchSnippet(pos.Statement, queryTokens),
			Score:   score * 0.95,
			Source:  "READY/04_strategy_formula.yaml",
		})
	}

	// Competitive advantages
	for i, adv := range sf.CompetitiveMoat.Advantages {
		combined := adv.Name + " " + adv.Description
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "advantage",
				ID:      sanitizeSearchID("advantage", i),
				Title:   adv.Name,
				Content: adv.Description,
				Snippet: extractSearchSnippet(adv.Description, queryTokens),
				Score:   score * 0.85,
				Source:  "READY/04_strategy_formula.yaml",
				Context: map[string]string{
					"defensibility": adv.Defensibility,
				},
			})
		}
	}

	// Competitor comparisons
	for i, comp := range sf.CompetitiveMoat.VsCompetitors {
		combined := comp.Competitor + " " + comp.TheirStrength + " " + comp.OurAngle + " " + comp.Wedge
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "competitor",
				ID:      sanitizeSearchID("competitor", i),
				Title:   "vs " + comp.Competitor,
				Content: comp.OurAngle,
				Snippet: extractSearchSnippet(comp.OurAngle, queryTokens),
				Score:   score * 0.8,
				Source:  "READY/04_strategy_formula.yaml",
				Context: map[string]string{
					"their_strength": comp.TheirStrength,
					"wedge":          comp.Wedge,
				},
			})
		}
	}

	return results
}

// searchRoadmap searches roadmap content.
func (s *Searcher) searchRoadmap(queryTokens []string) []SearchResult {
	var results []SearchResult
	rm := s.model.Roadmap
	if rm == nil {
		return results
	}

	for trackName, track := range rm.Tracks {
		// Track objective
		if score := scoreMatch(track.TrackObjective, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "track",
				ID:      trackName,
				Title:   trackName + " Track",
				Content: track.TrackObjective,
				Snippet: extractSearchSnippet(track.TrackObjective, queryTokens),
				Score:   score * 0.85,
				Source:  "READY/05_roadmap_recipe.yaml",
			})
		}

		// OKRs
		for _, okr := range track.OKRs {
			if score := scoreMatch(okr.Objective, queryTokens); score > 0 {
				results = append(results, SearchResult{
					Type:    "okr",
					ID:      okr.ID,
					Title:   okr.Objective,
					Content: okr.Objective,
					Snippet: extractSearchSnippet(okr.Objective, queryTokens),
					Score:   score * 0.9,
					Source:  "READY/05_roadmap_recipe.yaml",
					Context: map[string]string{
						"track": trackName,
					},
				})
			}

			// Key results
			for _, kr := range okr.KeyResults {
				combined := kr.Description + " " + kr.Target
				if score := scoreMatch(combined, queryTokens); score > 0 {
					results = append(results, SearchResult{
						Type:    "key_result",
						ID:      kr.ID,
						Title:   kr.Description,
						Content: kr.Description,
						Snippet: extractSearchSnippet(kr.Description, queryTokens),
						Score:   score * 0.85,
						Source:  "READY/05_roadmap_recipe.yaml",
						Context: map[string]string{
							"track":  trackName,
							"okr_id": okr.ID,
							"target": kr.Target,
							"status": kr.Status,
						},
					})
				}
			}
		}
	}

	return results
}

// searchFeatures searches feature definitions.
func (s *Searcher) searchFeatures(queryTokens []string) []SearchResult {
	var results []SearchResult

	for _, f := range s.model.Features {
		// Feature name and job-to-be-done
		combined := f.Name + " " + f.Definition.JobToBeDone + " " + f.Definition.SolutionApproach
		if score := scoreMatch(combined, queryTokens); score > 0 {
			results = append(results, SearchResult{
				Type:    "feature",
				ID:      f.ID,
				Title:   f.Name,
				Content: f.Definition.JobToBeDone,
				Snippet: extractSearchSnippet(f.Definition.JobToBeDone, queryTokens),
				Score:   score * 0.95,
				Source:  "FIRE/definitions/product/" + f.Slug + ".yaml",
				Context: map[string]string{
					"status":         f.Status,
					"contributes_to": strings.Join(f.StrategicContext.ContributesTo, ", "),
				},
			})
		}

		// Capabilities
		for _, cap := range f.Capabilities {
			combined := cap.Name + " " + cap.Description
			if score := scoreMatch(combined, queryTokens); score > 0 {
				results = append(results, SearchResult{
					Type:    "capability",
					ID:      cap.ID,
					Title:   cap.Name,
					Content: cap.Description,
					Snippet: extractSearchSnippet(cap.Description, queryTokens),
					Score:   score * 0.8,
					Source:  "FIRE/definitions/product/" + f.Slug + ".yaml",
					Context: map[string]string{
						"feature_id":   f.ID,
						"feature_name": f.Name,
					},
				})
			}
		}
	}

	return results
}

// searchValueModels searches value model content.
func (s *Searcher) searchValueModels(queryTokens []string) []SearchResult {
	var results []SearchResult

	for trackName, vm := range s.model.ValueModels {
		for _, layer := range vm.Layers {
			// Layer level
			combined := layer.Name + " " + layer.Description
			if score := scoreMatch(combined, queryTokens); score > 0 {
				results = append(results, SearchResult{
					Type:    "value_layer",
					ID:      layer.ID,
					Title:   layer.Name,
					Content: layer.Description,
					Snippet: extractSearchSnippet(layer.Description, queryTokens),
					Score:   score * 0.75,
					Source:  "FIRE/value_models/" + trackName + ".value_model.yaml",
					Context: map[string]string{
						"track": trackName,
						"path":  trackName + "." + layer.Name,
					},
				})
			}

			// Component level
			for _, comp := range layer.Components {
				combined := comp.Name + " " + comp.Description
				if score := scoreMatch(combined, queryTokens); score > 0 {
					results = append(results, SearchResult{
						Type:    "value_component",
						ID:      comp.ID,
						Title:   comp.Name,
						Content: comp.Description,
						Snippet: extractSearchSnippet(comp.Description, queryTokens),
						Score:   score * 0.7,
						Source:  "FIRE/value_models/" + trackName + ".value_model.yaml",
						Context: map[string]string{
							"track":    trackName,
							"layer":    layer.Name,
							"maturity": comp.Maturity,
							"path":     trackName + "." + layer.Name + "." + comp.Name,
						},
					})
				}
			}
		}
	}

	return results
}

// --- Scoring and tokenization helpers ---

// tokenize splits text into lowercase tokens.
func tokenize(text string) []string {
	words := strings.FieldsFunc(text, func(c rune) bool {
		return !unicode.IsLetter(c) && !unicode.IsNumber(c)
	})

	tokens := make([]string, 0, len(words))
	for _, w := range words {
		w = strings.ToLower(w)
		if len(w) > 1 { // Skip single-character tokens
			tokens = append(tokens, w)
		}
	}

	return tokens
}

// scoreMatch calculates a relevance score (0-1) for how well text matches query tokens.
func scoreMatch(text string, queryTokens []string) float64 {
	if text == "" || len(queryTokens) == 0 {
		return 0
	}

	textLower := strings.ToLower(text)
	textTokens := tokenize(text)
	textTokenSet := make(map[string]bool)
	for _, t := range textTokens {
		textTokenSet[t] = true
	}

	matchedTokens := 0
	exactPhraseMatch := false

	// Check for exact phrase match
	if len(queryTokens) > 1 {
		phrase := strings.Join(queryTokens, " ")
		if strings.Contains(textLower, phrase) {
			exactPhraseMatch = true
		}
	}

	// Count individual token matches
	for _, qt := range queryTokens {
		if strings.Contains(textLower, qt) {
			matchedTokens++
		}
	}

	if matchedTokens == 0 {
		return 0
	}

	// Calculate base score as ratio of matched tokens
	baseScore := float64(matchedTokens) / float64(len(queryTokens))

	// Boost for exact phrase match
	if exactPhraseMatch {
		baseScore = minFloat(1.0, baseScore*1.3)
	}

	// Slight penalty for very long text (favors focused content)
	if len(text) > 500 {
		baseScore *= 0.95
	}

	return baseScore
}

// extractSearchSnippet extracts a snippet around the first matched token.
func extractSearchSnippet(text string, queryTokens []string) string {
	if text == "" || len(queryTokens) == 0 {
		return ""
	}

	textLower := strings.ToLower(text)

	// Find first match position
	matchIdx := -1
	for _, qt := range queryTokens {
		idx := strings.Index(textLower, qt)
		if idx != -1 && (matchIdx == -1 || idx < matchIdx) {
			matchIdx = idx
		}
	}

	// Extract surrounding context
	if matchIdx == -1 {
		matchIdx = 0
	}

	start := maxInt(0, matchIdx-60)
	end := minInt(len(text), matchIdx+100)

	snippet := text[start:end]

	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(text) {
		snippet = snippet + "..."
	}

	return strings.TrimSpace(snippet)
}

func sanitizeSearchID(prefix string, index int) string {
	return prefix + "-" + strings.ToLower(strings.ReplaceAll(
		strings.TrimSpace(prefix), " ", "-")) + "-" + string(rune('0'+index))
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
