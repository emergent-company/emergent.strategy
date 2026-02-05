package cmd

import (
	"fmt"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/embedded"
	"github.com/spf13/cobra"
)

var (
	Version   = "0.1.0"
	GitCommit = "dev"
	BuildDate = "unknown"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version information",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("epf-cli %s\n", Version)
		fmt.Printf("  commit: %s\n", GitCommit)
		fmt.Printf("  built:  %s\n", BuildDate)

		// Show embedded artifacts info
		if embedded.HasEmbeddedArtifacts() {
			fmt.Printf("\nEmbedded EPF Framework:\n")
			fmt.Printf("  version: %s\n", embedded.GetVersion())

			schemas, _ := embedded.ListSchemas()
			fmt.Printf("  schemas: %d\n", len(schemas))

			wizards, _ := embedded.ListWizards()
			fmt.Printf("  wizards: %d\n", len(wizards))

			generators, _ := embedded.ListGenerators()
			fmt.Printf("  generators: %d\n", len(generators))
		} else {
			fmt.Printf("\nNo embedded EPF artifacts (external framework required)\n")
		}
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
