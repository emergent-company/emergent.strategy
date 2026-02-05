package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/fixplan"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/template"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	validateAIFriendly  bool
	validateJSON        bool
	validateVerbose     bool
	validateFixPlan     bool
	validateSection     string
	validateSections    string
	validateContinueErr bool
)

var validateCmd = &cobra.Command{
	Use:   "validate [path]",
	Short: "Validate EPF YAML files against schemas",
	Long: `Validate EPF artifacts against their corresponding JSON schemas.

Output Formats:
  --ai-friendly    Structured YAML output optimized for AI agents, with:
                   - Errors grouped by section
                   - Full field paths (e.g., "key_insights[0].insight")
                   - Error classification (type_mismatch, invalid_enum, etc.)
                   - Priority levels (critical, high, medium, low)
                   - Actionable fix hints
                   - Suggested fix order

  --fix-plan       Generate a chunked fix plan for AI agents, with:
                   - Errors grouped into manageable chunks (~10 errors each)
                   - Chunk priorities (urgent, normal, low)
                   - Estimated time to fix
                   - Fix strategies per chunk
                   - Context size estimates per chunk

  --section <path> Validate only a specific section of the file:
                   - Useful for incremental fixes
                   - Shows only errors within that section
                   - Supports nested paths (e.g., "competitive_landscape.direct_competitors")

  --sections <paths> Validate multiple sections (comma-separated):
                   - e.g., --sections "target_users,key_insights,competitive_landscape"
                   - Validates each section independently
                   - By default, stops on first section with errors

  --continue-on-error Continue validating remaining sections even if errors found:
                   - Use with --sections for comprehensive validation
                   - Reports all sections with errors at the end

  --json           JSON output (works with --ai-friendly and --fix-plan)
  
  Default output is human-readable text.

Examples:
  epf-cli validate .                                    # Validate all EPF files
  epf-cli validate READY/01_insight_analyses.yaml       # Validate single file
  epf-cli validate . --ai-friendly                      # AI-optimized output
  epf-cli validate . --ai-friendly --json               # AI output as JSON
  epf-cli validate . --fix-plan                         # Generate fix plan
  epf-cli validate file.yaml --section target_users     # Validate only target_users section
  epf-cli validate file.yaml --section key_insights --ai-friendly  # AI output for one section
  epf-cli validate file.yaml --sections "target_users,key_insights" --continue-on-error  # Multiple sections
  epf-cli validate --schema custom.json file.yaml       # Use specific schema`,
	Args: cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		schemaOverride, _ := cmd.Flags().GetString("schema")
		path := args[0]

		// Get schemas directory
		schemasPath, err := GetSchemasDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Could not find schemas directory: %v\n", err)
			os.Exit(1)
		}

		// Create validator
		val, err := validator.NewValidator(schemasPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Could not initialize validator: %v\n", err)
			os.Exit(1)
		}

		// Check if path is a file or directory
		info, err := os.Stat(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Cannot access %s: %v\n", path, err)
			os.Exit(1)
		}

		// Section validation requires a single file
		if validateSection != "" {
			if info.IsDir() {
				fmt.Fprintf(os.Stderr, "Error: --section flag requires a single file, not a directory\n")
				os.Exit(1)
			}
			runSectionValidation(val, path, validateSection)
			return
		}

		// Multi-section validation
		if validateSections != "" {
			if info.IsDir() {
				fmt.Fprintf(os.Stderr, "Error: --sections flag requires a single file, not a directory\n")
				os.Exit(1)
			}
			runMultiSectionValidation(val, path, validateSections)
			return
		}

		var results []*validator.ValidationResult
		var aiResults []*validator.AIFriendlyResult

		if info.IsDir() {
			// Validate all YAML files in directory
			results, aiResults = validateDirectory(val, path)
		} else {
			// Validate single file
			result, aiResult := validateSingleFile(val, path, schemaOverride)
			if result != nil {
				results = append(results, result)
			}
			if aiResult != nil {
				aiResults = append(aiResults, aiResult)
			}
		}

		// Output results
		hasErrors := false
		if validateFixPlan {
			hasErrors = outputFixPlan(aiResults)
		} else if validateAIFriendly {
			hasErrors = outputAIFriendly(aiResults)
		} else {
			hasErrors = outputHumanReadable(results)
		}

		if hasErrors {
			os.Exit(1)
		}
	},
}

func validateSingleFile(val *validator.Validator, path string, schemaOverride string) (*validator.ValidationResult, *validator.AIFriendlyResult) {
	// Basic validation
	result, err := val.ValidateFile(path)
	if err != nil {
		if !validateJSON && !validateAIFriendly && !validateFixPlan {
			fmt.Fprintf(os.Stderr, "Error validating %s: %v\n", path, err)
		}
		return nil, nil
	}

	// If AI-friendly or fix-plan output is requested, also get enhanced errors
	var aiResult *validator.AIFriendlyResult
	if (validateAIFriendly || validateFixPlan) && !result.Valid {
		// Create enhanced AI-friendly result with schema introspection
		aiResult = createAIResultFromBasic(val, path, result)
	}

	return result, aiResult
}

func validateDirectory(val *validator.Validator, dirPath string) ([]*validator.ValidationResult, []*validator.AIFriendlyResult) {
	var results []*validator.ValidationResult
	var aiResults []*validator.AIFriendlyResult

	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}

		// Skip hidden and metadata files
		base := filepath.Base(path)
		if strings.HasPrefix(base, "_") || strings.HasPrefix(base, ".") {
			return nil
		}

		result, aiResult := validateSingleFile(val, path, "")
		if result != nil {
			results = append(results, result)
		}
		if aiResult != nil {
			aiResults = append(aiResults, aiResult)
		}

		return nil
	})

	return results, aiResults
}

// runSectionValidation validates only a specific section of a file
func runSectionValidation(val *validator.Validator, filePath string, sectionPath string) {
	// Validate the section
	result, err := val.ValidateSection(filePath, sectionPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Create AI-friendly result if needed
	var aiResult *validator.AIFriendlyResult
	if (validateAIFriendly || validateFixPlan) && !result.Valid {
		aiResult = createAIResultFromSectionValidation(val, filePath, sectionPath, result)
	}

	// Output based on format
	if validateFixPlan && aiResult != nil {
		outputFixPlan([]*validator.AIFriendlyResult{aiResult})
	} else if validateAIFriendly && aiResult != nil {
		outputAIFriendly([]*validator.AIFriendlyResult{aiResult})
	} else {
		outputSectionResult(result, sectionPath)
	}

	if !result.Valid {
		os.Exit(1)
	}
}

// MultiSectionResult holds validation results for multiple sections
type MultiSectionResult struct {
	File            string                  `yaml:"file" json:"file"`
	TotalSections   int                     `yaml:"total_sections" json:"total_sections"`
	ValidSections   int                     `yaml:"valid_sections" json:"valid_sections"`
	InvalidSections int                     `yaml:"invalid_sections" json:"invalid_sections"`
	SectionResults  []*SectionResultSummary `yaml:"section_results" json:"section_results"`
}

// SectionResultSummary is a summary of validation for a single section
type SectionResultSummary struct {
	Section    string `yaml:"section" json:"section"`
	Valid      bool   `yaml:"valid" json:"valid"`
	ErrorCount int    `yaml:"error_count" json:"error_count"`
}

// runMultiSectionValidation validates multiple sections of a file
func runMultiSectionValidation(val *validator.Validator, filePath string, sectionsCSV string) {
	sections := strings.Split(sectionsCSV, ",")
	for i := range sections {
		sections[i] = strings.TrimSpace(sections[i])
	}

	var allResults []*validator.ValidationResult
	var allAIResults []*validator.AIFriendlyResult
	var sectionSummaries []*SectionResultSummary
	hasErrors := false

	for _, section := range sections {
		if section == "" {
			continue
		}

		result, err := val.ValidateSection(filePath, section)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error validating section '%s': %v\n", section, err)
			if !validateContinueErr {
				os.Exit(1)
			}
			// Create a failed result for this section
			sectionSummaries = append(sectionSummaries, &SectionResultSummary{
				Section:    section,
				Valid:      false,
				ErrorCount: 1,
			})
			hasErrors = true
			continue
		}

		allResults = append(allResults, result)
		sectionSummaries = append(sectionSummaries, &SectionResultSummary{
			Section:    section,
			Valid:      result.Valid,
			ErrorCount: len(result.Errors),
		})

		if !result.Valid {
			hasErrors = true
			if validateAIFriendly || validateFixPlan {
				aiResult := createAIResultFromSectionValidation(val, filePath, section, result)
				allAIResults = append(allAIResults, aiResult)
			}

			// Stop on first error unless --continue-on-error is set
			if !validateContinueErr {
				break
			}
		}
	}

	// Output results
	if validateFixPlan && len(allAIResults) > 0 {
		outputFixPlan(allAIResults)
	} else if validateAIFriendly && len(allAIResults) > 0 {
		outputMultiSectionAIFriendly(filePath, sectionSummaries, allAIResults)
	} else {
		outputMultiSectionHumanReadable(filePath, sectionSummaries, allResults)
	}

	if hasErrors {
		os.Exit(1)
	}
}

// outputMultiSectionAIFriendly outputs AI-friendly results for multiple sections
func outputMultiSectionAIFriendly(filePath string, summaries []*SectionResultSummary, results []*validator.AIFriendlyResult) {
	validCount := 0
	invalidCount := 0
	for _, s := range summaries {
		if s.Valid {
			validCount++
		} else {
			invalidCount++
		}
	}

	output := map[string]interface{}{
		"file":              filePath,
		"total_sections":    len(summaries),
		"valid_sections":    validCount,
		"invalid_sections":  invalidCount,
		"section_summaries": summaries,
		"detailed_results":  results,
	}

	if validateJSON {
		data, _ := json.MarshalIndent(output, "", "  ")
		fmt.Println(string(data))
	} else {
		data, _ := yaml.Marshal(output)
		fmt.Println(string(data))
	}
}

// outputMultiSectionHumanReadable outputs human-readable results for multiple sections
func outputMultiSectionHumanReadable(filePath string, summaries []*SectionResultSummary, results []*validator.ValidationResult) {
	fmt.Printf("File: %s\n", filePath)
	fmt.Println(strings.Repeat("=", 60))

	validCount := 0
	for _, summary := range summaries {
		if summary.Valid {
			validCount++
			fmt.Printf("✓ Section '%s' is valid\n", summary.Section)
		} else {
			fmt.Printf("✗ Section '%s' has %d error(s)\n", summary.Section, summary.ErrorCount)
		}
	}

	// Show detailed errors for invalid sections
	fmt.Println()
	for _, result := range results {
		if !result.Valid {
			fmt.Printf("Errors in section:\n")
			for _, err := range result.Errors {
				formatted := validator.FormatErrorWithExplanation(err.Message, true)
				fmt.Printf("  • %s\n", formatted)
			}
			fmt.Println()
		}
	}

	// Summary
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Summary: %d/%d sections valid\n", validCount, len(summaries))
}

// createAIResultFromSectionValidation creates an AI-friendly result for section validation
func createAIResultFromSectionValidation(val *validator.Validator, filePath, sectionPath string, result *validator.ValidationResult) *validator.AIFriendlyResult {
	var enhancedErrors []*validator.EnhancedValidationError

	introspector := val.GetSchemaIntrospector()
	schemaFile := val.GetSchemaFileForArtifact(result.ArtifactType)

	for _, err := range result.Errors {
		jsonPointer := ""
		if idx := strings.Index(err.Path, "#"); idx != -1 {
			jsonPointer = err.Path[idx+1:]
		}

		enhanced := &validator.EnhancedValidationError{
			Path:        extractPathFromError(err),
			JSONPointer: jsonPointer,
			Message:     err.Message,
		}

		classifyBasicError(enhanced, err.Message)
		enhanced.Priority = validator.PriorityMedium
		if enhanced.ErrorType == validator.ErrorTypeMismatch || enhanced.ErrorType == validator.ErrorMissingRequired {
			enhanced.Priority = validator.PriorityCritical
		} else if enhanced.ErrorType == validator.ErrorInvalidEnum {
			enhanced.Priority = validator.PriorityHigh
		}

		if enhanced.ErrorType == validator.ErrorTypeMismatch && enhanced.Details.ExpectedType == "object" {
			if schemaFile != "" && jsonPointer != "" {
				expectedStructure := introspector.ExtractExpectedStructure(schemaFile, jsonPointer)
				if expectedStructure != nil && len(expectedStructure) > 0 {
					enhanced.Details.ExpectedStructure = expectedStructure
				}
			}
		}

		enhanced.FixHint = generateBasicFixHint(enhanced)
		enhancedErrors = append(enhancedErrors, enhanced)
	}

	aiResult := validator.CreateAIFriendlyResult(filePath, result.ArtifactType, enhancedErrors)
	// Add section info to the result
	aiResult.Section = sectionPath
	return aiResult
}

// outputSectionResult outputs section validation result in human-readable format
func outputSectionResult(result *validator.ValidationResult, sectionPath string) {
	fmt.Printf("Section: %s\n", sectionPath)
	fmt.Printf("File: %s\n", result.FilePath)
	fmt.Println(strings.Repeat("-", 50))

	if result.Valid {
		fmt.Printf("✓ Section '%s' is valid\n", sectionPath)
	} else {
		fmt.Printf("✗ Section '%s' has %d error(s)\n\n", sectionPath, len(result.Errors))
		for _, err := range result.Errors {
			formatted := validator.FormatErrorWithExplanation(err.Message, true)
			fmt.Printf("  • %s\n", formatted)
		}
	}
}

func createAIResultFromBasic(val *validator.Validator, filePath string, result *validator.ValidationResult) *validator.AIFriendlyResult {
	var enhancedErrors []*validator.EnhancedValidationError

	// Get schema introspector for extracting expected structures
	introspector := val.GetSchemaIntrospector()
	schemaFile := val.GetSchemaFileForArtifact(result.ArtifactType)

	for _, err := range result.Errors {
		// Extract the JSON pointer from the error path
		jsonPointer := ""
		if idx := strings.Index(err.Path, "#"); idx != -1 {
			jsonPointer = err.Path[idx+1:]
		}

		enhanced := &validator.EnhancedValidationError{
			Path:        extractPathFromError(err),
			JSONPointer: jsonPointer,
			Message:     err.Message,
		}

		// Classify the error
		classifyBasicError(enhanced, err.Message)
		enhanced.Priority = validator.PriorityMedium // Default, will be overridden
		if enhanced.ErrorType == validator.ErrorTypeMismatch || enhanced.ErrorType == validator.ErrorMissingRequired {
			enhanced.Priority = validator.PriorityCritical
		} else if enhanced.ErrorType == validator.ErrorInvalidEnum {
			enhanced.Priority = validator.PriorityHigh
		}

		// For type mismatches where we expect an object, extract expected structure
		if enhanced.ErrorType == validator.ErrorTypeMismatch && enhanced.Details.ExpectedType == "object" {
			if schemaFile != "" && jsonPointer != "" {
				expectedStructure := introspector.ExtractExpectedStructure(schemaFile, jsonPointer)
				if expectedStructure != nil && len(expectedStructure) > 0 {
					enhanced.Details.ExpectedStructure = expectedStructure
				}
			}
		}

		// Generate fix hint
		enhanced.FixHint = generateBasicFixHint(enhanced)

		enhancedErrors = append(enhancedErrors, enhanced)
	}

	return validator.CreateAIFriendlyResult(filePath, result.ArtifactType, enhancedErrors)
}

func extractPathFromError(err validator.ValidationError) string {
	// Try to extract path from the error path field (format: "file#/json/pointer")
	path := err.Path
	if idx := strings.Index(path, "#"); idx != -1 {
		jsonPointer := path[idx+1:]
		return jsonPointerToHumanPath(jsonPointer)
	}
	return path
}

func jsonPointerToHumanPath(pointer string) string {
	if pointer == "" || pointer == "/" {
		return "(root)"
	}

	pointer = strings.TrimPrefix(pointer, "/")
	parts := strings.Split(pointer, "/")
	var result strings.Builder

	for i, part := range parts {
		// Check if part is a number (array index)
		isNum := true
		for _, c := range part {
			if c < '0' || c > '9' {
				isNum = false
				break
			}
		}

		if isNum && len(part) > 0 {
			result.WriteString("[")
			result.WriteString(part)
			result.WriteString("]")
		} else {
			// Add dot separator if:
			// - Not the first element AND
			// - Result already has content (handles case after array index)
			if i > 0 && result.Len() > 0 {
				result.WriteString(".")
			}
			result.WriteString(part)
		}
	}

	return result.String()
}

func classifyBasicError(enhanced *validator.EnhancedValidationError, message string) {
	msg := strings.ToLower(message)

	switch {
	case strings.Contains(msg, "expected") && strings.Contains(msg, "but got"):
		enhanced.ErrorType = validator.ErrorTypeMismatch
		// Extract types
		if strings.Contains(msg, "object") && strings.Contains(msg, "string") {
			enhanced.Details.ExpectedType = "object"
			enhanced.Details.ActualType = "string"
		} else if strings.Contains(msg, "array") && strings.Contains(msg, "string") {
			enhanced.Details.ExpectedType = "array"
			enhanced.Details.ActualType = "string"
		}

	case strings.Contains(msg, "missing properties"):
		enhanced.ErrorType = validator.ErrorMissingRequired

	case strings.Contains(msg, "must be one of"):
		enhanced.ErrorType = validator.ErrorInvalidEnum

	case strings.Contains(msg, "length must be"):
		enhanced.ErrorType = validator.ErrorConstraintViolation
		enhanced.Details.Constraint = "length"

	case strings.Contains(msg, "minimum") && strings.Contains(msg, "items"):
		enhanced.ErrorType = validator.ErrorConstraintViolation
		enhanced.Details.Constraint = "minItems"

	case strings.Contains(msg, "additionalproperties"):
		enhanced.ErrorType = validator.ErrorUnknownField

	case strings.Contains(msg, "does not match pattern"):
		enhanced.ErrorType = validator.ErrorPatternMismatch

	default:
		enhanced.ErrorType = validator.ErrorUnknown
	}
}

func generateBasicFixHint(enhanced *validator.EnhancedValidationError) string {
	switch enhanced.ErrorType {
	case validator.ErrorTypeMismatch:
		if enhanced.Details.ExpectedType == "object" && enhanced.Details.ActualType == "string" {
			return "Convert string value to an object with required fields. Run 'epf-cli schemas show <type> --path <field>' to see expected structure"
		}
		if enhanced.Details.ExpectedType == "array" && enhanced.Details.ActualType == "string" {
			return "Convert string to array format with - item syntax"
		}
		return "Change value type to match expected schema type"

	case validator.ErrorMissingRequired:
		return "Add the required field(s) with appropriate values"

	case validator.ErrorInvalidEnum:
		return "Use one of the allowed values from the schema"

	case validator.ErrorConstraintViolation:
		if enhanced.Details.Constraint == "length" {
			return "Expand text content to meet minimum length requirement"
		}
		return "Adjust value to meet schema constraints"

	case validator.ErrorUnknownField:
		return "Remove unknown field or check spelling. Run 'epf-cli schemas show <type>' to see valid fields"

	default:
		return "Check schema requirements for this field"
	}
}

func outputAIFriendly(results []*validator.AIFriendlyResult) bool {
	hasErrors := false

	for _, result := range results {
		if !result.Valid {
			hasErrors = true
		}
	}

	// Wrap in a container if multiple files
	var output interface{}
	if len(results) == 1 {
		output = results[0]
	} else {
		output = map[string]interface{}{
			"total_files":       len(results),
			"files_with_errors": countInvalidFiles(results),
			"results":           results,
		}
	}

	if validateJSON {
		data, _ := json.MarshalIndent(output, "", "  ")
		fmt.Println(string(data))
	} else {
		data, _ := yaml.Marshal(output)
		fmt.Println(string(data))
	}

	return hasErrors
}

func outputFixPlan(results []*validator.AIFriendlyResult) bool {
	hasErrors := false

	// Load templates for including examples in fix plan
	var tmplLoader *template.Loader
	epfRoot, err := GetEPFRoot()
	if err == nil {
		tmplLoader = template.NewLoader(epfRoot)
		if loadErr := tmplLoader.Load(); loadErr != nil {
			// Try embedded templates as fallback
			tmplLoader = template.NewEmbeddedLoader()
			_ = tmplLoader.Load() // Ignore error - templates are optional
		}
	} else {
		// Try embedded templates
		tmplLoader = template.NewEmbeddedLoader()
		_ = tmplLoader.Load()
	}

	// Create fix plan generator with template examples enabled
	gen := fixplan.NewGenerator(fixplan.GeneratorOptions{
		MaxErrorsPerChunk: 10,
		MaxCharsPerChunk:  6000,
		IncludeExamples:   true,
	})

	var plans []*fixplan.FixPlan
	for _, result := range results {
		if !result.Valid {
			hasErrors = true
		}

		// Load template for this artifact type if available
		if tmplLoader != nil && result.ArtifactType != "" {
			artifactType, typeErr := schema.ArtifactTypeFromString(result.ArtifactType)
			if typeErr == nil {
				if tmpl, tmplErr := tmplLoader.GetTemplate(artifactType); tmplErr == nil {
					gen.SetTemplate(result.ArtifactType, tmpl.Content)
				}
			}
		}

		plan := gen.Generate(result)
		plans = append(plans, plan)
	}

	// Output
	var output interface{}
	if len(plans) == 1 {
		output = plans[0]
	} else {
		totalChunks := 0
		totalErrors := 0
		for _, p := range plans {
			totalChunks += p.TotalChunks
			totalErrors += p.TotalErrors
		}
		output = map[string]interface{}{
			"total_files":  len(plans),
			"total_errors": totalErrors,
			"total_chunks": totalChunks,
			"fix_plans":    plans,
		}
	}

	if validateJSON {
		data, _ := json.MarshalIndent(output, "", "  ")
		fmt.Println(string(data))
	} else {
		data, _ := yaml.Marshal(output)
		fmt.Println(string(data))
	}

	return hasErrors
}

func countInvalidFiles(results []*validator.AIFriendlyResult) int {
	count := 0
	for _, r := range results {
		if !r.Valid {
			count++
		}
	}
	return count
}

func outputHumanReadable(results []*validator.ValidationResult) bool {
	hasErrors := false
	validCount := 0
	invalidCount := 0

	for _, result := range results {
		if result.Valid {
			validCount++
			if validateVerbose {
				fmt.Printf("✓ %s\n", result.FilePath)
			}
		} else {
			invalidCount++
			hasErrors = true
			fmt.Printf("✗ %s\n", result.FilePath)
			for _, err := range result.Errors {
				// Format the error with explanation
				formatted := validator.FormatErrorWithExplanation(err.Message, true)
				fmt.Printf("  • %s\n", formatted)
			}
		}
	}

	// Summary
	fmt.Println()
	if hasErrors {
		fmt.Printf("Validation: %d/%d files valid\n", validCount, validCount+invalidCount)
	} else {
		fmt.Printf("✓ Validation passed: %d file(s) valid\n", validCount)
	}

	return hasErrors
}

func init() {
	rootCmd.AddCommand(validateCmd)
	validateCmd.Flags().StringP("schema", "s", "", "explicit schema file to validate against")
	validateCmd.Flags().BoolVar(&validateAIFriendly, "ai-friendly", false, "output structured YAML optimized for AI agents")
	validateCmd.Flags().BoolVar(&validateFixPlan, "fix-plan", false, "generate chunked fix plan for AI agents")
	validateCmd.Flags().BoolVar(&validateJSON, "json", false, "output as JSON (can combine with --ai-friendly or --fix-plan)")
	validateCmd.Flags().BoolVarP(&validateVerbose, "verbose", "v", false, "show valid files too")
	validateCmd.Flags().StringVar(&validateSection, "section", "", "validate only a specific section (e.g., 'target_users', 'competitive_landscape.direct_competitors')")
	validateCmd.Flags().StringVar(&validateSections, "sections", "", "validate multiple sections (comma-separated, e.g., 'target_users,key_insights')")
	validateCmd.Flags().BoolVar(&validateContinueErr, "continue-on-error", false, "continue validating remaining sections even if errors found (use with --sections)")
}
