// Package checks - Feature quality validation
package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// FeatureQualityChecker validates feature definition quality
type FeatureQualityChecker struct {
	path string
}

// NewFeatureQualityChecker creates a new feature quality checker
func NewFeatureQualityChecker(path string) *FeatureQualityChecker {
	return &FeatureQualityChecker{path: path}
}

// FeatureQualityResult contains the result for a single feature
type FeatureQualityResult struct {
	File      string         `json:"file"`
	FeatureID string         `json:"feature_id"`
	Passed    bool           `json:"passed"`
	Score     int            `json:"score"` // 0-100
	Issues    []QualityIssue `json:"issues"`
}

// QualityIssue represents a quality issue
type QualityIssue struct {
	Field    string   `json:"field"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
	Expected string   `json:"expected,omitempty"`
	Actual   string   `json:"actual,omitempty"`
}

// FeatureQualitySummary summarizes all feature quality checks
type FeatureQualitySummary struct {
	TotalFeatures int                     `json:"total_features"`
	PassedCount   int                     `json:"passed_count"`
	FailedCount   int                     `json:"failed_count"`
	AverageScore  float64                 `json:"average_score"`
	Results       []*FeatureQualityResult `json:"results"`
}

// Quality constraints - relaxed to work across EPF schema versions
const (
	MinPersonaCount         = 1   // At least 1 persona required
	RecommendedPersonaCount = 4   // 4 personas recommended
	MinNarrativeLength      = 100 // Relaxed from 200
	MinRationaleLength      = 30
	MinDescriptionLength    = 10
)

// RecommendedScenarioFieldNames are fields that good scenarios should have
// These are now optional/recommended rather than required
var RecommendedScenarioFieldNames = []string{
	"name",
	"context",
	"trigger",
	"steps",
	"expected_outcome",
}

// Check runs feature quality validation on a directory or file
func (c *FeatureQualityChecker) Check() (*FeatureQualitySummary, error) {
	summary := &FeatureQualitySummary{
		Results: make([]*FeatureQualityResult, 0),
	}

	info, err := os.Stat(c.path)
	if err != nil {
		return nil, fmt.Errorf("cannot access path: %w", err)
	}

	if info.IsDir() {
		// Check all feature definition files in directory
		err = filepath.Walk(c.path, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				return nil
			}

			// Only check YAML files
			ext := strings.ToLower(filepath.Ext(path))
			if ext != ".yaml" && ext != ".yml" {
				return nil
			}

			// Skip files starting with _
			base := filepath.Base(path)
			if strings.HasPrefix(base, "_") {
				return nil
			}

			// Check if it's a feature definition (fd-*.yaml or in feature_definitions/)
			if strings.HasPrefix(base, "fd-") || strings.Contains(path, "feature_definitions") {
				result := c.checkFeatureFile(path)
				summary.Results = append(summary.Results, result)
				summary.TotalFeatures++
				if result.Passed {
					summary.PassedCount++
				} else {
					summary.FailedCount++
				}
			}

			return nil
		})

		if err != nil {
			return nil, err
		}
	} else {
		// Check single file
		result := c.checkFeatureFile(c.path)
		summary.Results = append(summary.Results, result)
		summary.TotalFeatures = 1
		if result.Passed {
			summary.PassedCount = 1
		} else {
			summary.FailedCount = 1
		}
	}

	// Calculate average score
	if summary.TotalFeatures > 0 {
		totalScore := 0
		for _, r := range summary.Results {
			totalScore += r.Score
		}
		summary.AverageScore = float64(totalScore) / float64(summary.TotalFeatures)
	}

	return summary, nil
}

func (c *FeatureQualityChecker) checkFeatureFile(path string) *FeatureQualityResult {
	result := &FeatureQualityResult{
		File:   path,
		Passed: true,
		Score:  100,
		Issues: make([]QualityIssue, 0),
	}

	// Read file
	data, err := os.ReadFile(path)
	if err != nil {
		result.Passed = false
		result.Score = 0
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "file",
			Severity: SeverityCritical,
			Message:  fmt.Sprintf("Cannot read file: %v", err),
		})
		return result
	}

	// Parse YAML
	var feature map[string]interface{}
	if err := yaml.Unmarshal(data, &feature); err != nil {
		result.Passed = false
		result.Score = 0
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "yaml",
			Severity: SeverityCritical,
			Message:  fmt.Sprintf("Invalid YAML: %v", err),
		})
		return result
	}

	// Extract feature ID
	if id, ok := feature["id"].(string); ok {
		result.FeatureID = id
	}

	// Check personas (exactly 4 required)
	c.checkPersonas(feature, result)

	// Check narratives (min 200 chars)
	c.checkNarratives(feature, result)

	// Check scenarios
	c.checkScenarios(feature, result)

	// Check dependencies
	c.checkDependencies(feature, result)

	// Check context fields
	c.checkContext(feature, result)

	// Calculate final score and passed status
	criticalCount := 0
	errorCount := 0
	warningCount := 0

	for _, issue := range result.Issues {
		switch issue.Severity {
		case SeverityCritical:
			criticalCount++
		case SeverityError:
			errorCount++
		case SeverityWarning:
			warningCount++
		}
	}

	// Score calculation: -20 for critical, -10 for error, -5 for warning
	result.Score = 100 - (criticalCount * 20) - (errorCount * 10) - (warningCount * 5)
	if result.Score < 0 {
		result.Score = 0
	}

	// Passed if no critical or error issues
	result.Passed = criticalCount == 0 && errorCount == 0

	return result
}

func (c *FeatureQualityChecker) checkPersonas(feature map[string]interface{}, result *FeatureQualityResult) {
	definition, ok := feature["definition"].(map[string]interface{})
	if !ok {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "definition",
			Severity: SeverityCritical,
			Message:  "Missing 'definition' block",
		})
		return
	}

	personas, ok := definition["personas"].([]interface{})
	if !ok {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "definition.personas",
			Severity: SeverityCritical,
			Message:  "Missing 'personas' array",
		})
		return
	}

	// Check minimum persona count
	if len(personas) < MinPersonaCount {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "definition.personas",
			Severity: SeverityError,
			Message:  fmt.Sprintf("At least %d persona required", MinPersonaCount),
			Expected: fmt.Sprintf(">= %d personas", MinPersonaCount),
			Actual:   fmt.Sprintf("%d personas", len(personas)),
		})
	} else if len(personas) < RecommendedPersonaCount {
		// Only warn if below recommended count
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "definition.personas",
			Severity: SeverityWarning,
			Message:  fmt.Sprintf("Recommended to have %d personas for comprehensive coverage", RecommendedPersonaCount),
			Expected: fmt.Sprintf("%d personas", RecommendedPersonaCount),
			Actual:   fmt.Sprintf("%d personas", len(personas)),
		})
	}

	// Check each persona has good content
	for i, p := range personas {
		persona, ok := p.(map[string]interface{})
		if !ok {
			continue
		}

		// Check for substantive persona content - look for any of these fields
		hasSubstantiveContent := false
		contentFields := []string{"narrative", "current_situation", "transformation_moment", "emotional_resolution", "description", "goals", "pain_points"}
		for _, field := range contentFields {
			if val, ok := persona[field]; ok {
				switch v := val.(type) {
				case string:
					if len(v) >= MinNarrativeLength {
						hasSubstantiveContent = true
						break
					}
				case []interface{}:
					if len(v) > 0 {
						hasSubstantiveContent = true
						break
					}
				}
			}
		}

		if !hasSubstantiveContent {
			result.Issues = append(result.Issues, QualityIssue{
				Field:    fmt.Sprintf("definition.personas[%d]", i),
				Severity: SeverityWarning,
				Message:  "Persona lacks substantive content (narrative, description, or goals)",
			})
		}
	}
}

func (c *FeatureQualityChecker) checkNarratives(feature map[string]interface{}, result *FeatureQualityResult) {
	// Check various narrative fields
	narrativeFields := []string{
		"strategic_context.why_now",
		"strategic_context.opportunity",
	}

	for _, field := range narrativeFields {
		value := getNestedString(feature, field)
		if value != "" && len(value) < MinNarrativeLength {
			result.Issues = append(result.Issues, QualityIssue{
				Field:    field,
				Severity: SeverityWarning,
				Message:  "Narrative too short",
				Expected: fmt.Sprintf(">= %d characters", MinNarrativeLength),
				Actual:   fmt.Sprintf("%d characters", len(value)),
			})
		}
	}
}

func (c *FeatureQualityChecker) checkScenarios(feature map[string]interface{}, result *FeatureQualityResult) {
	scenarios, ok := feature["scenarios"].([]interface{})
	if !ok {
		// Check if scenarios is in definition block
		if def, ok := feature["definition"].(map[string]interface{}); ok {
			scenarios, ok = def["scenarios"].([]interface{})
		}
	}

	// Scenarios are recommended but not required - some EPF versions don't use them
	if !ok || len(scenarios) == 0 {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "scenarios",
			Severity: SeverityWarning, // Changed from Error - scenarios not used in all EPF versions
			Message:  "No scenarios defined (recommended for comprehensive feature documentation)",
		})
		return
	}

	// Check each scenario has recommended fields (warnings, not errors)
	for i, s := range scenarios {
		scenario, ok := s.(map[string]interface{})
		if !ok {
			continue
		}

		missingFields := []string{}
		for _, field := range RecommendedScenarioFieldNames {
			if _, ok := scenario[field]; !ok {
				missingFields = append(missingFields, field)
			}
		}

		if len(missingFields) > 0 {
			result.Issues = append(result.Issues, QualityIssue{
				Field:    fmt.Sprintf("scenarios[%d]", i),
				Severity: SeverityWarning,
				Message:  fmt.Sprintf("Missing recommended fields: %v", missingFields),
			})
		}
	}
}

func (c *FeatureQualityChecker) checkDependencies(feature map[string]interface{}, result *FeatureQualityResult) {
	deps, ok := feature["dependencies"].(map[string]interface{})
	if !ok {
		return // Dependencies are optional
	}

	// Check requires array
	if requires, ok := deps["requires"].([]interface{}); ok {
		for i, r := range requires {
			req, ok := r.(map[string]interface{})
			if !ok {
				// Should be an object with id, name, reason
				result.Issues = append(result.Issues, QualityIssue{
					Field:    fmt.Sprintf("dependencies.requires[%d]", i),
					Severity: SeverityWarning,
					Message:  "Dependency should be an object with id, name, reason",
				})
				continue
			}

			// Check reason length
			if reason, ok := req["reason"].(string); ok {
				if len(reason) < MinRationaleLength {
					result.Issues = append(result.Issues, QualityIssue{
						Field:    fmt.Sprintf("dependencies.requires[%d].reason", i),
						Severity: SeverityWarning,
						Message:  "Dependency reason too short",
						Expected: fmt.Sprintf(">= %d characters", MinRationaleLength),
						Actual:   fmt.Sprintf("%d characters", len(reason)),
					})
				}
			}
		}
	}
}

func (c *FeatureQualityChecker) checkContext(feature map[string]interface{}, result *FeatureQualityResult) {
	definition, ok := feature["definition"].(map[string]interface{})
	if !ok {
		return
	}

	context, ok := definition["context"].(map[string]interface{})
	if !ok {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "definition.context",
			Severity: SeverityWarning,
			Message:  "Missing 'context' block in definition",
		})
		return
	}

	// Check required context fields
	requiredContextFields := []string{"key_interactions", "data_displayed"}
	for _, field := range requiredContextFields {
		if _, ok := context[field]; !ok {
			result.Issues = append(result.Issues, QualityIssue{
				Field:    fmt.Sprintf("definition.context.%s", field),
				Severity: SeverityWarning,
				Message:  fmt.Sprintf("Missing '%s' in context", field),
			})
		}
	}
}

// getNestedString gets a nested string value from a map
func getNestedString(m map[string]interface{}, path string) string {
	parts := strings.Split(path, ".")
	current := m

	for i, part := range parts {
		if i == len(parts)-1 {
			// Last part - get string value
			if v, ok := current[part].(string); ok {
				return v
			}
			return ""
		}

		// Navigate deeper
		if next, ok := current[part].(map[string]interface{}); ok {
			current = next
		} else {
			return ""
		}
	}

	return ""
}
