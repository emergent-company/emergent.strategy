package aim

// RecalibrationChangeset is the output of the recalibration engine.
// It merges calibration memo decisions and SRC findings into a unified,
// prioritized list of changes needed in READY and FIRE artifacts.
type RecalibrationChangeset struct {
	Meta struct {
		GeneratedAt string `yaml:"generated_at" json:"generated_at"`
		Cycle       int    `yaml:"cycle" json:"cycle"`
		Decision    string `yaml:"decision" json:"decision"`                         // persevere | pivot | pull_the_plug
		Confidence  string `yaml:"confidence,omitempty" json:"confidence,omitempty"` // low | medium | high
		SourceMemo  bool   `yaml:"source_memo" json:"source_memo"`
		SourceSRC   bool   `yaml:"source_src" json:"source_src"`
	} `yaml:"meta" json:"meta"`

	// Changes is the ordered list of changes needed, sorted by priority.
	Changes []RecalibrationChange `yaml:"changes" json:"changes"`

	// LRAUpdates contains mechanical changes to apply to the LRA.
	// These are always auto-applicable.
	LRAUpdates *LRARecalibrationUpdate `yaml:"lra_updates,omitempty" json:"lra_updates,omitempty"`

	Summary RecalibrationSummary `yaml:"summary" json:"summary"`
}

// RecalibrationChange represents a single change needed in a READY or FIRE artifact.
type RecalibrationChange struct {
	ID             string `yaml:"id" json:"id"`
	TargetArtifact string `yaml:"target_artifact" json:"target_artifact"`                   // relative path, e.g. "READY/04_strategy_formula.yaml"
	TargetSection  string `yaml:"target_section,omitempty" json:"target_section,omitempty"` // YAML path, e.g. "strategy_formula.risks"
	Operation      string `yaml:"operation" json:"operation"`                               // review | update | rewrite | archive | append
	Priority       string `yaml:"priority" json:"priority"`                                 // critical | high | medium | low
	AutoApplicable bool   `yaml:"auto_applicable" json:"auto_applicable"`                   // can --apply write this mechanically?

	// Source traces where this change recommendation came from.
	Source ChangeSource `yaml:"source" json:"source"`

	// ContentHint provides guidance on what to change.
	// For auto-applicable changes, this is the exact value to write.
	// For review-required changes, this is guidance text from the calibration memo or SRC.
	ContentHint string `yaml:"content_hint,omitempty" json:"content_hint,omitempty"`

	// EffortEstimate is optional effort guidance (from SRC).
	EffortEstimate string `yaml:"effort_estimate,omitempty" json:"effort_estimate,omitempty"`
}

// ChangeSource identifies where a recalibration change recommendation originated.
type ChangeSource struct {
	Type      string `yaml:"type" json:"type"`                                 // "calibration_memo" | "src" | "merged"
	Field     string `yaml:"field,omitempty" json:"field,omitempty"`           // calibration memo field path, e.g. "next_ready_inputs.strategy_update"
	FindingID string `yaml:"finding_id,omitempty" json:"finding_id,omitempty"` // SRC finding ID, e.g. "src-mc-001"
}

// LRARecalibrationUpdate contains LRA changes derived from the calibration decision.
type LRARecalibrationUpdate struct {
	PrimaryObjective *string `yaml:"primary_objective,omitempty" json:"primary_objective,omitempty"`
	LifecycleStage   *string `yaml:"lifecycle_stage,omitempty" json:"lifecycle_stage,omitempty"`
	PrimaryTrack     *string `yaml:"primary_track,omitempty" json:"primary_track,omitempty"`
	SecondaryTrack   *string `yaml:"secondary_track,omitempty" json:"secondary_track,omitempty"`
}

// RecalibrationSummary provides aggregate statistics about the changeset.
type RecalibrationSummary struct {
	TotalChanges      int `yaml:"total_changes" json:"total_changes"`
	CriticalChanges   int `yaml:"critical_changes" json:"critical_changes"`
	HighChanges       int `yaml:"high_changes" json:"high_changes"`
	MediumChanges     int `yaml:"medium_changes" json:"medium_changes"`
	LowChanges        int `yaml:"low_changes" json:"low_changes"`
	AutoApplicable    int `yaml:"auto_applicable" json:"auto_applicable"`
	ManualReview      int `yaml:"manual_review" json:"manual_review"`
	FromCalibMemo     int `yaml:"from_calibration_memo" json:"from_calibration_memo"`
	FromSRC           int `yaml:"from_src" json:"from_src"`
	AffectedArtifacts int `yaml:"affected_artifacts" json:"affected_artifacts"`
}

// Priority constants for sorting.
var priorityOrder = map[string]int{
	"critical": 0,
	"high":     1,
	"medium":   2,
	"low":      3,
}

// HealthDiagnostic represents a single finding from `aim health`.
type HealthDiagnostic struct {
	ID          string `yaml:"id" json:"id"`
	Category    string `yaml:"category" json:"category"` // lra_staleness | missing_assessment | overdue_trigger | delivery_drift | evidence_gap | src_findings
	Severity    string `yaml:"severity" json:"severity"` // critical | warning | info
	Title       string `yaml:"title" json:"title"`
	Description string `yaml:"description" json:"description"`
	Artifact    string `yaml:"artifact,omitempty" json:"artifact,omitempty"` // affected file
	FieldPath   string `yaml:"field_path,omitempty" json:"field_path,omitempty"`
	Suggestion  string `yaml:"suggestion,omitempty" json:"suggestion,omitempty"`
}

// HealthReport is the output of `aim health`.
type HealthReport struct {
	GeneratedAt   string             `yaml:"generated_at" json:"generated_at"`
	InstancePath  string             `yaml:"instance_path" json:"instance_path"`
	OverallStatus string             `yaml:"overall_status" json:"overall_status"` // healthy | attention_needed | at_risk | critical
	Diagnostics   []HealthDiagnostic `yaml:"diagnostics" json:"diagnostics"`
	Summary       HealthSummary      `yaml:"summary" json:"summary"`
}

// HealthSummary provides aggregate counts.
type HealthSummary struct {
	Total    int `yaml:"total" json:"total"`
	Critical int `yaml:"critical" json:"critical"`
	Warning  int `yaml:"warning" json:"warning"`
	Info     int `yaml:"info" json:"info"`
}
