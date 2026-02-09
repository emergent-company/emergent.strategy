package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/checks"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/template"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/validator"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// GENERATE REPORT TOOL
// =============================================================================

// ReportResult represents a health report
type ReportResult struct {
	Success          bool                           `json:"success"`
	Format           string                         `json:"format"`
	Title            string                         `json:"title"`
	InstancePath     string                         `json:"instance_path"`
	GeneratedAt      string                         `json:"generated_at"`
	OverallStatus    string                         `json:"overall_status"`
	OverallScore     int                            `json:"overall_score"`
	InstanceCheck    *checks.CheckSummary           `json:"instance_check,omitempty"`
	SchemaValidation *SchemaValidationSummaryReport `json:"schema_validation,omitempty"`
	FeatureQuality   *checks.FeatureQualitySummary  `json:"feature_quality,omitempty"`
	CrossReferences  *checks.CrossReferenceResult   `json:"cross_references,omitempty"`
	ContentReadiness *checks.ContentReadinessResult `json:"content_readiness,omitempty"`
	FieldCoverage    *checks.FieldCoverageResult    `json:"field_coverage,omitempty"`
	VersionAlignment *checks.VersionAlignmentResult `json:"version_alignment,omitempty"`
	Recommendations  []string                       `json:"recommendations"`
	Content          string                         `json:"content,omitempty"`
	Error            string                         `json:"error,omitempty"`
}

// SchemaValidationSummaryReport is a summary for schema validation in report
type SchemaValidationSummaryReport struct {
	TotalFiles   int                           `json:"total_files"`
	ValidFiles   int                           `json:"valid_files"`
	InvalidFiles int                           `json:"invalid_files"`
	SkippedFiles int                           `json:"skipped_files"`
	Results      []*validator.ValidationResult `json:"results,omitempty"`
}

func (s *Server) handleGenerateReport(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	format, _ := request.RequireString("format")
	if format == "" {
		format = "markdown"
	}
	format = strings.ToLower(format)

	verboseStr, _ := request.RequireString("verbose")
	verbose := strings.ToLower(verboseStr) == "true"

	// Validate instance exists
	if _, err := os.Stat(instancePath); os.IsNotExist(err) {
		result := ReportResult{
			Success: false,
			Error:   fmt.Sprintf("Instance path not found: %s", instancePath),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Get absolute path
	absPath, err := filepath.Abs(instancePath)
	if err != nil {
		absPath = instancePath
	}

	// Collect report data
	data := collectReportDataForMCP(absPath, s.schemasDir, verbose)
	data.Success = true
	data.Format = format

	// Generate content based on format
	switch format {
	case "json":
		// Return the structured data as JSON
		jsonData, _ := json.MarshalIndent(data, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	case "html":
		data.Content = generateHTMLReportContent(data)
	default:
		data.Content = generateMarkdownReportContent(data, verbose)
	}

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

func collectReportDataForMCP(instancePath, schemasDir string, verbose bool) *ReportResult {
	data := &ReportResult{
		Title:           "EPF Health Report",
		InstancePath:    instancePath,
		GeneratedAt:     time.Now().Format("2006-01-02 15:04:05"),
		Recommendations: make([]string, 0),
	}

	scores := make([]int, 0)

	// 1. Instance Structure Check
	instanceChecker := checks.NewInstanceChecker(instancePath)
	data.InstanceCheck = instanceChecker.Check()
	if data.InstanceCheck.TotalChecks > 0 {
		score := (data.InstanceCheck.Passed * 100) / data.InstanceCheck.TotalChecks
		scores = append(scores, score)
	}

	// 2. Schema Validation
	if schemasDir != "" {
		val, err := validator.NewValidator(schemasDir)
		if err == nil {
			summary := &SchemaValidationSummaryReport{
				Results: make([]*validator.ValidationResult, 0),
			}

			filepath.Walk(instancePath, func(path string, info os.FileInfo, err error) error {
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

				summary.TotalFiles++

				result, err := val.ValidateFile(path)
				if err != nil {
					summary.SkippedFiles++
					return nil
				}

				if result.Valid {
					summary.ValidFiles++
				} else {
					summary.InvalidFiles++
				}

				if verbose || !result.Valid {
					summary.Results = append(summary.Results, result)
				}

				return nil
			})

			data.SchemaValidation = summary
			if summary.TotalFiles > 0 {
				score := (summary.ValidFiles * 100) / summary.TotalFiles
				scores = append(scores, score)
			}
		}
	}

	// 3. Feature Quality Check
	firePath := filepath.Join(instancePath, "FIRE", "feature_definitions")
	if _, err := os.Stat(firePath); err == nil {
		featureChecker := checks.NewFeatureQualityChecker(firePath)
		featureResult, err := featureChecker.Check()
		if err == nil {
			data.FeatureQuality = featureResult
			scores = append(scores, int(featureResult.AverageScore))
		}
	}

	// 4. Cross-Reference Check
	if _, err := os.Stat(firePath); err == nil {
		crossRefChecker := checks.NewCrossReferenceChecker(firePath)
		crossRefResult, err := crossRefChecker.Check()
		if err == nil {
			data.CrossReferences = crossRefResult
			if crossRefResult.TotalReferences > 0 {
				score := (crossRefResult.ValidReferences * 100) / crossRefResult.TotalReferences
				scores = append(scores, score)
			}
		}
	}

	// 5. Content Readiness Check
	contentChecker := checks.NewContentReadinessChecker(instancePath)
	contentResult, err := contentChecker.Check()
	if err == nil {
		data.ContentReadiness = contentResult
		scores = append(scores, contentResult.Score)
	}

	// 6. Field Coverage Analysis
	if schemasDir != "" {
		taxonomyPath := filepath.Join(filepath.Dir(schemasDir), "schemas", "field-importance-taxonomy.json")
		if _, err := os.Stat(taxonomyPath); os.IsNotExist(err) {
			taxonomyPath = filepath.Join(schemasDir, "field-importance-taxonomy.json")
		}
		coverageChecker := checks.NewFieldCoverageChecker(instancePath, taxonomyPath)
		coverageResult, err := coverageChecker.Check()
		if err == nil {
			data.FieldCoverage = coverageResult
			scores = append(scores, coverageResult.HealthScore)
			data.Recommendations = append(data.Recommendations, coverageResult.Recommendations...)
		}
	}

	// 7. Version Alignment Check
	if schemasDir != "" {
		versionChecker := checks.NewVersionAlignmentChecker(instancePath, schemasDir)
		versionResult, err := versionChecker.Check()
		if err == nil {
			data.VersionAlignment = versionResult
			scores = append(scores, versionResult.AlignmentPercentage)
		}
	}

	// Calculate overall score
	if len(scores) > 0 {
		total := 0
		for _, s := range scores {
			total += s
		}
		data.OverallScore = total / len(scores)
	}

	// Determine overall status
	if data.OverallScore >= 90 {
		data.OverallStatus = "EXCELLENT"
	} else if data.OverallScore >= 75 {
		data.OverallStatus = "GOOD"
	} else if data.OverallScore >= 60 {
		data.OverallStatus = "FAIR"
	} else if data.OverallScore >= 40 {
		data.OverallStatus = "NEEDS ATTENTION"
	} else {
		data.OverallStatus = "CRITICAL"
	}

	// Generate recommendations
	generateReportRecommendations(data)

	return data
}

func generateReportRecommendations(data *ReportResult) {
	if data.InstanceCheck != nil && data.InstanceCheck.HasErrors() {
		data.Recommendations = append(data.Recommendations, "Fix instance structure issues: ensure READY, FIRE, and AIM directories exist with required files")
	}

	if data.SchemaValidation != nil && data.SchemaValidation.InvalidFiles > 0 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Fix %d schema validation errors using 'epf_validate_file' to identify issues", data.SchemaValidation.InvalidFiles))
	}

	if data.FeatureQuality != nil && data.FeatureQuality.AverageScore < 70 {
		data.Recommendations = append(data.Recommendations, "Improve feature definitions: add detailed personas, scenarios, and narratives")
	}

	if data.CrossReferences != nil && len(data.CrossReferences.BrokenLinks) > 0 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Fix %d broken cross-references in feature definitions", len(data.CrossReferences.BrokenLinks)))
	}

	if data.ContentReadiness != nil && data.ContentReadiness.Score < 70 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Replace %d placeholder patterns (TBD, TODO, etc.) with actual content", len(data.ContentReadiness.Placeholders)))
	}

	if data.VersionAlignment != nil && data.VersionAlignment.HasOutdatedArtifacts() {
		data.Recommendations = append(data.Recommendations, "Run 'epf_fix_file' with versions fix type to update artifacts to the latest schema version")
	}
}

func generateMarkdownReportContent(data *ReportResult, verbose bool) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# %s\n\n", data.Title))
	sb.WriteString(fmt.Sprintf("**Instance:** `%s`\n", data.InstancePath))
	sb.WriteString(fmt.Sprintf("**Generated:** %s\n\n", data.GeneratedAt))

	sb.WriteString("## Summary\n\n")
	sb.WriteString("| Metric | Value |\n")
	sb.WriteString("| ------ | ----- |\n")
	sb.WriteString(fmt.Sprintf("| **Overall Score** | %d/100 |\n", data.OverallScore))
	sb.WriteString(fmt.Sprintf("| **Status** | %s |\n", data.OverallStatus))
	sb.WriteString("\n")

	sb.WriteString("## Score Breakdown\n\n")
	sb.WriteString("| Check | Score | Status |\n")
	sb.WriteString("| ----- | ----- | ------ |\n")

	if data.InstanceCheck != nil && data.InstanceCheck.TotalChecks > 0 {
		score := (data.InstanceCheck.Passed * 100) / data.InstanceCheck.TotalChecks
		sb.WriteString(fmt.Sprintf("| Instance Structure | %d%% | %s |\n", score, getStatusEmoji(score)))
	}

	if data.SchemaValidation != nil && data.SchemaValidation.TotalFiles > 0 {
		score := (data.SchemaValidation.ValidFiles * 100) / data.SchemaValidation.TotalFiles
		sb.WriteString(fmt.Sprintf("| Schema Validation | %d%% | %s |\n", score, getStatusEmoji(score)))
	}

	if data.FeatureQuality != nil {
		sb.WriteString(fmt.Sprintf("| Feature Quality | %d%% | %s |\n", int(data.FeatureQuality.AverageScore), getStatusEmoji(int(data.FeatureQuality.AverageScore))))
	}

	if data.CrossReferences != nil && data.CrossReferences.TotalReferences > 0 {
		score := (data.CrossReferences.ValidReferences * 100) / data.CrossReferences.TotalReferences
		sb.WriteString(fmt.Sprintf("| Cross-References | %d%% | %s |\n", score, getStatusEmoji(score)))
	}

	if data.ContentReadiness != nil {
		sb.WriteString(fmt.Sprintf("| Content Readiness | %d%% | %s |\n", data.ContentReadiness.Score, getStatusEmoji(data.ContentReadiness.Score)))
	}

	if data.FieldCoverage != nil {
		sb.WriteString(fmt.Sprintf("| Field Coverage | %d%% | %s |\n", data.FieldCoverage.HealthScore, getStatusEmoji(data.FieldCoverage.HealthScore)))
	}

	if data.VersionAlignment != nil {
		sb.WriteString(fmt.Sprintf("| Version Alignment | %d%% | %s |\n", data.VersionAlignment.AlignmentPercentage, getStatusEmoji(data.VersionAlignment.AlignmentPercentage)))
	}

	sb.WriteString("\n")

	// Recommendations
	if len(data.Recommendations) > 0 {
		sb.WriteString("## Recommendations\n\n")
		for i, rec := range data.Recommendations {
			sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, rec))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func generateHTMLReportContent(data *ReportResult) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html><head><title>%s</title>
<style>body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:2rem}</style>
</head><body>
<h1>%s</h1>
<p>Instance: %s</p>
<p>Generated: %s</p>
<h2>Overall Score: %d/100 - %s</h2>
</body></html>`, data.Title, data.Title, data.InstancePath, data.GeneratedAt, data.OverallScore, data.OverallStatus)
}

func getStatusEmoji(score int) string {
	if score >= 80 {
		return "PASS"
	} else if score >= 60 {
		return "WARN"
	}
	return "FAIL"
}

// =============================================================================
// DIFF ARTIFACTS TOOL
// =============================================================================

// DiffArtifactsResult represents comparison between two artifacts
type DiffArtifactsResult struct {
	Success   bool           `json:"success"`
	Source    string         `json:"source"`
	Target    string         `json:"target"`
	Type      string         `json:"type"`
	Added     []DiffEntryMCP `json:"added,omitempty"`
	Removed   []DiffEntryMCP `json:"removed,omitempty"`
	Modified  []DiffEntryMCP `json:"modified,omitempty"`
	Unchanged int            `json:"unchanged"`
	Summary   string         `json:"summary"`
	Error     string         `json:"error,omitempty"`
}

// DiffEntryMCP represents a single difference
type DiffEntryMCP struct {
	Path     string `json:"path"`
	Type     string `json:"type,omitempty"`
	OldValue string `json:"old_value,omitempty"`
	NewValue string `json:"new_value,omitempty"`
}

func (s *Server) handleDiffArtifacts(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path1, err := request.RequireString("path1")
	if err != nil || path1 == "" {
		result := DiffArtifactsResult{
			Success: false,
			Error:   "path1 is required",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	path2, err := request.RequireString("path2")
	if err != nil || path2 == "" {
		result := DiffArtifactsResult{
			Success: false,
			Error:   "path2 is required",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	verboseStr, _ := request.RequireString("verbose")
	verbose := strings.ToLower(verboseStr) == "true"

	// Check paths exist
	info1, err := os.Stat(path1)
	if os.IsNotExist(err) {
		result := DiffArtifactsResult{
			Success: false,
			Error:   fmt.Sprintf("Source path not found: %s", path1),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	info2, err := os.Stat(path2)
	if os.IsNotExist(err) {
		result := DiffArtifactsResult{
			Success: false,
			Error:   fmt.Sprintf("Target path not found: %s", path2),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	var result *DiffArtifactsResult

	if info1.IsDir() && info2.IsDir() {
		result = diffDirectoriesMCP(path1, path2, verbose)
	} else if !info1.IsDir() && !info2.IsDir() {
		result = diffFilesMCP(path1, path2, verbose)
	} else {
		result = &DiffArtifactsResult{
			Success: false,
			Error:   "Cannot compare file and directory",
		}
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

func diffFilesMCP(source, target string, verbose bool) *DiffArtifactsResult {
	result := &DiffArtifactsResult{
		Success: true,
		Source:  source,
		Target:  target,
		Type:    "file",
	}

	sourceData, err := readYAMLFileMCP(source)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Error reading source: %v", err)
		return result
	}

	targetData, err := readYAMLFileMCP(target)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Error reading target: %v", err)
		return result
	}

	fieldDiffs := compareYAMLMCP(sourceData, targetData, "")

	for _, diff := range fieldDiffs {
		entry := DiffEntryMCP{
			Path: diff.Field,
			Type: "field",
		}
		if verbose {
			if diff.OldValue != nil {
				entry.OldValue = fmt.Sprintf("%v", diff.OldValue)
			}
			if diff.NewValue != nil {
				entry.NewValue = fmt.Sprintf("%v", diff.NewValue)
			}
		}

		switch diff.Type {
		case "added":
			result.Added = append(result.Added, entry)
		case "removed":
			result.Removed = append(result.Removed, entry)
		case "modified":
			result.Modified = append(result.Modified, entry)
		}
	}

	totalFields := countFieldsMCP(sourceData) + countFieldsMCP(targetData)
	changedFields := len(result.Added) + len(result.Removed) + len(result.Modified)*2
	result.Unchanged = (totalFields - changedFields) / 2
	if result.Unchanged < 0 {
		result.Unchanged = 0
	}

	result.Summary = fmt.Sprintf("%d added, %d removed, %d modified",
		len(result.Added), len(result.Removed), len(result.Modified))

	return result
}

func diffDirectoriesMCP(source, target string, verbose bool) *DiffArtifactsResult {
	result := &DiffArtifactsResult{
		Success: true,
		Source:  source,
		Target:  target,
		Type:    "directory",
	}

	sourceFiles := getYAMLFilesMCP(source)
	targetFiles := getYAMLFilesMCP(target)

	sourceSet := make(map[string]string)
	targetSet := make(map[string]string)

	for _, f := range sourceFiles {
		rel, _ := filepath.Rel(source, f)
		sourceSet[rel] = f
	}
	for _, f := range targetFiles {
		rel, _ := filepath.Rel(target, f)
		targetSet[rel] = f
	}

	// Added files
	for rel := range targetSet {
		if _, exists := sourceSet[rel]; !exists {
			result.Added = append(result.Added, DiffEntryMCP{
				Path: rel,
				Type: "file",
			})
		}
	}

	// Removed files
	for rel := range sourceSet {
		if _, exists := targetSet[rel]; !exists {
			result.Removed = append(result.Removed, DiffEntryMCP{
				Path: rel,
				Type: "file",
			})
		}
	}

	// Modified files
	for rel, sourcePath := range sourceSet {
		if targetPath, exists := targetSet[rel]; exists {
			if hasFileDifferencesMCP(sourcePath, targetPath) {
				entry := DiffEntryMCP{
					Path: rel,
					Type: "file",
				}
				if verbose {
					fileDiff := diffFilesMCP(sourcePath, targetPath, false)
					entry.OldValue = fmt.Sprintf("%d changes", len(fileDiff.Added)+len(fileDiff.Removed)+len(fileDiff.Modified))
				}
				result.Modified = append(result.Modified, entry)
			} else {
				result.Unchanged++
			}
		}
	}

	// Sort results
	sort.Slice(result.Added, func(i, j int) bool { return result.Added[i].Path < result.Added[j].Path })
	sort.Slice(result.Removed, func(i, j int) bool { return result.Removed[i].Path < result.Removed[j].Path })
	sort.Slice(result.Modified, func(i, j int) bool { return result.Modified[i].Path < result.Modified[j].Path })

	result.Summary = fmt.Sprintf("%d added, %d removed, %d modified, %d unchanged",
		len(result.Added), len(result.Removed), len(result.Modified), result.Unchanged)

	return result
}

// FieldDiffMCP represents differences in YAML fields
type FieldDiffMCP struct {
	Field    string      `json:"field"`
	Type     string      `json:"type"`
	OldValue interface{} `json:"old_value,omitempty"`
	NewValue interface{} `json:"new_value,omitempty"`
}

func readYAMLFileMCP(path string) (map[string]interface{}, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var data map[string]interface{}
	if err := yaml.Unmarshal(content, &data); err != nil {
		return nil, err
	}

	return data, nil
}

func compareYAMLMCP(source, target map[string]interface{}, prefix string) []FieldDiffMCP {
	diffs := make([]FieldDiffMCP, 0)

	allKeys := make(map[string]bool)
	for k := range source {
		allKeys[k] = true
	}
	for k := range target {
		allKeys[k] = true
	}

	for key := range allKeys {
		fieldPath := key
		if prefix != "" {
			fieldPath = prefix + "." + key
		}

		sourceVal, sourceExists := source[key]
		targetVal, targetExists := target[key]

		if !sourceExists {
			diffs = append(diffs, FieldDiffMCP{
				Field:    fieldPath,
				Type:     "added",
				NewValue: summarizeValueMCP(targetVal),
			})
		} else if !targetExists {
			diffs = append(diffs, FieldDiffMCP{
				Field:    fieldPath,
				Type:     "removed",
				OldValue: summarizeValueMCP(sourceVal),
			})
		} else {
			if !reflect.DeepEqual(sourceVal, targetVal) {
				sourceMap, sourceIsMap := sourceVal.(map[string]interface{})
				targetMap, targetIsMap := targetVal.(map[string]interface{})

				if sourceIsMap && targetIsMap {
					subDiffs := compareYAMLMCP(sourceMap, targetMap, fieldPath)
					diffs = append(diffs, subDiffs...)
				} else {
					diffs = append(diffs, FieldDiffMCP{
						Field:    fieldPath,
						Type:     "modified",
						OldValue: summarizeValueMCP(sourceVal),
						NewValue: summarizeValueMCP(targetVal),
					})
				}
			}
		}
	}

	return diffs
}

func summarizeValueMCP(val interface{}) interface{} {
	switch v := val.(type) {
	case map[string]interface{}:
		return fmt.Sprintf("{%d fields}", len(v))
	case []interface{}:
		return fmt.Sprintf("[%d items]", len(v))
	case string:
		if len(v) > 50 {
			return v[:50] + "..."
		}
		return v
	default:
		return val
	}
}

func countFieldsMCP(data map[string]interface{}) int {
	count := 0
	for _, v := range data {
		count++
		if m, ok := v.(map[string]interface{}); ok {
			count += countFieldsMCP(m)
		}
	}
	return count
}

func getYAMLFilesMCP(dir string) []string {
	var files []string
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".yaml" || ext == ".yml" {
			files = append(files, path)
		}
		return nil
	})
	return files
}

func hasFileDifferencesMCP(path1, path2 string) bool {
	content1, err1 := os.ReadFile(path1)
	content2, err2 := os.ReadFile(path2)

	if err1 != nil || err2 != nil {
		return true
	}

	return string(content1) != string(content2)
}

// =============================================================================
// DIFF TEMPLATE TOOL
// =============================================================================

// DiffTemplateResult represents differences between a file and its template
type DiffTemplateResult struct {
	Success      bool                   `json:"success"`
	File         string                 `json:"file"`
	ArtifactType string                 `json:"artifact_type"`
	Template     string                 `json:"template"`
	Issues       []TemplateDiffIssueMCP `json:"issues"`
	Summary      TemplateDiffSummaryMCP `json:"summary"`
	Error        string                 `json:"error,omitempty"`
}

// TemplateDiffIssueMCP represents a single structural issue
type TemplateDiffIssueMCP struct {
	Path         string `json:"path"`
	IssueType    string `json:"issue_type"`
	Priority     string `json:"priority"`
	Message      string `json:"message"`
	ExpectedType string `json:"expected_type,omitempty"`
	ActualType   string `json:"actual_type,omitempty"`
	TemplateHint string `json:"template_hint,omitempty"`
	FixHint      string `json:"fix_hint,omitempty"`
}

// TemplateDiffSummaryMCP summarizes the template comparison
type TemplateDiffSummaryMCP struct {
	TotalIssues      int      `json:"total_issues"`
	CriticalCount    int      `json:"critical_count"`
	HighCount        int      `json:"high_count"`
	MediumCount      int      `json:"medium_count"`
	LowCount         int      `json:"low_count"`
	TypeMismatches   int      `json:"type_mismatches"`
	MissingFields    int      `json:"missing_fields"`
	ExtraFields      int      `json:"extra_fields"`
	AffectedSections []string `json:"affected_sections"`
}

func (s *Server) handleDiffTemplate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	filePath, err := request.RequireString("file_path")
	if err != nil || filePath == "" {
		result := DiffTemplateResult{
			Success: false,
			Error:   "file_path is required",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	verboseStr, _ := request.RequireString("verbose")
	verbose := strings.ToLower(verboseStr) == "true"

	// Check file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("File not found: %s", filePath),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Detect artifact type
	loader := schema.NewLoader(s.schemasDir)
	if err := loader.Load(); err != nil {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("Error loading schemas: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	artifactType, err := loader.DetectArtifactType(filePath)
	if err != nil {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("Cannot detect artifact type for: %s", filePath),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Get EPF root for templates
	epfRoot := filepath.Dir(s.schemasDir)

	// Load template
	tmplLoader := template.NewLoader(epfRoot)
	if err := tmplLoader.Load(); err != nil {
		// Try embedded
		tmplLoader = template.NewEmbeddedLoader()
		if err := tmplLoader.Load(); err != nil {
			result := DiffTemplateResult{
				Success: false,
				Error:   fmt.Sprintf("Error loading templates: %v", err),
			}
			jsonData, _ := json.MarshalIndent(result, "", "  ")
			return mcp.NewToolResultText(string(jsonData)), nil
		}
	}

	tmpl, err := tmplLoader.GetTemplate(artifactType)
	if err != nil {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("No template available for: %s", artifactType),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Parse both files
	fileData, err := readYAMLFileMCP(filePath)
	if err != nil {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("Error reading file: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	var templateData map[string]interface{}
	if err := yaml.Unmarshal([]byte(tmpl.Content), &templateData); err != nil {
		result := DiffTemplateResult{
			Success: false,
			Error:   fmt.Sprintf("Error parsing template: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Compare structure
	result := compareWithTemplateMCP(filePath, string(artifactType), templateData, fileData, verbose)

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

func compareWithTemplateMCP(filePath, artifactType string, templateData, fileData map[string]interface{}, verbose bool) *DiffTemplateResult {
	result := &DiffTemplateResult{
		Success:      true,
		File:         filePath,
		ArtifactType: artifactType,
		Template:     fmt.Sprintf("%s template", artifactType),
		Issues:       make([]TemplateDiffIssueMCP, 0),
	}

	issues := compareStructureMCP(templateData, fileData, "", verbose)
	result.Issues = issues

	sectionSet := make(map[string]bool)
	for _, issue := range issues {
		switch issue.Priority {
		case "critical":
			result.Summary.CriticalCount++
		case "high":
			result.Summary.HighCount++
		case "medium":
			result.Summary.MediumCount++
		case "low":
			result.Summary.LowCount++
		}

		switch issue.IssueType {
		case "type_mismatch":
			result.Summary.TypeMismatches++
		case "missing_field":
			result.Summary.MissingFields++
		case "extra_field":
			result.Summary.ExtraFields++
		}

		parts := strings.Split(issue.Path, ".")
		if len(parts) > 0 {
			section := parts[0]
			if idx := strings.Index(section, "["); idx > 0 {
				section = section[:idx]
			}
			sectionSet[section] = true
		}
	}

	result.Summary.TotalIssues = len(issues)
	for section := range sectionSet {
		result.Summary.AffectedSections = append(result.Summary.AffectedSections, section)
	}
	sort.Strings(result.Summary.AffectedSections)

	return result
}

func compareStructureMCP(tmplData, fileData map[string]interface{}, prefix string, verbose bool) []TemplateDiffIssueMCP {
	issues := make([]TemplateDiffIssueMCP, 0)

	skipFields := map[string]bool{"meta": true}

	for key, tmplVal := range tmplData {
		if skipFields[key] {
			continue
		}

		path := key
		if prefix != "" {
			path = prefix + "." + key
		}

		fileVal, exists := fileData[key]

		if !exists {
			issues = append(issues, TemplateDiffIssueMCP{
				Path:         path,
				IssueType:    "missing_field",
				Priority:     getMissingFieldPriorityMCP(key),
				Message:      fmt.Sprintf("Field '%s' exists in template but not in file", key),
				ExpectedType: getValueTypeMCP(tmplVal),
				TemplateHint: formatTemplateHintMCP(tmplVal),
				FixHint:      fmt.Sprintf("Add '%s' field with %s value", key, getValueTypeMCP(tmplVal)),
			})
			continue
		}

		tmplType := getValueTypeMCP(tmplVal)
		fileType := getValueTypeMCP(fileVal)

		if tmplType != fileType {
			issues = append(issues, TemplateDiffIssueMCP{
				Path:         path,
				IssueType:    "type_mismatch",
				Priority:     "critical",
				Message:      fmt.Sprintf("Type mismatch: template has %s, file has %s", tmplType, fileType),
				ExpectedType: tmplType,
				ActualType:   fileType,
				TemplateHint: formatTemplateHintMCP(tmplVal),
				FixHint:      getTypeMismatchHintMCP(tmplType, fileType),
			})
			continue
		}

		switch tv := tmplVal.(type) {
		case map[string]interface{}:
			if fv, ok := fileVal.(map[string]interface{}); ok {
				subIssues := compareStructureMCP(tv, fv, path, verbose)
				issues = append(issues, subIssues...)
			}
		case []interface{}:
			if fv, ok := fileVal.([]interface{}); ok {
				if len(tv) > 0 && len(fv) > 0 {
					if tmplItem, ok := tv[0].(map[string]interface{}); ok {
						for i, fileItem := range fv {
							if fi, ok := fileItem.(map[string]interface{}); ok {
								itemPath := fmt.Sprintf("%s[%d]", path, i)
								subIssues := compareStructureMCP(tmplItem, fi, itemPath, verbose)
								issues = append(issues, subIssues...)
							} else {
								issues = append(issues, TemplateDiffIssueMCP{
									Path:         fmt.Sprintf("%s[%d]", path, i),
									IssueType:    "type_mismatch",
									Priority:     "critical",
									Message:      fmt.Sprintf("Array item should be object, got %s", getValueTypeMCP(fileItem)),
									ExpectedType: "object",
									ActualType:   getValueTypeMCP(fileItem),
									TemplateHint: formatTemplateHintMCP(tmplItem),
									FixHint:      "Convert array item to object with proper fields",
								})
							}
						}
					}
				}
			}
		}
	}

	if verbose {
		for key := range fileData {
			if skipFields[key] {
				continue
			}
			if _, exists := tmplData[key]; !exists {
				path := key
				if prefix != "" {
					path = prefix + "." + key
				}
				issues = append(issues, TemplateDiffIssueMCP{
					Path:      path,
					IssueType: "extra_field",
					Priority:  "low",
					Message:   fmt.Sprintf("Field '%s' exists in file but not in template", key),
					FixHint:   "This field may be valid if defined in schema, or may need to be removed",
				})
			}
		}
	}

	return issues
}

func getValueTypeMCP(val interface{}) string {
	switch v := val.(type) {
	case map[string]interface{}:
		return "object"
	case []interface{}:
		if len(v) > 0 {
			itemType := getValueTypeMCP(v[0])
			return fmt.Sprintf("array<%s>", itemType)
		}
		return "array"
	case string:
		return "string"
	case int, int64, float64:
		return "number"
	case bool:
		return "boolean"
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%T", val)
	}
}

func getMissingFieldPriorityMCP(key string) string {
	highPriorityFields := map[string]bool{
		"name": true, "id": true, "description": true,
		"status": true, "type": true, "definition": true,
	}
	if highPriorityFields[key] {
		return "high"
	}
	return "medium"
}

func formatTemplateHintMCP(val interface{}) string {
	switch v := val.(type) {
	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		if len(keys) > 5 {
			return fmt.Sprintf("{%s, ...} (%d keys)", strings.Join(keys[:5], ", "), len(keys))
		}
		return fmt.Sprintf("{%s}", strings.Join(keys, ", "))
	case []interface{}:
		if len(v) == 0 {
			return "[]"
		}
		itemHint := formatTemplateHintMCP(v[0])
		return fmt.Sprintf("[%s, ...] (%d items)", itemHint, len(v))
	case string:
		if len(v) > 60 {
			return fmt.Sprintf("%q...", v[:60])
		}
		return fmt.Sprintf("%q", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func getTypeMismatchHintMCP(expected, actual string) string {
	switch {
	case expected == "array<object>" && actual == "string":
		return "Convert string to array of objects using YAML list syntax (- item)"
	case strings.HasPrefix(expected, "array") && actual == "string":
		return "Convert string to array using YAML list syntax (- item)"
	case expected == "object" && actual == "string":
		return "Convert string to object with proper nested fields"
	case expected == "string" && strings.HasPrefix(actual, "array"):
		return "Extract single value from array or join array items into string"
	case expected == "string" && actual == "object":
		return "Extract relevant string value from object"
	default:
		return fmt.Sprintf("Convert %s to %s", actual, expected)
	}
}
