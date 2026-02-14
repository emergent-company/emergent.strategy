// Package validator provides YAML validation against EPF JSON Schemas.
package validator

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/schema"
	"github.com/santhosh-tekuri/jsonschema/v5"
	"gopkg.in/yaml.v3"
)

// ValidationError represents a validation error
type ValidationError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
}

func (e *ValidationError) Error() string {
	if e.Line > 0 {
		return fmt.Sprintf("%s (line %d, col %d): %s", e.Path, e.Line, e.Column, e.Message)
	}
	return fmt.Sprintf("%s: %s", e.Path, e.Message)
}

// ValidationResult contains the result of validation
type ValidationResult struct {
	Valid        bool              `json:"valid"`
	FilePath     string            `json:"file_path,omitempty"`
	ArtifactType string            `json:"artifact_type,omitempty"`
	Phase        string            `json:"phase,omitempty"`
	Errors       []ValidationError `json:"errors,omitempty"`
}

// ToJSON converts the result to JSON string
func (r *ValidationResult) ToJSON() (string, error) {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// Validator validates YAML files against EPF schemas
type Validator struct {
	loader     *schema.Loader
	schemasDir string
	compiler   *jsonschema.Compiler
	compiled   map[schema.ArtifactType]*jsonschema.Schema
}

// NewValidator creates a new validator with schemas loaded from the given directory.
// If schemasDir is empty or not found, falls back to embedded schemas.
func NewValidator(schemasDir string) (*Validator, error) {
	loader := schema.NewLoader(schemasDir)
	if err := loader.Load(); err != nil {
		return nil, fmt.Errorf("failed to load schemas: %w", err)
	}

	compiler := jsonschema.NewCompiler()
	compiler.Draft = jsonschema.Draft7 // EPF uses Draft-07

	v := &Validator{
		loader:     loader,
		schemasDir: schemasDir,
		compiler:   compiler,
		compiled:   make(map[schema.ArtifactType]*jsonschema.Schema),
	}

	// Add schema resources based on source (filesystem or embedded)
	if loader.IsEmbedded() {
		// Load from embedded files
		schemaNames, err := embedded.ListSchemas()
		if err != nil {
			return nil, fmt.Errorf("failed to list embedded schemas: %w", err)
		}

		for _, name := range schemaNames {
			data, err := embedded.GetSchema(name)
			if err != nil {
				continue // Skip unreadable schemas
			}
			if err := compiler.AddResource(name, strings.NewReader(string(data))); err != nil {
				return nil, fmt.Errorf("failed to add embedded schema resource %s: %w", name, err)
			}
		}
	} else {
		// Load from filesystem
		absDir, err := filepath.Abs(schemasDir)
		if err != nil {
			return nil, fmt.Errorf("failed to get absolute path: %w", err)
		}
		v.schemasDir = absDir

		entries, err := os.ReadDir(schemasDir)
		if err != nil {
			return nil, fmt.Errorf("failed to read schemas directory: %w", err)
		}

		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
				continue
			}

			schemaPath := filepath.Join(schemasDir, entry.Name())
			data, err := os.ReadFile(schemaPath)
			if err != nil {
				continue // Skip unreadable files
			}

			// Use the filename as the schema ID (this matches how $ref works)
			schemaID := entry.Name()
			if err := compiler.AddResource(schemaID, strings.NewReader(string(data))); err != nil {
				return nil, fmt.Errorf("failed to add schema resource %s: %w", entry.Name(), err)
			}
		}
	}

	// Compile schemas for artifact types we care about
	for _, schemaInfo := range loader.ListSchemas() {
		compiled, err := compiler.Compile(schemaInfo.SchemaFile)
		if err != nil {
			// Some schemas might not compile due to missing refs - skip them
			// but log the issue
			fmt.Fprintf(os.Stderr, "Warning: could not compile schema %s: %v\n", schemaInfo.SchemaFile, err)
			continue
		}
		v.compiled[schemaInfo.ArtifactType] = compiled
	}

	if len(v.compiled) == 0 {
		return nil, fmt.Errorf("no schemas could be compiled from %s", loader.Source())
	}

	return v, nil
}

// GetLoader returns the underlying schema loader
func (v *Validator) GetLoader() *schema.Loader {
	return v.loader
}

// GetSchemaIntrospector returns a SchemaIntrospector for extracting structure information
func (v *Validator) GetSchemaIntrospector() *SchemaIntrospector {
	schemas := make(map[string]json.RawMessage)
	for _, schemaInfo := range v.loader.ListSchemas() {
		if info, err := v.loader.GetSchema(schemaInfo.ArtifactType); err == nil && info != nil {
			schemas[info.SchemaFile] = info.Schema
		}
	}
	return NewSchemaIntrospector(schemas)
}

// GetSchemaFileForArtifact returns the schema filename for a given artifact type
func (v *Validator) GetSchemaFileForArtifact(artifactType string) string {
	if info, err := v.loader.GetSchema(schema.ArtifactType(artifactType)); err == nil && info != nil {
		return info.SchemaFile
	}
	return ""
}

// ValidateFile validates a YAML file against its detected schema
func (v *Validator) ValidateFile(filePath string) (*ValidationResult, error) {
	// Read the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	// Parse YAML
	var content interface{}
	if err := yaml.Unmarshal(data, &content); err != nil {
		return &ValidationResult{
			Valid:    false,
			FilePath: filePath,
			Errors: []ValidationError{{
				Path:    filePath,
				Message: fmt.Sprintf("Invalid YAML: %s", err.Error()),
			}},
		}, nil
	}

	// Convert YAML to JSON-compatible structure
	jsonCompatible := convertYAMLToJSON(content)

	// Detect artifact type from file path
	artifactType, err := v.loader.DetectArtifactType(filePath)
	if err != nil {
		return &ValidationResult{
			Valid:    false,
			FilePath: filePath,
			Errors: []ValidationError{{
				Path:    filePath,
				Message: err.Error(),
			}},
		}, nil
	}

	// Get schema info for phase
	schemaInfo, _ := v.loader.GetSchema(artifactType)
	var phase string
	if schemaInfo != nil {
		phase = string(schemaInfo.Phase)
	}

	// Get compiled schema
	compiledSchema, ok := v.compiled[artifactType]
	if !ok {
		return nil, fmt.Errorf("no compiled schema for artifact type: %s", artifactType)
	}

	// Validate
	result := &ValidationResult{
		Valid:        true,
		FilePath:     filePath,
		ArtifactType: string(artifactType),
		Phase:        phase,
	}

	if err := compiledSchema.Validate(jsonCompatible); err != nil {
		result.Valid = false
		result.Errors = extractValidationErrors(filePath, err)
	}

	return result, nil
}

// ValidateFileAIFriendly validates a YAML file and returns AI-friendly structured output.
// This is optimized for AI agents, with error classification, priorities, and fix hints.
func (v *Validator) ValidateFileAIFriendly(filePath string) (*AIFriendlyResult, error) {
	result, err := v.ValidateFile(filePath)
	if err != nil {
		return nil, err
	}

	return v.convertToAIFriendly(filePath, result), nil
}

// ValidateSectionAIFriendly validates a specific section of a YAML file and returns
// AI-friendly structured output.
func (v *Validator) ValidateSectionAIFriendly(filePath string, sectionPath string) (*AIFriendlyResult, error) {
	result, err := v.ValidateSection(filePath, sectionPath)
	if err != nil {
		return nil, err
	}

	aiResult := v.convertToAIFriendly(filePath, result)
	aiResult.Section = sectionPath
	return aiResult, nil
}

// convertToAIFriendly converts a basic ValidationResult to AI-friendly format
func (v *Validator) convertToAIFriendly(filePath string, result *ValidationResult) *AIFriendlyResult {
	var enhancedErrors []*EnhancedValidationError

	// Get schema introspector for extracting expected structures
	introspector := v.GetSchemaIntrospector()
	schemaFile := v.GetSchemaFileForArtifact(result.ArtifactType)

	for _, err := range result.Errors {
		// Extract the JSON pointer from the error path
		jsonPointer := ""
		if idx := strings.Index(err.Path, "#"); idx != -1 {
			jsonPointer = err.Path[idx+1:]
		}

		enhanced := &EnhancedValidationError{
			Path:        jsonPointerToPath(jsonPointer),
			JSONPointer: jsonPointer,
			Message:     err.Message,
		}

		// Classify the error
		classifyError(enhanced, err.Message)

		// Set priority based on error type
		enhanced.Priority = getPriority(enhanced.ErrorType)

		// For type mismatches where we expect an object, extract expected structure
		if enhanced.ErrorType == ErrorTypeMismatch && enhanced.Details.ExpectedType == "object" {
			if schemaFile != "" && jsonPointer != "" {
				expectedStructure := introspector.ExtractExpectedStructure(schemaFile, jsonPointer)
				if expectedStructure != nil && len(expectedStructure) > 0 {
					enhanced.Details.ExpectedStructure = expectedStructure
				}
			}
		}

		// Generate fix hint
		enhanced.FixHint = generateFixHint(enhanced)

		enhancedErrors = append(enhancedErrors, enhanced)
	}

	return CreateAIFriendlyResult(filePath, result.ArtifactType, enhancedErrors)
}

// ValidateFileWithType validates a YAML file against a specific artifact type
func (v *Validator) ValidateFileWithType(filePath string, artifactType schema.ArtifactType) (*ValidationResult, error) {
	// Read the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return v.ValidateContent(data, artifactType)
}

// ValidateContent validates YAML content against a specific artifact type
func (v *Validator) ValidateContent(content []byte, artifactType schema.ArtifactType) (*ValidationResult, error) {
	// Parse YAML
	var parsed interface{}
	if err := yaml.Unmarshal(content, &parsed); err != nil {
		return &ValidationResult{
			Valid:        false,
			ArtifactType: string(artifactType),
			Errors: []ValidationError{{
				Message: fmt.Sprintf("Invalid YAML: %s", err.Error()),
			}},
		}, nil
	}

	// Convert YAML to JSON-compatible structure
	jsonCompatible := convertYAMLToJSON(parsed)

	// Get schema info for phase
	schemaInfo, _ := v.loader.GetSchema(artifactType)
	var phase string
	if schemaInfo != nil {
		phase = string(schemaInfo.Phase)
	}

	// Get compiled schema
	compiledSchema, ok := v.compiled[artifactType]
	if !ok {
		return nil, fmt.Errorf("no compiled schema for artifact type: %s", artifactType)
	}

	// Validate
	result := &ValidationResult{
		Valid:        true,
		ArtifactType: string(artifactType),
		Phase:        phase,
	}

	if err := compiledSchema.Validate(jsonCompatible); err != nil {
		result.Valid = false
		result.Errors = extractValidationErrors("", err)
	}

	return result, nil
}

// convertYAMLToJSON converts YAML-parsed data to JSON-compatible structure
// This is needed because YAML parses maps as map[string]interface{} while
// some YAML features create map[interface{}]interface{}
func convertYAMLToJSON(data interface{}) interface{} {
	switch v := data.(type) {
	case map[interface{}]interface{}:
		m := make(map[string]interface{})
		for key, val := range v {
			m[fmt.Sprintf("%v", key)] = convertYAMLToJSON(val)
		}
		return m
	case map[string]interface{}:
		m := make(map[string]interface{})
		for key, val := range v {
			m[key] = convertYAMLToJSON(val)
		}
		return m
	case []interface{}:
		arr := make([]interface{}, len(v))
		for i, val := range v {
			arr[i] = convertYAMLToJSON(val)
		}
		return arr
	default:
		return v
	}
}

// extractValidationErrors converts jsonschema validation errors to our format
func extractValidationErrors(filePath string, err error) []ValidationError {
	var errors []ValidationError

	if validationErr, ok := err.(*jsonschema.ValidationError); ok {
		errors = append(errors, extractNestedErrors(filePath, validationErr)...)
	} else {
		errors = append(errors, ValidationError{
			Path:    filePath,
			Message: err.Error(),
		})
	}

	return errors
}

// extractNestedErrors recursively extracts nested validation errors
func extractNestedErrors(filePath string, err *jsonschema.ValidationError) []ValidationError {
	var errors []ValidationError

	// Add the main error if it has a message
	if err.Message != "" {
		path := filePath
		if err.InstanceLocation != "" {
			if filePath != "" {
				path = fmt.Sprintf("%s#%s", filePath, err.InstanceLocation)
			} else {
				path = err.InstanceLocation
			}
		}
		errors = append(errors, ValidationError{
			Path:    path,
			Message: err.Message,
		})
	}

	// Add nested causes
	for _, cause := range err.Causes {
		errors = append(errors, extractNestedErrors(filePath, cause)...)
	}

	return errors
}

// ValidateSection validates a specific section of a YAML file against the corresponding
// part of its schema. This enables incremental validation for AI agents fixing files
// section by section.
func (v *Validator) ValidateSection(filePath string, sectionPath string) (*ValidationResult, error) {
	// Read the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	// Parse YAML into a map
	var fileData map[string]interface{}
	if err := yaml.Unmarshal(data, &fileData); err != nil {
		return &ValidationResult{
			Valid:    false,
			FilePath: filePath,
			Errors: []ValidationError{{
				Path:    filePath,
				Message: fmt.Sprintf("Invalid YAML: %s", err.Error()),
			}},
		}, nil
	}

	// Detect artifact type from file path
	artifactType, err := v.loader.DetectArtifactType(filePath)
	if err != nil {
		return &ValidationResult{
			Valid:    false,
			FilePath: filePath,
			Errors: []ValidationError{{
				Path:    filePath,
				Message: err.Error(),
			}},
		}, nil
	}

	// Get schema info
	schemaInfo, _ := v.loader.GetSchema(artifactType)
	var phase string
	if schemaInfo != nil {
		phase = string(schemaInfo.Phase)
	}

	// Extract the section from the file data
	sectionData, err := extractSectionFromYAML(fileData, sectionPath)
	if err != nil {
		return &ValidationResult{
			Valid:        false,
			FilePath:     filePath,
			ArtifactType: string(artifactType),
			Phase:        phase,
			Errors: []ValidationError{{
				Path:    sectionPath,
				Message: fmt.Sprintf("Section not found: %s", err.Error()),
			}},
		}, nil
	}

	// Convert extracted section to JSON-compatible structure
	jsonCompatible := convertYAMLToJSON(sectionData)

	// Get the raw schema for this artifact type
	if schemaInfo == nil || schemaInfo.Schema == nil {
		return nil, fmt.Errorf("no schema found for artifact type: %s", artifactType)
	}

	// Parse the schema JSON
	var schemaMap map[string]interface{}
	if err := json.Unmarshal(schemaInfo.Schema, &schemaMap); err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	// Extract the sub-schema for this section path
	subSchema, err := extractSubSchema(schemaMap, sectionPath)
	if err != nil {
		return nil, fmt.Errorf("failed to extract sub-schema for path '%s': %w", sectionPath, err)
	}

	// Create a temporary schema that wraps the sub-schema as root
	// We need to make it a valid JSON Schema document
	tempSchemaMap := map[string]interface{}{
		"$schema": "http://json-schema.org/draft-07/schema#",
	}

	// Copy all properties from subSchema to tempSchemaMap
	for k, val := range subSchema {
		tempSchemaMap[k] = val
	}

	// Compile the temporary schema
	tempSchemaBytes, err := json.Marshal(tempSchemaMap)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal temp schema: %w", err)
	}

	tempCompiler := jsonschema.NewCompiler()
	tempCompiler.Draft = jsonschema.Draft7

	// Add all the schema resources first (for $ref resolution)
	if v.loader.IsEmbedded() {
		schemaNames, _ := embedded.ListSchemas()
		for _, name := range schemaNames {
			schemaData, err := embedded.GetSchema(name)
			if err == nil {
				tempCompiler.AddResource(name, strings.NewReader(string(schemaData)))
			}
		}
	} else if v.schemasDir != "" {
		entries, _ := os.ReadDir(v.schemasDir)
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
				schemaData, err := os.ReadFile(filepath.Join(v.schemasDir, entry.Name()))
				if err == nil {
					tempCompiler.AddResource(entry.Name(), strings.NewReader(string(schemaData)))
				}
			}
		}
	}

	// Add the temp schema
	tempSchemaID := "temp_section_schema.json"
	if err := tempCompiler.AddResource(tempSchemaID, strings.NewReader(string(tempSchemaBytes))); err != nil {
		return nil, fmt.Errorf("failed to add temp schema resource: %w", err)
	}

	compiledSchema, err := tempCompiler.Compile(tempSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile temp schema: %w", err)
	}

	// Validate the section data
	result := &ValidationResult{
		Valid:        true,
		FilePath:     filePath,
		ArtifactType: string(artifactType),
		Phase:        phase,
	}

	if err := compiledSchema.Validate(jsonCompatible); err != nil {
		result.Valid = false
		// Extract errors and prefix paths with the section path
		rawErrors := extractValidationErrors("", err)
		for i := range rawErrors {
			// Prepend section path to error paths
			if rawErrors[i].Path == "" || rawErrors[i].Path == "/" {
				rawErrors[i].Path = fmt.Sprintf("%s#/%s", filePath, strings.ReplaceAll(sectionPath, ".", "/"))
			} else {
				rawErrors[i].Path = fmt.Sprintf("%s#/%s%s", filePath, strings.ReplaceAll(sectionPath, ".", "/"), rawErrors[i].Path)
			}
		}
		result.Errors = rawErrors
	}

	return result, nil
}

// extractSectionFromYAML extracts a nested section from YAML data using a dot-notation path
// e.g., "target_users" or "competitive_landscape.direct_competitors"
func extractSectionFromYAML(data map[string]interface{}, path string) (interface{}, error) {
	parts := strings.Split(path, ".")
	var current interface{} = data

	for _, part := range parts {
		if m, ok := current.(map[string]interface{}); ok {
			if val, exists := m[part]; exists {
				current = val
			} else {
				return nil, fmt.Errorf("path segment '%s' not found", part)
			}
		} else {
			return nil, fmt.Errorf("cannot navigate into non-object at '%s'", part)
		}
	}

	return current, nil
}

// extractSubSchema extracts the schema for a nested property path
// The path uses dot notation (e.g., "target_users" or "competitive_landscape.direct_competitors")
func extractSubSchema(schemaMap map[string]interface{}, path string) (map[string]interface{}, error) {
	parts := strings.Split(path, ".")
	currentSchema := schemaMap

	for _, part := range parts {
		// Look for the property in "properties"
		props, ok := currentSchema["properties"].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("no 'properties' found at path segment '%s'", part)
		}

		propSchema, ok := props[part].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("property '%s' not found in schema", part)
		}

		// If this property is an array with items, we might need to go into items
		if propSchema["type"] == "array" {
			if items, ok := propSchema["items"].(map[string]interface{}); ok {
				// For the last part, return the array schema itself
				// For intermediate parts, we'd need to handle differently
				currentSchema = propSchema
				// If there are more parts, navigate into items
				if len(parts) > 1 {
					currentSchema = items
				}
			} else {
				currentSchema = propSchema
			}
		} else {
			currentSchema = propSchema
		}
	}

	return currentSchema, nil
}
