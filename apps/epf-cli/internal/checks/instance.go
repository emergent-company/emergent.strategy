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
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
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

	// Check canonical definitions and value models are synced
	c.checkCanonicalCompleteness(summary)

	// Check AIM phase files (LRA)
	c.checkAIMFiles(summary)

	// Check structure location (docs/epf/ vs root)
	c.checkStructureLocation(summary)

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

	// Check optional files (some may be at instance root or READY/)
	var presentOptional []string
	for _, file := range OptionalREADYFiles {
		filePath := filepath.Join(readyPath, file)
		if _, err := os.Stat(filePath); err == nil {
			presentOptional = append(presentOptional, file)
		} else if file == "product_portfolio.yaml" {
			// product_portfolio.yaml can also live at instance root
			rootPath := filepath.Join(c.instancePath, file)
			if _, err := os.Stat(rootPath); err == nil {
				presentOptional = append(presentOptional, file+" (instance root)")
			}
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

	// Check track completeness — EPF requires 4 tracks: Product, Strategy, OrgOps, Commercial
	validTracks := []string{"Product", "Strategy", "OrgOps", "Commercial"}
	loadedTracks := make(map[string]string) // track_name -> filename

	for _, filename := range yamlFiles {
		filePath := filepath.Join(vmPath, filename)
		data, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		// Lightweight parse — only extract track_name
		var vm struct {
			TrackName string `yaml:"track_name"`
		}
		if err := yaml.Unmarshal(data, &vm); err != nil {
			continue
		}
		if vm.TrackName != "" {
			loadedTracks[vm.TrackName] = filename
		}
	}

	var missingTracks []string
	for _, track := range validTracks {
		if _, found := loadedTracks[track]; !found {
			missingTracks = append(missingTracks, track)
		}
	}

	if len(missingTracks) > 0 {
		summary.Add(&CheckResult{
			Check:    "value_models_track_completeness",
			Passed:   false,
			Severity: SeverityWarning,
			Message: fmt.Sprintf(
				"Missing value models for %d of 4 tracks: %s. "+
					"EPF uses 4 braided tracks. Add value model files for missing tracks "+
					"(canonical templates ship with all sub-components set to active: false).",
				len(missingTracks), strings.Join(missingTracks, ", ")),
			Path:    vmPath,
			Details: missingTracks,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "value_models_track_completeness",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("All 4 tracks present: %s", strings.Join(validTracks, ", ")),
			Path:     vmPath,
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

	// Check for epf_version field (can be at top level or under instance.epf_version)
	epfVersion, epfVersionFound := meta["epf_version"]
	if !epfVersionFound {
		// Check nested under instance key (common in newer EPF instances)
		if instance, ok := meta["instance"].(map[string]interface{}); ok {
			epfVersion, epfVersionFound = instance["epf_version"]
		}
	}
	if !epfVersionFound {
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
			Message:  fmt.Sprintf("EPF version: %v", epfVersion),
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

func (c *InstanceChecker) checkCanonicalCompleteness(summary *CheckSummary) {
	// Only check phased instances with a READY directory
	readyDefDir := filepath.Join(c.instancePath, "READY", "definitions")
	if !c.isPhased {
		return
	}

	// Get the expected canonical definitions from embedded manifest
	expectedDefs, err := embedded.ListCanonicalDefinitions()
	if err != nil {
		return // Can't enumerate — skip silently
	}

	expectedVMs := embedded.ListCanonicalValueModels()

	// Count missing definitions
	var missingDefs []string
	missingByTrack := make(map[string]int)
	for _, def := range expectedDefs {
		diskPath := filepath.Join(readyDefDir, def.Path)
		if _, err := os.Stat(diskPath); os.IsNotExist(err) {
			missingDefs = append(missingDefs, def.Path)
			missingByTrack[def.Track]++
		}
	}

	// Count missing value models
	vmDir := filepath.Join(c.instancePath, "FIRE", "value_models")
	var missingVMs []string
	for _, vm := range expectedVMs {
		diskPath := filepath.Join(vmDir, vm.Filename)
		if _, err := os.Stat(diskPath); os.IsNotExist(err) {
			missingVMs = append(missingVMs, vm.Filename)
		}
	}

	totalMissing := len(missingDefs) + len(missingVMs)
	if totalMissing > 0 {
		// Build a detail message showing breakdown by track
		var parts []string
		for track, count := range missingByTrack {
			parts = append(parts, fmt.Sprintf("%s: %d", track, count))
		}
		if len(missingVMs) > 0 {
			parts = append(parts, fmt.Sprintf("value_models: %d", len(missingVMs)))
		}

		msg := fmt.Sprintf(
			"%d canonical artifacts missing (%d definitions, %d value models). Breakdown: %s",
			totalMissing, len(missingDefs), len(missingVMs), strings.Join(parts, ", "),
		)

		summary.Add(&CheckResult{
			Check:    "canonical_completeness",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  msg,
			Path:     c.instancePath,
			Details:  []string{fmt.Sprintf("Run 'epf-cli sync-canonical %s' to add missing canonical artifacts.", c.instancePath)},
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "canonical_completeness",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("All %d canonical artifacts present (%d definitions, %d value models)", len(expectedDefs)+len(expectedVMs), len(expectedDefs), len(expectedVMs)),
			Path:     c.instancePath,
		})
	}
}

func (c *InstanceChecker) checkAIMFiles(summary *CheckSummary) {
	// Check if AIM directory exists
	aimPath := c.getAIMPath()
	if _, err := os.Stat(aimPath); os.IsNotExist(err) {
		// AIM directory doesn't exist - this is already handled in checkPhaseDirectories
		return
	}

	// Check for Living Reality Assessment (LRA)
	lraPath := filepath.Join(aimPath, "living_reality_assessment.yaml")
	if _, err := os.Stat(lraPath); os.IsNotExist(err) {
		summary.Add(&CheckResult{
			Check:    "aim_lra",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "Living Reality Assessment not found. Run 'epf-cli aim bootstrap' to create baseline.",
			Path:     lraPath,
		})
	} else {
		summary.Add(&CheckResult{
			Check:    "aim_lra",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "Living Reality Assessment exists",
			Path:     lraPath,
		})
	}
}

func (c *InstanceChecker) checkStructureLocation(summary *CheckSummary) {
	// Check if instance is in recommended docs/epf/ structure
	absPath, err := filepath.Abs(c.instancePath)
	if err != nil {
		return // Can't determine location
	}

	// Check if path contains docs/epf/ or docs/EPF/
	pathLower := strings.ToLower(absPath)
	if strings.Contains(pathLower, "/docs/epf/_instances/") {
		summary.Add(&CheckResult{
			Check:    "structure_location",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "EPF instance in recommended location (docs/epf/)",
			Path:     absPath,
		})
	} else if strings.Contains(absPath, "/_instances/") {
		// Found at root level
		summary.Add(&CheckResult{
			Check:    "structure_location",
			Passed:   false,
			Severity: SeverityWarning,
			Message:  "EPF instance at root level. Run 'epf-cli migrate-structure' to move to docs/epf/",
			Path:     absPath,
			Details: []string{
				"Recommended: docs/epf/_instances/{product}/",
				"Current: _instances/{product}/ (root level)",
				"Benefits: Separation from code, easier CI/CD exclusion, follows conventions",
			},
		})
	} else {
		// Non-standard location
		summary.Add(&CheckResult{
			Check:    "structure_location",
			Passed:   true,
			Severity: SeverityInfo,
			Message:  "EPF instance in custom location",
			Path:     absPath,
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
	regexp.MustCompile(`(?i)example.*:`),               // "example usage:"
	regexp.MustCompile(`(?i)TODO comment`),             // Documentation about TODOs
	regexp.MustCompile(`(?i)#.*TODO`),                  // Comments mentioning TODO
	regexp.MustCompile(`(?i)placeholder_[a-z]+:`),      // "placeholder_text:" as a YAML field name
	regexp.MustCompile(`(?i)0 TBD`),                    // "0 TBD markers" - metrics about TBD
	regexp.MustCompile(`(?i)TBD markers`),              // Discussing TBD as a concept
	regexp.MustCompile(`(?i)TODO, PLACEHOLDER`),        // Listing terms as documentation
	regexp.MustCompile(`(?i)Detects.*TBD`),             // Feature descriptions about detection
	regexp.MustCompile(`(?i)Detects.*TODO`),            // Feature descriptions about detection
	regexp.MustCompile(`(?i)Detects.*PLACEHOLDER`),     // Feature descriptions about detection
	regexp.MustCompile(`(?i)replacing placeholder`),    // Changelog entries
	regexp.MustCompile(`(?i)placeholder template`),     // Changelog entries
	regexp.MustCompile(`(?i)placeholder content`),      // Feature descriptions
	regexp.MustCompile(`(?i)with placeholder content`), // Baselines describing current state
	regexp.MustCompile(`(?i)\[TODO\] markers`),         // Documentation about markers
}

// NewContentReadinessChecker creates a new content readiness checker
func NewContentReadinessChecker(path string) *ContentReadinessChecker {
	return &ContentReadinessChecker{path: path}
}

// PlaceholderMatch represents a found placeholder
type PlaceholderMatch struct {
	File      string `json:"file"`
	Line      int    `json:"line"`
	Content   string `json:"content"`
	Pattern   string `json:"pattern"`
	FieldPath string `json:"field_path,omitempty"`
}

// yamlPathTracker tracks the current YAML key path by following indentation levels.
type yamlPathTracker struct {
	// stack holds (indent, key) pairs
	stack []yamlPathEntry
}

type yamlPathEntry struct {
	indent int
	key    string
}

// yamlKeyRegexp matches a YAML key at the start of a line (after optional list marker).
var yamlKeyRegexp = regexp.MustCompile(`^(\s*)(-\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:`)

// update processes a line and updates the path stack.
func (t *yamlPathTracker) update(line string) {
	m := yamlKeyRegexp.FindStringSubmatch(line)
	if m == nil {
		return // continuation line, comment, or list value — keep current path
	}
	leadingSpaces := len(m[1])
	hasDash := m[2] != ""
	key := m[3]

	// For list items (- key:), the effective indent for the key is
	// the leading spaces plus the "- " prefix length, so that subsequent
	// keys at the same list item depth are treated as siblings.
	indent := leadingSpaces
	if hasDash {
		indent = leadingSpaces + len(m[2])
	}

	// Pop entries at same or deeper indentation
	for len(t.stack) > 0 && t.stack[len(t.stack)-1].indent >= indent {
		t.stack = t.stack[:len(t.stack)-1]
	}
	t.stack = append(t.stack, yamlPathEntry{indent: indent, key: key})
}

// path returns the current dotted field path (e.g., "north_star.purpose.statement").
func (t *yamlPathTracker) path() string {
	if len(t.stack) == 0 {
		return ""
	}
	parts := make([]string, len(t.stack))
	for i, e := range t.stack {
		parts[i] = e.key
	}
	return strings.Join(parts, ".")
}

// ContentReadinessResult contains the result of content readiness check
type ContentReadinessResult struct {
	Path         string             `json:"path"`
	TotalFiles   int                `json:"total_files"`
	FilesChecked int                `json:"files_checked"`
	Score        int                `json:"score"` // 0-100
	Grade        string             `json:"grade"` // A, B, C, D, F
	Placeholders []PlaceholderMatch `json:"placeholders"`

	// Canonical artifact tracking — canonical files are excluded from scoring
	CanonicalFiles        int                `json:"canonical_files"`
	CanonicalPlaceholders []PlaceholderMatch `json:"canonical_placeholders,omitempty"`
}

// Check runs the content readiness check
func (c *ContentReadinessChecker) Check() (*ContentReadinessResult, error) {
	result := &ContentReadinessResult{
		Path:                  c.path,
		Placeholders:          make([]PlaceholderMatch, 0),
		CanonicalPlaceholders: make([]PlaceholderMatch, 0),
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

		// Detect if this is a canonical artifact
		isCanonical := template.IsCanonicalArtifact(path)
		if isCanonical {
			result.CanonicalFiles++
		}

		// Read file and check for placeholders
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		result.FilesChecked++
		lines := strings.Split(string(data), "\n")

		// Track YAML field path context
		tracker := &yamlPathTracker{}

		for lineNum, line := range lines {
			// Update field path tracker for every line (before exclusion check)
			tracker.update(line)

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
					match := PlaceholderMatch{
						File:      path,
						Line:      lineNum + 1,
						Content:   strings.TrimSpace(line),
						Pattern:   pattern.String(),
						FieldPath: tracker.path(),
					}
					if isCanonical {
						// Track canonical placeholders separately — don't affect score
						result.CanonicalPlaceholders = append(result.CanonicalPlaceholders, match)
					} else {
						result.Placeholders = append(result.Placeholders, match)
					}
					break // Only report one pattern per line
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Calculate score — only based on product (non-canonical) placeholders
	if result.FilesChecked > 0 {
		// Base score of 100, minus points for each product placeholder
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

// =============================================================================
// STALE METADATA DETECTION
// =============================================================================

// MetadataIssue represents a metadata inconsistency in an EPF artifact.
type MetadataIssue struct {
	File      string `json:"file"`
	FieldPath string `json:"field_path"`
	IssueType string `json:"issue_type"` // "wrong_instance" or "stale_date"
	Message   string `json:"message"`
}

// MetadataConsistencyResult contains the result of metadata consistency check.
type MetadataConsistencyResult struct {
	ProductName        string          `json:"product_name"`
	FilesChecked       int             `json:"files_checked"`
	InstanceMismatches int             `json:"instance_mismatches"`
	StaleDates         int             `json:"stale_dates"`
	Issues             []MetadataIssue `json:"issues"`
}

// CheckMetadataConsistency scans READY/ and FIRE/ YAML files for metadata
// inconsistencies:
//   - meta.instance / metadata.instance not matching _epf.yaml product name
//   - meta.last_updated / metadata.last_updated older than staleThresholdMonths
func CheckMetadataConsistency(instancePath, productName string, staleThresholdMonths int) *MetadataConsistencyResult {
	result := &MetadataConsistencyResult{
		ProductName: productName,
		Issues:      make([]MetadataIssue, 0),
	}

	if productName == "" && staleThresholdMonths <= 0 {
		return result
	}

	now := time.Now()
	staleThreshold := now.AddDate(0, -staleThresholdMonths, 0)

	// Scan READY/ and FIRE/ directories (but not AIM/ — AIM has its own staleness checks)
	for _, phase := range []string{"READY", "FIRE"} {
		phaseDir := filepath.Join(instancePath, phase)
		filepath.Walk(phaseDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(path))
			if ext != ".yaml" && ext != ".yml" {
				return nil
			}
			// Skip _ prefixed files (metadata files)
			if strings.HasPrefix(filepath.Base(path), "_") {
				return nil
			}

			data, err := os.ReadFile(path)
			if err != nil {
				return nil
			}

			var doc map[string]interface{}
			if err := yaml.Unmarshal(data, &doc); err != nil {
				return nil
			}

			result.FilesChecked++
			relPath := relativePath(instancePath, path)

			// Check meta.instance or metadata.instance
			checkMetadataInstance(doc, productName, relPath, result)

			// Check meta.last_updated or metadata.last_updated
			if staleThresholdMonths > 0 {
				checkMetadataDate(doc, staleThreshold, staleThresholdMonths, relPath, result)
			}

			return nil
		})
	}

	return result
}

// checkMetadataInstance checks if the instance name in metadata matches the product name.
func checkMetadataInstance(doc map[string]interface{}, productName, relPath string, result *MetadataConsistencyResult) {
	if productName == "" {
		return
	}

	// Try both "meta" and "metadata" top-level keys
	for _, metaKey := range []string{"meta", "metadata"} {
		meta, ok := doc[metaKey].(map[string]interface{})
		if !ok {
			continue
		}

		instanceVal, ok := meta["instance"]
		if !ok {
			continue
		}

		instanceStr, ok := instanceVal.(string)
		if !ok {
			continue
		}

		// Case-insensitive comparison
		if !strings.EqualFold(instanceStr, productName) {
			result.InstanceMismatches++
			result.Issues = append(result.Issues, MetadataIssue{
				File:      relPath,
				FieldPath: metaKey + ".instance",
				IssueType: "wrong_instance",
				Message:   fmt.Sprintf("metadata instance is '%s' but product name is '%s'", instanceStr, productName),
			})
		}
		return // Found instance field, no need to check other meta keys
	}
}

// checkMetadataDate checks if the last_updated date is older than the threshold.
func checkMetadataDate(doc map[string]interface{}, threshold time.Time, months int, relPath string, result *MetadataConsistencyResult) {
	for _, metaKey := range []string{"meta", "metadata"} {
		meta, ok := doc[metaKey].(map[string]interface{})
		if !ok {
			continue
		}

		lastUpdated := extractMetadataDate(meta["last_updated"])
		if lastUpdated.IsZero() {
			continue
		}

		if lastUpdated.Before(threshold) {
			daysSince := int(time.Since(lastUpdated).Hours() / 24)
			result.StaleDates++
			result.Issues = append(result.Issues, MetadataIssue{
				File:      relPath,
				FieldPath: metaKey + ".last_updated",
				IssueType: "stale_date",
				Message:   fmt.Sprintf("last updated %d days ago (threshold: %d months)", daysSince, months),
			})
		}
		return // Found date field, no need to check other meta keys
	}
}

// extractMetadataDate parses a date from YAML (may be string or time.Time).
func extractMetadataDate(val interface{}) time.Time {
	switch v := val.(type) {
	case string:
		// Try ISO date first
		if t, err := time.Parse("2006-01-02", v); err == nil {
			return t
		}
		// Try RFC3339
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t
		}
	case time.Time:
		return v
	}
	return time.Time{}
}

// relativePath returns a path relative to the instance root.
func relativePath(instancePath, fullPath string) string {
	rel, err := filepath.Rel(instancePath, fullPath)
	if err != nil {
		return fullPath
	}
	return rel
}
