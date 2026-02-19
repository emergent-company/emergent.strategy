package embedded

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// SyncOptions controls sync behavior.
type SyncOptions struct {
	Force  bool // Overwrite existing files
	DryRun bool // Preview without writing
}

// SyncResult tracks what happened during sync.
type SyncResult struct {
	Added   []string // Files that were created
	Skipped []string // Files that already existed (not overwritten)
	Updated []string // Files that were overwritten (force mode)
	Errors  []string // Files that failed
}

// TotalChanged returns the number of files that were added or updated.
func (r *SyncResult) TotalChanged() int {
	return len(r.Added) + len(r.Updated)
}

// SyncCanonical copies all missing canonical artifacts (definitions + value models)
// to an existing EPF instance. By default, existing files are skipped.
// Use Force to overwrite, DryRun to preview.
func SyncCanonical(instanceDir string, opts SyncOptions) (*SyncResult, error) {
	result := &SyncResult{}

	// Verify instance exists
	if _, err := os.Stat(filepath.Join(instanceDir, "READY")); os.IsNotExist(err) {
		return nil, fmt.Errorf("not a valid EPF instance (no READY directory): %s", instanceDir)
	}

	// Sync canonical definitions
	if err := syncDefinitions(instanceDir, opts, result); err != nil {
		return result, fmt.Errorf("syncing definitions: %w", err)
	}

	// Sync canonical value models
	if err := syncValueModels(instanceDir, opts, result); err != nil {
		return result, fmt.Errorf("syncing value models: %w", err)
	}

	return result, nil
}

func syncDefinitions(instanceDir string, opts SyncOptions, result *SyncResult) error {
	defs, err := ListCanonicalDefinitions()
	if err != nil {
		return err
	}
	if len(defs) == 0 {
		return nil // No embedded definitions available
	}

	defsDir := filepath.Join(instanceDir, "READY", "definitions")

	for _, def := range defs {
		dstDir := filepath.Join(defsDir, def.Track)
		if def.Category != "" {
			dstDir = filepath.Join(dstDir, def.Category)
		}

		dst := filepath.Join(dstDir, def.Filename)
		exists := fileExists(dst)

		if exists && !opts.Force {
			result.Skipped = append(result.Skipped, dst)
			continue
		}

		if opts.DryRun {
			if exists {
				result.Updated = append(result.Updated, dst)
			} else {
				result.Added = append(result.Added, dst)
			}
			continue
		}

		if err := os.MkdirAll(dstDir, 0755); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dst, err))
			continue
		}

		content, err := GetCanonicalDefinition(def.Filename)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dst, err))
			continue
		}

		if err := os.WriteFile(dst, content, 0644); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dst, err))
			continue
		}

		if exists {
			result.Updated = append(result.Updated, dst)
		} else {
			result.Added = append(result.Added, dst)
		}
	}

	return nil
}

// canonicalValueModels are the canonical track value model filenames.
// Product value models are NOT canonical -- they are user-authored.
var canonicalValueModels = []string{
	"strategy.value_model.yaml",
	"org_ops.value_model.yaml",
	"commercial.value_model.yaml",
}

// CanonicalValueModelInfo holds metadata about an embedded canonical value model.
type CanonicalValueModelInfo struct {
	Filename string // e.g., "strategy.value_model.yaml"
	Track    string // e.g., "strategy"
}

// ListCanonicalValueModels returns metadata for all embedded canonical value models.
func ListCanonicalValueModels() []CanonicalValueModelInfo {
	var models []CanonicalValueModelInfo
	for _, filename := range canonicalValueModels {
		track := strings.TrimSuffix(filename, ".value_model.yaml")
		models = append(models, CanonicalValueModelInfo{
			Filename: filename,
			Track:    track,
		})
	}
	return models
}

// GetCanonicalValueModel returns the content of an embedded canonical value model template.
func GetCanonicalValueModel(filename string) ([]byte, error) {
	templatePath := path.Join("FIRE", "value_models", filename)
	return GetTemplate(templatePath)
}

func syncValueModels(instanceDir string, opts SyncOptions, result *SyncResult) error {
	vmDir := filepath.Join(instanceDir, "FIRE", "value_models")

	// Check FIRE/value_models exists
	if _, err := os.Stat(filepath.Join(instanceDir, "FIRE")); os.IsNotExist(err) {
		return nil // No FIRE directory, skip
	}

	for _, vm := range ListCanonicalValueModels() {
		dst := filepath.Join(vmDir, vm.Filename)
		exists := fileExists(dst)

		if exists && !opts.Force {
			result.Skipped = append(result.Skipped, dst)
			continue
		}

		if opts.DryRun {
			if exists {
				result.Updated = append(result.Updated, dst)
			} else {
				result.Added = append(result.Added, dst)
			}
			continue
		}

		if err := os.MkdirAll(vmDir, 0755); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dst, err))
			continue
		}

		content, err := GetCanonicalValueModel(vm.Filename)
		if err != nil {
			// Value model template may not exist in embedded FS
			// This is not an error -- it just means we can't sync it
			continue
		}

		if err := os.WriteFile(dst, content, 0644); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dst, err))
			continue
		}

		if exists {
			result.Updated = append(result.Updated, dst)
		} else {
			result.Added = append(result.Added, dst)
		}
	}

	return nil
}

// ListCanonicalArtifacts returns a combined count of all embedded canonical artifacts.
func ListCanonicalArtifacts() (definitions int, valueModels int, err error) {
	defs, err := ListCanonicalDefinitions()
	if err != nil {
		return 0, 0, err
	}

	// Count value models that actually exist in embedded FS
	vmCount := 0
	vmFS, fsErr := fs.Sub(Templates, "templates/FIRE/value_models")
	if fsErr == nil {
		for _, vm := range canonicalValueModels {
			if _, err := fs.Stat(vmFS, vm); err == nil {
				vmCount++
			}
		}
	}

	return len(defs), vmCount, nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
