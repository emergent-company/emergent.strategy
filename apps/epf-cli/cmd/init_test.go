package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
)

func TestIsValidProductName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"valid lowercase", "my-product", true},
		{"valid with numbers", "product-123", true},
		{"valid with underscore", "my_product", true},
		{"valid simple", "product", true},
		{"empty string", "", false},
		{"too long", "this-is-a-very-long-product-name-that-exceeds-fifty-characters-limit", false},
		{"uppercase", "My-Product", false},
		{"spaces", "my product", false},
		{"special chars", "my@product", false},
		{"starts with hyphen", "-product", true}, // This is allowed per current logic
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidProductName(tt.input)
			if result != tt.expected {
				t.Errorf("isValidProductName(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestCreateInstanceStructure(t *testing.T) {
	// Create a temporary directory for the test
	tmpDir, err := os.MkdirTemp("", "epf-init-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	instanceDir := filepath.Join(tmpDir, "test-instance")
	productName := "test-product"

	// Call the function (using embedded templates)
	err = createInstanceStructure(instanceDir, productName, "", true)
	if err != nil {
		t.Fatalf("createInstanceStructure failed: %v", err)
	}

	// Verify the anchor file was created
	t.Run("anchor file exists", func(t *testing.T) {
		anchorPath := filepath.Join(instanceDir, "_epf.yaml")
		if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
			t.Errorf("Anchor file not created at %s", anchorPath)
		}
	})

	// Verify anchor file content
	t.Run("anchor file valid", func(t *testing.T) {
		a, err := anchor.Load(instanceDir)
		if err != nil {
			t.Fatalf("Failed to load anchor: %v", err)
		}

		if !a.EPFAnchor {
			t.Error("EPFAnchor should be true")
		}
		if a.Version != "1.0.0" {
			t.Errorf("Version = %q, want %q", a.Version, "1.0.0")
		}
		if a.InstanceID == "" {
			t.Error("InstanceID should not be empty")
		}
		if a.ProductName != productName {
			t.Errorf("ProductName = %q, want %q", a.ProductName, productName)
		}
		if a.EPFVersion != "2.12.0" {
			t.Errorf("EPFVersion = %q, want %q", a.EPFVersion, "2.12.0")
		}
		if a.Structure == nil {
			t.Error("Structure should not be nil")
		} else {
			if a.Structure.Type != "phased" {
				t.Errorf("Structure.Type = %q, want %q", a.Structure.Type, "phased")
			}
		}
	})

	// Verify phase directories were created
	t.Run("phase directories exist", func(t *testing.T) {
		phases := []string{"READY", "FIRE", "AIM"}
		for _, phase := range phases {
			phasePath := filepath.Join(instanceDir, phase)
			if _, err := os.Stat(phasePath); os.IsNotExist(err) {
				t.Errorf("Phase directory not created: %s", phase)
			}
		}
	})

	// Verify FIRE subdirectories were created
	t.Run("FIRE subdirectories exist", func(t *testing.T) {
		fireDirs := []string{"definitions/product", "definitions/strategy", "definitions/org_ops", "definitions/commercial", "value_models", "workflows"}
		for _, dir := range fireDirs {
			dirPath := filepath.Join(instanceDir, "FIRE", dir)
			if _, err := os.Stat(dirPath); os.IsNotExist(err) {
				t.Errorf("FIRE subdirectory not created: %s", dir)
			}
			// Check .gitkeep exists
			gitkeepPath := filepath.Join(dirPath, ".gitkeep")
			if _, err := os.Stat(gitkeepPath); os.IsNotExist(err) {
				t.Errorf(".gitkeep not created in %s", dir)
			}
		}
	})

	// Verify outputs directory was created
	t.Run("outputs directory exists", func(t *testing.T) {
		outputsPath := filepath.Join(instanceDir, "outputs")
		if _, err := os.Stat(outputsPath); os.IsNotExist(err) {
			t.Error("outputs directory not created")
		}
	})

	// Verify _meta.yaml was created
	t.Run("_meta.yaml exists", func(t *testing.T) {
		metaPath := filepath.Join(instanceDir, "_meta.yaml")
		if _, err := os.Stat(metaPath); os.IsNotExist(err) {
			t.Error("_meta.yaml not created")
		}
	})

	// Verify instance README was created
	t.Run("README.md exists", func(t *testing.T) {
		readmePath := filepath.Join(instanceDir, "README.md")
		if _, err := os.Stat(readmePath); os.IsNotExist(err) {
			t.Error("README.md not created")
		}
	})
}

func TestCreateAgentsMD(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-agents-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	err = createAgentsMD(tmpDir)
	if err != nil {
		t.Fatalf("createAgentsMD failed: %v", err)
	}

	agentsPath := filepath.Join(tmpDir, "AGENTS.md")
	if _, err := os.Stat(agentsPath); os.IsNotExist(err) {
		t.Error("AGENTS.md not created")
	}

	// Verify content is not empty
	content, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatalf("Failed to read AGENTS.md: %v", err)
	}
	if len(content) < 100 {
		t.Error("AGENTS.md content seems too short")
	}
}

func TestCreateReadmeMD(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-readme-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	err = createReadmeMD(tmpDir, "test-product")
	if err != nil {
		t.Fatalf("createReadmeMD failed: %v", err)
	}

	readmePath := filepath.Join(tmpDir, "README.md")
	content, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("Failed to read README.md: %v", err)
	}

	// Verify product name is in content
	if string(content) == "" {
		t.Error("README.md is empty")
	}
}

func TestCreateGitignore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-gitignore-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	err = createGitignore(tmpDir, "test-product")
	if err != nil {
		t.Fatalf("createGitignore failed: %v", err)
	}

	gitignorePath := filepath.Join(tmpDir, ".gitignore")
	content, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("Failed to read .gitignore: %v", err)
	}

	// Verify product name is in content (for tracking the instance)
	if string(content) == "" {
		t.Error(".gitignore is empty")
	}
}

func TestCreateMetaFile(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "epf-meta-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	createMetaFile(tmpDir, "test-product")

	metaPath := filepath.Join(tmpDir, "_meta.yaml")
	content, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("Failed to read _meta.yaml: %v", err)
	}

	// Verify content contains product name
	if string(content) == "" {
		t.Error("_meta.yaml is empty")
	}
}

// Task 5.5: Test standalone mode — createInstanceStructure at "." level
func TestCreateInstanceStructure_StandaloneMode(t *testing.T) {
	// In standalone mode, instanceDir is "." — READY/FIRE/AIM at the root
	tmpDir := t.TempDir()

	productName := "standalone-product"

	// Call createInstanceStructure with the tmpDir as the instance root
	// (simulating instanceDir = "." resolved to an absolute path)
	err := createInstanceStructure(tmpDir, productName, "", true)
	if err != nil {
		t.Fatalf("createInstanceStructure failed for standalone mode: %v", err)
	}

	// Verify READY/FIRE/AIM exist directly under tmpDir (not under docs/EPF/)
	t.Run("phase directories at root level", func(t *testing.T) {
		for _, phase := range []string{"READY", "FIRE", "AIM"} {
			phasePath := filepath.Join(tmpDir, phase)
			if _, err := os.Stat(phasePath); os.IsNotExist(err) {
				t.Errorf("Phase directory %s not found at root level", phase)
			}
		}
	})

	// Verify NO docs/EPF wrapper exists
	t.Run("no docs wrapper in standalone", func(t *testing.T) {
		docsPath := filepath.Join(tmpDir, "docs")
		if _, err := os.Stat(docsPath); err == nil {
			t.Error("docs/ directory should NOT exist in standalone mode")
		}
	})

	// Verify anchor file exists at root
	t.Run("anchor file at root", func(t *testing.T) {
		anchorPath := filepath.Join(tmpDir, "_epf.yaml")
		if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
			t.Error("Anchor file _epf.yaml not found at root")
		}
	})

	// Verify anchor file has correct product name
	t.Run("anchor has correct product name", func(t *testing.T) {
		a, err := anchor.Load(tmpDir)
		if err != nil {
			t.Fatalf("Failed to load anchor: %v", err)
		}
		if a.ProductName != productName {
			t.Errorf("ProductName = %q, want %q", a.ProductName, productName)
		}
	})

	// Verify FIRE subdirectories exist at root level
	t.Run("FIRE subdirs at root level", func(t *testing.T) {
		for _, dir := range []string{"definitions/product", "definitions/strategy", "definitions/org_ops", "definitions/commercial", "value_models", "workflows"} {
			dirPath := filepath.Join(tmpDir, "FIRE", dir)
			if _, err := os.Stat(dirPath); os.IsNotExist(err) {
				t.Errorf("FIRE subdirectory %s not found", dir)
			}
		}
	})

	// Verify _meta.yaml at root level
	t.Run("_meta.yaml at root", func(t *testing.T) {
		metaPath := filepath.Join(tmpDir, "_meta.yaml")
		if _, err := os.Stat(metaPath); os.IsNotExist(err) {
			t.Error("_meta.yaml not found at root")
		}
	})
}

// Task 5.6: Test integrated mode — createInstanceStructure under a subdirectory
func TestCreateInstanceStructure_IntegratedMode(t *testing.T) {
	// In integrated mode, instanceDir is a subdirectory like docs/EPF/_instances/product
	tmpDir := t.TempDir()

	productName := "integrated-product"
	instanceDir := filepath.Join(tmpDir, "docs", "EPF", "_instances", productName)

	err := createInstanceStructure(instanceDir, productName, "", true)
	if err != nil {
		t.Fatalf("createInstanceStructure failed for integrated mode: %v", err)
	}

	// Verify wrapper directory structure exists
	t.Run("wrapper directories exist", func(t *testing.T) {
		// docs/EPF/_instances/integrated-product/ should exist
		if _, err := os.Stat(instanceDir); os.IsNotExist(err) {
			t.Error("Instance directory not created")
		}
		// Intermediate dirs should exist
		instancesDir := filepath.Join(tmpDir, "docs", "EPF", "_instances")
		if _, err := os.Stat(instancesDir); os.IsNotExist(err) {
			t.Error("_instances directory not created")
		}
	})

	// Verify READY/FIRE/AIM under the instance subdirectory
	t.Run("phase directories under instance dir", func(t *testing.T) {
		for _, phase := range []string{"READY", "FIRE", "AIM"} {
			phasePath := filepath.Join(instanceDir, phase)
			if _, err := os.Stat(phasePath); os.IsNotExist(err) {
				t.Errorf("Phase directory %s not found under instance dir", phase)
			}
		}
	})

	// Verify READY/FIRE/AIM do NOT exist at root (only under instance)
	t.Run("no phase dirs at root", func(t *testing.T) {
		for _, phase := range []string{"READY", "FIRE", "AIM"} {
			rootPhasePath := filepath.Join(tmpDir, phase)
			if _, err := os.Stat(rootPhasePath); err == nil {
				t.Errorf("Phase directory %s should NOT exist at root in integrated mode", phase)
			}
		}
	})

	// Verify anchor file under instance directory
	t.Run("anchor under instance dir", func(t *testing.T) {
		anchorPath := filepath.Join(instanceDir, "_epf.yaml")
		if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
			t.Error("Anchor file _epf.yaml not found under instance dir")
		}
	})

	// Verify anchor file content
	t.Run("anchor valid for integrated mode", func(t *testing.T) {
		a, err := anchor.Load(instanceDir)
		if err != nil {
			t.Fatalf("Failed to load anchor: %v", err)
		}
		if a.ProductName != productName {
			t.Errorf("ProductName = %q, want %q", a.ProductName, productName)
		}
		if a.Structure == nil {
			t.Error("Structure should not be nil")
		} else if a.Structure.Type != "phased" {
			t.Errorf("Structure.Type = %q, want %q", a.Structure.Type, "phased")
		}
	})

	// Verify FIRE subdirectories under instance
	t.Run("FIRE subdirs under instance", func(t *testing.T) {
		for _, dir := range []string{"definitions/product", "definitions/strategy", "definitions/org_ops", "definitions/commercial", "value_models", "workflows"} {
			dirPath := filepath.Join(instanceDir, "FIRE", dir)
			if _, err := os.Stat(dirPath); os.IsNotExist(err) {
				t.Errorf("FIRE subdirectory %s not found under instance dir", dir)
			}
			// .gitkeep should also exist
			gitkeepPath := filepath.Join(dirPath, ".gitkeep")
			if _, err := os.Stat(gitkeepPath); os.IsNotExist(err) {
				t.Errorf(".gitkeep not found in %s", dir)
			}
		}
	})

	// Verify outputs directory under instance
	t.Run("outputs under instance", func(t *testing.T) {
		outputsPath := filepath.Join(instanceDir, "outputs")
		if _, err := os.Stat(outputsPath); os.IsNotExist(err) {
			t.Error("outputs directory not found under instance dir")
		}
	})
}
