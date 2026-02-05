// Package validator provides YAML validation against EPF JSON Schemas.
// This file contains schema introspection utilities for extracting expected structures.
package validator

import (
	"encoding/json"
	"strconv"
	"strings"
)

// SchemaProperty represents a property definition in a JSON Schema
type SchemaProperty struct {
	Type        string                    `json:"type,omitempty"`
	Description string                    `json:"description,omitempty"`
	Enum        []interface{}             `json:"enum,omitempty"`
	Items       *SchemaProperty           `json:"items,omitempty"`
	Properties  map[string]SchemaProperty `json:"properties,omitempty"`
	Required    []string                  `json:"required,omitempty"`
	Ref         string                    `json:"$ref,omitempty"`
	MinLength   *int                      `json:"minLength,omitempty"`
	MaxLength   *int                      `json:"maxLength,omitempty"`
	MinItems    *int                      `json:"minItems,omitempty"`
	MaxItems    *int                      `json:"maxItems,omitempty"`
	OneOf       []SchemaProperty          `json:"oneOf,omitempty"`
	AnyOf       []SchemaProperty          `json:"anyOf,omitempty"`
	AllOf       []SchemaProperty          `json:"allOf,omitempty"`
}

// SchemaIntrospector provides methods to extract structure information from JSON schemas
type SchemaIntrospector struct {
	schemas map[string]json.RawMessage // schemaFile -> raw JSON
}

// NewSchemaIntrospector creates a new introspector with the given schema data
func NewSchemaIntrospector(schemas map[string]json.RawMessage) *SchemaIntrospector {
	return &SchemaIntrospector{
		schemas: schemas,
	}
}

// ExtractExpectedStructure extracts the expected structure for a given path in a schema
// schemaFile is the schema filename (e.g., "insight_analyses_schema.json")
// path is the JSON pointer path (e.g., "/target_users/0/problems/0")
// Returns a map of field names to type descriptions (e.g., {"severity": "enum: critical|high|medium|low"})
func (si *SchemaIntrospector) ExtractExpectedStructure(schemaFile string, path string) map[string]string {
	rawSchema, ok := si.schemas[schemaFile]
	if !ok {
		return nil
	}

	var schema SchemaProperty
	if err := json.Unmarshal(rawSchema, &schema); err != nil {
		return nil
	}

	// Navigate to the path in the schema
	targetSchema := si.navigateToPath(&schema, path)
	if targetSchema == nil {
		return nil
	}

	// Extract structure from the target schema
	return si.extractStructureFromSchema(targetSchema)
}

// navigateToPath navigates through the schema following a JSON pointer path
// Returns the schema at the specified path, or nil if not found
func (si *SchemaIntrospector) navigateToPath(schema *SchemaProperty, path string) *SchemaProperty {
	if path == "" || path == "/" {
		return schema
	}

	// Remove leading slash and split
	path = strings.TrimPrefix(path, "/")
	parts := strings.Split(path, "/")

	current := schema
	for _, part := range parts {
		if current == nil {
			return nil
		}

		// Check if part is a numeric index (array navigation)
		if isNumeric(part) {
			// Navigate into items schema
			if current.Items != nil {
				current = current.Items
			} else {
				return nil
			}
		} else {
			// Navigate into properties
			if current.Properties != nil {
				if prop, ok := current.Properties[part]; ok {
					current = &prop
				} else {
					return nil
				}
			} else {
				return nil
			}
		}
	}

	return current
}

// extractStructureFromSchema extracts a human-readable structure description from a schema
func (si *SchemaIntrospector) extractStructureFromSchema(schema *SchemaProperty) map[string]string {
	if schema == nil || schema.Properties == nil {
		return nil
	}

	result := make(map[string]string)
	requiredSet := make(map[string]bool)
	for _, r := range schema.Required {
		requiredSet[r] = true
	}

	for name, prop := range schema.Properties {
		typeDesc := si.describeType(&prop)
		if requiredSet[name] {
			typeDesc += " (required)"
		}
		result[name] = typeDesc
	}

	return result
}

// describeType creates a human-readable type description for a schema property
func (si *SchemaIntrospector) describeType(prop *SchemaProperty) string {
	if prop == nil {
		return "unknown"
	}

	// Handle enum
	if len(prop.Enum) > 0 {
		values := make([]string, len(prop.Enum))
		for i, v := range prop.Enum {
			values[i] = formatValue(v)
		}
		return "enum: " + strings.Join(values, "|")
	}

	// Handle arrays
	if prop.Type == "array" {
		itemType := "any"
		if prop.Items != nil {
			itemType = si.describeType(prop.Items)
		}
		constraints := ""
		if prop.MinItems != nil {
			constraints += " min:" + formatInt(*prop.MinItems)
		}
		if prop.MaxItems != nil {
			constraints += " max:" + formatInt(*prop.MaxItems)
		}
		return "array of " + itemType + constraints
	}

	// Handle objects
	if prop.Type == "object" {
		if len(prop.Properties) > 0 {
			fields := make([]string, 0, len(prop.Properties))
			for name := range prop.Properties {
				fields = append(fields, name)
			}
			if len(fields) > 3 {
				return "object {" + strings.Join(fields[:3], ", ") + ", ...}"
			}
			return "object {" + strings.Join(fields, ", ") + "}"
		}
		return "object"
	}

	// Handle strings with constraints
	if prop.Type == "string" {
		constraints := ""
		if prop.MinLength != nil {
			constraints += " min:" + formatInt(*prop.MinLength) + " chars"
		}
		if prop.MaxLength != nil {
			constraints += " max:" + formatInt(*prop.MaxLength) + " chars"
		}
		if constraints != "" {
			return "string" + constraints
		}
		return "string"
	}

	// Handle $ref (just return a simplified description)
	if prop.Ref != "" {
		// Extract the definition name from the ref
		parts := strings.Split(prop.Ref, "/")
		if len(parts) > 0 {
			return "object (see " + parts[len(parts)-1] + ")"
		}
	}

	// Handle oneOf/anyOf
	if len(prop.OneOf) > 0 {
		types := make([]string, 0, len(prop.OneOf))
		for _, p := range prop.OneOf {
			types = append(types, si.describeType(&p))
		}
		return "one of: " + strings.Join(types, " | ")
	}

	if len(prop.AnyOf) > 0 {
		types := make([]string, 0, len(prop.AnyOf))
		for _, p := range prop.AnyOf {
			types = append(types, si.describeType(&p))
		}
		return "any of: " + strings.Join(types, " | ")
	}

	// Default to the type
	if prop.Type != "" {
		return prop.Type
	}

	return "unknown"
}

// formatValue formats a value for display
func formatValue(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return formatFloat(val)
	case int:
		return strconv.Itoa(val)
	case bool:
		if val {
			return "true"
		}
		return "false"
	default:
		return "?"
	}
}

// formatInt formats an integer
func formatInt(n int) string {
	return strconv.Itoa(n)
}

// formatFloat formats a float, removing trailing zeros
func formatFloat(f float64) string {
	// Format with enough precision, then trim trailing zeros
	s := strconv.FormatFloat(f, 'f', -1, 64)
	return s
}
