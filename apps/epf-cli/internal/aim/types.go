// Package aim provides shared types, loaders, and business logic for the
// AIM (Assessment & Calibration) phase of EPF. Both the CLI commands and
// MCP tools import from this package to avoid type duplication.
package aim

// =============================================================================
// ROADMAP TYPES (loaded from READY/05_roadmap_recipe.yaml)
// =============================================================================

// RoadmapData represents the roadmap structure needed by AIM operations.
type RoadmapData struct {
	Roadmap struct {
		ID         string `yaml:"id"`
		StrategyID string `yaml:"strategy_id"`
		Cycle      int    `yaml:"cycle"`
		Timeframe  string `yaml:"timeframe"`
		Tracks     struct {
			Product    TrackData `yaml:"product"`
			Strategy   TrackData `yaml:"strategy"`
			OrgOps     TrackData `yaml:"org_ops"`
			Commercial TrackData `yaml:"commercial"`
		} `yaml:"tracks"`
	} `yaml:"roadmap"`
}

// TrackData holds OKRs and assumptions for a single track.
type TrackData struct {
	OKRs        []OKRData        `yaml:"okrs"`
	Assumptions []AssumptionData `yaml:"riskiest_assumptions"`
}

// OKRData represents an Objective with Key Results.
type OKRData struct {
	ID          string   `yaml:"id"`
	Objective   string   `yaml:"objective"`
	Description string   `yaml:"description,omitempty"`
	KeyResults  []KRData `yaml:"key_results"`
}

// KRData represents a single Key Result.
type KRData struct {
	ID          string `yaml:"id"`
	Description string `yaml:"description"`
	Target      string `yaml:"target,omitempty"`
}

// AssumptionData represents a riskiest assumption from the roadmap.
type AssumptionData struct {
	ID         string `yaml:"id"`
	Statement  string `yaml:"statement"`
	Risk       string `yaml:"risk,omitempty"`
	Validation string `yaml:"validation_approach,omitempty"`
}

// =============================================================================
// ASSESSMENT REPORT TYPES
// =============================================================================

// AssessmentReport represents a loaded/generated assessment report.
type AssessmentReport struct {
	Meta struct {
		EPFVersion  string `yaml:"epf_version"`
		LastUpdated string `yaml:"last_updated"`
	} `yaml:"meta"`
	RoadmapID      string            `yaml:"roadmap_id"`
	Cycle          int               `yaml:"cycle"`
	OKRAssessments []OKRAssessment   `yaml:"okr_assessments"`
	Assumptions    []AssumptionCheck `yaml:"assumption_validations"`
}

// OKRAssessment holds the assessment for a single OKR.
type OKRAssessment struct {
	OKRID                   string      `yaml:"okr_id"`
	Assessment              string      `yaml:"assessment"`
	KeyResultOutcomes       []KROutcome `yaml:"key_result_outcomes"`
	DataSummary             DataSummary `yaml:"data_summary,omitempty"`
	CrossFunctionalInsights []string    `yaml:"cross_functional_insights,omitempty"`
}

// KROutcome tracks the result of a single Key Result.
type KROutcome struct {
	KRID      string   `yaml:"kr_id"`
	Target    string   `yaml:"target"`
	Actual    string   `yaml:"actual"`
	Status    string   `yaml:"status"` // exceeded | met | partially_met | missed
	Learnings []string `yaml:"learnings,omitempty"`
}

// DataSummary holds quantitative and qualitative data for an OKR assessment.
type DataSummary struct {
	Quantitative []QuantitativeMetric `yaml:"quantitative,omitempty"`
	Qualitative  []QualitativeInsight `yaml:"qualitative,omitempty"`
}

// QuantitativeMetric is a measured metric with target/actual/variance.
type QuantitativeMetric struct {
	Metric   string `yaml:"metric"`
	Target   string `yaml:"target"`
	Actual   string `yaml:"actual"`
	Variance string `yaml:"variance"`
}

// QualitativeInsight captures a qualitative observation.
type QualitativeInsight struct {
	Source  string `yaml:"source"`
	Insight string `yaml:"insight"`
}

// AssumptionCheck records evidence for or against an assumption.
type AssumptionCheck struct {
	ID       string `yaml:"id"`     // pattern: ^asmp-[a-z0-9-]+$
	Status   string `yaml:"status"` // validated | invalidated | inconclusive | pending
	Evidence string `yaml:"evidence"`
}

// =============================================================================
// CALIBRATION MEMO TYPES
// =============================================================================

// CalibrationMemo represents a calibration decision after assessment.
type CalibrationMemo struct {
	Meta struct {
		EPFVersion  string `yaml:"epf_version"`
		LastUpdated string `yaml:"last_updated"`
	} `yaml:"meta"`
	RoadmapID       string                     `yaml:"roadmap_id"`
	Cycle           int                        `yaml:"cycle"`
	AssessmentDate  string                     `yaml:"assessment_date,omitempty"` // ISO 8601 date
	Decision        string                     `yaml:"decision"`                  // persevere | pivot | pull_the_plug | pending_assessment
	Confidence      string                     `yaml:"confidence,omitempty"`      // low | medium | high
	Reasoning       string                     `yaml:"reasoning"`
	Learnings       CalibrationLearnings       `yaml:"learnings"`
	NextCycleFocus  CalibrationNextCycleFocus  `yaml:"next_cycle_focus"`
	NextReadyInputs CalibrationNextReadyInputs `yaml:"next_ready_inputs"`
	NextSteps       []string                   `yaml:"next_steps"`
}

// CalibrationLearnings holds structured learning from a cycle.
type CalibrationLearnings struct {
	ValidatedAssumptions   []string `yaml:"validated_assumptions"`
	InvalidatedAssumptions []string `yaml:"invalidated_assumptions"`
	Surprises              []string `yaml:"surprises"`
}

// CalibrationNextCycleFocus describes what to continue, stop, and start.
type CalibrationNextCycleFocus struct {
	ContinueBuilding []string `yaml:"continue_building"`
	StopBuilding     []string `yaml:"stop_building"`
	StartExploring   []string `yaml:"start_exploring"`
}

// CalibrationNextReadyInputs describes updates to feed into the next READY phase.
type CalibrationNextReadyInputs struct {
	OpportunityUpdate string   `yaml:"opportunity_update"`
	StrategyUpdate    string   `yaml:"strategy_update"`
	NewAssumptions    []string `yaml:"new_assumptions"`
}

// =============================================================================
// PROGRESS / RESULT TYPES
// =============================================================================

// ProgressSummary aggregates KR achievement stats.
type ProgressSummary struct {
	TotalKRs        int     `json:"total_krs"        yaml:"total_krs"`
	Exceeded        int     `json:"exceeded"         yaml:"exceeded"`
	Met             int     `json:"met"              yaml:"met"`
	PartiallyMet    int     `json:"partially_met"    yaml:"partially_met"`
	Missed          int     `json:"missed"           yaml:"missed"`
	AchievementRate float64 `json:"achievement_rate" yaml:"achievement_rate"`
}

// OKRProgress holds progress for a single OKR.
type OKRProgress struct {
	OKRID      string          `json:"okr_id"`
	Track      string          `json:"track"`
	Objective  string          `json:"objective,omitempty"`
	Summary    ProgressSummary `json:"summary"`
	KeyResults []KRProgress    `json:"key_results,omitempty"`
}

// KRProgress holds progress for a single KR.
type KRProgress struct {
	KRID   string `json:"kr_id"`
	Target string `json:"target,omitempty"`
	Actual string `json:"actual,omitempty"`
	Status string `json:"status"`
}

// CycleProgress aggregates progress for a single cycle.
type CycleProgress struct {
	Cycle     int             `json:"cycle"`
	Timeframe string          `json:"timeframe,omitempty"`
	Summary   ProgressSummary `json:"summary"`
	OKRs      []OKRProgress   `json:"okrs,omitempty"`
}

// TrackProgress aggregates progress for a single track.
type TrackProgress struct {
	Track   string          `json:"track"`
	Summary ProgressSummary `json:"summary"`
	Cycles  []int           `json:"cycles,omitempty"`
}

// AssumptionValidationSummary holds counts of assumption validation statuses.
type AssumptionValidationSummary struct {
	Total        int `json:"total"`
	Validated    int `json:"validated"`
	Invalidated  int `json:"invalidated"`
	Inconclusive int `json:"inconclusive"`
	Pending      int `json:"pending"`
}

// AssumptionValidationDetail holds the validation result for one assumption.
type AssumptionValidationDetail struct {
	ID         string `json:"id"`
	Statement  string `json:"statement"`
	Track      string `json:"track"`
	Risk       string `json:"risk,omitempty"`
	Status     string `json:"status"`
	Evidence   string `json:"evidence,omitempty"`
	Validation string `json:"validation_approach,omitempty"`
}
