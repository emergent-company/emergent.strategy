package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/update"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version"
	"github.com/spf13/cobra"
)

// DevMode indicates whether developer mode is enabled.
// When true, write operations are allowed in the canonical EPF repository.
var DevMode bool

var rootCmd = &cobra.Command{
	Use:   "epf-cli",
	Short: "EPF Schema Validator and MCP Server",
	Long: `epf-cli is the "Kernel" of ProductFactoryOS.

It provides:
  - YAML schema validation for EPF artifacts
  - MCP server for schema definitions (used by OpenCode)
  - Linting and autocomplete support for VS Code

It does NOT write content - it only validates content.
OpenCode is the writer, epf-cli is the linter.`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		checkForUpdates(cmd)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringP("config", "c", "", "config file (default is .epf-cli.yaml)")
	rootCmd.PersistentFlags().BoolVar(&DevMode, "dev", false, "enable developer mode (allows writes to canonical EPF)")
}

// checkForUpdates performs a background-friendly update check on CLI startup.
// It is silent on errors and skips for dev builds, MCP server, and completion commands.
func checkForUpdates(cmd *cobra.Command) {
	// Skip for dev builds
	if version.Version == "dev" || version.Version == "" {
		return
	}

	// Skip for commands that should not print extra output
	name := cmd.Name()
	if name == "serve" || name == "completion" || name == "__complete" {
		return
	}

	// Skip if parent is "completion" (e.g. "completion bash")
	if cmd.Parent() != nil && cmd.Parent().Name() == "completion" {
		return
	}

	// Check config/env
	cfg, _ := config.Load()
	if cfg != nil && !cfg.IsUpdateCheckEnabled() {
		return
	}

	// Use cached check to avoid hitting the API on every invocation
	result, _, err := update.CheckWithCache(version.Version)
	if err != nil {
		return // Silently ignore network/API errors
	}

	if result.UpdateAvailable {
		fmt.Fprintf(os.Stderr, "\n")
		fmt.Fprintf(os.Stderr, "  A new version of epf-cli is available: %s → %s\n", result.CurrentVersion, result.LatestVersion)
		if update.IsHomebrew() {
			fmt.Fprintf(os.Stderr, "  Update with: brew upgrade epf-cli\n")
		} else {
			fmt.Fprintf(os.Stderr, "  Update with: epf-cli update\n")
		}
		fmt.Fprintf(os.Stderr, "  Release: %s\n", result.LatestURL)
		fmt.Fprintf(os.Stderr, "  Disable: EPF_CLI_NO_UPDATE_CHECK=1 or set update_check: false in %s\n", configPath())
		fmt.Fprintf(os.Stderr, "\n")
	}
}

// configPath returns a display-friendly config path. Doesn't fail.
func configPath() string {
	path := config.ConfigPath()
	home, err := os.UserHomeDir()
	if err == nil {
		path = strings.Replace(path, home, "~", 1)
	}
	return path
}
