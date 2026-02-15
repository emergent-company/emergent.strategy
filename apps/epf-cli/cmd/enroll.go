package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	enrollPath   string
	enrollDryRun bool
)

var enrollCmd = &cobra.Command{
	Use:   "enroll <url>",
	Short: "Enroll this repository in an EPF strategy instance",
	Long: `Enroll this repository in an EPF strategy instance via git submodule.

This command automates the enrollment process:
  1. Adds the EPF instance repository as a git submodule
  2. Initializes the submodule
  3. Creates a .epf.yaml configuration file at the repo root
  4. Prints an AGENTS.md snippet for AI agent integration

The default mount path is derived from the URL:
  https://github.com/org/my-epf.git → docs/EPF/_instances/my-epf/

Override with --path if needed.

Examples:
  epf enroll https://github.com/emergent-company/emergent-epf.git
  epf enroll git@github.com:org/strategy.git --path docs/EPF/_instances/strategy
  epf enroll https://github.com/org/epf.git --dry-run`,
	Args: cobra.ExactArgs(1),
	Run:  runEnroll,
}

func runEnroll(cmd *cobra.Command, args []string) {
	url := args[0]

	// Ensure we're in a git repo
	if !isGitRepo(".") {
		fmt.Fprintln(os.Stderr, "Error: Not in a git repository")
		fmt.Fprintln(os.Stderr, "Run 'git init' first, then try again")
		os.Exit(1)
	}

	// Protect canonical EPF from accidental writes
	if err := EnsureNotCanonical("enroll"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Derive the instance name from the URL
	instanceName := deriveInstanceName(url)
	if instanceName == "" {
		fmt.Fprintln(os.Stderr, "Error: Could not derive instance name from URL")
		fmt.Fprintln(os.Stderr, "Use --path to specify the mount path explicitly")
		os.Exit(1)
	}

	// Determine mount path
	mountPath := enrollPath
	if mountPath == "" {
		mountPath = filepath.Join("docs", "EPF", "_instances", instanceName)
	}

	// Find repo root
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	root := config.FindRepoRoot(cwd)
	if root == "" {
		fmt.Fprintln(os.Stderr, "Error: Could not find git repository root")
		os.Exit(1)
	}

	// Check idempotency: is this repo already enrolled?
	existingConfig, existingRoot, _ := config.LoadRepoConfigFromCwd()
	if existingConfig != nil && existingConfig.InstancePath != "" {
		fmt.Println("This repository is already enrolled in EPF.")
		fmt.Println()
		fmt.Printf("  Instance path: %s\n", existingConfig.InstancePath)
		fmt.Printf("  Mode:          %s\n", existingConfig.Mode)
		fmt.Printf("  Config file:   %s\n", filepath.Join(existingRoot, config.RepoConfigFileName))
		fmt.Println()

		// Check if the instance path matches
		if existingConfig.InstancePath == mountPath {
			fmt.Println("The enrollment matches the existing configuration. Nothing to do.")
			return
		}

		fmt.Fprintf(os.Stderr, "Warning: Existing enrollment points to '%s', but you requested '%s'\n",
			existingConfig.InstancePath, mountPath)
		fmt.Fprintln(os.Stderr, "Remove .epf.yaml manually if you want to re-enroll with a different path")
		os.Exit(1)
	}

	// Check if mount path already exists (submodule already added manually)
	mountAbs := filepath.Join(root, mountPath)
	if info, err := os.Stat(mountAbs); err == nil && info.IsDir() {
		// Directory exists — check if it looks like a valid EPF instance
		if _, err := os.Stat(filepath.Join(mountAbs, "_epf.yaml")); err == nil {
			fmt.Printf("EPF instance already exists at %s\n", mountPath)
			fmt.Println("Creating .epf.yaml to complete enrollment...")
			fmt.Println()

			if !enrollDryRun {
				rc := &config.RepoConfig{
					InstancePath: mountPath,
					Mode:         "submodule",
					Schemas:      "embedded",
				}
				if err := rc.SaveRepoConfig(root); err != nil {
					fmt.Fprintf(os.Stderr, "Error creating .epf.yaml: %v\n", err)
					os.Exit(1)
				}
				fmt.Printf("Created %s\n", filepath.Join(root, config.RepoConfigFileName))
			} else {
				fmt.Println("[dry-run] Would create .epf.yaml at repo root")
			}

			printAgentsSnippet(mountPath)
			return
		}
	}

	// Print plan
	fmt.Println("EPF Enrollment Plan")
	fmt.Println("========================================")
	fmt.Printf("  URL:        %s\n", url)
	fmt.Printf("  Mount path: %s\n", mountPath)
	fmt.Printf("  Repo root:  %s\n", root)
	fmt.Println()

	if enrollDryRun {
		fmt.Println("[dry-run] Would execute the following:")
		fmt.Printf("  1. git submodule add %s %s\n", url, mountPath)
		fmt.Println("  2. git submodule update --init")
		fmt.Printf("  3. Create .epf.yaml at %s\n", root)
		fmt.Println()
		printAgentsSnippet(mountPath)
		return
	}

	// Step 1: git submodule add
	fmt.Println("Step 1: Adding git submodule...")
	fmt.Printf("  $ git submodule add %s %s\n", url, mountPath)

	addCmd := exec.Command("git", "submodule", "add", url, mountPath)
	addCmd.Dir = root
	addCmd.Stdout = os.Stdout
	addCmd.Stderr = os.Stderr
	if err := addCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "\nError adding submodule: %v\n", err)
		fmt.Fprintln(os.Stderr, "\nPossible causes:")
		fmt.Fprintln(os.Stderr, "  - The URL is invalid or inaccessible")
		fmt.Fprintln(os.Stderr, "  - The path already exists in .gitmodules")
		fmt.Fprintln(os.Stderr, "  - You don't have permission to access the repository")
		os.Exit(1)
	}
	fmt.Println("  Done.")
	fmt.Println()

	// Step 2: git submodule update --init
	fmt.Println("Step 2: Initializing submodule...")
	fmt.Println("  $ git submodule update --init")

	updateCmd := exec.Command("git", "submodule", "update", "--init")
	updateCmd.Dir = root
	updateCmd.Stdout = os.Stdout
	updateCmd.Stderr = os.Stderr
	if err := updateCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "\nWarning: submodule update failed: %v\n", err)
		fmt.Fprintln(os.Stderr, "The submodule was added but may not be initialized.")
		fmt.Fprintln(os.Stderr, "Run 'git submodule update --init' manually.")
	} else {
		fmt.Println("  Done.")
	}
	fmt.Println()

	// Step 3: Create .epf.yaml
	fmt.Println("Step 3: Creating .epf.yaml configuration...")

	rc := &config.RepoConfig{
		InstancePath: mountPath,
		Mode:         "submodule",
		Schemas:      "embedded",
	}
	if err := rc.SaveRepoConfig(root); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating .epf.yaml: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("  Created %s\n", filepath.Join(root, config.RepoConfigFileName))
	fmt.Println()

	// Success
	fmt.Println("========================================")
	fmt.Println("Enrollment complete!")
	fmt.Println()
	fmt.Println("Files created/modified:")
	fmt.Printf("  - .epf.yaml              (per-repo EPF configuration)\n")
	fmt.Printf("  - .gitmodules            (git submodule registration)\n")
	fmt.Printf("  - %s  (EPF instance)\n", mountPath)
	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. Add the AGENTS.md snippet below to your AI agent instructions")
	fmt.Println("  2. Run 'epf-cli health' to validate the instance")
	fmt.Println("  3. Commit the enrollment: git add -A && git commit -m 'chore: enroll in EPF strategy'")
	fmt.Println()

	printAgentsSnippet(mountPath)
}

// deriveInstanceName extracts a usable name from a git URL.
// e.g. "https://github.com/org/emergent-epf.git" → "emergent"
//
//	"git@github.com:org/strategy-epf.git" → "strategy-epf"
func deriveInstanceName(url string) string {
	// Strip trailing .git
	name := strings.TrimSuffix(url, ".git")

	// Handle SSH URLs: git@github.com:org/repo
	if idx := strings.LastIndex(name, ":"); idx != -1 && !strings.Contains(name, "://") {
		name = name[idx+1:]
	}

	// Handle HTTPS URLs: take last path segment
	if idx := strings.LastIndex(name, "/"); idx != -1 {
		name = name[idx+1:]
	}

	// Strip common prefixes/suffixes that don't add value as directory names
	// e.g. "emergent-epf" → "emergent" (since it's already under _instances/)
	name = strings.TrimSuffix(name, "-epf")
	name = strings.TrimSuffix(name, "-strategy")

	if name == "" {
		return ""
	}

	return name
}

func printAgentsSnippet(mountPath string) {
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("  Add to your AGENTS.md or .opencode/instructions.md:")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Println("## EPF Strategy Context")
	fmt.Println()
	fmt.Printf("The company-wide EPF strategy instance is at `%s`.\n", mountPath)
	fmt.Println("This is a **git submodule** pointing to the shared strategy repo.")
	fmt.Println()
	fmt.Println("```bash")
	fmt.Println("# If the directory is empty after cloning, initialize the submodule:")
	fmt.Println("git submodule update --init")
	fmt.Println()
	fmt.Println("# To update to the latest strategy:")
	fmt.Printf("git submodule update --remote %s\n", mountPath)
	fmt.Println("```")
	fmt.Println()
	fmt.Printf("Use EPF CLI MCP tools with `instance_path: \"%s\"` for strategic context\n", mountPath)
	fmt.Println("lookups, value model analysis, and feature-strategy alignment.")
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

func init() {
	rootCmd.AddCommand(enrollCmd)
	enrollCmd.Flags().StringVar(&enrollPath, "path", "", "mount path for the submodule (default: docs/EPF/_instances/<name>)")
	enrollCmd.Flags().BoolVar(&enrollDryRun, "dry-run", false, "preview enrollment without making changes")
}
