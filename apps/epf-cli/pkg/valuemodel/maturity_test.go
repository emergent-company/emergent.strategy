package valuemodel

import (
	"testing"
)

// Helper to create a SubComponent with a specific maturity stage.
func subWithStage(stage MaturityStage) SubComponent {
	return SubComponent{
		ID:       "test-sub",
		Name:     "Test Sub",
		Active:   true,
		Maturity: Maturity{Stage: stage},
	}
}

// Helper to create a Component with specified sub-component stages.
func compWithSubs(stages ...MaturityStage) Component {
	subs := make([]SubComponent, len(stages))
	for i, stage := range stages {
		subs[i] = subWithStage(stage)
	}
	return Component{
		ID:            "test-comp",
		Name:          "Test Component",
		SubComponents: subs,
	}
}

// Helper to create a Layer with components that have specified maturity.
func layerWithComps(compStages ...[]MaturityStage) Layer {
	comps := make([]Component, len(compStages))
	for i, stages := range compStages {
		comps[i] = compWithSubs(stages...)
	}
	return Layer{
		ID:         "test-layer",
		Name:       "Test Layer",
		Components: comps,
	}
}

func TestStageComparison(t *testing.T) {
	tests := []struct {
		name      string
		a         MaturityStage
		b         MaturityStage
		atOrAbove bool
		above     bool
	}{
		{"scaled >= scaled", MaturityScaled, MaturityScaled, true, false},
		{"scaled >= hypothetical", MaturityScaled, MaturityHypothetical, true, true},
		{"hypothetical >= scaled", MaturityHypothetical, MaturityScaled, false, false},
		{"proven >= emerging", MaturityProven, MaturityEmerging, true, true},
		{"emerging >= emerging", MaturityEmerging, MaturityEmerging, true, false},
		{"emerging >= proven", MaturityEmerging, MaturityProven, false, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := StageAtOrAbove(tt.a, tt.b); got != tt.atOrAbove {
				t.Errorf("StageAtOrAbove(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.atOrAbove)
			}
			if got := StageAbove(tt.a, tt.b); got != tt.above {
				t.Errorf("StageAbove(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.above)
			}
		})
	}
}

func TestNextStage(t *testing.T) {
	tests := []struct {
		current MaturityStage
		next    MaturityStage
	}{
		{MaturityHypothetical, MaturityEmerging},
		{MaturityEmerging, MaturityProven},
		{MaturityProven, MaturityScaled},
		{MaturityScaled, MaturityScaled}, // Already at max
	}

	for _, tt := range tests {
		t.Run(string(tt.current), func(t *testing.T) {
			if got := NextStage(tt.current); got != tt.next {
				t.Errorf("NextStage(%v) = %v, want %v", tt.current, got, tt.next)
			}
		})
	}
}

func TestCalculateL2Maturity(t *testing.T) {
	tests := []struct {
		name     string
		stages   []MaturityStage
		expected MaturityStage
	}{
		{
			name:     "empty returns hypothetical",
			stages:   []MaturityStage{},
			expected: MaturityHypothetical,
		},
		{
			name:     "all hypothetical",
			stages:   []MaturityStage{MaturityHypothetical, MaturityHypothetical, MaturityHypothetical},
			expected: MaturityHypothetical,
		},
		{
			name:     "all scaled",
			stages:   []MaturityStage{MaturityScaled, MaturityScaled, MaturityScaled},
			expected: MaturityScaled,
		},
		{
			name:     "all emerging",
			stages:   []MaturityStage{MaturityEmerging, MaturityEmerging, MaturityEmerging},
			expected: MaturityEmerging,
		},
		{
			name:     "exactly 80% emerging (4/5)",
			stages:   []MaturityStage{MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityHypothetical},
			expected: MaturityEmerging,
		},
		{
			name:     "just under 80% emerging (3/5 = 60%)",
			stages:   []MaturityStage{MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityHypothetical, MaturityHypothetical},
			expected: MaturityHypothetical,
		},
		{
			name:     "mixed high maturity - 80% proven",
			stages:   []MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityEmerging},
			expected: MaturityProven,
		},
		{
			name:     "80% at proven or above (3 proven, 1 scaled, 1 emerging = 80%)",
			stages:   []MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityScaled, MaturityEmerging},
			expected: MaturityProven,
		},
		{
			name:     "single item at scaled",
			stages:   []MaturityStage{MaturityScaled},
			expected: MaturityScaled,
		},
		{
			name:     "two items - 50% threshold fails 80%",
			stages:   []MaturityStage{MaturityScaled, MaturityHypothetical},
			expected: MaturityHypothetical,
		},
		{
			name:     "10 items - 8 scaled passes 80%",
			stages:   []MaturityStage{MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityEmerging, MaturityHypothetical},
			expected: MaturityScaled,
		},
		{
			name:     "10 items - 7 scaled fails 80%",
			stages:   []MaturityStage{MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityEmerging, MaturityEmerging, MaturityHypothetical},
			expected: MaturityEmerging, // 9/10 are at emerging or above
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			subs := make([]SubComponent, len(tt.stages))
			for i, stage := range tt.stages {
				subs[i] = subWithStage(stage)
			}

			got := CalculateL2Maturity(subs)
			if got != tt.expected {
				t.Errorf("CalculateL2Maturity() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestCalculateL2MaturityWithEmptyStage(t *testing.T) {
	// Empty stage should be treated as hypothetical
	subs := []SubComponent{
		{ID: "sub1", Maturity: Maturity{Stage: ""}}, // Empty
		{ID: "sub2", Maturity: Maturity{Stage: MaturityEmerging}},
		{ID: "sub3", Maturity: Maturity{Stage: MaturityEmerging}},
		{ID: "sub4", Maturity: Maturity{Stage: MaturityEmerging}},
		{ID: "sub5", Maturity: Maturity{Stage: MaturityEmerging}},
	}

	got := CalculateL2Maturity(subs)
	// 4/5 = 80% are emerging, so should be emerging
	if got != MaturityEmerging {
		t.Errorf("CalculateL2Maturity() = %v, want %v", got, MaturityEmerging)
	}
}

func TestCalculateL1Maturity(t *testing.T) {
	tests := []struct {
		name     string
		comps    []Component
		expected MaturityStage
	}{
		{
			name:     "empty components",
			comps:    []Component{},
			expected: MaturityHypothetical,
		},
		{
			name: "all L2s at emerging",
			comps: []Component{
				compWithSubs(MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging),
				compWithSubs(MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging),
			},
			expected: MaturityEmerging,
		},
		{
			name: "mixed L2s - one proven, one emerging",
			comps: []Component{
				compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),
				compWithSubs(MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging),
			},
			expected: MaturityEmerging, // 50% at proven, need 80%
		},
		{
			name: "5 L2s - 4 proven, 1 emerging = 80%",
			comps: []Component{
				compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),
				compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),
				compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),
				compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),
				compWithSubs(MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging),
			},
			expected: MaturityProven,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateL1Maturity(tt.comps)
			if got != tt.expected {
				t.Errorf("CalculateL1Maturity() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestCalculateTrackMaturity(t *testing.T) {
	tests := []struct {
		name     string
		layers   []Layer
		expected MaturityStage
	}{
		{
			name:     "empty layers",
			layers:   []Layer{},
			expected: MaturityHypothetical,
		},
		{
			name: "5 layers - 4 at proven, 1 at emerging",
			layers: []Layer{
				layerWithComps(
					[]MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven},
				),
				layerWithComps(
					[]MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven},
				),
				layerWithComps(
					[]MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven},
				),
				layerWithComps(
					[]MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven},
				),
				layerWithComps(
					[]MaturityStage{MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging},
				),
			},
			expected: MaturityProven, // 4/5 = 80%
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateTrackMaturity(tt.layers)
			if got != tt.expected {
				t.Errorf("CalculateTrackMaturity() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestGetMaturityDistribution(t *testing.T) {
	stages := []MaturityStage{
		MaturityHypothetical,
		MaturityEmerging, MaturityEmerging,
		MaturityProven, MaturityProven, MaturityProven,
		MaturityScaled,
	}

	dist := GetMaturityDistribution(stages)

	if dist.Hypothetical != 1 {
		t.Errorf("dist.Hypothetical = %d, want 1", dist.Hypothetical)
	}
	if dist.Emerging != 2 {
		t.Errorf("dist.Emerging = %d, want 2", dist.Emerging)
	}
	if dist.Proven != 3 {
		t.Errorf("dist.Proven = %d, want 3", dist.Proven)
	}
	if dist.Scaled != 1 {
		t.Errorf("dist.Scaled = %d, want 1", dist.Scaled)
	}
}

func TestGetMaturityDistributionWithEmptyAndUnknown(t *testing.T) {
	stages := []MaturityStage{
		"",        // Empty - should count as hypothetical
		"unknown", // Unknown - should count as hypothetical
		MaturityEmerging,
	}

	dist := GetMaturityDistribution(stages)

	if dist.Hypothetical != 2 {
		t.Errorf("dist.Hypothetical = %d, want 2 (for empty and unknown)", dist.Hypothetical)
	}
	if dist.Emerging != 1 {
		t.Errorf("dist.Emerging = %d, want 1", dist.Emerging)
	}
}

func TestAnalyzeL2Maturity(t *testing.T) {
	// 5 subs: 3 proven, 2 emerging
	subs := []SubComponent{
		subWithStage(MaturityProven),
		subWithStage(MaturityProven),
		subWithStage(MaturityProven),
		subWithStage(MaturityEmerging),
		subWithStage(MaturityEmerging),
	}

	analysis := AnalyzeL2Maturity(subs)

	// Calculated stage should be emerging (only 60% at proven)
	if analysis.CalculatedStage != MaturityEmerging {
		t.Errorf("CalculatedStage = %v, want %v", analysis.CalculatedStage, MaturityEmerging)
	}

	// Check distribution
	if analysis.Distribution.Proven != 3 {
		t.Errorf("Distribution.Proven = %d, want 3", analysis.Distribution.Proven)
	}
	if analysis.Distribution.Emerging != 2 {
		t.Errorf("Distribution.Emerging = %d, want 2", analysis.Distribution.Emerging)
	}

	// Check total
	if analysis.Total != 5 {
		t.Errorf("Total = %d, want 5", analysis.Total)
	}

	// Check AtOrAbove
	if analysis.AtOrAbove[MaturityProven] != 3 {
		t.Errorf("AtOrAbove[proven] = %d, want 3", analysis.AtOrAbove[MaturityProven])
	}
	if analysis.AtOrAbove[MaturityEmerging] != 5 {
		t.Errorf("AtOrAbove[emerging] = %d, want 5", analysis.AtOrAbove[MaturityEmerging])
	}

	// Check percentages
	if analysis.Percentage[MaturityProven] != 60.0 {
		t.Errorf("Percentage[proven] = %v, want 60.0", analysis.Percentage[MaturityProven])
	}
	if analysis.Percentage[MaturityEmerging] != 100.0 {
		t.Errorf("Percentage[emerging] = %v, want 100.0", analysis.Percentage[MaturityEmerging])
	}

	// NextStageNeeded: to reach proven, need 80% = 4, have 3, so need 1 more
	if analysis.NextStageNeeded != 1 {
		t.Errorf("NextStageNeeded = %d, want 1", analysis.NextStageNeeded)
	}
}

func TestAnalyzeL2MaturityEmpty(t *testing.T) {
	analysis := AnalyzeL2Maturity([]SubComponent{})

	if analysis.CalculatedStage != MaturityHypothetical {
		t.Errorf("CalculatedStage = %v, want %v", analysis.CalculatedStage, MaturityHypothetical)
	}
	if analysis.Total != 0 {
		t.Errorf("Total = %d, want 0", analysis.Total)
	}
}

func TestAnalyzeL1Maturity(t *testing.T) {
	// Create 5 components with varying maturity levels
	comps := []Component{
		compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),           // L2 = proven
		compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),           // L2 = proven
		compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),           // L2 = proven
		compWithSubs(MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven),           // L2 = proven
		compWithSubs(MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging, MaturityEmerging), // L2 = emerging
	}

	analysis := AnalyzeL1Maturity(comps)

	// 4/5 = 80% at proven → L1 = proven
	if analysis.CalculatedStage != MaturityProven {
		t.Errorf("CalculatedStage = %v, want %v", analysis.CalculatedStage, MaturityProven)
	}

	if analysis.Total != 5 {
		t.Errorf("Total = %d, want 5", analysis.Total)
	}

	if analysis.Distribution.Proven != 4 {
		t.Errorf("Distribution.Proven = %d, want 4", analysis.Distribution.Proven)
	}
}

func TestAnalyzeTrackMaturity(t *testing.T) {
	layers := []Layer{
		layerWithComps(
			[]MaturityStage{MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled},
		),
		layerWithComps(
			[]MaturityStage{MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled, MaturityScaled},
		),
		layerWithComps(
			[]MaturityStage{MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven},
		),
	}

	analysis := AnalyzeTrackMaturity(layers)

	// 2/3 = 66.7% at scaled (below 80%), but all 3 at proven or above → track = proven
	if analysis.CalculatedStage != MaturityProven {
		t.Errorf("CalculatedStage = %v, want %v", analysis.CalculatedStage, MaturityProven)
	}
}

func TestProgressToNextStage(t *testing.T) {
	tests := []struct {
		name             string
		subs             []SubComponent
		expectedProgress float64
	}{
		{
			name: "at scaled - 100% progress",
			subs: []SubComponent{
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
			},
			expectedProgress: 100.0,
		},
		{
			name: "60% at proven, emerging overall - 75% toward proven",
			subs: []SubComponent{
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
			},
			expectedProgress: 75.0, // 60% / 80% = 75%
		},
		{
			name: "40% at emerging, hypothetical overall - 50% toward emerging",
			subs: []SubComponent{
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityHypothetical),
				subWithStage(MaturityHypothetical),
				subWithStage(MaturityHypothetical),
			},
			expectedProgress: 50.0, // 40% / 80% = 50%
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			analysis := AnalyzeL2Maturity(tt.subs)
			progress := analysis.ProgressToNextStage()

			if progress != tt.expectedProgress {
				t.Errorf("ProgressToNextStage() = %v, want %v", progress, tt.expectedProgress)
			}
		})
	}
}

func TestNextStageNeededCalculation(t *testing.T) {
	tests := []struct {
		name         string
		subs         []SubComponent
		expectedNeed int
	}{
		{
			name: "need 1 more for proven (have 3/5 at proven, need 4)",
			subs: []SubComponent{
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
			},
			expectedNeed: 1,
		},
		{
			name: "need 2 more for emerging (have 2/5 at emerging, need 4)",
			subs: []SubComponent{
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityHypothetical),
				subWithStage(MaturityHypothetical),
				subWithStage(MaturityHypothetical),
			},
			expectedNeed: 2,
		},
		{
			name: "already at scaled - need 0",
			subs: []SubComponent{
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
				subWithStage(MaturityScaled),
			},
			expectedNeed: 0,
		},
		{
			name: "10 items - have 7 proven, need 1 more for proven (need 8)",
			subs: []SubComponent{
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityProven),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
				subWithStage(MaturityEmerging),
			},
			expectedNeed: 1, // 7/10 = 70%, need 8 for 80%, so need 1 more
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			analysis := AnalyzeL2Maturity(tt.subs)

			if analysis.NextStageNeeded != tt.expectedNeed {
				t.Errorf("NextStageNeeded = %d, want %d (stage=%v, total=%d)",
					analysis.NextStageNeeded, tt.expectedNeed, analysis.CalculatedStage, analysis.Total)
			}
		})
	}
}

func TestEdgeCases(t *testing.T) {
	t.Run("single item determines maturity", func(t *testing.T) {
		subs := []SubComponent{subWithStage(MaturityProven)}
		got := CalculateL2Maturity(subs)
		if got != MaturityProven {
			t.Errorf("Single proven item should result in proven, got %v", got)
		}
	})

	t.Run("boundary at 80% threshold with 10 items", func(t *testing.T) {
		// 8/10 = exactly 80%
		subs := make([]SubComponent, 10)
		for i := 0; i < 8; i++ {
			subs[i] = subWithStage(MaturityProven)
		}
		for i := 8; i < 10; i++ {
			subs[i] = subWithStage(MaturityHypothetical)
		}

		got := CalculateL2Maturity(subs)
		if got != MaturityProven {
			t.Errorf("Exactly 80%% should qualify, got %v", got)
		}
	})

	t.Run("just below 80% threshold with 10 items", func(t *testing.T) {
		// 7/10 = 70% (below 80%)
		subs := make([]SubComponent, 10)
		for i := 0; i < 7; i++ {
			subs[i] = subWithStage(MaturityProven)
		}
		for i := 7; i < 10; i++ {
			subs[i] = subWithStage(MaturityHypothetical)
		}

		got := CalculateL2Maturity(subs)
		if got != MaturityHypothetical {
			t.Errorf("70%% should not qualify for proven, got %v", got)
		}
	})

	t.Run("nested hierarchy propagates correctly", func(t *testing.T) {
		// Create a track with known maturity
		// Each layer has 5 components, each component has 5 subs all at proven
		layers := make([]Layer, 5)
		for i := 0; i < 5; i++ {
			comps := make([]Component, 5)
			for j := 0; j < 5; j++ {
				comps[j] = compWithSubs(
					MaturityProven, MaturityProven, MaturityProven, MaturityProven, MaturityProven,
				)
			}
			layers[i] = Layer{Components: comps}
		}

		// All L3s are proven → all L2s are proven → all L1s are proven → track is proven
		got := CalculateTrackMaturity(layers)
		if got != MaturityProven {
			t.Errorf("Fully proven hierarchy should be proven, got %v", got)
		}
	})
}

func TestComponentGetSubComponents(t *testing.T) {
	t.Run("prefers SubComponents field", func(t *testing.T) {
		comp := Component{
			SubComponents: []SubComponent{{ID: "from-sub-components"}},
			Subs:          []SubComponent{{ID: "from-subs"}},
		}

		subs := comp.GetSubComponents()
		if len(subs) != 1 || subs[0].ID != "from-sub-components" {
			t.Errorf("Should prefer SubComponents field, got %v", subs)
		}
	})

	t.Run("falls back to Subs field", func(t *testing.T) {
		comp := Component{
			Subs: []SubComponent{{ID: "from-subs"}},
		}

		subs := comp.GetSubComponents()
		if len(subs) != 1 || subs[0].ID != "from-subs" {
			t.Errorf("Should fall back to Subs field, got %v", subs)
		}
	})

	t.Run("returns empty when both are empty", func(t *testing.T) {
		comp := Component{}

		subs := comp.GetSubComponents()
		if len(subs) != 0 {
			t.Errorf("Should return empty, got %v", subs)
		}
	})
}
