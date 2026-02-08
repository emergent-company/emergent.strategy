package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/anchor"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/discovery"
	"github.com/spf13/cobra"
)

var migrateAnchorCmd = &cobra.Command{
	Use:   "migrate-anchor [instance-path]",
	Short: "Add anchor file to legacy EPF instance",
	Long: `Add an anchor file (_epf.yaml) to a legacy EPF instance that doesn't have one.

The anchor file is the authoritative marker that identifies a directory as a valid
EPF instance. Legacy instances (created before the anchor file was introduced) can
be migrated using this command.

The command will:
1. Detect if the path is a valid legacy EPF instance (has READY/FIRE/AIM but no _epf.yaml)
2. Infer metadata from existing files (_meta.yaml, directory structure)
3. Create the _epf.yaml anchor file with appropriate metadata

Examples:
  epf-cli migrate-anchor docs/EPF/_instances/my-product
  epf-cli migrate-anchor . --dry-run
  epf-cli migrate-anchor docs/EPF/_instances/my-product --force`,
	Args: cobra.MaximumNArgs(1),
	RunE: runMigrateAnchor,
}

var (
	migrateAnchorDryRun bool
	migrateAnchorForce  bool
	migrateAnchorJSON   bool
)

func init() {
	rootCmd.AddCommand(migrateAnchorCmd)
	migrateAnchorCmd.Flags().BoolVar(&migrateAnchorDryRun, "dry-run", false, "preview changes without creating the anchor file")
	migrateAnchorCmd.Flags().BoolVarP(&migrateAnchorForce, "force", "f", false, "overwrite existing anchor file")
	migrateAnchorCmd.Flags().BoolVar(&migrateAnchorJSON, "json", false, "output as JSON")
}

// MigrateAnchorResult represents the result of the migration
type MigrateAnchorResult struct {
	Success    bool                     `json:"success"`
	Path       string                   `json:"path"`
	DryRun     bool                     `json:"dry_run"`
	AnchorFile string                   `json:"anchor_file,omitempty"`
	Anchor     *anchor.Anchor           `json:"anchor,omitempty"`
	Validation *anchor.ValidationResult `json:"validation,omitempty"`
	Message    string                   `json:"message"`
	Warnings   []string                 `json:"warnings,omitempty"`
	Errors     []string                 `json:"errors,omitempty"`
}

func runMigrateAnchor(cmd *cobra.Command, args []string) error {
	// Determine path to migrate
	var instancePath string
	if len(args) > 0 {
		instancePath = args[0]
	} else {
		// Use current directory
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get current directory: %w", err)
		}
		instancePath = cwd
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(instancePath)
	if err != nil {
		return fmt.Errorf("failed to resolve path: %w", err)
	}

	result := &MigrateAnchorResult{
		Path:   absPath,
		DryRun: migrateAnchorDryRun,
	}

	// Check if anchor already exists
	if anchor.Exists(absPath) && !migrateAnchorForce {
		result.Success = false
		result.Message = "Anchor file already exists"
		result.Errors = append(result.Errors, "Use --force to overwrite existing anchor file")

		if migrateAnchorJSON {
			return outputMigrateAnchorJSON(result)
		}
		return fmt.Errorf("anchor file already exists at %s. Use --force to overwrite", absPath)
	}

	// Check if it's a legacy EPF instance
	if !anchor.IsLegacyInstance(absPath) && !anchor.Exists(absPath) {
		// Not a legacy instance and no anchor - might not be an EPF instance at all
		result.Success = false
		result.Message = "Not a valid EPF instance"
		result.Errors = append(result.Errors, "Directory does not appear to be an EPF instance (missing READY/FIRE/AIM directories)")

		if migrateAnchorJSON {
			return outputMigrateAnchorJSON(result)
		}
		return fmt.Errorf("directory does not appear to be an EPF instance: %s", absPath)
	}

	// Infer anchor from legacy artifacts
	inferredAnchor, err := anchor.InferFromLegacy(absPath)
	if err != nil {
		result.Success = false
		result.Message = "Failed to infer anchor metadata"
		result.Errors = append(result.Errors, err.Error())

		if migrateAnchorJSON {
			return outputMigrateAnchorJSON(result)
		}
		return fmt.Errorf("failed to infer anchor metadata: %w", err)
	}

	result.Anchor = inferredAnchor
	result.AnchorFile = filepath.Join(absPath, anchor.AnchorFileName)

	// Add warnings for missing optional fields
	if inferredAnchor.ProductName == "" {
		result.Warnings = append(result.Warnings, "Could not infer product name from _meta.yaml")
	}
	if inferredAnchor.EPFVersion == "" {
		result.Warnings = append(result.Warnings, "Could not infer EPF version from existing artifacts")
	}

	// Dry run - just show what would be created
	if migrateAnchorDryRun {
		result.Success = true
		result.Message = "Dry run: would create anchor file"

		if migrateAnchorJSON {
			return outputMigrateAnchorJSON(result)
		}

		return outputMigrateAnchorDryRun(result)
	}

	// Actually create the anchor file
	if err := inferredAnchor.Save(absPath); err != nil {
		result.Success = false
		result.Message = "Failed to create anchor file"
		result.Errors = append(result.Errors, err.Error())

		if migrateAnchorJSON {
			return outputMigrateAnchorJSON(result)
		}
		return fmt.Errorf("failed to create anchor file: %w", err)
	}

	// Validate the newly created anchor
	result.Validation = anchor.ValidateFile(absPath)

	result.Success = true
	result.Message = "Successfully created anchor file"

	if migrateAnchorJSON {
		return outputMigrateAnchorJSON(result)
	}

	return outputMigrateAnchorSuccess(result)
}

func outputMigrateAnchorJSON(result *MigrateAnchorResult) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(result)
}

func outputMigrateAnchorDryRun(result *MigrateAnchorResult) error {
	fmt.Println("DRY RUN: Anchor Migration Preview")
	fmt.Println("==================================")
	fmt.Println()
	fmt.Printf("Instance Path: %s\n", result.Path)
	fmt.Printf("Anchor File:   %s\n", result.AnchorFile)
	fmt.Println()
	fmt.Println("Inferred Anchor Content:")
	fmt.Println("------------------------")

	if result.Anchor != nil {
		yaml, err := result.Anchor.ToYAML()
		if err == nil {
			fmt.Println(yaml)
		}
	}

	if len(result.Warnings) > 0 {
		fmt.Println()
		fmt.Println("Warnings:")
		for _, w := range result.Warnings {
			fmt.Printf("  ⚠️  %s\n", w)
		}
	}

	fmt.Println()
	fmt.Println("Run without --dry-run to create the anchor file.")

	return nil
}

func outputMigrateAnchorSuccess(result *MigrateAnchorResult) error {
	fmt.Println("✓ Anchor file created successfully!")
	fmt.Println()
	fmt.Printf("Instance Path: %s\n", result.Path)
	fmt.Printf("Anchor File:   %s\n", result.AnchorFile)
	fmt.Println()

	if result.Anchor != nil {
		fmt.Println("Anchor Content:")
		fmt.Println("---------------")
		yaml, err := result.Anchor.ToYAML()
		if err == nil {
			fmt.Println(yaml)
		}
	}

	if len(result.Warnings) > 0 {
		fmt.Println()
		fmt.Println("Warnings:")
		for _, w := range result.Warnings {
			fmt.Printf("  ⚠️  %s\n", w)
		}
	}

	// Validation result
	if result.Validation != nil {
		fmt.Println()
		fmt.Println("Validation:")
		if result.Validation.Valid {
			fmt.Println("  ✓ Anchor file is valid")
		} else {
			fmt.Println("  ✗ Anchor file has validation errors:")
			for _, e := range result.Validation.Errors {
				fmt.Printf("    - %s\n", e)
			}
		}
		if len(result.Validation.Warnings) > 0 {
			for _, w := range result.Validation.Warnings {
				fmt.Printf("  ⚠️  %s\n", w)
			}
		}
	}

	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. Review the anchor file and update any inferred values")
	fmt.Println("  2. Run 'epf-cli health' to validate the instance")
	fmt.Println("  3. Commit the anchor file to version control")

	// Verify the instance can now be discovered
	disc, err := discovery.DiscoverSingle(result.Path)
	if err == nil && disc.Status == discovery.StatusValid {
		fmt.Println()
		fmt.Printf("✓ Instance now discoverable with confidence: %s\n", disc.Confidence)
	}

	return nil
}
