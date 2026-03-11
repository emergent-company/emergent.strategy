package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
	"github.com/spf13/cobra"
)

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "List, show, and recommend EPF agents",
	Long: `Manage EPF agents (AI personas that orchestrate workflows).

Agents are AI personas that guide users through EPF tasks. They replace
the older "wizards" concept — the 'wizards' command is an alias for 'agents'.

Agent types:
  - guide: Onboarding and getting-started
  - strategist: Strategy and market analysis
  - specialist: Domain-specific expertise
  - architect: System and product architecture
  - reviewer: Quality review and assessment

Examples:
  epf-cli agents list                        # List all agents
  epf-cli agents list --phase READY          # List READY phase agents
  epf-cli agents list --type strategist      # List strategist agents
  epf-cli agents show pathfinder             # Show the pathfinder agent
  epf-cli agents recommend "create feature"  # Get agent recommendation
  epf-cli agents scaffold my-agent           # Create a new agent`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listAgentsCmd.Run(cmd, args)
	},
}

// createAgentLoader builds an agent loader with appropriate fallback.
func createAgentLoader() (*agent.Loader, error) {
	epfRoot, err := GetEPFRoot()
	if err != nil {
		if embedded.HasEmbeddedArtifacts() {
			loader := agent.NewEmbeddedLoader()
			if err := loader.Load(); err != nil {
				return nil, fmt.Errorf("loading embedded agents: %w", err)
			}
			return loader, nil
		}
		return nil, err
	}

	loader := agent.NewLoader(epfRoot)
	if err := loader.Load(); err != nil {
		return nil, fmt.Errorf("loading agents: %w", err)
	}
	return loader, nil
}

var listAgentsCmd = &cobra.Command{
	Use:   "list",
	Short: "List available agents",
	Long: `List all available EPF agents.

Agents are organized by phase (READY, FIRE, AIM) and type
(guide, strategist, specialist, architect, reviewer).`,
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createAgentLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if !loader.HasAgents() {
			fmt.Println("No agents found.")
			return
		}

		// Parse filters
		phaseFilter, _ := cmd.Flags().GetString("phase")
		typeFilter, _ := cmd.Flags().GetString("type")
		jsonOutput, _ := cmd.Flags().GetBool("json")

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
				// No phase filter for onboarding
			default:
				fmt.Fprintf(os.Stderr, "Invalid phase '%s'. Valid phases: READY, FIRE, AIM, Onboarding\n", phaseFilter)
				os.Exit(1)
			}
		}

		var typePtr *agent.AgentType
		if typeFilter != "" {
			aType, err := agent.AgentTypeFromString(typeFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid agent type '%s'. Valid types: guide, strategist, specialist, architect, reviewer\n", typeFilter)
				os.Exit(1)
			}
			typePtr = &aType
		}

		agents := loader.ListAgents(phasePtr, typePtr)

		if jsonOutput {
			printAgentsJSON(agents)
			return
		}

		fmt.Printf("EPF Agents (loaded from %s)\n\n", loader.Source())

		if phaseFilter != "" {
			fmt.Printf("Filtered by phase: %s\n", strings.ToUpper(phaseFilter))
		}
		if typeFilter != "" {
			fmt.Printf("Filtered by type: %s\n", typeFilter)
		}
		if phaseFilter != "" || typeFilter != "" {
			fmt.Println()
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
				fmt.Printf("## %s\n\n", phase)
			}

			typeIcon := getAgentTypeIcon(a.Type)

			fmt.Printf("  %s %-25s %s\n", typeIcon, a.Name, a.Type)
			if a.Description != "" {
				desc := a.Description
				if len(desc) > 70 {
					desc = desc[:67] + "..."
				}
				fmt.Printf("     %s\n", desc)
			}
			if a.DisplayName != "" && a.DisplayName != a.Name {
				fmt.Printf("     Display: %s\n", a.DisplayName)
			}
			fmt.Println()
		}

		fmt.Println("---")
		fmt.Println("Guide, Strategist, Specialist, Architect, Reviewer")
		fmt.Printf("Total: %d agents\n", len(agents))
	},
}

func getAgentTypeIcon(t agent.AgentType) string {
	switch t {
	case agent.AgentTypeGuide:
		return "🧭"
	case agent.AgentTypeStrategist:
		return "🎯"
	case agent.AgentTypeSpecialist:
		return "🔧"
	case agent.AgentTypeArchitect:
		return "🏗️"
	case agent.AgentTypeReviewer:
		return "🔍"
	default:
		return "🤖"
	}
}

func printAgentsJSON(agents []*agent.AgentInfo) {
	type agentItem struct {
		Name           string                `json:"name"`
		Type           string                `json:"type"`
		Phase          string                `json:"phase,omitempty"`
		DisplayName    string                `json:"display_name,omitempty"`
		Description    string                `json:"description,omitempty"`
		Source         string                `json:"source"`
		Capability     *agent.CapabilitySpec `json:"capability,omitempty"`
		RequiredSkills int                   `json:"required_skills"`
		OptionalSkills int                   `json:"optional_skills"`
	}

	items := make([]agentItem, 0, len(agents))
	for _, a := range agents {
		items = append(items, agentItem{
			Name:           a.Name,
			Type:           string(a.Type),
			Phase:          string(a.Phase),
			DisplayName:    a.DisplayName,
			Description:    a.Description,
			Source:         string(a.Source),
			Capability:     a.Capability,
			RequiredSkills: len(a.RequiredSkills),
			OptionalSkills: len(a.OptionalSkills),
		})
	}

	jsonBytes, _ := json.MarshalIndent(items, "", "  ")
	fmt.Println(string(jsonBytes))
}

var showAgentCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Show a specific agent",
	Long: `Display the full content and metadata of an agent.

This shows the agent's system prompt and configuration that AI agents use
to guide users through EPF workflows.

Examples:
  epf-cli agents show start_epf
  epf-cli agents show pathfinder
  epf-cli agents show pathfinder --content-only`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createAgentLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		a, err := loader.GetAgentWithContent(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintln(os.Stderr, "\nAvailable agents:")
			for _, name := range loader.GetAgentNames() {
				fmt.Fprintf(os.Stderr, "  %s\n", name)
			}
			os.Exit(1)
		}

		contentOnly, _ := cmd.Flags().GetBool("content-only")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		if jsonOutput {
			// Load skills for activation metadata
			skillLoader, _ := createSkillLoader()
			printAgentJSON(a, skillLoader)
			return
		}

		if contentOnly {
			fmt.Print(a.Content)
			return
		}

		// Print metadata header
		fmt.Printf("# Agent: %s\n", a.Name)
		fmt.Printf("# Type: %s\n", a.Type)
		if a.DisplayName != "" {
			fmt.Printf("# Display Name: %s\n", a.DisplayName)
		}
		if a.Phase != "" {
			fmt.Printf("# Phase: %s\n", a.Phase)
		}
		if a.Description != "" {
			fmt.Printf("# Description: %s\n", a.Description)
		}
		if a.Source != "" {
			fmt.Printf("# Source: %s\n", a.Source)
		}
		if len(a.TriggerPhrases) > 0 {
			fmt.Printf("# Triggers: %s\n", strings.Join(a.TriggerPhrases, ", "))
		}
		if a.Path != "" {
			fmt.Printf("# Path: %s\n", a.Path)
		}
		fmt.Println("#")
		fmt.Println("# --- Agent Prompt ---")
		fmt.Println()
		fmt.Print(a.Content)
	},
}

// agentActivation matches the MCP AgentActivation struct for CLI JSON output.
type agentActivation struct {
	SystemPrompt  string            `json:"system_prompt"`
	RequiredTools []string          `json:"required_tools,omitempty"`
	SkillScopes   []skillScopeEntry `json:"skill_scopes,omitempty"`
}

// skillScopeEntry matches the MCP SkillScopeEntry struct.
type skillScopeEntry struct {
	Skill          string   `json:"skill"`
	PreferredTools []string `json:"preferred_tools,omitempty"`
	AvoidTools     []string `json:"avoid_tools,omitempty"`
}

func printAgentJSON(a *agent.AgentInfo, skillLoader *skill.Loader) {
	response := struct {
		Name           string                `json:"name"`
		Type           string                `json:"type"`
		Phase          string                `json:"phase,omitempty"`
		DisplayName    string                `json:"display_name,omitempty"`
		Description    string                `json:"description,omitempty"`
		Source         string                `json:"source"`
		Capability     *agent.CapabilitySpec `json:"capability,omitempty"`
		Triggers       []string              `json:"triggers,omitempty"`
		RequiredSkills []string              `json:"required_skills,omitempty"`
		OptionalSkills []string              `json:"optional_skills,omitempty"`
		LegacyFormat   bool                  `json:"legacy_format,omitempty"`
		Content        string                `json:"content"`
		Activation     *agentActivation      `json:"activation,omitempty"`
	}{
		Name:           a.Name,
		Type:           string(a.Type),
		Phase:          string(a.Phase),
		DisplayName:    a.DisplayName,
		Description:    a.Description,
		Source:         string(a.Source),
		Capability:     a.Capability,
		Triggers:       a.TriggerPhrases,
		RequiredSkills: a.RequiredSkills,
		OptionalSkills: a.OptionalSkills,
		LegacyFormat:   a.LegacyFormat,
		Content:        a.Content,
	}

	// Build activation metadata (mirrors MCP handleGetAgent logic)
	if a.Content != "" {
		activation := &agentActivation{
			SystemPrompt:  a.Content,
			RequiredTools: a.RequiredTools,
		}

		// Aggregate skill scopes from required skills
		if skillLoader != nil && skillLoader.HasSkills() {
			for _, skillName := range a.RequiredSkills {
				sk, skErr := skillLoader.GetSkill(skillName)
				if skErr == nil && sk.Scope != nil {
					entry := skillScopeEntry{
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

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var recommendAgentCmd = &cobra.Command{
	Use:   "recommend <task>",
	Short: "Recommend an agent for a task",
	Long: `Get an agent recommendation based on your task description.

The recommender analyzes your task and suggests the most appropriate
agent, along with alternatives and confidence level.

Examples:
  epf-cli agents recommend "create a feature definition"
  epf-cli agents recommend "analyze market trends"
  epf-cli agents recommend "help me get started with epf"
  epf-cli agents recommend "assess our last cycle"`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createAgentLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if !loader.HasAgents() {
			fmt.Println("No agents found to recommend from.")
			return
		}

		task := args[0]
		recommender := agent.NewRecommender(loader)
		recommendation, err := recommender.RecommendForTask(task)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		jsonOutput, _ := cmd.Flags().GetBool("json")

		if recommendation == nil || recommendation.Agent == nil {
			if jsonOutput {
				fmt.Println(`{"task": "` + task + `", "recommended_agent": null, "message": "No matching agent found"}`)
			} else {
				fmt.Println("No matching agent found for your task.")
				fmt.Println("\nTry:")
				fmt.Println("  - Being more specific about what you want to do")
				fmt.Println("  - Using 'epf-cli agents list' to see available agents")
			}
			return
		}

		if jsonOutput {
			printAgentRecommendationJSON(task, recommendation)
			return
		}

		// Print human-readable recommendation
		fmt.Printf("Task: %s\n\n", task)

		confidenceIcon := "🟢"
		if recommendation.Confidence == "medium" {
			confidenceIcon = "🟡"
		} else if recommendation.Confidence == "low" {
			confidenceIcon = "🔴"
		}

		fmt.Printf("%s Recommended: %s\n", confidenceIcon, recommendation.Agent.Name)
		fmt.Printf("   Confidence: %s\n", recommendation.Confidence)
		fmt.Printf("   Reason: %s\n", recommendation.Reason)

		if recommendation.Agent.Description != "" {
			fmt.Printf("   Description: %s\n", recommendation.Agent.Description)
		}
		if recommendation.Agent.Phase != "" {
			fmt.Printf("   Phase: %s\n", recommendation.Agent.Phase)
		}

		if len(recommendation.Alternatives) > 0 {
			fmt.Println("\nAlternatives:")
			for _, alt := range recommendation.Alternatives {
				fmt.Printf("   - %s: %s\n", alt.AgentName, alt.Reason)
			}
		}

		fmt.Println("\nNext steps:")
		fmt.Printf("   epf-cli agents show %s    # View the agent\n", recommendation.Agent.Name)
	},
}

func printAgentRecommendationJSON(task string, rec *agent.Recommendation) {
	type altItem struct {
		Name   string `json:"name"`
		Reason string `json:"reason"`
	}

	response := struct {
		Task             string    `json:"task"`
		RecommendedAgent string    `json:"recommended_agent"`
		Confidence       string    `json:"confidence"`
		Reason           string    `json:"reason"`
		AgentType        string    `json:"agent_type,omitempty"`
		AgentPhase       string    `json:"agent_phase,omitempty"`
		Alternatives     []altItem `json:"alternatives,omitempty"`
	}{
		Task:             task,
		RecommendedAgent: rec.Agent.Name,
		Confidence:       rec.Confidence,
		Reason:           rec.Reason,
		AgentType:        string(rec.Agent.Type),
		AgentPhase:       string(rec.Agent.Phase),
	}

	for _, alt := range rec.Alternatives {
		response.Alternatives = append(response.Alternatives, altItem{
			Name:   alt.AgentName,
			Reason: alt.Reason,
		})
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var scaffoldAgentCmd = &cobra.Command{
	Use:   "scaffold <name>",
	Short: "Create a new agent from template",
	Long: `Create a new EPF agent with required files.

This command scaffolds an agent directory containing:
  - agent.yaml (manifest with type, skills, routing)
  - prompt.md (agent's system prompt)

Examples:
  epf-cli agents scaffold my-advisor
  epf-cli agents scaffold my-advisor --type strategist
  epf-cli agents scaffold my-advisor --display-name "Strategy Advisor"`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		typeStr, _ := cmd.Flags().GetString("type")
		displayName, _ := cmd.Flags().GetString("display-name")
		description, _ := cmd.Flags().GetString("description")
		outputDir, _ := cmd.Flags().GetString("output")

		// Parse agent type
		agentType := agent.AgentTypeSpecialist
		if typeStr != "" {
			aType, err := agent.AgentTypeFromString(typeStr)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid agent type '%s'. Valid: guide, strategist, specialist, architect, reviewer\n", typeStr)
				os.Exit(1)
			}
			agentType = aType
		}

		// Determine output directory
		if outputDir == "" {
			if epfContext != nil && epfContext.InstancePath != "" {
				outputDir = filepath.Join(epfContext.InstancePath, agent.InstanceDirName)
			} else {
				outputDir = "."
			}
		}

		agentDir := filepath.Join(outputDir, name)

		// Protect canonical EPF
		if err := EnsurePathNotCanonical(agentDir, "scaffold agent"); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}

		// Default display name
		if displayName == "" {
			// Capitalize words in name
			parts := strings.Split(name, "-")
			for i, p := range parts {
				if len(p) > 0 {
					parts[i] = strings.ToUpper(p[:1]) + p[1:]
				}
			}
			displayName = strings.Join(parts, " ")
		}
		if description == "" {
			description = fmt.Sprintf("A %s agent for working with EPF", agentType)
		}

		// Create directory
		if err := os.MkdirAll(agentDir, 0755); err != nil {
			fmt.Fprintf(os.Stderr, "Error creating agent directory: %v\n", err)
			os.Exit(1)
		}

		// Write agent.yaml
		manifest := fmt.Sprintf(`# Agent Manifest
name: %s
version: "1.0.0"
type: %s

display_name: "%s"
description: "%s"

# Routing: when should this agent be activated?
routing:
  trigger_phrases:
    - "TODO: add trigger phrases"
  phase: ""

# Skills this agent uses
skills:
  required: []
  optional: []

# Capability hints for model selection
capability:
  class: balanced
  context_needs: standard
`, name, agentType, displayName, description)

		if err := os.WriteFile(filepath.Join(agentDir, agent.ManifestFile), []byte(manifest), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing agent.yaml: %v\n", err)
			os.Exit(1)
		}

		// Write prompt.md
		prompt := fmt.Sprintf(`# %s

You are **%s**, %s.

## Your Role

TODO: Describe this agent's persona and responsibilities.

## Workflow

1. TODO: Define the steps this agent follows
2. TODO: Add more steps as needed

## Tools

Use the following EPF tools:
- epf_validate_file — validate artifacts after changes
- TODO: add relevant tools

## Important

- Always validate artifacts after creating or modifying them
- Follow the wizard-first protocol for artifact creation
`, displayName, displayName, description)

		if err := os.WriteFile(filepath.Join(agentDir, agent.PromptFile), []byte(prompt), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing prompt.md: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Created agent: %s\n\n", name)
		fmt.Printf("Location: %s\n\n", agentDir)
		fmt.Println("Files created:")
		fmt.Printf("  - %s\n", agent.ManifestFile)
		fmt.Printf("  - %s\n", agent.PromptFile)

		fmt.Println("\nNext steps:")
		fmt.Printf("  1. Edit %s/%s with your agent's system prompt\n", agentDir, agent.PromptFile)
		fmt.Printf("  2. Update %s/%s with skills and trigger phrases\n", agentDir, agent.ManifestFile)
		fmt.Printf("  3. Test with: epf-cli agents show %s\n", name)
	},
}

var importAgentCmd = &cobra.Command{
	Use:   "import <source>",
	Short: "Import an agent from an external format",
	Long: `Import an agent definition from an external format into the EPF instance.

Supported formats:
  - raw: Plain text or markdown file (auto-detected)
  - crewai: CrewAI agent YAML (role, goal, backstory)
  - openai: OpenAI Assistants JSON (instructions, tools)

The import creates an agent directory with agent.yaml manifest and prompt.md.
Fields that need review are marked with TODO comments.

Examples:
  epf-cli agents import my-prompt.md
  epf-cli agents import agent.yaml --format crewai
  epf-cli agents import assistant.json --format openai
  epf-cli agents import my-prompt.md --force`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		sourcePath := args[0]
		formatStr, _ := cmd.Flags().GetString("format")
		force, _ := cmd.Flags().GetBool("force")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		format, err := agent.ImportFormatFromString(formatStr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Determine instance path
		instancePath := ""
		if epfContext != nil && epfContext.InstancePath != "" {
			instancePath = epfContext.InstancePath
		} else {
			fmt.Fprintln(os.Stderr, "Error: no EPF instance found. Run from within an EPF instance or use --instance flag.")
			os.Exit(1)
		}

		// Protect canonical EPF
		if err := EnsurePathNotCanonical(instancePath, "import agent"); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}

		result, err := agent.ImportAgent(sourcePath, instancePath, format, force)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error importing agent: %v\n", err)
			os.Exit(1)
		}

		if jsonOutput {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return
		}

		fmt.Printf("Imported agent '%s' (format: %s)\n", result.AgentName, result.Format)
		fmt.Printf("  Manifest: %s\n", result.ManifestPath)
		fmt.Printf("  Prompt:   %s\n", result.PromptPath)

		if len(result.TodoFields) > 0 {
			fmt.Println("\nFields to review:")
			for _, field := range result.TodoFields {
				fmt.Printf("  - %s\n", field)
			}
		}

		fmt.Printf("\nNext steps:\n")
		fmt.Printf("  1. Review and update %s\n", result.ManifestPath)
		fmt.Printf("  2. Test with: epf-cli agents show %s\n", result.AgentName)
	},
}

func init() {
	rootCmd.AddCommand(agentsCmd)
	agentsCmd.AddCommand(listAgentsCmd)
	agentsCmd.AddCommand(showAgentCmd)
	agentsCmd.AddCommand(recommendAgentCmd)
	agentsCmd.AddCommand(scaffoldAgentCmd)
	agentsCmd.AddCommand(importAgentCmd)

	// List flags
	listAgentsCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM, Onboarding)")
	listAgentsCmd.Flags().StringP("type", "t", "", "filter by type (guide, strategist, specialist, architect, reviewer)")
	listAgentsCmd.Flags().Bool("json", false, "output as JSON")

	// Show flags
	showAgentCmd.Flags().Bool("content-only", false, "show only the agent prompt without metadata")
	showAgentCmd.Flags().Bool("json", false, "output as JSON")

	// Recommend flags
	recommendAgentCmd.Flags().Bool("json", false, "output as JSON")

	// Scaffold flags
	scaffoldAgentCmd.Flags().StringP("type", "t", "specialist", "agent type (guide, strategist, specialist, architect, reviewer)")
	scaffoldAgentCmd.Flags().String("display-name", "", "human-readable display name")
	scaffoldAgentCmd.Flags().StringP("description", "d", "", "agent description")
	scaffoldAgentCmd.Flags().StringP("output", "o", "", "output directory (defaults to instance agents/)")

	// Import flags
	importAgentCmd.Flags().StringP("format", "f", "auto", "source format (auto, raw, crewai, openai)")
	importAgentCmd.Flags().Bool("force", false, "overwrite existing agent")
	importAgentCmd.Flags().Bool("json", false, "output as JSON")
}
