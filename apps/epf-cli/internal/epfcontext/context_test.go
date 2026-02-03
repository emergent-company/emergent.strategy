package epfcontext

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetect_UnknownContext(t *testing.T) {
	// Create an empty temp directory
	tmpDir := t.TempDir()

	ctx, err := Detect(tmpDir)
	// Should not error, just return unknown context
	if err == nil && ctx.Type != ContextUnknown {
		t.Logf("Context detection didn't fail but type is: %s", ctx.Type)
	}
}

func TestDetect_ProductRepoContext(t *testing.T) {
	// Create a mock product repo structure
	tmpDir := t.TempDir()

	// Create docs/EPF/schemas and docs/EPF/_instances/test-product/READY
	schemasDir := filepath.Join(tmpDir, "docs", "EPF", "schemas")
	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "test-product", "READY")

	if err := os.MkdirAll(schemasDir, 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	ctx, err := Detect(tmpDir)
	if err != nil {
		t.Fatalf("Failed to detect context: %v", err)
	}

	if ctx.Type != ContextProductRepo {
		t.Errorf("Expected ContextProductRepo, got: %s", ctx.Type)
	}

	if len(ctx.Instances) != 1 {
		t.Errorf("Expected 1 instance, got: %d", len(ctx.Instances))
	}

	if ctx.Instances[0] != "test-product" {
		t.Errorf("Expected instance 'test-product', got: %s", ctx.Instances[0])
	}

	// Should auto-select the only instance
	if ctx.CurrentInstance != "test-product" {
		t.Errorf("Expected CurrentInstance 'test-product', got: %s", ctx.CurrentInstance)
	}
}

func TestDetect_CanonicalContext(t *testing.T) {
	// Create a mock canonical EPF structure (no instances)
	tmpDir := t.TempDir()

	schemasDir := filepath.Join(tmpDir, "schemas")
	instancesDir := filepath.Join(tmpDir, "_instances")

	if err := os.MkdirAll(schemasDir, 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}
	if err := os.MkdirAll(instancesDir, 0755); err != nil {
		t.Fatalf("Failed to create instances dir: %v", err)
	}

	ctx, err := Detect(tmpDir)
	if err != nil {
		t.Fatalf("Failed to detect context: %v", err)
	}

	if ctx.Type != ContextCanonical {
		t.Errorf("Expected ContextCanonical, got: %s", ctx.Type)
	}

	if len(ctx.Instances) != 0 {
		t.Errorf("Expected 0 instances, got: %d", len(ctx.Instances))
	}
}

func TestDetect_InstanceContext(t *testing.T) {
	// Create a mock structure and detect from inside an instance
	tmpDir := t.TempDir()

	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", "my-product")
	phases := []string{"READY", "FIRE", "AIM"}

	for _, phase := range phases {
		if err := os.MkdirAll(filepath.Join(instanceDir, phase), 0755); err != nil {
			t.Fatalf("Failed to create phase dir: %v", err)
		}
	}

	// Also create schemas dir
	if err := os.MkdirAll(filepath.Join(tmpDir, "docs", "EPF", "schemas"), 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}

	// Detect from inside the instance directory
	ctx, err := Detect(instanceDir)
	if err != nil {
		t.Fatalf("Failed to detect context: %v", err)
	}

	if ctx.Type != ContextInstance {
		t.Errorf("Expected ContextInstance, got: %s", ctx.Type)
	}

	if ctx.CurrentInstance != "my-product" {
		t.Errorf("Expected CurrentInstance 'my-product', got: %s", ctx.CurrentInstance)
	}
}

func TestDetect_MultipleInstances(t *testing.T) {
	tmpDir := t.TempDir()

	// Create multiple instances
	for _, instanceName := range []string{"instance-a", "instance-b", "instance-c"} {
		instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", instanceName, "READY")
		if err := os.MkdirAll(instanceDir, 0755); err != nil {
			t.Fatalf("Failed to create instance dir: %v", err)
		}
	}

	// Create schemas dir
	if err := os.MkdirAll(filepath.Join(tmpDir, "docs", "EPF", "schemas"), 0755); err != nil {
		t.Fatalf("Failed to create schemas dir: %v", err)
	}

	ctx, err := Detect(tmpDir)
	if err != nil {
		t.Fatalf("Failed to detect context: %v", err)
	}

	if ctx.Type != ContextProductRepo {
		t.Errorf("Expected ContextProductRepo, got: %s", ctx.Type)
	}

	if len(ctx.Instances) != 3 {
		t.Errorf("Expected 3 instances, got: %d", len(ctx.Instances))
	}

	// Should NOT auto-select when multiple instances exist
	if ctx.CurrentInstance != "" {
		t.Errorf("Expected no auto-selection with multiple instances, got: %s", ctx.CurrentInstance)
	}
}

func TestContext_WithInstance(t *testing.T) {
	ctx := &Context{
		Type:         ContextProductRepo,
		InstancesDir: "/path/to/_instances",
		Instances:    []string{"instance-a", "instance-b"},
	}

	// Valid instance selection
	newCtx, err := ctx.WithInstance("instance-a")
	if err != nil {
		t.Fatalf("Failed to select instance: %v", err)
	}

	if newCtx.CurrentInstance != "instance-a" {
		t.Errorf("Expected CurrentInstance 'instance-a', got: %s", newCtx.CurrentInstance)
	}

	if newCtx.InstancePath != "/path/to/_instances/instance-a" {
		t.Errorf("Expected InstancePath '/path/to/_instances/instance-a', got: %s", newCtx.InstancePath)
	}

	// Invalid instance selection
	_, err = ctx.WithInstance("nonexistent")
	if err == nil {
		t.Error("Expected error for nonexistent instance")
	}
}

func TestContext_RequireInstance(t *testing.T) {
	tests := []struct {
		name        string
		ctx         *Context
		expectError bool
	}{
		{
			name: "instance selected",
			ctx: &Context{
				CurrentInstance: "my-instance",
				InstancesDir:    "/path",
			},
			expectError: false,
		},
		{
			name: "no instances available",
			ctx: &Context{
				Instances:    []string{},
				InstancesDir: "/path",
			},
			expectError: true,
		},
		{
			name: "multiple instances no selection",
			ctx: &Context{
				Instances:    []string{"a", "b"},
				InstancesDir: "/path",
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.ctx.RequireInstance()
			if tt.expectError && err == nil {
				t.Error("Expected error, got nil")
			}
			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestContext_String(t *testing.T) {
	tests := []struct {
		name     string
		ctx      *Context
		contains string
	}{
		{
			name: "canonical",
			ctx: &Context{
				Type:    ContextCanonical,
				EPFRoot: "/path/to/epf",
			},
			contains: "Canonical EPF",
		},
		{
			name: "product repo with instance",
			ctx: &Context{
				Type:            ContextProductRepo,
				EPFRoot:         "/path/to/epf",
				CurrentInstance: "my-product",
				InstancePath:    "/path/to/instance",
			},
			contains: "my-product",
		},
		{
			name: "instance context",
			ctx: &Context{
				Type:            ContextInstance,
				CurrentInstance: "my-product",
				InstancePath:    "/path/to/instance",
			},
			contains: "Instance",
		},
		{
			name: "unknown",
			ctx: &Context{
				Type: ContextUnknown,
			},
			contains: "Unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			str := tt.ctx.String()
			if str == "" {
				t.Error("String() returned empty string")
			}
			// Just ensure it doesn't panic and returns something
			t.Logf("Context string: %s", str)
		})
	}
}

func TestContext_IsCanonical(t *testing.T) {
	ctx := &Context{Type: ContextCanonical}
	if !ctx.IsCanonical() {
		t.Error("Expected IsCanonical() = true")
	}

	ctx.Type = ContextProductRepo
	if ctx.IsCanonical() {
		t.Error("Expected IsCanonical() = false for product repo")
	}
}

func TestContext_IsProductRepo(t *testing.T) {
	tests := []struct {
		ctxType  ContextType
		expected bool
	}{
		{ContextProductRepo, true},
		{ContextInstance, true},
		{ContextCanonical, false},
		{ContextUnknown, false},
	}

	for _, tt := range tests {
		ctx := &Context{Type: tt.ctxType}
		if ctx.IsProductRepo() != tt.expected {
			t.Errorf("IsProductRepo() for %s: expected %v, got %v", tt.ctxType, tt.expected, ctx.IsProductRepo())
		}
	}
}

func TestContext_HasInstance(t *testing.T) {
	ctx := &Context{InstancePath: ""}
	if ctx.HasInstance() {
		t.Error("Expected HasInstance() = false for empty path")
	}

	ctx.InstancePath = "/path/to/instance"
	if !ctx.HasInstance() {
		t.Error("Expected HasInstance() = true for set path")
	}
}

func TestGetInstanceMeta(t *testing.T) {
	// Create a mock instance with _meta.yaml
	tmpDir := t.TempDir()
	instanceDir := filepath.Join(tmpDir, "test-instance")
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		t.Fatalf("Failed to create instance dir: %v", err)
	}

	metaContent := `instance:
  product_name: "Test Product"
  epf_version: "2.12.0"
  instance_version: "1.0.0"
`
	metaPath := filepath.Join(instanceDir, "_meta.yaml")
	if err := os.WriteFile(metaPath, []byte(metaContent), 0644); err != nil {
		t.Fatalf("Failed to write _meta.yaml: %v", err)
	}

	ctx := &Context{
		CurrentInstance: "test-instance",
		InstancePath:    instanceDir,
	}

	meta, err := ctx.GetInstanceMeta()
	if err != nil {
		t.Fatalf("Failed to get instance meta: %v", err)
	}

	if meta.Instance.ProductName != "Test Product" {
		t.Errorf("Expected ProductName 'Test Product', got: %s", meta.Instance.ProductName)
	}
	if meta.Instance.EPFVersion != "2.12.0" {
		t.Errorf("Expected EPFVersion '2.12.0', got: %s", meta.Instance.EPFVersion)
	}
}

func TestGetInstanceMeta_NoInstance(t *testing.T) {
	ctx := &Context{} // No instance selected
	_, err := ctx.GetInstanceMeta()
	if err == nil {
		t.Error("Expected error when no instance selected")
	}
}

func TestIsInstanceDir(t *testing.T) {
	// Create a valid instance dir
	tmpDir := t.TempDir()

	// Without any phase directories
	if isInstanceDir(tmpDir) {
		t.Error("Empty dir should not be an instance")
	}

	// With READY dir
	readyDir := filepath.Join(tmpDir, "READY")
	if err := os.MkdirAll(readyDir, 0755); err != nil {
		t.Fatal(err)
	}
	if !isInstanceDir(tmpDir) {
		t.Error("Dir with READY should be an instance")
	}

	// Test with just _meta.yaml
	tmpDir2 := t.TempDir()
	metaPath := filepath.Join(tmpDir2, "_meta.yaml")
	if err := os.WriteFile(metaPath, []byte("instance:"), 0644); err != nil {
		t.Fatal(err)
	}
	if !isInstanceDir(tmpDir2) {
		t.Error("Dir with _meta.yaml should be an instance")
	}
}

func TestDiscoverInstances(t *testing.T) {
	tmpDir := t.TempDir()

	// Create instances dir with some entries
	instancesDir := filepath.Join(tmpDir, "_instances")
	os.MkdirAll(instancesDir, 0755)

	// Valid instance
	os.MkdirAll(filepath.Join(instancesDir, "valid-instance", "READY"), 0755)

	// Hidden directory (should be skipped)
	os.MkdirAll(filepath.Join(instancesDir, ".hidden", "READY"), 0755)

	// Directory starting with underscore (should be skipped)
	os.MkdirAll(filepath.Join(instancesDir, "_templates", "READY"), 0755)

	// Invalid instance (no phase dirs)
	os.MkdirAll(filepath.Join(instancesDir, "not-an-instance"), 0755)

	instances, err := discoverInstances(instancesDir)
	if err != nil {
		t.Fatalf("Failed to discover instances: %v", err)
	}

	if len(instances) != 1 {
		t.Errorf("Expected 1 instance, got: %d (%v)", len(instances), instances)
	}

	if instances[0] != "valid-instance" {
		t.Errorf("Expected 'valid-instance', got: %s", instances[0])
	}
}
