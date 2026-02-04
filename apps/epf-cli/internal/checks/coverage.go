// Package checks - Field coverage analysis
package checks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// FieldCoverageChecker analyzes field coverage based on the importance taxonomy
type FieldCoverageChecker struct {
	instancePath string
	taxonomyPath string
	taxonomy     *FieldImportanceTaxonomy
}

// NewFieldCoverageChecker creates a new field coverage checker
func NewFieldCoverageChecker(instancePath string, taxonomyPath string) *FieldCoverageChecker {
	return &FieldCoverageChecker{
		instancePath: instancePath,
		taxonomyPath: taxonomyPath,
	}
}

// FieldImportanceTaxonomy represents the field importance taxonomy JSON structure
type FieldImportanceTaxonomy struct {
	RoadmapRecipe     *SchemaTaxonomy `json:"roadmap_recipe_schema.json"`
	FeatureDefinition *SchemaTaxonomy `json:"feature_definition_schema.json"`
	NorthStar         *SchemaTaxonomy `json:"north_star_schema.json"`
}

// SchemaTaxonomy defines field categories for a schema
type SchemaTaxonomy struct {
	KeyResults *FieldCategoryGroup `json:"key_results,omitempty"`
	Personas   *FieldCategoryGroup `json:"personas,omitempty"`
	Meta       *FieldCategoryGroup `json:"meta,omitempty"`
}

// FieldCategoryGroup groups fields by importance level
type FieldCategoryGroup struct {
	Critical *ImportanceLevel `json:"critical,omitempty"`
	High     *ImportanceLevel `json:"high,omitempty"`
	Medium   *ImportanceLevel `json:"medium,omitempty"`
	Low      *ImportanceLevel `json:"low,omitempty"`
}

// ImportanceLevel defines fields at a specific importance level
type ImportanceLevel struct {
	Fields      []string `json:"fields"`
	Reason      string   `json:"reason"`
	Value       string   `json:"value"`
	EffortHours string   `json:"effort_hours"`
	MinLength   int      `json:"min_length,omitempty"`
}

// FieldCoverageResult contains the result of field coverage analysis
type FieldCoverageResult struct {
	Path            string              `json:"path"`
	TotalArtifacts  int                 `json:"total_artifacts"`
	ArtifactResults []*ArtifactCoverage `json:"artifact_results"`
	CriticalGaps    []*CoverageGap      `json:"critical_gaps"`
	HighGaps        []*CoverageGap      `json:"high_gaps"`
	HealthScore     int                 `json:"health_score"` // 0-100
	Grade           string              `json:"grade"`        // A, B, C, D, F
	Recommendations []string            `json:"recommendations"`
}

// ArtifactCoverage contains coverage analysis for a single artifact
type ArtifactCoverage struct {
	File            string            `json:"file"`
	ArtifactType    string            `json:"artifact_type"`
	OverallCoverage int               `json:"overall_coverage"` // percentage
	CriticalFields  *FieldSetCoverage `json:"critical_fields,omitempty"`
	HighFields      *FieldSetCoverage `json:"high_fields,omitempty"`
	MediumFields    *FieldSetCoverage `json:"medium_fields,omitempty"`
	LowFields       *FieldSetCoverage `json:"low_fields,omitempty"`
}

// FieldSetCoverage tracks coverage for a set of fields
type FieldSetCoverage struct {
	TotalFields   int      `json:"total_fields"`
	PresentFields int      `json:"present_fields"`
	MissingFields []string `json:"missing_fields"`
	Coverage      int      `json:"coverage"` // percentage
}

// CoverageGap represents a gap in field coverage
type CoverageGap struct {
	File          string   `json:"file"`
	ArtifactType  string   `json:"artifact_type"`
	Importance    string   `json:"importance"` // critical, high, medium, low
	MissingFields []string `json:"missing_fields"`
	Reason        string   `json:"reason"`
	Value         string   `json:"value"`
	EffortHours   string   `json:"effort_hours"`
}

// Check runs the field coverage analysis
func (c *FieldCoverageChecker) Check() (*FieldCoverageResult, error) {
	result := &FieldCoverageResult{
		Path:            c.instancePath,
		ArtifactResults: make([]*ArtifactCoverage, 0),
		CriticalGaps:    make([]*CoverageGap, 0),
		HighGaps:        make([]*CoverageGap, 0),
		Recommendations: make([]string, 0),
	}

	// Load taxonomy
	if err := c.loadTaxonomy(); err != nil {
		// If taxonomy not found, return a basic result
		result.Recommendations = append(result.Recommendations,
			fmt.Sprintf("Field importance taxonomy not found at %s - skipping detailed coverage analysis", c.taxonomyPath))
		result.HealthScore = 50
		result.Grade = "C"
		return result, nil
	}

	// Analyze roadmap recipes (READY phase)
	readyPath := filepath.Join(c.instancePath, "READY")
	if _, err := os.Stat(readyPath); err == nil {
		c.analyzeRoadmaps(readyPath, result)
	}

	// Analyze feature definitions (FIRE phase)
	firePath := filepath.Join(c.instancePath, "FIRE", "feature_definitions")
	if _, err := os.Stat(firePath); err == nil {
		c.analyzeFeatureDefinitions(firePath, result)
	}

	// Calculate health score
	c.calculateHealthScore(result)

	return result, nil
}

func (c *FieldCoverageChecker) loadTaxonomy() error {
	if c.taxonomyPath == "" {
		return fmt.Errorf("taxonomy path not specified")
	}

	data, err := os.ReadFile(c.taxonomyPath)
	if err != nil {
		return err
	}

	c.taxonomy = &FieldImportanceTaxonomy{}
	return json.Unmarshal(data, c.taxonomy)
}

func (c *FieldCoverageChecker) analyzeRoadmaps(readyPath string, result *FieldCoverageResult) {
	// Look for roadmap recipe files
	patterns := []string{
		"*roadmap_recipe*.yaml",
		"*roadmap_recipe*.yml",
	}

	for _, pattern := range patterns {
		matches, _ := filepath.Glob(filepath.Join(readyPath, pattern))
		for _, file := range matches {
			coverage := c.analyzeRoadmapFile(file)
			if coverage != nil {
				result.ArtifactResults = append(result.ArtifactResults, coverage)
				result.TotalArtifacts++

				// Track gaps
				if coverage.CriticalFields != nil && len(coverage.CriticalFields.MissingFields) > 0 {
					result.CriticalGaps = append(result.CriticalGaps, &CoverageGap{
						File:          file,
						ArtifactType:  "roadmap_recipe",
						Importance:    "critical",
						MissingFields: coverage.CriticalFields.MissingFields,
						Reason:        c.taxonomy.RoadmapRecipe.KeyResults.Critical.Reason,
						Value:         c.taxonomy.RoadmapRecipe.KeyResults.Critical.Value,
						EffortHours:   c.taxonomy.RoadmapRecipe.KeyResults.Critical.EffortHours,
					})
				}

				if coverage.HighFields != nil && len(coverage.HighFields.MissingFields) > 0 {
					result.HighGaps = append(result.HighGaps, &CoverageGap{
						File:          file,
						ArtifactType:  "roadmap_recipe",
						Importance:    "high",
						MissingFields: coverage.HighFields.MissingFields,
						Reason:        c.taxonomy.RoadmapRecipe.KeyResults.High.Reason,
						Value:         c.taxonomy.RoadmapRecipe.KeyResults.High.Value,
						EffortHours:   c.taxonomy.RoadmapRecipe.KeyResults.High.EffortHours,
					})
				}
			}
		}
	}
}

func (c *FieldCoverageChecker) analyzeRoadmapFile(file string) *ArtifactCoverage {
	if c.taxonomy == nil || c.taxonomy.RoadmapRecipe == nil || c.taxonomy.RoadmapRecipe.KeyResults == nil {
		return nil
	}

	data, err := os.ReadFile(file)
	if err != nil {
		return nil
	}

	var content map[string]interface{}
	if err := yaml.Unmarshal(data, &content); err != nil {
		return nil
	}

	coverage := &ArtifactCoverage{
		File:         file,
		ArtifactType: "roadmap_recipe",
	}

	// Get key results from roadmap
	presentFields := c.extractRoadmapKeyResultFields(content)

	// Check critical fields (TRL fields)
	if c.taxonomy.RoadmapRecipe.KeyResults.Critical != nil {
		criticalFields := c.taxonomy.RoadmapRecipe.KeyResults.Critical.Fields
		coverage.CriticalFields = c.checkFieldCoverage(criticalFields, presentFields)
	}

	// Check high fields (hypothesis testing)
	if c.taxonomy.RoadmapRecipe.KeyResults.High != nil {
		highFields := c.taxonomy.RoadmapRecipe.KeyResults.High.Fields
		coverage.HighFields = c.checkFieldCoverage(highFields, presentFields)
	}

	// Calculate overall coverage
	totalExpected := 0
	totalPresent := 0

	if coverage.CriticalFields != nil {
		totalExpected += coverage.CriticalFields.TotalFields
		totalPresent += coverage.CriticalFields.PresentFields
	}
	if coverage.HighFields != nil {
		totalExpected += coverage.HighFields.TotalFields
		totalPresent += coverage.HighFields.PresentFields
	}

	if totalExpected > 0 {
		coverage.OverallCoverage = (totalPresent * 100) / totalExpected
	}

	return coverage
}

func (c *FieldCoverageChecker) extractRoadmapKeyResultFields(content map[string]interface{}) map[string]bool {
	presentFields := make(map[string]bool)

	roadmap, ok := content["roadmap"].(map[string]interface{})
	if !ok {
		return presentFields
	}

	// tracks is a map with keys like "product", "strategy", "org_ops", "commercial"
	tracks, ok := roadmap["tracks"].(map[string]interface{})
	if !ok {
		return presentFields
	}

	// Iterate over each track (product, strategy, org_ops, commercial)
	for _, trackValue := range tracks {
		track, ok := trackValue.(map[string]interface{})
		if !ok {
			continue
		}

		okrs, ok := track["okrs"].([]interface{})
		if !ok {
			continue
		}

		for _, o := range okrs {
			okr, ok := o.(map[string]interface{})
			if !ok {
				continue
			}

			krs, ok := okr["key_results"].([]interface{})
			if !ok {
				continue
			}

			for _, k := range krs {
				kr, ok := k.(map[string]interface{})
				if !ok {
					continue
				}

				// Record all fields present in key results
				for field := range kr {
					presentFields[field] = true
				}
			}
		}
	}

	return presentFields
}

func (c *FieldCoverageChecker) analyzeFeatureDefinitions(fdPath string, result *FieldCoverageResult) {
	if c.taxonomy == nil || c.taxonomy.FeatureDefinition == nil || c.taxonomy.FeatureDefinition.Personas == nil {
		return
	}

	filepath.Walk(fdPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" {
			return nil
		}

		base := filepath.Base(path)
		if strings.HasPrefix(base, "_") {
			return nil
		}

		coverage := c.analyzeFeatureDefinitionFile(path)
		if coverage != nil {
			result.ArtifactResults = append(result.ArtifactResults, coverage)
			result.TotalArtifacts++

			// Track gaps
			if coverage.CriticalFields != nil && len(coverage.CriticalFields.MissingFields) > 0 {
				result.CriticalGaps = append(result.CriticalGaps, &CoverageGap{
					File:          path,
					ArtifactType:  "feature_definition",
					Importance:    "critical",
					MissingFields: coverage.CriticalFields.MissingFields,
					Reason:        c.taxonomy.FeatureDefinition.Personas.Critical.Reason,
					Value:         c.taxonomy.FeatureDefinition.Personas.Critical.Value,
					EffortHours:   c.taxonomy.FeatureDefinition.Personas.Critical.EffortHours,
				})
			}

			if coverage.HighFields != nil && len(coverage.HighFields.MissingFields) > 0 {
				result.HighGaps = append(result.HighGaps, &CoverageGap{
					File:          path,
					ArtifactType:  "feature_definition",
					Importance:    "high",
					MissingFields: coverage.HighFields.MissingFields,
					Reason:        c.taxonomy.FeatureDefinition.Personas.High.Reason,
					Value:         c.taxonomy.FeatureDefinition.Personas.High.Value,
					EffortHours:   c.taxonomy.FeatureDefinition.Personas.High.EffortHours,
				})
			}
		}

		return nil
	})
}

func (c *FieldCoverageChecker) analyzeFeatureDefinitionFile(file string) *ArtifactCoverage {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil
	}

	var content map[string]interface{}
	if err := yaml.Unmarshal(data, &content); err != nil {
		return nil
	}

	coverage := &ArtifactCoverage{
		File:         file,
		ArtifactType: "feature_definition",
	}

	// Get persona fields
	presentFields := c.extractPersonaFields(content)

	// Check critical fields (narrative fields)
	if c.taxonomy.FeatureDefinition.Personas.Critical != nil {
		criticalFields := c.taxonomy.FeatureDefinition.Personas.Critical.Fields
		minLength := c.taxonomy.FeatureDefinition.Personas.Critical.MinLength
		coverage.CriticalFields = c.checkFieldCoverageWithMinLength(criticalFields, presentFields, minLength)
	}

	// Check high fields (enrichment fields)
	if c.taxonomy.FeatureDefinition.Personas.High != nil {
		highFields := c.taxonomy.FeatureDefinition.Personas.High.Fields
		// Convert to bool map for high fields (presence only, no length check)
		presentBool := make(map[string]bool)
		for k, v := range presentFields {
			if v > 0 {
				presentBool[k] = true
			}
		}
		coverage.HighFields = c.checkFieldCoverage(highFields, presentBool)
	}

	// Calculate overall coverage
	totalExpected := 0
	totalPresent := 0

	if coverage.CriticalFields != nil {
		totalExpected += coverage.CriticalFields.TotalFields
		totalPresent += coverage.CriticalFields.PresentFields
	}
	if coverage.HighFields != nil {
		totalExpected += coverage.HighFields.TotalFields
		totalPresent += coverage.HighFields.PresentFields
	}

	if totalExpected > 0 {
		coverage.OverallCoverage = (totalPresent * 100) / totalExpected
	}

	return coverage
}

func (c *FieldCoverageChecker) extractPersonaFields(content map[string]interface{}) map[string]int {
	// Map of field -> character count (0 if not present, length if present)
	presentFields := make(map[string]int)

	// Check definition.personas
	definition, ok := content["definition"].(map[string]interface{})
	if !ok {
		return presentFields
	}

	personas, ok := definition["personas"].([]interface{})
	if !ok {
		return presentFields
	}

	for _, p := range personas {
		persona, ok := p.(map[string]interface{})
		if !ok {
			continue
		}

		// Check each narrative field
		for field, value := range persona {
			if str, ok := value.(string); ok {
				// Track the maximum length seen for this field
				if len(str) > presentFields[field] {
					presentFields[field] = len(str)
				}
			} else if value != nil {
				// Non-string field (e.g., array) - mark as present
				if presentFields[field] == 0 {
					presentFields[field] = 1
				}
			}
		}
	}

	return presentFields
}

func (c *FieldCoverageChecker) checkFieldCoverage(expectedFields []string, presentFields map[string]bool) *FieldSetCoverage {
	result := &FieldSetCoverage{
		TotalFields:   len(expectedFields),
		MissingFields: make([]string, 0),
	}

	for _, field := range expectedFields {
		if presentFields[field] {
			result.PresentFields++
		} else {
			result.MissingFields = append(result.MissingFields, field)
		}
	}

	if result.TotalFields > 0 {
		result.Coverage = (result.PresentFields * 100) / result.TotalFields
	}

	return result
}

func (c *FieldCoverageChecker) checkFieldCoverageWithMinLength(expectedFields []string, presentFields map[string]int, minLength int) *FieldSetCoverage {
	result := &FieldSetCoverage{
		TotalFields:   len(expectedFields),
		MissingFields: make([]string, 0),
	}

	for _, field := range expectedFields {
		if length, ok := presentFields[field]; ok && length >= minLength {
			result.PresentFields++
		} else if length > 0 && length < minLength {
			result.MissingFields = append(result.MissingFields, fmt.Sprintf("%s (too short: %d<%d)", field, length, minLength))
		} else {
			result.MissingFields = append(result.MissingFields, field)
		}
	}

	if result.TotalFields > 0 {
		result.Coverage = (result.PresentFields * 100) / result.TotalFields
	}

	return result
}

func (c *FieldCoverageChecker) calculateHealthScore(result *FieldCoverageResult) {
	// Start with 100 and deduct for gaps
	score := 100

	// Critical gaps: -30 for any critical gaps
	if len(result.CriticalGaps) > 0 {
		score -= 30
	}

	// High gaps: -15 for any high gaps
	if len(result.HighGaps) > 0 {
		score -= 15
	}

	if score < 0 {
		score = 0
	}

	result.HealthScore = score

	// Assign grade
	switch {
	case score >= 90:
		result.Grade = "A"
	case score >= 75:
		result.Grade = "B"
	case score >= 60:
		result.Grade = "C"
	case score >= 50:
		result.Grade = "D"
	default:
		result.Grade = "F"
	}

	// Generate recommendations
	if len(result.CriticalGaps) > 0 {
		result.Recommendations = append(result.Recommendations,
			"PRIORITY 1: Add TRL fields (trl_start, trl_target, trl_progression, technical_hypothesis) to roadmap Key Results for innovation maturity tracking")
	}

	if len(result.HighGaps) > 0 {
		for _, gap := range result.HighGaps {
			if gap.ArtifactType == "roadmap_recipe" {
				result.Recommendations = append(result.Recommendations,
					"PRIORITY 2: Add hypothesis testing fields (success_criteria, uncertainty_addressed, experiment_design) to roadmap Key Results")
			} else if gap.ArtifactType == "feature_definition" {
				result.Recommendations = append(result.Recommendations,
					"PRIORITY 2: Enrich persona narratives with deep context (200+ chars for current_situation, transformation_moment, emotional_resolution)")
			}
		}
	}
}

// HasCriticalGaps returns true if there are critical coverage gaps
func (r *FieldCoverageResult) HasCriticalGaps() bool {
	return len(r.CriticalGaps) > 0
}

// HasHighGaps returns true if there are high-priority coverage gaps
func (r *FieldCoverageResult) HasHighGaps() bool {
	return len(r.HighGaps) > 0
}
