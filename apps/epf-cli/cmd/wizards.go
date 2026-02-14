package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/wizard"
	"github.com/spf13/cobra"
)

var wizardsCmd = &cobra.Command{
	Use:   "wizards",
	Short: "List, show, and recommend EPF wizards",
	Long: `Manage EPF wizards and agent prompts.

Wizards are AI-assisted workflows that guide users through EPF tasks like
creating features, planning roadmaps, and running assessments.

Types of wizards:
  - agent_prompt: Conversational AI personas (adaptive, context-aware)
  - wizard: Step-by-step guides (structured, sequential)
  - ready_sub_wizard: READY phase sub-wizards (numbered sequence)

Examples:
  epf-cli wizards list                        # List all wizards
  epf-cli wizards list --phase READY          # List READY phase wizards
  epf-cli wizards list --type agent_prompt    # List agent prompts only
  epf-cli wizards show start_epf              # Show the start_epf wizard
  epf-cli wizards recommend "create feature"  # Get wizard recommendation`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listWizardsCmd.Run(cmd, args)
	},
}

var listWizardsCmd = &cobra.Command{
	Use:   "list",
	Short: "List available wizards",
	Long: `List all available EPF wizards and agent prompts.

Wizards are organized by phase (READY, FIRE, AIM) and type
(agent_prompt, wizard, ready_sub_wizard).`,
	Run: func(cmd *cobra.Command, args []string) {
		var loader *wizard.Loader
		var sourceLabel string

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded wizards
			if embedded.HasEmbeddedArtifacts() {
				loader = wizard.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = wizard.NewLoader(epfRoot)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading wizards: %v\n", err)
			os.Exit(1)
		}

		sourceLabel = loader.Source()

		if !loader.HasWizards() {
			fmt.Println("No wizards found.")
			if epfRoot != "" {
				fmt.Printf("Expected location: %s/wizards/\n", epfRoot)
			}
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
			default:
				fmt.Fprintf(os.Stderr, "Invalid phase '%s'. Valid phases: READY, FIRE, AIM\n", phaseFilter)
				os.Exit(1)
			}
		}

		var typePtr *wizard.WizardType
		if typeFilter != "" {
			wType, err := wizard.WizardTypeFromString(typeFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid wizard type '%s'. Valid types: agent_prompt, wizard, ready_sub_wizard\n", typeFilter)
				os.Exit(1)
			}
			typePtr = &wType
		}

		wizards := loader.ListWizards(phasePtr, typePtr)

		if jsonOutput {
			printWizardsJSON(wizards)
			return
		}

		fmt.Printf("EPF Wizards (loaded from %s)\n\n", sourceLabel)

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
		for _, w := range wizards {
			phase := string(w.Phase)
			if phase == "" {
				phase = "Onboarding"
			}
			if phase != currentPhase {
				currentPhase = phase
				fmt.Printf("## %s\n\n", phase)
			}

			typeIcon := "🤖"
			if w.Type == wizard.WizardTypeWizard {
				typeIcon = "📋"
			} else if w.Type == wizard.WizardTypeReadySubWizard {
				typeIcon = "🔍"
			}

			fmt.Printf("  %s %-25s %s\n", typeIcon, w.Name, w.Type)
			if w.Purpose != "" {
				// Truncate long purposes
				purpose := w.Purpose
				if len(purpose) > 70 {
					purpose = purpose[:67] + "..."
				}
				fmt.Printf("     %s\n", purpose)
			}
			if w.Duration != "" {
				fmt.Printf("     Duration: %s\n", w.Duration)
			}
			fmt.Println()
		}

		fmt.Println("---")
		fmt.Println("🤖 = agent_prompt, 📋 = wizard, 🔍 = ready_sub_wizard")
		fmt.Printf("Total: %d wizards\n", len(wizards))
	},
}

func printWizardsJSON(wizards []*wizard.WizardInfo) {
	type wizardItem struct {
		Name     string   `json:"name"`
		Type     string   `json:"type"`
		Phase    string   `json:"phase,omitempty"`
		Purpose  string   `json:"purpose,omitempty"`
		Duration string   `json:"duration,omitempty"`
		Triggers []string `json:"triggers,omitempty"`
	}

	items := make([]wizardItem, 0, len(wizards))
	for _, w := range wizards {
		items = append(items, wizardItem{
			Name:     w.Name,
			Type:     string(w.Type),
			Phase:    string(w.Phase),
			Purpose:  w.Purpose,
			Duration: w.Duration,
			Triggers: w.TriggerPhrases,
		})
	}

	jsonBytes, _ := json.MarshalIndent(items, "", "  ")
	fmt.Println(string(jsonBytes))
}

var showWizardCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Show a specific wizard",
	Long: `Display the full content and metadata of a wizard.

This shows the wizard instructions that AI agents use to guide users
through EPF workflows.

Examples:
  epf-cli wizards show start_epf
  epf-cli wizards show pathfinder
  epf-cli wizards show feature_definition`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var loader *wizard.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded wizards
			if embedded.HasEmbeddedArtifacts() {
				loader = wizard.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = wizard.NewLoader(epfRoot)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading wizards: %v\n", err)
			os.Exit(1)
		}

		w, err := loader.GetWizard(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintln(os.Stderr, "\nAvailable wizards:")
			for _, name := range loader.GetWizardNames() {
				fmt.Fprintf(os.Stderr, "  %s\n", name)
			}
			os.Exit(1)
		}

		// Check output format
		contentOnly, _ := cmd.Flags().GetBool("content-only")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		if jsonOutput {
			printWizardJSON(w)
			return
		}

		if contentOnly {
			fmt.Print(w.Content)
			return
		}

		// Print metadata header
		fmt.Printf("# Wizard: %s\n", w.Name)
		fmt.Printf("# Type: %s\n", w.Type)
		if w.Phase != "" {
			fmt.Printf("# Phase: %s\n", w.Phase)
		}
		if w.Purpose != "" {
			fmt.Printf("# Purpose: %s\n", w.Purpose)
		}
		if w.Duration != "" {
			fmt.Printf("# Duration: %s\n", w.Duration)
		}
		if len(w.TriggerPhrases) > 0 {
			fmt.Printf("# Triggers: %s\n", strings.Join(w.TriggerPhrases, ", "))
		}
		if len(w.RelatedWizards) > 0 {
			fmt.Printf("# Related Wizards: %s\n", strings.Join(w.RelatedWizards, ", "))
		}
		fmt.Printf("# File: %s\n", w.FilePath)
		fmt.Println("#")
		fmt.Println("# --- Wizard Content ---")
		fmt.Println()
		fmt.Print(w.Content)
	},
}

func printWizardJSON(w *wizard.WizardInfo) {
	response := struct {
		Name             string   `json:"name"`
		Type             string   `json:"type"`
		Phase            string   `json:"phase,omitempty"`
		Purpose          string   `json:"purpose,omitempty"`
		Duration         string   `json:"duration,omitempty"`
		Triggers         []string `json:"triggers,omitempty"`
		Outputs          []string `json:"outputs,omitempty"`
		RelatedWizards   []string `json:"related_wizards,omitempty"`
		RelatedTemplates []string `json:"related_templates,omitempty"`
		RelatedSchemas   []string `json:"related_schemas,omitempty"`
		Content          string   `json:"content"`
	}{
		Name:             w.Name,
		Type:             string(w.Type),
		Phase:            string(w.Phase),
		Purpose:          w.Purpose,
		Duration:         w.Duration,
		Triggers:         w.TriggerPhrases,
		Outputs:          w.Outputs,
		RelatedWizards:   w.RelatedWizards,
		RelatedTemplates: w.RelatedTemplates,
		RelatedSchemas:   w.RelatedSchemas,
		Content:          w.Content,
	}
	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var recommendWizardCmd = &cobra.Command{
	Use:   "recommend <task>",
	Short: "Recommend a wizard for a task",
	Long: `Get a wizard recommendation based on your task description.

The recommender analyzes your task and suggests the most appropriate
wizard, along with alternatives and confidence level.

Examples:
  epf-cli wizards recommend "create a feature definition"
  epf-cli wizards recommend "analyze market trends"
  epf-cli wizards recommend "help me get started with epf"
  epf-cli wizards recommend "assess our last cycle"`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var loader *wizard.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded wizards
			if embedded.HasEmbeddedArtifacts() {
				loader = wizard.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = wizard.NewLoader(epfRoot)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading wizards: %v\n", err)
			os.Exit(1)
		}

		if !loader.HasWizards() {
			fmt.Println("No wizards found to recommend from.")
			return
		}

		task := args[0]
		recommender := wizard.NewRecommender(loader)
		recommendation, err := recommender.RecommendForTask(task)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		jsonOutput, _ := cmd.Flags().GetBool("json")

		if recommendation == nil || recommendation.Wizard == nil {
			if jsonOutput {
				fmt.Println(`{"task": "` + task + `", "recommended_wizard": null, "message": "No matching wizard found"}`)
			} else {
				fmt.Println("No matching wizard found for your task.")
				fmt.Println("\nTry:")
				fmt.Println("  - Being more specific about what you want to do")
				fmt.Println("  - Using 'epf-cli wizards list' to see available wizards")
			}
			return
		}

		if jsonOutput {
			printRecommendationJSON(task, recommendation)
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

		fmt.Printf("%s Recommended: %s\n", confidenceIcon, recommendation.Wizard.Name)
		fmt.Printf("   Confidence: %s\n", recommendation.Confidence)
		fmt.Printf("   Reason: %s\n", recommendation.Reason)

		if recommendation.Wizard.Purpose != "" {
			fmt.Printf("   Purpose: %s\n", recommendation.Wizard.Purpose)
		}
		if recommendation.Wizard.Phase != "" {
			fmt.Printf("   Phase: %s\n", recommendation.Wizard.Phase)
		}
		if recommendation.Wizard.Duration != "" {
			fmt.Printf("   Duration: %s\n", recommendation.Wizard.Duration)
		}

		if len(recommendation.Alternatives) > 0 {
			fmt.Println("\nAlternatives:")
			for _, alt := range recommendation.Alternatives {
				fmt.Printf("   - %s: %s\n", alt.WizardName, alt.Reason)
			}
		}

		fmt.Println("\nNext steps:")
		fmt.Printf("   epf-cli wizards show %s    # View the wizard\n", recommendation.Wizard.Name)
	},
}

func printRecommendationJSON(task string, rec *wizard.Recommendation) {
	type altItem struct {
		Name   string `json:"name"`
		Reason string `json:"reason"`
	}

	response := struct {
		Task              string    `json:"task"`
		RecommendedWizard string    `json:"recommended_wizard"`
		Confidence        string    `json:"confidence"`
		Reason            string    `json:"reason"`
		WizardPurpose     string    `json:"wizard_purpose,omitempty"`
		WizardPhase       string    `json:"wizard_phase,omitempty"`
		WizardDuration    string    `json:"wizard_duration,omitempty"`
		Alternatives      []altItem `json:"alternatives,omitempty"`
	}{
		Task:              task,
		RecommendedWizard: rec.Wizard.Name,
		Confidence:        rec.Confidence,
		Reason:            rec.Reason,
		WizardPurpose:     rec.Wizard.Purpose,
		WizardPhase:       string(rec.Wizard.Phase),
		WizardDuration:    rec.Wizard.Duration,
	}

	for _, alt := range rec.Alternatives {
		response.Alternatives = append(response.Alternatives, altItem{
			Name:   alt.WizardName,
			Reason: alt.Reason,
		})
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var listAgentInstructionsCmd = &cobra.Command{
	Use:   "instructions",
	Short: "List agent instruction files",
	Long: `List EPF agent instruction files.

These files provide AI agents with guidance for working with EPF.
They include comprehensive instructions, quick references, and
maintenance protocols.`,
	Run: func(cmd *cobra.Command, args []string) {
		var loader *wizard.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded wizards (note: instructions require filesystem)
			if embedded.HasEmbeddedArtifacts() {
				loader = wizard.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = wizard.NewLoader(epfRoot)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading wizards: %v\n", err)
			os.Exit(1)
		}

		instructions := loader.ListAgentInstructions()

		if len(instructions) == 0 {
			fmt.Println("No agent instruction files found.")
			return
		}

		jsonOutput, _ := cmd.Flags().GetBool("json")

		if jsonOutput {
			type instItem struct {
				Name    string `json:"name"`
				Purpose string `json:"purpose"`
				Scope   string `json:"scope"`
			}
			items := make([]instItem, 0, len(instructions))
			for _, inst := range instructions {
				items = append(items, instItem{
					Name:    inst.Name,
					Purpose: inst.Purpose,
					Scope:   inst.Scope,
				})
			}
			jsonBytes, _ := json.MarshalIndent(items, "", "  ")
			fmt.Println(string(jsonBytes))
			return
		}

		fmt.Println("EPF Agent Instructions")
		fmt.Println()

		// Sort by scope
		sort.Slice(instructions, func(i, j int) bool {
			scopeOrder := map[string]int{
				"comprehensive":   1,
				"quick-reference": 2,
				"maintenance":     3,
				"general":         4,
			}
			return scopeOrder[instructions[i].Scope] < scopeOrder[instructions[j].Scope]
		})

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

			fmt.Printf("  %s %-30s %s\n", scopeIcon, inst.Name, inst.Scope)
			fmt.Printf("     %s\n", inst.Purpose)
			fmt.Println()
		}

		fmt.Println("---")
		fmt.Println("📖 = comprehensive, ⚡ = quick-reference, 🔧 = maintenance")
		fmt.Printf("Total: %d instruction files\n", len(instructions))
	},
}

func init() {
	rootCmd.AddCommand(wizardsCmd)
	wizardsCmd.AddCommand(listWizardsCmd)
	wizardsCmd.AddCommand(showWizardCmd)
	wizardsCmd.AddCommand(recommendWizardCmd)
	wizardsCmd.AddCommand(listAgentInstructionsCmd)

	// List flags
	listWizardsCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM)")
	listWizardsCmd.Flags().StringP("type", "t", "", "filter by type (agent_prompt, wizard, ready_sub_wizard)")
	listWizardsCmd.Flags().Bool("json", false, "output as JSON")

	// Show flags
	showWizardCmd.Flags().Bool("content-only", false, "show only the wizard content without metadata")
	showWizardCmd.Flags().Bool("json", false, "output as JSON")

	// Recommend flags
	recommendWizardCmd.Flags().Bool("json", false, "output as JSON")

	// Instructions flags
	listAgentInstructionsCmd.Flags().Bool("json", false, "output as JSON")
}
