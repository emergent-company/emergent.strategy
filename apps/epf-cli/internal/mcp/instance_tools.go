// Package mcp provides the MCP (Model Context Protocol) server implementation.
// This file contains instance management tools (init, fix).
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/config"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// Instance Initialization Tool
// =============================================================================

// InitInstanceResult represents the result of initializing an EPF instance
type InitInstanceResult struct {
	Success      bool     `json:"success"`
	InstancePath string   `json:"instance_path"`
	ProductName  string   `json:"product_name"`
	EPFVersion   string   `json:"epf_version"`
	Mode         string   `json:"mode"`
	FilesCreated []string `json:"files_created"`
	AnchorFile   string   `json:"anchor_file"`
	DryRun       bool     `json:"dry_run"`
	Error        string   `json:"error,omitempty"`
	NextSteps    []string `json:"next_steps,omitempty"`
}

// handleInitInstance handles the epf_init_instance tool
func (s *Server) handleInitInstance(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Get parameters
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	productName, err := request.RequireString("product_name")
	if err != nil {
		return mcp.NewToolResultError("product_name parameter is required"), nil
	}

	// Optional parameters
	epfVersion, _ := request.RequireString("epf_version")
	if epfVersion == "" {
		epfVersion = "2.12.0" // Default EPF version
	}

	structureType, _ := request.RequireString("structure_type")
	if structureType == "" {
		structureType = "phased" // Default structure
	}

	mode, _ := request.RequireString("mode")
	if mode == "" {
		mode = "integrated" // Default mode
	}
	if mode != "integrated" && mode != "standalone" {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Invalid mode '%s'. Must be 'integrated' (default, creates docs/EPF/ wrapper) or 'standalone' (instance at path directly)",
			mode,
		)), nil
	}

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := strings.ToLower(dryRunStr) == "true"

	forceStr, _ := request.RequireString("force")
	force := strings.ToLower(forceStr) == "true"

	// Validate product name
	if !isValidProductName(productName) {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Invalid product name '%s'. Must be lowercase alphanumeric with hyphens (e.g., 'my-product')",
			productName,
		)), nil
	}

	// Resolve path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid path: %s", err.Error())), nil
	}

	// Check if path is in canonical EPF (block writes)
	if isCanonicalEPFPath(absPath) {
		return mcp.NewToolResultError(
			"Cannot initialize EPF instance in canonical EPF repository. " +
				"Product instances should be created in product repositories, not in the canonical EPF framework.",
		), nil
	}

	// Check if it's a git repo (warn but don't block)
	isGit := isGitRepo(absPath)

	// Determine instance directory based on mode
	var instanceDir string
	var epfDir string
	if mode == "standalone" {
		// Standalone: instance is created directly at the given path
		instanceDir = absPath
	} else {
		// Integrated: instance is nested under docs/EPF/_instances/<name>/
		epfDir = filepath.Join(absPath, "docs", "EPF")
		instanceDir = filepath.Join(epfDir, "_instances", productName)
	}

	// Check if instance already exists
	if _, err := os.Stat(instanceDir); err == nil {
		if !force && !dryRun {
			return mcp.NewToolResultError(fmt.Sprintf(
				"Instance '%s' already exists at %s. Use force=true to overwrite.",
				productName, instanceDir,
			)), nil
		}
	}

	result := &InitInstanceResult{
		Success:      true,
		InstancePath: instanceDir,
		ProductName:  productName,
		EPFVersion:   epfVersion,
		Mode:         mode,
		DryRun:       dryRun,
		FilesCreated: []string{},
	}

	if mode == "standalone" {
		return s.handleInitStandalone(absPath, instanceDir, productName, epfVersion, structureType, force, dryRun, isGit, result)
	}

	return s.handleInitIntegrated(absPath, epfDir, instanceDir, productName, epfVersion, structureType, force, dryRun, isGit, result)
}

// handleInitStandalone creates an EPF instance directly at the given path (no docs/EPF/ wrapper).
// This is for repositories that ARE the EPF instance (e.g., dedicated strategy repos).
func (s *Server) handleInitStandalone(absPath, instanceDir, productName, epfVersion, structureType string, force, dryRun, isGit bool, result *InitInstanceResult) (*mcp.CallToolResult, error) {
	if dryRun {
		result.FilesCreated = []string{
			filepath.Join(instanceDir, "_epf.yaml"),
			filepath.Join(instanceDir, "_meta.yaml"),
			filepath.Join(instanceDir, "README.md"),
			filepath.Join(instanceDir, "READY", "00_north_star.yaml"),
			filepath.Join(instanceDir, "READY", "01_insight_analyses.yaml"),
			filepath.Join(instanceDir, "READY", "02_strategy_foundations.yaml"),
			filepath.Join(instanceDir, "READY", "03_insight_opportunity.yaml"),
			filepath.Join(instanceDir, "READY", "04_strategy_formula.yaml"),
			filepath.Join(instanceDir, "READY", "05_roadmap_recipe.yaml"),
			filepath.Join(instanceDir, "FIRE", "feature_definitions", ".gitkeep"),
			filepath.Join(instanceDir, "FIRE", "value_models", "product.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "strategy.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "org_ops.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "commercial.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "workflows", ".gitkeep"),
			filepath.Join(instanceDir, "AIM", "assessment_report.yaml"),
			filepath.Join(instanceDir, "AIM", "calibration_memo.yaml"),
			filepath.Join(instanceDir, "outputs", ".gitkeep"),
		}
		// Add canonical definitions to dry_run listing
		if defs, err := embedded.ListCanonicalDefinitions(); err == nil {
			for _, def := range defs {
				dstDir := filepath.Join(instanceDir, "READY", "definitions", def.Track)
				if def.Category != "" {
					dstDir = filepath.Join(dstDir, def.Category)
				}
				result.FilesCreated = append(result.FilesCreated, filepath.Join(dstDir, def.Filename))
			}
		}
		// .epf.yaml is created at repo root, which for standalone is the same as instanceDir
		repoRoot := config.FindRepoRoot(absPath)
		if repoRoot != "" {
			result.FilesCreated = append(result.FilesCreated, filepath.Join(repoRoot, config.RepoConfigFileName))
		} else {
			result.FilesCreated = append(result.FilesCreated, filepath.Join(instanceDir, config.RepoConfigFileName))
		}
		result.AnchorFile = filepath.Join(instanceDir, "_epf.yaml")
		result.NextSteps = []string{
			"Run with dry_run=false to create the instance",
			fmt.Sprintf("Edit %s/_meta.yaml with your product details", instanceDir),
			fmt.Sprintf("Edit %s/READY/00_north_star.yaml with your vision", instanceDir),
			"Run epf_health_check to validate your setup",
		}
		return returnInitResult(result)
	}

	// Actually create the instance
	if force {
		// In standalone mode, only remove phase directories, not the whole directory
		for _, dir := range []string{"READY", "FIRE", "AIM", "outputs"} {
			os.RemoveAll(filepath.Join(instanceDir, dir))
		}
		// Also remove anchor and meta files that will be recreated
		os.Remove(filepath.Join(instanceDir, "_epf.yaml"))
		os.Remove(filepath.Join(instanceDir, "_meta.yaml"))
	}

	// Create instance structure directly at path (no wrapper)
	createdFiles, err := s.createInstanceStructure(instanceDir, productName, epfVersion, structureType)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to create instance structure: %s", err.Error())
		return returnInitResult(result)
	}
	result.FilesCreated = append(result.FilesCreated, createdFiles...)
	result.AnchorFile = filepath.Join(instanceDir, "_epf.yaml")

	// Create .epf.yaml repo config with mode: standalone
	repoRoot := config.FindRepoRoot(absPath)
	if repoRoot == "" {
		repoRoot = absPath // fallback to the path itself
	}
	repoConfig := &config.RepoConfig{
		InstancePath: ".",
		Mode:         "standalone",
	}
	if err := repoConfig.SaveRepoConfig(repoRoot); err != nil {
		// Non-fatal: instance is created, just warn in next steps
		result.NextSteps = append(result.NextSteps,
			fmt.Sprintf("Warning: could not create .epf.yaml: %s. Create it manually.", err.Error()),
		)
	} else {
		result.FilesCreated = append(result.FilesCreated, filepath.Join(repoRoot, config.RepoConfigFileName))
	}

	result.NextSteps = []string{
		fmt.Sprintf("Edit %s/_meta.yaml with your product details", instanceDir),
		fmt.Sprintf("Edit %s/READY/00_north_star.yaml with your vision", instanceDir),
		"Run epf_health_check to validate your setup",
	}

	if !isGit {
		result.NextSteps = append([]string{"Initialize git repository: git init"}, result.NextSteps...)
	}

	// Invalidate caches after creating instance
	s.invalidateInstanceCaches(instanceDir)

	return returnInitResult(result)
}

// handleInitIntegrated creates an EPF instance with the docs/EPF/ wrapper structure.
// This is the default mode for product repositories.
func (s *Server) handleInitIntegrated(absPath, epfDir, instanceDir, productName, epfVersion, structureType string, force, dryRun, isGit bool, result *InitInstanceResult) (*mcp.CallToolResult, error) {
	if dryRun {
		// Simulate what would be created
		result.FilesCreated = []string{
			filepath.Join(epfDir, "AGENTS.md"),
			filepath.Join(epfDir, "README.md"),
			filepath.Join(epfDir, ".gitignore"),
			filepath.Join(instanceDir, "_epf.yaml"),
			filepath.Join(instanceDir, "_meta.yaml"),
			filepath.Join(instanceDir, "README.md"),
			filepath.Join(instanceDir, "READY", "00_north_star.yaml"),
			filepath.Join(instanceDir, "READY", "01_insight_analyses.yaml"),
			filepath.Join(instanceDir, "READY", "02_strategy_foundations.yaml"),
			filepath.Join(instanceDir, "READY", "03_insight_opportunity.yaml"),
			filepath.Join(instanceDir, "READY", "04_strategy_formula.yaml"),
			filepath.Join(instanceDir, "READY", "05_roadmap_recipe.yaml"),
			filepath.Join(instanceDir, "FIRE", "feature_definitions", ".gitkeep"),
			filepath.Join(instanceDir, "FIRE", "value_models", "product.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "strategy.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "org_ops.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "value_models", "commercial.value_model.yaml"),
			filepath.Join(instanceDir, "FIRE", "workflows", ".gitkeep"),
			filepath.Join(instanceDir, "AIM", "assessment_report.yaml"),
			filepath.Join(instanceDir, "AIM", "calibration_memo.yaml"),
			filepath.Join(instanceDir, "outputs", ".gitkeep"),
		}
		// Add canonical definitions to dry_run listing
		if defs, err := embedded.ListCanonicalDefinitions(); err == nil {
			for _, def := range defs {
				dstDir := filepath.Join(instanceDir, "READY", "definitions", def.Track)
				if def.Category != "" {
					dstDir = filepath.Join(dstDir, def.Category)
				}
				result.FilesCreated = append(result.FilesCreated, filepath.Join(dstDir, def.Filename))
			}
		}
		result.AnchorFile = filepath.Join(instanceDir, "_epf.yaml")
		result.NextSteps = []string{
			"Run with dry_run=false to create the instance",
			fmt.Sprintf("Edit %s/_meta.yaml with your product details", instanceDir),
			fmt.Sprintf("Edit %s/READY/00_north_star.yaml with your vision", instanceDir),
			"Run epf_health_check to validate your setup",
		}
		return returnInitResult(result)
	}

	// Actually create the instance
	if force {
		os.RemoveAll(instanceDir)
	}

	// Create EPF directory
	if err := os.MkdirAll(epfDir, 0755); err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to create EPF directory: %s", err.Error())
		return returnInitResult(result)
	}

	// Create AGENTS.md
	agentsMD, err := s.createAgentsMD(epfDir)
	if err == nil {
		result.FilesCreated = append(result.FilesCreated, agentsMD)
	}

	// Create README.md
	readmeMD, err := s.createReadmeMD(epfDir, productName)
	if err == nil {
		result.FilesCreated = append(result.FilesCreated, readmeMD)
	}

	// Create .gitignore
	gitignore, err := s.createGitignore(epfDir, productName)
	if err == nil {
		result.FilesCreated = append(result.FilesCreated, gitignore)
	}

	// Create instance structure
	createdFiles, err := s.createInstanceStructure(instanceDir, productName, epfVersion, structureType)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to create instance structure: %s", err.Error())
		return returnInitResult(result)
	}
	result.FilesCreated = append(result.FilesCreated, createdFiles...)
	result.AnchorFile = filepath.Join(instanceDir, "_epf.yaml")

	result.NextSteps = []string{
		fmt.Sprintf("Edit %s/_meta.yaml with your product details", instanceDir),
		fmt.Sprintf("Edit %s/READY/00_north_star.yaml with your vision", instanceDir),
		"Run epf_health_check to validate your setup",
	}

	if !isGit {
		result.NextSteps = append([]string{"Initialize git repository: git init"}, result.NextSteps...)
	}

	// Invalidate caches after creating instance
	s.invalidateInstanceCaches(instanceDir)

	return returnInitResult(result)
}

func returnInitResult(result *InitInstanceResult) (*mcp.CallToolResult, error) {
	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// Helper functions for init

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

func (s *Server) createAgentsMD(epfDir string) (string, error) {
	path := filepath.Join(epfDir, "AGENTS.md")

	// Use embedded comprehensive AGENTS.md (always available in binary)
	agentsMDContent, err := embedded.GetAgentsMD()
	if err == nil && len(agentsMDContent) > 0 {
		if err := os.WriteFile(path, agentsMDContent, 0644); err != nil {
			return "", err
		}
		return path, nil
	}

	// Fallback: Create simplified version
	content := `# AGENTS.md - AI Agent Instructions for EPF

> **This file is for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.)**
> Read this FIRST before performing any EPF operations.

## Quick Start

This repository uses **epf-cli** for all EPF operations.

### Common Operations

| Task | Command |
|------|---------|
| Validate a file | ` + "`epf-cli validate <file>`" + ` |
| Run health check | ` + "`epf-cli health`" + ` |
| List schemas | ` + "`epf-cli schemas list`" + ` |
| Get wizard | ` + "`epf-cli wizards get <name>`" + ` |

### MCP Tools

When epf-cli runs as an MCP server, you have access to 29+ tools for:
- Schema validation (epf_validate_file, epf_validate_content)
- Templates (epf_get_template, epf_list_artifacts)
- Wizards (epf_get_wizard, epf_get_wizard_for_task)
- Health checks (epf_health_check, epf_check_instance)

Run ` + "`epf-cli serve`" + ` to start the MCP server.
`
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func (s *Server) createReadmeMD(epfDir, productName string) (string, error) {
	path := filepath.Join(epfDir, "README.md")
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
`+"```"+`
`, productName, productName, productName)

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func (s *Server) createGitignore(epfDir, productName string) (string, error) {
	path := filepath.Join(epfDir, ".gitignore")
	content := fmt.Sprintf(`# EPF Instance .gitignore

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

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func (s *Server) createInstanceStructure(instanceDir, productName, epfVersion, structureType string) ([]string, error) {
	var createdFiles []string

	// Create phase directories
	phases := []string{"READY", "FIRE", "AIM"}
	for _, phase := range phases {
		if err := os.MkdirAll(filepath.Join(instanceDir, phase), 0755); err != nil {
			return createdFiles, err
		}
	}

	// Create FIRE subdirectories
	fireDirs := []string{"feature_definitions", "value_models", "workflows"}
	for _, dir := range fireDirs {
		path := filepath.Join(instanceDir, "FIRE", dir)
		if err := os.MkdirAll(path, 0755); err != nil {
			return createdFiles, err
		}
		// Add .gitkeep
		gitkeep := filepath.Join(path, ".gitkeep")
		os.WriteFile(gitkeep, []byte{}, 0644)
		createdFiles = append(createdFiles, gitkeep)
	}

	// Create outputs directory
	os.MkdirAll(filepath.Join(instanceDir, "outputs"), 0755)
	outputsGitkeep := filepath.Join(instanceDir, "outputs", ".gitkeep")
	os.WriteFile(outputsGitkeep, []byte{}, 0644)
	createdFiles = append(createdFiles, outputsGitkeep)

	// Copy templates from embedded
	templateFiles := s.copyTemplatesFromEmbedded(instanceDir)
	createdFiles = append(createdFiles, templateFiles...)

	// Copy canonical definitions (strategy, org_ops, commercial tracks)
	defFiles := s.copyCanonicalDefinitionsFromEmbedded(instanceDir)
	createdFiles = append(createdFiles, defFiles...)

	// Create anchor file (_epf.yaml)
	anchorFile := anchor.NewWithOptions(productName, "", epfVersion)
	anchorFile.Structure = &anchor.StructureInfo{
		Type:     structureType,
		Location: instanceDir,
	}
	if err := anchorFile.Save(instanceDir); err != nil {
		return createdFiles, fmt.Errorf("failed to create anchor file: %w", err)
	}
	createdFiles = append(createdFiles, filepath.Join(instanceDir, "_epf.yaml"))

	// Create _meta.yaml
	metaPath, err := s.createMetaFile(instanceDir, productName, epfVersion)
	if err == nil {
		createdFiles = append(createdFiles, metaPath)
	}

	// Create instance README
	readmePath, err := s.createInstanceReadme(instanceDir, productName)
	if err == nil {
		createdFiles = append(createdFiles, readmePath)
	}

	return createdFiles, nil
}

func (s *Server) copyTemplatesFromEmbedded(instanceDir string) []string {
	var createdFiles []string

	// Template paths in embedded fs
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
			continue
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "READY", filename)
		if err := os.WriteFile(dst, content, 0644); err == nil {
			createdFiles = append(createdFiles, dst)
		}
	}

	// Copy FIRE value model templates
	for _, tmplPath := range fireTemplates {
		content, err := embedded.GetTemplate(tmplPath)
		if err != nil {
			continue
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "FIRE", "value_models", filename)
		if err := os.WriteFile(dst, content, 0644); err == nil {
			createdFiles = append(createdFiles, dst)
		}
	}

	// Copy AIM templates
	for _, tmplPath := range aimTemplates {
		content, err := embedded.GetTemplate(tmplPath)
		if err != nil {
			continue
		}
		filename := filepath.Base(tmplPath)
		dst := filepath.Join(instanceDir, "AIM", filename)
		if err := os.WriteFile(dst, content, 0644); err == nil {
			createdFiles = append(createdFiles, dst)
		}
	}

	return createdFiles
}

// copyCanonicalDefinitionsFromEmbedded copies canonical track definitions (strategy, org_ops, commercial)
// from the embedded binary into the instance's READY/definitions/ directory.
func (s *Server) copyCanonicalDefinitionsFromEmbedded(instanceDir string) []string {
	var createdFiles []string

	defs, err := embedded.ListCanonicalDefinitions()
	if err != nil || len(defs) == 0 {
		return createdFiles
	}

	defsDir := filepath.Join(instanceDir, "READY", "definitions")

	for _, def := range defs {
		// Build destination path: READY/definitions/{track}/{category}/{file}
		dstDir := filepath.Join(defsDir, def.Track)
		if def.Category != "" {
			dstDir = filepath.Join(dstDir, def.Category)
		}
		if err := os.MkdirAll(dstDir, 0755); err != nil {
			continue
		}

		dst := filepath.Join(dstDir, def.Filename)
		// Skip if already exists (instance-level takes priority)
		if _, err := os.Stat(dst); err == nil {
			continue
		}

		content, err := embedded.GetCanonicalDefinition(def.Filename)
		if err != nil {
			continue
		}
		if err := os.WriteFile(dst, content, 0644); err == nil {
			createdFiles = append(createdFiles, dst)
		}
	}

	return createdFiles
}

func (s *Server) createMetaFile(instanceDir, productName, epfVersion string) (string, error) {
	path := filepath.Join(instanceDir, "_meta.yaml")
	content := fmt.Sprintf(`# EPF Instance Metadata
# This file contains metadata about this EPF instance

instance:
  product_name: "%s"
  epf_version: "%s"
  instance_version: "1.0.0"
  created_date: "%s"
  description: |
    Add a brief description of this product instance.

  current_cycle:
    cycle_number: 1
    cycle_id: "cycle-001"
    phase: "READY"
`, productName, epfVersion, time.Now().Format("2006-01-02"))

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func (s *Server) createInstanceReadme(instanceDir, productName string) (string, error) {
	path := filepath.Join(instanceDir, "README.md")
	content := fmt.Sprintf(`# %s EPF Instance

This is the EPF (Emergent Product Framework) instance for %s.

## Directory Structure

- **READY/** - Strategic foundation phase
- **FIRE/** - Execution phase
- **AIM/** - Assessment phase
- **outputs/** - Generated documents

## Validation

`+"```bash"+`
epf-cli health
epf-cli validate READY/00_north_star.yaml
`+"```"+`
`, productName, productName)

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

// =============================================================================
// File Fix Tool
// =============================================================================

// FixFileResult represents the result of fixing a file
type FixFileResult struct {
	File    string      `json:"file"`
	Fixed   bool        `json:"fixed"`
	Changes []FixChange `json:"changes,omitempty"`
	DryRun  bool        `json:"dry_run"`
	Error   string      `json:"error,omitempty"`
}

// FixChange represents a single change made to a file
type FixChange struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	Line        int    `json:"line,omitempty"`
	Before      string `json:"before,omitempty"`
	After       string `json:"after,omitempty"`
}

// FixFilesResult represents the result of fixing multiple files
type FixFilesResult struct {
	TotalFiles int             `json:"total_files"`
	FixedFiles int             `json:"fixed_files"`
	TotalFixes int             `json:"total_fixes"`
	DryRun     bool            `json:"dry_run"`
	Results    []FixFileResult `json:"results"`
	FixTypes   []string        `json:"fix_types_applied"`
}

// handleFixFile handles the epf_fix_file tool
func (s *Server) handleFixFile(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Get parameters
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	// Optional parameters
	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := strings.ToLower(dryRunStr) == "true"

	// Parse fix_types array (comma-separated or JSON array)
	fixTypesStr, _ := request.RequireString("fix_types")
	fixTypes := parseFixTypes(fixTypesStr)

	// Resolve path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid path: %s", err.Error())), nil
	}

	// Check if path is in canonical EPF (block writes)
	if isCanonicalEPFPath(absPath) {
		return mcp.NewToolResultError(
			"Cannot fix files in canonical EPF repository. " +
				"This operation is only allowed in product repositories.",
		), nil
	}

	// Check if path exists
	info, err := os.Stat(absPath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Path not found: %s", err.Error())), nil
	}

	// Determine fix options
	options := getFixOptions(fixTypes)

	result := &FixFilesResult{
		DryRun:   dryRun,
		Results:  []FixFileResult{},
		FixTypes: getActiveFixTypes(options),
	}

	if info.IsDir() {
		// Walk directory and fix all YAML files
		filepath.Walk(absPath, func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			ext := strings.ToLower(filepath.Ext(p))
			if ext != ".yaml" && ext != ".yml" {
				return nil
			}

			fileResult := fixFileWithOptions(p, dryRun, options)
			result.TotalFiles++
			result.Results = append(result.Results, fileResult)
			if fileResult.Fixed {
				result.FixedFiles++
				result.TotalFixes += len(fileResult.Changes)
			}

			return nil
		})
	} else {
		// Single file
		fileResult := fixFileWithOptions(absPath, dryRun, options)
		result.TotalFiles = 1
		result.Results = append(result.Results, fileResult)
		if fileResult.Fixed {
			result.FixedFiles = 1
			result.TotalFixes = len(fileResult.Changes)
		}
	}

	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// FixOptions controls which fixes to apply
type FixOptions struct {
	Whitespace  bool
	LineEndings bool
	Tabs        bool
	Newlines    bool
	Versions    bool
}

func parseFixTypes(input string) []string {
	if input == "" {
		return nil // Will apply all fixes
	}

	// Try to parse as JSON array
	var types []string
	if err := json.Unmarshal([]byte(input), &types); err == nil {
		return types
	}

	// Parse as comma-separated
	parts := strings.Split(input, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(strings.ToLower(p))
	}
	return parts
}

func getFixOptions(fixTypes []string) *FixOptions {
	// If no specific types, apply all
	if len(fixTypes) == 0 {
		return &FixOptions{
			Whitespace:  true,
			LineEndings: true,
			Tabs:        true,
			Newlines:    true,
			Versions:    true,
		}
	}

	options := &FixOptions{}
	for _, ft := range fixTypes {
		switch ft {
		case "whitespace":
			options.Whitespace = true
		case "line_endings", "line-endings", "lineendings":
			options.LineEndings = true
		case "tabs":
			options.Tabs = true
		case "newlines":
			options.Newlines = true
		case "versions":
			options.Versions = true
		case "all":
			return &FixOptions{
				Whitespace:  true,
				LineEndings: true,
				Tabs:        true,
				Newlines:    true,
				Versions:    true,
			}
		}
	}
	return options
}

func getActiveFixTypes(options *FixOptions) []string {
	var types []string
	if options.Whitespace {
		types = append(types, "whitespace")
	}
	if options.LineEndings {
		types = append(types, "line_endings")
	}
	if options.Tabs {
		types = append(types, "tabs")
	}
	if options.Newlines {
		types = append(types, "newlines")
	}
	if options.Versions {
		types = append(types, "versions")
	}
	return types
}

func fixFileWithOptions(path string, dryRun bool, options *FixOptions) FixFileResult {
	result := FixFileResult{
		File:    path,
		DryRun:  dryRun,
		Changes: []FixChange{},
	}

	// Read file
	content, err := os.ReadFile(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	original := string(content)
	fixed := original

	// Fix 1: Normalize line endings (CRLF -> LF)
	if options.LineEndings && strings.Contains(fixed, "\r\n") {
		fixed = strings.ReplaceAll(fixed, "\r\n", "\n")
		result.Changes = append(result.Changes, FixChange{
			Type:        "line_endings",
			Description: "Normalized line endings (CRLF -> LF)",
		})
	}

	// Fix 2: Remove trailing whitespace from lines
	if options.Whitespace {
		lines := strings.Split(fixed, "\n")
		trailingFixed := false
		for i, line := range lines {
			trimmed := strings.TrimRight(line, " \t")
			if trimmed != line {
				lines[i] = trimmed
				trailingFixed = true
			}
		}
		if trailingFixed {
			fixed = strings.Join(lines, "\n")
			result.Changes = append(result.Changes, FixChange{
				Type:        "whitespace",
				Description: "Removed trailing whitespace",
			})
		}
	}

	// Fix 3: Convert tabs to spaces (2 spaces per tab, YAML standard)
	if options.Tabs && strings.Contains(fixed, "\t") {
		fixed = strings.ReplaceAll(fixed, "\t", "  ")
		result.Changes = append(result.Changes, FixChange{
			Type:        "tabs",
			Description: "Converted tabs to spaces",
		})
	}

	// Fix 4: Ensure file ends with newline
	if options.Newlines {
		if len(fixed) > 0 && !strings.HasSuffix(fixed, "\n") {
			fixed += "\n"
			result.Changes = append(result.Changes, FixChange{
				Type:        "newlines",
				Description: "Added missing newline at end of file",
			})
		}

		// Fix 5: Remove multiple trailing newlines
		hadMultiple := false
		for strings.HasSuffix(fixed, "\n\n") {
			fixed = strings.TrimSuffix(fixed, "\n")
			hadMultiple = true
		}
		if hadMultiple {
			if !strings.HasSuffix(fixed, "\n") {
				fixed += "\n"
			}
			result.Changes = append(result.Changes, FixChange{
				Type:        "newlines",
				Description: "Removed multiple trailing newlines",
			})
		}
	}

	// Fix 6: Try to add meta.epf_version if missing
	if options.Versions {
		var wasFixed bool
		fixed, wasFixed = tryAddMetaVersion(fixed)
		if wasFixed {
			result.Changes = append(result.Changes, FixChange{
				Type:        "versions",
				Description: "Added meta.epf_version field",
			})
		}
	}

	// Check if anything changed
	if fixed != original {
		result.Fixed = true

		if !dryRun {
			// Write fixed content
			if err := os.WriteFile(path, []byte(fixed), 0644); err != nil {
				result.Error = err.Error()
				return result
			}
		}
	}

	return result
}

// tryAddMetaVersion attempts to add meta.epf_version if it's missing
func tryAddMetaVersion(content string) (string, bool) {
	// Parse YAML to check structure
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &data); err != nil {
		return content, false // Can't parse, don't modify
	}

	// Check if meta section exists
	meta, hasMeta := data["meta"].(map[string]interface{})
	if !hasMeta {
		// No meta section - try to add it at the beginning
		if !strings.Contains(content, "meta:") {
			// Don't add meta if file is empty or has no structure
			if len(data) == 0 {
				return content, false
			}

			// Check if this looks like an EPF file
			isEPF := false
			epfFields := []string{"vision", "north_star", "feature_id", "personas", "scenarios", "tracks", "capabilities"}
			for _, field := range epfFields {
				if _, ok := data[field]; ok {
					isEPF = true
					break
				}
			}

			if !isEPF {
				return content, false
			}

			// Add meta section at the top
			metaSection := "meta:\n  epf_version: \"2.12.0\"\n\n"
			// Find first non-comment, non-empty line
			lines := strings.Split(content, "\n")
			insertIdx := 0
			for i, line := range lines {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
					insertIdx = i
					break
				}
			}

			// Insert meta section
			newLines := make([]string, 0, len(lines)+3)
			newLines = append(newLines, lines[:insertIdx]...)
			newLines = append(newLines, strings.Split(metaSection, "\n")...)
			newLines = append(newLines, lines[insertIdx:]...)

			return strings.Join(newLines, "\n"), true
		}
		return content, false
	}

	// Meta exists, check for epf_version
	if _, hasVersion := meta["epf_version"]; !hasVersion {
		// Add epf_version to meta
		re := regexp.MustCompile(`(?m)^meta:\s*$`)
		if re.MatchString(content) {
			content = re.ReplaceAllString(content, "meta:\n  epf_version: \"2.12.0\"")
			return content, true
		}
	}

	return content, false
}

// =============================================================================
// Sync Canonical Artifacts Tool
// =============================================================================

// SyncCanonicalResult represents the result of syncing canonical artifacts
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

// handleSyncCanonical handles the epf_sync_canonical tool
func (s *Server) handleSyncCanonical(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Get parameters
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// Optional parameters
	forceStr, _ := request.RequireString("force")
	force := strings.ToLower(forceStr) == "true"

	dryRunStr, _ := request.RequireString("dry_run")
	dryRun := strings.ToLower(dryRunStr) == "true"

	// Resolve path
	absPath, err := filepath.Abs(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid path: %s", err.Error())), nil
	}

	// Check if path is in canonical EPF (block writes)
	if isCanonicalEPFPath(absPath) {
		return mcp.NewToolResultError(
			"Cannot sync canonical artifacts in canonical EPF repository. " +
				"This tool is for syncing canonical artifacts TO product instances, not modifying the framework itself.",
		), nil
	}

	// Run sync
	opts := embedded.SyncOptions{
		Force:  force,
		DryRun: dryRun,
	}

	syncResult, err := embedded.SyncCanonical(absPath, opts)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Sync failed: %s", err.Error())), nil
	}

	// Relativize paths for cleaner output
	relAdded := relativizePathsMCP(syncResult.Added, absPath)
	relSkipped := relativizePathsMCP(syncResult.Skipped, absPath)
	relUpdated := relativizePathsMCP(syncResult.Updated, absPath)

	result := &SyncCanonicalResult{
		Success:  len(syncResult.Errors) == 0,
		Instance: absPath,
		DryRun:   dryRun,
		Force:    force,
		Added:    relAdded,
		Skipped:  relSkipped,
		Updated:  relUpdated,
		Errors:   syncResult.Errors,
	}
	result.Summary.AddedCount = len(syncResult.Added)
	result.Summary.SkippedCount = len(syncResult.Skipped)
	result.Summary.UpdatedCount = len(syncResult.Updated)
	result.Summary.ErrorCount = len(syncResult.Errors)

	// Invalidate caches after syncing canonical artifacts (skip on dry run)
	if !dryRun {
		s.invalidateInstanceCaches(absPath)
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(data)), nil
}

// relativizePathsMCP converts absolute paths to paths relative to the base directory
func relativizePathsMCP(paths []string, base string) []string {
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
