package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	fixDryRun      bool
	fixVerbose     bool
	fixWhitespace  bool
	fixLineEndings bool
	fixTabs        bool
	fixNewlines    bool
	fixVersions    bool
	fixAll         bool
)

// FixOptions controls which fixes to apply
type FixOptions struct {
	Whitespace  bool
	LineEndings bool
	Tabs        bool
	Newlines    bool
	Versions    bool
}

// fixCmd represents the fix command
var fixCmd = &cobra.Command{
	Use:   "fix [instance-path]",
	Short: "Auto-fix common EPF issues",
	Long: `Auto-fix common issues in EPF artifacts.

This command can automatically fix:
  - Trailing whitespace in YAML files (--whitespace)
  - Missing newlines at end of files (--newlines)
  - Convert tabs to spaces (--tabs)
  - Normalize line endings CRLF -> LF (--line-endings)
  - Add missing meta.epf_version fields (--versions)

By default, all fixes are applied. Use individual flags to apply specific fixes only.

Use --dry-run to see what would be changed without making changes.

Examples:
  epf-cli fix .                          # Fix all issues in current directory
  epf-cli fix ./READY --dry-run          # Preview fixes for READY phase
  epf-cli fix . --whitespace             # Only fix trailing whitespace
  epf-cli fix . --tabs --newlines        # Only fix tabs and newlines
  epf-cli fix . --versions               # Only add missing versions`,
	Args: cobra.MaximumNArgs(1),
	Run:  runFix,
}

func init() {
	rootCmd.AddCommand(fixCmd)
	fixCmd.Flags().BoolVar(&fixDryRun, "dry-run", false, "Show what would be fixed without making changes")
	fixCmd.Flags().BoolVarP(&fixVerbose, "verbose", "v", false, "Show detailed fix information")
	fixCmd.Flags().BoolVar(&fixWhitespace, "whitespace", false, "Fix trailing whitespace only")
	fixCmd.Flags().BoolVar(&fixLineEndings, "line-endings", false, "Fix line endings (CRLF -> LF) only")
	fixCmd.Flags().BoolVar(&fixTabs, "tabs", false, "Convert tabs to spaces only")
	fixCmd.Flags().BoolVar(&fixNewlines, "newlines", false, "Fix missing/multiple trailing newlines only")
	fixCmd.Flags().BoolVar(&fixVersions, "versions", false, "Add missing meta.epf_version only")
	fixCmd.Flags().BoolVar(&fixAll, "all", false, "Apply all fixes (default if no specific fix is selected)")
}

// getFixOptions determines which fixes to apply based on flags
func getFixOptions() *FixOptions {
	// If any specific fix is selected, only apply those
	anySelected := fixWhitespace || fixLineEndings || fixTabs || fixNewlines || fixVersions

	if !anySelected || fixAll {
		// Apply all fixes
		return &FixOptions{
			Whitespace:  true,
			LineEndings: true,
			Tabs:        true,
			Newlines:    true,
			Versions:    true,
		}
	}

	// Apply only selected fixes
	return &FixOptions{
		Whitespace:  fixWhitespace,
		LineEndings: fixLineEndings,
		Tabs:        fixTabs,
		Newlines:    fixNewlines,
		Versions:    fixVersions,
	}
}

// FixResult represents the result of fixing a file
type FixResult struct {
	File    string
	Fixed   bool
	Changes []string
	Error   error
}

// FixSummary summarizes all fixes
type FixSummary struct {
	TotalFiles int
	FixedFiles int
	TotalFixes int
	Results    []*FixResult
	DryRun     bool
}

func runFix(cmd *cobra.Command, args []string) {
	targetPath, err := GetInstancePath(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Protect canonical EPF from accidental writes
	if err := EnsurePathNotCanonical(targetPath, "fix EPF files"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
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

	options := getFixOptions()
	summary := &FixSummary{DryRun: fixDryRun}

	// Print what fixes will be applied
	if fixVerbose || fixDryRun {
		fmt.Println("Fix options:")
		fmt.Printf("  Whitespace:   %v\n", options.Whitespace)
		fmt.Printf("  Line endings: %v\n", options.LineEndings)
		fmt.Printf("  Tabs:         %v\n", options.Tabs)
		fmt.Printf("  Newlines:     %v\n", options.Newlines)
		fmt.Printf("  Versions:     %v\n", options.Versions)
		fmt.Println()
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

			result := fixFileWithOptions(path, fixDryRun, options)
			summary.TotalFiles++
			summary.Results = append(summary.Results, result)
			if result.Fixed {
				summary.FixedFiles++
				summary.TotalFixes += len(result.Changes)
			}

			return nil
		})

		if err != nil {
			fmt.Fprintf(os.Stderr, "Error walking directory: %v\n", err)
			os.Exit(1)
		}
	} else {
		// Single file
		result := fixFileWithOptions(targetPath, fixDryRun, options)
		summary.TotalFiles++
		summary.Results = append(summary.Results, result)
		if result.Fixed {
			summary.FixedFiles++
			summary.TotalFixes += len(result.Changes)
		}
	}

	// Print results
	printFixSummary(summary)
}

// fixFile is the original function for backward compatibility (applies all fixes)
func fixFile(path string, dryRun bool) *FixResult {
	return fixFileWithOptions(path, dryRun, &FixOptions{
		Whitespace:  true,
		LineEndings: true,
		Tabs:        true,
		Newlines:    true,
		Versions:    true,
	})
}

func fixFileWithOptions(path string, dryRun bool, options *FixOptions) *FixResult {
	result := &FixResult{
		File:    path,
		Changes: make([]string, 0),
	}

	// Read file
	content, err := os.ReadFile(path)
	if err != nil {
		result.Error = err
		return result
	}

	original := string(content)
	fixed := original

	// Fix 1: Normalize line endings (CRLF -> LF)
	if options.LineEndings && strings.Contains(fixed, "\r\n") {
		fixed = strings.ReplaceAll(fixed, "\r\n", "\n")
		result.Changes = append(result.Changes, "Normalized line endings (CRLF -> LF)")
	}

	// Fix 2: Remove trailing whitespace from lines
	if options.Whitespace {
		lines := strings.Split(fixed, "\n")
		trailingFixed := false
		for i, line := range lines {
			trimmed := strings.TrimRight(line, " \t")
			if trimmed != line {
				lines[i] = trimmed
				trailingFixed = true
			}
		}
		if trailingFixed {
			fixed = strings.Join(lines, "\n")
			result.Changes = append(result.Changes, "Removed trailing whitespace")
		}
	}

	// Fix 3: Convert tabs to spaces (2 spaces per tab, YAML standard)
	if options.Tabs && strings.Contains(fixed, "\t") {
		fixed = strings.ReplaceAll(fixed, "\t", "  ")
		result.Changes = append(result.Changes, "Converted tabs to spaces")
	}

	// Fix 4: Ensure file ends with newline
	if options.Newlines {
		if len(fixed) > 0 && !strings.HasSuffix(fixed, "\n") {
			fixed += "\n"
			result.Changes = append(result.Changes, "Added missing newline at end of file")
		}

		// Fix 5: Remove multiple trailing newlines
		for strings.HasSuffix(fixed, "\n\n") {
			fixed = strings.TrimSuffix(fixed, "\n")
		}
		if len(fixed) > 0 && !strings.HasSuffix(fixed, "\n") {
			fixed += "\n"
		}
	}

	// Fix 6: Try to add meta.epf_version if missing
	if options.Versions {
		fixed = tryAddMetaVersion(fixed, result)
	}

	// Check if anything changed
	if fixed != original {
		result.Fixed = true

		if !dryRun {
			// Write fixed content
			err = os.WriteFile(path, []byte(fixed), 0644)
			if err != nil {
				result.Error = err
				return result
			}
		}
	}

	return result
}

// tryAddMetaVersion attempts to add meta.epf_version if it's missing
func tryAddMetaVersion(content string, result *FixResult) string {
	// Parse YAML to check structure
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &data); err != nil {
		return content // Can't parse, don't modify
	}

	// Check if meta section exists
	meta, hasMeta := data["meta"].(map[string]interface{})
	if !hasMeta {
		// No meta section - try to add it at the beginning
		if !strings.Contains(content, "meta:") {
			// Don't add meta if file is empty or has no structure
			if len(data) == 0 {
				return content
			}

			// Check if this looks like an EPF file (has common EPF fields)
			isEPF := false
			epfFields := []string{"vision", "north_star", "feature_id", "personas", "scenarios", "tracks", "capabilities"}
			for _, field := range epfFields {
				if _, ok := data[field]; ok {
					isEPF = true
					break
				}
			}

			if !isEPF {
				return content
			}

			// Add meta section at the top
			metaSection := "meta:\n  epf_version: \"1.9.6\"\n\n"
			// Find first non-comment, non-empty line
			lines := strings.Split(content, "\n")
			insertIdx := 0
			for i, line := range lines {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
					insertIdx = i
					break
				}
			}

			// Insert meta section
			newLines := make([]string, 0, len(lines)+3)
			newLines = append(newLines, lines[:insertIdx]...)
			newLines = append(newLines, strings.Split(metaSection, "\n")...)
			newLines = append(newLines, lines[insertIdx:]...)

			result.Changes = append(result.Changes, "Added meta.epf_version field")
			return strings.Join(newLines, "\n")
		}
		return content
	}

	// Meta exists, check for epf_version
	if _, hasVersion := meta["epf_version"]; !hasVersion {
		// Add epf_version to meta
		// Use regex to find meta: and add epf_version after it
		re := regexp.MustCompile(`(?m)^meta:\s*$`)
		if re.MatchString(content) {
			content = re.ReplaceAllString(content, "meta:\n  epf_version: \"1.9.6\"")
			result.Changes = append(result.Changes, "Added epf_version to meta section")
		}
	}

	return content
}

func printFixSummary(summary *FixSummary) {
	if summary.DryRun {
		fmt.Println("DRY RUN - No changes were made")
		fmt.Println()
	}

	fmt.Printf("Files scanned: %d\n", summary.TotalFiles)

	if summary.FixedFiles > 0 {
		action := "fixed"
		if summary.DryRun {
			action = "would be fixed"
		}
		fmt.Printf("Files %s: %d\n", action, summary.FixedFiles)
		fmt.Printf("Total fixes: %d\n", summary.TotalFixes)
		fmt.Println()

		for _, result := range summary.Results {
			if !result.Fixed {
				continue
			}

			if fixVerbose || summary.DryRun {
				fmt.Printf("  %s\n", result.File)
				for _, change := range result.Changes {
					fmt.Printf("    - %s\n", change)
				}
			}
		}
	} else {
		fmt.Println("No fixes needed!")
	}

	// Print errors
	hasErrors := false
	for _, result := range summary.Results {
		if result.Error != nil {
			if !hasErrors {
				fmt.Println("\nErrors:")
				hasErrors = true
			}
			fmt.Printf("  %s: %v\n", result.File, result.Error)
		}
	}
}
