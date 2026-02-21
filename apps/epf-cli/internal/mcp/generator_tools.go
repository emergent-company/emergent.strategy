package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/generator"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// Canonical EPF Protection
// =============================================================================

// isCanonicalEPF checks if the given directory is the canonical EPF repo.
// Canonical EPF is identified by having these markers at root:
// - CANONICAL_PURITY_RULES.md
// - schemas/ directory
// - templates/ directory
// - wizards/ directory
func isCanonicalEPF(dir string) bool {
	if dir == "" {
		return false
	}

	// Check for canonical markers
	markers := []string{
		"CANONICAL_PURITY_RULES.md",
		"schemas",
		"templates",
		"wizards",
	}

	matchCount := 0
	for _, marker := range markers {
		path := filepath.Join(dir, marker)
		if _, err := os.Stat(path); err == nil {
			matchCount++
		}
	}

	// If 3+ markers match, it's canonical EPF
	return matchCount >= 3
}

// isCanonicalEPFPath checks if the given path is inside a canonical EPF repo
// by walking up the directory tree looking for canonical markers.
func isCanonicalEPFPath(path string) bool {
	if path == "" {
		return false
	}

	// Get absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	// Walk up to find canonical markers
	current := absPath
	for {
		if isCanonicalEPF(current) {
			return true
		}
		parent := filepath.Dir(current)
		if parent == current {
			break // Reached root
		}
		current = parent
	}

	return false
}

// =============================================================================
// Generator Tools
// =============================================================================

// GeneratorListItem represents a generator in the list response
type GeneratorListItem struct {
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

// handleListGenerators handles the epf_list_generators tool
func (s *Server) handleListGenerators(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.generatorLoader == nil || !s.generatorLoader.HasGenerators() {
		return mcp.NewToolResultError("Generators not loaded. Ensure EPF outputs directory exists."), nil
	}

	// Parse filters
	categoryFilter, _ := request.RequireString("category")
	sourceFilter, _ := request.RequireString("source")

	var categoryPtr *generator.GeneratorCategory
	if categoryFilter != "" {
		cat, err := generator.CategoryFromString(categoryFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid category '%s'. Valid categories: compliance, marketing, investor, internal, development, custom", categoryFilter)), nil
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
			return mcp.NewToolResultError(fmt.Sprintf("Invalid source '%s'. Valid sources: instance, framework, global", sourceFilter)), nil
		}
	}

	generators := s.generatorLoader.ListGenerators(categoryPtr, sourcePtr)

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Output Generators\n\n")

	if categoryFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by category: %s\n\n", categoryFilter))
	}
	if sourceFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by source: %s\n\n", sourceFilter))
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

		sb.WriteString(fmt.Sprintf("## %s\n\n", src.String()))

		for _, gen := range gens {
			categoryIcon := getCategoryIcon(gen.Category)

			sb.WriteString(fmt.Sprintf("- %s **%s** (%s)\n", categoryIcon, gen.Name, gen.Category.String()))
			if gen.Description != "" {
				// Truncate long descriptions
				desc := gen.Description
				if len(desc) > 80 {
					desc = desc[:77] + "..."
				}
				sb.WriteString(fmt.Sprintf("  %s\n", desc))
			}

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
			if len(files) > 0 {
				sb.WriteString(fmt.Sprintf("  Files: %s\n", strings.Join(files, ", ")))
			}

			if len(gen.Regions) > 0 {
				sb.WriteString(fmt.Sprintf("  Regions: %s\n", strings.Join(gen.Regions, ", ")))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n")
	sb.WriteString("📋 = compliance, 📢 = marketing, 💼 = investor, 📄 = internal, 🛠️ = development, ⚙️ = custom\n")
	sb.WriteString(fmt.Sprintf("Total: %d generators\n", len(generators)))

	return mcp.NewToolResultText(sb.String()), nil
}

// getCategoryIcon returns an emoji icon for a generator category
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

// GeneratorResponse represents the response for epf_get_generator
type GeneratorResponse struct {
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
	Wizard            string   `json:"wizard,omitempty"`
	Schema            string   `json:"schema,omitempty"`
	Manifest          string   `json:"manifest,omitempty"`
	Guidance          Guidance `json:"guidance"`
}

// handleGetGenerator handles the epf_get_generator tool
func (s *Server) handleGetGenerator(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.generatorLoader == nil || !s.generatorLoader.HasGenerators() {
		return mcp.NewToolResultError("Generators not loaded. Ensure EPF outputs directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	// Check what content to include
	includeWizard, _ := request.RequireString("include_wizard")
	includeSchema, _ := request.RequireString("include_schema")

	content, err := s.generatorLoader.GetGeneratorContent(name)
	if err != nil {
		// Provide helpful error with available generators
		gens := s.generatorLoader.ListGenerators(nil, nil)
		var names []string
		for _, g := range gens {
			names = append(names, g.Name)
		}
		sort.Strings(names)
		return mcp.NewToolResultError(fmt.Sprintf("Generator not found: %s. Available generators: %s", name, strings.Join(names, ", "))), nil
	}

	gen := content.GeneratorInfo

	response := GeneratorResponse{
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
		Guidance:          Guidance{},
	}

	// Include wizard if requested (default: include)
	if includeWizard != "false" && content.Wizard != "" {
		response.Wizard = content.Wizard
	}

	// Include schema if requested
	if includeSchema == "true" && content.Schema != "" {
		response.Schema = content.Schema
	}

	// Build guidance
	if len(gen.RequiredArtifacts) > 0 {
		response.Guidance.Tips = append(response.Guidance.Tips,
			fmt.Sprintf("Requires: %s", strings.Join(gen.RequiredArtifacts, ", ")))
	}

	response.Guidance.NextSteps = append(response.Guidance.NextSteps,
		"Follow the wizard instructions to generate output from EPF data")

	if gen.HasValidator {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("After generation, validate output using: epf_validate_generator_output('%s', '<output_file>')", gen.Name))
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Output Validation Tool
// =============================================================================

// ValidationResponse represents the response for epf_validate_generator_output
type ValidationResponse struct {
	GeneratorName string                           `json:"generator_name"`
	FilePath      string                           `json:"file_path,omitempty"`
	Valid         bool                             `json:"valid"`
	Errors        []string                         `json:"errors,omitempty"`
	Warnings      []string                         `json:"warnings,omitempty"`
	Layers        map[string]ValidationLayerResult `json:"layers,omitempty"`
	Guidance      Guidance                         `json:"guidance"`
}

// ValidationLayerResult represents results from a single validation layer
type ValidationLayerResult struct {
	Name     string   `json:"name"`
	Passed   bool     `json:"passed"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// handleValidateGeneratorOutput handles the epf_validate_generator_output tool
func (s *Server) handleValidateGeneratorOutput(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.generatorLoader == nil || !s.generatorLoader.HasGenerators() {
		return mcp.NewToolResultError("Generators not loaded. Ensure EPF outputs directory exists."), nil
	}

	generatorName, err := request.RequireString("generator")
	if err != nil {
		return mcp.NewToolResultError("generator parameter is required"), nil
	}

	// Get content or file path
	content, _ := request.RequireString("content")
	filePath, _ := request.RequireString("file_path")

	if content == "" && filePath == "" {
		return mcp.NewToolResultError("Either 'content' or 'file_path' parameter is required"), nil
	}

	// Check if bash validation is requested
	runBashStr, _ := request.RequireString("run_bash_validator")
	runBash := runBashStr == "true" || runBashStr == "1"

	// Create validator
	validator := generator.NewOutputValidator(s.generatorLoader)

	// Run validation
	result, err := validator.Validate(ctx, generator.ValidateOptions{
		Generator:        generatorName,
		Content:          content,
		FilePath:         filePath,
		RunBashValidator: runBash,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	// Build response
	response := ValidationResponse{
		GeneratorName: generatorName,
		FilePath:      filePath,
		Valid:         result.Valid,
		Errors:        result.Errors,
		Warnings:      result.Warnings,
		Layers:        make(map[string]ValidationLayerResult),
		Guidance:      Guidance{},
	}

	// Convert layer results
	for name, layer := range result.Layers {
		response.Layers[name] = ValidationLayerResult{
			Name:     layer.Name,
			Passed:   layer.Passed,
			Errors:   layer.Errors,
			Warnings: layer.Warnings,
		}
	}

	// Build guidance
	if result.Valid {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"Output is valid and conforms to the generator schema")
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			"Output has validation errors that need to be fixed")

		if len(result.Errors) > 0 {
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				"Review the errors above and update the output accordingly")
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				fmt.Sprintf("Re-run validation after fixes: epf_validate_generator_output('%s', ...)", generatorName))
		}
	}

	// Suggest running bash validator if not already run
	gen, _ := s.generatorLoader.GetGenerator(generatorName)
	if gen != nil && gen.HasValidator && !runBash {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"Bash validator available. Run with run_bash_validator=true for additional validation")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// PrerequisitesResponse represents the response for epf_check_generator_prereqs
type PrerequisitesResponse struct {
	GeneratorName       string   `json:"generator_name"`
	InstancePath        string   `json:"instance_path"`
	Ready               bool     `json:"ready"`
	MissingArtifacts    []string `json:"missing_artifacts,omitempty"`
	IncompleteArtifacts []string `json:"incomplete_artifacts,omitempty"`
	Suggestions         []string `json:"suggestions,omitempty"`
	Guidance            Guidance `json:"guidance"`
}

// handleCheckGeneratorPrereqs handles the epf_check_generator_prereqs tool
func (s *Server) handleCheckGeneratorPrereqs(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.generatorLoader == nil || !s.generatorLoader.HasGenerators() {
		return mcp.NewToolResultError("Generators not loaded. Ensure EPF outputs directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	gen, err := s.generatorLoader.GetGenerator(name)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Generator not found: %s", name)), nil
	}

	// Check prerequisites
	result := checkGeneratorPrerequisites(gen, instancePath)

	response := PrerequisitesResponse{
		GeneratorName:       gen.Name,
		InstancePath:        instancePath,
		Ready:               result.Ready,
		MissingArtifacts:    result.MissingArtifacts,
		IncompleteArtifacts: result.IncompleteArtifacts,
		Suggestions:         result.Suggestions,
		Guidance:            Guidance{},
	}

	if result.Ready {
		response.Guidance.Tips = append(response.Guidance.Tips, "All prerequisites met - ready to generate")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Use epf_get_generator('%s') to get the wizard instructions", gen.Name))
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings, "Missing required artifacts")
		for _, missing := range result.MissingArtifacts {
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				fmt.Sprintf("Create %s artifact using appropriate EPF wizard", missing))
		}
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// checkGeneratorPrerequisites checks if an EPF instance has required artifacts
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
		"feature_definitions": {"FIRE/definitions/product/*.yaml", "definitions/product/*.yaml"},
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
			"Use epf_get_wizard_for_task to find the right wizard for each artifact")
	}

	return result
}

// ScaffoldGeneratorResponse represents the response for epf_scaffold_generator
type ScaffoldGeneratorResponse struct {
	Name          string   `json:"name"`
	Path          string   `json:"path"`
	FilesCreated  []string `json:"files_created"`
	Category      string   `json:"category"`
	OutputFormat  string   `json:"output_format"`
	NextSteps     []string `json:"next_steps"`
	WizardContent string   `json:"wizard_content,omitempty"`
	Guidance      Guidance `json:"guidance"`
}

// handleScaffoldGenerator handles the epf_scaffold_generator tool
func (s *Server) handleScaffoldGenerator(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	// Get optional parameters
	description, _ := request.RequireString("description")
	categoryStr, _ := request.RequireString("category")
	author, _ := request.RequireString("author")
	outputDir, _ := request.RequireString("output_dir")
	formatStr, _ := request.RequireString("output_format")

	// Parse required/optional artifacts from comma-separated strings
	requiredStr, _ := request.RequireString("required_artifacts")
	optionalStr, _ := request.RequireString("optional_artifacts")
	regionsStr, _ := request.RequireString("regions")

	// Parse category
	category := generator.CategoryCustom
	if categoryStr != "" {
		cat, err := generator.CategoryFromString(categoryStr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid category '%s'. Valid: compliance, marketing, investor, internal, development, custom", categoryStr)), nil
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
			return mcp.NewToolResultError(fmt.Sprintf("Invalid format '%s'. Valid: markdown, json, yaml, html, text", formatStr)), nil
		}
	}

	// Parse comma-separated lists
	var requiredArtifacts, optionalArtifacts, regions []string
	if requiredStr != "" {
		requiredArtifacts = strings.Split(requiredStr, ",")
		for i := range requiredArtifacts {
			requiredArtifacts[i] = strings.TrimSpace(requiredArtifacts[i])
		}
	}
	if optionalStr != "" {
		optionalArtifacts = strings.Split(optionalStr, ",")
		for i := range optionalArtifacts {
			optionalArtifacts[i] = strings.TrimSpace(optionalArtifacts[i])
		}
	}
	if regionsStr != "" {
		regions = strings.Split(regionsStr, ",")
		for i := range regions {
			regions[i] = strings.TrimSpace(regions[i])
		}
	}

	// Determine output directory
	if outputDir == "" {
		// Default to instance generators directory
		outputDir = filepath.Join(instancePath, "generators")
	}

	// Protect canonical EPF from accidental writes
	if isCanonicalEPFPath(outputDir) {
		return mcp.NewToolResultError("Cannot scaffold generator in canonical EPF repository.\n\nThe target path appears to be inside the canonical EPF framework.\nUse instance_path pointing to a product repository instead."), nil
	}

	// Default author
	if author == "" {
		author = "Custom"
	}

	opts := generator.ScaffoldOptions{
		Name:              name,
		Description:       description,
		Category:          category,
		Author:            author,
		OutputDir:         outputDir,
		RequiredArtifacts: requiredArtifacts,
		OptionalArtifacts: optionalArtifacts,
		OutputFormat:      outputFormat,
		Regions:           regions,
	}

	result, err := generator.Scaffold(opts)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to scaffold generator: %s", err.Error())), nil
	}

	// Read the wizard content to include in response
	wizardPath := filepath.Join(result.GeneratorPath, "wizard.instructions.md")
	wizardContent := ""
	if data, err := os.ReadFile(wizardPath); err == nil {
		wizardContent = string(data)
	}

	response := ScaffoldGeneratorResponse{
		Name:          name,
		Path:          result.GeneratorPath,
		FilesCreated:  result.FilesCreated,
		Category:      string(category),
		OutputFormat:  string(outputFormat),
		NextSteps:     result.NextSteps,
		WizardContent: wizardContent,
		Guidance: Guidance{
			NextSteps: []string{
				"Edit wizard.instructions.md with your generation instructions",
				"Update schema.json with your output structure",
				"Customize validator.sh for your validation rules",
				fmt.Sprintf("Test with: epf_get_generator('%s')", name),
			},
			Tips: []string{
				"Study existing generators for patterns: epf_list_generators()",
				"Use the create_generator wizard for guidance: epf_get_wizard('create_generator')",
			},
		},
	}

	// Invalidate caches after scaffolding generator
	s.invalidateInstanceCaches(instancePath)

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}
