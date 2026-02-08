package anchor

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNew(t *testing.T) {
	anchor := New()

	if !anchor.EPFAnchor {
		t.Error("EPFAnchor should be true")
	}

	if anchor.Version != CurrentVersion {
		t.Errorf("Version should be %s, got %s", CurrentVersion, anchor.Version)
	}

	if anchor.InstanceID == "" {
		t.Error("InstanceID should be generated")
	}

	if anchor.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}

	if anchor.Structure == nil || anchor.Structure.Type != "phased" {
		t.Error("Structure should default to phased")
	}
}

func TestNewWithOptions(t *testing.T) {
	anchor := NewWithOptions("TestProduct", "Test Description", "2.11.0")

	if anchor.ProductName != "TestProduct" {
		t.Errorf("ProductName should be TestProduct, got %s", anchor.ProductName)
	}

	if anchor.Description != "Test Description" {
		t.Errorf("Description should be Test Description, got %s", anchor.Description)
	}

	if anchor.EPFVersion != "2.11.0" {
		t.Errorf("EPFVersion should be 2.11.0, got %s", anchor.EPFVersion)
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name           string
		anchor         *Anchor
		expectValid    bool
		expectErrors   int
		expectWarnings int
	}{
		{
			name:        "valid anchor",
			anchor:      New(),
			expectValid: true,
			// Warnings for missing product_name and epf_version
			expectWarnings: 2,
		},
		{
			name: "missing epf_anchor",
			anchor: &Anchor{
				Version:    "1.0.0",
				InstanceID: "test-id",
				CreatedAt:  time.Now(),
			},
			expectValid:    false,
			expectErrors:   1,
			expectWarnings: 2, // Still gets warnings for missing optional fields
		},
		{
			name: "missing version",
			anchor: &Anchor{
				EPFAnchor:  true,
				InstanceID: "test-id",
				CreatedAt:  time.Now(),
			},
			expectValid:    false,
			expectErrors:   1,
			expectWarnings: 2,
		},
		{
			name: "missing instance_id",
			anchor: &Anchor{
				EPFAnchor: true,
				Version:   "1.0.0",
				CreatedAt: time.Now(),
			},
			expectValid:    false,
			expectErrors:   1,
			expectWarnings: 2,
		},
		{
			name: "missing created_at",
			anchor: &Anchor{
				EPFAnchor:  true,
				Version:    "1.0.0",
				InstanceID: "test-id",
			},
			expectValid:    false,
			expectErrors:   1,
			expectWarnings: 2,
		},
		{
			name:           "fully populated anchor",
			anchor:         NewWithOptions("TestProduct", "Test Description", "2.11.0"),
			expectValid:    true,
			expectErrors:   0,
			expectWarnings: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Validate(tt.anchor)

			if result.Valid != tt.expectValid {
				t.Errorf("Expected valid=%v, got valid=%v", tt.expectValid, result.Valid)
			}

			if len(result.Errors) != tt.expectErrors {
				t.Errorf("Expected %d errors, got %d: %v", tt.expectErrors, len(result.Errors), result.Errors)
			}

			if len(result.Warnings) != tt.expectWarnings {
				t.Errorf("Expected %d warnings, got %d: %v", tt.expectWarnings, len(result.Warnings), result.Warnings)
			}
		})
	}
}

func TestSaveAndLoad(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-anchor-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create and save anchor
	anchor := NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := anchor.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	// Verify file exists
	anchorPath := filepath.Join(tmpDir, AnchorFileName)
	if _, err := os.Stat(anchorPath); err != nil {
		t.Fatalf("Anchor file not created: %v", err)
	}

	// Load and verify
	loaded, err := Load(tmpDir)
	if err != nil {
		t.Fatalf("Failed to load anchor: %v", err)
	}

	if loaded.ProductName != anchor.ProductName {
		t.Errorf("ProductName mismatch: expected %s, got %s", anchor.ProductName, loaded.ProductName)
	}

	if loaded.InstanceID != anchor.InstanceID {
		t.Errorf("InstanceID mismatch: expected %s, got %s", anchor.InstanceID, loaded.InstanceID)
	}

	if loaded.EPFVersion != anchor.EPFVersion {
		t.Errorf("EPFVersion mismatch: expected %s, got %s", anchor.EPFVersion, loaded.EPFVersion)
	}
}

func TestExists(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-anchor-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Should not exist initially
	if Exists(tmpDir) {
		t.Error("Anchor should not exist initially")
	}

	// Create anchor
	anchor := New()
	if err := anchor.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	// Should exist now
	if !Exists(tmpDir) {
		t.Error("Anchor should exist after save")
	}
}

func TestIsLegacyInstance(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-legacy-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Empty dir is not legacy
	if IsLegacyInstance(tmpDir) {
		t.Error("Empty dir should not be legacy instance")
	}

	// Create EPF markers
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	// Should be legacy now (has markers but no anchor)
	if !IsLegacyInstance(tmpDir) {
		t.Error("Dir with READY/FIRE but no anchor should be legacy")
	}

	// Add anchor
	anchor := New()
	if err := anchor.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	// Should not be legacy now
	if IsLegacyInstance(tmpDir) {
		t.Error("Dir with anchor should not be legacy")
	}
}

func TestInferFromLegacy(t *testing.T) {
	// Create temp directory with legacy structure
	tmpDir, err := os.MkdirTemp("", "epf-infer-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create phase directories
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)

	// Create _meta.yaml with instance format
	metaContent := `instance:
  product_name: 'TestProduct'
  epf_version: '2.11.0'
  description: 'Test Description'
`
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(metaContent), 0644)

	// Infer anchor
	anchor, err := InferFromLegacy(tmpDir)
	if err != nil {
		t.Fatalf("Failed to infer anchor: %v", err)
	}

	if anchor.ProductName != "TestProduct" {
		t.Errorf("Expected ProductName 'TestProduct', got '%s'", anchor.ProductName)
	}

	if anchor.EPFVersion != "2.11.0" {
		t.Errorf("Expected EPFVersion '2.11.0', got '%s'", anchor.EPFVersion)
	}

	if anchor.Structure.Type != "phased" {
		t.Errorf("Expected structure type 'phased', got '%s'", anchor.Structure.Type)
	}
}

func TestValidateFile(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-validate-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Save valid anchor
	anchor := NewWithOptions("TestProduct", "Test Description", "2.11.0")
	if err := anchor.Save(tmpDir); err != nil {
		t.Fatalf("Failed to save anchor: %v", err)
	}

	// Validate
	result := ValidateFile(tmpDir)
	if !result.Valid {
		t.Errorf("Valid anchor should pass validation: %v", result.Errors)
	}

	// Test invalid path
	result = ValidateFile("/nonexistent/path")
	if result.Valid {
		t.Error("Nonexistent path should fail validation")
	}
}

func TestToYAML(t *testing.T) {
	anchor := NewWithOptions("TestProduct", "Test Description", "2.11.0")
	yaml, err := anchor.ToYAML()
	if err != nil {
		t.Fatalf("ToYAML failed: %v", err)
	}

	if yaml == "" {
		t.Error("ToYAML should return non-empty string")
	}

	// Check that key fields are in output
	if !contains(yaml, "epf_anchor: true") {
		t.Error("YAML should contain epf_anchor: true")
	}

	if !contains(yaml, "product_name: TestProduct") {
		t.Error("YAML should contain product_name")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
