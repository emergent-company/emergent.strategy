// Package migration provides EPF version migration detection and guidance.
package migration

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"gopkg.in/yaml.v3"
)

// Detector detects version drift between EPF instances and current schemas
type Detector struct {
	validator  *validator.Validator
	loader     *schema.Loader
	schemasDir string
}

// NewDetector creates a new migration detector
func NewDetector(schemasDir string) (*Detector, error) {
	v, err := validator.NewValidator(schemasDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create validator: %w", err)
	}

	return &Detector{
		validator:  v,
		loader:     v.GetLoader(),
		schemasDir: schemasDir,
	}, nil
}

// DetectMigrationStatus analyzes an instance directory and returns migration status
func (d *Detector) DetectMigrationStatus(instancePath string) (*MigrationStatus, error) {
	// Get the default EPF schema version (use feature_definition as reference)
	// This is used for the summary display
	defaultTargetVersion, err := d.GetCurrentSchemaVersion()
	if err != nil {
		return nil, fmt.Errorf("failed to get current schema version: %w", err)
	}

	status := &MigrationStatus{
		TargetVersion: defaultTargetVersion,
		Files:         make([]FileMigrationStatus, 0),
	}

	// Walk the instance directory
	err = filepath.Walk(instancePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		// Only process YAML files
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}

		// Detect artifact type
		artifactType, err := d.loader.DetectArtifactType(path)
		if err != nil {
			// Unknown file type - track as unknown
			status.UnknownFiles++
			return nil
		}

		// Get the correct schema version for THIS specific artifact type
		artifactSchemaVersion, err := d.GetSchemaVersion(artifactType)
		if err != nil {
			// Fall back to default if we can't get artifact-specific version
			artifactSchemaVersion = defaultTargetVersion
		}

		// Analyze this file with its artifact-specific schema version
		fileStatus := d.analyzeFile(path, artifactType, artifactSchemaVersion)
		status.Files = append(status.Files, fileStatus)
		status.TotalFiles++

		if fileStatus.NeedsMigration {
			status.FilesNeedingFix++
		} else {
			status.UpToDateFiles++
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk instance directory: %w", err)
	}

	// Determine overall status
	status.NeedsMigration = status.FilesNeedingFix > 0
	status.Summary = d.generateSummary(status)

	// Try to detect a common current version from files
	status.CurrentVersion = d.detectCommonVersion(status.Files)

	return status, nil
}

// GetCurrentSchemaVersion returns the version from a reference schema (feature_definition)
func (d *Detector) GetCurrentSchemaVersion() (string, error) {
	// Use feature_definition schema as the reference
	schemaInfo, err := d.loader.GetSchema(schema.ArtifactFeatureDefinition)
	if err != nil {
		// Fall back to any available schema
		schemas := d.loader.ListSchemas()
		if len(schemas) == 0 {
			return "", fmt.Errorf("no schemas available")
		}
		schemaInfo = schemas[0]
	}

	return ExtractSchemaVersion(schemaInfo.Schema)
}

// GetSchemaVersion returns the version for a specific artifact type
func (d *Detector) GetSchemaVersion(artifactType schema.ArtifactType) (string, error) {
	schemaInfo, err := d.loader.GetSchema(artifactType)
	if err != nil {
		return "", err
	}
	return ExtractSchemaVersion(schemaInfo.Schema)
}

// ExtractSchemaVersion extracts the version field from a JSON schema
func ExtractSchemaVersion(schemaJSON json.RawMessage) (string, error) {
	var schemaMap map[string]interface{}
	if err := json.Unmarshal(schemaJSON, &schemaMap); err != nil {
		return "", fmt.Errorf("failed to parse schema JSON: %w", err)
	}

	if version, ok := schemaMap["version"].(string); ok {
		return version, nil
	}

	return "unknown", nil
}

// analyzeFile analyzes a single file for migration needs
func (d *Detector) analyzeFile(path string, artifactType schema.ArtifactType, targetVersion string) FileMigrationStatus {
	status := FileMigrationStatus{
		Path:          path,
		ArtifactType:  string(artifactType),
		TargetVersion: targetVersion,
	}

	// Extract current version from file
	content, err := os.ReadFile(path)
	if err != nil {
		status.NeedsMigration = true
		status.Reason = fmt.Sprintf("failed to read file: %v", err)
		return status
	}

	status.CurrentVersion = extractVersionFromContent(string(content))

	// Validate file against current schema
	result, err := d.validator.ValidateFile(path)
	if err != nil {
		status.NeedsMigration = true
		status.Reason = fmt.Sprintf("validation error: %v", err)
		return status
	}

	if !result.Valid {
		status.NeedsMigration = true
		status.Reason = "schema validation failed"
		for _, e := range result.Errors {
			status.ValidationErrors = append(status.ValidationErrors, e.Message)
		}
	}

	// Check version mismatch even if validation passes
	// (file might be valid but at an older version)
	// Use semver-aware comparison: only flag as needing migration if it's an upgrade
	if status.CurrentVersion != "" && status.CurrentVersion != "unknown" {
		if IsUpgrade(status.CurrentVersion, targetVersion) {
			status.NeedsMigration = true
			if status.Reason == "" {
				status.Reason = fmt.Sprintf("version mismatch: %s -> %s", status.CurrentVersion, targetVersion)
			}
		}
		// If current version is newer than target (would be a downgrade), don't flag it
	}

	return status
}

// Version extraction patterns
var (
	headerVersionPattern       = regexp.MustCompile(`^#\s*EPF\s+v?(\d+\.\d+\.\d+)`)
	metaVersionPattern         = regexp.MustCompile(`epf_version:\s*["']?(\d+\.\d+\.\d+)["']?`)
	metaTemplateVersionPattern = regexp.MustCompile(`template_version:\s*["']?(\d+\.\d+\.\d+)["']?`)
)

// extractVersionFromContent extracts the schema version from file content
// IMPORTANT: For migration purposes, we want the template_version (schema version),
// NOT the epf_version (framework version). These are independent version tracks.
func extractVersionFromContent(content string) string {
	// Try parsing YAML first (most reliable method)
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &data); err == nil {
		if meta, ok := data["meta"].(map[string]interface{}); ok {
			// Priority 1: template_version (this is the schema version)
			if version, ok := meta["template_version"].(string); ok && version != "" {
				return version
			}
			// Priority 2: epf_version (for older files without template_version)
			// NOTE: This is a fallback for legacy files. New files should use template_version.
			if version, ok := meta["epf_version"].(string); ok && version != "" {
				return version
			}
		}
	}

	// Fallback: Try regex patterns (less reliable but handles edge cases)

	// Try template_version first
	matches := metaTemplateVersionPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	// Try header version
	matches = headerVersionPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	// Try meta.epf_version as last resort
	matches = metaVersionPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	return ""
}

// generateSummary creates a human-readable summary
func (d *Detector) generateSummary(status *MigrationStatus) string {
	if !status.NeedsMigration {
		return fmt.Sprintf("All %d files are up to date with schema version %s",
			status.TotalFiles, status.TargetVersion)
	}

	return fmt.Sprintf("%d of %d files need migration to version %s",
		status.FilesNeedingFix, status.TotalFiles, status.TargetVersion)
}

// detectCommonVersion finds the most common version across files
func (d *Detector) detectCommonVersion(files []FileMigrationStatus) string {
	versions := make(map[string]int)
	for _, f := range files {
		if f.CurrentVersion != "" && f.CurrentVersion != "unknown" {
			versions[f.CurrentVersion]++
		}
	}

	var maxVersion string
	var maxCount int
	for v, count := range versions {
		if count > maxCount {
			maxVersion = v
			maxCount = count
		}
	}

	return maxVersion
}

// DetectFileStatus analyzes a single file for migration needs
func (d *Detector) DetectFileStatus(filePath string) (*FileMigrationStatus, error) {
	targetVersion, err := d.GetCurrentSchemaVersion()
	if err != nil {
		return nil, fmt.Errorf("failed to get current schema version: %w", err)
	}

	artifactType, err := d.loader.DetectArtifactType(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not detect artifact type: %w", err)
	}

	status := d.analyzeFile(filePath, artifactType, targetVersion)
	return &status, nil
}

// GetValidationErrors returns validation errors for a file
func (d *Detector) GetValidationErrors(filePath string) ([]ValidationError, error) {
	result, err := d.validator.ValidateFile(filePath)
	if err != nil {
		return nil, err
	}

	var errors []ValidationError
	for _, e := range result.Errors {
		errors = append(errors, ValidationError{
			Path:    e.Path,
			Message: e.Message,
		})
	}

	return errors, nil
}

// GetArtifactType returns the detected artifact type for a file
func (d *Detector) GetArtifactType(filePath string) (schema.ArtifactType, error) {
	return d.loader.DetectArtifactType(filePath)
}

// GetSchemaInfo returns schema information for an artifact type
func (d *Detector) GetSchemaInfo(artifactType schema.ArtifactType) (*schema.SchemaInfo, error) {
	return d.loader.GetSchema(artifactType)
}
