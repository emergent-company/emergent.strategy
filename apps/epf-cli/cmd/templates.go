package cmd

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/spf13/cobra"
)

var templatesCmd = &cobra.Command{
	Use:   "templates",
	Short: "List and show EPF templates",
	Long: `Manage EPF templates for artifact creation.

Templates provide starting structures for writing EPF artifacts.
AI agents use these as the foundation when creating new artifacts.

Examples:
  epf-cli templates list                    # List all templates
  epf-cli templates list --phase READY      # List READY phase templates
  epf-cli templates show north_star         # Show the north_star template
  epf-cli templates show feature_definition # Show the feature definition template`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listTemplatesCmd.Run(cmd, args)
	},
}

var listTemplatesCmd = &cobra.Command{
	Use:   "list",
	Short: "List available templates",
	Long: `List all available EPF templates.

Templates are organized by phase (READY, FIRE, AIM) and provide
starting structures for creating EPF artifacts.`,
	Run: func(cmd *cobra.Command, args []string) {
		epfRoot, err := GetEPFRoot()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		loader := template.NewLoader(epfRoot)
		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading templates: %v\n", err)
			os.Exit(1)
		}

		templates := loader.ListTemplates()

		// Sort by phase, then by name
		sort.Slice(templates, func(i, j int) bool {
			if templates[i].Phase != templates[j].Phase {
				phaseOrder := map[schema.Phase]int{
					schema.PhaseREADY: 1,
					schema.PhaseFIRE:  2,
					schema.PhaseAIM:   3,
					"":                4,
				}
				return phaseOrder[templates[i].Phase] < phaseOrder[templates[j].Phase]
			}
			return templates[i].Name < templates[j].Name
		})

		// Filter by phase if specified
		phaseFilter, _ := cmd.Flags().GetString("phase")
		if phaseFilter != "" {
			var filtered []*template.TemplateInfo
			for _, t := range templates {
				if string(t.Phase) == phaseFilter {
					filtered = append(filtered, t)
				}
			}
			templates = filtered
		}

		fmt.Printf("EPF Templates (loaded from %s)\n\n", epfRoot)

		currentPhase := ""
		for _, t := range templates {
			phase := string(t.Phase)
			if phase == "" {
				phase = "Other"
			}
			if phase != currentPhase {
				currentPhase = phase
				fmt.Printf("## %s Phase\n\n", phase)
			}
			fmt.Printf("  %-25s %s\n", t.ArtifactType, t.Name)
			fmt.Printf("  %-25s %s\n", "", t.Description)
			fmt.Println()
		}

		fmt.Printf("Total: %d templates\n", len(templates))
	},
}

var showTemplateCmd = &cobra.Command{
	Use:   "show <artifact_type>",
	Short: "Show a specific template",
	Long: `Display the full content of a template.

This shows the YAML template that AI agents use as a starting point
for creating new EPF artifacts.

Examples:
  epf-cli templates show north_star
  epf-cli templates show feature_definition
  epf-cli templates show value_model`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		epfRoot, err := GetEPFRoot()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		loader := template.NewLoader(epfRoot)
		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading templates: %v\n", err)
			os.Exit(1)
		}

		templateInfo, err := loader.GetTemplateByName(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintln(os.Stderr, "\nAvailable templates:")
			for _, t := range loader.ListTemplates() {
				fmt.Fprintf(os.Stderr, "  %s\n", t.ArtifactType)
			}
			os.Exit(1)
		}

		// Check if we should show just content or with metadata
		contentOnly, _ := cmd.Flags().GetBool("content-only")
		if contentOnly {
			fmt.Print(templateInfo.Content)
			return
		}

		// Print metadata header
		fmt.Printf("# Template: %s\n", templateInfo.Name)
		fmt.Printf("# Artifact Type: %s\n", templateInfo.ArtifactType)
		fmt.Printf("# Phase: %s\n", templateInfo.Phase)
		fmt.Printf("# Schema: %s\n", templateInfo.SchemaFile)
		fmt.Printf("# Description: %s\n", templateInfo.Description)
		fmt.Printf("# Usage: %s\n", templateInfo.UsageHint)
		fmt.Printf("# File: %s\n", templateInfo.FilePath)
		fmt.Println("#")
		fmt.Println("# --- Template Content ---")
		fmt.Println()
		fmt.Print(templateInfo.Content)
	},
}

// GetEPFRoot returns the EPF root directory
func GetEPFRoot() (string, error) {
	// Try from detected context
	if epfContext != nil && epfContext.EPFRoot != "" {
		if _, err := os.Stat(epfContext.EPFRoot); err == nil {
			return epfContext.EPFRoot, nil
		}
	}

	// Try from config
	if cliConfig != nil && cliConfig.CanonicalPath != "" {
		if _, err := os.Stat(cliConfig.CanonicalPath); err == nil {
			return cliConfig.CanonicalPath, nil
		}
	}

	// Try to find from schemas dir
	schemasPath, err := GetSchemasDir()
	if err == nil {
		// Schemas dir is typically EPF_ROOT/schemas, so go up one level
		epfRoot := strings.TrimSuffix(schemasPath, "/schemas")
		epfRoot = strings.TrimSuffix(epfRoot, "\\schemas")
		if _, err := os.Stat(epfRoot); err == nil {
			return epfRoot, nil
		}
	}

	return "", fmt.Errorf("could not find EPF root directory. Use --schemas-dir to specify the path")
}

func init() {
	rootCmd.AddCommand(templatesCmd)
	templatesCmd.AddCommand(listTemplatesCmd)
	templatesCmd.AddCommand(showTemplateCmd)

	listTemplatesCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM)")
	showTemplateCmd.Flags().Bool("content-only", false, "show only the template content without metadata")
}
