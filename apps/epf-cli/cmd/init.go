package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/spf13/cobra"
)

var (
	initForce bool
	initMode  string // "integrated" (default) or "standalone"
)

var initCmd = &cobra.Command{
	Use:   "init [product-name]",
	Short: "Initialize EPF for a product repository",
	Long: `Initialize EPF (Emergent Product Framework) for a product repository.

Modes:
  --mode integrated (default):
    Creates docs/EPF/ with minimal files (AGENTS.md, README.md, .gitignore)
    and an instance in docs/EPF/_instances/{product}/ with READY/FIRE/AIM.

  --mode standalone:
    Creates READY/FIRE/AIM directly in the current directory. No docs/EPF/ wrapper.
    For repos that ARE the EPF instance (e.g., a dedicated strategy repo).
    Also creates .epf.yaml at the repo root with mode: standalone.

The canonical EPF (schemas, templates, wizards, generators) is NOT copied.
Instead, epf-cli loads these from the configured canonical_path at runtime.

Prerequisites:
  - Git repository initialized
  - epf-cli configured with canonical_path (run 'epf-cli config init' first)

Examples:
  epf-cli init my-product                    # Integrated mode (default)
  epf-cli init acme --force                  # Overwrite existing instance
  epf-cli init my-strategy --mode standalone # Standalone instance at current dir`,
	Args: cobra.ExactArgs(1),
	Run:  runInit,
}

func runInit(cmd *cobra.Command, args []string) {
	// Protect canonical EPF from accidental writes
	if err := EnsureNotCanonical("initialize EPF"); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	productName := args[0]

	// Validate product name
	if !isValidProductName(productName) {
		fmt.Fprintf(os.Stderr, "Error: Invalid product name '%s'\n", productName)
		fmt.Fprintln(os.Stderr, "Product name must be lowercase alphanumeric with hyphens (e.g., 'my-product')")
		os.Exit(1)
	}

	// Validate mode
	if initMode != "integrated" && initMode != "standalone" {
		fmt.Fprintf(os.Stderr, "Error: Invalid mode '%s'. Must be 'integrated' or 'standalone'\n", initMode)
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
		// Config error is not fatal if we have embedded artifacts
		cfg = &config.Config{}
	}

	// Determine template source: canonical_path or embedded
	var canonicalPath string
	var useEmbedded bool

	if cfg.CanonicalPath != "" {
		if _, err := os.Stat(cfg.CanonicalPath); err == nil {
			canonicalPath = cfg.CanonicalPath
		}
	}

	if canonicalPath == "" {
		// Fall back to embedded artifacts
		if embedded.HasEmbeddedArtifacts() {
			useEmbedded = true
			fmt.Println("Note: Using embedded EPF templates (no canonical_path configured)")
			fmt.Println()
		} else {
			// No canonical_path and no embedded - prompt for config
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
				canonicalPath = cfg.CanonicalPath
			}

			if canonicalPath == "" {
				fmt.Fprintln(os.Stderr, "Error: canonical_path not set and no embedded templates available")
				fmt.Fprintln(os.Stderr, "Run 'epf-cli config set canonical_path /path/to/canonical-epf'")
				os.Exit(1)
			}
		}
	}

	fmt.Printf("Initializing EPF for '%s' (mode: %s)\n", productName, initMode)
	fmt.Println("========================================")
	fmt.Println()

	if initMode == "standalone" {
		// Standalone mode: create instance directly in current directory
		// No docs/EPF/ wrapper — this repo IS the instance
		instanceDir := "."

		// Check if READY/ already exists (proxy for "already initialized")
		if _, err := os.Stat(filepath.Join(instanceDir, "READY")); err == nil {
			if !initForce {
				fmt.Fprintln(os.Stderr, "Error: Standalone instance already exists (READY/ directory found)")
				fmt.Fprintln(os.Stderr, "Use --force to overwrite")
				os.Exit(1)
			}
			fmt.Println("Removing existing instance structure...")
			for _, dir := range []string{"READY", "FIRE", "AIM"} {
				os.RemoveAll(filepath.Join(instanceDir, dir))
			}
		}

		fmt.Println("Creating standalone EPF instance...")

		if err := createInstanceStructure(instanceDir, productName, canonicalPath, useEmbedded); err != nil {
			fmt.Fprintf(os.Stderr, "Error creating instance: %v\n", err)
			os.Exit(1)
		}

		// Create .epf.yaml at repo root
		cwd, _ := os.Getwd()
		repoRoot := config.FindRepoRoot(cwd)
		if repoRoot == "" {
			repoRoot = "."
		}
		rc := &config.RepoConfig{
			InstancePath: ".",
			Mode:         "standalone",
			Schemas:      "embedded",
		}
		if err := rc.SaveRepoConfig(repoRoot); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Could not create .epf.yaml: %v\n", err)
		}

		fmt.Println()
		fmt.Println("========================================")
		fmt.Println("✓ EPF initialized successfully! (standalone mode)")
		fmt.Println()
		fmt.Println("Structure created:")
		fmt.Println("  ./")
		fmt.Println("  ├── _epf.yaml    (anchor file - EPF instance marker)")
		fmt.Println("  ├── READY/       (strategic artifacts)")
		fmt.Println("  ├── FIRE/        (execution artifacts)")
		fmt.Println("  │   ├── value_models/  (4 tracks: Product, Strategy, OrgOps, Commercial)")
		fmt.Println("  │   └── feature_definitions/")
		fmt.Println("  ├── AIM/         (assessment artifacts)")
		fmt.Println("  ├── _meta.yaml   (instance metadata)")
		fmt.Println("  └── .epf.yaml    (per-repo config: mode=standalone)")
		fmt.Println()
		if useEmbedded {
			fmt.Printf("Templates loaded from embedded EPF v%s\n\n", embedded.GetVersion())
		} else {
			fmt.Println("Canonical EPF loaded from:")
			fmt.Printf("  %s\n\n", canonicalPath)
		}
		fmt.Println("Next steps:")
		fmt.Println("  1. Edit _meta.yaml with your product details")
		fmt.Println("  2. Edit READY/00_north_star.yaml with your vision")
		fmt.Println("  3. Run 'epf-cli health' to validate your setup")
		fmt.Println()
		fmt.Println("For AI assistance, configure your MCP client:")
		fmt.Println("  epf-cli serve")
		fmt.Println()

		printPostInitGuidance(instanceDir, productName)
		return
	}

	// Integrated mode (default): create docs/EPF/ wrapper + instance
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

	if err := createInstanceStructure(instanceDir, productName, canonicalPath, useEmbedded); err != nil {
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
	fmt.Println("  │   ├── _epf.yaml    (anchor file - EPF instance marker)")
	fmt.Println("  │   ├── READY/       (strategic artifacts)")
	fmt.Println("  │   ├── FIRE/        (execution artifacts)")
	fmt.Println("  │   │   ├── value_models/  (4 tracks: Product, Strategy, OrgOps, Commercial)")
	fmt.Println("  │   │   └── feature_definitions/")
	fmt.Println("  │   ├── AIM/         (assessment artifacts)")
	fmt.Println("  │   └── _meta.yaml   (instance metadata)")
	fmt.Println("  ├── AGENTS.md        (AI agent instructions)")
	fmt.Println("  ├── README.md        (quick reference)")
	fmt.Println("  └── .gitignore       (tracks your instance)")
	fmt.Println()
	if useEmbedded {
		fmt.Printf("Templates loaded from embedded EPF v%s\n\n", embedded.GetVersion())
	} else {
		fmt.Println("Canonical EPF loaded from:")
		fmt.Printf("  %s\n\n", canonicalPath)
	}
	fmt.Println("Next steps:")
	fmt.Printf("  1. Edit %s/_meta.yaml with your product details\n", instanceDir)
	fmt.Printf("  2. Edit %s/READY/00_north_star.yaml with your vision\n", instanceDir)
	fmt.Println("  3. Run 'epf-cli health' to validate your setup")
	fmt.Println()
	fmt.Println("For AI assistance, configure your MCP client:")
	fmt.Println("  epf-cli serve")
	fmt.Println()

	// Post-init AI guidance
	printPostInitGuidance(instanceDir, productName)
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
	// Use embedded comprehensive AGENTS.md (always available in binary)
	agentsMDContent, err := embedded.GetAgentsMD()
	if err == nil && len(agentsMDContent) > 0 {
		return os.WriteFile(filepath.Join(epfDir, "AGENTS.md"), agentsMDContent, 0644)
	}

	// Fallback: Create simplified version if embedded not available
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

### MCP Tools (27+ available)

When epf-cli runs as an MCP server, you have access to tools for:
- Schema validation (epf_validate_file, epf_validate_content)
- Templates (epf_get_template, epf_list_artifacts)
- Wizards (epf_get_wizard, epf_get_wizard_for_task)
- Health checks (epf_health_check, epf_check_instance)
- Relationships (epf_explain_value_path, epf_get_strategic_context)
- Generators (epf_list_generators, epf_get_generator)

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

## Pre-Flight Checklist: Before Creating/Editing EPF Artifacts

> **MANDATORY for AI agents writing EPF content (feature definitions, roadmaps, etc.)**

### When to Use This Checklist

Use this checklist when you are about to:
- Create a new feature definition (fd-*.yaml)
- Edit an existing EPF artifact
- Add personas, capabilities, contexts, or scenarios to a feature
- Modify roadmap key results or value model paths

### Pre-Flight Steps

**Step 1: Get the Schema**

` + "```bash" + `
# Via CLI:
epf-cli schemas show feature_definition

# Via MCP:
epf_get_schema { "artifact_type": "feature_definition" }
` + "```" + `

**Step 2: Check Field Constraints**

Look for these constraint types:
- ` + "`enum`" + ` - Only listed values valid (e.g., status: draft|ready|in-progress|delivered)
- ` + "`pattern`" + ` - Must match regex (e.g., id: ^fd-[0-9]+$)
- ` + "`minItems/maxItems`" + ` - Array length limits (e.g., personas: exactly 4)
- ` + "`minLength`" + ` - Minimum character counts (e.g., current_situation: 200+ chars)

**Step 3: Validate Before Committing**

` + "```bash" + `
# Validate file
epf-cli validate path/to/artifact.yaml

# AI-friendly output
epf-cli validate path/to/artifact.yaml --ai-friendly

# Fix plan for many errors
epf-cli validate path/to/artifact.yaml --fix-plan
` + "```" + `

## Validation Strategy

For files with validation errors:

**1-10 errors:** Use ` + "`--ai-friendly`" + ` for direct fixing
**11-50 errors:** Use ` + "`--fix-plan`" + ` for chunked processing  
**50+ errors:** Use ` + "`--fix-plan`" + ` + fix section by section

**Common Error Types:**

| Priority | Error Type | Fix Strategy |
|----------|------------|--------------|
| 🔴 Critical | ` + "`type_mismatch`" + ` | Convert to correct type (string→array, etc.) |
| 🟠 High | ` + "`invalid_enum`" + ` | Use one of the allowed values |
| 🟠 High | ` + "`missing_required`" + ` | Add the required field |
| 🟡 Medium | ` + "`constraint_violation`" + ` | Expand text to meet minLength |
| 🟡 Medium | ` + "`pattern_mismatch`" + ` | Fix format (e.g., fd-001 not feature-1) |

## Health Check

The ` + "`epf-cli health`" + ` command validates:

1. **Instance Structure** - READY/FIRE/AIM directories, required files
2. **Schema Validation** - All YAML against JSON schemas
3. **Feature Quality** - Personas, narratives, scenarios
4. **Cross-References** - Feature dependencies
5. **Relationships** - contributes_to paths, KR targets
6. **Content Readiness** - Placeholder detection
7. **Field Coverage** - TRL fields, persona narratives
8. **Version Alignment** - Artifact vs schema versions
9. **AIM Phase** - Living Reality Assessment
10. **Structure Location** - docs/epf/ vs root level

## Common Commands

` + "```bash" + `
# Validation
epf-cli validate file.yaml
epf-cli validate file.yaml --ai-friendly
epf-cli validate file.yaml --fix-plan

# Health checks
epf-cli health
epf-cli health --verbose
epf-cli health --json

# Structure migration
epf-cli migrate-structure --dry-run
epf-cli migrate-structure

# AIM phase
epf-cli aim bootstrap
epf-cli aim status
epf-cli aim assess

# Relationships
epf-cli explain Product.Discovery.KnowledgeExploration
epf-cli context FD-001
epf-cli coverage
epf-cli relationships validate

# Templates & Wizards
epf-cli wizards list
epf-cli wizards show feature_definition
epf-cli generators list
` + "```" + `

## EPF Structure Conventions

**Recommended:**  
` + "`docs/epf/_instances/{product}/`" + `

**Benefits:**
- Separates documentation from code
- Easy to exclude from CI/CD
- Follows standard conventions
- Better tool support

If EPF is at root level, run ` + "`epf-cli migrate-structure`" + ` to move it.

---
*For comprehensive documentation, see the epf-cli AGENTS.md in the canonical EPF repository*
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

func createInstanceStructure(instanceDir, productName, canonicalPath string, useEmbedded bool) error {
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

	// Load templates and copy to instance
	if useEmbedded {
		// Use embedded templates
		copyTemplatesFromEmbedded(instanceDir)
	} else if canonicalPath != "" {
		// Try to load from filesystem
		templateLoader := template.NewLoader(canonicalPath)
		if err := templateLoader.Load(); err == nil {
			copyTemplatesFromLoader(templateLoader, instanceDir)
		} else {
			// Fallback to minimal templates
			createDefaultTemplates(instanceDir, productName)
		}
	} else {
		// Fallback to minimal templates
		createDefaultTemplates(instanceDir, productName)
	}

	// Create anchor file (_epf.yaml) - the authoritative EPF instance marker
	epfVersion := "2.12.0" // Default EPF version
	anchorFile := anchor.NewWithOptions(productName, "", epfVersion)
	// Set structure info to indicate the instance location
	anchorFile.Structure = &anchor.StructureInfo{
		Type:     "phased",
		Location: instanceDir,
	}
	if err := anchorFile.Save(instanceDir); err != nil {
		return fmt.Errorf("failed to create anchor file: %w", err)
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
		case "FIRE":
			// Value model templates go into FIRE/value_models/
			if strings.Contains(t.FilePath, "value_model") {
				dst := filepath.Join(instanceDir, "FIRE", "value_models", filename)
				os.WriteFile(dst, []byte(t.Content), 0644)
			}
		case "AIM":
			dst := filepath.Join(instanceDir, "AIM", filename)
			os.WriteFile(dst, []byte(t.Content), 0644)
		}
	}
}

// copyTemplatesFromEmbedded copies templates from embedded files to the instance
func copyTemplatesFromEmbedded(instanceDir string) {
	// Template paths in embedded fs (relative to templates/)
	readyTemplates := []string{
		"READY/00_north_star.yaml",
		"READY/01_insight_analyses.yaml",
		"READY/02_strategy_foundations.yaml",
		"READY/03_insight_opportunity.yaml",
		"READY/04_strategy_formula.yaml",
		"READY/05_roadmap_recipe.yaml",
	}

	// FIRE value model templates — all 4 tracks deployed with active: false by default.
	// Organizations activate sub-components as they invest in each track.
	fireTemplates := []string{
		"FIRE/value_models/product.value_model.yaml",
		"FIRE/value_models/strategy.value_model.yaml",
		"FIRE/value_models/org_ops.value_model.yaml",
		"FIRE/value_models/commercial.value_model.yaml",
	}

	aimTemplates := []string{
		"AIM/assessment_report.yaml",
		"AIM/calibration_memo.yaml",
	}

	// Copy READY templates
	for _, tmplPath := range readyTemplates {
		content, err := embedded.GetTemplate(tmplPath)
		if err != nil {
			continue // Skip if not found
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "READY", filename)
		os.WriteFile(dst, content, 0644)
	}

	// Copy FIRE value model templates
	for _, tmplPath := range fireTemplates {
		content, err := embedded.GetTemplate(tmplPath)
		if err != nil {
			continue // Skip if not found
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "FIRE", "value_models", filename)
		os.WriteFile(dst, content, 0644)
	}

	// Copy AIM templates
	for _, tmplPath := range aimTemplates {
		content, err := embedded.GetTemplate(tmplPath)
		if err != nil {
			continue // Skip if not found
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "AIM", filename)
		os.WriteFile(dst, content, 0644)
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

// printPostInitGuidance outputs AI agent guidance after successful initialization
func printPostInitGuidance(instanceDir, productName string) {
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("                    AI AGENT QUICK START")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Println("epf-cli is the NORMATIVE AUTHORITY for all EPF operations.")
	fmt.Println("AI agents should use these tools instead of guessing structure.")
	fmt.Println()
	fmt.Println("KEY COMMANDS:")
	fmt.Println("  epf-cli agent              Get full AI agent instructions")
	fmt.Println("  epf-cli health             Validate instance health")
	fmt.Println("  epf-cli validate <file>    Check YAML against schema")
	fmt.Println("  epf-cli schemas list       Browse available schemas")
	fmt.Println("  epf-cli wizards list       Find guided workflows")
	fmt.Println()
	fmt.Println("MCP TOOLS (via 'epf-cli serve'):")
	fmt.Println("  epf_validate_file          Validate artifacts programmatically")
	fmt.Println("  epf_health_check           Run comprehensive health checks")
	fmt.Println("  epf_get_template           Get starting templates for artifacts")
	fmt.Println("  epf_get_wizard_for_task    Find best wizard for a task")
	fmt.Println()
	fmt.Println("FIRST STEPS:")
	fmt.Printf("  1. Read %s/AGENTS.md for detailed instructions\n", filepath.Dir(instanceDir))
	fmt.Println("  2. Run 'epf-cli agent' for comprehensive guidance")
	fmt.Println("  3. Run 'epf-cli health' to verify your setup")
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

func init() {
	rootCmd.AddCommand(initCmd)
	initCmd.Flags().BoolVarP(&initForce, "force", "f", false, "overwrite existing instance")
	initCmd.Flags().StringVar(&initMode, "mode", "integrated", "initialization mode: integrated (default) or standalone")
}
