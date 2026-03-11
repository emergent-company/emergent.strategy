package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
	"github.com/spf13/cobra"
)

var skillsCmd = &cobra.Command{
	Use:   "skills",
	Short: "List, show, and manage EPF skills",
	Long: `Manage EPF skills (bundled capabilities with prompts and validation).

Skills are the execution units that agents use. They replace the older
"generators" and "wizard" concepts. The 'generators' command remains as
a permanent alias.

Skill types:
  - creation: Create new EPF artifacts
  - generation: Generate output documents from EPF data
  - review: Review and evaluate quality
  - enrichment: Enrich existing artifacts
  - analysis: Analyze strategy data

Skill Sources (in priority order):
  1. Instance - Instance-local skills (can override framework)
  2. Framework - Canonical EPF skills
  3. Global - User's global skills (~/.epf-cli/skills/)

Examples:
  epf-cli skills list                          # List all skills
  epf-cli skills list --type generation        # List generation skills
  epf-cli skills list --category compliance    # Filter by category
  epf-cli skills show context-sheet            # Show skill details
  epf-cli skills scaffold pitch-deck           # Create a new skill`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to list
		listSkillsCmd.Run(cmd, args)
	},
}

// createSkillLoader builds a skill loader with appropriate fallback.
func createSkillLoader() (*skill.Loader, error) {
	epfRoot, err := GetEPFRoot()
	if err != nil {
		if embedded.HasEmbeddedArtifacts() {
			loader := skill.NewEmbeddedLoader()
			if err := loader.Load(); err != nil {
				return nil, fmt.Errorf("loading embedded skills: %w", err)
			}
			return loader, nil
		}
		return nil, err
	}

	loader := skill.NewLoader(epfRoot)

	// Set instance root if available
	if epfContext != nil && epfContext.InstancePath != "" {
		loader.SetInstanceRoot(epfContext.InstancePath)
	}

	if err := loader.Load(); err != nil {
		return nil, fmt.Errorf("loading skills: %w", err)
	}
	return loader, nil
}

var listSkillsCmd = &cobra.Command{
	Use:   "list",
	Short: "List available skills",
	Long: `List all available EPF skills.

Skills are organized by type, category, and source location.`,
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if !loader.HasSkills() {
			fmt.Println("No skills found.")
			return
		}

		// Parse filters
		typeFilter, _ := cmd.Flags().GetString("type")
		categoryFilter, _ := cmd.Flags().GetString("category")
		sourceFilter, _ := cmd.Flags().GetString("source")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		var typePtr *skill.SkillType
		if typeFilter != "" {
			sType, err := skill.SkillTypeFromString(typeFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid skill type '%s'. Valid types: creation, generation, review, enrichment, analysis\n", typeFilter)
				os.Exit(1)
			}
			typePtr = &sType
		}

		var categoryPtr *skill.Category
		if categoryFilter != "" {
			cat, err := skill.CategoryFromString(categoryFilter)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid category '%s'. Valid categories: compliance, marketing, investor, internal, development, custom\n", categoryFilter)
				os.Exit(1)
			}
			categoryPtr = &cat
		}

		var sourcePtr *skill.SkillSource
		if sourceFilter != "" {
			switch strings.ToLower(sourceFilter) {
			case "instance":
				src := skill.SourceInstance
				sourcePtr = &src
			case "framework":
				src := skill.SourceFramework
				sourcePtr = &src
			case "global":
				src := skill.SourceGlobal
				sourcePtr = &src
			default:
				fmt.Fprintf(os.Stderr, "Invalid source '%s'. Valid sources: instance, framework, global\n", sourceFilter)
				os.Exit(1)
			}
		}

		skills := loader.ListSkills(typePtr, categoryPtr, sourcePtr)

		if jsonOutput {
			printSkillsJSON(skills)
			return
		}

		fmt.Printf("EPF Skills (loaded from %s)\n\n", loader.Source())

		if typeFilter != "" {
			fmt.Printf("Filtered by type: %s\n", typeFilter)
		}
		if categoryFilter != "" {
			fmt.Printf("Filtered by category: %s\n", categoryFilter)
		}
		if sourceFilter != "" {
			fmt.Printf("Filtered by source: %s\n", sourceFilter)
		}
		if typeFilter != "" || categoryFilter != "" || sourceFilter != "" {
			fmt.Println()
		}

		// Group by source
		bySource := make(map[skill.SkillSource][]*skill.SkillInfo)
		for _, sk := range skills {
			bySource[sk.Source] = append(bySource[sk.Source], sk)
		}

		sources := []skill.SkillSource{
			skill.SourceInstance,
			skill.SourceFramework,
			skill.SourceGlobal,
		}

		for _, src := range sources {
			sks := bySource[src]
			if len(sks) == 0 {
				continue
			}

			sort.Slice(sks, func(i, j int) bool {
				return sks[i].Name < sks[j].Name
			})

			fmt.Printf("## %s\n\n", src)

			for _, sk := range sks {
				typeIcon := getSkillTypeIcon(sk.Type)

				files := []string{}
				if sk.HasPrompt {
					files = append(files, "prompt")
				}
				if sk.HasSchema {
					files = append(files, "schema")
				}
				if sk.HasValidator {
					files = append(files, "validator")
				}
				if sk.HasTemplate {
					files = append(files, "template")
				}
				filesStr := strings.Join(files, ", ")

				fmt.Printf("  %s %-25s %s\n", typeIcon, sk.Name, sk.Type)
				if sk.Description != "" {
					desc := sk.Description
					if len(desc) > 70 {
						desc = desc[:67] + "..."
					}
					fmt.Printf("     %s\n", desc)
				}
				if len(files) > 0 {
					fmt.Printf("     Files: %s\n", filesStr)
				}
				if sk.Category != "" {
					fmt.Printf("     Category: %s\n", sk.Category)
				}
				fmt.Println()
			}
		}

		fmt.Println("---")
		printSkillTypeLegend()
		fmt.Printf("Total: %d skills\n", len(skills))
	},
}

func getSkillTypeIcon(t skill.SkillType) string {
	switch t {
	case skill.SkillTypeCreation:
		return "✏️"
	case skill.SkillTypeGeneration:
		return "📄"
	case skill.SkillTypeReview:
		return "🔍"
	case skill.SkillTypeEnrichment:
		return "🔧"
	case skill.SkillTypeAnalysis:
		return "📊"
	default:
		return "⚙️"
	}
}

func printSkillTypeLegend() {
	fmt.Println("✏️ = creation, 📄 = generation, 🔍 = review, 🔧 = enrichment, 📊 = analysis")
}

func printSkillsJSON(skills []*skill.SkillInfo) {
	type skillItem struct {
		Name              string   `json:"name"`
		Type              string   `json:"type"`
		Description       string   `json:"description,omitempty"`
		Category          string   `json:"category,omitempty"`
		Source            string   `json:"source"`
		OutputFormat      string   `json:"output_format,omitempty"`
		RequiredArtifacts []string `json:"required_artifacts,omitempty"`
		HasPrompt         bool     `json:"has_prompt"`
		HasSchema         bool     `json:"has_schema"`
		HasValidator      bool     `json:"has_validator"`
		HasTemplate       bool     `json:"has_template"`
		LegacyFormat      bool     `json:"legacy_format,omitempty"`
	}

	items := make([]skillItem, 0, len(skills))
	for _, sk := range skills {
		items = append(items, skillItem{
			Name:              sk.Name,
			Type:              string(sk.Type),
			Description:       sk.Description,
			Category:          string(sk.Category),
			Source:            string(sk.Source),
			OutputFormat:      string(sk.OutputFormat),
			RequiredArtifacts: sk.RequiredArtifacts,
			HasPrompt:         sk.HasPrompt,
			HasSchema:         sk.HasSchema,
			HasValidator:      sk.HasValidator,
			HasTemplate:       sk.HasTemplate,
			LegacyFormat:      sk.LegacyFormat,
		})
	}

	jsonBytes, _ := json.MarshalIndent(items, "", "  ")
	fmt.Println(string(jsonBytes))
}

var showSkillCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Show a specific skill",
	Long: `Display the full content and metadata of a skill.

Shows the skill's prompt, manifest, and available files.

Examples:
  epf-cli skills show context-sheet
  epf-cli skills show context-sheet --prompt
  epf-cli skills show context-sheet --schema`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		content, err := loader.GetSkillContent(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		promptOnly, _ := cmd.Flags().GetBool("prompt")
		schemaOnly, _ := cmd.Flags().GetBool("schema")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		if jsonOutput {
			printSkillContentJSON(content)
			return
		}

		if promptOnly {
			if content.PromptContent == "" {
				fmt.Fprintf(os.Stderr, "Skill '%s' has no prompt content\n", args[0])
				os.Exit(1)
			}
			fmt.Print(content.PromptContent)
			return
		}

		if schemaOnly {
			if content.SchemaContent == "" {
				fmt.Fprintf(os.Stderr, "Skill '%s' has no schema\n", args[0])
				os.Exit(1)
			}
			fmt.Print(content.SchemaContent)
			return
		}

		// Print full skill info
		printSkillInfo(content)
	},
}

func printSkillInfo(content *skill.SkillContent) {
	sk := content.SkillInfo

	fmt.Printf("# Skill: %s\n", sk.Name)
	fmt.Printf("# Type: %s\n", sk.Type)
	if sk.Description != "" {
		fmt.Printf("# Description: %s\n", sk.Description)
	}
	if sk.Category != "" {
		fmt.Printf("# Category: %s\n", sk.Category)
	}
	fmt.Printf("# Source: %s\n", sk.Source)
	if sk.Author != "" {
		fmt.Printf("# Author: %s\n", sk.Author)
	}
	if sk.Path != "" {
		fmt.Printf("# Path: %s\n", sk.Path)
	}
	fmt.Println("#")

	if len(sk.RequiredArtifacts) > 0 {
		fmt.Printf("# Required Artifacts: %s\n", strings.Join(sk.RequiredArtifacts, ", "))
	}
	if len(sk.OptionalArtifacts) > 0 {
		fmt.Printf("# Optional Artifacts: %s\n", strings.Join(sk.OptionalArtifacts, ", "))
	}
	if sk.OutputFormat != "" {
		fmt.Printf("# Output Format: %s\n", sk.OutputFormat)
	}

	fmt.Println("#")
	fmt.Println("# Available Files:")
	if sk.HasManifest {
		fmt.Println("#   manifest")
	}
	if sk.HasPrompt {
		fmt.Printf("#   %s (prompt)\n", sk.PromptFile)
	}
	if sk.HasSchema {
		fmt.Printf("#   %s (schema)\n", sk.SchemaFile)
	}
	if sk.HasValidator {
		fmt.Printf("#   %s (validator)\n", sk.ValidatorFile)
	}
	if sk.HasTemplate {
		fmt.Printf("#   %s (template)\n", sk.TemplateFile)
	}

	fmt.Println("#")
	fmt.Println("# --- Manifest ---")
	fmt.Println()

	if content.ManifestContent != "" {
		fmt.Println(content.ManifestContent)
	} else {
		fmt.Println("(No manifest file)")
	}

	fmt.Println()
	fmt.Println("# Usage:")
	if sk.HasPrompt {
		fmt.Printf("#   epf-cli skills show %s --prompt   # View prompt\n", sk.Name)
	}
	if sk.HasSchema {
		fmt.Printf("#   epf-cli skills show %s --schema   # View schema\n", sk.Name)
	}
}

func printSkillContentJSON(content *skill.SkillContent) {
	sk := content.SkillInfo

	response := struct {
		Name              string   `json:"name"`
		Type              string   `json:"type"`
		Description       string   `json:"description,omitempty"`
		Category          string   `json:"category,omitempty"`
		Source            string   `json:"source"`
		Author            string   `json:"author,omitempty"`
		Path              string   `json:"path,omitempty"`
		OutputFormat      string   `json:"output_format,omitempty"`
		RequiredArtifacts []string `json:"required_artifacts,omitempty"`
		OptionalArtifacts []string `json:"optional_artifacts,omitempty"`
		HasManifest       bool     `json:"has_manifest"`
		HasPrompt         bool     `json:"has_prompt"`
		HasSchema         bool     `json:"has_schema"`
		HasValidator      bool     `json:"has_validator"`
		HasTemplate       bool     `json:"has_template"`
		LegacyFormat      bool     `json:"legacy_format,omitempty"`
		Manifest          string   `json:"manifest,omitempty"`
		Prompt            string   `json:"prompt,omitempty"`
		Schema            string   `json:"schema,omitempty"`
		Validator         string   `json:"validator,omitempty"`
		Template          string   `json:"template,omitempty"`
		Readme            string   `json:"readme,omitempty"`
	}{
		Name:              sk.Name,
		Type:              string(sk.Type),
		Description:       sk.Description,
		Category:          string(sk.Category),
		Source:            string(sk.Source),
		Author:            sk.Author,
		Path:              sk.Path,
		OutputFormat:      string(sk.OutputFormat),
		RequiredArtifacts: sk.RequiredArtifacts,
		OptionalArtifacts: sk.OptionalArtifacts,
		HasManifest:       sk.HasManifest,
		HasPrompt:         sk.HasPrompt,
		HasSchema:         sk.HasSchema,
		HasValidator:      sk.HasValidator,
		HasTemplate:       sk.HasTemplate,
		LegacyFormat:      sk.LegacyFormat,
		Manifest:          content.ManifestContent,
		Prompt:            content.PromptContent,
		Schema:            content.SchemaContent,
		Validator:         content.ValidatorContent,
		Template:          content.TemplateContent,
		Readme:            content.ReadmeContent,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println(string(jsonBytes))
}

var checkSkillCmd = &cobra.Command{
	Use:   "check <name>",
	Short: "Check if prerequisites are met for a skill",
	Long: `Check if the current EPF instance has the required artifacts
for executing a specific skill.

Examples:
  epf-cli skills check context-sheet
  epf-cli skills check skattefunn-application`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		sk, err := loader.GetSkill(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		jsonOutput, _ := cmd.Flags().GetBool("json")

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

		// Reuse the existing generator prerequisite checker
		result := checkSkillPrerequisites(sk, instancePath)

		if jsonOutput {
			jsonBytes, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(jsonBytes))
			return
		}

		fmt.Printf("Skill: %s\n", sk.Name)
		fmt.Printf("Instance: %s\n", instancePath)
		fmt.Println()

		if result.Ready {
			fmt.Println("Ready - all required artifacts are present")
		} else {
			fmt.Println("Not ready - missing required artifacts:")
			for _, missing := range result.MissingArtifacts {
				fmt.Printf("  - %s\n", missing)
			}
		}

		if len(result.Suggestions) > 0 {
			fmt.Println("\nSuggestions:")
			for _, suggestion := range result.Suggestions {
				fmt.Printf("  %s\n", suggestion)
			}
		}

		if !result.Ready {
			os.Exit(1)
		}
	},
}

func checkSkillPrerequisites(sk *skill.SkillInfo, instancePath string) *skill.PrerequisiteResult {
	result := &skill.PrerequisiteResult{
		Ready: true,
	}

	artifactPatterns := map[string][]string{
		"north_star":          {"READY/00_north_star.yaml", "00_north_star.yaml"},
		"strategy_formula":    {"READY/04_strategy_formula.yaml", "04_strategy_formula.yaml"},
		"roadmap_recipe":      {"READY/05_roadmap_recipe.yaml", "05_roadmap_recipe.yaml"},
		"value_models":        {"FIRE/value_models/*.yaml", "value_models/*.yaml"},
		"feature_definitions": {"FIRE/definitions/product/*.yaml", "definitions/product/*.yaml"},
	}

	for _, required := range sk.RequiredArtifacts {
		patterns, ok := artifactPatterns[required]
		if !ok {
			continue
		}

		found := false
		for _, pattern := range patterns {
			fullPattern := filepath.Join(instancePath, pattern)
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

	if len(result.MissingArtifacts) > 0 {
		result.Suggestions = append(result.Suggestions,
			"Run appropriate EPF agents to create missing artifacts")
		result.Suggestions = append(result.Suggestions,
			"Use 'epf-cli agents recommend \"create <artifact>\"' for guidance")
	}

	return result
}

var scaffoldSkillCmd = &cobra.Command{
	Use:   "scaffold <name>",
	Short: "Create a new skill from template",
	Long: `Create a new EPF skill with all required files.

This command scaffolds a complete skill structure including:
  - skill.yaml or generator.yaml (manifest)
  - prompt.md or wizard.instructions.md (AI instructions)
  - schema.json (output validation schema)
  - validator.sh (validation script)
  - README.md (documentation)

Generation-type skills always use legacy file names (generator.yaml,
wizard.instructions.md) for backward compatibility.

Examples:
  epf-cli skills scaffold pitch-deck
  epf-cli skills scaffold seis-application --category compliance --region GB
  epf-cli skills scaffold team-brief --category internal
  epf-cli skills scaffold my-review --type review`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		description, _ := cmd.Flags().GetString("description")
		categoryStr, _ := cmd.Flags().GetString("category")
		typeStr, _ := cmd.Flags().GetString("type")
		author, _ := cmd.Flags().GetString("author")
		outputDir, _ := cmd.Flags().GetString("output")
		formatStr, _ := cmd.Flags().GetString("format")
		requiredStr, _ := cmd.Flags().GetStringSlice("requires")
		optionalStr, _ := cmd.Flags().GetStringSlice("optional")
		regionsStr, _ := cmd.Flags().GetStringSlice("region")

		// Parse category
		category := skill.CategoryCustom
		if categoryStr != "" {
			cat, err := skill.CategoryFromString(categoryStr)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid category '%s'. Valid: compliance, marketing, investor, internal, development, custom\n", categoryStr)
				os.Exit(1)
			}
			category = cat
		}

		// Parse skill type
		skillType := skill.SkillTypeGeneration // Default to generation (backward compat with generators)
		if typeStr != "" {
			sType, err := skill.SkillTypeFromString(typeStr)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Invalid type '%s'. Valid: creation, generation, review, enrichment, analysis\n", typeStr)
				os.Exit(1)
			}
			skillType = sType
		}

		// Parse output format
		outputFormat := skill.FormatMarkdown
		if formatStr != "" {
			switch strings.ToLower(formatStr) {
			case "markdown", "md":
				outputFormat = skill.FormatMarkdown
			case "json":
				outputFormat = skill.FormatJSON
			case "yaml":
				outputFormat = skill.FormatYAML
			case "html":
				outputFormat = skill.FormatHTML
			case "text", "txt":
				outputFormat = skill.FormatText
			default:
				fmt.Fprintf(os.Stderr, "Invalid format '%s'. Valid: markdown, json, yaml, html, text\n", formatStr)
				os.Exit(1)
			}
		}

		// Determine output directory
		if outputDir == "" {
			if epfContext != nil && epfContext.InstancePath != "" {
				// Generation skills go to generators/ for backward compat
				if skillType == skill.SkillTypeGeneration || skillType == "" {
					outputDir = filepath.Join(epfContext.InstancePath, skill.InstanceGeneratorsDir)
				} else {
					outputDir = filepath.Join(epfContext.InstancePath, skill.InstanceSkillsDir)
				}
			} else {
				outputDir = "."
			}
		}

		if author == "" {
			author = "Custom"
		}

		// Protect canonical EPF
		if err := EnsurePathNotCanonical(outputDir, "scaffold skill"); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}

		opts := skill.ScaffoldOptions{
			Name:              name,
			Description:       description,
			Type:              skillType,
			Category:          category,
			Author:            author,
			OutputDir:         outputDir,
			RequiredArtifacts: requiredStr,
			OptionalArtifacts: optionalStr,
			OutputFormat:      outputFormat,
			Regions:           regionsStr,
		}

		result, err := skill.Scaffold(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error scaffolding skill: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Created skill: %s\n\n", name)
		fmt.Printf("Location: %s\n\n", result.SkillPath)
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

var validateSkillCmd = &cobra.Command{
	Use:   "validate <skill> <file>",
	Short: "Validate skill output against its schema",
	Long: `Validate a skill output file against its schema and optionally run
the bash validator script.

Examples:
  epf-cli skills validate context-sheet output.md
  epf-cli skills validate context-sheet output.md --bash`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		skillName := args[0]
		filePath := args[1]

		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		runBash, _ := cmd.Flags().GetBool("bash")
		jsonOutput, _ := cmd.Flags().GetBool("json")

		validator := skill.NewOutputValidator(loader)
		result, err := validator.ValidateFile(context.Background(), skillName, filePath, runBash)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if jsonOutput {
			printSkillValidationJSON(skillName, filePath, result)
			return
		}

		fmt.Printf("Skill: %s\n", skillName)
		fmt.Printf("File: %s\n", filePath)
		fmt.Println()

		if result.Valid {
			fmt.Println("Valid - output conforms to skill schema")
		} else {
			fmt.Println("Invalid - validation errors found")
		}
		fmt.Println()

		for layerName, layer := range result.Layers {
			status := "PASS"
			if !layer.Passed {
				status = "FAIL"
			}
			fmt.Printf("%s %s: %s\n", status, layer.Name, layerName)

			for _, e := range layer.Errors {
				fmt.Printf("   Error: %s\n", e)
			}
			for _, w := range layer.Warnings {
				fmt.Printf("   Warning: %s\n", w)
			}
		}

		if len(result.Errors) > 0 && len(result.Layers) == 0 {
			fmt.Println("\nErrors:")
			for _, e := range result.Errors {
				fmt.Printf("  - %s\n", e)
			}
		}

		if !result.Valid {
			os.Exit(1)
		}
	},
}

func printSkillValidationJSON(skillName, filePath string, result *skill.ValidationResult) {
	type response struct {
		SkillName string   `json:"skill_name"`
		FilePath  string   `json:"file_path"`
		Valid     bool     `json:"valid"`
		Errors    []string `json:"errors,omitempty"`
		Warnings  []string `json:"warnings,omitempty"`
	}

	resp := response{
		SkillName: skillName,
		FilePath:  filePath,
		Valid:     result.Valid,
		Errors:    result.Errors,
		Warnings:  result.Warnings,
	}

	jsonBytes, _ := json.MarshalIndent(resp, "", "  ")
	fmt.Println(string(jsonBytes))
}

var copySkillCmd = &cobra.Command{
	Use:   "copy <name> <destination>",
	Short: "Copy a skill to another location",
	Long: `Copy a skill to another EPF instance or to your global skills.

Destinations:
  global    Copy to ~/.epf-cli/skills/ (available everywhere)
  instance  Copy to current instance's skills/ directory
  <path>    Copy to a specific directory path

Examples:
  epf-cli skills copy my-skill global
  epf-cli skills copy my-skill instance --to-instance /path/to/other
  epf-cli skills copy context-sheet global --as my-context-sheet`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		dest := args[1]

		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		newName, _ := cmd.Flags().GetString("as")
		toInstance, _ := cmd.Flags().GetString("to-instance")
		force, _ := cmd.Flags().GetBool("force")

		opts := skill.CopyOptions{
			Name:    name,
			NewName: newName,
			Force:   force,
		}

		switch strings.ToLower(dest) {
		case "global":
			opts.Destination = skill.DestGlobal
		case "instance":
			opts.Destination = skill.DestInstance
			if toInstance != "" {
				opts.InstancePath = toInstance
			} else if epfContext != nil && epfContext.InstancePath != "" {
				opts.InstancePath = epfContext.InstancePath
			} else {
				fmt.Fprintln(os.Stderr, "Error: No instance detected. Use --to-instance to specify target.")
				os.Exit(1)
			}
		default:
			opts.Destination = skill.DestPath
			opts.DestinationPath = dest
		}

		result, err := loader.Copy(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Copied skill '%s' to %s\n", name, result.DestinationPath)
		fmt.Printf("Files copied: %d\n", len(result.FilesCopied))
		if result.NewName != name {
			fmt.Printf("Renamed to: %s\n", result.NewName)
		}
	},
}

var exportSkillCmd = &cobra.Command{
	Use:   "export <name>",
	Short: "Export a skill as a shareable archive",
	Long: `Export a skill as a .tar.gz archive for sharing.

Examples:
  epf-cli skills export my-skill
  epf-cli skills export my-skill -o /path/to/my-skill.tar.gz`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		loader, err := createSkillLoader()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		outputPath, _ := cmd.Flags().GetString("output")
		includeReadme, _ := cmd.Flags().GetBool("include-readme")

		opts := skill.ExportOptions{
			Name:          name,
			OutputPath:    outputPath,
			IncludeReadme: includeReadme,
		}

		result, err := loader.Export(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Exported skill '%s'\n", name)
		fmt.Printf("Archive: %s\n", result.ArchivePath)
		fmt.Printf("Files: %d\n", len(result.FilesExported))
		fmt.Printf("Size: %d bytes\n", result.SizeBytes)
		fmt.Println("\nTo install this skill elsewhere:")
		fmt.Printf("  epf-cli skills install %s\n", result.ArchivePath)
	},
}

var installSkillCmd = &cobra.Command{
	Use:   "install <source>",
	Short: "Install a skill from an archive, URL, or directory",
	Long: `Install a skill from various sources.

Sources can be:
  - Local .tar.gz archive
  - URL to a .tar.gz archive
  - Local directory containing a skill

Examples:
  epf-cli skills install my-skill.tar.gz
  epf-cli skills install https://example.com/skills/my-skill.tar.gz
  epf-cli skills install /path/to/skill-dir
  epf-cli skills install my-skill.tar.gz --to instance`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		source := args[0]

		newName, _ := cmd.Flags().GetString("as")
		destStr, _ := cmd.Flags().GetString("to")
		force, _ := cmd.Flags().GetBool("force")

		opts := skill.InstallOptions{
			SourcePath: source,
			NewName:    newName,
			Force:      force,
		}

		// Determine source type
		if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
			opts.Source = skill.InstallFromURL
		} else if info, err := os.Stat(source); err == nil && info.IsDir() {
			opts.Source = skill.InstallFromDirectory
		} else {
			opts.Source = skill.InstallFromFile
		}

		// Determine destination
		switch strings.ToLower(destStr) {
		case "", "global":
			opts.Destination = skill.DestGlobal
		case "instance":
			opts.Destination = skill.DestInstance
			if epfContext != nil && epfContext.InstancePath != "" {
				opts.InstancePath = epfContext.InstancePath
			} else {
				fmt.Fprintln(os.Stderr, "Error: No instance detected. Cannot install to instance.")
				os.Exit(1)
			}
		default:
			opts.Destination = skill.DestPath
			opts.DestinationPath = destStr
		}

		result, err := skill.Install(opts)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Installed skill '%s'\n", result.SkillName)
		fmt.Printf("Location: %s\n", result.DestinationPath)
		fmt.Printf("Files: %d\n", len(result.FilesInstalled))

		if opts.Destination == skill.DestGlobal {
			fmt.Println("\nThis skill is now available globally in all EPF projects.")
		} else if opts.Destination == skill.DestInstance {
			fmt.Println("\nThis skill is now available in the current instance.")
		}
	},
}

func init() {
	rootCmd.AddCommand(skillsCmd)
	skillsCmd.AddCommand(listSkillsCmd)
	skillsCmd.AddCommand(showSkillCmd)
	skillsCmd.AddCommand(checkSkillCmd)
	skillsCmd.AddCommand(scaffoldSkillCmd)
	skillsCmd.AddCommand(validateSkillCmd)
	skillsCmd.AddCommand(copySkillCmd)
	skillsCmd.AddCommand(exportSkillCmd)
	skillsCmd.AddCommand(installSkillCmd)

	// List flags
	listSkillsCmd.Flags().StringP("type", "t", "", "filter by type (creation, generation, review, enrichment, analysis)")
	listSkillsCmd.Flags().String("category", "", "filter by category (compliance, marketing, investor, internal, development, custom)")
	listSkillsCmd.Flags().StringP("source", "s", "", "filter by source (instance, framework, global)")
	listSkillsCmd.Flags().Bool("json", false, "output as JSON")

	// Show flags
	showSkillCmd.Flags().Bool("prompt", false, "show only the prompt content")
	showSkillCmd.Flags().Bool("schema", false, "show only the output schema")
	showSkillCmd.Flags().Bool("json", false, "output as JSON")

	// Check flags
	checkSkillCmd.Flags().Bool("json", false, "output as JSON")

	// Scaffold flags
	scaffoldSkillCmd.Flags().StringP("description", "d", "", "description of what the skill does")
	scaffoldSkillCmd.Flags().String("category", "custom", "skill category (compliance, marketing, investor, internal, development, custom)")
	scaffoldSkillCmd.Flags().StringP("type", "t", "generation", "skill type (creation, generation, review, enrichment, analysis)")
	scaffoldSkillCmd.Flags().StringP("author", "a", "", "skill author")
	scaffoldSkillCmd.Flags().StringP("output", "o", "", "output directory")
	scaffoldSkillCmd.Flags().StringP("format", "f", "markdown", "output format (markdown, json, yaml, html, text)")
	scaffoldSkillCmd.Flags().StringSlice("requires", []string{}, "required EPF artifacts")
	scaffoldSkillCmd.Flags().StringSlice("optional", []string{}, "optional EPF artifacts")
	scaffoldSkillCmd.Flags().StringSlice("region", []string{}, "geographic regions")

	// Validate flags
	validateSkillCmd.Flags().Bool("bash", false, "also run the bash validator script")
	validateSkillCmd.Flags().Bool("json", false, "output as JSON")

	// Copy flags
	copySkillCmd.Flags().String("as", "", "new name for the copied skill")
	copySkillCmd.Flags().String("to-instance", "", "target instance path")
	copySkillCmd.Flags().BoolP("force", "f", false, "overwrite existing skill")

	// Export flags
	exportSkillCmd.Flags().StringP("output", "o", "", "output file path")
	exportSkillCmd.Flags().Bool("include-readme", false, "include README.md in export")

	// Install flags
	installSkillCmd.Flags().String("as", "", "install with a different name")
	installSkillCmd.Flags().String("to", "global", "destination: global, instance, or path")
	installSkillCmd.Flags().BoolP("force", "f", false, "overwrite existing skill")
}
