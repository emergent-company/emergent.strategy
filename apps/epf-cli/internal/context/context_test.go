package context

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadInstanceContext_FromMetaYAML(t *testing.T) {
	// Create temp directory structure
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "test-product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create _meta.yaml with product info
	metaContent := `instance:
  product_name: Test Product
  description: A test product for validation
  domain: testing
`
	metaPath := filepath.Join(instanceDir, "_meta.yaml")
	if err := os.WriteFile(metaPath, []byte(metaContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Load context
	ctx := LoadInstanceContext(instanceDir)

	// Verify
	if ctx.ProductName != "Test Product" {
		t.Errorf("Expected ProductName 'Test Product', got '%s'", ctx.ProductName)
	}
	if ctx.Description != "A test product for validation" {
		t.Errorf("Expected Description 'A test product for validation', got '%s'", ctx.Description)
	}
	if ctx.Domain != "testing" {
		t.Errorf("Expected Domain 'testing', got '%s'", ctx.Domain)
	}
	if len(ctx.SourceFiles) != 1 {
		t.Errorf("Expected 1 source file, got %d", len(ctx.SourceFiles))
	} else if !strings.Contains(ctx.SourceFiles[0], "_meta.yaml") {
		t.Errorf("Expected SourceFiles to contain '_meta.yaml', got %v", ctx.SourceFiles)
	}
}

func TestLoadInstanceContext_FromREADME(t *testing.T) {
	// Create temp directory structure (NO _meta.yaml)
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "readme-product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create README.md with title and description
	readmeContent := `# Project Roadmap

A comprehensive roadmap management system for tracking product initiatives.

This is a detailed description with multiple paragraphs.
`
	readmePath := filepath.Join(instanceDir, "README.md")
	if err := os.WriteFile(readmePath, []byte(readmeContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Load context
	ctx := LoadInstanceContext(instanceDir)

	// Verify - should extract from README
	if ctx.ProductName != "Project Roadmap" {
		t.Errorf("Expected ProductName 'Project Roadmap', got '%s'", ctx.ProductName)
	}
	if ctx.Description != "A comprehensive roadmap management system for tracking product initiatives." {
		t.Errorf("Expected first paragraph as description, got '%s'", ctx.Description)
	}
	if len(ctx.SourceFiles) != 1 {
		t.Errorf("Expected 1 source file, got %d", len(ctx.SourceFiles))
	} else if !strings.Contains(ctx.SourceFiles[0], "README.md") {
		t.Errorf("Expected SourceFiles to contain 'README.md', got %v", ctx.SourceFiles)
	}
}

func TestLoadInstanceContext_FromDirectoryName(t *testing.T) {
	// Create temp directory (NO _meta.yaml, NO README.md)
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "my-awesome-product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Load context
	ctx := LoadInstanceContext(instanceDir)

	// Verify - should use directory name
	if ctx.ProductName != "My Awesome Product" {
		t.Errorf("Expected ProductName 'My Awesome Product' (title case), got '%s'", ctx.ProductName)
	}
	if ctx.Description != "" {
		t.Errorf("Expected empty Description, got '%s'", ctx.Description)
	}
	if len(ctx.SourceFiles) != 1 {
		t.Errorf("Expected 1 source file, got %d", len(ctx.SourceFiles))
	} else if !strings.Contains(ctx.SourceFiles[0], "(inferred from directory:") {
		t.Errorf("Expected SourceFiles to contain inferred message, got %v", ctx.SourceFiles)
	}
}

func TestLoadInstanceContext_InvalidDirectory(t *testing.T) {
	// Try to load from non-existent directory
	ctx := LoadInstanceContext("/this/does/not/exist/at/all")

	// Should still return context (graceful degradation)
	// It will infer from the directory name "all"
	if ctx == nil {
		t.Fatal("Expected non-nil context even for non-existent directory")
	}
	if !ctx.Found {
		t.Error("Expected Found=true since context was inferred from directory")
	}
	if ctx.ProductName != "All" {
		t.Errorf("Expected ProductName 'All' (from 'all' in path), got '%s'", ctx.ProductName)
	}
}

func TestLoadInstanceContext_EmptyDirectory(t *testing.T) {
	// Create completely empty directory
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "empty-product")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Load context - should use directory name as fallback
	ctx := LoadInstanceContext(instanceDir)

	if ctx.ProductName != "Empty Product" {
		t.Errorf("Expected ProductName 'Empty Product' (title case), got '%s'", ctx.ProductName)
	}
}

func TestGetKeywords_Basic(t *testing.T) {
	ctx := &InstanceContext{
		ProductName: "Roadmap Manager",
		Description: "A project management tool for tracking roadmaps and initiatives",
		Domain:      "project-management",
		Found:       true, // IMPORTANT: GetKeywords checks this
	}

	keywords := ctx.GetKeywords()

	// Should contain normalized versions
	expected := []string{"roadmap", "manager", "project", "management", "tool", "tracking", "initiatives"}
	for _, exp := range expected {
		found := false
		for _, kw := range keywords {
			if kw == exp {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected keyword '%s' not found in %v", exp, keywords)
		}
	}
}

func TestGetKeywords_Normalization(t *testing.T) {
	ctx := &InstanceContext{
		ProductName: "API-Gateway",
		Description: "HTTP/REST gateway with WebSocket support",
		Found:       true, // IMPORTANT: GetKeywords checks this
	}

	keywords := ctx.GetKeywords()

	// Should normalize: lowercase, split on special chars
	expectedPresent := []string{"api", "gateway", "http", "rest", "websocket", "support"}
	for _, exp := range expectedPresent {
		found := false
		for _, kw := range keywords {
			if kw == exp {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected normalized keyword '%s' not found in %v", exp, keywords)
		}
	}

	// Should NOT contain stop words
	stopWords := []string{"with", "a", "the"}
	for _, stop := range stopWords {
		for _, kw := range keywords {
			if kw == stop {
				t.Errorf("Stop word '%s' should not be in keywords: %v", stop, keywords)
			}
		}
	}
}

func TestGetKeywords_Empty(t *testing.T) {
	ctx := &InstanceContext{
		ProductName: "",
		Description: "",
	}

	keywords := ctx.GetKeywords()

	// Should return empty slice, not nil
	if keywords == nil {
		t.Error("GetKeywords should return empty slice, not nil")
	}
	if len(keywords) != 0 {
		t.Errorf("Expected empty keywords, got %v", keywords)
	}
}

func TestLoadInstanceContext_MetaPrecedence(t *testing.T) {
	// Create directory with BOTH _meta.yaml AND README.md
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "precedence-test")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create _meta.yaml
	metaContent := `instance:
  product_name: Meta Product
  description: From meta file
`
	if err := os.WriteFile(filepath.Join(instanceDir, "_meta.yaml"), []byte(metaContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create README.md
	readmeContent := `# README Product

From readme file.
`
	if err := os.WriteFile(filepath.Join(instanceDir, "README.md"), []byte(readmeContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Load context
	ctx := LoadInstanceContext(instanceDir)

	// Should prefer _meta.yaml over README.md
	if ctx.ProductName != "Meta Product" {
		t.Errorf("Expected _meta.yaml to take precedence, got ProductName '%s'", ctx.ProductName)
	}
	if ctx.Description != "From meta file" {
		t.Errorf("Expected _meta.yaml to take precedence, got Description '%s'", ctx.Description)
	}
	if len(ctx.SourceFiles) < 1 {
		t.Error("Expected at least one source file")
	} else if !strings.Contains(ctx.SourceFiles[0], "_meta.yaml") {
		t.Errorf("Expected _meta.yaml as source, got %v", ctx.SourceFiles)
	}
}

func TestLoadInstanceContext_MalformedMeta(t *testing.T) {
	// Create directory with invalid YAML in _meta.yaml
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "malformed-test")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create malformed _meta.yaml
	metaContent := `name: "Unclosed quote
description: this is broken
	bad indentation
`
	if err := os.WriteFile(filepath.Join(instanceDir, "_meta.yaml"), []byte(metaContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create valid README.md as fallback
	readmeContent := `# Fallback Product

Should use this instead.
`
	if err := os.WriteFile(filepath.Join(instanceDir, "README.md"), []byte(readmeContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Load context - should gracefully fall back to README
	ctx := LoadInstanceContext(instanceDir)

	// Should have fallen back to README
	if ctx.ProductName != "Fallback Product" {
		t.Errorf("Expected fallback to README.md, got ProductName '%s'", ctx.ProductName)
	}
	if len(ctx.SourceFiles) < 1 {
		t.Error("Expected at least one source file")
	} else if !strings.Contains(ctx.SourceFiles[0], "README.md") {
		t.Errorf("Expected README.md as source after meta parse error, got %v", ctx.SourceFiles)
	}
}
