package cmd

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/checks"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
)

var (
	reportFormat  string
	reportOutput  string
	reportVerbose bool
)

// reportCmd represents the report command
var reportCmd = &cobra.Command{
	Use:   "report [instance-path]",
	Short: "Generate a health report for an EPF instance",
	Long: `Generate a comprehensive health report for an EPF instance.

Supported formats:
  - markdown (default): Generate a Markdown report
  - html: Generate an HTML report with styling
  - json: Generate a JSON report

The report includes:
  - Instance structure analysis
  - Schema validation results
  - Feature quality metrics
  - Content readiness scores
  - Field coverage analysis
  - Version alignment status
  - Recommendations for improvement

Examples:
  epf-cli report .                           # Generate Markdown report to stdout
  epf-cli report . -o report.md              # Save Markdown report to file
  epf-cli report . --format html -o report.html  # Generate HTML report
  epf-cli report . --format json -o report.json  # Generate JSON report`,
	Args: cobra.MaximumNArgs(1),
	Run:  runReport,
}

func init() {
	rootCmd.AddCommand(reportCmd)
	reportCmd.Flags().StringVarP(&reportFormat, "format", "f", "markdown", "Output format: markdown, html, json")
	reportCmd.Flags().StringVarP(&reportOutput, "output", "o", "", "Output file path (defaults to stdout)")
	reportCmd.Flags().BoolVarP(&reportVerbose, "verbose", "v", false, "Include detailed information")
}

// ReportData contains all data for the report
type ReportData struct {
	Title            string                         `json:"title"`
	InstancePath     string                         `json:"instance_path"`
	GeneratedAt      string                         `json:"generated_at"`
	OverallStatus    string                         `json:"overall_status"`
	OverallScore     int                            `json:"overall_score"`
	InstanceCheck    *checks.CheckSummary           `json:"instance_check,omitempty"`
	SchemaValidation *SchemaValidationSummary       `json:"schema_validation,omitempty"`
	FeatureQuality   *checks.FeatureQualitySummary  `json:"feature_quality,omitempty"`
	CrossReferences  *checks.CrossReferenceResult   `json:"cross_references,omitempty"`
	ContentReadiness *checks.ContentReadinessResult `json:"content_readiness,omitempty"`
	FieldCoverage    *checks.FieldCoverageResult    `json:"field_coverage,omitempty"`
	VersionAlignment *checks.VersionAlignmentResult `json:"version_alignment,omitempty"`
	Recommendations  []string                       `json:"recommendations"`
}

func runReport(cmd *cobra.Command, args []string) {
	instancePath, err := GetInstancePath(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Print instance name if auto-detected
	if len(args) == 0 && epfContext != nil && epfContext.InstancePath != "" {
		fmt.Printf("Using instance: %s\n\n", epfContext.CurrentInstance)
	}

	// Convert to absolute path (GetInstancePath already returns absolute)
	absPath := instancePath

	// Get schemas directory
	schemasPath, err := GetSchemasDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Could not find schemas directory: %v\n", err)
		schemasPath = ""
	}

	// Collect all data
	data := collectReportData(absPath, schemasPath)

	// Generate report
	var output string
	switch strings.ToLower(reportFormat) {
	case "json":
		output, err = generateJSONReport(data)
	case "html":
		output, err = generateHTMLReport(data)
	default:
		output, err = generateMarkdownReport(data)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error generating report: %v\n", err)
		os.Exit(1)
	}

	// Write output
	if reportOutput != "" {
		err = os.WriteFile(reportOutput, []byte(output), 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error writing report: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Report saved to %s\n", reportOutput)
	} else {
		fmt.Print(output)
	}
}

func collectReportData(instancePath string, schemasPath string) *ReportData {
	data := &ReportData{
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
	if schemasPath != "" {
		val, err := validator.NewValidator(schemasPath)
		if err == nil {
			summary := &SchemaValidationSummary{
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

				if reportVerbose || !result.Valid {
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
	if schemasPath != "" {
		taxonomyPath := filepath.Join(filepath.Dir(schemasPath), "schemas", "field-importance-taxonomy.json")
		if _, err := os.Stat(taxonomyPath); os.IsNotExist(err) {
			taxonomyPath = filepath.Join(schemasPath, "field-importance-taxonomy.json")
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
	if schemasPath != "" {
		versionChecker := checks.NewVersionAlignmentChecker(instancePath, schemasPath)
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
	generateRecommendations(data)

	return data
}

func generateRecommendations(data *ReportData) {
	// Instance structure recommendations
	if data.InstanceCheck != nil && data.InstanceCheck.HasErrors() {
		data.Recommendations = append(data.Recommendations, "Fix instance structure issues: ensure READY, FIRE, and AIM directories exist with required files")
	}

	// Schema validation recommendations
	if data.SchemaValidation != nil && data.SchemaValidation.InvalidFiles > 0 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Fix %d schema validation errors using 'epf-cli validate' to identify issues", data.SchemaValidation.InvalidFiles))
	}

	// Feature quality recommendations
	if data.FeatureQuality != nil && data.FeatureQuality.AverageScore < 70 {
		data.Recommendations = append(data.Recommendations, "Improve feature definitions: add detailed personas, scenarios, and narratives")
	}

	// Cross-reference recommendations
	if data.CrossReferences != nil && len(data.CrossReferences.BrokenLinks) > 0 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Fix %d broken cross-references in feature definitions", len(data.CrossReferences.BrokenLinks)))
	}

	// Content readiness recommendations
	if data.ContentReadiness != nil && data.ContentReadiness.Score < 70 {
		data.Recommendations = append(data.Recommendations, fmt.Sprintf("Replace %d placeholder patterns (TBD, TODO, etc.) with actual content", len(data.ContentReadiness.Placeholders)))
	}

	// Version alignment recommendations
	if data.VersionAlignment != nil && data.VersionAlignment.HasOutdatedArtifacts() {
		data.Recommendations = append(data.Recommendations, "Run 'epf-cli migrate' to update artifacts to the latest schema version")
	}
}

func generateJSONReport(data *ReportData) (string, error) {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func generateMarkdownReport(data *ReportData) (string, error) {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# %s\n\n", data.Title))
	sb.WriteString(fmt.Sprintf("**Instance:** `%s`\n", data.InstancePath))
	sb.WriteString(fmt.Sprintf("**Generated:** %s\n\n", data.GeneratedAt))

	// Overall Summary
	sb.WriteString("## Summary\n\n")
	sb.WriteString("| Metric | Value |\n")
	sb.WriteString("| ------ | ----- |\n")
	sb.WriteString(fmt.Sprintf("| **Overall Score** | %d/100 |\n", data.OverallScore))
	sb.WriteString(fmt.Sprintf("| **Status** | %s |\n", data.OverallStatus))
	sb.WriteString("\n")

	// Score Breakdown
	sb.WriteString("## Score Breakdown\n\n")
	sb.WriteString("| Check | Score | Status |\n")
	sb.WriteString("| ----- | ----- | ------ |\n")

	if data.InstanceCheck != nil {
		score := 0
		if data.InstanceCheck.TotalChecks > 0 {
			score = (data.InstanceCheck.Passed * 100) / data.InstanceCheck.TotalChecks
		}
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

	// Detailed Sections
	if data.InstanceCheck != nil && reportVerbose {
		sb.WriteString("## Instance Structure\n\n")
		sb.WriteString(fmt.Sprintf("- **Passed:** %d/%d checks\n", data.InstanceCheck.Passed, data.InstanceCheck.TotalChecks))
		if data.InstanceCheck.HasErrors() {
			sb.WriteString("\n**Issues:**\n")
			for _, r := range data.InstanceCheck.Results {
				if !r.Passed {
					sb.WriteString(fmt.Sprintf("- [%s] %s: %s\n", r.Severity, r.Check, r.Message))
				}
			}
		}
		sb.WriteString("\n")
	}

	if data.SchemaValidation != nil && data.SchemaValidation.InvalidFiles > 0 {
		sb.WriteString("## Schema Validation Issues\n\n")
		sb.WriteString(fmt.Sprintf("- **Valid:** %d/%d files\n", data.SchemaValidation.ValidFiles, data.SchemaValidation.TotalFiles))
		sb.WriteString(fmt.Sprintf("- **Invalid:** %d files\n\n", data.SchemaValidation.InvalidFiles))

		if len(data.SchemaValidation.Results) > 0 {
			for _, r := range data.SchemaValidation.Results {
				if !r.Valid {
					sb.WriteString(fmt.Sprintf("### %s\n\n", filepath.Base(r.FilePath)))
					for i, e := range r.Errors {
						if i >= 5 {
							sb.WriteString(fmt.Sprintf("- ... and %d more errors\n", len(r.Errors)-5))
							break
						}
						sb.WriteString(fmt.Sprintf("- %s\n", e.Message))
					}
					sb.WriteString("\n")
				}
			}
		}
	}

	if data.ContentReadiness != nil && len(data.ContentReadiness.Placeholders) > 0 {
		sb.WriteString("## Placeholder Content\n\n")
		sb.WriteString(fmt.Sprintf("Found %d placeholder patterns:\n\n", len(data.ContentReadiness.Placeholders)))

		shown := 0
		for _, p := range data.ContentReadiness.Placeholders {
			if shown >= 10 {
				sb.WriteString(fmt.Sprintf("\n... and %d more\n", len(data.ContentReadiness.Placeholders)-10))
				break
			}
			sb.WriteString(fmt.Sprintf("- `%s:%d` - %s\n", filepath.Base(p.File), p.Line, p.Content))
			shown++
		}
		sb.WriteString("\n")
	}

	// Recommendations
	if len(data.Recommendations) > 0 {
		sb.WriteString("## Recommendations\n\n")
		for i, rec := range data.Recommendations {
			sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, rec))
		}
		sb.WriteString("\n")
	}

	// Footer
	sb.WriteString("---\n\n")
	sb.WriteString("*Generated by epf-cli v0.9.0*\n")

	return sb.String(), nil
}

func generateHTMLReport(data *ReportData) (string, error) {
	tmpl := `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Title}}</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            background: #f5f5f5;
            color: #333;
        }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 0.5rem; }
        h2 { color: #34495e; margin-top: 2rem; }
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 1.5rem;
        }
        .score-large {
            font-size: 3rem;
            font-weight: bold;
            text-align: center;
        }
        .status-excellent { color: #27ae60; }
        .status-good { color: #2ecc71; }
        .status-fair { color: #f39c12; }
        .status-attention { color: #e67e22; }
        .status-critical { color: #e74c3c; }
        .score-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        .score-item {
            background: white;
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .score-item h3 { margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #7f8c8d; }
        .score-item .score { font-size: 1.5rem; font-weight: bold; }
        .progress-bar {
            background: #ecf0f1;
            border-radius: 4px;
            height: 8px;
            margin-top: 0.5rem;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        .recommendations { 
            background: #fff9c4;
            border-left: 4px solid #f1c40f;
            padding: 1rem;
            margin-top: 1.5rem;
        }
        .recommendations h3 { margin-top: 0; }
        .recommendations ol { margin-bottom: 0; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ecf0f1; }
        th { background: #34495e; color: white; }
        tr:hover { background: #f8f9fa; }
        .meta { color: #7f8c8d; font-size: 0.9rem; }
        .badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        .badge-pass { background: #27ae60; color: white; }
        .badge-warn { background: #f39c12; color: white; }
        .badge-fail { background: #e74c3c; color: white; }
        footer { margin-top: 3rem; text-align: center; color: #95a5a6; font-size: 0.85rem; }
    </style>
</head>
<body>
    <h1>{{.Title}}</h1>
    <p class="meta">
        <strong>Instance:</strong> <code>{{.InstancePath}}</code><br>
        <strong>Generated:</strong> {{.GeneratedAt}}
    </p>

    <div class="summary-card">
        <div class="score-large {{getStatusClass .OverallStatus}}">{{.OverallScore}}/100</div>
        <div style="text-align: center; font-size: 1.2rem; margin-top: 0.5rem;">{{.OverallStatus}}</div>
    </div>

    <h2>Score Breakdown</h2>
    <div class="score-grid">
        {{if .InstanceCheck}}
        <div class="score-item">
            <h3>Instance Structure</h3>
            <div class="score">{{instanceScore .InstanceCheck}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{instanceScore .InstanceCheck}}%; background: {{getColor (instanceScore .InstanceCheck)}};"></div>
            </div>
        </div>
        {{end}}
        {{if .SchemaValidation}}
        <div class="score-item">
            <h3>Schema Validation</h3>
            <div class="score">{{schemaScore .SchemaValidation}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{schemaScore .SchemaValidation}}%; background: {{getColor (schemaScore .SchemaValidation)}};"></div>
            </div>
        </div>
        {{end}}
        {{if .FeatureQuality}}
        <div class="score-item">
            <h3>Feature Quality</h3>
            <div class="score">{{printf "%.0f" .FeatureQuality.AverageScore}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{printf "%.0f" .FeatureQuality.AverageScore}}%; background: {{getColor (int .FeatureQuality.AverageScore)}};"></div>
            </div>
        </div>
        {{end}}
        {{if .ContentReadiness}}
        <div class="score-item">
            <h3>Content Readiness</h3>
            <div class="score">{{.ContentReadiness.Score}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{.ContentReadiness.Score}}%; background: {{getColor .ContentReadiness.Score}};"></div>
            </div>
        </div>
        {{end}}
        {{if .FieldCoverage}}
        <div class="score-item">
            <h3>Field Coverage</h3>
            <div class="score">{{.FieldCoverage.HealthScore}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{.FieldCoverage.HealthScore}}%; background: {{getColor .FieldCoverage.HealthScore}};"></div>
            </div>
        </div>
        {{end}}
        {{if .VersionAlignment}}
        <div class="score-item">
            <h3>Version Alignment</h3>
            <div class="score">{{.VersionAlignment.AlignmentPercentage}}%</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{.VersionAlignment.AlignmentPercentage}}%; background: {{getColor .VersionAlignment.AlignmentPercentage}};"></div>
            </div>
        </div>
        {{end}}
    </div>

    {{if .Recommendations}}
    <div class="recommendations">
        <h3>📋 Recommendations</h3>
        <ol>
        {{range .Recommendations}}
            <li>{{.}}</li>
        {{end}}
        </ol>
    </div>
    {{end}}

    <footer>
        Generated by epf-cli v0.9.0
    </footer>
</body>
</html>`

	funcMap := template.FuncMap{
		"getStatusClass": func(status string) string {
			switch status {
			case "EXCELLENT":
				return "status-excellent"
			case "GOOD":
				return "status-good"
			case "FAIR":
				return "status-fair"
			case "NEEDS ATTENTION":
				return "status-attention"
			default:
				return "status-critical"
			}
		},
		"getColor": func(score int) string {
			if score >= 80 {
				return "#27ae60"
			} else if score >= 60 {
				return "#f39c12"
			} else {
				return "#e74c3c"
			}
		},
		"instanceScore": func(check *checks.CheckSummary) int {
			if check.TotalChecks == 0 {
				return 0
			}
			return (check.Passed * 100) / check.TotalChecks
		},
		"schemaScore": func(summary *SchemaValidationSummary) int {
			if summary.TotalFiles == 0 {
				return 0
			}
			return (summary.ValidFiles * 100) / summary.TotalFiles
		},
		"int": func(f float64) int {
			return int(f)
		},
	}

	t, err := template.New("report").Funcs(funcMap).Parse(tmpl)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	err = t.Execute(&sb, data)
	if err != nil {
		return "", err
	}

	return sb.String(), nil
}

func getStatusEmoji(score int) string {
	if score >= 80 {
		return "✅"
	} else if score >= 60 {
		return "⚠️"
	} else {
		return "❌"
	}
}
