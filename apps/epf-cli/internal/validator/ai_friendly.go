// Package validator provides YAML validation against EPF JSON Schemas.
// This file contains AI-friendly validation output formatting.
package validator

import (
	"regexp"
	"sort"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// ErrorType classifies validation errors by severity and kind
type ErrorType string

const (
	ErrorTypeMismatch        ErrorType = "type_mismatch"
	ErrorMissingRequired     ErrorType = "missing_required"
	ErrorInvalidEnum         ErrorType = "invalid_enum"
	ErrorConstraintViolation ErrorType = "constraint_violation"
	ErrorUnknownField        ErrorType = "unknown_field"
	ErrorPatternMismatch     ErrorType = "pattern_mismatch"
	ErrorUnknown             ErrorType = "unknown"
)

// ErrorPriority defines fix priority levels
type ErrorPriority string

const (
	PriorityCritical ErrorPriority = "critical"
	PriorityHigh     ErrorPriority = "high"
	PriorityMedium   ErrorPriority = "medium"
	PriorityLow      ErrorPriority = "low"
)

// EnhancedValidationError provides detailed, actionable error information
type EnhancedValidationError struct {
	Path           string        `yaml:"path" json:"path"`                                           // Human-readable path (e.g., "key_insights[0]")
	JSONPointer    string        `yaml:"json_pointer,omitempty" json:"json_pointer,omitempty"`       // Raw JSON pointer (e.g., "/key_insights/0")
	Line           int           `yaml:"line,omitempty" json:"line,omitempty"`                       // Line number if determinable
	ErrorType      ErrorType     `yaml:"error_type" json:"error_type"`                               // Classification
	Priority       ErrorPriority `yaml:"priority" json:"priority"`                                   // Fix priority
	Message        string        `yaml:"message" json:"message"`                                     // Human-readable message
	Details        ErrorDetails  `yaml:"details,omitempty" json:"details,omitempty"`                 // Detailed info
	FixHint        string        `yaml:"fix_hint" json:"fix_hint"`                                   // Actionable suggestion
	Example        *FieldExample `yaml:"example,omitempty" json:"example,omitempty"`                 // Example from template
	SchemaLocation string        `yaml:"schema_location,omitempty" json:"schema_location,omitempty"` // Which schema rule failed
}

// FieldExample represents an example value extracted from a template
type FieldExample struct {
	Value       string `yaml:"value" json:"value"`
	Type        string `yaml:"type" json:"type"`                                   // string, array, object, number, boolean
	Description string `yaml:"description,omitempty" json:"description,omitempty"` // Context about this field
}

// ErrorDetails contains type-specific error information
type ErrorDetails struct {
	ExpectedType      string            `yaml:"expected_type,omitempty" json:"expected_type,omitempty"`
	ActualType        string            `yaml:"actual_type,omitempty" json:"actual_type,omitempty"`
	AllowedValues     []string          `yaml:"allowed_values,omitempty" json:"allowed_values,omitempty"`
	Constraint        string            `yaml:"constraint,omitempty" json:"constraint,omitempty"`
	ConstraintValue   interface{}       `yaml:"constraint_value,omitempty" json:"constraint_value,omitempty"`
	CurrentValue      interface{}       `yaml:"current_value,omitempty" json:"current_value,omitempty"`
	MissingFields     []string          `yaml:"missing_fields,omitempty" json:"missing_fields,omitempty"`
	UnknownFields     []string          `yaml:"unknown_fields,omitempty" json:"unknown_fields,omitempty"`
	ExpectedStructure map[string]string `yaml:"expected_structure,omitempty" json:"expected_structure,omitempty"` // field -> type description
}

// SectionErrors groups errors by their top-level section
type SectionErrors struct {
	Section    string                     `yaml:"section" json:"section"`
	ErrorCount int                        `yaml:"error_count" json:"error_count"`
	Errors     []*EnhancedValidationError `yaml:"errors" json:"errors"`
}

// AIFriendlyResult is the structured output for AI agents
type AIFriendlyResult struct {
	File            string           `yaml:"file" json:"file"`
	ArtifactType    string           `yaml:"artifact_type" json:"artifact_type"`
	SchemaVersion   string           `yaml:"schema_version,omitempty" json:"schema_version,omitempty"`
	Section         string           `yaml:"section,omitempty" json:"section,omitempty"` // Section path if validating a specific section
	Valid           bool             `yaml:"valid" json:"valid"`
	ErrorCount      int              `yaml:"error_count" json:"error_count"`
	ErrorsBySection []*SectionErrors `yaml:"errors_by_section,omitempty" json:"errors_by_section,omitempty"`

	// Product context for validation guidance
	ProductContext *ProductContextInfo `yaml:"product_context,omitempty" json:"product_context,omitempty"`

	// Template and semantic warnings
	TemplateWarnings []*TemplateWarning `yaml:"template_warnings,omitempty" json:"template_warnings,omitempty"`
	SemanticWarnings []*SemanticWarning `yaml:"semantic_warnings,omitempty" json:"semantic_warnings,omitempty"`

	// Summary statistics for planning
	Summary ErrorSummary `yaml:"summary" json:"summary"`
}

// ProductContextInfo provides product context for AI agents
type ProductContextInfo struct {
	ProductName string   `yaml:"product_name" json:"product_name"`
	Description string   `yaml:"description" json:"description"`
	Domain      string   `yaml:"domain,omitempty" json:"domain,omitempty"`
	Keywords    []string `yaml:"keywords" json:"keywords"`
	Source      string   `yaml:"source" json:"source"` // Where context was loaded from
}

// TemplateWarning indicates placeholder or template content
type TemplateWarning struct {
	Path        string `yaml:"path" json:"path"`
	Placeholder string `yaml:"placeholder" json:"placeholder"`
	Context     string `yaml:"context" json:"context"`
}

// SemanticWarning indicates content that may not match product context
type SemanticWarning struct {
	Path       string `yaml:"path" json:"path"`
	Issue      string `yaml:"issue" json:"issue"`
	Confidence string `yaml:"confidence" json:"confidence"` // high, medium, low
	Suggestion string `yaml:"suggestion" json:"suggestion"`
}

// ErrorSummary provides statistics for fix planning
type ErrorSummary struct {
	CriticalCount     int      `yaml:"critical_count" json:"critical_count"`
	HighCount         int      `yaml:"high_count" json:"high_count"`
	MediumCount       int      `yaml:"medium_count" json:"medium_count"`
	LowCount          int      `yaml:"low_count" json:"low_count"`
	AffectedSections  []string `yaml:"affected_sections" json:"affected_sections"`
	SuggestedFixOrder []string `yaml:"suggested_fix_order" json:"suggested_fix_order"` // Sections in recommended fix order
}

// Regex patterns for parsing error messages
var (
	typeErrorPattern       = regexp.MustCompile(`expected ([a-z]+), but got ([a-z]+)`)
	missingPropsPattern    = regexp.MustCompile(`missing properties: '([^']+)'`)
	enumErrorPattern       = regexp.MustCompile(`value must be one of (.+)`)
	minLengthPattern       = regexp.MustCompile(`length must be >= (\d+), but got (\d+)`)
	maxLengthPattern       = regexp.MustCompile(`length must be <= (\d+), but got (\d+)`)
	minItemsPattern        = regexp.MustCompile(`minimum (\d+) items required, but found (\d+)`)
	maxItemsPattern        = regexp.MustCompile(`maximum (\d+) items allowed, but found (\d+)`)
	additionalPropsPattern = regexp.MustCompile(`additionalProperties '([^']+)' not allowed`)
	patternMismatchPattern = regexp.MustCompile(`does not match pattern '([^']+)'`)
)

// ExtractEnhancedErrors converts jsonschema errors to enhanced format
func ExtractEnhancedErrors(err error) []*EnhancedValidationError {
	var errors []*EnhancedValidationError

	if validationErr, ok := err.(*jsonschema.ValidationError); ok {
		errors = extractEnhancedNested(validationErr)
	}

	return errors
}

// extractEnhancedNested recursively extracts errors from nested validation errors
func extractEnhancedNested(err *jsonschema.ValidationError) []*EnhancedValidationError {
	var errors []*EnhancedValidationError

	// Only include errors with actual messages (not just container errors)
	if err.Message != "" {
		enhanced := classifyAndEnhance(err)
		errors = append(errors, enhanced)
	}

	// Process nested causes
	for _, cause := range err.Causes {
		errors = append(errors, extractEnhancedNested(cause)...)
	}

	return errors
}

// classifyAndEnhance creates an enhanced error from a jsonschema error
func classifyAndEnhance(err *jsonschema.ValidationError) *EnhancedValidationError {
	enhanced := &EnhancedValidationError{
		JSONPointer:    err.InstanceLocation,
		Path:           jsonPointerToPath(err.InstanceLocation),
		Message:        err.Message,
		SchemaLocation: err.KeywordLocation,
	}

	// Classify the error and extract details
	classifyError(enhanced, err.Message)

	// Set priority based on error type
	enhanced.Priority = getPriority(enhanced.ErrorType)

	// Generate fix hint
	enhanced.FixHint = generateFixHint(enhanced)

	return enhanced
}

// jsonPointerToPath converts JSON pointer to human-readable path
// e.g., "/key_insights/0/insight" -> "key_insights[0].insight"
func jsonPointerToPath(pointer string) string {
	if pointer == "" || pointer == "/" {
		return "(root)"
	}

	// Remove leading slash
	pointer = strings.TrimPrefix(pointer, "/")

	parts := strings.Split(pointer, "/")
	var result strings.Builder

	for i, part := range parts {
		// Check if part is a number (array index)
		if isNumeric(part) {
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

// isNumeric checks if a string is a numeric value
func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

// classifyError determines the error type and extracts relevant details
func classifyError(enhanced *EnhancedValidationError, message string) {
	// Type mismatch
	if matches := typeErrorPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorTypeMismatch
		enhanced.Details.ExpectedType = matches[1]
		enhanced.Details.ActualType = matches[2]
		enhanced.Message = "Type mismatch: expected " + matches[1] + ", got " + matches[2]
		return
	}

	// Missing required properties
	if matches := missingPropsPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorMissingRequired
		fields := strings.Split(matches[1], "', '")
		enhanced.Details.MissingFields = fields
		enhanced.Message = "Missing required field(s): " + matches[1]
		return
	}

	// Invalid enum value
	if matches := enumErrorPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorInvalidEnum
		// Parse the allowed values from the message
		allowedStr := strings.Trim(matches[1], "\"")
		enhanced.Details.AllowedValues = parseEnumValues(allowedStr)
		enhanced.Message = "Invalid value - must be one of: " + matches[1]
		return
	}

	// Min length constraint
	if matches := minLengthPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorConstraintViolation
		enhanced.Details.Constraint = "minLength"
		enhanced.Details.ConstraintValue = matches[1]
		enhanced.Message = "String too short: minimum " + matches[1] + " characters required (got " + matches[2] + ")"
		return
	}

	// Max length constraint
	if matches := maxLengthPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorConstraintViolation
		enhanced.Details.Constraint = "maxLength"
		enhanced.Details.ConstraintValue = matches[1]
		enhanced.Message = "String too long: maximum " + matches[1] + " characters allowed (got " + matches[2] + ")"
		return
	}

	// Min items constraint
	if matches := minItemsPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorConstraintViolation
		enhanced.Details.Constraint = "minItems"
		enhanced.Details.ConstraintValue = matches[1]
		enhanced.Message = "Array too short: minimum " + matches[1] + " items required (got " + matches[2] + ")"
		return
	}

	// Max items constraint
	if matches := maxItemsPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorConstraintViolation
		enhanced.Details.Constraint = "maxItems"
		enhanced.Details.ConstraintValue = matches[1]
		enhanced.Message = "Array too long: maximum " + matches[1] + " items allowed (got " + matches[2] + ")"
		return
	}

	// Unknown field (additionalProperties)
	if matches := additionalPropsPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorUnknownField
		fields := strings.Split(matches[1], "', '")
		enhanced.Details.UnknownFields = fields
		enhanced.Message = "Unknown field(s): " + matches[1]
		return
	}

	// Pattern mismatch
	if matches := patternMismatchPattern.FindStringSubmatch(message); matches != nil {
		enhanced.ErrorType = ErrorPatternMismatch
		enhanced.Details.Constraint = "pattern"
		enhanced.Details.ConstraintValue = matches[1]
		enhanced.Message = "Value doesn't match required format: " + matches[1]
		return
	}

	// Default to unknown
	enhanced.ErrorType = ErrorUnknown
}

// parseEnumValues extracts enum values from error message
func parseEnumValues(s string) []string {
	// Format: "value1", "value2", "value3"
	parts := strings.Split(s, ", ")
	var values []string
	for _, p := range parts {
		p = strings.Trim(p, "\"")
		if p != "" {
			values = append(values, p)
		}
	}
	return values
}

// getPriority returns the fix priority for an error type
func getPriority(errType ErrorType) ErrorPriority {
	switch errType {
	case ErrorTypeMismatch:
		return PriorityCritical
	case ErrorMissingRequired:
		return PriorityCritical
	case ErrorInvalidEnum:
		return PriorityHigh
	case ErrorPatternMismatch:
		return PriorityHigh
	case ErrorConstraintViolation:
		return PriorityMedium
	case ErrorUnknownField:
		return PriorityLow
	default:
		return PriorityMedium
	}
}

// generateFixHint creates an actionable suggestion based on error type
func generateFixHint(enhanced *EnhancedValidationError) string {
	switch enhanced.ErrorType {
	case ErrorTypeMismatch:
		return generateTypeFixHint(enhanced.Details.ExpectedType, enhanced.Details.ActualType)
	case ErrorMissingRequired:
		if len(enhanced.Details.MissingFields) == 1 {
			return "Add the required field '" + enhanced.Details.MissingFields[0] + "'"
		}
		return "Add all missing required fields: " + strings.Join(enhanced.Details.MissingFields, ", ")
	case ErrorInvalidEnum:
		return "Use one of the allowed values: " + strings.Join(enhanced.Details.AllowedValues, ", ")
	case ErrorConstraintViolation:
		return generateConstraintFixHint(enhanced.Details.Constraint, enhanced.Details.ConstraintValue)
	case ErrorUnknownField:
		return "Remove unknown field(s) or check spelling. Use 'epf-cli schemas show <type>' to see valid fields"
	case ErrorPatternMismatch:
		return "Format must match pattern: " + enhanced.Details.ConstraintValue.(string)
	default:
		return "Check the schema for expected format"
	}
}

// generateTypeFixHint creates specific hints for type mismatches
func generateTypeFixHint(expected, actual string) string {
	switch {
	case expected == "object" && actual == "string":
		return "Convert string to object with required fields. Run 'epf-cli schemas show <type> --path <field>' to see expected structure"
	case expected == "array" && actual == "string":
		return "Convert string to array format:\n  - item1\n  - item2"
	case expected == "object" && actual == "array":
		return "Convert array to object with named fields"
	case expected == "string" && actual == "integer":
		return "Wrap number in quotes: \"123\" instead of 123"
	case expected == "string" && actual == "boolean":
		return "Wrap boolean in quotes: \"true\" instead of true"
	case expected == "integer" && actual == "string":
		return "Remove quotes from number: 123 instead of \"123\""
	default:
		return "Convert value from " + actual + " to " + expected + " type"
	}
}

// generateConstraintFixHint creates hints for constraint violations
func generateConstraintFixHint(constraint string, value interface{}) string {
	switch constraint {
	case "minLength":
		return "Expand text to at least " + value.(string) + " characters with more detailed content"
	case "maxLength":
		return "Shorten text to " + value.(string) + " characters or less"
	case "minItems":
		return "Add more items to reach minimum of " + value.(string)
	case "maxItems":
		return "Remove items to stay under maximum of " + value.(string)
	default:
		return "Adjust value to satisfy constraint: " + constraint
	}
}

// GroupErrorsBySection organizes errors by their top-level section
func GroupErrorsBySection(errors []*EnhancedValidationError) []*SectionErrors {
	sectionMap := make(map[string][]*EnhancedValidationError)

	for _, err := range errors {
		section := GetTopLevelSection(err.Path)
		sectionMap[section] = append(sectionMap[section], err)
	}

	// Convert to slice and sort
	var sections []*SectionErrors
	for section, errs := range sectionMap {
		sections = append(sections, &SectionErrors{
			Section:    section,
			ErrorCount: len(errs),
			Errors:     errs,
		})
	}

	// Sort by error count (descending) then alphabetically
	sort.Slice(sections, func(i, j int) bool {
		if sections[i].ErrorCount != sections[j].ErrorCount {
			return sections[i].ErrorCount > sections[j].ErrorCount
		}
		return sections[i].Section < sections[j].Section
	})

	return sections
}

// GetTopLevelSection extracts the top-level field name from a path
func GetTopLevelSection(path string) string {
	if path == "(root)" || path == "" {
		return "(root)"
	}

	// Remove leading dot if present
	path = strings.TrimPrefix(path, ".")

	// Split on . and [ to get first segment
	for i, c := range path {
		if c == '.' || c == '[' {
			return path[:i]
		}
	}

	return path
}

// CreateAIFriendlyResult builds the complete AI-friendly validation result
func CreateAIFriendlyResult(filePath, artifactType string, errors []*EnhancedValidationError) *AIFriendlyResult {
	sections := GroupErrorsBySection(errors)

	result := &AIFriendlyResult{
		File:            filePath,
		ArtifactType:    artifactType,
		Valid:           len(errors) == 0,
		ErrorCount:      len(errors),
		ErrorsBySection: sections,
		Summary:         createSummary(errors, sections),
	}

	return result
}

// createSummary generates error statistics and suggested fix order
func createSummary(errors []*EnhancedValidationError, sections []*SectionErrors) ErrorSummary {
	summary := ErrorSummary{}

	// Count by priority
	for _, err := range errors {
		switch err.Priority {
		case PriorityCritical:
			summary.CriticalCount++
		case PriorityHigh:
			summary.HighCount++
		case PriorityMedium:
			summary.MediumCount++
		case PriorityLow:
			summary.LowCount++
		}
	}

	// Collect affected sections
	for _, s := range sections {
		summary.AffectedSections = append(summary.AffectedSections, s.Section)
	}

	// Generate suggested fix order (prioritize sections with critical errors)
	summary.SuggestedFixOrder = suggestFixOrder(sections)

	return summary
}

// suggestFixOrder determines the best order to fix sections
func suggestFixOrder(sections []*SectionErrors) []string {
	// Score each section by priority of errors
	type sectionScore struct {
		section string
		score   int
	}

	var scored []sectionScore
	for _, s := range sections {
		score := 0
		for _, err := range s.Errors {
			switch err.Priority {
			case PriorityCritical:
				score += 100
			case PriorityHigh:
				score += 10
			case PriorityMedium:
				score += 1
			}
		}
		scored = append(scored, sectionScore{s.Section, score})
	}

	// Sort by score descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	var order []string
	for _, s := range scored {
		order = append(order, s.section)
	}

	return order
}

// CreateAIFriendlyResultWithContext creates an AI-friendly result with product context and semantic warnings
// This is the preferred function for validation with context awareness
func CreateAIFriendlyResultWithContext(filePath, artifactType string, errors []*EnhancedValidationError, ctx interface{}, templateWarnings, semanticWarnings interface{}) *AIFriendlyResult {
	sections := GroupErrorsBySection(errors)

	result := &AIFriendlyResult{
		File:            filePath,
		ArtifactType:    artifactType,
		Valid:           len(errors) == 0,
		ErrorCount:      len(errors),
		ErrorsBySection: sections,
		Summary:         createSummary(errors, sections),
	}

	// Add product context if available
	if ctx != nil {
		result.ProductContext = convertToProductContextInfo(ctx)
	}

	// Add template warnings if available
	if templateWarnings != nil {
		result.TemplateWarnings = convertToTemplateWarnings(templateWarnings)
	}

	// Add semantic warnings if available
	if semanticWarnings != nil {
		result.SemanticWarnings = convertToSemanticWarnings(semanticWarnings)
	}

	return result
}

// Helper functions to convert context types (these accept interface{} to avoid import cycles)

func convertToProductContextInfo(ctx interface{}) *ProductContextInfo {
	// Use type assertion to extract context fields
	// Expected type from context package: *context.InstanceContext
	if ctxMap, ok := ctx.(map[string]interface{}); ok {
		info := &ProductContextInfo{}
		if name, ok := ctxMap["product_name"].(string); ok {
			info.ProductName = name
		}
		if desc, ok := ctxMap["description"].(string); ok {
			info.Description = desc
		}
		if domain, ok := ctxMap["domain"].(string); ok {
			info.Domain = domain
		}
		if keywords, ok := ctxMap["keywords"].([]string); ok {
			info.Keywords = keywords
		}
		if source, ok := ctxMap["source"].(string); ok {
			info.Source = source
		}
		return info
	}
	return nil
}

func convertToTemplateWarnings(warnings interface{}) []*TemplateWarning {
	// Handle []map[string]interface{} (from validate.go)
	if warningsList, ok := warnings.([]map[string]interface{}); ok {
		result := make([]*TemplateWarning, 0, len(warningsList))
		for _, wMap := range warningsList {
			warning := &TemplateWarning{}
			if path, ok := wMap["path"].(string); ok {
				warning.Path = path
			}
			if placeholder, ok := wMap["placeholder"].(string); ok {
				warning.Placeholder = placeholder
			}
			if context, ok := wMap["context"].(string); ok {
				warning.Context = context
			}
			result = append(result, warning)
		}
		return result
	}
	// Handle []interface{} (generic case)
	if warningsList, ok := warnings.([]interface{}); ok {
		result := make([]*TemplateWarning, 0, len(warningsList))
		for _, w := range warningsList {
			if wMap, ok := w.(map[string]interface{}); ok {
				warning := &TemplateWarning{}
				if path, ok := wMap["path"].(string); ok {
					warning.Path = path
				}
				if placeholder, ok := wMap["placeholder"].(string); ok {
					warning.Placeholder = placeholder
				}
				if context, ok := wMap["context"].(string); ok {
					warning.Context = context
				}
				result = append(result, warning)
			}
		}
		return result
	}
	return nil
}

func convertToSemanticWarnings(warnings interface{}) []*SemanticWarning {
	// Handle []map[string]interface{} (from validate.go)
	if warningsList, ok := warnings.([]map[string]interface{}); ok {
		result := make([]*SemanticWarning, 0, len(warningsList))
		for _, wMap := range warningsList {
			warning := &SemanticWarning{}
			if path, ok := wMap["path"].(string); ok {
				warning.Path = path
			}
			if issue, ok := wMap["issue"].(string); ok {
				warning.Issue = issue
			}
			if confidence, ok := wMap["confidence"].(string); ok {
				warning.Confidence = confidence
			}
			if suggestion, ok := wMap["suggestion"].(string); ok {
				warning.Suggestion = suggestion
			}
			result = append(result, warning)
		}
		return result
	}
	// Handle []interface{} (generic case)
	if warningsList, ok := warnings.([]interface{}); ok {
		result := make([]*SemanticWarning, 0, len(warningsList))
		for _, w := range warningsList {
			if wMap, ok := w.(map[string]interface{}); ok {
				warning := &SemanticWarning{}
				if path, ok := wMap["path"].(string); ok {
					warning.Path = path
				}
				if issue, ok := wMap["issue"].(string); ok {
					warning.Issue = issue
				}
				if confidence, ok := wMap["confidence"].(string); ok {
					warning.Confidence = confidence
				}
				if suggestion, ok := wMap["suggestion"].(string); ok {
					warning.Suggestion = suggestion
				}
				result = append(result, warning)
			}
		}
		return result
	}
	return nil
}
