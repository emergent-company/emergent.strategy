package ripple

// ClassifyAuthority determines the authority tier for a change based on its
// semantic similarity score and artifact type. The score is a Memory search
// similarity (0-1, higher = more similar = smaller change).
func ClassifyAuthority(score float64, artifactType string, cfg RippleConfig) AuthorityTier {
	thresholds := cfg.ThresholdsForType(artifactType)

	switch {
	case score >= thresholds.AutonomousAbove:
		return AuthorityAutonomous
	case score >= thresholds.GatedAbove:
		return AuthorityGated
	default:
		return AuthorityEscalated
	}
}

// ClassifyAuthorityStructural provides a fallback authority classification
// when Memory is unavailable. Uses downstream artifact count and artifact
// type sensitivity as proxies for change magnitude.
//
// Without semantic verification, autonomous commits are never allowed —
// the minimum tier is gated.
func ClassifyAuthorityStructural(artifactType string, downstreamCount int) AuthorityTier {
	// Foundational artifacts are always escalated without semantic verification.
	switch artifactType {
	case "north_star", "strategy_formula", "strategy_foundations":
		return AuthorityEscalated
	}

	// Many downstream artifacts = larger blast radius.
	if downstreamCount >= 4 {
		return AuthorityEscalated
	}

	// Without Memory, never allow autonomous — default to gated.
	return AuthorityGated
}
