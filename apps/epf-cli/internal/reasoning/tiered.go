package reasoning

import "fmt"

// NewLocalReasoner creates a reasoner using a local Ollama model (tier 5-7).
func NewLocalReasoner(cfg LLMConfig) Reasoner {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:11434"
	}
	if cfg.Model == "" {
		cfg.Model = "llama3.2:8b"
	}
	return &llmReasoner{
		client: NewLLMClient(cfg),
		tier:   TierLocal,
	}
}

// NewCloudReasoner creates a reasoner using a mid-tier cloud model (tier 3-4).
func NewCloudReasoner(cfg LLMConfig) Reasoner {
	if cfg.Model == "" {
		cfg.Model = "gpt-4o-mini"
	}
	return &llmReasoner{
		client: NewLLMClient(cfg),
		tier:   TierCloud,
	}
}

// NewFrontierReasoner creates a reasoner using a frontier model (tier 1-2).
func NewFrontierReasoner(cfg LLMConfig) Reasoner {
	if cfg.Model == "" {
		cfg.Model = "gpt-4o"
	}
	return &llmReasoner{
		client: NewLLMClient(cfg),
		tier:   TierFrontier,
	}
}

// TieredReasoner routes evaluations to the appropriate model tier based on
// the target node's inertia tier. It supports confidence-based escalation:
// if a lower tier returns low confidence, the evaluation is retried at a
// higher tier.
type TieredReasoner struct {
	local    Reasoner
	cloud    Reasoner
	frontier Reasoner

	// EscalationThreshold is the confidence below which the evaluation
	// escalates to the next tier. Default: 0.6.
	EscalationThreshold float64
}

// TieredConfig configures the three reasoning tiers.
type TieredConfig struct {
	Local    LLMConfig
	Cloud    LLMConfig
	Frontier LLMConfig

	// EscalationThreshold is the confidence below which evaluation
	// escalates to the next tier. Default: 0.6.
	EscalationThreshold float64
}

// NewTieredReasoner creates a reasoner that routes by inertia tier.
// Any tier can be nil — evaluations that would route to a nil tier
// escalate to the next available tier.
func NewTieredReasoner(cfg TieredConfig) *TieredReasoner {
	threshold := cfg.EscalationThreshold
	if threshold == 0 {
		threshold = 0.6
	}

	var local, cloud, frontier Reasoner

	// Only create reasoners for configured tiers
	if cfg.Local.BaseURL != "" || cfg.Local.Model != "" {
		local = NewLocalReasoner(cfg.Local)
	}
	if cfg.Cloud.BaseURL != "" || cfg.Cloud.APIKey != "" {
		cloud = NewCloudReasoner(cfg.Cloud)
	}
	if cfg.Frontier.BaseURL != "" || cfg.Frontier.APIKey != "" {
		frontier = NewFrontierReasoner(cfg.Frontier)
	}

	return &TieredReasoner{
		local:               local,
		cloud:               cloud,
		frontier:            frontier,
		EscalationThreshold: threshold,
	}
}

// Evaluate routes the evaluation to the appropriate tier based on the target's
// inertia tier, with confidence-based escalation.
func (t *TieredReasoner) Evaluate(req EvaluationRequest) (*Assessment, error) {
	startTier := TierForInertia(req.Target.InertiaTier)

	// Try the target tier first
	assessment, err := t.evaluateAtTier(startTier, req)
	if err != nil {
		// If the target tier failed entirely, try escalating
		next := t.nextTier(startTier)
		if next == startTier {
			return nil, fmt.Errorf("evaluation at %s failed and no higher tier available: %w", startTier, err)
		}
		return t.evaluateAtTier(next, req)
	}

	// Check for confidence-based escalation
	if assessment.Confidence < t.EscalationThreshold && assessment.Verdict != VerdictUnchanged {
		next := t.nextTier(startTier)
		if next != startTier {
			// Retry at higher tier
			escalated, err := t.evaluateAtTier(next, req)
			if err == nil {
				escalated.Reasoning = fmt.Sprintf("[escalated from %s due to low confidence %.2f] %s",
					startTier, assessment.Confidence, escalated.Reasoning)
				return escalated, nil
			}
			// Escalation failed — return original assessment
		}
	}

	return assessment, nil
}

// evaluateAtTier calls the reasoner for a specific tier.
func (t *TieredReasoner) evaluateAtTier(tier ModelTier, req EvaluationRequest) (*Assessment, error) {
	reasoner := t.reasonerForTier(tier)
	if reasoner == nil {
		return nil, fmt.Errorf("no reasoner configured for tier %s", tier)
	}
	return reasoner.Evaluate(req)
}

// reasonerForTier returns the reasoner for a tier, or nil if not configured.
func (t *TieredReasoner) reasonerForTier(tier ModelTier) Reasoner {
	switch tier {
	case TierLocal:
		return t.local
	case TierCloud:
		return t.cloud
	case TierFrontier:
		return t.frontier
	default:
		return nil
	}
}

// nextTier returns the next higher tier, or the same tier if already at max.
func (t *TieredReasoner) nextTier(current ModelTier) ModelTier {
	switch current {
	case TierLocal:
		if t.cloud != nil {
			return TierCloud
		}
		if t.frontier != nil {
			return TierFrontier
		}
		return current
	case TierCloud:
		if t.frontier != nil {
			return TierFrontier
		}
		return current
	default:
		return current
	}
}

// HasTier returns whether a specific tier is configured.
func (t *TieredReasoner) HasTier(tier ModelTier) bool {
	return t.reasonerForTier(tier) != nil
}
