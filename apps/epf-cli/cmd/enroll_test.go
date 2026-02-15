package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
)

func TestDeriveInstanceName(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{
			name:     "SSH URL with .git suffix",
			url:      "git@github.com:emergent-company/emergent-epf.git",
			expected: "emergent",
		},
		{
			name:     "SSH URL without .git suffix",
			url:      "git@github.com:emergent-company/emergent-epf",
			expected: "emergent",
		},
		{
			name:     "HTTPS URL with .git suffix",
			url:      "https://github.com/emergent-company/emergent-epf.git",
			expected: "emergent",
		},
		{
			name:     "HTTPS URL without .git suffix",
			url:      "https://github.com/emergent-company/emergent-epf",
			expected: "emergent",
		},
		{
			name:     "strips -strategy suffix",
			url:      "git@github.com:org/product-strategy.git",
			expected: "product",
		},
		{
			name:     "no special suffix to strip",
			url:      "git@github.com:org/my-product.git",
			expected: "my-product",
		},
		{
			name:     "plain repo name",
			url:      "git@github.com:org/acme.git",
			expected: "acme",
		},
		{
			name:     "deeply nested HTTPS path",
			url:      "https://gitlab.com/group/subgroup/my-repo-epf.git",
			expected: "my-repo",
		},
		{
			name:     "empty URL returns empty",
			url:      "",
			expected: "",
		},
		{
			name:     "only .git suffix returns empty",
			url:      ".git",
			expected: "",
		},
		{
			name:     "name is exactly epf — kept as-is (only suffix -epf stripped)",
			url:      "git@github.com:org/epf.git",
			expected: "epf",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := deriveInstanceName(tt.url)
			if result != tt.expected {
				t.Errorf("deriveInstanceName(%q) = %q, want %q", tt.url, result, tt.expected)
			}
		})
	}
}

// Task 5.3: Test enroll idempotency detection
// The runEnroll function (enroll.go:86-105) uses config.LoadRepoConfigFromCwd()
// to detect existing enrollment. We test the underlying mechanism since
// runEnroll itself calls os.Exit() and can't be unit-tested directly.

func TestEnrollIdempotency_DetectsExistingConfig(t *testing.T) {
	// Create a temp dir simulating a git repo with .epf.yaml already present
	tmpDir := t.TempDir()

	// Initialize a fake git repo
	if err := os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	// Write a .epf.yaml with existing enrollment
	rc := &config.RepoConfig{
		InstancePath: "docs/EPF/_instances/emergent",
		Mode:         "submodule",
		Schemas:      "embedded",
	}
	if err := rc.SaveRepoConfig(tmpDir); err != nil {
		t.Fatalf("Failed to save repo config: %v", err)
	}

	// Now load it back and verify it detects enrollment
	loaded, err := config.LoadRepoConfig(tmpDir)
	if err != nil {
		t.Fatalf("LoadRepoConfig failed: %v", err)
	}
	if loaded == nil {
		t.Fatal("Expected non-nil config")
	}
	if loaded.InstancePath == "" {
		t.Fatal("Expected InstancePath to be set (idempotency guard would trigger)")
	}
	if loaded.InstancePath != "docs/EPF/_instances/emergent" {
		t.Errorf("InstancePath = %q, want %q", loaded.InstancePath, "docs/EPF/_instances/emergent")
	}
	if loaded.Mode != "submodule" {
		t.Errorf("Mode = %q, want %q", loaded.Mode, "submodule")
	}
}

func TestEnrollIdempotency_NoConfigAllowsEnrollment(t *testing.T) {
	// Create a temp dir simulating a git repo WITHOUT .epf.yaml
	tmpDir := t.TempDir()

	// Initialize a fake git repo
	if err := os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	// Load config — should return nil or empty InstancePath
	loaded, err := config.LoadRepoConfig(tmpDir)
	if err != nil {
		t.Fatalf("LoadRepoConfig failed: %v", err)
	}

	// Either nil config or empty InstancePath means enrollment is allowed
	if loaded != nil && loaded.InstancePath != "" {
		t.Errorf("Expected nil or empty InstancePath for unenrolled repo, got %q", loaded.InstancePath)
	}
}

func TestEnrollIdempotency_PathMismatchDetected(t *testing.T) {
	// Simulate a repo enrolled at one path, but user tries to enroll at a different path
	tmpDir := t.TempDir()

	if err := os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	// Enroll at path A
	rc := &config.RepoConfig{
		InstancePath: "docs/EPF/_instances/product-a",
		Mode:         "submodule",
		Schemas:      "embedded",
	}
	if err := rc.SaveRepoConfig(tmpDir); err != nil {
		t.Fatalf("Failed to save repo config: %v", err)
	}

	// Load and verify the mismatch detection logic
	loaded, err := config.LoadRepoConfig(tmpDir)
	if err != nil {
		t.Fatalf("LoadRepoConfig failed: %v", err)
	}

	// The idempotency guard in runEnroll compares existingConfig.InstancePath with mountPath
	requestedPath := "docs/EPF/_instances/product-b"
	if loaded.InstancePath == requestedPath {
		t.Error("Expected different paths to be detectable")
	}
	if loaded.InstancePath != "docs/EPF/_instances/product-a" {
		t.Errorf("InstancePath = %q, want %q", loaded.InstancePath, "docs/EPF/_instances/product-a")
	}
}
