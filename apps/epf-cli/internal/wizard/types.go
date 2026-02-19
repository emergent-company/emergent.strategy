// Package wizard provides wizard and agent prompt loading for EPF.
package wizard

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// WizardType represents the type of wizard
type WizardType string

const (
	// WizardTypeAgentPrompt is a conversational AI persona (adaptive, context-aware)
	WizardTypeAgentPrompt WizardType = "agent_prompt"

	// WizardTypeWizard is a step-by-step guide (structured, sequential)
	WizardTypeWizard WizardType = "wizard"

	// WizardTypeReadySubWizard is a READY phase sub-wizard (numbered sequence)
	WizardTypeReadySubWizard WizardType = "ready_sub_wizard"
)

// String returns the string representation of the wizard type
func (t WizardType) String() string {
	return string(t)
}

// WizardTypeFromString converts a string to WizardType
func WizardTypeFromString(s string) (WizardType, error) {
	switch strings.ToLower(s) {
	case "agent_prompt", "agentprompt":
		return WizardTypeAgentPrompt, nil
	case "wizard":
		return WizardTypeWizard, nil
	case "ready_sub_wizard", "readysubwizard", "sub_wizard", "subwizard":
		return WizardTypeReadySubWizard, nil
	default:
		return "", fmt.Errorf("unknown wizard type: %s", s)
	}
}

// WizardInfo contains metadata about a loaded wizard
type WizardInfo struct {
	// Name is the wizard identifier (e.g., "start_epf", "pathfinder")
	Name string `json:"name"`

	// Type is the wizard type (agent_prompt, wizard, ready_sub_wizard)
	Type WizardType `json:"type"`

	// Phase is the EPF phase this wizard belongs to (READY, FIRE, AIM, or empty for onboarding)
	Phase schema.Phase `json:"phase,omitempty"`

	// Purpose is a short description of what the wizard does
	Purpose string `json:"purpose"`

	// TriggerPhrases are phrases that should activate this wizard
	TriggerPhrases []string `json:"trigger_phrases,omitempty"`

	// Duration is the estimated time to complete (e.g., "5-10 min", "8-12 hours")
	Duration string `json:"duration,omitempty"`

	// Outputs lists what artifacts the wizard creates
	Outputs []string `json:"outputs,omitempty"`

	// RelatedWizards lists other wizards related to this one
	RelatedWizards []string `json:"related_wizards,omitempty"`

	// RelatedTemplates lists templates this wizard uses
	RelatedTemplates []string `json:"related_templates,omitempty"`

	// RelatedSchemas lists schemas this wizard validates against
	RelatedSchemas []string `json:"related_schemas,omitempty"`

	// FilePath is the relative path to the wizard file
	FilePath string `json:"file_path"`

	// Content is the full markdown content of the wizard
	Content string `json:"content"`
}

// Recommendation represents a wizard recommendation for a task
type Recommendation struct {
	// Wizard is the recommended wizard
	Wizard *WizardInfo `json:"wizard"`

	// Confidence is the confidence level (high, medium, low)
	Confidence string `json:"confidence"`

	// Reason explains why this wizard was recommended
	Reason string `json:"reason"`

	// Alternatives are other wizards that might also be suitable
	Alternatives []*AlternativeRecommendation `json:"alternatives,omitempty"`
}

// AlternativeRecommendation represents an alternative wizard recommendation
type AlternativeRecommendation struct {
	// WizardName is the name of the alternative wizard
	WizardName string `json:"wizard_name"`

	// Reason explains why this wizard might also be suitable
	Reason string `json:"reason"`
}

// AgentInstructionsInfo contains metadata about an agent instructions file
type AgentInstructionsInfo struct {
	// Name is the filename (e.g., "AGENTS.md", "copilot-instructions.md")
	Name string `json:"name"`

	// Purpose describes what the instructions are for
	Purpose string `json:"purpose"`

	// Scope indicates the scope (comprehensive, quick-reference, maintenance)
	Scope string `json:"scope"`

	// FilePath is the relative path to the file
	FilePath string `json:"file_path"`

	// Content is the full markdown content
	Content string `json:"content"`
}

// File patterns for wizard detection
const (
	// AgentPromptSuffix is the suffix for agent prompt files
	AgentPromptSuffix = ".agent_prompt.md"

	// WizardSuffix is the suffix for wizard files
	WizardSuffix = ".wizard.md"

	// ReadySubWizardPattern is the pattern for READY sub-wizards (##_name.agent_prompt.md)
	ReadySubWizardPattern = "^[0-9]{2}_.*\\.agent_prompt\\.md$"
)

// Known agent instructions files
var KnownAgentInstructions = map[string]struct {
	Purpose string
	Scope   string
}{
	"AGENTS.md": {
		Purpose: "Full AI agent instructions for EPF",
		Scope:   "comprehensive",
	},
	"copilot-instructions.md": {
		Purpose: "Quick reference for daily operations",
		Scope:   "quick-reference",
	},
	".ai-agent-instructions.md": {
		Purpose: "Framework maintenance protocol",
		Scope:   "maintenance",
	},
}

// PhaseForWizard maps wizard names to their phases
var PhaseForWizard = map[string]schema.Phase{
	// Onboarding (no phase)
	"start_epf": "",

	// READY phase
	"lean_start":           schema.PhaseREADY,
	"pathfinder":           schema.PhaseREADY,
	"01_trend_scout":       schema.PhaseREADY,
	"02_market_mapper":     schema.PhaseREADY,
	"03_internal_mirror":   schema.PhaseREADY,
	"04_problem_detective": schema.PhaseREADY,
	"balance_checker":      schema.PhaseREADY,
	"roadmap_enrichment":   schema.PhaseREADY,

	// FIRE phase
	"product_architect":          schema.PhaseFIRE,
	"feature_definition":         schema.PhaseFIRE,
	"feature_enrichment":         schema.PhaseFIRE,
	"value_model_review":         schema.PhaseFIRE,
	"feature_quality_review":     schema.PhaseFIRE,
	"strategic_coherence_review": schema.PhaseREADY,

	// AIM phase
	"synthesizer":             schema.PhaseAIM,
	"aim_trigger_assessment":  schema.PhaseAIM,
	"strategic_reality_check": schema.PhaseAIM,

	// Utility (no specific phase)
	"context_sheet_generator": "",
}

// KeywordMappings maps keywords to wizard names for recommendation
var KeywordMappings = map[string][]string{
	// Feature creation
	"feature":            {"feature_definition", "product_architect"},
	"create feature":     {"feature_definition", "product_architect"},
	"define feature":     {"feature_definition"},
	"feature definition": {"feature_definition"},

	// Strategic planning
	"roadmap":    {"pathfinder", "lean_start", "roadmap_enrichment"},
	"planning":   {"pathfinder", "lean_start"},
	"strategy":   {"pathfinder", "lean_start"},
	"north star": {"pathfinder", "lean_start"},

	// READY phase
	"ready phase":   {"pathfinder", "lean_start"},
	"ready":         {"pathfinder", "lean_start"},
	"get started":   {"start_epf", "lean_start"},
	"start":         {"start_epf"},
	"begin":         {"start_epf"},
	"new to epf":    {"start_epf"},
	"what is epf":   {"start_epf"},
	"help with epf": {"start_epf"},

	// Analysis
	"trend":           {"01_trend_scout"},
	"market":          {"02_market_mapper"},
	"market analysis": {"02_market_mapper"},
	"internal":        {"03_internal_mirror"},
	"capability":      {"03_internal_mirror"},
	"problem":         {"04_problem_detective"},
	"investigate":     {"04_problem_detective"},

	// Validation
	"validate":  {"balance_checker"},
	"check":     {"balance_checker"},
	"viable":    {"balance_checker"},
	"viability": {"balance_checker"},
	"balance":   {"balance_checker"},

	// AIM phase
	"assess":              {"synthesizer"},
	"assessment":          {"synthesizer"},
	"retrospective":       {"synthesizer"},
	"review":              {"synthesizer", "value_model_review"},
	"aim phase":           {"synthesizer"},
	"aim":                 {"aim_trigger_assessment", "synthesizer"},
	"aim health":          {"aim_trigger_assessment"},
	"trigger":             {"aim_trigger_assessment"},
	"recalibrate":         {"aim_trigger_assessment"},
	"reality check":       {"strategic_reality_check"},
	"strategic reality":   {"strategic_reality_check"},
	"src":                 {"strategic_reality_check"},
	"artifact freshness":  {"strategic_reality_check"},
	"strategy validation": {"strategic_reality_check"},
	"cross-reference":     {"strategic_reality_check"},

	// FIRE phase
	"fire phase":          {"product_architect"},
	"fire":                {"product_architect"},
	"value model":         {"product_architect", "value_model_review"},
	"workflow":            {"product_architect"},
	"review value model":  {"value_model_review"},
	"value model review":  {"value_model_review"},
	"value model quality": {"value_model_review"},
	"anti-pattern":        {"value_model_review"},
	"product catalog":     {"value_model_review"},

	// Feature quality review
	"feature quality":        {"feature_quality_review"},
	"feature quality review": {"feature_quality_review"},
	"review features":        {"feature_quality_review"},
	"feature review":         {"feature_quality_review"},
	"persona quality":        {"feature_quality_review"},
	"jtbd quality":           {"feature_quality_review"},
	"scenario completeness":  {"feature_quality_review"},

	// Strategic coherence review
	"strategic coherence":     {"strategic_coherence_review"},
	"coherence review":        {"strategic_coherence_review"},
	"strategy alignment":      {"strategic_coherence_review"},
	"strategic alignment":     {"strategic_coherence_review"},
	"broken cross-references": {"strategic_coherence_review"},
	"orphaned features":       {"strategic_coherence_review"},
	"strategy chain":          {"strategic_coherence_review"},

	// Utility
	"context sheet": {"context_sheet_generator"},
	"persona":       {"context_sheet_generator"},
	"enrich":        {"feature_enrichment", "roadmap_enrichment"},

	// Evaluation / quality review (cross-cutting)
	"evaluate":             {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"evaluate quality":     {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"evaluate strategy":    {"strategic_coherence_review"},
	"evaluate features":    {"feature_quality_review"},
	"evaluate value model": {"value_model_review"},
	"assess quality":       {"strategic_coherence_review", "feature_quality_review"},
	"check quality":        {"feature_quality_review", "value_model_review"},
	"review quality":       {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"quality review":       {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"semantic review":      {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
	"review instance":      {"strategic_coherence_review", "feature_quality_review", "value_model_review"},
}
