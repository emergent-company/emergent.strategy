package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/checks"
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

// fixStructureCmd represents the fix structure command
var fixStructureCmd = &cobra.Command{
	Use:   "structure [epf-path]",
	Short: "Remove canonical EPF content from product repositories",
	Long: `Remove canonical EPF content that should NOT be in product repositories.

This command detects and removes:
  - schemas/       (JSON schemas - loaded by epf-cli at runtime)
  - templates/     (artifact templates - loaded by epf-cli)
  - wizards/       (AI wizard instructions - embedded in epf-cli)
  - scripts/       (validation scripts - replaced by epf-cli)
  - outputs/       (generator definitions - embedded in epf-cli)
  - definitions/   (track definitions - embedded in epf-cli)
  - migrations/    (schema migrations - handled by epf-cli)
  - phases/        (phase definitions - embedded in epf-cli)
  - features/      (feature templates - embedded in epf-cli)
  - CANONICAL_PURITY_RULES.md  (framework documentation)
  - integration_specification.yaml
  - VERSION, MAINTENANCE.md, KNOWN_ISSUES.md, MIGRATIONS.md

Product repositories should ONLY contain:
  - _instances/{product}/  - Your EPF instance data (READY/FIRE/AIM)
  - AGENTS.md             - AI agent instructions (optional)
  - README.md             - Human documentation (optional)

Use --dry-run to preview what would be removed.

Examples:
  epf-cli fix structure                    # Fix current directory
  epf-cli fix structure docs/EPF --dry-run # Preview fixes
  epf-cli fix structure --verbose          # Show detailed output`,
	Args: cobra.MaximumNArgs(1),
	Run:  runFixStructure,
}

var (
	fixStructureDryRun  bool
	fixStructureVerbose bool
	fixStructureForce   bool
)

func init() {
	// Add structure subcommand to fix
	fixCmd.AddCommand(fixStructureCmd)

	fixStructureCmd.Flags().BoolVar(&fixStructureDryRun, "dry-run", false, "Preview changes without removing files")
	fixStructureCmd.Flags().BoolVarP(&fixStructureVerbose, "verbose", "v", false, "Show detailed output")
	fixStructureCmd.Flags().BoolVarP(&fixStructureForce, "force", "f", false, "Remove without confirmation")
}

// StructureFixResult represents the result of fixing repository structure
type StructureFixResult struct {
	EPFRoot          string   `json:"epf_root"`
	WasProductRepo   bool     `json:"was_product_repo"`
	DirsRemoved      []string `json:"dirs_removed,omitempty"`
	FilesRemoved     []string `json:"files_removed,omitempty"`
	TotalFilesInDirs int      `json:"total_files_in_dirs"`
	DryRun           bool     `json:"dry_run"`
	Error            error    `json:"error,omitempty"`
}

func runFixStructure(cmd *cobra.Command, args []string) {
	// Determine EPF path
	var epfPath string
	if len(args) > 0 {
		var err error
		epfPath, err = filepath.Abs(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	} else {
		// Try to find EPF root from context
		ctx := GetContext()
		if ctx != nil && ctx.EPFRoot != "" {
			epfPath = ctx.EPFRoot
		} else {
			// Use current directory
			var err error
			epfPath, err = os.Getwd()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		}
	}

	// Check if it's canonical EPF (block unless --dev is set)
	if err := EnsurePathNotCanonical(epfPath, "fix structure"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Run structure check first
	checker := checks.NewStructureChecker(epfPath)
	checkResult := checker.Check()

	// Only proceed if this is a product repo with issues
	if checkResult.RepoType != checks.RepoTypeProduct {
		if checkResult.RepoType == checks.RepoTypeCanonical {
			fmt.Println("This appears to be the canonical EPF repository.")
			fmt.Println("The 'fix structure' command is for product repositories that")
			fmt.Println("accidentally contain canonical EPF content.")
			os.Exit(0)
		} else {
			fmt.Println("Could not determine repository type.")
			fmt.Println("Run 'epf-cli health' for more information.")
			os.Exit(1)
		}
	}

	if checkResult.Valid {
		fmt.Println("✅ Repository structure is already clean!")
		fmt.Println()
		fmt.Println("No canonical EPF content found in this product repository.")
		os.Exit(0)
	}

	// Get canonical content issues
	issues := checkResult.GetCanonicalContentIssues()
	if len(issues) == 0 {
		fmt.Println("✅ No canonical content to remove.")
		os.Exit(0)
	}

	// Prepare result
	result := &StructureFixResult{
		EPFRoot:        epfPath,
		WasProductRepo: true,
		DryRun:         fixStructureDryRun,
	}

	// Collect items to remove
	var dirsToRemove []string
	var filesToRemove []string

	for _, dir := range checks.CanonicalDirectories {
		path := filepath.Join(epfPath, dir)
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			dirsToRemove = append(dirsToRemove, dir)
			// Count files in directory
			count := countFilesRecursively(path)
			result.TotalFilesInDirs += count
		}
	}

	for _, file := range checks.CanonicalFiles {
		path := filepath.Join(epfPath, file)
		if _, err := os.Stat(path); err == nil {
			filesToRemove = append(filesToRemove, file)
		}
	}

	// Show what will be removed
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Println("║           EPF STRUCTURE FIX                                 ║")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	if fixStructureDryRun {
		fmt.Println("DRY RUN - No changes will be made")
		fmt.Println()
	}

	fmt.Printf("EPF Root: %s\n", epfPath)
	fmt.Println()

	if len(dirsToRemove) > 0 {
		fmt.Println("📁 Directories to remove:")
		for _, dir := range dirsToRemove {
			path := filepath.Join(epfPath, dir)
			count := countFilesRecursively(path)
			fmt.Printf("   • %s/ (%d files)\n", dir, count)
		}
		fmt.Println()
	}

	if len(filesToRemove) > 0 {
		fmt.Println("📄 Files to remove:")
		for _, file := range filesToRemove {
			fmt.Printf("   • %s\n", file)
		}
		fmt.Println()
	}

	// Show what will be preserved
	fmt.Println("✅ Will preserve:")
	fmt.Println("   • _instances/ (your EPF data)")
	fmt.Println("   • AGENTS.md (if present)")
	fmt.Println("   • README.md (if present)")
	fmt.Println("   • .gitignore (if present)")
	fmt.Println()

	// Confirm unless force or dry-run
	if !fixStructureDryRun && !fixStructureForce {
		fmt.Printf("This will remove %d directories (%d files) and %d files.\n",
			len(dirsToRemove), result.TotalFilesInDirs, len(filesToRemove))
		fmt.Println()
		fmt.Print("Continue? [y/N]: ")

		var response string
		fmt.Scanln(&response)
		response = strings.ToLower(strings.TrimSpace(response))
		if response != "y" && response != "yes" {
			fmt.Println("Aborted.")
			os.Exit(0)
		}
		fmt.Println()
	}

	// Perform removal
	if !fixStructureDryRun {
		// Remove directories
		for _, dir := range dirsToRemove {
			path := filepath.Join(epfPath, dir)
			if fixStructureVerbose {
				fmt.Printf("Removing directory: %s\n", path)
			}
			if err := os.RemoveAll(path); err != nil {
				fmt.Fprintf(os.Stderr, "Error removing %s: %v\n", path, err)
				result.Error = err
			} else {
				result.DirsRemoved = append(result.DirsRemoved, dir)
			}
		}

		// Remove files
		for _, file := range filesToRemove {
			path := filepath.Join(epfPath, file)
			if fixStructureVerbose {
				fmt.Printf("Removing file: %s\n", path)
			}
			if err := os.Remove(path); err != nil {
				fmt.Fprintf(os.Stderr, "Error removing %s: %v\n", path, err)
				result.Error = err
			} else {
				result.FilesRemoved = append(result.FilesRemoved, file)
			}
		}
	} else {
		result.DirsRemoved = dirsToRemove
		result.FilesRemoved = filesToRemove
	}

	// Print summary
	fmt.Println("════════════════════════════════════════════════════════════")
	if fixStructureDryRun {
		fmt.Printf("Would remove: %d directories, %d files\n",
			len(result.DirsRemoved), len(result.FilesRemoved))
	} else {
		fmt.Printf("✅ Removed: %d directories, %d files\n",
			len(result.DirsRemoved), len(result.FilesRemoved))
	}
	fmt.Println()

	if !fixStructureDryRun {
		fmt.Println("Next steps:")
		fmt.Println("  1. Run 'epf-cli health' to verify the structure")
		fmt.Println("  2. Commit the changes: git add -A && git commit -m \"Remove canonical EPF content\"")
		fmt.Println()
		fmt.Println("The canonical EPF framework (schemas, templates, wizards) is now")
		fmt.Println("loaded automatically by epf-cli at runtime - you don't need local copies.")
	}
}

// countFilesRecursively counts all files in a directory recursively
func countFilesRecursively(path string) int {
	count := 0
	filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			count++
		}
		return nil
	})
	return count
}
