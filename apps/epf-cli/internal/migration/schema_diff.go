// Package migration provides EPF version migration detection and guidance.
package migration

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// DiffSchemas compares two JSON schemas and returns the differences
func DiffSchemas(oldSchemaJSON, newSchemaJSON []byte) (*SchemaDiff, error) {
	var oldSchema, newSchema map[string]interface{}

	if err := json.Unmarshal(oldSchemaJSON, &oldSchema); err != nil {
		return nil, fmt.Errorf("failed to parse old schema: %w", err)
	}

	if err := json.Unmarshal(newSchemaJSON, &newSchema); err != nil {
		return nil, fmt.Errorf("failed to parse new schema: %w", err)
	}

	diff := &SchemaDiff{
		OldVersion: getStringField(oldSchema, "version"),
		NewVersion: getStringField(newSchema, "version"),
	}

	// Compare properties recursively
	oldProps := extractProperties(oldSchema, "")
	newProps := extractProperties(newSchema, "")

	oldRequired := extractRequiredFields(oldSchema, "")
	newRequired := extractRequiredFields(newSchema, "")

	// Find added fields
	for path, newProp := range newProps {
		if _, exists := oldProps[path]; !exists {
			fieldInfo := FieldInfo{
				Path:        path,
				Type:        getStringField(newProp, "type"),
				Description: getStringField(newProp, "description"),
				Required:    newRequired[path],
			}
			if def, ok := newProp["default"]; ok {
				fieldInfo.Default = def
			}

			if fieldInfo.Required {
				diff.AddedRequiredFields = append(diff.AddedRequiredFields, fieldInfo)
				diff.HasBreakingChanges = true
			} else {
				diff.AddedOptionalFields = append(diff.AddedOptionalFields, fieldInfo)
			}
		}
	}

	// Find removed fields
	for path, oldProp := range oldProps {
		if _, exists := newProps[path]; !exists {
			fieldInfo := FieldInfo{
				Path:        path,
				Type:        getStringField(oldProp, "type"),
				Description: getStringField(oldProp, "description"),
				Required:    oldRequired[path],
			}
			diff.RemovedFields = append(diff.RemovedFields, fieldInfo)
			if fieldInfo.Required {
				diff.HasBreakingChanges = true
			}
		}
	}

	// Find type changes
	for path, newProp := range newProps {
		if oldProp, exists := oldProps[path]; exists {
			oldType := getStringField(oldProp, "type")
			newType := getStringField(newProp, "type")

			if oldType != newType && oldType != "" && newType != "" {
				diff.TypeChanges = append(diff.TypeChanges, TypeChange{
					Path:    path,
					OldType: oldType,
					NewType: newType,
				})
				diff.HasBreakingChanges = true
			}

			// Check pattern changes
			oldPattern := getStringField(oldProp, "pattern")
			newPattern := getStringField(newProp, "pattern")
			if oldPattern != newPattern && (oldPattern != "" || newPattern != "") {
				diff.PatternChanges = append(diff.PatternChanges, PatternChange{
					Path:       path,
					OldPattern: oldPattern,
					NewPattern: newPattern,
				})
			}

			// Check enum changes
			oldEnum := getStringSlice(oldProp, "enum")
			newEnum := getStringSlice(newProp, "enum")
			if len(oldEnum) > 0 || len(newEnum) > 0 {
				enumChange := compareEnums(path, oldEnum, newEnum)
				if enumChange != nil {
					diff.EnumChanges = append(diff.EnumChanges, *enumChange)
				}
			}
		}
	}

	// Check for required field changes (field exists in both but required status changed)
	for path := range newProps {
		if _, existsInOld := oldProps[path]; existsInOld {
			wasRequired := oldRequired[path]
			isRequired := newRequired[path]

			if !wasRequired && isRequired {
				// Field became required - this is breaking
				diff.HasBreakingChanges = true
			}
		}
	}

	// Sort fields for consistent output
	sortFieldInfos(diff.AddedRequiredFields)
	sortFieldInfos(diff.AddedOptionalFields)
	sortFieldInfos(diff.RemovedFields)

	return diff, nil
}

// extractProperties recursively extracts all properties from a JSON schema
func extractProperties(schema map[string]interface{}, prefix string) map[string]map[string]interface{} {
	result := make(map[string]map[string]interface{})

	// Handle direct properties
	if props, ok := schema["properties"].(map[string]interface{}); ok {
		for name, propValue := range props {
			path := name
			if prefix != "" {
				path = prefix + "." + name
			}

			if propMap, ok := propValue.(map[string]interface{}); ok {
				result[path] = propMap

				// Recursively extract nested properties
				nested := extractProperties(propMap, path)
				for k, v := range nested {
					result[k] = v
				}

				// Handle array items
				if items, ok := propMap["items"].(map[string]interface{}); ok {
					itemPath := path + "[]"
					result[itemPath] = items

					nestedItems := extractProperties(items, itemPath)
					for k, v := range nestedItems {
						result[k] = v
					}
				}
			}
		}
	}

	// Handle definitions/$defs for referenced schemas
	for _, defsKey := range []string{"definitions", "$defs"} {
		if defs, ok := schema[defsKey].(map[string]interface{}); ok {
			for defName, defValue := range defs {
				defPath := fmt.Sprintf("#/%s/%s", defsKey, defName)
				if defMap, ok := defValue.(map[string]interface{}); ok {
					nested := extractProperties(defMap, defPath)
					for k, v := range nested {
						result[k] = v
					}
				}
			}
		}
	}

	return result
}

// extractRequiredFields extracts all required field paths from a schema
func extractRequiredFields(schema map[string]interface{}, prefix string) map[string]bool {
	result := make(map[string]bool)

	// Get required array at this level
	if required, ok := schema["required"].([]interface{}); ok {
		for _, r := range required {
			if fieldName, ok := r.(string); ok {
				path := fieldName
				if prefix != "" {
					path = prefix + "." + fieldName
				}
				result[path] = true
			}
		}
	}

	// Recursively check properties
	if props, ok := schema["properties"].(map[string]interface{}); ok {
		for name, propValue := range props {
			path := name
			if prefix != "" {
				path = prefix + "." + name
			}

			if propMap, ok := propValue.(map[string]interface{}); ok {
				nested := extractRequiredFields(propMap, path)
				for k, v := range nested {
					result[k] = v
				}

				// Handle array items
				if items, ok := propMap["items"].(map[string]interface{}); ok {
					itemPath := path + "[]"
					nestedItems := extractRequiredFields(items, itemPath)
					for k, v := range nestedItems {
						result[k] = v
					}
				}
			}
		}
	}

	return result
}

// getStringField safely gets a string field from a map
func getStringField(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// getStringSlice safely gets a string slice from a map
func getStringSlice(m map[string]interface{}, key string) []string {
	if arr, ok := m[key].([]interface{}); ok {
		var result []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}

// compareEnums compares two enum arrays and returns changes
func compareEnums(path string, oldEnum, newEnum []string) *EnumChange {
	oldSet := make(map[string]bool)
	newSet := make(map[string]bool)

	for _, v := range oldEnum {
		oldSet[v] = true
	}
	for _, v := range newEnum {
		newSet[v] = true
	}

	var added, removed []string

	for v := range newSet {
		if !oldSet[v] {
			added = append(added, v)
		}
	}

	for v := range oldSet {
		if !newSet[v] {
			removed = append(removed, v)
		}
	}

	if len(added) == 0 && len(removed) == 0 {
		return nil
	}

	sort.Strings(added)
	sort.Strings(removed)

	return &EnumChange{
		Path:          path,
		AddedValues:   added,
		RemovedValues: removed,
	}
}

// sortFieldInfos sorts a slice of FieldInfo by path
func sortFieldInfos(fields []FieldInfo) {
	sort.Slice(fields, func(i, j int) bool {
		return fields[i].Path < fields[j].Path
	})
}

// DescribeChanges generates a human-readable description of schema changes
func (d *SchemaDiff) DescribeChanges() []string {
	var descriptions []string

	if len(d.AddedRequiredFields) > 0 {
		var paths []string
		for _, f := range d.AddedRequiredFields {
			paths = append(paths, f.Path)
		}
		descriptions = append(descriptions,
			fmt.Sprintf("Added required fields: %s", strings.Join(paths, ", ")))
	}

	if len(d.AddedOptionalFields) > 0 {
		var paths []string
		for _, f := range d.AddedOptionalFields {
			paths = append(paths, f.Path)
		}
		descriptions = append(descriptions,
			fmt.Sprintf("Added optional fields: %s", strings.Join(paths, ", ")))
	}

	if len(d.RemovedFields) > 0 {
		var paths []string
		for _, f := range d.RemovedFields {
			paths = append(paths, f.Path)
		}
		descriptions = append(descriptions,
			fmt.Sprintf("Removed fields: %s", strings.Join(paths, ", ")))
	}

	if len(d.TypeChanges) > 0 {
		for _, tc := range d.TypeChanges {
			descriptions = append(descriptions,
				fmt.Sprintf("Type change at %s: %s -> %s", tc.Path, tc.OldType, tc.NewType))
		}
	}

	if len(d.PatternChanges) > 0 {
		for _, pc := range d.PatternChanges {
			descriptions = append(descriptions,
				fmt.Sprintf("Pattern change at %s: %q -> %q", pc.Path, pc.OldPattern, pc.NewPattern))
		}
	}

	if len(d.EnumChanges) > 0 {
		for _, ec := range d.EnumChanges {
			if len(ec.AddedValues) > 0 {
				descriptions = append(descriptions,
					fmt.Sprintf("New enum values at %s: %s", ec.Path, strings.Join(ec.AddedValues, ", ")))
			}
			if len(ec.RemovedValues) > 0 {
				descriptions = append(descriptions,
					fmt.Sprintf("Removed enum values at %s: %s", ec.Path, strings.Join(ec.RemovedValues, ", ")))
			}
		}
	}

	return descriptions
}

// IsEmpty returns true if there are no changes
func (d *SchemaDiff) IsEmpty() bool {
	return len(d.AddedRequiredFields) == 0 &&
		len(d.AddedOptionalFields) == 0 &&
		len(d.RemovedFields) == 0 &&
		len(d.TypeChanges) == 0 &&
		len(d.PatternChanges) == 0 &&
		len(d.EnumChanges) == 0
}

// Summary returns a brief summary of changes
func (d *SchemaDiff) Summary() string {
	if d.IsEmpty() {
		return "No changes"
	}

	var parts []string

	if n := len(d.AddedRequiredFields); n > 0 {
		parts = append(parts, fmt.Sprintf("%d new required field(s)", n))
	}
	if n := len(d.AddedOptionalFields); n > 0 {
		parts = append(parts, fmt.Sprintf("%d new optional field(s)", n))
	}
	if n := len(d.RemovedFields); n > 0 {
		parts = append(parts, fmt.Sprintf("%d removed field(s)", n))
	}
	if n := len(d.TypeChanges); n > 0 {
		parts = append(parts, fmt.Sprintf("%d type change(s)", n))
	}
	if n := len(d.PatternChanges); n > 0 {
		parts = append(parts, fmt.Sprintf("%d pattern change(s)", n))
	}
	if n := len(d.EnumChanges); n > 0 {
		parts = append(parts, fmt.Sprintf("%d enum change(s)", n))
	}

	summary := strings.Join(parts, ", ")
	if d.HasBreakingChanges {
		summary += " (BREAKING)"
	}

	return summary
}
