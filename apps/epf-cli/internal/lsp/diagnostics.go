package lsp

import (
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

// mapSeverity converts an EPF validation priority to an LSP diagnostic severity.
func mapSeverity(priority validator.ErrorPriority) protocol.DiagnosticSeverity {
	switch priority {
	case validator.PriorityCritical, validator.PriorityHigh:
		return protocol.DiagnosticSeverityError
	case validator.PriorityMedium:
		return protocol.DiagnosticSeverityWarning
	case validator.PriorityLow:
		return protocol.DiagnosticSeverityInformation
	default:
		return protocol.DiagnosticSeverityWarning
	}
}

// mapEnhancedErrorToDiagnostic converts an EnhancedValidationError to a protocol.Diagnostic.
func mapEnhancedErrorToDiagnostic(e *validator.EnhancedValidationError) protocol.Diagnostic {
	severity := mapSeverity(e.Priority)

	// LSP lines and columns are 0-indexed; YAML line numbers are 1-indexed.
	line := uint32(0)
	if e.Line > 0 {
		line = uint32(e.Line - 1)
	}

	diag := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: line, Character: 0},
			End:   protocol.Position{Line: line, Character: 0},
		},
		Severity: &severity,
		Source:   strPtr("epf"),
		Code:     &protocol.IntegerOrString{Value: string(e.ErrorType)},
		Message:  e.Message,
	}

	// Append fix hint as related info in the message
	if e.FixHint != "" {
		diag.Message = diag.Message + "\n💡 " + e.FixHint
	}

	return diag
}

// mapValidationErrorToDiagnostic converts a basic ValidationError to a protocol.Diagnostic.
// Used as a fallback when enhanced errors are not available.
func mapValidationErrorToDiagnostic(e *validator.ValidationError) protocol.Diagnostic {
	severity := protocol.DiagnosticSeverityError

	line := uint32(0)
	if e.Line > 0 {
		line = uint32(e.Line - 1)
	}

	return protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: line, Character: 0},
			End:   protocol.Position{Line: line, Character: 0},
		},
		Severity: &severity,
		Source:   strPtr("epf"),
		Message:  e.Path + ": " + e.Message,
	}
}

// buildDiagnostics runs EPF validation on a document and returns LSP diagnostics.
// Returns an empty slice (not nil) for valid files or non-EPF files.
// Also caches the enhanced validation errors for use by the code action handler.
func (s *Server) buildDiagnostics(doc *Document) []protocol.Diagnostic {
	if doc == nil || !doc.IsYAML() {
		s.cacheErrors(doc, nil)
		return []protocol.Diagnostic{}
	}

	content := []byte(doc.Content)
	filePath := doc.FilePath()

	// Detect artifact type
	artifactType, err := s.loader.DetectArtifactType(filePath)
	if err != nil {
		// Not an EPF file — return no diagnostics
		doc.ArtifactType = ""
		s.cacheErrors(doc, nil)
		return []protocol.Diagnostic{}
	}
	doc.ArtifactType = string(artifactType)

	// Try enhanced validation first (richer error classification, fix hints)
	aiResult, err := s.validator.ValidateContentAIFriendly(content, artifactType)
	if err != nil {
		// Validation engine error — report as single diagnostic
		s.cacheErrors(doc, nil)
		severity := protocol.DiagnosticSeverityError
		return []protocol.Diagnostic{{
			Range: protocol.Range{
				Start: protocol.Position{Line: 0, Character: 0},
				End:   protocol.Position{Line: 0, Character: 0},
			},
			Severity: &severity,
			Source:   strPtr("epf"),
			Message:  "Validation error: " + err.Error(),
		}}
	}

	if aiResult.Valid {
		s.cacheErrors(doc, nil)
		return []protocol.Diagnostic{}
	}

	// Collect enhanced errors from all sections
	var enhancedErrors []*validator.EnhancedValidationError
	for _, section := range aiResult.ErrorsBySection {
		enhancedErrors = append(enhancedErrors, section.Errors...)
	}

	if len(enhancedErrors) > 0 {
		// Cache the enhanced errors for code action lookups
		s.cacheErrors(doc, enhancedErrors)

		diagnostics := make([]protocol.Diagnostic, 0, len(enhancedErrors))
		for _, e := range enhancedErrors {
			diagnostics = append(diagnostics, mapEnhancedErrorToDiagnostic(e))
		}
		return diagnostics
	}

	// Fallback: run basic validation for basic error output
	s.cacheErrors(doc, nil)
	result, err := s.validator.ValidateContent(content, artifactType)
	if err != nil || result.Valid {
		return []protocol.Diagnostic{}
	}

	diagnostics := make([]protocol.Diagnostic, 0, len(result.Errors))
	for i := range result.Errors {
		diagnostics = append(diagnostics, mapValidationErrorToDiagnostic(&result.Errors[i]))
	}
	return diagnostics
}

// cacheErrors stores enhanced validation errors for a document.
// These are later used by the code action handler to generate quick fixes.
func (s *Server) cacheErrors(doc *Document, errors []*validator.EnhancedValidationError) {
	if doc == nil {
		return
	}
	s.lastErrorsMu.Lock()
	defer s.lastErrorsMu.Unlock()
	if len(errors) == 0 {
		delete(s.lastErrors, doc.URI)
	} else {
		s.lastErrors[doc.URI] = errors
	}
}

// getCachedErrors retrieves the cached enhanced validation errors for a document URI.
func (s *Server) getCachedErrors(uri string) []*validator.EnhancedValidationError {
	s.lastErrorsMu.RLock()
	defer s.lastErrorsMu.RUnlock()
	return s.lastErrors[uri]
}

func strPtr(s string) *string {
	return &s
}
