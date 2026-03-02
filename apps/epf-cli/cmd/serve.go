package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/mcp"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/source"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/transport"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version"
	"github.com/spf13/cobra"
)

// Environment variable names for GitHub-backed source configuration.
const (
	EnvGitHubOwner    = "EPF_GITHUB_OWNER"
	EnvGitHubRepo     = "EPF_GITHUB_REPO"
	EnvGitHubRef      = "EPF_GITHUB_REF"       // optional: branch/tag/SHA (default: repo default)
	EnvGitHubBasePath = "EPF_GITHUB_BASE_PATH" // optional: path within repo
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the MCP server for EPF tools",
	Long: `Start the Model Context Protocol (MCP) server.

By default the server communicates over stdio (stdin/stdout). Use --http to
start an HTTPS-capable HTTP server instead, exposing MCP tools via Streamable
HTTP (primary) and optional SSE fallback for legacy clients.

STDIO MODE (default):

  epf-cli serve

  Communicates over stdin/stdout using the MCP protocol. Use this for local
  AI agent integrations (VS Code, Cursor, Claude Desktop, etc.).

HTTP MODE:

  epf-cli serve --http
  epf-cli serve --http --port 9090
  epf-cli serve --http --sse --cors-origins "https://example.com"

  Serves MCP tools over HTTP with the following endpoints:

    /mcp      - Streamable HTTP transport (primary, MCP spec 2025-03-26)
    /sse      - SSE transport (legacy fallback, requires --sse flag)
    /message  - SSE message endpoint (legacy fallback, requires --sse flag)
    /health   - Health check (GET, returns JSON server status)

EXAMPLES:

  # Local AI agent (stdio)
  epf-cli serve

  # Cloud server on port 8080 (default)
  epf-cli serve --http

  # Cloud server with SSE fallback and CORS
  epf-cli serve --http --sse --cors-origins "*"

  # Custom port
  epf-cli serve --http --port 9090`,
	Run: func(cmd *cobra.Command, args []string) {
		schemasDir, _ := cmd.Flags().GetString("schemas-dir")
		useHTTP, _ := cmd.Flags().GetBool("http")
		port, _ := cmd.Flags().GetInt("port")
		enableSSE, _ := cmd.Flags().GetBool("sse")
		corsOrigins, _ := cmd.Flags().GetString("cors-origins")

		// Auto-detect schemas directory if not specified
		if schemasDir == "" {
			detected, err := GetSchemasDir()
			if err == nil && detected != "" {
				schemasDir = detected
			}
		}

		// If no filesystem schemas found, that's okay - validator will use embedded schemas
		if schemasDir == "" {
			fmt.Fprintln(os.Stderr, "Note: Using embedded schemas (no filesystem schemas found)")
		}

		// Create the MCP server
		server, err := mcp.NewServer(schemasDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error creating MCP server: %v\n", err)
			os.Exit(1)
		}

		if useHTTP {
			serveHTTP(server, port, enableSSE, corsOrigins)
		} else {
			// Serve over stdio (blocks until EOF/client disconnect)
			if err := server.ServeStdio(); err != nil {
				fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
				os.Exit(1)
			}
		}
	},
}

func serveHTTP(mcpSrv *mcp.Server, port int, enableSSE bool, corsOrigins string) {
	var origins []string
	if corsOrigins != "" {
		origins = strings.Split(corsOrigins, ",")
		for i, o := range origins {
			origins[i] = strings.TrimSpace(o)
		}
	}

	instanceName := os.Getenv("EPF_INSTANCE_NAME")
	instancePath := os.Getenv("EPF_STRATEGY_INSTANCE")

	// Set up GitHub-backed strategy store if configured.
	ghKey, err := setupGitHubStore()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error configuring GitHub source: %v\n", err)
		os.Exit(1)
	}
	if ghKey != "" {
		// Override instancePath for health info display.
		instancePath = ghKey
	}

	httpServer := transport.NewHTTPServer(mcpSrv.GetMCPServer(), transport.HTTPServerConfig{
		Port:           port,
		AllowedOrigins: origins,
		EnableSSE:      enableSSE,
		HealthInfo: transport.HealthInfo{
			ServerName:   mcp.ServerName,
			Version:      version.Version,
			InstanceName: instanceName,
			InstancePath: instancePath,
		},
	})

	// Graceful shutdown on SIGINT/SIGTERM
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		fmt.Fprintln(os.Stderr, "\nShutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*1e9) // 5s
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			fmt.Fprintf(os.Stderr, "Shutdown error: %v\n", err)
		}
	}()

	fmt.Fprintf(os.Stderr, "EPF MCP server listening on :%d\n", port)
	fmt.Fprintf(os.Stderr, "  Streamable HTTP: http://localhost:%d/mcp\n", port)
	if enableSSE {
		fmt.Fprintf(os.Stderr, "  SSE (legacy):    http://localhost:%d/sse\n", port)
	}
	fmt.Fprintf(os.Stderr, "  Health:          http://localhost:%d/health\n", port)

	if err := httpServer.Start(); err != nil && err.Error() != "http: Server closed" {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

// setupGitHubStore configures a GitHub-backed strategy store if GitHub App
// environment variables are set.
//
// Returns the synthetic cache key (e.g. "github://owner/repo/path") used
// to register the store, or ("", nil) when GitHub auth is not configured
// (filesystem mode).
func setupGitHubStore() (string, error) {
	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		return "", err
	}
	if cfg == nil {
		// No GitHub App env vars set — filesystem mode, nothing to do.
		return "", nil
	}

	// Owner and repo are required when GitHub auth is configured.
	owner := os.Getenv(EnvGitHubOwner)
	repo := os.Getenv(EnvGitHubRepo)
	if owner == "" || repo == "" {
		return "", fmt.Errorf("%s and %s are required when GitHub App auth is configured", EnvGitHubOwner, EnvGitHubRepo)
	}

	ref := os.Getenv(EnvGitHubRef)
	basePath := os.Getenv(EnvGitHubBasePath)

	// Create token provider for auto-rotating installation tokens.
	tp, err := auth.NewTokenProvider(*cfg)
	if err != nil {
		return "", fmt.Errorf("create token provider: %w", err)
	}

	// Build GitHubSource with optional ref and basePath.
	var opts []source.GitHubOption
	if ref != "" {
		opts = append(opts, source.WithRef(ref))
	}
	if basePath != "" {
		opts = append(opts, source.WithBasePath(basePath))
	}
	ghSrc := source.NewGitHubSource(owner, repo, tp.TokenFunc(), opts...)

	// Wrap in a cache for performance (avoids hitting GitHub API on every tool call).
	cachedSrc := source.NewCachedSource(ghSrc)

	// Create a strategy store backed by the cached GitHub source.
	store := strategy.NewSourceBackedStore(cachedSrc)
	if err := store.Load(context.Background()); err != nil {
		return "", fmt.Errorf("load strategy from github://%s/%s: %w", owner, repo, err)
	}

	// Build a synthetic key for the strategy store cache.
	key := fmt.Sprintf("github://%s/%s", owner, repo)
	if basePath != "" {
		key = fmt.Sprintf("github://%s/%s/%s", owner, repo, basePath)
	}

	// Register the store so MCP tools can look it up by key.
	mcp.RegisterStrategyStore(key, store)

	// Log the GitHub source configuration.
	fmt.Fprintf(os.Stderr, "GitHub source: %s/%s", owner, repo)
	if ref != "" {
		fmt.Fprintf(os.Stderr, " (ref: %s)", ref)
	}
	if basePath != "" {
		fmt.Fprintf(os.Stderr, " (path: %s)", basePath)
	}
	fmt.Fprintln(os.Stderr)

	return key, nil
}

func init() {
	rootCmd.AddCommand(serveCmd)
	serveCmd.Flags().String("schemas-dir", "", "path to EPF schemas directory (auto-detected if not specified)")
	serveCmd.Flags().Bool("http", false, "serve over HTTP instead of stdio (Streamable HTTP + optional SSE)")
	serveCmd.Flags().Int("port", 8080, "HTTP port to listen on (requires --http)")
	serveCmd.Flags().Bool("sse", false, "enable legacy SSE transport at /sse (requires --http)")
	serveCmd.Flags().String("cors-origins", "", "comma-separated allowed CORS origins (requires --http)")
}
