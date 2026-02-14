package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
)

// ArtifactInfo combines schema and template information for discovery
type ArtifactInfo struct {
	Type         string `json:"type"`
	Phase        string `json:"phase"`
	Description  string `json:"description"`
	HasSchema    bool   `json:"has_schema"`
	HasTemplate  bool   `json:"has_template"`
	HasExamples  bool   `json:"has_examples,omitempty"`
	ExampleCount int    `json:"example_count,omitempty"`
}

var artifactsCmd = &cobra.Command{
	Use:   "artifacts",
	Short: "List all EPF artifact types",
	Long: `List all EPF artifact types with their available resources.

This provides a discovery view of what artifact types exist, 
showing which have schemas, templates, and examples available.

This is useful for AI agents to understand what EPF artifacts
can be created and what resources are available to help.

Examples:
  epf-cli artifacts                # List all artifacts
  epf-cli artifacts list           # Same as above
  epf-cli artifacts list --json    # Output as JSON
  epf-cli artifacts list --phase READY  # Filter by phase`,
	Run: func(cmd *cobra.Command, args []string) {
		listArtifactsCmd.Run(cmd, args)
	},
}

var listArtifactsCmd = &cobra.Command{
	Use:   "list",
	Short: "List all artifact types",
	Long:  `List all EPF artifact types with their available resources.`,
	Run: func(cmd *cobra.Command, args []string) {
		// Get paths
		schemasPath, err := GetSchemasDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		epfRoot, err := GetEPFRoot()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Load schemas
		val, err := validator.NewValidator(schemasPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading schemas: %v\n", err)
			os.Exit(1)
		}
		schemaLoader := val.GetLoader()

		// Load templates
		templateLoader := template.NewLoader(epfRoot)
		_ = templateLoader.Load() // Ignore error - some templates may not exist

		// Load definitions (for example counts)
		defLoader := template.NewDefinitionLoader(epfRoot)
		_ = defLoader.Load() // Ignore error - some definitions may not exist

		// Build artifact info list
		var artifacts []ArtifactInfo

		// Get all schema types
		schemas := schemaLoader.ListSchemas()
		for _, s := range schemas {
			info := ArtifactInfo{
				Type:        string(s.ArtifactType),
				Phase:       string(s.Phase),
				Description: s.Description,
				HasSchema:   true,
				HasTemplate: templateLoader.HasTemplate(s.ArtifactType),
			}

			// Check for examples (feature_definition has product examples)
			if s.ArtifactType == schema.ArtifactFeatureDefinition {
				exampleCount := defLoader.DefinitionCountByTrack(template.TrackProduct)
				if exampleCount > 0 {
					info.HasExamples = true
					info.ExampleCount = exampleCount
				}
			}

			artifacts = append(artifacts, info)
		}

		// Sort by phase, then by type
		sort.Slice(artifacts, func(i, j int) bool {
			if artifacts[i].Phase != artifacts[j].Phase {
				phaseOrder := map[string]int{
					"READY": 1,
					"FIRE":  2,
					"AIM":   3,
					"":      4,
				}
				return phaseOrder[artifacts[i].Phase] < phaseOrder[artifacts[j].Phase]
			}
			return artifacts[i].Type < artifacts[j].Type
		})

		// Filter by phase if specified
		phaseFilter, _ := cmd.Flags().GetString("phase")
		if phaseFilter != "" {
			var filtered []ArtifactInfo
			for _, a := range artifacts {
				if a.Phase == phaseFilter {
					filtered = append(filtered, a)
				}
			}
			artifacts = filtered
		}

		// Output format
		jsonOutput, _ := cmd.Flags().GetBool("json")
		if jsonOutput {
			output := map[string]interface{}{
				"artifacts": artifacts,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			enc.Encode(output)
			return
		}

		// Human-readable output
		fmt.Println("EPF Artifact Types")
		fmt.Println("==================")
		fmt.Println()
		fmt.Printf("%-25s %-7s %-8s %-10s %s\n", "TYPE", "PHASE", "SCHEMA", "TEMPLATE", "NOTES")
		fmt.Printf("%-25s %-7s %-8s %-10s %s\n", "----", "-----", "------", "--------", "-----")

		currentPhase := ""
		for _, a := range artifacts {
			if a.Phase != currentPhase {
				currentPhase = a.Phase
				if currentPhase != "" {
					fmt.Println()
				}
			}

			schemaStatus := "-"
			if a.HasSchema {
				schemaStatus = "yes"
			}

			templateStatus := "-"
			if a.HasTemplate {
				templateStatus = "yes"
			}

			notes := ""
			if a.HasExamples {
				notes = fmt.Sprintf("%d examples available", a.ExampleCount)
			}

			phase := a.Phase
			if phase == "" {
				phase = "Other"
			}

			fmt.Printf("%-25s %-7s %-8s %-10s %s\n", a.Type, phase, schemaStatus, templateStatus, notes)
		}

		fmt.Println()
		fmt.Printf("Total: %d artifact types\n", len(artifacts))
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  epf-cli schemas show <type>      # View JSON Schema")
		fmt.Println("  epf-cli templates show <type>    # View YAML template")
		fmt.Println("  epf-cli definitions list         # View track definitions")
	},
}

func init() {
	rootCmd.AddCommand(artifactsCmd)
	artifactsCmd.AddCommand(listArtifactsCmd)

	listArtifactsCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM)")
	listArtifactsCmd.Flags().Bool("json", false, "output as JSON")
}
