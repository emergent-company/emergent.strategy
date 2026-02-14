package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/context"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/fixplan"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validation"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
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
	validateExplain     string
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
  epf-cli validate file.yaml --explain "target_users[0].problems[0].severity"  # Explain a field
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

		// Load instance context for product-aware validation
		// Try to find EPF instance root from the path
		instancePath := findEPFInstanceRoot(path)
		var ctx *context.InstanceContext
		if instancePath != "" {
			ctx = context.LoadInstanceContext(instancePath)
			// Display product context header (unless JSON output requested)
			if ctx.Found && !validateJSON {
				displayProductContext(ctx)
			}
		}

		// Check if path is a file or directory
		info, err := os.Stat(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Cannot access %s: %v\n", path, err)
			os.Exit(1)
		}

		// Explain field mode - requires a single file
		if validateExplain != "" {
			if info.IsDir() {
				fmt.Fprintf(os.Stderr, "Error: --explain flag requires a single file, not a directory\n")
				os.Exit(1)
			}
			runExplainField(val, path, validateExplain)
			return
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
			results, aiResults = validateDirectory(val, path, ctx)
		} else {
			// Validate single file
			result, aiResult := validateSingleFile(val, path, schemaOverride, ctx)
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

func validateSingleFile(val *validator.Validator, path string, schemaOverride string, ctx *context.InstanceContext) (*validator.ValidationResult, *validator.AIFriendlyResult) {
	// Basic validation
	result, err := val.ValidateFile(path)
	if err != nil {
		if !validateJSON && !validateAIFriendly && !validateFixPlan {
			fmt.Fprintf(os.Stderr, "Error validating %s: %v\n", path, err)
		}
		return nil, nil
	}

	// Run product-aware validation checks if context available
	if ctx != nil && ctx.Found {
		if !validateAIFriendly && !validateFixPlan && !validateJSON {
			// Human-readable output: print warnings
			runProductAwareChecks(path, ctx)
		}
	}

	// If AI-friendly or fix-plan output is requested, create enhanced result
	var aiResult *validator.AIFriendlyResult
	if validateAIFriendly || validateFixPlan {
		// Create enhanced AI-friendly result with schema introspection
		// Always create it when AI-friendly output is requested so that:
		// 1. Schema validation errors are included (if any)
		// 2. Product context is included (if available)
		// 3. Template warnings are included (if any)
		// 4. Semantic alignment warnings are included (if any)
		aiResult = createAIResultFromBasicWithContext(val, path, result, ctx)
	}

	return result, aiResult
}

func validateDirectory(val *validator.Validator, dirPath string, ctx *context.InstanceContext) ([]*validator.ValidationResult, []*validator.AIFriendlyResult) {
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

		result, aiResult := validateSingleFile(val, path, "", ctx)
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
				if len(expectedStructure) > 0 {
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
				if len(expectedStructure) > 0 {
					enhanced.Details.ExpectedStructure = expectedStructure
				}
			}
		}

		// Generate fix hint
		enhanced.FixHint = generateBasicFixHint(enhanced)

		enhancedErrors = append(enhancedErrors, enhanced)
	}

	// Add per-field examples from templates
	addFieldExamplesToErrors(enhancedErrors, result.ArtifactType)

	return validator.CreateAIFriendlyResult(filePath, result.ArtifactType, enhancedErrors)
}

// createAIResultFromBasicWithContext creates an AI-friendly result with product context
func createAIResultFromBasicWithContext(val *validator.Validator, filePath string, result *validator.ValidationResult, ctx *context.InstanceContext) *validator.AIFriendlyResult {
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
				if len(expectedStructure) > 0 {
					enhanced.Details.ExpectedStructure = expectedStructure
				}
			}
		}

		// Generate fix hint
		enhanced.FixHint = generateBasicFixHint(enhanced)

		enhancedErrors = append(enhancedErrors, enhanced)
	}

	// Add per-field examples from templates
	addFieldExamplesToErrors(enhancedErrors, result.ArtifactType)

	// Collect product context and warnings
	var productContext map[string]interface{}
	var templateWarnings []map[string]interface{}
	var semanticWarnings []map[string]interface{}

	// Always collect template warnings (they don't require product context)
	templateWarnings = collectTemplateWarnings(filePath)

	if ctx != nil && ctx.Found {
		// Convert context to map for AI-friendly output
		productContext = map[string]interface{}{
			"product_name": ctx.ProductName,
			"description":  ctx.Description,
			"domain":       ctx.Domain,
			"keywords":     ctx.GetKeywords(),
			"source":       strings.Join(ctx.SourceFiles, ", "),
		}

		// Collect semantic alignment warnings (require product context)
		semanticWarnings = collectSemanticWarnings(filePath, ctx)
	}

	return validator.CreateAIFriendlyResultWithContext(filePath, result.ArtifactType, enhancedErrors, productContext, templateWarnings, semanticWarnings)
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

// addFieldExamplesToErrors populates the Example field on each error using template examples
func addFieldExamplesToErrors(errors []*validator.EnhancedValidationError, artifactTypeStr string) {
	if len(errors) == 0 {
		return
	}

	// Parse artifact type
	artifactType, err := schema.ArtifactTypeFromString(artifactTypeStr)
	if err != nil {
		return // Can't get examples without knowing artifact type
	}

	// Create example extractor (uses embedded templates)
	extractor, err := validation.NewExampleExtractor()
	if err != nil {
		return // Silently skip if templates unavailable
	}

	// Populate examples for each error
	for _, enhanced := range errors {
		example := extractor.GetFieldExample(artifactType, enhanced.Path)
		if example.Value != "" {
			enhanced.Example = &validator.FieldExample{
				Value:       example.Value,
				Type:        example.Type,
				Description: example.Description,
			}
		}
	}
}

// FieldExplanation holds comprehensive information about a field
type FieldExplanation struct {
	Field         string           `yaml:"field" json:"field"`
	ArtifactType  string           `yaml:"artifact_type" json:"artifact_type"`
	SchemaInfo    *SchemaFieldInfo `yaml:"schema_info,omitempty" json:"schema_info,omitempty"`
	Example       *TemplateExample `yaml:"example,omitempty" json:"example,omitempty"`
	Description   string           `yaml:"description,omitempty" json:"description,omitempty"`
	RelatedFields []string         `yaml:"related_fields,omitempty" json:"related_fields,omitempty"`
}

// SchemaFieldInfo holds schema-derived information about a field
type SchemaFieldInfo struct {
	Type          string   `yaml:"type" json:"type"`
	Required      bool     `yaml:"required" json:"required"`
	Constraints   []string `yaml:"constraints,omitempty" json:"constraints,omitempty"`
	AllowedValues []string `yaml:"allowed_values,omitempty" json:"allowed_values,omitempty"`
	ChildFields   []string `yaml:"child_fields,omitempty" json:"child_fields,omitempty"`
}

// TemplateExample holds template-derived example information
type TemplateExample struct {
	Value       string `yaml:"value" json:"value"`
	Type        string `yaml:"type" json:"type"`
	FullSection string `yaml:"full_section,omitempty" json:"full_section,omitempty"`
}

// runExplainField explains a specific field path for a file
func runExplainField(val *validator.Validator, filePath string, fieldPath string) {
	// Detect artifact type from filename using validator's loader
	loader := val.GetLoader()
	artifactType, err := loader.DetectArtifactType(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: Could not detect artifact type for file: %s\n", filePath)
		os.Exit(1)
	}

	artifactTypeStr := string(artifactType)

	explanation := &FieldExplanation{
		Field:        fieldPath,
		ArtifactType: artifactTypeStr,
	}

	// Get schema information
	schemaFile := val.GetSchemaFileForArtifact(artifactTypeStr)
	if schemaFile != "" {
		introspector := val.GetSchemaIntrospector()
		jsonPointer := humanPathToJSONPointer(fieldPath)

		// Try to get the structure at this path
		structure := introspector.ExtractExpectedStructure(schemaFile, jsonPointer)
		if structure != nil {
			explanation.SchemaInfo = &SchemaFieldInfo{
				Type: "object",
			}
			// Extract child fields
			for name, typeDesc := range structure {
				explanation.SchemaInfo.ChildFields = append(explanation.SchemaInfo.ChildFields, name+": "+typeDesc)
			}
		} else {
			// Try to get info about this specific field by looking at parent
			parentPath, fieldName := splitLastPathComponent(jsonPointer)
			if fieldName != "" {
				parentStructure := introspector.ExtractExpectedStructure(schemaFile, parentPath)
				if parentStructure != nil {
					if typeDesc, ok := parentStructure[fieldName]; ok {
						explanation.SchemaInfo = parseSchemaTypeDescription(typeDesc)
					}
				}
			}
		}
	}

	// Get template example
	extractor, err := validation.NewExampleExtractor()
	if err == nil {
		example := extractor.GetFieldExample(artifactType, fieldPath)
		if example.Value != "" {
			explanation.Example = &TemplateExample{
				Value: example.Value,
				Type:  example.Type,
			}
			explanation.Description = example.Description
		}

		// Get the section name for section example
		sectionName := validator.GetTopLevelSection(fieldPath)
		if sectionName != "" && sectionName != "(root)" {
			sectionExample := extractor.GetSectionExample(artifactType, sectionName)
			if sectionExample != "" && len(sectionExample) < 2000 {
				explanation.Example.FullSection = sectionExample
			}
		}
	}

	// Add description from our knowledge base if not already set
	if explanation.Description == "" {
		explanation.Description = getFieldDescriptionFromKnowledge(fieldPath)
	}

	// Output
	if validateJSON {
		data, _ := json.MarshalIndent(explanation, "", "  ")
		fmt.Println(string(data))
	} else {
		printFieldExplanation(explanation)
	}
}

// humanPathToJSONPointer converts a human-readable path to JSON pointer
// e.g., "target_users[0].problems[0].severity" -> "/target_users/0/problems/0/severity"
func humanPathToJSONPointer(path string) string {
	if path == "" || path == "(root)" {
		return "/"
	}

	var result strings.Builder
	result.WriteString("/")

	inBracket := false
	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch {
		case ch == '[':
			inBracket = true
			result.WriteString("/")
		case ch == ']':
			inBracket = false
		case ch == '.':
			if !inBracket {
				result.WriteString("/")
			}
		default:
			result.WriteByte(ch)
		}
	}

	return result.String()
}

// splitLastPathComponent splits a JSON pointer into parent path and last field name
func splitLastPathComponent(pointer string) (string, string) {
	if pointer == "" || pointer == "/" {
		return "", ""
	}

	pointer = strings.TrimPrefix(pointer, "/")
	lastSlash := strings.LastIndex(pointer, "/")
	if lastSlash == -1 {
		return "/", pointer
	}

	return "/" + pointer[:lastSlash], pointer[lastSlash+1:]
}

// parseSchemaTypeDescription parses a type description string from the introspector
func parseSchemaTypeDescription(typeDesc string) *SchemaFieldInfo {
	info := &SchemaFieldInfo{}

	// Check for required
	if strings.Contains(typeDesc, "(required)") {
		info.Required = true
		typeDesc = strings.Replace(typeDesc, " (required)", "", 1)
	}

	// Check for enum
	if strings.HasPrefix(typeDesc, "enum: ") {
		info.Type = "enum"
		values := strings.TrimPrefix(typeDesc, "enum: ")
		info.AllowedValues = strings.Split(values, "|")
		return info
	}

	// Check for array
	if strings.HasPrefix(typeDesc, "array of ") {
		info.Type = "array"
		rest := strings.TrimPrefix(typeDesc, "array of ")
		// Extract constraints
		if idx := strings.Index(rest, " min:"); idx != -1 {
			info.Constraints = append(info.Constraints, "minItems: "+extractNumber(rest[idx+5:]))
		}
		if idx := strings.Index(rest, " max:"); idx != -1 {
			info.Constraints = append(info.Constraints, "maxItems: "+extractNumber(rest[idx+5:]))
		}
		return info
	}

	// Check for string with constraints
	if strings.HasPrefix(typeDesc, "string") {
		info.Type = "string"
		if idx := strings.Index(typeDesc, " min:"); idx != -1 {
			info.Constraints = append(info.Constraints, "minLength: "+extractNumber(typeDesc[idx+5:]))
		}
		if idx := strings.Index(typeDesc, " max:"); idx != -1 {
			info.Constraints = append(info.Constraints, "maxLength: "+extractNumber(typeDesc[idx+5:]))
		}
		return info
	}

	// Default
	info.Type = typeDesc
	return info
}

// extractNumber extracts the first number from a string
func extractNumber(s string) string {
	var result strings.Builder
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			result.WriteRune(ch)
		} else if result.Len() > 0 {
			break
		}
	}
	return result.String()
}

// getFieldDescriptionFromKnowledge returns a description for common fields
func getFieldDescriptionFromKnowledge(fieldPath string) string {
	// Extract the last part of the path for common field descriptions
	lastDot := strings.LastIndex(fieldPath, ".")
	field := fieldPath
	if lastDot >= 0 {
		field = fieldPath[lastDot+1:]
	}

	// Remove array index if present
	if idx := strings.Index(field, "["); idx >= 0 {
		field = field[:idx]
	}

	descriptions := map[string]string{
		"severity":              "Indicates the priority or urgency level. Valid values: critical, high, medium, low",
		"impact":                "Describes the effect or consequence level. Valid values: critical, high, medium, low",
		"timeframe":             "Specifies when something applies or is expected. Values: immediate, near_term, medium_term, long_term",
		"workarounds":           "An array of current workarounds or alternatives the user employs to address the problem",
		"goals":                 "What the user or system is trying to achieve - typically an array of goal statements",
		"current_situation":     "A detailed description of the persona's current state and context (minimum 200 characters recommended)",
		"transformation_moment": "The pivotal moment when the user realizes value from the product (minimum 200 characters recommended)",
		"emotional_resolution":  "How the user feels after achieving a successful outcome (minimum 200 characters recommended)",
		"technical_proficiency": "The user's technical skill level. Valid values: basic, intermediate, advanced, expert",
		"status":                "The current state of an item. Valid values: draft, ready, in-progress, delivered",
		"type":                  "The context or interface type. Valid values: ui, email, notification, api, report, integration",
		"id":                    "A unique identifier following a specific pattern (e.g., fd-001 for feature definitions, cap-001 for capabilities)",
		"contributes_to":        "Value model paths that this item contributes to, linking features to strategic goals",
		"tracks":                "Strategic tracks for categorization. Valid values: product, strategy, org_ops, commercial",
		"problems":              "An array of problems or pain points experienced by the user or in the market",
		"persona":               "The name or identifier of the user persona being described",
		"description":           "A textual description providing context and details about the item",
		"name":                  "A human-readable name or title for the item",
		"evidence":              "Supporting data, facts, or observations that validate a claim or insight",
		"hypothesis":            "A proposed explanation or assumption to be tested or validated",
		"key_insights":          "Important discoveries or learnings derived from analysis",
		"target_users":          "The primary users or customers the product is designed for",
		"competitive_landscape": "Analysis of competitors and market positioning",
		"market_definition":     "Definition of the target market including TAM, SAM, and SOM",
	}

	if desc, ok := descriptions[field]; ok {
		return desc
	}
	return ""
}

// printFieldExplanation outputs a human-readable field explanation
func printFieldExplanation(exp *FieldExplanation) {
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("  Field Explanation: %s\n", exp.Field)
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	fmt.Printf("Artifact Type: %s\n", exp.ArtifactType)
	fmt.Println()

	if exp.Description != "" {
		fmt.Println("Description:")
		fmt.Printf("  %s\n", exp.Description)
		fmt.Println()
	}

	if exp.SchemaInfo != nil {
		fmt.Println("Schema Information:")
		fmt.Printf("  Type: %s\n", exp.SchemaInfo.Type)
		if exp.SchemaInfo.Required {
			fmt.Println("  Required: yes")
		}
		if len(exp.SchemaInfo.AllowedValues) > 0 {
			fmt.Printf("  Allowed Values: %s\n", strings.Join(exp.SchemaInfo.AllowedValues, ", "))
		}
		if len(exp.SchemaInfo.Constraints) > 0 {
			fmt.Println("  Constraints:")
			for _, c := range exp.SchemaInfo.Constraints {
				fmt.Printf("    - %s\n", c)
			}
		}
		if len(exp.SchemaInfo.ChildFields) > 0 {
			fmt.Println("  Child Fields:")
			for _, f := range exp.SchemaInfo.ChildFields {
				fmt.Printf("    - %s\n", f)
			}
		}
		fmt.Println()
	}

	if exp.Example != nil {
		fmt.Println("Template Example:")
		fmt.Printf("  Value: %s\n", exp.Example.Value)
		fmt.Printf("  Type: %s\n", exp.Example.Type)
		if exp.Example.FullSection != "" {
			fmt.Println()
			fmt.Println("  Full Section Example:")
			// Indent each line
			lines := strings.Split(exp.Example.FullSection, "\n")
			for _, line := range lines {
				fmt.Printf("    %s\n", line)
			}
		}
		fmt.Println()
	}

	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
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

// findEPFInstanceRoot searches upward from the given path to find the EPF instance root
// Returns empty string if not found
func findEPFInstanceRoot(startPath string) string {
	// Convert to absolute path
	absPath, err := filepath.Abs(startPath)
	if err != nil {
		return ""
	}

	// If it's a file, start from its directory
	info, err := os.Stat(absPath)
	if err != nil {
		return ""
	}
	if !info.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	// Walk up the directory tree
	currentPath := absPath
	for {
		// Check for _meta.yaml in this directory
		metaPath := filepath.Join(currentPath, "_meta.yaml")
		if _, err := os.Stat(metaPath); err == nil {
			return currentPath
		}

		// Check for README.md (fallback)
		readmePath := filepath.Join(currentPath, "README.md")
		if _, err := os.Stat(readmePath); err == nil {
			// Additional check: look for READY/FIRE/AIM directories
			readyPath := filepath.Join(currentPath, "READY")
			firePath := filepath.Join(currentPath, "FIRE")
			aimPath := filepath.Join(currentPath, "AIM")

			hasREADY, _ := os.Stat(readyPath)
			hasFIRE, _ := os.Stat(firePath)
			hasAIM, _ := os.Stat(aimPath)

			if hasREADY != nil || hasFIRE != nil || hasAIM != nil {
				return currentPath
			}
		}

		// Move up one directory
		parent := filepath.Dir(currentPath)
		if parent == currentPath {
			// Reached root
			break
		}
		currentPath = parent
	}

	return ""
}

// displayProductContext prints a product context header to stderr
func displayProductContext(ctx *context.InstanceContext) {
	if !ctx.Found {
		return
	}

	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Fprintln(os.Stderr, "  Product Context")
	fmt.Fprintln(os.Stderr, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	if ctx.ProductName != "" {
		fmt.Fprintf(os.Stderr, "  Product: %s\n", ctx.ProductName)
	}

	if ctx.Description != "" {
		// Wrap description at 70 chars
		wrapped := wrapProductDescription(ctx.Description, 70)
		for i, line := range wrapped {
			if i == 0 {
				fmt.Fprintf(os.Stderr, "  Description: %s\n", line)
			} else {
				fmt.Fprintf(os.Stderr, "               %s\n", line)
			}
		}
	}

	keywords := ctx.GetKeywords()
	if len(keywords) > 0 {
		// Show first 10 keywords
		displayKeywords := keywords
		if len(keywords) > 10 {
			displayKeywords = keywords[:10]
		}
		fmt.Fprintf(os.Stderr, "  Keywords: %s\n", strings.Join(displayKeywords, ", "))
	}

	fmt.Fprintln(os.Stderr, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Fprintln(os.Stderr, "")
}

// wrapProductDescription wraps text at the specified width
func wrapProductDescription(text string, width int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{text}
	}

	var lines []string
	currentLine := ""

	for _, word := range words {
		if currentLine == "" {
			currentLine = word
		} else if len(currentLine)+1+len(word) <= width {
			currentLine += " " + word
		} else {
			lines = append(lines, currentLine)
			currentLine = word
		}
	}

	if currentLine != "" {
		lines = append(lines, currentLine)
	}

	return lines
}

// runProductAwareChecks runs template detection and semantic alignment checks
// collectProductAwareWarnings collects template and semantic warnings without printing
// Returns (templateWarnings, semanticWarnings)
func collectProductAwareWarnings(path string, ctx *context.InstanceContext) ([]map[string]interface{}, []map[string]interface{}) {
	// Read file content
	fileContent, err := os.ReadFile(path)
	if err != nil {
		return nil, nil
	}

	// Parse YAML
	var doc map[string]interface{}
	if err := yaml.Unmarshal(fileContent, &doc); err != nil {
		return nil, nil
	}

	var templateWarningStrs []string
	var semanticWarningObjs []*validation.AlignmentWarning

	// Recursively check for template placeholders
	checkYAMLForTemplates(doc, "", &templateWarningStrs)

	// Recursively check for semantic alignment issues
	checkYAMLForAlignment(ctx, doc, "", &semanticWarningObjs)

	// Convert to map format for AI-friendly output
	templateWarnings := make([]map[string]interface{}, 0, len(templateWarningStrs))
	for _, w := range templateWarningStrs {
		// Parse the warning string to extract path and placeholder
		// Format: "path contains template content: placeholder"
		parts := strings.SplitN(w, " contains template content: ", 2)
		warning := map[string]interface{}{
			"path":    parts[0],
			"context": w,
		}
		if len(parts) == 2 {
			warning["placeholder"] = parts[1]
		} else {
			warning["placeholder"] = ""
		}
		templateWarnings = append(templateWarnings, warning)
	}

	semanticWarnings := make([]map[string]interface{}, 0, len(semanticWarningObjs))
	for _, w := range semanticWarningObjs {
		semanticWarnings = append(semanticWarnings, map[string]interface{}{
			"path":       w.Field,
			"issue":      w.Issue,
			"confidence": w.Confidence,
			"suggestion": w.Suggestion,
		})
	}

	return templateWarnings, semanticWarnings
}

// collectTemplateWarnings collects template placeholder warnings without requiring product context
func collectTemplateWarnings(path string) []map[string]interface{} {
	// Read file content
	fileContent, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	// Parse YAML
	var doc map[string]interface{}
	if err := yaml.Unmarshal(fileContent, &doc); err != nil {
		return nil
	}

	var templateWarningStrs []string
	checkYAMLForTemplates(doc, "", &templateWarningStrs)

	// Convert to map format for AI-friendly output
	templateWarnings := make([]map[string]interface{}, 0, len(templateWarningStrs))
	for _, w := range templateWarningStrs {
		// Parse the warning string to extract path and placeholder
		// Format: "path contains template content: placeholder"
		parts := strings.SplitN(w, " contains template content: ", 2)
		warning := map[string]interface{}{
			"path":    parts[0],
			"context": w,
		}
		if len(parts) == 2 {
			warning["placeholder"] = parts[1]
		} else {
			warning["placeholder"] = ""
		}
		templateWarnings = append(templateWarnings, warning)
	}

	return templateWarnings
}

// collectSemanticWarnings collects semantic alignment warnings (requires product context)
func collectSemanticWarnings(path string, ctx *context.InstanceContext) []map[string]interface{} {
	// Read file content
	fileContent, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	// Parse YAML
	var doc map[string]interface{}
	if err := yaml.Unmarshal(fileContent, &doc); err != nil {
		return nil
	}

	var semanticWarningObjs []*validation.AlignmentWarning
	checkYAMLForAlignment(ctx, doc, "", &semanticWarningObjs)

	semanticWarnings := make([]map[string]interface{}, 0, len(semanticWarningObjs))
	for _, w := range semanticWarningObjs {
		semanticWarnings = append(semanticWarnings, map[string]interface{}{
			"path":       w.Field,
			"issue":      w.Issue,
			"confidence": w.Confidence,
			"suggestion": w.Suggestion,
		})
	}

	return semanticWarnings
}

func runProductAwareChecks(path string, ctx *context.InstanceContext) {
	// Read file content
	fileContent, err := os.ReadFile(path)
	if err != nil {
		return // Silently skip if can't read
	}

	// Parse YAML
	var doc map[string]interface{}
	if err := yaml.Unmarshal(fileContent, &doc); err != nil {
		return // Silently skip if can't parse
	}

	var templateWarnings []string
	var semanticWarnings []*validation.AlignmentWarning

	// Recursively check for template placeholders
	checkYAMLForTemplates(doc, "", &templateWarnings)

	// Recursively check for semantic alignment issues
	checkYAMLForAlignment(ctx, doc, "", &semanticWarnings)

	// Display warnings if any found
	if len(templateWarnings) > 0 {
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "⚠️  Template Content Warnings:")
		for _, warning := range templateWarnings {
			fmt.Fprintf(os.Stderr, "  • %s\n", warning)
		}
	}

	if len(semanticWarnings) > 0 {
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "⚠️  Content Alignment Warnings:")
		for _, warning := range semanticWarnings {
			fmt.Fprintf(os.Stderr, "  • %s: %s\n", warning.Field, warning.Issue)
			fmt.Fprintf(os.Stderr, "    Confidence: %s\n", warning.Confidence)
			if warning.Suggestion != "" {
				fmt.Fprintf(os.Stderr, "    Suggestion: %s\n", warning.Suggestion)
			}
		}
	}
}

// checkYAMLForTemplates recursively checks YAML for template placeholders
func checkYAMLForTemplates(data interface{}, path string, warnings *[]string) {
	switch v := data.(type) {
	case map[string]interface{}:
		for key, value := range v {
			newPath := key
			if path != "" {
				newPath = path + "." + key
			}
			checkYAMLForTemplates(value, newPath, warnings)
		}
	case []interface{}:
		for i, item := range v {
			newPath := fmt.Sprintf("%s[%d]", path, i)
			checkYAMLForTemplates(item, newPath, warnings)
		}
	case string:
		// Check if this string looks like a template placeholder
		isTemplate, placeholder := validation.DetectTemplatePlaceholder("", v)
		if isTemplate {
			*warnings = append(*warnings, fmt.Sprintf("%s contains template content: %s", path, placeholder))
		}
	}
}

// checkYAMLForAlignment recursively checks YAML for semantic alignment issues
func checkYAMLForAlignment(ctx *context.InstanceContext, data interface{}, path string, warnings *[]*validation.AlignmentWarning) {
	switch v := data.(type) {
	case map[string]interface{}:
		for key, value := range v {
			newPath := key
			if path != "" {
				newPath = path + "." + key
			}
			checkYAMLForAlignment(ctx, value, newPath, warnings)
		}
	case []interface{}:
		for i, item := range v {
			newPath := fmt.Sprintf("%s[%d]", path, i)
			checkYAMLForAlignment(ctx, item, newPath, warnings)
		}
	case string:
		// Only check substantial strings (>50 chars) for alignment
		if len(v) > 50 {
			if warning := validation.CheckContentAlignment(ctx, path, v); warning != nil {
				*warnings = append(*warnings, warning)
			}
		}
	}
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
	validateCmd.Flags().StringVar(&validateExplain, "explain", "", "explain a field path (e.g., 'target_users[0].problems[0].severity') - shows type, constraints, and example")
}
