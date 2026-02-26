package lsp

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	protocol "github.com/tliron/glsp/protocol_3_16"
)

// testdataPath returns the absolute path to a file relative to the repo root (apps/epf-cli/).
// This works regardless of the working directory because it resolves from the source file location.
func testdataPath(relPath string) string {
	_, thisFile, _, _ := runtime.Caller(0)
	// thisFile = .../apps/epf-cli/internal/lsp/server_test.go
	epfCLIDir := filepath.Join(filepath.Dir(thisFile), "..", "..")
	return filepath.Join(epfCLIDir, relPath)
}

// TestBuildDiagnosticsWithRealValidator creates a real Server (with embedded schemas)
// and tests buildDiagnostics end-to-end.
func TestBuildDiagnosticsWithRealValidator(t *testing.T) {
	// Create a server with embedded schemas (empty schemasDir = embedded)
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("valid north_star produces no diagnostics", func(t *testing.T) {
		// Load the real north_star from the Emergent instance — this is the
		// ground-truth fixture that is known to pass `epf-cli validate`.
		realFile := testdataPath("../../docs/EPF/_instances/emergent/READY/00_north_star.yaml")
		content, err := os.ReadFile(realFile)
		if err != nil {
			t.Skipf("skipping: real north_star fixture not available: %v", err)
		}

		doc := &Document{
			URI:        "file:///project/READY/00_north_star.yaml",
			LanguageID: "yaml",
			Version:    1,
			Content:    string(content),
		}

		diagnostics := srv.buildDiagnostics(doc)
		if len(diagnostics) > 0 {
			for _, d := range diagnostics {
				t.Logf("  diagnostic: line %d: %s", d.Range.Start.Line, d.Message)
			}
			t.Errorf("expected 0 diagnostics for valid north_star, got %d", len(diagnostics))
		}
	})

	t.Run("invalid north_star produces diagnostics", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///project/READY/00_north_star.yaml",
			LanguageID: "yaml",
			Version:    1,
			// Missing most required fields
			Content: `meta:
  epf_version: "2.0.0"

vision:
  vision_statement: "short"
`,
		}

		diagnostics := srv.buildDiagnostics(doc)
		if len(diagnostics) == 0 {
			t.Error("expected diagnostics for incomplete north_star, got 0")
		}

		// Should have at least errors for missing required fields
		hasError := false
		for _, d := range diagnostics {
			if d.Severity != nil && *d.Severity == protocol.DiagnosticSeverityError {
				hasError = true
				break
			}
		}
		if !hasError {
			t.Error("expected at least one Error-severity diagnostic")
		}

		// All diagnostics should have source "epf"
		for _, d := range diagnostics {
			if d.Source == nil || *d.Source != "epf" {
				t.Error("expected all diagnostics to have source 'epf'")
				break
			}
		}
	})

	t.Run("non-YAML file produces no diagnostics", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///project/README.md",
			LanguageID: "markdown",
			Version:    1,
			Content:    "# Hello",
		}

		diagnostics := srv.buildDiagnostics(doc)
		if len(diagnostics) != 0 {
			t.Errorf("expected 0 diagnostics for non-YAML file, got %d", len(diagnostics))
		}
	})

	t.Run("nil document produces no diagnostics", func(t *testing.T) {
		diagnostics := srv.buildDiagnostics(nil)
		if len(diagnostics) != 0 {
			t.Errorf("expected 0 diagnostics for nil document, got %d", len(diagnostics))
		}
	})

	t.Run("non-EPF YAML produces no diagnostics", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///project/docker-compose.yaml",
			LanguageID: "yaml",
			Version:    1,
			Content:    "version: '3'\nservices:\n  web:\n    image: nginx\n",
		}

		diagnostics := srv.buildDiagnostics(doc)
		if len(diagnostics) != 0 {
			t.Errorf("expected 0 diagnostics for non-EPF YAML, got %d", len(diagnostics))
		}

		// ArtifactType should be cleared
		if doc.ArtifactType != "" {
			t.Errorf("expected empty ArtifactType for non-EPF file, got %q", doc.ArtifactType)
		}
	})

	t.Run("feature definition with enum error", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///project/FIRE/feature_definitions/fd-001.yaml",
			LanguageID: "yaml",
			Version:    1,
			Content: `meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test Feature"
slug: "test-feature"
status: "invalid_status"
`,
		}

		diagnostics := srv.buildDiagnostics(doc)
		if len(diagnostics) == 0 {
			t.Error("expected diagnostics for feature with invalid status enum, got 0")
		}

		// Should detect the artifact type
		if doc.ArtifactType == "" {
			t.Error("expected ArtifactType to be detected")
		}
	})

	t.Run("completely invalid YAML produces diagnostics", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///project/READY/00_north_star.yaml",
			LanguageID: "yaml",
			Version:    1,
			Content:    "{{not valid yaml at all",
		}

		diagnostics := srv.buildDiagnostics(doc)
		// Should produce at least one error diagnostic (validation engine error)
		if len(diagnostics) == 0 {
			t.Error("expected diagnostics for completely invalid YAML, got 0")
		}
	})
}

// TestBuildDiagnosticsArtifactTypeDetection verifies that different filename
// patterns correctly detect artifact types.
func TestBuildDiagnosticsArtifactTypeDetection(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	tests := []struct {
		name             string
		uri              string
		wantArtifactType bool // true if we expect an artifact type to be detected
	}{
		{
			name:             "north_star",
			uri:              "file:///project/READY/00_north_star.yaml",
			wantArtifactType: true,
		},
		{
			name:             "insight_analyses",
			uri:              "file:///project/READY/01_insight_analyses.yaml",
			wantArtifactType: true,
		},
		{
			name:             "feature_definition",
			uri:              "file:///project/FIRE/feature_definitions/fd-001.yaml",
			wantArtifactType: true,
		},
		{
			name:             "random YAML",
			uri:              "file:///project/config.yaml",
			wantArtifactType: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := &Document{
				URI:        tt.uri,
				LanguageID: "yaml",
				Version:    1,
				Content:    "key: value\n", // Minimal YAML
			}

			srv.buildDiagnostics(doc)

			if tt.wantArtifactType && doc.ArtifactType == "" {
				t.Errorf("expected artifact type to be detected for %s", tt.uri)
			}
			if !tt.wantArtifactType && doc.ArtifactType != "" {
				t.Errorf("expected no artifact type for %s, got %q", tt.uri, doc.ArtifactType)
			}
		})
	}
}
