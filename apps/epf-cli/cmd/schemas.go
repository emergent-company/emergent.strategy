package cmd

import (
	"fmt"
	"os"
	"sort"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
)

var schemasCmd = &cobra.Command{
	Use:   "schemas",
	Short: "List available EPF schemas",
	Long: `List all available EPF schemas that have been loaded from the schemas directory.

This shows all artifact types, their schema files, phases, and descriptions.

Examples:
  epf-cli schemas                           # List all schemas
  epf-cli schemas --phase READY             # List only READY phase schemas
  epf-cli schemas --json                    # Output as JSON`,
	Run: func(cmd *cobra.Command, args []string) {
		// Get schemas directory
		schemasPath, err := GetSchemasDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Create validator (which loads schemas)
		val, err := validator.NewValidator(schemasPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading schemas: %v\n", err)
			os.Exit(1)
		}

		loader := val.GetLoader()
		schemas := loader.ListSchemas()

		// Sort by phase, then by artifact type
		sort.Slice(schemas, func(i, j int) bool {
			if schemas[i].Phase != schemas[j].Phase {
				phaseOrder := map[schema.Phase]int{
					schema.PhaseREADY: 1,
					schema.PhaseFIRE:  2,
					schema.PhaseAIM:   3,
					"":                4,
				}
				return phaseOrder[schemas[i].Phase] < phaseOrder[schemas[j].Phase]
			}
			return schemas[i].ArtifactType < schemas[j].ArtifactType
		})

		// Filter by phase if specified
		phaseFilter, _ := cmd.Flags().GetString("phase")
		if phaseFilter != "" {
			var filtered []*schema.SchemaInfo
			for _, s := range schemas {
				if string(s.Phase) == phaseFilter {
					filtered = append(filtered, s)
				}
			}
			schemas = filtered
		}

		// Print schemas
		fmt.Printf("EPF Schemas (loaded from %s)\n\n", schemasPath)

		currentPhase := ""
		for _, s := range schemas {
			phase := string(s.Phase)
			if phase == "" {
				phase = "Other"
			}
			if phase != currentPhase {
				currentPhase = phase
				fmt.Printf("## %s Phase\n\n", phase)
			}
			fmt.Printf("  %-30s %s\n", s.ArtifactType, s.SchemaFile)
			if s.Description != "" {
				fmt.Printf("  %-30s %s\n", "", s.Description)
			}
		}

		fmt.Printf("\nTotal: %d schemas\n", len(schemas))
	},
}

func init() {
	rootCmd.AddCommand(schemasCmd)
	schemasCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM)")
}
