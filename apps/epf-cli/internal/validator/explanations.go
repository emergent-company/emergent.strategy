// Package validator provides YAML validation against EPF JSON Schemas.
package validator

import (
	"regexp"
	"strings"
)

// ErrorExplanation provides a human-readable explanation for a schema error
type ErrorExplanation struct {
	Summary    string // Short summary of what's wrong
	Suggestion string // How to fix it
}

// Common error patterns and their explanations
var errorPatterns = []struct {
	pattern     *regexp.Regexp
	explanation func(matches []string, message string) ErrorExplanation
}{
	// additionalProperties errors - capture everything between first ' and last ' before "not allowed"
	{
		pattern: regexp.MustCompile(`additionalProperties '(.+)' not allowed`),
		explanation: func(matches []string, message string) ErrorExplanation {
			fieldPart := matches[1]
			// Extract all field names from format like: "field1', 'field2', 'field3"
			fieldRegex := regexp.MustCompile(`'?([^']+)'?`)
			fieldMatches := fieldRegex.FindAllStringSubmatch(fieldPart, -1)

			var fields []string
			for _, m := range fieldMatches {
				field := strings.TrimSpace(m[1])
				if field != "" && field != "," {
					fields = append(fields, field)
				}
			}

			// Also handle simple comma-separated case
			if len(fields) == 0 {
				fields = strings.Split(fieldPart, "', '")
			}

			if len(fields) > 1 {
				return ErrorExplanation{
					Summary:    "Unknown fields: " + strings.Join(fields, ", "),
					Suggestion: suggestForMultipleUnknownFields(fields),
				}
			}
			return ErrorExplanation{
				Summary:    "Unknown field '" + fields[0] + "'",
				Suggestion: suggestForUnknownField(fields[0]),
			}
		},
	},
	// Pattern mismatch errors
	{
		pattern: regexp.MustCompile(`does not match pattern '([^']+)'`),
		explanation: func(matches []string, message string) ErrorExplanation {
			pattern := matches[1]
			return ErrorExplanation{
				Summary:    "Value doesn't match the required format",
				Suggestion: explainPattern(pattern),
			}
		},
	},
	// Missing required property
	{
		pattern: regexp.MustCompile(`missing properties: '([^']+)'`),
		explanation: func(matches []string, message string) ErrorExplanation {
			props := matches[1]
			return ErrorExplanation{
				Summary:    "Required field(s) missing: " + props,
				Suggestion: "Add the missing field(s) to your YAML file",
			}
		},
	},
	// Type errors
	{
		pattern: regexp.MustCompile(`expected ([a-z]+), but got ([a-z]+)`),
		explanation: func(matches []string, message string) ErrorExplanation {
			expected, got := matches[1], matches[2]
			return ErrorExplanation{
				Summary:    "Wrong type: expected " + expected + ", got " + got,
				Suggestion: typeConversionHint(expected, got),
			}
		},
	},
	// Enum errors
	{
		pattern: regexp.MustCompile(`value must be one of`),
		explanation: func(matches []string, message string) ErrorExplanation {
			return ErrorExplanation{
				Summary:    "Invalid value - must be one of the allowed options",
				Suggestion: "Check the schema for valid values, or use 'epf-cli schemas show <type>' to see options",
			}
		},
	},
	// minItems
	{
		pattern: regexp.MustCompile(`minimum (\d+) items required, but found (\d+)`),
		explanation: func(matches []string, message string) ErrorExplanation {
			min, found := matches[1], matches[2]
			return ErrorExplanation{
				Summary:    "Array too short: needs at least " + min + " items, has " + found,
				Suggestion: "Add more items to the array",
			}
		},
	},
	// minLength
	{
		pattern: regexp.MustCompile(`length must be >= (\d+), but got (\d+)`),
		explanation: func(matches []string, message string) ErrorExplanation {
			min := matches[1]
			return ErrorExplanation{
				Summary:    "Text too short: minimum " + min + " characters required",
				Suggestion: "Provide more detailed content",
			}
		},
	},
	// null not allowed
	{
		pattern: regexp.MustCompile(`expected .+, but got null`),
		explanation: func(matches []string, message string) ErrorExplanation {
			return ErrorExplanation{
				Summary:    "Field cannot be empty/null",
				Suggestion: "Provide a value for this field, or remove it if optional",
			}
		},
	},
}

// ExplainError takes a raw schema error message and returns a human-readable explanation
func ExplainError(message string) *ErrorExplanation {
	for _, ep := range errorPatterns {
		if matches := ep.pattern.FindStringSubmatch(message); matches != nil {
			explanation := ep.explanation(matches, message)
			return &explanation
		}
	}
	return nil
}

// FormatErrorWithExplanation formats a validation error with optional explanation
func FormatErrorWithExplanation(message string, showHints bool) string {
	if !showHints {
		return message
	}

	explanation := ExplainError(message)
	if explanation == nil {
		return message
	}

	var result strings.Builder
	result.WriteString(explanation.Summary)
	if explanation.Suggestion != "" {
		result.WriteString("\n      💡 ")
		result.WriteString(explanation.Suggestion)
	}
	return result.String()
}

// suggestForUnknownField provides suggestions for common unknown field errors
func suggestForUnknownField(fieldName string) string {
	// Common metadata fields that schemas might not allow
	metadataFields := map[string]string{
		"epf_version":      "This is a metadata field. The schema may need updating to allow it, or move it to a '_metadata' section",
		"template_version": "This is a metadata field. The schema may need updating to allow it, or move it to a '_metadata' section",
		"_metadata":        "Custom metadata section not supported by this schema",
	}

	if hint, ok := metadataFields[fieldName]; ok {
		return hint
	}

	// Check for common typos
	typoSuggestions := map[string]string{
		"descripion":    "Did you mean 'description'?",
		"descritpion":   "Did you mean 'description'?",
		"tile":          "Did you mean 'title'?",
		"titile":        "Did you mean 'title'?",
		"sumary":        "Did you mean 'summary'?",
		"summery":       "Did you mean 'summary'?",
		"priortiy":      "Did you mean 'priority'?",
		"priorty":       "Did you mean 'priority'?",
		"staus":         "Did you mean 'status'?",
		"stauts":        "Did you mean 'status'?",
		"contribues_to": "Did you mean 'contributes_to'?",
	}

	if suggestion, ok := typoSuggestions[strings.ToLower(fieldName)]; ok {
		return suggestion
	}

	return "Check spelling or remove this field. Use 'epf-cli schemas show <type>' to see allowed fields"
}

// suggestForMultipleUnknownFields provides suggestions when multiple fields are not allowed
func suggestForMultipleUnknownFields(fields []string) string {
	// Check if all fields are metadata fields
	allMetadata := true
	for _, f := range fields {
		f = strings.TrimSpace(f)
		if f != "epf_version" && f != "template_version" && f != "_metadata" {
			allMetadata = false
			break
		}
	}

	if allMetadata {
		return "These are metadata fields. The schema has 'additionalProperties: false' which blocks them. Consider updating the schema to allow these fields"
	}

	return "These fields are not defined in the schema. Check spelling or remove them"
}

// explainPattern provides human-readable explanations for common regex patterns
func explainPattern(pattern string) string {
	// Common EPF patterns
	patterns := map[string]string{
		// contributes_to pattern
		`^(Product|Commercial|Strategy|OrgOps)\.[A-Za-z]+\.[A-Za-z]+`: "Format: '{Pillar}.{L2}.{L3}' where Pillar is Product/Commercial/Strategy/OrgOps. Example: 'Product.Operate.Monitoring'",

		// Feature ID pattern
		`^fd-\d{3}$`: "Format: 'fd-XXX' where XXX is a 3-digit number. Example: 'fd-001'",

		// Version patterns
		`^\d+\.\d+\.\d+$`:   "Semantic version format: 'X.Y.Z'. Example: '1.0.0'",
		`^v?\d+\.\d+\.\d+$`: "Version format: 'X.Y.Z' or 'vX.Y.Z'. Example: 'v1.0.0'",

		// Date patterns
		`^\d{4}-\d{2}-\d{2}$`: "Date format: 'YYYY-MM-DD'. Example: '2024-01-15'",

		// URL patterns
		`^https?://`: "Must be a valid URL starting with http:// or https://",

		// Slug/identifier patterns
		`^[a-z][a-z0-9-]*$`:       "Lowercase letters, numbers, and hyphens only. Must start with a letter. Example: 'my-feature-1'",
		`^[a-zA-Z][a-zA-Z0-9_]*$`: "Letters, numbers, and underscores only. Must start with a letter. Example: 'myFeature_1'",
	}

	if explanation, ok := patterns[pattern]; ok {
		return explanation
	}

	// Try to provide general guidance based on pattern components
	if strings.Contains(pattern, "Product|Commercial|Strategy|OrgOps") {
		return "Value must start with one of: Product, Commercial, Strategy, OrgOps"
	}

	if strings.HasPrefix(pattern, "^") && strings.HasSuffix(pattern, "$") {
		return "Value must match the exact pattern. Check documentation for expected format"
	}

	return "Value must match pattern: " + pattern
}

// typeConversionHint provides hints for fixing type mismatches
func typeConversionHint(expected, got string) string {
	switch {
	case expected == "string" && got == "integer":
		return "Wrap the number in quotes: \"123\" instead of 123"
	case expected == "string" && got == "boolean":
		return "Wrap in quotes: \"true\" instead of true"
	case expected == "array" && got == "string":
		return "Use array syntax: ['item'] or:\n      - item"
	case expected == "object" && got == "array":
		return "Use object syntax with keys instead of a list"
	case expected == "integer" && got == "string":
		return "Remove quotes: 123 instead of \"123\""
	case expected == "boolean" && got == "string":
		return "Remove quotes: true instead of \"true\""
	default:
		return "Convert the value to " + expected + " type"
	}
}
