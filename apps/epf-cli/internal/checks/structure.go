// Package checks provides EPF content validation beyond schema validation.
package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// RepositoryType indicates whether the EPF location is canonical or a product repo
type RepositoryType string

const (
	RepoTypeCanonical RepositoryType = "canonical"
	RepoTypeProduct   RepositoryType = "product"
	RepoTypeUnknown   RepositoryType = "unknown"
)

// StructureChecker validates the EPF repository structure based on repo type
type StructureChecker struct {
	epfRoot string // The EPF root directory (e.g., docs/EPF/ or the canonical-epf root)
}

// NewStructureChecker creates a new structure checker
func NewStructureChecker(epfRoot string) *StructureChecker {
	return &StructureChecker{epfRoot: epfRoot}
}

// CanonicalDirectories are directories that should ONLY exist in canonical EPF
var CanonicalDirectories = []string{
	"schemas",
	"templates",
	"scripts",
	"migrations",
	"wizards",
	"outputs",
	"features",
	"definitions",
	"phases",
}

// CanonicalFiles are files that should ONLY exist in canonical EPF
var CanonicalFiles = []string{
	"integration_specification.yaml",
	"VERSION",
	"CANONICAL_PURITY_RULES.md",
	"MAINTENANCE.md",
	"KNOWN_ISSUES.md",
	"MIGRATIONS.md",
}

// StructureResult contains the result of structure validation
type StructureResult struct {
	EPFRoot         string           `json:"epf_root"`
	RepoType        RepositoryType   `json:"repo_type"`
	Valid           bool             `json:"valid"`
	Severity        Severity         `json:"severity"`
	Message         string           `json:"message"`
	Issues          []StructureIssue `json:"issues,omitempty"`
	Recommendations []string         `json:"recommendations,omitempty"`
}

// StructureIssue represents a specific structure problem
type StructureIssue struct {
	Type        string   `json:"type"` // "canonical_content_in_product", "instance_in_canonical", etc.
	Path        string   `json:"path"`
	Description string   `json:"description"`
	ItemCount   int      `json:"item_count,omitempty"` // e.g., number of files in the directory
	Items       []string `json:"items,omitempty"`      // specific items found
}

// Check runs the structure validation
func (c *StructureChecker) Check() *StructureResult {
	result := &StructureResult{
		EPFRoot:  c.epfRoot,
		RepoType: c.detectRepoType(),
		Valid:    true,
		Issues:   make([]StructureIssue, 0),
	}

	switch result.RepoType {
	case RepoTypeCanonical:
		c.checkCanonicalStructure(result)
	case RepoTypeProduct:
		c.checkProductStructure(result)
	default:
		result.Valid = false
		result.Severity = SeverityWarning
		result.Message = "Unable to determine repository type"
		result.Recommendations = append(result.Recommendations,
			"Ensure EPF is properly initialized with 'epf-cli init'")
	}

	// Set final message based on validity
	if result.Valid {
		if result.RepoType == RepoTypeCanonical {
			result.Message = "Canonical EPF structure is valid"
		} else {
			result.Message = "Product repository structure is valid"
		}
		result.Severity = SeverityInfo
	}

	return result
}

// detectRepoType determines if this is canonical EPF or a product repo
func (c *StructureChecker) detectRepoType() RepositoryType {
	// Check for canonical markers at EPF root
	markers := []string{
		"CANONICAL_PURITY_RULES.md",
		"schemas",
		"templates",
		"wizards",
	}

	matchCount := 0
	for _, marker := range markers {
		path := filepath.Join(c.epfRoot, marker)
		if _, err := os.Stat(path); err == nil {
			matchCount++
		}
	}

	// If 3+ markers match, it's canonical EPF
	if matchCount >= 3 {
		return RepoTypeCanonical
	}

	// Check for product repo indicators
	instancesPath := filepath.Join(c.epfRoot, "_instances")
	if info, err := os.Stat(instancesPath); err == nil && info.IsDir() {
		// Has _instances directory - check if it has actual instance content
		entries, err := os.ReadDir(instancesPath)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
					// Found a subdirectory in _instances - likely a product repo
					return RepoTypeProduct
				}
			}
		}
	}

	// Check if we're inside an instance path (e.g., health check on instance directly)
	// Look for READY/FIRE/AIM structure which indicates we're in an instance
	readyPath := filepath.Join(c.epfRoot, "READY")
	firePath := filepath.Join(c.epfRoot, "FIRE")
	if _, err := os.Stat(readyPath); err == nil {
		return RepoTypeProduct
	}
	if _, err := os.Stat(firePath); err == nil {
		return RepoTypeProduct
	}

	return RepoTypeUnknown
}

// checkCanonicalStructure validates canonical EPF repo structure
func (c *StructureChecker) checkCanonicalStructure(result *StructureResult) {
	// In canonical EPF, _instances/ should only contain README or be empty
	instancesPath := filepath.Join(c.epfRoot, "_instances")

	if _, err := os.Stat(instancesPath); err == nil {
		entries, err := os.ReadDir(instancesPath)
		if err == nil {
			var realInstances []string
			for _, e := range entries {
				name := e.Name()
				// Skip README files and hidden files
				if strings.HasPrefix(name, ".") ||
					strings.EqualFold(name, "README.md") ||
					strings.EqualFold(name, "README") {
					continue
				}
				if e.IsDir() {
					realInstances = append(realInstances, name)
				}
			}

			if len(realInstances) > 0 {
				result.Valid = false
				result.Severity = SeverityCritical
				result.Message = "Canonical EPF contains product instances that should not be here"
				result.Issues = append(result.Issues, StructureIssue{
					Type:        "instance_in_canonical",
					Path:        instancesPath,
					Description: fmt.Sprintf("Found %d instance(s) in canonical EPF _instances/ directory", len(realInstances)),
					ItemCount:   len(realInstances),
					Items:       realInstances,
				})
				result.Recommendations = append(result.Recommendations,
					"Product instances should be in their own repositories, not in canonical EPF",
					"Move instance directories to their respective product repositories",
					"The _instances/ directory in canonical EPF should only contain a README.md")
			}
		}
	}

	// Verify required canonical directories exist
	requiredDirs := []string{"schemas", "templates", "wizards"}
	var missingDirs []string
	for _, dir := range requiredDirs {
		path := filepath.Join(c.epfRoot, dir)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			missingDirs = append(missingDirs, dir)
		}
	}

	if len(missingDirs) > 0 {
		result.Valid = false
		result.Severity = SeverityError
		result.Message = "Canonical EPF is missing required directories"
		result.Issues = append(result.Issues, StructureIssue{
			Type:        "missing_canonical_dirs",
			Path:        c.epfRoot,
			Description: fmt.Sprintf("Missing %d required directory(ies)", len(missingDirs)),
			ItemCount:   len(missingDirs),
			Items:       missingDirs,
		})
	}
}

// checkProductStructure validates product repository structure
func (c *StructureChecker) checkProductStructure(result *StructureResult) {
	// In product repos, canonical directories should NOT exist
	var foundCanonicalDirs []string
	var foundCanonicalFiles []string

	// Check for canonical directories
	for _, dir := range CanonicalDirectories {
		path := filepath.Join(c.epfRoot, dir)
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			// Count files in the directory to show scope
			count := countFilesInDir(path)
			foundCanonicalDirs = append(foundCanonicalDirs, fmt.Sprintf("%s (%d files)", dir, count))
		}
	}

	// Check for canonical files
	for _, file := range CanonicalFiles {
		path := filepath.Join(c.epfRoot, file)
		if _, err := os.Stat(path); err == nil {
			foundCanonicalFiles = append(foundCanonicalFiles, file)
		}
	}

	if len(foundCanonicalDirs) > 0 || len(foundCanonicalFiles) > 0 {
		result.Valid = false
		result.Severity = SeverityCritical
		result.Message = "Product repository contains canonical EPF content that should NOT be here"

		if len(foundCanonicalDirs) > 0 {
			result.Issues = append(result.Issues, StructureIssue{
				Type:        "canonical_content_in_product",
				Path:        c.epfRoot,
				Description: "Found canonical framework directories in product repository",
				ItemCount:   len(foundCanonicalDirs),
				Items:       foundCanonicalDirs,
			})
		}

		if len(foundCanonicalFiles) > 0 {
			result.Issues = append(result.Issues, StructureIssue{
				Type:        "canonical_files_in_product",
				Path:        c.epfRoot,
				Description: "Found canonical framework files in product repository",
				ItemCount:   len(foundCanonicalFiles),
				Items:       foundCanonicalFiles,
			})
		}

		result.Recommendations = []string{
			"Product repositories should ONLY contain _instances/{product}/ with your EPF data",
			"The canonical EPF framework (schemas, templates, wizards, etc.) is loaded by epf-cli at runtime",
			"Remove the canonical content directories and files listed above",
			"",
			"To fix this, you have several options:",
			"",
			"  Option 1 (Recommended): Use epf-cli to clean up",
			"    $ epf-cli fix structure --product-repo",
			"",
			"  Option 2: Manual cleanup - remove these directories:",
			fmt.Sprintf("    $ cd %s", c.epfRoot),
		}

		// Add specific rm commands for directories
		for _, dir := range CanonicalDirectories {
			path := filepath.Join(c.epfRoot, dir)
			if _, err := os.Stat(path); err == nil {
				result.Recommendations = append(result.Recommendations,
					fmt.Sprintf("    $ rm -rf %s", dir))
			}
		}

		// Add specific rm commands for files
		for _, file := range CanonicalFiles {
			path := filepath.Join(c.epfRoot, file)
			if _, err := os.Stat(path); err == nil {
				result.Recommendations = append(result.Recommendations,
					fmt.Sprintf("    $ rm %s", file))
			}
		}

		result.Recommendations = append(result.Recommendations,
			"",
			"  After cleanup, keep only:",
			"    _instances/{your-product}/  - Your EPF instance data",
			"    AGENTS.md                   - AI agent instructions (optional)",
			"    README.md                   - Documentation (optional)",
			"",
			"Reference: epf-cli init --help explains that canonical content is NOT copied",
			"Reference: epf-cli config show reveals your canonical_path configuration")
	}

	// Check that _instances has actual content
	instancesPath := filepath.Join(c.epfRoot, "_instances")
	if _, err := os.Stat(instancesPath); os.IsNotExist(err) {
		// No _instances directory - might be checking instance directly
		// Check if READY/FIRE exists (meaning we're inside an instance)
		readyPath := filepath.Join(c.epfRoot, "READY")
		if _, err := os.Stat(readyPath); os.IsNotExist(err) {
			result.Issues = append(result.Issues, StructureIssue{
				Type:        "missing_instances",
				Path:        c.epfRoot,
				Description: "No _instances directory found",
			})
			if result.Valid {
				result.Severity = SeverityWarning
				result.Message = "EPF structure incomplete - missing _instances directory"
			}
		}
	}
}

// countFilesInDir counts files in a directory (non-recursive)
func countFilesInDir(path string) int {
	entries, err := os.ReadDir(path)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() {
			count++
		}
	}
	return count
}

// HasCriticalStructureIssues returns true if there are critical structure problems
func (r *StructureResult) HasCriticalStructureIssues() bool {
	return !r.Valid && r.Severity == SeverityCritical
}

// GetCanonicalContentIssues returns issues related to canonical content in product repos
func (r *StructureResult) GetCanonicalContentIssues() []StructureIssue {
	var issues []StructureIssue
	for _, issue := range r.Issues {
		if issue.Type == "canonical_content_in_product" || issue.Type == "canonical_files_in_product" {
			issues = append(issues, issue)
		}
	}
	return issues
}
