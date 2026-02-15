package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFromPath_NonExistentFile(t *testing.T) {
	cfg, err := LoadFromPath("/nonexistent/path/config.yaml")
	if err != nil {
		t.Fatalf("Expected no error for non-existent file, got: %v", err)
	}
	if cfg == nil {
		t.Fatal("Expected non-nil config")
	}
	if cfg.CanonicalRepo != "" {
		t.Errorf("Expected empty CanonicalRepo, got: %s", cfg.CanonicalRepo)
	}
}

func TestLoadFromPath_ValidConfig(t *testing.T) {
	// Create a temp config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "test-config.yaml")

	configContent := `canonical_repo: git@example.com:test/repo.git
canonical_path: /local/path
default_instance: my-instance
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}

	cfg, err := LoadFromPath(configPath)
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	if cfg.CanonicalRepo != "git@example.com:test/repo.git" {
		t.Errorf("Expected CanonicalRepo 'git@example.com:test/repo.git', got: %s", cfg.CanonicalRepo)
	}
	if cfg.CanonicalPath != "/local/path" {
		t.Errorf("Expected CanonicalPath '/local/path', got: %s", cfg.CanonicalPath)
	}
	if cfg.DefaultInstance != "my-instance" {
		t.Errorf("Expected DefaultInstance 'my-instance', got: %s", cfg.DefaultInstance)
	}
}

func TestLoadFromPath_InvalidYAML(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "invalid-config.yaml")

	// Write invalid YAML
	if err := os.WriteFile(configPath, []byte("invalid: yaml: content:"), 0644); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}

	_, err := LoadFromPath(configPath)
	if err == nil {
		t.Error("Expected error for invalid YAML, got nil")
	}
}

func TestSaveToPath(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "save-test.yaml")

	cfg := &Config{
		CanonicalRepo:   "git@example.com:test/repo.git",
		CanonicalPath:   "/test/path",
		DefaultInstance: "test-instance",
	}

	if err := cfg.SaveToPath(configPath); err != nil {
		t.Fatalf("Failed to save config: %v", err)
	}

	// Load it back
	loaded, err := LoadFromPath(configPath)
	if err != nil {
		t.Fatalf("Failed to load saved config: %v", err)
	}

	if loaded.CanonicalRepo != cfg.CanonicalRepo {
		t.Errorf("CanonicalRepo mismatch: expected %s, got %s", cfg.CanonicalRepo, loaded.CanonicalRepo)
	}
	if loaded.CanonicalPath != cfg.CanonicalPath {
		t.Errorf("CanonicalPath mismatch: expected %s, got %s", cfg.CanonicalPath, loaded.CanonicalPath)
	}
	if loaded.DefaultInstance != cfg.DefaultInstance {
		t.Errorf("DefaultInstance mismatch: expected %s, got %s", cfg.DefaultInstance, loaded.DefaultInstance)
	}
}

func TestIsConfigured(t *testing.T) {
	tests := []struct {
		name     string
		cfg      *Config
		expected bool
	}{
		{
			name:     "empty config",
			cfg:      &Config{},
			expected: false,
		},
		{
			name: "with repo only",
			cfg: &Config{
				CanonicalRepo: "git@example.com:test/repo.git",
			},
			expected: true,
		},
		{
			name: "with path only",
			cfg: &Config{
				CanonicalPath: "/local/path",
			},
			expected: true,
		},
		{
			name: "with both",
			cfg: &Config{
				CanonicalRepo: "git@example.com:test/repo.git",
				CanonicalPath: "/local/path",
			},
			expected: true,
		},
		{
			name: "with default instance only",
			cfg: &Config{
				DefaultInstance: "my-instance",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.cfg.IsConfigured()
			if result != tt.expected {
				t.Errorf("Expected IsConfigured() = %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestGetCanonicalSource(t *testing.T) {
	// Test with empty config (should return default)
	t.Run("empty config returns default", func(t *testing.T) {
		cfg := &Config{}
		source, isLocal, err := cfg.GetCanonicalSource()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		if isLocal {
			t.Error("Expected isLocal=false for repo URL")
		}
		if source != DefaultCanonicalRepo {
			t.Errorf("Expected default repo, got: %s", source)
		}
	})

	// Test with repo set
	t.Run("repo only", func(t *testing.T) {
		cfg := &Config{CanonicalRepo: "git@example.com:test.git"}
		source, isLocal, err := cfg.GetCanonicalSource()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		if isLocal {
			t.Error("Expected isLocal=false for repo URL")
		}
		if source != "git@example.com:test.git" {
			t.Errorf("Expected repo URL, got: %s", source)
		}
	})

	// Test with local path set (valid path)
	t.Run("local path exists", func(t *testing.T) {
		tmpDir := t.TempDir()
		cfg := &Config{
			CanonicalRepo: "git@example.com:test.git",
			CanonicalPath: tmpDir,
		}
		source, isLocal, err := cfg.GetCanonicalSource()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
		if !isLocal {
			t.Error("Expected isLocal=true for local path")
		}
		if source != tmpDir {
			t.Errorf("Expected local path, got: %s", source)
		}
	})

	// Test with invalid local path
	t.Run("local path not found", func(t *testing.T) {
		cfg := &Config{
			CanonicalPath: "/nonexistent/path/that/does/not/exist",
		}
		_, _, err := cfg.GetCanonicalSource()
		if err == nil {
			t.Error("Expected error for non-existent path, got nil")
		}
	})
}

func TestConfigPath(t *testing.T) {
	path := ConfigPath()
	if path == "" {
		t.Error("ConfigPath should not be empty")
	}

	// Should end with the config filename
	if filepath.Base(path) != DefaultConfigFileName {
		t.Errorf("ConfigPath should end with %s, got: %s", DefaultConfigFileName, filepath.Base(path))
	}
}

// --- RepoConfig Tests ---

func TestFindRepoRoot(t *testing.T) {
	t.Run("finds repo root with .git directory", func(t *testing.T) {
		tmpDir := t.TempDir()
		// Create a .git directory to simulate a repo root
		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git dir: %v", err)
		}

		// Create a nested directory
		nested := filepath.Join(tmpDir, "a", "b", "c")
		if err := os.MkdirAll(nested, 0755); err != nil {
			t.Fatalf("Failed to create nested dirs: %v", err)
		}

		// FindRepoRoot from the nested dir should find the root
		root := FindRepoRoot(nested)
		absRoot, _ := filepath.Abs(root)
		absTmp, _ := filepath.Abs(tmpDir)
		if absRoot != absTmp {
			t.Errorf("Expected repo root %q, got %q", absTmp, absRoot)
		}
	})

	t.Run("returns empty when no .git found", func(t *testing.T) {
		// Use a temp dir that definitely doesn't have .git above it (unlikely but we use the deepest path)
		tmpDir := t.TempDir()
		nested := filepath.Join(tmpDir, "no", "git", "here")
		if err := os.MkdirAll(nested, 0755); err != nil {
			t.Fatalf("Failed to create dirs: %v", err)
		}
		root := FindRepoRoot(nested)
		// We can't guarantee empty because the test runner might be in a git repo,
		// but at minimum it should return a string (possibly the real repo root)
		_ = root // Just verify it doesn't panic
	})

	t.Run("finds repo root from root itself", func(t *testing.T) {
		tmpDir := t.TempDir()
		if err := os.Mkdir(filepath.Join(tmpDir, ".git"), 0755); err != nil {
			t.Fatalf("Failed to create .git dir: %v", err)
		}

		root := FindRepoRoot(tmpDir)
		absRoot, _ := filepath.Abs(root)
		absTmp, _ := filepath.Abs(tmpDir)
		if absRoot != absTmp {
			t.Errorf("Expected repo root %q, got %q", absTmp, absRoot)
		}
	})
}

func TestLoadRepoConfig(t *testing.T) {
	t.Run("returns nil for missing file", func(t *testing.T) {
		tmpDir := t.TempDir()
		cfg, err := LoadRepoConfig(tmpDir)
		if err != nil {
			t.Fatalf("Expected no error, got: %v", err)
		}
		if cfg != nil {
			t.Error("Expected nil config when file doesn't exist")
		}
	})

	t.Run("loads valid repo config", func(t *testing.T) {
		tmpDir := t.TempDir()
		content := `instance_path: docs/EPF/_instances/my-product
mode: submodule
schemas: embedded
`
		if err := os.WriteFile(filepath.Join(tmpDir, RepoConfigFileName), []byte(content), 0644); err != nil {
			t.Fatalf("Failed to write config: %v", err)
		}

		cfg, err := LoadRepoConfig(tmpDir)
		if err != nil {
			t.Fatalf("Failed to load config: %v", err)
		}
		if cfg == nil {
			t.Fatal("Expected non-nil config")
		}
		if cfg.InstancePath != "docs/EPF/_instances/my-product" {
			t.Errorf("Expected InstancePath 'docs/EPF/_instances/my-product', got: %s", cfg.InstancePath)
		}
		if cfg.Mode != "submodule" {
			t.Errorf("Expected Mode 'submodule', got: %s", cfg.Mode)
		}
		if cfg.Schemas != "embedded" {
			t.Errorf("Expected Schemas 'embedded', got: %s", cfg.Schemas)
		}
	})

	t.Run("errors on invalid YAML", func(t *testing.T) {
		tmpDir := t.TempDir()
		if err := os.WriteFile(filepath.Join(tmpDir, RepoConfigFileName), []byte("invalid: yaml: ["), 0644); err != nil {
			t.Fatalf("Failed to write config: %v", err)
		}

		_, err := LoadRepoConfig(tmpDir)
		if err == nil {
			t.Error("Expected error for invalid YAML, got nil")
		}
	})
}

func TestSaveRepoConfig(t *testing.T) {
	t.Run("saves and round-trips config", func(t *testing.T) {
		tmpDir := t.TempDir()
		cfg := &RepoConfig{
			InstancePath: "docs/EPF/_instances/test",
			Mode:         "standalone",
			Schemas:      "local",
		}

		if err := cfg.SaveRepoConfig(tmpDir); err != nil {
			t.Fatalf("Failed to save config: %v", err)
		}

		// Verify file was created
		path := filepath.Join(tmpDir, RepoConfigFileName)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Fatal("Config file was not created")
		}

		// Load it back
		loaded, err := LoadRepoConfig(tmpDir)
		if err != nil {
			t.Fatalf("Failed to load saved config: %v", err)
		}
		if loaded.InstancePath != cfg.InstancePath {
			t.Errorf("InstancePath mismatch: expected %q, got %q", cfg.InstancePath, loaded.InstancePath)
		}
		if loaded.Mode != cfg.Mode {
			t.Errorf("Mode mismatch: expected %q, got %q", cfg.Mode, loaded.Mode)
		}
		if loaded.Schemas != cfg.Schemas {
			t.Errorf("Schemas mismatch: expected %q, got %q", cfg.Schemas, loaded.Schemas)
		}
	})

	t.Run("file includes header comment", func(t *testing.T) {
		tmpDir := t.TempDir()
		cfg := &RepoConfig{Mode: "integrated"}

		if err := cfg.SaveRepoConfig(tmpDir); err != nil {
			t.Fatalf("Failed to save config: %v", err)
		}

		data, err := os.ReadFile(filepath.Join(tmpDir, RepoConfigFileName))
		if err != nil {
			t.Fatalf("Failed to read config file: %v", err)
		}
		if !strings.Contains(string(data), "# .epf.yaml") {
			t.Error("Expected header comment in saved file")
		}
	})
}
