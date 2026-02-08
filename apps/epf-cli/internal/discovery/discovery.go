// Package discovery provides EPF instance discovery with confidence scoring.
// It searches for EPF directories using anchor files as the primary indicator,
// with fallback detection for legacy instances.
package discovery

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/anchor"
)

// Confidence levels for discovery results
type Confidence string

const (
	// ConfidenceHigh means anchor file found - definitely an EPF instance
	ConfidenceHigh Confidence = "high"

	// ConfidenceMedium means EPF markers found but no anchor (legacy instance)
	ConfidenceMedium Confidence = "medium"

	// ConfidenceLow means some EPF-like patterns but uncertain
	ConfidenceLow Confidence = "low"

	// ConfidenceNone means not an EPF instance
	ConfidenceNone Confidence = "none"
)

// Status describes the health status of a discovered instance
type Status string

const (
	// StatusValid means the instance has a valid anchor and structure
	StatusValid Status = "valid"

	// StatusLegacy means the instance works but lacks an anchor file
	StatusLegacy Status = "legacy"

	// StatusBroken means the instance has issues (invalid anchor, missing files)
	StatusBroken Status = "broken"

	// StatusNotFound means no EPF instance was found
	StatusNotFound Status = "not-found"
)

// DiscoveryResult represents a found EPF instance
type DiscoveryResult struct {
	// Path is the absolute path to the EPF instance
	Path string `json:"path"`

	// Confidence indicates how certain we are this is an EPF instance
	Confidence Confidence `json:"confidence"`

	// Status indicates the health of the instance
	Status Status `json:"status"`

	// Anchor contains the anchor file data (if found)
	Anchor *anchor.Anchor `json:"anchor,omitempty"`

	// Markers lists the EPF markers found (READY, FIRE, AIM, _meta.yaml)
	Markers []string `json:"markers,omitempty"`

	// Issues lists any problems found with the instance
	Issues []string `json:"issues,omitempty"`

	// Suggestions for fixing issues
	Suggestions []string `json:"suggestions,omitempty"`
}

// DiscoveryOptions configures the discovery process
type DiscoveryOptions struct {
	// MaxDepth is the maximum directory depth to search (default: 5)
	MaxDepth int

	// IncludeLegacy includes instances without anchor files
	IncludeLegacy bool

	// RequireAnchor only returns instances with valid anchor files
	RequireAnchor bool

	// SearchPaths are additional paths to search (besides standard locations)
	SearchPaths []string
}

// DefaultOptions returns default discovery options
func DefaultOptions() *DiscoveryOptions {
	return &DiscoveryOptions{
		MaxDepth:      5,
		IncludeLegacy: true,
		RequireAnchor: false,
	}
}

// Discover searches for EPF instances starting from the given directory
func Discover(startDir string, opts *DiscoveryOptions) ([]*DiscoveryResult, error) {
	if opts == nil {
		opts = DefaultOptions()
	}

	absDir, err := filepath.Abs(startDir)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve path: %w", err)
	}

	var results []*DiscoveryResult

	// Check standard locations first
	standardPaths := getStandardPaths(absDir)
	for _, path := range standardPaths {
		if result := checkPath(path); result != nil {
			if shouldInclude(result, opts) {
				results = append(results, result)
			}
		}
	}

	// Check additional search paths
	for _, path := range opts.SearchPaths {
		absPath, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		if result := checkPath(absPath); result != nil {
			if shouldInclude(result, opts) {
				// Avoid duplicates
				if !containsPath(results, absPath) {
					results = append(results, result)
				}
			}
		}
	}

	// Walk directory tree for additional instances
	if opts.MaxDepth > 0 {
		err = walkForInstances(absDir, opts.MaxDepth, func(result *DiscoveryResult) {
			if shouldInclude(result, opts) && !containsPath(results, result.Path) {
				results = append(results, result)
			}
		})
		if err != nil {
			return results, fmt.Errorf("error during directory walk: %w", err)
		}
	}

	return results, nil
}

// DiscoverSingle finds the single best EPF instance from a starting directory
func DiscoverSingle(startDir string) (*DiscoveryResult, error) {
	results, err := Discover(startDir, DefaultOptions())
	if err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return &DiscoveryResult{
			Path:       startDir,
			Confidence: ConfidenceNone,
			Status:     StatusNotFound,
			Issues:     []string{"No EPF instance found"},
			Suggestions: []string{
				"Run 'epf-cli init' to create a new EPF instance",
				"Ensure you're in a directory containing EPF artifacts",
			},
		}, nil
	}

	// Return the highest confidence result
	best := results[0]
	for _, r := range results[1:] {
		if confidenceRank(r.Confidence) > confidenceRank(best.Confidence) {
			best = r
		}
	}

	return best, nil
}

// CheckPath checks a specific path for EPF instance
func CheckPath(path string) *DiscoveryResult {
	return checkPath(path)
}

// checkPath examines a specific path for EPF markers
func checkPath(path string) *DiscoveryResult {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return nil
	}

	result := &DiscoveryResult{
		Path:    path,
		Markers: []string{},
	}

	// Check for anchor file first (highest confidence)
	if anchor.Exists(path) {
		a, err := anchor.Load(path)
		if err != nil {
			result.Confidence = ConfidenceLow
			result.Status = StatusBroken
			result.Issues = append(result.Issues, fmt.Sprintf("Invalid anchor file: %v", err))
			result.Suggestions = append(result.Suggestions, "Run 'epf-cli fix --anchor' to repair the anchor file")
		} else {
			validation := anchor.Validate(a)
			if validation.Valid {
				result.Confidence = ConfidenceHigh
				result.Status = StatusValid
				result.Anchor = a
			} else {
				result.Confidence = ConfidenceMedium
				result.Status = StatusBroken
				result.Issues = append(result.Issues, validation.Errors...)
				result.Suggestions = append(result.Suggestions, "Run 'epf-cli fix --anchor' to repair the anchor file")
			}
		}
		result.Markers = append(result.Markers, anchor.AnchorFileName)
	}

	// Check for phase directories
	phases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range phases {
		if _, err := os.Stat(filepath.Join(path, phase)); err == nil {
			result.Markers = append(result.Markers, phase)
		}
	}

	// Check for _meta.yaml
	if _, err := os.Stat(filepath.Join(path, "_meta.yaml")); err == nil {
		result.Markers = append(result.Markers, "_meta.yaml")
	}

	// If no anchor but has EPF markers, it's a legacy instance
	if result.Anchor == nil && len(result.Markers) >= 2 {
		if result.Confidence == "" {
			result.Confidence = ConfidenceMedium
			result.Status = StatusLegacy
			result.Issues = append(result.Issues, "Missing anchor file (_epf.yaml)")
			result.Suggestions = append(result.Suggestions, "Run 'epf-cli migrate-anchor' to add anchor file")
		}
	}

	// If only one marker or no markers, low/no confidence
	if result.Confidence == "" {
		if len(result.Markers) == 1 {
			result.Confidence = ConfidenceLow
			result.Status = StatusBroken
			result.Issues = append(result.Issues, "Incomplete EPF structure")
		} else if len(result.Markers) == 0 {
			return nil // Not an EPF directory at all
		}
	}

	return result
}

// getStandardPaths returns standard locations to check for EPF instances
func getStandardPaths(startDir string) []string {
	paths := []string{
		startDir,
		filepath.Join(startDir, "docs", "epf"),
		filepath.Join(startDir, "docs", "EPF"),
	}

	// Check _instances subdirectories
	instanceDirs := []string{
		filepath.Join(startDir, "_instances"),
		filepath.Join(startDir, "docs", "epf", "_instances"),
		filepath.Join(startDir, "docs", "EPF", "_instances"),
	}

	for _, instanceDir := range instanceDirs {
		entries, err := os.ReadDir(instanceDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
				paths = append(paths, filepath.Join(instanceDir, entry.Name()))
			}
		}
	}

	return paths
}

// walkForInstances walks the directory tree looking for EPF instances
func walkForInstances(startDir string, maxDepth int, callback func(*DiscoveryResult)) error {
	return filepath.WalkDir(startDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		if !d.IsDir() {
			return nil
		}

		// Skip hidden directories
		if strings.HasPrefix(d.Name(), ".") {
			return filepath.SkipDir
		}

		// Skip node_modules and similar
		skipDirs := []string{"node_modules", "vendor", "dist", "build", ".git"}
		for _, skip := range skipDirs {
			if d.Name() == skip {
				return filepath.SkipDir
			}
		}

		// Check depth
		rel, _ := filepath.Rel(startDir, path)
		depth := len(strings.Split(rel, string(filepath.Separator)))
		if depth > maxDepth {
			return filepath.SkipDir
		}

		// Check if this is an EPF directory
		if result := checkPath(path); result != nil && result.Confidence != ConfidenceNone {
			callback(result)
		}

		return nil
	})
}

// shouldInclude checks if a result should be included based on options
func shouldInclude(result *DiscoveryResult, opts *DiscoveryOptions) bool {
	if result == nil || result.Confidence == ConfidenceNone {
		return false
	}

	if opts.RequireAnchor && result.Anchor == nil {
		return false
	}

	if !opts.IncludeLegacy && result.Status == StatusLegacy {
		return false
	}

	return true
}

// containsPath checks if results already contain a path
func containsPath(results []*DiscoveryResult, path string) bool {
	for _, r := range results {
		if r.Path == path {
			return true
		}
	}
	return false
}

// confidenceRank returns numeric rank for confidence comparison
func confidenceRank(c Confidence) int {
	switch c {
	case ConfidenceHigh:
		return 3
	case ConfidenceMedium:
		return 2
	case ConfidenceLow:
		return 1
	default:
		return 0
	}
}

// IsFalsePositive checks if a path is likely a false positive EPF match
func IsFalsePositive(path string) bool {
	// Directories that might have "epf" in name but aren't EPF instances
	falsePositivePatterns := []string{
		"epf-cli",       // The CLI tool itself
		"epf-runtime",   // Runtime package
		"canonical-epf", // Framework source
		"test",          // Test directories
		"example",       // Example directories
		"template",      // Template directories
		"node_modules/", // npm packages
		"vendor/",       // Go vendor
		".git/",         // Git internals
		"__pycache__",   // Python cache
		"__tests__",     // Test directories
		"__mocks__",     // Mock directories
	}

	pathLower := strings.ToLower(path)
	for _, pattern := range falsePositivePatterns {
		if strings.Contains(pathLower, pattern) {
			// Unless it has an anchor file, consider it false positive
			if !anchor.Exists(path) {
				return true
			}
		}
	}

	return false
}
