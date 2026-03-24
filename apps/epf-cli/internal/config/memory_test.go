package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseDotEnv(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env.local")

	content := `# Memory project config
MEMORY_PROJECT_ID="proj-123"
MEMORY_PROJECT_TOKEN="emt_abc123"

# EPF Memory integration
EPF_MEMORY_URL=https://memory.example.com
EPF_MEMORY_PROJECT=proj-456
EPF_MEMORY_TOKEN='tok_xyz'

# Empty and comment lines
UNRELATED_VAR=hello
`
	os.WriteFile(envFile, []byte(content), 0644)

	vars := parseDotEnv(envFile)

	tests := []struct {
		key  string
		want string
	}{
		{"MEMORY_PROJECT_ID", "proj-123"},
		{"MEMORY_PROJECT_TOKEN", "emt_abc123"},
		{"EPF_MEMORY_URL", "https://memory.example.com"},
		{"EPF_MEMORY_PROJECT", "proj-456"},
		{"EPF_MEMORY_TOKEN", "tok_xyz"},
		{"UNRELATED_VAR", "hello"},
	}

	for _, tt := range tests {
		if got := vars[tt.key]; got != tt.want {
			t.Errorf("parseDotEnv[%q] = %q, want %q", tt.key, got, tt.want)
		}
	}
}

func TestResolveMemoryConfig_Flags(t *testing.T) {
	cfg := ResolveMemoryConfig("https://url", "proj", "tok")
	if !cfg.IsComplete() {
		t.Error("Expected complete config from flags")
	}
	if cfg.Source != "flags" {
		t.Errorf("Source = %q, want %q", cfg.Source, "flags")
	}
}

func TestResolveMemoryConfig_EPFEnvVars(t *testing.T) {
	t.Setenv("EPF_MEMORY_URL", "https://epf.example.com")
	t.Setenv("EPF_MEMORY_PROJECT", "epf-proj")
	t.Setenv("EPF_MEMORY_TOKEN", "epf-tok")

	cfg := ResolveMemoryConfig("", "", "")
	if !cfg.IsComplete() {
		t.Error("Expected complete config from EPF_MEMORY_* env vars")
	}
	if cfg.Source != "env:EPF_MEMORY_*" {
		t.Errorf("Source = %q, want %q", cfg.Source, "env:EPF_MEMORY_*")
	}
	if cfg.URL != "https://epf.example.com" {
		t.Errorf("URL = %q, want %q", cfg.URL, "https://epf.example.com")
	}
}

func TestResolveMemoryConfig_MemoryProjectEnvVars(t *testing.T) {
	// Clear EPF vars to test fallback
	t.Setenv("EPF_MEMORY_URL", "")
	t.Setenv("EPF_MEMORY_PROJECT", "")
	t.Setenv("EPF_MEMORY_TOKEN", "")

	t.Setenv("MEMORY_SERVER_URL", "https://memory.example.com")
	t.Setenv("MEMORY_PROJECT_ID", "mem-proj")
	t.Setenv("MEMORY_PROJECT_TOKEN", "mem-tok")

	cfg := ResolveMemoryConfig("", "", "")
	if !cfg.IsComplete() {
		t.Errorf("Expected complete config from MEMORY_PROJECT_* env vars, missing: %v", cfg.MissingFields())
	}
	if cfg.Source != "env:MEMORY_PROJECT_*" {
		t.Errorf("Source = %q, want %q", cfg.Source, "env:MEMORY_PROJECT_*")
	}
}

func TestResolveMemoryConfig_FlagsPriority(t *testing.T) {
	t.Setenv("EPF_MEMORY_URL", "https://env.example.com")
	t.Setenv("EPF_MEMORY_PROJECT", "env-proj")
	t.Setenv("EPF_MEMORY_TOKEN", "env-tok")

	cfg := ResolveMemoryConfig("https://flag.example.com", "flag-proj", "flag-tok")
	if cfg.URL != "https://flag.example.com" {
		t.Errorf("URL = %q, want flag value", cfg.URL)
	}
	if cfg.Source != "flags" {
		t.Errorf("Source = %q, want %q", cfg.Source, "flags")
	}
}

func TestResolveMemoryConfig_MissingFields(t *testing.T) {
	// Note: if .env.local exists in repo root, the resolver will find it.
	// This test verifies MissingFields() works correctly for incomplete configs.
	cfg := &MemoryConfig{URL: "https://example.com"} // only URL set
	missing := cfg.MissingFields()
	if len(missing) != 2 {
		t.Errorf("Expected 2 missing fields, got %d: %v", len(missing), missing)
	}
	if cfg.IsComplete() {
		t.Error("Expected incomplete config")
	}

	cfg2 := &MemoryConfig{URL: "u", ProjectID: "p", Token: "t"}
	if !cfg2.IsComplete() {
		t.Error("Expected complete config")
	}
	if len(cfg2.MissingFields()) != 0 {
		t.Errorf("Expected 0 missing fields, got %v", cfg2.MissingFields())
	}
}

func TestResolveMemoryConfig_PartialMix(t *testing.T) {
	// URL from EPF env, project from Memory env -- layers merge correctly
	t.Setenv("EPF_MEMORY_URL", "https://epf.example.com")
	t.Setenv("EPF_MEMORY_PROJECT", "")
	t.Setenv("EPF_MEMORY_TOKEN", "")
	t.Setenv("MEMORY_SERVER_URL", "")
	t.Setenv("MEMORY_PROJECT_ID", "mem-proj")
	t.Setenv("MEMORY_PROJECT_TOKEN", "mem-tok")

	cfg := ResolveMemoryConfig("", "", "")
	if cfg.URL != "https://epf.example.com" {
		t.Errorf("URL should come from EPF env, got %q", cfg.URL)
	}
	if cfg.ProjectID != "mem-proj" {
		t.Errorf("ProjectID should come from MEMORY env, got %q", cfg.ProjectID)
	}
	if cfg.Token != "mem-tok" {
		t.Errorf("Token should come from MEMORY env, got %q", cfg.Token)
	}
}
