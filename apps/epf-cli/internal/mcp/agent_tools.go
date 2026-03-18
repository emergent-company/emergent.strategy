package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// Agent Tools
// =============================================================================

// AgentListItem represents an agent in the epf_list_agents response.
// NOTE: This struct is defined for JSON serialization consistency but the
// handleListAgents handler currently returns markdown text for human readability.
// Detail handlers (handleGetAgent, handleGetAgentForTask) return JSON.
// This is intentional: list tools are optimized for LLM consumption as text,
// while detail tools return structured JSON for programmatic use.
type AgentListItem struct {
	Name           string                `json:"name"`
	Type           string                `json:"type"`
	Phase          string                `json:"phase,omitempty"`
	DisplayName    string                `json:"display_name"`
	Description    string                `json:"description,omitempty"`
	Source         string                `json:"source"`
	Capability     *agent.CapabilitySpec `json:"capability,omitempty"`
	RequiredSkills int                   `json:"required_skills"`
	OptionalSkills int                   `json:"optional_skills"`
	LegacyFormat   bool                  `json:"legacy_format,omitempty"`
}

// handleListAgents handles the epf_list_agents tool.
func (s *Server) handleListAgents(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return mcp.NewToolResultError("Agents not loaded. Ensure EPF agents/wizards directory exists."), nil
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
		case "ONBOARDING", "":
			// No phase filter for onboarding (empty phase)
		default:
			return mcp.NewToolResultError(fmt.Sprintf("Invalid phase '%s'. Valid phases: READY, FIRE, AIM, Onboarding", phaseFilter)), nil
		}
	}

	var typePtr *agent.AgentType
	if typeFilter != "" {
		aType, err := agent.AgentTypeFromString(typeFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid agent type '%s'. Valid types: guide, strategist, specialist, architect, reviewer", typeFilter)), nil
		}
		typePtr = &aType
	}

	agents := s.agentLoader.ListAgents(phasePtr, typePtr)

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Agents\n\n")

	if phaseFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by phase: %s\n\n", strings.ToUpper(phaseFilter)))
	}
	if typeFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by type: %s\n\n", typeFilter))
	}

	// Group by phase
	currentPhase := ""
	for _, a := range agents {
		phase := string(a.Phase)
		if phase == "" {
			phase = "Onboarding"
		}
		if phase != currentPhase {
			currentPhase = phase
			sb.WriteString(fmt.Sprintf("## %s\n\n", phase))
		}

		typeIcon := agentTypeIcon(a.Type)
		skillCount := len(a.RequiredSkills) + len(a.OptionalSkills)

		sb.WriteString(fmt.Sprintf("- %s **%s** (%s)\n", typeIcon, a.Name, a.Type))
		if a.DisplayName != "" && a.DisplayName != a.Name {
			sb.WriteString(fmt.Sprintf("  Display: %s\n", a.DisplayName))
		}
		if a.Description != "" {
			desc := a.Description
			if len(desc) > 80 {
				desc = desc[:77] + "..."
			}
			sb.WriteString(fmt.Sprintf("  %s\n", desc))
		}
		if skillCount > 0 {
			sb.WriteString(fmt.Sprintf("  Skills: %d required, %d optional\n", len(a.RequiredSkills), len(a.OptionalSkills)))
		}
		if a.Capability != nil && a.Capability.Class != "" {
			sb.WriteString(fmt.Sprintf("  Capability: %s\n", a.Capability.Class))
		}
		if a.Source != "" {
			sb.WriteString(fmt.Sprintf("  Source: %s\n", a.Source))
		}
	}

	sb.WriteString(fmt.Sprintf("\n---\n🧭 = guide, 🎯 = strategist, 🔬 = specialist, 🏗️ = architect, 🔍 = reviewer\nTotal: %d agents\n", len(agents)))

	return mcp.NewToolResultText(sb.String()), nil
}

// agentTypeIcon returns an emoji icon for an agent type.
func agentTypeIcon(t agent.AgentType) string {
	switch t {
	case agent.AgentTypeGuide:
		return "🧭"
	case agent.AgentTypeStrategist:
		return "🎯"
	case agent.AgentTypeSpecialist:
		return "🔬"
	case agent.AgentTypeArchitect:
		return "🏗️"
	case agent.AgentTypeReviewer:
		return "🔍"
	default:
		return "🤖"
	}
}

// AgentResponse represents the response for epf_get_agent.
type AgentResponse struct {
	Name           string                        `json:"name"`
	Type           string                        `json:"type"`
	Phase          string                        `json:"phase,omitempty"`
	Version        string                        `json:"version,omitempty"`
	DisplayName    string                        `json:"display_name"`
	Description    string                        `json:"description"`
	Source         string                        `json:"source"`
	Capability     *agent.CapabilitySpec         `json:"capability,omitempty"`
	TriggerPhrases []string                      `json:"trigger_phrases,omitempty"`
	Keywords       []string                      `json:"keywords,omitempty"`
	RequiredSkills []string                      `json:"required_skills,omitempty"`
	OptionalSkills []string                      `json:"optional_skills,omitempty"`
	RequiredTools  []string                      `json:"required_tools,omitempty"`
	RelatedAgents  []string                      `json:"related_agents,omitempty"`
	Prerequisites  *agent.AgentPrerequisitesSpec `json:"prerequisites,omitempty"`
	Personality    []string                      `json:"personality,omitempty"`
	LegacyFormat   bool                          `json:"legacy_format,omitempty"`
	Content        string                        `json:"content,omitempty"`
	Activation     *AgentActivation              `json:"activation,omitempty"`
	Guidance       Guidance                      `json:"guidance"`
}

// AgentActivation contains metadata for orchestration plugins to activate an agent.
type AgentActivation struct {
	SystemPrompt  string            `json:"system_prompt"`
	RequiredTools []string          `json:"required_tools,omitempty"`
	SkillScopes   []SkillScopeEntry `json:"skill_scopes,omitempty"`
}

// SkillScopeEntry represents scope declarations aggregated from an agent's skills.
type SkillScopeEntry struct {
	Skill          string   `json:"skill"`
	PreferredTools []string `json:"preferred_tools,omitempty"`
	AvoidTools     []string `json:"avoid_tools,omitempty"`
}

// handleGetAgent handles the epf_get_agent tool.
func (s *Server) handleGetAgent(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return mcp.NewToolResultError("Agents not loaded. Ensure EPF agents/wizards directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	a, err := s.agentLoader.GetAgentWithContent(name)
	if err != nil {
		// Provide helpful error with available agents
		names := s.agentLoader.GetAgentNames()
		return mcp.NewToolResultError(fmt.Sprintf("Agent not found: %s. Available agents: %s", name, strings.Join(names, ", "))), nil
	}

	response := AgentResponse{
		Name:           a.Name,
		Type:           string(a.Type),
		Phase:          string(a.Phase),
		Version:        a.Version,
		DisplayName:    a.DisplayName,
		Description:    a.Description,
		Source:         string(a.Source),
		Capability:     a.Capability,
		TriggerPhrases: a.TriggerPhrases,
		Keywords:       a.Keywords,
		RequiredSkills: a.RequiredSkills,
		OptionalSkills: a.OptionalSkills,
		RequiredTools:  a.RequiredTools,
		RelatedAgents:  a.RelatedAgents,
		Prerequisites:  a.Prerequisites,
		Personality:    a.Personality,
		LegacyFormat:   a.LegacyFormat,
		Content:        a.Content,
		Guidance:       Guidance{},
	}

	// Build activation metadata (consumed by orchestration plugins)
	if a.Content != "" {
		activation := &AgentActivation{
			SystemPrompt:  a.Content,
			RequiredTools: a.RequiredTools,
		}

		// Aggregate skill scopes from required and optional skills
		if s.skillLoader != nil && s.skillLoader.HasSkills() {
			for _, skillName := range a.RequiredSkills {
				sk, skErr := s.skillLoader.GetSkill(skillName)
				if skErr == nil && sk.Scope != nil {
					entry := SkillScopeEntry{
						Skill:          skillName,
						PreferredTools: sk.Scope.PreferredTools,
						AvoidTools:     sk.Scope.AvoidTools,
					}
					activation.SkillScopes = append(activation.SkillScopes, entry)
				}
			}
			for _, skillName := range a.OptionalSkills {
				sk, skErr := s.skillLoader.GetSkill(skillName)
				if skErr == nil && sk.Scope != nil {
					entry := SkillScopeEntry{
						Skill:          skillName,
						PreferredTools: sk.Scope.PreferredTools,
						AvoidTools:     sk.Scope.AvoidTools,
					}
					activation.SkillScopes = append(activation.SkillScopes, entry)
				}
			}
		}

		response.Activation = activation
	}

	// In standalone mode, append self-enforcement protocols to agent prompts.
	// Per design Decision 14: "Every agent prompt must be self-contained."
	if s.pluginInfo != nil && s.pluginInfo.StandaloneMode && a.Content != "" {
		// Collect preferred/avoid tools from agent's required and optional skills
		var preferredTools, avoidTools []string
		if s.skillLoader != nil && s.skillLoader.HasSkills() {
			for _, skillName := range a.RequiredSkills {
				sk, skErr := s.skillLoader.GetSkill(skillName)
				if skErr == nil && sk.Scope != nil {
					preferredTools = append(preferredTools, sk.Scope.PreferredTools...)
					avoidTools = append(avoidTools, sk.Scope.AvoidTools...)
				}
			}
			for _, skillName := range a.OptionalSkills {
				sk, skErr := s.skillLoader.GetSkill(skillName)
				if skErr == nil && sk.Scope != nil {
					preferredTools = append(preferredTools, sk.Scope.PreferredTools...)
					avoidTools = append(avoidTools, sk.Scope.AvoidTools...)
				}
			}
		}

		suffix := StandalonePromptSuffix(preferredTools, avoidTools)
		response.Content += suffix
		if response.Activation != nil {
			response.Activation.SystemPrompt += suffix
		}
	}

	// Build guidance
	if len(a.RequiredSkills) > 0 {
		response.Guidance.Tips = append(response.Guidance.Tips,
			fmt.Sprintf("This agent requires %d skill(s): %s", len(a.RequiredSkills), strings.Join(a.RequiredSkills, ", ")))
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Use epf_list_agent_skills('%s') to see skill details and availability", a.Name))
	}

	if a.LegacyFormat {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"This agent was loaded from legacy wizard format (.agent_prompt.md)")
	}

	if s.pluginInfo != nil && s.pluginInfo.StandaloneMode {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"Running in standalone mode — self-enforcement protocols have been appended to the agent prompt")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// AgentRecommendationResponse represents the response for epf_get_agent_for_task.
type AgentRecommendationResponse struct {
	Task             string                 `json:"task"`
	RecommendedAgent string                 `json:"recommended_agent"`
	Confidence       string                 `json:"confidence"`
	Reason           string                 `json:"reason"`
	AgentType        string                 `json:"agent_type,omitempty"`
	AgentPhase       string                 `json:"agent_phase,omitempty"`
	AgentDescription string                 `json:"agent_description,omitempty"`
	ContentPreview   string                 `json:"content_preview,omitempty"`
	Alternatives     []AgentAlternativeItem `json:"alternatives,omitempty"`
	Guidance         Guidance               `json:"guidance"`

	// DirectTool is set when the task can be handled by calling an MCP tool
	// directly without activating an agent. When set, the LLM should call
	// this tool instead of proceeding with agent activation.
	DirectTool       string            `json:"direct_tool,omitempty"`
	DirectToolParams map[string]string `json:"direct_tool_params,omitempty"`
	DirectToolReason string            `json:"direct_tool_reason,omitempty"`
}

// AgentAlternativeItem represents an alternative agent in recommendations.
type AgentAlternativeItem struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// handleGetAgentForTask handles the epf_get_agent_for_task tool.
func (s *Server) handleGetAgentForTask(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return mcp.NewToolResultError("Agents not loaded. Ensure EPF agents/wizards directory exists."), nil
	}

	task, err := request.RequireString("task")
	if err != nil {
		return mcp.NewToolResultError("task parameter is required"), nil
	}

	// Check include_content parameter (default: true)
	includeContentStr, _ := request.RequireString("include_content")
	includeContent := strings.ToLower(includeContentStr) != "false"

	// Check for direct tool matches first — many tasks don't need agent activation
	if directMatch := matchDirectTool(task); directMatch != nil {
		jsonBytes, _ := json.MarshalIndent(directMatch, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	recommender := agent.NewRecommender(s.agentLoader)
	recommendation, err := recommender.RecommendForTask(task)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get recommendation: %s", err.Error())), nil
	}

	if recommendation == nil || recommendation.Agent == nil {
		nullResponse := struct {
			Task             string  `json:"task"`
			RecommendedAgent *string `json:"recommended_agent"`
			Message          string  `json:"message"`
		}{
			Task:             task,
			RecommendedAgent: nil,
			Message:          "No matching agent found. Try being more specific or use epf_list_agents to see available options.",
		}
		jsonBytes, _ := json.MarshalIndent(nullResponse, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	response := AgentRecommendationResponse{
		Task:             task,
		RecommendedAgent: recommendation.Agent.Name,
		Confidence:       recommendation.Confidence,
		Reason:           recommendation.Reason,
		AgentType:        string(recommendation.Agent.Type),
		AgentPhase:       string(recommendation.Agent.Phase),
		AgentDescription: recommendation.Agent.Description,
		Guidance:         Guidance{},
	}

	// Map alternatives
	for _, alt := range recommendation.Alternatives {
		response.Alternatives = append(response.Alternatives, AgentAlternativeItem{
			Name:   alt.AgentName,
			Reason: alt.Reason,
		})
	}

	// When confidence is high and content is requested, include agent content inline
	if includeContent && recommendation.Confidence == "high" {
		a, agentErr := s.agentLoader.GetAgentWithContent(recommendation.Agent.Name)
		if agentErr == nil && a.Content != "" {
			response.ContentPreview = a.Content
		}
	}

	// Build guidance
	if recommendation.Confidence == "high" {
		if response.ContentPreview != "" {
			response.Guidance.Tips = append(response.Guidance.Tips,
				"High confidence match — agent content is included in content_preview. You can use it directly without calling epf_get_agent.")
		} else {
			response.Guidance.Tips = append(response.Guidance.Tips, "High confidence match — this agent directly addresses your task")
		}
	} else if recommendation.Confidence == "medium" {
		response.Guidance.Tips = append(response.Guidance.Tips, "Medium confidence match — consider checking alternatives")
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings, "Low confidence match — this is a best-guess recommendation")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Use epf_list_agents to see all available agents")
	}

	if response.ContentPreview == "" {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Use epf_get_agent('%s') to get the full agent content", recommendation.Agent.Name))
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Direct Tool Routing
// =============================================================================

// directToolRoute maps task patterns to direct tool recommendations.
type directToolRoute struct {
	patterns []string          // lowercase substrings to match
	tool     string            // MCP tool name
	params   map[string]string // suggested parameters
	reason   string            // why this tool, not an agent
}

// directToolRoutes defines task→tool mappings for common operations
// that don't need agent activation.
var directToolRoutes = []directToolRoute{
	{
		patterns: []string{"validate", "check yaml", "check file", "verify file"},
		tool:     "epf_validate_file",
		params:   map[string]string{"ai_friendly": "true"},
		reason:   "Validation is a direct tool call — no agent activation needed.",
	},
	{
		patterns: []string{"health", "health check", "check instance", "diagnose", "what's wrong"},
		tool:     "epf_health_check",
		reason:   "Health checks are a direct tool call. Follow required_next_tool_calls in the response.",
	},
	{
		patterns: []string{"find instance", "locate instance", "where is epf", "find epf"},
		tool:     "epf_locate_instance",
		reason:   "Instance discovery is a direct tool call.",
	},
	{
		patterns: []string{"search strategy", "find in strategy", "search for"},
		tool:     "epf_search_strategy",
		reason:   "Strategy search is a direct tool call.",
	},
	{
		patterns: []string{"what is the vision", "product vision", "north star", "mission"},
		tool:     "epf_get_product_vision",
		reason:   "Vision/mission queries are direct tool calls.",
	},
	{
		patterns: []string{"who are the personas", "target users", "who is it for", "list personas"},
		tool:     "epf_get_personas",
		reason:   "Persona queries are direct tool calls.",
	},
	{
		patterns: []string{"competitive", "competitors", "positioning", "market position"},
		tool:     "epf_get_competitive_position",
		reason:   "Competitive analysis is a direct tool call.",
	},
	{
		patterns: []string{"roadmap", "okr", "key results", "objectives"},
		tool:     "epf_get_roadmap_summary",
		reason:   "Roadmap queries are direct tool calls.",
	},
	{
		patterns: []string{"list features", "show features", "what features", "feature list"},
		tool:     "epf_list_features",
		reason:   "Feature listing is a direct tool call.",
	},
	{
		patterns: []string{"impact analysis", "what would happen", "cascade", "propagation"},
		tool:     "epf_semantic_impact",
		reason:   "Impact analysis is a direct tool call. Requires Memory API configuration.",
	},
	{
		patterns: []string{"contradiction", "inconsistenc", "conflict"},
		tool:     "epf_contradictions",
		reason:   "Contradiction detection is a direct tool call. Requires Memory API configuration.",
	},
	{
		patterns: []string{"fix file", "auto-fix", "fix whitespace", "fix formatting"},
		tool:     "epf_fix_file",
		reason:   "File fixing is a direct tool call.",
	},
	{
		patterns: []string{"value model path", "explain path", "what does this path mean"},
		tool:     "epf_explain_value_path",
		reason:   "Value path explanation is a direct tool call.",
	},
	{
		patterns: []string{"coverage", "gap analysis", "blind spots", "uncovered"},
		tool:     "epf_analyze_coverage",
		reason:   "Coverage analysis is a direct tool call.",
	},
}

// matchDirectTool checks if a task can be handled by a direct tool call
// without agent activation. Returns nil if no direct match found.
func matchDirectTool(task string) *AgentRecommendationResponse {
	taskLower := strings.ToLower(task)

	for _, route := range directToolRoutes {
		for _, pattern := range route.patterns {
			if strings.Contains(taskLower, pattern) {
				return &AgentRecommendationResponse{
					Task:             task,
					DirectTool:       route.tool,
					DirectToolParams: route.params,
					DirectToolReason: route.reason,
					Confidence:       "high",
					Reason:           route.reason,
					Guidance: Guidance{
						Tips: []string{
							fmt.Sprintf("Call %s directly — no agent activation needed.", route.tool),
						},
					},
				}
			}
		}
	}

	return nil
}

// =============================================================================
// Agent Scaffolding
// =============================================================================

// ScaffoldAgentResponse represents the response for epf_scaffold_agent.
type ScaffoldAgentResponse struct {
	Name         string   `json:"name"`
	Path         string   `json:"path"`
	FilesCreated []string `json:"files_created"`
	AgentType    string   `json:"type"`
	Guidance     Guidance `json:"guidance"`
}

// handleScaffoldAgent handles the epf_scaffold_agent tool.
func (s *Server) handleScaffoldAgent(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	typeStr, _ := request.RequireString("type")
	displayName, _ := request.RequireString("display_name")
	description, _ := request.RequireString("description")

	// Parse agent type (default: specialist)
	agentType := agent.AgentTypeSpecialist
	if typeStr != "" {
		aType, err := agent.AgentTypeFromString(typeStr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid agent type '%s'. Valid types: guide, strategist, specialist, architect, reviewer", typeStr)), nil
		}
		agentType = aType
	}

	// Determine output directory
	agentDir := filepath.Join(instancePath, agent.InstanceDirName, name)

	// Protect canonical EPF from accidental writes
	if isCanonicalEPFPath(agentDir) {
		return mcp.NewToolResultError("Cannot scaffold agent in canonical EPF repository.\n\nThe target path appears to be inside the canonical EPF framework.\nUse instance_path pointing to a product repository instead."), nil
	}

	// Create the agent directory
	if err := os.MkdirAll(agentDir, 0755); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create agent directory: %s", err.Error())), nil
	}

	// Default display name
	if displayName == "" {
		displayName = toTitleCase(name)
	}
	if description == "" {
		description = fmt.Sprintf("A %s agent for working with EPF", agentType)
	}

	// Generate agent.yaml
	manifest := generateAgentManifest(name, agentType, displayName, description)
	manifestPath := filepath.Join(agentDir, agent.ManifestFile)
	if err := os.WriteFile(manifestPath, []byte(manifest), 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write agent.yaml: %s", err.Error())), nil
	}

	// Generate prompt.md
	prompt := generateAgentPrompt(name, agentType, displayName, description)
	promptPath := filepath.Join(agentDir, agent.PromptFile)
	if err := os.WriteFile(promptPath, []byte(prompt), 0644); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write prompt.md: %s", err.Error())), nil
	}

	filesCreated := []string{agent.ManifestFile, agent.PromptFile}

	response := ScaffoldAgentResponse{
		Name:         name,
		Path:         agentDir,
		FilesCreated: filesCreated,
		AgentType:    string(agentType),
		Guidance: Guidance{
			NextSteps: []string{
				fmt.Sprintf("Edit %s/prompt.md with your agent's system prompt", agentDir),
				fmt.Sprintf("Update %s/agent.yaml with skills and routing", agentDir),
				fmt.Sprintf("Test with: epf_get_agent('%s')", name),
			},
			Tips: []string{
				"Add trigger_phrases to agent.yaml for task matching",
				"List required skills to declare agent capabilities",
			},
		},
	}

	// Invalidate caches after scaffolding
	s.invalidateInstanceCaches(instancePath)

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// generateAgentManifest creates an agent.yaml manifest.
func generateAgentManifest(name string, agentType agent.AgentType, displayName, description string) string {
	var sb strings.Builder
	sb.WriteString("# Agent Manifest\n")
	sb.WriteString(fmt.Sprintf("name: %s\n", name))
	sb.WriteString("version: \"1.0.0\"\n")
	sb.WriteString(fmt.Sprintf("type: %s\n", agentType))
	sb.WriteString("\n")
	sb.WriteString("identity:\n")
	sb.WriteString(fmt.Sprintf("  display_name: \"%s\"\n", displayName))
	sb.WriteString(fmt.Sprintf("  description: \"%s\"\n", description))
	sb.WriteString("  personality:\n")
	sb.WriteString("    - collaborative\n")
	sb.WriteString("    - thorough\n")
	sb.WriteString("\n")
	sb.WriteString("capability:\n")
	sb.WriteString("  class: balanced\n")
	sb.WriteString("  context_budget: medium\n")
	sb.WriteString("\n")
	sb.WriteString("routing:\n")
	sb.WriteString("  trigger_phrases:\n")
	sb.WriteString(fmt.Sprintf("    - \"I need help with %s\"\n", name))
	sb.WriteString("  keywords:\n")
	sb.WriteString(fmt.Sprintf("    - %s\n", name))
	sb.WriteString("\n")
	sb.WriteString("skills:\n")
	sb.WriteString("  required: []\n")
	sb.WriteString("  optional: []\n")
	sb.WriteString("\n")
	sb.WriteString("tools:\n")
	sb.WriteString("  required: []\n")
	return sb.String()
}

// generateAgentPrompt creates a prompt.md for a new agent.
func generateAgentPrompt(name string, agentType agent.AgentType, displayName, description string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", displayName))
	sb.WriteString(fmt.Sprintf("You are **%s**, %s.\n\n", displayName, description))
	sb.WriteString("## Purpose\n\n")
	sb.WriteString(fmt.Sprintf("[Describe what %s helps users accomplish]\n\n", displayName))
	sb.WriteString("## Personality\n\n")
	sb.WriteString("- Collaborative and helpful\n")
	sb.WriteString("- Thorough in analysis\n\n")
	sb.WriteString("## Workflow\n\n")
	sb.WriteString("1. Understand the user's goal\n")
	sb.WriteString("2. Gather necessary context\n")
	sb.WriteString("3. Guide the user through the process\n")
	sb.WriteString("4. Validate the output\n")
	return sb.String()
}

// toTitleCase converts a kebab-case or snake_case name to Title Case.
func toTitleCase(name string) string {
	// Replace hyphens and underscores with spaces
	name = strings.ReplaceAll(name, "-", " ")
	name = strings.ReplaceAll(name, "_", " ")
	// Title case each word
	words := strings.Fields(name)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// =============================================================================
// Agent-Skill Relationship Query
// =============================================================================

// AgentSkillEntry represents a skill in the epf_list_agent_skills response.
type AgentSkillEntry struct {
	Name         string `json:"name"`
	Relationship string `json:"relationship"` // "required" or "optional"
	Available    bool   `json:"available"`    // Whether the skill exists
	Type         string `json:"type,omitempty"`
	Description  string `json:"description,omitempty"`
	Source       string `json:"source,omitempty"`
}

// AgentSkillsResponse represents the response for epf_list_agent_skills.
type AgentSkillsResponse struct {
	AgentName string            `json:"agent_name"`
	Skills    []AgentSkillEntry `json:"skills"`
	Guidance  Guidance          `json:"guidance"`
}

// handleListAgentSkills handles the epf_list_agent_skills tool.
func (s *Server) handleListAgentSkills(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return mcp.NewToolResultError("Agents not loaded. Ensure EPF agents/wizards directory exists."), nil
	}

	agentName, err := request.RequireString("agent")
	if err != nil {
		return mcp.NewToolResultError("agent parameter is required"), nil
	}

	a, err := s.agentLoader.GetAgent(agentName)
	if err != nil {
		names := s.agentLoader.GetAgentNames()
		return mcp.NewToolResultError(fmt.Sprintf("Agent not found: %s. Available agents: %s", agentName, strings.Join(names, ", "))), nil
	}

	var skills []AgentSkillEntry

	// Process required skills
	for _, skillName := range a.RequiredSkills {
		entry := AgentSkillEntry{
			Name:         skillName,
			Relationship: "required",
			Available:    false,
		}

		// Check if skill is available
		if s.skillLoader != nil && s.skillLoader.HasSkills() {
			if sk, skErr := s.skillLoader.GetSkill(skillName); skErr == nil {
				entry.Available = true
				entry.Type = string(sk.Type)
				entry.Description = sk.Description
				entry.Source = string(sk.Source)
			}
		}

		skills = append(skills, entry)
	}

	// Process optional skills
	for _, skillName := range a.OptionalSkills {
		entry := AgentSkillEntry{
			Name:         skillName,
			Relationship: "optional",
			Available:    false,
		}

		if s.skillLoader != nil && s.skillLoader.HasSkills() {
			if sk, skErr := s.skillLoader.GetSkill(skillName); skErr == nil {
				entry.Available = true
				entry.Type = string(sk.Type)
				entry.Description = sk.Description
				entry.Source = string(sk.Source)
			}
		}

		skills = append(skills, entry)
	}

	// Sort: required first, then by name
	sort.Slice(skills, func(i, j int) bool {
		if skills[i].Relationship != skills[j].Relationship {
			return skills[i].Relationship == "required"
		}
		return skills[i].Name < skills[j].Name
	})

	response := AgentSkillsResponse{
		AgentName: agentName,
		Skills:    skills,
		Guidance:  Guidance{},
	}

	// Count unavailable
	unavailable := 0
	for _, sk := range skills {
		if !sk.Available {
			unavailable++
		}
	}

	if unavailable > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			fmt.Sprintf("%d skill(s) are not available in the current environment", unavailable))
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Use epf_list_skills to see all available skills")
	}

	if len(skills) == 0 {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"This agent has no declared skills. It operates as a general-purpose persona.")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Agent Import Tool
// =============================================================================

// handleImportAgent handles the epf_import_agent tool.
func (s *Server) handleImportAgent(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	source, err := request.RequireString("source")
	if err != nil {
		return mcp.NewToolResultError("Missing required parameter 'source'"), nil
	}

	instancePath := s.resolveInstancePath(request)

	formatStr, _ := request.RequireString("format")
	forceStr, _ := request.RequireString("force")
	force := forceStr == "true"

	format, err := agent.ImportFormatFromString(formatStr)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Resolve source path
	if !filepath.IsAbs(source) {
		source = filepath.Join(instancePath, source)
	}

	result, err := agent.ImportAgent(source, instancePath, format, force)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Import failed: %s", err.Error())), nil
	}

	// Build response
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Successfully imported agent '%s' from %s format.\n\n", result.AgentName, result.Format))
	sb.WriteString("**Files created:**\n")
	sb.WriteString(fmt.Sprintf("- Manifest: `%s`\n", result.ManifestPath))
	sb.WriteString(fmt.Sprintf("- Prompt: `%s`\n", result.PromptPath))

	if len(result.TodoFields) > 0 {
		sb.WriteString("\n**Fields to review (marked with TODO):**\n")
		for _, field := range result.TodoFields {
			sb.WriteString(fmt.Sprintf("- %s\n", field))
		}
	}

	sb.WriteString("\n**Next steps:**\n")
	sb.WriteString(fmt.Sprintf("1. Review the generated manifest: `%s`\n", result.ManifestPath))
	sb.WriteString(fmt.Sprintf("2. Verify with: `epf_get_agent { \"name\": \"%s\" }`\n", result.AgentName))

	jsonBytes, _ := json.MarshalIndent(result, "", "  ")
	sb.WriteString(fmt.Sprintf("\n```json\n%s\n```\n", string(jsonBytes)))

	return mcp.NewToolResultText(sb.String()), nil
}
