// Package config provides configuration management for epf-cli.
// Configuration is stored in ~/.epf-cli.yaml and includes settings like
// the canonical EPF repository location.
package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	// DefaultConfigFileName is the default configuration file name
	DefaultConfigFileName = ".epf-cli.yaml"

	// DefaultCanonicalRepo is the default canonical EPF repository
	DefaultCanonicalRepo = "git@github.com:eyedea-io/epf-canonical-definition.git"
)

// Config represents the epf-cli configuration
type Config struct {
	// CanonicalRepo is the git URL for the canonical EPF repository
	CanonicalRepo string `yaml:"canonical_repo,omitempty"`

	// CanonicalPath is a local path to the canonical EPF (for development)
	CanonicalPath string `yaml:"canonical_path,omitempty"`

	// DefaultInstance is the default instance name to use when not specified
	DefaultInstance string `yaml:"default_instance,omitempty"`
}

// ConfigPath returns the path to the configuration file
func ConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return DefaultConfigFileName
	}
	return filepath.Join(home, DefaultConfigFileName)
}

// Load loads the configuration from the default location
func Load() (*Config, error) {
	return LoadFromPath(ConfigPath())
}

// LoadFromPath loads configuration from a specific path
func LoadFromPath(path string) (*Config, error) {
	cfg := &Config{}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty config if file doesn't exist
			return cfg, nil
		}
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return cfg, nil
}

// Save saves the configuration to the default location
func (c *Config) Save() error {
	return c.SaveToPath(ConfigPath())
}

// SaveToPath saves configuration to a specific path
func (c *Config) SaveToPath(path string) error {
	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("failed to serialize config: %w", err)
	}

	// Add a header comment
	content := "# epf-cli configuration\n# See: https://github.com/eyedea-io/emergent/tree/main/apps/epf-cli\n\n" + string(data)

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// GetCanonicalSource returns the canonical EPF source (path or repo URL)
// Returns: source string, isLocalPath bool, error
func (c *Config) GetCanonicalSource() (string, bool, error) {
	// Prefer local path if set (for development)
	if c.CanonicalPath != "" {
		// Verify path exists
		if _, err := os.Stat(c.CanonicalPath); err != nil {
			return "", false, fmt.Errorf("canonical path does not exist: %s", c.CanonicalPath)
		}
		return c.CanonicalPath, true, nil
	}

	// Use repo URL
	if c.CanonicalRepo != "" {
		return c.CanonicalRepo, false, nil
	}

	// Return default
	return DefaultCanonicalRepo, false, nil
}

// IsConfigured returns true if the config has been set up
func (c *Config) IsConfigured() bool {
	return c.CanonicalRepo != "" || c.CanonicalPath != ""
}

// PromptForConfig interactively prompts the user for configuration
func PromptForConfig(reader *bufio.Reader) (*Config, error) {
	cfg := &Config{}

	fmt.Println("epf-cli Configuration Setup")
	fmt.Println("============================")
	fmt.Println()
	fmt.Println("The canonical EPF repository contains the framework definition")
	fmt.Println("(schemas, templates, wizards, etc.) without any product data.")
	fmt.Println()

	// Ask for canonical repo
	fmt.Printf("Canonical EPF repo URL [%s]: ", DefaultCanonicalRepo)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)

	if input == "" {
		cfg.CanonicalRepo = DefaultCanonicalRepo
	} else {
		cfg.CanonicalRepo = input
	}

	// Ask if they want to use a local path (for development)
	fmt.Print("Use a local path instead? (for development) [y/N]: ")
	localInput, _ := reader.ReadString('\n')
	localInput = strings.TrimSpace(strings.ToLower(localInput))

	if localInput == "y" || localInput == "yes" {
		fmt.Print("Local path to canonical EPF: ")
		pathInput, _ := reader.ReadString('\n')
		pathInput = strings.TrimSpace(pathInput)

		if pathInput != "" {
			// Expand ~ to home directory
			if strings.HasPrefix(pathInput, "~") {
				home, _ := os.UserHomeDir()
				pathInput = filepath.Join(home, pathInput[1:])
			}
			cfg.CanonicalPath = pathInput
		}
	}

	// Ask to save
	fmt.Println()
	fmt.Print("Save configuration to ~/.epf-cli.yaml? [Y/n]: ")
	saveInput, _ := reader.ReadString('\n')
	saveInput = strings.TrimSpace(strings.ToLower(saveInput))

	if saveInput == "" || saveInput == "y" || saveInput == "yes" {
		if err := cfg.Save(); err != nil {
			return cfg, fmt.Errorf("failed to save config: %w", err)
		}
		fmt.Printf("Configuration saved to %s\n", ConfigPath())
	}

	return cfg, nil
}

// EnsureConfigured ensures the CLI is configured, prompting if needed
func EnsureConfigured(reader *bufio.Reader) (*Config, error) {
	cfg, err := Load()
	if err != nil {
		return nil, err
	}

	if !cfg.IsConfigured() {
		fmt.Println("epf-cli is not configured yet.")
		fmt.Println()
		return PromptForConfig(reader)
	}

	return cfg, nil
}
