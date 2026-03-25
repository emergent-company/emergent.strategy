package cmd

import (
	"context"
	"fmt"
	"net/http"
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
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/workspace"
	mcpserver "github.com/mark3labs/mcp-go/server"
	"github.com/spf13/cobra"
)

// Environment variable names for GitHub-backed source configuration.
const (
	EnvGitHubOwner    = "EPF_GITHUB_OWNER"
	EnvGitHubRepo     = "EPF_GITHUB_REPO"
	EnvGitHubRef      = "EPF_GITHUB_REF"       // optional: branch/tag/SHA (default: repo default)
	EnvGitHubBasePath = "EPF_GITHUB_BASE_PATH" // optional: path within repo
	EnvServerURL      = "EPF_SERVER_URL"       // optional: external base URL for OAuth metadata
	EnvServerMode     = "EPF_SERVER_MODE"      // optional: "strategy" for 16-tool read-only mode (default: full 80-tool mode)
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the MCP server with all EPF tools",
	Long: `Start the Model Context Protocol (MCP) server with all EPF tools.

Exposes the full EPF toolset (80 tools) including validation, health checks,
wizards, generators, AIM phase tools, value model management, and strategy
query tools. Use --instance to pre-load a strategy instance for the 8
read-only strategy query tools.

For a lightweight server with only the 16 read-only strategy tools (for consumers
of strategy, not authors), use "epf-cli strategy serve" instead, or set
EPF_SERVER_MODE=strategy to run in strategy-only mode over HTTP.

STDIO MODE (default):

  epf-cli serve
  epf-cli serve --instance docs/EPF/_instances/emergent --watch

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

  # Local AI agent with all tools (stdio)
  epf-cli serve

  # With strategy instance pre-loaded
  epf-cli serve --instance docs/EPF/_instances/emergent --watch

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
		instancePath, _ := cmd.Flags().GetString("instance")
		watch, _ := cmd.Flags().GetBool("watch")

		// --instance flag sets the default instance path for strategy tools.
		// Also accept positional argument for backward compatibility with
		// callers that used to go through "strategy serve <path>".
		if instancePath == "" && len(args) > 0 {
			instancePath = args[0]
		}
		if instancePath != "" {
			os.Setenv("EPF_STRATEGY_INSTANCE", instancePath)
			fmt.Fprintf(os.Stderr, "Strategy instance: %s\n", instancePath)
		}
		if watch {
			os.Setenv("EPF_STRATEGY_WATCH", "true")
			if instancePath != "" {
				fmt.Fprintln(os.Stderr, "File watching enabled")
			}
		}

		// Check if strategy-only mode is requested via env var.
		// EPF_SERVER_MODE=strategy creates a lightweight 16-tool read-only server.
		serverMode := os.Getenv(EnvServerMode)
		strategyOnly := strings.EqualFold(serverMode, "strategy")

		// Detect auth mode early to inject mode-aware instructions into the
		// MCP initialize response. This helps AI agents understand whether
		// they're connected to a local, single-tenant, or multi-tenant server.
		authMode := auth.DetectMode()
		var mcpInstructions string
		if useHTTP {
			mcpInstructions = buildMCPInstructions(authMode)
		}

		// Build extra MCP server options (e.g., WithInstructions for remote servers).
		var extraOpts []mcpserver.ServerOption
		if mcpInstructions != "" {
			extraOpts = append(extraOpts, mcpserver.WithInstructions(mcpInstructions))
		}

		var server *mcp.Server
		if strategyOnly {
			var err error
			server, err = mcp.NewStrategyOnlyServer(instancePath, extraOpts...)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error creating strategy server: %v\n", err)
				os.Exit(1)
			}
			fmt.Fprintln(os.Stderr, "Server mode: strategy-only (read-only tools)")
		} else {
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

			var err error
			server, err = mcp.NewServer(schemasDir, extraOpts...)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error creating MCP server: %v\n", err)
				os.Exit(1)
			}
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

	// Detect server mode from environment.
	mode := auth.DetectMode()
	fmt.Fprintf(os.Stderr, "Server mode: %s\n", mode)

	// Set up the GitHub-backed strategy store only when the single-tenant
	// owner/repo source is explicitly configured. Multi-tenant deployments may
	// still use GitHub App credentials for per-user installation access, but they
	// should not require the single-tenant store wiring on startup.
	if os.Getenv(EnvGitHubOwner) != "" || os.Getenv(EnvGitHubRepo) != "" {
		ghKey, err := setupGitHubStore()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error configuring GitHub source: %v\n", err)
			os.Exit(1)
		}
		if ghKey != "" {
			// Override instancePath for health info display.
			instancePath = ghKey
		}
	}

	// Set up auth handler for multi-tenant mode.
	var err error
	var authHandler *auth.AuthHandler
	var authMiddleware *auth.AuthMiddleware
	var workspacesHandler http.Handler
	var mcpOAuthHandler *auth.MCPOAuthHandler

	// Resolve external server URL for OAuth metadata and WWW-Authenticate.
	serverURL := os.Getenv(EnvServerURL)
	if serverURL == "" && port != 0 {
		serverURL = fmt.Sprintf("http://localhost:%d", port)
	}

	if mode == auth.ModeMultiTenant {
		var sessionMgr *auth.SessionManager
		authHandler, sessionMgr, err = setupMultiTenantAuth()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error configuring multi-tenant auth: %v\n", err)
			os.Exit(1)
		}
		authMiddleware = auth.NewAuthMiddleware(sessionMgr, mode, serverURL)

		// Configure MCP OAuth authorization server.
		// Prefer GitHub App OAuth if configured, fall back to legacy OAuth App.
		oauthCfg, _ := auth.OAuthConfigFromEnv()
		if oauthCfg != nil {
			mcpOAuthHandler = auth.NewMCPOAuthHandler(oauthCfg, sessionMgr, serverURL)
		}

		// Configure multi-tenant access control on the MCP server.
		accessChecker := auth.NewAccessChecker()
		mcpSrv.SetMultiTenantAuth(accessChecker, sessionMgr, mode)

		// Configure GitHub App components if available (installation token manager,
		// token resolver, refresh config).
		mtCfg, mtErr := auth.MultiTenantConfigFromEnv()
		if mtErr != nil {
			fmt.Fprintf(os.Stderr, "Warning: GitHub App config error: %v\n", mtErr)
		}
		var installMgr *auth.InstallationTokenManager
		if mtCfg != nil {
			var imErr error
			installMgr, imErr = auth.NewInstallationTokenManager(*mtCfg)
			if imErr != nil {
				fmt.Fprintf(os.Stderr, "Error creating installation token manager: %v\n", imErr)
				os.Exit(1)
			}

			// Create token resolver for per-repo installation token resolution.
			tokenResolver := auth.NewTokenResolver(auth.TokenResolverConfig{
				SessionManager: sessionMgr,
				Installations:  installMgr,
				AppID:          mtCfg.AppID,
			})
			mcpSrv.SetTokenResolver(tokenResolver)

			// Configure token refresh for GitHub App user access tokens.
			appClientID := os.Getenv(auth.EnvGitHubAppClientID)
			appClientSecret := os.Getenv(auth.EnvGitHubAppClientSecret)
			if appClientID != "" && appClientSecret != "" {
				sessionMgr.SetRefreshConfig(&auth.RefreshConfig{
					ClientID:     appClientID,
					ClientSecret: appClientSecret,
				})
				fmt.Fprintf(os.Stderr, "GitHub App: token refresh enabled (client_id=%s)\n", appClientID)
			}

			// Configure workspace discovery with installation-based discovery.
			mcpSrv.SetInstallationTokenFunc(func(installationID int64) (string, error) {
				return installMgr.Token(installationID)
			})
			mcpSrv.SetGitHubAppID(mtCfg.AppID)

			fmt.Fprintf(os.Stderr, "GitHub App: multi-tenant auth enabled (app_id=%d)\n", mtCfg.AppID)
		}

		// Configure workspace discovery.
		discoverer := workspace.NewDiscoverer()
		mcpSrv.SetDiscoverer(discoverer)

		// Use auth-aware workspace handler when GitHub App is configured.
		if installMgr != nil {
			workspacesHandler = workspace.HandlerWithConfig(workspace.HandlerConfig{
				Discoverer:     discoverer,
				SessionManager: sessionMgr,
				InstallationTokenFunc: func(installationID int64) (string, error) {
					return installMgr.Token(installationID)
				},
				AppID: mtCfg.AppID,
			})
		} else {
			workspacesHandler = workspace.Handler(discoverer, sessionMgr)
		}
	}

	cfg := transport.HTTPServerConfig{
		Port:           port,
		AllowedOrigins: origins,
		EnableSSE:      enableSSE,
		HealthInfo: transport.HealthInfo{
			ServerName:   mcp.ServerName,
			Version:      version.Version,
			Mode:         mode.String(),
			InstanceName: instanceName,
			InstancePath: instancePath,
		},
	}
	if authHandler != nil {
		cfg.AuthHandler = authHandler
	}
	if authMiddleware != nil {
		cfg.AuthMiddleware = authMiddleware.Wrap
	}
	if workspacesHandler != nil {
		cfg.WorkspacesHandler = workspacesHandler
	}
	if mcpOAuthHandler != nil {
		cfg.MCPOAuthHandler = mcpOAuthHandler
	}
	httpServer := transport.NewHTTPServer(mcpSrv.GetMCPServer(), cfg)

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
	if authHandler != nil {
		fmt.Fprintf(os.Stderr, "  Auth login:      http://localhost:%d/auth/github/login\n", port)
		fmt.Fprintf(os.Stderr, "  Auth callback:   http://localhost:%d/auth/github/callback\n", port)
		fmt.Fprintf(os.Stderr, "  Token exchange:  http://localhost:%d/auth/token\n", port)
	}
	if workspacesHandler != nil {
		fmt.Fprintf(os.Stderr, "  Workspaces:      http://localhost:%d/workspaces\n", port)
	}
	if mcpOAuthHandler != nil {
		fmt.Fprintf(os.Stderr, "  MCP OAuth:       http://localhost:%d/.well-known/oauth-protected-resource\n", port)
		fmt.Fprintf(os.Stderr, "  MCP Token:       http://localhost:%d/token\n", port)
		fmt.Fprintf(os.Stderr, "  MCP Register:    http://localhost:%d/register\n", port)
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

// setupMultiTenantAuth configures OAuth and session management for multi-tenant mode.
//
// Reads OAuth credentials and session secret from environment variables.
// Returns an AuthHandler, the SessionManager (needed for bearer middleware),
// or an error if configuration is invalid (e.g., missing session secret).
func setupMultiTenantAuth() (*auth.AuthHandler, *auth.SessionManager, error) {
	oauthCfg, err := auth.OAuthConfigFromEnv()
	if err != nil {
		return nil, nil, fmt.Errorf("OAuth config: %w", err)
	}
	if oauthCfg == nil {
		return nil, nil, fmt.Errorf("OAuth config required in multi-tenant mode (set %s and %s)", auth.EnvOAuthClientID, auth.EnvOAuthClientSecret)
	}

	sessionCfg, err := auth.SessionConfigFromEnv()
	if err != nil {
		return nil, nil, fmt.Errorf("session config: %w", err)
	}
	if sessionCfg == nil {
		return nil, nil, fmt.Errorf("session secret required in multi-tenant mode (set %s to a 64+ hex char string)", auth.EnvSessionSecret)
	}

	sessionMgr := auth.NewSessionManager(*sessionCfg)
	handler := auth.NewAuthHandler(oauthCfg, sessionMgr)

	fmt.Fprintf(os.Stderr, "Multi-tenant auth: OAuth client_id=%s, session TTL=%s, max sessions=%d\n",
		oauthCfg.ClientID, sessionCfg.TTL, sessionCfg.MaxSessions)

	return handler, sessionMgr, nil
}

// buildMCPInstructions returns mode-aware instructions text for the MCP initialize response.
// This is the first thing an AI agent sees when connecting, guiding it on how to use
// the server correctly based on its operating mode.
func buildMCPInstructions(mode auth.ServerMode) string {
	switch mode {
	case auth.ModeMultiTenant:
		return "This is a multi-tenant EPF strategy server. " +
			"Use owner/repo format for instance_path (e.g., 'emergent-company/emergent-epf'). " +
			"Start by calling epf_list_workspaces to discover available instances. " +
			"Authentication is via GitHub OAuth — if you get auth errors, the user needs to re-authenticate. " +
			"Write operations (scaffold, init, fix, validate_file) are NOT available — use strategy query tools for read-only access."
	case auth.ModeSingleTenant:
		return "This is a single-tenant EPF strategy server serving one pre-configured instance. " +
			"Use owner/repo format for instance_path (e.g., 'emergent-company/emergent-epf'). " +
			"Call epf_health_check to verify the instance is loaded. " +
			"Write operations (scaffold, init, fix, validate_file) are NOT available — use strategy query tools for read-only access."
	default:
		return ""
	}
}

func init() {
	rootCmd.AddCommand(serveCmd)
	serveCmd.Flags().String("schemas-dir", "", "path to EPF schemas directory (auto-detected if not specified)")
	serveCmd.Flags().Bool("http", false, "serve over HTTP instead of stdio (Streamable HTTP + optional SSE)")
	serveCmd.Flags().Int("port", 8080, "HTTP port to listen on (requires --http)")
	serveCmd.Flags().Bool("sse", false, "enable legacy SSE transport at /sse (requires --http)")
	serveCmd.Flags().String("cors-origins", "", "comma-separated allowed CORS origins (requires --http)")
	serveCmd.Flags().String("instance", "", "path to EPF instance (pre-loads strategy for strategy query tools)")
	serveCmd.Flags().Bool("watch", false, "enable file watching for automatic reload on instance changes")
}
