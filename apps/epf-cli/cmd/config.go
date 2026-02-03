package cmd

import (
	"bufio"
	"fmt"
	"os"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/config"
	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage epf-cli configuration",
	Long: `Manage epf-cli configuration.

Configuration is stored in ~/.epf-cli.yaml and includes:
  - canonical_repo: Git URL for the canonical EPF repository
  - canonical_path: Local path to canonical EPF (for development)
  - default_instance: Default instance name to use

Examples:
  epf-cli config show              # Show current configuration
  epf-cli config init              # Interactive configuration setup
  epf-cli config set canonical_repo git@github.com:org/epf.git
  epf-cli config set canonical_path /path/to/epf`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default to showing config
		showConfig()
	},
}

var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Show current configuration",
	Run: func(cmd *cobra.Command, args []string) {
		showConfig()
	},
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Interactive configuration setup",
	Run: func(cmd *cobra.Command, args []string) {
		reader := bufio.NewReader(os.Stdin)
		_, err := config.PromptForConfig(reader)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	},
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set a configuration value",
	Long: `Set a configuration value.

Available keys:
  canonical_repo    - Git URL for the canonical EPF repository
  canonical_path    - Local path to canonical EPF (for development)
  default_instance  - Default instance name to use

Examples:
  epf-cli config set canonical_repo git@github.com:eyedea-io/epf-canonical-definition.git
  epf-cli config set canonical_path /Users/me/code/epf-canonical-definition
  epf-cli config set default_instance emergent`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		key := args[0]
		value := args[1]

		cfg, err := config.Load()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
			os.Exit(1)
		}

		switch key {
		case "canonical_repo":
			cfg.CanonicalRepo = value
		case "canonical_path":
			cfg.CanonicalPath = value
		case "default_instance":
			cfg.DefaultInstance = value
		default:
			fmt.Fprintf(os.Stderr, "Unknown config key: %s\n", key)
			fmt.Fprintln(os.Stderr, "Available keys: canonical_repo, canonical_path, default_instance")
			os.Exit(1)
		}

		if err := cfg.Save(); err != nil {
			fmt.Fprintf(os.Stderr, "Error saving config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("Set %s = %s\n", key, value)
		fmt.Printf("Saved to %s\n", config.ConfigPath())
	},
}

var configGetCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "Get a configuration value",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		key := args[0]

		cfg, err := config.Load()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
			os.Exit(1)
		}

		var value string
		switch key {
		case "canonical_repo":
			value = cfg.CanonicalRepo
			if value == "" {
				value = config.DefaultCanonicalRepo + " (default)"
			}
		case "canonical_path":
			value = cfg.CanonicalPath
			if value == "" {
				value = "(not set)"
			}
		case "default_instance":
			value = cfg.DefaultInstance
			if value == "" {
				value = "(not set)"
			}
		default:
			fmt.Fprintf(os.Stderr, "Unknown config key: %s\n", key)
			os.Exit(1)
		}

		fmt.Println(value)
	},
}

var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "Show configuration file path",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(config.ConfigPath())
	},
}

var configContextCmd = &cobra.Command{
	Use:   "context",
	Short: "Show detected EPF context",
	Run: func(cmd *cobra.Command, args []string) {
		PrintContext()
	},
}

func showConfig() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Configuration file: %s\n\n", config.ConfigPath())

	if !cfg.IsConfigured() {
		fmt.Println("No configuration found. Run 'epf-cli config init' to set up.")
		fmt.Println()
	}

	fmt.Println("Settings:")

	// Canonical repo
	repo := cfg.CanonicalRepo
	if repo == "" {
		repo = config.DefaultCanonicalRepo + " (default)"
	}
	fmt.Printf("  canonical_repo:    %s\n", repo)

	// Canonical path
	path := cfg.CanonicalPath
	if path == "" {
		path = "(not set)"
	}
	fmt.Printf("  canonical_path:    %s\n", path)

	// Default instance
	inst := cfg.DefaultInstance
	if inst == "" {
		inst = "(not set)"
	}
	fmt.Printf("  default_instance:  %s\n", inst)

	fmt.Println()

	// Show detected context
	fmt.Println("Detected Context:")
	if epfContext == nil {
		fmt.Println("  (not in an EPF directory)")
	} else {
		fmt.Printf("  Type:      %s\n", epfContext.Type)
		if epfContext.EPFRoot != "" {
			fmt.Printf("  EPF Root:  %s\n", epfContext.EPFRoot)
		}
		if len(epfContext.Instances) > 0 {
			fmt.Printf("  Instances: %v\n", epfContext.Instances)
		}
		if epfContext.CurrentInstance != "" {
			fmt.Printf("  Current:   %s (%s)\n", epfContext.CurrentInstance, epfContext.InstancePath)
		}
	}
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configShowCmd)
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configSetCmd)
	configCmd.AddCommand(configGetCmd)
	configCmd.AddCommand(configPathCmd)
	configCmd.AddCommand(configContextCmd)
}
