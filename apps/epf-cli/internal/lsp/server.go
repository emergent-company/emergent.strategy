// Package lsp provides a Language Server Protocol implementation for EPF YAML files.
// It wraps the existing epf-cli validation engine to provide real-time diagnostics,
// enabling editors to show validation errors as you type.
package lsp

import (
	"fmt"
	"sync"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/tliron/commonlog"
	protocol "github.com/tliron/glsp/protocol_3_16"
	glspServer "github.com/tliron/glsp/server"

	// Import a commonlog backend for GLSP
	_ "github.com/tliron/commonlog/simple"
)

const (
	ServerName    = "epf-lsp"
	ServerVersion = "0.1.0"
)

// Server is the EPF LSP server. It holds references to the validator,
// schema loader, and document store needed to provide diagnostics.
type Server struct {
	validator *validator.Validator
	loader    *schema.Loader
	documents *DocumentStore
	handler   protocol.Handler
	server    *glspServer.Server

	// Workspace-level EPF instance detection
	instancePath   string // Absolute path to the detected EPF instance root
	instancePathMu sync.RWMutex

	// Stored InitializeParams for use in handleInitialized
	initParams *protocol.InitializeParams

	// Cached relationship analyzer for cross-file diagnostics
	analyzer   *relationships.Analyzer
	analyzerMu sync.RWMutex

	// Cached value model paths for contributes_to completion
	vmPaths   []string
	vmPathsMu sync.RWMutex

	// Cached enhanced validation errors per document URI.
	// Populated by buildDiagnostics(), consumed by code action handler
	// to match diagnostics back to rich error objects with FixHint, AllowedValues, etc.
	lastErrors   map[string][]*validator.EnhancedValidationError
	lastErrorsMu sync.RWMutex
}

// NewServer creates a new EPF LSP server. schemasDir can be empty
// to use embedded schemas (same behavior as the MCP server).
func NewServer(schemasDir string) (*Server, error) {
	val, err := validator.NewValidator(schemasDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create validator: %w", err)
	}

	s := &Server{
		validator:  val,
		loader:     val.GetLoader(),
		documents:  NewDocumentStore(),
		lastErrors: make(map[string][]*validator.EnhancedValidationError),
	}

	s.handler = protocol.Handler{
		Initialize:  s.handleInitialize,
		Initialized: s.handleInitialized,
		Shutdown:    s.handleShutdown,
		SetTrace:    s.handleSetTrace,

		TextDocumentDidOpen:   s.handleTextDocumentDidOpen,
		TextDocumentDidChange: s.handleTextDocumentDidChange,
		TextDocumentDidClose:  s.handleTextDocumentDidClose,
		TextDocumentDidSave:   s.handleTextDocumentDidSave,

		TextDocumentCompletion: s.handleTextDocumentCompletion,
		TextDocumentHover:      s.handleTextDocumentHover,
		TextDocumentCodeAction: s.handleTextDocumentCodeAction,
		TextDocumentDefinition: s.handleTextDocumentDefinition,
	}

	s.server = glspServer.NewServer(&s.handler, ServerName, false)

	return s, nil
}

// ServeStdio starts the LSP server communicating over stdio.
// This blocks until the client disconnects.
func (s *Server) ServeStdio() error {
	commonlog.Configure(1, nil) // minimal logging to stderr
	return s.server.RunStdio()
}

// ServeTCP starts the LSP server listening on the given address (e.g. ":7998").
// This blocks until the server is stopped.
func (s *Server) ServeTCP(addr string) error {
	commonlog.Configure(2, nil) // more verbose logging for debug
	return s.server.RunTCP(addr)
}
