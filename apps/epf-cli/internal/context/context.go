package context

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// InstanceContext holds product/instance information for validation guidance
type InstanceContext struct {
	ProductName string   // e.g., "Veilag"
	Description string   // e.g., "Norwegian private road cost allocation platform"
	Domain      string   // e.g., "transportation", "fintech", "saas"
	SourceFiles []string // Which files provided this context
	Found       bool     // Whether any context was successfully loaded
}

// MetaYAML represents the structure of _meta.yaml
// Note: _meta.yaml has a flat structure with fields at root level
type MetaYAML struct {
	ProductID   string `yaml:"product_id"`
	ProductName string `yaml:"product_name"`
	Description string `yaml:"description"`
	Domain      string `yaml:"domain"`
	Market      string `yaml:"market"`
	TargetUsers string `yaml:"target_users"`
	EPFVersion  string `yaml:"epf_version"`
	Status      string `yaml:"status"`
}

// LoadInstanceContext attempts to load product context from various sources
// Priority: 1) _meta.yaml, 2) README.md, 3) directory name
func LoadInstanceContext(instancePath string) *InstanceContext {
	ctx := &InstanceContext{
		SourceFiles: make([]string, 0),
		Found:       false,
	}

	// Try _meta.yaml first
	if tryLoadMetaYAML(instancePath, ctx) {
		return ctx
	}

	// Try README.md
	if tryLoadREADME(instancePath, ctx) {
		return ctx
	}

	// Fallback to directory name
	tryInferFromDirectory(instancePath, ctx)
	return ctx
}

// tryLoadMetaYAML attempts to load context from _meta.yaml
func tryLoadMetaYAML(instancePath string, ctx *InstanceContext) bool {
	// Look for _meta.yaml in instance directory
	metaPath := filepath.Join(instancePath, "_meta.yaml")
	if !fileExists(metaPath) {
		// Also try parent directory (if instancePath is like .../READY/)
		metaPath = filepath.Join(filepath.Dir(instancePath), "_meta.yaml")
		if !fileExists(metaPath) {
			return false
		}
	}

	data, err := os.ReadFile(metaPath)
	if err != nil {
		return false
	}

	var meta MetaYAML
	if err := yaml.Unmarshal(data, &meta); err != nil {
		return false
	}

	// Check if we got useful product info
	if meta.ProductName != "" {
		ctx.ProductName = meta.ProductName
		ctx.Description = meta.Description
		ctx.Domain = meta.Domain
		ctx.SourceFiles = append(ctx.SourceFiles, metaPath)
		ctx.Found = true
		return true
	}

	return false
}

// tryLoadREADME attempts to extract context from README.md
func tryLoadREADME(instancePath string, ctx *InstanceContext) bool {
	// Look for README.md in instance directory
	readmePath := filepath.Join(instancePath, "README.md")
	if !fileExists(readmePath) {
		// Also try parent directory
		readmePath = filepath.Join(filepath.Dir(instancePath), "README.md")
		if !fileExists(readmePath) {
			return false
		}
	}

	data, err := os.ReadFile(readmePath)
	if err != nil {
		return false
	}

	content := string(data)
	lines := strings.Split(content, "\n")

	// Look for markdown H1 (# Product Name)
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			productName := strings.TrimPrefix(line, "# ")
			productName = strings.TrimSpace(productName)
			if productName != "" && len(productName) < 100 {
				ctx.ProductName = productName
				ctx.SourceFiles = append(ctx.SourceFiles, readmePath)
				ctx.Found = true

				// Try to get description from next non-empty line
				for j := i + 1; j < len(lines); j++ {
					nextLine := strings.TrimSpace(lines[j])
					if nextLine != "" && !strings.HasPrefix(nextLine, "#") && len(nextLine) < 300 {
						ctx.Description = nextLine
						break
					}
				}
				return true
			}
		}
	}

	return false
}

// tryInferFromDirectory infers product name from directory structure
func tryInferFromDirectory(instancePath string, ctx *InstanceContext) {
	// Get the instance directory name (e.g., "veilag" from ".../veilag/READY/")
	dir := filepath.Base(instancePath)

	// If we're in a phase directory (READY, FIRE, AIM), go up one level
	if dir == "READY" || dir == "FIRE" || dir == "AIM" {
		dir = filepath.Base(filepath.Dir(instancePath))
	}

	// If we're in _instances, go up to product name
	if dir == "_instances" {
		// Path might be .../_instances/product-name/
		parts := strings.Split(filepath.Clean(instancePath), string(filepath.Separator))
		for i, part := range parts {
			if part == "_instances" && i+1 < len(parts) {
				dir = parts[i+1]
				break
			}
		}
	}

	// Clean up directory name for product name
	productName := strings.ReplaceAll(dir, "-", " ")
	productName = strings.ReplaceAll(productName, "_", " ")
	productName = strings.Title(productName)

	if productName != "" && productName != "." && productName != ".." {
		ctx.ProductName = productName
		ctx.SourceFiles = append(ctx.SourceFiles, fmt.Sprintf("(inferred from directory: %s)", dir))
		ctx.Found = true
	}
}

// fileExists checks if a file exists and is not a directory
func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// String returns a human-readable representation of the context
func (ctx *InstanceContext) String() string {
	if !ctx.Found {
		return "No product context found"
	}

	var parts []string
	if ctx.ProductName != "" {
		parts = append(parts, fmt.Sprintf("Name: %s", ctx.ProductName))
	}
	if ctx.Description != "" {
		parts = append(parts, fmt.Sprintf("Description: %s", ctx.Description))
	}
	if ctx.Domain != "" {
		parts = append(parts, fmt.Sprintf("Domain: %s", ctx.Domain))
	}
	if len(ctx.SourceFiles) > 0 {
		parts = append(parts, fmt.Sprintf("Source: %s", ctx.SourceFiles[0]))
	}

	return strings.Join(parts, "\n  ")
}

// GetKeywords extracts keywords from product name and description for matching
func (ctx *InstanceContext) GetKeywords() []string {
	if !ctx.Found {
		return []string{}
	}

	keywords := make([]string, 0)

	// Helper function to normalize and split text
	normalizeAndSplit := func(text string) []string {
		// Convert to lowercase
		text = strings.ToLower(text)
		// Replace special chars with spaces for splitting
		replacer := strings.NewReplacer(
			"-", " ",
			"/", " ",
			"_", " ",
			":", " ",
			",", " ",
			".", " ",
		)
		text = replacer.Replace(text)
		// Split on whitespace
		return strings.Fields(text)
	}

	// Extract from product name
	if ctx.ProductName != "" {
		words := normalizeAndSplit(ctx.ProductName)
		keywords = append(keywords, words...)
	}

	// Extract from description (first 100 chars, key words only)
	if ctx.Description != "" {
		desc := ctx.Description
		if len(desc) > 100 {
			desc = desc[:100]
		}
		words := normalizeAndSplit(desc)

		// Filter out common words
		stopWords := map[string]bool{
			"the": true, "a": true, "an": true, "and": true, "or": true,
			"but": true, "in": true, "on": true, "at": true, "to": true,
			"for": true, "of": true, "with": true, "by": true, "from": true,
			"is": true, "are": true, "was": true, "were": true, "be": true,
			"been": true, "being": true, "have": true, "has": true, "had": true,
			"do": true, "does": true, "did": true, "will": true, "would": true,
			"could": true, "should": true, "may": true, "might": true, "must": true,
		}

		for _, word := range words {
			if len(word) > 3 && !stopWords[word] {
				keywords = append(keywords, word)
			}
		}
	}

	// Extract from domain
	if ctx.Domain != "" {
		keywords = append(keywords, strings.ToLower(ctx.Domain))
	}

	return keywords
}
