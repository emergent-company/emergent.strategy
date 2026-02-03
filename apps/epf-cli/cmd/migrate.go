package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	migrateTargetVersion string
	migrateDryRun        bool
	migrateVerbose       bool
)

// migrateCmd represents the migrate command
var migrateCmd = &cobra.Command{
	Use:   "migrate [instance-path]",
	Short: "Migrate EPF artifacts to a newer version",
	Long: `Migrate EPF artifacts to a newer schema version.

This command helps upgrade EPF instances to newer schema versions by:
  - Updating meta.epf_version fields
  - Adding EPF version headers to files
  - Identifying fields that need manual attention
  - Generating a migration report

Examples:
  epf-cli migrate .                           # Migrate to latest version
  epf-cli migrate . --target 2.0.0            # Migrate to specific version
  epf-cli migrate ./READY --dry-run           # Preview migration
  epf-cli migrate . --verbose                 # Show detailed changes`,
	Args: cobra.MaximumNArgs(1),
	Run:  runMigrate,
}

func init() {
	rootCmd.AddCommand(migrateCmd)
	migrateCmd.Flags().StringVar(&migrateTargetVersion, "target", "1.9.6", "Target EPF version to migrate to")
	migrateCmd.Flags().BoolVar(&migrateDryRun, "dry-run", false, "Show what would be changed without making changes")
	migrateCmd.Flags().BoolVarP(&migrateVerbose, "verbose", "v", false, "Show detailed migration information")
}

// MigrationResult represents the result of migrating a file
type MigrationResult struct {
	File            string
	PreviousVersion string
	NewVersion      string
	Migrated        bool
	Changes         []string
	ManualActions   []string
	Error           error
}

// MigrationSummary summarizes all migrations
type MigrationSummary struct {
	TotalFiles    int
	MigratedFiles int
	UpToDateFiles int
	FailedFiles   int
	TargetVersion string
	Results       []*MigrationResult
	DryRun        bool
	ManualActions []string
}

// Version extraction regex
var versionRegex = regexp.MustCompile(`^#\s*EPF\s+v?(\d+\.\d+\.\d+)`)
var metaVersionRegex = regexp.MustCompile(`epf_version:\s*["']?(\d+\.\d+\.\d+)["']?`)

func runMigrate(cmd *cobra.Command, args []string) {
	targetPath, err := GetInstancePath(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Print instance name if auto-detected
	if len(args) == 0 && epfContext != nil && epfContext.InstancePath != "" {
		fmt.Printf("Using instance: %s\n\n", epfContext.CurrentInstance)
	}

	// Check if path exists
	info, err := os.Stat(targetPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	summary := &MigrationSummary{
		TargetVersion: migrateTargetVersion,
		DryRun:        migrateDryRun,
		ManualActions: make([]string, 0),
	}

	if info.IsDir() {
		// Walk directory
		err = filepath.Walk(targetPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				return nil
			}

			// Only process YAML files
			ext := strings.ToLower(filepath.Ext(path))
			if ext != ".yaml" && ext != ".yml" {
				return nil
			}

			result := migrateFile(path, migrateTargetVersion, migrateDryRun)
			summary.TotalFiles++
			summary.Results = append(summary.Results, result)

			if result.Error != nil {
				summary.FailedFiles++
			} else if result.Migrated {
				summary.MigratedFiles++
			} else {
				summary.UpToDateFiles++
			}

			// Collect manual actions
			summary.ManualActions = append(summary.ManualActions, result.ManualActions...)

			return nil
		})

		if err != nil {
			fmt.Fprintf(os.Stderr, "Error walking directory: %v\n", err)
			os.Exit(1)
		}
	} else {
		// Single file
		result := migrateFile(targetPath, migrateTargetVersion, migrateDryRun)
		summary.TotalFiles++
		summary.Results = append(summary.Results, result)

		if result.Error != nil {
			summary.FailedFiles++
		} else if result.Migrated {
			summary.MigratedFiles++
		} else {
			summary.UpToDateFiles++
		}

		summary.ManualActions = append(summary.ManualActions, result.ManualActions...)
	}

	// Print results
	printMigrationSummary(summary)
}

func migrateFile(path string, targetVersion string, dryRun bool) *MigrationResult {
	result := &MigrationResult{
		File:          path,
		NewVersion:    targetVersion,
		Changes:       make([]string, 0),
		ManualActions: make([]string, 0),
	}

	// Read file
	content, err := os.ReadFile(path)
	if err != nil {
		result.Error = err
		return result
	}

	original := string(content)
	fixed := original

	// Extract current version
	result.PreviousVersion = extractVersion(original)

	// Check if already at target version
	if result.PreviousVersion == targetVersion {
		return result // Already up to date
	}

	// Update EPF version header if present
	if versionRegex.MatchString(fixed) {
		fixed = versionRegex.ReplaceAllString(fixed, fmt.Sprintf("# EPF v%s", targetVersion))
		result.Changes = append(result.Changes, fmt.Sprintf("Updated header version: %s -> %s", result.PreviousVersion, targetVersion))
	}

	// Update meta.epf_version if present
	if metaVersionRegex.MatchString(fixed) {
		fixed = metaVersionRegex.ReplaceAllStringFunc(fixed, func(match string) string {
			return fmt.Sprintf("epf_version: \"%s\"", targetVersion)
		})
		result.Changes = append(result.Changes, fmt.Sprintf("Updated meta.epf_version: %s -> %s", result.PreviousVersion, targetVersion))
	}

	// Check for fields that might need manual attention based on version changes
	checkForManualActions(path, original, targetVersion, result)

	// Check if anything changed
	if fixed != original {
		result.Migrated = true

		if !dryRun {
			// Write migrated content
			err = os.WriteFile(path, []byte(fixed), 0644)
			if err != nil {
				result.Error = err
				return result
			}
		}
	}

	return result
}

func extractVersion(content string) string {
	// Try header version first
	matches := versionRegex.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	// Try meta.epf_version
	matches = metaVersionRegex.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1]
	}

	return "unknown"
}

// checkForManualActions identifies fields that may need manual review during migration
func checkForManualActions(path string, content string, targetVersion string, result *MigrationResult) {
	// Parse YAML
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &data); err != nil {
		return
	}

	baseName := filepath.Base(path)

	// Check for feature definitions
	if strings.HasPrefix(baseName, "fd-") || strings.Contains(path, "feature_definitions") {
		// Check for old persona format (string instead of object)
		if personas, ok := data["personas"].([]interface{}); ok {
			for i, p := range personas {
				if _, isString := p.(string); isString {
					result.ManualActions = append(result.ManualActions,
						fmt.Sprintf("%s: personas[%d] is a string, should be an object with role, description, goals, pain_points, etc.", path, i))
				}
			}
		}

		// Check for missing required fields in v2.0
		requiredV2Fields := []string{"key_interactions", "data_displayed"}
		if strings.Contains(path, "scenario") || strings.Contains(content, "scenarios:") {
			for _, field := range requiredV2Fields {
				if !strings.Contains(content, field+":") {
					result.ManualActions = append(result.ManualActions,
						fmt.Sprintf("%s: Consider adding '%s' field for v2.0 compliance", path, field))
				}
			}
		}
	}

	// Check for roadmap recipes
	if strings.Contains(baseName, "roadmap") || strings.Contains(path, "roadmap_recipe") {
		// Check for TRL fields
		trlFields := []string{"trl_start", "trl_target", "trl_progression", "technical_hypothesis"}
		for _, field := range trlFields {
			if !strings.Contains(content, field) {
				result.ManualActions = append(result.ManualActions,
					fmt.Sprintf("%s: Consider adding '%s' field for TRL tracking", path, field))
			}
		}
	}

	// Check for deprecated patterns
	deprecatedPatterns := map[string]string{
		"risk_score:":     "Use 'risk_level:' with values critical/high/medium/low instead",
		"priority_score:": "Use 'priority:' with values P0/P1/P2/P3 instead",
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		for pattern, suggestion := range deprecatedPatterns {
			if strings.Contains(line, pattern) {
				result.ManualActions = append(result.ManualActions,
					fmt.Sprintf("%s:%d: Deprecated '%s' - %s", path, lineNum, strings.TrimSuffix(pattern, ":"), suggestion))
			}
		}
	}
}

func printMigrationSummary(summary *MigrationSummary) {
	fmt.Printf("EPF Migration to v%s\n", summary.TargetVersion)
	fmt.Println(strings.Repeat("=", 40))

	if summary.DryRun {
		fmt.Println("DRY RUN - No changes were made")
		fmt.Println()
	}

	fmt.Printf("Files scanned:   %d\n", summary.TotalFiles)
	fmt.Printf("Already current: %d\n", summary.UpToDateFiles)

	if summary.MigratedFiles > 0 {
		action := "Migrated"
		if summary.DryRun {
			action = "Would migrate"
		}
		fmt.Printf("%s:        %d\n", action, summary.MigratedFiles)
	}

	if summary.FailedFiles > 0 {
		fmt.Printf("Failed:          %d\n", summary.FailedFiles)
	}

	fmt.Println()

	// Show migrated files
	if migrateVerbose || summary.DryRun {
		for _, result := range summary.Results {
			if !result.Migrated && result.Error == nil {
				continue
			}

			if result.Error != nil {
				fmt.Printf("❌ %s: %v\n", result.File, result.Error)
				continue
			}

			if result.Migrated {
				status := "→"
				if summary.DryRun {
					status = "?"
				}
				prevVersion := result.PreviousVersion
				if prevVersion == "" || prevVersion == "unknown" {
					prevVersion = "(none)"
				}
				fmt.Printf("%s %s: %s -> %s\n", status, result.File, prevVersion, result.NewVersion)
				for _, change := range result.Changes {
					fmt.Printf("    %s\n", change)
				}
			}
		}
	}

	// Show manual actions needed
	if len(summary.ManualActions) > 0 {
		fmt.Printf("\n⚠️  Manual Actions Required (%d):\n", len(summary.ManualActions))
		fmt.Println(strings.Repeat("-", 40))

		// Deduplicate and group by file
		seen := make(map[string]bool)
		for _, action := range summary.ManualActions {
			if !seen[action] {
				seen[action] = true
				fmt.Printf("  • %s\n", action)
			}
		}

		fmt.Println("\nThese items require manual review and cannot be auto-migrated.")
	}
}
