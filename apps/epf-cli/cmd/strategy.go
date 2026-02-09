package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/strategy"
	"github.com/spf13/cobra"
)

var strategyCmd = &cobra.Command{
	Use:   "strategy",
	Short: "Product strategy server commands",
	Long: `Commands for the EPF Product Strategy Server.

The strategy server makes EPF product strategy data accessible to AI agents
via MCP tools. It provides query tools for vision, personas, roadmaps,
features, and strategic context.

Examples:
  # Start the strategy server (includes MCP tools)
  epf-cli strategy serve docs/EPF/_instances/emergent

  # Check strategy instance status
  epf-cli strategy status docs/EPF/_instances/emergent

  # Export strategy to markdown
  epf-cli strategy export docs/EPF/_instances/emergent -o strategy.md`,
}

var strategyServeCmd = &cobra.Command{
	Use:   "serve <instance-path>",
	Short: "Start the strategy server",
	Long: `Start the MCP server with strategy tools enabled.

The server exposes EPF product strategy via MCP tools:
  - epf_get_product_vision: Get vision, mission, purpose, values
  - epf_get_personas: List all personas
  - epf_get_persona_details: Get full persona details
  - epf_get_value_propositions: Get value propositions
  - epf_get_competitive_position: Get competitive analysis
  - epf_get_roadmap_summary: Get roadmap with OKRs
  - epf_search_strategy: Search across all strategy content
  - epf_get_feature_strategy_context: Get synthesized strategic context

Flags:
  --watch       Enable file watching for automatic reload on changes
  --instance    Path to EPF instance (can also be positional argument)`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		instancePath, _ := cmd.Flags().GetString("instance")
		if instancePath == "" && len(args) > 0 {
			instancePath = args[0]
		}
		if instancePath == "" {
			fmt.Fprintln(os.Stderr, "Error: instance path required (use --instance or positional argument)")
			os.Exit(1)
		}

		watch, _ := cmd.Flags().GetBool("watch")

		// Validate instance exists
		if _, err := os.Stat(instancePath); os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Error: instance path does not exist: %s\n", instancePath)
			os.Exit(1)
		}

		// Set environment variable for the MCP server to pick up
		os.Setenv("EPF_STRATEGY_INSTANCE", instancePath)
		if watch {
			os.Setenv("EPF_STRATEGY_WATCH", "true")
		}

		fmt.Fprintf(os.Stderr, "Strategy server configured for: %s\n", instancePath)
		if watch {
			fmt.Fprintln(os.Stderr, "File watching enabled")
		}
		fmt.Fprintln(os.Stderr, "Starting MCP server with strategy tools...")
		fmt.Fprintln(os.Stderr, "")

		// Delegate to the main serve command
		serveCmd.Run(cmd, args)
	},
}

var strategyStatusCmd = &cobra.Command{
	Use:   "status <instance-path>",
	Short: "Show strategy instance status",
	Long: `Display status information for an EPF strategy instance.

Shows:
  - Artifact counts (north star, personas, features, OKRs)
  - Last load timestamp
  - Warnings for missing or incomplete artifacts
  - Instance health summary`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		instancePath, _ := cmd.Flags().GetString("instance")
		if instancePath == "" && len(args) > 0 {
			instancePath = args[0]
		}
		if instancePath == "" {
			fmt.Fprintln(os.Stderr, "Error: instance path required")
			os.Exit(1)
		}

		outputJSON, _ := cmd.Flags().GetBool("json")
		verbose, _ := cmd.Flags().GetBool("verbose")

		// Load the strategy
		store := strategy.NewFileSystemSource(instancePath)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		startTime := time.Now()
		if err := store.Load(ctx); err != nil {
			if outputJSON {
				result := map[string]interface{}{
					"status": "error",
					"error":  err.Error(),
					"path":   instancePath,
				}
				json.NewEncoder(os.Stdout).Encode(result)
			} else {
				fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
			}
			os.Exit(1)
		}
		loadTime := time.Since(startTime)

		model := store.GetModel()

		// Gather statistics
		status := gatherStrategyStatus(model, instancePath, loadTime)

		if outputJSON {
			json.NewEncoder(os.Stdout).Encode(status)
			return
		}

		// Print human-readable output
		printStrategyStatus(status, verbose)
	},
}

var strategyExportCmd = &cobra.Command{
	Use:   "export <instance-path>",
	Short: "Export strategy to markdown",
	Long: `Export the EPF product strategy to a readable markdown document.

The export includes:
  - Product identity (vision, mission, purpose, values)
  - Target users and personas
  - Key insights and market analysis
  - Competitive positioning
  - Roadmap summary with OKRs
  - Feature overview

Use -o/--output to write to a file, otherwise outputs to stdout.`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		instancePath, _ := cmd.Flags().GetString("instance")
		if instancePath == "" && len(args) > 0 {
			instancePath = args[0]
		}
		if instancePath == "" {
			fmt.Fprintln(os.Stderr, "Error: instance path required")
			os.Exit(1)
		}

		outputFile, _ := cmd.Flags().GetString("output")

		// Load the strategy
		store := strategy.NewFileSystemSource(instancePath)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := store.Load(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
			os.Exit(1)
		}

		model := store.GetModel()

		// Generate markdown
		markdown := generateStrategyMarkdown(model)

		// Output
		if outputFile != "" {
			if err := os.WriteFile(outputFile, []byte(markdown), 0644); err != nil {
				fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
				os.Exit(1)
			}
			fmt.Fprintf(os.Stderr, "Strategy exported to: %s\n", outputFile)
		} else {
			fmt.Print(markdown)
		}
	},
}

// StrategyStatus holds status information for an EPF strategy instance.
type StrategyStatus struct {
	Path      string        `json:"path"`
	Status    string        `json:"status"`
	LoadTime  string        `json:"load_time"`
	LoadedAt  time.Time     `json:"loaded_at"`
	Artifacts ArtifactStats `json:"artifacts"`
	Warnings  []string      `json:"warnings,omitempty"`
}

// ArtifactStats holds counts for various EPF artifacts.
type ArtifactStats struct {
	NorthStar       bool `json:"north_star"`
	InsightAnalyses bool `json:"insight_analyses"`
	StrategyFormula bool `json:"strategy_formula"`
	Roadmap         bool `json:"roadmap"`
	TargetUsers     int  `json:"target_users"`
	KeyInsights     int  `json:"key_insights"`
	Features        int  `json:"features"`
	ValueModels     int  `json:"value_models"`
	OKRs            int  `json:"okrs"`
	KeyResults      int  `json:"key_results"`
	Capabilities    int  `json:"capabilities"`
	FeaturePersonas int  `json:"feature_personas"`
}

func gatherStrategyStatus(model *strategy.StrategyModel, path string, loadTime time.Duration) StrategyStatus {
	status := StrategyStatus{
		Path:     path,
		Status:   "healthy",
		LoadTime: loadTime.String(),
		LoadedAt: model.LastLoaded,
	}

	// Count artifacts
	status.Artifacts.NorthStar = model.NorthStar != nil
	status.Artifacts.InsightAnalyses = model.InsightAnalyses != nil
	status.Artifacts.StrategyFormula = model.StrategyFormula != nil
	status.Artifacts.Roadmap = model.Roadmap != nil

	if model.InsightAnalyses != nil {
		status.Artifacts.TargetUsers = len(model.InsightAnalyses.TargetUsers)
		status.Artifacts.KeyInsights = len(model.InsightAnalyses.KeyInsights)
	}

	status.Artifacts.Features = len(model.Features)
	status.Artifacts.ValueModels = len(model.ValueModels)

	// Count capabilities and feature personas
	for _, f := range model.Features {
		status.Artifacts.Capabilities += len(f.Capabilities)
		status.Artifacts.FeaturePersonas += len(f.Definition.Personas)
	}

	// Count OKRs and KRs
	if model.Roadmap != nil {
		for _, track := range model.Roadmap.Tracks {
			status.Artifacts.OKRs += len(track.OKRs)
			for _, okr := range track.OKRs {
				status.Artifacts.KeyResults += len(okr.KeyResults)
			}
		}
	}

	// Check for warnings
	if !status.Artifacts.NorthStar {
		status.Warnings = append(status.Warnings, "Missing: 00_north_star.yaml")
		status.Status = "incomplete"
	}
	if !status.Artifacts.InsightAnalyses {
		status.Warnings = append(status.Warnings, "Missing: 01_insight_analyses.yaml")
		status.Status = "incomplete"
	}
	if !status.Artifacts.StrategyFormula {
		status.Warnings = append(status.Warnings, "Missing: 04_strategy_formula.yaml")
		status.Status = "incomplete"
	}
	if !status.Artifacts.Roadmap {
		status.Warnings = append(status.Warnings, "Missing: 05_roadmap_recipe.yaml")
		status.Status = "incomplete"
	}
	if status.Artifacts.Features == 0 {
		status.Warnings = append(status.Warnings, "No feature definitions found")
	}
	if status.Artifacts.TargetUsers == 0 && status.Artifacts.FeaturePersonas == 0 {
		status.Warnings = append(status.Warnings, "No personas defined")
	}

	return status
}

func printStrategyStatus(status StrategyStatus, verbose bool) {
	fmt.Printf("Strategy Instance: %s\n", status.Path)
	fmt.Println(strings.Repeat("=", 60))

	// Status indicator
	statusIcon := "✅"
	if status.Status == "incomplete" {
		statusIcon = "⚠️"
	} else if status.Status == "error" {
		statusIcon = "❌"
	}
	fmt.Printf("\nStatus: %s %s\n", statusIcon, status.Status)
	fmt.Printf("Load Time: %s\n", status.LoadTime)
	fmt.Printf("Loaded At: %s\n", status.LoadedAt.Format(time.RFC3339))

	// Artifact summary
	fmt.Println("\nArtifacts:")
	fmt.Println(strings.Repeat("-", 40))

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	// READY phase artifacts
	fmt.Fprintf(w, "READY Phase:\t\n")
	fmt.Fprintf(w, "  North Star\t%s\n", boolIcon(status.Artifacts.NorthStar))
	fmt.Fprintf(w, "  Insight Analyses\t%s\n", boolIcon(status.Artifacts.InsightAnalyses))
	fmt.Fprintf(w, "  Strategy Formula\t%s\n", boolIcon(status.Artifacts.StrategyFormula))
	fmt.Fprintf(w, "  Roadmap\t%s\n", boolIcon(status.Artifacts.Roadmap))

	// Counts
	fmt.Fprintf(w, "\nCounts:\t\n")
	fmt.Fprintf(w, "  Target Users\t%d\n", status.Artifacts.TargetUsers)
	fmt.Fprintf(w, "  Key Insights\t%d\n", status.Artifacts.KeyInsights)
	fmt.Fprintf(w, "  Features\t%d\n", status.Artifacts.Features)
	fmt.Fprintf(w, "  Capabilities\t%d\n", status.Artifacts.Capabilities)
	fmt.Fprintf(w, "  Value Models\t%d\n", status.Artifacts.ValueModels)
	fmt.Fprintf(w, "  OKRs\t%d\n", status.Artifacts.OKRs)
	fmt.Fprintf(w, "  Key Results\t%d\n", status.Artifacts.KeyResults)

	w.Flush()

	// Warnings
	if len(status.Warnings) > 0 {
		fmt.Println("\nWarnings:")
		fmt.Println(strings.Repeat("-", 40))
		for _, warning := range status.Warnings {
			fmt.Printf("  ⚠️  %s\n", warning)
		}
	}

	if verbose {
		// Additional details could go here
		fmt.Println("\nIndexes:")
		fmt.Println(strings.Repeat("-", 40))
		fmt.Printf("  Feature personas mapped: %d\n", status.Artifacts.FeaturePersonas)
	}
}

func boolIcon(b bool) string {
	if b {
		return "✓"
	}
	return "✗"
}

func generateStrategyMarkdown(model *strategy.StrategyModel) string {
	var sb strings.Builder

	// Title
	productName := "Product Strategy"
	if model.ProductName != "" {
		productName = model.ProductName + " Strategy"
	}
	sb.WriteString(fmt.Sprintf("# %s\n\n", productName))
	sb.WriteString(fmt.Sprintf("*Generated: %s*\n\n", time.Now().Format("2006-01-02 15:04:05")))

	// North Star
	if model.NorthStar != nil {
		sb.WriteString("## Product Identity\n\n")

		if model.NorthStar.Purpose.Statement != "" {
			sb.WriteString("### Purpose\n\n")
			sb.WriteString(model.NorthStar.Purpose.Statement)
			sb.WriteString("\n\n")
		}

		if model.NorthStar.Vision.Statement != "" {
			sb.WriteString("### Vision\n\n")
			sb.WriteString(model.NorthStar.Vision.Statement)
			sb.WriteString("\n\n")
		}

		if model.NorthStar.Mission.Statement != "" {
			sb.WriteString("### Mission\n\n")
			sb.WriteString(model.NorthStar.Mission.Statement)
			sb.WriteString("\n\n")
		}

		if len(model.NorthStar.Values) > 0 {
			sb.WriteString("### Values\n\n")
			for _, value := range model.NorthStar.Values {
				sb.WriteString(fmt.Sprintf("- **%s**: %s\n", value.Name, value.Definition))
			}
			sb.WriteString("\n")
		}
	}

	// Target Users
	if model.InsightAnalyses != nil && len(model.InsightAnalyses.TargetUsers) > 0 {
		sb.WriteString("## Target Users\n\n")
		for _, user := range model.InsightAnalyses.TargetUsers {
			sb.WriteString(fmt.Sprintf("### %s\n\n", user.Name))
			if user.Role != "" {
				sb.WriteString(fmt.Sprintf("**Role**: %s\n\n", user.Role))
			}
			if user.Description != "" {
				sb.WriteString(user.Description)
				sb.WriteString("\n\n")
			}
			if len(user.PainPoints) > 0 {
				sb.WriteString("**Pain Points**:\n")
				for _, pp := range user.PainPoints {
					sb.WriteString(fmt.Sprintf("- %s\n", pp))
				}
				sb.WriteString("\n")
			}
		}
	}

	// Key Insights
	if model.InsightAnalyses != nil && len(model.InsightAnalyses.KeyInsights) > 0 {
		sb.WriteString("## Key Insights\n\n")
		for i, insight := range model.InsightAnalyses.KeyInsights {
			sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, insight.Insight))
			if insight.StrategicImplication != "" {
				sb.WriteString(fmt.Sprintf("   - *Strategic implication*: %s\n", insight.StrategicImplication))
			}
		}
		sb.WriteString("\n")
	}

	// Competitive Position
	if model.StrategyFormula != nil {
		sb.WriteString("## Strategic Positioning\n\n")

		if model.StrategyFormula.Positioning.Statement != "" {
			sb.WriteString("### Positioning Statement\n\n")
			sb.WriteString(model.StrategyFormula.Positioning.Statement)
			sb.WriteString("\n\n")
		}

		if model.StrategyFormula.Positioning.UniqueValueProp != "" {
			sb.WriteString("### Unique Value Proposition\n\n")
			sb.WriteString(model.StrategyFormula.Positioning.UniqueValueProp)
			sb.WriteString("\n\n")
		}

		if model.StrategyFormula.CompetitiveMoat.Differentiation != "" {
			sb.WriteString("### Competitive Differentiation\n\n")
			sb.WriteString(model.StrategyFormula.CompetitiveMoat.Differentiation)
			sb.WriteString("\n\n")
		}

		if len(model.StrategyFormula.CompetitiveMoat.Advantages) > 0 {
			sb.WriteString("### Competitive Advantages\n\n")
			for _, adv := range model.StrategyFormula.CompetitiveMoat.Advantages {
				sb.WriteString(fmt.Sprintf("- **%s**: %s\n", adv.Name, adv.Description))
			}
			sb.WriteString("\n")
		}
	}

	// Roadmap
	if model.Roadmap != nil {
		sb.WriteString("## Roadmap\n\n")
		sb.WriteString(fmt.Sprintf("**Cycle**: %d\n\n", model.Roadmap.Cycle))

		for trackName, track := range model.Roadmap.Tracks {
			sb.WriteString(fmt.Sprintf("### %s Track\n\n", trackName))
			for _, okr := range track.OKRs {
				sb.WriteString(fmt.Sprintf("**%s**: %s\n\n", okr.ID, okr.Objective))
				if len(okr.KeyResults) > 0 {
					sb.WriteString("Key Results:\n")
					for _, kr := range okr.KeyResults {
						status := ""
						if kr.Status != "" {
							status = fmt.Sprintf(" [%s]", kr.Status)
						}
						sb.WriteString(fmt.Sprintf("- %s: %s%s\n", kr.ID, kr.Description, status))
					}
					sb.WriteString("\n")
				}
			}
		}
	}

	// Features
	if len(model.Features) > 0 {
		sb.WriteString("## Features\n\n")

		// Group by status
		statusGroups := map[string][]*strategy.Feature{
			"in-progress": {},
			"ready":       {},
			"draft":       {},
			"delivered":   {},
		}
		for _, f := range model.Features {
			status := strings.ToLower(f.Status)
			if _, ok := statusGroups[status]; ok {
				statusGroups[status] = append(statusGroups[status], f)
			} else {
				statusGroups["draft"] = append(statusGroups["draft"], f)
			}
		}

		for _, status := range []string{"in-progress", "ready", "draft", "delivered"} {
			features := statusGroups[status]
			if len(features) == 0 {
				continue
			}

			sb.WriteString(fmt.Sprintf("### %s\n\n", strings.Title(status)))
			for _, f := range features {
				sb.WriteString(fmt.Sprintf("#### %s (%s)\n\n", f.Name, f.ID))
				if f.Definition.JobToBeDone != "" {
					sb.WriteString(fmt.Sprintf("**Job to be done**: %s\n\n", f.Definition.JobToBeDone))
				}
				if len(f.StrategicContext.ContributesTo) > 0 {
					sb.WriteString(fmt.Sprintf("**Contributes to**: %s\n\n", strings.Join(f.StrategicContext.ContributesTo, ", ")))
				}
				if len(f.Capabilities) > 0 {
					sb.WriteString("**Capabilities**:\n")
					for _, cap := range f.Capabilities {
						sb.WriteString(fmt.Sprintf("- %s: %s\n", cap.Name, cap.Description))
					}
					sb.WriteString("\n")
				}
			}
		}
	}

	// Footer
	sb.WriteString("---\n\n")
	sb.WriteString("*This document was generated from EPF artifacts using `epf-cli strategy export`.*\n")

	return sb.String()
}

func init() {
	rootCmd.AddCommand(strategyCmd)

	// strategy serve
	strategyCmd.AddCommand(strategyServeCmd)
	strategyServeCmd.Flags().String("instance", "", "path to EPF instance")
	strategyServeCmd.Flags().Bool("watch", false, "enable file watching for automatic reload")

	// strategy status
	strategyCmd.AddCommand(strategyStatusCmd)
	strategyStatusCmd.Flags().String("instance", "", "path to EPF instance")
	strategyStatusCmd.Flags().Bool("json", false, "output as JSON")
	strategyStatusCmd.Flags().BoolP("verbose", "v", false, "show detailed output")

	// strategy export
	strategyCmd.AddCommand(strategyExportCmd)
	strategyExportCmd.Flags().String("instance", "", "path to EPF instance")
	strategyExportCmd.Flags().StringP("output", "o", "", "output file path (defaults to stdout)")
}
