package lsp

import (
	"sync"
	"time"

	"github.com/tliron/glsp"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

// handleInitialize is called when the client connects.
// It declares the server's capabilities to the client.
func (s *Server) handleInitialize(ctx *glsp.Context, params *protocol.InitializeParams) (any, error) {
	// Store params for use in handleInitialized (where we detect the EPF instance)
	s.initParams = params

	capabilities := s.handler.CreateServerCapabilities()

	// Full document sync: the client sends the entire content on each change.
	// This is simpler and sufficient for Phase 1; incremental sync can be added later.
	syncKind := protocol.TextDocumentSyncKindFull
	capabilities.TextDocumentSync = &protocol.TextDocumentSyncOptions{
		OpenClose: boolPtr(true),
		Change:    &syncKind,
		Save: &protocol.SaveOptions{
			IncludeText: boolPtr(true),
		},
	}

	// Set completion trigger characters for YAML editing:
	//   ":" — trigger after typing a key name
	//   " " — trigger after colon-space
	//   "-" — trigger for sequence items
	//   "." — trigger for value model path segments (e.g., Product.Discovery.)
	if capabilities.CompletionProvider != nil {
		capabilities.CompletionProvider.TriggerCharacters = []string{":", " ", "-", "."}
	}

	return protocol.InitializeResult{
		Capabilities: capabilities,
		ServerInfo: &protocol.InitializeResultServerInfo{
			Name:    ServerName,
			Version: strPtr(ServerVersion),
		},
	}, nil
}

// handleInitialized is called after the client has received the InitializeResult.
// We use this to discover the EPF instance from the workspace root.
func (s *Server) handleInitialized(ctx *glsp.Context, params *protocol.InitializedParams) error {
	if s.initParams != nil {
		go s.detectAndSetInstancePath(s.initParams)
	}
	return nil
}

// handleShutdown is called when the client wants to shut down the server.
func (s *Server) handleShutdown(ctx *glsp.Context) error {
	return nil
}

// handleSetTrace sets the trace level for server-side logging.
func (s *Server) handleSetTrace(ctx *glsp.Context, params *protocol.SetTraceParams) error {
	return nil
}

// handleTextDocumentDidOpen is called when a file is opened in the editor.
// We store the document and immediately run diagnostics.
func (s *Server) handleTextDocumentDidOpen(ctx *glsp.Context, params *protocol.DidOpenTextDocumentParams) error {
	doc := s.documents.Open(
		params.TextDocument.URI,
		params.TextDocument.LanguageID,
		int(params.TextDocument.Version),
		params.TextDocument.Text,
	)

	// Run diagnostics immediately on open
	s.publishDiagnostics(ctx, doc)
	return nil
}

// handleTextDocumentDidChange is called when the document content changes.
// We update the stored content and schedule a debounced diagnostic run.
func (s *Server) handleTextDocumentDidChange(ctx *glsp.Context, params *protocol.DidChangeTextDocumentParams) error {
	if len(params.ContentChanges) == 0 {
		return nil
	}

	// With full sync, the last content change contains the entire document
	lastChange := params.ContentChanges[len(params.ContentChanges)-1]
	content, ok := lastChange.(protocol.TextDocumentContentChangeEventWhole)
	if !ok {
		return nil
	}

	doc := s.documents.Update(
		params.TextDocument.URI,
		int(params.TextDocument.Version),
		content.Text,
	)

	if doc != nil {
		s.scheduleDiagnostics(ctx, doc)
	}
	return nil
}

// handleTextDocumentDidClose is called when a file is closed.
// We remove the document from the store, clear cached errors, and clear its diagnostics.
func (s *Server) handleTextDocumentDidClose(ctx *glsp.Context, params *protocol.DidCloseTextDocumentParams) error {
	s.documents.Close(params.TextDocument.URI)
	s.cacheErrors(&Document{URI: params.TextDocument.URI}, nil)

	// Clear diagnostics for the closed document
	go func() {
		ctx.Notify(protocol.ServerTextDocumentPublishDiagnostics, protocol.PublishDiagnosticsParams{
			URI:         params.TextDocument.URI,
			Diagnostics: []protocol.Diagnostic{},
		})
	}()
	return nil
}

// handleTextDocumentDidSave is called when a file is saved.
// We run diagnostics immediately (no debounce) to give quick feedback on save,
// then trigger workspace-level cross-file diagnostics.
func (s *Server) handleTextDocumentDidSave(ctx *glsp.Context, params *protocol.DidSaveTextDocumentParams) error {
	// If the save includes text, update the store
	if params.Text != nil {
		s.documents.Update(params.TextDocument.URI, -1, *params.Text)
	}

	doc := s.documents.Get(params.TextDocument.URI)
	if doc != nil {
		s.publishDiagnostics(ctx, doc)
	}

	// Run workspace-level diagnostics (cross-file relationships) in the background
	go s.runWorkspaceDiagnostics(ctx)

	return nil
}

// publishDiagnostics runs validation and sends diagnostics to the client.
// Includes schema validation diagnostics plus content readiness checks.
func (s *Server) publishDiagnostics(ctx *glsp.Context, doc *Document) {
	diagnostics := s.buildDiagnostics(doc)

	// Append content readiness diagnostics (TBD, TODO, placeholders)
	readinessDiags := s.checkContentReadiness(doc)
	if len(readinessDiags) > 0 {
		diagnostics = append(diagnostics, readinessDiags...)
	}

	go func() {
		ctx.Notify(protocol.ServerTextDocumentPublishDiagnostics, protocol.PublishDiagnosticsParams{
			URI:         doc.URI,
			Diagnostics: diagnostics,
		})
	}()
}

// debounce state: per-URI timers for delayed diagnostic runs.
var (
	debounceMu     sync.Mutex
	debounceTimers = make(map[string]*time.Timer)
)

const debounceDelay = 300 * time.Millisecond

// scheduleDiagnostics debounces diagnostic runs for the given document.
// If called again for the same URI within the delay window, the previous
// timer is cancelled and a new one is started.
func (s *Server) scheduleDiagnostics(ctx *glsp.Context, doc *Document) {
	uri := doc.URI

	debounceMu.Lock()
	defer debounceMu.Unlock()

	// Cancel any pending timer for this URI
	if timer, ok := debounceTimers[uri]; ok {
		timer.Stop()
	}

	debounceTimers[uri] = time.AfterFunc(debounceDelay, func() {
		// Re-fetch the document in case it changed while waiting
		current := s.documents.Get(uri)
		if current != nil {
			s.publishDiagnostics(ctx, current)
		}

		debounceMu.Lock()
		delete(debounceTimers, uri)
		debounceMu.Unlock()
	})
}

func boolPtr(b bool) *bool {
	return &b
}
