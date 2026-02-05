package cmd

import (
	"fmt"
	"os"
	"sort"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/template"
	"github.com/spf13/cobra"
)

var definitionsCmd = &cobra.Command{
	Use:   "definitions",
	Short: "List and show EPF track definitions",
	Long: `Manage EPF track definitions.

Definitions describe features and processes across the four EPF tracks:
  - Product:    Feature definitions (EXAMPLES - each product is unique)
  - Strategy:   Strategic planning definitions (CANONICAL - adopt directly)
  - OrgOps:     Organizational process definitions (CANONICAL - adopt directly)
  - Commercial: Go-to-market definitions (CANONICAL - adopt directly)

Product definitions are examples showing quality patterns.
Strategy/OrgOps/Commercial definitions are canonical and meant to be adopted.

Examples:
  epf-cli definitions list                          # List all definitions
  epf-cli definitions list --track product          # List product examples
  epf-cli definitions list --track org_ops          # List canonical OrgOps definitions
  epf-cli definitions list --track org_ops --category financial-legal
  epf-cli definitions show pd-005                   # Show a specific definition
  epf-cli definitions show fd-002                   # Show a product example`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listDefinitionsCmd.Run(cmd, args)
	},
}

var listDefinitionsCmd = &cobra.Command{
	Use:   "list",
	Short: "List available definitions",
	Long: `List EPF track definitions.

Definitions are organized by track and category:
  - Product track (fd-*):    Examples showing quality patterns
  - Strategy track (sd-*):   Canonical strategic definitions
  - OrgOps track (pd-*):     Canonical process definitions
  - Commercial track (cd-*): Canonical commercial definitions`,
	Run: func(cmd *cobra.Command, args []string) {
		epfRoot, err := GetEPFRoot()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		loader := template.NewDefinitionLoader(epfRoot)
		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading definitions: %v\n", err)
			os.Exit(1)
		}

		// Get filters
		trackFilter, _ := cmd.Flags().GetString("track")
		categoryFilter, _ := cmd.Flags().GetString("category")

		var trackPtr *template.Track
		var categoryPtr *string

		if trackFilter != "" {
			track, err := template.TrackFromString(trackFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				fmt.Fprintln(os.Stderr, "Valid tracks: product, strategy, org_ops, commercial")
				os.Exit(1)
			}
			trackPtr = &track
		}

		if categoryFilter != "" {
			categoryPtr = &categoryFilter
		}

		definitions := loader.ListDefinitions(trackPtr, categoryPtr)

		if trackPtr != nil {
			// Show single track
			printTrackDefinitions(*trackPtr, definitions, loader)
		} else {
			// Show all tracks
			fmt.Printf("EPF Definitions (loaded from %s)\n\n", epfRoot)
			for _, track := range template.AllTracks() {
				trackDefs := loader.ListDefinitionsByTrack(track)
				if len(trackDefs) > 0 {
					printTrackDefinitions(track, trackDefs, loader)
					fmt.Println()
				}
			}
		}

		fmt.Printf("Total: %d definitions\n", len(definitions))
	},
}

func printTrackDefinitions(track template.Track, definitions []*template.DefinitionInfo, loader *template.DefinitionLoader) {
	description, defType := template.GetTrackDescription(track)

	fmt.Printf("## %s Track (%s)\n", formatTrackName(track), defType)
	fmt.Printf("%s\n\n", description)

	// Get categories for this track
	categories := loader.GetCategories(track)
	if len(categories) > 0 {
		fmt.Println("Categories:")
		for _, cat := range categories {
			fmt.Printf("  - %s (%d definitions)\n", cat.Name, cat.Count)
		}
		fmt.Println()
	}

	// Group definitions by category
	byCategory := make(map[string][]*template.DefinitionInfo)
	for _, def := range definitions {
		cat := def.Category
		if cat == "" {
			cat = "(uncategorized)"
		}
		byCategory[cat] = append(byCategory[cat], def)
	}

	// Sort category names
	var categoryNames []string
	for cat := range byCategory {
		categoryNames = append(categoryNames, cat)
	}
	sort.Strings(categoryNames)

	// Print definitions by category
	for _, cat := range categoryNames {
		defs := byCategory[cat]
		fmt.Printf("### %s\n\n", cat)
		for _, def := range defs {
			fmt.Printf("  %-12s %s\n", def.ID, def.Name)
		}
		fmt.Println()
	}
}

func formatTrackName(track template.Track) string {
	switch track {
	case template.TrackProduct:
		return "Product"
	case template.TrackStrategy:
		return "Strategy"
	case template.TrackOrgOps:
		return "OrgOps"
	case template.TrackCommercial:
		return "Commercial"
	default:
		return string(track)
	}
}

var showDefinitionCmd = &cobra.Command{
	Use:   "show <id>",
	Short: "Show a specific definition",
	Long: `Display the full content of a definition.

For product definitions (fd-*), this shows an EXAMPLE to learn from.
For other tracks (sd-*, pd-*, cd-*), this shows a CANONICAL definition to adopt.

Examples:
  epf-cli definitions show fd-002   # Product example
  epf-cli definitions show pd-005   # Canonical OrgOps definition
  epf-cli definitions show sd-015   # Canonical Strategy definition
  epf-cli definitions show cd-001   # Canonical Commercial definition`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		epfRoot, err := GetEPFRoot()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		loader := template.NewDefinitionLoader(epfRoot)
		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading definitions: %v\n", err)
			os.Exit(1)
		}

		def, err := loader.GetDefinition(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintln(os.Stderr, "\nUse 'epf-cli definitions list' to see available definitions.")
			os.Exit(1)
		}

		// Check if we should show just content or with metadata
		contentOnly, _ := cmd.Flags().GetBool("content-only")
		if contentOnly {
			fmt.Print(def.Content)
			return
		}

		// Print metadata header
		fmt.Printf("# Definition: %s\n", def.Name)
		fmt.Printf("# ID: %s\n", def.ID)
		fmt.Printf("# Track: %s\n", formatTrackName(def.Track))
		fmt.Printf("# Type: %s\n", def.Type)
		if def.Category != "" {
			fmt.Printf("# Category: %s\n", def.Category)
		}
		fmt.Printf("# Description: %s\n", def.Description)
		fmt.Printf("# Usage: %s\n", def.UsageHint)
		fmt.Printf("# File: %s\n", def.FilePath)
		fmt.Println("#")
		fmt.Println("# --- Definition Content ---")
		fmt.Println()
		fmt.Print(def.Content)
	},
}

func init() {
	rootCmd.AddCommand(definitionsCmd)
	definitionsCmd.AddCommand(listDefinitionsCmd)
	definitionsCmd.AddCommand(showDefinitionCmd)

	listDefinitionsCmd.Flags().StringP("track", "t", "", "filter by track (product, strategy, org_ops, commercial)")
	listDefinitionsCmd.Flags().String("category", "", "filter by category")
	showDefinitionCmd.Flags().Bool("content-only", false, "show only the definition content without metadata")
}
