package aim

// =============================================================================
// STRATEGIC REALITY CHECK TYPES
// =============================================================================

// StrategicRealityCheck represents the full SRC artifact.
type StrategicRealityCheck struct {
	Meta struct {
		EPFVersion  string `yaml:"epf_version" json:"epf_version,omitempty"`
		LastUpdated string `yaml:"last_updated" json:"last_updated,omitempty"`
	} `yaml:"meta,omitempty" json:"meta,omitempty"`
	Cycle              int                       `yaml:"cycle" json:"cycle"`
	AssessmentDate     string                    `yaml:"assessment_date,omitempty" json:"assessment_date,omitempty"`
	BeliefValidity     []BeliefValidityFinding   `yaml:"belief_validity,omitempty" json:"belief_validity,omitempty"`
	MarketCurrency     []MarketCurrencyFinding   `yaml:"market_currency,omitempty" json:"market_currency,omitempty"`
	StrategicAlignment []AlignmentFinding        `yaml:"strategic_alignment,omitempty" json:"strategic_alignment,omitempty"`
	ExecutionReality   []ExecutionRealityFinding `yaml:"execution_reality,omitempty" json:"execution_reality,omitempty"`
	RecalibrationPlan  []RecalibrationAction     `yaml:"recalibration_plan,omitempty" json:"recalibration_plan,omitempty"`
	Summary            SRCSummary                `yaml:"summary" json:"summary"`
}

// BeliefValidityFinding evaluates a belief, risk, or assumption against current evidence.
type BeliefValidityFinding struct {
	ID              string `yaml:"id" json:"id"`
	SourceArtifact  string `yaml:"source_artifact" json:"source_artifact"`
	FieldPath       string `yaml:"field_path" json:"field_path"`
	OriginalBelief  string `yaml:"original_belief,omitempty" json:"original_belief,omitempty"`
	CurrentEvidence string `yaml:"current_evidence,omitempty" json:"current_evidence,omitempty"`
	Signal          string `yaml:"signal" json:"signal"` // strengthening | holding | weakening | invalidated
	ConfidenceDelta string `yaml:"confidence_delta,omitempty" json:"confidence_delta,omitempty"`
}

// MarketCurrencyFinding evaluates freshness and relevance of market-facing artifacts.
type MarketCurrencyFinding struct {
	ID                string `yaml:"id" json:"id"`
	SourceArtifact    string `yaml:"source_artifact" json:"source_artifact"`
	FieldPath         string `yaml:"field_path,omitempty" json:"field_path,omitempty"`
	StalenessLevel    string `yaml:"staleness_level" json:"staleness_level"` // low | medium | high | critical
	DaysSinceReview   int    `yaml:"days_since_review,omitempty" json:"days_since_review,omitempty"`
	MarketChanges     string `yaml:"market_changes_detected,omitempty" json:"market_changes_detected,omitempty"`
	RecommendedAction string `yaml:"recommended_action,omitempty" json:"recommended_action,omitempty"`
}

// AlignmentFinding checks cross-reference integrity across EPF artifacts.
type AlignmentFinding struct {
	ID             string `yaml:"id" json:"id"`
	CheckType      string `yaml:"check_type" json:"check_type"` // value_model_path | kr_link | feature_dependency | maturity_vocabulary
	SourceArtifact string `yaml:"source_artifact" json:"source_artifact"`
	FieldPath      string `yaml:"field_path,omitempty" json:"field_path,omitempty"`
	Status         string `yaml:"status" json:"status"` // valid | broken | stale
	Details        string `yaml:"details,omitempty" json:"details,omitempty"`
	SuggestedFix   string `yaml:"suggested_fix,omitempty" json:"suggested_fix,omitempty"`
}

// ExecutionRealityFinding assesses whether stated status matches actual state.
type ExecutionRealityFinding struct {
	ID             string `yaml:"id" json:"id"`
	SourceArtifact string `yaml:"source_artifact" json:"source_artifact"`
	FieldPath      string `yaml:"field_path,omitempty" json:"field_path,omitempty"`
	ExpectedState  string `yaml:"expected_state,omitempty" json:"expected_state,omitempty"`
	ActualState    string `yaml:"actual_state,omitempty" json:"actual_state,omitempty"`
	GapDescription string `yaml:"gap_description,omitempty" json:"gap_description,omitempty"`
	Severity       string `yaml:"severity" json:"severity"` // info | warning | critical
}

// RecalibrationAction is a prioritized action to update READY/FIRE artifacts.
type RecalibrationAction struct {
	ID             string   `yaml:"id" json:"id"`
	TargetArtifact string   `yaml:"target_artifact" json:"target_artifact"`
	TargetSection  string   `yaml:"target_section,omitempty" json:"target_section,omitempty"`
	Action         string   `yaml:"action" json:"action"`     // review | update | rewrite | archive
	Priority       string   `yaml:"priority" json:"priority"` // critical | high | medium | low
	EffortEstimate string   `yaml:"effort_estimate,omitempty" json:"effort_estimate,omitempty"`
	Rationale      string   `yaml:"rationale,omitempty" json:"rationale,omitempty"`
	LinkedFindings []string `yaml:"linked_findings,omitempty" json:"linked_findings,omitempty"`
}

// SRCSummary provides overall health assessment and finding counts.
type SRCSummary struct {
	OverallHealth string         `yaml:"overall_health" json:"overall_health"` // healthy | attention_needed | at_risk | critical
	FindingCounts *FindingCounts `yaml:"finding_counts,omitempty" json:"finding_counts,omitempty"`
	GeneratedAt   string         `yaml:"generated_at,omitempty" json:"generated_at,omitempty"`
}

// FindingCounts holds the count of findings per section.
type FindingCounts struct {
	BeliefValidity       int `yaml:"belief_validity" json:"belief_validity"`
	MarketCurrency       int `yaml:"market_currency" json:"market_currency"`
	StrategicAlignment   int `yaml:"strategic_alignment" json:"strategic_alignment"`
	ExecutionReality     int `yaml:"execution_reality" json:"execution_reality"`
	RecalibrationActions int `yaml:"recalibration_actions" json:"recalibration_actions"`
}
