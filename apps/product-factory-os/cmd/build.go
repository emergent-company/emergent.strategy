package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var buildCmd = &cobra.Command{
	Use:   "build [track]",
	Short: "Compile EPF artifacts to outputs",
	Long: `Compile EPF source artifacts into executable outputs.

Tracks:
  strategy   - Compile strategy/*.yaml → decisions.md
  product    - Compile product/*.yaml → (triggers OpenCode build)
  ops        - Compile ops/*.yaml → process.json
  commercial - Compile growth/*.yaml → campaign.csv
  all        - Build all tracks

Examples:
  pfos build all
  pfos build strategy
  pfos build ops --output ./dist`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		track := "all"
		if len(args) > 0 {
			track = args[0]
		}

		output, _ := cmd.Flags().GetString("output")
		fmt.Printf("Building track: %s\n", track)
		if output != "" {
			fmt.Printf("Output directory: %s\n", output)
		}

		// TODO: Implement build logic
		fmt.Println("✓ Build complete")
	},
}

func init() {
	rootCmd.AddCommand(buildCmd)
	buildCmd.Flags().StringP("output", "o", "", "output directory for artifacts")
}
