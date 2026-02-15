package discovery

import (
	"os"
	"path/filepath"
	"testing"
)

// Task 4.3: Test IsSubmodule() — .git file vs directory vs absent

func TestIsSubmodule_GitFile(t *testing.T) {
	// A submodule has a .git *file* (not directory) pointing to parent's .git/modules/
	tmpDir := t.TempDir()

	gitFile := filepath.Join(tmpDir, ".git")
	content := "gitdir: /parent-repo/.git/modules/my-submodule\n"
	if err := os.WriteFile(gitFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write .git file: %v", err)
	}

	if !IsSubmodule(tmpDir) {
		t.Error("Expected IsSubmodule() = true for directory with .git file")
	}
}

func TestIsSubmodule_GitDirectory(t *testing.T) {
	// A regular repo has a .git *directory*
	tmpDir := t.TempDir()

	gitDir := filepath.Join(tmpDir, ".git")
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	if IsSubmodule(tmpDir) {
		t.Error("Expected IsSubmodule() = false for directory with .git directory")
	}
}

func TestIsSubmodule_NoGit(t *testing.T) {
	// No .git at all
	tmpDir := t.TempDir()

	if IsSubmodule(tmpDir) {
		t.Error("Expected IsSubmodule() = false for directory without .git")
	}
}

// Task 4.4: Test IsUninitializedSubmodule()

func TestIsUninitializedSubmodule_EmptyDirWithGitmodules(t *testing.T) {
	// Parent has .gitmodules referencing an empty child directory
	parentDir := t.TempDir()

	// Create empty submodule directory
	submoduleDir := filepath.Join(parentDir, "epf-data")
	if err := os.MkdirAll(submoduleDir, 0755); err != nil {
		t.Fatalf("Failed to create submodule dir: %v", err)
	}

	// Create .gitmodules in parent referencing the submodule path
	gitmodulesContent := `[submodule "epf-data"]
	path = epf-data
	url = git@github.com:org/epf-data.git
`
	if err := os.WriteFile(filepath.Join(parentDir, ".gitmodules"), []byte(gitmodulesContent), 0644); err != nil {
		t.Fatalf("Failed to write .gitmodules: %v", err)
	}

	uninit, hint := IsUninitializedSubmodule(submoduleDir)
	if !uninit {
		t.Error("Expected IsUninitializedSubmodule() = true for empty dir referenced in .gitmodules")
	}
	if hint == "" {
		t.Error("Expected non-empty hint message")
	}
}

func TestIsUninitializedSubmodule_NonEmptyDir(t *testing.T) {
	// A non-empty directory should not be considered an uninitialized submodule
	parentDir := t.TempDir()

	submoduleDir := filepath.Join(parentDir, "epf-data")
	if err := os.MkdirAll(submoduleDir, 0755); err != nil {
		t.Fatalf("Failed to create submodule dir: %v", err)
	}

	// Put a file in it — no longer empty
	if err := os.WriteFile(filepath.Join(submoduleDir, "README.md"), []byte("hello"), 0644); err != nil {
		t.Fatalf("Failed to write file: %v", err)
	}

	// Create .gitmodules referencing it
	gitmodulesContent := `[submodule "epf-data"]
	path = epf-data
	url = git@github.com:org/epf-data.git
`
	if err := os.WriteFile(filepath.Join(parentDir, ".gitmodules"), []byte(gitmodulesContent), 0644); err != nil {
		t.Fatalf("Failed to write .gitmodules: %v", err)
	}

	uninit, _ := IsUninitializedSubmodule(submoduleDir)
	if uninit {
		t.Error("Expected IsUninitializedSubmodule() = false for non-empty dir")
	}
}

func TestIsUninitializedSubmodule_EmptyDirNoGitmodules(t *testing.T) {
	// An empty directory without .gitmodules in any parent should not match
	parentDir := t.TempDir()

	submoduleDir := filepath.Join(parentDir, "some-empty-dir")
	if err := os.MkdirAll(submoduleDir, 0755); err != nil {
		t.Fatalf("Failed to create dir: %v", err)
	}

	uninit, _ := IsUninitializedSubmodule(submoduleDir)
	if uninit {
		t.Error("Expected IsUninitializedSubmodule() = false when no .gitmodules exists")
	}
}

func TestIsUninitializedSubmodule_NotADir(t *testing.T) {
	// A file (not directory) should return false
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "not-a-dir")
	if err := os.WriteFile(filePath, []byte("hello"), 0644); err != nil {
		t.Fatalf("Failed to write file: %v", err)
	}

	uninit, _ := IsUninitializedSubmodule(filePath)
	if uninit {
		t.Error("Expected IsUninitializedSubmodule() = false for a file")
	}
}

func TestGitmodulesReferencesPath(t *testing.T) {
	tmpDir := t.TempDir()
	gitmodulesPath := filepath.Join(tmpDir, ".gitmodules")

	content := `[submodule "docs/epf"]
	path = docs/epf
	url = git@github.com:org/epf.git
[submodule "lib/core"]
	path = lib/core
	url = git@github.com:org/core.git
`
	if err := os.WriteFile(gitmodulesPath, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write .gitmodules: %v", err)
	}

	// Should find docs/epf
	if !gitmodulesReferencesPath(gitmodulesPath, "docs/epf") {
		t.Error("Expected to find docs/epf in .gitmodules")
	}

	// Should find lib/core
	if !gitmodulesReferencesPath(gitmodulesPath, "lib/core") {
		t.Error("Expected to find lib/core in .gitmodules")
	}

	// Should not find nonexistent path
	if gitmodulesReferencesPath(gitmodulesPath, "nonexistent") {
		t.Error("Should not find nonexistent path in .gitmodules")
	}
}
