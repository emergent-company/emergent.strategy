package ripple

import "testing"

func TestClassifyByScore_DefaultThresholds(t *testing.T) {
	cfg := DefaultRippleConfig()

	tests := []struct {
		name         string
		score        float64
		artifactType string
		wantClass    SemanticChangeClass
	}{
		{"identical feature", 1.0, "feature", ChangeClassTrivial},
		{"typo fix feature", 0.92, "feature", ChangeClassTrivial},
		{"clarification feature", 0.78, "feature", ChangeClassMinor},
		{"scope shift feature", 0.70, "feature", ChangeClassSignificant},
		{"major rewrite feature", 0.50, "feature", ChangeClassMajor},

		// North Star has tighter thresholds.
		{"typo fix north_star", 0.95, "north_star", ChangeClassTrivial},
		{"clarification north_star", 0.88, "north_star", ChangeClassMinor},
		{"scope shift north_star", 0.82, "north_star", ChangeClassSignificant},
		{"major rewrite north_star", 0.70, "north_star", ChangeClassMajor},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			class, _ := classifyByScore(tt.score, tt.artifactType, cfg)
			if class != tt.wantClass {
				t.Errorf("classifyByScore(%.2f, %s) = %s, want %s",
					tt.score, tt.artifactType, class, tt.wantClass)
			}
		})
	}
}

func TestClassifyChangeStructural(t *testing.T) {
	tests := []struct {
		name            string
		artifactType    string
		downstreamCount int
		wantClass       SemanticChangeClass
		wantTier        AuthorityTier
		wantMethod      string
	}{
		{
			name:            "north star is significant/escalated",
			artifactType:    "north_star",
			downstreamCount: 0,
			wantClass:       ChangeClassSignificant,
			wantTier:        AuthorityEscalated,
			wantMethod:      "structural",
		},
		{
			name:            "feature with few downstream is minor/gated",
			artifactType:    "feature",
			downstreamCount: 2,
			wantClass:       ChangeClassMinor,
			wantTier:        AuthorityGated,
			wantMethod:      "structural",
		},
		{
			name:            "feature with many downstream is significant/escalated",
			artifactType:    "feature",
			downstreamCount: 5,
			wantClass:       ChangeClassSignificant,
			wantTier:        AuthorityEscalated,
			wantMethod:      "structural",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ClassifyChangeStructural(tt.artifactType, tt.downstreamCount)
			if result.Class != tt.wantClass {
				t.Errorf("class = %s, want %s", result.Class, tt.wantClass)
			}
			if result.AuthorityTier != tt.wantTier {
				t.Errorf("tier = %s, want %s", result.AuthorityTier, tt.wantTier)
			}
			if result.Method != tt.wantMethod {
				t.Errorf("method = %s, want %s", result.Method, tt.wantMethod)
			}
		})
	}
}

func TestInferArtifactTypeFromKey(t *testing.T) {
	tests := []struct {
		key  string
		want string
	}{
		{"north_star", "north_star"},
		{"strategy_formula", "strategy_formula"},
		{"strategy_foundations", "strategy_foundations"},
		{"roadmap_recipe", "roadmap_recipe"},
		{"insight_analyses", "insight_analyses"},
		{"fd-001", "feature"},
		{"fd-042", "feature"},
		{"vm-product", "value_model"},
		{"vm-commercial/revenue", "value_model"},
		{"something_else", "_default"},
		{"ab", "_default"}, // too short for prefix match
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			got := inferArtifactTypeFromKey(tt.key)
			if got != tt.want {
				t.Errorf("inferArtifactTypeFromKey(%q) = %q, want %q", tt.key, got, tt.want)
			}
		})
	}
}

func TestClassifyByTextFallback_NeverAutonomous(t *testing.T) {
	cfg := DefaultRippleConfig()
	analyzer := &SemanticAnalyzer{} // nil mem, nil db — only text fallback used

	// Even identical text via fallback should not be autonomous for non-trivial types.
	// (The text fallback path applies for Memory-unavailable scenarios.)
	oldText := "enterprise data governance platform for regulated industries"
	newText := "enterprise data governance platform for regulated industries with compliance"

	result := analyzer.classifyByTextFallback(oldText, newText, "fd-001", cfg)

	// Must never be autonomous without semantic verification.
	if result.AuthorityTier == AuthorityAutonomous {
		t.Errorf("text fallback should never produce autonomous tier, got %s", result.AuthorityTier)
	}
	if result.Method != "text_fallback" {
		t.Errorf("method = %s, want text_fallback", result.Method)
	}
}

func TestClassifyByTextFallback_MajorIsEscalated(t *testing.T) {
	cfg := DefaultRippleConfig()
	analyzer := &SemanticAnalyzer{}

	oldText := "democratize data analytics for everyone regardless of technical expertise"
	newText := "enterprise compliance and regulatory governance for financial institutions"

	result := analyzer.classifyByTextFallback(oldText, newText, "north_star", cfg)

	if result.AuthorityTier != AuthorityEscalated {
		t.Errorf("major change via fallback should be escalated, got %s", result.AuthorityTier)
	}
}
