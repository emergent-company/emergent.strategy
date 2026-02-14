package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "emergent-strategy",
	Short: "Emergent Strategy (formerly ProductFactoryOS) - Local-First Venture Compiler",
	Long: `Emergent Strategy (formerly ProductFactoryOS) is a "Local-First Venture Compiler."

It treats Business Logic (Strategy, Ops, Commercial) exactly like
Software Logic. Both are defined in source code (.yaml), versioned
in Git, and "compiled" into executable outputs.

Modes:
  emergent-strategy tui     - Interactive TUI (Developer Console)
  emergent-strategy server  - Web Dashboard (Stakeholder View)
  emergent-strategy build   - Compile EPF artifacts to outputs

The Core Philosophy:
  1. Everything is Code: Strategy is YAML. Process is Markdown.
  2. One Universal Writer: OpenCode writes all files.
  3. Git is God: The Repo is the Database.`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringP("repo", "r", ".", "path to EPF repository")
}
