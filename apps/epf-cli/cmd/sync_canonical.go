package cmd

import (
	"encoding/json"
	"fmt"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/spf13/cobra"
	"os"
	"path/filepath"
)

var (
	syncForce  bool
	syncDryRun bool
	syncJSON   bool
)

var syncCanonicalCmd = &cobra.Command{
	Use:   "sync-canonical [instance-path]",
	Short: "Sync canonical artifacts to an existing EPF instance",
	Long: `Add missing canonical artifacts (definitions and value models) to an existing
EPF instance. This is useful for instances created before the canonical artifact
awareness feature was added.

Canonical artifacts include:
  - Track definitions (strategy, org_ops, commercial) in FIRE/definitions/
  - Track value models (strategy, org_ops, commercial) in FIRE/value_models/

Product artifacts are NOT synced (product value models are user-authored).

By default, existing files are skipped. Use --force to overwrite them.
Use --dry-run to preview what would be synced without writing.

Examples:
  epf-cli sync-canonical                                  # Auto-detect instance
  epf-cli sync-canonical docs/EPF/_instances/my-product   # Specific instance
  epf-cli sync-canonical --dry-run                        # Preview changes
  epf-cli sync-canonical --force                          # Overwrite existing`,
	Args: cobra.MaximumNArgs(1),
	Run:  runSyncCanonical,
}

// SyncCanonicalResult is the JSON output structure
type SyncCanonicalResult struct {
	Success  bool     `json:"success"`
	Instance string   `json:"instance_path"`
	DryRun   bool     `json:"dry_run"`
	Force    bool     `json:"force"`
	Added    []string `json:"added"`
	Skipped  []string `json:"skipped"`
	Updated  []string `json:"updated"`
	Errors   []string `json:"errors,omitempty"`
	Summary  struct {
		AddedCount   int `json:"added"`
		SkippedCount int `json:"skipped"`
		UpdatedCount int `json:"updated"`
		ErrorCount   int `json:"errors"`
	} `json:"summary"`
}

func runSyncCanonical(cmd *cobra.Command, args []string) {
	// Protect canonical EPF from accidental writes
	if err := EnsureNotCanonical("sync canonical artifacts"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Resolve instance path
	var instanceDir string
	var err error
	if len(args) > 0 {
		instanceDir, err = filepath.Abs(args[0])
	} else {
		instanceDir, err = GetInstancePath(nil)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %s\n", err)
		os.Exit(1)
	}

	// Block writes to canonical EPF paths
	if err := EnsurePathNotCanonical(instanceDir, "sync canonical artifacts"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Check available canonical artifacts
	defCount, vmCount, err := embedded.ListCanonicalArtifacts()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: could not list embedded canonical artifacts: %s\n", err)
		os.Exit(1)
	}

	if !syncJSON {
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("  Sync Canonical Artifacts")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("  Instance: %s\n", instanceDir)
		fmt.Printf("  Available: %d definitions, %d value models\n", defCount, vmCount)
		if syncDryRun {
			fmt.Println("  Mode: DRY RUN (no files will be written)")
		} else if syncForce {
			fmt.Println("  Mode: FORCE (existing files will be overwritten)")
		} else {
			fmt.Println("  Mode: Normal (existing files will be skipped)")
		}
		fmt.Println()
	}

	// Run sync
	opts := embedded.SyncOptions{
		Force:  syncForce,
		DryRun: syncDryRun,
	}

	result, err := embedded.SyncCanonical(instanceDir, opts)
	if err != nil {
		if syncJSON {
			jsonResult := SyncCanonicalResult{
				Success:  false,
				Instance: instanceDir,
				DryRun:   syncDryRun,
				Force:    syncForce,
				Errors:   []string{err.Error()},
			}
			data, _ := json.MarshalIndent(jsonResult, "", "  ")
			fmt.Println(string(data))
		} else {
			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
		}
		os.Exit(1)
	}

	// Relativize paths for display
	relAdded := relativizePaths(result.Added, instanceDir)
	relSkipped := relativizePaths(result.Skipped, instanceDir)
	relUpdated := relativizePaths(result.Updated, instanceDir)

	if syncJSON {
		jsonResult := SyncCanonicalResult{
			Success:  len(result.Errors) == 0,
			Instance: instanceDir,
			DryRun:   syncDryRun,
			Force:    syncForce,
			Added:    relAdded,
			Skipped:  relSkipped,
			Updated:  relUpdated,
			Errors:   result.Errors,
		}
		jsonResult.Summary.AddedCount = len(result.Added)
		jsonResult.Summary.SkippedCount = len(result.Skipped)
		jsonResult.Summary.UpdatedCount = len(result.Updated)
		jsonResult.Summary.ErrorCount = len(result.Errors)
		data, _ := json.MarshalIndent(jsonResult, "", "  ")
		fmt.Println(string(data))
		return
	}

	// Human-readable output
	if len(result.Added) > 0 {
		verb := "Added"
		if syncDryRun {
			verb = "Would add"
		}
		fmt.Printf("  %s (%d files):\n", verb, len(result.Added))
		for _, f := range relAdded {
			fmt.Printf("    + %s\n", f)
		}
		fmt.Println()
	}

	if len(result.Updated) > 0 {
		verb := "Updated"
		if syncDryRun {
			verb = "Would update"
		}
		fmt.Printf("  %s (%d files):\n", verb, len(result.Updated))
		for _, f := range relUpdated {
			fmt.Printf("    ~ %s\n", f)
		}
		fmt.Println()
	}

	if len(result.Skipped) > 0 {
		fmt.Printf("  Skipped (%d files already exist):\n", len(result.Skipped))
		// Only show first few to avoid flooding output
		limit := 5
		for i, f := range relSkipped {
			if i >= limit {
				fmt.Printf("    ... and %d more\n", len(relSkipped)-limit)
				break
			}
			fmt.Printf("    - %s\n", f)
		}
		fmt.Println()
	}

	if len(result.Errors) > 0 {
		fmt.Printf("  Errors (%d):\n", len(result.Errors))
		for _, e := range result.Errors {
			fmt.Printf("    ! %s\n", e)
		}
		fmt.Println()
	}

	// Summary
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("  Summary: added=%d, skipped=%d, updated=%d, errors=%d\n",
		len(result.Added), len(result.Skipped), len(result.Updated), len(result.Errors))

	if syncDryRun && result.TotalChanged() > 0 {
		fmt.Println()
		fmt.Println("  Run without --dry-run to apply changes.")
	}
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

// relativizePaths converts absolute paths to paths relative to the instance directory
func relativizePaths(paths []string, base string) []string {
	rel := make([]string, len(paths))
	for i, p := range paths {
		r, err := filepath.Rel(base, p)
		if err != nil {
			rel[i] = p
		} else {
			rel[i] = r
		}
	}
	return rel
}

func init() {
	rootCmd.AddCommand(syncCanonicalCmd)
	syncCanonicalCmd.Flags().BoolVarP(&syncForce, "force", "f", false, "overwrite existing files")
	syncCanonicalCmd.Flags().BoolVar(&syncDryRun, "dry-run", false, "preview changes without writing")
	syncCanonicalCmd.Flags().BoolVar(&syncJSON, "json", false, "output as JSON")
}
