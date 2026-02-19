// Package checks - Feature quality validation
package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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
	"action",
	"outcome",
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

	// Check contributes_to cardinality
	c.checkContributesToCardinality(feature, result)

	// Check persona narrative quality (returns count for -2/issue scoring)
	narrativeHintCount := c.checkNarrativeQuality(feature, result)

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

	// Score calculation: -20 for critical, -10 for error, -5 for warning, -2 for narrative hint (capped at -10)
	narrativePenalty := narrativeHintCount * 2
	if narrativePenalty > 10 {
		narrativePenalty = 10 // Cap narrative quality penalty to avoid overwhelming score impact
	}
	result.Score = 100 - (criticalCount * 20) - (errorCount * 10) - (warningCount * 5) - narrativePenalty

	// Apply structural completeness caps
	// Features missing scenarios should not score above 80 (per feedback)
	// Features missing contexts should lose ~10 points total (warning -5 + additional -5)
	for _, issue := range result.Issues {
		if issue.Field == "scenarios" && strings.Contains(issue.Message, "No scenarios") {
			if result.Score > 80 {
				result.Score = 80
			}
		}
		if issue.Field == "contexts" && strings.Contains(issue.Message, "No contexts") {
			result.Score -= 5 // Additional -5 on top of warning's -5 = -10 total
		}
	}

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
		if def, defOk := feature["definition"].(map[string]interface{}); defOk {
			scenarios, ok = def["scenarios"].([]interface{})
		}
	}
	if !ok {
		// Check if scenarios is in implementation block (EPF v2 schema)
		if impl, implOk := feature["implementation"].(map[string]interface{}); implOk {
			scenarios, ok = impl["scenarios"].([]interface{})
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
	// Check for contexts in multiple locations (EPF v2 uses implementation.contexts)
	var contexts []interface{}
	found := false

	// 1. Check definition.context (legacy single-context format)
	if definition, ok := feature["definition"].(map[string]interface{}); ok {
		if ctx, ok := definition["context"].(map[string]interface{}); ok {
			contexts = []interface{}{ctx}
			found = true
		}
	}

	// 2. Check implementation.contexts (EPF v2 array format)
	if !found {
		if impl, ok := feature["implementation"].(map[string]interface{}); ok {
			if ctxs, ok := impl["contexts"].([]interface{}); ok && len(ctxs) > 0 {
				contexts = ctxs
				found = true
			}
		}
	}

	// 3. Check top-level contexts (fallback)
	if !found {
		if ctxs, ok := feature["contexts"].([]interface{}); ok && len(ctxs) > 0 {
			contexts = ctxs
			found = true
		}
	}

	if !found {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "contexts",
			Severity: SeverityWarning,
			Message:  "No contexts defined (recommended: define in implementation.contexts)",
		})
		return
	}

	// Check each context has recommended fields
	requiredContextFields := []string{"key_interactions", "data_displayed"}
	for i, c := range contexts {
		ctx, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		for _, field := range requiredContextFields {
			if _, ok := ctx[field]; !ok {
				result.Issues = append(result.Issues, QualityIssue{
					Field:    fmt.Sprintf("contexts[%d].%s", i, field),
					Severity: SeverityWarning,
					Message:  fmt.Sprintf("Missing '%s' in context", field),
				})
			}
		}
	}
}

// Regex for detecting concrete metrics in narratives (percentages, time savings, etc.)
var metricsPattern = regexp.MustCompile(`\d+\s*(%|percent|hours?|minutes?|days?|weeks?|x faster|x more|times)|\$\d|€\d|£\d|reduction|increase|improve`)

// checkNarrativeQuality validates persona narrative depth and quality.
// Returns the number of narrative quality hints emitted (used for -2/issue scoring).
// Checks: paragraph count (3+), char count per paragraph (200+), metrics presence,
// bullet-point (lazy list) detection.
func (c *FeatureQualityChecker) checkNarrativeQuality(feature map[string]interface{}, result *FeatureQualityResult) int {
	definition, ok := feature["definition"].(map[string]interface{})
	if !ok {
		return 0
	}
	personas, ok := definition["personas"].([]interface{})
	if !ok {
		return 0
	}

	hintCount := 0
	narrativeFields := []string{"current_situation", "transformation_moment", "emotional_resolution"}

	for i, p := range personas {
		persona, ok := p.(map[string]interface{})
		if !ok {
			continue
		}

		for _, field := range narrativeFields {
			text, ok := persona[field].(string)
			if !ok || len(text) == 0 {
				continue
			}

			fieldPath := fmt.Sprintf("definition.personas[%d].%s", i, field)

			// Split into paragraphs (double newline or significant breaks)
			paragraphs := splitParagraphs(text)
			if len(paragraphs) < 3 {
				result.Issues = append(result.Issues, QualityIssue{
					Field:    fieldPath,
					Severity: SeverityInfo,
					Message:  fmt.Sprintf("Narrative has %d paragraph(s); 3+ recommended for depth", len(paragraphs)),
					Expected: ">= 3 paragraphs",
					Actual:   fmt.Sprintf("%d paragraphs", len(paragraphs)),
				})
				hintCount++
			}

			// Check short paragraphs
			for j, para := range paragraphs {
				if len(para) < 200 {
					result.Issues = append(result.Issues, QualityIssue{
						Field:    fmt.Sprintf("%s.paragraph[%d]", fieldPath, j),
						Severity: SeverityInfo,
						Message:  fmt.Sprintf("Paragraph is %d chars; 200+ recommended", len(para)),
					})
					hintCount++
					break // Only flag once per field to avoid noise
				}
			}

			// Detect bullet-point lists (lazy narratives)
			bulletLines := 0
			for _, line := range strings.Split(text, "\n") {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") || strings.HasPrefix(trimmed, "• ") {
					bulletLines++
				}
			}
			totalLines := len(strings.Split(text, "\n"))
			if totalLines > 0 && float64(bulletLines)/float64(totalLines) > 0.5 {
				result.Issues = append(result.Issues, QualityIssue{
					Field:    fieldPath,
					Severity: SeverityInfo,
					Message:  "Narrative is mostly bullet points; prose paragraphs are preferred for persona narratives",
				})
				hintCount++
			}

			// Check for concrete metrics
			if !metricsPattern.MatchString(text) {
				result.Issues = append(result.Issues, QualityIssue{
					Field:    fieldPath,
					Severity: SeverityInfo,
					Message:  "Narrative lacks concrete metrics (e.g., percentages, time savings, dollar amounts)",
				})
				hintCount++
			}
		}
	}

	return hintCount
}

// splitParagraphs splits text into paragraphs by double newlines or significant whitespace.
func splitParagraphs(text string) []string {
	// Normalize line endings
	text = strings.ReplaceAll(text, "\r\n", "\n")
	// Split on double newlines
	raw := strings.Split(text, "\n\n")
	var result []string
	for _, p := range raw {
		trimmed := strings.TrimSpace(p)
		if len(trimmed) > 0 {
			result = append(result, trimmed)
		}
	}
	if len(result) == 0 && len(strings.TrimSpace(text)) > 0 {
		result = append(result, strings.TrimSpace(text))
	}
	return result
}

// checkContributesToCardinality adds an INFO nudge when a feature only contributes
// to a single value model path. Features with broader strategic impact typically
// contribute to 2+ paths. This is informational only — no score penalty.
func (c *FeatureQualityChecker) checkContributesToCardinality(feature map[string]interface{}, result *FeatureQualityResult) {
	sc, ok := feature["strategic_context"].(map[string]interface{})
	if !ok {
		return
	}
	ct, ok := sc["contributes_to"].([]interface{})
	if !ok || len(ct) == 0 {
		return // Missing contributes_to is caught by schema validation, not here
	}
	if len(ct) == 1 {
		result.Issues = append(result.Issues, QualityIssue{
			Field:    "strategic_context.contributes_to",
			Severity: SeverityInfo,
			Message:  "Feature contributes to only 1 value model path; consider whether it impacts additional components",
			Expected: ">= 2 paths for broader strategic alignment",
			Actual:   fmt.Sprintf("%d path", len(ct)),
		})
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
