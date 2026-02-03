// Package checks provides EPF content validation beyond schema validation.
// This implements the logic from EPF bash scripts like validate-instance.sh,
// validate-feature-quality.sh, check-content-readiness.sh, etc.
package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Severity levels for check results
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityError    Severity = "error"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// CheckResult represents a single check result
type CheckResult struct {
	Check    string   `json:"check"`
	Passed   bool     `json:"passed"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
	Path     string   `json:"path,omitempty"`
	Details  []string `json:"details,omitempty"`
}

// CheckSummary summarizes multiple check results
type CheckSummary struct {
	TotalChecks int            `json:"total_checks"`
	Passed      int            `json:"passed"`
	Failed      int            `json:"failed"`
	Critical    int            `json:"critical"`
	Errors      int            `json:"errors"`
	Warnings    int            `json:"warnings"`
	Results     []*CheckResult `json:"results"`
}

// NewCheckSummary creates a new check summary
func NewCheckSummary() *CheckSummary {
	return &CheckSummary{
		Results: make([]*CheckResult, 0),
	}
}

// Add adds a check result to the summary
func (s *CheckSummary) Add(result *CheckResult) {
	s.Results = append(s.Results, result)
	s.TotalChecks++
	if result.Passed {
		s.Passed++
	} else {
		s.Failed++
		switch result.Severity {
		case SeverityCritical:
			s.Critical++
		case SeverityError:
			s.Errors++
		case SeverityWarning:
			s.Warnings++
		}
	}
}

// HasCritical returns true if there are critical failures
func (s *CheckSummary) HasCritical() bool {
	return s.Critical > 0
}

// HasErrors returns true if there are errors or critical failures
func (s *CheckSummary) HasErrors() bool {
	return s.Critical > 0 || s.Errors > 0
}

// InstanceChecker validates EPF instance structure
type InstanceChecker struct {
	instancePath string
	isPhased     bool // true if using READY/FIRE/AIM structure
}

// NewInstanceChecker creates a new instance checker
func NewInstanceChecker(instancePath string) *InstanceChecker {
	return &InstanceChecker{instancePath: instancePath}
}

// RequiredREADYFiles are the files required in the READY phase
var RequiredREADYFiles = []string{
	"00_north_star.yaml",
	"01_insight_analyses.yaml",
	"02_strategy_foundations.yaml",
	"03_insight_opportunity.yaml",
	"04_strategy_formula.yaml",
}

// OptionalREADYFiles are optional files in READY phase
var OptionalREADYFiles = []string{
	"05_roadmap_recipe.yaml",
	"product_portfolio.yaml",
}

// RequiredFIREDirs are required directories in FIRE phase
var RequiredFIREDirs = []string{
	"feature_definitions",
	"value_models",
}

// OptionalFIREDirs are optional directories in FIRE phase
var OptionalFIREDirs = []string{
	"workflows",
}

// Check runs all instance structure checks
func (c *InstanceChecker) Check() *CheckSummary {
	summary := NewCheckSummary()

	// Check if instance path exists
	if _, err := os.Stat(c.instancePath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "instance_exists",
			Passed:   false,
			Severity: SeverityCritical,
			Message:  fmt.Sprintf("Instance path does not exist: %s", c.instancePath),
			Path:     c.instancePath,
		})
		return summary
	}

	// Detect structure type (phased vs flat)
	c.isPhased = c.detectPhasedStructure()
	summary.Add(&CheckResult{
		Check:    "structure_detection",
		Passed:   true,
		Severity: SeverityInfo,
		Message:  fmt.Sprintf("Structure type: %s", c.structureType()),
		Path:     c.instancePath,
	})

	// Check phase directories
	c.checkPhaseDirectories(summary)

	// Check READY files
	c.checkREADYFiles(summary)

	// Check FIRE directories
	c.checkFIREDirectories(summary)

	// Check for _meta.yaml
	c.checkMetaFile(summary)

	// Check for framework separation (shouldn't have schemas/, wizards/ etc.)
	c.checkFrameworkSeparation(summary)

	return summary
}

func (c *InstanceChecker) detectPhasedStructure() bool {
	readyPath := filepath.Join(c.instancePath, "READY")
	_, err := os.Stat(readyPath)
	return err == nil
}

func (c *InstanceChecker) structureType() string {
	if c.isPhased {
		return "phased (READY/FIRE/AIM)"
	}
	return "flat (legacy)"
}

func (c *InstanceChecker) getREADYPath() string {
	if c.isPhased {
		return filepath.Join(c.instancePath, "READY")
	}
	return c.instancePath
}

func (c *InstanceChecker) getFIREPath() string {
	if c.isPhased {
		return filepath.Join(c.instancePath, "FIRE")
	}
	return c.instancePath
}

func (c *InstanceChecker) getAIMPath() string {
	return filepath.Join(c.instancePath, "AIM")
}

func (c *InstanceChecker) checkPhaseDirectories(summary *CheckSummary) {
	if !c.isPhased {
		summary.Add(&CheckResult{
			Check:    "phase_structure",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "Using flat structure (legacy). Consider migrating to READY/FIRE/AIM structure.",
			Path:     c.instancePath,
		})
		return
	}

	// Check READY directory
	readyPath := c.getREADYPath()
	if _, err := os.Stat(readyPath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "ready_directory",
			Passed:   false,
			Severity: SeverityError,
			Message:  "READY directory not found",
			Path:     readyPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "ready_directory",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "READY directory exists",
			Path:     readyPath,
		})
	}

	// Check FIRE directory
	firePath := c.getFIREPath()
	if _, err := os.Stat(firePath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "fire_directory",
			Passed:   false,
			Severity: SeverityError,
			Message:  "FIRE directory not found",
			Path:     firePath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "fire_directory",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "FIRE directory exists",
			Path:     firePath,
		})
	}

	// Check AIM directory (optional but recommended)
	aimPath := c.getAIMPath()
	if _, err := os.Stat(aimPath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "aim_directory",
			Passed:   true,
			Severity: SeverityWarning,
			Message:  "AIM directory not found (optional but recommended)",
			Path:     aimPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "aim_directory",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "AIM directory exists",
			Path:     aimPath,
		})
	}
}

func (c *InstanceChecker) checkREADYFiles(summary *CheckSummary) {
	readyPath := c.getREADYPath()
	if _, err := os.Stat(readyPath); os.IsNotExist(err) {
		return // Already reported
	}

	// Check required files
	var missing []string
	for _, file := range RequiredREADYFiles {
		filePath := filepath.Join(readyPath, file)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			missing = append(missing, file)
		}
	}

	if len(missing) > 0 {
		summary.Add(&CheckResult{
			Check:    "ready_required_files",
			Passed:   false,
			Severity: SeverityError,
			Message:  fmt.Sprintf("Missing %d required READY files", len(missing)),
			Path:     readyPath,
			Details:  missing,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "ready_required_files",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("All %d required READY files present", len(RequiredREADYFiles)),
			Path:     readyPath,
		})
	}

	// Check optional files
	var presentOptional []string
	for _, file := range OptionalREADYFiles {
		filePath := filepath.Join(readyPath, file)
		if _, err := os.Stat(filePath); err == nil {
			presentOptional = append(presentOptional, file)
		}
	}

	if len(presentOptional) > 0 {
		summary.Add(&CheckResult{
			Check:    "ready_optional_files",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("%d optional READY files present", len(presentOptional)),
			Path:     readyPath,
			Details:  presentOptional,
		})
	}
}

func (c *InstanceChecker) checkFIREDirectories(summary *CheckSummary) {
	firePath := c.getFIREPath()
	if _, err := os.Stat(firePath); os.IsNotExist(err) {
		return // Already reported
	}

	// Check required directories
	var missing []string
	for _, dir := range RequiredFIREDirs {
		dirPath := filepath.Join(firePath, dir)
		if _, err := os.Stat(dirPath); os.IsNotExist(err) {
			missing = append(missing, dir)
		}
	}

	if len(missing) > 0 {
		summary.Add(&CheckResult{
			Check:    "fire_required_dirs",
			Passed:   false,
			Severity: SeverityError,
			Message:  fmt.Sprintf("Missing %d required FIRE directories", len(missing)),
			Path:     firePath,
			Details:  missing,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "fire_required_dirs",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("All %d required FIRE directories present", len(RequiredFIREDirs)),
			Path:     firePath,
		})
	}

	// Check for feature definitions
	fdPath := filepath.Join(firePath, "feature_definitions")
	if _, err := os.Stat(fdPath); err == nil {
		c.checkFeatureDefinitionsDir(summary, fdPath)
	}

	// Check for value models
	vmPath := filepath.Join(firePath, "value_models")
	if _, err := os.Stat(vmPath); err == nil {
		c.checkValueModelsDir(summary, vmPath)
	}
}

func (c *InstanceChecker) checkFeatureDefinitionsDir(summary *CheckSummary, fdPath string) {
	entries, err := os.ReadDir(fdPath)
	if err != nil {
		return
	}

	var yamlFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, "_") {
			continue // Skip helper files
		}
		if strings.HasSuffix(name, ".yaml") || strings.HasSuffix(name, ".yml") {
			yamlFiles = append(yamlFiles, name)
		}
	}

	if len(yamlFiles) == 0 {
		summary.Add(&CheckResult{
			Check:    "feature_definitions_content",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "No feature definition files found",
			Path:     fdPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "feature_definitions_content",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("%d feature definition files found", len(yamlFiles)),
			Path:     fdPath,
			Details:  yamlFiles,
		})
	}
}

func (c *InstanceChecker) checkValueModelsDir(summary *CheckSummary, vmPath string) {
	entries, err := os.ReadDir(vmPath)
	if err != nil {
		return
	}

	var yamlFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".yaml") || strings.HasSuffix(name, ".yml") {
			yamlFiles = append(yamlFiles, name)
		}
	}

	if len(yamlFiles) == 0 {
		summary.Add(&CheckResult{
			Check:    "value_models_content",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "No value model files found",
			Path:     vmPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "value_models_content",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("%d value model files found", len(yamlFiles)),
			Path:     vmPath,
			Details:  yamlFiles,
		})
	}
}

func (c *InstanceChecker) checkMetaFile(summary *CheckSummary) {
	metaPath := filepath.Join(c.instancePath, "_meta.yaml")
	if _, err := os.Stat(metaPath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "meta_file",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "_meta.yaml not found (recommended for instance metadata)",
			Path:     metaPath,
		})
		return
	}

	// Read and validate _meta.yaml
	data, err := os.ReadFile(metaPath)
	if err != nil {
		summary.Add(&CheckResult{
			Check:    "meta_file",
			Passed:   false,
			Severity: SeverityError,
			Message:  fmt.Sprintf("Cannot read _meta.yaml: %v", err),
			Path:     metaPath,
		})
		return
	}

	var meta map[string]interface{}
	if err := yaml.Unmarshal(data, &meta); err != nil {
		summary.Add(&CheckResult{
			Check:    "meta_file",
			Passed:   false,
			Severity: SeverityError,
			Message:  fmt.Sprintf("Invalid YAML in _meta.yaml: %v", err),
			Path:     metaPath,
		})
		return
	}

	// Check for epf_version field
	if _, ok := meta["epf_version"]; !ok {
		summary.Add(&CheckResult{
			Check:    "meta_epf_version",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "_meta.yaml missing epf_version field",
			Path:     metaPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "meta_epf_version",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("EPF version: %v", meta["epf_version"]),
			Path:     metaPath,
		})
	}

	summary.Add(&CheckResult{
		Check:    "meta_file",
		Passed:   true,
		Severity: SeverityInfo,
		Message:  "_meta.yaml present and valid",
		Path:     metaPath,
	})
}

func (c *InstanceChecker) checkFrameworkSeparation(summary *CheckSummary) {
	// Instance should NOT contain framework directories
	frameworkDirs := []string{"schemas", "wizards", "phases", "templates", "definitions"}

	var found []string
	for _, dir := range frameworkDirs {
		dirPath := filepath.Join(c.instancePath, dir)
		if _, err := os.Stat(dirPath); err == nil {
			found = append(found, dir)
		}
	}

	if len(found) > 0 {
		summary.Add(&CheckResult{
			Check:    "framework_separation",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "Instance contains framework directories (should be in docs/EPF/, not instance)",
			Path:     c.instancePath,
			Details:  found,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "framework_separation",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "Instance properly separated from framework",
			Path:     c.instancePath,
		})
	}
}

// ContentReadinessChecker checks for placeholder content
type ContentReadinessChecker struct {
	path string
}

// PlaceholderPatterns are patterns that indicate placeholder/template content
var PlaceholderPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bTBD\b`),
	regexp.MustCompile(`(?i)\bTODO\b`),
	regexp.MustCompile(`(?i)\bFIXME\b`),
	regexp.MustCompile(`(?i)\[INSERT[^\]]*\]`),         // [INSERT something] or [insert something]
	regexp.MustCompile(`(?i)\[PLACEHOLDER[^\]]*\]`),    // [PLACEHOLDER] or [placeholder]
	regexp.MustCompile(`(?i)\[YOUR[^\]]*\]`),           // [YOUR something] or [your something]
	regexp.MustCompile(`(?i)\[[^\]]*\bhere\b[^\]]*\]`), // [... here ...] - brackets with "here" inside
	regexp.MustCompile(`(?i)<INSERT[^>]*>`),            // <INSERT something> or <insert something>
	regexp.MustCompile(`(?i)<PLACEHOLDER[^>]*>`),       // <PLACEHOLDER> or <placeholder>
	regexp.MustCompile(`(?i)<YOUR[^>]*>`),              // <YOUR something> or <your something>
	regexp.MustCompile(`(?i)<[^>]*\bhere\b[^>]*>`),     // <... here ...> - angle brackets with "here" inside
	regexp.MustCompile(`(?i)^example:`),                // Lines starting with "example:" (YAML key)
	regexp.MustCompile(`(?i)\bplaceholder\b`),          // Word "placeholder"
	regexp.MustCompile(`YYYY-MM-DD`),                   // Date placeholder
	regexp.MustCompile(`(?i)lorem ipsum`),              // Lorem ipsum
	regexp.MustCompile(`(?i)your .{1,30} here\b`),      // "your X here" pattern
	regexp.MustCompile(`XXX+`),                         // XXX placeholders
}

// ExclusionPatterns are patterns that should not be flagged as placeholders
var ExclusionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)for example`),
	regexp.MustCompile(`(?i)example.*:`),          // "example usage:"
	regexp.MustCompile(`(?i)TODO comment`),        // Documentation about TODOs
	regexp.MustCompile(`(?i)#.*TODO`),             // Comments mentioning TODO
	regexp.MustCompile(`(?i)placeholder_[a-z]+:`), // "placeholder_text:" as a YAML field name
}

// NewContentReadinessChecker creates a new content readiness checker
func NewContentReadinessChecker(path string) *ContentReadinessChecker {
	return &ContentReadinessChecker{path: path}
}

// PlaceholderMatch represents a found placeholder
type PlaceholderMatch struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Content string `json:"content"`
	Pattern string `json:"pattern"`
}

// ContentReadinessResult contains the result of content readiness check
type ContentReadinessResult struct {
	Path         string             `json:"path"`
	TotalFiles   int                `json:"total_files"`
	FilesChecked int                `json:"files_checked"`
	Score        int                `json:"score"` // 0-100
	Grade        string             `json:"grade"` // A, B, C, D, F
	Placeholders []PlaceholderMatch `json:"placeholders"`
}

// Check runs the content readiness check
func (c *ContentReadinessChecker) Check() (*ContentReadinessResult, error) {
	result := &ContentReadinessResult{
		Path:         c.path,
		Placeholders: make([]PlaceholderMatch, 0),
	}

	// Walk all YAML files
	err := filepath.Walk(c.path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
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
		if strings.HasPrefix(filepath.Base(path), "_") {
			return nil
		}

		result.TotalFiles++

		// Read file and check for placeholders
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		result.FilesChecked++
		lines := strings.Split(string(data), "\n")

		for lineNum, line := range lines {
			// Check exclusions first
			excluded := false
			for _, exc := range ExclusionPatterns {
				if exc.MatchString(line) {
					excluded = true
					break
				}
			}
			if excluded {
				continue
			}

			// Check for placeholders
			for _, pattern := range PlaceholderPatterns {
				if pattern.MatchString(line) {
					result.Placeholders = append(result.Placeholders, PlaceholderMatch{
						File:    path,
						Line:    lineNum + 1,
						Content: strings.TrimSpace(line),
						Pattern: pattern.String(),
					})
					break // Only report one pattern per line
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Calculate score
	if result.FilesChecked > 0 {
		// Base score of 100, minus points for each placeholder
		placeholderPenalty := len(result.Placeholders) * 5
		result.Score = 100 - placeholderPenalty
		if result.Score < 0 {
			result.Score = 0
		}
	}

	// Assign grade
	switch {
	case result.Score >= 90:
		result.Grade = "A"
	case result.Score >= 80:
		result.Grade = "B"
	case result.Score >= 70:
		result.Grade = "C"
	case result.Score >= 60:
		result.Grade = "D"
	default:
		result.Grade = "F"
	}

	return result, nil
}
