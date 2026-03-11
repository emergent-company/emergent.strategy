package agent

import (
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// Recommender matches user tasks to agents using trigger phrases, keyword
// mappings, name matching, and purpose similarity scoring.
type Recommender struct {
	loader *Loader
}

// NewRecommender creates a new agent recommender.
func NewRecommender(loader *Loader) *Recommender {
	return &Recommender{
		loader: loader,
	}
}

// RecommendForTask returns an agent recommendation for the given task description.
func (r *Recommender) RecommendForTask(task string) (*Recommendation, error) {
	if !r.loader.HasAgents() {
		return nil, nil
	}

	taskLower := strings.ToLower(strings.TrimSpace(task))

	// Detect phase hint from task
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

	// Score all agents
	type scoredAgent struct {
		agent       *AgentInfo
		score       int
		matchType   string
		matchPhrase string
	}

	var scored []scoredAgent
	agents := r.loader.ListAgents(nil, nil)

	for _, agent := range agents {
		score, matchType, matchPhrase := r.scoreAgent(agent, taskLower, phaseHint)
		if score > 0 {
			scored = append(scored, scoredAgent{
				agent:       agent,
				score:       score,
				matchType:   matchType,
				matchPhrase: matchPhrase,
			})
		}
	}

	if len(scored) == 0 {
		return r.getDefaultRecommendation(taskLower, phaseHint)
	}

	// Sort by score descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	best := scored[0]
	recommendation := &Recommendation{
		Agent:      best.agent,
		Confidence: getConfidence(best.score),
		Reason:     buildReason(best.matchType, best.matchPhrase, best.agent.Name),
	}

	// Add up to 3 alternatives
	for i := 1; i < len(scored) && len(recommendation.Alternatives) < 3; i++ {
		alt := scored[i]
		if alt.agent.Name != best.agent.Name {
			recommendation.Alternatives = append(recommendation.Alternatives, &AlternativeRecommendation{
				AgentName: alt.agent.Name,
				Reason:    buildReason(alt.matchType, alt.matchPhrase, alt.agent.Name),
			})
		}
	}

	return recommendation, nil
}

// scoreAgent scores an agent against a task description.
func (r *Recommender) scoreAgent(agent *AgentInfo, taskLower string, phaseHint *schema.Phase) (int, string, string) {
	score := 0
	matchType := ""
	matchPhrase := ""

	// Phase match bonus
	if phaseHint != nil && agent.Phase == *phaseHint {
		score += 20
	}

	// 1. Trigger phrases (highest priority — direct match)
	for _, trigger := range agent.TriggerPhrases {
		triggerLower := strings.ToLower(trigger)
		if strings.Contains(taskLower, triggerLower) {
			score += 100
			if matchType == "" || matchType == "keyword" {
				matchType = "trigger"
				matchPhrase = trigger
			}
		}
	}

	// 2. Manifest keywords (for agents with structured routing)
	for _, kw := range agent.Keywords {
		kwLower := strings.ToLower(kw)
		if strings.Contains(taskLower, kwLower) {
			score += 60
			if matchType == "" {
				matchType = "keyword"
				matchPhrase = kw
			}
		}
	}

	// 3. Keyword mappings (legacy compatibility — same map as wizard recommender)
	for keyword, agentNames := range KeywordMappings {
		if strings.Contains(taskLower, keyword) {
			for i, name := range agentNames {
				if name == agent.Name {
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

	// 4. Agent name match
	nameLower := strings.ToLower(agent.Name)
	nameClean := strings.ReplaceAll(nameLower, "_", " ")
	nameClean2 := strings.ReplaceAll(nameLower, "-", " ")
	if strings.Contains(taskLower, nameLower) ||
		strings.Contains(taskLower, nameClean) ||
		strings.Contains(taskLower, nameClean2) {
		score += 80
		if matchType == "" {
			matchType = "name"
			matchPhrase = agent.Name
		}
	}

	// 5. Purpose/description match (fuzzy)
	descLower := strings.ToLower(agent.Description)
	taskWords := strings.Fields(taskLower)
	purposeMatchCount := 0
	for _, word := range taskWords {
		if len(word) > 3 && strings.Contains(descLower, word) {
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

// getDefaultRecommendation returns a fallback recommendation when no agents match.
func (r *Recommender) getDefaultRecommendation(taskLower string, phaseHint *schema.Phase) (*Recommendation, error) {
	// If phase is specified, recommend the main agent for that phase
	if phaseHint != nil {
		switch *phaseHint {
		case schema.PhaseREADY:
			if agent, err := r.loader.GetAgent("pathfinder"); err == nil {
				return &Recommendation{
					Agent:      agent,
					Confidence: "low",
					Reason:     "Default READY phase agent",
					Alternatives: []*AlternativeRecommendation{
						{AgentName: "lean_start", Reason: "Lightweight alternative for small teams"},
					},
				}, nil
			}
		case schema.PhaseFIRE:
			if agent, err := r.loader.GetAgent("product_architect"); err == nil {
				return &Recommendation{
					Agent:      agent,
					Confidence: "low",
					Reason:     "Default FIRE phase agent",
					Alternatives: []*AlternativeRecommendation{
						{AgentName: "feature_definition", Reason: "For creating individual features"},
					},
				}, nil
			}
		case schema.PhaseAIM:
			if agent, err := r.loader.GetAgent("synthesizer"); err == nil {
				return &Recommendation{
					Agent:      agent,
					Confidence: "low",
					Reason:     "Default AIM phase agent",
				}, nil
			}
		}
	}

	// Default to start_epf for general/unclear tasks
	if agent, err := r.loader.GetAgent("start_epf"); err == nil {
		return &Recommendation{
			Agent:      agent,
			Confidence: "low",
			Reason:     "Start here if you're new to EPF or unsure where to begin",
			Alternatives: []*AlternativeRecommendation{
				{AgentName: "lean_start", Reason: "Quick start for small teams"},
				{AgentName: "pathfinder", Reason: "Full strategic planning"},
			},
		}, nil
	}

	return nil, nil
}

// GetAgentsForPhase returns agents for a specific phase, ranked by relevance.
func (r *Recommender) GetAgentsForPhase(phase schema.Phase) []*AgentInfo {
	return r.loader.ListAgents(&phase, nil)
}

// GetOnboardingAgents returns agents suitable for new users.
func (r *Recommender) GetOnboardingAgents() []*AgentInfo {
	var result []*AgentInfo

	for _, name := range []string{"start_epf", "lean_start", "pathfinder"} {
		if agent, err := r.loader.GetAgent(name); err == nil {
			result = append(result, agent)
		}
	}

	return result
}

// --- Scoring helpers ---

func getConfidence(score int) string {
	if score >= 100 {
		return "high"
	} else if score >= 50 {
		return "medium"
	}
	return "low"
}

func buildReason(matchType, matchPhrase, agentName string) string {
	switch matchType {
	case "trigger":
		return "Matches trigger phrase: \"" + matchPhrase + "\""
	case "keyword":
		return "Matches keyword: \"" + matchPhrase + "\""
	case "name":
		return "Directly referenced agent: " + agentName
	case "purpose":
		return "Similar purpose to your task"
	default:
		return "Best match for your task"
	}
}

// KeywordMappings maps keywords to agent names for recommendation.
// This is the same data as wizard.KeywordMappings, preserved for backward
// compatibility so the same task descriptions produce the same recommendations.
var KeywordMappings = map[string][]string{
	// Feature creation
	"feature":            {"feature_definition", "product_architect"},
	"create feature":     {"feature_definition", "product_architect"},
	"define feature":     {"feature_definition"},
	"feature definition": {"feature_definition"},

	// Strategic planning
	"roadmap":    {"pathfinder", "lean_start", "roadmap_enrichment"},
	"planning":   {"pathfinder", "lean_start"},
	"strategy":   {"pathfinder", "lean_start"},
	"north star": {"pathfinder", "lean_start"},

	// READY phase
	"ready phase":   {"pathfinder", "lean_start"},
	"ready":         {"pathfinder", "lean_start"},
	"get started":   {"start_epf", "lean_start"},
	"start":         {"start_epf"},
	"begin":         {"start_epf"},
	"new to epf":    {"start_epf"},
	"what is epf":   {"start_epf"},
	"help with epf": {"start_epf"},

	// Analysis
	"trend":           {"01_trend_scout"},
	"market":          {"02_market_mapper"},
	"market analysis": {"02_market_mapper"},
	"internal":        {"03_internal_mirror"},
	"capability":      {"03_internal_mirror"},
	"problem":         {"04_problem_detective"},
	"investigate":     {"04_problem_detective"},

	// Validation
	"validate":  {"balance_checker"},
	"check":     {"balance_checker"},
	"viable":    {"balance_checker"},
	"viability": {"balance_checker"},
	"balance":   {"balance_checker"},

	// AIM phase
	"assess":              {"synthesizer"},
	"assessment":          {"synthesizer"},
	"retrospective":       {"synthesizer"},
	"review":              {"feature_quality_review", "strategic_coherence_review", "value_model_review", "synthesizer"},
	"aim phase":           {"synthesizer"},
	"aim":                 {"aim_trigger_assessment", "synthesizer"},
	"aim health":          {"aim_trigger_assessment"},
	"trigger":             {"aim_trigger_assessment"},
	"recalibrate":         {"aim_trigger_assessment"},
	"reality check":       {"strategic_reality_check"},
	"strategic reality":   {"strategic_reality_check"},
	"src":                 {"strategic_reality_check"},
	"artifact freshness":  {"strategic_reality_check"},
	"strategy validation": {"strategic_reality_check"},
	"cross-reference":     {"strategic_reality_check"},

	// FIRE phase
	"fire phase":          {"product_architect"},
	"fire":                {"product_architect"},
	"value model":         {"product_architect", "value_model_review"},
	"workflow":            {"product_architect"},
	"review value model":  {"value_model_review"},
	"value model review":  {"value_model_review"},
	"value model quality": {"value_model_review"},
	"anti-pattern":        {"value_model_review"},
	"product catalog":     {"value_model_review"},

	// Feature quality review
	"feature quality":        {"feature_quality_review"},
	"feature quality review": {"feature_quality_review"},
	"review features":        {"feature_quality_review"},
	"feature review":         {"feature_quality_review"},
	"persona quality":        {"feature_quality_review"},
	"jtbd quality":           {"feature_quality_review"},
	"scenario completeness":  {"feature_quality_review"},

	// Strategic coherence review
	"strategic coherence":        {"strategic_coherence_review"},
	"coherence review":           {"strategic_coherence_review"},
	"review strategic coherence": {"strategic_coherence_review"},
	"review strategy":            {"strategic_coherence_review"},
	"strategy alignment":         {"strategic_coherence_review"},
	"strategic alignment":        {"strategic_coherence_review"},
	"broken cross-references":    {"strategic_coherence_review"},
	"orphaned features":          {"strategic_coherence_review"},
	"strategy chain":             {"strategic_coherence_review"},

	// Utility
	"context sheet": {"context_sheet_generator"},
	"persona":       {"context_sheet_generator"},
	"enrich":        {"feature_enrichment", "roadmap_enrichment"},

	// Evaluation / quality review (cross-cutting)
	"evaluate":             {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"evaluate quality":     {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"evaluate strategy":    {"strategic_coherence_review"},
	"evaluate features":    {"feature_quality_review"},
	"evaluate value model": {"value_model_review"},
	"assess quality":       {"strategic_coherence_review", "feature_quality_review"},
	"check quality":        {"feature_quality_review", "value_model_review"},
	"review quality":       {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"quality review":       {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"semantic review":      {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"review instance":      {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
}
