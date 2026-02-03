package valuemodel

// Maturity calculation implements the 80% rule for EPF Value Model Maturity (VMM).
//
// The 80% Rule:
// - L3 sub-components are assessed directly with evidence
// - L2 = 80%+ of L3s at stage X → L2 is at stage X
// - L1 = 80%+ of L2s at stage X → L1 is at stage X
// - Track = 80%+ of L1s at stage X → Track is at stage X

// MaturityThreshold is the percentage threshold for maturity rollup (80%).
const MaturityThreshold = 0.8

// stageOrder maps maturity stages to their ordinal value for comparison.
var stageOrder = map[MaturityStage]int{
	MaturityHypothetical: 0,
	MaturityEmerging:     1,
	MaturityProven:       2,
	MaturityScaled:       3,
}

// StageAtOrAbove returns true if stage a is at or above stage b.
func StageAtOrAbove(a, b MaturityStage) bool {
	return stageOrder[a] >= stageOrder[b]
}

// StageAbove returns true if stage a is above stage b.
func StageAbove(a, b MaturityStage) bool {
	return stageOrder[a] > stageOrder[b]
}

// NextStage returns the next maturity stage, or the same stage if already at max.
func NextStage(stage MaturityStage) MaturityStage {
	switch stage {
	case MaturityHypothetical:
		return MaturityEmerging
	case MaturityEmerging:
		return MaturityProven
	case MaturityProven:
		return MaturityScaled
	default:
		return MaturityScaled
	}
}

// CalculateL2Maturity calculates the maturity of an L2 component from its L3 sub-components.
// Uses the 80% rule: if 80%+ of L3s are at stage X or above, L2 is at stage X.
func CalculateL2Maturity(subComponents []SubComponent) MaturityStage {
	if len(subComponents) == 0 {
		return MaturityHypothetical
	}

	// Count sub-components at each stage
	counts := make(map[MaturityStage]int)
	for _, sub := range subComponents {
		stage := sub.Maturity.Stage
		if stage == "" {
			stage = MaturityHypothetical
		}
		counts[stage]++
	}

	return calculateMaturityFromCounts(counts, len(subComponents))
}

// CalculateL1Maturity calculates the maturity of an L1 layer from its L2 components.
func CalculateL1Maturity(components []Component) MaturityStage {
	if len(components) == 0 {
		return MaturityHypothetical
	}

	// Calculate each component's maturity first
	counts := make(map[MaturityStage]int)
	for _, comp := range components {
		stage := CalculateL2Maturity(comp.GetSubComponents())
		counts[stage]++
	}

	return calculateMaturityFromCounts(counts, len(components))
}

// CalculateTrackMaturity calculates the maturity of a track from its L1 layers.
func CalculateTrackMaturity(layers []Layer) MaturityStage {
	if len(layers) == 0 {
		return MaturityHypothetical
	}

	counts := make(map[MaturityStage]int)
	for _, layer := range layers {
		stage := CalculateL1Maturity(layer.Components)
		counts[stage]++
	}

	return calculateMaturityFromCounts(counts, len(layers))
}

// calculateMaturityFromCounts applies the 80% rule to determine maturity.
// Returns the highest stage where 80%+ of children are at or above that stage.
func calculateMaturityFromCounts(counts map[MaturityStage]int, total int) MaturityStage {
	if total == 0 {
		return MaturityHypothetical
	}

	// Check from highest to lowest stage
	for _, stage := range []MaturityStage{MaturityScaled, MaturityProven, MaturityEmerging, MaturityHypothetical} {
		atOrAbove := countAtOrAbove(counts, stage)
		if float64(atOrAbove)/float64(total) >= MaturityThreshold {
			return stage
		}
	}

	return MaturityHypothetical
}

// countAtOrAbove counts items at or above a given stage.
func countAtOrAbove(counts map[MaturityStage]int, targetStage MaturityStage) int {
	count := 0
	for stage, n := range counts {
		if StageAtOrAbove(stage, targetStage) {
			count += n
		}
	}
	return count
}

// GetMaturityDistribution returns the distribution of items across maturity stages.
func GetMaturityDistribution(stages []MaturityStage) MaturityDistribution {
	dist := MaturityDistribution{}
	for _, stage := range stages {
		switch stage {
		case MaturityHypothetical:
			dist.Hypothetical++
		case MaturityEmerging:
			dist.Emerging++
		case MaturityProven:
			dist.Proven++
		case MaturityScaled:
			dist.Scaled++
		default:
			dist.Hypothetical++ // Default to hypothetical
		}
	}
	return dist
}

// MaturityAnalysis provides a detailed breakdown of maturity for a component.
type MaturityAnalysis struct {
	CalculatedStage MaturityStage
	Distribution    MaturityDistribution
	Total           int
	AtOrAbove       map[MaturityStage]int
	Percentage      map[MaturityStage]float64
	NextStageNeeded int // How many more items needed at next stage
}

// AnalyzeL2Maturity provides detailed analysis for an L2 component.
func AnalyzeL2Maturity(subComponents []SubComponent) *MaturityAnalysis {
	if len(subComponents) == 0 {
		return &MaturityAnalysis{
			CalculatedStage: MaturityHypothetical,
			AtOrAbove:       make(map[MaturityStage]int),
			Percentage:      make(map[MaturityStage]float64),
		}
	}

	// Collect stages
	stages := make([]MaturityStage, 0, len(subComponents))
	for _, sub := range subComponents {
		stage := sub.Maturity.Stage
		if stage == "" {
			stage = MaturityHypothetical
		}
		stages = append(stages, stage)
	}

	return analyzeMaturity(stages)
}

// AnalyzeL1Maturity provides detailed analysis for an L1 layer.
func AnalyzeL1Maturity(components []Component) *MaturityAnalysis {
	if len(components) == 0 {
		return &MaturityAnalysis{
			CalculatedStage: MaturityHypothetical,
			AtOrAbove:       make(map[MaturityStage]int),
			Percentage:      make(map[MaturityStage]float64),
		}
	}

	stages := make([]MaturityStage, 0, len(components))
	for _, comp := range components {
		stages = append(stages, CalculateL2Maturity(comp.GetSubComponents()))
	}

	return analyzeMaturity(stages)
}

// AnalyzeTrackMaturity provides detailed analysis for a track.
func AnalyzeTrackMaturity(layers []Layer) *MaturityAnalysis {
	if len(layers) == 0 {
		return &MaturityAnalysis{
			CalculatedStage: MaturityHypothetical,
			AtOrAbove:       make(map[MaturityStage]int),
			Percentage:      make(map[MaturityStage]float64),
		}
	}

	stages := make([]MaturityStage, 0, len(layers))
	for _, layer := range layers {
		stages = append(stages, CalculateL1Maturity(layer.Components))
	}

	return analyzeMaturity(stages)
}

// analyzeMaturity provides detailed maturity analysis for a set of stages.
func analyzeMaturity(stages []MaturityStage) *MaturityAnalysis {
	total := len(stages)
	if total == 0 {
		return &MaturityAnalysis{
			CalculatedStage: MaturityHypothetical,
			AtOrAbove:       make(map[MaturityStage]int),
			Percentage:      make(map[MaturityStage]float64),
		}
	}

	// Build distribution
	dist := GetMaturityDistribution(stages)

	// Calculate counts and percentages
	counts := map[MaturityStage]int{
		MaturityHypothetical: dist.Hypothetical,
		MaturityEmerging:     dist.Emerging,
		MaturityProven:       dist.Proven,
		MaturityScaled:       dist.Scaled,
	}

	atOrAbove := make(map[MaturityStage]int)
	percentage := make(map[MaturityStage]float64)

	for _, stage := range MaturityStages {
		atOrAbove[stage] = countAtOrAbove(counts, stage)
		percentage[stage] = float64(atOrAbove[stage]) / float64(total) * 100
	}

	// Calculate the current stage
	calculatedStage := calculateMaturityFromCounts(counts, total)

	// Calculate how many more items needed to advance to next stage
	nextStage := NextStage(calculatedStage)
	nextStageNeeded := 0
	if nextStage != calculatedStage {
		threshold := int(float64(total)*MaturityThreshold + 0.999) // Round up
		currentAtOrAbove := atOrAbove[nextStage]
		if currentAtOrAbove < threshold {
			nextStageNeeded = threshold - currentAtOrAbove
		}
	}

	return &MaturityAnalysis{
		CalculatedStage: calculatedStage,
		Distribution:    dist,
		Total:           total,
		AtOrAbove:       atOrAbove,
		Percentage:      percentage,
		NextStageNeeded: nextStageNeeded,
	}
}

// ProgressToNextStage returns the percentage progress towards the next maturity stage.
func (a *MaturityAnalysis) ProgressToNextStage() float64 {
	if a.CalculatedStage == MaturityScaled {
		return 100.0 // Already at max
	}

	nextStage := NextStage(a.CalculatedStage)
	currentPercentage := a.Percentage[nextStage]

	// Progress is measured as percentage of the 80% threshold
	return (currentPercentage / (MaturityThreshold * 100)) * 100
}
