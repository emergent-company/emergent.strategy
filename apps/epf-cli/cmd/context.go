package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/spf13/cobra"
)

var (
	contextJSON    bool
	contextVerbose bool
)

var contextCmd = &cobra.Command{
	Use:     "context <feature_id>",
	Aliases: []string{"ctx"},
	Short:   "Get strategic context for a feature",
	Long: `Show the strategic context for a feature, including:
  - Feature details (name, status, TRL level)
  - Value model paths it contributes to (with explanations)
  - Related Key Results from the roadmap
  - Feature dependencies (requires/enables)

This helps you understand how a feature fits into the overall product strategy
and what impact it has on the value model.

You can use either the feature ID or slug to identify the feature.

The command auto-detects the EPF instance from your current directory.
Use --instance to specify a particular instance when multiple exist.

Examples:
  epf-cli context FD-001
  epf-cli context knowledge-exploration-engine
  epf-cli context FD-001 --verbose
  epf-cli context FD-001 --json`,
	Args: cobra.ExactArgs(1),
	Run:  runContext,
}

// ContextResult is the JSON output structure for context command
type ContextResult struct {
	Feature       *ContextFeatureInfo  `json:"feature"`
	ContributesTo []*ContextPathInfo   `json:"contributes_to"`
	RelatedKRs    []*ContextKRInfo     `json:"related_krs,omitempty"`
	Requires      []*ContextFeatureRef `json:"requires,omitempty"`
	Enables       []*ContextFeatureRef `json:"enables,omitempty"`
	Guidance      *ContextGuidance     `json:"guidance,omitempty"`
	Error         string               `json:"error,omitempty"`
}

type ContextFeatureInfo struct {
	ID          string `json:"id"`
	Slug        string `json:"slug,omitempty"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Description string `json:"description,omitempty"`
}

type ContextPathInfo struct {
	Path          string `json:"path"`
	CanonicalPath string `json:"canonical_path,omitempty"`
	IsValid       bool   `json:"is_valid"`
	Error         string `json:"error,omitempty"`
	Track         string `json:"track,omitempty"`
	LayerName     string `json:"layer_name,omitempty"`
	ComponentName string `json:"component_name,omitempty"`
	Maturity      string `json:"maturity,omitempty"`
}

type ContextKRInfo struct {
	ID          string `json:"id"`
	Description string `json:"description,omitempty"`
	Track       string `json:"track,omitempty"`
	TargetPath  string `json:"target_path,omitempty"`
}

type ContextFeatureRef struct {
	ID     string `json:"id"`
	Name   string `json:"name,omitempty"`
	Status string `json:"status,omitempty"`
}

type ContextGuidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Warnings  []string `json:"warnings,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

func runContext(cmd *cobra.Command, args []string) {
	featureID := args[0]

	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if contextJSON {
			outputContextJSON(&ContextResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Show instance being used
	if !contextJSON {
		ctx := GetContext()
		if ctx != nil && ctx.CurrentInstance != "" {
			fmt.Printf("Using instance: %s\n\n", ctx.CurrentInstance)
		}
	}

	// Create and load analyzer
	analyzer := relationships.NewAnalyzer(instancePath)
	if err := analyzer.Load(); err != nil {
		if contextJSON {
			outputContextJSON(&ContextResult{Error: fmt.Sprintf("Failed to load instance: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
		}
		os.Exit(1)
	}

	// Get strategic context
	stratContext, err := analyzer.GetStrategicContext(featureID)
	if err != nil {
		if contextJSON {
			outputContextJSON(&ContextResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)

			// Try to suggest similar features
			features := analyzer.GetFeatures()
			if features != nil {
				fmt.Println("\nAvailable features:")
				count := 0
				for id := range features.ByID {
					if count >= 10 {
						fmt.Printf("  ... and %d more\n", len(features.ByID)-10)
						break
					}
					fmt.Printf("  • %s\n", id)
					count++
				}
			}
		}
		os.Exit(1)
	}

	result := buildContextResult(stratContext)

	if contextJSON {
		outputContextJSON(result)
	} else {
		printContextResult(result)
	}
}

func buildContextResult(ctx *relationships.StrategicContextResult) *ContextResult {
	result := &ContextResult{
		Feature: &ContextFeatureInfo{
			ID:     ctx.Feature.ID,
			Slug:   ctx.Feature.Slug,
			Name:   ctx.Feature.Name,
			Status: string(ctx.Feature.Status),
		},
		ContributesTo: make([]*ContextPathInfo, 0),
		Guidance:      &ContextGuidance{},
	}

	// Add description if verbose (from Definition.JobToBeDone)
	if contextVerbose && ctx.Feature.Definition.JobToBeDone != "" {
		result.Feature.Description = ctx.Feature.Definition.JobToBeDone
	}

	// Build contributes_to info
	invalidPaths := 0
	for _, path := range ctx.ContributesTo {
		pathInfo := &ContextPathInfo{
			Path:    path.Path,
			IsValid: path.IsValid,
		}

		if path.IsValid {
			pathInfo.CanonicalPath = path.CanonicalPath
			pathInfo.Track = path.Track
			if path.Layer != nil {
				pathInfo.LayerName = path.Layer.Name
			}
			if path.Component != nil {
				pathInfo.ComponentName = path.Component.Name
				pathInfo.Maturity = path.Component.Maturity
			}
		} else {
			pathInfo.Error = path.ErrorMsg
			invalidPaths++
		}

		result.ContributesTo = append(result.ContributesTo, pathInfo)
	}

	// Build related KRs
	for _, krEntry := range ctx.RelatedKRs {
		krInfo := &ContextKRInfo{
			ID:    krEntry.KR.ID,
			Track: string(krEntry.Track),
		}
		if krEntry.KR.ValueModelTarget != nil {
			krInfo.TargetPath = krEntry.KR.ValueModelTarget.ComponentPath
		}
		if contextVerbose && krEntry.KR.Description != "" {
			krInfo.Description = krEntry.KR.Description
		}
		result.RelatedKRs = append(result.RelatedKRs, krInfo)
	}

	// Build requires
	for _, f := range ctx.RequiresFeatures {
		result.Requires = append(result.Requires, &ContextFeatureRef{
			ID:     f.ID,
			Name:   f.Name,
			Status: string(f.Status),
		})
	}

	// Build enables
	for _, f := range ctx.EnablesFeatures {
		result.Enables = append(result.Enables, &ContextFeatureRef{
			ID:     f.ID,
			Name:   f.Name,
			Status: string(f.Status),
		})
	}

	// Build guidance
	if invalidPaths > 0 {
		result.Guidance.Warnings = append(result.Guidance.Warnings,
			fmt.Sprintf("%d contributes_to path(s) are invalid - run 'epf-cli relationships validate' for details", invalidPaths))
	}

	if len(ctx.ContributesTo) == 0 {
		result.Guidance.NextSteps = append(result.Guidance.NextSteps,
			"This feature has no contributes_to paths - consider adding strategic_context.contributes_to")
	}

	if len(ctx.RelatedKRs) == 0 && len(ctx.ContributesTo) > 0 {
		result.Guidance.Tips = append(result.Guidance.Tips,
			"No KRs target the same paths as this feature - the feature may not be directly tied to quarterly goals")
	}

	return result
}

func printContextResult(result *ContextResult) {
	if result.Error != "" {
		fmt.Fprintf(os.Stderr, "Error: %s\n", result.Error)
		return
	}

	f := result.Feature

	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  Feature: %-50s║\n", truncateString(f.Name, 50))
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Feature info
	fmt.Printf("📋 ID:     %s\n", f.ID)
	if f.Slug != "" {
		fmt.Printf("   Slug:   %s\n", f.Slug)
	}
	fmt.Printf("   Status: %s\n", statusIcon(f.Status))
	if contextVerbose && f.Description != "" {
		fmt.Printf("   Desc:   %s\n", wrapText(f.Description, 55, "          "))
	}
	fmt.Println()

	// Contributes to
	fmt.Println("🎯 Contributes To:")
	if len(result.ContributesTo) == 0 {
		fmt.Println("   (none)")
	} else {
		for _, p := range result.ContributesTo {
			if p.IsValid {
				maturityStr := ""
				if p.Maturity != "" {
					maturityStr = fmt.Sprintf(" [%s]", p.Maturity)
				}
				fmt.Printf("   ✓ %s%s\n", p.Path, maturityStr)
				if contextVerbose {
					fmt.Printf("     Track: %s | Layer: %s | Component: %s\n",
						p.Track, p.LayerName, p.ComponentName)
				}
			} else {
				fmt.Printf("   ✗ %s\n", p.Path)
				fmt.Printf("     Error: %s\n", p.Error)
			}
		}
	}
	fmt.Println()

	// Related KRs
	fmt.Println("📊 Related Key Results:")
	if len(result.RelatedKRs) == 0 {
		fmt.Println("   (none)")
	} else {
		for _, kr := range result.RelatedKRs {
			fmt.Printf("   • %s (%s)\n", kr.ID, kr.Track)
			if contextVerbose && kr.Description != "" {
				fmt.Printf("     %s\n", wrapText(kr.Description, 55, "     "))
			}
			if contextVerbose && kr.TargetPath != "" {
				fmt.Printf("     Targets: %s\n", kr.TargetPath)
			}
		}
	}
	fmt.Println()

	// Dependencies
	if len(result.Requires) > 0 || len(result.Enables) > 0 {
		fmt.Println("🔗 Dependencies:")
		if len(result.Requires) > 0 {
			fmt.Println("   Requires:")
			for _, r := range result.Requires {
				fmt.Printf("     ← %s (%s)\n", r.ID, r.Status)
			}
		}
		if len(result.Enables) > 0 {
			fmt.Println("   Enables:")
			for _, e := range result.Enables {
				fmt.Printf("     → %s (%s)\n", e.ID, e.Status)
			}
		}
		fmt.Println()
	}

	// Guidance
	if result.Guidance != nil {
		if len(result.Guidance.Warnings) > 0 {
			fmt.Println("⚠️  Warnings:")
			for _, w := range result.Guidance.Warnings {
				fmt.Printf("   %s\n", w)
			}
			fmt.Println()
		}
		if len(result.Guidance.NextSteps) > 0 {
			fmt.Println("📋 Suggested Next Steps:")
			for _, step := range result.Guidance.NextSteps {
				fmt.Printf("   → %s\n", step)
			}
			fmt.Println()
		}
		if contextVerbose && len(result.Guidance.Tips) > 0 {
			fmt.Println("💡 Tips:")
			for _, tip := range result.Guidance.Tips {
				fmt.Printf("   • %s\n", tip)
			}
		}
	}
}

func statusIcon(status string) string {
	switch strings.ToLower(status) {
	case "proposed":
		return "📝 Proposed"
	case "draft":
		return "✏️  Draft"
	case "ready":
		return "✅ Ready"
	case "in_development", "in-development":
		return "🚧 In Development"
	case "released":
		return "🚀 Released"
	case "deprecated":
		return "⚠️  Deprecated"
	default:
		return status
	}
}

func outputContextJSON(result *ContextResult) {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}

func init() {
	rootCmd.AddCommand(contextCmd)
	contextCmd.Flags().BoolVar(&contextJSON, "json", false, "Output as JSON")
	contextCmd.Flags().BoolVarP(&contextVerbose, "verbose", "v", false, "Show detailed output including descriptions")
}
