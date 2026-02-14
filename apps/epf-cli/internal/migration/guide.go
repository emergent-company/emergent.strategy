// Package migration provides EPF version migration detection and guidance.
package migration

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// GuideGenerator generates migration guides for EPF instances
type GuideGenerator struct {
	detector     *Detector
	templatesDir string
}

// NewGuideGenerator creates a new guide generator
func NewGuideGenerator(schemasDir, templatesDir string) (*GuideGenerator, error) {
	detector, err := NewDetector(schemasDir)
	if err != nil {
		return nil, err
	}

	return &GuideGenerator{
		detector:     detector,
		templatesDir: templatesDir,
	}, nil
}

// GenerateMigrationGuide generates a comprehensive migration guide for an instance
func (g *GuideGenerator) GenerateMigrationGuide(instancePath string) (*MigrationGuide, error) {
	// First, detect migration status
	status, err := g.detector.DetectMigrationStatus(instancePath)
	if err != nil {
		return nil, fmt.Errorf("failed to detect migration status: %w", err)
	}

	guide := &MigrationGuide{
		InstancePath:   instancePath,
		CurrentVersion: status.CurrentVersion,
		TargetVersion:  status.TargetVersion,
		FileGuides:     make([]FileGuide, 0),
		SchemaChanges:  make(map[string]*SchemaDiff),
	}

	// Generate file guides for each file needing migration
	for _, fileStatus := range status.Files {
		if !fileStatus.NeedsMigration {
			continue
		}

		fileGuide, err := g.generateFileGuide(fileStatus)
		if err != nil {
			// Log error but continue with other files
			continue
		}

		guide.FileGuides = append(guide.FileGuides, *fileGuide)
		guide.TotalChanges += len(fileGuide.Changes)

		for _, change := range fileGuide.Changes {
			if change.IsBreaking {
				guide.BreakingChanges++
			}
			if change.IsAutoFixable {
				guide.AutoFixable++
			} else {
				guide.ManualRequired++
			}
		}
	}

	// Generate summary
	guide.Summary = g.generateGuideSummary(guide)

	// Generate guidance
	guide.Guidance = g.generateGuidance(guide)

	return guide, nil
}

// GenerateFileGuide generates a migration guide for a single file
func (g *GuideGenerator) GenerateFileGuide(filePath string) (*FileGuide, error) {
	fileStatus, err := g.detector.DetectFileStatus(filePath)
	if err != nil {
		return nil, err
	}

	return g.generateFileGuide(*fileStatus)
}

// generateFileGuide internal implementation
func (g *GuideGenerator) generateFileGuide(status FileMigrationStatus) (*FileGuide, error) {
	artifactType, err := schema.ArtifactTypeFromString(status.ArtifactType)
	if err != nil {
		return nil, err
	}

	schemaVersion, _ := g.detector.GetSchemaVersion(artifactType)

	guide := &FileGuide{
		Path:           status.Path,
		ArtifactType:   status.ArtifactType,
		SchemaVersion:  schemaVersion,
		CurrentVersion: status.CurrentVersion,
		TargetVersion:  status.TargetVersion,
		Changes:        make([]Change, 0),
		Priority:       "medium",
	}

	// Add version update change if version mismatch
	if status.CurrentVersion != "" && status.CurrentVersion != status.TargetVersion {
		guide.Changes = append(guide.Changes, Change{
			Type:           ChangeVersionUpdate,
			Path:           "meta.epf_version",
			Description:    fmt.Sprintf("Update version from %s to %s", status.CurrentVersion, status.TargetVersion),
			SuggestedValue: status.TargetVersion,
			IsBreaking:     false,
			IsAutoFixable:  true,
			Hint:           "Run `epf-cli migrate` to automatically update version numbers",
		})
	}

	// Analyze validation errors and convert to changes
	for _, errMsg := range status.ValidationErrors {
		change := g.errorToChange(errMsg, artifactType)
		guide.Changes = append(guide.Changes, change)
		guide.ValidationErrors = append(guide.ValidationErrors, ValidationError{
			Message:      errMsg,
			SuggestedFix: change.Hint,
		})
	}

	// Get template reference if available
	guide.TemplateReference = g.getTemplateReference(artifactType)

	// Determine priority based on changes
	guide.Priority = g.determinePriority(guide)

	return guide, nil
}

// errorToChange converts a validation error message to a Change
func (g *GuideGenerator) errorToChange(errMsg string, artifactType schema.ArtifactType) Change {
	change := Change{
		Type:        ChangeAddField,
		Description: errMsg,
		IsBreaking:  false,
	}

	// Parse common error patterns
	errLower := strings.ToLower(errMsg)

	switch {
	case strings.Contains(errLower, "missing required property"):
		// Extract field name from error
		change.Type = ChangeAddField
		change.IsBreaking = true
		change.Hint = "Add the required field to the file"

		// Try to extract the field name
		if idx := strings.Index(errLower, "property"); idx > 0 {
			// Look for quoted field name
			remaining := errMsg[idx:]
			if start := strings.Index(remaining, "'"); start >= 0 {
				if end := strings.Index(remaining[start+1:], "'"); end >= 0 {
					fieldName := remaining[start+1 : start+1+end]
					change.Path = fieldName
					change.Description = fmt.Sprintf("Add required field '%s'", fieldName)
				}
			}
		}

	case strings.Contains(errLower, "additional property"):
		change.Type = ChangeRemoveField
		change.Hint = "This field is no longer allowed in the schema"

	case strings.Contains(errLower, "expected") && strings.Contains(errLower, "type"):
		change.Type = ChangeTypeChange
		change.IsBreaking = true
		change.Hint = "Change the field value type"

	case strings.Contains(errLower, "enum"):
		change.Type = ChangeModifyField
		change.Hint = "Use one of the allowed enum values"

	case strings.Contains(errLower, "pattern"):
		change.Type = ChangePatternChange
		change.Hint = "Update the field value to match the required pattern"

	default:
		change.Hint = "Review the schema requirements for this field"
	}

	return change
}

// getTemplateReference returns a template reference for an artifact type
func (g *GuideGenerator) getTemplateReference(artifactType schema.ArtifactType) string {
	if g.templatesDir == "" {
		return ""
	}

	// Map artifact type to template path
	templatePaths := map[schema.ArtifactType]string{
		schema.ArtifactFeatureDefinition:  "FIRE/feature-definition-template.yaml",
		schema.ArtifactValueModel:         "FIRE/value-model-template.yaml",
		schema.ArtifactNorthStar:          "READY/north-star-template.yaml",
		schema.ArtifactRoadmapRecipe:      "READY/roadmap-recipe-template.yaml",
		schema.ArtifactStrategyFormula:    "READY/strategy-formula-template.yaml",
		schema.ArtifactInsightOpportunity: "READY/insight-opportunity-template.yaml",
	}

	if templatePath, ok := templatePaths[artifactType]; ok {
		fullPath := filepath.Join(g.templatesDir, templatePath)
		if content, err := os.ReadFile(fullPath); err == nil {
			// Return first 50 lines as reference
			lines := strings.Split(string(content), "\n")
			if len(lines) > 50 {
				lines = lines[:50]
			}
			return strings.Join(lines, "\n") + "\n# ... (truncated)"
		}
	}

	return ""
}

// determinePriority determines the priority of a file migration
func (g *GuideGenerator) determinePriority(guide *FileGuide) string {
	hasBreaking := false
	for _, change := range guide.Changes {
		if change.IsBreaking {
			hasBreaking = true
			break
		}
	}

	if hasBreaking {
		return "high"
	}

	if len(guide.Changes) > 5 {
		return "high"
	}

	if len(guide.Changes) > 2 {
		return "medium"
	}

	return "low"
}

// generateGuideSummary creates a summary for the migration guide
func (g *GuideGenerator) generateGuideSummary(guide *MigrationGuide) string {
	if len(guide.FileGuides) == 0 {
		return "No migrations needed - all files are up to date"
	}

	return fmt.Sprintf("%d files need migration with %d total changes (%d breaking, %d auto-fixable)",
		len(guide.FileGuides),
		guide.TotalChanges,
		guide.BreakingChanges,
		guide.AutoFixable,
	)
}

// generateGuidance creates helpful guidance for the migration
func (g *GuideGenerator) generateGuidance(guide *MigrationGuide) Guidance {
	guidance := Guidance{}

	// Next steps
	if guide.AutoFixable > 0 {
		guidance.NextSteps = append(guidance.NextSteps,
			fmt.Sprintf("Run `epf-cli migrate --instance <name>` to auto-fix %d changes", guide.AutoFixable))
	}

	if guide.ManualRequired > 0 {
		guidance.NextSteps = append(guidance.NextSteps,
			fmt.Sprintf("Manually update %d fields that require content decisions", guide.ManualRequired))
	}

	guidance.NextSteps = append(guidance.NextSteps,
		"Run `epf-cli validate` to verify all files pass schema validation")

	// Warnings
	if guide.BreakingChanges > 0 {
		guidance.Warnings = append(guidance.Warnings,
			fmt.Sprintf("%d breaking changes require attention before migration", guide.BreakingChanges))
	}

	// Tips
	guidance.Tips = append(guidance.Tips,
		"Use `epf-cli explain <value-path>` to understand how files connect in the value model")
	guidance.Tips = append(guidance.Tips,
		"Review template files for recommended structure and examples")

	if guide.TargetVersion != "" {
		guidance.Tips = append(guidance.Tips,
			fmt.Sprintf("Schema version %s documentation may contain migration notes", guide.TargetVersion))
	}

	return guidance
}

// GetDetector returns the underlying detector
func (g *GuideGenerator) GetDetector() *Detector {
	return g.detector
}

// QuickMigrationCheck performs a fast check and returns a simple summary
func QuickMigrationCheck(schemasDir, instancePath string) (needsMigration bool, summary string, err error) {
	detector, err := NewDetector(schemasDir)
	if err != nil {
		return false, "", err
	}

	status, err := detector.DetectMigrationStatus(instancePath)
	if err != nil {
		return false, "", err
	}

	return status.NeedsMigration, status.Summary, nil
}
