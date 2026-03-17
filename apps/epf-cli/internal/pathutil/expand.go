// Package pathutil provides shared path manipulation utilities for epf-cli.
package pathutil

import (
	"os"
	"path/filepath"
	"strings"
)

// ExpandTilde expands a leading ~ in a path to the user's home directory.
// Handles both "~" alone and "~/rest/of/path". Does not handle "~user" syntax.
// Returns the path unchanged if it doesn't start with ~ or if the home directory
// cannot be determined.
func ExpandTilde(path string) string {
	if path == "" {
		return path
	}
	if path == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return home
	}
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~"+string(filepath.Separator)) {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, path[2:])
	}
	return path
}
