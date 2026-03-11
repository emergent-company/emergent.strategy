package skill

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ScaffoldOptions contains options for scaffolding a new skill.
type ScaffoldOptions struct {
	Name        string
	Description string
	Type        SkillType
	Category    Category
	Author      string
	OutputDir   string // Where to create the skill (required)

	// What EPF artifacts the skill needs
	RequiredArtifacts []string
	OptionalArtifacts []string

	// Required MCP tools (new in skill format)
	RequiredTools []string

	// Output format (for generation-type skills)
	OutputFormat OutputFormat

	// Region-specific (for compliance generators)
	Regions []string

	// If true, use legacy file names (generator.yaml, wizard.instructions.md)
	// Default: true for generation-type skills, false for others
	UseLegacyNames *bool
}

// shouldUseLegacyNames returns whether to use legacy file names.
// Default: generation-type skills use legacy names, others use new names.
func (o *ScaffoldOptions) shouldUseLegacyNames() bool {
	if o.UseLegacyNames != nil {
		return *o.UseLegacyNames
	}
	return o.Type == SkillTypeGeneration || o.Type == ""
}

// Scaffold creates a new skill directory with all required files.
//
// Per design decision: generation-type skills are ALWAYS created with legacy
// file names (generator.yaml, wizard.instructions.md) to maintain backward
// compatibility. The `epf_scaffold_generator` MCP tool must produce the old
// format — no deprecation, ever.
func Scaffold(opts ScaffoldOptions) (*ScaffoldResult, error) {
	if opts.Name == "" {
		return nil, fmt.Errorf("skill name is required")
	}

	// Normalize name
	name := strings.ToLower(strings.ReplaceAll(opts.Name, "_", "-"))
	name = strings.ReplaceAll(name, " ", "-")

	// Defaults
	if opts.Type == "" {
		opts.Type = SkillTypeGeneration
	}
	if opts.Category == "" {
		opts.Category = CategoryCustom
	}
	if opts.OutputFormat == "" {
		opts.OutputFormat = FormatMarkdown
	}
	if opts.Author == "" {
		opts.Author = "Custom"
	}
	if opts.OutputDir == "" {
		return nil, fmt.Errorf("output directory is required")
	}

	skillPath := filepath.Join(opts.OutputDir, name)

	// Check if already exists
	if _, err := os.Stat(skillPath); err == nil {
		return nil, fmt.Errorf("skill already exists at %s", skillPath)
	}

	// Create directory
	if err := os.MkdirAll(skillPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create skill directory: %w", err)
	}

	result := &ScaffoldResult{
		SkillPath:    skillPath,
		FilesCreated: []string{},
	}

	// Determine file names
	useLegacy := opts.shouldUseLegacyNames()
	manifestFile := DefaultManifestFile // skill.yaml
	promptFile := DefaultPromptFile     // prompt.md
	if useLegacy {
		manifestFile = LegacyManifestFile // generator.yaml
		promptFile = LegacyPromptFile     // wizard.instructions.md
	}

	// Create files
	files := map[string]string{
		manifestFile:   scaffoldManifest(name, opts, useLegacy),
		promptFile:     scaffoldPrompt(name, opts),
		"schema.json":  scaffoldSchema(name, opts),
		"validator.sh": scaffoldValidator(name, opts),
		"README.md":    scaffoldReadme(name, opts, useLegacy),
	}

	for filename, content := range files {
		filePath := filepath.Join(skillPath, filename)
		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write %s: %w", filename, err)
		}
		result.FilesCreated = append(result.FilesCreated, filename)
	}

	// Make validator executable
	_ = os.Chmod(filepath.Join(skillPath, "validator.sh"), 0755)

	// Next steps
	typeName := "skill"
	if useLegacy {
		typeName = "generator"
	}
	result.NextSteps = []string{
		fmt.Sprintf("1. Edit %s/%s with your instructions", name, promptFile),
		fmt.Sprintf("2. Update %s/schema.json with your output structure", name),
		fmt.Sprintf("3. Customize %s/validator.sh for your validation rules", name),
		fmt.Sprintf("4. Test with: epf-cli generators show %s --wizard", name),
	}
	_ = typeName // Avoid unused variable

	return result, nil
}

// scaffoldManifest generates the manifest file content (skill.yaml or generator.yaml).
func scaffoldManifest(name string, opts ScaffoldOptions, legacy bool) string {
	// Build requires section
	requiredYAML := ""
	if len(opts.RequiredArtifacts) > 0 {
		requiredYAML = "\n  artifacts:"
		for _, art := range opts.RequiredArtifacts {
			requiredYAML += fmt.Sprintf("\n    - %s", art)
		}
	}

	optionalYAML := ""
	if len(opts.OptionalArtifacts) > 0 {
		optionalYAML = "\n  optional:"
		for _, art := range opts.OptionalArtifacts {
			optionalYAML += fmt.Sprintf("\n    - %s", art)
		}
	}

	toolsYAML := ""
	if !legacy && len(opts.RequiredTools) > 0 {
		toolsYAML = "\n  tools:"
		for _, tool := range opts.RequiredTools {
			toolsYAML += fmt.Sprintf("\n    - %s", tool)
		}
	}

	regionsYAML := ""
	if len(opts.Regions) > 0 {
		regionsYAML = "\nregions:"
		for _, r := range opts.Regions {
			regionsYAML += fmt.Sprintf("\n  - %s", r)
		}
	}

	description := opts.Description
	if description == "" {
		description = fmt.Sprintf("Custom %s skill", name)
	}

	if legacy {
		// Legacy format: generator.yaml (no type field, no tools)
		return fmt.Sprintf(`# Generator manifest for epf-cli
# This file enables epf-cli to discover and describe this generator

name: %s
version: 1.0.0
description: %s
category: %s
author: %s
%s
# What EPF artifacts are needed to run this generator
requires:%s%s

# Output specification
output:
  format: %s

# File locations (defaults shown)
files:
  schema: schema.json
  wizard: wizard.instructions.md
  validator: validator.sh
`, name, description, string(opts.Category), opts.Author, regionsYAML, requiredYAML, optionalYAML, string(opts.OutputFormat))
	}

	// New format: skill.yaml (includes type, tools, capability)
	return fmt.Sprintf(`# Skill manifest for epf-cli
# This file enables epf-cli to discover and describe this skill

name: %s
version: 1.0.0
type: %s
description: %s
category: %s
author: %s
%s
# What EPF artifacts and tools are needed
requires:%s%s%s

# Output specification
output:
  format: %s

# File locations (defaults shown)
files:
  prompt: prompt.md
  schema: schema.json
  validator: validator.sh
`, name, string(opts.Type), description, string(opts.Category), opts.Author, regionsYAML, requiredYAML, optionalYAML, toolsYAML, string(opts.OutputFormat))
}

// scaffoldPrompt generates the prompt/wizard instructions file content.
func scaffoldPrompt(name string, opts ScaffoldOptions) string {
	titleName := toTitleCase(name)

	description := opts.Description
	if description == "" {
		description = fmt.Sprintf("Custom %s skill", name)
	}

	// Build required files list
	requiredFiles := ""
	for _, art := range opts.RequiredArtifacts {
		requiredFiles += fmt.Sprintf("- `%s` artifact\n", art)
	}
	if requiredFiles == "" {
		requiredFiles = "- (No specific artifacts required - customize as needed)\n"
	}

	optionalFiles := ""
	for _, art := range opts.OptionalArtifacts {
		optionalFiles += fmt.Sprintf("- `%s` artifact (optional)\n", art)
	}

	return fmt.Sprintf(`# %s

> **Type**: %s
> **Purpose**: %s
> **Output**: %s file
> **Category**: %s

---

## Overview

This skill [DESCRIBE WHAT IT DOES] using EPF instance data.

**Use cases:**
- [When to use this skill]
- [Another use case]

---

## Prerequisites

Before running this skill, ensure your EPF instance has:

%s%s
---

## Instructions

When activated, follow these steps:

### Step 1: Locate EPF Instance

Identify the EPF instance path and verify it contains the required files.

### Step 2: Read Source Files

Read the required EPF artifacts from the instance.

### Step 3: Process Data

Extract and transform the relevant data.

### Step 4: Generate Output

Create the output following the schema in schema.json.

### Step 5: Validate

Validate the output against the schema and any custom rules.

---

## Changelog

- **1.0.0** (%s): Initial version
`, titleName, string(opts.Type), description, string(opts.OutputFormat), string(opts.Category),
		requiredFiles, optionalFiles,
		time.Now().Format("2006-01-02"))
}

// scaffoldSchema generates the schema.json content.
func scaffoldSchema(name string, opts ScaffoldOptions) string {
	titleName := toTitleCase(name)
	snakeName := strings.ReplaceAll(name, "-", "_")

	return fmt.Sprintf(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://emergent.build/schemas/outputs/%s.schema.json",
  "title": "%s",
  "description": "Schema for %s output",
  "type": "object",
  "version": "1.0.0",
  
  "required": ["metadata", "content"],
  
  "properties": {
    "metadata": {
      "type": "object",
      "description": "Generation metadata",
      "required": ["generated_at", "generator", "source_instance"],
      "properties": {
        "generated_at": {
          "type": "string",
          "format": "date-time"
        },
        "generator": {
          "type": "string",
          "const": "%s"
        },
        "generator_version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$"
        },
        "source_instance": {
          "type": "string"
        }
      }
    },
    "content": {
      "type": "object",
      "description": "The generated content"
    }
  },
  
  "additionalProperties": false
}
`, snakeName, titleName, name, name)
}

// scaffoldValidator generates the validator.sh content.
func scaffoldValidator(name string, opts ScaffoldOptions) string {
	return fmt.Sprintf(`#!/bin/bash
# Validator script for %s output
# Usage: ./validator.sh <output-file>

set -e

OUTPUT_FILE="$1"

if [ -z "$OUTPUT_FILE" ]; then
    echo "Usage: $0 <output-file>"
    exit 1
fi

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "Error: File not found: $OUTPUT_FILE"
    exit 1
fi

echo "Validating %s output: $OUTPUT_FILE"

ERRORS=0

# Check file is not empty
if [ ! -s "$OUTPUT_FILE" ]; then
    echo "✗ Error: Output file is empty"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ File is not empty"
fi

# TODO: Add your custom validation rules here

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✓ Validation passed!"
    exit 0
else
    echo "✗ Validation failed with $ERRORS error(s)"
    exit 1
fi
`, name, name)
}

// scaffoldReadme generates the README.md content.
func scaffoldReadme(name string, opts ScaffoldOptions, legacy bool) string {
	titleName := toTitleCase(name)

	description := opts.Description
	if description == "" {
		description = fmt.Sprintf("Custom %s skill for EPF instances", name)
	}

	manifestFile := "skill.yaml"
	promptFile := "prompt.md"
	if legacy {
		manifestFile = "generator.yaml"
		promptFile = "wizard.instructions.md"
	}

	return fmt.Sprintf(`# %s

%s

## Files

| File | Purpose |
|------|---------|
| `+"`%s`"+` | Manifest for epf-cli discovery |
| `+"`%s`"+` | AI instructions |
| `+"`schema.json`"+` | JSON Schema for output validation |
| `+"`validator.sh`"+` | Validation script |

## Usage

### Via AI Assistant

Ask: "Generate a %s for [product-name]"

### Via CLI

`+"```bash"+`
epf-cli generators check %s --instance <path>
epf-cli generators show %s --wizard
`+"```"+`

## Category

**%s**

---

*Generated by epf-cli*
`, titleName, description,
		manifestFile, promptFile,
		strings.ReplaceAll(name, "-", " "),
		name, name,
		string(opts.Category))
}

// --- Helpers ---

// toTitleCase converts a kebab-case or snake_case name to Title Case.
func toTitleCase(name string) string {
	name = strings.ReplaceAll(name, "-", " ")
	name = strings.ReplaceAll(name, "_", " ")
	words := strings.Fields(name)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
