package valuemodel

import (
	"context"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/compute"
)

func TestPreviewHandler(t *testing.T) {
	handler, err := NewPreviewHandler()
	if err != nil {
		t.Fatalf("Failed to create handler: %v", err)
	}

	if handler.Name() != "value-model-preview" {
		t.Errorf("Name = %q, want %q", handler.Name(), "value-model-preview")
	}

	// Test with the real emergent instance (5 levels up from compute/valuemodel/)
	instancePath := "../../../../../docs/EPF/_instances/emergent"
	input := &compute.ExecutionInput{
		InstancePath: instancePath,
		Parameters: map[string]interface{}{
			"track": "Product",
			"theme": "dark",
			"title": "Test Product Value Model",
		},
	}

	result, err := handler.Execute(context.Background(), input)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if !result.Success {
		t.Fatalf("Execute returned failure: %s", result.Error)
	}

	if result.Output == nil {
		t.Fatal("Output is nil")
	}

	if result.Output.Format != "html" {
		t.Errorf("Format = %q, want %q", result.Output.Format, "html")
	}

	content, ok := result.Output.Content.(string)
	if !ok {
		t.Fatal("Content is not a string")
	}

	// Validator checks
	if !strings.Contains(content, "<!DOCTYPE html>") {
		t.Error("Missing DOCTYPE")
	}
	if !strings.Contains(content, `data-theme="dark"`) {
		t.Error("Missing dark theme attribute")
	}
	if !strings.Contains(content, "Test Product Value Model") {
		t.Error("Missing custom title")
	}
	if !strings.Contains(content, `<header class="header">`) {
		t.Error("Missing header section")
	}
	if !strings.Contains(content, `<section class="layer"`) {
		t.Error("Missing layer sections")
	}
	if !strings.Contains(content, `<footer class="footer">`) {
		t.Error("Missing footer")
	}
	if !strings.Contains(content, "<style>") {
		t.Error("Missing embedded styles")
	}
	if !strings.Contains(content, ":root {") {
		t.Error("Missing CSS custom properties")
	}
	if !strings.Contains(content, `[data-theme="dark"]`) {
		t.Error("Missing dark theme CSS")
	}

	// Check no unreplaced template variables
	if strings.Contains(content, "{{") {
		t.Error("Found unreplaced template variables")
	}

	// Check execution log
	if result.Log == nil {
		t.Error("Execution log is nil")
	} else {
		if result.Log.Skill != "value-model-preview" {
			t.Errorf("Log.Skill = %q, want %q", result.Log.Skill, "value-model-preview")
		}
		if len(result.Log.Steps) != 3 {
			t.Errorf("Expected 3 steps, got %d", len(result.Log.Steps))
		}
		for _, step := range result.Log.Steps {
			if step.Status != "success" {
				t.Errorf("Step %q status = %q, want success", step.Name, step.Status)
			}
		}
	}

	// Check file size reasonable (validator checks 10KB-500KB)
	if len(content) < 10000 {
		t.Errorf("Content too small: %d bytes (expected >10KB)", len(content))
	}
	if len(content) > 500000 {
		t.Errorf("Content too large: %d bytes (expected <500KB)", len(content))
	}

	t.Logf("Generated HTML: %d bytes, %d layer sections", len(content), strings.Count(content, `<section class="layer"`))
}

func TestPreviewHandlerMissingTrack(t *testing.T) {
	handler, err := NewPreviewHandler()
	if err != nil {
		t.Fatalf("Failed to create handler: %v", err)
	}

	input := &compute.ExecutionInput{
		InstancePath: "../../../../../docs/EPF/_instances/emergent",
		Parameters: map[string]interface{}{
			"track": "NonExistentTrack",
		},
	}

	result, err := handler.Execute(context.Background(), input)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if result.Success {
		t.Error("Expected failure for non-existent track")
	}
	if !strings.Contains(result.Error, "not found") {
		t.Errorf("Error should mention 'not found', got: %s", result.Error)
	}
}
