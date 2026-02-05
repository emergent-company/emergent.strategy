package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/embedded"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/generator"
	"github.com/spf13/cobra"
)

var generatorsCmd = &cobra.Command{
	Use:   "generators",
	Short: "List, show, and manage EPF output generators",
	Long: `Manage EPF output generators.

Generators are templates and instructions for creating output artifacts
from EPF data. They include wizard instructions, validation schemas,
and output templates.

Generator Sources (in priority order):
  1. Instance - Instance-local generators (can override framework)
  2. Framework - Canonical EPF generators (docs/EPF/outputs/)
  3. Global - User's global generators (~/.epf-cli/generators/)

Categories:
  - compliance: Regulatory/compliance documents (SkatteFUNN, etc.)
  - marketing: Marketing materials and positioning
  - investor: Investor communications and reports
  - internal: Internal documentation and context sheets
  - development: Engineering briefs and technical specs
  - custom: Custom generators

Examples:
  epf-cli generators list                          # List all generators
  epf-cli generators list --category compliance    # Filter by category
  epf-cli generators list --source framework       # Filter by source
  epf-cli generators show context-sheet            # Show generator details
  epf-cli generators show context-sheet --wizard   # Show wizard instructions`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listGeneratorsCmd.Run(cmd, args)
	},
}

var listGeneratorsCmd = &cobra.Command{
	Use:   "list",
	Short: "List available generators",
	Long: `List all available EPF output generators.

Generators are organized by category and source location.`,
	Run: func(cmd *cobra.Command, args []string) {
		var loader *generator.Loader
		var sourceLabel string

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded generators
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		sourceLabel = loader.Source()
		if sourceLabel == "" && epfRoot != "" {
			sourceLabel = epfRoot
		}

		if !loader.HasGenerators() {
			fmt.Println("No generators found.")
			if epfRoot != "" {
				fmt.Printf("Expected location: %s/outputs/\n", epfRoot)
			}
			return
		}

		// Parse filters
		categoryFilter, _ := cmd.Flags().GetString("category")
		sourceFilter, _ := cmd.Flags().GetString("source")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		var categoryPtr *generator.GeneratorCategory
		if categoryFilter != "" {
			cat, err := generator.CategoryFromString(categoryFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid category '%s'. Valid categories: compliance, marketing, investor, internal, development, custom\n", categoryFilter)
				os.Exit(1)
			}
			categoryPtr = &cat
		}

		var sourcePtr *generator.GeneratorSource
		if sourceFilter != "" {
			switch strings.ToLower(sourceFilter) {
			case "instance":
				src := generator.SourceInstance
				sourcePtr = &src
			case "framework":
				src := generator.SourceFramework
				sourcePtr = &src
			case "global":
				src := generator.SourceGlobal
				sourcePtr = &src
			default:
				fmt.Fprintf(os.Stderr, "Invalid source '%s'. Valid sources: instance, framework, global\n", sourceFilter)
				os.Exit(1)
			}
		}

		generators := loader.ListGenerators(categoryPtr, sourcePtr)

		if jsonOutput {
			printGeneratorsJSON(generators)
			return
		}

		fmt.Printf("EPF Output Generators (loaded from %s)\n\n", sourceLabel)

		if categoryFilter != "" {
			fmt.Printf("Filtered by category: %s\n", categoryFilter)
		}
		if sourceFilter != "" {
			fmt.Printf("Filtered by source: %s\n", sourceFilter)
		}
		if categoryFilter != "" || sourceFilter != "" {
			fmt.Println()
		}

		// Group by source
		bySource := make(map[generator.GeneratorSource][]*generator.GeneratorInfo)
		for _, gen := range generators {
			bySource[gen.Source] = append(bySource[gen.Source], gen)
		}

		// Sort sources by priority
		sources := []generator.GeneratorSource{
			generator.SourceInstance,
			generator.SourceFramework,
			generator.SourceGlobal,
		}

		for _, src := range sources {
			gens := bySource[src]
			if len(gens) == 0 {
				continue
			}

			// Sort generators by name
			sort.Slice(gens, func(i, j int) bool {
				return gens[i].Name < gens[j].Name
			})

			fmt.Printf("## %s\n\n", src.String())

			for _, gen := range gens {
				categoryIcon := getCategoryIcon(gen.Category)

				// Show files available
				files := []string{}
				if gen.HasWizard {
					files = append(files, "wizard")
				}
				if gen.HasSchema {
					files = append(files, "schema")
				}
				if gen.HasValidator {
					files = append(files, "validator")
				}
				if gen.HasTemplate {
					files = append(files, "template")
				}
				filesStr := strings.Join(files, ", ")

				fmt.Printf("  %s %-25s %s\n", categoryIcon, gen.Name, gen.Category.String())
				if gen.Description != "" {
					// Truncate long descriptions
					desc := gen.Description
					if len(desc) > 70 {
						desc = desc[:67] + "..."
					}
					fmt.Printf("     %s\n", desc)
				}
				if len(files) > 0 {
					fmt.Printf("     Files: %s\n", filesStr)
				}
				if len(gen.Regions) > 0 {
					fmt.Printf("     Regions: %s\n", strings.Join(gen.Regions, ", "))
				}
				fmt.Println()
			}
		}

		fmt.Println("---")
		printCategoryLegend()
		fmt.Printf("Total: %d generators\n", len(generators))
	},
}

func getCategoryIcon(cat generator.GeneratorCategory) string {
	switch cat {
	case generator.CategoryCompliance:
		return "📋"
	case generator.CategoryMarketing:
		return "📢"
	case generator.CategoryInvestor:
		return "💼"
	case generator.CategoryInternal:
		return "📄"
	case generator.CategoryDevelopment:
		return "🛠️"
	case generator.CategoryCustom:
		return "⚙️"
	default:
		return "📦"
	}
}

func printCategoryLegend() {
	fmt.Println("📋 = compliance, 📢 = marketing, 💼 = investor, 📄 = internal, 🛠️ = development, ⚙️ = custom")
}

func printGeneratorsJSON(generators []*generator.GeneratorInfo) {
	type genItem struct {
		Name              string   `json:"name"`
		Version           string   `json:"version,omitempty"`
		Description       string   `json:"description,omitempty"`
		Category          string   `json:"category"`
		Source            string   `json:"source"`
		OutputFormat      string   `json:"output_format,omitempty"`
		RequiredArtifacts []string `json:"required_artifacts,omitempty"`
		OptionalArtifacts []string `json:"optional_artifacts,omitempty"`
		Regions           []string `json:"regions,omitempty"`
		HasWizard         bool     `json:"has_wizard"`
		HasSchema         bool     `json:"has_schema"`
		HasValidator      bool     `json:"has_validator"`
		HasTemplate       bool     `json:"has_template"`
	}

	items := make([]genItem, 0, len(generators))
	for _, gen := range generators {
		items = append(items, genItem{
			Name:              gen.Name,
			Version:           gen.Version,
			Description:       gen.Description,
			Category:          string(gen.Category),
			Source:            string(gen.Source),
			OutputFormat:      string(gen.OutputFormat),
			RequiredArtifacts: gen.RequiredArtifacts,
			OptionalArtifacts: gen.OptionalArtifacts,
			Regions:           gen.Regions,
			HasWizard:         gen.HasWizard,
			HasSchema:         gen.HasSchema,
			HasValidator:      gen.HasValidator,
			HasTemplate:       gen.HasTemplate,
		})
	}

	jsonBytes, _ := json.MarshalIndent(items, "", "  ")
	fmt.Println(string(jsonBytes))
}

var showGeneratorCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Show a specific generator",
	Long: `Display the full content and metadata of a generator.

This shows the generator details including wizard instructions that AI
agents use to create output artifacts from EPF data.

Examples:
  epf-cli generators show context-sheet
  epf-cli generators show skattefunn-application
  epf-cli generators show development-brief --wizard`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var loader *generator.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded generators
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		content, err := loader.GetGeneratorContent(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Check output format flags
		wizardOnly, _ := cmd.Flags().GetBool("wizard")
		schemaOnly, _ := cmd.Flags().GetBool("schema")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		if jsonOutput {
			printGeneratorContentJSON(content)
			return
		}

		if wizardOnly {
			if content.Wizard == "" {
				fmt.Fprintf(os.Stderr, "Generator '%s' has no wizard instructions\n", args[0])
				os.Exit(1)
			}
			fmt.Print(content.Wizard)
			return
		}

		if schemaOnly {
			if content.Schema == "" {
				fmt.Fprintf(os.Stderr, "Generator '%s' has no schema\n", args[0])
				os.Exit(1)
			}
			fmt.Print(content.Schema)
			return
		}

		// Print full generator info
		printGeneratorInfo(content)
	},
}

func printGeneratorInfo(content *generator.GeneratorContent) {
	gen := content.GeneratorInfo

	fmt.Printf("# Generator: %s\n", gen.Name)
	fmt.Printf("# Version: %s\n", gen.Version)
	fmt.Printf("# Category: %s\n", gen.Category.String())
	fmt.Printf("# Source: %s\n", gen.Source.String())
	if gen.Description != "" {
		fmt.Printf("# Description: %s\n", gen.Description)
	}
	if gen.Author != "" {
		fmt.Printf("# Author: %s\n", gen.Author)
	}
	if len(gen.Regions) > 0 {
		fmt.Printf("# Regions: %s\n", strings.Join(gen.Regions, ", "))
	}
	fmt.Printf("# Path: %s\n", gen.Path)
	fmt.Println("#")

	// Requirements
	if len(gen.RequiredArtifacts) > 0 {
		fmt.Printf("# Required Artifacts: %s\n", strings.Join(gen.RequiredArtifacts, ", "))
	}
	if len(gen.OptionalArtifacts) > 0 {
		fmt.Printf("# Optional Artifacts: %s\n", strings.Join(gen.OptionalArtifacts, ", "))
	}

	// Output format
	if gen.OutputFormat != "" {
		fmt.Printf("# Output Format: %s\n", gen.OutputFormat)
	}

	// Available files
	fmt.Println("#")
	fmt.Println("# Available Files:")
	if gen.HasManifest {
		fmt.Println("#   ✓ generator.yaml (manifest)")
	}
	if gen.HasWizard {
		fmt.Printf("#   ✓ %s (wizard instructions)\n", gen.WizardFile)
	}
	if gen.HasSchema {
		fmt.Printf("#   ✓ %s (output schema)\n", gen.SchemaFile)
	}
	if gen.HasValidator {
		fmt.Printf("#   ✓ %s (validator script)\n", gen.ValidatorFile)
	}
	if gen.HasTemplate {
		fmt.Printf("#   ✓ %s (output template)\n", gen.TemplateFile)
	}

	fmt.Println("#")
	fmt.Println("# --- Generator Manifest ---")
	fmt.Println()

	if content.Manifest != "" {
		fmt.Println(content.Manifest)
	} else {
		fmt.Println("(No manifest file)")
	}

	// Show usage hints
	fmt.Println()
	fmt.Println("# Usage:")
	if gen.HasWizard {
		fmt.Printf("#   epf-cli generators show %s --wizard  # View wizard instructions\n", gen.Name)
	}
	if gen.HasSchema {
		fmt.Printf("#   epf-cli generators show %s --schema  # View output schema\n", gen.Name)
	}
}

func printGeneratorContentJSON(content *generator.GeneratorContent) {
	gen := content.GeneratorInfo

	response := struct {
		Name              string   `json:"name"`
		Version           string   `json:"version,omitempty"`
		Description       string   `json:"description,omitempty"`
		Category          string   `json:"category"`
		Source            string   `json:"source"`
		Author            string   `json:"author,omitempty"`
		Regions           []string `json:"regions,omitempty"`
		Path              string   `json:"path"`
		OutputFormat      string   `json:"output_format,omitempty"`
		RequiredArtifacts []string `json:"required_artifacts,omitempty"`
		OptionalArtifacts []string `json:"optional_artifacts,omitempty"`
		HasManifest       bool     `json:"has_manifest"`
		HasWizard         bool     `json:"has_wizard"`
		HasSchema         bool     `json:"has_schema"`
		HasValidator      bool     `json:"has_validator"`
		HasTemplate       bool     `json:"has_template"`
		Manifest          string   `json:"manifest,omitempty"`
		Wizard            string   `json:"wizard,omitempty"`
		Schema            string   `json:"schema,omitempty"`
		Validator         string   `json:"validator,omitempty"`
		Template          string   `json:"template,omitempty"`
		Readme            string   `json:"readme,omitempty"`
	}{
		Name:              gen.Name,
		Version:           gen.Version,
		Description:       gen.Description,
		Category:          string(gen.Category),
		Source:            string(gen.Source),
		Author:            gen.Author,
		Regions:           gen.Regions,
		Path:              gen.Path,
		OutputFormat:      string(gen.OutputFormat),
		RequiredArtifacts: gen.RequiredArtifacts,
		OptionalArtifacts: gen.OptionalArtifacts,
		HasManifest:       gen.HasManifest,
		HasWizard:         gen.HasWizard,
		HasSchema:         gen.HasSchema,
		HasValidator:      gen.HasValidator,
		HasTemplate:       gen.HasTemplate,
		Manifest:          content.Manifest,
		Wizard:            content.Wizard,
		Schema:            content.Schema,
		Validator:         content.Validator,
		Template:          content.Template,
		Readme:            content.Readme,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var checkGeneratorCmd = &cobra.Command{
	Use:   "check <name>",
	Short: "Check if prerequisites are met for a generator",
	Long: `Check if the current EPF instance has the required artifacts
for running a specific generator.

This helps ensure you have all the necessary EPF data before
attempting to generate output.

Examples:
  epf-cli generators check context-sheet
  epf-cli generators check skattefunn-application`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var loader *generator.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded generators
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		gen, err := loader.GetGenerator(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		jsonOutput, _ := cmd.Flags().GetBool("json")

		// Check if we have an instance to check against
		instancePath := ""
		if epfContext != nil && epfContext.InstancePath != "" {
			instancePath = epfContext.InstancePath
		}

		if instancePath == "" {
			if jsonOutput {
				fmt.Println(`{"ready": false, "error": "No EPF instance detected. Use --instance to specify one."}`)
			} else {
				fmt.Fprintln(os.Stderr, "No EPF instance detected. Use --instance to specify one.")
			}
			os.Exit(1)
		}

		// Check prerequisites (simplified - just check file existence)
		result := checkGeneratorPrerequisites(gen, instancePath)

		if jsonOutput {
			jsonBytes, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(jsonBytes))
			return
		}

		fmt.Printf("Generator: %s\n", gen.Name)
		fmt.Printf("Instance: %s\n", instancePath)
		fmt.Println()

		if result.Ready {
			fmt.Println("✅ Ready - all required artifacts are present")
		} else {
			fmt.Println("❌ Not ready - missing required artifacts:")
			for _, missing := range result.MissingArtifacts {
				fmt.Printf("  - %s\n", missing)
			}
		}

		if len(result.IncompleteArtifacts) > 0 {
			fmt.Println()
			fmt.Println("⚠️  Incomplete artifacts (present but may need work):")
			for _, incomplete := range result.IncompleteArtifacts {
				fmt.Printf("  - %s\n", incomplete)
			}
		}

		if len(result.Suggestions) > 0 {
			fmt.Println()
			fmt.Println("💡 Suggestions:")
			for _, suggestion := range result.Suggestions {
				fmt.Printf("  %s\n", suggestion)
			}
		}

		if !result.Ready {
			os.Exit(1)
		}
	},
}

func checkGeneratorPrerequisites(gen *generator.GeneratorInfo, instancePath string) *generator.PrerequisiteResult {
	result := &generator.PrerequisiteResult{
		Ready: true,
	}

	// Map artifact types to file patterns
	artifactPatterns := map[string][]string{
		"north_star":          {"00_north_star.yaml"},
		"strategy_formula":    {"04_strategy_formula.yaml"},
		"roadmap_recipe":      {"05_roadmap_recipe.yaml"},
		"value_models":        {"FIRE/value_models/*.yaml", "value_models/*.yaml"},
		"feature_definitions": {"FIRE/feature_definitions/*.yaml", "feature_definitions/*.yaml"},
	}

	for _, required := range gen.RequiredArtifacts {
		patterns, ok := artifactPatterns[required]
		if !ok {
			continue
		}

		found := false
		for _, pattern := range patterns {
			fullPattern := fmt.Sprintf("%s/%s", instancePath, pattern)
			matches, err := filepath.Glob(fullPattern)
			if err == nil && len(matches) > 0 {
				found = true
				break
			}
		}

		if !found {
			result.Ready = false
			result.MissingArtifacts = append(result.MissingArtifacts, required)
		}
	}

	// Add suggestions based on missing artifacts
	if len(result.MissingArtifacts) > 0 {
		result.Suggestions = append(result.Suggestions,
			"Run appropriate EPF wizards to create missing artifacts")
		result.Suggestions = append(result.Suggestions,
			"Use 'epf-cli wizards recommend \"create <artifact>\"' for guidance")
	}

	return result
}

var validateGeneratorCmd = &cobra.Command{
	Use:   "validate <generator> <file>",
	Short: "Validate generator output against its schema",
	Long: `Validate a generator output file against its schema and optionally run
the bash validator script.

This implements the "Agent as Writer, Tool as Linter" pattern where AI agents
generate output and this tool validates it against the generator's schema.

Validation Layers:
  1. Schema Validation - Validates JSON/YAML structure against schema.json
  2. Bash Validator (optional) - Runs validator.sh for custom validation logic

Examples:
  epf-cli generators validate context-sheet output.md
  epf-cli generators validate context-sheet output.md --bash
  epf-cli generators validate skattefunn-application report.json --json`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		generatorName := args[0]
		filePath := args[1]

		var loader *generator.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			// Fall back to embedded generators
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		// Get flags
		runBash, _ := cmd.Flags().GetBool("bash")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		// Create validator and validate
		validator := generator.NewOutputValidator(loader)
		result, err := validator.ValidateFile(context.Background(), generatorName, filePath, runBash)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if jsonOutput {
			printValidationResultJSON(generatorName, filePath, result)
			return
		}

		// Human-readable output
		fmt.Printf("Generator: %s\n", generatorName)
		fmt.Printf("File: %s\n", filePath)
		fmt.Println()

		if result.Valid {
			fmt.Println("✅ Valid - output conforms to generator schema")
		} else {
			fmt.Println("❌ Invalid - validation errors found")
		}
		fmt.Println()

		// Show layer results
		for layerName, layer := range result.Layers {
			status := "✅"
			if !layer.Passed {
				status = "❌"
			}
			fmt.Printf("%s %s: %s\n", status, layer.Name, layerName)

			for _, e := range layer.Errors {
				fmt.Printf("   Error: %s\n", e)
			}
			for _, w := range layer.Warnings {
				fmt.Printf("   Warning: %s\n", w)
			}
		}

		// Show overall errors/warnings if not already shown in layers
		if len(result.Errors) > 0 && len(result.Layers) == 0 {
			fmt.Println("\nErrors:")
			for _, e := range result.Errors {
				fmt.Printf("  - %s\n", e)
			}
		}

		if len(result.Warnings) > 0 && len(result.Layers) == 0 {
			fmt.Println("\nWarnings:")
			for _, w := range result.Warnings {
				fmt.Printf("  - %s\n", w)
			}
		}

		if !result.Valid {
			os.Exit(1)
		}
	},
}

func printValidationResultJSON(generatorName, filePath string, result *generator.ValidationResult) {
	type layerResult struct {
		Name     string   `json:"name"`
		Passed   bool     `json:"passed"`
		Errors   []string `json:"errors,omitempty"`
		Warnings []string `json:"warnings,omitempty"`
	}

	type response struct {
		GeneratorName string                 `json:"generator_name"`
		FilePath      string                 `json:"file_path"`
		Valid         bool                   `json:"valid"`
		Errors        []string               `json:"errors,omitempty"`
		Warnings      []string               `json:"warnings,omitempty"`
		Layers        map[string]layerResult `json:"layers,omitempty"`
	}

	resp := response{
		GeneratorName: generatorName,
		FilePath:      filePath,
		Valid:         result.Valid,
		Errors:        result.Errors,
		Warnings:      result.Warnings,
		Layers:        make(map[string]layerResult),
	}

	for name, layer := range result.Layers {
		resp.Layers[name] = layerResult{
			Name:     layer.Name,
			Passed:   layer.Passed,
			Errors:   layer.Errors,
			Warnings: layer.Warnings,
		}
	}

	jsonBytes, _ := json.MarshalIndent(resp, "", "  ")
	fmt.Println(string(jsonBytes))
}

var scaffoldGeneratorCmd = &cobra.Command{
	Use:   "scaffold <name>",
	Short: "Create a new generator from template",
	Long: `Create a new EPF output generator with all required files.

This command scaffolds a complete generator structure including:
  - generator.yaml (manifest)
  - wizard.instructions.md (AI instructions)
  - schema.json (output validation schema)
  - validator.sh (validation script)
  - README.md (documentation)

The generator is created in the current instance's generators/ directory
by default, or in a custom location with --output.

Examples:
  epf-cli generators scaffold pitch-deck
  epf-cli generators scaffold seis-application --category compliance --region GB
  epf-cli generators scaffold team-brief --category internal`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		// Get flags
		description, _ := cmd.Flags().GetString("description")
		categoryStr, _ := cmd.Flags().GetString("category")
		author, _ := cmd.Flags().GetString("author")
		outputDir, _ := cmd.Flags().GetString("output")
		formatStr, _ := cmd.Flags().GetString("format")
		requiredStr, _ := cmd.Flags().GetStringSlice("requires")
		optionalStr, _ := cmd.Flags().GetStringSlice("optional")
		regionsStr, _ := cmd.Flags().GetStringSlice("region")

		// Parse category
		category := generator.CategoryCustom
		if categoryStr != "" {
			cat, err := generator.CategoryFromString(categoryStr)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid category '%s'. Valid: compliance, marketing, investor, internal, development, custom\n", categoryStr)
				os.Exit(1)
			}
			category = cat
		}

		// Parse output format
		outputFormat := generator.FormatMarkdown
		if formatStr != "" {
			switch strings.ToLower(formatStr) {
			case "markdown", "md":
				outputFormat = generator.FormatMarkdown
			case "json":
				outputFormat = generator.FormatJSON
			case "yaml":
				outputFormat = generator.FormatYAML
			case "html":
				outputFormat = generator.FormatHTML
			case "text", "txt":
				outputFormat = generator.FormatText
			default:
				fmt.Fprintf(os.Stderr, "Invalid format '%s'. Valid: markdown, json, yaml, html, text\n", formatStr)
				os.Exit(1)
			}
		}

		// Determine output directory
		if outputDir == "" {
			// Default to instance generators/ if we have context
			if epfContext != nil && epfContext.InstancePath != "" {
				outputDir = filepath.Join(epfContext.InstancePath, "generators")
			} else {
				// Fall back to current directory
				outputDir = "."
			}
		}

		// Default author
		if author == "" {
			author = "Custom"
		}

		// Protect canonical EPF from accidental writes
		if err := EnsurePathNotCanonical(outputDir, "scaffold generator"); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}

		opts := generator.ScaffoldOptions{
			Name:              name,
			Description:       description,
			Category:          category,
			Author:            author,
			OutputDir:         outputDir,
			RequiredArtifacts: requiredStr,
			OptionalArtifacts: optionalStr,
			OutputFormat:      outputFormat,
			Regions:           regionsStr,
		}

		result, err := generator.Scaffold(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error scaffolding generator: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("✅ Created generator: %s\n\n", name)
		fmt.Printf("Location: %s\n\n", result.GeneratorPath)
		fmt.Println("Files created:")
		for _, f := range result.FilesCreated {
			fmt.Printf("  - %s\n", f)
		}

		fmt.Println("\nNext steps:")
		for _, step := range result.NextSteps {
			fmt.Printf("  %s\n", step)
		}
	},
}

var copyGeneratorCmd = &cobra.Command{
	Use:   "copy <name> <destination>",
	Short: "Copy a generator to another location",
	Long: `Copy a generator to another EPF instance or to your global generators.

This allows you to share generators between product repos or make a generator
available globally across all your projects.

Destinations:
  global              Copy to ~/.epf-cli/generators/ (available everywhere)
  instance            Copy to current instance's generators/ directory
  <path>              Copy to a specific directory path

Examples:
  # Copy to global (available in all projects)
  epf-cli generators copy my-generator global

  # Copy to another instance
  epf-cli generators copy my-generator instance --to-instance /path/to/other/instance

  # Copy with a new name
  epf-cli generators copy context-sheet global --as my-context-sheet

  # Copy to a specific path
  epf-cli generators copy my-generator /path/to/destination`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		dest := args[1]

		var loader *generator.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		// Get flags
		newName, _ := cmd.Flags().GetString("as")
		toInstance, _ := cmd.Flags().GetString("to-instance")
		force, _ := cmd.Flags().GetBool("force")

		// Determine destination type
		opts := generator.CopyOptions{
			Name:    name,
			NewName: newName,
			Force:   force,
		}

		switch strings.ToLower(dest) {
		case "global":
			opts.Destination = generator.DestGlobal
		case "instance":
			opts.Destination = generator.DestInstance
			if toInstance != "" {
				opts.InstancePath = toInstance
			} else if epfContext != nil && epfContext.InstancePath != "" {
				opts.InstancePath = epfContext.InstancePath
			} else {
				fmt.Fprintln(os.Stderr, "Error: No instance detected. Use --to-instance to specify target instance.")
				os.Exit(1)
			}
		default:
			// Treat as path
			opts.Destination = generator.DestPath
			opts.DestinationPath = dest
		}

		result, err := loader.Copy(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Copied generator '%s' to %s\n", name, result.DestinationPath)
		fmt.Printf("Files copied: %d\n", len(result.FilesCopied))
		if result.NewName != name {
			fmt.Printf("Renamed to: %s\n", result.NewName)
		}
	},
}

var exportGeneratorCmd = &cobra.Command{
	Use:   "export <name>",
	Short: "Export a generator as a shareable archive",
	Long: `Export a generator as a .tar.gz archive for sharing.

This creates a portable archive that can be shared with team members,
uploaded to a repository, or installed in other environments.

Examples:
  # Export to current directory
  epf-cli generators export my-generator

  # Export to specific file
  epf-cli generators export my-generator -o /path/to/my-generator.tar.gz

  # Include README in export
  epf-cli generators export my-generator --include-readme`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		var loader *generator.Loader

		epfRoot, err := GetEPFRoot()
		if err != nil {
			if embedded.HasEmbeddedArtifacts() {
				loader = generator.NewEmbeddedLoader()
			} else {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		} else {
			loader = generator.NewLoader(epfRoot)
		}

		// Set instance root if available
		if epfContext != nil && epfContext.InstancePath != "" {
			loader.SetInstanceRoot(epfContext.InstancePath)
		}

		if err := loader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading generators: %v\n", err)
			os.Exit(1)
		}

		// Get flags
		outputPath, _ := cmd.Flags().GetString("output")
		includeReadme, _ := cmd.Flags().GetBool("include-readme")

		opts := generator.ExportOptions{
			Name:          name,
			OutputPath:    outputPath,
			IncludeReadme: includeReadme,
		}

		result, err := loader.Export(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Exported generator '%s'\n", name)
		fmt.Printf("Archive: %s\n", result.ArchivePath)
		fmt.Printf("Files: %d\n", len(result.FilesExported))
		fmt.Printf("Size: %d bytes\n", result.SizeBytes)
		fmt.Println("\nTo install this generator elsewhere:")
		fmt.Printf("  epf-cli generators install %s\n", result.ArchivePath)
	},
}

var installGeneratorCmd = &cobra.Command{
	Use:   "install <source>",
	Short: "Install a generator from an archive, URL, or directory",
	Long: `Install a generator from various sources.

Sources can be:
  - Local .tar.gz archive (exported with 'generators export')
  - URL to a .tar.gz archive
  - Local directory containing a generator

By default, generators are installed to your global generators directory
(~/.epf-cli/generators/), making them available across all projects.

Examples:
  # Install from local archive
  epf-cli generators install my-generator.tar.gz

  # Install from URL
  epf-cli generators install https://example.com/generators/my-generator.tar.gz

  # Install from directory
  epf-cli generators install /path/to/generator-dir

  # Install to current instance instead of global
  epf-cli generators install my-generator.tar.gz --to instance

  # Install with a different name
  epf-cli generators install my-generator.tar.gz --as custom-name

  # Install to specific path
  epf-cli generators install my-generator.tar.gz --to /path/to/dest`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		source := args[0]

		// Get flags
		newName, _ := cmd.Flags().GetString("as")
		destStr, _ := cmd.Flags().GetString("to")
		force, _ := cmd.Flags().GetBool("force")

		// Determine source type
		opts := generator.InstallOptions{
			SourcePath: source,
			NewName:    newName,
			Force:      force,
		}

		// Determine source type
		if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
			opts.Source = generator.SourceURL
		} else if info, err := os.Stat(source); err == nil && info.IsDir() {
			opts.Source = generator.SourceDirectory
		} else {
			opts.Source = generator.SourceFile
		}

		// Determine destination
		switch strings.ToLower(destStr) {
		case "", "global":
			opts.Destination = generator.DestGlobal
		case "instance":
			opts.Destination = generator.DestInstance
			if epfContext != nil && epfContext.InstancePath != "" {
				opts.InstancePath = epfContext.InstancePath
			} else {
				fmt.Fprintln(os.Stderr, "Error: No instance detected. Cannot install to instance.")
				os.Exit(1)
			}
		default:
			// Treat as path
			opts.Destination = generator.DestPath
			opts.DestinationPath = destStr
		}

		result, err := generator.Install(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Installed generator '%s'\n", result.GeneratorName)
		fmt.Printf("Location: %s\n", result.DestinationPath)
		fmt.Printf("Files: %d\n", len(result.FilesInstalled))

		// Show where it will be available
		if opts.Destination == generator.DestGlobal {
			fmt.Println("\nThis generator is now available globally in all EPF projects.")
		} else if opts.Destination == generator.DestInstance {
			fmt.Println("\nThis generator is now available in the current instance.")
		}
	},
}

func init() {
	rootCmd.AddCommand(generatorsCmd)
	generatorsCmd.AddCommand(listGeneratorsCmd)
	generatorsCmd.AddCommand(showGeneratorCmd)
	generatorsCmd.AddCommand(checkGeneratorCmd)
	generatorsCmd.AddCommand(validateGeneratorCmd)
	generatorsCmd.AddCommand(scaffoldGeneratorCmd)
	generatorsCmd.AddCommand(copyGeneratorCmd)
	generatorsCmd.AddCommand(exportGeneratorCmd)
	generatorsCmd.AddCommand(installGeneratorCmd)

	// List flags
	listGeneratorsCmd.Flags().String("category", "", "filter by category (compliance, marketing, investor, internal, development, custom)")
	listGeneratorsCmd.Flags().StringP("source", "s", "", "filter by source (instance, framework, global)")
	listGeneratorsCmd.Flags().Bool("json", false, "output as JSON")

	// Show flags
	showGeneratorCmd.Flags().Bool("wizard", false, "show only the wizard instructions")
	showGeneratorCmd.Flags().Bool("schema", false, "show only the output schema")
	showGeneratorCmd.Flags().Bool("json", false, "output as JSON")

	// Check flags
	checkGeneratorCmd.Flags().Bool("json", false, "output as JSON")

	// Validate flags
	validateGeneratorCmd.Flags().Bool("bash", false, "also run the bash validator script")
	validateGeneratorCmd.Flags().Bool("json", false, "output as JSON")

	// Scaffold flags
	scaffoldGeneratorCmd.Flags().StringP("description", "d", "", "description of what the generator creates")
	scaffoldGeneratorCmd.Flags().String("category", "custom", "generator category (compliance, marketing, investor, internal, development, custom)")
	scaffoldGeneratorCmd.Flags().StringP("author", "a", "", "generator author")
	scaffoldGeneratorCmd.Flags().StringP("output", "o", "", "output directory (defaults to instance generators/)")
	scaffoldGeneratorCmd.Flags().StringP("format", "f", "markdown", "output format (markdown, json, yaml, html, text)")
	scaffoldGeneratorCmd.Flags().StringSlice("requires", []string{}, "required EPF artifacts (e.g., --requires north_star,strategy_formula)")
	scaffoldGeneratorCmd.Flags().StringSlice("optional", []string{}, "optional EPF artifacts")
	scaffoldGeneratorCmd.Flags().StringSlice("region", []string{}, "geographic regions (e.g., --region NO,GB)")

	// Copy flags
	copyGeneratorCmd.Flags().String("as", "", "new name for the copied generator")
	copyGeneratorCmd.Flags().String("to-instance", "", "target instance path (when destination is 'instance')")
	copyGeneratorCmd.Flags().BoolP("force", "f", false, "overwrite existing generator")

	// Export flags
	exportGeneratorCmd.Flags().StringP("output", "o", "", "output file path (defaults to <name>.tar.gz)")
	exportGeneratorCmd.Flags().Bool("include-readme", false, "include README.md in export")

	// Install flags
	installGeneratorCmd.Flags().String("as", "", "install with a different name")
	installGeneratorCmd.Flags().String("to", "global", "destination: global, instance, or path")
	installGeneratorCmd.Flags().BoolP("force", "f", false, "overwrite existing generator")
}
