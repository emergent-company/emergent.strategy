package lsp

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

// --- isPlaceholderLine ---

func TestIsPlaceholderLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want bool
	}{
		// Positive cases — these are placeholders
		{
			name: "TBD standalone",
			line: "  description: TBD",
			want: true,
		},
		{
			name: "TODO in value",
			line: "  name: TODO fill this in",
			want: true,
		},
		{
			name: "INSERT bracket placeholder",
			line: "  vision: '[INSERT YOUR VISION HERE]'",
			want: true,
		},
		{
			name: "FIXME marker",
			line: "  # FIXME: update this value",
			want: true,
		},
		{
			name: "XXX marker",
			line: "  purpose: XXX placeholder",
			want: true,
		},
		// Negative cases — not placeholders
		{
			name: "normal content",
			line: "  description: A comprehensive knowledge management platform",
			want: false,
		},
		{
			name: "empty line",
			line: "",
			want: false,
		},
		{
			name: "comment line",
			line: "# This is a comment about the structure",
			want: false,
		},
		{
			name: "YAML key only",
			line: "north_star:",
			want: false,
		},
		// Exclusion pattern cases — look like placeholders but aren't
		{
			name: "epf_version field",
			line: "  epf_version: '2.0.0'",
			want: false,
		},
		{
			name: "meta section",
			line: "meta:",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isPlaceholderLine(tt.line)
			if got != tt.want {
				t.Errorf("isPlaceholderLine(%q) = %v, want %v", tt.line, got, tt.want)
			}
		})
	}
}

// --- mapRelationshipSeverity ---

func TestMapRelationshipSeverity(t *testing.T) {
	tests := []struct {
		name     string
		severity relationships.ValidationSeverity
		want     protocol.DiagnosticSeverity
	}{
		{
			name:     "error maps to Error",
			severity: relationships.SeverityError,
			want:     protocol.DiagnosticSeverityError,
		},
		{
			name:     "warning maps to Warning",
			severity: relationships.SeverityWarning,
			want:     protocol.DiagnosticSeverityWarning,
		},
		{
			name:     "info maps to Information",
			severity: relationships.SeverityInfo,
			want:     protocol.DiagnosticSeverityInformation,
		},
		{
			name:     "unknown maps to Warning (default)",
			severity: relationships.ValidationSeverity("unknown"),
			want:     protocol.DiagnosticSeverityWarning,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mapRelationshipSeverity(tt.severity)
			if got != tt.want {
				t.Errorf("mapRelationshipSeverity(%q) = %d, want %d", tt.severity, got, tt.want)
			}
		})
	}
}

// --- uriToFilePath ---

func TestUriToFilePath(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "simple file URI",
			uri:  "file:///home/user/project/file.yaml",
			want: "/home/user/project/file.yaml",
		},
		{
			name: "URI with encoded spaces",
			uri:  "file:///home/user/my%20project/file.yaml",
			want: "/home/user/my project/file.yaml",
		},
		{
			name: "macOS path",
			uri:  "file:///Users/nikolai/code/docs/EPF/READY/00_north_star.yaml",
			want: "/Users/nikolai/code/docs/EPF/READY/00_north_star.yaml",
		},
		{
			name: "not a file URI — returned as-is",
			uri:  "/home/user/project/file.yaml",
			want: "/home/user/project/file.yaml",
		},
		{
			name: "URI with encoded special chars",
			uri:  "file:///path/to/%C3%A6%C3%B8%C3%A5/file.yaml",
			want: "/path/to/æøå/file.yaml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := uriToFilePath(tt.uri)
			if got != tt.want {
				t.Errorf("uriToFilePath(%q) = %q, want %q", tt.uri, got, tt.want)
			}
		})
	}
}

// --- checkContentReadiness ---

func TestCheckContentReadiness(t *testing.T) {
	t.Run("returns nil for non-YAML document", func(t *testing.T) {
		doc := &Document{
			URI:        "file:///test/readme.md",
			LanguageID: "markdown",
			Content:    "# README\nTODO: write this",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)
		if diags != nil {
			t.Errorf("expected nil for non-YAML, got %d diagnostics", len(diags))
		}
	})

	t.Run("returns nil for YAML without artifact type", func(t *testing.T) {
		doc := &Document{
			URI:          "file:///test/config.yaml",
			LanguageID:   "yaml",
			Content:      "key: TBD",
			ArtifactType: "",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)
		if diags != nil {
			t.Errorf("expected nil for unknown artifact type, got %d diagnostics", len(diags))
		}
	})

	t.Run("detects TBD placeholder", func(t *testing.T) {
		doc := &Document{
			URI:          "file:///test/READY/00_north_star.yaml",
			LanguageID:   "yaml",
			Content:      "north_star:\n  vision: TBD\n  mission: A real mission statement",
			ArtifactType: "north_star",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)

		found := false
		for _, d := range diags {
			if d.Range.Start.Line == 1 {
				found = true
				if *d.Severity != protocol.DiagnosticSeverityHint {
					t.Errorf("expected Hint severity, got %d", *d.Severity)
				}
				if *d.Source != "epf-readiness" {
					t.Errorf("expected source 'epf-readiness', got %q", *d.Source)
				}
			}
		}
		if !found {
			t.Error("expected diagnostic on line 1 (TBD line), but none found")
		}
	})

	t.Run("does not flag normal content", func(t *testing.T) {
		doc := &Document{
			URI:          "file:///test/READY/00_north_star.yaml",
			LanguageID:   "yaml",
			Content:      "north_star:\n  vision: Build the best knowledge platform\n  mission: Help teams collaborate",
			ArtifactType: "north_star",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)
		if len(diags) != 0 {
			t.Errorf("expected 0 diagnostics for normal content, got %d", len(diags))
		}
	})

	t.Run("detects multiple placeholders", func(t *testing.T) {
		doc := &Document{
			URI:          "file:///test/READY/00_north_star.yaml",
			LanguageID:   "yaml",
			Content:      "north_star:\n  vision: TBD\n  mission: '[INSERT MISSION]'\n  purpose: A real purpose",
			ArtifactType: "north_star",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)

		if len(diags) < 2 {
			t.Errorf("expected at least 2 placeholder diagnostics, got %d", len(diags))
		}
	})

	t.Run("returns nil for nil document", func(t *testing.T) {
		server := &Server{}
		diags := server.checkContentReadiness(nil)
		if diags != nil {
			t.Errorf("expected nil for nil document, got %d diagnostics", len(diags))
		}
	})

	t.Run("diagnostic range covers full line", func(t *testing.T) {
		line := "  description: TODO fill in later"
		doc := &Document{
			URI:          "file:///test/FIRE/feature_definitions/fd-001_test.yaml",
			LanguageID:   "yaml",
			Content:      "feature:\n" + line,
			ArtifactType: "feature_definition",
		}
		server := &Server{}
		diags := server.checkContentReadiness(doc)

		for _, d := range diags {
			if d.Range.Start.Line == 1 {
				if d.Range.Start.Character != 0 {
					t.Errorf("expected start character 0, got %d", d.Range.Start.Character)
				}
				if d.Range.End.Character != uint32(len(line)) {
					t.Errorf("expected end character %d, got %d", len(line), d.Range.End.Character)
				}
			}
		}
	})
}

// --- suppressStdout ---

func TestSuppressStdout(t *testing.T) {
	t.Run("function executes successfully", func(t *testing.T) {
		executed := false
		suppressStdout(func() {
			executed = true
		})
		if !executed {
			t.Error("expected function to execute")
		}
	})
}
