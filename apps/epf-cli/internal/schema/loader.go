// Package schema provides JSON Schema loading and artifact mapping for EPF.
package schema

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ArtifactType represents the type of EPF artifact
type ArtifactType string

// All EPF artifact types with their corresponding schema files
const (
	// READY Phase artifacts
	ArtifactNorthStar           ArtifactType = "north_star"
	ArtifactInsightAnalyses     ArtifactType = "insight_analyses"
	ArtifactStrategyFoundations ArtifactType = "strategy_foundations"
	ArtifactInsightOpportunity  ArtifactType = "insight_opportunity"
	ArtifactStrategyFormula     ArtifactType = "strategy_formula"
	ArtifactRoadmapRecipe       ArtifactType = "roadmap_recipe"
	ArtifactProductPortfolio    ArtifactType = "product_portfolio"

	// FIRE Phase artifacts
	ArtifactFeatureDefinition ArtifactType = "feature_definition"
	ArtifactValueModel        ArtifactType = "value_model"
	ArtifactWorkflow          ArtifactType = "workflow"
	ArtifactMappings          ArtifactType = "mappings"

	// AIM Phase artifacts
	ArtifactAssessmentReport ArtifactType = "assessment_report"
	ArtifactCalibrationMemo  ArtifactType = "calibration_memo"

	// Track definitions
	ArtifactStrategyDefinition   ArtifactType = "strategy_definition"
	ArtifactOrgOpsDefinition     ArtifactType = "org_ops_definition"
	ArtifactCommercialDefinition ArtifactType = "commercial_definition"

	// Other
	ArtifactTrackDefinitionBase      ArtifactType = "track_definition_base"
	ArtifactTrackHealthAssessment    ArtifactType = "track_health_assessment"
	ArtifactCurrentRealityAssessment ArtifactType = "current_reality_assessment"
	ArtifactAimTriggerConfig         ArtifactType = "aim_trigger_config"
)

// Phase represents an EPF phase
type Phase string

const (
	PhaseREADY Phase = "READY"
	PhaseFIRE  Phase = "FIRE"
	PhaseAIM   Phase = "AIM"
)

// SchemaInfo contains metadata about a loaded schema
type SchemaInfo struct {
	ArtifactType ArtifactType    `json:"artifact_type"`
	SchemaFile   string          `json:"schema_file"`
	Phase        Phase           `json:"phase,omitempty"`
	Description  string          `json:"description"`
	Schema       json.RawMessage `json:"schema"`
}

// Loader loads and manages EPF JSON schemas
type Loader struct {
	schemasDir string
	schemas    map[ArtifactType]*SchemaInfo
}

// artifactMapping maps filename patterns to artifact types
var artifactMapping = []struct {
	Pattern      *regexp.Regexp
	ArtifactType ArtifactType
	Phase        Phase
	Description  string
}{
	// READY Phase (numbered files)
	{regexp.MustCompile(`(?i)00_north_star\.ya?ml$`), ArtifactNorthStar, PhaseREADY, "North Star - Vision and guiding principles"},
	{regexp.MustCompile(`(?i)01_insight_analyses\.ya?ml$`), ArtifactInsightAnalyses, PhaseREADY, "Insight Analyses - Market and customer research"},
	{regexp.MustCompile(`(?i)02_strategy_foundations\.ya?ml$`), ArtifactStrategyFoundations, PhaseREADY, "Strategy Foundations - Core strategic elements"},
	{regexp.MustCompile(`(?i)03_insight_opportunity\.ya?ml$`), ArtifactInsightOpportunity, PhaseREADY, "Insight Opportunity - Opportunity analysis"},
	{regexp.MustCompile(`(?i)04_strategy_formula\.ya?ml$`), ArtifactStrategyFormula, PhaseREADY, "Strategy Formula - Strategic approach"},
	{regexp.MustCompile(`(?i)(04|05)_roadmap_recipe\.ya?ml$`), ArtifactRoadmapRecipe, PhaseREADY, "Roadmap Recipe - Execution roadmap"},
	{regexp.MustCompile(`(?i)product_portfolio\.ya?ml$`), ArtifactProductPortfolio, PhaseREADY, "Product Portfolio - Product offerings"},

	// FIRE Phase
	{regexp.MustCompile(`(?i)feature_definitions?/[^_][^/]*\.ya?ml$`), ArtifactFeatureDefinition, PhaseFIRE, "Feature Definition - Feature specification"},
	{regexp.MustCompile(`(?i)fd-[^/]*\.ya?ml$`), ArtifactFeatureDefinition, PhaseFIRE, "Feature Definition - Feature specification"},
	{regexp.MustCompile(`(?i)value_models?/[^/]*\.ya?ml$`), ArtifactValueModel, PhaseFIRE, "Value Model - Value creation model"},
	{regexp.MustCompile(`(?i)_value_model\.ya?ml$`), ArtifactValueModel, PhaseFIRE, "Value Model - Value creation model"},
	{regexp.MustCompile(`(?i)workflows?/[^/]*\.ya?ml$`), ArtifactWorkflow, PhaseFIRE, "Workflow - Process workflow"},
	{regexp.MustCompile(`(?i)mappings\.ya?ml$`), ArtifactMappings, PhaseFIRE, "Mappings - Cross-reference mappings"},

	// AIM Phase
	{regexp.MustCompile(`(?i)assessment_report\.ya?ml$`), ArtifactAssessmentReport, PhaseAIM, "Assessment Report - Phase assessment"},
	{regexp.MustCompile(`(?i)calibration_memo\.ya?ml$`), ArtifactCalibrationMemo, PhaseAIM, "Calibration Memo - Strategic calibration"},

	// Track definitions (in definitions/ directory)
	{regexp.MustCompile(`(?i)strategy[_-]definition\.ya?ml$`), ArtifactStrategyDefinition, "", "Strategy Track Definition"},
	{regexp.MustCompile(`(?i)org[_-]?ops[_-]definition\.ya?ml$`), ArtifactOrgOpsDefinition, "", "OrgOps Track Definition"},
	{regexp.MustCompile(`(?i)commercial[_-]definition\.ya?ml$`), ArtifactCommercialDefinition, "", "Commercial Track Definition"},

	// Health assessments
	{regexp.MustCompile(`(?i)track[_-]health[_-]assessment\.ya?ml$`), ArtifactTrackHealthAssessment, "", "Track Health Assessment"},
	{regexp.MustCompile(`(?i)current[_-]reality[_-]assessment\.ya?ml$`), ArtifactCurrentRealityAssessment, "", "Current Reality Assessment"},
	{regexp.MustCompile(`(?i)aim[_-]trigger[_-]config\.ya?ml$`), ArtifactAimTriggerConfig, "", "AIM Trigger Configuration"},
}

// schemaFileMapping maps artifact types to schema filenames
var schemaFileMapping = map[ArtifactType]string{
	ArtifactNorthStar:                "north_star_schema.json",
	ArtifactInsightAnalyses:          "insight_analyses_schema.json",
	ArtifactStrategyFoundations:      "strategy_foundations_schema.json",
	ArtifactInsightOpportunity:       "insight_opportunity_schema.json",
	ArtifactStrategyFormula:          "strategy_formula_schema.json",
	ArtifactRoadmapRecipe:            "roadmap_recipe_schema.json",
	ArtifactProductPortfolio:         "product_portfolio_schema.json",
	ArtifactFeatureDefinition:        "feature_definition_schema.json",
	ArtifactValueModel:               "value_model_schema.json",
	ArtifactWorkflow:                 "workflow_schema.json",
	ArtifactMappings:                 "mappings_schema.json",
	ArtifactAssessmentReport:         "assessment_report_schema.json",
	ArtifactCalibrationMemo:          "calibration_memo_schema.json",
	ArtifactStrategyDefinition:       "strategy_definition_schema.json",
	ArtifactOrgOpsDefinition:         "org_ops_definition_schema.json",
	ArtifactCommercialDefinition:     "commercial_definition_schema.json",
	ArtifactTrackDefinitionBase:      "track_definition_base_schema.json",
	ArtifactTrackHealthAssessment:    "track_health_assessment_schema.json",
	ArtifactCurrentRealityAssessment: "current_reality_assessment_schema.json",
	ArtifactAimTriggerConfig:         "aim_trigger_config_schema.json",
}

// NewLoader creates a new schema loader
func NewLoader(schemasDir string) *Loader {
	return &Loader{
		schemasDir: schemasDir,
		schemas:    make(map[ArtifactType]*SchemaInfo),
	}
}

// FindEPFRoot attempts to find the EPF framework root directory
// by searching for the schemas directory in common locations
func FindEPFRoot(startDir string) (string, error) {
	searchPaths := []string{
		filepath.Join(startDir, "docs", "EPF"),
		filepath.Join(startDir, "..", "docs", "EPF"),
		filepath.Join(startDir, "..", "..", "docs", "EPF"),
		filepath.Join(startDir, "..", "..", "..", "docs", "EPF"),
		"/docs/EPF", // Absolute path for monorepo root
	}

	// Also check if startDir itself is the EPF root
	if _, err := os.Stat(filepath.Join(startDir, "schemas")); err == nil {
		return startDir, nil
	}

	for _, path := range searchPaths {
		schemasPath := filepath.Join(path, "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			absPath, err := filepath.Abs(path)
			if err != nil {
				return path, nil
			}
			return absPath, nil
		}
	}

	return "", fmt.Errorf("could not find EPF root directory (looked for schemas/ directory)")
}

// Load loads all schemas from the schemas directory
func (l *Loader) Load() error {
	// Check if schemas directory exists
	if _, err := os.Stat(l.schemasDir); os.IsNotExist(err) {
		return fmt.Errorf("schemas directory not found: %s", l.schemasDir)
	}

	// Load each schema file
	for artifactType, schemaFile := range schemaFileMapping {
		schemaPath := filepath.Join(l.schemasDir, schemaFile)

		// Read schema file
		data, err := os.ReadFile(schemaPath)
		if err != nil {
			// Schema file doesn't exist - skip it (some may be optional)
			continue
		}

		// Validate it's valid JSON
		var schema json.RawMessage
		if err := json.Unmarshal(data, &schema); err != nil {
			return fmt.Errorf("invalid JSON in schema %s: %w", schemaFile, err)
		}

		// Find phase and description from mapping
		var phase Phase
		var description string
		for _, m := range artifactMapping {
			if m.ArtifactType == artifactType {
				phase = m.Phase
				description = m.Description
				break
			}
		}

		l.schemas[artifactType] = &SchemaInfo{
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Phase:        phase,
			Description:  description,
			Schema:       schema,
		}
	}

	if len(l.schemas) == 0 {
		return fmt.Errorf("no schemas loaded from %s", l.schemasDir)
	}

	return nil
}

// GetSchema returns the schema for an artifact type
func (l *Loader) GetSchema(artifactType ArtifactType) (*SchemaInfo, error) {
	schema, ok := l.schemas[artifactType]
	if !ok {
		return nil, fmt.Errorf("schema not found for artifact type: %s", artifactType)
	}
	return schema, nil
}

// GetSchemaJSON returns the raw JSON schema for an artifact type
func (l *Loader) GetSchemaJSON(artifactType ArtifactType) (string, error) {
	schema, err := l.GetSchema(artifactType)
	if err != nil {
		return "", err
	}
	return string(schema.Schema), nil
}

// DetectArtifactType detects the artifact type from a file path
func (l *Loader) DetectArtifactType(filePath string) (ArtifactType, error) {
	// Normalize path separators
	normalizedPath := filepath.ToSlash(filePath)

	// Try each pattern
	for _, m := range artifactMapping {
		if m.Pattern.MatchString(normalizedPath) {
			return m.ArtifactType, nil
		}
	}

	return "", fmt.Errorf("could not detect artifact type for file: %s", filePath)
}

// ListSchemas returns all loaded schemas
func (l *Loader) ListSchemas() []*SchemaInfo {
	result := make([]*SchemaInfo, 0, len(l.schemas))
	for _, schema := range l.schemas {
		result = append(result, schema)
	}
	return result
}

// ListArtifactTypes returns all available artifact types
func (l *Loader) ListArtifactTypes() []ArtifactType {
	result := make([]ArtifactType, 0, len(l.schemas))
	for artifactType := range l.schemas {
		result = append(result, artifactType)
	}
	return result
}

// GetArtifactTypesByPhase returns artifact types for a specific phase
func (l *Loader) GetArtifactTypesByPhase(phase Phase) []ArtifactType {
	var result []ArtifactType
	for _, m := range artifactMapping {
		if m.Phase == phase {
			if _, ok := l.schemas[m.ArtifactType]; ok {
				result = append(result, m.ArtifactType)
			}
		}
	}
	return result
}

// SchemaFilename returns the schema filename for an artifact type
func SchemaFilename(artifactType ArtifactType) string {
	if filename, ok := schemaFileMapping[artifactType]; ok {
		return filename
	}
	return ""
}

// AllArtifactTypes returns all known artifact types
func AllArtifactTypes() []ArtifactType {
	types := make([]ArtifactType, 0, len(schemaFileMapping))
	for t := range schemaFileMapping {
		types = append(types, t)
	}
	return types
}

// ArtifactTypeFromString converts a string to an ArtifactType
func ArtifactTypeFromString(s string) (ArtifactType, error) {
	// Normalize input
	normalized := strings.ToLower(strings.ReplaceAll(s, "-", "_"))

	// Check if it's a valid artifact type
	for t := range schemaFileMapping {
		if string(t) == normalized {
			return t, nil
		}
	}

	return "", fmt.Errorf("unknown artifact type: %s", s)
}
