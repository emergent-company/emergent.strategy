package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/pathutil"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// Skill Tools
// =============================================================================

// SkillListItem represents a skill in the epf_list_skills response.
// NOTE: This struct is defined for JSON serialization consistency but the
// handleListSkills handler currently returns markdown text for human readability.
// Detail handlers (handleGetSkill) return JSON. This is intentional: list tools
// are optimized for LLM consumption as text, while detail tools return
// structured JSON for programmatic use.
type SkillListItem struct {
	Name              string                `json:"name"`
	Type              string                `json:"type"`
	Phase             string                `json:"phase,omitempty"`
	Description       string                `json:"description,omitempty"`
	Category          string                `json:"category,omitempty"`
	Source            string                `json:"source"`
	OutputFormat      string                `json:"output_format,omitempty"`
	RequiredArtifacts []string              `json:"required_artifacts,omitempty"`
	Capability        *agent.CapabilitySpec `json:"capability,omitempty"`
	HasPrompt         bool                  `json:"has_prompt"`
	HasSchema         bool                  `json:"has_schema"`
	HasValidator      bool                  `json:"has_validator"`
	HasTemplate       bool                  `json:"has_template"`
	LegacyFormat      bool                  `json:"legacy_format,omitempty"`
}

// handleListSkills handles the epf_list_skills tool.
func (s *Server) handleListSkills(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return mcp.NewToolResultError("Skills not loaded. Ensure EPF skills/generators/wizards directory exists."), nil
	}

	// Parse filters
	typeFilter, _ := request.RequireString("type")
	categoryFilter, _ := request.RequireString("category")
	sourceFilter, _ := request.RequireString("source")

	var typePtr *skill.SkillType
	if typeFilter != "" {
		sType, err := skill.SkillTypeFromString(typeFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid skill type '%s'. Valid types: creation, generation, review, enrichment, analysis", typeFilter)), nil
		}
		typePtr = &sType
	}

	var categoryPtr *skill.Category
	if categoryFilter != "" {
		cat, err := skill.CategoryFromString(categoryFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid category '%s'. Valid categories: compliance, marketing, investor, internal, development, custom", categoryFilter)), nil
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
			return mcp.NewToolResultError(fmt.Sprintf("Invalid source '%s'. Valid sources: instance, framework, global", sourceFilter)), nil
		}
	}

	skills := s.skillLoader.ListSkills(typePtr, categoryPtr, sourcePtr)

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Skills\n\n")

	if typeFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by type: %s\n\n", typeFilter))
	}
	if categoryFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by category: %s\n\n", categoryFilter))
	}
	if sourceFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by source: %s\n\n", sourceFilter))
	}

	// Group by type
	byType := make(map[skill.SkillType][]*skill.SkillInfo)
	for _, sk := range skills {
		byType[sk.Type] = append(byType[sk.Type], sk)
	}

	// Display in order: creation, generation, review, enrichment, analysis
	typeOrder := []skill.SkillType{
		skill.SkillTypeCreation,
		skill.SkillTypeGeneration,
		skill.SkillTypeReview,
		skill.SkillTypeEnrichment,
		skill.SkillTypeAnalysis,
	}

	for _, sType := range typeOrder {
		items := byType[sType]
		if len(items) == 0 {
			continue
		}

		// Sort by name
		sort.Slice(items, func(i, j int) bool {
			return items[i].Name < items[j].Name
		})

		typeIcon := skillTypeIcon(sType)
		sb.WriteString(fmt.Sprintf("## %s %s\n\n", typeIcon, capitalizeFirst(string(sType))))

		for _, sk := range items {
			sb.WriteString(fmt.Sprintf("- **%s**", sk.Name))
			if sk.Category != "" {
				sb.WriteString(fmt.Sprintf(" (%s)", sk.Category))
			}
			sb.WriteString("\n")

			if sk.Description != "" {
				desc := sk.Description
				if len(desc) > 80 {
					desc = desc[:77] + "..."
				}
				sb.WriteString(fmt.Sprintf("  %s\n", desc))
			}

			// Show available files
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
			if len(files) > 0 {
				sb.WriteString(fmt.Sprintf("  Files: %s\n", strings.Join(files, ", ")))
			}

			sb.WriteString(fmt.Sprintf("  Source: %s\n", sk.Source))

			if len(sk.Regions) > 0 {
				sb.WriteString(fmt.Sprintf("  Regions: %s\n", strings.Join(sk.Regions, ", ")))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n")
	sb.WriteString("📝 = creation, 📄 = generation, 🔍 = review, ✨ = enrichment, 📊 = analysis\n")
	sb.WriteString(fmt.Sprintf("Total: %d skills\n", len(skills)))

	return mcp.NewToolResultText(sb.String()), nil
}

// skillTypeIcon returns an emoji icon for a skill type.
func skillTypeIcon(t skill.SkillType) string {
	switch t {
	case skill.SkillTypeCreation:
		return "📝"
	case skill.SkillTypeGeneration:
		return "📄"
	case skill.SkillTypeReview:
		return "🔍"
	case skill.SkillTypeEnrichment:
		return "✨"
	case skill.SkillTypeAnalysis:
		return "📊"
	default:
		return "📦"
	}
}

// SkillResponse represents the response for epf_get_skill.
type SkillResponse struct {
	Name              string                `json:"name"`
	Type              string                `json:"type"`
	Phase             string                `json:"phase,omitempty"`
	Version           string                `json:"version,omitempty"`
	Description       string                `json:"description"`
	Source            string                `json:"source"`
	Category          string                `json:"category,omitempty"`
	Author            string                `json:"author,omitempty"`
	Regions           []string              `json:"regions,omitempty"`
	Path              string                `json:"path"`
	OutputFormat      string                `json:"output_format,omitempty"`
	ArtifactType      string                `json:"artifact_type,omitempty"`
	RequiredArtifacts []string              `json:"required_artifacts,omitempty"`
	OptionalArtifacts []string              `json:"optional_artifacts,omitempty"`
	RequiredTools     []string              `json:"required_tools,omitempty"`
	Capability        *agent.CapabilitySpec `json:"capability,omitempty"`
	Scope             *skill.ScopeSpec      `json:"scope,omitempty"`
	HasManifest       bool                  `json:"has_manifest"`
	HasPrompt         bool                  `json:"has_prompt"`
	HasSchema         bool                  `json:"has_schema"`
	HasValidator      bool                  `json:"has_validator"`
	HasTemplate       bool                  `json:"has_template"`
	LegacyFormat      bool                  `json:"legacy_format,omitempty"`
	Prompt            string                `json:"prompt,omitempty"`
	Schema            string                `json:"schema,omitempty"`
	Manifest          string                `json:"manifest,omitempty"`
	Guidance          Guidance              `json:"guidance"`
}

// handleGetSkill handles the epf_get_skill tool.
func (s *Server) handleGetSkill(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return mcp.NewToolResultError("Skills not loaded. Ensure EPF skills/generators/wizards directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	// Check what content to include
	includePrompt, _ := request.RequireString("include_prompt")
	includeSchema, _ := request.RequireString("include_schema")

	content, err := s.skillLoader.GetSkillContent(name)
	if err != nil {
		// Provide helpful error with available skills
		names := s.skillLoader.GetSkillNames()
		sort.Strings(names)
		return mcp.NewToolResultError(fmt.Sprintf("Skill not found: %s. Available skills: %s", name, strings.Join(names, ", "))), nil
	}

	sk := content.SkillInfo

	response := SkillResponse{
		Name:              sk.Name,
		Type:              string(sk.Type),
		Phase:             sk.Phase,
		Version:           sk.Version,
		Description:       sk.Description,
		Source:            string(sk.Source),
		Category:          string(sk.Category),
		Author:            sk.Author,
		Regions:           sk.Regions,
		Path:              sk.Path,
		OutputFormat:      string(sk.OutputFormat),
		ArtifactType:      sk.ArtifactType,
		RequiredArtifacts: sk.RequiredArtifacts,
		OptionalArtifacts: sk.OptionalArtifacts,
		RequiredTools:     sk.RequiredTools,
		Capability:        sk.Capability,
		Scope:             sk.Scope,
		HasManifest:       sk.HasManifest,
		HasPrompt:         sk.HasPrompt,
		HasSchema:         sk.HasSchema,
		HasValidator:      sk.HasValidator,
		HasTemplate:       sk.HasTemplate,
		LegacyFormat:      sk.LegacyFormat,
		Manifest:          content.ManifestContent,
		Guidance:          Guidance{},
	}

	// Include prompt if requested (default: include)
	if includePrompt != "false" && content.PromptContent != "" {
		response.Prompt = content.PromptContent
	}

	// Include schema if requested
	if includeSchema == "true" && content.SchemaContent != "" {
		response.Schema = content.SchemaContent
	}

	// In standalone mode, append tool scope text to the prompt.
	// Per design Decision 14: "Skill responses include PREFERRED TOOLS and AVOID TOOLS sections in text"
	if s.pluginInfo != nil && s.pluginInfo.StandaloneMode && sk.Scope != nil {
		scopeText := FormatSkillScope(sk.Scope.PreferredTools, sk.Scope.AvoidTools)
		if scopeText != "" && response.Prompt != "" {
			response.Prompt += scopeText
		}
	}

	// Build guidance
	if len(sk.RequiredArtifacts) > 0 {
		response.Guidance.Tips = append(response.Guidance.Tips,
			fmt.Sprintf("Requires: %s", strings.Join(sk.RequiredArtifacts, ", ")))
	}

	if sk.Type == skill.SkillTypeGeneration {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Follow the prompt instructions to generate output from EPF data")
		if sk.HasValidator {
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				fmt.Sprintf("After generation, validate output using: epf_validate_skill_output('%s', '<output>')", sk.Name))
		}
	} else if sk.Type == skill.SkillTypeCreation {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Follow the prompt instructions to create the EPF artifact")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"After creation, validate with epf_validate_file")
	}

	if sk.LegacyFormat {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"This skill was loaded from legacy format (generator.yaml / .wizard.md)")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Skill Scaffolding
// =============================================================================

// ScaffoldSkillResponse represents the response for epf_scaffold_skill.
type ScaffoldSkillResponse struct {
	Name         string   `json:"name"`
	Path         string   `json:"path"`
	FilesCreated []string `json:"files_created"`
	SkillType    string   `json:"type"`
	Category     string   `json:"category,omitempty"`
	OutputFormat string   `json:"output_format,omitempty"`
	Guidance     Guidance `json:"guidance"`
}

// handleScaffoldSkill handles the epf_scaffold_skill tool.
func (s *Server) handleScaffoldSkill(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	// Get optional parameters
	typeStr, _ := request.RequireString("type")
	description, _ := request.RequireString("description")
	categoryStr, _ := request.RequireString("category")
	author, _ := request.RequireString("author")
	outputDir, _ := request.RequireString("output_dir")
	outputDir = pathutil.ExpandTilde(outputDir)
	formatStr, _ := request.RequireString("output_format")
	requiredStr, _ := request.RequireString("required_artifacts")
	optionalStr, _ := request.RequireString("optional_artifacts")
	regionsStr, _ := request.RequireString("regions")

	// Parse skill type (default: "" which becomes "generation" for legacy compat)
	var skillType skill.SkillType
	if typeStr != "" {
		sType, err := skill.SkillTypeFromString(typeStr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid skill type '%s'. Valid types: creation, generation, review, enrichment, analysis", typeStr)), nil
		}
		skillType = sType
	}

	// Parse category
	category := skill.CategoryCustom
	if categoryStr != "" {
		cat, err := skill.CategoryFromString(categoryStr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid category '%s'. Valid: compliance, marketing, investor, internal, development, custom", categoryStr)), nil
		}
		category = cat
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
			return mcp.NewToolResultError(fmt.Sprintf("Invalid format '%s'. Valid: markdown, json, yaml, html, text", formatStr)), nil
		}
	}

	// Parse comma-separated lists
	var requiredArtifacts, optionalArtifacts, regions []string
	if requiredStr != "" {
		requiredArtifacts = splitAndTrim(requiredStr)
	}
	if optionalStr != "" {
		optionalArtifacts = splitAndTrim(optionalStr)
	}
	if regionsStr != "" {
		regions = splitAndTrim(regionsStr)
	}

	// Determine output directory
	if outputDir == "" {
		// Skills go into skills/ dir, but generation-type skills go to generators/
		// for backward compatibility
		if skillType == skill.SkillTypeGeneration || skillType == "" {
			outputDir = filepath.Join(instancePath, skill.InstanceGeneratorsDir)
		} else {
			outputDir = filepath.Join(instancePath, skill.InstanceSkillsDir)
		}
	}

	// Protect canonical EPF from accidental writes
	if isCanonicalEPFPath(outputDir) {
		return mcp.NewToolResultError("Cannot scaffold skill in canonical EPF repository.\n\nThe target path appears to be inside the canonical EPF framework.\nUse instance_path pointing to a product repository instead."), nil
	}

	// Default author
	if author == "" {
		author = "Custom"
	}

	opts := skill.ScaffoldOptions{
		Name:              name,
		Description:       description,
		Type:              skillType,
		Category:          category,
		Author:            author,
		OutputDir:         outputDir,
		RequiredArtifacts: requiredArtifacts,
		OptionalArtifacts: optionalArtifacts,
		OutputFormat:      outputFormat,
		Regions:           regions,
	}

	result, err := skill.Scaffold(opts)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to scaffold skill: %s", err.Error())), nil
	}

	response := ScaffoldSkillResponse{
		Name:         name,
		Path:         result.SkillPath,
		FilesCreated: result.FilesCreated,
		SkillType:    string(skillType),
		Category:     string(category),
		OutputFormat: string(outputFormat),
		Guidance: Guidance{
			NextSteps: result.NextSteps,
			Tips: []string{
				"Study existing skills for patterns: epf_list_skills()",
			},
		},
	}

	// Invalidate caches after scaffolding
	s.invalidateInstanceCaches(instancePath)

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Skill Prerequisites Check
// =============================================================================

// SkillPrerequisitesResponse represents the response for epf_check_skill_prereqs.
type SkillPrerequisitesResponse struct {
	SkillName           string   `json:"skill_name"`
	InstancePath        string   `json:"instance_path"`
	Ready               bool     `json:"ready"`
	MissingArtifacts    []string `json:"missing_artifacts,omitempty"`
	IncompleteArtifacts []string `json:"incomplete_artifacts,omitempty"`
	MissingTools        []string `json:"missing_tools,omitempty"`
	Suggestions         []string `json:"suggestions,omitempty"`
	Guidance            Guidance `json:"guidance"`
}

// handleCheckSkillPrereqs handles the epf_check_skill_prereqs tool.
func (s *Server) handleCheckSkillPrereqs(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return mcp.NewToolResultError("Skills not loaded. Ensure EPF skills/generators/wizards directory exists."), nil
	}

	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("name parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	sk, err := s.skillLoader.GetSkill(name)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Skill not found: %s", name)), nil
	}

	// Check prerequisites using the same pattern as generator prereqs
	prereqResult := checkSkillPrerequisites(sk, instancePath)

	response := SkillPrerequisitesResponse{
		SkillName:           sk.Name,
		InstancePath:        instancePath,
		Ready:               prereqResult.Ready,
		MissingArtifacts:    prereqResult.MissingArtifacts,
		IncompleteArtifacts: prereqResult.IncompleteArtifacts,
		MissingTools:        prereqResult.MissingTools,
		Suggestions:         prereqResult.Suggestions,
		Guidance:            Guidance{},
	}

	if prereqResult.Ready {
		response.Guidance.Tips = append(response.Guidance.Tips, "All prerequisites met — ready to use this skill")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Use epf_get_skill('%s') to get the skill prompt and instructions", sk.Name))
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings, "Missing required artifacts or tools")
		for _, missing := range prereqResult.MissingArtifacts {
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				fmt.Sprintf("Create %s artifact using appropriate EPF wizard or skill", missing))
		}
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// checkSkillPrerequisites checks if an EPF instance has required artifacts for a skill.
func checkSkillPrerequisites(sk *skill.SkillInfo, instancePath string) *skill.PrerequisiteResult {
	result := &skill.PrerequisiteResult{
		Ready: true,
	}

	// Map artifact types to file patterns.
	// Check both READY/ prefixed (standard phased structure) and root-level (flat structure).
	artifactPatterns := map[string][]string{
		"north_star":                {"READY/00_north_star.yaml", "00_north_star.yaml"},
		"insight_analyses":          {"READY/01_insight_analyses.yaml", "01_insight_analyses.yaml"},
		"strategy_foundations":      {"READY/02_strategy_foundations.yaml", "02_strategy_foundations.yaml"},
		"insight_opportunity":       {"READY/03_insight_opportunity.yaml", "03_insight_opportunity.yaml"},
		"strategy_formula":          {"READY/04_strategy_formula.yaml", "04_strategy_formula.yaml"},
		"roadmap_recipe":            {"READY/05_roadmap_recipe.yaml", "05_roadmap_recipe.yaml"},
		"personas":                  {"READY/00_north_star.yaml", "00_north_star.yaml"}, // Personas live in north_star
		"value_models":              {"FIRE/value_models/*.yaml", "value_models/*.yaml"},
		"value_model":               {"FIRE/value_models/*.yaml", "value_models/*.yaml"},
		"feature_definitions":       {"FIRE/definitions/product/*.yaml", "FIRE/feature_definitions/*.yaml", "definitions/product/*.yaml"},
		"feature_definition":        {"FIRE/definitions/product/*.yaml", "FIRE/feature_definitions/*.yaml", "definitions/product/*.yaml"},
		"living_reality_assessment": {"AIM/living_reality_assessment.yaml", "living_reality_assessment.yaml"},
	}

	for _, required := range sk.RequiredArtifacts {
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

	// Check for incomplete artifacts (exist but have placeholder content)
	for _, required := range sk.RequiredArtifacts {
		patterns, ok := artifactPatterns[required]
		if !ok {
			continue
		}

		for _, pattern := range patterns {
			fullPattern := fmt.Sprintf("%s/%s", instancePath, pattern)
			matches, err := filepath.Glob(fullPattern)
			if err != nil || len(matches) == 0 {
				continue
			}

			// Check if file has placeholder content (TBD, TODO)
			for _, match := range matches {
				data, readErr := os.ReadFile(match)
				if readErr != nil {
					continue
				}
				content := string(data)
				if strings.Contains(content, "TBD") || strings.Contains(content, "TODO") || strings.Contains(content, "[INSERT") {
					result.IncompleteArtifacts = append(result.IncompleteArtifacts,
						fmt.Sprintf("%s (contains placeholder content)", required))
					break
				}
			}
			break
		}
	}

	// Check for missing required tools
	for _, tool := range sk.RequiredTools {
		// Tools are MCP-provided; we can't check availability at prereq time,
		// but we surface them so the caller knows what's needed
		result.MissingTools = append(result.MissingTools, tool)
	}
	// If all tools are just informational (not actually missing), clear the field
	// In practice, we can't verify tool availability here, so we mark them as
	// "required but unverifiable" in suggestions instead
	if len(sk.RequiredTools) > 0 {
		result.MissingTools = nil // Don't mark as missing; add as suggestion
		result.Suggestions = append(result.Suggestions,
			fmt.Sprintf("This skill requires %d MCP tool(s): %s", len(sk.RequiredTools), strings.Join(sk.RequiredTools, ", ")))
	}

	// Add suggestions
	if len(result.MissingArtifacts) > 0 {
		result.Suggestions = append(result.Suggestions,
			"Run appropriate EPF wizards or skills to create missing artifacts")
		result.Suggestions = append(result.Suggestions,
			"Use epf_get_agent_for_task to find the right agent for each artifact")
	}
	if len(result.IncompleteArtifacts) > 0 {
		result.Suggestions = append(result.Suggestions,
			"Some artifacts contain placeholder content (TBD/TODO) that should be filled in")
	}

	return result
}

// =============================================================================
// Skill Output Validation
// =============================================================================

// SkillValidationResponse represents the response for epf_validate_skill_output.
type SkillValidationResponse struct {
	SkillName string                          `json:"skill_name"`
	FilePath  string                          `json:"file_path,omitempty"`
	Valid     bool                            `json:"valid"`
	Errors    []string                        `json:"errors,omitempty"`
	Warnings  []string                        `json:"warnings,omitempty"`
	Layers    map[string]SkillValidationLayer `json:"layers,omitempty"`
	Guidance  Guidance                        `json:"guidance"`
}

// SkillValidationLayer represents results from a single validation layer.
type SkillValidationLayer struct {
	Name     string   `json:"name"`
	Passed   bool     `json:"passed"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// handleValidateSkillOutput handles the epf_validate_skill_output tool.
func (s *Server) handleValidateSkillOutput(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return mcp.NewToolResultError("Skills not loaded. Ensure EPF skills/generators/wizards directory exists."), nil
	}

	skillName, err := request.RequireString("skill")
	if err != nil {
		return mcp.NewToolResultError("skill parameter is required"), nil
	}

	// Get content or file path
	content, _ := request.RequireString("content")
	filePath, _ := request.RequireString("file_path")
	filePath = pathutil.ExpandTilde(filePath)

	if content == "" && filePath == "" {
		return mcp.NewToolResultError("Either 'content' or 'file_path' parameter is required"), nil
	}

	// Check if bash validation is requested
	runBashStr, _ := request.RequireString("run_bash_validator")
	runBash := runBashStr == "true" || runBashStr == "1"

	// Create validator
	validator := skill.NewOutputValidator(s.skillLoader)

	// Run validation
	result, err := validator.Validate(ctx, skill.ValidateOptions{
		Skill:            skillName,
		Content:          content,
		FilePath:         filePath,
		RunBashValidator: runBash,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	// Build response
	response := SkillValidationResponse{
		SkillName: skillName,
		FilePath:  filePath,
		Valid:     result.Valid,
		Errors:    result.Errors,
		Warnings:  result.Warnings,
		Layers:    make(map[string]SkillValidationLayer),
		Guidance:  Guidance{},
	}

	// Convert layer results
	for layerName, layer := range result.Layers {
		response.Layers[layerName] = SkillValidationLayer{
			Name:     layer.Name,
			Passed:   layer.Passed,
			Errors:   layer.Errors,
			Warnings: layer.Warnings,
		}
	}

	// Build guidance
	if result.Valid {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"Output is valid and conforms to the skill's schema")
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			"Output has validation errors that need to be fixed")

		if len(result.Errors) > 0 {
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				"Review the errors above and update the output accordingly")
			response.Guidance.NextSteps = append(response.Guidance.NextSteps,
				fmt.Sprintf("Re-run validation after fixes: epf_validate_skill_output('%s', ...)", skillName))
		}
	}

	// Suggest running bash validator if not already run
	sk, _ := s.skillLoader.GetSkill(skillName)
	if sk != nil && sk.HasValidator && !runBash {
		response.Guidance.Tips = append(response.Guidance.Tips,
			"Bash validator available. Run with run_bash_validator=true for additional validation")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Helper functions
// =============================================================================

// capitalizeFirst capitalizes the first letter of a string.
func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// splitAndTrim splits a comma-separated string and trims whitespace.
func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// =============================================================================
// Skill Import Tool
// =============================================================================

// handleImportSkill handles the epf_import_skill tool.
func (s *Server) handleImportSkill(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	source, err := request.RequireString("source")
	if err != nil {
		return mcp.NewToolResultError("Missing required parameter 'source'"), nil
	}

	instancePath := s.resolveInstancePath(request)

	formatStr, _ := request.RequireString("format")
	forceStr, _ := request.RequireString("force")
	force := forceStr == "true"

	format, err := skill.ImportFormatFromString(formatStr)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Resolve source path
	if !filepath.IsAbs(source) {
		source = filepath.Join(instancePath, source)
	}

	result, err := skill.ImportSkill(source, instancePath, format, force)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Import failed: %s", err.Error())), nil
	}

	// Build response
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Successfully imported skill '%s' from %s format.\n\n", result.SkillName, result.Format))
	sb.WriteString("**Files created:**\n")
	sb.WriteString(fmt.Sprintf("- Manifest: `%s`\n", result.ManifestPath))
	sb.WriteString(fmt.Sprintf("- Prompt: `%s`\n", result.PromptPath))

	if len(result.TodoFields) > 0 {
		sb.WriteString("\n**Fields to review (marked with TODO):**\n")
		for _, field := range result.TodoFields {
			sb.WriteString(fmt.Sprintf("- %s\n", field))
		}
	}

	sb.WriteString("\n**Next steps:**\n")
	sb.WriteString(fmt.Sprintf("1. Review the generated manifest: `%s`\n", result.ManifestPath))
	sb.WriteString(fmt.Sprintf("2. Verify with: `epf_get_skill { \"name\": \"%s\" }`\n", result.SkillName))

	jsonBytes, _ := json.MarshalIndent(result, "", "  ")
	sb.WriteString(fmt.Sprintf("\n```json\n%s\n```\n", string(jsonBytes)))

	return mcp.NewToolResultText(sb.String()), nil
}
