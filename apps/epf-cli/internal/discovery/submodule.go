package discovery

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// IsSubmodule checks if the given path is inside a git submodule.
// A git submodule has a .git file (not directory) that points to the
// parent repo's .git/modules/ directory.
func IsSubmodule(path string) bool {
	gitPath := filepath.Join(path, ".git")
	info, err := os.Lstat(gitPath)
	if err != nil {
		return false
	}
	// A submodule has a .git *file*, not a directory
	return !info.IsDir()
}

// IsUninitializedSubmodule checks if a path appears to be an uninitialized
// git submodule. This is detected when:
// 1. The directory exists but is empty (or nearly empty)
// 2. A .gitmodules file in a parent directory references this path
//
// Returns true if likely an uninitialized submodule, along with a hint message.
func IsUninitializedSubmodule(path string) (bool, string) {
	// Check if directory exists
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false, ""
	}

	// Check if directory is empty or nearly empty
	entries, err := os.ReadDir(path)
	if err != nil {
		return false, ""
	}
	if len(entries) > 0 {
		return false, ""
	}

	// Walk up to find .gitmodules that references this path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false, ""
	}

	current := filepath.Dir(absPath)
	for {
		gitmodulesPath := filepath.Join(current, ".gitmodules")
		if _, err := os.Stat(gitmodulesPath); err == nil {
			// Check if .gitmodules references the target path
			relPath, err := filepath.Rel(current, absPath)
			if err == nil && gitmodulesReferencesPath(gitmodulesPath, relPath) {
				return true, "Run 'git submodule update --init' to initialize this submodule"
			}
		}

		parent := filepath.Dir(current)
		if parent == current {
			break // reached filesystem root
		}
		current = parent
	}

	return false, ""
}

// gitmodulesReferencesPath checks if a .gitmodules file contains a path entry
// matching the given relative path.
func gitmodulesReferencesPath(gitmodulesPath, relPath string) bool {
	f, err := os.Open(gitmodulesPath)
	if err != nil {
		return false
	}
	defer f.Close()

	// Normalize the path for comparison
	relPath = filepath.ToSlash(relPath)

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Look for "path = <relPath>" entries
		if strings.HasPrefix(line, "path") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				entryPath := strings.TrimSpace(parts[1])
				entryPath = filepath.ToSlash(entryPath)
				if entryPath == relPath {
					return true
				}
			}
		}
	}

	return false
}
