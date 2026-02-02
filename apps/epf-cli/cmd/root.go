package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

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
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringP("config", "c", "", "config file (default is .epf-cli.yaml)")
}
