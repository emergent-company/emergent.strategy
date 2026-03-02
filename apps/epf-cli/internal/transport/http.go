// Package transport provides HTTP transport orchestration for the MCP server.
//
// It wraps mcp-go's StreamableHTTPServer and SSEServer with additional
// infrastructure: CORS middleware, health endpoint, and unified routing.
package transport

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/server"
)

// HTTPServerConfig configures the HTTP transport server.
type HTTPServerConfig struct {
	// Port to listen on (default 8080).
	Port int

	// AllowedOrigins for CORS. Empty means no CORS headers.
	// Use ["*"] to allow all origins.
	AllowedOrigins []string

	// EnableSSE enables the legacy SSE transport at /sse and /message
	// in addition to Streamable HTTP at /mcp.
	EnableSSE bool

	// HealthInfo provides static information for the /health endpoint.
	HealthInfo HealthInfo
}

// HealthInfo contains static information surfaced by the /health endpoint.
type HealthInfo struct {
	ServerName   string `json:"server_name"`
	Version      string `json:"version"`
	InstanceName string `json:"instance_name,omitempty"`
	InstancePath string `json:"instance_path,omitempty"`
}

// HealthResponse is the JSON response from /health.
type HealthResponse struct {
	Status    string     `json:"status"`
	Uptime    string     `json:"uptime"`
	Server    HealthInfo `json:"server"`
	StartedAt time.Time  `json:"started_at"`
}

// HTTPServer wraps mcp-go transports with CORS, health, and unified routing.
type HTTPServer struct {
	mcpServer  *server.MCPServer
	config     HTTPServerConfig
	httpServer *http.Server
	startedAt  time.Time

	mu       sync.Mutex
	shutdown bool
}

// NewHTTPServer creates a new HTTP transport server wrapping the given MCP server.
func NewHTTPServer(mcpServer *server.MCPServer, config HTTPServerConfig) *HTTPServer {
	if config.Port == 0 {
		config.Port = 8080
	}
	return &HTTPServer{
		mcpServer: mcpServer,
		config:    config,
	}
}

// Start begins serving HTTP. It blocks until the server is shut down or errors.
func (s *HTTPServer) Start() error {
	s.startedAt = time.Now()

	mux := http.NewServeMux()

	// Health endpoint (not behind CORS — load balancers need unrestricted access)
	mux.HandleFunc("GET /health", s.handleHealth)

	// Streamable HTTP transport at /mcp (primary)
	streamable := server.NewStreamableHTTPServer(s.mcpServer)
	mux.Handle("/mcp", s.corsMiddleware(streamable))

	// SSE transport at /sse and /message (legacy fallback)
	if s.config.EnableSSE {
		sseServer := server.NewSSEServer(s.mcpServer,
			server.WithSSEEndpoint("/sse"),
			server.WithMessageEndpoint("/message"),
		)
		mux.Handle("/sse", s.corsMiddleware(sseServer.SSEHandler()))
		mux.Handle("/message", s.corsMiddleware(sseServer.MessageHandler()))
	}

	addr := fmt.Sprintf(":%d", s.config.Port)
	s.httpServer = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the HTTP server.
func (s *HTTPServer) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.shutdown {
		return nil
	}
	s.shutdown = true
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// Addr returns the listen address (available after Start is called).
func (s *HTTPServer) Addr() string {
	return fmt.Sprintf(":%d", s.config.Port)
}

// handleHealth responds with server health information.
func (s *HTTPServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:    "ok",
		Uptime:    time.Since(s.startedAt).Truncate(time.Second).String(),
		Server:    s.config.HealthInfo,
		StartedAt: s.startedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// corsMiddleware wraps an http.Handler with CORS headers based on config.
func (s *HTTPServer) corsMiddleware(next http.Handler) http.Handler {
	if len(s.config.AllowedOrigins) == 0 {
		return next
	}

	allowAll := false
	for _, o := range s.config.AllowedOrigins {
		if o == "*" {
			allowAll = true
			break
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}

		allowed := allowAll
		if !allowed {
			for _, o := range s.config.AllowedOrigins {
				if strings.EqualFold(o, origin) {
					allowed = true
					break
				}
			}
		}

		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id")
			w.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}

		// Handle preflight
		if r.Method == http.MethodOptions {
			if allowed {
				w.WriteHeader(http.StatusNoContent)
			} else {
				w.WriteHeader(http.StatusForbidden)
			}
			return
		}

		next.ServeHTTP(w, r)
	})
}
