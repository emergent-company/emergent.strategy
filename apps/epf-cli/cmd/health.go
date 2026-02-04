package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/checks"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/migration"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
)

var (
	healthJSON    bool
	healthVerbose bool
)

var healthCmd = &cobra.Command{
	Use:   "health [instance-path]",
	Short: "Run comprehensive health check on an EPF instance",
	Long: `Run comprehensive health checks on an EPF instance, including:

  - Instance structure (READY/FIRE/AIM directories)
  - Required files in each phase
  - Schema validation for all artifacts
  - Feature quality (personas, narratives, scenarios)
  - Cross-reference validation (feature dependencies)
  - Relationships validation (contributes_to paths, KR targets)
  - Content readiness (placeholder detection)
  - Field coverage analysis (TRL, persona narratives)
  - Version alignment (artifact vs schema versions)

This is the master validation command equivalent to epf-health-check.sh.

Instance Detection:
  The CLI automatically detects the EPF context and finds instances:
  - In a product repo, it finds instances in docs/EPF/_instances/
  - If only one instance exists, it's used automatically
  - Use --instance to specify when multiple instances exist

Examples:
  epf-cli health                                      # Auto-detect instance
  epf-cli health --instance emergent                  # Specify instance by name
  epf-cli health docs/EPF/_instances/emergent/        # Specify instance by path
  epf-cli health --json                               # Output as JSON
  epf-cli health --verbose                            # Show detailed output`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		// Get instance path (auto-detected or from args)
		absPath, err := GetInstancePath(args)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Show context info if not JSON output
		if !healthJSON {
			ctx := GetContext()
			if ctx != nil && ctx.CurrentInstance != "" {
				fmt.Printf("Using instance: %s\n\n", ctx.CurrentInstance)
			}
		}

		// Get schemas directory
		schemasPath, err := GetSchemasDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Could not find schemas directory: %v\n", err)
			fmt.Fprintf(os.Stderr, "Skipping schema validation.\n\n")
			schemasPath = ""
		}

		// Run health check
		result := runHealthCheck(absPath, schemasPath)

		if healthJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
		} else {
			printHealthResult(result)
		}

		// Exit with appropriate code
		if result.HasCritical {
			os.Exit(1)
		} else if result.HasErrors {
			os.Exit(1)
		} else if result.HasWarnings {
			os.Exit(0) // Warnings don't fail
		}
	},
}

// HealthResult contains the full health check result
type HealthResult struct {
	InstancePath string `json:"instance_path"`

	// Summary
	OverallStatus string `json:"overall_status"` // healthy, warnings, errors, critical
	HasCritical   bool   `json:"has_critical"`
	HasErrors     bool   `json:"has_errors"`
	HasWarnings   bool   `json:"has_warnings"`

	// Three-tier scoring system
	Tiers *HealthTiers `json:"tiers"`

	// Individual check results
	InstanceCheck    *checks.CheckSummary           `json:"instance_check,omitempty"`
	SchemaValidation *SchemaValidationSummary       `json:"schema_validation,omitempty"`
	FeatureQuality   *checks.FeatureQualitySummary  `json:"feature_quality,omitempty"`
	CrossReferences  *checks.CrossReferenceResult   `json:"cross_references,omitempty"`
	Relationships    *checks.RelationshipsResult    `json:"relationships,omitempty"`
	ContentReadiness *checks.ContentReadinessResult `json:"content_readiness,omitempty"`
	FieldCoverage    *checks.FieldCoverageResult    `json:"field_coverage,omitempty"`
	VersionAlignment *checks.VersionAlignmentResult `json:"version_alignment,omitempty"`
	MigrationStatus  *migration.MigrationStatus     `json:"migration_status,omitempty"`
}

// HealthTiers provides a three-tier view of instance health
type HealthTiers struct {
	// Critical: Blocks work - missing structure, broken YAML, no content
	Critical TierScore `json:"critical"`

	// Schema: Files exist but have validation errors
	Schema TierScore `json:"schema"`

	// Quality: Content exists but could be improved
	Quality TierScore `json:"quality"`
}

// TierScore represents the score for a single tier
type TierScore struct {
	Score    int      `json:"score"`   // 0-100
	MaxScore int      `json:"max"`     // Maximum possible score
	Issues   int      `json:"issues"`  // Number of issues in this tier
	Summary  string   `json:"summary"` // Human-readable summary
	Details  []string `json:"details"` // Specific issues (for verbose output)
}

// SchemaValidationSummary summarizes schema validation results
type SchemaValidationSummary struct {
	TotalFiles   int                           `json:"total_files"`
	ValidFiles   int                           `json:"valid_files"`
	InvalidFiles int                           `json:"invalid_files"`
	SkippedFiles int                           `json:"skipped_files"`
	Results      []*validator.ValidationResult `json:"results,omitempty"`
}

func runHealthCheck(instancePath string, schemasPath string) *HealthResult {
	result := &HealthResult{
		InstancePath: instancePath,
	}

	if !healthJSON {
		fmt.Println("╔════════════════════════════════════════════════════════════╗")
		fmt.Println("║              EPF HEALTH CHECK                               ║")
		fmt.Printf("║  Instance: %-48s ║\n", truncateString(instancePath, 48))
		fmt.Println("╚════════════════════════════════════════════════════════════╝")
		fmt.Println()
	}

	// 1. Instance Structure Check
	if !healthJSON {
		fmt.Println("▶ Checking instance structure...")
	}
	instanceChecker := checks.NewInstanceChecker(instancePath)
	result.InstanceCheck = instanceChecker.Check()

	if result.InstanceCheck.HasCritical() {
		result.HasCritical = true
	}
	if result.InstanceCheck.HasErrors() {
		result.HasErrors = true
	}
	if result.InstanceCheck.Warnings > 0 {
		result.HasWarnings = true
	}

	if !healthJSON {
		printCheckSummary("Instance Structure", result.InstanceCheck)
	}

	// 2. Schema Validation (if schemas available)
	if schemasPath != "" {
		if !healthJSON {
			fmt.Println("▶ Validating against schemas...")
		}
		result.SchemaValidation = runSchemaValidation(instancePath, schemasPath)

		if result.SchemaValidation.InvalidFiles > 0 {
			result.HasErrors = true
		}

		if !healthJSON {
			printSchemaValidationSummary(result.SchemaValidation)
		}
	}

	// 3. Feature Quality Check
	firePath := filepath.Join(instancePath, "FIRE", "feature_definitions")
	if _, err := os.Stat(firePath); err == nil {
		if !healthJSON {
			fmt.Println("▶ Checking feature quality...")
		}
		featureChecker := checks.NewFeatureQualityChecker(firePath)
		featureResult, err := featureChecker.Check()
		if err == nil {
			result.FeatureQuality = featureResult
			if featureResult.FailedCount > 0 {
				result.HasWarnings = true // Feature quality issues are warnings
			}
		}

		if !healthJSON && featureResult != nil {
			printFeatureQualitySummary(featureResult)
		}
	}

	// 4. Cross-Reference Check
	if _, err := os.Stat(firePath); err == nil {
		if !healthJSON {
			fmt.Println("▶ Checking cross-references...")
		}
		crossRefChecker := checks.NewCrossReferenceChecker(firePath)
		crossRefResult, err := crossRefChecker.Check()
		if err == nil {
			result.CrossReferences = crossRefResult
			if len(crossRefResult.BrokenLinks) > 0 {
				result.HasErrors = true
			}
		}

		if !healthJSON && crossRefResult != nil {
			printCrossReferenceSummary(crossRefResult)
		}
	}

	// 5. Relationships Check (contributes_to paths, KR targets, coverage)
	if !healthJSON {
		fmt.Println("▶ Checking relationships...")
	}
	relationshipsChecker := checks.NewRelationshipsChecker(instancePath)
	relationshipsResult, err := relationshipsChecker.Check()
	if err == nil && relationshipsResult != nil {
		result.Relationships = relationshipsResult
		if relationshipsResult.HasErrors() {
			result.HasErrors = true
		}
		if relationshipsResult.HasWarnings() {
			result.HasWarnings = true
		}
	}

	if !healthJSON && relationshipsResult != nil {
		printRelationshipsSummary(relationshipsResult)
	}

	// 6. Content Readiness Check
	if !healthJSON {
		fmt.Println("▶ Checking content readiness...")
	}
	contentChecker := checks.NewContentReadinessChecker(instancePath)
	contentResult, err := contentChecker.Check()
	if err == nil {
		result.ContentReadiness = contentResult
		if contentResult.Score < 70 {
			result.HasWarnings = true
		}
	}

	if !healthJSON && contentResult != nil {
		printContentReadinessSummary(contentResult)
	}

	// 7. Field Coverage Analysis
	if schemasPath != "" {
		if !healthJSON {
			fmt.Println("▶ Checking field coverage...")
		}
		taxonomyPath := filepath.Join(filepath.Dir(schemasPath), "schemas", "field-importance-taxonomy.json")
		if _, err := os.Stat(taxonomyPath); os.IsNotExist(err) {
			// Try alternate path
			taxonomyPath = filepath.Join(schemasPath, "field-importance-taxonomy.json")
		}
		coverageChecker := checks.NewFieldCoverageChecker(instancePath, taxonomyPath)
		coverageResult, err := coverageChecker.Check()
		if err == nil {
			result.FieldCoverage = coverageResult
			if coverageResult.HasCriticalGaps() {
				result.HasWarnings = true
			}
		}

		if !healthJSON && coverageResult != nil {
			printFieldCoverageSummary(coverageResult)
		}
	}

	// 8. Version Alignment Check
	if schemasPath != "" {
		if !healthJSON {
			fmt.Println("▶ Checking version alignment...")
		}
		versionChecker := checks.NewVersionAlignmentChecker(instancePath, schemasPath)
		versionResult, err := versionChecker.Check()
		if err == nil {
			result.VersionAlignment = versionResult
			if versionResult.HasOutdatedArtifacts() {
				result.HasWarnings = true
			}
		}

		if !healthJSON && versionResult != nil {
			printVersionAlignmentSummary(versionResult)
		}
	}

	// 9. Migration Status Check
	if schemasPath != "" {
		if !healthJSON {
			fmt.Println("▶ Checking migration status...")
		}
		migrationDetector, err := migration.NewDetector(schemasPath)
		if err == nil {
			migrationStatus, err := migrationDetector.DetectMigrationStatus(instancePath)
			if err == nil {
				result.MigrationStatus = migrationStatus
				if migrationStatus.NeedsMigration {
					result.HasWarnings = true
				}
			}
		}

		if !healthJSON && result.MigrationStatus != nil {
			printMigrationStatusSummary(result.MigrationStatus)
		}
	}

	// Determine overall status
	if result.HasCritical {
		result.OverallStatus = "critical"
	} else if result.HasErrors {
		result.OverallStatus = "errors"
	} else if result.HasWarnings {
		result.OverallStatus = "warnings"
	} else {
		result.OverallStatus = "healthy"
	}

	// Calculate three-tier scores
	result.Tiers = calculateTiers(result)

	return result
}

// calculateTiers computes the three-tier health scores
func calculateTiers(result *HealthResult) *HealthTiers {
	tiers := &HealthTiers{
		Critical: TierScore{MaxScore: 100, Details: []string{}},
		Schema:   TierScore{MaxScore: 100, Details: []string{}},
		Quality:  TierScore{MaxScore: 100, Details: []string{}},
	}

	// CRITICAL TIER: Instance structure, broken YAML, missing required content
	criticalIssues := 0
	if result.InstanceCheck != nil {
		criticalIssues += result.InstanceCheck.Critical
		// Add critical issues to details
		for _, r := range result.InstanceCheck.Results {
			if r.Severity == checks.SeverityCritical && !r.Passed {
				tiers.Critical.Details = append(tiers.Critical.Details, r.Message)
			}
		}
	}
	// Schema validation errors where files can't be parsed count as critical
	if result.SchemaValidation != nil {
		for _, r := range result.SchemaValidation.Results {
			if !r.Valid {
				for _, e := range r.Errors {
					if strings.Contains(e.Message, "Invalid YAML") || strings.Contains(e.Message, "cannot read") {
						criticalIssues++
						tiers.Critical.Details = append(tiers.Critical.Details,
							fmt.Sprintf("%s: %s", filepath.Base(r.FilePath), e.Message))
					}
				}
			}
		}
	}
	// Missing feature definitions entirely
	if result.FeatureQuality != nil && result.FeatureQuality.TotalFeatures == 0 {
		criticalIssues++
		tiers.Critical.Details = append(tiers.Critical.Details, "No feature definitions found")
	}

	tiers.Critical.Issues = criticalIssues
	if criticalIssues == 0 {
		tiers.Critical.Score = 100
		tiers.Critical.Summary = "All essential structure in place"
	} else {
		tiers.Critical.Score = max(0, 100-(criticalIssues*25))
		tiers.Critical.Summary = fmt.Sprintf("%d critical issues blocking work", criticalIssues)
	}

	// SCHEMA TIER: Schema validation errors (additionalProperties, pattern mismatches)
	schemaIssues := 0
	if result.SchemaValidation != nil {
		schemaIssues = result.SchemaValidation.InvalidFiles
		for _, r := range result.SchemaValidation.Results {
			if !r.Valid {
				// Add first error for each file
				if len(r.Errors) > 0 {
					msg := r.Errors[0].Message
					if len(msg) > 60 {
						msg = msg[:60] + "..."
					}
					tiers.Schema.Details = append(tiers.Schema.Details,
						fmt.Sprintf("%s: %s", filepath.Base(r.FilePath), msg))
				}
			}
		}
	}
	// Cross-reference errors are schema-level
	if result.CrossReferences != nil {
		schemaIssues += len(result.CrossReferences.BrokenLinks)
		for _, link := range result.CrossReferences.BrokenLinks {
			tiers.Schema.Details = append(tiers.Schema.Details,
				fmt.Sprintf("Broken reference: %s -> %s", link.SourceFeatureID, link.TargetID))
		}
	}
	// Invalid relationship paths are schema-level (wrong contributes_to or value_model_target)
	if result.Relationships != nil && result.Relationships.InvalidPaths > 0 {
		schemaIssues += result.Relationships.InvalidPaths
		for _, err := range result.Relationships.Errors {
			msg := fmt.Sprintf("Invalid path %s: %s", err.InvalidPath, err.Message)
			if len(msg) > 70 {
				msg = msg[:70] + "..."
			}
			tiers.Schema.Details = append(tiers.Schema.Details, msg)
		}
	}

	tiers.Schema.Issues = schemaIssues
	if schemaIssues == 0 {
		tiers.Schema.Score = 100
		tiers.Schema.Summary = "All files pass schema validation"
	} else {
		// Deduct 5 points per schema issue, minimum 20
		tiers.Schema.Score = max(20, 100-(schemaIssues*5))
		tiers.Schema.Summary = fmt.Sprintf("%d schema validation issues", schemaIssues)
	}

	// QUALITY TIER: Feature quality, content readiness, field coverage, relationship coverage
	qualityDeductions := 0
	qualityIssueCount := 0

	if result.FeatureQuality != nil {
		// Features with quality issues
		for _, r := range result.FeatureQuality.Results {
			if !r.Passed {
				qualityIssueCount++
				// Count warnings - they affect quality but aren't blockers
				warningCount := 0
				for _, issue := range r.Issues {
					if issue.Severity == checks.SeverityWarning {
						warningCount++
					}
				}
				if warningCount > 0 {
					tiers.Quality.Details = append(tiers.Quality.Details,
						fmt.Sprintf("%s: %d quality improvements suggested", filepath.Base(r.File), warningCount))
				}
			}
		}
		// Deduct based on average score
		if result.FeatureQuality.TotalFeatures > 0 {
			qualityDeductions += int(100 - result.FeatureQuality.AverageScore)
		}
	}

	if result.ContentReadiness != nil {
		if result.ContentReadiness.Score < 100 {
			qualityDeductions += (100 - result.ContentReadiness.Score) / 2 // Weight at 50%
			if len(result.ContentReadiness.Placeholders) > 0 {
				tiers.Quality.Details = append(tiers.Quality.Details,
					fmt.Sprintf("%d placeholder patterns detected", len(result.ContentReadiness.Placeholders)))
			}
		}
	}

	if result.FieldCoverage != nil {
		if result.FieldCoverage.HealthScore < 100 {
			qualityDeductions += (100 - result.FieldCoverage.HealthScore) / 2 // Weight at 50%
			if result.FieldCoverage.HasCriticalGaps() {
				tiers.Quality.Details = append(tiers.Quality.Details,
					fmt.Sprintf("%d files missing critical TRL fields", len(result.FieldCoverage.CriticalGaps)))
			}
		}
	}

	tiers.Quality.Issues = qualityIssueCount
	// Normalize quality score
	tiers.Quality.Score = max(0, 100-(qualityDeductions/3))
	if tiers.Quality.Score >= 90 {
		tiers.Quality.Summary = "High content quality"
	} else if tiers.Quality.Score >= 70 {
		tiers.Quality.Summary = "Good content quality with room for improvement"
	} else if tiers.Quality.Score >= 50 {
		tiers.Quality.Summary = "Content needs attention"
	} else {
		tiers.Quality.Summary = "Significant content quality issues"
	}

	return tiers
}

func runSchemaValidation(instancePath string, schemasPath string) *SchemaValidationSummary {
	summary := &SchemaValidationSummary{
		Results: make([]*validator.ValidationResult, 0),
	}

	val, err := validator.NewValidator(schemasPath)
	if err != nil {
		return summary
	}

	// Walk and validate all YAML files
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

		if healthVerbose || !result.Valid {
			summary.Results = append(summary.Results, result)
		}

		return nil
	})

	return summary
}

func printHealthResult(result *HealthResult) {
	fmt.Println()
	fmt.Println("════════════════════════════════════════════════════════════")

	var statusIcon string
	switch result.OverallStatus {
	case "healthy":
		statusIcon = "✅"
	case "warnings":
		statusIcon = "⚠️"
	case "errors":
		statusIcon = "❌"
	case "critical":
		statusIcon = "🚨"
	}

	fmt.Printf("  %s Overall Status: %s\n", statusIcon, strings.ToUpper(result.OverallStatus))
	fmt.Println("════════════════════════════════════════════════════════════")

	// Print tiered summary
	if result.Tiers != nil {
		fmt.Println()
		fmt.Println("  Health Tiers:")
		fmt.Println("  ─────────────")

		// Critical tier
		critIcon := tierIcon(result.Tiers.Critical.Score)
		fmt.Printf("  %s Critical:  %3d/100  %s\n",
			critIcon, result.Tiers.Critical.Score, result.Tiers.Critical.Summary)
		if healthVerbose && len(result.Tiers.Critical.Details) > 0 {
			for _, d := range result.Tiers.Critical.Details {
				fmt.Printf("       └─ %s\n", d)
			}
		}

		// Schema tier
		schemaIcon := tierIcon(result.Tiers.Schema.Score)
		fmt.Printf("  %s Schema:    %3d/100  %s\n",
			schemaIcon, result.Tiers.Schema.Score, result.Tiers.Schema.Summary)
		if healthVerbose && len(result.Tiers.Schema.Details) > 0 {
			shown := 0
			for _, d := range result.Tiers.Schema.Details {
				if shown >= 5 {
					fmt.Printf("       └─ ... and %d more\n", len(result.Tiers.Schema.Details)-5)
					break
				}
				fmt.Printf("       └─ %s\n", d)
				shown++
			}
		}

		// Quality tier
		qualityIcon := tierIcon(result.Tiers.Quality.Score)
		fmt.Printf("  %s Quality:   %3d/100  %s\n",
			qualityIcon, result.Tiers.Quality.Score, result.Tiers.Quality.Summary)
		if healthVerbose && len(result.Tiers.Quality.Details) > 0 {
			for _, d := range result.Tiers.Quality.Details {
				fmt.Printf("       └─ %s\n", d)
			}
		}

		fmt.Println()
	}
}

// tierIcon returns an appropriate icon for a tier score
func tierIcon(score int) string {
	if score >= 90 {
		return "✅"
	} else if score >= 70 {
		return "⚠️"
	} else if score >= 50 {
		return "🔶"
	}
	return "❌"
}

func printCheckSummary(name string, summary *checks.CheckSummary) {
	icon := "✅"
	if summary.HasCritical() {
		icon = "🚨"
	} else if summary.HasErrors() {
		icon = "❌"
	} else if summary.Warnings > 0 {
		icon = "⚠️"
	}

	fmt.Printf("  %s %s: %d/%d checks passed", icon, name, summary.Passed, summary.TotalChecks)

	if summary.Critical > 0 {
		fmt.Printf(" (%d critical)", summary.Critical)
	}
	if summary.Errors > 0 {
		fmt.Printf(" (%d errors)", summary.Errors)
	}
	if summary.Warnings > 0 {
		fmt.Printf(" (%d warnings)", summary.Warnings)
	}
	fmt.Println()

	if healthVerbose {
		for _, r := range summary.Results {
			if !r.Passed {
				fmt.Printf("    • %s: %s\n", r.Check, r.Message)
				for _, d := range r.Details {
					fmt.Printf("      - %s\n", d)
				}
			}
		}
	}
}

func printSchemaValidationSummary(summary *SchemaValidationSummary) {
	icon := "✅"
	if summary.InvalidFiles > 0 {
		icon = "❌"
	}

	fmt.Printf("  %s Schema Validation: %d/%d files valid", icon, summary.ValidFiles, summary.TotalFiles)
	if summary.SkippedFiles > 0 {
		fmt.Printf(" (%d skipped)", summary.SkippedFiles)
	}
	fmt.Println()

	if healthVerbose || summary.InvalidFiles > 0 {
		for _, r := range summary.Results {
			if !r.Valid {
				fmt.Printf("    • %s\n", r.FilePath)
				for _, e := range r.Errors {
					if len(e.Message) > 80 {
						fmt.Printf("      - %s...\n", e.Message[:80])
					} else {
						fmt.Printf("      - %s\n", e.Message)
					}
				}
			}
		}
	}
}

func printFeatureQualitySummary(summary *checks.FeatureQualitySummary) {
	icon := "✅"
	if summary.FailedCount > 0 {
		icon = "⚠️"
	}

	fmt.Printf("  %s Feature Quality: %d/%d features pass (avg score: %.0f)\n",
		icon, summary.PassedCount, summary.TotalFeatures, summary.AverageScore)

	if healthVerbose {
		for _, r := range summary.Results {
			if !r.Passed {
				fmt.Printf("    • %s (score: %d)\n", filepath.Base(r.File), r.Score)
				for _, issue := range r.Issues {
					fmt.Printf("      - [%s] %s: %s\n", issue.Severity, issue.Field, issue.Message)
				}
			}
		}
	}
}

func printCrossReferenceSummary(result *checks.CrossReferenceResult) {
	icon := "✅"
	if len(result.BrokenLinks) > 0 {
		icon = "❌"
	}

	fmt.Printf("  %s Cross-References: %d/%d references valid\n",
		icon, result.ValidReferences, result.TotalReferences)

	if len(result.BrokenLinks) > 0 {
		for _, link := range result.BrokenLinks {
			fmt.Printf("    • %s -> %s (missing)\n", link.SourceFeatureID, link.TargetID)
		}
	}
}

func printRelationshipsSummary(result *checks.RelationshipsResult) {
	icon := "✅"
	if result.HasErrors() {
		icon = "❌"
	} else if result.HasWarnings() {
		icon = "⚠️"
	}

	fmt.Printf("  %s Relationships: %d/%d paths valid (Score: %d/100, Grade: %s)\n",
		icon, result.ValidPaths, result.TotalPathsChecked, result.Score, result.Grade)

	// Show coverage info
	if result.TotalPathsChecked > 0 {
		fmt.Printf("    • Coverage: %.0f%% of value model\n", result.CoveragePercent)
	}

	// Show issues
	if result.InvalidPaths > 0 {
		fmt.Printf("    • %d invalid contributes_to/target paths\n", result.InvalidPaths)
	}
	if result.OrphanFeatures > 0 {
		fmt.Printf("    • %d orphan features (no contributes_to)\n", result.OrphanFeatures)
	}
	if result.StrategicGaps > 0 {
		fmt.Printf("    • %d strategic gaps (KR targets without features)\n", result.StrategicGaps)
	}

	// Show detailed errors in verbose mode
	if healthVerbose && len(result.Errors) > 0 {
		fmt.Println("    Errors:")
		for i, err := range result.Errors {
			if i >= 5 {
				fmt.Printf("      ... and %d more errors\n", len(result.Errors)-5)
				break
			}
			fmt.Printf("      - %s.%s: %s\n", err.Source, err.Field, err.Message)
			if err.DidYouMean != "" {
				fmt.Printf("        Did you mean: %s?\n", err.DidYouMean)
			}
		}
	}

	// Show actionable suggestions (always shown if present, limited to top 5)
	if len(result.Suggestions) > 0 {
		fmt.Println("    💡 Suggested improvements:")
		shown := 0
		for _, suggestion := range result.Suggestions {
			if shown >= 5 {
				remaining := len(result.Suggestions) - shown
				if remaining > 0 {
					fmt.Printf("      ... and %d more suggestions (use --json for full list)\n", remaining)
				}
				break
			}

			// Priority indicator
			priorityIcon := "→"
			if suggestion.Priority == "high" {
				priorityIcon = "🔴"
			} else if suggestion.Priority == "medium" {
				priorityIcon = "🟡"
			} else {
				priorityIcon = "🟢"
			}

			fmt.Printf("      %s %s\n", priorityIcon, suggestion.Message)

			// Show action in verbose mode
			if healthVerbose && suggestion.Action != "" {
				fmt.Printf("        Action: %s\n", suggestion.Action)
			}

			// Show MCP tool hint in verbose mode
			if healthVerbose && suggestion.MCPTool != "" {
				fmt.Printf("        Tool: %s\n", suggestion.MCPTool)
			}

			shown++
		}
	}
}

func printContentReadinessSummary(result *checks.ContentReadinessResult) {
	icon := "✅"
	if result.Score < 70 {
		icon = "⚠️"
	}
	if result.Score < 50 {
		icon = "❌"
	}

	fmt.Printf("  %s Content Readiness: Score %d/100 (Grade: %s)\n",
		icon, result.Score, result.Grade)

	if len(result.Placeholders) > 0 {
		fmt.Printf("    • %d placeholder patterns found\n", len(result.Placeholders))
		if healthVerbose {
			shown := 0
			for _, p := range result.Placeholders {
				if shown >= 5 {
					fmt.Printf("    • ... and %d more\n", len(result.Placeholders)-5)
					break
				}
				fmt.Printf("      - %s:%d: %s\n", filepath.Base(p.File), p.Line, truncateString(p.Content, 50))
				shown++
			}
		}
	}
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func printFieldCoverageSummary(result *checks.FieldCoverageResult) {
	icon := "✅"
	if result.HasCriticalGaps() {
		icon = "⚠️"
	}

	fmt.Printf("  %s Field Coverage: Score %d/100 (Grade: %s)\n",
		icon, result.HealthScore, result.Grade)

	if result.HasCriticalGaps() {
		fmt.Printf("    • %d artifact(s) missing critical TRL fields\n", len(result.CriticalGaps))
		if healthVerbose {
			for _, gap := range result.CriticalGaps {
				fmt.Printf("      - %s: missing %v\n", filepath.Base(gap.File), gap.MissingFields)
			}
		}
	}

	if result.HasHighGaps() {
		fmt.Printf("    • %d artifact(s) missing high-value fields\n", len(result.HighGaps))
		if healthVerbose {
			for _, gap := range result.HighGaps {
				fmt.Printf("      - %s: missing %v\n", filepath.Base(gap.File), gap.MissingFields)
			}
		}
	}

	if len(result.Recommendations) > 0 && healthVerbose {
		fmt.Println("    Recommendations:")
		for _, rec := range result.Recommendations {
			fmt.Printf("      - %s\n", rec)
		}
	}
}

func printVersionAlignmentSummary(result *checks.VersionAlignmentResult) {
	icon := "✅"
	if result.HasOutdatedArtifacts() {
		icon = "❌"
	} else if result.HasStaleArtifacts() {
		icon = "⚠️"
	}

	if result.ArtifactsWithVersions > 0 {
		fmt.Printf("  %s Version Alignment: %d%% (%d/%d current)\n",
			icon, result.AlignmentPercentage, result.CurrentArtifacts, result.ArtifactsWithVersions)
	} else {
		fmt.Printf("  %s Version Alignment: No version info found\n", icon)
	}

	if result.OutdatedArtifacts > 0 {
		fmt.Printf("    • %d artifact(s) are major versions behind (migration needed)\n", result.OutdatedArtifacts)
	}

	if result.StaleArtifacts > 0 {
		fmt.Printf("    • %d artifact(s) are 3+ minor versions behind\n", result.StaleArtifacts)
	}

	if healthVerbose && len(result.Results) > 0 {
		for _, r := range result.Results {
			if r.Status == checks.VersionOutdated || r.Status == checks.VersionStale {
				fmt.Printf("      - %s: v%s → v%s (%s)\n",
					filepath.Base(r.File), r.ArtifactVersion, r.SchemaVersion, r.Status)
			}
		}
	}
}

func printMigrationStatusSummary(status *migration.MigrationStatus) {
	icon := "✅"
	if status.NeedsMigration {
		icon = "⚠️"
	}

	if status.NeedsMigration {
		versionInfo := ""
		if status.CurrentVersion != "" && status.CurrentVersion != "unknown" {
			versionInfo = fmt.Sprintf(" (%s → %s)", status.CurrentVersion, status.TargetVersion)
		} else {
			versionInfo = fmt.Sprintf(" (target: %s)", status.TargetVersion)
		}
		fmt.Printf("  %s Migration Status: %d/%d files need migration%s\n",
			icon, status.FilesNeedingFix, status.TotalFiles, versionInfo)
		fmt.Printf("    • Run `epf-cli migrate check` for detailed migration guide\n")
	} else {
		fmt.Printf("  %s Migration Status: All %d files up to date (v%s)\n",
			icon, status.TotalFiles, status.TargetVersion)
	}

	if healthVerbose && status.NeedsMigration {
		shown := 0
		for _, f := range status.Files {
			if !f.NeedsMigration {
				continue
			}
			if shown >= 5 {
				fmt.Printf("      ... and %d more files\n", status.FilesNeedingFix-5)
				break
			}
			reason := f.Reason
			if reason == "" && len(f.ValidationErrors) > 0 {
				reason = f.ValidationErrors[0]
			}
			if len(reason) > 50 {
				reason = reason[:50] + "..."
			}
			fmt.Printf("      - %s: %s\n", filepath.Base(f.Path), reason)
			shown++
		}
	}
}

func init() {
	rootCmd.AddCommand(healthCmd)
	healthCmd.Flags().BoolVar(&healthJSON, "json", false, "output as JSON")
	healthCmd.Flags().BoolVarP(&healthVerbose, "verbose", "v", false, "show detailed output")
}
