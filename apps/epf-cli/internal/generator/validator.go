package generator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// OutputValidator validates generator outputs
type OutputValidator struct {
	loader *Loader
}

// NewOutputValidator creates a new output validator
func NewOutputValidator(loader *Loader) *OutputValidator {
	return &OutputValidator{loader: loader}
}

// ValidateOptions contains options for validation
type ValidateOptions struct {
	// Generator name
	Generator string

	// Content to validate (either Content or FilePath must be provided)
	Content string

	// Path to file to validate
	FilePath string

	// Whether to run the bash validator (if available)
	RunBashValidator bool

	// Timeout for bash validator execution
	BashTimeout time.Duration
}

// Validate validates generator output against its schema and optionally runs the bash validator
func (v *OutputValidator) Validate(ctx context.Context, opts ValidateOptions) (*ValidationResult, error) {
	// Get generator info
	gen, err := v.loader.GetGenerator(opts.Generator)
	if err != nil {
		return nil, fmt.Errorf("failed to get generator: %w", err)
	}

	result := &ValidationResult{
		Valid:  true,
		Layers: make(map[string]LayerResult),
	}

	// Get content to validate
	content := opts.Content
	if content == "" && opts.FilePath != "" {
		data, err := os.ReadFile(opts.FilePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read file: %w", err)
		}
		content = string(data)
	}

	if content == "" {
		return nil, fmt.Errorf("no content to validate (provide either Content or FilePath)")
	}

	// Layer 1: Schema validation
	schemaResult := v.validateSchema(gen, content)
	result.Layers["schema"] = schemaResult
	if !schemaResult.Passed {
		result.Valid = false
		result.Errors = append(result.Errors, schemaResult.Errors...)
	}
	result.Warnings = append(result.Warnings, schemaResult.Warnings...)

	// Layer 2: Bash validator (optional)
	if opts.RunBashValidator && gen.HasValidator {
		bashResult := v.runBashValidator(ctx, gen, content, opts.FilePath, opts.BashTimeout)
		result.Layers["bash"] = bashResult
		if !bashResult.Passed {
			result.Valid = false
			result.Errors = append(result.Errors, bashResult.Errors...)
		}
		result.Warnings = append(result.Warnings, bashResult.Warnings...)
	}

	return result, nil
}

// validateSchema validates content against the generator's JSON schema
func (v *OutputValidator) validateSchema(gen *GeneratorInfo, content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}

	if !gen.HasSchema {
		result.Warnings = append(result.Warnings, "No schema.json found for this generator")
		return result
	}

	// Read schema file
	schemaPath := filepath.Join(gen.Path, gen.SchemaFile)
	schemaData, err := os.ReadFile(schemaPath)
	if err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to read schema: %v", err))
		return result
	}

	// Determine content type and validate accordingly
	outputFormat := gen.OutputFormat
	if outputFormat == "" {
		outputFormat = FormatMarkdown // Default
	}

	switch outputFormat {
	case FormatJSON:
		// Direct JSON validation
		return v.validateJSONContent(schemaData, content)
	case FormatYAML:
		// Convert YAML to JSON for validation
		return v.validateYAMLContent(schemaData, content)
	case FormatMarkdown, FormatText, FormatHTML:
		// For non-structured formats, we need to extract frontmatter or embedded JSON
		// For now, we'll check if the content has JSON frontmatter
		if jsonContent := extractJSONFromMarkdown(content); jsonContent != "" {
			return v.validateJSONContent(schemaData, jsonContent)
		}
		result.Warnings = append(result.Warnings,
			"Schema validation skipped: No JSON/YAML frontmatter found in "+string(outputFormat)+" content")
		return result
	default:
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("Schema validation not supported for format: %s", outputFormat))
		return result
	}
}

// validateJSONContent validates JSON content against a schema
func (v *OutputValidator) validateJSONContent(schemaData []byte, content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}

	// Compile schema
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("schema.json", bytes.NewReader(schemaData)); err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Invalid schema: %v", err))
		return result
	}

	schema, err := compiler.Compile("schema.json")
	if err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to compile schema: %v", err))
		return result
	}

	// Parse content as JSON
	var jsonContent interface{}
	if err := json.Unmarshal([]byte(content), &jsonContent); err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Invalid JSON: %v", err))
		return result
	}

	// Validate
	if err := schema.Validate(jsonContent); err != nil {
		result.Passed = false
		// Extract validation errors
		if validationErr, ok := err.(*jsonschema.ValidationError); ok {
			for _, e := range flattenValidationErrors(validationErr) {
				result.Errors = append(result.Errors, e)
			}
		} else {
			result.Errors = append(result.Errors, err.Error())
		}
	}

	return result
}

// validateYAMLContent validates YAML content against a schema
func (v *OutputValidator) validateYAMLContent(schemaData []byte, content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}

	// For YAML validation, we'd need to convert to JSON first
	// For now, we'll just do basic structure validation
	result.Warnings = append(result.Warnings, "YAML schema validation not yet fully implemented")

	return result
}

// flattenValidationErrors extracts all error messages from a validation error
func flattenValidationErrors(err *jsonschema.ValidationError) []string {
	var errors []string

	if err.Message != "" {
		path := err.InstanceLocation
		if path == "" {
			path = "/"
		}
		errors = append(errors, fmt.Sprintf("%s: %s", path, err.Message))
	}

	for _, cause := range err.Causes {
		errors = append(errors, flattenValidationErrors(cause)...)
	}

	return errors
}

// extractJSONFromMarkdown tries to extract JSON frontmatter or code blocks from markdown
func extractJSONFromMarkdown(content string) string {
	// Check for JSON frontmatter (---json ... ---)
	if strings.HasPrefix(content, "---json") {
		end := strings.Index(content[7:], "---")
		if end > 0 {
			return strings.TrimSpace(content[7 : 7+end])
		}
	}

	// Check for JSON code block at the start
	if strings.HasPrefix(content, "```json") {
		end := strings.Index(content[7:], "```")
		if end > 0 {
			return strings.TrimSpace(content[7 : 7+end])
		}
	}

	// Check if the entire content is valid JSON
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "{") || strings.HasPrefix(content, "[") {
		var js interface{}
		if err := json.Unmarshal([]byte(content), &js); err == nil {
			return content
		}
	}

	return ""
}

// runBashValidator executes the generator's validator.sh script
func (v *OutputValidator) runBashValidator(ctx context.Context, gen *GeneratorInfo, content, filePath string, timeout time.Duration) LayerResult {
	result := LayerResult{
		Name:   "Bash Validator",
		Passed: true,
	}

	// Check if we're on a Unix-like system
	if runtime.GOOS == "windows" {
		result.Warnings = append(result.Warnings, "Bash validator skipped on Windows")
		return result
	}

	validatorPath := filepath.Join(gen.Path, gen.ValidatorFile)

	// Check if validator exists and is executable
	info, err := os.Stat(validatorPath)
	if err != nil {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Validator not accessible: %v", err))
		return result
	}

	// Check if it's executable
	if info.Mode()&0111 == 0 {
		result.Warnings = append(result.Warnings, "Validator is not executable (chmod +x validator.sh)")
		return result
	}

	// If we only have content, write to temp file
	tmpFile := ""
	if filePath == "" {
		f, err := os.CreateTemp("", "epf-validate-*")
		if err != nil {
			result.Passed = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to create temp file: %v", err))
			return result
		}
		tmpFile = f.Name()
		defer os.Remove(tmpFile)

		if _, err := f.WriteString(content); err != nil {
			f.Close()
			result.Passed = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to write temp file: %v", err))
			return result
		}
		f.Close()
		filePath = tmpFile
	}

	// Set default timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Run validator
	cmd := exec.CommandContext(ctx, validatorPath, filePath)
	cmd.Dir = gen.Path

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()

	// Capture output
	stdoutStr := strings.TrimSpace(stdout.String())
	stderrStr := strings.TrimSpace(stderr.String())

	if ctx.Err() == context.DeadlineExceeded {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Validator timed out after %v", timeout))
		return result
	}

	if err != nil {
		result.Passed = false
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.Errors = append(result.Errors, fmt.Sprintf("Validator failed with exit code %d", exitErr.ExitCode()))
		} else {
			result.Errors = append(result.Errors, fmt.Sprintf("Validator error: %v", err))
		}

		// Add stderr output as errors
		if stderrStr != "" {
			for _, line := range strings.Split(stderrStr, "\n") {
				if line = strings.TrimSpace(line); line != "" {
					result.Errors = append(result.Errors, line)
				}
			}
		}
	}

	// Parse stdout for warnings (lines starting with "Warning:" or "⚠")
	if stdoutStr != "" {
		for _, line := range strings.Split(stdoutStr, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "warning:") || strings.Contains(line, "⚠") {
				result.Warnings = append(result.Warnings, line)
			}
		}
	}

	return result
}

// ValidateFile is a convenience method that validates a file
func (v *OutputValidator) ValidateFile(ctx context.Context, generator, filePath string, runBash bool) (*ValidationResult, error) {
	return v.Validate(ctx, ValidateOptions{
		Generator:        generator,
		FilePath:         filePath,
		RunBashValidator: runBash,
	})
}

// ValidateContent is a convenience method that validates content directly
func (v *OutputValidator) ValidateContent(ctx context.Context, generator, content string) (*ValidationResult, error) {
	return v.Validate(ctx, ValidateOptions{
		Generator:        generator,
		Content:          content,
		RunBashValidator: false, // Content-only validation doesn't run bash by default
	})
}
