package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
)

var schemaGenerateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Generate Memory schema JSON from decomposer type definitions",
	Long: `Generate a complete Memory schema (template pack) JSON from the decomposer's
Go type definitions. The schema is always in sync with the decomposer because
it's derived from the same source code.

Output the JSON to stdout — pipe to a file or to 'memory schemas install':

  epf-cli schema generate > epf-engine.json
  epf-cli schema generate | memory schemas install --file - --merge`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pack := decompose.GenerateTemplatePack()
		out, err := json.MarshalIndent(pack, "", "  ")
		if err != nil {
			return fmt.Errorf("marshal template pack: %w", err)
		}
		fmt.Println(string(out))
		return nil
	},
}

func init() {
	schemasCmd.AddCommand(schemaGenerateCmd)
}
