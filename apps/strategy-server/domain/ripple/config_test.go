package ripple

import "testing"

// ---------------------------------------------------------------------------
// Cascade depth config helpers (Group 8, tasks 9.5–9.7)
// ---------------------------------------------------------------------------

func TestDefaultRippleConfig_CascadeDefaults(t *testing.T) {
	cfg := DefaultRippleConfig()

	if got := cfg.CascadeEscalationDepthOrDefault(); got != 2 {
		t.Errorf("CascadeEscalationDepthOrDefault=%d, want 2", got)
	}
	if got := cfg.CascadeMaxDepthOrDefault(); got != 3 {
		t.Errorf("CascadeMaxDepthOrDefault=%d, want 3", got)
	}
	if got := cfg.SkillCooldownSeconds("adapt-foundations"); got != 300 {
		t.Errorf("SkillCooldownSeconds(adapt-foundations)=%d, want 300", got)
	}
	if got := cfg.SkillCooldownSeconds("adapt-strategy"); got != 600 {
		t.Errorf("SkillCooldownSeconds(adapt-strategy)=%d, want 600", got)
	}
	if got := cfg.SkillCooldownSeconds("unknown-skill"); got != 0 {
		t.Errorf("SkillCooldownSeconds(unknown-skill)=%d, want 0", got)
	}
}

func TestCascadeEscalationDepthOrDefault_UsesConfiguredValue(t *testing.T) {
	cfg := RippleConfig{CascadeEscalationDepth: 5}
	if got := cfg.CascadeEscalationDepthOrDefault(); got != 5 {
		t.Errorf("CascadeEscalationDepthOrDefault=%d, want 5", got)
	}
}

func TestCascadeMaxDepthOrDefault_UsesConfiguredValue(t *testing.T) {
	cfg := RippleConfig{CascadeMaxDepth: 7}
	if got := cfg.CascadeMaxDepthOrDefault(); got != 7 {
		t.Errorf("CascadeMaxDepthOrDefault=%d, want 7", got)
	}
}

func TestSkillCooldownSeconds_NilMap_ReturnsDefaults(t *testing.T) {
	cfg := RippleConfig{SkillCooldowns: nil}
	if got := cfg.SkillCooldownSeconds("adapt-foundations"); got != 300 {
		t.Errorf("nil map adapt-foundations=%d, want 300", got)
	}
	if got := cfg.SkillCooldownSeconds("adapt-strategy"); got != 600 {
		t.Errorf("nil map adapt-strategy=%d, want 600", got)
	}
}

func TestSkillCooldownSeconds_CustomMap(t *testing.T) {
	cfg := RippleConfig{SkillCooldowns: map[string]int{
		"adapt-foundations": 60,
		"custom-skill":      120,
	}}
	if got := cfg.SkillCooldownSeconds("adapt-foundations"); got != 60 {
		t.Errorf("custom adapt-foundations=%d, want 60", got)
	}
	if got := cfg.SkillCooldownSeconds("custom-skill"); got != 120 {
		t.Errorf("custom custom-skill=%d, want 120", got)
	}
	if got := cfg.SkillCooldownSeconds("adapt-strategy"); got != 0 {
		t.Errorf("missing key adapt-strategy=%d, want 0 (not in custom map)", got)
	}
}

func TestDefaultRippleConfig(t *testing.T) {
	cfg := DefaultRippleConfig()

	if cfg.EquilibriumThreshold != 0.70 {
		t.Errorf("equilibrium threshold=%f, want 0.70", cfg.EquilibriumThreshold)
	}
	if cfg.Damping.MaxIterations != 5 {
		t.Errorf("max iterations=%d, want 5", cfg.Damping.MaxIterations)
	}
	if cfg.Damping.ChangeBudget != 0.50 {
		t.Errorf("change budget=%f, want 0.50", cfg.Damping.ChangeBudget)
	}
	if cfg.Damping.AnchorDriftLimit != 0.10 {
		t.Errorf("anchor drift limit=%f, want 0.10", cfg.Damping.AnchorDriftLimit)
	}
	if len(cfg.AuthorityThresholds) == 0 {
		t.Fatal("authority thresholds should not be empty")
	}
	if len(cfg.NaturalTensionBaselines) == 0 {
		t.Fatal("natural tension baselines should not be empty")
	}
}

func TestThresholdsForType(t *testing.T) {
	cfg := DefaultRippleConfig()

	// Specific type.
	ns := cfg.ThresholdsForType("north_star")
	if ns.AutonomousAbove != 0.92 {
		t.Errorf("north_star autonomous above=%f, want 0.92", ns.AutonomousAbove)
	}

	// Feature type.
	feat := cfg.ThresholdsForType("feature")
	if feat.AutonomousAbove != 0.80 {
		t.Errorf("feature autonomous above=%f, want 0.80", feat.AutonomousAbove)
	}

	// Unknown type → fallback to _default.
	unk := cfg.ThresholdsForType("unknown_type")
	def := cfg.ThresholdsForType("_default")
	if unk.AutonomousAbove != def.AutonomousAbove {
		t.Errorf("unknown type should fall back to _default: got %f, want %f", unk.AutonomousAbove, def.AutonomousAbove)
	}
}

func TestTensionBaseline(t *testing.T) {
	cfg := DefaultRippleConfig()

	// Known pair — order doesn't matter.
	b1 := cfg.TensionBaseline("product", "commercial")
	b2 := cfg.TensionBaseline("commercial", "product")
	if b1 != b2 {
		t.Errorf("tension baseline should be symmetric: %f != %f", b1, b2)
	}
	if b1 != 0.25 {
		t.Errorf("product|commercial baseline=%f, want 0.25", b1)
	}

	// Tighter pair.
	ps := cfg.TensionBaseline("product", "strategy")
	if ps != 0.15 {
		t.Errorf("product|strategy baseline=%f, want 0.15", ps)
	}

	// Unknown pair → 0.
	unk := cfg.TensionBaseline("foo", "bar")
	if unk != 0.0 {
		t.Errorf("unknown pair baseline=%f, want 0.0", unk)
	}
}
