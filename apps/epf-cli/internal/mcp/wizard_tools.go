package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/wizard"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// Wizard Tools
// =============================================================================

// WizardListItem represents a wizard in the list response
type WizardListItem struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Phase    string   `json:"phase,omitempty"`
	Purpose  string   `json:"purpose"`
	Duration string   `json:"duration,omitempty"`
	Triggers []string `json:"triggers,omitempty"`
}

// handleListWizards handles the epf_list_wizards tool
func (s *Server) handleListWizards(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.wizardLoader == nil || !s.wizardLoader.HasWizards() {
		return mcp.NewToolResultError("Wizards not loaded. Ensure EPF wizards directory exists."), nil
	}

	// Parse filters
	phaseFilter, _ := request.RequireString("phase")
	typeFilter, _ := request.RequireString("type")

	var phasePtr *schema.Phase
	if phaseFilter != "" {
		switch strings.ToUpper(phaseFilter) {
		case "READY":
			phase := schema.PhaseREADY
			phasePtr = &phase
		case "FIRE":
			phase := schema.PhaseFIRE
			phasePtr = &phase
		case "AIM":
			phase := schema.PhaseAIM
			phasePtr = &phase
		default:
			return mcp.NewToolResultError(fmt.Sprintf("Invalid phase '%s'. Valid phases: READY, FIRE, AIM", phaseFilter)), nil
		}
	}

	var typePtr *wizard.WizardType
	if typeFilter != "" {
		wType, err := wizard.WizardTypeFromString(typeFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid wizard type '%s'. Valid types: agent_prompt, wizard, ready_sub_wizard", typeFilter)), nil
		}
		typePtr = &wType
	}

	wizards := s.wizardLoader.ListWizards(phasePtr, typePtr)

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Wizards\n\n")

	if phaseFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by phase: %s\n\n", strings.ToUpper(phaseFilter)))
	}
	if typeFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by type: %s\n\n", typeFilter))
	}

	// Group by phase
	currentPhase := ""
	for _, w := range wizards {
		phase := string(w.Phase)
		if phase == "" {
			phase = "Onboarding"
		}
		if phase != currentPhase {
			currentPhase = phase
			sb.WriteString(fmt.Sprintf("## %s\n\n", phase))
		}

		typeIcon := "🤖"
		if w.Type == wizard.WizardTypeWizard {
			typeIcon = "📋"
		} else if w.Type == wizard.WizardTypeReadySubWizard {
			typeIcon = "🔍"
		}

		sb.WriteString(fmt.Sprintf("- %s **%s** (%s)\n", typeIcon, w.Name, w.Type))
		if w.Purpose != "" {
			sb.WriteString(fmt.Sprintf("  %s\n", w.Purpose))
		}
		if w.Duration != "" {
			sb.WriteString(fmt.Sprintf("  Duration: %s\n", w.Duration))
		}
	}

	sb.WriteString(fmt.Sprintf("\n---\n🤖 = agent_prompt, 📋 = wizard, 🔍 = ready_sub_wizard\nTotal: %d wizards\n", len(wizards)))

	return mcp.NewToolResultText(sb.String()), nil
}

// WizardResponse represents the response for epf_get_wizard
type WizardResponse struct {
	Name             string   `json:"name"`
	Type             string   `json:"type"`
	Phase            string   `json:"phase,omitempty"`
	Purpose          string   `json:"purpose"`
	Content          string   `json:"content"`
	Triggers         []string `json:"triggers,omitempty"`
	Duration         string   `json:"duration,omitempty"`
	Outputs          []string `json:"outputs,omitempty"`
	RelatedWizards   []string `json:"related_wizards,omitempty"`
	RelatedTemplates []string `json:"related_templates,omitempty"`
	RelatedSchemas   []string `json:"related_schemas,omitempty"`
}

// handleGetWizard handles the epf_get_wizard tool
func (s *Server) handleGetWizard(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.wizardLoader == nil || !s.wizardLoader.HasWizards() {
		return mcp.NewToolResultError("Wizards not loaded. Ensure EPF wizards directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	w, err := s.wizardLoader.GetWizard(name)
	if err != nil {
		// Provide helpful error with available wizards
		names := s.wizardLoader.GetWizardNames()
		return mcp.NewToolResultError(fmt.Sprintf("Wizard not found: %s. Available wizards: %s", name, strings.Join(names, ", "))), nil
	}

	response := WizardResponse{
		Name:             w.Name,
		Type:             string(w.Type),
		Phase:            string(w.Phase),
		Purpose:          w.Purpose,
		Content:          w.Content,
		Triggers:         w.TriggerPhrases,
		Duration:         w.Duration,
		Outputs:          w.Outputs,
		RelatedWizards:   w.RelatedWizards,
		RelatedTemplates: w.RelatedTemplates,
		RelatedSchemas:   w.RelatedSchemas,
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// WizardRecommendationResponse represents the response for epf_get_wizard_for_task
type WizardRecommendationResponse struct {
	Task              string                  `json:"task"`
	RecommendedWizard string                  `json:"recommended_wizard"`
	Confidence        string                  `json:"confidence"`
	Reason            string                  `json:"reason"`
	WizardPurpose     string                  `json:"wizard_purpose,omitempty"`
	WizardPhase       string                  `json:"wizard_phase,omitempty"`
	Alternatives      []WizardAlternativeItem `json:"alternatives,omitempty"`
	Guidance          Guidance                `json:"guidance"`
}

// WizardAlternativeItem represents an alternative wizard in recommendations
type WizardAlternativeItem struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// handleGetWizardForTask handles the epf_get_wizard_for_task tool
func (s *Server) handleGetWizardForTask(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.wizardLoader == nil || !s.wizardLoader.HasWizards() {
		return mcp.NewToolResultError("Wizards not loaded. Ensure EPF wizards directory exists."), nil
	}

	task, err := request.RequireString("task")
	if err != nil {
		return mcp.NewToolResultError("task parameter is required"), nil
	}

	recommender := wizard.NewRecommender(s.wizardLoader)
	recommendation, err := recommender.RecommendForTask(task)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get recommendation: %s", err.Error())), nil
	}

	if recommendation == nil || recommendation.Wizard == nil {
		return mcp.NewToolResultText(`{
  "task": "` + task + `",
  "recommended_wizard": null,
  "message": "No matching wizard found. Try being more specific or use epf_list_wizards to see available options."
}`), nil
	}

	response := WizardRecommendationResponse{
		Task:              task,
		RecommendedWizard: recommendation.Wizard.Name,
		Confidence:        recommendation.Confidence,
		Reason:            recommendation.Reason,
		WizardPurpose:     recommendation.Wizard.Purpose,
		WizardPhase:       string(recommendation.Wizard.Phase),
		Guidance:          Guidance{},
	}

	// Map alternatives
	for _, alt := range recommendation.Alternatives {
		response.Alternatives = append(response.Alternatives, WizardAlternativeItem{
			Name:   alt.WizardName,
			Reason: alt.Reason,
		})
	}

	// Build guidance
	if recommendation.Confidence == "high" {
		response.Guidance.Tips = append(response.Guidance.Tips, "High confidence match - this wizard directly addresses your task")
	} else if recommendation.Confidence == "medium" {
		response.Guidance.Tips = append(response.Guidance.Tips, "Medium confidence match - consider checking alternatives")
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings, "Low confidence match - this is a best-guess recommendation")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Use epf_list_wizards to see all available wizards")
	}

	response.Guidance.NextSteps = append(response.Guidance.NextSteps,
		fmt.Sprintf("Use epf_get_wizard('%s') to get the full wizard content", recommendation.Wizard.Name))

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Agent Instructions Tools
// =============================================================================

// AgentInstructionsListItem represents an instruction file in the list response
type AgentInstructionsListItem struct {
	Name    string `json:"name"`
	Purpose string `json:"purpose"`
	Scope   string `json:"scope"`
}

// handleListAgentInstructions handles the epf_list_agent_instructions tool
func (s *Server) handleListAgentInstructions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.wizardLoader == nil {
		return mcp.NewToolResultError("Wizard loader not initialized."), nil
	}

	instructions := s.wizardLoader.ListAgentInstructions()

	if len(instructions) == 0 {
		return mcp.NewToolResultText("No agent instruction files found."), nil
	}

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Agent Instructions\n\n")
	sb.WriteString("These files provide AI agent guidance for working with EPF.\n\n")

	for _, inst := range instructions {
		scopeIcon := "📚"
		switch inst.Scope {
		case "comprehensive":
			scopeIcon = "📖"
		case "quick-reference":
			scopeIcon = "⚡"
		case "maintenance":
			scopeIcon = "🔧"
		}

		sb.WriteString(fmt.Sprintf("- %s **%s** (%s)\n", scopeIcon, inst.Name, inst.Scope))
		sb.WriteString(fmt.Sprintf("  %s\n", inst.Purpose))
	}

	sb.WriteString(fmt.Sprintf("\n---\n📖 = comprehensive, ⚡ = quick-reference, 🔧 = maintenance\nTotal: %d instruction files\n", len(instructions)))

	return mcp.NewToolResultText(sb.String()), nil
}

// AgentInstructionsResponse represents the response for epf_get_agent_instructions
type AgentInstructionsResponse struct {
	Name    string `json:"name"`
	Purpose string `json:"purpose"`
	Scope   string `json:"scope"`
	Content string `json:"content"`
}

// handleGetAgentInstructions handles the epf_get_agent_instructions tool
func (s *Server) handleGetAgentInstructions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.wizardLoader == nil {
		return mcp.NewToolResultError("Wizard loader not initialized."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	inst, err := s.wizardLoader.GetAgentInstructions(name)
	if err != nil {
		// Provide helpful error
		instructions := s.wizardLoader.ListAgentInstructions()
		var names []string
		for _, i := range instructions {
			names = append(names, i.Name)
		}
		sort.Strings(names)
		return mcp.NewToolResultError(fmt.Sprintf("Agent instructions not found: %s. Available: %s", name, strings.Join(names, ", "))), nil
	}

	response := AgentInstructionsResponse{
		Name:    inst.Name,
		Purpose: inst.Purpose,
		Scope:   inst.Scope,
		Content: inst.Content,
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}
