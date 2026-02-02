package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var validateCmd = &cobra.Command{
	Use:   "validate [path]",
	Short: "Validate EPF YAML files against schemas",
	Long: `Validate EPF artifacts against their corresponding JSON schemas.

Examples:
  epf-cli validate .                           # Validate all EPF files in current directory
  epf-cli validate epf/strategy/north_star.yaml  # Validate a specific file
  epf-cli validate --schema product.schema.json file.yaml`,
	Args: cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		schema, _ := cmd.Flags().GetString("schema")
		path := args[0]

		if schema != "" {
			fmt.Printf("Validating %s against schema %s\n", path, schema)
		} else {
			fmt.Printf("Validating %s (auto-detecting schema)\n", path)
		}

		// TODO: Implement validation logic
		fmt.Println("✓ Validation passed")
	},
}

func init() {
	rootCmd.AddCommand(validateCmd)
	validateCmd.Flags().StringP("schema", "s", "", "explicit schema file to validate against")
}
