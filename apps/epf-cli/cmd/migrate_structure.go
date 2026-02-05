package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var migrateStructureCmd = &cobra.Command{
	Use:   "migrate-structure",
	Short: "Migrate EPF from root to docs/epf/ structure",
	Long: `Migrate EPF artifacts from root-level directories to the standard docs/epf/ structure.

This command handles legacy EPF instances that have READY/, FIRE/, AIM/ at the repository root
and moves them to the standardized docs/epf/_instances/{product}/ structure.

Why this structure?
  - EPF artifacts are documentation, not code
  - Easy to exclude from CI/CD and build processes
  - Consistent with EPF conventions
  - Better separation of concerns

The command will:
  1. Detect product name from _meta.yaml or git remote
  2. Create docs/epf/_instances/{product}/ structure
  3. Move READY/, FIRE/, AIM/ directories
  4. Move _meta.yaml and other EPF files
  5. Update .gitignore to track the new location
  6. Create AGENTS.md and README.md in docs/EPF/
  7. Optionally remove empty old directories

Examples:
  epf-cli migrate-structure                    # Auto-detect product name
  epf-cli migrate-structure --product veilag   # Specify product name
  epf-cli migrate-structure --dry-run          # Preview without changes`,
	RunE: runMigrateStructure,
}

var (
	migrateStructureDryRun  bool
	migrateStructureProduct string
	migrateStructureForce   bool
)

func init() {
	rootCmd.AddCommand(migrateStructureCmd)
	migrateStructureCmd.Flags().BoolVar(&migrateStructureDryRun, "dry-run", false, "Show what would be done without making changes")
	migrateStructureCmd.Flags().StringVar(&migrateStructureProduct, "product", "", "Product name (auto-detected if not specified)")
	migrateStructureCmd.Flags().BoolVar(&migrateStructureForce, "force", false, "Overwrite existing docs/epf/ structure")
}

func runMigrateStructure(cmd *cobra.Command, args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}

	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🔄 EPF Structure Migration - Root → docs/epf/")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	// Step 1: Detect what needs to be migrated
	fmt.Println("Step 1: Detecting EPF artifacts at root level...")

	phaseDirs := []string{"READY", "FIRE", "AIM"}
	foundDirs := []string{}

	for _, phase := range phaseDirs {
		if info, err := os.Stat(filepath.Join(cwd, phase)); err == nil && info.IsDir() {
			foundDirs = append(foundDirs, phase)
			fmt.Printf("  ✓ Found: %s/\n", phase)
		}
	}

	if len(foundDirs) == 0 {
		return fmt.Errorf("no EPF directories found at root level (READY/, FIRE/, AIM/)\n\nNothing to migrate. Structure looks correct already.")
	}

	fmt.Println()

	// Check if docs/epf already exists
	docsEpfPath := filepath.Join(cwd, "docs", "epf")
	if _, err := os.Stat(docsEpfPath); err == nil && !migrateStructureForce {
		return fmt.Errorf("docs/epf/ already exists\n\nUse --force to overwrite, or manually remove it first")
	}

	// Step 2: Determine product name
	fmt.Println("Step 2: Determining product name...")

	productName := migrateStructureProduct
	if productName == "" {
		// Try to get from _meta.yaml
		productName, err = getProductNameFromMeta(cwd)
		if err != nil || productName == "" {
			// Try to get from git remote
			productName, err = getProductNameFromGit(cwd)
			if err != nil || productName == "" {
				return fmt.Errorf("could not auto-detect product name\n\nPlease specify with: --product <name>")
			}
		}
	}

	fmt.Printf("  Product name: %s\n", productName)
	fmt.Println()

	// Step 3: Create target structure
	targetInstancePath := filepath.Join(cwd, "docs", "epf", "_instances", productName)

	fmt.Println("Step 3: Creating target structure...")
	fmt.Printf("  Target: %s\n", targetInstancePath)

	if migrateStructureDryRun {
		fmt.Println("  [DRY RUN] Would create directories")
	} else {
		if err := os.MkdirAll(targetInstancePath, 0755); err != nil {
			return fmt.Errorf("failed to create target directory: %w", err)
		}
		fmt.Println("  ✓ Created target directory structure")
	}
	fmt.Println()

	// Step 4: Move directories
	fmt.Println("Step 4: Moving EPF directories...")

	dirsToMove := []string{}
	for _, phase := range phaseDirs {
		srcPath := filepath.Join(cwd, phase)
		if _, err := os.Stat(srcPath); err == nil {
			dirsToMove = append(dirsToMove, phase)
		}
	}

	for _, dir := range dirsToMove {
		srcPath := filepath.Join(cwd, dir)
		dstPath := filepath.Join(targetInstancePath, dir)

		if migrateStructureDryRun {
			fmt.Printf("  [DRY RUN] Would move: %s/ → %s/\n", dir, filepath.Join("docs/epf/_instances", productName, dir))
		} else {
			if err := os.Rename(srcPath, dstPath); err != nil {
				return fmt.Errorf("failed to move %s: %w", dir, err)
			}
			fmt.Printf("  ✓ Moved: %s/ → %s/\n", dir, filepath.Join("docs/epf/_instances", productName, dir))
		}
	}
	fmt.Println()

	// Step 5: Move other EPF files
	fmt.Println("Step 5: Moving EPF metadata files...")

	filesToMove := []string{
		"_meta.yaml",
		"_MIGRATION_PLAN.yaml",
		"product_portfolio.yaml",
		"VERSION",
	}

	for _, file := range filesToMove {
		srcPath := filepath.Join(cwd, file)
		if _, err := os.Stat(srcPath); err == nil {
			dstPath := filepath.Join(targetInstancePath, file)

			if migrateStructureDryRun {
				fmt.Printf("  [DRY RUN] Would move: %s\n", file)
			} else {
				if err := os.Rename(srcPath, dstPath); err != nil {
					fmt.Printf("  ⚠️  Warning: Failed to move %s: %v\n", file, err)
				} else {
					fmt.Printf("  ✓ Moved: %s\n", file)
				}
			}
		}
	}

	// Move other potential directories
	otherDirs := []string{"cycles", "outputs", "ad-hoc-artifacts"}
	for _, dir := range otherDirs {
		srcPath := filepath.Join(cwd, dir)
		if info, err := os.Stat(srcPath); err == nil && info.IsDir() {
			dstPath := filepath.Join(targetInstancePath, dir)

			if migrateStructureDryRun {
				fmt.Printf("  [DRY RUN] Would move: %s/\n", dir)
			} else {
				if err := os.Rename(srcPath, dstPath); err != nil {
					fmt.Printf("  ⚠️  Warning: Failed to move %s: %v\n", dir, err)
				} else {
					fmt.Printf("  ✓ Moved: %s/\n", dir)
				}
			}
		}
	}
	fmt.Println()

	// Step 6: Create docs/epf/ files
	fmt.Println("Step 6: Creating docs/epf/ support files...")

	docsEpfDir := filepath.Join(cwd, "docs", "epf")

	if migrateStructureDryRun {
		fmt.Println("  [DRY RUN] Would create AGENTS.md, README.md, .gitignore")
	} else {
		// Create AGENTS.md
		if err := createAgentsMD(docsEpfDir); err != nil {
			fmt.Printf("  ⚠️  Warning: Failed to create AGENTS.md: %v\n", err)
		} else {
			fmt.Println("  ✓ Created AGENTS.md")
		}

		// Create README.md
		if err := createReadmeMD(docsEpfDir, productName); err != nil {
			fmt.Printf("  ⚠️  Warning: Failed to create README.md: %v\n", err)
		} else {
			fmt.Println("  ✓ Created README.md")
		}

		// Create .gitignore
		if err := createGitignore(docsEpfDir, productName); err != nil {
			fmt.Printf("  ⚠️  Warning: Failed to create .gitignore: %v\n", err)
		} else {
			fmt.Println("  ✓ Created .gitignore")
		}
	}
	fmt.Println()

	// Step 7: Update .gitignore at repo root
	fmt.Println("Step 7: Updating repository .gitignore...")

	rootGitignorePath := filepath.Join(cwd, ".gitignore")
	if migrateStructureDryRun {
		fmt.Println("  [DRY RUN] Would add docs/epf/ tracking rules to .gitignore")
	} else {
		if err := updateRootGitignore(rootGitignorePath); err != nil {
			fmt.Printf("  ⚠️  Warning: Failed to update .gitignore: %v\n", err)
		} else {
			fmt.Println("  ✓ Updated .gitignore")
		}
	}
	fmt.Println()

	// Done!
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	if migrateStructureDryRun {
		fmt.Println("✓ Migration Preview Complete (Dry Run)")
	} else {
		fmt.Println("✓ Migration Complete!")
	}
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	if !migrateStructureDryRun {
		fmt.Println("New structure:")
		fmt.Printf("  docs/epf/_instances/%s/\n", productName)
		fmt.Println("  ├── READY/")
		fmt.Println("  ├── FIRE/")
		fmt.Println("  ├── AIM/")
		fmt.Println("  └── _meta.yaml")
		fmt.Println()
		fmt.Println("Next steps:")
		fmt.Println("  1. Review the migrated structure")
		fmt.Println("  2. Run: epf-cli health")
		fmt.Println("  3. Commit the changes:")
		fmt.Println("     git add docs/epf/")
		fmt.Println("     git commit -m \"Migrate EPF to docs/epf/ structure\"")
		fmt.Println()
	}

	return nil
}

// Helper functions

func getProductNameFromMeta(cwd string) (string, error) {
	metaPath := filepath.Join(cwd, "_meta.yaml")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return "", err
	}

	// Simple parsing - look for product_name field
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "product_name:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				name := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
				return name, nil
			}
		}
	}

	return "", fmt.Errorf("product_name not found in _meta.yaml")
}

func getProductNameFromGit(cwd string) (string, error) {
	// Try to read .git/config to find remote
	gitDir := filepath.Join(cwd, ".git")
	if _, err := os.Stat(gitDir); err != nil {
		return "", fmt.Errorf("not a git repository")
	}

	// Read .git/config to find remote
	configPath := filepath.Join(gitDir, "config")
	configData, err := os.ReadFile(configPath)
	if err != nil {
		return "", err
	}

	// Parse git config for remote URL
	lines := strings.Split(string(configData), "\n")
	for i, line := range lines {
		if strings.Contains(line, "[remote \"origin\"]") {
			// Look for url in next few lines
			for j := i + 1; j < len(lines) && j < i+5; j++ {
				if strings.Contains(lines[j], "url =") {
					url := strings.TrimSpace(strings.SplitN(lines[j], "=", 2)[1])
					// Extract repo name from URL
					parts := strings.Split(url, "/")
					if len(parts) > 0 {
						name := parts[len(parts)-1]
						name = strings.TrimSuffix(name, ".git")
						return name, nil
					}
				}
			}
		}
	}

	return "", fmt.Errorf("could not determine repository name from git config")
}

func updateRootGitignore(gitignorePath string) error {
	// Read existing .gitignore
	var existingContent string
	if data, err := os.ReadFile(gitignorePath); err == nil {
		existingContent = string(data)
	}

	// Check if docs/epf is already mentioned
	if strings.Contains(existingContent, "docs/epf") {
		return nil // Already configured
	}

	// Append EPF tracking rules
	epfRules := `
# EPF (Emergent Product Framework) - Track instance data
docs/epf/_instances/
!docs/epf/_instances/*/.gitkeep
`

	newContent := existingContent
	if !strings.HasSuffix(existingContent, "\n") {
		newContent += "\n"
	}
	newContent += epfRules

	return os.WriteFile(gitignorePath, []byte(newContent), 0644)
}
