package llm

// TaskType identifies the kind of LLM work being performed.
// Used by ModelSelector to route different tasks to different models.
type TaskType string

const (
	// TaskSignalClassification classifies ripple signal severity and authority tier.
	TaskSignalClassification TaskType = "signal_classification"
	// TaskAssessmentEnrichment writes narrative OKR assessments.
	TaskAssessmentEnrichment TaskType = "assessment_enrichment"
	// TaskCalibrationReasoning reasons about persevere/pivot/pull_the_plug decisions.
	TaskCalibrationReasoning TaskType = "calibration_reasoning"
	// TaskSignalResolution generates minimal artifact patches to fix misalignments.
	TaskSignalResolution TaskType = "signal_resolution"
)

// ModelSelector routes different task types to appropriate model configurations.
// This is the swap point for future per-task model routing (e.g. cheap model for
// classification, powerful model for calibration reasoning).
type ModelSelector interface {
	SelectModel(task TaskType) Config
}

// DefaultModelSelector returns the same configured model for all task types.
// This is the zero-change implementation — behaviour is identical to before.
type DefaultModelSelector struct {
	cfg Config
}

// NewDefaultModelSelector creates a selector that always returns cfg.
func NewDefaultModelSelector(cfg Config) *DefaultModelSelector {
	return &DefaultModelSelector{cfg: cfg}
}

// SelectModel returns the same Config for every task type.
func (s *DefaultModelSelector) SelectModel(_ TaskType) Config {
	return s.cfg
}
