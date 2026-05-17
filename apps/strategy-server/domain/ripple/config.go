package ripple

// RippleConfig holds all configurable thresholds for the convergence loop.
type RippleConfig struct {
	// Authority thresholds per artifact type.
	// Key is artifact type (e.g. "north_star", "feature").
	// Value is the threshold set for that type.
	// Missing types fall back to DefaultAuthorityThresholds.
	AuthorityThresholds map[string]AuthorityThresholds `json:"authority_thresholds,omitempty"`

	// EquilibriumThreshold is the minimum coherence score (0.0-1.0) for equilibrium.
	// Default: 0.70.
	EquilibriumThreshold float64 `json:"equilibrium_threshold"`

	// Damping controls for the convergence loop.
	Damping DampingConfig `json:"damping"`

	// NaturalTensionBaselines per track pair.
	// Key format: "trackA|trackB" (alphabetically ordered).
	// Value is expected semantic divergence that doesn't generate warnings.
	NaturalTensionBaselines map[string]float64 `json:"natural_tension_baselines,omitempty"`
}

// AuthorityThresholds defines the semantic distance boundaries for each authority tier.
// Scores are Memory search similarity scores (0-1, higher = more similar).
type AuthorityThresholds struct {
	// AutonomousAbove: similarity score above which a change is autonomous (trivial/minor).
	// Default: 0.85.
	AutonomousAbove float64 `json:"autonomous_above"`

	// GatedAbove: similarity score above which a change is gated (significant).
	// Below this threshold, a change is escalated (major).
	// Default: 0.70.
	GatedAbove float64 `json:"gated_above"`
}

// DampingConfig controls convergence loop safety.
type DampingConfig struct {
	// MaxIterations limits the convergence loop depth. Default: 5.
	MaxIterations int `json:"max_iterations"`

	// ChangeBudget is the maximum cumulative semantic distance of auto-commits
	// per convergence cycle. Default: 0.50.
	ChangeBudget float64 `json:"change_budget"`

	// AnchorDriftLimit is the maximum embedding drift allowed for North Star
	// and strategy formula during a convergence cycle. Default: 0.10.
	AnchorDriftLimit float64 `json:"anchor_drift_limit"`
}

// AuthorityTier is the approval level required for a change.
type AuthorityTier string

const (
	AuthorityAutonomous AuthorityTier = "autonomous"
	AuthorityGated      AuthorityTier = "gated"
	AuthorityEscalated  AuthorityTier = "escalated"
)

// DefaultRippleConfig returns conservative defaults.
func DefaultRippleConfig() RippleConfig {
	return RippleConfig{
		AuthorityThresholds: map[string]AuthorityThresholds{
			"_default": {
				AutonomousAbove: 0.85,
				GatedAbove:      0.70,
			},
			"north_star": {
				AutonomousAbove: 0.92,
				GatedAbove:      0.80,
			},
			"strategy_formula": {
				AutonomousAbove: 0.92,
				GatedAbove:      0.80,
			},
			"strategy_foundations": {
				AutonomousAbove: 0.90,
				GatedAbove:      0.78,
			},
			"feature": {
				AutonomousAbove: 0.80,
				GatedAbove:      0.65,
			},
		},
		EquilibriumThreshold: 0.70,
		Damping: DampingConfig{
			MaxIterations:    5,
			ChangeBudget:     0.50,
			AnchorDriftLimit: 0.10,
		},
		NaturalTensionBaselines: map[string]float64{
			"commercial|product":  0.25,
			"org_ops|product":     0.20,
			"product|strategy":    0.15,
			"commercial|strategy": 0.20,
			"org_ops|strategy":    0.15,
			"commercial|org_ops":  0.25,
		},
	}
}

// ThresholdsForType returns the authority thresholds for a given artifact type,
// falling back to the _default entry.
func (c RippleConfig) ThresholdsForType(artifactType string) AuthorityThresholds {
	if t, ok := c.AuthorityThresholds[artifactType]; ok {
		return t
	}
	if t, ok := c.AuthorityThresholds["_default"]; ok {
		return t
	}
	// Hard fallback if config is malformed.
	return AuthorityThresholds{
		AutonomousAbove: 0.85,
		GatedAbove:      0.70,
	}
}

// TensionBaseline returns the natural tension baseline for a track pair.
// Track names are sorted alphabetically to form the key.
func (c RippleConfig) TensionBaseline(trackA, trackB string) float64 {
	a, b := trackA, trackB
	if a > b {
		a, b = b, a
	}
	key := a + "|" + b
	if v, ok := c.NaturalTensionBaselines[key]; ok {
		return v
	}
	return 0.0 // no baseline — any tension is flagged
}
