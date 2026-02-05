// Package validator provides YAML validation against EPF JSON Schemas.
package validator

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/embedded"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
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
