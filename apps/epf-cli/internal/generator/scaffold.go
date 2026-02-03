package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ScaffoldOptions contains options for scaffolding a new generator
type ScaffoldOptions struct {
	Name        string
	Description string
	Category    GeneratorCategory
	Author      string
	OutputDir   string // Where to create the generator (defaults to instance generators)

	// What EPF artifacts the generator needs
	RequiredArtifacts []string
	OptionalArtifacts []string

	// Output format
	OutputFormat OutputFormat

	// Region-specific (for compliance generators)
	Regions []string
}

// ScaffoldResult contains the result of scaffolding
type ScaffoldResult struct {
	GeneratorPath string
	FilesCreated  []string
	NextSteps     []string
}

// Scaffold creates a new generator directory with all required files
func Scaffold(opts ScaffoldOptions) (*ScaffoldResult, error) {
	// Validate required fields
	if opts.Name == "" {
		return nil, fmt.Errorf("generator name is required")
	}

	// Normalize name (lowercase, hyphens)
	name := strings.ToLower(strings.ReplaceAll(opts.Name, "_", "-"))
	name = strings.ReplaceAll(name, " ", "-")

	// Default category
	if opts.Category == "" {
		opts.Category = CategoryCustom
	}

	// Default output format
	if opts.OutputFormat == "" {
		opts.OutputFormat = FormatMarkdown
	}

	// Default author
	if opts.Author == "" {
		opts.Author = "Custom"
	}

	// Determine output directory
	generatorPath := opts.OutputDir
	if generatorPath == "" {
		return nil, fmt.Errorf("output directory is required")
	}
	generatorPath = filepath.Join(generatorPath, name)

	// Check if already exists
	if _, err := os.Stat(generatorPath); err == nil {
		return nil, fmt.Errorf("generator already exists at %s", generatorPath)
	}

	// Create directory
	if err := os.MkdirAll(generatorPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create generator directory: %w", err)
	}

	result := &ScaffoldResult{
		GeneratorPath: generatorPath,
		FilesCreated:  []string{},
	}

	// Create all files
	files := map[string]string{
		"generator.yaml":         generateManifest(name, opts),
		"wizard.instructions.md": generateWizard(name, opts),
		"schema.json":            generateSchema(name, opts),
		"validator.sh":           generateValidator(name, opts),
		"README.md":              generateReadme(name, opts),
	}

	for filename, content := range files {
		filePath := filepath.Join(generatorPath, filename)
		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write %s: %w", filename, err)
		}
		result.FilesCreated = append(result.FilesCreated, filename)
	}

	// Make validator executable
	validatorPath := filepath.Join(generatorPath, "validator.sh")
	if err := os.Chmod(validatorPath, 0755); err != nil {
		// Non-fatal, just warn
	}

	// Build next steps
	result.NextSteps = []string{
		fmt.Sprintf("1. Edit %s/wizard.instructions.md with your generation instructions", name),
		fmt.Sprintf("2. Update %s/schema.json with your output structure", name),
		fmt.Sprintf("3. Customize %s/validator.sh for your validation rules", name),
		fmt.Sprintf("4. Test with: epf-cli generators show %s --wizard", name),
	}

	return result, nil
}

// generateManifest creates the generator.yaml content
func generateManifest(name string, opts ScaffoldOptions) string {
	// Build required artifacts YAML
	requiredYAML := ""
	if len(opts.RequiredArtifacts) > 0 {
		requiredYAML = "\n  artifacts:"
		for _, art := range opts.RequiredArtifacts {
			requiredYAML += fmt.Sprintf("\n    - %s", art)
		}
	}

	// Build optional artifacts YAML
	optionalYAML := ""
	if len(opts.OptionalArtifacts) > 0 {
		optionalYAML = "\n  optional:"
		for _, art := range opts.OptionalArtifacts {
			optionalYAML += fmt.Sprintf("\n    - %s", art)
		}
	}

	// Build regions YAML
	regionsYAML := ""
	if len(opts.Regions) > 0 {
		regionsYAML = "\nregions:"
		for _, r := range opts.Regions {
			regionsYAML += fmt.Sprintf("\n  - %s", r)
		}
	}

	description := opts.Description
	if description == "" {
		description = fmt.Sprintf("Custom %s generator", name)
	}

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

// generateWizard creates the wizard.instructions.md content
func generateWizard(name string, opts ScaffoldOptions) string {
	titleName := strings.Title(strings.ReplaceAll(name, "-", " "))

	// Build required files list
	requiredFiles := ""
	for _, art := range opts.RequiredArtifacts {
		requiredFiles += fmt.Sprintf("- `%s` artifact\n", art)
	}
	if requiredFiles == "" {
		requiredFiles = "- (No specific artifacts required - customize as needed)\n"
	}

	// Build optional files list
	optionalFiles := ""
	for _, art := range opts.OptionalArtifacts {
		optionalFiles += fmt.Sprintf("- `%s` artifact (optional)\n", art)
	}

	return fmt.Sprintf(`# %s Generator Wizard

> **Type**: Output Generator  
> **Purpose**: %s  
> **Output**: %s file  
> **Category**: %s  

---

## Overview

This generator creates [DESCRIBE WHAT IT CREATES] from your EPF instance data.

**Use cases:**
- [When to use this generator]
- [Another use case]

---

## Prerequisites

Before running this generator, ensure your EPF instance has:

%s%s
---

## Quick Start

Ask your AI assistant:

%s
"Generate a %s for [product-name]"
%s

---

## Instructions for AI Assistant

When the user asks to generate a %s, follow these steps:

### Step 1: Locate EPF Instance

%s
Product name: {product}
EPF instance location: docs/EPF/_instances/{product}/
%s

Verify the instance exists and contains required files.

### Step 2: Read Source Files

Read these files from the product's EPF instance:

%s
# TODO: List the specific files to read
# Example:
# docs/EPF/_instances/{product}/00_north_star.yaml
# docs/EPF/_instances/{product}/04_strategy_formula.yaml
%s

### Step 3: Extract Data

From each file, extract the following:

%s
# TODO: Document what data to extract from each file
# Use YAML path notation for clarity
# Example:
# north_star.purpose.statement → Purpose
# north_star.vision.statement → Vision
%s

### Step 4: Generate Output

Create the output file with this structure:

%s
# TODO: Define the output structure/template
# Include all sections that should be generated
%s

### Step 5: Save Output

Save the generated content to:

%s
docs/EPF/_instances/{product}/outputs/%s/[filename].%s
%s

---

## Output Schema

The output must conform to the schema defined in %sschema.json%s.

Key requirements:
- [List key schema requirements]
- [Another requirement]

---

## Validation

After generation, validate the output:

%s
epf-cli generators validate %s <output-file>
%s

Or run the validator script directly:

%s
./validator.sh <output-file>
%s

---

## Example Output

%s
# TODO: Add an example of the expected output
%s

---

## Troubleshooting

**Missing data in output?**
- Ensure all required EPF artifacts exist and are populated
- Check that YAML files are valid using %sepf-cli validate%s

**Validation errors?**
- Review the schema requirements in schema.json
- Check the validator.sh output for specific issues

---

## Changelog

- **1.0.0** (%s): Initial version
`, titleName, opts.Description, opts.OutputFormat, opts.Category,
		requiredFiles, optionalFiles,
		"```", strings.ReplaceAll(name, "-", " "), "```",
		strings.ReplaceAll(name, "-", " "),
		"```", "```",
		"```yaml", "```",
		"```yaml", "```",
		"```", "```",
		"```", name, opts.OutputFormat, "```",
		"`", "`",
		"```bash", name, "```",
		"```bash", "```",
		"```", "```",
		"`", "`",
		time.Now().Format("2006-01-02"))
}

// generateSchema creates the schema.json content
func generateSchema(name string, opts ScaffoldOptions) string {
	titleName := strings.Title(strings.ReplaceAll(name, "-", " "))
	snakeName := strings.ReplaceAll(name, "-", "_")

	return fmt.Sprintf(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://emergent.build/schemas/outputs/%s.schema.json",
  "title": "%s",
  "description": "Schema for %s generator output",
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
          "format": "date-time",
          "description": "ISO 8601 timestamp of generation"
        },
        "generator": {
          "type": "string",
          "const": "%s",
          "description": "Generator that created this output"
        },
        "generator_version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$",
          "description": "Version of the generator"
        },
        "source_instance": {
          "type": "string",
          "description": "EPF instance this was generated from"
        },
        "source_files": {
          "type": "array",
          "description": "Source files used for generation",
          "items": {
            "type": "string"
          }
        }
      }
    },
    
    "content": {
      "type": "object",
      "description": "The generated content",
      "properties": {
        "title": {
          "type": "string",
          "description": "Title of the generated document"
        },
        "sections": {
          "type": "array",
          "description": "Document sections",
          "items": {
            "type": "object",
            "properties": {
              "heading": {
                "type": "string"
              },
              "content": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  
  "additionalProperties": false
}
`, snakeName, titleName, name, name)
}

// generateValidator creates the validator.sh content
func generateValidator(name string, opts ScaffoldOptions) string {
	return fmt.Sprintf(`#!/bin/bash
# Validator script for %s generator output
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

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/schema.json"

# Check if schema exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Warning: Schema file not found at $SCHEMA_FILE"
    echo "Skipping schema validation"
else
    # Try to validate with ajv if available
    if command -v ajv &> /dev/null; then
        echo "Running JSON schema validation..."
        ajv validate -s "$SCHEMA_FILE" -d "$OUTPUT_FILE" && echo "✓ Schema validation passed"
    else
        echo "Note: Install ajv-cli for JSON schema validation: npm install -g ajv-cli"
    fi
fi

# Custom validation rules
echo ""
echo "Running custom validation rules..."

ERRORS=0

# TODO: Add your custom validation rules here
# Example rules:

# Check file is not empty
if [ ! -s "$OUTPUT_FILE" ]; then
    echo "✗ Error: Output file is empty"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ File is not empty"
fi

# Check for required sections (customize for your output)
# Example:
# if ! grep -q "## Overview" "$OUTPUT_FILE"; then
#     echo "✗ Error: Missing required section: Overview"
#     ERRORS=$((ERRORS + 1))
# fi

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

// generateReadme creates the README.md content
func generateReadme(name string, opts ScaffoldOptions) string {
	titleName := strings.Title(strings.ReplaceAll(name, "-", " "))

	description := opts.Description
	if description == "" {
		description = fmt.Sprintf("Custom %s generator for EPF instances", name)
	}

	return fmt.Sprintf(`# %s Generator

%s

## Files

| File | Purpose |
|------|---------|
| %sgenerator.yaml%s | Manifest for epf-cli discovery |
| %swizard.instructions.md%s | AI instructions for generating output |
| %sschema.json%s | JSON Schema for output validation |
| %svalidator.sh%s | Validation script |

## Usage

### Via AI Assistant

%s
"Generate a %s for [product-name]"
%s

### Via CLI

%s
# Check prerequisites
epf-cli generators check %s --instance <path>

# View wizard instructions
epf-cli generators show %s --wizard
%s

## Category

**%s** - %s

## Requirements

### Required Artifacts
%s

### Optional Artifacts
%s

## Output Format

**%s**

---

*Generated by epf-cli generators scaffold*
`, titleName, description,
		"`", "`", "`", "`", "`", "`", "`", "`",
		"```", strings.ReplaceAll(name, "-", " "), "```",
		"```bash", name, name, "```",
		opts.Category, getCategoryDescription(opts.Category),
		formatArtifactList(opts.RequiredArtifacts),
		formatArtifactList(opts.OptionalArtifacts),
		opts.OutputFormat)
}

// getCategoryDescription returns a description for a category
func getCategoryDescription(cat GeneratorCategory) string {
	switch cat {
	case CategoryCompliance:
		return "Generates compliance and regulatory documents"
	case CategoryMarketing:
		return "Generates marketing and external communications"
	case CategoryInvestor:
		return "Generates investor-facing materials"
	case CategoryInternal:
		return "Generates internal team documentation"
	case CategoryDevelopment:
		return "Generates development-focused outputs"
	case CategoryCustom:
		return "Custom generator for specific needs"
	default:
		return "Custom generator"
	}
}

// formatArtifactList formats a list of artifacts for README
func formatArtifactList(artifacts []string) string {
	if len(artifacts) == 0 {
		return "- None specified"
	}

	result := ""
	for _, art := range artifacts {
		result += fmt.Sprintf("- `%s`\n", art)
	}
	return result
}
