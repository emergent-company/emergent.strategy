package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/template"
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

	// Add template subcommand
	diffCmd.AddCommand(diffTemplateCmd)
	diffTemplateCmd.Flags().StringVarP(&diffFormat, "format", "f", "text", "Output format: text, markdown, json")
	diffTemplateCmd.Flags().BoolVarP(&diffVerbose, "verbose", "v", false, "Show detailed differences")
}

// diffTemplateCmd compares a file against its canonical template
var diffTemplateCmd = &cobra.Command{
	Use:   "template <file>",
	Short: "Compare a file against its canonical template",
	Long: `Compare an EPF artifact file against its canonical template.

This command shows structural differences between your file and the template,
highlighting type mismatches, missing required fields, and structural issues
that may cause validation errors.

Optimized for AI agents fixing validation errors - shows:
  - Type mismatches (e.g., string where array expected)
  - Missing required fields from the template
  - Extra fields not in template
  - Structural differences in nested objects/arrays

Examples:
  epf-cli diff template 01_insight_analyses.yaml
  epf-cli diff template fd-001.yaml --verbose
  epf-cli diff template 03_insight_opportunity.yaml --format json`,
	Args: cobra.ExactArgs(1),
	Run:  runDiffTemplate,
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

// TemplateDiffResult represents differences between a file and its template
type TemplateDiffResult struct {
	File         string              `json:"file"`
	ArtifactType string              `json:"artifact_type"`
	Template     string              `json:"template"`
	Issues       []TemplateDiffIssue `json:"issues"`
	Summary      TemplateDiffSummary `json:"summary"`
}

// TemplateDiffIssue represents a single structural issue
type TemplateDiffIssue struct {
	Path         string `json:"path"`
	IssueType    string `json:"issue_type"` // type_mismatch, missing_field, extra_field, structure_mismatch
	Priority     string `json:"priority"`   // critical, high, medium, low
	Message      string `json:"message"`
	ExpectedType string `json:"expected_type,omitempty"`
	ActualType   string `json:"actual_type,omitempty"`
	TemplateHint string `json:"template_hint,omitempty"` // Example from template
	FixHint      string `json:"fix_hint,omitempty"`
}

// TemplateDiffSummary summarizes the template comparison
type TemplateDiffSummary struct {
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

func runDiffTemplate(cmd *cobra.Command, args []string) {
	filePath := args[0]

	// Check file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Error: file not found: %s\n", filePath)
		os.Exit(1)
	}

	// Get schemas directory for loader
	schemasDir, err := GetSchemasDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Create loader and detect artifact type
	loader := schema.NewLoader(schemasDir)
	if err := loader.Load(); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading schemas: %v\n", err)
		os.Exit(1)
	}

	artifactType, err := loader.DetectArtifactType(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot detect artifact type for %s\n", filePath)
		os.Exit(1)
	}

	// Load template
	epfRoot, err := GetEPFRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	tmplLoader := template.NewLoader(epfRoot)
	if err := tmplLoader.Load(); err != nil {
		// Try embedded
		tmplLoader = template.NewEmbeddedLoader()
		if err := tmplLoader.Load(); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading templates: %v\n", err)
			os.Exit(1)
		}
	}

	tmpl, err := tmplLoader.GetTemplate(artifactType)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: no template available for %s\n", artifactType)
		os.Exit(1)
	}

	// Parse both files
	fileData, err := readYAMLFile(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading file: %v\n", err)
		os.Exit(1)
	}

	var templateData map[string]interface{}
	if err := yaml.Unmarshal([]byte(tmpl.Content), &templateData); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing template: %v\n", err)
		os.Exit(1)
	}

	// Compare structure
	result := compareWithTemplate(filePath, string(artifactType), templateData, fileData)

	// Output result
	switch strings.ToLower(diffFormat) {
	case "json":
		printTemplateDiffJSON(result)
	case "markdown", "md":
		printTemplateDiffMarkdown(result)
	default:
		printTemplateDiffText(result)
	}

	// Exit with code 1 if there are issues
	if len(result.Issues) > 0 {
		os.Exit(1)
	}
}

func compareWithTemplate(filePath, artifactType string, templateData, fileData map[string]interface{}) *TemplateDiffResult {
	result := &TemplateDiffResult{
		File:         filePath,
		ArtifactType: artifactType,
		Template:     fmt.Sprintf("%s template", artifactType),
		Issues:       make([]TemplateDiffIssue, 0),
	}

	// Recursively compare structures
	issues := compareStructure(templateData, fileData, "")
	result.Issues = issues

	// Build summary
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

		// Extract top-level section
		parts := strings.Split(issue.Path, ".")
		if len(parts) > 0 {
			// Handle array notation
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

func compareStructure(template, file map[string]interface{}, prefix string) []TemplateDiffIssue {
	issues := make([]TemplateDiffIssue, 0)

	// Skip meta fields
	skipFields := map[string]bool{
		"meta": true,
	}

	// Check for fields in template that are missing or have wrong types in file
	for key, tmplVal := range template {
		if skipFields[key] {
			continue
		}

		path := key
		if prefix != "" {
			path = prefix + "." + key
		}

		fileVal, exists := file[key]

		if !exists {
			// Missing field
			issues = append(issues, TemplateDiffIssue{
				Path:         path,
				IssueType:    "missing_field",
				Priority:     getMissingFieldPriority(key),
				Message:      fmt.Sprintf("Field '%s' exists in template but not in file", key),
				ExpectedType: getValueType(tmplVal),
				TemplateHint: formatTemplateHint(tmplVal),
				FixHint:      fmt.Sprintf("Add '%s' field with %s value", key, getValueType(tmplVal)),
			})
			continue
		}

		// Check type compatibility
		tmplType := getValueType(tmplVal)
		fileType := getValueType(fileVal)

		if tmplType != fileType {
			issues = append(issues, TemplateDiffIssue{
				Path:         path,
				IssueType:    "type_mismatch",
				Priority:     "critical",
				Message:      fmt.Sprintf("Type mismatch: template has %s, file has %s", tmplType, fileType),
				ExpectedType: tmplType,
				ActualType:   fileType,
				TemplateHint: formatTemplateHint(tmplVal),
				FixHint:      getTypeMismatchHint(tmplType, fileType),
			})
			continue
		}

		// Recursively compare nested structures
		switch tv := tmplVal.(type) {
		case map[string]interface{}:
			if fv, ok := fileVal.(map[string]interface{}); ok {
				subIssues := compareStructure(tv, fv, path)
				issues = append(issues, subIssues...)
			}
		case []interface{}:
			if fv, ok := fileVal.([]interface{}); ok {
				// Compare array item structures if both have items
				if len(tv) > 0 && len(fv) > 0 {
					// Check if template item is an object
					if tmplItem, ok := tv[0].(map[string]interface{}); ok {
						// Check each file array item against template structure
						for i, fileItem := range fv {
							if fi, ok := fileItem.(map[string]interface{}); ok {
								itemPath := fmt.Sprintf("%s[%d]", path, i)
								subIssues := compareStructure(tmplItem, fi, itemPath)
								issues = append(issues, subIssues...)
							} else {
								// File item is not an object but template expects object
								issues = append(issues, TemplateDiffIssue{
									Path:         fmt.Sprintf("%s[%d]", path, i),
									IssueType:    "type_mismatch",
									Priority:     "critical",
									Message:      fmt.Sprintf("Array item should be object, got %s", getValueType(fileItem)),
									ExpectedType: "object",
									ActualType:   getValueType(fileItem),
									TemplateHint: formatTemplateHint(tmplItem),
									FixHint:      "Convert array item to object with proper fields",
								})
							}
						}
					}
				}
			}
		}
	}

	// Check for extra fields in file that aren't in template (low priority)
	if diffVerbose {
		for key := range file {
			if skipFields[key] {
				continue
			}
			if _, exists := template[key]; !exists {
				path := key
				if prefix != "" {
					path = prefix + "." + key
				}
				issues = append(issues, TemplateDiffIssue{
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

func getValueType(val interface{}) string {
	switch v := val.(type) {
	case map[string]interface{}:
		return "object"
	case []interface{}:
		if len(v) > 0 {
			itemType := getValueType(v[0])
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

func getMissingFieldPriority(key string) string {
	// High priority for common required fields
	highPriorityFields := map[string]bool{
		"name": true, "id": true, "description": true,
		"status": true, "type": true, "definition": true,
	}
	if highPriorityFields[key] {
		return "high"
	}
	return "medium"
}

func formatTemplateHint(val interface{}) string {
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
		itemHint := formatTemplateHint(v[0])
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

func getTypeMismatchHint(expected, actual string) string {
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

func printTemplateDiffText(result *TemplateDiffResult) {
	fmt.Printf("Template Diff: %s\n", result.File)
	fmt.Printf("Artifact Type: %s\n", result.ArtifactType)
	fmt.Println(strings.Repeat("-", 60))

	if len(result.Issues) == 0 {
		fmt.Println("\n✓ File structure matches template")
		return
	}

	// Group by priority
	critical := filterIssues(result.Issues, "critical")
	high := filterIssues(result.Issues, "high")
	medium := filterIssues(result.Issues, "medium")
	low := filterIssues(result.Issues, "low")

	if len(critical) > 0 {
		fmt.Printf("\n🔴 CRITICAL (%d):\n", len(critical))
		for _, issue := range critical {
			printIssueText(issue)
		}
	}

	if len(high) > 0 {
		fmt.Printf("\n🟠 HIGH (%d):\n", len(high))
		for _, issue := range high {
			printIssueText(issue)
		}
	}

	if len(medium) > 0 {
		fmt.Printf("\n🟡 MEDIUM (%d):\n", len(medium))
		for _, issue := range medium {
			printIssueText(issue)
		}
	}

	if len(low) > 0 && diffVerbose {
		fmt.Printf("\n🔵 LOW (%d):\n", len(low))
		for _, issue := range low {
			printIssueText(issue)
		}
	}

	fmt.Println()
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Summary: %d issues (%d critical, %d high, %d medium, %d low)\n",
		result.Summary.TotalIssues,
		result.Summary.CriticalCount,
		result.Summary.HighCount,
		result.Summary.MediumCount,
		result.Summary.LowCount)
	fmt.Printf("Affected sections: %s\n", strings.Join(result.Summary.AffectedSections, ", "))
}

func filterIssues(issues []TemplateDiffIssue, priority string) []TemplateDiffIssue {
	filtered := make([]TemplateDiffIssue, 0)
	for _, issue := range issues {
		if issue.Priority == priority {
			filtered = append(filtered, issue)
		}
	}
	return filtered
}

func printIssueText(issue TemplateDiffIssue) {
	fmt.Printf("  • %s\n", issue.Path)
	fmt.Printf("    %s\n", issue.Message)
	if issue.TemplateHint != "" {
		fmt.Printf("    Template: %s\n", issue.TemplateHint)
	}
	if issue.FixHint != "" {
		fmt.Printf("    Fix: %s\n", issue.FixHint)
	}
}

func printTemplateDiffMarkdown(result *TemplateDiffResult) {
	fmt.Printf("# Template Diff Report\n\n")
	fmt.Printf("**File:** `%s`\n", result.File)
	fmt.Printf("**Artifact Type:** %s\n\n", result.ArtifactType)

	if len(result.Issues) == 0 {
		fmt.Println("✓ File structure matches template")
		fmt.Println()
		return
	}

	fmt.Printf("## Summary\n\n")
	fmt.Printf("- **Total Issues:** %d\n", result.Summary.TotalIssues)
	fmt.Printf("- **Type Mismatches:** %d\n", result.Summary.TypeMismatches)
	fmt.Printf("- **Missing Fields:** %d\n", result.Summary.MissingFields)
	fmt.Printf("- **Extra Fields:** %d\n", result.Summary.ExtraFields)
	fmt.Printf("- **Affected Sections:** %s\n\n", strings.Join(result.Summary.AffectedSections, ", "))

	// Group by issue type for clearer output
	typeMismatches := filterIssuesByType(result.Issues, "type_mismatch")
	missingFields := filterIssuesByType(result.Issues, "missing_field")
	extraFields := filterIssuesByType(result.Issues, "extra_field")

	if len(typeMismatches) > 0 {
		fmt.Printf("## Type Mismatches (%d) 🔴\n\n", len(typeMismatches))
		for _, issue := range typeMismatches {
			fmt.Printf("### `%s`\n", issue.Path)
			fmt.Printf("- **Expected:** %s\n", issue.ExpectedType)
			fmt.Printf("- **Actual:** %s\n", issue.ActualType)
			if issue.TemplateHint != "" {
				fmt.Printf("- **Template:** %s\n", issue.TemplateHint)
			}
			fmt.Printf("- **Fix:** %s\n\n", issue.FixHint)
		}
	}

	if len(missingFields) > 0 {
		fmt.Printf("## Missing Fields (%d) 🟠\n\n", len(missingFields))
		for _, issue := range missingFields {
			fmt.Printf("- `%s` (%s)\n", issue.Path, issue.ExpectedType)
			if issue.TemplateHint != "" {
				fmt.Printf("  - Template: %s\n", issue.TemplateHint)
			}
		}
		fmt.Println()
	}

	if len(extraFields) > 0 && diffVerbose {
		fmt.Printf("## Extra Fields (%d) 🔵\n\n", len(extraFields))
		for _, issue := range extraFields {
			fmt.Printf("- `%s`\n", issue.Path)
		}
		fmt.Println()
	}
}

func filterIssuesByType(issues []TemplateDiffIssue, issueType string) []TemplateDiffIssue {
	filtered := make([]TemplateDiffIssue, 0)
	for _, issue := range issues {
		if issue.IssueType == issueType {
			filtered = append(filtered, issue)
		}
	}
	return filtered
}

func printTemplateDiffJSON(result *TemplateDiffResult) {
	output, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error formatting JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(output))
}
