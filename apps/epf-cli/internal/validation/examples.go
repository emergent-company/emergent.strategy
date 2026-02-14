// Package validation provides validation helpers for EPF artifacts.
package validation

import (
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/schema"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/template"
	"gopkg.in/yaml.v3"
)

// FieldExample represents an example value extracted from a template
type FieldExample struct {
	Path        string `json:"path"`
	Value       string `json:"value"`
	Type        string `json:"type"` // string, array, object, number, boolean
	Description string `json:"description,omitempty"`
}

// ExampleExtractor extracts field examples from embedded templates
type ExampleExtractor struct {
	loader *template.Loader
}

// NewExampleExtractor creates an ExampleExtractor using embedded templates
func NewExampleExtractor() (*ExampleExtractor, error) {
	loader := template.NewEmbeddedLoader()
	if err := loader.Load(); err != nil {
		return nil, err
	}
	return &ExampleExtractor{loader: loader}, nil
}

// GetFieldExample extracts an example value for a specific field path from the template
// for the given artifact type. Returns empty FieldExample if not found.
func (e *ExampleExtractor) GetFieldExample(artifactType schema.ArtifactType, fieldPath string) FieldExample {
	tmpl, err := e.loader.GetTemplate(artifactType)
	if err != nil {
		return FieldExample{}
	}

	// Parse the template YAML
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(tmpl.Content), &data); err != nil {
		return FieldExample{}
	}

	// Extract value at path
	value, valueType := extractValueAtPath(data, fieldPath)
	if value == "" {
		return FieldExample{}
	}

	return FieldExample{
		Path:        fieldPath,
		Value:       value,
		Type:        valueType,
		Description: getFieldDescription(fieldPath),
	}
}

// GetSectionExample extracts a complete section example from the template
// Returns the YAML snippet for the entire section (e.g., "target_users", "key_insights")
func (e *ExampleExtractor) GetSectionExample(artifactType schema.ArtifactType, section string) string {
	tmpl, err := e.loader.GetTemplate(artifactType)
	if err != nil {
		return ""
	}

	// Parse the template YAML
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(tmpl.Content), &data); err != nil {
		return ""
	}

	// Get the section value
	sectionValue, ok := data[section]
	if !ok {
		return ""
	}

	// Marshal just that section back to YAML
	sectionMap := map[string]interface{}{section: sectionValue}
	result, err := yaml.Marshal(sectionMap)
	if err != nil {
		return ""
	}

	return string(result)
}

// extractValueAtPath navigates a nested map using dot notation and array indices
// Returns the value as a string and its type
func extractValueAtPath(data map[string]interface{}, path string) (string, string) {
	parts := parseFieldPath(path)
	if len(parts) == 0 {
		return "", ""
	}

	var current interface{} = data

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			var ok bool
			current, ok = v[part.key]
			if !ok {
				return "", ""
			}
		case []interface{}:
			if part.index >= 0 && part.index < len(v) {
				current = v[part.index]
			} else {
				return "", ""
			}
		default:
			return "", ""
		}
	}

	return formatValue(current)
}

// pathPart represents a component of a field path
type pathPart struct {
	key   string
	index int // -1 if not an array access
}

// parseFieldPath parses a field path like "target_users[0].problems[0].severity"
// into a slice of pathParts
func parseFieldPath(path string) []pathPart {
	var parts []pathPart
	current := ""

	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch ch {
		case '.':
			if current != "" {
				parts = append(parts, pathPart{key: current, index: -1})
				current = ""
			}
		case '[':
			if current != "" {
				parts = append(parts, pathPart{key: current, index: -1})
				current = ""
			}
			// Parse the index
			j := i + 1
			for j < len(path) && path[j] != ']' {
				j++
			}
			if j < len(path) {
				indexStr := path[i+1 : j]
				index := 0
				for _, c := range indexStr {
					if c >= '0' && c <= '9' {
						index = index*10 + int(c-'0')
					}
				}
				parts = append(parts, pathPart{key: "", index: index})
				i = j
			}
		default:
			current += string(ch)
		}
	}

	if current != "" {
		parts = append(parts, pathPart{key: current, index: -1})
	}

	return parts
}

// formatValue converts a value to a display string and returns its type
func formatValue(v interface{}) (string, string) {
	switch val := v.(type) {
	case string:
		// Truncate very long strings
		if len(val) > 200 {
			return val[:200] + "...", "string"
		}
		return val, "string"
	case int, int64, float64:
		return formatNumber(val), "number"
	case bool:
		if val {
			return "true", "boolean"
		}
		return "false", "boolean"
	case []interface{}:
		if len(val) == 0 {
			return "[]", "array"
		}
		// Show first few items
		items := make([]string, 0, 3)
		for i, item := range val {
			if i >= 3 {
				items = append(items, "...")
				break
			}
			s, _ := formatValue(item)
			items = append(items, s)
		}
		return "[" + strings.Join(items, ", ") + "]", "array"
	case map[string]interface{}:
		// For objects, show the keys
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		if len(keys) > 5 {
			keys = keys[:5]
			keys = append(keys, "...")
		}
		return "{" + strings.Join(keys, ", ") + "}", "object"
	case nil:
		return "null", "null"
	default:
		return "", ""
	}
}

func formatNumber(v interface{}) string {
	switch n := v.(type) {
	case int:
		return strings.TrimRight(strings.TrimRight(
			strings.Replace(string(rune(n)), "", "", -1), "0"), ".")
	case int64:
		return strings.TrimRight(strings.TrimRight(
			strings.Replace(string(rune(n)), "", "", -1), "0"), ".")
	case float64:
		// Simple formatting
		s := ""
		if n == float64(int64(n)) {
			s = string(rune(int64(n)))
		}
		return s
	default:
		return ""
	}
}

// getFieldDescription provides context-aware descriptions for common fields
func getFieldDescription(fieldPath string) string {
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
		"severity":              "Priority level: critical, high, medium, or low",
		"impact":                "Impact level: critical, high, medium, or low",
		"timeframe":             "When this applies: immediate, near_term, medium_term, long_term",
		"workarounds":           "Array of current workarounds the user employs",
		"goals":                 "What the user is trying to achieve",
		"current_situation":     "Detailed description of the persona's current state (200+ chars)",
		"transformation_moment": "The pivotal moment when the user realizes value (200+ chars)",
		"emotional_resolution":  "How the user feels after successful outcome (200+ chars)",
		"technical_proficiency": "User's technical level: basic, intermediate, advanced, expert",
		"status":                "Current status: draft, ready, in-progress, delivered",
		"type":                  "Context type: ui, email, notification, api, report, integration",
		"id":                    "Unique identifier following pattern (e.g., fd-001, cap-001)",
		"contributes_to":        "Value model paths this contributes to",
		"tracks":                "Strategic tracks: product, strategy, org_ops, commercial",
	}

	if desc, ok := descriptions[field]; ok {
		return desc
	}
	return ""
}

// GetExamplesForErrors extracts examples for a list of error paths
func (e *ExampleExtractor) GetExamplesForErrors(artifactType schema.ArtifactType, errorPaths []string) map[string]FieldExample {
	examples := make(map[string]FieldExample)
	for _, path := range errorPaths {
		example := e.GetFieldExample(artifactType, path)
		if example.Value != "" {
			examples[path] = example
		}
	}
	return examples
}
