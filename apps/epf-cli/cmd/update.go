package cmd

import (
	"fmt"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/update"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version"
	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update epf-cli to the latest version",
	Long: `Check for and install the latest version of epf-cli.

If installed via Homebrew, this command will suggest using brew upgrade instead.
For standalone installations, it downloads the latest release from GitHub,
verifies the SHA256 checksum, and replaces the current binary.

Disable automatic update checks on startup with:
  export EPF_CLI_NO_UPDATE_CHECK=1
  # or set update_check: false in ~/.epf-cli.yaml`,
	Run: func(cmd *cobra.Command, args []string) {
		runUpdate(cmd)
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}

func runUpdate(cmd *cobra.Command) {
	currentVersion := version.Version
	if currentVersion == "dev" || currentVersion == "" {
		fmt.Fprintln(os.Stderr, "Cannot update a development build. Build from source or install a release.")
		os.Exit(1)
	}

	// Check if installed via Homebrew
	if update.IsHomebrew() {
		fmt.Println("epf-cli was installed via Homebrew.")
		fmt.Println()

		// Still check for updates to show version info
		result, _, err := update.CheckWithCache(currentVersion)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to check for updates: %v\n", err)
			os.Exit(1)
		}

		if result.UpdateAvailable {
			fmt.Printf("  Current: %s\n", result.CurrentVersion)
			fmt.Printf("  Latest:  %s\n", result.LatestVersion)
			fmt.Println()
			fmt.Println("To update, run:")
			fmt.Println("  brew upgrade epf-cli")
		} else {
			fmt.Printf("Already at the latest version (%s).\n", currentVersion)
		}
		return
	}

	// Standalone binary — perform self-update
	fmt.Printf("Checking for updates (current: %s)...\n", currentVersion)

	// Force a fresh check (bypass cache)
	result, err := update.Check(currentVersion)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to check for updates: %v\n", err)
		os.Exit(1)
	}

	if !result.UpdateAvailable {
		fmt.Printf("Already at the latest version (%s).\n", currentVersion)
		return
	}

	fmt.Printf("New version available: %s → %s\n", result.CurrentVersion, result.LatestVersion)
	fmt.Printf("Downloading and installing...\n")

	newVersion, err := update.SelfUpdate(currentVersion)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Update failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Successfully updated to %s!\n", newVersion)
}
