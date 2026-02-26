package lsp

import (
	"bytes"
	"io"
	"net/url"
	"os"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/checks"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

// detectAndSetInstancePath discovers the EPF instance root from workspace info.
// Called during handleInitialized. It tries discovery first (using rootURI),
// then falls back to scanning open document paths for READY/FIRE/AIM markers.
func (s *Server) detectAndSetInstancePath(params *protocol.InitializeParams) {
	var rootPath string

	// Try to extract root path from InitializeParams
	if params.RootURI != nil {
		rootPath = uriToFilePath(*params.RootURI)
	}
	if rootPath == "" && params.RootPath != nil {
		rootPath = *params.RootPath
	}

	if rootPath != "" {
		// Use the discovery API to find EPF instance
		result, err := discovery.DiscoverSingle(rootPath)
		if err == nil && result.Status != discovery.StatusNotFound {
			s.setInstancePath(result.Path)
			return
		}
	}

	// Fallback: scan open documents for EPF markers
	detected := s.detectInstancePath()
	if detected != "" {
		s.setInstancePath(detected)
	}
}

// setInstancePath stores the instance path thread-safely and preloads
// the relationship analyzer.
func (s *Server) setInstancePath(path string) {
	s.instancePathMu.Lock()
	s.instancePath = path
	s.instancePathMu.Unlock()

	// Preload the relationship analyzer in the background
	go s.loadAnalyzer(path)
}

// getInstancePath returns the current instance path thread-safely.
func (s *Server) getInstancePath() string {
	s.instancePathMu.RLock()
	defer s.instancePathMu.RUnlock()
	return s.instancePath
}

// loadAnalyzer creates and loads a relationship analyzer for the instance.
// Analyzer.Load() prints to stdout on roadmap errors, so we redirect stdout
// to prevent corrupting the LSP stdio transport.
func (s *Server) loadAnalyzer(instancePath string) {
	analyzer := relationships.NewAnalyzer(instancePath)

	// Redirect stdout during Load() because Analyzer.Load() has
	// fmt.Printf("Warning: could not load roadmap: ...") at line 56
	// which would corrupt the LSP stdio JSON-RPC transport.
	origStdout := os.Stdout
	r, w, err := os.Pipe()
	if err == nil {
		os.Stdout = w
	}

	loadErr := analyzer.Load()

	// Restore stdout
	if err == nil {
		w.Close()
		os.Stdout = origStdout
		// Drain the pipe to prevent blocking
		io.Copy(io.Discard, r)
		r.Close()
	}

	if loadErr != nil {
		return
	}

	s.analyzerMu.Lock()
	s.analyzer = analyzer
	s.analyzerMu.Unlock()
}

// getAnalyzer returns the cached analyzer thread-safely.
func (s *Server) getAnalyzer() *relationships.Analyzer {
	s.analyzerMu.RLock()
	defer s.analyzerMu.RUnlock()
	return s.analyzer
}

// runWorkspaceDiagnostics runs cross-file relationship validation and
// content readiness checks, publishing diagnostics for affected files.
// Called on document save when an EPF instance is detected.
func (s *Server) runWorkspaceDiagnostics(ctx *glsp.Context) {
	instancePath := s.getInstancePath()
	if instancePath == "" {
		return
	}

	// Reload analyzer to pick up changes from saved files
	s.loadAnalyzer(instancePath)

	analyzer := s.getAnalyzer()
	if analyzer == nil {
		return
	}

	// Run relationship validation
	result := analyzer.ValidateAll()
	if result == nil || result.Valid {
		return
	}

	// Group errors by source artifact and resolve to file paths
	grouped := result.GroupBySource()
	features := analyzer.GetFeatures()

	for sourceID, errors := range grouped {
		// Resolve source ID to a file path
		feature, ok := features.GetFeature(sourceID)
		if !ok {
			continue
		}
		filePath := feature.FilePath
		if filePath == "" {
			continue
		}

		uri := pathToURI(filePath)

		// Convert relationship errors to LSP diagnostics
		diagnostics := make([]protocol.Diagnostic, 0, len(errors))
		for _, relErr := range errors {
			severity := mapRelationshipSeverity(relErr.Severity)
			msg := relErr.Message
			if relErr.DidYouMean != "" {
				msg += "\n💡 Did you mean: " + relErr.DidYouMean
			} else if relErr.Hint != "" {
				msg += "\n💡 " + relErr.Hint
			}

			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   protocol.Position{Line: 0, Character: 0},
				},
				Severity: &severity,
				Source:   strPtr("epf-relationships"),
				Code:     &protocol.IntegerOrString{Value: "invalid_relationship"},
				Message:  msg,
			})
		}

		// Merge with existing per-file diagnostics (don't replace them)
		go func(docURI string, relDiags []protocol.Diagnostic) {
			// Get existing schema diagnostics for this doc
			doc := s.documents.Get(docURI)
			var existingDiags []protocol.Diagnostic
			if doc != nil {
				existingDiags = s.buildDiagnostics(doc)
			}

			// Combine: schema diagnostics + relationship diagnostics
			allDiags := append(existingDiags, relDiags...)
			ctx.Notify(protocol.ServerTextDocumentPublishDiagnostics, protocol.PublishDiagnosticsParams{
				URI:         docURI,
				Diagnostics: allDiags,
			})
		}(uri, diagnostics)
	}
}

// checkContentReadiness scans a document for placeholder/template content
// (TBD, TODO, [INSERT...], etc.) and returns Hint-severity diagnostics.
func (s *Server) checkContentReadiness(doc *Document) []protocol.Diagnostic {
	if doc == nil || !doc.IsYAML() || doc.ArtifactType == "" {
		return nil
	}

	content := doc.Content
	lines := strings.Split(content, "\n")
	var diagnostics []protocol.Diagnostic

	for i, line := range lines {
		if isPlaceholderLine(line) {
			severity := protocol.DiagnosticSeverityHint
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range: protocol.Range{
					Start: protocol.Position{Line: uint32(i), Character: 0},
					End:   protocol.Position{Line: uint32(i), Character: uint32(len(line))},
				},
				Severity: &severity,
				Source:   strPtr("epf-readiness"),
				Code:     &protocol.IntegerOrString{Value: "placeholder_content"},
				Message:  "Placeholder content detected — replace with real content",
			})
		}
	}

	return diagnostics
}

// isPlaceholderLine checks if a line contains placeholder content,
// using the same patterns as the content readiness checker.
func isPlaceholderLine(line string) bool {
	// Check exclusion patterns first — if any match, this is not a placeholder
	for _, excl := range checks.ExclusionPatterns {
		if excl.MatchString(line) {
			return false
		}
	}

	// Check placeholder patterns
	for _, pat := range checks.PlaceholderPatterns {
		if pat.MatchString(line) {
			return true
		}
	}

	return false
}

// mapRelationshipSeverity converts a relationship validation severity to LSP severity.
func mapRelationshipSeverity(severity relationships.ValidationSeverity) protocol.DiagnosticSeverity {
	switch severity {
	case relationships.SeverityError:
		return protocol.DiagnosticSeverityError
	case relationships.SeverityWarning:
		return protocol.DiagnosticSeverityWarning
	case relationships.SeverityInfo:
		return protocol.DiagnosticSeverityInformation
	default:
		return protocol.DiagnosticSeverityWarning
	}
}

// uriToFilePath converts a file:// URI to a filesystem path.
// Handles URL-encoded characters in the path.
func uriToFilePath(uri string) string {
	if strings.HasPrefix(uri, "file://") {
		parsed, err := url.Parse(uri)
		if err == nil {
			return parsed.Path
		}
		// Fallback: strip prefix directly
		return strings.TrimPrefix(uri, "file://")
	}
	return uri
}

// suppressStdout captures any stdout output during the execution of fn.
// This is used to prevent fmt.Printf calls from corrupting the LSP stdio transport.
func suppressStdout(fn func()) {
	origStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		fn()
		return
	}
	os.Stdout = w

	done := make(chan struct{})
	go func() {
		var buf bytes.Buffer
		io.Copy(&buf, r)
		close(done)
	}()

	fn()

	w.Close()
	os.Stdout = origStdout
	<-done
	r.Close()
}
