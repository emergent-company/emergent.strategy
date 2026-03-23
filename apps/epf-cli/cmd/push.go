package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
	"github.com/spf13/cobra"
)

var pushDryRun bool

var pushCmd = &cobra.Command{
	Use:   "push",
	Short: "Push EPF changes and update consumer submodule pointers",
	Long: `Pushes the current branch to the remote and updates submodule pointers
in all consumer repos listed in _epf.yaml deployment.consumers.

This ensures consumer repos always point to the latest EPF commit.

Only applies when deployment.mode is "submodule". For integrated mode,
use normal git push.

The command:
  1. Runs 'git push' on the current repo
  2. For each consumer with auto_update: true:
     a. Fetches the latest in the submodule directory
     b. Stages the submodule pointer update
     c. Commits and pushes

Requires consumer repos to be cloned locally as siblings or at known paths.`,
	RunE: runPush,
}

func init() {
	pushCmd.Flags().BoolVar(&pushDryRun, "dry-run", false, "Show what would be done without executing")
	rootCmd.AddCommand(pushCmd)
}

func runPush(cmd *cobra.Command, args []string) error {
	// Find _epf.yaml
	a, err := anchor.Load(anchor.AnchorFileName)
	if err != nil {
		return fmt.Errorf("read anchor: %w (are you in an EPF instance directory?)", err)
	}

	if !a.IsSubmodule() {
		fmt.Println("This instance is not in submodule mode. Using regular git push.")
		if pushDryRun {
			fmt.Println("[dry-run] Would run: git push")
			return nil
		}
		return gitExec("push")
	}

	consumers := a.GetConsumers()
	if len(consumers) == 0 {
		fmt.Println("No consumers configured in _epf.yaml. Using regular git push.")
		if pushDryRun {
			fmt.Println("[dry-run] Would run: git push")
			return nil
		}
		return gitExec("push")
	}

	// Step 1: Push this repo
	fmt.Println("Step 1: Pushing EPF repo...")
	if pushDryRun {
		fmt.Println("[dry-run] Would run: git push")
	} else {
		if err := gitExec("push"); err != nil {
			return fmt.Errorf("git push failed: %w", err)
		}
	}

	// Step 2: Update consumer submodule pointers
	fmt.Printf("\nStep 2: Updating %d consumer(s)...\n", len(consumers))

	cwd, _ := os.Getwd()
	parentDir := filepath.Dir(cwd)

	for _, consumer := range consumers {
		if !consumer.AutoUpdate {
			fmt.Printf("  skip %s — auto_update disabled, skipping\n", consumer.Repo)
			continue
		}

		fmt.Printf("  -> %s (%s on %s)\n", consumer.Repo, consumer.Path, consumer.Branch)

		// Try to find consumer repo locally
		// Convention: look for repo name as sibling directory
		parts := strings.Split(consumer.Repo, "/")
		repoName := parts[len(parts)-1]
		consumerDir := filepath.Join(parentDir, repoName)

		if _, err := os.Stat(consumerDir); os.IsNotExist(err) {
			fmt.Printf("    WARNING: Consumer repo not found locally at %s — skipping\n", consumerDir)
			fmt.Printf("    Clone it with: git clone https://github.com/%s %s\n", consumer.Repo, consumerDir)
			continue
		}

		submodulePath := filepath.Join(consumerDir, consumer.Path)
		if _, err := os.Stat(submodulePath); os.IsNotExist(err) {
			fmt.Printf("    WARNING: Submodule path %s not found — skipping\n", submodulePath)
			continue
		}

		if pushDryRun {
			fmt.Printf("    [dry-run] Would update submodule at %s\n", submodulePath)
			continue
		}

		// Pull latest in submodule
		pullCmd := exec.Command("git", "-C", submodulePath, "pull")
		if out, err := pullCmd.CombinedOutput(); err != nil {
			fmt.Printf("    WARNING: Failed to pull submodule: %s\n", strings.TrimSpace(string(out)))
			continue
		}

		// Stage submodule pointer
		addCmd := exec.Command("git", "-C", consumerDir, "add", consumer.Path)
		if out, err := addCmd.CombinedOutput(); err != nil {
			fmt.Printf("    WARNING: Failed to stage submodule: %s\n", strings.TrimSpace(string(out)))
			continue
		}

		// Check if there's actually a change
		diffCmd := exec.Command("git", "-C", consumerDir, "diff", "--cached", "--quiet")
		if diffCmd.Run() == nil {
			fmt.Printf("    OK: Already up to date\n")
			continue
		}

		// Commit and push
		commitMsg := fmt.Sprintf("chore: update %s submodule to latest", consumer.Path)
		commitCmd := exec.Command("git", "-C", consumerDir, "commit", "-m", commitMsg)
		if out, err := commitCmd.CombinedOutput(); err != nil {
			fmt.Printf("    WARNING: Failed to commit: %s\n", strings.TrimSpace(string(out)))
			continue
		}

		pushConsumerCmd := exec.Command("git", "-C", consumerDir, "push")
		if out, err := pushConsumerCmd.CombinedOutput(); err != nil {
			fmt.Printf("    WARNING: Failed to push: %s\n", strings.TrimSpace(string(out)))
			continue
		}

		fmt.Printf("    OK: Updated and pushed\n")
	}

	fmt.Println("\nDone.")
	return nil
}

func gitExec(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
