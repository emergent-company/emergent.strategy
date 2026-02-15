package cmd

import (
	"os"
	"path/filepath"
	"testing"
)

// Task 4.6: Test checkSubmoduleStatus

func TestCheckSubmoduleStatus_RegularRepo(t *testing.T) {
	// A regular directory with .git directory — not a submodule
	tmpDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	instanceDir := filepath.Join(tmpDir, "docs", "epf", "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if result.IsSubmodule {
		t.Error("Expected IsSubmodule = false for regular repo")
	}
	if result.IsUninitialized {
		t.Error("Expected IsUninitialized = false for regular repo")
	}
}

func TestCheckSubmoduleStatus_SubmoduleParent(t *testing.T) {
	// The instance is inside a directory tree where a parent has a .git file (submodule)
	tmpDir := t.TempDir()

	// Create a submodule-like structure: epf-data/.git is a file
	epfDataDir := filepath.Join(tmpDir, "epf-data")
	if err := os.MkdirAll(epfDataDir, 0755); err != nil {
		t.Fatalf("Failed to create epf-data dir: %v", err)
	}
	gitFile := filepath.Join(epfDataDir, ".git")
	if err := os.WriteFile(gitFile, []byte("gitdir: /parent/.git/modules/epf-data\n"), 0644); err != nil {
		t.Fatalf("Failed to write .git file: %v", err)
	}

	// Instance is nested inside the submodule
	instanceDir := filepath.Join(epfDataDir, "_instances", "product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if !result.IsSubmodule {
		t.Error("Expected IsSubmodule = true when parent is a submodule")
	}
}

func TestCheckSubmoduleStatus_UninitializedSubmodule(t *testing.T) {
	// An empty instance directory referenced in .gitmodules
	parentDir := t.TempDir()

	// Empty instance directory
	instanceDir := filepath.Join(parentDir, "epf-instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	// .gitmodules references it
	gitmodulesContent := `[submodule "epf-instance"]
	path = epf-instance
	url = git@github.com:org/epf-instance.git
`
	if err := os.WriteFile(filepath.Join(parentDir, ".gitmodules"), []byte(gitmodulesContent), 0644); err != nil {
		t.Fatalf("Failed to write .gitmodules: %v", err)
	}

	result := checkSubmoduleStatus(instanceDir)
	if result.IsSubmodule {
		t.Error("Expected IsSubmodule = false for uninitialized submodule")
	}
	if !result.IsUninitialized {
		t.Error("Expected IsUninitialized = true for empty dir referenced in .gitmodules")
	}
	if result.UninitializedHint == "" {
		t.Error("Expected non-empty hint for uninitialized submodule")
	}
}
