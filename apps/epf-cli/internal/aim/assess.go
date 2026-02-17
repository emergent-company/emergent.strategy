package aim

import (
	"fmt"
	"strings"
)

// GenerateAssessmentReport creates an assessment report template from roadmap data.
func GenerateAssessmentReport(roadmap *RoadmapData, roadmapID string) *AssessmentReport {
	assessment := &AssessmentReport{
		RoadmapID: roadmapID,
		Cycle:     roadmap.Roadmap.Cycle,
	}
	assessment.Meta.EPFVersion = "2.0.0"
	assessment.Meta.LastUpdated = "TODO: Add current date"

	tracks := GetAllTracks(roadmap)
	for trackName, track := range tracks {
		for _, okr := range track.OKRs {
			okrAssessment := OKRAssessment{
				OKRID: okr.ID,
				Assessment: fmt.Sprintf(
					"TODO: Provide narrative assessment of %s (%s track)\n\nObjective: %s\n\nProvide 100-2000 character assessment covering:\n1. Context - What was the objective and why?\n2. Outcomes - What did we achieve? Reference specific KR statuses below.\n3. Evidence - What data supports these outcomes?\n4. Insights - What did we learn? What surprised us?\n5. Implications - What does this mean for next cycle?",
					okr.ID, trackName, okr.Objective),
			}

			for _, kr := range okr.KeyResults {
				krOutcome := KROutcome{
					KRID:   kr.ID,
					Target: GetTargetFromKR(kr),
					Actual: "TODO: Provide actual outcome (same format as target)",
					Status: "TODO: Set status (exceeded/met/partially_met/missed)",
					Learnings: []string{
						"TODO: Add key learning from this KR (30-300 chars)",
					},
				}
				okrAssessment.KeyResultOutcomes = append(okrAssessment.KeyResultOutcomes, krOutcome)
			}

			okrAssessment.DataSummary = DataSummary{
				Quantitative: []QuantitativeMetric{
					{
						Metric:   "TODO: Metric name",
						Target:   "TODO: Target value",
						Actual:   "TODO: Actual value",
						Variance: "TODO: Variance (+/- with units)",
					},
				},
				Qualitative: []QualitativeInsight{
					{
						Source:  "TODO: Source (e.g., 'User interviews (n=15)')",
						Insight: "TODO: Qualitative insight (50-300 chars)",
					},
				},
			}

			okrAssessment.CrossFunctionalInsights = []string{
				"TODO: Add cross-functional insight about collaboration, dependencies, or organizational patterns (50-300 chars)",
			}

			assessment.OKRAssessments = append(assessment.OKRAssessments, okrAssessment)
		}

		for _, assumption := range track.Assumptions {
			check := AssumptionCheck{
				ID:     assumption.ID,
				Status: "TODO: Set status (validated/invalidated/inconclusive/pending)",
				Evidence: fmt.Sprintf(
					"TODO: Provide evidence for assumption: %s\n\nValidation approach: %s",
					assumption.Statement, assumption.Validation),
			}
			assessment.Assumptions = append(assessment.Assumptions, check)
		}
	}

	return assessment
}

// ValidateAssumptions cross-references roadmap assumptions with assessment evidence.
func ValidateAssumptions(roadmap *RoadmapData, assessments []AssessmentReport) (AssumptionValidationSummary, []AssumptionValidationDetail) {
	var summary AssumptionValidationSummary
	var details []AssumptionValidationDetail

	// Build evidence map from assessments
	evidenceMap := make(map[string]AssumptionCheck)
	for _, assessment := range assessments {
		for _, check := range assessment.Assumptions {
			evidenceMap[check.ID] = check
		}
	}

	tracks := GetAllTracks(roadmap)
	for trackName, track := range tracks {
		for _, assumption := range track.Assumptions {
			detail := AssumptionValidationDetail{
				ID:         assumption.ID,
				Statement:  assumption.Statement,
				Track:      trackName,
				Risk:       assumption.Risk,
				Validation: assumption.Validation,
			}

			if evidence, found := evidenceMap[assumption.ID]; found {
				detail.Status = evidence.Status
				detail.Evidence = evidence.Evidence

				switch strings.ToLower(evidence.Status) {
				case "validated":
					summary.Validated++
				case "invalidated":
					summary.Invalidated++
				case "inconclusive":
					summary.Inconclusive++
				case "pending":
					summary.Pending++
				default:
					detail.Status = "pending"
					summary.Pending++
				}
			} else {
				detail.Status = "pending"
				detail.Evidence = "No assessment evidence available yet"
				summary.Pending++
			}

			summary.Total++
			details = append(details, detail)
		}
	}

	return summary, details
}

// CalculateOKRProgress computes achievement rates from assessment reports.
func CalculateOKRProgress(roadmap *RoadmapData, assessments []AssessmentReport, cycleFilter int, allCycles bool, trackFilter string) (
	overall ProgressSummary,
	byTrack map[string]TrackProgress,
	cycles []CycleProgress,
) {
	byTrack = make(map[string]TrackProgress)
	okrMetadata := BuildOKRMetadata(roadmap)

	for _, assessment := range assessments {
		if cycleFilter > 0 && assessment.Cycle != cycleFilter {
			continue
		}

		cycleProgress := CycleProgress{
			Cycle: assessment.Cycle,
			OKRs:  []OKRProgress{},
		}

		for _, okrAssessment := range assessment.OKRAssessments {
			track := GetTrackFromID(okrAssessment.OKRID)

			if trackFilter != "" && track != trackFilter {
				continue
			}

			okrProg := OKRProgress{
				OKRID:     okrAssessment.OKRID,
				Track:     track,
				Objective: okrMetadata[okrAssessment.OKRID],
			}

			for _, krOutcome := range okrAssessment.KeyResultOutcomes {
				krProg := KRProgress{
					KRID:   krOutcome.KRID,
					Target: krOutcome.Target,
					Actual: krOutcome.Actual,
					Status: krOutcome.Status,
				}

				switch strings.ToLower(krOutcome.Status) {
				case "exceeded":
					okrProg.Summary.Exceeded++
					cycleProgress.Summary.Exceeded++
					overall.Exceeded++
				case "met":
					okrProg.Summary.Met++
					cycleProgress.Summary.Met++
					overall.Met++
				case "partially_met", "partially met":
					okrProg.Summary.PartiallyMet++
					cycleProgress.Summary.PartiallyMet++
					overall.PartiallyMet++
				case "missed":
					okrProg.Summary.Missed++
					cycleProgress.Summary.Missed++
					overall.Missed++
				default:
					continue // skip TODO or invalid
				}

				okrProg.Summary.TotalKRs++
				cycleProgress.Summary.TotalKRs++
				overall.TotalKRs++
				okrProg.KeyResults = append(okrProg.KeyResults, krProg)
			}

			if okrProg.Summary.TotalKRs > 0 {
				okrProg.Summary.AchievementRate = float64(okrProg.Summary.Exceeded+okrProg.Summary.Met) /
					float64(okrProg.Summary.TotalKRs) * 100
			}

			cycleProgress.OKRs = append(cycleProgress.OKRs, okrProg)

			// Update track summary
			ts := byTrack[track]
			ts.Track = track
			ts.Summary.TotalKRs += okrProg.Summary.TotalKRs
			ts.Summary.Exceeded += okrProg.Summary.Exceeded
			ts.Summary.Met += okrProg.Summary.Met
			ts.Summary.PartiallyMet += okrProg.Summary.PartiallyMet
			ts.Summary.Missed += okrProg.Summary.Missed
			if !ContainsInt(ts.Cycles, assessment.Cycle) {
				ts.Cycles = append(ts.Cycles, assessment.Cycle)
			}
			byTrack[track] = ts
		}

		if cycleProgress.Summary.TotalKRs > 0 {
			cycleProgress.Summary.AchievementRate = float64(cycleProgress.Summary.Exceeded+cycleProgress.Summary.Met) /
				float64(cycleProgress.Summary.TotalKRs) * 100
		}

		cycles = append(cycles, cycleProgress)
	}

	// Calculate achievement rates
	if overall.TotalKRs > 0 {
		overall.AchievementRate = float64(overall.Exceeded+overall.Met) /
			float64(overall.TotalKRs) * 100
	}
	for track, ts := range byTrack {
		if ts.Summary.TotalKRs > 0 {
			ts.Summary.AchievementRate = float64(ts.Summary.Exceeded+ts.Summary.Met) /
				float64(ts.Summary.TotalKRs) * 100
			byTrack[track] = ts
		}
	}

	return overall, byTrack, cycles
}
