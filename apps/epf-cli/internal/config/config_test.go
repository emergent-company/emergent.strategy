package config

import (
	"os"
	"path/filepath"
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
