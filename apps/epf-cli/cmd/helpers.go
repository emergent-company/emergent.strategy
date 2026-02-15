package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/epfcontext"
)

// Global variables for config and context
var (
	cliConfig  *config.Config
	epfContext *epfcontext.Context
)

// InitGlobals initializes the global config and context
func InitGlobals() error {
	var err error
	cliConfig, err = config.Load()
	if err != nil {
		// Non-fatal - config may not exist yet
		cliConfig = &config.Config{}
	}

	// Try to detect context from current directory
	cwd, err := os.Getwd()
	if err == nil {
		epfContext, _ = epfcontext.Detect(cwd)
	}

	return nil
}

// GetSchemasDir returns the path to the schemas directory.
// Returns empty string if no filesystem schemas are found (embedded fallback may be used).
func GetSchemasDir() (string, error) {
	// Priority 1: --schemas-dir flag (if we add it)
	// For now, skip this

	// Priority 2: canonical_path from config
	if cliConfig != nil && cliConfig.CanonicalPath != "" {
		schemasPath := filepath.Join(cliConfig.CanonicalPath, "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			return schemasPath, nil
		}
	}

	// Priority 3: detected EPF context
	if epfContext != nil && epfContext.EPFRoot != "" {
		schemasPath := filepath.Join(epfContext.EPFRoot, "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			return schemasPath, nil
		}
	}

	// Priority 4: look relative to current directory
	cwd, err := os.Getwd()
	if err == nil {
		// Try docs/EPF/schemas
		schemasPath := filepath.Join(cwd, "docs", "EPF", "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			return schemasPath, nil
		}
		// Try EPF/schemas
		schemasPath = filepath.Join(cwd, "EPF", "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			return schemasPath, nil
		}
		// Try schemas
		schemasPath = filepath.Join(cwd, "schemas")
		if _, err := os.Stat(schemasPath); err == nil {
			return schemasPath, nil
		}
	}

	// Return empty string - the schema loader will fall back to embedded
	return "", nil
}

// GetInstancePath returns the path to the current EPF instance
// Accepts either nil, a *string, or []string for flexibility
func GetInstancePath(arg interface{}) (string, error) {
	// Extract instance name from different argument types
	var instanceName string
	switch v := arg.(type) {
	case nil:
		// No instance specified
	case *string:
		if v != nil {
			instanceName = *v
		}
	case []string:
		if len(v) > 0 {
			instanceName = v[0]
		}
	case string:
		instanceName = v
	}

	// If instance name/path provided, look for it
	if instanceName != "" {
		// First check if it's already a valid path (absolute or relative)
		if _, err := os.Stat(instanceName); err == nil {
			absPath, _ := filepath.Abs(instanceName)
			return absPath, nil
		}

		// Try to find in detected context
		if epfContext != nil && epfContext.EPFRoot != "" {
			instancePath := filepath.Join(epfContext.EPFRoot, "_instances", instanceName)
			if _, err := os.Stat(instancePath); err == nil {
				return instancePath, nil
			}
		}
		// Try relative path
		cwd, _ := os.Getwd()
		var foundAtRoot bool
		var rootInstancePath string

		for _, base := range []string{
			filepath.Join(cwd, "docs", "EPF", "_instances"),
			filepath.Join(cwd, "docs", "epf", "_instances"),
			filepath.Join(cwd, "_instances"),
		} {
			instancePath := filepath.Join(base, instanceName)
			if _, err := os.Stat(instancePath); err == nil {
				// Check if this is root-level
				if base == filepath.Join(cwd, "_instances") {
					foundAtRoot = true
					rootInstancePath = instancePath
					continue // Keep looking for docs/epf/ version
				}

				return instancePath, nil
			}
		}

		// If only found at root, return it with a warning
		if foundAtRoot && rootInstancePath != "" {
			fmt.Fprintf(os.Stderr, "\n⚠️  Warning: EPF found at root level\n\n")
			fmt.Fprintf(os.Stderr, "EPF artifacts should be under docs/epf/ for better organization.\n")
			fmt.Fprintf(os.Stderr, "This keeps documentation separate from code and makes it easier to\n")
			fmt.Fprintf(os.Stderr, "exclude from CI/CD processes.\n\n")
			fmt.Fprintf(os.Stderr, "Run: epf-cli migrate-structure\n\n")
			return rootInstancePath, nil
		}

		return "", fmt.Errorf("instance '%s' not found", instanceName)
	}

	// No instance name - try to auto-detect
	if epfContext != nil && epfContext.InstancePath != "" {
		return epfContext.InstancePath, nil
	}

	// Delegate to discovery.DiscoverSingle() for robust auto-detection
	cwd, _ := os.Getwd()
	result, err := discovery.DiscoverSingle(cwd)
	if err != nil {
		return "", fmt.Errorf("could not find EPF instance: %w", err)
	}
	if result.Confidence != discovery.ConfidenceNone && result.Status != discovery.StatusNotFound {
		return result.Path, nil
	}

	return "", fmt.Errorf("could not find EPF instance. Use --instance to specify")
}

// GetContext returns the detected EPF context
func GetContext() *epfcontext.Context {
	return epfContext
}

// PrintContext prints the detected EPF context
func PrintContext() {
	if epfContext == nil {
		fmt.Println("Not in an EPF directory")
		return
	}

	fmt.Println("Detected EPF Context:")
	fmt.Printf("  Type:      %s\n", epfContext.Type)
	if epfContext.EPFRoot != "" {
		fmt.Printf("  EPF Root:  %s\n", epfContext.EPFRoot)
	}
	if len(epfContext.Instances) > 0 {
		fmt.Printf("  Instances: %v\n", epfContext.Instances)
	}
	if epfContext.CurrentInstance != "" {
		fmt.Printf("  Current:   %s\n", epfContext.CurrentInstance)
		fmt.Printf("  Path:      %s\n", epfContext.InstancePath)
	}
}

// IsCanonicalEPF checks if the given directory (or cwd if empty) is the canonical EPF repo.
// Canonical EPF is identified by having these markers:
// - CANONICAL_PURITY_RULES.md at root
// - schemas/ directory at root (not nested in docs/EPF/)
// - templates/ directory at root
// - wizards/ directory at root
func IsCanonicalEPF(dir string) bool {
	if dir == "" {
		var err error
		dir, err = os.Getwd()
		if err != nil {
			return false
		}
	}

	// PRIORITY 1: Check for product indicators FIRST
	// If _instances has actual product subdirectories (not just README), it's a product repo
	instancesPath := filepath.Join(dir, "_instances")
	if info, err := os.Stat(instancesPath); err == nil && info.IsDir() {
		entries, err := os.ReadDir(instancesPath)
		if err == nil {
			for _, e := range entries {
				// Skip README.md and hidden files
				if strings.HasPrefix(e.Name(), ".") ||
					strings.EqualFold(e.Name(), "README.md") ||
					strings.EqualFold(e.Name(), "README") {
					continue
				}
				if e.IsDir() {
					// Found a real product instance - not canonical EPF
					return false
				}
			}
		}
	}

	// PRIORITY 2: Check for canonical markers
	// Only if we confirmed there are NO product instances
	markers := []string{
		"CANONICAL_PURITY_RULES.md",
		"schemas",
		"templates",
		"wizards",
	}

	matchCount := 0
	for _, marker := range markers {
		path := filepath.Join(dir, marker)
		if _, err := os.Stat(path); err == nil {
			matchCount++
		}
	}

	// If 3+ markers match AND no product instances, it's canonical EPF
	return matchCount >= 3
}

// IsCanonicalEPFPath checks if the given path is inside the canonical EPF repo
func IsCanonicalEPFPath(path string) bool {
	if path == "" {
		return false
	}

	// Get absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	// Check if the configured canonical_path is a prefix of this path
	if cliConfig != nil && cliConfig.CanonicalPath != "" {
		canonicalAbs, err := filepath.Abs(cliConfig.CanonicalPath)
		if err == nil {
			// Normalize paths
			canonicalAbs = filepath.Clean(canonicalAbs)
			absPath = filepath.Clean(absPath)

			// Check if path is inside canonical
			if strings.HasPrefix(absPath, canonicalAbs+string(filepath.Separator)) || absPath == canonicalAbs {
				return true
			}
		}
	}

	// Walk up to find canonical markers
	current := absPath
	for {
		if IsCanonicalEPF(current) {
			return true
		}
		parent := filepath.Dir(current)
		if parent == current {
			break // Reached root
		}
		current = parent
	}

	return false
}

// EnsureNotCanonical returns an error if the current directory is canonical EPF.
// This should be called before any write operations.
// If DevMode is enabled, this check is bypassed with a warning printed to stderr.
func EnsureNotCanonical(operation string) error {
	if !IsCanonicalEPF("") {
		return nil
	}

	if DevMode {
		fmt.Fprintf(os.Stderr, "⚠️  Developer mode: allowing %s in canonical EPF\n", operation)
		return nil
	}

	return fmt.Errorf("refusing to %s in canonical EPF repository\n\n"+
		"The current directory appears to be the canonical EPF framework repository.\n"+
		"Write operations are not allowed here to preserve framework integrity.\n\n"+
		"If you want to work with EPF:\n"+
		"  1. Create or navigate to a product repository\n"+
		"  2. Run 'epf-cli init <product-name>' to set up EPF there\n\n"+
		"If you are developing EPF itself, use --dev flag:\n"+
		"  epf-cli --dev %s ...\n\n"+
		"Canonical EPF location: %s", operation, operation, mustGetCwd())
}

// EnsurePathNotCanonical returns an error if the given path is inside canonical EPF.
// If DevMode is enabled, this check is bypassed with a warning printed to stderr.
func EnsurePathNotCanonical(path, operation string) error {
	if !IsCanonicalEPFPath(path) {
		return nil
	}

	if DevMode {
		fmt.Fprintf(os.Stderr, "⚠️  Developer mode: allowing %s in canonical EPF path: %s\n", operation, path)
		return nil
	}

	return fmt.Errorf("refusing to %s in canonical EPF repository\n\n"+
		"The target path '%s' is inside the canonical EPF framework.\n"+
		"Write operations are not allowed there to preserve framework integrity.\n\n"+
		"Use a path in your product repository instead.\n\n"+
		"If you are developing EPF itself, use --dev flag:\n"+
		"  epf-cli --dev %s ...", operation, path, operation)
}

func mustGetCwd() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "(unknown)"
	}
	return cwd
}

func init() {
	// Initialize globals when package loads
	InitGlobals()
}
