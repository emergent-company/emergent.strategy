package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// MemoryConfig holds resolved Memory server configuration.
type MemoryConfig struct {
	URL       string `json:"url"`
	ProjectID string `json:"project_id"`
	Token     string `json:"token"`
	Source    string `json:"source"` // where the config was found: "env:EPF_MEMORY_*", "env:MEMORY_PROJECT_*", "dotenv:<path>"
}

// ResolveMemoryConfig resolves Memory configuration using this priority order:
//  1. CLI flags (passed as arguments, empty string means not provided)
//  2. EPF_MEMORY_* environment variables (epf-cli convention)
//  3. MEMORY_PROJECT_* environment variables (memory init convention)
//  4. .env.local file (walked up from cwd to repo root)
//
// Returns a MemoryConfig with whatever could be resolved. Check IsComplete()
// to verify all three fields are present.
func ResolveMemoryConfig(flagURL, flagProject, flagToken string) *MemoryConfig {
	cfg := &MemoryConfig{}

	// Layer 1: CLI flags
	cfg.URL = flagURL
	cfg.ProjectID = flagProject
	cfg.Token = flagToken
	if cfg.IsComplete() {
		cfg.Source = "flags"
		return cfg
	}

	// Layer 2: EPF_MEMORY_* env vars
	fillFromEnv(cfg, "EPF_MEMORY_URL", "EPF_MEMORY_PROJECT", "EPF_MEMORY_TOKEN")
	if cfg.IsComplete() {
		cfg.Source = "env:EPF_MEMORY_*"
		return cfg
	}

	// Layer 3: MEMORY_PROJECT_* env vars (written by `memory init`)
	// MEMORY_PROJECT_ID maps to ProjectID, MEMORY_PROJECT_TOKEN maps to Token
	// URL uses MEMORY_SERVER_URL or defaults to the cloud URL
	fillFromEnvMapped(cfg, map[string]string{
		"url":        "MEMORY_SERVER_URL",
		"project_id": "MEMORY_PROJECT_ID",
		"token":      "MEMORY_PROJECT_TOKEN",
	})
	if cfg.IsComplete() {
		cfg.Source = "env:MEMORY_PROJECT_*"
		return cfg
	}

	// Layer 4: .env.local file (walk up to repo root)
	dotenvPath := findDotEnvLocal()
	if dotenvPath != "" {
		dotenvVars := parseDotEnv(dotenvPath)

		// Try EPF_MEMORY_* keys first
		fillFromMap(cfg, dotenvVars, "EPF_MEMORY_URL", "EPF_MEMORY_PROJECT", "EPF_MEMORY_TOKEN")

		// Then try MEMORY_PROJECT_* keys
		if !cfg.IsComplete() {
			fillFromMapMapped(cfg, dotenvVars, map[string]string{
				"url":        "MEMORY_SERVER_URL",
				"project_id": "MEMORY_PROJECT_ID",
				"token":      "MEMORY_PROJECT_TOKEN",
			})
		}

		if cfg.IsComplete() {
			cfg.Source = fmt.Sprintf("dotenv:%s", dotenvPath)
			return cfg
		}

		// Even partial dotenv results are useful
		if cfg.URL != "" || cfg.ProjectID != "" || cfg.Token != "" {
			cfg.Source = fmt.Sprintf("partial:dotenv:%s", dotenvPath)
		}
	}

	// Set source for partial results from env
	if cfg.Source == "" && (cfg.URL != "" || cfg.ProjectID != "" || cfg.Token != "") {
		cfg.Source = "partial:env"
	}

	return cfg
}

// IsComplete returns true if all three fields are non-empty.
func (c *MemoryConfig) IsComplete() bool {
	return c.URL != "" && c.ProjectID != "" && c.Token != ""
}

// MissingFields returns which fields are still empty.
func (c *MemoryConfig) MissingFields() []string {
	var missing []string
	if c.URL == "" {
		missing = append(missing, "url")
	}
	if c.ProjectID == "" {
		missing = append(missing, "project_id")
	}
	if c.Token == "" {
		missing = append(missing, "token")
	}
	return missing
}

// fillFromEnv fills empty fields from environment variables.
func fillFromEnv(cfg *MemoryConfig, urlVar, projectVar, tokenVar string) {
	if cfg.URL == "" {
		cfg.URL = os.Getenv(urlVar)
	}
	if cfg.ProjectID == "" {
		cfg.ProjectID = os.Getenv(projectVar)
	}
	if cfg.Token == "" {
		cfg.Token = os.Getenv(tokenVar)
	}
}

// fillFromEnvMapped fills empty fields from environment variables with custom mapping.
func fillFromEnvMapped(cfg *MemoryConfig, mapping map[string]string) {
	if cfg.URL == "" {
		if v, ok := mapping["url"]; ok {
			cfg.URL = os.Getenv(v)
		}
	}
	if cfg.ProjectID == "" {
		if v, ok := mapping["project_id"]; ok {
			cfg.ProjectID = os.Getenv(v)
		}
	}
	if cfg.Token == "" {
		if v, ok := mapping["token"]; ok {
			cfg.Token = os.Getenv(v)
		}
	}
}

// fillFromMap fills empty fields from a key-value map (parsed dotenv).
func fillFromMap(cfg *MemoryConfig, vars map[string]string, urlKey, projectKey, tokenKey string) {
	if cfg.URL == "" {
		cfg.URL = vars[urlKey]
	}
	if cfg.ProjectID == "" {
		cfg.ProjectID = vars[projectKey]
	}
	if cfg.Token == "" {
		cfg.Token = vars[tokenKey]
	}
}

// fillFromMapMapped fills empty fields from a key-value map with custom mapping.
func fillFromMapMapped(cfg *MemoryConfig, vars map[string]string, mapping map[string]string) {
	if cfg.URL == "" {
		if key, ok := mapping["url"]; ok {
			cfg.URL = vars[key]
		}
	}
	if cfg.ProjectID == "" {
		if key, ok := mapping["project_id"]; ok {
			cfg.ProjectID = vars[key]
		}
	}
	if cfg.Token == "" {
		if key, ok := mapping["token"]; ok {
			cfg.Token = vars[key]
		}
	}
}

// findDotEnvLocal walks up from cwd to repo root looking for .env.local.
func findDotEnvLocal() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	dir := cwd
	for {
		candidate := filepath.Join(dir, ".env.local")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}

		// Stop at repo root (has .git)
		gitDir := filepath.Join(dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			break // Reached repo root, .env.local not found
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break // Reached filesystem root
		}
		dir = parent
	}

	return ""
}

// parseDotEnv reads a .env file and returns key-value pairs.
// Handles KEY=VALUE, KEY="VALUE", and KEY='VALUE' formats.
// Ignores comments (#) and empty lines.
func parseDotEnv(path string) map[string]string {
	vars := make(map[string]string)

	f, err := os.Open(path)
	if err != nil {
		return vars
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Split on first =
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}

		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])

		// Strip quotes
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}

		vars[key] = value
	}

	return vars
}
