// Package epfcontext provides EPF context detection and instance discovery.
// It understands the three-layer EPF architecture:
//  1. Canonical EPF - Framework only, no product data
//  2. Product Repo EPF - Framework synced via git subtree + product instances
//  3. Instances - Product-specific artifacts in _instances/{product}/
package epfcontext

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"gopkg.in/yaml.v3"
)

// ContextType represents the type of EPF context
type ContextType string

const (
	// ContextCanonical is the canonical EPF repository (no product data)
	ContextCanonical ContextType = "canonical"

	// ContextProductRepo is a product repository with EPF synced via subtree
	ContextProductRepo ContextType = "product-repo"

	// ContextInstance is inside an EPF instance directory
	ContextInstance ContextType = "instance"

	// ContextUnknown means we couldn't determine the context
	ContextUnknown ContextType = "unknown"
)

// Context represents the detected EPF context
type Context struct {
	// Type of context (canonical, product-repo, instance, unknown)
	Type ContextType `json:"type"`

	// EPFRoot is the root of the EPF framework (docs/EPF/ in product repos)
	EPFRoot string `json:"epf_root,omitempty"`

	// SchemasDir is the path to the schemas directory
	SchemasDir string `json:"schemas_dir,omitempty"`

	// InstancesDir is the path to the _instances directory
	InstancesDir string `json:"instances_dir,omitempty"`

	// Instances is a list of discovered instance names
	Instances []string `json:"instances,omitempty"`

	// CurrentInstance is the auto-detected or specified instance
	CurrentInstance string `json:"current_instance,omitempty"`

	// InstancePath is the full path to the current instance
	InstancePath string `json:"instance_path,omitempty"`

	// RepoRoot is the root of the git repository (if detected)
	RepoRoot string `json:"repo_root,omitempty"`
}

// InstanceMeta represents the _meta.yaml file in an instance
type InstanceMeta struct {
	Instance struct {
		ProductName     string `yaml:"product_name"`
		EPFVersion      string `yaml:"epf_version"`
		InstanceVersion string `yaml:"instance_version"`
	} `yaml:"instance"`

	// Legacy format support
	EPFVersion   string `yaml:"epf_version"`
	InstanceName string `yaml:"instance_name"`
}

// Detect detects the EPF context from a given starting directory
func Detect(startDir string) (*Context, error) {
	ctx := &Context{
		Type: ContextUnknown,
	}

	// Convert to absolute path
	absDir, err := filepath.Abs(startDir)
	if err != nil {
		return ctx, fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Find the EPF root
	epfRoot, err := findEPFRoot(absDir)
	if err != nil {
		// Check if we're inside an instance directly
		if isInstanceDir(absDir) {
			ctx.Type = ContextInstance
			ctx.InstancePath = absDir
			ctx.CurrentInstance = filepath.Base(absDir)
			// Try to find EPF root from instance
			epfRoot, _ = findEPFRootFromInstance(absDir)
			if epfRoot != "" {
				ctx.EPFRoot = epfRoot
				// Only set SchemasDir if schemas/ actually exists on disk
				schemasDir := filepath.Join(epfRoot, "schemas")
				if _, errS := os.Stat(schemasDir); errS == nil {
					ctx.SchemasDir = schemasDir
				}
				ctx.InstancesDir = filepath.Join(epfRoot, "_instances")
			}
			return ctx, nil
		}
		return ctx, fmt.Errorf("not in an EPF context: %w", err)
	}

	ctx.EPFRoot = epfRoot
	// Only set SchemasDir if schemas/ actually exists on disk
	schemasDir := filepath.Join(epfRoot, "schemas")
	if _, err := os.Stat(schemasDir); err == nil {
		ctx.SchemasDir = schemasDir
	}
	ctx.InstancesDir = filepath.Join(epfRoot, "_instances")

	// Find repo root (go up until we find .git)
	ctx.RepoRoot = findRepoRoot(epfRoot)

	// Detect context type by examining _instances directory
	instances, err := discoverInstances(ctx.InstancesDir)
	if err == nil {
		ctx.Instances = instances
	}

	// Determine context type
	if len(instances) == 0 {
		ctx.Type = ContextCanonical
	} else {
		ctx.Type = ContextProductRepo

		// Auto-select instance if only one exists
		if len(instances) == 1 {
			ctx.CurrentInstance = instances[0]
			ctx.InstancePath = filepath.Join(ctx.InstancesDir, instances[0])
		}
	}

	// Check if we're inside an instance
	if strings.HasPrefix(absDir, ctx.InstancesDir) {
		rel, _ := filepath.Rel(ctx.InstancesDir, absDir)
		parts := strings.Split(rel, string(filepath.Separator))
		if len(parts) > 0 && parts[0] != "." && parts[0] != "" {
			ctx.Type = ContextInstance
			ctx.CurrentInstance = parts[0]
			ctx.InstancePath = filepath.Join(ctx.InstancesDir, parts[0])
		}
	}

	return ctx, nil
}

// DetectFromCwd detects context from the current working directory
func DetectFromCwd() (*Context, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("failed to get current directory: %w", err)
	}
	return Detect(cwd)
}

// WithInstance returns a new context with the specified instance selected
func (c *Context) WithInstance(instanceName string) (*Context, error) {
	// Check if instance exists
	found := false
	for _, inst := range c.Instances {
		if inst == instanceName {
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("instance '%s' not found. Available: %v", instanceName, c.Instances)
	}

	newCtx := *c
	newCtx.CurrentInstance = instanceName
	newCtx.InstancePath = filepath.Join(c.InstancesDir, instanceName)
	return &newCtx, nil
}

// RequireInstance ensures an instance is selected, returning an error if not
func (c *Context) RequireInstance() error {
	if c.CurrentInstance == "" {
		if len(c.Instances) == 0 {
			return fmt.Errorf("no instances found in %s", c.InstancesDir)
		}
		return fmt.Errorf("multiple instances found, please specify one: %v", c.Instances)
	}
	return nil
}

// GetInstanceMeta reads the _meta.yaml for the current instance
func (c *Context) GetInstanceMeta() (*InstanceMeta, error) {
	if c.InstancePath == "" {
		return nil, fmt.Errorf("no instance selected")
	}

	metaPath := filepath.Join(c.InstancePath, "_meta.yaml")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read instance meta: %w", err)
	}

	meta := &InstanceMeta{}
	if err := yaml.Unmarshal(data, meta); err != nil {
		return nil, fmt.Errorf("failed to parse instance meta: %w", err)
	}

	return meta, nil
}

// IsCanonical returns true if this is the canonical EPF repository
func (c *Context) IsCanonical() bool {
	return c.Type == ContextCanonical
}

// IsProductRepo returns true if this is a product repository
func (c *Context) IsProductRepo() bool {
	return c.Type == ContextProductRepo || c.Type == ContextInstance
}

// HasInstance returns true if an instance is available/selected
func (c *Context) HasInstance() bool {
	return c.InstancePath != ""
}

// String returns a human-readable description of the context
func (c *Context) String() string {
	switch c.Type {
	case ContextCanonical:
		return fmt.Sprintf("Canonical EPF at %s", c.EPFRoot)
	case ContextProductRepo:
		if c.CurrentInstance != "" {
			return fmt.Sprintf("Product repo with instance '%s' at %s", c.CurrentInstance, c.InstancePath)
		}
		return fmt.Sprintf("Product repo at %s with %d instances: %v", c.EPFRoot, len(c.Instances), c.Instances)
	case ContextInstance:
		return fmt.Sprintf("Instance '%s' at %s", c.CurrentInstance, c.InstancePath)
	default:
		return "Unknown EPF context"
	}
}

// findEPFRoot searches for the EPF root directory.
// An EPF root is a directory that contains _instances/ OR schemas/.
// The schemas/ requirement has been removed to support consumer repos
// where EPF is used as a submodule (no local schemas/ directory).
func findEPFRoot(startDir string) (string, error) {
	// Check common locations relative to startDir
	searchPaths := []string{
		startDir,
		filepath.Join(startDir, "docs", "EPF"),
		filepath.Join(startDir, "docs", "epf"),
		filepath.Join(startDir, "..", "docs", "EPF"),
		filepath.Join(startDir, "..", "docs", "epf"),
		filepath.Join(startDir, "..", "..", "docs", "EPF"),
		filepath.Join(startDir, "..", "..", "..", "docs", "EPF"),
	}

	for _, path := range searchPaths {
		if isEPFRoot(path) {
			return filepath.Abs(path)
		}
	}

	// Walk up looking for docs/EPF or docs/epf
	current := startDir
	for i := 0; i < 10; i++ { // Limit depth
		for _, epfDir := range []string{"docs/EPF", "docs/epf"} {
			candidate := filepath.Join(current, epfDir)
			if isEPFRoot(candidate) {
				return filepath.Abs(candidate)
			}
		}

		// Check if current directory is itself an EPF root
		if isEPFRoot(current) {
			return filepath.Abs(current)
		}

		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}

	return "", fmt.Errorf("could not find EPF root directory")
}

// isEPFRoot checks if a directory qualifies as an EPF root.
// A directory is an EPF root if it contains _instances/ OR schemas/.
func isEPFRoot(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	// Has _instances/ directory
	if _, err := os.Stat(filepath.Join(path, "_instances")); err == nil {
		return true
	}
	// Has schemas/ directory (integrated repo with framework)
	if _, err := os.Stat(filepath.Join(path, "schemas")); err == nil {
		return true
	}
	return false
}

// findEPFRootFromInstance finds EPF root when starting from an instance directory.
// Instance is typically at docs/EPF/_instances/{name}, so EPF root is ../../
func findEPFRootFromInstance(instanceDir string) (string, error) {
	epfRoot := filepath.Join(instanceDir, "..", "..")
	if isEPFRoot(epfRoot) {
		return filepath.Abs(epfRoot)
	}
	return "", fmt.Errorf("could not find EPF root from instance")
}

// findRepoRoot finds the git repository root
func findRepoRoot(startDir string) string {
	current := startDir
	for i := 0; i < 20; i++ {
		gitDir := filepath.Join(current, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return ""
}

// discoverInstances finds all instance directories using the shared discovery system.
// It delegates to discovery.Discover() for robust instance detection with anchor file
// and phase marker support, then extracts instance names from the results.
func discoverInstances(instancesDir string) ([]string, error) {
	info, err := os.Stat(instancesDir)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("instances directory not found: %s", instancesDir)
	}

	opts := discovery.DefaultOptions()
	opts.MaxDepth = 1 // Only look at direct children of _instances/

	results, err := discovery.Discover(instancesDir, opts)
	if err != nil {
		return nil, err
	}

	var instances []string
	for _, result := range results {
		if result.Confidence == discovery.ConfidenceNone {
			continue
		}
		name := filepath.Base(result.Path)
		// Skip hidden directories and special files
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
			continue
		}
		instances = append(instances, name)
	}

	return instances, nil
}

// isInstanceDir checks if a directory is a valid EPF instance
func isInstanceDir(dir string) bool {
	// Check for anchor file (_epf.yaml)
	if _, err := os.Stat(filepath.Join(dir, "_epf.yaml")); err == nil {
		return true
	}

	// Check for at least one phase directory
	phases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range phases {
		if _, err := os.Stat(filepath.Join(dir, phase)); err == nil {
			return true
		}
	}

	// Also check for _meta.yaml
	if _, err := os.Stat(filepath.Join(dir, "_meta.yaml")); err == nil {
		return true
	}

	return false
}
