package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/migration"
	"github.com/spf13/cobra"
)

var (
	migrateDefsDryRun bool
	migrateDefsJSON   bool
)

var migrateDefinitionsCmd = &cobra.Command{
	Use:   "definitions [instance-path]",
	Short: "Migrate definitions to unified FIRE/definitions/ structure",
	Long: `Migrate EPF definitions from legacy locations to the unified FIRE/definitions/ structure.

This moves:
  FIRE/feature_definitions/  →  FIRE/definitions/product/
  READY/definitions/strategy/  →  FIRE/definitions/strategy/
  READY/definitions/org_ops/  →  FIRE/definitions/org_ops/
  READY/definitions/commercial/  →  FIRE/definitions/commercial/

If the instance is a git submodule, migration is refused (must be done in the source repo).

Examples:
  epf-cli migrate definitions .                 # Migrate current instance
  epf-cli migrate definitions . --dry-run       # Preview what would move
  epf-cli migrate definitions ./path/to/instance --json`,
	Args: cobra.MaximumNArgs(1),
	RunE: runMigrateDefinitions,
}

func init() {
	migrateCmd.AddCommand(migrateDefinitionsCmd)
	migrateDefinitionsCmd.Flags().BoolVar(&migrateDefsDryRun, "dry-run", false, "Preview what would move without making changes")
	migrateDefinitionsCmd.Flags().BoolVar(&migrateDefsJSON, "json", false, "Output result as JSON")
}

func runMigrateDefinitions(cmd *cobra.Command, args []string) error {
	instancePath := "."
	if len(args) > 0 {
		instancePath = args[0]
	}

	result, err := migration.MigrateDefinitions(instancePath, migrateDefsDryRun)
	if err != nil {
		// If it's a submodule guard error, still print the result if JSON requested
		if migrateDefsJSON && result != nil {
			printMigrateDefsJSON(result, err)
			return nil
		}
		return err
	}

	if migrateDefsJSON {
		printMigrateDefsJSON(result, nil)
		return nil
	}

	// Human-readable output
	printMigrateDefsHuman(result)
	return nil
}

func printMigrateDefsJSON(result *migration.DefinitionMigrationResult, migrationErr error) {
	output := struct {
		*migration.DefinitionMigrationResult
		Error string `json:"error,omitempty"`
	}{
		DefinitionMigrationResult: result,
	}
	if migrationErr != nil {
		output.Error = migrationErr.Error()
	}
	data, _ := json.MarshalIndent(output, "", "  ")
	fmt.Println(string(data))
}

func printMigrateDefsHuman(result *migration.DefinitionMigrationResult) {
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	if result.DryRun {
		fmt.Println("  Definition Migration (dry-run)")
	} else {
		fmt.Println("  Definition Migration")
	}
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	if !result.NeedsMigrate {
		fmt.Println("  Nothing to migrate. Definitions are already in the new structure.")
		fmt.Println()
		return
	}

	if result.IsSubmodule {
		fmt.Println("  WARNING: Instance is a git submodule.")
		if result.SubmoduleURL != "" {
			fmt.Printf("  Remote: %s\n", result.SubmoduleURL)
		}
		fmt.Println()
	}

	for _, move := range result.Moves {
		if result.DryRun {
			fmt.Printf("  [would move] %s → %s\n", move.OldPath, move.NewPath)
		} else {
			fmt.Printf("  [moved] %s → %s\n", move.OldPath, move.NewPath)
		}
	}

	if len(result.Warnings) > 0 {
		fmt.Println()
		for _, w := range result.Warnings {
			fmt.Printf("  WARNING: %s\n", w)
		}
	}

	fmt.Println()
	fmt.Printf("  Total files: %d\n", len(result.Moves))
	if result.DryRun {
		fmt.Println()
		fmt.Println("  Run without --dry-run to apply.")
	} else {
		fmt.Println()
		fmt.Println("  Migration complete. Run `epf-cli health` to verify.")
	}
	fmt.Println()
}
