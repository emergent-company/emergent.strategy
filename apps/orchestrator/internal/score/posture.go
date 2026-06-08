package score

import "sort"

// Posture is a configurable weighting of the dimensions that reflects what kind
// of bets you are making right now. It NEVER produces a build/skip decision —
// it only determines the ORDER in which changes are surfaced for human review.
//
// Example: an early-stage venture up-weights Scope (find the big opportunity)
// and down-weights Maturity (everything is unvalidated anyway); a scaling phase
// up-weights Traceability and Contradiction (preserve coherence).
type Posture struct {
	Name    string                `json:"name"`
	Weights map[Dimension]float64 `json:"weights"`
}

// weight returns the weight for a dimension, defaulting to 1.0 when unset.
func (p Posture) weight(d Dimension) float64 {
	if w, ok := p.Weights[d]; ok {
		return w
	}
	return 1.0
}

// Built-in postures. These are presets; a user may supply custom weights.
var (
	// PostureBalanced weights every dimension equally.
	PostureBalanced = Posture{Name: "balanced", Weights: map[Dimension]float64{}}

	// PostureVentureEarly favors opportunity discovery over validation.
	PostureVentureEarly = Posture{Name: "venture-early", Weights: map[Dimension]float64{
		Scope:         2.0,
		Traceability:  1.5,
		Maturity:      0.5,
		Contradiction: 1.0,
		Sequencing:    0.5,
	}}

	// PostureScaling favors coherence and validated ground.
	PostureScaling = Posture{Name: "scaling", Weights: map[Dimension]float64{
		Traceability:  2.0,
		Contradiction: 2.0,
		Maturity:      1.5,
		Scope:         0.5,
		Sequencing:    1.0,
	}}
)

// Postures maps preset names to their definition.
var Postures = map[string]Posture{
	PostureBalanced.Name:     PostureBalanced,
	PostureVentureEarly.Name: PostureVentureEarly,
	PostureScaling.Name:      PostureScaling,
}

// Ranked pairs a card with its attention score and the posture used.
type Ranked struct {
	Card    Card   `json:"card"`
	Posture string `json:"posture"`
	// Attention is HIGHER for changes that need human review more urgently.
	// It is an inverse-confidence measure, NOT a quality or readiness score.
	Attention float64 `json:"attention"`
}

// attentionContribution returns how much a dimension result adds to the need for
// human attention, before weighting. Concerning or ambiguous signals raise
// attention; clear-favorable signals lower it; unmeasured dimensions add a small
// uncertainty cost (we don't know, so a human might want to).
func attentionContribution(r DimensionResult) float64 {
	switch r.Level {
	case Weak:
		return 1.0 // a concern — look here
	case Mixed:
		return 0.5 // ambiguous — maybe look
	case Signal:
		return 0.6 // adjacency signal — human interpretation needed
	case Strong:
		return 0.0 // clear — no attention needed on this axis
	default: // Unavailable
		return 0.3 // unknown — mild uncertainty cost
	}
}

// Rank computes the weighted attention score for each card under a posture and
// returns them sorted most-attention-first. Ties break by change ID for
// determinism. Tensions add a fixed premium because an unresolved conflict is
// precisely the case a human must adjudicate.
//
// This function makes NO accept/reject decision. It orders a review queue.
func Rank(cards []Card, p Posture) []Ranked {
	const tensionPremium = 1.5

	ranked := make([]Ranked, 0, len(cards))
	for _, c := range cards {
		var attention float64
		for _, r := range c.Dimensions {
			attention += p.weight(r.Dimension) * attentionContribution(r)
		}
		attention += float64(len(c.Tensions)) * tensionPremium
		ranked = append(ranked, Ranked{Card: c, Posture: p.Name, Attention: attention})
	}

	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].Attention != ranked[j].Attention {
			return ranked[i].Attention > ranked[j].Attention
		}
		return ranked[i].Card.ChangeID < ranked[j].Card.ChangeID
	})
	return ranked
}
