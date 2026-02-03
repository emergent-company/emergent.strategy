package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/config"
	"github.com/eyedea-io/emergent/apps/epf-cli/internal/template"
	"github.com/spf13/cobra"
)

var (
	initForce bool
)

var initCmd = &cobra.Command{
	Use:   "init [product-name]",
	Short: "Initialize EPF for a product repository",
	Long: `Initialize EPF (Emergent Product Framework) for a product repository.

This command sets up a SIMPLIFIED EPF structure in your product repo:
  1. Creates docs/EPF/ with minimal files (AGENTS.md, README.md, .gitignore)
  2. Creates an instance for your product in docs/EPF/_instances/{product}/
  3. Sets up the READY/FIRE/AIM directory structure with starter templates

The canonical EPF (schemas, templates, wizards, generators) is NOT copied.
Instead, epf-cli loads these from the configured canonical_path at runtime.

Prerequisites:
  - Git repository initialized
  - epf-cli configured with canonical_path (run 'epf-cli config init' first)

Examples:
  epf-cli init my-product           # Initialize EPF for 'my-product'
  epf-cli init acme --force         # Overwrite existing instance`,
	Args: cobra.ExactArgs(1),
	Run:  runInit,
}

func runInit(cmd *cobra.Command, args []string) {
	productName := args[0]

	// Validate product name
	if !isValidProductName(productName) {
		fmt.Fprintf(os.Stderr, "Error: Invalid product name '%s'\n", productName)
		fmt.Fprintln(os.Stderr, "Product name must be lowercase alphanumeric with hyphens (e.g., 'my-product')")
		os.Exit(1)
	}

	// Ensure we're in a git repo
	if !isGitRepo(".") {
		fmt.Fprintln(os.Stderr, "Error: Not in a git repository")
		fmt.Fprintln(os.Stderr, "Run 'git init' first, then try again")
		os.Exit(1)
	}

	// Load or prompt for configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	if !cfg.IsConfigured() {
		fmt.Println("epf-cli is not configured. Let's set it up first.")
		fmt.Println()
		reader := bufio.NewReader(os.Stdin)
		cfg, err = config.PromptForConfig(reader)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println()
	}

	// Verify canonical path exists
	canonicalPath := cfg.CanonicalPath
	if canonicalPath == "" {
		fmt.Fprintln(os.Stderr, "Error: canonical_path not set in config")
		fmt.Fprintln(os.Stderr, "Run 'epf-cli config set canonical_path /path/to/canonical-epf'")
		os.Exit(1)
	}
	if _, err := os.Stat(canonicalPath); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "Error: canonical_path '%s' does not exist\n", canonicalPath)
		os.Exit(1)
	}

	fmt.Printf("Initializing EPF for '%s'\n", productName)
	fmt.Println("========================================")
	fmt.Println()

	// Step 1: Create simplified EPF directory structure
	epfDir := filepath.Join("docs", "EPF")
	instanceDir := filepath.Join(epfDir, "_instances", productName)

	if _, err := os.Stat(instanceDir); err == nil {
		if !initForce {
			fmt.Fprintf(os.Stderr, "Error: Instance '%s' already exists at %s\n", productName, instanceDir)
			fmt.Fprintln(os.Stderr, "Use --force to overwrite")
			os.Exit(1)
		}
		fmt.Printf("Removing existing instance '%s'...\n", productName)
		os.RemoveAll(instanceDir)
	}

	// Create EPF directory if it doesn't exist
	if err := os.MkdirAll(epfDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating EPF directory: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Step 1: Creating simplified EPF structure...")

	// Create AGENTS.md
	if err := createAgentsMD(epfDir); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating AGENTS.md: %v\n", err)
		os.Exit(1)
	}

	// Create README.md
	if err := createReadmeMD(epfDir, productName); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating README.md: %v\n", err)
		os.Exit(1)
	}

	// Create .gitignore
	if err := createGitignore(epfDir, productName); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating .gitignore: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✓ Created docs/EPF/ with AGENTS.md, README.md, .gitignore\n\n")

	// Step 2: Create instance structure
	fmt.Println("Step 2: Creating instance structure...")

	if err := createInstanceStructure(instanceDir, productName, canonicalPath); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating instance: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ Instance created at %s\n\n", instanceDir)

	// Done!
	fmt.Println("========================================")
	fmt.Println("✓ EPF initialized successfully!")
	fmt.Println()
	fmt.Println("Structure created:")
	fmt.Println("  docs/EPF/")
	fmt.Println("  ├── _instances/" + productName + "/")
	fmt.Println("  │   ├── READY/     (strategic artifacts)")
	fmt.Println("  │   ├── FIRE/      (execution artifacts)")
	fmt.Println("  │   └── AIM/       (assessment artifacts)")
	fmt.Println("  ├── AGENTS.md      (AI agent instructions)")
	fmt.Println("  ├── README.md      (quick reference)")
	fmt.Println("  └── .gitignore     (tracks your instance)")
	fmt.Println()
	fmt.Println("Canonical EPF loaded from:")
	fmt.Printf("  %s\n\n", canonicalPath)
	fmt.Println("Next steps:")
	fmt.Printf("  1. Edit %s/_meta.yaml with your product details\n", instanceDir)
	fmt.Printf("  2. Edit %s/READY/00_north_star.yaml with your vision\n", instanceDir)
	fmt.Println("  3. Run 'epf-cli health' to validate your setup")
	fmt.Println()
	fmt.Println("For AI assistance, configure your MCP client:")
	fmt.Println("  epf-cli serve")
}

func isValidProductName(name string) bool {
	if name == "" || len(name) > 50 {
		return false
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func isGitRepo(dir string) bool {
	cmd := exec.Command("git", "rev-parse", "--git-dir")
	cmd.Dir = dir
	return cmd.Run() == nil
}

func createAgentsMD(epfDir string) error {
	content := `# AGENTS.md - AI Agent Instructions for EPF

> **This file is for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.)**
> Read this FIRST before performing any EPF operations.

## Quick Start

This repository uses **epf-cli** for all EPF operations. The canonical EPF framework 
(schemas, templates, wizards, generators) is loaded from a configured path, not stored here.

### Common Operations

| Task | Command |
|------|---------|
| Validate a file | ` + "`epf-cli validate <file>`" + ` |
| Run health check | ` + "`epf-cli health`" + ` |
| Get a template | ` + "`epf-cli templates get <type>`" + ` |
| Get a wizard | ` + "`epf-cli wizards get <name>`" + ` |
| List schemas | ` + "`epf-cli schemas list`" + ` |

### MCP Tools (30 available)

When epf-cli runs as an MCP server, you have access to tools for:
- Schema validation (epf_validate_file, epf_validate_content)
- Templates (epf_get_template, epf_list_artifacts)
- Wizards (epf_get_wizard, epf_get_wizard_for_task)
- Health checks (epf_health_check, epf_check_instance)
- Relationships (epf_explain_value_path, epf_get_strategic_context)

Run ` + "`epf-cli serve`" + ` to start the MCP server.

## Instance Structure

` + "```" + `
docs/EPF/_instances/{product}/
├── READY/                    # Strategic foundation
│   ├── 00_north_star.yaml
│   ├── 01_insight_analyses.yaml
│   ├── 02_strategy_foundations.yaml
│   ├── 03_insight_opportunity.yaml
│   ├── 04_strategy_formula.yaml
│   └── 05_roadmap_recipe.yaml
├── FIRE/                     # Execution
│   ├── value_models/
│   ├── feature_definitions/
│   └── mappings.yaml
├── AIM/                      # Assessment
│   └── living_reality_assessment.yaml
└── outputs/                  # Generated documents
` + "```" + `

---
*EPF-CLI powered workflow | See ` + "`epf-cli --help`" + ` for all commands*
`
	return os.WriteFile(filepath.Join(epfDir, "AGENTS.md"), []byte(content), 0644)
}

func createReadmeMD(epfDir, productName string) error {
	content := fmt.Sprintf(`# Emergent Product Framework (EPF) - Instance Data

This directory contains the **instance-specific EPF data** for %s.

## Structure

`+"```"+`
docs/EPF/
├── _instances/%s/   # All EPF artifacts for this product
├── AGENTS.md        # AI agent instructions
└── README.md        # This file
`+"```"+`

## Working with EPF

All EPF operations are performed via **epf-cli**:

`+"```bash"+`
# Health check
epf-cli health

# Validate a file
epf-cli validate docs/EPF/_instances/%s/READY/00_north_star.yaml

# List schemas
epf-cli schemas list

# Get a template
epf-cli templates get feature_definition
`+"```"+`

## MCP Server

For AI agent integration:

`+"```bash"+`
epf-cli serve
`+"```"+`

See AGENTS.md for detailed AI agent instructions.
`, productName, productName, productName)

	return os.WriteFile(filepath.Join(epfDir, "README.md"), []byte(content), 0644)
}

func createGitignore(epfDir, productName string) error {
	content := fmt.Sprintf(`# EPF Instance .gitignore
#
# This repo only contains instance-specific data.
# Canonical EPF (schemas, templates, etc.) is loaded via epf-cli.

# Only track the %s instance
_instances/*
!_instances/%s
!_instances/%s/**

# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*.swo
*~
.idea/
.vscode/

# Temporary files
*.tmp
*.bak
*.log
`, productName, productName, productName)

	return os.WriteFile(filepath.Join(epfDir, ".gitignore"), []byte(content), 0644)
}

func createInstanceStructure(instanceDir, productName, canonicalPath string) error {
	// Create phase directories
	phases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range phases {
		if err := os.MkdirAll(filepath.Join(instanceDir, phase), 0755); err != nil {
			return err
		}
	}

	// Create FIRE subdirectories
	fireDirs := []string{"feature_definitions", "value_models", "workflows"}
	for _, dir := range fireDirs {
		path := filepath.Join(instanceDir, "FIRE", dir)
		if err := os.MkdirAll(path, 0755); err != nil {
			return err
		}
		// Add .gitkeep
		os.WriteFile(filepath.Join(path, ".gitkeep"), []byte{}, 0644)
	}

	// Create outputs directory
	os.MkdirAll(filepath.Join(instanceDir, "outputs"), 0755)
	os.WriteFile(filepath.Join(instanceDir, "outputs", ".gitkeep"), []byte{}, 0644)

	// Try to load and copy templates from canonical EPF
	templateLoader := template.NewLoader(canonicalPath)
	if err := templateLoader.Load(); err == nil {
		copyTemplatesFromLoader(templateLoader, instanceDir)
	} else {
		// Fallback to embedded minimal templates
		createDefaultTemplates(instanceDir, productName)
	}

	// Create _meta.yaml
	createMetaFile(instanceDir, productName)

	// Create instance README
	createInstanceReadme(instanceDir, productName)

	return nil
}

func copyTemplatesFromLoader(loader *template.Loader, instanceDir string) {
	// Get templates by phase and copy them
	templates := loader.ListTemplates()

	for _, t := range templates {
		// Extract filename from file path
		filename := filepath.Base(t.FilePath)
		if filename == "" {
			continue
		}

		switch t.Phase {
		case "READY":
			dst := filepath.Join(instanceDir, "READY", filename)
			os.WriteFile(dst, []byte(t.Content), 0644)
		case "AIM":
			dst := filepath.Join(instanceDir, "AIM", filename)
			os.WriteFile(dst, []byte(t.Content), 0644)
		}
	}
}

func createDefaultTemplates(instanceDir, productName string) {
	// Create minimal north_star template
	northStarContent := fmt.Sprintf(`# EPF North Star
# %s - Vision and guiding principles
# Validate with: epf-cli validate READY/00_north_star.yaml

meta:
  epf_version: "2.12.0"
  artifact_type: "north_star"

north_star:
  vision: |
    Describe your long-term vision here (at least 200 characters).
    What does the world look like when your product succeeds?
    Think 3-5 years out and paint a compelling picture.
    This should inspire and guide all decisions.

  mission: |
    Describe your mission here (at least 100 characters).
    How will you achieve the vision? What is your approach?

  values:
    - name: "Customer First"
      description: "We start with customer needs and work backwards"
      rationale: "Explain why this value matters to your organization"
      behaviors:
        - "Specific observable behavior that demonstrates this value"

  guiding_principles:
    - name: "Principle Name"
      description: "Describe this principle (at least 50 characters)"
      rationale: "Why is this principle important?"
      examples:
        - "A concrete example of this principle in action"
`, productName)

	os.WriteFile(filepath.Join(instanceDir, "READY", "00_north_star.yaml"), []byte(northStarContent), 0644)
}

func createMetaFile(instanceDir, productName string) {
	content := fmt.Sprintf(`# EPF Instance Metadata
# This file contains metadata about this EPF instance

instance:
  product_name: "%s"
  epf_version: "2.12.0"
  instance_version: "1.0.0"
  created_date: "%s"
  description: |
    Add a brief description of this product instance.

  current_cycle:
    cycle_number: 1
    cycle_id: "cycle-001"
    phase: "READY"
`, productName, time.Now().Format("2006-01-02"))

	os.WriteFile(filepath.Join(instanceDir, "_meta.yaml"), []byte(content), 0644)
}

func createInstanceReadme(instanceDir, productName string) {
	content := fmt.Sprintf(`# %s EPF Instance

This is the EPF (Emergent Product Framework) instance for %s.

## Directory Structure

- **READY/** - Strategic foundation phase
  - 00_north_star.yaml - Vision, mission, values
  - 01_insight_analyses.yaml - Market research
  - 02_strategy_foundations.yaml - Core strategy elements
  - 03_insight_opportunity.yaml - Opportunity analysis
  - 04_strategy_formula.yaml - Strategic approach
  - 05_roadmap_recipe.yaml - Execution roadmap

- **FIRE/** - Execution phase
  - feature_definitions/ - Feature specifications
  - value_models/ - Value creation models
  - workflows/ - Process workflows

- **AIM/** - Assessment phase
  - living_reality_assessment.yaml - Persistent baseline
  - assessment_reports/ - Cycle assessments

- **outputs/** - Generated documents

## Validation

`+"```bash"+`
# Validate this instance
epf-cli health

# Validate specific file
epf-cli validate READY/00_north_star.yaml

# Generate health report
epf-cli report --format html -o report.html
`+"```"+`
`, productName, productName)

	os.WriteFile(filepath.Join(instanceDir, "README.md"), []byte(content), 0644)
}

func init() {
	rootCmd.AddCommand(initCmd)
	initCmd.Flags().BoolVarP(&initForce, "force", "f", false, "overwrite existing instance")
}
