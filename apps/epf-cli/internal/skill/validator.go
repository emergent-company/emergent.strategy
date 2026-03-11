package skill

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

// OutputValidator validates skill outputs against schema and optional bash validators.
type OutputValidator struct {
	loader *Loader
}

// NewOutputValidator creates a new output validator.
func NewOutputValidator(loader *Loader) *OutputValidator {
	return &OutputValidator{loader: loader}
}

// ValidateOptions contains options for validation.
type ValidateOptions struct {
	Skill            string        // Skill name
	Content          string        // Content to validate (either Content or FilePath)
	FilePath         string        // Path to file to validate
	RunBashValidator bool          // Whether to run the bash validator
	BashTimeout      time.Duration // Timeout for bash validator execution
}

// Validate validates skill output against its schema and optionally runs the bash validator.
func (v *OutputValidator) Validate(ctx context.Context, opts ValidateOptions) (*ValidationResult, error) {
	skill, err := v.loader.GetSkill(opts.Skill)
	if err != nil {
		return nil, fmt.Errorf("failed to get skill: %w", err)
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
	schemaResult := v.validateSchema(skill, content)
	result.Layers["schema"] = schemaResult
	if !schemaResult.Passed {
		result.Valid = false
		result.Errors = append(result.Errors, schemaResult.Errors...)
	}
	result.Warnings = append(result.Warnings, schemaResult.Warnings...)

	// Layer 2: Bash validator (optional)
	if opts.RunBashValidator && skill.HasValidator {
		bashResult := v.runBashValidator(ctx, skill, content, opts.FilePath, opts.BashTimeout)
		result.Layers["bash"] = bashResult
		if !bashResult.Passed {
			result.Valid = false
			result.Errors = append(result.Errors, bashResult.Errors...)
		}
		result.Warnings = append(result.Warnings, bashResult.Warnings...)
	}

	return result, nil
}

// validateSchema validates content against the skill's JSON schema.
func (v *OutputValidator) validateSchema(skill *SkillInfo, content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}

	if !skill.HasSchema {
		result.Warnings = append(result.Warnings, "No schema.json found for this skill")
		return result
	}

	// Determine base directory for reading schema
	baseDir := skill.Path
	if skill.LegacyFormat && !skill.HasManifest {
		// Legacy wizard file — no schema possible
		result.Warnings = append(result.Warnings, "Legacy wizard skills don't have schemas")
		return result
	}

	schemaPath := filepath.Join(baseDir, skill.SchemaFile)
	schemaData, err := os.ReadFile(schemaPath)
	if err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to read schema: %v", err))
		return result
	}

	// Determine output format
	outputFormat := skill.OutputFormat
	if outputFormat == "" {
		outputFormat = FormatMarkdown
	}

	switch outputFormat {
	case FormatJSON:
		return validateJSONContent(schemaData, content)
	case FormatYAML:
		return validateYAMLContent(content)
	case FormatMarkdown, FormatText, FormatHTML:
		if jsonContent := extractJSONFromMarkdown(content); jsonContent != "" {
			return validateJSONContent(schemaData, jsonContent)
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

// validateJSONContent validates JSON content against a schema.
func validateJSONContent(schemaData []byte, content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}

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

	var jsonContent interface{}
	if err := json.Unmarshal([]byte(content), &jsonContent); err != nil {
		result.Passed = false
		result.Errors = append(result.Errors, fmt.Sprintf("Invalid JSON: %v", err))
		return result
	}

	if err := schema.Validate(jsonContent); err != nil {
		result.Passed = false
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

// validateYAMLContent validates YAML content (placeholder for future implementation).
func validateYAMLContent(content string) LayerResult {
	result := LayerResult{
		Name:   "Schema Validation",
		Passed: true,
	}
	_ = content
	result.Warnings = append(result.Warnings, "YAML schema validation not yet fully implemented")
	return result
}

// flattenValidationErrors extracts all error messages from a validation error.
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

// extractJSONFromMarkdown tries to extract JSON from markdown content.
func extractJSONFromMarkdown(content string) string {
	if strings.HasPrefix(content, "---json") {
		end := strings.Index(content[7:], "---")
		if end > 0 {
			return strings.TrimSpace(content[7 : 7+end])
		}
	}
	if strings.HasPrefix(content, "```json") {
		end := strings.Index(content[7:], "```")
		if end > 0 {
			return strings.TrimSpace(content[7 : 7+end])
		}
	}
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "{") || strings.HasPrefix(content, "[") {
		var js interface{}
		if err := json.Unmarshal([]byte(content), &js); err == nil {
			return content
		}
	}
	return ""
}

// runBashValidator executes the skill's validator.sh script.
func (v *OutputValidator) runBashValidator(ctx context.Context, skill *SkillInfo, content, filePath string, timeout time.Duration) LayerResult {
	result := LayerResult{
		Name:   "Bash Validator",
		Passed: true,
	}

	if runtime.GOOS == "windows" {
		result.Warnings = append(result.Warnings, "Bash validator skipped on Windows")
		return result
	}

	// Determine validator path
	baseDir := skill.Path
	if skill.LegacyFormat && !skill.HasManifest {
		result.Warnings = append(result.Warnings, "Legacy wizard skills don't have bash validators")
		return result
	}

	validatorPath := filepath.Join(baseDir, skill.ValidatorFile)

	info, err := os.Stat(validatorPath)
	if err != nil {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Validator not accessible: %v", err))
		return result
	}
	if info.Mode()&0111 == 0 {
		result.Warnings = append(result.Warnings, "Validator is not executable (chmod +x validator.sh)")
		return result
	}

	// Write content to temp file if needed
	if filePath == "" {
		f, err := os.CreateTemp("", "epf-validate-*")
		if err != nil {
			result.Passed = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to create temp file: %v", err))
			return result
		}
		defer os.Remove(f.Name())
		if _, err := f.WriteString(content); err != nil {
			f.Close()
			result.Passed = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to write temp file: %v", err))
			return result
		}
		f.Close()
		filePath = f.Name()
	}

	if timeout == 0 {
		timeout = 30 * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, validatorPath, filePath)
	cmd.Dir = baseDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()

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
		if stderrStr != "" {
			for _, line := range strings.Split(stderrStr, "\n") {
				if line = strings.TrimSpace(line); line != "" {
					result.Errors = append(result.Errors, line)
				}
			}
		}
	}

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

// ValidateFile is a convenience method that validates a file.
func (v *OutputValidator) ValidateFile(ctx context.Context, skill, filePath string, runBash bool) (*ValidationResult, error) {
	return v.Validate(ctx, ValidateOptions{
		Skill:            skill,
		FilePath:         filePath,
		RunBashValidator: runBash,
	})
}

// ValidateContent is a convenience method that validates content directly.
func (v *OutputValidator) ValidateContent(ctx context.Context, skill, content string) (*ValidationResult, error) {
	return v.Validate(ctx, ValidateOptions{
		Skill:            skill,
		Content:          content,
		RunBashValidator: false,
	})
}
