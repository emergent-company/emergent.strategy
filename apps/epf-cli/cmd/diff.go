package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	diffFormat  string
	diffVerbose bool
)

// diffCmd represents the diff command
var diffCmd = &cobra.Command{
	Use:   "diff <source> <target>",
	Short: "Compare EPF artifacts or instances",
	Long: `Compare two EPF artifacts or instances to identify differences.

This command can compare:
  - Two YAML files (shows field-level differences)
  - Two instance directories (shows file-level and content differences)
  - An artifact against its schema (shows compliance gaps)

The diff is semantic, understanding EPF structure rather than just text differences.

Examples:
  epf-cli diff file1.yaml file2.yaml               # Compare two files
  epf-cli diff ./instance1 ./instance2             # Compare two instances
  epf-cli diff before.yaml after.yaml --format md  # Markdown output
  epf-cli diff old/ new/ --verbose                 # Detailed comparison`,
	Args: cobra.ExactArgs(2),
	Run:  runDiff,
}

func init() {
	rootCmd.AddCommand(diffCmd)
	diffCmd.Flags().StringVarP(&diffFormat, "format", "f", "text", "Output format: text, markdown, json")
	diffCmd.Flags().BoolVarP(&diffVerbose, "verbose", "v", false, "Show detailed differences")
}

// DiffResult represents the differences between two sources
type DiffResult struct {
	Source     string      `json:"source"`
	Target     string      `json:"target"`
	Type       string      `json:"type"` // file or directory
	Added      []DiffEntry `json:"added,omitempty"`
	Removed    []DiffEntry `json:"removed,omitempty"`
	Modified   []DiffEntry `json:"modified,omitempty"`
	Unchanged  int         `json:"unchanged"`
	Summary    string      `json:"summary"`
	FieldDiffs []FieldDiff `json:"field_diffs,omitempty"`
}

// DiffEntry represents a single difference
type DiffEntry struct {
	Path     string `json:"path"`
	Type     string `json:"type,omitempty"` // field, file
	OldValue string `json:"old_value,omitempty"`
	NewValue string `json:"new_value,omitempty"`
}

// FieldDiff represents differences in YAML fields
type FieldDiff struct {
	Field    string      `json:"field"`
	Type     string      `json:"type"` // added, removed, modified
	OldValue interface{} `json:"old_value,omitempty"`
	NewValue interface{} `json:"new_value,omitempty"`
}

func runDiff(cmd *cobra.Command, args []string) {
	source := args[0]
	target := args[1]

	sourceInfo, err := os.Stat(source)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot access source %s: %v\n", source, err)
		os.Exit(1)
	}

	targetInfo, err := os.Stat(target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot access target %s: %v\n", target, err)
		os.Exit(1)
	}

	var result *DiffResult

	if sourceInfo.IsDir() && targetInfo.IsDir() {
		result = diffDirectories(source, target)
	} else if !sourceInfo.IsDir() && !targetInfo.IsDir() {
		result = diffFiles(source, target)
	} else {
		fmt.Fprintf(os.Stderr, "Error: cannot compare file and directory\n")
		os.Exit(1)
	}

	// Output result
	switch strings.ToLower(diffFormat) {
	case "json":
		printDiffJSON(result)
	case "markdown", "md":
		printDiffMarkdown(result)
	default:
		printDiffText(result)
	}

	// Exit with code 1 if there are differences
	if len(result.Added) > 0 || len(result.Removed) > 0 || len(result.Modified) > 0 {
		os.Exit(1)
	}
}

func diffFiles(source, target string) *DiffResult {
	result := &DiffResult{
		Source: source,
		Target: target,
		Type:   "file",
	}

	// Read and parse both files
	sourceData, err := readYAMLFile(source)
	if err != nil {
		result.Summary = fmt.Sprintf("Error reading source: %v", err)
		return result
	}

	targetData, err := readYAMLFile(target)
	if err != nil {
		result.Summary = fmt.Sprintf("Error reading target: %v", err)
		return result
	}

	// Compare YAML structures
	result.FieldDiffs = compareYAML(sourceData, targetData, "")

	// Categorize differences
	for _, diff := range result.FieldDiffs {
		entry := DiffEntry{
			Path: diff.Field,
			Type: "field",
		}
		if diff.OldValue != nil {
			entry.OldValue = fmt.Sprintf("%v", diff.OldValue)
		}
		if diff.NewValue != nil {
			entry.NewValue = fmt.Sprintf("%v", diff.NewValue)
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

	// Calculate unchanged (rough estimate)
	totalFields := countFields(sourceData) + countFields(targetData)
	changedFields := len(result.Added) + len(result.Removed) + len(result.Modified)*2
	result.Unchanged = (totalFields - changedFields) / 2
	if result.Unchanged < 0 {
		result.Unchanged = 0
	}

	// Generate summary
	result.Summary = fmt.Sprintf("%d added, %d removed, %d modified",
		len(result.Added), len(result.Removed), len(result.Modified))

	return result
}

func diffDirectories(source, target string) *DiffResult {
	result := &DiffResult{
		Source: source,
		Target: target,
		Type:   "directory",
	}

	// Get all YAML files in both directories
	sourceFiles := getYAMLFiles(source)
	targetFiles := getYAMLFiles(target)

	// Create sets for comparison
	sourceSet := make(map[string]string) // relative path -> full path
	targetSet := make(map[string]string)

	for _, f := range sourceFiles {
		rel, _ := filepath.Rel(source, f)
		sourceSet[rel] = f
	}
	for _, f := range targetFiles {
		rel, _ := filepath.Rel(target, f)
		targetSet[rel] = f
	}

	// Find added files (in target but not in source)
	for rel := range targetSet {
		if _, exists := sourceSet[rel]; !exists {
			result.Added = append(result.Added, DiffEntry{
				Path: rel,
				Type: "file",
			})
		}
	}

	// Find removed files (in source but not in target)
	for rel := range sourceSet {
		if _, exists := targetSet[rel]; !exists {
			result.Removed = append(result.Removed, DiffEntry{
				Path: rel,
				Type: "file",
			})
		}
	}

	// Find modified files (in both, but different)
	for rel, sourcePath := range sourceSet {
		if targetPath, exists := targetSet[rel]; exists {
			if hasFileDifferences(sourcePath, targetPath) {
				entry := DiffEntry{
					Path: rel,
					Type: "file",
				}

				if diffVerbose {
					// Get detailed differences
					fileDiff := diffFiles(sourcePath, targetPath)
					entry.OldValue = fmt.Sprintf("%d changes", len(fileDiff.FieldDiffs))
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

	// Generate summary
	result.Summary = fmt.Sprintf("%d added, %d removed, %d modified, %d unchanged",
		len(result.Added), len(result.Removed), len(result.Modified), result.Unchanged)

	return result
}

func readYAMLFile(path string) (map[string]interface{}, error) {
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

func compareYAML(source, target map[string]interface{}, prefix string) []FieldDiff {
	diffs := make([]FieldDiff, 0)

	// Get all keys from both
	allKeys := make(map[string]bool)
	for k := range source {
		allKeys[k] = true
	}
	for k := range target {
		allKeys[k] = true
	}

	// Compare each key
	for key := range allKeys {
		fieldPath := key
		if prefix != "" {
			fieldPath = prefix + "." + key
		}

		sourceVal, sourceExists := source[key]
		targetVal, targetExists := target[key]

		if !sourceExists {
			// Added in target
			diffs = append(diffs, FieldDiff{
				Field:    fieldPath,
				Type:     "added",
				NewValue: summarizeValue(targetVal),
			})
		} else if !targetExists {
			// Removed from target
			diffs = append(diffs, FieldDiff{
				Field:    fieldPath,
				Type:     "removed",
				OldValue: summarizeValue(sourceVal),
			})
		} else {
			// Both exist - compare values
			if !reflect.DeepEqual(sourceVal, targetVal) {
				// Check if both are maps (recursive comparison)
				sourceMap, sourceIsMap := sourceVal.(map[string]interface{})
				targetMap, targetIsMap := targetVal.(map[string]interface{})

				if sourceIsMap && targetIsMap {
					// Recursive comparison
					subDiffs := compareYAML(sourceMap, targetMap, fieldPath)
					diffs = append(diffs, subDiffs...)
				} else {
					// Different values
					diffs = append(diffs, FieldDiff{
						Field:    fieldPath,
						Type:     "modified",
						OldValue: summarizeValue(sourceVal),
						NewValue: summarizeValue(targetVal),
					})
				}
			}
		}
	}

	return diffs
}

func summarizeValue(val interface{}) interface{} {
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

func countFields(data map[string]interface{}) int {
	count := 0
	for _, v := range data {
		count++
		if m, ok := v.(map[string]interface{}); ok {
			count += countFields(m)
		}
	}
	return count
}

func getYAMLFiles(dir string) []string {
	var files []string
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
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

func hasFileDifferences(path1, path2 string) bool {
	// Quick hash comparison using first and last bytes
	content1, err1 := os.ReadFile(path1)
	content2, err2 := os.ReadFile(path2)

	if err1 != nil || err2 != nil {
		return true // Assume different if can't read
	}

	// Simple content comparison
	return string(content1) != string(content2)
}

func printDiffText(result *DiffResult) {
	fmt.Printf("Comparing %s vs %s\n", result.Source, result.Target)
	fmt.Printf("Type: %s\n", result.Type)
	fmt.Println(strings.Repeat("-", 60))

	if len(result.Added) > 0 {
		fmt.Printf("\n+ Added (%d):\n", len(result.Added))
		for _, e := range result.Added {
			fmt.Printf("  + %s\n", e.Path)
			if diffVerbose && e.NewValue != "" {
				fmt.Printf("      Value: %s\n", e.NewValue)
			}
		}
	}

	if len(result.Removed) > 0 {
		fmt.Printf("\n- Removed (%d):\n", len(result.Removed))
		for _, e := range result.Removed {
			fmt.Printf("  - %s\n", e.Path)
			if diffVerbose && e.OldValue != "" {
				fmt.Printf("      Value: %s\n", e.OldValue)
			}
		}
	}

	if len(result.Modified) > 0 {
		fmt.Printf("\n~ Modified (%d):\n", len(result.Modified))
		for _, e := range result.Modified {
			fmt.Printf("  ~ %s\n", e.Path)
			if diffVerbose {
				if e.OldValue != "" {
					fmt.Printf("      Old: %s\n", e.OldValue)
				}
				if e.NewValue != "" {
					fmt.Printf("      New: %s\n", e.NewValue)
				}
			}
		}
	}

	fmt.Println()
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Summary: %s\n", result.Summary)
}

func printDiffMarkdown(result *DiffResult) {
	fmt.Printf("# Diff Report\n\n")
	fmt.Printf("**Source:** `%s`\n", result.Source)
	fmt.Printf("**Target:** `%s`\n", result.Target)
	fmt.Printf("**Type:** %s\n\n", result.Type)

	fmt.Printf("## Summary\n\n")
	fmt.Printf("%s\n\n", result.Summary)

	if len(result.Added) > 0 {
		fmt.Printf("## Added (%d)\n\n", len(result.Added))
		for _, e := range result.Added {
			fmt.Printf("- `%s`", e.Path)
			if e.NewValue != "" {
				fmt.Printf(": %s", e.NewValue)
			}
			fmt.Println()
		}
		fmt.Println()
	}

	if len(result.Removed) > 0 {
		fmt.Printf("## Removed (%d)\n\n", len(result.Removed))
		for _, e := range result.Removed {
			fmt.Printf("- `%s`", e.Path)
			if e.OldValue != "" {
				fmt.Printf(": %s", e.OldValue)
			}
			fmt.Println()
		}
		fmt.Println()
	}

	if len(result.Modified) > 0 {
		fmt.Printf("## Modified (%d)\n\n", len(result.Modified))
		for _, e := range result.Modified {
			fmt.Printf("- `%s`\n", e.Path)
			if diffVerbose {
				if e.OldValue != "" {
					fmt.Printf("  - Old: %s\n", e.OldValue)
				}
				if e.NewValue != "" {
					fmt.Printf("  - New: %s\n", e.NewValue)
				}
			}
		}
		fmt.Println()
	}
}

func printDiffJSON(result *DiffResult) {
	// Simple JSON output
	fmt.Println("{")
	fmt.Printf("  \"source\": %q,\n", result.Source)
	fmt.Printf("  \"target\": %q,\n", result.Target)
	fmt.Printf("  \"type\": %q,\n", result.Type)
	fmt.Printf("  \"summary\": %q,\n", result.Summary)
	fmt.Printf("  \"added\": %d,\n", len(result.Added))
	fmt.Printf("  \"removed\": %d,\n", len(result.Removed))
	fmt.Printf("  \"modified\": %d,\n", len(result.Modified))
	fmt.Printf("  \"unchanged\": %d\n", result.Unchanged)
	fmt.Println("}")
}

// Utility function to compare files line by line
func compareFilesLines(path1, path2 string) ([]string, []string, error) {
	file1, err := os.Open(path1)
	if err != nil {
		return nil, nil, err
	}
	defer file1.Close()

	file2, err := os.Open(path2)
	if err != nil {
		return nil, nil, err
	}
	defer file2.Close()

	var lines1, lines2 []string

	scanner1 := bufio.NewScanner(file1)
	for scanner1.Scan() {
		lines1 = append(lines1, scanner1.Text())
	}

	scanner2 := bufio.NewScanner(file2)
	for scanner2.Scan() {
		lines2 = append(lines2, scanner2.Text())
	}

	return lines1, lines2, nil
}
