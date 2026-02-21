package migration

import (
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// DefinitionMove represents a single file move during migration.
type DefinitionMove struct {
	OldPath string `json:"old_path"`
	NewPath string `json:"new_path"`
}

// DefinitionMigrationResult captures what happened during migration.
type DefinitionMigrationResult struct {
	InstancePath string           `json:"instance_path"`
	DryRun       bool             `json:"dry_run"`
	Moves        []DefinitionMove `json:"moves"`
	Warnings     []string         `json:"warnings,omitempty"`
	IsSubmodule  bool             `json:"is_submodule"`
	SubmoduleURL string           `json:"submodule_url,omitempty"`
	NeedsMigrate bool             `json:"needs_migrate"`
}

// oldPathMappings maps old directory locations to new locations (relative to instance root).
var oldPathMappings = []struct {
	OldDir string
	NewDir string
}{
	{"FIRE/feature_definitions", "FIRE/definitions/product"},
	{"READY/definitions/strategy", "FIRE/definitions/strategy"},
	{"READY/definitions/org_ops", "FIRE/definitions/org_ops"},
	{"READY/definitions/commercial", "FIRE/definitions/commercial"},
}

// DetectDefinitionMigration checks whether an instance needs definition migration.
// Returns the planned moves without applying them.
func DetectDefinitionMigration(instancePath string) (*DefinitionMigrationResult, error) {
	absPath, err := filepath.Abs(instancePath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve path: %w", err)
	}

	result := &DefinitionMigrationResult{
		InstancePath: absPath,
		DryRun:       true,
	}

	// Check submodule status
	result.IsSubmodule, result.SubmoduleURL = detectSubmodule(absPath)

	// Scan for files that need moving
	for _, mapping := range oldPathMappings {
		oldDir := filepath.Join(absPath, mapping.OldDir)
		info, err := os.Stat(oldDir)
		if err != nil || !info.IsDir() {
			continue
		}

		// Walk the old directory and plan moves
		err = filepath.WalkDir(oldDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}

			relPath, _ := filepath.Rel(oldDir, path)
			newPath := filepath.Join(absPath, mapping.NewDir, relPath)

			result.Moves = append(result.Moves, DefinitionMove{
				OldPath: filepath.Join(mapping.OldDir, relPath),
				NewPath: filepath.Join(mapping.NewDir, relPath),
			})

			// Check for conflicts
			if _, err := os.Stat(newPath); err == nil {
				result.Warnings = append(result.Warnings,
					fmt.Sprintf("File already exists at destination: %s", filepath.Join(mapping.NewDir, relPath)))
			}

			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("failed to scan %s: %w", mapping.OldDir, err)
		}
	}

	result.NeedsMigrate = len(result.Moves) > 0
	return result, nil
}

// MigrateDefinitions moves definition files from old locations to new unified FIRE/definitions/ structure.
// If dryRun is true, only reports what would happen.
func MigrateDefinitions(instancePath string, dryRun bool) (*DefinitionMigrationResult, error) {
	result, err := DetectDefinitionMigration(instancePath)
	if err != nil {
		return nil, err
	}
	result.DryRun = dryRun

	if !result.NeedsMigrate {
		return result, nil
	}

	// If submodule and not dry-run, refuse
	if result.IsSubmodule && !dryRun {
		remoteInfo := ""
		if result.SubmoduleURL != "" {
			remoteInfo = fmt.Sprintf("\n\nSubmodule remote: %s", result.SubmoduleURL)
		}
		return result, fmt.Errorf(
			"this instance is a git submodule and cannot be migrated from the consumer repo.\n\n"+
				"To migrate, clone the submodule source repo directly and run:\n"+
				"  epf-cli migrate definitions . \n\n"+
				"Then update the submodule pointer in this repo:\n"+
				"  git submodule update --remote %s%s",
			instancePath, remoteInfo)
	}

	if dryRun {
		return result, nil
	}

	// Execute the moves
	absPath, _ := filepath.Abs(instancePath)
	dirsToClean := map[string]bool{}

	for _, move := range result.Moves {
		oldAbs := filepath.Join(absPath, move.OldPath)
		newAbs := filepath.Join(absPath, move.NewPath)

		// Ensure target directory exists
		if err := os.MkdirAll(filepath.Dir(newAbs), 0o755); err != nil {
			return result, fmt.Errorf("failed to create directory for %s: %w", move.NewPath, err)
		}

		// Check for conflict
		if _, err := os.Stat(newAbs); err == nil {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("Skipped %s: file already exists at %s", move.OldPath, move.NewPath))
			continue
		}

		// Move the file
		if err := os.Rename(oldAbs, newAbs); err != nil {
			return result, fmt.Errorf("failed to move %s → %s: %w", move.OldPath, move.NewPath, err)
		}

		// Track the old parent directory for cleanup
		dirsToClean[filepath.Dir(oldAbs)] = true
	}

	// Clean up empty source directories (deepest first)
	for dir := range dirsToClean {
		removeEmptyDirs(dir, absPath)
	}

	return result, nil
}

// detectSubmodule checks if the given path is inside a git submodule.
// Returns (isSubmodule, remoteURL).
func detectSubmodule(absPath string) (bool, string) {
	// Check if git is available
	cmd := exec.Command("git", "-C", absPath, "rev-parse", "--show-superproject-working-tree")
	out, err := cmd.Output()
	if err != nil {
		return false, ""
	}

	superProject := strings.TrimSpace(string(out))
	if superProject == "" {
		return false, ""
	}

	// It's a submodule — get the remote URL for user guidance
	cmd = exec.Command("git", "-C", absPath, "remote", "get-url", "origin")
	urlOut, err := cmd.Output()
	remoteURL := ""
	if err == nil {
		remoteURL = strings.TrimSpace(string(urlOut))
	}

	return true, remoteURL
}

// removeEmptyDirs removes empty directories up to (but not including) the stop path.
func removeEmptyDirs(dir string, stopAt string) {
	for dir != stopAt && dir != filepath.Dir(dir) {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			return
		}
		os.Remove(dir)
		dir = filepath.Dir(dir)
	}
}
