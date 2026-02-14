package wizard

import (
	"sort"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/schema"
)

// Recommender recommends wizards based on user tasks
type Recommender struct {
	loader *Loader
}

// NewRecommender creates a new wizard recommender
func NewRecommender(loader *Loader) *Recommender {
	return &Recommender{
		loader: loader,
	}
}

// RecommendForTask returns a wizard recommendation for the given task description
func (r *Recommender) RecommendForTask(task string) (*Recommendation, error) {
	if !r.loader.HasWizards() {
		return nil, nil
	}

	taskLower := strings.ToLower(strings.TrimSpace(task))

	// Try to detect phase from task
	var phaseHint *schema.Phase
	if strings.Contains(taskLower, "ready phase") || strings.Contains(taskLower, "ready-phase") {
		phase := schema.PhaseREADY
		phaseHint = &phase
	} else if strings.Contains(taskLower, "fire phase") || strings.Contains(taskLower, "fire-phase") {
		phase := schema.PhaseFIRE
		phaseHint = &phase
	} else if strings.Contains(taskLower, "aim phase") || strings.Contains(taskLower, "aim-phase") {
		phase := schema.PhaseAIM
		phaseHint = &phase
	}

	// Score all wizards
	type scoredWizard struct {
		wizard      *WizardInfo
		score       int
		matchType   string
		matchPhrase string
	}

	var scored []scoredWizard
	wizards := r.loader.ListWizards(nil, nil)

	for _, wizard := range wizards {
		score, matchType, matchPhrase := r.scoreWizard(wizard, taskLower, phaseHint)
		if score > 0 {
			scored = append(scored, scoredWizard{
				wizard:      wizard,
				score:       score,
				matchType:   matchType,
				matchPhrase: matchPhrase,
			})
		}
	}

	if len(scored) == 0 {
		// No matches - return a default recommendation
		return r.getDefaultRecommendation(taskLower, phaseHint)
	}

	// Sort by score (descending)
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	// Build recommendation
	best := scored[0]
	confidence := r.getConfidence(best.score)

	recommendation := &Recommendation{
		Wizard:     best.wizard,
		Confidence: confidence,
		Reason:     r.buildReason(best.matchType, best.matchPhrase, best.wizard.Name),
	}

	// Add alternatives (next best matches, different from best)
	for i := 1; i < len(scored) && len(recommendation.Alternatives) < 3; i++ {
		alt := scored[i]
		// Only add if it's a different wizard
		if alt.wizard.Name != best.wizard.Name {
			recommendation.Alternatives = append(recommendation.Alternatives, &AlternativeRecommendation{
				WizardName: alt.wizard.Name,
				Reason:     r.buildReason(alt.matchType, alt.matchPhrase, alt.wizard.Name),
			})
		}
	}

	return recommendation, nil
}

// scoreWizard scores a wizard against a task
func (r *Recommender) scoreWizard(wizard *WizardInfo, taskLower string, phaseHint *schema.Phase) (int, string, string) {
	score := 0
	matchType := ""
	matchPhrase := ""

	// Phase match bonus
	if phaseHint != nil && wizard.Phase == *phaseHint {
		score += 20
	}

	// Check trigger phrases (highest priority - direct match)
	for _, trigger := range wizard.TriggerPhrases {
		triggerLower := strings.ToLower(trigger)
		if strings.Contains(taskLower, triggerLower) {
			// Exact trigger match is very high confidence
			score += 100
			if matchType == "" || matchType == "keyword" {
				matchType = "trigger"
				matchPhrase = trigger
			}
		}
	}

	// Check keyword mappings
	for keyword, wizardNames := range KeywordMappings {
		if strings.Contains(taskLower, keyword) {
			for i, name := range wizardNames {
				if name == wizard.Name {
					// Earlier in the list = better match
					keywordScore := 50 - (i * 10)
					if keywordScore > 0 {
						score += keywordScore
						if matchType == "" {
							matchType = "keyword"
							matchPhrase = keyword
						}
					}
					break
				}
			}
		}
	}

	// Check wizard name match
	wizardNameLower := strings.ToLower(wizard.Name)
	wizardNameClean := strings.ReplaceAll(wizardNameLower, "_", " ")
	if strings.Contains(taskLower, wizardNameLower) || strings.Contains(taskLower, wizardNameClean) {
		score += 80
		if matchType == "" {
			matchType = "name"
			matchPhrase = wizard.Name
		}
	}

	// Check purpose match (fuzzy)
	purposeLower := strings.ToLower(wizard.Purpose)
	taskWords := strings.Fields(taskLower)
	purposeMatchCount := 0
	for _, word := range taskWords {
		if len(word) > 3 && strings.Contains(purposeLower, word) {
			purposeMatchCount++
		}
	}
	if purposeMatchCount >= 2 {
		score += purposeMatchCount * 5
		if matchType == "" {
			matchType = "purpose"
			matchPhrase = "purpose similarity"
		}
	}

	return score, matchType, matchPhrase
}

// getConfidence returns confidence level based on score
func (r *Recommender) getConfidence(score int) string {
	if score >= 100 {
		return "high"
	} else if score >= 50 {
		return "medium"
	}
	return "low"
}

// buildReason builds a human-readable reason for the recommendation
func (r *Recommender) buildReason(matchType, matchPhrase, wizardName string) string {
	switch matchType {
	case "trigger":
		return "Matches trigger phrase: \"" + matchPhrase + "\""
	case "keyword":
		return "Matches keyword: \"" + matchPhrase + "\""
	case "name":
		return "Directly referenced wizard: " + wizardName
	case "purpose":
		return "Similar purpose to your task"
	default:
		return "Best match for your task"
	}
}

// getDefaultRecommendation returns a default recommendation when no matches found
func (r *Recommender) getDefaultRecommendation(taskLower string, phaseHint *schema.Phase) (*Recommendation, error) {
	// If phase is specified, recommend the main wizard for that phase
	if phaseHint != nil {
		switch *phaseHint {
		case schema.PhaseREADY:
			if wizard, err := r.loader.GetWizard("pathfinder"); err == nil {
				return &Recommendation{
					Wizard:     wizard,
					Confidence: "low",
					Reason:     "Default READY phase wizard",
					Alternatives: []*AlternativeRecommendation{
						{WizardName: "lean_start", Reason: "Lightweight alternative for small teams"},
					},
				}, nil
			}
		case schema.PhaseFIRE:
			if wizard, err := r.loader.GetWizard("product_architect"); err == nil {
				return &Recommendation{
					Wizard:     wizard,
					Confidence: "low",
					Reason:     "Default FIRE phase wizard",
					Alternatives: []*AlternativeRecommendation{
						{WizardName: "feature_definition", Reason: "For creating individual features"},
					},
				}, nil
			}
		case schema.PhaseAIM:
			if wizard, err := r.loader.GetWizard("synthesizer"); err == nil {
				return &Recommendation{
					Wizard:     wizard,
					Confidence: "low",
					Reason:     "Default AIM phase wizard",
				}, nil
			}
		}
	}

	// Default to start_epf for general/unclear tasks
	if wizard, err := r.loader.GetWizard("start_epf"); err == nil {
		return &Recommendation{
			Wizard:     wizard,
			Confidence: "low",
			Reason:     "Start here if you're new to EPF or unsure where to begin",
			Alternatives: []*AlternativeRecommendation{
				{WizardName: "lean_start", Reason: "Quick start for small teams"},
				{WizardName: "pathfinder", Reason: "Full strategic planning"},
			},
		}, nil
	}

	// No wizards available
	return nil, nil
}

// GetWizardsForPhase returns wizards for a specific phase, ranked by relevance
func (r *Recommender) GetWizardsForPhase(phase schema.Phase) []*WizardInfo {
	phasePtr := &phase
	return r.loader.ListWizards(phasePtr, nil)
}

// GetOnboardingWizards returns wizards suitable for new users
func (r *Recommender) GetOnboardingWizards() []*WizardInfo {
	var result []*WizardInfo

	// start_epf first
	if wizard, err := r.loader.GetWizard("start_epf"); err == nil {
		result = append(result, wizard)
	}

	// Then lean_start
	if wizard, err := r.loader.GetWizard("lean_start"); err == nil {
		result = append(result, wizard)
	}

	// Then pathfinder
	if wizard, err := r.loader.GetWizard("pathfinder"); err == nil {
		result = append(result, wizard)
	}

	return result
}
