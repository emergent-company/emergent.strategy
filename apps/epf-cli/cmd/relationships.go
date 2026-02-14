package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/spf13/cobra"
)

var (
	relValidateJSON    bool
	relValidateVerbose bool
)

var relationshipsCmd = &cobra.Command{
	Use:     "relationships",
	Aliases: []string{"rel", "rels"},
	Short:   "Manage and validate EPF relationships",
	Long: `Commands for managing relationships between EPF artifacts.

EPF artifacts are connected through relationship paths:
  - Features have contributes_to paths linking to value model components
  - Key Results have value_model_target paths linking to value model components

These paths define the strategic context of features and KRs,
connecting implementation to strategy.

Subcommands:
  validate  - Check that all relationship paths are valid`,
}

var validateRelationshipsCmd = &cobra.Command{
	Use:   "validate",
	Short: "Validate all relationship paths",
	Long: `Validate that all relationship paths in the EPF instance are valid.

This checks:
  - Feature contributes_to paths resolve to valid value model components
  - KR value_model_target paths resolve to valid value model components

For each invalid path, the command provides:
  - The source artifact (feature or KR ID)
  - The invalid path
  - Available valid paths at that level
  - "Did you mean?" suggestions for similar paths
  - Hints for fixing the error

The command auto-detects the EPF instance from your current directory.
Use --instance to specify a particular instance when multiple exist.

Examples:
  epf-cli relationships validate
  epf-cli relationships validate --verbose
  epf-cli relationships validate --json`,
	Run: runValidateRelationships,
}

// RelValidateResult is the JSON output structure for relationships validate
type RelValidateResult struct {
	Valid          bool                           `json:"valid"`
	Stats          *RelValidateStats              `json:"stats"`
	Errors         []*RelValidateError            `json:"errors,omitempty"`
	ErrorsBySource map[string][]*RelValidateError `json:"errors_by_source,omitempty"`
	Guidance       *RelValidateGuidance           `json:"guidance,omitempty"`
}

type RelValidateStats struct {
	FeaturesChecked int `json:"features_checked"`
	KRsChecked      int `json:"krs_checked"`
	PathsChecked    int `json:"paths_checked"`
	ValidPaths      int `json:"valid_paths"`
	InvalidPaths    int `json:"invalid_paths"`
	ErrorCount      int `json:"error_count"`
	WarningCount    int `json:"warning_count"`
}

type RelValidateError struct {
	Severity       string   `json:"severity"`
	Source         string   `json:"source"`
	SourceType     string   `json:"source_type"`
	Field          string   `json:"field"`
	InvalidPath    string   `json:"invalid_path"`
	Message        string   `json:"message"`
	AvailablePaths []string `json:"available_paths,omitempty"`
	DidYouMean     string   `json:"did_you_mean,omitempty"`
	Hint           string   `json:"hint,omitempty"`
}

type RelValidateGuidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

func runValidateRelationships(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if relValidateJSON {
			outputRelValidateJSON(&RelValidateResult{Valid: false, Guidance: &RelValidateGuidance{Tips: []string{err.Error()}}})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Show instance being used
	if !relValidateJSON {
		ctx := GetContext()
		if ctx != nil && ctx.CurrentInstance != "" {
			fmt.Printf("Using instance: %s\n\n", ctx.CurrentInstance)
		}
	}

	// Create and load analyzer
	analyzer := relationships.NewAnalyzer(instancePath)
	if err := analyzer.Load(); err != nil {
		if relValidateJSON {
			outputRelValidateJSON(&RelValidateResult{Valid: false, Guidance: &RelValidateGuidance{Tips: []string{fmt.Sprintf("Failed to load instance: %v", err)}}})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
		}
		os.Exit(1)
	}

	// Run validation
	validationResult := analyzer.ValidateAll()
	result := buildRelValidateResult(validationResult)

	if relValidateJSON {
		outputRelValidateJSON(result)
	} else {
		printRelValidateResult(result)
	}

	if !result.Valid {
		os.Exit(1)
	}
}

func buildRelValidateResult(validation *relationships.ValidationResult) *RelValidateResult {
	result := &RelValidateResult{
		Valid: validation.Valid,
		Stats: &RelValidateStats{
			FeaturesChecked: validation.Stats.TotalFeaturesChecked,
			KRsChecked:      validation.Stats.TotalKRsChecked,
			PathsChecked:    validation.Stats.TotalPathsChecked,
			ValidPaths:      validation.Stats.ValidPaths,
			InvalidPaths:    validation.Stats.InvalidPaths,
			ErrorCount:      validation.Stats.ErrorCount,
			WarningCount:    validation.Stats.WarningCount,
		},
		ErrorsBySource: make(map[string][]*RelValidateError),
		Guidance:       &RelValidateGuidance{},
	}

	// Convert errors
	for _, e := range validation.Errors {
		relErr := &RelValidateError{
			Severity:       string(e.Severity),
			Source:         e.Source,
			SourceType:     e.SourceType,
			Field:          e.Field,
			InvalidPath:    e.InvalidPath,
			Message:        e.Message,
			AvailablePaths: e.AvailablePaths,
			DidYouMean:     e.DidYouMean,
			Hint:           e.Hint,
		}
		result.Errors = append(result.Errors, relErr)
		result.ErrorsBySource[e.Source] = append(result.ErrorsBySource[e.Source], relErr)
	}

	// Build guidance
	if !validation.Valid {
		if validation.Stats.ErrorCount > 0 {
			result.Guidance.NextSteps = append(result.Guidance.NextSteps,
				"Fix the invalid paths listed above")
			result.Guidance.NextSteps = append(result.Guidance.NextSteps,
				"Use 'epf-cli explain <path>' to understand valid paths")
		}
		result.Guidance.Tips = append(result.Guidance.Tips,
			"Value model paths are case-sensitive and use PascalCase")
		result.Guidance.Tips = append(result.Guidance.Tips,
			"Paths follow the format: Track.Layer.Component[.SubComponent]")
	} else {
		result.Guidance.Tips = append(result.Guidance.Tips,
			"All relationships are valid - use 'epf-cli coverage' to check coverage")
	}

	return result
}

func printRelValidateResult(result *RelValidateResult) {
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Println("║            Relationship Validation                         ║")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Summary stats
	fmt.Println("📊 Validation Summary:")
	fmt.Printf("   Features checked: %d\n", result.Stats.FeaturesChecked)
	fmt.Printf("   KRs checked:      %d\n", result.Stats.KRsChecked)
	fmt.Printf("   Paths checked:    %d\n", result.Stats.PathsChecked)
	fmt.Printf("   Valid paths:      %d\n", result.Stats.ValidPaths)
	fmt.Printf("   Invalid paths:    %d\n", result.Stats.InvalidPaths)
	fmt.Println()

	// Result
	if result.Valid {
		fmt.Println("✅ All relationship paths are valid!")
	} else {
		fmt.Printf("❌ Found %d error(s) and %d warning(s)\n", result.Stats.ErrorCount, result.Stats.WarningCount)
		fmt.Println()

		// Print errors grouped by source
		fmt.Println("🔴 Errors by Source:")
		fmt.Println("   ─────────────────────────────────────────────────")

		for source, errors := range result.ErrorsBySource {
			sourceType := ""
			if len(errors) > 0 {
				sourceType = errors[0].SourceType
			}
			fmt.Printf("\n   %s (%s):\n", source, sourceType)

			for _, e := range errors {
				fmt.Printf("   ├─ Field: %s\n", e.Field)
				fmt.Printf("   │  Path: %s\n", e.InvalidPath)
				fmt.Printf("   │  Error: %s\n", e.Message)

				if e.DidYouMean != "" {
					fmt.Printf("   │  💡 Did you mean: %s?\n", e.DidYouMean)
				}

				if relValidateVerbose {
					if e.Hint != "" {
						fmt.Printf("   │  Hint: %s\n", e.Hint)
					}
					if len(e.AvailablePaths) > 0 {
						fmt.Printf("   │  Available paths:\n")
						displayCount := len(e.AvailablePaths)
						if displayCount > 5 {
							displayCount = 5
						}
						for i := 0; i < displayCount; i++ {
							fmt.Printf("   │    • %s\n", e.AvailablePaths[i])
						}
						if len(e.AvailablePaths) > 5 {
							fmt.Printf("   │    ... and %d more\n", len(e.AvailablePaths)-5)
						}
					}
				}
			}
		}
	}
	fmt.Println()

	// Guidance
	if result.Guidance != nil {
		if len(result.Guidance.NextSteps) > 0 {
			fmt.Println("📋 Suggested Next Steps:")
			for _, step := range result.Guidance.NextSteps {
				fmt.Printf("   → %s\n", step)
			}
			fmt.Println()
		}
		if relValidateVerbose && len(result.Guidance.Tips) > 0 {
			fmt.Println("💡 Tips:")
			for _, tip := range result.Guidance.Tips {
				fmt.Printf("   • %s\n", tip)
			}
		}
	}
}

func outputRelValidateJSON(result *RelValidateResult) {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}

func init() {
	rootCmd.AddCommand(relationshipsCmd)
	relationshipsCmd.AddCommand(validateRelationshipsCmd)

	validateRelationshipsCmd.Flags().BoolVar(&relValidateJSON, "json", false, "Output as JSON")
	validateRelationshipsCmd.Flags().BoolVarP(&relValidateVerbose, "verbose", "v", false, "Show detailed output including hints and available paths")
}
