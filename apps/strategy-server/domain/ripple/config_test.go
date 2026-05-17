package ripple

import "testing"

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
